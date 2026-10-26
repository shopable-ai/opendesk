#!/usr/bin/env python3
"""Synthetic preparation checks; never opens credentials or starts a client."""
import importlib.util
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('prepare_run', Path(__file__).with_name('prepare-run.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
os.umask(0o077)
root = module.ROOT / 'prepare-regression'
root.mkdir(parents=True, exist_ok=True)
case = Path(tempfile.mkdtemp(prefix='run-', dir=root))
binary = case / 'binary'
client = case / 'client'
binary_content = ('#!' + sys.executable + '\nimport json, os\n'
                  'print(json.dumps({"jsonrpc":"2.0","id":1,"result":{'
                  '"runtimeKeyInherited":"CONTROL_PLANE_API_KEY" in os.environ,'
                  '"otherInherited":"UNRELATED_SENTINEL" in os.environ}}), flush=True)\n')
for path in (binary, client):
    path.write_text(binary_content if path == binary else 'synthetic; must never execute\n')
    path.chmod(0o700)
provenance = case / 'provenance.json'
provenance.write_text(json.dumps({'sha256': {str(path): module.digest(path) for path in (binary, client)}}))
index = case / 'index.json'
config = {'binary': str(binary), 'client': str(client), 'binaryProvenance': str(provenance),
          'keyFile': str(case / 'MUST-NOT-BE-OPENED.key'), 'tunnelId': 'tunnel_synthetic', 'organizationId': 'org-synthetic'}
index.write_text(json.dumps(config))
first, _ = module.prepare(index)
second, _ = module.prepare(index)
assert first != second
manifest = json.loads((first / 'online-artifacts.json').read_text())
profile = (first / 'profiles/opendesk-web-file.yaml').read_text()
assert '/usr/bin/env -i PATH=' in profile
assert 'env:CONTROL_PLANE_API_KEY' in profile and config['keyFile'] not in profile
assert manifest['proofDirectory'] == str(first / 'fixture')
assert not (first / 'fixture/web-proof.txt').exists()
assert not (first / 'rpc-audit.jsonl').exists()
assert not Path(config['keyFile']).exists()
assert all(module.digest(Path(path)) == expected for path, expected in manifest['sha256'].items())
checks = ['unique-runs', 'pinned-artifacts', 'credential-free-profile', 'fresh-proof-and-audit', 'no-client-execution']
isolated_profile = (second / 'profiles/opendesk-web-file.yaml').read_text()
command = json.loads(next(line.split('command: ', 1)[1] for line in isolated_profile.splitlines() if '      command: ' in line))
observed = subprocess.run(shlex.split(command), input=b'', stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          env={'PATH': '/usr/bin:/bin', 'CONTROL_PLANE_API_KEY': 'SYNTHETIC-ONLY',
                               'UNRELATED_SENTINEL': 'SYNTHETIC-ONLY'}, timeout=5, check=True)
assert json.loads(observed.stdout)['result'] == {'runtimeKeyInherited': False, 'otherInherited': False}
checks.append('observed-credential-free-child-environment')


def reject(name):
    try:
        module.prepare(index)
    except (OSError, ValueError):
        checks.append(name)
    else:
        raise AssertionError(name)


original_digest = module.digest
client_hash_calls = 0


def changed_client_digest(path):
    global client_hash_calls
    if path == client:
        client_hash_calls += 1
        if client_hash_calls == 2:
            client.write_text('changed during preparation\n')
    return original_digest(path)


module.digest = changed_client_digest
try:
    reject('reject-client-change-during-prepare')
finally:
    module.digest = original_digest
    client.write_text('synthetic; must never execute\n')

binary.write_text('changed\n')
reject('reject-binary-tamper')
binary.write_text(binary_content)
client.write_text('changed\n')
reject('reject-client-tamper')
client.write_text('synthetic; must never execute\n')
link = case / 'linked-binary'
link.symlink_to(binary)
config['binary'] = str(link)
index.write_text(json.dumps(config))
reject('reject-symlink')
config['binary'] = str(binary)
config['tunnelId'] = 'invalid\nconfig'
index.write_text(json.dumps(config))
reject('reject-invalid-resource')
report = {'pass': True, 'syntheticOnly': True, 'checks': checks, 'preparedRuns': [str(first), str(second)]}
(case / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'pass': True, 'checks': len(checks), 'report': str(case / 'result.json')}))
