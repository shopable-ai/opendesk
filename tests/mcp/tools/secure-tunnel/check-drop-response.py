#!/usr/bin/env python3
"""Offline, real-subprocess tests of the opt-in one-use write-response fault."""
import argparse
import ast
import hashlib
import importlib.util
import json
import os
import re
import stat
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence-dir', type=Path, required=True)
options = parser.parse_args()
os.umask(0o077)
options.evidence_dir.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='drop-response-', dir=options.evidence_dir.resolve()))
core = options.evidence_dir.resolve().parent
tools = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare', tools / 'prepare-run.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
target = '2b829f20-7efe-4487-bc5e-9126cb1068ad'
private = root / 'private'
private.mkdir(mode=0o700)
credential = private / 'credential'
credential.write_text('SYNTHETIC-CAPABILITY-NEVER-READ')
credential.chmod(0o600)
binary, client = root / 'server', root / 'official-client-never-executed'
# Records actual requests independently; deliberately remains alive after EOF.
binary.write_text('#!' + sys.executable + '\n' + 'import json,os,pathlib,sys,threading,time\nroot=pathlib.Path(__file__).parent\noutput_lock=threading.Lock()\nworkers=[]\nwith (root/"server-pids.jsonl").open("a") as f:f.write(str(os.getpid())+"\\n")\ndef respond(m):\n time.sleep(m.get("params",{}).get("arguments",{}).get("responseDelay",0))\n with output_lock:\n  if m.get("params",{}).get("arguments",{}).get("emitOtherResponse"):\n   sys.stdout.write(\'{"jsonrpc":"2.0","id":999,"result":{}}\\n\');sys.stdout.flush()\n  response={"jsonrpc":"2.0","id":m["id"],"result":{"private":"PRIVATE-BODY PRIVATE-ERROR"}}\n  sys.stdout.write(json.dumps(response,separators=(",",":"))+"\\n");sys.stdout.flush()\nfor line in sys.stdin.buffer:\n with (root/"observed-requests.bin").open("ab") as f:f.write(line)\n m=json.loads(line)\n if "id" in m:\n  if m.get("params",{}).get("arguments",{}).get("responseDelay"):\n   worker=threading.Thread(target=respond,args=(m,));workers.append(worker);worker.start()\n  else:respond(m)\nfor worker in workers:worker.join()\ntime.sleep(0.2)\n')
client.write_text('must never execute')
for p in (binary, client):
    p.chmod(0o700)
provenance = root / 'provenance.json'
provenance.write_text(json.dumps({'sha256': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (binary, client)}}))
index = root / 'index.json'
index.write_text(json.dumps({'client': str(client), 'keyFile': str(root / 'absent-key'),
                             'organizationId': 'org-synthetic', 'tunnelId': 'tunnel_synthetic'}))
checks = []
case_proofs = []

def fresh(fault=target):
    run, _ = prepare.prepare(index, binary, client, provenance, mode='files', core_run=core,
                             credential=credential, drop_write_response_for_request_id=fault)
    profile = run / 'profiles/opendesk-web-file.yaml'
    command = json.loads(next(s.split('command: ', 1)[1] for s in profile.read_text().splitlines() if '      command: ' in s))
    return run, shlex.split(command)


def request(rpc_id, tool='tm_files_write', request_id=target, method='tools/call'):
    return (json.dumps({'jsonrpc': '2.0', 'id': rpc_id, 'method': method,
                        'params': {'name': tool, 'arguments': {'requestId': request_id, 'content': 'PRIVATE-BODY'}}},
                       separators=(',', ':')) + '\n').encode()


