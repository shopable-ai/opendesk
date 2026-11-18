#!/usr/bin/env python3
"""Prepare and run the official client against the existing desktop MCP.

No daemon or credential store: run stays in the foreground; Ctrl+C stops it.
Only a file reference to the runtime key is written to the generated profile.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import socket
import signal
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit
import ipaddress

REPO = Path(__file__).resolve().parents[4]
DEFAULT_RUN = REPO / '.runtime/mcp/desktop-tunnel'
SAFE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'


class OperatorError(ValueError):
    pass


def fail(message):
    raise OperatorError(message)


def canonical(path):
    path = Path(path).expanduser().absolute()
    if any(p.is_symlink() for p in (path, *path.parents)):
        fail('Symlink paths are not supported; use the canonical path.')
    return path


def regular(path, executable=False):
    path = canonical(path)
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or (executable and not os.access(path, os.X_OK)):
        fail('Expected a regular file with the required access.')
    return path


def private_key(path):
    # Validate metadata only. The official client reads the key itself.
    path = regular(path)
    info, parent = path.stat(), path.parent.stat()
    if (info.st_uid != os.getuid() or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600
            or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700):
        fail('Key requires a private 0700 directory and an owner-only 0600 file.')
    return path


def digest(path):
    return hashlib.sha256(regular(path).read_bytes()).hexdigest()


def clean_env(run):
    return {'HOME': str(Path.home()), 'PATH': SAFE_PATH,
            'TMPDIR': str(run / 'tmp'), 'LANG': 'en_US.UTF-8',
            'XDG_CONFIG_HOME': str(run / 'isolated-config')}


def proxy_url(value):
    # No env: references, credentials, implicit paths, or URL parser cleanup.
    if not value or any(c.isspace() or ord(c) < 32 for c in value):
        fail('Proxy must be an HTTP origin without credentials or a path.')
    parsed = urlsplit(value)
    if (parsed.scheme.lower() != 'http' or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.path or '?' in value or '#' in value or '%' in value
            or '\\' in value or parsed.netloc.endswith(':')):
        fail('Proxy must be an HTTP origin without credentials, path, query or fragment.')
    host = parsed.hostname.lower()
    if ':' in host:
        host = '[' + str(ipaddress.IPv6Address(host)) + ']'
    elif not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', host):
        fail('Invalid proxy hostname.')
    port = parsed.port
    if port is not None and not 1 <= port <= 65535:
        fail('Invalid proxy port.')
    return 'http://' + host + (f':{port}' if port not in (None, 80) else '')


def runtime_file(path):
    path = regular(path)
    info = path.stat()
    if (info.st_uid != os.getuid() or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600):
        fail('Runtime files must be owner-only 0600 regular files.')
    return path


def read_pid(run):
    # Official 0.0.18 may create this non-secret file as 0644. Its private
    # parent remains mandatory; neither status nor stop repairs permissions.
    path = regular(run / 'client.pid')
    info, parent = path.stat(), path.parent.stat()
    if (info.st_uid != os.getuid() or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) not in (0o600, 0o644)
            or parent.st_uid != os.getuid()
            or stat.S_IMODE(parent.st_mode) != 0o700):
        fail('PID requires a private owner-only 0700 directory and an owned single-link 0600 or 0644 regular file.')
    value = path.read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[1-9][0-9]{0,9}', value) or int(value) <= 1:
        fail('Missing or invalid run PID; no process was signalled.')
    return int(value)


def local_command(argv):
    return subprocess.run(argv, capture_output=True, timeout=3,
                          env={'PATH': SAFE_PATH, 'LANG': 'C'})


def process_identity(pid):
    # macOS kernel executable + NUL-separated argv; ps text alone cannot
    # distinguish executable identity or arguments containing spaces.
    if sys.platform != 'darwin':
        fail('Strong stop identity inspection is currently supported on macOS only.')
    result = local_command(['/bin/ps', '-p', str(pid), '-o', 'uid=,lstart='])
    if result.returncode == 1 and not result.stdout.strip():
        return None
    if result.returncode != 0 or not result.stdout.strip():
        fail('Cannot inspect process identity; no process was signalled.')
    uid, started = result.stdout.decode('ascii').strip().split(None, 1)
    lib = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    executable = ctypes.create_string_buffer(4096)
    if lib.proc_pidpath(pid, executable, len(executable)) <= 0:
        fail('Cannot inspect executable identity; no process was signalled.')
    mib = (ctypes.c_int * 3)(1, 49, pid)  # CTL_KERN, KERN_PROCARGS2
    size = ctypes.c_size_t(1024 * 1024)
    buffer = ctypes.create_string_buffer(size.value)
    if lib.sysctl(mib, 3, buffer, ctypes.byref(size), None, 0) != 0:
        fail('Cannot inspect process arguments; no process was signalled.')
    data = buffer.raw[:size.value]
    argc = int.from_bytes(data[:4], sys.byteorder)
    offset = data.index(b'\0', 4)
    while offset < len(data) and data[offset] == 0:
        offset += 1
    argv = data[offset:].split(b'\0')[:argc]
    if not 1 <= argc <= 4096 or len(argv) != argc:
        fail('Invalid process argument snapshot.')
    return (int(uid), started, os.fsdecode(executable.value),
            tuple(os.fsdecode(arg) for arg in argv))


def port_owners(port):
    result = local_command(['/usr/sbin/lsof', '-nP', f'-iTCP:{port}',
                            '-sTCP:LISTEN', '-Fpn'])
    if result.returncode == 1 and not result.stdout:
        return set()
    if result.returncode != 0:
        fail('Cannot inspect loopback listener ownership.')
    owners, pid = set(), None
    for line in result.stdout.decode('utf-8').splitlines():
        if line.startswith('p'):
            pid = int(line[1:])
        elif line.startswith('n') and pid is not None:
            owners.add((pid, line[1:]))
    if not owners:
        fail('Incomplete listener ownership snapshot.')
    return owners


def owned_identity(pid, manifest):
    identity = process_identity(pid)
    if identity is None:
        fail('Run PID is not live; no process was signalled.')
    uid, _, executable, argv = identity
    expected = ('--config', manifest['profile'])
    if (uid != os.getuid() or executable != manifest['client']
            or len(argv) < 4 or argv[:2] != (manifest['client'], 'run')
            or sum(argv[i:i + 2] == expected for i in range(len(argv) - 1)) != 1
            or argv.count('--config') != 1
            or port_owners(manifest['port']) != {(pid, f"127.0.0.1:{manifest['port']}")}):
        fail('Run PID/executable/profile/port ownership mismatch; no process was signalled.')
    return identity


def stop_run(run, manifest):
    pid = read_pid(run)
    identity = owned_identity(pid, manifest)
    # Revalidate immediately before the sole signal. Never kill a process
    # group, follow a new PID, escalate to KILL, or retry a failed stop.
    if read_pid(run) != pid or owned_identity(pid, manifest) != identity:
        fail('Run identity changed; no process was signalled.')
    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + 10
    exited, released = False, False
    while True:
        current = process_identity(pid)
        if current is not None and current != identity:
            fail('PID identity changed during shutdown; no further signal sent.')
        exited = current is None
        released = not port_owners(manifest['port'])
        if (exited and released) or time.monotonic() >= deadline:
            break
        time.sleep(0.2)
    print(json.dumps({'clientExited': exited, 'portReleased': released,
                      'signal': 'SIGTERM', 'pid': pid}))
    if not (exited and released):
        fail('Bounded shutdown incomplete; no further signal sent.')


def prepare(args):
    proxy = proxy_url(args.control_plane_proxy) if args.control_plane_proxy is not None else None
    if not re.fullmatch(r'tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}', args.tunnel_id or ''):
        fail('An actual tunnel ID from the current account is required.')
    if not re.fullmatch(r'org-[A-Za-z0-9_-]+', args.organization_id or ''):
        fail('An actual Platform organization ID is required.')
    if not 1024 <= args.port <= 65535:
        fail('Choose an unprivileged loopback port between 1024 and 65535.')
    client = regular(args.client, executable=True)
    binary = regular(args.binary, executable=True)
    key = private_key(args.key_file)
    run = canonical(args.run_dir)
    # Refuse replacement of an existing profile, including an unknown live run.
    run.parent.mkdir(parents=True, exist_ok=True)
    run.mkdir(mode=0o700)
    for name in ('tmp', 'isolated-config'):
        (run / name).mkdir(mode=0o700)
    env = clean_env(run)
    command = shlex.join(['/usr/bin/env', '-i',
                          *(f'{k}={env[k]}' for k in ('HOME', 'PATH', 'TMPDIR', 'LANG')),
                          str(binary)])
    profile = run / 'desktop.yaml'
    profile.write_text(
        'config_version: 1\ncontrol_plane:\n'
        '  base_url: "https://api.openai.com"\n'
        + (f'  http_proxy: {json.dumps(proxy)}\n' if proxy is not None else '') +
        f'  organization_id: {json.dumps(args.organization_id)}\n'
        f'  tunnel_id: {json.dumps(args.tunnel_id)}\n'
        f'  api_key: {json.dumps("file:" + str(key))}\n'
        f'health:\n  listen_addr: "127.0.0.1:{args.port}"\n'
        f'  url_file: {json.dumps(str(run / "health.url"))}\n'
        'admin_ui:\n  open_browser: false\n'
        'log:\n  level: info\n  format: json\n  http_raw_unsafe: false\n'
        'mcp:\n  commands:\n    - channel: main\n'
        f'      command: {json.dumps(command)}\n', encoding='utf-8')
    manifest = {'schemaVersion': 1, 'client': str(client), 'binary': str(binary),
                'profile': str(profile), 'keyFile': str(key), 'port': args.port,
                'tunnelId': args.tunnel_id, 'organizationId': args.organization_id,
                'sha256': {str(p): digest(p) for p in (client, binary, profile)},
                'scope': 'Existing desktop MCP tools; not a Calculator-only server.'}
    (run / 'desktop.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'prepared': True, 'runDirectory': str(run),
                      'adminURL': f'http://127.0.0.1:{args.port}/ui',
                      'onlineVerified': False}))


def launch(args):
    proxy = proxy_url(args.control_plane_proxy) if args.control_plane_proxy is not None else None
    run = canonical(args.run_dir)
    info = run.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        fail('Run directory must be owner-only 0700.')
    manifest = json.loads(regular(run / 'desktop.json').read_text(encoding='utf-8'))
    expected = {manifest['client'], manifest['binary'], str(run / 'desktop.yaml')}
    if (manifest['schemaVersion'] != 1 or set(manifest['sha256']) != expected
            or manifest['profile'] != str(run / 'desktop.yaml')
            or type(manifest['port']) is not int or not 1024 <= manifest['port'] <= 65535):
        fail('Invalid desktop manifest; prepare a fresh directory.')
    private_key(manifest['keyFile'])
    for name, expected_digest in manifest['sha256'].items():
        if digest(name) != expected_digest:
            fail('Prepared artifact changed; prepare a fresh directory.')
    for name in ('tmp', 'isolated-config'):
        directory = canonical(run / name)
        if not directory.is_dir():
            fail('Missing isolated runtime directory.')
    if args.action == 'stop':
        stop_run(run, manifest)
        return
    if args.action == 'status':
        read_pid(run)
        url = runtime_file(run / 'health.url').read_text(encoding='ascii').strip()
        if url != f"http://127.0.0.1:{manifest['port']}":
            fail('Health URL does not match the prepared loopback listener.')
        client = str(regular(manifest['client'], executable=True))
        os.execve(client, [client, 'health', '--url-file', str(run / 'health.url'),
                          '--pid-file', str(run / 'client.pid'),
                          '--require-control-plane-poll', '--json'], clean_env(run))
        return
    extra = []
    if proxy is not None:
        extra += ['--control-plane.http-proxy', proxy]
    if args.action == 'run':
        if (run / 'client.pid').exists() or (run / 'client.pid').is_symlink():
            fail('Run PID file already exists; inspect it before a new run.')
        # A conflicting listener is preserved. The official client must still
        # acquire the port itself; this probe is not a reservation.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(('127.0.0.1', manifest['port']))
            except OSError:
                fail('Loopback port is occupied; existing service was not touched.')
        log = canonical(run / 'client.log')
        if log.exists():
            runtime_file(log)
        fd = os.open(log, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        runtime_file(log)
        if (run / 'health.url').exists() or (run / 'health.url').is_symlink():
            runtime_file(run / 'health.url')
        extra += ['--pid.file', str(run / 'client.pid'), '--log.file', str(log)]
    client = str(regular(manifest['client'], executable=True))
    regular(manifest['binary'], executable=True)
    if args.action == 'run':
        # Reserve only a new file, never truncate/chmod an existing PID. A
        # client's normal O_TRUNC write preserves this inode's 0600 mode.
        fd = os.open(run / 'client.pid',
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(fd)
    # Replacing this process keeps ordinary terminal Ctrl+C/TERM semantics.
    # No key, token, proxy environment, or caller MCP override is inherited.
    os.execve(client, [client, args.action, '--config', manifest['profile'], *extra], clean_env(run))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'doctor', 'run', 'status', 'stop'))
    parser.add_argument('--control-plane-proxy', help='Explicit HTTP proxy origin for prepare/doctor/run; never inherited from environment.')
    parser.add_argument('--run-dir', type=Path, default=DEFAULT_RUN)
    parser.add_argument('--client', type=Path)
    parser.add_argument('--binary', type=Path)
    parser.add_argument('--key-file', type=Path)
    parser.add_argument('--tunnel-id')
    parser.add_argument('--organization-id')
    parser.add_argument('--port', type=int, default=3001)
    args = parser.parse_args()
    if args.control_plane_proxy is not None and args.action not in ('prepare', 'doctor', 'run'):
        parser.error('--control-plane-proxy is only supported for prepare/doctor/run')
    if args.action == 'prepare' and any(getattr(args, name) is None
                                       for name in ('client', 'binary', 'key_file')):
        parser.error('prepare requires --client, --binary and --key-file')
    try:
        prepare(args) if args.action == 'prepare' else launch(args)
    except OperatorError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError):
        # Never echo arbitrary file content, lower-level errors or credentials.
        print('Desktop tunnel preparation/validation failed. Check IDs, file permissions, artifact hashes and loopback port; no online success is claimed.', file=sys.stderr)
        return 1
    except subprocess.TimeoutExpired:
        print('Local process inspection timed out; no further signal sent.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
