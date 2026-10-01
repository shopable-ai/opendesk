'use strict';

// Evaluator-only mutations. These tests distinguish discovery from routing:
// a recorded limitation passing its regression test is still an open case.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { fixture: makeStageFixture } = require('./tools/stage-review-fixture.js');
const { fixture: makeArtifactFixture } = require('./tools/artifact-fixture.js');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');
const { renderWorkflowReview } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const { verifyFrozenConsumer } = require('./tools/calculator-consumer-dataflow.cjs');
const { saveCheck } = require('../../workflows/agent-to-recipe/scripts/workflow-attempts.js');
const BASE = path.resolve(__dirname, '../../.runtime/tests/agent-to-recipe/case-audit/calculator-case-pack');
fs.mkdirSync(BASE, { recursive: true });
const RUN = fs.mkdtempSync(path.join(BASE, 'run-'));
const fixtures = new WeakMap();
const caseRecords = new Map();
const owners = ['automation-plan', 'application-engineer', 'task-demonstrate', 'task-demonstrate',
  'task-demonstrate', 'task-demonstrate', 'trace-distill', 'procedure-synthesize',
  'procedure-synthesize', 'application-engineer', 'recipe-build', 'recipe-qualify'];

function archive(t, report, role) {
  const id = t.name.match(/^C-F\d{2}/)[0];
  const number = Number(id.slice(3));
  const root = path.join(RUN, id);
  fs.mkdirSync(root, { recursive: true });
  const selected = fixtures.get(t) || [];
  for (const [index, fixture] of selected.entries()) {
    // Only this test's trusted generated fixtures; no arbitrary repo scan.
    fs.cpSync(fixture.dir || fixture.root, path.join(root, 'fixture-' + index), { recursive: true });
  }
  const info = caseRecords.get(id) || { id, scope: 'Evaluator-only synthetic counterexample; not real desktop evidence',
    expected: { firstInvalidBoundary: 'S' + number, owner: owners[number - 1],
      preserved: Array.from({ length: number - 1 }, (_, i) => 'S' + (i + 1)),
      invalidated: Array.from({ length: 13 - number }, (_, i) => 'S' + (number + i)),
      nextAction: 'Inspect the retained correct input and first wrong output at S' + number
        + '; repair that owner with new evidence and revalidate only dependent consumers.' }, reports: {} };
  if (report) {
    fs.writeFileSync(path.join(root, role + '.json'), JSON.stringify(report, null, 2));
    info.reports[role] = role + '.json';
    if (report.stages) {
      const journal = fs.mkdtempSync(path.join(root, role + '-files-'));
      saveCheck(journal, report, selected.filter(fixture => fixture.dir).map(fixture => ['run', fixture.dir]));
      fs.writeFileSync(path.join(root, role + '.md'), renderWorkflowReview(report));
    }
  }
  caseRecords.set(id, info);
  fs.writeFileSync(path.join(root, 'case.json'), JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(RUN, 'case-index.json'), JSON.stringify([...caseRecords.values()], null, 2));
  const rows = [...caseRecords.values()].map(item => {
    const workflowRole = item.reports['workflow-discovery'] ? 'workflow-discovery' : item.reports.routing ? 'routing' : null;
    const r = workflowRole ? JSON.parse(fs.readFileSync(path.join(RUN, item.id, workflowRole + '.json'))) : null;
    const actual = r ? r.firstInvalidBoundary || '未检出；不能记已闭环' : '见实际 validator/consumer report';
    return '| ' + item.id + ' | ' + item.expected.firstInvalidBoundary + ' / ' + item.expected.owner
      + ' | ' + actual + ' | [输入、输出及判定](' + item.id + '/case.json) |';
  });
  fs.writeFileSync(path.join(RUN, 'case-index.md'), [
    '# Calculator 反例实际文件', '',
    '只读投影 case-index.json 和原报告。全部是 L1 合成数据/受控替代，不证明真实动作、模型行为或资格。', '',
    '| Case | 预期首错 / 原责任 | 当前报告 | 文件入口 |', '| --- | --- | --- | --- |', ...rows, '',
    '发现与归属分开：routing 含有据 finding 或 Hard Fail，不代表 validator 自动推断了全部业务语义。',
    '未检出的例子仍是缺口，测试绿灯只说明该局限被复现。缺口下一动作、保留/失效范围与原始工件都在对应 case.json / fixture-*。', ''
  ].join('\n'));
}

function stageFixture(t) {
  const f = makeStageFixture(t);
  fixtures.set(t, [...(fixtures.get(t) || []), f]);
  const original = f.run;
  f.run = (...args) => { const report = original(...args); archive(t, report, 'stage-call'); return report; };
  archive(t, null, 'inputs');
  return f;
}

