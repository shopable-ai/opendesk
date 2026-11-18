import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile, readdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const script = path.join(repo, 'examples/ai-customer-support/scripts/local-query.py');
const root = path.join(repo, '.runtime/tests/ai-customer-support');
const python = process.env.PYTHON_BIN || process.env.PYTHON || 'python3';
const secret = 'fixture-private-token-must-not-appear';
const env = { ...process.env, QUERY_API_HTTP_LLM_BASE_URL: 'http://127.0.0.1:1/v1',
  QUERY_API_HTTP_LLM_MODEL: 'fixture-model', QUERY_API_HTTP_LLM_API_KEY: secret };

async function put(base, name, text) {
  const target = path.join(base, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
}
async function fixture() {
  await mkdir(root, { recursive: true });
  const base = await mkdtemp(path.join(root, 'local-query-test-'));
  const source = path.join(base, 'upstream');
  const projectsRoot = path.join(base, 'seed');
  await put(projectsRoot, 'bizhi-app/project.yaml', 'query_context_profile: ai_sales_assistant_zh\n');
  await put(projectsRoot, 'bizhi-app/knowledge-base/CONTEXT.md', 'synthetic context\n');
  await put(source, 'projects/.shared/query_context_profiles/ai_sales_assistant_zh/profile.md', 'profile\n');
  await put(source, 'libs/project_knowledge/common.py', 'CONTEXT_MD_CUSTOMER_SUPPORT_REASONING_PROFILE = {}\n');
  await put(source, 'libs/project_knowledge/adapters.py', `GROUNDING_PLANNER_PROFILE = {'request_timeout_seconds': 8, 'max_attempts': 1, 'max_output_tokens': 512}
class OpenAICompatibleLLM:
    model_name = 'fixture-model'
    def _request_stream(self, path, payload, **kwargs):
        yield {'id': 'planner-fixture', 'model': 'planner-model', 'delta': 'synthetic private text'}
    def _request(self, method, path, payload=None, **kwargs):
        return {'id': 'provider-fixture', 'model': 'fixture-response-model', 'answer': 'synthetic'}
def get_llm_for_mode(mode, **kwargs):
    return OpenAICompatibleLLM()
`);
  await put(source, 'libs/project_knowledge/project_context_workspace.py', `from pathlib import Path
from types import SimpleNamespace
import json

def publish_project_context_workspace(project_id, runtime_root, projects_root):
    runtime_root.mkdir()
    (runtime_root / 'manifest.json').write_text(json.dumps({'projectId': project_id}))
    return SimpleNamespace(project_id=project_id, manifest_sha256='fixture-sha', workspace_dir=runtime_root)
class ProjectContextSnapshotRegistry:
    @classmethod
    def load(cls, root, projects):
        assert (root / 'manifest.json').exists()
        return projects
`);
  await put(source, 'apps/query-api/server.py', `import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from libs.project_knowledge import adapters
class QueryServiceRuntime:
    def __init__(self, default_product_slug, projects_root, **kwargs):
        self.project = default_product_slug
        self.projects_root = projects_root
    def build_health_payload(self):
        return {'available_project_slugs': [self.project], 'preloaded_project_slugs': [self.project],
                'query_context_snapshot_project_slugs': self.context_snapshot_registry}
    def close(self): pass

def parse_json_body(handler):
    return json.loads(handler.rfile.read(int(handler.headers['Content-Length'])))

def make_handler(runtime, **kwargs):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def _write_json(self, payload, status=200):
            body = json.dumps({'code': 0 if status == 200 else 1, 'data': payload}).encode()
            self.send_response(status)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self): self._write_json(runtime.build_health_payload())
        def do_POST(self):
            try:
                request = parse_json_body(self)
                time.sleep(request.get('delay_seconds', 0))
                llm = adapters.get_llm_for_mode(request.get('llm_mode'))
                result = llm._request('POST', '/chat/completions', {'request': request})
                self._write_json(result)
            except ValueError: self._write_json({'error': 'scope'}, 400)
    return Handler

def serve(runtime, host, port, **kwargs):
    server = ThreadingHTTPServer((host, port), make_handler(runtime))
    try: server.serve_forever(poll_interval=0.05)
    finally:
        server.server_close()
        runtime.close()
    return 0
`);
  const config = { source, projectsRoot, projectId: 'bizhi-app', port: 0 };
  const configPath = path.join(base, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  return { base, source, config, configPath, run: path.join(base, 'run') };
}
function invoke(args, options = {}) {
  return spawnSync(python, [script, ...args], { cwd: repo, env, encoding: 'utf8', timeout: 5000, ...options });
}
async function start(f, extra = []) {
  const child = spawn(python, [script, 'serve', '--config', f.configPath, '--run-dir', f.run, ...extra], { cwd: repo, env });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const exited = once(child, 'exit');
  for (let i = 0; i < 150; i++) {
    try {
      const ready = JSON.parse(await readFile(path.join(f.run, 'ready.json'), 'utf8'));
      return { child, ready, exited, output: () => output };
    } catch {}
    if (child.exitCode !== null) throw new Error(`service exited: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  child.kill('SIGTERM');
  throw new Error(`readiness timeout: ${output}`);
}
async function stop(service) {
  service.child.kill('SIGTERM');
  const result = await Promise.race([service.exited, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('shutdown timeout')), 4000); timer.unref();
  })]);
  assert.deepEqual(result, [0, null]);
}

test('automatic actual port, exact identity/context, default hold zero, audits, graceful cleanup', async () => {
  const f = await fixture();
  const service = await start(f);
  try {
    const { ready } = service;
    assert.ok(ready.port > 0);
    assert.equal(ready.pid, service.child.pid);
    assert.equal(ready.testResponseHoldMs, 0);
    assert.equal(invoke(['check', '--run-dir', f.run]).status, 0);
    const response = await fetch(`${ready.baseUrl}/api/query`, { method: 'POST', body: JSON.stringify({
      project_slug: 'bizhi-app', llm_mode: 'http', request_id: 'public-fixture', question: 'synthetic',
    }) });
    assert.equal(response.status, 200);
    const query = JSON.parse((await readFile(path.join(f.run, 'query-wire-audit.jsonl'), 'utf8')).trim());
    const provider = JSON.parse((await readFile(path.join(f.run, 'provider-wire-audit.jsonl'), 'utf8')).trim());
    assert.equal(query.requestId, provider.requestId);
    assert.equal(query.publicRequestId, 'public-fixture');
    assert.equal(provider.responseId, 'provider-fixture');
    assert.equal(provider.requestedModel, 'fixture-model');
    assert.equal(provider.responseModel, 'fixture-response-model');
    assert.equal(query.testResponseHoldMs, 0);
    for (const body of [{ project_slug: 'other' }, { project_slug: 'bizhi-app', llm_mode: 'mock' }, { project_slug: 'bizhi-app', delivery_mode: 'direct_reply' },
      { project_slug: 'bizhi-app', answer_strategy: 'context_codex_cli' }, { project_slug: 'bizhi-app', context_answer_mode: 'codex_cli' }]) {
      assert.equal((await fetch(`${ready.baseUrl}/api/query`, { method: 'POST', body: JSON.stringify(body) })).status, 400);
    }
    const wrong = { ...ready, instanceId: 'other-service' };
    await writeFile(path.join(f.run, 'ready.json'), JSON.stringify(wrong));
    assert.equal(invoke(['check', '--run-dir', f.run]).status, 1);
    await writeFile(path.join(f.run, 'ready.json'), JSON.stringify({ ...ready, projectId: 'other' }));
    assert.equal(invoke(['check', '--run-dir', f.run]).status, 1);
    for (const file of await readdir(f.run)) {
      if (/\.(json|jsonl)$/.test(file)) assert.ok(!(await readFile(path.join(f.run, file), 'utf8')).includes(secret));
    }
    assert.ok(!service.output().includes(secret));
  } finally { await stop(service); }
  const cleanup = JSON.parse(await readFile(path.join(f.run, 'cleanup.json'), 'utf8'));
  assert.equal(cleanup.portReleased, true);
  assert.equal(cleanup.pid, service.child.pid);
  assert.equal(await readFile(path.join(f.config.projectsRoot, 'bizhi-app/project.yaml'), 'utf8'), 'query_context_profile: ai_sales_assistant_zh\n');
});

test('bad config/path, missing auth, reused run directory fail without readiness', async () => {
  const f = await fixture();
  for (const change of [{ port: -1 }, { port: true }, { projectId: '../escape' }, { source: '/missing-input' }, { apiKey: secret }, { plannerTimeoutSeconds: true }, { plannerTimeoutSeconds: 0 }, { plannerTimeoutSeconds: 21 }]) {
    await writeFile(f.configPath, JSON.stringify({ ...f.config, ...change }));
    const result = invoke(['serve', '--config', f.configPath, '--run-dir', f.run]);
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes(secret));
  }
  await writeFile(f.configPath, JSON.stringify(f.config));
  assert.equal(invoke(['serve', '--config', f.configPath, '--run-dir', path.join(repo, 'forbidden-output')]).status, 1);
  const missing = { ...env }; delete missing.QUERY_API_HTTP_LLM_API_KEY;
  assert.equal(invoke(['serve', '--config', f.configPath, '--run-dir', f.run], { env: missing }).status, 1);
  await mkdir(f.run);
  await writeFile(path.join(f.run, 'sentinel'), 'owned elsewhere');
  assert.equal(invoke(['serve', '--config', f.configPath, '--run-dir', f.run]).status, 1);
  assert.equal(await readFile(path.join(f.run, 'sentinel'), 'utf8'), 'owned elsewhere');
});

test('explicit occupied port fails and preserves external listener', async () => {
  const f = await fixture();
  const listener = createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  try {
    await writeFile(f.configPath, JSON.stringify({ ...f.config, port: listener.address().port }));
    const result = invoke(['serve', '--config', f.configPath, '--run-dir', f.run]);
    assert.equal(result.status, 1);
    assert.ok(listener.listening);
    assert.ok(!(await readdir(f.run)).includes('ready.json'));
  } finally { await new Promise(resolve => listener.close(resolve)); }
});

test('explicit hold sets minimum response latency without delaying an already slow query', async () => {
  const f = await fixture();
  const service = await start(f, ['--test-response-hold-ms', '150']);
  try {
    assert.equal(service.ready.testResponseHoldMs, 150);
    const started = performance.now();
    await fetch(`${service.ready.baseUrl}/api/query`, { method: 'POST', body: JSON.stringify({ project_slug: 'bizhi-app' }) });
    assert.ok(performance.now() - started >= 140);
    await fetch(`${service.ready.baseUrl}/api/query`, { method: 'POST', body: JSON.stringify({ project_slug: 'bizhi-app', delay_seconds: 0.2 }) });
    const entries = (await readFile(path.join(f.run, 'query-wire-audit.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(entries[0].appliedResponseHoldMs > 0);
    assert.equal(entries[1].appliedResponseHoldMs, 0);
  } finally { await stop(service); }
});

test('an explicit local planner timeout preserves source profile and does not add response hold', async () => {
  const f = await fixture();
  await writeFile(f.configPath, JSON.stringify({...f.config,plannerTimeoutSeconds:16}));
  const service = await start(f);
  try {
    assert.equal(service.ready.plannerTimeoutSeconds,16);
    assert.equal(service.ready.testResponseHoldMs,0);
    assert.match(await readFile(path.join(f.source,'libs/project_knowledge/adapters.py'),'utf8'),/request_timeout_seconds': 8/);
  } finally { await stop(service); }
});

test('snapshot scope is required before readiness can be written', async () => {
  const f = await fixture();
  const serverPath = path.join(f.source, 'apps/query-api/server.py');
  const source = await readFile(serverPath, 'utf8');
  await writeFile(serverPath, source.replace("'query_context_snapshot_project_slugs': self.context_snapshot_registry", "'query_context_snapshot_project_slugs': []"));
  const result = invoke(['serve', '--config', f.configPath, '--run-dir', f.run]);
  assert.equal(result.status, 1);
  assert.ok(!(await readdir(f.run)).includes('ready.json'));
});


test('missing dependency diagnostics expose only sanitized import names', async () => {
  const f = await fixture();
  const serverPath = path.join(f.source, 'apps/query-api/server.py');
  await writeFile(serverPath, "raise ModuleNotFoundError('sensitive exception body', name='yaml')\n");
  const result = invoke(['serve', '--config', f.configPath, '--run-dir', f.run]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing module yaml/);
  assert.match(result.stderr, /config\.python/);
  assert.ok(!result.stderr.includes('PYTHON_BIN'));
  assert.ok(!result.stderr.includes('sensitive exception body'));
  await writeFile(serverPath, "raise ModuleNotFoundError('sensitive exception body', name='unsafe token: private')\n");
  const second = invoke(['serve', '--config', f.configPath, '--run-dir', path.join(f.base, 'second-run')]);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /missing module unknown/);
  assert.ok(!second.stderr.includes('unsafe token'));
  assert.ok(!second.stderr.includes('sensitive exception body'));
});


test('configured relative interpreter re-execs once, preserving PID and arguments', async () => {
  const f = await fixture();
  const actualPython = spawnSync(python, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim();
  const interpreter = path.join(f.base, 'mock-python');
  const log = path.join(f.base, 'interpreter-log.jsonl');
  await writeFile(interpreter, `#!${actualPython}
import json,os,sys,runpy
with open(${JSON.stringify(log)}, 'a') as output:
    output.write(json.dumps({'pid':os.getpid(),'args':sys.argv[1:]})+'\\n')
sys.executable = ${JSON.stringify(interpreter)}
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
`);
  await chmod(interpreter, 0o700);
  await writeFile(f.configPath, JSON.stringify({ ...f.config, python: './mock-python' }));
  const service = await start(f, ['--test-response-hold-ms', '7']);
  try {
    const entries = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].pid, service.child.pid);
    assert.equal(service.ready.pid, service.child.pid);
    assert.equal(service.ready.testResponseHoldMs, 7);
    assert.ok(entries[0].args.includes(f.configPath));
    assert.ok(entries[0].args.includes(f.run));
    // check remains stdlib-only and never consults the configured interpreter.
    assert.equal(invoke(['check', '--run-dir', f.run]).status, 0);
    assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
  } finally { await stop(service); }
});

test('configured interpreter must be an explicit executable file before run ownership', async () => {
  const f = await fixture();
  const nonExecutable = path.join(f.base, 'not-executable');
  await writeFile(nonExecutable, 'data');
  for (const selected of ['', null, 12, './missing-python', nonExecutable]) {
    await writeFile(f.configPath, JSON.stringify({ ...f.config, python: selected }));
    assert.equal(invoke(['serve', '--config', f.configPath, '--run-dir', f.run]).status, 1);
    assert.ok(!(await readdir(f.base)).includes('run'));
  }
});

test('auto planner stream and synthesis have correlated complete provider coverage', async () => {
  const f = await fixture();
  const serverPath = path.join(f.source, 'apps/query-api/server.py');
  const source = await readFile(serverPath, 'utf8');
  await writeFile(serverPath, source.replace(
    "                result = llm._request('POST', '/chat/completions', {'request': request})",
    `                list(llm._request_stream('/chat/completions', {'model': 'planner-requested', 'secret': ${JSON.stringify(secret)}}))
                result = llm._request('POST', '/chat/completions', {'request': request})
                result.update(model_call_counts={'total_provider_requests': 2},
                              selected_answer_strategy='auto', strategy_reason_code='grounding_plan',
                              grounding_planner_status='completed')`));
  const service = await start(f);
  try {
    assert.equal((await fetch(`${service.ready.baseUrl}/api/query`, { method: 'POST',
      body: JSON.stringify({ request_id: 'stream-public', question: secret }) })).status, 200);
    const providerText = await readFile(path.join(f.run, 'provider-wire-audit.jsonl'), 'utf8');
    const queryText = await readFile(path.join(f.run, 'query-wire-audit.jsonl'), 'utf8');
    const entries = providerText.trim().split('\n').map(JSON.parse);
    const query = JSON.parse(queryText.trim());
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map(e => e.transport), ['stream', 'non_stream']);
    for (const entry of entries) {
      assert.equal(entry.requestId, query.requestId);
      assert.equal(entry.publicRequestId, 'stream-public');
      assert.equal(entry.metadataStatus, 'observed');
    }
    assert.equal(entries[0].requestedModel, 'planner-requested');
    assert.equal(entries[0].responseModel, 'planner-model');
    assert.equal(entries[0].responseId, 'planner-fixture');
    assert.equal(entries[0].eventCount, 1);
    assert.equal(entries[0].consumptionComplete, true);
    assert.deepEqual(query.providerCoverage, { status: 'matched', declaredProviderRequests: 2, observedProviderRequests: 2 });
    assert.equal(query.strategyReason, 'grounding_plan');
    assert.equal(query.plannerStatus, 'completed');
    assert.ok(!providerText.includes(secret) && !queryText.includes(secret));
    assert.ok(!providerText.includes('synthetic private text'));
  } finally { await stop(service); }
});

for (const scenario of ['complete', 'error', 'zero', 'missing-metadata', 'early-close', 'close-error', 'throw', 'unstarted']) {
  test(`stream audit preserves generator semantics: ${scenario}`, () => {
    const result = spawnSync(python, ['-B', '-c', `
import hashlib, importlib.util, json, threading
spec = importlib.util.spec_from_file_location('local_query', ${JSON.stringify(script)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
scenario = ${JSON.stringify(scenario)}
secret = ${JSON.stringify(secret)}
events = [{'id': 'chunk-id', 'model': 'chunk-model', 'choices': [{'delta': {'content': secret}}]},
          {'type': 'response.completed', 'response': {'id': 'final-id', 'model': 'final-model', 'output': secret}}]
if scenario == 'missing-metadata':
    events = [{'delta': secret}, {'delta': secret}]
failure = RuntimeError(secret)
closed = []
sent = []
class LLM:
    model_name = 'configured-model'
    def _request(self, *args, **kwargs):
        return {'id': 'id', 'model': 'model'}
    def _request_stream(self, path, payload, *, timeout_seconds=None):
        assert path == '/responses' and payload['model'] == 'requested-model' and timeout_seconds == 17
        try:
            if scenario == 'zero': return
            try:
                sent.append((yield events[0]))
            except LookupError as error:
                assert error is injected
                yield events[1]
                return 'recovered'
            if scenario == 'error': raise failure
            yield events[1]
            return 'original-return'
        finally:
            closed.append(True)
            if scenario == 'close-error': raise failure
context = threading.local()
context.request_id = 'internal-id'
context.public_request_id = 'public-id'
context.provider_entries = []
audits = []
module.install_provider_audit(LLM, context, lambda name, entry: audits.append((name, entry)))
stream = LLM()._request_stream('/responses', {'model': 'requested-model', 'input': secret}, timeout_seconds=17)
assert not audits and not closed
if scenario == 'unstarted':
    stream.close()
    assert not audits and not closed
else:
    seen = []
    if scenario == 'zero':
        assert list(stream) == []
    else:
        assert next(stream) is events[0]
        seen.append(events[0])
        if scenario in ('early-close', 'close-error'):
            try:
                stream.close()
                assert scenario == 'early-close'
            except RuntimeError as error:
                assert scenario == 'close-error' and error is failure
        elif scenario == 'error':
            try:
                next(stream)
                assert False
            except RuntimeError as error:
                assert error is failure
        else:
            if scenario == 'throw':
                injected = LookupError(secret)
                event = stream.throw(injected)
            else:
                event = stream.send('consumer-value')
                assert sent == ['consumer-value']
            assert event is events[1]
            seen.append(event)
            try:
                next(stream)
                assert False
            except StopIteration as end:
                assert end.value == ('recovered' if scenario == 'throw' else 'original-return')
    assert closed == [True]
    assert len(audits) == 1
    name, entry = audits[0]
    assert name == 'provider-wire-audit.jsonl'
    assert context.provider_entries == [entry]
    assert entry['requestId'] == 'internal-id' and entry['publicRequestId'] == 'public-id'
    assert entry['requestedModel'] == 'requested-model'
    assert entry['eventCount'] == len(seen)
    expected = hashlib.sha256(b''.join(bytes.fromhex(module.digest(e)) for e in seen)).hexdigest()
    assert entry['eventsSha256'] == expected
    assert entry['status'] == ('cancelled' if scenario == 'early-close' else 'error' if scenario in ('error', 'close-error') else 'ok')
    assert entry['consumptionComplete'] == (scenario in ('complete', 'zero', 'missing-metadata', 'throw'))
    assert entry['metadataStatus'] == ('unknown' if scenario in ('zero', 'missing-metadata') else 'observed')
    assert entry['responseId'] == (None if scenario == 'missing-metadata' else 'final-id' if len(seen) == 2 else 'chunk-id' if seen else None)
    assert entry['ended'] >= entry['started']
    assert secret not in json.dumps(audits)
    assert 'choices' not in json.dumps(audits) and 'output' not in json.dumps(audits)
    assert module.provider_coverage({}, [entry])['status'] == 'unknown'
    assert module.provider_coverage({'model_call_counts': {'total_provider_requests': True}}, [entry])['status'] == 'unknown'
    assert module.provider_coverage({'model_call_counts': {'total_provider_requests': 2}}, [entry])['status'] == 'mismatch'
    coverage = module.provider_coverage({'model_call_counts': {'total_provider_requests': 1}}, [entry])
    assert coverage['status'] == ('unknown' if scenario in ('zero', 'missing-metadata') else 'incomplete' if scenario in ('error', 'early-close', 'close-error') else 'matched')
print('synthetic assertions passed')
`], { cwd: repo, env, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'synthetic assertions passed');
    assert.ok(!result.stderr.includes(secret));
  });
}

test('process-only tier compatibility preserves payload, stream and failure semantics without retry', () => {
  const result = spawnSync(python, ['-B', '-c', `
import importlib.util, threading
spec = importlib.util.spec_from_file_location('local_query', ${JSON.stringify(script)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
seen = []
failure = RuntimeError('service_tier standard ${secret}')
class LLM:
    model_name = 'same-model'
    last_provider_http_status = 400
    def _request(self, method, path, payload=None, **kwargs):
        seen.append((payload, kwargs))
        if path == '/fail': raise failure
        return {'id': 'actual', 'model': payload['model']}
    def _request_stream(self, path, payload, **kwargs):
        seen.append((payload, kwargs))
        yield {'id': 'stream', 'model': payload['model']}
context = threading.local()
context.provider_entries = []
audits = []
module.install_provider_audit(LLM, context, lambda name, entry: audits.append(entry))
module.install_standard_tier_compat(LLM)
llm = LLM()
for tier in ['standard', 'default', 'priority', 'flex', 'auto', None]:
    original = {'model': 'same-model', 'service_tier': tier, 'response_format': {'strict': True}}
    llm._request('POST', '/ok', original, timeout_seconds=8)
    assert list(llm._request_stream('/ok', original, timeout_seconds=8))[0]['model'] == 'same-model'
    assert original['service_tier'] == tier
    expected = {**original, 'service_tier': 'default'} if tier == 'standard' else original
    assert all(payload == expected and options == {'timeout_seconds': 8} for payload, options in seen[-2:])
    assert audits[-1]['requestSha256'] == module.digest(expected)
assert len(seen) == 12
try:
    llm._request('POST', '/fail', {'model': 'same-model'})
    assert False
except RuntimeError as error:
    assert error is failure
assert len(seen) == 13
assert audits[-1]['httpStatus'] == 400 and audits[-1]['serviceTierRejected']
assert ${JSON.stringify(secret)} not in str(audits)
print('compatibility assertions passed')
`], { cwd: repo, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'compatibility assertions passed');
});
