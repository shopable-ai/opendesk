'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { valueLineage, renderReview, renderWorkflowReview, workflowPresentation } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const { createHash } = require('node:crypto');
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
  assert.match(markdown, /EVIDENCE&#95;SCOPE|MISSING&#95;ACTUAL&#95;ACTUALOBSERVATION|MISSING&#95;EVIDENCE/);
  assert.match(markdown, /尚未纳入阶段验收[\s\S]*不能写成 PASS|等待真正 failure owner 修复/);
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
  assert.match(markdown, /STALE&#95;CANDIDATE/);
});

test('a passed prefix explicitly remains incomplete and does not fill unreviewed stages with empty checks', t => {
  const f = workflowFixture(t);
  const report = f.run('S2', 'S3');
  const before = JSON.stringify(report);
  assert.equal(report.allowed, true);
  const markdown = renderWorkflowReview(report);
  assert.match(markdown, /整条流程验收：尚未完成/);
  assert.match(markdown, /该 PASS 只放行本次阶段边界/);
  assert.match(markdown, /维护工作流本身不授予生产、Runtime 或桌面执行权限/);
  assert.match(markdown, /已获准但已停止的后续验证保持未运行/);
  assert.match(markdown, /S3｜实际执行动作/);
  const unreviewed = markdown.slice(markdown.indexOf('## S3｜'), markdown.indexOf('## 检查身份'));
  assert.doesNotMatch(unreviewed, /Hard Fail|Required Tests|输入充分/);
  assert.match(unreviewed, /不能据此否认其他保留的真实执行/);
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
  const markdown = renderWorkflowReview(report, view);
  assert.deepEqual(reads, ['files/0001.json']);
  assert.match(markdown, /保留本次实际读值/);
  assert.match(markdown, /跨清空保留/);
  assert.match(markdown, /逐字符按钮输入/);
  assert.match(markdown, /\]\(checks\/check-001\/files\/0001.json\)/);
  assert.match(markdown, /计划版本|实际成果与业务内容/);
  const stage = markdown.slice(markdown.indexOf('## S1｜'), markdown.indexOf('## S2｜'));
  assert.ok(stage.indexOf('开始前有什么') < stage.indexOf('实际成果与业务内容'));
  assert.ok(stage.indexOf('保留本次实际读值') < stage.indexOf('阶段判断'));
});

test('drifted retained bytes and unsafe snapshot paths cannot supply business content or active links', () => {
  const bytes = Buffer.from(JSON.stringify({ goal: '<script>forged</script>' }));
  const digest = createHash('sha256').update(bytes).digest('hex');
  const ref = { rootId: 'task', path: 'contract.json', kind: 'TaskContract', sha256: digest };
  const report = { allowed: true, from: 'S1', to: 'S2', stages: { S1: { verdict: 'pass', outputs: [ref] } } };
  const before = JSON.stringify(report);
  const view = workflowPresentation(report, [{ ref, status: 'retained', actualSha256: digest,
    snapshot: 'files/0001.json' }], () => Buffer.from('{}'));
  const markdown = renderWorkflowReview(report, view);
  assert.doesNotMatch(markdown, /forged|\]\(files\/0001.json\)/);
  assert.match(markdown, /同版文件不可用/);
  let reads = 0;
  const unsafe = workflowPresentation(report, [{ ref, status: 'retained', actualSha256: digest,
    snapshot: '../../secret.json' }], () => { reads++; return bytes; });
  assert.equal(reads, 0);
  assert.doesNotMatch(renderWorkflowReview(report, unsafe), /secret|forged/);
  assert.equal(JSON.stringify(report), before);
});
