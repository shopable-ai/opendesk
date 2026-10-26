#!/usr/bin/env python3
"""One-run operator launcher. Never stores or prints the runtime key."""
import atexit
import fcntl
import getpass
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import signal
import stat
import subprocess
import sys
import threading
import tempfile
import time
import warnings

SOURCE = Path(__file__).resolve()
REPO = SOURCE.parents[4]
os.umask(0o077)
os.chdir(REPO)

def state(**fields):
    (RUN / 'launcher-state.json').write_text(json.dumps(fields, indent=2) + '\n')

def load_saved_key(path):
    secret_path = path.expanduser().absolute()
    metadata = secret_path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
        sys.exit('Saved key must be a regular owner-only 0600 file.')
    for parent in secret_path.parents:
        if parent.is_symlink():
            sys.exit('Saved key path must not contain symbolic links.')
    parent = secret_path.parent.stat()
    if parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
        sys.exit('Saved key directory must be owner-only 0700.')
    fd = os.open(secret_path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as secret:
        opened = os.fstat(secret.fileno())
        if not stat.S_ISREG(opened.st_mode) or opened.st_uid != os.getuid() or stat.S_IMODE(opened.st_mode) != 0o600:
            sys.exit('Opened key must remain an owner-only 0600 file.')
        if (opened.st_dev, opened.st_ino) != (metadata.st_dev, metadata.st_ino):
            sys.exit('Saved key file changed while opening.')
        raw = secret.read(4098)
        if len(raw) > 4097 or secret.read(1):
            sys.exit('Saved key file has an invalid format.')
    value = raw[:-1] if raw.endswith(b'\n') else raw
    if len(value) > 4096 or not re.fullmatch(rb'sk-[A-Za-z0-9_-]+', value):
        sys.exit('Saved key file has an invalid format.')
    return secret_path, value.decode('ascii')

def checked_path(path, directory=False):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        sys.exit('Prepared paths must be absolute and normalized.')
    for part in (path, *path.parents):
        if part.is_symlink():
            sys.exit('Prepared paths must not contain symbolic links.')
    if not (path.is_dir() if directory else path.is_file()):
        sys.exit('Restricted binary/profile preparation is incomplete.')
    return path


def acquire_run_lock(run):
    checked_path(run, directory=True)
    fd = os.open(run / '.launcher.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            sys.exit('Launcher lock must be a regular file.')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit('Prepared run is already locked by another launcher.')
    except BaseException:
        os.close(fd)
        raise
    # Keep the inode: unlinking a flock file lets waiters lock different inodes.
    return fd


def check_fresh_run(run):
    for name in ('rpc-audit.jsonl', 'fixture/web-proof.txt', '.online-used',
                 'online.redacted.log', 'online-health.url', 'official-client.pid'):
        path = run / name
        if path.exists() or path.is_symlink():
            sys.exit('Prepared run was already used or has unknown online state; prepare a fresh run.')
    for name in ('launcher-state.json', 'doctor.redacted.log'):
        path = run / name
        if path.is_symlink() or (path.exists() and not path.is_file()):
            sys.exit('Launcher output must be a regular file, without symbolic links.')
    state_path = run / 'launcher-state.json'
    if state_path.exists():
        try:
            previous = json.loads(state_path.read_text())
            if previous.get('stage') != 'doctor' or previous.get('status') != 'stopped':
                raise ValueError('unknown previous state')
        except (ValueError, AttributeError):
            sys.exit('Prepared run has unknown launcher state; prepare a fresh run.')


def preflight(run):
    checked_path(run, directory=True)
    for name in ('profiles', 'tmp', 'isolated-config', 'fixture'):
        checked_path(run / name, directory=True)
    profile = checked_path(run / 'profiles/opendesk-web-file.yaml')
    binary = checked_path(run / 'opendesk-mcp')
    manifest = checked_path(run / 'online-artifacts.json')
    check_fresh_run(run)
    try:
        expected = json.loads(manifest.read_text())
        client = checked_path(expected['client'])
        organization = expected['organizationId']
        if not isinstance(organization, str) or not re.fullmatch(r'org-[A-Za-z0-9_-]+', organization):
            raise ValueError('invalid organization')
        if expected['proofDirectory'] != str(run / 'fixture'):
            raise ValueError('invalid proof directory')
        hashes = expected['sha256']
        required = {str(path) for path in (SOURCE, SOURCE.with_name('stdio-audit.py'), SOURCE.with_name('prepare-run.py'), binary, client, profile)}
        if not isinstance(hashes, dict) or not required.issubset(hashes):
            raise ValueError('missing artifact hashes')
        for path, digest in hashes.items():
            artifact = checked_path(path)
            if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
                raise ValueError('invalid artifact digest')
            if hashlib.sha256(artifact.read_bytes()).hexdigest() != digest:
                raise ValueError('changed artifact')
        if not os.access(client, os.X_OK) or not os.access(binary, os.X_OK):
            raise ValueError('non-executable artifact')
        # Validate the substitution before prompting for any credential.
        if len(re.findall(r'^  api_key:.*$', profile.read_text(), re.MULTILINE)) != 1:
            raise ValueError('invalid runtime-key reference')
    except (KeyError, TypeError, ValueError, OSError):
        sys.exit('Prepared manifest/artifact validation failed; prepare a fresh run.')
    return client, organization


def consume_run(run):
    check_fresh_run(run)
    # Exclusive creation remains as evidence even if polling startup fails.
    fd = os.open(run / '.online-used', os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as marker:
        marker.write('Online polling attempted; prepare a fresh run.\n')
        marker.flush()
        os.fsync(marker.fileno())


def operator_output(text):
    # Real operator pipes must never hold up cancellation. The redacted file is
    # authoritative; a saturated terminal may drop output. StringIO stays exact.
    try:
        fd = sys.stdout.fileno()
    except (AttributeError, OSError, ValueError):
        sys.stdout.write(text)
        return
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    try:
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        data = text.encode('utf-8', errors='replace')
        for offset in range(0, len(data), 4096):
            try:
                written = os.write(fd, data[offset:offset + 4096])
            except (BlockingIOError, BrokenPipeError):
                break
            if written < min(4096, len(data) - offset):
                break
    finally:
        fcntl.fcntl(fd, fcntl.F_SETFL, flags)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run-dir', type=Path, required=True, help='Fresh run directory created by prepare-run.py.')
parser.add_argument('--key-file', type=Path, help='Existing owner-only key file; passed to the official client as a file: reference.')
parser.add_argument('--doctor-only', action='store_true', help='Validate locally and exit without starting online polling.')
options = parser.parse_args()
RUN = options.run_dir.expanduser().absolute()
try:
    lock_fd = acquire_run_lock(RUN)
    atexit.register(os.close, lock_fd)
    CLIENT, ORGANIZATION = preflight(RUN)
except OSError:
    sys.exit('Prepared run cannot be safely opened or locked.')
stored_key = None
if options.key_file is not None:
    secret_path, stored_key = load_saved_key(options.key_file)
elif not sys.stdin.isatty() or not sys.stderr.isatty():
    sys.exit('Run in your local interactive terminal; secret input requires a TTY.')

operator_output('OpenDesk official Tunnel: only one new nonce proof file. No desktop/general file tools.' + '\n')
operator_output('Use a runtime key with Tunnels Read + Use in the selected Personal organization.' + '\n')
operator_output('The key is hidden and sent only to the official tunnel-client; saved keys use a file: reference.' + '\n')
try:
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        key = stored_key if stored_key is not None else getpass.getpass('Runtime API key (hidden; do not paste into chat): ')
except getpass.GetPassWarning:
    sys.exit('Hidden input is unavailable; nothing was read or started. Use a local terminal with echo control.')
if not key or key.strip() != key or '\n' in key or '\r' in key:
    sys.exit('Empty or invalid input; nothing was started.')

env = {k: v for k, v in os.environ.items() if k in (
    'PATH', 'HOME', 'LANG', 'LC_ALL', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR')}
env.update(XDG_CONFIG_HOME=str(RUN / 'isolated-config'), TMPDIR=str(RUN / 'tmp'))
if stored_key is None:
    env['CONTROL_PLANE_API_KEY'] = key

def redact(line):
    line = line.replace(key, '[REDACTED]')
    line = re.sub(r'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}', '[REDACTED_KEY]', line)
    line = re.sub(r'(?i)(authorization["\s:=]+bearer\s+)[^\s,"}]+', r'\1[REDACTED]', line)
    return line

child = None
stop_requested = False
def stop(signum, frame):
    global stop_requested
    stop_requested = True

signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)

def group_alive(process):
    process.poll()  # Reap the leader even when only descendants remain.
    try:
        os.killpg(process.pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # Permission denial is not evidence that the group stopped.

def reap_cancelled(process, grace=(15, 5, 5)):
    # The leader has its own session. Signal that group even after its exit.
    for sig, timeout in zip((signal.SIGINT, signal.SIGTERM, signal.SIGKILL), grace):
        try:
            os.killpg(process.pid, sig)
        except PermissionError as error:
            # Reap an already-exited leader, but never bypass denied signalling.
            try:
                process.wait(timeout=0.1)
            except subprocess.TimeoutExpired:
                pass
            raise RuntimeError('Owned client cleanup failed: signalling permission denied; recorded group may still be running.') from error
        except ProcessLookupError:
            process.wait(timeout=timeout)
            return
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if not group_alive(process):
                process.wait(timeout=timeout)
                return
            time.sleep(0.05)
    raise RuntimeError('Owned client did not stop; inspect its recorded PID before retrying.')

def open_log(stage):
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK
    flags |= os.O_EXCL if stage == 'online' else os.O_APPEND
    fd = os.open(RUN / (stage + '.redacted.log'), flags, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600:
            raise RuntimeError('Launcher log must be a regular owner-only 0600 file.')
        return os.fdopen(fd, 'a')
    except BaseException:
        os.close(fd)
        raise


def run_client(stage, args, timeout):
    global child
    if stop_requested:
        return 130
    state(stage=stage, status='starting', launcher_pid=os.getpid(), time=time.time())
    if stop_requested:
        state(stage=stage, status='stopped', exit_code=130, cancelled=True, time=time.time())
        return 130
    reader = None
    reader_error = []
    cleaned = False
    reader_stop = threading.Event()
    child = subprocess.Popen([str(CLIENT), *args], env=env, cwd=REPO,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        errors='replace', start_new_session=True)
    try:
        if stop_requested:
            reap_cancelled(child)
            cleaned = True
            state(stage=stage, status='stopped', exit_code=130, cancelled=True, time=time.time())
            return 130
        state(stage=stage, status='running', launcher_pid=os.getpid(), client_pid=child.pid, time=time.time())
        output = queue.Queue(maxsize=128)
        def read_output():
            try:
                pending = b''
                fd = child.stdout.fileno()
                os.set_blocking(fd, False)
                while not reader_stop.is_set() and not stop_requested:
                    try:
                        chunk = os.read(fd, 4096)
                    except BlockingIOError:
                        reader_stop.wait(0.05)
                        continue
                    pending += chunk
                    while b'\n' in pending or (not chunk and pending):
                        line, separator, pending = pending.partition(b'\n')
                        line += separator
                        if len(line) > 16384:
                            reader_error.append('Client log line exceeded the 16384-byte safety limit.')
                            stop(None, None)
                            return
                        while not reader_stop.is_set() and not stop_requested:
                            try:
                                output.put(line.decode('utf-8', errors='replace'), timeout=0.1)
                                break
                            except queue.Full:
                                continue
                    if len(pending) > 16384:
                        reader_error.append('Client log line exceeded the 16384-byte safety limit.')
                        stop(None, None)
                        return
                    if not chunk:
                        break
            except Exception:
                reader_error.append('Client log reader failed; raw data suppressed.')
                stop(None, None)
        reader = threading.Thread(target=read_output, daemon=True)
        reader.start()
        deadline = time.monotonic() + timeout
        with open_log(stage) as log:
            while True:
                if time.monotonic() >= deadline:
                    stop(None, None)
                if not cleaned and (stop_requested or child.poll() is not None):
                    reap_cancelled(child)
                    cleaned = True
                try:
                    line = output.get(timeout=0.1)
                except queue.Empty:
                    if cleaned and not reader.is_alive():
                        break
                    continue
                safe = redact(line)
                log.write(safe)
                log.flush()
                operator_output(safe)
        code = child.wait(timeout=5)
        if reader_error:
            raise RuntimeError(reader_error[0])
    finally:
        try:
            if not cleaned or group_alive(child):
                reap_cancelled(child)
        except Exception as error:
            state(stage=stage, status='cleanup_failed', launcher_pid=os.getpid(),
                  client_pid=child.pid, client_pgid=child.pid, cancelled=stop_requested,
                  error=str(error), time=time.time())
            raise
        finally:
            reader_stop.set()
            if reader is not None and reader.ident is not None:
                reader.join(timeout=1)
            # Reader uses only nonblocking os.read, never a buffered stream lock.
            child.stdout.close()
    state(stage=stage, status='stopped', exit_code=code, cancelled=stop_requested, time=time.time())
    return 130 if stop_requested else code

with tempfile.TemporaryDirectory(prefix='launcher-profile-', dir=RUN / 'tmp') as profile_dir:
    # Resolve the selected mode before official profile parsing; no key literal is saved.
    reference = 'file:' + str(secret_path) if stored_key is not None else 'env:CONTROL_PLANE_API_KEY'
    profile = (RUN / 'profiles/opendesk-web-file.yaml').read_text()
    profile, replaced = re.subn(r'^  api_key:.*$', '  api_key: ' + json.dumps(reference), profile, flags=re.MULTILINE)
    if replaced != 1:
        sys.exit('Prepared profile has no unique runtime-key reference.')
    Path(profile_dir, 'opendesk-web-file.yaml').write_text(profile)
    PROFILE_ARGS = ['--profile', 'opendesk-web-file', '--profile-dir', profile_dir]
    code = run_client('doctor', ['doctor', *PROFILE_ARGS, '--explain'], 30)
    if code == 0 and not stop_requested and not options.doctor_only:
        operator_output('Doctor passed locally. Starting official polling; keep this terminal open. Ctrl+C stops it.' + '\n')
        consume_run(RUN)
        code = run_client('online', ['run', *PROFILE_ARGS,
            '--control-plane.organization-id', ORGANIZATION,
            '--health.url-file', str(RUN / 'online-health.url'),
            '--pid.file', str(RUN / 'official-client.pid')], 1800)
env.pop('CONTROL_PLANE_API_KEY', None)
key = ''
stored_key = None
if stop_requested and code == 0:
    code = 130
sys.exit(code)