function artifactFixture(t, ...args) {
  const f = makeArtifactFixture(t, ...args);
  fixtures.set(t, [...(fixtures.get(t) || []), f]);
  archive(t, null, 'inputs');
  return f;
}

function assertUnproved(report, stage, t) {
  archive(t, report, 'workflow-discovery');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.stages[stage].verdict, 'pass');
  assert.ok(report.notEvaluated.some(value => /truth|business correctness/.test(value)));
}

function assertOwner(report, stage, skill, t) {
  archive(t, report, 'routing');
  const index = Number(stage.slice(1)) - 1;
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, stage);
  assert.deepEqual(report.failureOwner, { stage, skill });
  assert.deepEqual(report.preservedUpstream, Array.from({ length: index }, (_, i) => 'S' + (i + 1)));
  assert.deepEqual(report.invalidatedDownstream, Array.from({ length: 12 - index }, (_, i) => 'S' + (index + i + 1)));
  assert.match(report.nextMinimumAction, new RegExp(stage));
  const markdown = renderWorkflowReview(report);
  assert.match(markdown, new RegExp('首个无效边界[\\s\\S]*' + stage));
  assert.match(markdown, new RegExp('Failure Owner[\\s\\S]*' + stage + ' / ' + skill));
}

test('C-F01 open discovery: a self-consistent S1 contract can omit the runtime-read criterion', t => {
  const f = stageFixture(t);
  f.reviews[0].outputs = f.reviews[0].outputs.map(ref => ref.kind === 'TaskContract'
    ? f.write('task-contract-omitted.json', JSON.stringify({ schemaVersion: 'agent-to-recipe/v1',
      taskId: 't', successCriteria: [{ criterionId: 'final-result' }] }), 'TaskContract') : ref);
  assertUnproved(f.run('S1', 'S2'), 'S1', t);
});

test('C-F02 open discovery: S2 semantic target identity is not proved by a hashed declaration', t => {
  const f = stageFixture(t);
  f.reviews[1].outputs = [f.write('wrong-target.json', JSON.stringify({
    applicationIdentity: 'unrelated application', resultTarget: 'unrelated numeric label',
    claimedObserved: true, geometry: { x: 200, y: 100 } }), 'StageOutput')];
  assertUnproved(f.run('S2', 'S3'), 'S2', t);
});

test('C-F03 open discovery: ActualExecution role alone does not prove an action happened', t => {
  const f = stageFixture(t);
  f.reviews[2].evidence = [f.write('no-action.json', JSON.stringify({
    planned: 'read firstResult', actualAction: 'none', desktopActionExecuted: false }), 'ActualExecution')];
  assertUnproved(f.run('S3', 'S4'), 'S3', t);
});

test('C-F04 open discovery: a receipt labelled ActualObservation is not independently read back', t => {
  const f = stageFixture(t);
  f.reviews[3].evidence = [f.write('receipt-as-observation.json', JSON.stringify({
    receipt: { ok: true }, expected: '110', observedValue: '110', independentRead: false }), 'ActualObservation')];
  assertUnproved(f.run('S4', 'S5'), 'S4', t);
});

test('C-F05 open discovery: uncertain observation and an incorrect continue decision need a semantic comparison', t => {
  const f = stageFixture(t);
  f.reviews[3].evidence = [f.write('uncertain-observation.json', JSON.stringify({
    actualObservation: 'uncertain', actionState: 'unknown' }), 'ActualObservation')];
  f.reviews[4].outputs = [f.write('incorrect-continue.json', '{"decision":"continue"}', 'StageOutput')];
  assertUnproved(f.run('S5', 'S6'), 'S5', t);
});

test('C-F06 discovery: deleting the Dossier runtime-value set contradicts retained read outputs', t => {
  const f = artifactFixture(t, source => { source.dossier.runtimeValues = []; });
  const report = checkArtifactChain({ ...f.options, through: 'trace-distill' });
  archive(t, report, 'artifact-discovery');
  assert.equal(report.verdict, 'fail', JSON.stringify(report.errors));
  assert.ok(report.errors.some(error => error.code === 'RUNTIME_VALUE_COVERAGE'));
  assert.equal(report.stageComplete, false);
  assert.equal(report.liveQualificationGranted, false);
  const route = stageFixture(t);
  const evidence = route.write('missing-runtime-values.json', JSON.stringify(report), 'ValidationReport');
  route.reviews[6].findings = [{ blocking: true, ownerStage: 'S6',
    reason: 'S5 read was correct; S6 Dossier first omitted the runtime values.', evidence: [evidence] }];
  assertOwner(route.run('S7', 'S8'), 'S6', 'task-demonstrate', t);
});

