'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkWorkflowStage } = require('../../workflows/agent-to-recipe/scripts/check-workflow-stage.js');
const { fixture: artifactFixture } = require('./tools/artifact-fixture.js');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');

const REPO = path.resolve(__dirname, '../..');
const { fixture } = require('./tools/stage-review-fixture.js');

function replaceStageEvidence(f, stage, contents, kind) {
  const review = f.reviews.find(item => item.stage === stage);
  const previous = review.evidence[0];
  const replacement = f.write(stage + '-layer-evidence.json', JSON.stringify(contents), kind || previous.kind);
  const remap = value => {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== 'object') return value;
    if (value.rootId === previous.rootId && value.path === previous.path) return replacement;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, remap(child)]));
  };
  for (const key of Object.keys(f.record)) f.record[key] = remap(f.record[key]);
  if (stage === 'S12') {
    const current = f.record.stages.find(item => item.stage === stage);
    const output = current.outputs.find(ref => ref.kind === 'QualificationRecord');
    const qualification = remap(JSON.parse(fs.readFileSync(path.join(f.dir, output.path), 'utf8')));
    current.outputs = [f.write(output.path, JSON.stringify(qualification), output.kind, output.schemaVersion)];
  }
  return replacement;
}

test('explicit controlled substitute cannot be promoted to FreshRun by a reference kind', t => {
  const f = fixture(t);
  replaceStageEvidence(f, 'S12', {
    schemaVersion: 'agent-to-recipe/v1', evidenceLayer: 'L1-controlled-substitutes',
    desktopActions: false, liveQualificationGranted: false, synthetic: true,
    verdict: 'pass', note: 'No real Calculator execution; controlled host substitutes only.',
  });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S12');
  assert.equal(report.stages.S11.verdict, 'pass');
  assert.ok(report.errors.some(error => error.code === 'LIVE_EVIDENCE_CONTRADICTION'));
  assert.equal(report.consumerVerificationCalls, 0);
});

for (const [label, declaration] of [
  ['L0 contract/static', {evidenceLayer: 'L0 Contract / Static'}],
  ['L1 deterministic unit', {evidenceLayer: 'L1 Deterministic Unit'}],
  ['host-only layer', {evidenceLayer: 'host-only'}],
  ['mock layer', {evidenceLayer: 'mock'}],
  ['synthetic declaration', {synthetic: true}],
  ['mock declaration', {mock: true}],
  ['host-only declaration', {hostOnly: true}],
]) test('required FreshRun rejects explicit ' + label, t => {
  const f = fixture(t);
  replaceStageEvidence(f, 'S12', {schemaVersion: 'agent-to-recipe/v1', verdict: 'pass', ...declaration});
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'LIVE_EVIDENCE_CONTRADICTION'));
});

for (const [stage, next, kind] of [
  ['S3', 'S4', 'ActualExecution'], ['S3', 'S4', 'live-action-trace'],
  ['S4', 'S5', 'ActualObservation'], ['S4', 'S5', 'actual-first-read'],
  ['S12', 'S12', 'independent-fresh-run'],
]) test('explicit substitute cannot satisfy the live role ' + kind, t => {
  const f = fixture(t);
  rewriteAcceptance(f, acceptance => {
    acceptance.stages[stage].requiredEvidenceKinds = [kind];
    for (const criterion of acceptance.stages[stage].scoring.items) criterion.requiredEvidenceKinds = [kind];
  });
  replaceStageEvidence(f, stage, {schemaVersion: 'agent-to-recipe/v1', synthetic: true}, kind);
  const report = f.run(stage, next, stage === 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'LIVE_EVIDENCE_CONTRADICTION' && error.stage === stage));
});

test('S11 can retain truthful L1 controlled evidence without promoting it to live', t => {
  const f = fixture(t);
  replaceStageEvidence(f, 'S11', {schemaVersion: 'agent-to-recipe/v1',
    evidenceLayer: 'L1-controlled-substitutes', synthetic: true, desktopActions: false,
    liveQualificationGranted: false, verdict: 'pass'});
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.stages.S12.verdict, 'not-run');
});

for (const [stage, next, kind] of [
  ['S3', 'S4', 'ActualExecution'], ['S3', 'S4', 'live-action-trace'],
  ['S4', 'S5', 'ActualObservation'], ['S4', 'S5', 'actual-first-read'],
  ['S12', 'S12', 'FreshRun'], ['S12', 'S12', 'independent-fresh-run'],
]) {
  const createArrayFixture = context => {
    const current = fixture(context);
    rewriteAcceptance(current, acceptance => {
      acceptance.stages[stage].requiredEvidenceKinds = [kind];
      for (const criterion of acceptance.stages[stage].scoring.items) criterion.requiredEvidenceKinds = [kind];
    });
    return current;
  };
  test(kind + ' accepts a nonempty object-array representation without claiming historical authenticity', context => {
    const current = createArrayFixture(context);
    replaceStageEvidence(current, stage, [
      {id: 'action-01', sideEffect: 'acknowledged', receipt: {ok: true, action: 'tapTargets', completed: [{targetId: 'button-a'}]}},
      {id: 'observation-01', desktopActions: false, value: 'sample', complete: true},
    ], kind);
    const report = current.run(stage, next, stage === 'S12');
    assert.equal(report.allowed, true, JSON.stringify(report.errors));
    assert.ok(report.notEvaluated.some(item => /historical execution/.test(item)));
  });
  for (const declaration of [{synthetic: true}, {evidenceLayer: 'L1-controlled-substitutes'}, {mock: true}, {hostOnly: true}]) {
    test(kind + ' rejects contradictory declarations inside an evidence array: ' + JSON.stringify(declaration), context => {
      const current = createArrayFixture(context);
      replaceStageEvidence(current, stage, [{id: 'ordinary'}, {id: 'contradiction', ...declaration}], kind);
      const report = current.run(stage, next, stage === 'S12');
      assert.equal(report.allowed, false);
      assert.ok(report.errors.some(error => error.code === 'LIVE_EVIDENCE_CONTRADICTION' && error.stage === stage));
    });
  }
}

for (const value of [[], [null], ['claim'], 7]) {
  test('required live JSON rejects empty or non-object evidence representation: ' + JSON.stringify(value), context => {
    const current = fixture(context);
    replaceStageEvidence(current, 'S3', value, 'ActualExecution');
    const report = current.run('S3', 'S4');
    assert.equal(report.allowed, false);
    assert.ok(report.errors.some(error => ['EMPTY_ARTIFACT', 'INVALID_DOCUMENT'].includes(error.code)));
  });
}

for (const [stage, next, kind, minimumLayer] of [
  ['S3', 'S4', 'ActualExecution', 3], ['S3', 'S4', 'live-action-trace', 3],
  ['S4', 'S5', 'ActualObservation', 3], ['S4', 'S5', 'actual-first-read', 3],
  ['S12', 'S12', 'FreshRun', 4], ['S12', 'S12', 'independent-fresh-run', 4],
]) {
  for (const [level, evidenceLayer] of [
    [0, 'L0 Contract / Static'], [1, 'L1 Deterministic Unit'], [2, 'L2 Independent Method Behavior'],
    [3, 'L3 Host / Runtime Integration'], [4, 'L4 Real Application / Fresh Run'],
  ]) test(kind + ' enforces declared L' + level + ' against its role boundary', t => {
    const f = fixture(t);
    rewriteAcceptance(f, acceptance => {
      acceptance.stages[stage].requiredEvidenceKinds = [kind];
      for (const criterion of acceptance.stages[stage].scoring.items) criterion.requiredEvidenceKinds = [kind];
    });
    replaceStageEvidence(f, stage, {schemaVersion: 'agent-to-recipe/v1', evidenceLayer,
      desktopActions: false, liveQualificationGranted: false, observations: [{value: 'observed'}]}, kind);
    const report = f.run(stage, next, stage === 'S12');
    assert.equal(report.allowed, level >= minimumLayer, JSON.stringify(report.errors));
    assert.equal(report.errors.some(error => error.code === 'LIVE_EVIDENCE_CONTRADICTION'), level < minimumLayer);
    assert.equal(report.consumerVerificationCalls, 0);
  });
}

