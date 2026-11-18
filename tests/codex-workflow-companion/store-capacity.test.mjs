import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, MAX_STATE_BYTES } from '../../examples/codex-workflow-companion/core/store.mjs';
import { Workflow } from '../../examples/codex-workflow-companion/core/engine.mjs';

const evidence = fileURLToPath(new URL('../../.runtime/tests/codex-workflow-companion/mac-acceptance/store-capacity/', import.meta.url));
const capacity = MAX_STATE_BYTES;
const serialize = value => JSON.stringify(value, null, 2) + '\n';

function setup(t) {
  fs.mkdirSync(evidence, { recursive: true });
  const dir = fs.mkdtempSync(path.join(evidence, 'fixture-'));
  let store = new Store(dir);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return {
    get store() { return store; },
    restart() { store.close(); store = new Store(dir); return store.load(); },
  };
}

function stateWithBytes(bytes) {
  const state = { schemaVersion: 1, tasks: [], history: [], seen: {}, padding: '' };
  const remaining = bytes - Buffer.byteLength(serialize(state));
  state.padding = '中'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
  assert.equal(Buffer.byteLength(serialize(state)), bytes);
  return state;
}

test('UTF-8 states immediately below and at capacity survive a real store restart', t => {
  const fixture = setup(t);
  for (const bytes of [capacity - 1, capacity]) {
    const state = stateWithBytes(bytes);
    fixture.store.save(state);
    assert.equal(fs.statSync(fixture.store.file).size, bytes);
    assert.deepEqual(fixture.restart(), state);
  }
});

test('one byte over capacity is rejected before touching the previous safe file', t => {
  const fixture = setup(t);
  const safe = stateWithBytes(capacity);
  fixture.store.save(safe);
  const before = fs.readFileSync(fixture.store.file);
  const oversized = stateWithBytes(capacity + 1);
  assert.ok(serialize(oversized).length < capacity, 'character count would incorrectly accept this state');
  assert.throws(() => fixture.store.save(oversized), /STATE_CAPACITY_REACHED/);
  assert.deepEqual(fs.readFileSync(fixture.store.file), before);
  assert.deepEqual(fs.readdirSync(fixture.store.dir).sort(), ['owner.lock', 'state.json']);
  assert.deepEqual(fixture.restart(), safe);
});

test('load still refuses externally supplied files over the byte capacity', t => {
  const fixture = setup(t);
  fs.writeFileSync(fixture.store.file, serialize(stateWithBytes(capacity + 1)));
  assert.throws(() => fixture.restart(), /STATE_FILE_UNSAFE/);
});

test('long Chinese progress history reloads; capacity failure preserves committed history and dedup', t => {
  const fixture = setup(t);
  let workflow = new Workflow(fixture.store);
  const pending = workflow.start();
  workflow.dispatchResult({ attemptId: pending.attemptId, status: 'prepared' });
  const identity = { workflowId: pending.workflowId, taskId: pending.taskId,
    taskVersion: pending.taskVersion, attemptId: pending.attemptId, nonce: workflow.s.active.nonce };
  workflow.hook({ protocol: 'od.codex-workflow.v1', kind: 'prompt', workflowId: identity.workflowId,
    taskId: identity.taskId, attemptId: identity.attemptId, nonce: identity.nonce,
    sessionId: 'capacity-session', turnId: 'capacity-turn' }, 'capacity-prompt');
  workflow.claim({ ...identity, eventId: 'capacity-claim' });
  const progress = index => ({ ...identity, eventId: 'progress-' + index, percent: 50, message: '中'.repeat(500) });
  for (let index = 0; index < 200; index++) workflow.progress(progress(index));
  const longState = structuredClone(workflow.s);
  assert.equal(longState.history.filter(item => item.type === 'MCP_PROGRESS').length, 200);
  assert.deepEqual(fixture.restart(), longState);
  workflow = new Workflow(fixture.store);
  assert.equal(workflow.progress(progress(0)).duplicate, true);
  assert.throws(() => workflow.progress({ ...progress(0), message: 'changed' }), /EVENT_ID_CONFLICT/);

  let rejected = false;
  for (let index = 200; index < 313; index++) {
    const committed = structuredClone(workflow.s);
    const before = fs.readFileSync(fixture.store.file);
    try { workflow.progress(progress(index)); }
    catch (error) {
      assert.match(error.message, /STATE_CAPACITY_REACHED/);
      assert.deepEqual(fs.readFileSync(fixture.store.file), before);
      assert.equal(workflow.publicState().paused, true);
      assert.equal(workflow.publicState().storageError, 'STORAGE_UNAVAILABLE_RESTART_REQUIRED');
      assert.equal(workflow.pending(), null);
      assert.throws(() => workflow.resume(), /STORAGE_UNAVAILABLE_RESTART_REQUIRED/);
      assert.deepEqual(fixture.restart(), committed, 'all committed history and dedup fingerprints survive');
      const restarted = new Workflow(fixture.store);
      assert.equal(restarted.publicState().storageError, null);
      assert.deepEqual(restarted.s, committed);
      assert.equal(restarted.progress(progress(0)).duplicate, true);
      assert.throws(() => restarted.progress({ ...progress(0), message: 'changed' }), /EVENT_ID_CONFLICT/);
      rejected = true;
      break;
    }
  }
  assert.equal(rejected, true, 'the 313-event reproduction must fail safely before producing an unreadable file');
});