test('C-F07 discovery: omitting the actual first-result read fails distillation', t => {
  const f = artifactFixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A005').decision = 'omit';
  });
  const report = checkArtifactChain({ ...f.options, through: 'trace-distill' });
  archive(t, report, 'artifact-discovery');
  assert.equal(report.verdict, 'fail');
  assert.ok(report.errors.some(error => error.code === 'NECESSARY_ACTION_OMITTED'));
  const route = stageFixture(t);
  route.reviews[6].hardFails = ['Actual first-result read was omitted; independent artifact check failed.'];
  assertOwner(route.run('S7', 'S8'), 'S7', 'trace-distill', t);
});

test('C-F08 discovery is coarser than S8: the artifact validator catches fixed business input and the original owner must be bound', t => {
  const f = artifactFixture(t, source => {
    const consumer = source.procedure.businessSteps.find(item => item.stepId === 'B040');
    consumer.inputs = ['secondMultiplier', '110'];
    consumer.inputSources = ['TaskContract.secondMultiplier', 'constant 110'];
  });
  const report = checkArtifactChain({ ...f.options, through: 'procedure-synthesize' });
  archive(t, report, 'artifact-discovery');
  assert.equal(report.verdict, 'fail');
  assert.ok(report.errors.some(error => error.code === 'DATA_DEPENDENCY_BROKEN'));
  const route = stageFixture(t);
  route.reviews[10].findings = [{ blocking: true, ownerStage: 'S8',
    reason: 'S7 was correct; S8 Business Step first replaced the runtime input with 110.',
    evidence: [route.write('fixed-business-input-report.json', JSON.stringify(report), 'ValidationReport')] }];
  assertOwner(route.run('S11', 'S12'), 'S8', 'procedure-synthesize', t);
});

test('C-F09 discovery: a runtime value cannot become a reusable parameter', t => {
  const f = artifactFixture(t, source => { source.procedure.parameters.firstResult = { default: '110' }; });
  const report = checkArtifactChain({ ...f.options, through: 'procedure-synthesize' });
  archive(t, report, 'artifact-discovery');
  assert.equal(report.verdict, 'fail');
  assert.ok(report.errors.some(error => error.code === 'OBSERVATION_BECAME_PARAMETER'));
  const route = stageFixture(t);
  route.reviews[8].hardFails = ['firstResult became a parameter; independent artifact check failed.'];
  assertOwner(route.run('S9', 'S10'), 'S9', 'procedure-synthesize', t);
});

test('C-F10 open discovery: a self-declared zero display does not prove full reset', t => {
  const f = stageFixture(t);
  f.reviews[9].outputs = [f.write('weak-clear-rule.json', JSON.stringify({
    operation: 'clear', actions: ['C'], postcondition: 'display equals 0',
    fullResetClaimed: true, discriminatingProbeRun: false }), 'StageOutput')];
  assertUnproved(f.run('S10', 'S11'), 'S10', t);
});

test('C-F11 discovery: exact mutated source with a fixed operand fails the independent controlled consumer', t => {
  const f = artifactFixture(t, source => {
    source.candidateSource = source.candidateSource.replace('...firstResult', "'1', '1', '0'");
  });
  const candidate = JSON.parse(fs.readFileSync(f.file('candidate.json'), 'utf8'));
  const verifier = path.join(__dirname, 'tools/calculator-consumer-dataflow.cjs');
  const report = verifyFrozenConsumer({ schemaVersion: 'calculator-consumer-l1/v1',
    harness: 'calculator-helper-fixture-v1', candidateRef: f.ref('candidate.json', 'CandidateManifest'),
    scriptRef: candidate.scriptRef, dependencies: [], roots: [['fixture', f.root]],
    evaluatorSha256: createHash('sha256').update(fs.readFileSync(verifier)).digest('hex'),
    script: { path: f.file('candidate.js'), sha256: candidate.scriptRef.sha256 },
    outputDir: path.join(f.root, 'controlled-observations') });
  archive(t, report, 'consumer-discovery');
  assert.equal(report.verdict, 'fail', JSON.stringify(report));
  assert.equal(report.businessDataflow.releaseBlocked, true);
  assert.equal(report.liveQualificationGranted, false);
  const route = stageFixture(t);
  route.reviews[10].hardFails = ['The exact-byte consumer observed a fixed operand.'];
  assertOwner(route.run('S11', 'S12'), 'S11', 'recipe-build', t);
});

test('C-F12 discovery and routing: missing current Candidate binding fails qualification and preserves S11', t => {
  const f = stageFixture(t);
  f.reviews[11].inputs = f.reviews[11].inputs.filter(ref => ref.kind !== 'CandidateSource');
  const report = f.run('S12', 'S12', true);
  assert.ok(report.errors.some(error => error.code === 'STALE_CANDIDATE'));
  assertOwner(report, 'S12', 'recipe-qualify', t);
});

console.log('Evaluator-only Case artifacts retained at ' + RUN);
