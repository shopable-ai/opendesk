import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../../examples/codex-workflow-companion/core/store.mjs';
import { Workflow } from '../../examples/codex-workflow-companion/core/engine.mjs';

const evidence = fileURLToPath(new URL('../../.runtime/tests/codex-workflow-companion/mac-acceptance/reliability/', import.meta.url));

function setup(t) {
  fs.mkdirSync(evidence, { recursive: true });
  const dir = fs.mkdtempSync(path.join(evidence, 'fixture-'));
  const store = new Store(dir);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { store, workflow: new Workflow(store, { mode: 'native' }) };
}

function claimCurrent(w) {
  const p = w.pending();
  const nonce = / claim=([^\n]+)/.exec(p.prompt)[1];
  const identity = { workflowId: p.workflowId, taskId: p.taskId, taskVersion: p.taskVersion, attemptId: p.attemptId, nonce };
  const hook = { protocol: 'od.codex-workflow.v1', kind: 'prompt', workflowId: p.workflowId,
    taskId: p.taskId, attemptId: p.attemptId, nonce, sessionId: 'session-' + p.taskId, turnId: 'turn-' + p.taskId };
  w.hook(hook, 'prompt-' + p.taskId);
  w.claim({ ...identity, eventId: 'claim-' + p.taskId });
  return { identity, hook };
}

function finishCurrent(w, { identity, hook }) {
  w.submit({ ...identity, eventId: 'submit-' + identity.taskId, result: 'OK-' + identity.taskId, evidence: 'Synthetic component result' });
  const { nonce, ...stop } = hook;
  w.hook({ ...stop, kind: 'stop', stopHookActive: false }, 'stop-' + identity.taskId);
}

function beginB(w) {
  const a = w.start();
  w.dispatchResult({ attemptId: a.attemptId, status: 'prepared' });
  const bound = claimCurrent(w);
  finishCurrent(w, bound);
  const b = w.approve(a.attemptId, 'Synthetic A result independently reviewed');
  assert.equal(b.taskId, 'B');
  return b;
}

test('resume keeps an unknown dispatch paused until reconciliation', t => {
  const { workflow: w } = setup(t);
  const a = w.start();
  w.dispatchResult({ attemptId: a.attemptId, status: 'unknown' });
  assert.throws(() => w.resume(), /DISPATCH_RECONCILIATION_REQUIRED/);
  assert.equal(w.publicState().paused, true,
    'resume alone must not clear a pause caused by unknown delivery');
});

test('unknown B dispatch cannot release C without explicit reconciliation', t => {
  const { workflow: w } = setup(t);
  const b = beginB(w);
  w.dispatchResult({ attemptId: b.attemptId, status: 'unknown' });
  finishCurrent(w, claimCurrent(w));
  // Separate assertions ensure resume rejection cannot skip the approval check.
  assert.throws(() => w.resume(), /DISPATCH_RECONCILIATION_REQUIRED/);
  assert.throws(() => w.approve(b.attemptId, 'Reviewed synthetic result only'),
    /DISPATCH_RECONCILIATION_REQUIRED/);
  assert.equal(w.publicState().tasks.find(task => task.id === 'C').attempts, 0,
    'C must remain undispatched while B delivery is unknown');
});

test('not_sent reconciliation cannot retry a claimed failed B before observed Stop', t => {
  const { workflow: w } = setup(t);
  const b = beginB(w);
  w.dispatchResult({ attemptId: b.attemptId, status: 'unknown' });
  const { identity } = claimCurrent(w);
  w.error({ ...identity, eventId: 'error-B', code: 'SYNTHETIC_FAILURE' });
  assert.throws(() => w.retryFailed(b.attemptId, 'Synthetic operator inspection'), /RETRY_NOT_SAFE/);
  assert.throws(() => w.reconcile(b.attemptId, 'not_sent',
    'Synthetic operator says not sent despite bound claim'), /RECONCILE_CONFLICT_WITH_EXECUTION/);
  assert.equal(w.pending()?.attemptId, b.attemptId,
    'a contradictory not_sent report must not replace a known running attempt');
});

test('failed reservation persistence never exposes a dispatchable attempt', t => {
  const { store, workflow: w } = setup(t);
  const save = store.save.bind(store);
  // Fail at the durable side-effect boundary, preserving the prior committed
  // state just as ENOSPC before rename would. All other writes use the real Store.
  store.save = value => {
    if (value.active?.dispatch === 'reserved') throw Object.assign(Error('ENOSPC'), { code: 'ENOSPC' });
    save(value);
  };
  assert.throws(() => w.start(), /ENOSPC/);
  assert.equal(store.load().active, null, 'no reservation reached durable storage');
  assert.notEqual(w.pending()?.dispatch, 'reserved',
    'a later service request must not dispatch an uncommitted reservation');
});