for (const stage of ['S4', 'S12']) {
  test('read-only live witness declarations are not contradicted by no-input/no-qualification flags at ' + stage, t => {
    const f = fixture(t);
    replaceStageEvidence(f, stage, {schemaVersion: 'agent-to-recipe/v1',
      evidenceLayer: 'L4 Real Application / Fresh Run', kind: 'witness-complete',
      desktopActions: false, liveQualificationGranted: false, synthetic: false,
      observations: [{value: '0'}, {value: '110'}, {value: '0'}, {value: '660'}],
      initialObservedValue: '0', initialClearObserved: true, lastObservedValue: '660'});
    const report = f.run(stage, stage === 'S4' ? 'S5' : 'S12', stage === 'S12');
    assert.equal(report.allowed, true, JSON.stringify(report.errors));
    assert.equal(report.consumerVerificationCalls, 0);
    assert.ok(report.notEvaluated.some(item => /historical execution/.test(item)));
  });
}

test('no desktop input alone is not proof that an unlabelled witness is synthetic', t => {
  const f = fixture(t);
  replaceStageEvidence(f, 'S12', {desktopActions: false, liveQualificationGranted: false,
    kind: 'witness-complete', observations: [{value: '0'}, {value: '110'}, {value: '0'}, {value: '660'}]});
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.ok(report.notEvaluated.some(item => /historical execution/.test(item)));
});

function attachValidator(f, mutate = () => {}) {
  const report = { tool: 'synthetic-bound-validator', verdict: 'pass',
    subjectRefs: [...f.reviews[10].outputs, ...f.reviews[10].dependencies] };
  mutate(report);
  f.reviews[10].validationReports = [{ tool: report.tool,
    reportRef: f.write('bound-validator.json', JSON.stringify(report), 'ValidationReport') }];
  return report;
}

function configureConsumer(f, transform = source => source) {
  const code = transform(fs.readFileSync(path.join(REPO, 'examples/agent-to-recipe/calculator.js'), 'utf8'));
  const scriptRef = f.write('controlled-source.js', code, 'CandidateSource');
  const candidateRef = f.write('controlled-candidate.json', JSON.stringify({ schemaVersion: 'agent-to-recipe/v1',
    scriptRef, scriptHash: scriptRef.sha256, dependencies: [] }), 'CandidateManifest');
  f.reviews[10].outputs = [candidateRef, scriptRef];
  attachValidator(f, report => {
    report.tool = 'agent-to-recipe-artifact-chain/v1';
    report.boundaries = { candidate: 'pass' };
    report.businessDataflow = { verdict: 'unknown', releaseBlocked: true };
  });
  const toolPath = 'tests/workflows/tools/calculator-consumer-dataflow.cjs';
  const evaluatorRef = { rootId: 'repo', path: toolPath,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(REPO, toolPath))).digest('hex'),
    kind: 'VerifierSource', schemaVersion: 'calculator-consumer-l1/v1' };
  const roots = [['run', f.dir], ['repo', REPO]];
  const descriptor = { schemaVersion: 'calculator-consumer-l1/v1', harness: 'calculator-runtime-v1',
    evaluator: 'independent-reviewer', evaluatorSha256: evaluatorRef.sha256,
    candidateRef, scriptRef, dependencies: [], roots: structuredClone(roots),
    script: { path: path.join(f.dir, scriptRef.path), sha256: scriptRef.sha256 },
    outputDir: path.join(f.dir, 'controlled-observations') };
  const save = () => {
    f.reviews[10].validationReports[0].consumerVerification = { evaluatorRef,
      descriptorRef: f.write('consumer-descriptor.json', JSON.stringify(descriptor),
        'ConsumerVerificationDescriptor', 'calculator-consumer-l1/v1') };
  };
  save();
  const approvedSubject = JSON.stringify([candidateRef, scriptRef, []]);
  const verifyConsumer = descriptor => {
    assert.equal(JSON.stringify([descriptor.candidateRef, descriptor.scriptRef, descriptor.dependencies]), approvedSubject);
    return require('./tools/calculator-consumer-dataflow.cjs').verifyFrozenConsumer(descriptor);
  };
  f.run = (from, to, final = false) => {
    f.write('review.json', JSON.stringify(f.record), 'StageReview');
    return checkWorkflowStage({ roots, record: path.join(f.dir, 'review.json'), from, to, final, verifyConsumer });
  };
  return { descriptor, save, evaluatorRef };
}

for (const [label, transform] of [
  ['original', source => source],
  ['equivalent Array.from', source => source.replace('...firstResult', '...Array.from(firstResult)')],
]) test('current exact-byte controlled verification clears only the dataflow block: ' + label, t => {
  const f = fixture(t);
  const { descriptor } = configureConsumer(f, transform);
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.stages.S12.verdict, 'not-run');
  assert.equal(report.desktopActionsAuthorized, false);
  const attempts = fs.readdirSync(descriptor.outputDir);
  assert.equal(attempts.length, 1);
  assert.ok(fs.existsSync(path.join(descriptor.outputDir, attempts[0], 'observations.json')));
  const again = f.run('S11', 'S12');
  assert.equal(again.allowed, true, JSON.stringify(again.errors));
  assert.equal(fs.readdirSync(descriptor.outputDir).length, 2);
});

for (const [label, transform] of [
  ['hardcoded operand', source => source.replace('...firstResult', "'1', '1', '0'")],
  ['truncation', source => source.replace('...firstResult', '...firstResult.slice(0, 1)')],
  ['deduplicated operand', source => source.replace('...firstResult', '...new Set(firstResult)')],
]) test('stored PASS cannot clear current bad source: ' + label, t => {
  const f = fixture(t);
  configureConsumer(f, transform);
  f.reviews[10].validationReports[0].consumerVerification.result = {
    verdict: 'pass', businessDataflow: { verdict: 'pass', releaseBlocked: false },
  };
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'CONSUMER_VERIFICATION'));
  assert.ok(report.errors.some(error => error.code === 'VALIDATOR_BLOCKED'));
});

for (const [label, mutate] of [
  ['helper fixture profile', descriptor => { descriptor.harness = 'calculator-helper-fixture-v1'; }],
  ['producer as evaluator', descriptor => { descriptor.evaluator = 'producer'; }],
  ['missing evaluator identity', descriptor => { delete descriptor.evaluator; }],
  ['stale evaluator hash', descriptor => { descriptor.evaluatorSha256 = 'a'.repeat(64); }],
  ['another candidate', descriptor => { descriptor.candidateRef = { ...descriptor.candidateRef, path: 'other.json' }; }],
  ['missing source binding', descriptor => { delete descriptor.scriptRef; }],
  ['extra dependency', descriptor => { descriptor.dependencies.push(descriptor.scriptRef); }],
  ['root escape', descriptor => { descriptor.roots.push(['all', '/']); }],
  ['observations outside runtime', descriptor => { descriptor.outputDir = '/tmp/forbidden-observations'; }],
]) test('controlled verification rejects ' + label, t => {
  const f = fixture(t);
  const { descriptor, save } = configureConsumer(f);
  mutate(descriptor);
  save();
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'CONSUMER_VERIFICATION'));
});

test('record fields and descriptor cannot authorize host execution without a trusted callback', t => {
  const f = fixture(t);
  const { descriptor } = configureConsumer(f);
  f.record.authorized = true;
  f.record.verifyConsumer = 'execute';
  f.write('review.json', JSON.stringify(f.record), 'StageReview');
  const report = checkWorkflowStage({ record: path.join(f.dir, 'review.json'), roots: descriptor.roots,
    from: 'S11', to: 'S12' });
  assert.equal(report.allowed, false);
  assert.equal(report.consumerVerificationCalls, 0);
  assert.ok(report.errors.some(error => error.code === 'CONSUMER_AUTHORIZATION'));
  assert.equal(fs.existsSync(descriptor.outputDir), false);
});

test('trusted host may deny a bound source and no stored PASS bypasses that decision', t => {
  const f = fixture(t);
  const { descriptor } = configureConsumer(f);
  f.write('review.json', JSON.stringify(f.record), 'StageReview');
  let calls = 0;
  const report = checkWorkflowStage({ record: path.join(f.dir, 'review.json'), roots: descriptor.roots,
    from: 'S11', to: 'S12', verifyConsumer: () => { calls += 1; throw new Error('Source not approved by host'); } });
  assert.equal(report.allowed, false);
  assert.equal(calls, 1);
  assert.equal(report.consumerVerificationCalls, 1);
  assert.equal(fs.existsSync(descriptor.outputDir), false);
});

