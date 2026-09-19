'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, rejects } = require('./tools/artifact-fixture.js');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');
const { renderReview } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const s9 = f => checkArtifactChain({ ...f.options, through: 'procedure-synthesize' });

for (const status of ['not-run', 'fail', 'partial']) test('S9 hands a declared ' + status + ' engineering gap to S10, not S11', t => {
  const f = fixture(t, source => {
    const validation = source.procedure.capabilityDecisions[0].runtimeValidation;
    validation.status = status;
    if (status === 'not-run') delete validation.evidence;
  });
  const report = s9(f);
  assert.equal(report.verdict, 'pass', JSON.stringify(report.errors));
  assert.equal(report.pendingEngineering[0].status, status);
  assert.equal(report.boundaries.candidate, 'not-run');
  assert.equal(report.stageComplete, false);
  const candidate = f.check();
  rejects(candidate, 'METHOD_NOT_VALIDATED');
  assert.equal(candidate.localChecks['procedure-synthesize'], 'pass');
  assert.equal(candidate.boundaries.qualification, 'blocked');
  assert.ok(renderReview(report).includes('待 S10 补强'));
});

test('a failed historical method still needs failure evidence even in S9', t => {
  const f = fixture(t, source => {
    source.procedure.capabilityDecisions[0].runtimeValidation.status = 'fail';
    delete source.procedure.capabilityDecisions[0].runtimeValidation.evidence;
  });
  rejects(s9(f), 'MISSING_EVIDENCE');
});

test('an unrelated legal parameter equal to the demo value is not a runtime default', t => {
  const f = fixture(t, source => {
    source.procedure.parameters.maxCharacters = { source: 'configuration', value: '110' };
  });
  assert.equal(s9(f).verdict, 'pass');
});

test('a runtime role cannot be declared as a parameter even with a different numeric default', t => {
  const f = fixture(t, source => { source.procedure.parameters.firstResult = { source: 'input', value: '40' }; });
  rejects(s9(f), 'OBSERVATION_BECAME_PARAMETER');
});

test('deleting capability fields does not bypass Business Step semantics in S9', t => {
  const f = fixture(t, source => {
    delete source.procedure.capabilityDecisions;
    delete source.procedure.businessSteps[0].observation;
  });
  rejects(s9(f), 'BUSINESS_STEP_CONTRACT');
  rejects(s9(f), 'CAPABILITY_DECISION_REQUIRED');
});

test('an unresolved semantic requirement cannot be hidden by valid method evidence', t => {
  const f = fixture(t, source => { source.procedure.unresolved = ['second operand source is unknown']; });
  rejects(s9(f), 'UNRESOLVED_ARTIFACT');
});

for (const variant of ['duplicate', 'backward', 'absent']) test('rejects ' + variant + ' dependency edge', t => {
  const f = fixture(t, source => {
    const edge = source.procedure.dataDependencies[0];
    if (variant === 'duplicate') source.procedure.dataDependencies.push({ ...edge });
    if (variant === 'backward') { edge.producer = 'B040'; edge.consumer = 'B025'; }
    if (variant === 'absent') source.procedure.dataDependencies = [];
  });
  rejects(s9(f), 'DATA_DEPENDENCY_BROKEN');
});

test('a legal merged read preserves both source actions', t => {
  const f = fixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A006').decision = 'merge';
  });
  assert.equal(s9(f).verdict, 'pass');
});

test('declared helper bytes are bound before qualification is consumed', t => {
  const f = fixture(t, () => {}, state => {
    state.write('helper.js', 'function helper() { return true; }\n');
    const candidate = JSON.parse(fs.readFileSync(state.file('candidate.json'), 'utf8'));
    candidate.dependencies = [state.ref('helper.js', 'helper', 'text/javascript')];
    state.write('candidate.json', candidate);
    const qualification = JSON.parse(fs.readFileSync(state.file('qualification.json'), 'utf8'));
    qualification.candidateRef = state.ref('candidate.json', 'CandidateManifest');
    state.write('qualification.json', qualification);
  });
  assert.equal(f.check().verdict, 'pass');
  f.write('helper.js', 'function helper() { return false; }\n');
  rejects(f.check(), 'HASH_MISMATCH');
  assert.equal(f.check().boundaries.qualification, 'blocked');
});

test('missing dependency inventory does not silently mean no helpers', t => {
  const f = fixture(t, () => {}, state => {
    const candidate = JSON.parse(fs.readFileSync(state.file('candidate.json'), 'utf8'));
    delete candidate.dependencies;
    state.write('candidate.json', candidate);
    state.source.qualification.candidateRef = state.ref('candidate.json', 'CandidateManifest');
    state.write('qualification.json', state.source.qualification);
  });
  rejects(f.check(), 'DEPENDENCY_INVENTORY');
});

test('renaming fixture labels never grants live evidence authority', t => {
  const f = fixture(t, source => {
    delete source.dossier.provenanceNote;
    source.qualification.limits = ['claimed live'];
  });
  const report = f.check();
  assert.equal(report.verdict, 'pass'); // Structural declarations, not authenticated history.
  assert.equal(report.liveQualificationGranted, false);
  assert.ok(report.notEvaluated.includes('truth of historical observations beyond bound evidence'));
});