def launch(run, command, payload, drop=False, forwarded_ids=(), admitted_payload=None):
    prior_traces = set(run.glob('rpc-audit*.jsonl'))
    before = (run / 'observed-requests.bin').read_bytes() if (run / 'observed-requests.bin').exists() else b''
    result = subprocess.run(command, input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    assert not result.stderr, result.stderr
    observed = (run / 'observed-requests.bin').read_bytes()[len(before):]
    expected_admitted = payload if admitted_payload is None else admitted_payload
    assert observed == expected_admitted, 'only admitted requests may reach actual child, unchanged exactly once'
    rows, new_rows = [], []
    for trace in sorted(run.glob('rpc-audit*.jsonl')):
        raw = trace.read_bytes()
        assert all(secret not in raw for secret in (b'PRIVATE-BODY', b'PRIVATE-ERROR', b'SYNTHETIC-CAPABILITY'))
        parsed = [json.loads(line) for line in raw.splitlines()]
        rows.extend(parsed)
        if trace not in prior_traces:
            new_rows.extend(parsed)
    if drop:
        assert result.returncode != 0, 'matching response must close the transport'
        assert [json.loads(line)['id'] for line in result.stdout.splitlines()] == list(forwarded_ids), 'only matching response may be suppressed'
        dropped = [r for r in rows if r.get('phase') == 'RESPONSE_DROPPED']
        assert len(dropped) == 1
        assert dropped[0]['requestId'] == target and dropped[0]['rpcId'] == 42
        assert set(dropped[0]) == {'direction', 'bytes', 'sha256', 'requestId', 'rpcId', 'phase'}
    else:
        assert result.returncode == 0, result.returncode
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        assert sorted(m['id'] for m in responses) == sorted(json.loads(line)['id'] for line in payload.splitlines())
        assert all(m['result']['private'] == 'PRIVATE-BODY PRIVATE-ERROR' for m in responses)
    for pid in map(int, (run / 'server-pids.jsonl').read_text().splitlines()):
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError('owned MCP child survived')
    submitted_ids = [json.loads(line)['id'] for line in payload.splitlines()]
    admitted_ids = [json.loads(line)['id'] for line in observed.splitlines()]
    delivered_ids = [json.loads(line)['id'] for line in result.stdout.splitlines()]
    dropped_ids = [row['rpcId'] for row in new_rows if row.get('phase') == 'RESPONSE_DROPPED']
    assert len([row for row in new_rows if row.get('direction') == 'to_server']) == len(admitted_ids)
    assert dropped_ids == ([42] if drop else [])
    for rpc_id in admitted_ids:
        if not (drop and rpc_id == 42):
            assert delivered_ids.count(rpc_id) == 1, 'every admitted non-target response must be delivered'
    case_proofs.append({'run': str(run), 'submittedIds': submitted_ids, 'admittedIds': admitted_ids,
                        'deliveredResponseIds': delivered_ids, 'droppedResponseIds': dropped_ids,
                        'unadmittedIds': submitted_ids[len(admitted_ids):], 'exitCode': result.returncode,
                        'ownedChildAbsent': True})
    return result

run, command = fresh()
manifest = json.loads((run / 'online-artifacts.json').read_text())
fault = manifest['faultInjection']
assert fault == {'flag': '--drop-write-response-for-request-id', 'requestId': target,
                 'marker': str(run / ('.drop-write-response-' + target + '.used'))}
marker = Path(fault['marker'])
assert not marker.exists()
assert command.count('--drop-write-response-for-request-id') == 1 and target in command
launch(run, command, request(42), drop=True)
assert marker.stat().st_mode & 0o777 == 0o600
checks.append('exact-write-response-dropped-request-count-one-owned-child-cleaned')
# Official client recreates the same configured command; persistent marker prevents a second drop.
launch(run, command, request(42))
assert len(list(run.glob('rpc-audit*.jsonl'))) == 2
checks.append('recreated-relay-one-use-no-second-drop-or-log-overwrite')
# A delayed target reply makes eager admission of the following read observable.
case, cmd = fresh()
delayed_target = json.loads(request(42))
delayed_target['params']['arguments']['responseDelay'] = 0.2
target_frame = (json.dumps(delayed_target)+'\n').encode()
launch(case, cmd, target_frame + request(7, tool='tm_files_read'), drop=True,
       admitted_payload=target_frame)
checks.append('target-then-read-read-not-admitted-no-read-response-dropped')
launch(case, cmd, target_frame + request(7, tool='tm_files_read'))
checks.append('consumed-marker-pipelining-unchanged-no-gating-or-second-drop')
# Earlier admitted responses must finish forwarding before the target is admitted.
case, cmd = fresh()
delayed_read = json.loads(request(7, tool='tm_files_read'))
delayed_read['params']['arguments']['responseDelay'] = 0.2
read_frame = (json.dumps(delayed_read)+'\n').encode()
launch(case, cmd, read_frame + request(42) + request(8, tool='tm_files_read'), drop=True,
       forwarded_ids=(7,), admitted_payload=read_frame + request(42))
checks.append('earlier-read-delivered-target-isolated-later-read-not-admitted')

case, cmd = fresh()
launch(case, cmd, request(7, tool='tm_files_read') + request(42), drop=True, forwarded_ids=(7,))
checks.append('read-response-before-write-forwarded')
case, cmd = fresh()
message = json.loads(request(42))
message['params']['arguments']['emitOtherResponse'] = True
launch(case, cmd, (json.dumps(message)+'\n').encode(), drop=True, forwarded_ids=(999,))
checks.append('other-jsonrpc-response-id-never-dropped')

for name, payload in [('read', request(42, tool='tm_files_read')),
                      ('other-request-id', request(42, request_id='12345678-1234-4234-8234-123456789abc')),
                      ('handshake', request(42, method='initialize'))]:
    case, cmd = fresh()
    launch(case, cmd, payload)
    assert not Path(json.loads((case/'online-artifacts.json').read_text())['faultInjection']['marker']).exists()
    checks.append(name + '-never-dropped')
case, cmd = fresh(None)
assert '--drop-write-response-for-request-id' not in cmd
launch(case, cmd, request(42))
checks.append('default-off')
case, cmd = fresh(None)
launch(case, cmd, target_frame + request(7, tool='tm_files_read'))
checks.append('default-off-pipelining-unchanged')
for invalid in ('not-a-uuid', target + '\n', ''):
    try:
        fresh(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError('invalid UUID accepted')
checks.append('invalid-uuid-rejected')
try:
    prepare.prepare(index, binary, client, provenance, drop_write_response_for_request_id=target)
except ValueError:
    checks.append('nonce-fault-rejected')
else:
    raise AssertionError('nonce fault accepted')
# Exercise the real launcher's preflight without executing its credential/online body.
tree = ast.parse((tools/'start-online.py').read_text())
namespace = dict(globals(), SOURCE=tools/'start-online.py', REPO=tools.parents[3])
names = {'checked_path', 'check_fresh_run', 'preflight'}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names],
                       type_ignores=[]), '<launcher-preflight>', 'exec'), namespace)
