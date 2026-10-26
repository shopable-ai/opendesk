#!/usr/bin/env python3
"""POSIX nonce-only MCP relay. Never receives the tunnel runtime credential."""
import datetime
import json
import os
from pathlib import Path
import re
import select
import signal
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


def main():
    binary, fixture, trace = map(Path, sys.argv[1:])
    os.umask(0o077)
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

    with trace.open('x') as log:
        def record(direction, line):
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

            child = subprocess.Popen([str(binary), '--web-file-test-dir', str(fixture)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=sys.stderr, bufsize=0)
            os.set_blocking(child.stdin.fileno(), False)

            def forward(line):
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

            def incoming():
                pending = bytearray()
                try:
                    while not stop_input.is_set():
                        if not select.select([sys.stdin.buffer], [], [], 0.05)[0]:
                            continue
                        chunk = os.read(sys.stdin.fileno(), 65536)
                        if not chunk:
                            if pending:
                                forward(bytes(pending))
                                pending.clear()
                            return
                        pending.extend(chunk)
                        while b'\n' in pending:
                            end = pending.index(b'\n') + 1
                            if end > MAX_LINE:
                                raise ValueError('Input line limit')
                            forward(bytes(pending[:end]))
                            del pending[:end]
                        if len(pending) > MAX_LINE:
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
            while True:
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
                        record('from_server', bytes(pending))
                        emit(pending)
                    code = child.wait(timeout=5)
                    if code:
                        audit_errors.append('MCP child exited unsuccessfully')
                    break
                pending.extend(chunk)
                while b'\n' in pending:
                    end = pending.index(b'\n') + 1
                    if end > MAX_LINE:
                        raise ValueError('Output line limit')
                    line = bytes(pending[:end])
                    record('from_server', line)
                    emit(line)
                    del pending[:end]
                if len(pending) > MAX_LINE:
                    raise ValueError('Output line limit')
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
                                  'auditComplete': not audit_errors, 'errors': audit_errors}) + '\n')
            log.flush()
    return code


if __name__ == '__main__':
    sys.exit(main())