function failAfterReservationSave(store) {
  const save = store.save.bind(store);
  store.save = value => {
    save(value); // Real rename and disk write precede the injected failure.
    if (value.active?.dispatch === 'reserved') throw Object.assign(Error('EIO_AFTER_RENAME'), { code: 'EIO' });
  };
}

test('post-rename save failure hides the on-disk reservation from dispatch', t => {
  const { store, workflow: w } = setup(t);
  failAfterReservationSave(store);
  assert.throws(() => w.start(), /EIO_AFTER_RENAME/);
  assert.equal(store.load().active.dispatch, 'reserved', 'rename actually saved the reservation');
  const state = w.publicState();
  assert.equal(state.storageError, 'STORAGE_UNAVAILABLE_RESTART_REQUIRED');
  assert.equal(state.paused, true);
  assert.equal(w.pending(), null, 'uncertain save outcome must never remain dispatchable');
});

test('poisoned owner rejects subsequent mutations without changing memory or disk', t => {
  const { store, workflow: w } = setup(t);
  const a = w.start();
  w.dispatchResult({ attemptId: a.attemptId, status: 'prepared' });
  const { identity, hook } = claimCurrent(w);
  store.save = () => { throw Object.assign(Error('ENOSPC'), { code: 'ENOSPC' }); };
  assert.throws(() => w.pause(), /ENOSPC/);
  const before = w.publicState(), disk = store.load();
  const mutations = {
    start: () => w.start(), pause: () => w.pause(), resume: () => w.resume(),
    dispatchResult: () => w.dispatchResult({ attemptId: a.attemptId, status: 'unknown' }),
    hook: () => w.hook({ ...hook, kind: 'stop', stopHookActive: false }, 'late-stop'),
    claim: () => w.claim({ ...identity, eventId: 'late-claim' }),
    progress: () => w.progress({ ...identity, eventId: 'late-progress', percent: 50, message: 'synthetic' }),
    submit: () => w.submit({ ...identity, eventId: 'late-submit', result: 'OK-A', evidence: 'synthetic' }),
    error: () => w.error({ ...identity, eventId: 'late-error', code: 'SYNTHETIC' }),
    approve: () => w.approve(a.attemptId, 'Synthetic review evidence'),
    reconcile: () => w.reconcile(a.attemptId, 'sent', 'Synthetic reconciliation evidence'),
    retryFailed: () => w.retryFailed(a.attemptId, 'Synthetic retry evidence'),
  };
  // One invariant across every mutation entry point: poison is irreversible for
  // this owner, including when the underlying storage becomes writable again.
  store.save = Store.prototype.save.bind(store);
  for (const [name, mutate] of Object.entries(mutations)) {
    assert.throws(mutate, /STORAGE_UNAVAILABLE_RESTART_REQUIRED/, name);
    assert.deepEqual(w.publicState(), before, name + ' changed poisoned state');
  }
  assert.equal(w.hostedEvent(a.attemptId, 'completed'), false);
  assert.deepEqual(w.publicState(), before);
  assert.deepEqual(store.load(), disk);
});

test('restart recovers unknown from the actual post-rename disk reservation', t => {
  const { store, workflow: w } = setup(t);
  failAfterReservationSave(store);
  assert.throws(() => w.start(), /EIO_AFTER_RENAME/);
  const disk = store.load();
  assert.equal(disk.active.dispatch, 'reserved');
  assert.equal(w.publicState().active, null, 'failed owner rolled back to its prior snapshot');
  store.close();
  const restartedStore = new Store(store.dir);
  try {
    const restarted = new Workflow(restartedStore);
    const state = restarted.publicState();
    assert.equal(state.workflowId, disk.workflowId);
    assert.equal(state.active.attemptId, disk.active.attemptId);
    assert.equal(state.active.dispatch, 'unknown');
    assert.equal(state.paused, true);
    assert.equal(state.storageError, null);
    assert.equal(state.tasks[0].attempts, 1, 'restart must not reserve a second attempt');
    assert.equal(restartedStore.load().active.dispatch, 'unknown');
  } finally { restartedStore.close(); }
});