case, cmd = fresh()
assert namespace['preflight'](case) == (client, 'org-synthetic')
checks.append('launcher-fault-fresh-profile-preflight')
manifest_path = case/'online-artifacts.json'
original = manifest_path.read_text()
for name in ('different-uuid', 'outside-marker', 'unrecorded-flag'):
    document = json.loads(original)
    if name == 'different-uuid':
        document['faultInjection']['requestId'] = '12345678-1234-4234-8234-123456789abc'
    elif name == 'outside-marker':
        document['faultInjection']['marker'] = str(root/'outside.used')
    else:
        del document['faultInjection']
    manifest_path.write_text(json.dumps(document))
    try:
        namespace['preflight'](case)
    except SystemExit:
        checks.append('launcher-rejects-' + name)
    else:
        raise AssertionError(name)
manifest_path.write_text(original)
# Profile argument edits and rogue markers fail closed before spawning the MCP.
for name in ('different-uuid', 'outside-marker', 'symlink-marker'):
    current, args = fresh()
    document = json.loads((current/'online-artifacts.json').read_text())
    if name == 'different-uuid':
        args[args.index('--drop-write-response-for-request-id')+1] = '12345678-1234-4234-8234-123456789abc'
    elif name == 'outside-marker':
        args[args.index('--drop-write-response-marker')+1] = str(root/'outside.used')
    else:
        Path(document['faultInjection']['marker']).symlink_to(credential)
    rejected = subprocess.run(args, input=request(42), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    assert rejected.returncode != 0 and not rejected.stdout
    assert rejected.stderr == b'E_TEST_FAULT_CONFIG\n'
    assert not (current/'server-pids.jsonl').exists()
    assert not (root/'outside.used').exists()
    checks.append('relay-rejects-' + name + '-before-spawn')
(root / 'result.json').write_text(json.dumps({'pass': True, 'syntheticOnly': True, 'checks': checks, 'caseProofs': case_proofs}, indent=2)+'\n')
print(json.dumps({'pass': True, 'checks': len(checks), 'evidence': str(root)}))
