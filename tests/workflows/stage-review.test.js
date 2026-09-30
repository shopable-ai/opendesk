'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { valueLineage, renderReview, renderWorkflowReview } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');
const { representationFixture } = require('./tools/artifact-representation-fixture.js');
const { fixture: workflowFixture } = require('./tools/stage-review-fixture.js');

function entries(origin, mapping) {
  return {
    dossier: { parsed: { runtimeValues: [{ name: 'result', origin, consumers: ['final output'] }] } },
    distilled: { parsed: { steps: [{ stepId: 'read-step', sourceActionRefs: ['read-final'] }] } },
    procedure: { parsed: { businessSteps: [{ stepId: 'read-business', sourceStepRefs: ['read-step'] }] } },
    candidate: { parsed: { sourceMapping: [mapping] } },
  };
}

test('review projects structured origin and explicit code region without numeric IDs', () => {
  const documents = entries({ actionRef: 'read-final' }, {
    businessStepRefs: ['read-business'], line: 17, rule: 'read',
  });
  const before = JSON.stringify(documents);
  const [record] = valueLineage(documents);
  assert.equal(record.action, 'read-final');
  assert.deepEqual(record.distilled, ['read-step']);
  assert.deepEqual(record.business, ['read-business']);
  assert.deepEqual(record.code, ['line 17: read']);
  assert.equal(record.qualification, 'not-run');
  assert.equal(JSON.stringify(documents), before);
});

test('review does not invent missing origins or infer mappings from rule prose', () => {
  const [record] = valueLineage(entries({}, { line: 17, rule: 'read-business' }));
  assert.equal(record.action, 'missing');
  assert.deepEqual(record.distilled, []);
  assert.deepEqual(record.code, []);
  const [unmapped] = valueLineage(entries({ actionRef: 'read-final' }, {
    businessStepRefs: ['other-business'], line: 17, rule: 'read-business',
  }));
  assert.deepEqual(unmapped.code, []);
});

test('review retains function declarations alongside code regions', () => {
  const [record] = valueLineage(entries({ actionRef: 'read-final' }, {
    businessStepRefs: ['read-business'], function: 'readResult', line: 17, rule: 'read',
  }));
  assert.deepEqual(record.code, ['readResult', 'line 17: read']);
});

test('accepted alternate representations retain blocked business dataflow in review', t => {
  const fixture = representationFixture(t);
  const report = checkArtifactChain({ ...fixture.options, through: 'candidate' });
  assert.equal(report.verdict, 'pass', JSON.stringify(report.errors));
  assert.ok(report.valueLineage.length > 0);
  for (const record of report.valueLineage) {
    assert.notEqual(record.action, 'missing');
    assert.ok(record.code.some(location => location.startsWith('line ')));
  }
  assert.equal(report.businessDataflow.verdict, 'unknown');
  assert.equal(report.businessDataflow.releaseBlocked, true);
  assert.equal(report.liveQualificationGranted, false);
  const markdown = renderReview(report);
  assert.match(markdown, /候选函数／代码区域（声明）/);
  assert.match(markdown, /声明，不是真实运行证明/);
  assert.match(markdown, /business dataflow requires independent exact-byte consumer verification/);
  assert.doesNotMatch(markdown, /direct await\/spread source pattern/);
});

test('workflow human review renders all twelve stages from the machine review without rescoring', t => {
  const f = workflowFixture(t);
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  const markdown = renderWorkflowReview(report);
  for (let index = 1; index <= 12; index += 1) assert.match(markdown, new RegExp('## S' + index + '\\b'));
  assert.match(markdown, /首个无效边界[\s\S]*—/);
  assert.match(markdown, /S11[\s\S]*recipe-build/);
  assert.match(markdown, /S12[\s\S]*recipe-qualify/);
  assert.match(markdown, /高分不能覆盖 Hard Fail/);
});

test('workflow human review keeps score 100 visible while Hard Fail makes S7 fail and blocks downstream', t => {
  const f = workflowFixture(t);
  f.reviews[6].hardFails = ['runtime producer → consumer broken'];
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.equal(report.stages.S7.score, 100);
  assert.equal(report.stages.S7.verdict, 'fail');
  assert.equal(report.firstInvalidBoundary, 'S7');
  assert.equal(report.stages.S8.verdict, 'blocked');
  const markdown = renderWorkflowReview(report);
  assert.match(markdown, /首个无效边界[\s\S]*S7/);
  assert.match(markdown, /Failure Owner[\s\S]*S7 \/ trace-distill/);
  assert.match(markdown, /100 \/ 100/);
  assert.match(markdown, /runtime producer → consumer broken/);
  assert.match(markdown, /S8[\s\S]*blocked/);
});

test('workflow human review exposes missing S4 Actual Observation as the first invalid boundary', t => {
  const f = workflowFixture(t);
  f.reviews[3].evidence = [];
  const report = f.run('S4', 'S5');
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S4');
  const markdown = renderWorkflowReview(report);
  assert.match(markdown, /首个无效边界[\s\S]*S4/);
  assert.match(markdown, /EVIDENCE_SCOPE|MISSING_ACTUAL_ACTUALOBSERVATION|MISSING_EVIDENCE/);
  assert.match(markdown, /尚未执行；不能写成 PASS|等待真正 failure owner 修复/);
});

test('workflow human review exposes stale S12 Candidate binding instead of hiding it behind Qualification', t => {
  const f = workflowFixture(t);
  f.reviews[11].inputs = f.reviews[11].inputs.filter(ref => ref.kind !== 'CandidateSource');
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S12');
  assert.ok(report.errors.some(error => error.code === 'STALE_CANDIDATE'));
  const markdown = renderWorkflowReview(report);
  assert.match(markdown, /S12[\s\S]*blocked/);
  assert.match(markdown, /STALE_CANDIDATE/);
});
