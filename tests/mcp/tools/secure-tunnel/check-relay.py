#!/usr/bin/env python3
"""Synthetic relay lifecycle checks; no tunnel, credential or nonce proof access."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--relay', type=Path, default=Path(__file__).with_name('stdio-audit.py'))
options = parser.parse_args()
repo = Path(__file__).resolve().parents[4]
output = repo / '.runtime/tests/mcp-chatgpt-web/relay-regression'
output.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='run-', dir=output))
os.chmod(root, 0o700)
results = []


def run_case(name, program, payload=b'', hold_input=False, cancel=False, delayed=False):
    case = root / name
    case.mkdir(mode=0o700)
    stub = case / 'child.py'
    stub.write_text('#!' + sys.executable + '\nimport os, pathlib, sys, time\n'
                    + f'pathlib.Path({str(case / "child.pid")!r}).write_text(str(os.getpid()))\n'
                    + program + '\n')
    stub.chmod(0o700)
    command = [sys.executable, str(options.relay.resolve()), str(stub), str(case), str(case / 'audit.jsonl')]
    if delayed:
        runner = case / 'runner.py'
        runner.write_text('import json, pathlib, runpy, sys, time\n'
                          'original = json.loads\n'
                          'def delayed_loads(value, *args, **kwargs):\n'
                          '    if "delayFailure" in value:\n'
                          f'        pathlib.Path({str(case / "parsing")!r}).touch()\n'
                          '        time.sleep(0.5)\n'
                          '        raise ValueError("synthetic delayed parse failure")\n'
                          '    return original(value, *args, **kwargs)\n'
                          'json.loads = delayed_loads\n'
                          'sys.argv = sys.argv[1:]\n'
                          'runpy.run_path(sys.argv[0], run_name="__main__")\n')
        command.insert(1, str(runner))
    started = time.monotonic()
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    try:
        deadline = time.monotonic() + 3
        while not (case / 'child.pid').exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert (case / 'child.pid').exists(), name
        if hold_input or cancel:
            if payload:
                process.stdin.write(payload)
                process.stdin.flush()
            if cancel:
                deadline = time.monotonic() + 3
                while not (case / 'child.pid').exists() and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.01)
                assert (case / 'child.pid').exists(), name
                if name == 'cancel-output-backpressure':
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        if (case / 'audit.jsonl').stat().st_size > 262144:
                            break
                        time.sleep(0.01)
                    assert (case / 'audit.jsonl').stat().st_size > 262144
                os.kill(process.pid, signal.SIGTERM)
            process.wait(timeout=8)
            process.stdin.close()
            process.stdin = None
            stdout, stderr = process.communicate(timeout=1)
        else:
            stdout, stderr = process.communicate(payload, timeout=8)
        rows = [json.loads(line) for line in (case / 'audit.jsonl').read_text().splitlines()]
        assert rows[-1]['event'] == 'audit_end', (name, rows)
        assert len([row for row in rows if row.get('event') == 'audit_end']) == 1, name
        assert rows[-1]['exitCode'] == process.returncode, (name, rows[-1], process.returncode)
        if name in ('normal-eof', 'child-first', 'metadata'):
            assert process.returncode == 0 and rows[-1]['auditComplete'], (name, rows, stderr)
        else:
            assert process.returncode != 0 and not rows[-1]['auditComplete'], (name, rows, stderr)
        if delayed:
            assert any('Incoming' in error for error in rows[-1]['errors']), rows
            assert time.monotonic() - started >= 0.5, name
        if name == 'metadata':
            assert b'private-session' not in (case / 'audit.jsonl').read_bytes()
            assert b'[OMITTED:' in (case / 'audit.jsonl').read_bytes()
            assert b'private-session' in stdout, 'wire data must remain unchanged'
        child_pid = int((case / 'child.pid').read_text())
        try:
            os.kill(child_pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError(f'{name}: owned child still exists')
        results.append({'case': name, 'pass': True, 'exitCode': process.returncode,
                        'auditComplete': rows[-1]['auditComplete'], 'ownedChildAbsent': True})
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)


echo = 'for line in sys.stdin.buffer:\n    sys.stdout.buffer.write(line); sys.stdout.buffer.flush()'
run_case('normal-eof', echo, b'{"jsonrpc":"2.0","id":1,"result":{}}\n')
run_case('metadata', echo, b'{"jsonrpc":"2.0","id":2,"_meta":{"session":"private-session"}}\n')
run_case('late-input-error', f'while not pathlib.Path({str(root / "late-input-error/parsing")!r}).exists(): time.sleep(0.005)',
         b'{"delayFailure":true}\n', hold_input=True, delayed=True)
run_case('child-first', 'pass', hold_input=True)
run_case('bad-input', 'sys.stdin.buffer.read()', b'not-json\n')
run_case('bad-output', 'print("not-json", flush=True)')
run_case('cancel', 'import signal\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\ntime.sleep(60)', cancel=True)
run_case('cancel-input-backpressure', 'import signal\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\ntime.sleep(60)',
         json.dumps({'padding': 'x' * 262144}).encode() + b'\n', cancel=True)
run_case('partial-input-child-exit', 'time.sleep(0.2)', b'{"incomplete":', hold_input=True)
run_case('cancel-output-backpressure', 'import json\nprint(json.dumps({"padding":"x" * 262144}), flush=True)\ntime.sleep(60)', cancel=True)
report = {'syntheticOnly': True, 'relay': str(options.relay.resolve()), 'cases': results}
(root / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'pass': True, 'cases': len(results), 'report': str(root / 'result.json')}))
