#!/usr/bin/env python3
import json
import sys
import time
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:60844'
STACK = sys.argv[2] if len(sys.argv) > 2 else 'upgraded'

if STACK not in ('upgraded', 'playwright'):
    raise SystemExit(f'unsupported stack: {STACK}')

script = (
    "console.log('http e2e smoke start');"
    "console.log('http e2e smoke stack=' + " + json.dumps(STACK) + ");"
    "console.log('http e2e smoke end');"
)

payload = {
    'script': script,
    'stack': STACK,
    'timeout': 60,
    'consoleMode': 'summary',
}

req = urllib.request.Request(
    BASE + '/executions',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST',
)

with urllib.request.urlopen(req, timeout=20) as resp:
    create_data = json.loads(resp.read().decode('utf-8'))

body = create_data['data']
execution_id = body['executionId']
status_url = BASE + body['statusUrl']
summary_url = BASE + body['summaryUrl']
stream_url = BASE + body['streamUrl']

final_status = None
status_payload = None
for _ in range(60):
    with urllib.request.urlopen(status_url, timeout=20) as resp:
        status_payload = json.loads(resp.read().decode('utf-8'))
    final_status = status_payload.get('data', {}).get('status')
    if final_status in ('succeeded', 'failed', 'timed_out'):
        break
    time.sleep(1)

summary_payload = None
with urllib.request.urlopen(summary_url, timeout=20) as resp:
    summary_payload = json.loads(resp.read().decode('utf-8'))

result = {
    'ok': final_status == 'succeeded',
    'stack': STACK,
    'selectedApp': None,
    'skipped': False,
    'runtimeNote': 'HTTP smoke proves /executions transport and stack routing, not full Playwright runtime semantics.',
    'finalStatus': final_status,
    'executionId': execution_id,
    'artifactDir': body.get('artifacts', {}).get('runDir'),
    'proofLevel': 'real-environment proof',
    'boundaryNote': 'HTTP smoke is execution-path and facade/shim routing proof only.',
    'base': BASE,
    'statusUrl': status_url,
    'summaryUrl': summary_url,
    'streamUrl': stream_url,
    'statusPayload': status_payload,
    'summaryPayload': summary_payload,
}
print(json.dumps(result, ensure_ascii=False, indent=2))