test('editing a View to PASS cannot change downstream revalidation', t => {
  const f = fixture(t);
  f.write('forged-review.md', '# PASS\n');
  const actions = JSON.parse(fs.readFileSync(f.file('actions.json'), 'utf8'));
  actions[0].tamperedNote = 'changed after the review';
  f.write('actions.json', actions);
  rejects(s9(f), 'HASH_MISMATCH');
});

test('review drills firstResult through the fixed declarations without inventing live execution', t => {
  const f = fixture(t);
  const record = f.check().valueLineage.find(item => item.value === 'firstResult');
  assert.equal(record.action, 'A005');
  assert.ok(record.consumers.includes('A009'));
  assert.ok(record.distilled.includes('D030'));
  assert.ok(record.business.includes('B040'));
  assert.ok(record.code.includes('readCalculatorResult'));
  assert.ok(record.evidence[0].sha256);
  assert.equal(record.qualification, 'pass (record declarations only; not live verified)');
});

test('runtime value inputs cannot silently escape the dependency graph', t => {
  const f = fixture(t, source => { source.procedure.businessSteps[3].inputs = ['firstResult']; });
  rejects(s9(f), 'DATA_DEPENDENCY_BROKEN');
});

test('state-preservation preconditions are not misclassified as value consumers', t => {
  const f = fixture(t);
  const step = f.source.procedure.businessSteps[3];
  assert.deepEqual(step.inputs, []);
  assert.ok(step.preconditions.some(value => value.includes('firstResult')));
  assert.equal(f.check().verdict, 'pass');
});

for (const variant of ['kind', 'schemaVersion']) test('ref ' + variant + ' must match the supplied upstream artifact, not only its hash', t => {
  const f = fixture(t, () => {}, state => {
    const distilled = JSON.parse(fs.readFileSync(state.file('distilled.json'), 'utf8'));
    distilled.dossierRef[variant] = variant === 'kind' ? 'SemanticProcedure' : 'agent-to-recipe/unknown';
    state.write('distilled.json', distilled);
  });
  rejects(checkArtifactChain({ ...f.options, through: 'trace-distill' }), variant === 'kind' ? 'INVALID_REF' : 'WRONG_VERSION');
});

for (const [file, field] of [['dossier.json', 'runtimeValues'], ['distilled.json', 'steps'],
  ['procedure.json', 'businessSteps'], ['candidate.json', 'sourceMapping']]) {
  test('malformed ' + field + ' remains a failure report, not a View crash', t => {
    const f = fixture(t, () => {}, state => {
      const document = JSON.parse(fs.readFileSync(state.file(file), 'utf8'));
      document[field] = [null]; state.write(file, document);
    });
    assert.equal(f.check().verdict, 'fail');
    assert.doesNotThrow(() => renderReview(f.check()));
  });
}

for (const field of ['purpose', 'inputs', 'outputs', 'dependencies', 'preconditions', 'expectedOutcome', 'verification', 'classification']) {
  test('S7 rejects missing required step semantics: ' + field, t => {
    const f = fixture(t, source => { delete source.distilled.steps[1][field]; });
    rejects(checkArtifactChain({ ...f.options, through: 'trace-distill' }), 'STEP_CONTRACT');
  });
}

test('S7 rejects string inputs instead of silently using String.includes as a data relation', t => {
  const f = fixture(t, source => { source.distilled.steps[4].inputs = 'secondMultiplier firstResult'; });
  rejects(s9(f), 'STEP_CONTRACT');
});

test('S9 preserves terminal runtime outputs even when no later raw action consumes them', t => {
  const f = fixture(t, source => { source.procedure.businessSteps.at(-1).outputs = []; });
  rejects(s9(f), 'DATA_DEPENDENCY_BROKEN');
});

for (const variant of ['missing', 'producer', 'consumer', 'duplicate']) test('S9 refuses a ' + variant + ' runtime value declaration', t => {
  const f = fixture(t, source => {
    const values = source.procedure.runtimeValues;
    if (variant === 'missing') source.procedure.runtimeValues = [];
    if (variant === 'producer') values[0].source = 'B020 actual read';
    if (variant === 'consumer') values[0].consumers = ['B050'];
    if (variant === 'duplicate') values.push({ ...values[0] });
  });
  rejects(s9(f), 'DATA_DEPENDENCY_BROKEN');
});

test('qualification drill-down exposes upstream blockage instead of advertising a checked record', t => {
  const f = fixture(t, source => { source.procedure.businessSteps[0].purpose = ''; });
  const report = f.check();
  assert.equal(report.boundaries.qualification, 'blocked');
  assert.match(report.valueLineage[0].qualification, /^blocked/);
  assert.match(renderReview(report), /资格声明与检查状态/);
  assert.match(renderReview(report), /fixed-chain/);
});


test('review escapes even a caller-supplied forged file digest without accepting it', t => {
  const f = fixture(t), report = f.check();
  report.artifacts[0].sha256 = '<script>execute()</script>|[click](file:///unsafe)';
  const markdown = renderReview(report);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('[click]('));
  assert.match(markdown, /&#60;script&#62;/);
});