test('a source change after controlled PASS invalidates the next check', t => {
  const f = fixture(t);
  const { descriptor } = configureConsumer(f);
  assert.equal(f.run('S11', 'S12').allowed, true);
  fs.appendFileSync(descriptor.script.path, '\nchanged');
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('validator PASS binds exact current Candidate manifest, source and dependencies', t => {
  const f = fixture(t);
  attachValidator(f);
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

for (const [label, mutate] of [
  ['missing snapshot', report => { delete report.subjectRefs; }],
  ['missing source', report => { report.subjectRefs.pop(); }],
  ['duplicate source', report => { report.subjectRefs[0] = report.subjectRefs[1]; }],
  ['another hash', report => { report.subjectRefs[0] = { ...report.subjectRefs[0], sha256: 'a'.repeat(64) }; }],
  ['another candidate path', report => { report.subjectRefs[0] = { ...report.subjectRefs[0], path: 'other.json' }; }],
  ['another schema', report => { report.subjectRefs[0] = { ...report.subjectRefs[0], schemaVersion: 'other/v1' }; }],
  ['extra dependency', report => { report.subjectRefs.push({ ...report.subjectRefs[1], path: 'extra.js' }); }],
]) test('validator rejects ' + label, t => {
  const f = fixture(t);
  attachValidator(f, mutate);
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'VALIDATOR_SUBJECT'));
});

for (const [label, mutate] of [
  ['top-level release block', report => { report.releaseBlocked = true; }],
  ['top-level blocked flag', report => { report.blocked = true; }],
  ['errors hidden by PASS', report => { report.errors = [{ code: 'FAILED' }]; }],
  ['blocking unknowns', report => { report.blockingUnknowns = ['unverified']; }],
  ['unknown dataflow', report => { report.businessDataflow = { verdict: 'unknown', releaseBlocked: true }; }],
  ['failed dataflow', report => { report.businessDataflow = { verdict: 'fail', releaseBlocked: true }; }],
  ['PASS with release block', report => { report.businessDataflow = { verdict: 'pass', releaseBlocked: true }; }],
]) test('validator PASS cannot hide ' + label, t => {
  const f = fixture(t);
  attachValidator(f, mutate);
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'VALIDATOR_BLOCKED'));
});

test('actual structural-only PASS from another Candidate cannot qualify the current stage', t => {
  const chain = artifactFixture(t);
  const actual = checkArtifactChain({ ...chain.options, through: 'candidate' });
  assert.equal(actual.verdict, 'pass');
  assert.equal(actual.businessDataflow.releaseBlocked, true);
  const f = fixture(t);
  f.reviews[10].validationReports = [{ tool: actual.tool, boundary: 'candidate',
    reportRef: f.write('foreign-structural-pass.json', JSON.stringify(actual), 'ValidationReport') }];
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'VALIDATOR_SUBJECT'));
  assert.ok(report.errors.some(error => error.code === 'VALIDATOR_BLOCKED'));
});

test('hand-edited structural dataflow PASS cannot replace current authoritative verification', t => {
  const f = fixture(t);
  attachValidator(f, report => {
    report.tool = 'agent-to-recipe-artifact-chain/v1';
    report.businessDataflow = { verdict: 'pass', releaseBlocked: false };
  });
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'CONSUMER_VERIFICATION'));
});

test('renaming a validator cannot make a declared dataflow PASS authoritative', t => {
  const f = fixture(t);
  attachValidator(f, report => {
    report.businessDataflow = { verdict: 'pass', releaseBlocked: false };
    report.verification = { mode: 'controlled-exact-byte', verdict: 'pass' };
  });
  const report = f.run('S11', 'S12');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'CONSUMER_VERIFICATION'));
});

for (const filename of ['blank.txt', 'blank.json', 'blank.log', 'blank']) {
  test('whitespace-only actual observation is not evidence: ' + filename, t => {
    const f = fixture(t);
    const observation = f.write(filename, ' \n\t\r ', 'ActualObservation');
    const review = f.reviews[3];
    review.evidence = [observation];
    review.gate.evidence = [observation];
    review.requiredTests[0].evidence = [observation];
    for (const detail of Object.values(review.scoreEvidence)) {
      detail.refs = [observation];
      for (const item of detail.items) item.refs = [observation];
    }
    const report = f.run('S4', 'S5');
    assert.equal(report.allowed, false);
    assert.ok(report.errors.some(error => error.code === 'EMPTY_ARTIFACT'));
  });
}

test('opaque binary evidence is hash checked without applying text trim', t => {
  const f = fixture(t);
  const binary = f.write('opaque.png', Buffer.from([32, 10, 9]), 'ActualObservation');
  f.reviews[3].evidence = [binary];
  const report = f.run('S4', 'S5');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.ok(report.notEvaluated.some(item => /desktop observation/.test(item)));
});

function rewriteAcceptance(f, mutate) {
  const prior = f.record.acceptanceRef;
  const acceptance = JSON.parse(fs.readFileSync(path.join(f.dir, prior.path), 'utf8'));
  mutate(acceptance);
  const next = f.write('acceptance-revision-' + (f.acceptanceRevision = (f.acceptanceRevision || 0) + 1) + '.json',
    JSON.stringify(acceptance), 'Acceptance');
  f.record.acceptanceRef = next;
  for (const review of f.reviews) {
    review.inputs = review.inputs.map(ref => ref.path === prior.path ? next : ref);
    review.audit.accessedRefs = review.audit.accessedRefs.map(ref => ref.path === prior.path ? next : ref);
  }
}

function freezePackage(f, reuse = false) {
  const members = f.reviews.slice(1, 6).map(review => ({ stage: review.stage,
    attemptId: review.attemptId, planRevision: review.planRevision, producerVersion: review.producerVersion,
    ...(reuse && review.stage !== 'S2' ? {
      reuseReviewRef: f.write('prior-' + review.stage + '.json', JSON.stringify(review), 'StageReview'),
      reuseReason: 'Same synthetic task, input versions, evidence and method remain applicable.',
      applicabilityEvidence: [f.write('applicability-' + review.stage + '.txt',
        'Synthetic current applicability reassessment; not desktop evidence.')],
    } : {}) }));
  rewriteAcceptance(f, acceptance => {
    acceptance.routing.workPackages = [{ id: 'demonstration', from: 'S2', to: 'S7', members }];
  });
  f.record.workPackageId = 'demonstration';
}

test('complete frozen work package permits S2 → S7 without reading future Candidate bytes', t => {
  const f = fixture(t);
  freezePackage(f);
  fs.appendFileSync(path.join(f.dir, 'candidate.js'), '// not available to this work package');
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.stages.S6.verdict, 'pass');
  assert.equal(report.stages.S7.verdict, 'not-run');
});

test('complete version-bound reused responsibilities permit S2 → S7', t => {
  const f = fixture(t);
  freezePackage(f, true);
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

test('a frozen package does not substitute for missing S3–S6 reviews', t => {
  const f = fixture(t);
  freezePackage(f);
  f.record.stages = f.reviews.slice(0, 2);
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S3');
  assert.equal(report.errors.filter(error => error.code === 'STAGE_NOT_PASS').length, 4);
});

for (const [label, mutate] of [
  ['missing dependency responsibility', acceptance => { acceptance.routing.dependencies.S7 = ['S2']; }],
  ['dependency cycle', acceptance => { acceptance.routing.dependencies.S4.push('S6'); }],
  ['unknown dependency', acceptance => { acceptance.routing.dependencies.S4.push('S99'); }],
  ['duplicate dependency', acceptance => { acceptance.routing.dependencies.S4.push('S3'); }],
  ['stale plan', acceptance => { acceptance.routing.planRevision = 'old-plan'; }],
  ['missing package responsibility', acceptance => { acceptance.routing.workPackages[0].members.pop(); }],
  ['duplicate package member', acceptance => {
    acceptance.routing.workPackages[0].members.push(acceptance.routing.workPackages[0].members[0]);
  }],
  ['wrong transition', acceptance => { acceptance.routing.workPackages[0].to = 'S8'; }],
]) test('frozen route rejects ' + label, t => {
  const f = fixture(t);
  freezePackage(f);
  rewriteAcceptance(f, mutate);
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'ROUTING_REQUIRED'));
});

