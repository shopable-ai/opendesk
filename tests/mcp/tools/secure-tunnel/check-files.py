#!/usr/bin/env python3
"""Offline files-mode regressions. Synthetic processes only; no tunnel/key access."""
import ast
import contextlib
import fcntl
import io
import queue
import re
import signal
import stat
import threading
import time
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
from unittest.mock import patch

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence-dir', type=Path, required=True)
options = parser.parse_args()
options.evidence_dir.mkdir(parents=True, exist_ok=True)
os.umask(0o077)
root = Path(tempfile.mkdtemp(prefix='files-check-', dir=options.evidence_dir))
tools = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare', tools / 'prepare-run.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
# Catches absent explicit mode and accidental capability reads during preparation.
core = root / '.runtime/tests/mcp-files-core/core'
core.mkdir(parents=True)
prepare.FILES_ROOT = core.parent
binary, client = root / 'binary', root / 'client'
for path in (binary, client):
    path.write_text('#!' + sys.executable + '\nimport sys\nfor line in sys.stdin.buffer:\n sys.stdout.buffer.write(line);sys.stdout.buffer.flush()\n')
    path.chmod(0o700)
private = root / 'private'
private.mkdir(mode=0o700)
credential = private / 'credential.json'
credential.write_text('SYNTHETIC-CAPABILITY-MUST-NOT-BE-READ')
credential.chmod(0o600)
provenance = root / 'provenance.json'
provenance.write_text(json.dumps({'sha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (binary, client)}}))
index = root / 'index.json'
index.write_text(json.dumps({'client': str(client), 'tunnelId': 'tunnel_synthetic', 'organizationId': 'org-synthetic', 'keyFile': str(root / 'absent.key')}))
original_open = Path.open

def guarded_open(path, *args, **kwargs):
    assert path != credential, 'capability must never be opened'
    return original_open(path, *args, **kwargs)

with patch.object(Path, 'open', guarded_open):
    run, _ = prepare.prepare(index, binary, client, provenance, mode='files', core_run=core, credential=credential)
# A provenance source entry is data, never permission to hash the capability.
source_record = root / 'source-provenance.json'
source_record.write_text(json.dumps({'sha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                                               for p in (binary, client)},
                                    'sources': {str(credential): '0' * 64}}))
with patch.object(Path, 'open', guarded_open):
    prepare.prepare(index, binary, client, source_record, mode='files', core_run=core, credential=credential)
assert run.parent == core / 'tunnel'
manifest = json.loads((run / 'online-artifacts.json').read_text())
assert manifest['mode'] == 'files'
assert str(credential) not in manifest['sha256']
profile = (run / 'profiles/opendesk-web-file.yaml').read_text()
command = json.loads(next(line.split('command: ', 1)[1] for line in profile.splitlines() if '      command: ' in line))
assert '--files-bridge-credential-file' in command and '--mode files' in command
assert 'web-file-test-dir' not in command

checks = ['explicit-files-prepare', 'no-capability-read', 'pinned-candidate-client-profile',
          'provenance-sources-never-open-capability']
for alias in ('index', 'binary', 'client', 'provenance'):
    kwargs = {'index': index, 'binary': binary, 'client': client, 'provenance': provenance}
    kwargs[alias] = credential
    with patch.object(Path, 'open', guarded_open):
        try:
            prepare.prepare(**kwargs, mode='files', core_run=core, credential=credential)
        except ValueError:
            checks.append('reject-credential-as-' + alias)
        else:
            raise AssertionError(alias)

# Reject loose permissions, symlink/hardlink references and foreign output roots.
for name in ('mode', 'symlink', 'hardlink', 'outside-core'):
    selected, selected_core = credential, core
    if name == 'mode':
        credential.chmod(0o644)
    elif name in ('symlink', 'hardlink'):
        selected = private / name
        if name == 'symlink':
            selected.symlink_to(credential)
        else:
            os.link(credential, selected)
    else:
        selected_core = root
    try:
        prepare.prepare(index, binary, client, provenance, mode='files', core_run=selected_core, credential=selected)
    except ValueError:
        checks.append('reject-' + name)
    else:
        raise AssertionError(name)
    finally:
        credential.chmod(0o600)
        if selected != credential:
            selected.unlink()
# The actual generated command must work with the documented files CLI flag.
observed = subprocess.run(shlex.split(command), input=b'{"jsonrpc":"2.0","id":1,"result":{}}\n',
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
assert observed.returncode == 0 and observed.stdout == b'{"jsonrpc":"2.0","id":1,"result":{}}\n'
(run / 'rpc-audit.jsonl').rename(run / 'generated-command-audit.jsonl')
checks.append('generated-profile-launches-files-command')

def relay_case(name, payload, program=None, success=True):
    case = root / name
    case.mkdir()
    child = case / 'child'
    child.write_text('#!' + sys.executable + '\nimport sys,os,pathlib\n'
                     + f'pathlib.Path({str(case / "args.json")!r}).write_text(__import__("json").dumps(sys.argv[1:]))\n'
                     + (program or 'for line in sys.stdin.buffer:\n sys.stdout.buffer.write(line);sys.stdout.buffer.flush()') + '\n')
    child.chmod(0o700)
    trace = case / 'audit.jsonl'
    result = subprocess.run([sys.executable, str(tools / 'stdio-audit.py'), '--mode', 'files',
                             '--files-bridge-credential-file', str(credential), str(child), str(case), str(trace)],
                            input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    assert (result.returncode == 0) == success, (name, result.returncode)
    assert not result.stderr, name
    rows = [json.loads(line) for line in trace.read_text().splitlines()]
    assert rows[-1]['auditComplete'] == success, name
    if success or (case / 'args.json').exists():
        assert json.loads((case / 'args.json').read_text()) == ['--files-bridge-credential-file', str(credential)]
    audit = trace.read_bytes()
    for forbidden in (b'PRIVATE-BODY', b'PRIVATE-SESSION', b'PRIVATE-ERROR', b'SYNTHETIC-CAPABILITY'):
        assert forbidden not in audit, name
    if success:
        assert result.stdout == payload, name
        assert len([r for r in rows if r.get('direction') == 'to_server']) == 1, 'no retries'
        process = next(r for r in rows if r.get('event') == 'child_started')
        assert process['pid'] > 0 and process['program'] == str(child)
        assert process['sha256'] == hashlib.sha256(child.read_bytes()).hexdigest()
    else:
        assert not result.stdout, name
    if name == 'unknown-no-replay':
        row = next(r for r in rows if r.get('direction') == 'from_server')
        assert row['outcome'] == 'OUTCOME_UNKNOWN'
        assert row['stages']['fileWritten'] == 'UNKNOWN'
    checks.append(name)

payload = b'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"tm_files_write","arguments":{"content":"PRIVATE-BODY","requestId":"12345678-1234-4234-8234-123456789abc"}},"_meta":{"x":"PRIVATE-SESSION"}}\n'
relay_case('private-wire-preserved', payload)
relay_case('unknown-no-replay', b'{"jsonrpc":"2.0","id":2,"result":{"error":{"code":"E_FILES_BRIDGE","outcome":"OUTCOME_UNKNOWN","message":"PRIVATE-ERROR"},"stages":{"requestAccepted":"UNKNOWN","fileWritten":"UNKNOWN","toolResult":"PREPARED"}}}\n')
for name, raw in [('duplicate', b'{"jsonrpc":"2.0","id":1,"id":2}\n'),
                  ('nan', b'{"jsonrpc":"2.0","id":NaN}\n'),
                  ('surrogate', b'{"jsonrpc":"2.0","id":1,"result":"\\ud800"}\n'),
                  ('trailing', b'{"jsonrpc":"2.0"}x\n'),
                  ('not-rpc', b'[]\n'),
                  ('bad-rpc-id', b'{"jsonrpc":"2.0","id":{},"result":{}}\n'),
                  ('both-result-error', b'{"jsonrpc":"2.0","id":1,"result":{},"error":{}}\n'),
                  ('oversized-input', b'{"jsonrpc":"2.0","result":"' + b'x' * 61440 + b'"}\n')]:
    relay_case(name, raw, success=False)
# Complete frame bound includes newline; a legal exact-limit frame is forwarded unchanged.
head = b'{"jsonrpc":"2.0","id":1,"result":"'
exact = head + b'x' * (61440 - len(head) - 3) + b'"}\n'
relay_case('exact-frame-limit', exact)
relay_case('oversized-output', b'', 'sys.stdout.buffer.write(b\'{"jsonrpc":"2.0","result":"\' + b"x"*61440 + b\'"}\\n\');sys.stdout.buffer.flush()', success=False)
relay_case('stderr-suppressed', b'{"jsonrpc":"2.0","id":1,"result":{}}\n', 'sys.stderr.write("PRIVATE-BODY PRIVATE-ERROR\\n");sys.stderr.flush()\nfor line in sys.stdin.buffer:\n sys.stdout.buffer.write(line);sys.stdout.buffer.flush()')
tree = ast.parse((tools / 'start-online.py').read_text())
names = {'preflight', 'checked_path', 'check_fresh_run', 'run_client', 'stop',
         'reap_cancelled', 'group_alive', 'open_log', 'operator_output', 'redact'}
namespace = dict(globals(), RUN=run, REPO=root, SOURCE=tools / 'start-online.py',
                 FILES_MODE=True, stop_requested=False, child=None, env={},
                 CLIENT=Path(sys.executable), key='SYNTHETIC-NOT-A-REAL-KEY', state=lambda **fields: None)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names],
                        type_ignores=[]), '<launcher-functions>', 'exec'), namespace)
assert namespace['preflight'](run) == (client, 'org-synthetic')
namespace['FILES_PINS'] = {str(Path(sys.executable)): hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()}
with contextlib.redirect_stdout(io.StringIO()) as captured:
    assert namespace['run_client']('synthetic', ['-c', 'import sys;print("PRIVATE-BODY");sys.stderr.write("PRIVATE-ERROR")'], 5) == 0
    assert 'PRIVATE' not in captured.getvalue()
assert 'PRIVATE' not in (run / 'synthetic.redacted.log').read_text()
ledger = json.loads((run / 'client-processes.jsonl').read_text().splitlines()[0])
assert ledger['pid'] > 0 and ledger['program'] == sys.executable
assert ledger['sha256'] == namespace['FILES_PINS'][sys.executable]
checks.append('launcher-suppresses-client-content-and-records-real-process')
namespace['FILES_PINS'][sys.executable] = '0' * 64
try:
    namespace['run_client']('tampered', ['-c', 'raise SystemExit(0)'], 5)
except (ValueError, RuntimeError):
    pass
else:
    raise AssertionError('files launcher must recheck pinned executable before every spawn')
checks.append('launcher-refuses-changed-client-before-spawn')
namespace['FILES_PINS'][sys.executable] = ledger['sha256']
(run / 'client-processes.jsonl').unlink()
victim = root / 'preserve.txt'
victim.write_text('preserve')
(run / 'client-processes.jsonl').symlink_to(victim)
try:
    namespace['run_client']('symlink-evidence', ['-c', 'import time;time.sleep(30)'], 5)
except OSError:
    pass
else:
    raise AssertionError('process ledger symlink must fail')
assert victim.read_text() == 'preserve'
assert namespace['child'].poll() is not None
checks.append('process-ledger-symlink-refused-owned-child-cleaned')
(root / 'result.json').write_text(json.dumps({'pass': True, 'checks': checks, 'syntheticOnly': True}, indent=2) + '\n')
print(json.dumps({'pass': True, 'checks': len(checks), 'evidence': str(root)}))
