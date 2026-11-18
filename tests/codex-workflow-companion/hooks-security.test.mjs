import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(root, '.runtime/tests/codex-workflow-companion/mac-acceptance');
const sender = path.join(root, 'examples/codex-workflow-companion/hooks/sender.py');
const uuid = '12345678-1234-1234-1234-123456789abc';
const prompt = `OD-CWF/v1 run=${uuid} task=A attempt=${uuid} claim=${uuid}\nPRIVATE_PROMPT`;
const valid = { hook_event_name: 'UserPromptSubmit', session_id: 'real-session', turn_id: 'real-turn', cwd: root, prompt };
const stop = { hook_event_name: 'Stop', session_id: valid.session_id, turn_id: valid.turn_id, cwd: root, stop_hook_active: false };

// Exercise main and real binding files, without network access or live services.
const harness = `
import contextlib, importlib.util, io, json, sys
spec = importlib.util.spec_from_file_location('sender', sys.argv[1])
sender = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sender)
sent = []
sender.transport.send_event = lambda payload, config, parts: sent.append(payload)
results = []
for raw in json.load(sys.stdin):
    sys.stdin = io.TextIOWrapper(io.BytesIO(json.dumps(raw).encode()))
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        sender.main()
    results.append(dict(stdout=out.getvalue(), stderr=err.getvalue()))
print(json.dumps(dict(sent=sent, results=results,
                     bindings=len(list(sender.RUN_DIR.glob('hook-binding-*.json'))))))
`;

function run(t, inputs) {
  fs.mkdirSync(evidence, { recursive: true });
  const dir = fs.mkdtempSync(path.join(evidence, 'hooks-security-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'endpoint.json'), JSON.stringify({
    protocol: 'od.codex-workflow.v1', url: 'http://127.0.0.1:1',
    headers: { Authorization: `Bearer ${'a'.repeat(64)}` },
  }), { mode: 0o600 });
  const child = spawnSync('python3', ['-B', '-c', harness, sender], {
    cwd: root, env: { ...process.env, OD_CWF_STATE_DIR: dir, PYTHONDONTWRITEBYTECODE: '1' },
    input: JSON.stringify(inputs), encoding: 'utf8', timeout: 5000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const result = JSON.parse(child.stdout);
  for (const item of result.results) assert.equal(item.stdout, '{"continue":true}\n');
  return result;
}

for (const [name, value, code] of [
  ['empty cwd', '', 'CWD_INVALID'],
  ['relative dot cwd', '.', 'CWD_INVALID'],
  ['relative child cwd', 'examples', 'CWD_INVALID'],
  ['external cwd', path.dirname(path.resolve(root)), 'CWD_OUTSIDE_ROOT'],
  ['sibling prefix cwd', path.resolve(root) + '-other', 'CWD_OUTSIDE_ROOT'],
  ['traversal cwd', path.join(root, '..'), 'CWD_OUTSIDE_ROOT'],
  ['missing cwd', undefined, 'CWD_INVALID'],
  ['wrong cwd type', 42, 'CWD_INVALID'],
]) {
  for (const event of [valid, stop]) test(`${event.hook_event_name} rejects ${name}`, t => {
    const result = run(t, [{ ...event, cwd: value }]);
    assert.deepEqual(result.sent, []);
    assert.equal(result.bindings, 0);
    assert.equal(result.results[0].stderr, `OD_CWF_HOOK_REJECT=${code}\n`);
  });
}

for (const field of ['session_id', 'turn_id']) {
  for (const value of [undefined, '', 42, 'x'.repeat(201)]) {
    for (const event of [valid, stop]) test(`${event.hook_event_name} rejects ${field} ${typeof value}/${String(value).length}`, t => {
      const result = run(t, [{ ...event, [field]: value, sessionId: 'no-fallback', turnId: 'no-fallback' }]);
      assert.deepEqual(result.sent, []);
      assert.equal(result.bindings, 0);
      assert.equal(result.results[0].stderr, `OD_CWF_HOOK_REJECT=${field === 'session_id' ? 'SESSION_ID_INVALID' : 'TURN_ID_INVALID'}\n`);
    });
  }
}

for (const value of [undefined, null, 0, 'false']) test(`Stop rejects non-boolean flag ${String(value)}`, t => {
  const result = run(t, [valid, { ...stop, stop_hook_active: value }]);
  assert.equal(result.sent.length, 1);
  assert.equal(result.results[1].stderr, 'OD_CWF_HOOK_REJECT=STOP_HOOK_ACTIVE_INVALID\n');
});

for (const value of [undefined, null, 42]) test(`prompt rejects missing/wrong type ${String(value)}`, t => {
  const result = run(t, [{ ...valid, prompt: value }]);
  assert.deepEqual(result.sent, []);
  assert.equal(result.bindings, 0);
  assert.equal(result.results[0].stderr, 'OD_CWF_HOOK_REJECT=PROMPT_INVALID\n');
});

test('absolute repository paths bind exact identity and only literal false sends Stop', t => {
  const result = run(t, [
    { ...valid, cwd: path.join(root, 'examples') },
    { ...stop, stop_hook_active: true },
    { ...stop, turn_id: 'other-turn' },
    { ...stop, session_id: 'other-session' },
    stop,
  ]);
  assert.deepEqual(result.sent, [
    { protocol: 'od.codex-workflow.v1', kind: 'prompt', workflowId: uuid, taskId: 'A', attemptId: uuid,
      nonce: uuid, sessionId: valid.session_id, turnId: valid.turn_id },
    { protocol: 'od.codex-workflow.v1', kind: 'stop', workflowId: uuid, taskId: 'A', attemptId: uuid,
      sessionId: valid.session_id, turnId: valid.turn_id, stopHookActive: false },
  ]);
  assert.equal(result.bindings, 1);
  assert.ok(result.results.every(item => item.stderr === ''));
});

test('unrelated events and unmarked prompts remain silent advisory no-ops', t => {
  const result = run(t, [null, {}, { hook_event_name: 'Other' }, { ...valid, prompt: 'ordinary prompt' }]);
  assert.deepEqual(result.sent, []);
  assert.equal(result.bindings, 0);
  assert.ok(result.results.every(item => item.stderr === ''));
});