for (const field of ['attemptId', 'planRevision', 'producerVersion']) {
  test('work package rejects changed ' + field, t => {
    const f = fixture(t);
    freezePackage(f);
    f.reviews[3][field] = 'unfrozen';
    const report = f.run('S2', 'S7');
    assert.equal(report.allowed, false);
    assert.equal(report.firstInvalidBoundary, 'S4');
    assert.ok(report.errors.some(error => error.code === 'WORK_PACKAGE_BINDING'));
  });
}

test('extra frozen dependency needs exact current inputs rather than adjacency alone', t => {
  const f = fixture(t);
  freezePackage(f);
  rewriteAcceptance(f, acceptance => { acceptance.routing.dependencies.S5.push('S2'); });
  let report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'STALE_UPSTREAM' && error.stage === 'S5'));
  f.reviews[4].inputs.push(...f.reviews[1].outputs);
  report = f.run('S2', 'S7');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

test('grouped responsibilities cannot hide missing observation or failed tests', t => {
  const f = fixture(t);
  freezePackage(f);
  f.reviews[3].evidence = [];
  f.reviews[5].requiredTests[0].status = 'not-run';
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S4');
  assert.ok(report.errors.some(error => error.code === 'REQUIRED_TEST'));
});

for (const target of ['S4-observation.txt', 'prior-S4.json', 'applicability-S4.txt', 'S4-output.json']) {
  test('reuse rejects mutated bytes: ' + target, t => {
    const f = fixture(t);
    freezePackage(f, true);
    fs.appendFileSync(path.join(f.dir, target), '\nchanged');
    const report = f.run('S2', 'S7');
    assert.equal(report.allowed, false);
    assert.ok(report.errors.some(error => error.code === 'HASH_MISMATCH'));
  });
}

test('reused outputs cannot be silently replaced even when downstream updates its input', t => {
  const f = fixture(t);
  freezePackage(f, true);
  f.reviews[3].outputs = [f.write('new-S4-output.json', '{"changed":true}', 'StageOutput')];
  f.reviews[4].inputs = [f.record.acceptanceRef, ...f.reviews[3].outputs];
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'WORK_PACKAGE_BINDING'));
});

test('reused self-declared PASS must still pass its original frozen review', t => {
  const f = fixture(t);
  f.reviews[3].requiredTests[0].status = 'fail';
  freezePackage(f, true);
  f.reviews[3].requiredTests[0].status = 'pass';
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'REQUIRED_TEST'));
});

test('reuse needs current applicability evidence and reason', t => {
  const f = fixture(t);
  freezePackage(f, true);
  rewriteAcceptance(f, acceptance => {
    acceptance.routing.workPackages[0].members[2].applicabilityEvidence = [];
  });
  const report = f.run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'WORK_PACKAGE_BINDING'));
});

for (const aspect of ['behavior', 'runtimeDataFlow', 'apiSemantics', 'failureSafety', 'engineering', 'applicability']) {
  test('reference compliance requires every aspect independently: ' + aspect, t => {
    const f = fixture(t);
    f.record.final.referenceAlignment.aspects[aspect].verdict = 'noncompliant';
    const report = f.run('S12', 'S12', true);
    assert.equal(report.allowed, false);
    assert.ok(report.errors.some(error => error.code === 'REFERENCE_EVIDENCE'));
    assert.equal(report.stages.S11.score, 100);
  });
}

test('requirement-compliant equivalent implementation and a defective reference can pass', t => {
  const f = fixture(t);
  f.record.final.referenceAlignment.aspects.runtimeDataFlow.differences =
    'Synthetic reference has a defect; candidate uses a different but requirement-compliant runtime consumer.';
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal('referenceAlignmentScore' in report.final, false);
});

for (const [label, mutate] of [
  ['old weighted scores', alignment => { alignment.dimensions = { behavior: 30, runtimeDataFlow: 25,
    apiSemantics: 15, failureSafety: 15, engineering: 10, keyStructure: 5 }; }],
  ['similarity threshold', alignment => { alignment.basis = 'text-similarity'; alignment.similarity = 100; }],
  ['missing applicability', alignment => { delete alignment.aspects.applicability; }],
  ['missing requirement binding', alignment => { alignment.aspects.behavior.requirementRefs = []; }],
  ['missing evidence', alignment => { alignment.aspects.apiSemantics.refs = []; }],
  ['unexplained difference', alignment => { alignment.aspects.engineering.differences = ''; }],
  ['blocking unknown', alignment => { alignment.aspects.failureSafety.verdict = 'blocked'; }],
  ['missing reference', alignment => { delete alignment.referenceRef; }],
]) test('reference assessment rejects ' + label, t => {
  const f = fixture(t);
  mutate(f.record.final.referenceAlignment);
  assert.equal(f.run('S12', 'S12', true).allowed, false);
});

test('reference and compliance evidence must retain their actual bytes', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.dir, 'reference.js'), '\nchanged');
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('alignment cannot replace the current task contract with another hashed document', t => {
  const f = fixture(t);
  f.record.final.referenceAlignment.aspects.behavior.requirementRefs =
    [f.write('other-contract.txt', 'Unrelated requirements', 'TaskContract')];
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'REFERENCE_REQUIREMENTS'));
});

test('twenty frozen 0/5 items allow 95 but do not manufacture 97 or 98', t => {
  const f = fixture(t);
  f.reviews[0].scoreEvidence.requirements.items[0].score = 0;
  f.reviews[0].score.requirements = 20;
  let report = f.run('S1', 'S2');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.stages.S1.score, 95);
  for (const arbitrary of [22, 23]) {
    f.reviews[0].score.requirements = arbitrary;
    report = f.run('S1', 'S2');
    assert.equal(report.allowed, false);
    assert.equal(report.stages.S1.score, null);
  }
});

test('unevaluated item remains null and cannot receive PASS', t => {
  const f = fixture(t);
  f.reviews[0].scoreEvidence.requirements.items[0].score = null;
  f.reviews[0].scoreEvidence.requirements.items[0].refs = [];
  f.reviews[0].score.requirements = null;
  const report = f.run('S1', 'S2');
  assert.equal(report.allowed, false);
  assert.equal(report.stages.S1.score, null);
});

for (const [label, mutate] of [
  ['smaller denominator', scoring => { scoring.denominator = 95; }],
  ['arbitrary granularity', scoring => { scoring.granularity = 1; }],
  ['missing criterion', scoring => { scoring.items.pop(); }],
  ['duplicate criterion', scoring => { scoring.items[1] = scoring.items[0]; }],
  ['renamed criterion', scoring => { scoring.items[0].id = 'A6'; }],
  ['wrong dimension', scoring => { scoring.items[0].dimension = 'cost'; }],
  ['increased maximum', scoring => { scoring.items[0].maxPoints = 10; }],
  ['empty criterion', scoring => { scoring.items[0].criterion = ''; }],
  ['missing evidence requirement', scoring => { scoring.items[0].requiredEvidenceKinds = []; }],
]) test('frozen item scale rejects ' + label, t => {
  const f = fixture(t);
  rewriteAcceptance(f, acceptance => mutate(acceptance.stages.S1.scoring));
  const report = f.run('S1', 'S2');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCORING_CRITERIA'));
});

for (const [label, mutate] of [
  ['partial item score', items => { items[0].score = 3; }],
  ['omitted item', items => { items.pop(); }],
  ['duplicate item', items => { items[1] = items[0]; }],
  ['no evidence', items => { items[0].refs = []; }],
  ['no reasoning', items => { items[0].reason = ''; }],
]) test('item review rejects ' + label, t => {
  const f = fixture(t);
  mutate(f.reviews[0].scoreEvidence.requirements.items);
  const report = f.run('S1', 'S2');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCORING_CRITERIA'));
});

