import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workflow } from '../../examples/codex-workflow-companion/core/engine.mjs';
import { uiState } from '../../examples/codex-workflow-companion/core/ui-state.mjs';

test('long valid progress history stays within TrustedWindow bounds without losing current controls', () => {
  let disk;
  const w = new Workflow({ load: () => disk, save: s => { disk = structuredClone(s); } });
  const p = w.start();
  w.dispatchResult({ attemptId: p.attemptId, status: 'prepared' });
  const identity = { workflowId: p.workflowId, taskId: p.taskId, taskVersion: p.taskVersion,
    attemptId: p.attemptId, nonce: / claim=([^\n]+)/.exec(p.prompt)[1] };
  const hook = { protocol: 'od.codex-workflow.v1', kind: 'prompt', workflowId: p.workflowId,
    taskId: p.taskId, attemptId: p.attemptId, nonce: identity.nonce, sessionId: 'fixture-session', turnId: 'fixture-turn' };
  w.hook(hook, 'fixture-prompt');
  w.claim({ ...identity, eventId: 'fixture-claim' });
  for (let i = 0; i < 40; i++) w.progress({ ...identity, eventId: 'fixture-progress-' + i, percent: i, message: '进'.repeat(500) });
  w.submit({ ...identity, eventId: 'fixture-submit', result: '结'.repeat(2000), evidence: '证'.repeat(2000) });
  w.error({ ...identity, eventId: 'fixture-error', code: 'SYNTHETIC_ERROR' });
  const state = w.publicState(), view = uiState(state);
  assert.ok(Buffer.byteLength(JSON.stringify({ type: 'state', state })) > 65_536, 'reproduces the original bridge overflow');
  const wire = { type: 'state', state: view };
  assert.ok(Buffer.byteLength(JSON.stringify(wire)) < 60_000);
  let values = 0, maxDepth = 0;
  function walk(value, depth = 0) {
    values++; maxDepth = Math.max(depth, maxDepth);
    if (value && typeof value === 'object') for (const child of Object.values(value)) walk(child, depth + 1);
  }
  walk(wire);
  assert.ok(values <= 4096 && maxDepth <= 32);
  assert.equal(view.history.length, 12);
  assert.deepEqual(view.active, state.active);
  assert.deepEqual(view.tasks, state.tasks);
  assert.deepEqual(view.pending, state.pending, 'the exact assigned prompt must never be truncated');
  assert.equal(view.paused, true);
  assert.equal(view.active.error, 'SYNTHETIC_ERROR');
  assert.equal(disk.history.filter(e => e.type === 'MCP_PROGRESS').length, 40, 'projection does not prune the durable audit');
  assert.ok(state.history.some(e => e.message?.length === 500));
});

test('oversize UI state fails explicitly before bridge delivery', () => {
  assert.throws(() => uiState({ history: [], invalidFixture: '进'.repeat(30_000) }), /UI_STATE_TOO_LARGE/);
});
