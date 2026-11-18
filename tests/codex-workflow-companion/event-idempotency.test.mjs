import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../../examples/codex-workflow-companion/core/store.mjs';
import { Workflow } from '../../examples/codex-workflow-companion/core/engine.mjs';

const root = fileURLToPath(new URL('../../.runtime/tests/codex-workflow-companion/event-idempotency/', import.meta.url));

for (const restart of [false, true]) {
  test(`lost progress/submit responses remain idempotent in review${restart ? ' after restart' : ''}`, t => {
    fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'fixture-'));
    let store = new Store(dir);
    t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
    let w = new Workflow(store);
    const pending = w.start();
    w.dispatchResult({ attemptId: pending.attemptId, status: 'prepared' });
    const identity = { workflowId: pending.workflowId, taskId: pending.taskId,
      taskVersion: pending.taskVersion, attemptId: pending.attemptId, nonce: w.s.active.nonce };
    w.hook({ protocol: 'od.codex-workflow.v1', kind: 'prompt', workflowId: identity.workflowId,
      taskId: identity.taskId, attemptId: identity.attemptId, nonce: identity.nonce,
      sessionId: 'synthetic-session', turnId: 'synthetic-turn' }, 'synthetic-prompt');
    w.claim({ ...identity, eventId: 'claim' });
    const progress = { ...identity, eventId: 'progress', percent: 67, message: 'Synthetic progress' };
    const submitted = { ...identity, eventId: 'submit', result: 'OK-A', evidence: 'Synthetic component fixture' };
    w.progress(progress);
    w.submit(submitted);
    if (restart) {
      store.close();
      store = new Store(dir);
      w = new Workflow(store);
    }
    const memory = structuredClone(w.s), disk = fs.readFileSync(store.file, 'utf8');
    // Model callers may retry the same event after losing its successful reply.
    // Neither replay may overwrite review state or create another attempt.
    assert.deepEqual(w.progress(progress), { duplicate: true });
    assert.deepEqual(w.submit(submitted), { duplicate: true });
    assert.throws(() => w.submit({ ...submitted, result: 'changed' }), /EVENT_ID_CONFLICT/);
    assert.throws(() => w.progress({ ...progress, percent: 99 }), /EVENT_ID_CONFLICT/);
    assert.throws(() => w.submit({ ...submitted, nonce: 'wrong' }), /IDENTITY_MISMATCH/);
    assert.throws(() => w.submit({ ...submitted, eventId: 'second-result' }), /NOT_CLAIMED_OR_ALREADY_SUBMITTED/);
    assert.throws(() => w.progress({ ...progress, eventId: 'late-progress' }), /NOT_CLAIMED_OR_ALREADY_SUBMITTED/);
    assert.deepEqual(w.s, memory, 'duplicate or rejected events cannot mutate the dedup ledger');
    assert.equal(fs.readFileSync(store.file, 'utf8'), disk, 'review state and audit stay unchanged on disk');
    assert.equal(w.s.tasks[1].attempts, 0);
  });
}