test('item evidence cannot borrow a future answer or use an empty file', t => {
  const f = fixture(t);
  f.reviews[0].scoreEvidence.requirements.items[0].refs = [f.reviews[10].outputs[1]];
  let report = f.run('S1', 'S2');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'FUTURE_OR_REFERENCE_INPUT'));
  f.reviews[0].scoreEvidence.requirements.items[0].refs = [f.write('empty.txt', '')];
  report = f.run('S1', 'S2');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'EMPTY_ARTIFACT'));
});

test('default repair budget rejects a fourth attempt even with fresh evidence', t => {
  const f = fixture(t);
  const prior = { ...f.reviews[9], attemptId: 'prior-3', repair: { attempt: 3, maxAttempts: 3 } };
  f.reviews[9].attemptId = 'repair-4';
  f.reviews[9].repair = { ownerStage: 'S10', attempt: 4, maxAttempts: 4,
    previousReviewRef: f.write('prior-3.json', JSON.stringify(prior), 'StageReview'),
    basisRefs: [f.write('new-repair-evidence.txt', 'New synthetic evidence does not extend the budget.')] };
  const report = f.run('S10', 'S11');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'REPAIR_BUDGET'));
});

test('explicit larger frozen repair budget needs actual bound authorization', t => {
  const f = fixture(t);
  const authorizationRef = f.write('repair-authorization.txt', 'Synthetic authorization for four attempts.');
  rewriteAcceptance(f, acceptance => {
    acceptance.stages.S10.repairBudget = { maxAttempts: 4, authorizationRef };
  });
  const prior = { ...f.reviews[9], attemptId: 'prior-3', repair: { attempt: 3, maxAttempts: 4 } };
  f.reviews[9].attemptId = 'repair-4';
  f.reviews[9].repair = { ownerStage: 'S10', attempt: 4, maxAttempts: 4,
    previousReviewRef: f.write('prior-3.json', JSON.stringify(prior), 'StageReview'),
    basisRefs: [f.write('new-repair-evidence.txt', 'Synthetic new repair basis.')] };
  let report = f.run('S10', 'S11');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  fs.appendFileSync(path.join(f.dir, authorizationRef.path), '\nchanged');
  report = f.run('S10', 'S11');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('missing explicit repair maximum defaults to three without resetting history', t => {
  const f = fixture(t);
  const prior = { ...f.reviews[9], attemptId: 'prior-2', repair: { attempt: 2 } };
  f.reviews[9].attemptId = 'repair-3';
  f.reviews[9].repair = { ownerStage: 'S10', attempt: 3,
    previousReviewRef: f.write('prior-2.json', JSON.stringify(prior), 'StageReview'),
    basisRefs: [f.write('new-repair-evidence.txt', 'Synthetic new repair basis.')] };
  const report = f.run('S10', 'S11');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

test('missed-check ownership is reported separately and never invented', t => {
  const f = fixture(t);
  f.reviews[7].hardFails = ['Synthetic semantic defect'];
  let report = f.run('S11', 'S12');
  assert.equal(report.missedCheckOwner, null);
  f.record.missedCheckOwner = { stage: 'S9', reason: 'Synthetic downstream review missed S8 defect',
    evidenceRefs: [f.reviews[8].evidence[0]] };
  report = f.run('S11', 'S12');
  assert.equal(report.failureOwner.stage, 'S8');
  assert.equal(report.missedCheckOwner.stage, 'S9');
  f.record.missedCheckOwner.evidenceRefs = [];
  report = f.run('S11', 'S12');
  assert.equal(report.missedCheckOwner, null);
  assert.ok(report.errors.some(error => error.code === 'MISSED_CHECK_OWNER'));
});

test('normal twelve-stage chain and final gate remain independent declarations', t => {
  const f = fixture(t);
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.final.referenceAlignment.verdict, 'compliant');
  assert.equal('referenceAlignmentScore' in report.final, false);
  assert.equal(Object.values(report.stages).filter(stage => stage.verdict === 'pass').length, 12);
  assert.ok(report.notEvaluated.some(item => /historical execution/.test(item)));
  const cli = spawnSync(process.execPath, [path.join(REPO, 'workflows/agent-to-recipe/scripts/check-workflow-stage.js'),
    '--record', path.join(f.dir, 'review.json'), '--root', 'run=' + f.dir, '--from', 'S2', '--to', 'S3'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).allowed, true);
});

test('S2 → S7 skip is rejected despite every synthetic review passing', t => {
  const report = fixture(t).run('S2', 'S7');
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'ROUTING_REQUIRED'));
});

test('S4 missing actual observation fails, blocks normal S5 and preserves confirmed S1–S3', t => {
  const f = fixture(t);
  f.reviews[3].evidence = [f.write('expected.txt', 'Expected 110', 'evidence')];
  const report = f.run('S4', 'S5');
  assert.equal(report.stages.S4.verdict, 'fail');
  assert.equal(report.firstInvalidBoundary, 'S4');
  assert.deepEqual(report.preservedUpstream, ['S1', 'S2', 'S3']);
  assert.ok(report.errors.some(error => error.code === 'MISSING_ACTUAL_ACTUALOBSERVATION'));
});

test('a high score cannot cancel a runtime hardcoded-value Hard Fail', t => {
  const f = fixture(t);
  f.reviews[8].hardFails.push('Expected 110 substituted for firstResult');
  const report = f.run('S9', 'S10');
  assert.equal(report.stages.S9.score, 100);
  assert.equal(report.firstInvalidBoundary, 'S9');
  assert.ok(report.errors.some(error => error.code === 'HARD_FAIL'));
});

test('later S11 finding assigns broken producer-consumer semantics to S8, not S11', t => {
  const f = fixture(t);
  f.reviews[10].findings = [{ blocking: true, ownerStage: 'S8',
    reason: 'firstResult incorrectly fixed in Business Step', evidence: [f.reviews[7].outputs[0]] }];
  const report = f.run('S11', 'S12');
  assert.equal(report.firstInvalidBoundary, 'S8');
  assert.deepEqual(report.failureOwner, { stage: 'S8', skill: 'procedure-synthesize' });
  assert.deepEqual(report.preservedUpstream, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
});

test('S10 repair retains S1–S9 and requires S11/S12 to consume repaired output', t => {
  const f = fixture(t);
  const prior = { ...f.reviews[9], attemptId: 'old-attempt', disposition: 'fail',
    hardFails: ['locator stale'] };
  const priorRef = f.write('S10-old-review.json', JSON.stringify(prior), 'StageReview');
  const repaired = f.write('S10-repaired.json', '{"locator":"new"}', 'StageOutput');
  const newBasis = f.write('S10-locator-observation.txt', 'New live locator preflight', 'evidence');
  f.reviews[9].attemptId = 'repair-2';
  f.reviews[9].repair = { ownerStage: 'S10', previousReviewRef: priorRef, basisRefs: [newBasis],
    attempt: 2, maxAttempts: 3 };
  f.reviews[9].outputs = [repaired];
  let report = f.run('S11', 'S12');
  assert.equal(report.firstInvalidBoundary, 'S11');
  assert.equal(report.stages.S10.verdict, 'pass');
  assert.deepEqual(report.preservedUpstream, Array.from({ length: 10 }, (_, i) => 'S' + (i + 1)));
  f.reviews[10].inputs = [f.record.acceptanceRef, repaired];
  report = f.run('S11', 'S12');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

test('same-class retry with no new evidence stops rather than manufacturing 95', t => {
  const f = fixture(t);
  const prior = { ...f.reviews[9], attemptId: 'old-attempt', disposition: 'fail',
    hardFails: ['locator stale'] };
  const oldRef = f.write('S10-old-review.json', JSON.stringify(prior), 'StageReview');
  f.reviews[9].attemptId = 'retry-2';
  f.reviews[9].repair = { ownerStage: 'S10', previousReviewRef: oldRef,
    basisRefs: [f.reviews[9].evidence[0]], attempt: 2, maxAttempts: 3 };
  const report = f.run('S10', 'S11');
  assert.equal(report.stages.S10.verdict, 'fail');
  assert.ok(report.errors.some(error => error.code === 'REPAIR_WITHOUT_NEW_BASIS'));
});

test('S1 score evidence cannot borrow future Candidate even before S2', t => {
  const f = fixture(t);
  f.reviews[0].scoreEvidence.requirements.refs = [f.reviews[10].outputs[1]];
  fs.appendFileSync(path.join(f.dir, 'candidate.js'), '// should not be opened by S1');
  const report = f.run('S1', 'S2');
  assert.ok(report.errors.some(error => error.code === 'FUTURE_OR_REFERENCE_INPUT'));
  assert.ok(!report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('a malformed S1 prefix cannot force reading S11 Candidate', t => {
  const f = fixture(t);
  f.record.stages = [f.reviews[10]];
  fs.appendFileSync(path.join(f.dir, 'candidate.js'), '// future should not be read');
  const report = f.run('S1', 'S2');
  assert.ok(report.errors.some(error => error.code === 'REVIEW_ORDER'));
  assert.ok(!report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('S11 manifest cannot name another script or dependencies', t => {
  const f = fixture(t);
  const badManifest = f.write('candidate-bad.json', JSON.stringify({ schemaVersion: 'agent-to-recipe/v1',
    scriptRef: 'elsewhere.js',
    dependencies: [] }), 'CandidateManifest');
  f.reviews[10].outputs[0] = badManifest;
  const report = f.run('S11', 'S12');
  assert.ok(report.errors.some(error => error.code === 'MANIFEST_BINDING'));
});

test('S11 manifest duplicate/ghost dependency cannot masquerade as complete set', t => {
  const f = fixture(t);
  const helper = f.write('helper.js', 'module.exports = 1;', 'helper');
  const ghost = { ...helper, path: 'missing-helper.js' };
  f.reviews[10].dependencies = [helper, helper];
  f.reviews[10].outputs[0] = f.write('candidate-bad.json', JSON.stringify({
    schemaVersion: 'agent-to-recipe/v1',
    scriptRef: f.reviews[10].outputs[1], scriptHash: f.reviews[10].outputs[1].sha256,
    dependencies: [helper, ghost] }), 'CandidateManifest');
  const report = f.run('S11', 'S12');
  assert.equal(report.firstInvalidBoundary, 'S11');
  assert.ok(report.errors.some(error => error.code === 'MANIFEST_BINDING'));
});

test('final rejects shrinkage of requested scenario/contract coverage', t => {
  const f = fixture(t);
  f.record.final.requestedScenarios = [{ id: 'convenient-subset', status: 'pass' }];
  f.record.final.requirementCriteria = f.record.final.requirementCriteria.slice(0, 1);
  const report = f.run('S12', 'S12', true);
  assert.ok(report.errors.some(error => error.code === 'REQUESTED_SCOPE'));
  assert.ok(report.errors.some(error => error.code === 'REQUIREMENT_COVERAGE'));
});

test('Qualification and final cannot jointly shrink a predeclared S12 request', t => {
  const f = fixture(t);
  const frozen = JSON.parse(fs.readFileSync(path.join(f.dir, 's12-request.json')));
  frozen.requested.push('variation');
  frozen.scenarios.push({ id: 'variation-01', scopeRefs: ['variation'],
    criterionRefs: ['data-flow', 'final-result'] });
  const frozenRef = f.write('s12-predeclared-expanded.json', JSON.stringify(frozen),
    'QualificationRequest', 'fresh-calculator-s12/v1');
  f.reviews[11].qualificationRequestRef = frozenRef;
  f.reviews[11].inputs = [f.record.acceptanceRef, ...f.reviews[10].outputs, frozenRef];
  // Qualification and final still agree with each other on a smaller scope.
  const report = f.run('S12', 'S12', true);
  assert.equal(report.firstInvalidBoundary, 'S12');
  assert.ok(report.errors.some(error => error.code === 'REQUESTED_SCOPE'));
});

test('candidate byte mutation invalidates S11 and old S12 Qualification', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.dir, 'candidate.js'), '// changed');
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S11');
  assert.notEqual(report.stages.S12.verdict, 'pass');
  assert.ok(report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('producer read declaration rejects reference answer and future output', t => {
  const f = fixture(t);
  f.reviews[0].audit.accessedRefs.push(f.write('examples/agent-to-recipe/calculator.js', 'reference trap', 'ReferenceAnswer'));
  const report = f.run('S1', 'S2');
  assert.equal(report.firstInvalidBoundary, 'S1');
  assert.ok(report.errors.some(error => error.code === 'FUTURE_OR_REFERENCE_INPUT'));
});

test('S1 frozen acceptance prevents dropping a failing required test', t => {
  const f = fixture(t);
  f.reviews[3].requiredTests = [];
  const report = f.run('S4', 'S5');
  assert.equal(report.stages.S4.verdict, 'fail');
  assert.ok(report.errors.some(error => error.code === 'TEST_SCOPE'));
});

test('actual artifact-chain runtime-role failure blocks S11 stage exit', t => {
  const chain = artifactFixture(t, source => {
    source.procedure.parameters = { ...source.procedure.parameters, firstResult: '110' };
  });
  const actual = checkArtifactChain({ ...chain.options, through: 'candidate' });
  assert.equal(actual.verdict, 'fail');
  const f = fixture(t);
  const reportRef = f.write('actual-check-artifact-chain.json', JSON.stringify(actual), 'ValidationReport');
  f.reviews[10].validationReports = [{ tool: actual.tool, boundary: 'candidate', reportRef }];
  const result = f.run('S11', 'S12');
  assert.equal(result.firstInvalidBoundary, 'S11');
  assert.ok(result.errors.some(error => error.code === 'VALIDATOR_FAILED'));
});

test('noncompliant reference aspect returns earliest evidenced failure owner and invalidates dependents', t => {
  const f = fixture(t);
  f.record.final.referenceAlignment.aspects.runtimeDataFlow.verdict = 'noncompliant';
  f.record.final.findings = [{ blocking: true, ownerStage: 'S8',
    reason: 'First invalid business data role at S8', evidence: [f.reviews[11].evidence[0]] }];
  const report = f.run('S12', 'S12', true);
  assert.equal(report.final.verdict, 'fail');
  assert.equal(report.firstInvalidBoundary, 'S8');
  assert.deepEqual(report.failureOwner, { stage: 'S8', skill: 'procedure-synthesize' });
  assert.equal(report.stages.S12.verdict, 'blocked');
});

test('invalid --final option cannot inspect future Candidate bytes', t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.dir, 'candidate.js'), '// future');
  const report = f.run('S1', 'S2', true);
  assert.ok(report.errors.some(error => error.code === 'INVALID_FINAL_TRANSITION'));
  assert.ok(!report.errors.some(error => error.code === 'HASH_MISMATCH'));
});

test('blocking final finding must invalidate actual owner even with a score of 100', t => {
  const f = fixture(t);
  f.record.final.findings = [{ blocking: true, ownerStage: 'S8',
    reason: 'S8 had wrong runtime data role', evidence: [f.reviews[11].evidence[0]] }];
  const report = f.run('S12', 'S12', true);
  assert.equal(report.firstInvalidBoundary, 'S8');
  assert.equal(report.allowed, false);
});

test('a failing scenario under requested scope cannot hide behind a passing scenario', t => {
  const f = fixture(t);
  const qualification = JSON.parse(fs.readFileSync(path.join(f.dir, 'S12-output.json')));
  qualification.scenarios.push({ id: 'second-run', scopeRefs: ['baseline'], verdict: 'fail',
    evidenceRefs: [f.reviews[11].evidence[0]] });
  qualification.failedCriteria = ['data-flow'];
  f.reviews[11].outputs = [f.write('S12-bad-qualification.json', JSON.stringify(qualification), 'QualificationRecord')];
  const report = f.run('S12', 'S12', true);
  assert.ok(report.errors.some(error => error.code === 'REQUESTED_SCOPE'));
});

test('validator report cannot smuggle reference answer to producer', t => {
  const f = fixture(t);
  f.reviews[7].validationReports = [{ tool: 'fake',
    reportRef: f.write('fake-validator.json', '{"tool":"fake","verdict":"pass"}', 'ReferenceAnswer') }];
  const report = f.run('S8', 'S9');
  assert.ok(report.errors.some(error => error.code === 'FUTURE_OR_REFERENCE_INPUT'));
});

test('malformed active review returns fail diagnostic through JS API', t => {
  const f = fixture(t);
  f.reviews[0].inputs = {};
  const report = f.run('S1', 'S2');
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, 'S1');
  assert.ok(report.errors.some(error => error.code === 'INVALID_REVIEW_STRUCTURE'));
});

test('actual AppProfile v1.1 bytes pass with exact v1.1 ref and reject mislabeled v1', t => {
  const f = fixture(t);
  const profile = f.write('S2-app-profile.json', JSON.stringify({
    schemaVersion: 'agent-to-recipe/app-profile/v1.1', appId: 'calculator' }),
  'AppProfile', 'agent-to-recipe/app-profile/v1.1');
  f.reviews[1].outputs.push(profile);
  let report = f.run('S2', 'S3');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  f.reviews[1].outputs[f.reviews[1].outputs.length - 1] = {
    ...profile, schemaVersion: 'agent-to-recipe/v1',
  };
  report = f.run('S2', 'S3');
  assert.equal(report.firstInvalidBoundary, 'S2');
  assert.ok(report.errors.some(error => error.code === 'SCHEMA_VERSION_MISMATCH'));
  f.reviews[1].inputs.unshift({ ...profile, kind: 'evidence', schemaVersion: 'text/v1' });
  report = f.run('S2', 'S3');
  assert.ok(report.errors.some(error => error.code === 'SCHEMA_VERSION_MISMATCH'),
    'An earlier opaque evidence read cannot bypass the structured-role check via cache.');
});

for (const channel of ['inputs', 'audit', 'scoreEvidence']) {
  test('S1 rejects future BusinessSteps before opening bytes through ' + channel, t => {
    const f = fixture(t);
    const future = f.write('S8-business-steps.json', JSON.stringify({
      schemaVersion: 'agent-to-recipe/v1', businessSteps: ['future answer'],
    }), 'BusinessSteps');
    if (channel === 'inputs') f.reviews[0].inputs.push(future);
    if (channel === 'audit') f.reviews[0].audit.accessedRefs.push(future);
    if (channel === 'scoreEvidence') f.reviews[0].scoreEvidence.requirements.refs.push(future);
    const open = fs.openSync;
    let futureOpens = 0;
    t.mock.method(fs, 'openSync', function(filename, ...args) {
      if (filename === path.join(f.dir, future.path)) futureOpens += 1;
      return open.call(this, filename, ...args);
    });
    const report = f.run('S1', 'S2');
    assert.equal(report.allowed, false);
    assert.equal(report.firstInvalidBoundary, 'S1');
    assert.ok(report.errors.some(error => error.code === 'FUTURE_OR_REFERENCE_INPUT'));
    assert.equal(futureOpens, 0, 'The future artifact must be rejected before reading its bytes.');
  });
}

test('BusinessSteps belong to S8 and can be consumed by S9', t => {
  const f = fixture(t);
  const business = f.write('business-steps.json', JSON.stringify({
    schemaVersion: 'agent-to-recipe/v1', businessSteps: ['current S8 output'],
  }), 'BusinessSteps');
  f.reviews[6].inputs.push(business);
  assert.equal(f.run('S7', 'S8').allowed, false);
  f.reviews[6].inputs.pop();
  f.reviews[7].outputs.push(business);
  f.reviews[7].audit.accessedRefs.push(business);
  f.reviews[8].inputs.push(business);
  f.reviews[8].audit.accessedRefs.push(business);
  const report = f.run('S9', 'S10');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

function rewriteQualification(f, mutate) {
  const ref = f.reviews[11].outputs[0];
  const qualification = JSON.parse(fs.readFileSync(path.join(f.dir, ref.path)));
  mutate(qualification);
  f.reviews[11].outputs = [f.write(ref.path, JSON.stringify(qualification), ref.kind)];
}

function rewriteQualificationRequest(f, mutate) {
  const prior = f.reviews[11].qualificationRequestRef;
  const request = JSON.parse(fs.readFileSync(path.join(f.dir, prior.path)));
  mutate(request);
  const next = f.write(prior.path, JSON.stringify(request), prior.kind, prior.schemaVersion);
  f.reviews[11].qualificationRequestRef = next;
  f.reviews[11].inputs = f.reviews[11].inputs.map(ref => ref === prior ? next : ref);
}

for (const field of ['input', 'oracle']) {
  test('Qualification rejects an explicit rewrite of frozen scenario ' + field, t => {
    const f = fixture(t);
    const planned = field === 'input' ? { expression: '6*110' } : { expected: '660' };
    const changed = field === 'input' ? { expression: '1' } : { expected: '1' };
    rewriteQualificationRequest(f, request => { request.scenarios[0][field] = planned; });
    rewriteQualification(f, record => { record.scenarios[0][field] = changed; });
    const report = f.run('S12', 'S12', true);
    assert.equal(report.allowed, false);
    assert.equal(report.firstInvalidBoundary, 'S12');
    assert.ok(report.errors.some(error => error.code === 'SCENARIO_DEFINITION'));
  });
}

test('same scenario definitions accept reordered object keys and distinct scenario/scope IDs', t => {
  const f = fixture(t);
  rewriteQualificationRequest(f, request => {
    request.scenarios[0].input = { expression: '6*110', source: 'runtime' };
    request.scenarios[0].oracle = { expected: '660', channel: 'display' };
  });
  rewriteQualification(f, record => {
    record.scenarios[0].input = { source: 'runtime', expression: '6*110' };
    record.scenarios[0].oracle = { channel: 'display', expected: '660' };
    assert.notEqual(record.scenarios[0].id, record.scenarios[0].scopeRefs[0]);
  });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

test('Observation evidence can carry actual inputs without repeating frozen definitions inline', t => {
  const f = fixture(t);
  rewriteQualificationRequest(f, request => {
    request.scenarios[0].input = { expression: '6*110' };
    request.scenarios[0].oracle = { expected: '660' };
  });
  const observation = f.write('actual-observation.json', JSON.stringify({
    scenarioId: 'fresh-run-01', input: { expression: '6*110' }, oracle: { expected: '660' }, observedResult: '660',
  }), 'Observation');
  rewriteQualification(f, record => { record.scenarios[0].evidenceRefs = [observation]; });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  fs.appendFileSync(path.join(f.dir, observation.path), '\n');
  const stale = f.run('S12', 'S12', true);
  assert.equal(stale.allowed, false);
  assert.ok(stale.errors.some(error => error.code === 'HASH_MISMATCH'));
});

function attachScenarioObservation(f, mutate = () => {}, inline = false) {
  const input = { expression: 'synthetic-A' };
  const oracle = { expected: 'synthetic-B' };
  rewriteQualificationRequest(f, request => {
    request.scenarios[0].input = input;
    request.scenarios[0].oracle = oracle;
  });
  const observation = { schemaVersion: 'agent-to-recipe/v1', scenarioId: 'fresh-run-01',
    requestRef: f.reviews[11].qualificationRequestRef,
    candidateRef: f.reviews[10].outputs.find(ref => ref.kind === 'CandidateManifest'),
    input: { ...input }, oracle: { ...oracle }, observedResult: 'synthetic-B' };
  mutate(observation);
  const observationRef = f.write('declared-observation.json', JSON.stringify(observation), 'Observation');
  rewriteQualification(f, qualification => {
    const actual = qualification.scenarios[0];
    if (inline) { actual.input = input; actual.oracle = oracle; }
    actual.evidenceRefs = [observationRef];
  });
  return observationRef;
}

test('version-bound Observation-only definitions independently match the frozen scenario', t => {
  const f = fixture(t);
  attachScenarioObservation(f);
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

for (const field of ['input', 'oracle']) {
  for (const inline of [false, true]) {
    test('declared Observation cannot change ' + field + ', inline=' + inline, t => {
      const f = fixture(t);
      attachScenarioObservation(f, observation => { observation[field] = { changed: true }; }, inline);
      const report = f.run('S12', 'S12', true);
      assert.equal(report.allowed, false);
      assert.equal(report.firstInvalidBoundary, 'S12');
      assert.ok(report.errors.some(error => error.code === 'SCENARIO_DEFINITION'));
      assert.equal(report.stages.S11.verdict, 'pass');
    });
  }
  test('Observation-only missing ' + field + ' verification cannot claim PASS', t => {
    const f = fixture(t);
    attachScenarioObservation(f, observation => { delete observation[field]; });
    const report = f.run('S12', 'S12', true);
    assert.equal(report.allowed, false);
    assert.ok(report.errors.some(error => error.code === 'SCENARIO_VERIFICATION_REQUIRED'));
  });
}

for (const [label, mutate] of [
  ['another scenario', observation => { observation.scenarioId = 'another'; }],
  ['no scenario identity', observation => { delete observation.scenarioId; }],
  ['wrong declared schema', observation => { observation.schemaVersion = 'unknown/v1'; }],
  ['another request version', observation => { observation.requestRef = { ...observation.requestRef, sha256: 'a'.repeat(64) }; }],
  ['another candidate version', observation => { observation.candidateRef = { ...observation.candidateRef, sha256: 'a'.repeat(64) }; }],
]) test('declared scenario evidence rejects ' + label, t => {
  const f = fixture(t);
  attachScenarioObservation(f, mutate);
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCENARIO_EVIDENCE_BINDING'));
});

test('a second contradictory Observation cannot hide behind the first matching Observation', t => {
  const f = fixture(t);
  attachScenarioObservation(f);
  const changed = f.write('contradictory-observation.json', JSON.stringify({
    scenarioId: 'fresh-run-01', input: { expression: 'changed' }, oracle: { expected: 'synthetic-B' },
  }), 'Observation');
  rewriteQualification(f, qualification => { qualification.scenarios[0].evidenceRefs.push(changed); });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCENARIO_DEFINITION'));
});

test('raw evidence remains opaque when exact scenario definitions are verified inline', t => {
  const f = fixture(t);
  attachScenarioObservation(f, () => {}, true);
  const raw = f.write('raw-observation.json', JSON.stringify({
    input: 'unrelated raw device channel', oracle: 'not a declared scenario definition',
  }), 'RawCapture', 'raw-capture/v1');
  rewriteQualification(f, qualification => { qualification.scenarios[0].evidenceRefs = [raw]; });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

for (const [kind, schemaVersion, filename] of [
  ['RawCapture', 'raw-capture/v1', 'raw.json'],
  ['Observation', 'unsupported-observation/v1', 'unknown.json'],
  ['Observation', 'agent-to-recipe/v1', 'raw.txt'],
]) test('opaque evidence cannot replace missing scenario verification: ' + filename, t => {
  const f = fixture(t);
  attachScenarioObservation(f);
  const raw = f.write(filename, JSON.stringify({ scenarioId: 'fresh-run-01',
    input: { expression: 'synthetic-A' }, oracle: { expected: 'synthetic-B' }, verdict: 'pass',
  }), kind, schemaVersion);
  rewriteQualification(f, qualification => { qualification.scenarios[0].evidenceRefs = [raw]; });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCENARIO_VERIFICATION_REQUIRED'));
});

test('malformed declared Observation JSON cannot be accepted as a matching definition', t => {
  const f = fixture(t);
  attachScenarioObservation(f);
  const malformed = f.write('malformed-observation.json', '{', 'Observation');
  rewriteQualification(f, qualification => { qualification.scenarios[0].evidenceRefs = [malformed]; });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCENARIO_EVIDENCE_INVALID'));
});

for (const refs of [undefined, [], ['data-flow'], ['data-flow', 'invented-criterion']]) {
  test('Qualification rejects lost or unknown scenario criteria: ' + JSON.stringify(refs), t => {
    const f = fixture(t);
    rewriteQualification(f, record => { record.scenarios[0].criterionRefs = refs; });
    const report = f.run('S12', 'S12', true);
    assert.equal(report.allowed, false);
    assert.equal(report.firstInvalidBoundary, 'S12');
    assert.ok(report.errors.some(error => error.code === 'SCENARIO_CRITERIA'));
  });
}

test('predeclared scenario criteria must refer to the frozen TaskContract', t => {
  const f = fixture(t);
  rewriteQualificationRequest(f, request => { request.scenarios[0].criterionRefs.push('invented'); });
  rewriteQualification(f, record => { record.scenarios[0].criterionRefs.push('invented'); });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'SCENARIO_CRITERIA'));
});

test('scenario criteria may be reordered while retaining every requested criterion', t => {
  const f = fixture(t);
  rewriteQualification(f, record => { record.scenarios[0].criterionRefs.reverse(); });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
});

for (const exercised of [false, true]) {
  test('qualified cannot add unrequested scope, even if exercised=' + exercised, t => {
    const f = fixture(t);
    rewriteQualification(f, record => {
      record.qualificationScope.qualified.push('unrequested');
      if (exercised) {
        record.qualificationScope.exercised.push('unrequested');
        record.scenarios.push({ id: 'extra-observation', scopeRefs: ['unrequested'],
          verdict: 'pass', evidenceRefs: [f.reviews[11].evidence[0]] });
      }
    });
    const report = f.run('S12', 'S12', true);
    assert.equal(report.allowed, false);
    assert.ok(report.errors.some(error => error.code === 'REQUESTED_SCOPE'));
  });
}

test('requested qualified scope still needs actual exercise and a passing scenario', t => {
  const f = fixture(t);
  rewriteQualification(f, record => { record.qualificationScope.exercised = []; });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, false);
  assert.ok(report.errors.some(error => error.code === 'REQUESTED_SCOPE'));
});

test('S12 evidence repair preserves frozen scenario and Candidate with a distinct attempt', t => {
  const f = fixture(t);
  const candidateRefs = structuredClone(f.reviews[10].outputs);
  const priorRef = f.write('S12-old-review.json', JSON.stringify({ ...f.reviews[11],
    attemptId: 'old-attempt', disposition: 'fail', hardFails: ['missing independent observation'],
  }), 'StageReview');
  const newBasis = f.write('S12-new-observation.txt', 'Synthetic corrected independent observation', 'Observation');
  f.reviews[11].attemptId = 'repair-2';
  f.reviews[11].repair = { ownerStage: 'S12', previousReviewRef: priorRef,
    basisRefs: [newBasis], attempt: 2, maxAttempts: 2 };
  rewriteQualification(f, record => { record.scenarios[0].evidenceRefs = [newBasis]; });
  const report = f.run('S12', 'S12', true);
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.deepEqual(f.reviews[10].outputs, candidateRefs);
});

test('stage checker exposes a bounded human-review projection without changing the authoritative verdict', t => {
  const f = fixture(t);
  const report = f.run('S7', 'S8');
  assert.equal(report.allowed, true, JSON.stringify(report.errors));
  assert.equal(report.taskId, 't');
  assert.equal(report.attemptId, 'a');
  assert.equal(report.planRevision, 'r1');
  assert.equal(report.stages.S7.owner, 'trace-distill');
  assert.equal(report.stages.S7.score, 100);
  assert.deepEqual(report.stages.S7.scoreDimensions,
    { requirements: 25, responsibility: 20, continuation: 20, validation: 20, cost: 15 });
  assert.equal(report.stages.S7.hardFails.length, 0);
  assert.equal(report.stages.S7.blockingUnknowns.length, 0);
  assert.equal(report.stages.S7.requiredTests[0].status, 'pass');
  assert.ok(report.stages.S7.outputs.length > 0);
  assert.ok(report.stages.S7.evidence.length > 0);
});

test('stage checker projection preserves a high score while independently failing on Hard Fail', t => {
  const f = fixture(t);
  f.reviews[6].hardFails = ['synthetic hard fail'];
  const report = f.run('S7', 'S8');
  assert.equal(report.allowed, false);
  assert.equal(report.stages.S7.score, 100);
  assert.equal(report.stages.S7.verdict, 'fail');
  assert.deepEqual(report.stages.S7.hardFails, ['synthetic hard fail']);
  assert.equal(report.firstInvalidBoundary, 'S7');
});

test('workflow stage CLI can render the same authoritative result as Markdown', t => {
  const f = fixture(t);
  f.run('S7', 'S8');
  const cli = spawnSync(process.execPath, [path.join(REPO, 'workflows/agent-to-recipe/scripts/check-workflow-stage.js'),
    '--record', path.join(f.dir, 'review.json'), '--root', 'run=' + f.dir, '--from', 'S7', '--to', 'S8',
    '--format', 'markdown'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /# Agent-to-Recipe Stage Review/);
  assert.match(cli.stdout, /## S7/);
  assert.match(cli.stdout, /trace-distill/);
});
