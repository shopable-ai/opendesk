'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { valueLineage, renderReview, renderWorkflowReview, renderWorkflowStage, renderWorkflowBundle, workflowPresentation } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const { createHash } = require('node:crypto');
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
  const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');
  const { representationFixture } = require('./tools/artifact-representation-fixture.js');
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

test('workflow human review renders twelve navigation entries and separate details without rescoring', t => {
  const f = workflowFixture(t);
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  const before = JSON.stringify(report);
  const bundle = renderWorkflowBundle(report);
  assert.equal(Object.keys(bundle.stages).length, 12);
  assert.doesNotMatch(bundle.index, /^## S[0-9]/m);
  for (let index = 1; index <= 12; index += 1) assert.match(bundle.index,
    new RegExp('stage-review/S' + String(index).padStart(2, '0') + '\\.md'));
  assert.match(bundle.stages.S11, /高分不能覆盖 Hard Fail/);
  assert.equal(JSON.stringify(report), before);
});

test('workflow human review keeps score 100 in the S7 appendix without guessing the owner', t => {
  const f = workflowFixture(t);
  f.reviews[6].hardFails = ['runtime producer → consumer broken'];
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.equal(report.stages.S7.score, 100);
  assert.equal(report.firstInvalidBoundary, 'S7');
  assert.equal(report.stages.S8.verdict, 'blocked');
  assert.equal(report.failureOwner.status, 'UNKNOWN');
  const bundle = renderWorkflowBundle(report);
  assert.match(bundle.index, /首个不能继续信任的边界[\s\S]*S7/);
  assert.match(bundle.index, /Failure Owner: UNKNOWN/);
  assert.doesNotMatch(bundle.index, /100 \/ 100/);
  assert.match(bundle.stages.S07, /100 \/ 100/);
  assert.match(bundle.stages.S07, /runtime producer → consumer broken/);
});

test('workflow human review exposes missing S4 Actual Observation without empty future pages', t => {
  const f = workflowFixture(t);
  f.reviews[3].evidence = [];
  const report = f.run('S4', 'S5');
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S4');
  const bundle = renderWorkflowBundle(report);
  assert.match(bundle.stages.S04, /EVIDENCE&#95;SCOPE|MISSING&#95;ACTUAL&#95;ACTUALOBSERVATION|MISSING&#95;EVIDENCE/);
  assert.ok(!bundle.stages.S05);
});

test('workflow human review exposes stale S12 Candidate binding instead of hiding it behind Qualification', t => {
  const f = workflowFixture(t);
  f.reviews[11].inputs = f.reviews[11].inputs.filter(ref => ref.kind !== 'CandidateSource');
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S12');
  assert.ok(report.errors.some(error => error.code === 'STALE_CANDIDATE'));
  assert.match(renderWorkflowStage(report, 'S12'), /STALE&#95;CANDIDATE/);
});

test('a passed prefix remains incomplete and does not fill unreviewed stages with empty checks', t => {
  const f = workflowFixture(t);
  const report = f.run('S2', 'S3');
  const before = JSON.stringify(report);
  assert.equal(report.allowed, true);
  const bundle = renderWorkflowBundle(report);
  assert.match(bundle.index, /本报告不单独证明完成/);
  assert.match(bundle.index, /PASS（仅本次范围）/);
  assert.match(bundle.index, /不执行桌面或 Candidate/);
  assert.deepEqual(Object.keys(bundle.stages), ['S01', 'S02']);
  assert.equal(JSON.stringify(report), before);
});

test('business excerpts and links are taken from the exact retained output rather than latest files', () => {
  const bytes = Buffer.from(JSON.stringify({ goal: '保留本次实际读值', inputs: { runtimeDerived: [
    { name: 'firstResult', producer: '当前结果区', lifetime: '跨清空保留', consumer: '逐字符按钮输入' },
  ] } }));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ref = { rootId: 'task', path: 'contract.json', kind: 'TaskContract', sha256 };
  const report = { allowed: true, from: 'S1', to: 'S2', stages: {
    S1: { verdict: 'pass', outputs: [ref], score: 100 },
  } };
  const snapshots = [{ ref, status: 'retained', actualSha256: sha256, snapshot: 'files/0001.json' }];
  const reads = [];
  const view = workflowPresentation(report, snapshots, filename => { reads.push(filename); return bytes; }, 'checks/check-001/');
  const markdown = renderWorkflowStage(report, 'S1', view);
  assert.deepEqual(reads, ['files/0001.json']);
  assert.match(markdown, /保留本次实际读值/);
  assert.match(markdown, /跨清空保留/);
  assert.match(markdown, /逐字符按钮输入/);
  assert.match(markdown, /\]\(\.\.\/checks\/check-001\/files\/0001.json\)/);
  assert.match(markdown, /计划版本|本次 Actual Output/);
  assert.ok(markdown.indexOf('本阶段固定输入') < markdown.indexOf('本次 Actual Output'));
  assert.ok(markdown.indexOf('保留本次实际读值') < markdown.indexOf('机器证明附录'));
});

test('drifted retained bytes and unsafe snapshot paths cannot supply business content or active links', () => {
  const bytes = Buffer.from(JSON.stringify({ goal: '<script>forged</script>' }));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const ref = { rootId: 'task', path: 'contract.json', kind: 'TaskContract', sha256: digest };
  const report = { allowed: true, from: 'S1', to: 'S2', stages: { S1: { verdict: 'pass', outputs: [ref] } } };
  const before = JSON.stringify(report);
  const view = workflowPresentation(report, [{ ref, status: 'retained', actualSha256: digest,
    snapshot: 'files/0001.json' }], () => Buffer.from('{}'));
  const markdown = renderWorkflowStage(report, 'S1', view);
  assert.doesNotMatch(markdown, /forged|\]\(\.\.\/files\/0001.json\)/);
  assert.match(markdown, /同版快照不可用/);
  let reads = 0;
  const unsafe = workflowPresentation(report, [{ ref, status: 'retained', actualSha256: digest,
    snapshot: '../../secret.json' }], () => { reads++; return bytes; });
  assert.equal(reads, 0);
  assert.doesNotMatch(renderWorkflowReview(report, unsafe), /secret|forged/);
  assert.equal(JSON.stringify(report), before);
});
