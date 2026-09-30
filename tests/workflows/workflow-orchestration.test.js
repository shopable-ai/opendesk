'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const RUNNER = path.resolve(__dirname, '../../workflows/agent-to-recipe/scripts/workflow-runner.js');
const SPEC = path.resolve(__dirname, '../../workflows/agent-to-recipe/workflow.yaml');
const {
  loadWorkflowSpec,
  initialProgress,
  validateProgress,
  deriveResume,
  reconcileProgress
} = require(RUNNER);

test('workflow spec defines exactly S1-S12 with stable owners and no S13', () => {
  const spec = loadWorkflowSpec(SPEC);
  assert.equal(spec.stages.length, 12);
  assert.deepEqual(spec.stages.map(item => item.id), Array.from({ length: 12 }, (_, i) => 'S' + (i + 1)));
  assert.equal(spec.stages[0].owner, 'automation-plan');
  assert.equal(spec.stages[6].owner, 'trace-distill');
  assert.equal(spec.stages[10].owner, 'recipe-build');
  assert.equal(spec.stages[11].owner, 'recipe-qualify');
  assert.equal(spec.rules.noAdditionalLifecycleStage, true);
  assert.doesNotMatch(fs.readFileSync(SPEC, 'utf8'), /\"S13\"/);
});

test('progress is a compact current-state index rather than an execution history', () => {
  const spec = loadWorkflowSpec(SPEC);
  const progress = initialProgress('t', spec);
  validateProgress(progress, spec);
  assert.ok(Buffer.byteLength(JSON.stringify(progress)) < 2048);
  for (const forbidden of spec.rules.progressMustNotContain) {
    assert.equal(Object.prototype.hasOwnProperty.call(progress, forbidden), false);
  }
  assert.deepEqual(progress.next, { stage: 'S1', owner: 'automation-plan', mode: 'plan/create' });
});

test('checker first invalid boundary overrides stale progress and resumes at the real owner', () => {
  const spec = loadWorkflowSpec(SPEC);
  const stale = {
    ...initialProgress('t', spec),
    status: 'running',
    currentStage: 'S9',
    lastConfirmedStage: 'S8',
    next: { stage: 'S9', owner: 'procedure-synthesize', mode: 'normal' }
  };
  const report = {
    allowed: false,
    firstInvalidBoundary: 'S7',
    stages: Object.fromEntries(spec.stages.map(item => [item.id, {
      verdict: Number(item.id.slice(1)) <= 6 ? 'pass' : item.id === 'S7' ? 'fail' : 'blocked'
    }]))
  };
  const repaired = reconcileProgress(stale, report, spec);
  assert.equal(repaired.currentStage, 'S7');
  assert.equal(repaired.lastConfirmedStage, 'S6');
  assert.equal(repaired.firstInvalidBoundary, 'S7');
  assert.deepEqual(repaired.next, { stage: 'S7', owner: 'trace-distill', mode: 'targeted-repair' });
});

test('successful prefix advances only to the next unfinished stage', () => {
  const spec = loadWorkflowSpec(SPEC);
  const report = {
    allowed: true,
    firstInvalidBoundary: null,
    stages: Object.fromEntries(spec.stages.map(item => [item.id, {
      verdict: Number(item.id.slice(1)) <= 6 ? 'pass' : 'not-run'
    }]))
  };
  const next = deriveResume(report, spec);
  assert.equal(next.status, 'ready');
  assert.equal(next.currentStage, 'S7');
  assert.equal(next.lastConfirmedStage, 'S6');
  assert.deepEqual(next.next, { stage: 'S7', owner: 'trace-distill', mode: 'normal' });
});

test('S12 PASS and allowed result is the only workflow-qualified state', () => {
  const spec = loadWorkflowSpec(SPEC);
  const report = {
    allowed: true,
    firstInvalidBoundary: null,
    stages: Object.fromEntries(spec.stages.map(item => [item.id, { verdict: 'pass' }]))
  };
  const next = deriveResume(report, spec);
  assert.equal(next.status, 'qualified');
  assert.equal(next.currentStage, 'S12');
  assert.equal(next.lastConfirmedStage, 'S12');
  assert.equal(next.next, null);
});

test('progress rejects embedded history/evidence fields', () => {
  const spec = loadWorkflowSpec(SPEC);
  const progress = { ...initialProgress('t', spec), rawEvidence: [{ huge: true }] };
  assert.throws(() => validateProgress(progress, spec), /forbidden field: rawEvidence/);
});
