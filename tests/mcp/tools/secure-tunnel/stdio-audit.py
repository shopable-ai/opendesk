#!/usr/bin/env python3
"""POSIX MCP relay with explicit private files audit; nonce remains the default."""
import argparse
import hashlib
import datetime
import json
import os
from pathlib import Path
import re
import select
import signal
import shlex
import stat
import tempfile
import subprocess
import sys
import threading
import time

MAX_LINE = 10 * 1024 * 1024


def minimize(value):
    if isinstance(value, dict):
        return {key: ('[OMITTED: platform identity/session metadata]' if key == '_meta'
                      else minimize(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [minimize(item) for item in value]
    return value


def files_metadata(line):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError('Nonfinite JSON number')

    message = json.loads(line.decode('utf-8'), object_pairs_hook=pairs, parse_constant=invalid_constant)
    def validate(value):
        if isinstance(value, str):
            value.encode('utf-8')  # reject unpaired UTF-16 surrogate escapes
        elif isinstance(value, dict):
            for key, item in value.items():
                validate(key)
                validate(item)
        elif isinstance(value, list):
            for item in value:
                validate(item)
        elif isinstance(value, float):
            import math
            if not math.isfinite(value):
                raise ValueError('Nonfinite JSON number')
    validate(message)
    if not isinstance(message, dict) or message.get('jsonrpc') != '2.0':
        raise ValueError('Invalid JSON-RPC object')
    if 'id' in message and (isinstance(message['id'], bool)
                            or not isinstance(message['id'], (str, int, type(None)))):
        raise ValueError('Invalid JSON-RPC ID')
    if 'method' in message:
        if (not isinstance(message['method'], str) or not message['method']
                or 'result' in message or 'error' in message
                or ('params' in message and not isinstance(message['params'], (dict, list)))):
            raise ValueError('Invalid JSON-RPC request')
    elif ('id' not in message or ('result' in message) == ('error' in message)):
        raise ValueError('Invalid JSON-RPC response')
    elif 'error' in message:
        error = message['error']
        if (not isinstance(error, dict) or type(error.get('code')) is not int
                or not isinstance(error.get('message'), str)):
            raise ValueError('Invalid JSON-RPC error')
    # Only allowlisted metadata is copied, never arbitrary keys or string values.
    safe = {'bytes': len(line), 'sha256': hashlib.sha256(line).hexdigest()}
    params = message.get('params')
    if isinstance(params, dict):
        tool = params.get('name')
        if tool in ('tm_files_status', 'tm_files_list', 'tm_files_read', 'tm_files_write'):
            safe['tool'] = tool
        args = params.get('arguments')
        if isinstance(args, dict):
            request_id = args.get('requestId')
            if isinstance(request_id, str) and re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', request_id):
                safe['requestId'] = request_id
    # Only the canonical result envelope; never parse text content as metadata.
    result = message.get('result')
    if isinstance(result, dict):
        envelope = result.get('structuredContent', result)
        if isinstance(envelope, dict):
            stages = envelope.get('stages')
            if isinstance(stages, dict):
                allowed = {'requestAccepted': ('ACCEPTED', 'REJECTED', 'UNKNOWN'),
                           'fileWritten': ('CONFIRMED', 'NOT_WRITTEN', 'UNKNOWN', 'NOT_APPLICABLE'),
                           'toolResult': ('PREPARED',)}
                safe_stages = {key: stages[key] for key, values in allowed.items()
                               if isinstance(stages.get(key), str) and stages[key] in values}
                if type(stages.get('readBackVerified')) is bool:
                    safe_stages['readBackVerified'] = stages['readBackVerified']
                if safe_stages:
                    safe['stages'] = safe_stages
            problem = envelope.get('error')
            if isinstance(problem, dict):
                # Finite allowlist: a syntactically safe-looking code can still carry data.
                if problem.get('code') in ('E_FILES_BRIDGE', 'E_FILES_LIMIT', 'E_PERMISSION',
                                           'E_CONFLICT', 'E_FILES_BRIDGE_CLOSED'):
                    safe['code'] = problem['code']
                if problem.get('outcome') in ('NOT_DISPATCHED', 'FAILED_CONFIRMED', 'OUTCOME_UNKNOWN'):
                    safe['outcome'] = problem['outcome']
    return safe


class ResponseDropped(Exception):
    """Intentional local transport failure, never a backend retry."""


def fault_marker_state(marker):
    # Do not follow/open/read an existing marker. Presence alone is one-use state.
    try:
        info = marker.lstat()
    except FileNotFoundError:
        return False
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
            or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600):
        raise ValueError('Invalid private fault marker')
    return True


def validate_fault(options):
    target, marker = options.drop_write_response_for_request_id, options.drop_write_response_marker
    if target is None and marker is None:
        return None
    if (options.mode != 'files' or target is None or marker is None
            or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', target)):
        raise ValueError('Invalid files-only fault options')
    run = options.trace.parent
    if (not run.is_absolute() or run != run.resolve()
            or options.trace != run / 'rpc-audit.jsonl'
            or options.binary != run / 'opendesk-mcp'
            or marker != run / ('.drop-write-response-' + target + '.used')):
        raise ValueError('Fault paths must match the prepared run')
    info = run.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Fault run must be private')
    manifest_path, profile = run / 'online-artifacts.json', run / 'profiles/opendesk-web-file.yaml'
    for artifact in (manifest_path, profile):
        if artifact.is_symlink() or not artifact.is_file():
            raise ValueError('Invalid fault artifact')
    manifest = json.loads(manifest_path.read_text())
    core = Path(manifest['coreRun'])
    if (core.parent != Path(__file__).resolve().parents[4] / '.runtime/tests/mcp-files-core'
            or run.parent != core / 'tunnel'):
        raise ValueError('Fault run is outside the core run')
    fault = {'flag': '--drop-write-response-for-request-id', 'requestId': target, 'marker': str(marker)}
    if manifest.get('mode') != 'files' or manifest.get('faultInjection') != fault:
        raise ValueError('Fault manifest mismatch')
    hashes = manifest['sha256']
    for artifact in (profile, Path(__file__).resolve(), options.binary):
        if hashlib.sha256(artifact.read_bytes()).hexdigest() != hashes.get(str(artifact)):
            raise ValueError('Fault artifact pin mismatch')
    commands = [json.loads(line.split('command: ', 1)[1]) for line in profile.read_text().splitlines()
                if line.startswith('      command: ')]
    if len(commands) != 1:
        raise ValueError('Fault profile command mismatch')
    tokens = shlex.split(commands[0])
    relay = str(Path(__file__).resolve())
    if tokens.count(relay) != 1 or tokens[tokens.index(relay) + 1:] != sys.argv[1:]:
        raise ValueError('Fault profile arguments mismatch')
    fault_marker_state(marker)
    return marker


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('nonce', 'files'), default='nonce')
    parser.add_argument('--files-bridge-credential-file', type=Path)
    parser.add_argument('--binary-sha256')
    parser.add_argument('--drop-write-response-for-request-id')
    parser.add_argument('--drop-write-response-marker', type=Path)
    parser.add_argument('binary', type=Path)
    parser.add_argument('fixture', type=Path)
    parser.add_argument('trace', type=Path)
    options = parser.parse_args()
    binary, fixture, trace = options.binary, options.fixture, options.trace
    files = options.mode == 'files'
    if files != (options.files_bridge_credential_file is not None):
        parser.error('Files mode requires its private credential reference')
    if options.binary_sha256 is not None and not re.fullmatch(r'[0-9a-f]{64}', options.binary_sha256):
        parser.error('Invalid binary digest')
    limit = 60 * 1024 if files else MAX_LINE
    os.umask(0o077)
    try:
        fault_marker = validate_fault(options)
    except (OSError, ValueError, KeyError, TypeError):
        sys.stderr.write('E_TEST_FAULT_CONFIG\n')
        return 1
    fault_dropped = False
    fault_lock = threading.Lock()
    fault_condition = threading.Condition(fault_lock)
    fault_armed = fault_marker is not None and not fault_marker_state(fault_marker)
    target_inflight = False
    inflight = {}
    stop_input = threading.Event()
    input_done = threading.Event()
    input_failed = threading.Event()
    audit_errors = []
    lock = threading.Lock()
    cancelled = False

    def cancel(signum, frame):
        nonlocal cancelled
        cancelled = True

    signal.signal(signal.SIGINT, cancel)
    signal.signal(signal.SIGTERM, cancel)

    # A recreated official-client command must retain its first audit and marker.
    # All attempts still create audit files exclusively in the same private run.
    try:
        log_file = trace.open('x')
    except FileExistsError:
        if fault_marker is None:
            raise
        if trace.is_symlink() or not trace.is_file():
            sys.stderr.write('E_TEST_FAULT_CONFIG\n')
            return 1
        fd, name = tempfile.mkstemp(prefix='rpc-audit-recreated-', suffix='.jsonl', dir=trace.parent)
        log_file = os.fdopen(fd, 'w')
    with log_file as log:
        def record(direction, line):
            if files:
                row = {'direction': direction, **files_metadata(line)}
                with lock:
                    log.write(json.dumps(row, separators=(',', ':')) + '\n')
                    log.flush()
                return
            safe = re.sub(r'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}', '[REDACTED_KEY]', line.decode())
            message = json.loads(safe)  # Invalid data is suppressed, never logged raw.
            row = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'direction': direction, 'message': minimize(message)}
            with lock:
                log.write(json.dumps(row, separators=(',', ':')) + '\n')
                log.flush()

        child = None
        reader = None
        stdout_blocking = os.get_blocking(sys.stdout.fileno())
        code = 1
        try:
            os.set_blocking(sys.stdout.fileno(), False)

            def emit(line):
                remaining = memoryview(line)
                while remaining:
                    if cancelled:
                        raise RuntimeError('Output forwarding interrupted')
                    if select.select([], [sys.stdout.buffer], [], 0.05)[1]:
                        try:
                            remaining = remaining[os.write(sys.stdout.fileno(), remaining):]
                        except BlockingIOError:
                            continue

            args = (['--files-bridge-credential-file', str(options.files_bridge_credential_file)]
                    if files else ['--web-file-test-dir', str(fixture)])
            if files and options.binary_sha256 is not None:
                with binary.open('rb') as program:
                    if hashlib.file_digest(program, 'sha256').hexdigest() != options.binary_sha256:
                        raise ValueError('Changed pinned binary')
            child = subprocess.Popen([str(binary), *args],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL if files else sys.stderr, bufsize=0)
            if files:
                with binary.open('rb') as program:
                    program_sha = hashlib.file_digest(program, 'sha256').hexdigest()
                if options.binary_sha256 is not None and program_sha != options.binary_sha256:
                    raise ValueError('Changed pinned binary')
                log.write(json.dumps({'event': 'child_started', 'pid': child.pid,
                                      'program': str(binary), 'sha256': program_sha}) + '\n')
                log.flush()
            os.set_blocking(child.stdin.fileno(), False)

            def forward(line):
                nonlocal target_inflight
                if fault_marker is not None:
                    files_metadata(line)  # validate without claiming admission
                    message = json.loads(line)
                    rpc_id = message.get('id')
                    key = (type(rpc_id), rpc_id) if 'method' in message and rpc_id is not None else None
                    params = message.get('params')
                    args = params.get('arguments') if isinstance(params, dict) else None
                    matches = (key is not None and message['method'] == 'tools/call'
                               and isinstance(params, dict) and params.get('name') == 'tm_files_write'
                               and isinstance(args, dict)
                               and args.get('requestId') == options.drop_write_response_for_request_id)
                    deadline = time.monotonic() + 30
                    with fault_condition:
                        if key is not None and key in inflight:
                            raise ValueError('Duplicate in-flight JSON-RPC ID')
                        # Drain prior responses all the way through stdout before
                        # admitting the target; then hold every later input frame.
                        while target_inflight or (matches and fault_armed and inflight):
                            if stop_input.is_set():
                                break
                            if time.monotonic() >= deadline:
                                raise RuntimeError('Fault admission wait limit')
                            fault_condition.wait(timeout=0.05)
                        if stop_input.is_set():
                            with lock:
                                log.write(json.dumps({'direction': 'not_admitted', 'bytes': len(line),
                                                      'sha256': hashlib.sha256(line).hexdigest(),
                                                      'phase': 'REQUEST_NOT_ADMITTED'}) + '\n')
                                log.flush()
                            return False
                        if key is not None:
                            inflight[key] = matches
                            if matches and fault_armed:
                                target_inflight = True
                record('to_server', line)
                remaining = memoryview(line)
                while remaining:
                    if stop_input.is_set():
                        raise RuntimeError('Input forwarding interrupted')
                    if select.select([], [child.stdin], [], 0.05)[1]:
                        try:
                            remaining = remaining[os.write(child.stdin.fileno(), remaining):]
                        except BlockingIOError:
                            continue
                return True

            def outgoing(line):
                nonlocal fault_dropped, fault_armed, target_inflight
                response_key = None
                if fault_marker is not None:
                    files_metadata(line)  # strict validation before fault observation
                    message = json.loads(line)
                    if 'method' not in message and message.get('id') is not None:
                        rpc_id = message['id']
                        response_key = (type(rpc_id), rpc_id)
                        with fault_condition:
                            matches = inflight.get(response_key, False)
                            drop_requested = matches and fault_armed
                            if drop_requested and len(inflight) != 1:
                                raise RuntimeError('Fault target is not isolated')
                        if drop_requested:
                            try:
                                fd = os.open(fault_marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                            except FileExistsError:
                                fault_marker_state(fault_marker)
                                fault_armed = False
                            else:
                                with os.fdopen(fd, 'wb') as marker:
                                    marker.write(b'RESPONSE_DROPPED\n')
                                    marker.flush()
                                    os.fsync(marker.fileno())
                                directory = os.open(fault_marker.parent, os.O_RDONLY)
                                try:
                                    os.fsync(directory)
                                finally:
                                    os.close(directory)
                                row = {'direction': 'from_server', 'bytes': len(line),
                                       'sha256': hashlib.sha256(line).hexdigest(),
                                       'requestId': options.drop_write_response_for_request_id,
                                       'phase': 'RESPONSE_DROPPED'}
                                # Never log arbitrary JSON-RPC string IDs.
                                if type(rpc_id) is int and abs(rpc_id) <= 9007199254740991:
                                    row['rpcId'] = rpc_id
                                elif isinstance(rpc_id, str) and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', rpc_id):
                                    row['rpcId'] = rpc_id
                                else:
                                    row['rpcIdSha256'] = hashlib.sha256(json.dumps(rpc_id).encode()).hexdigest()
                                with lock:
                                    log.write(json.dumps(row, separators=(',', ':')) + '\n')
                                    log.flush()
                                fault_dropped = True
                                stop_input.set()
                                raise ResponseDropped()
                record('from_server', line)
                emit(line)
                if response_key is not None:
                    with fault_condition:
                        matches = inflight.pop(response_key, False)
                        if matches:
                            target_inflight = False
                        fault_condition.notify_all()

            def incoming():
                pending = bytearray()
                try:
                    while not stop_input.is_set():
                        if not select.select([sys.stdin.buffer], [], [], 0.05)[0]:
                            continue
                        chunk = os.read(sys.stdin.fileno(), 65536)
                        if not chunk:
                            if pending:
                                if len(pending) > limit:
                                    raise ValueError('Input line limit')
                                if not forward(bytes(pending)):
                                    return
                                pending.clear()
                            return
                        pending.extend(chunk)
                        while b'\n' in pending:
                            end = pending.index(b'\n') + 1
                            if end > limit:
                                raise ValueError('Input line limit')
                            if not forward(bytes(pending[:end])):
                                return
                            del pending[:end]
                        if len(pending) > limit:
                            raise ValueError('Input line limit')
                    if pending:
                        raise RuntimeError('Unfinished input at shutdown')
                except Exception:
                    audit_errors.append('Incoming request audit or forwarding failed; raw data suppressed')
                    input_failed.set()
                finally:
                    child.stdin.close()
                    input_done.set()

            # A cancellable reader is joined before audit_end; no daemon can append a late error.
            reader = threading.Thread(target=incoming)
            reader.start()
            pending = bytearray()
            eof_deadline = None
            session_deadline = time.monotonic() + 1800
            while True:
                if files and time.monotonic() >= session_deadline:
                    raise RuntimeError('Files session limit')
                if cancelled:
                    code = 130
                    audit_errors.append('Cancelled; audit may be incomplete')
                    break
                if input_failed.is_set():
                    break
                if input_done.is_set() and eof_deadline is None:
                    eof_deadline = time.monotonic() + 5
                if eof_deadline is not None and time.monotonic() >= eof_deadline:
                    raise RuntimeError('Child did not finish after input EOF')
                if not select.select([child.stdout], [], [], 0.05)[0]:
                    continue
                chunk = os.read(child.stdout.fileno(), 65536)
                if not chunk:
                    if pending:
                        if len(pending) > limit:
                            raise ValueError('Output line limit')
                        outgoing(bytes(pending))
                    code = child.wait(timeout=5)
                    if code:
                        audit_errors.append('MCP child exited unsuccessfully')
                    break
                pending.extend(chunk)
                while b'\n' in pending:
                    end = pending.index(b'\n') + 1
                    if end > limit:
                        raise ValueError('Output line limit')
                    line = bytes(pending[:end])
                    outgoing(line)
                    del pending[:end]
                if len(pending) > limit:
                    raise ValueError('Output line limit')
        except ResponseDropped:
            code = 1
        except Exception:
            audit_errors.append('Outgoing response audit or relay setup failed; raw data suppressed')
        finally:
            stop_input.set()
            if child is not None:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=2)
                if reader is not None and reader.ident is not None:
                    reader.join()
                else:
                    child.stdin.close()
                child.stdout.close()
            os.set_blocking(sys.stdout.fileno(), stdout_blocking)
            # Final status and log lifetime are owned here, after all input work has ended.
            if cancelled:
                code = 130
                if not audit_errors:
                    audit_errors.append('Cancelled; audit may be incomplete')
            if audit_errors and code != 130:
                code = 1
            log.write(json.dumps({'event': 'audit_end', 'exitCode': code,
                                  'auditComplete': not audit_errors,
                                  'errors': (['E_TEST_RESPONSE_DROPPED'] if fault_dropped else
                                             (['E_RELAY_STOPPED'] if audit_errors else [])) if files else audit_errors}) + '\n')
            log.flush()
    return code


if __name__ == '__main__':
    sys.exit(main())
