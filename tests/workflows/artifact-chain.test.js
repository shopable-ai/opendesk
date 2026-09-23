'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');

const { fixture, rejects, REPO, SOURCE, EXPECTED, clone } = require('./tools/artifact-fixture.js');

test('accepts the frozen producer-to-consumer slice without treating Oracles as inputs', t => {
  const f = fixture(t);
  const report = f.check();
  assert.equal(report.verdict, EXPECTED.positive.verdict);
  assert.deepEqual(report.boundaries, {
    bindings: 'pass', 'trace-distill': 'pass', 'procedure-synthesize': 'pass',
    candidate: 'pass', qualification: 'pass',
  });
  assert.ok(report.notEvaluated.includes('desktop actions or OS input events'));
  assert.ok(!fs.readFileSync(f.file('candidate.js'), 'utf8').includes(EXPECTED.positive.finalResult));
});

test('rejects a runtime value without critical evidence', t => {
  const f = fixture(t, source => { source.dossier.runtimeValues[0].evidence = null; });
  rejects(f.check(), 'MISSING_EVIDENCE');
});

test('a planned input cannot stand in for the actual consumer of a UI read', t => {
  const f = fixture(t, source => { source.actions[8].kind = 'planned-input'; });
  rejects(f.check(), 'HISTORICAL_FACT_UNBOUND');
});

test('a future Business Step cannot be cited as a raw trace consumer', t => {
  const f = fixture(t, source => { source.dossier.runtimeValues[0].consumers.push('B040'); });
  rejects(f.check(), 'HISTORICAL_FACT_UNBOUND');
});

for (const wrong of [false, true]) test('legacy WorkPlan without taskId '+(wrong?'rejects a wrong contract':'binds its exact contract'), t => {
  const f = fixture(t, () => {}, state => {
    const plan = JSON.parse(fs.readFileSync(state.file('plan.json'), 'utf8'));
    plan.contractRef = state.ref('contract.json', 'TaskContract');
    if (wrong) plan.contractRef.sha256 = '0'.repeat(64);
    delete plan.taskId;
    state.write('plan.json', plan);
    const dossier = JSON.parse(fs.readFileSync(state.file('dossier.json'), 'utf8'));
    dossier.workPlanRef = state.ref('plan.json', 'WorkPlan');
    state.write('dossier.json', dossier);
    const distilled = JSON.parse(fs.readFileSync(state.file('distilled.json'), 'utf8'));
    distilled.workPlanRef = state.ref('plan.json', 'WorkPlan');
    distilled.dossierRef = state.ref('dossier.json', 'Dossier');
    state.write('distilled.json', distilled);
  });
  const report = checkArtifactChain({...f.options, through:'trace-distill'});
  if (wrong) rejects(report, 'MIXED_TASK');
  else assert.equal(report.boundaries['trace-distill'], 'pass', JSON.stringify(report.errors));
});

test('rejects a Procedure that omits Recipe-driving capability decisions', t => {
  const f = fixture(t, source => { delete source.procedure.capabilityDecisions; });
  rejects(f.check(), 'CAPABILITY_DECISION_REQUIRED');
});

test('rejects field deletion as a legacy downgrade of the same v1 consumption request', t => {
  const f = fixture(t, source => {
    delete source.procedure.capabilityDecisions;
    for (const mapping of source.candidate.sourceMapping) delete mapping.capabilityDecisionRefs;
  }, state => {
    const candidate = JSON.parse(fs.readFileSync(state.file('candidate.json'), 'utf8'));
    candidate.apiRefs = [state.ref('api/window-get.md', 'CanonicalAPIContract', 'text/markdown')];
    state.write('candidate.json', candidate);
    const qualification = JSON.parse(fs.readFileSync(state.file('qualification.json'), 'utf8'));
    qualification.candidateRef = state.ref('candidate.json', 'CandidateManifest');
    state.write('qualification.json', qualification);
  });
  const report = f.check();
  rejects(report, 'CAPABILITY_DECISION_REQUIRED');
  assert.deepEqual(report.proves, []);
});

test('requires modern Business Steps to expose input, execution, observation, stop and consumer contracts', t => {
  const f = fixture(t, source => {
    delete source.procedure.businessSteps.find(step => step.stepId === 'B025').observation;
  });
  rejects(f.check(), 'BUSINESS_STEP_CONTRACT');
});

test('keeps capability discovery separate from method selection', t => {
  const f = fixture(t, source => {
    source.procedure.capabilityDecisions[0].discoveryPath = ['docs/api/window.md'];
  });
  rejects(f.check(), 'DISCOVERY_PATH');
});

test('rejects ambiguous method selection with two selected candidates', t => {
  const f = fixture(t, source => {
    source.procedure.capabilityDecisions.find(item => item.decisionId === 'CD-input')
      .candidates[1].disposition = 'selected';
  });
  rejects(f.check(), 'METHOD_SELECTION');
});

test('requires a content-bound canonical contract for the selected method', t => {
  const f = fixture(t, source => {
    delete source.procedure.capabilityDecisions.find(item => item.decisionId === 'CD-read')
      .candidates[0].contract;
  });
  rejects(f.check(), 'MISSING_EVIDENCE');
});

test('does not upgrade documentation existence into runtime validation', t => {
  const f = fixture(t, source => {
    source.procedure.capabilityDecisions.find(item => item.decisionId === 'CD-input')
      .runtimeValidation.status = 'not-run';
  });
  rejects(f.check(), 'METHOD_NOT_VALIDATED');
});

test('requires evidence for a candidate recorded as failed', t => {
  const f = fixture(t, source => {
    delete source.procedure.capabilityDecisions.find(item => item.decisionId === 'CD-input')
      .candidates[1].validationEvidence;
  });
  rejects(f.check(), 'MISSING_EVIDENCE');
});

test('requires Candidate sourceMapping to consume every capability decision', t => {
  const f = fixture(t, source => {
    for (const mapping of source.candidate.sourceMapping) {
      mapping.capabilityDecisionRefs = (mapping.capabilityDecisionRefs || [])
        .filter(id => id !== 'CD-window-activate');
    }
  });
  rejects(f.check(), 'CAPABILITY_SOURCE_MAPPING');
});

test('requires Candidate apiRefs to carry selected canonical contracts', t => {
  const f = fixture(t, () => {}, state => {
    const candidate = JSON.parse(fs.readFileSync(state.file('candidate.json'), 'utf8'));
    candidate.apiRefs = candidate.apiRefs.filter(ref => !ref.path.endsWith('ui-read-text.md'));
    state.write('candidate.json', candidate);
    const qualification = JSON.parse(fs.readFileSync(state.file('qualification.json'), 'utf8'));
    qualification.candidateRef = state.ref('candidate.json', 'CandidateManifest');
    state.write('qualification.json', qualification);
  });
  rejects(f.check(), 'API_REF_MISMATCH');
});

test('rejects a qualification from another attempt or revision', t => {
  const f = fixture(t, source => { source.qualification.revision = 'fixture-q999'; });
  rejects(f.check(), 'MIXED_ATTEMPT');
});

test('rejects input whose side-effect outcome is unknown', t => {
  const f = fixture(t, source => { source.actions[8].data.receipt.completed[0].actionState = 'unknown'; });
  rejects(f.check(), 'SIDE_EFFECT_UNKNOWN');
});

test('rejects an overall pass that covers only part of requested scope', t => {
  const f = fixture(t, source => { source.qualification.qualificationScope.qualified = ['fixed-chain']; });
  rejects(f.check(), 'PARTIAL_QUALIFICATION');
});


test('requires Candidate and Qualification to bind the exact TaskContract', t => {
  const f = fixture(t, () => {}, state => {
    const candidate = JSON.parse(fs.readFileSync(state.file('candidate.json'), 'utf8'));
    delete candidate.contractRef;
    state.write('candidate.json', candidate);
    const qualification = JSON.parse(fs.readFileSync(state.file('qualification.json'), 'utf8'));
    qualification.candidateRef = state.ref('candidate.json', 'CandidateManifest');
    delete qualification.contractRef;
    state.write('qualification.json', qualification);
  });
  rejects(f.check(), 'INVALID_REF');
});

test('rejects qualified scope that has no passing scenario evidence', t => {
  const f = fixture(t, source => {
    source.qualification.qualificationScope.requested.push('repeatability');
    source.qualification.qualificationScope.exercised.push('repeatability');
    source.qualification.qualificationScope.qualified.push('repeatability');
  });
  rejects(f.check(), 'QUALIFICATION_SCOPE_UNPROVEN');
});

test('rejects a scenario that claims scope which was not exercised', t => {
  const f = fixture(t, source => {
    source.qualification.scenarios[0].scopeRefs.push('desktop-runtime');
  });
  rejects(f.check(), 'QUALIFICATION_SCENARIO_SCOPE');
});

test('rejects qualified scope outside the requested range', t => {
  const f = fixture(t, source => {
    source.qualification.qualificationScope.exercised.push('extra-scope');
    source.qualification.qualificationScope.qualified.push('extra-scope');
    source.qualification.scenarios[0].scopeRefs.push('extra-scope');
  });
  rejects(f.check(), 'PARTIAL_QUALIFICATION');
});

test('rejects a pass with missing qualification lineage', t => {
  const f = fixture(t, source => {
    delete source.qualification.qualificationScope.lineage;
  });
  rejects(f.check(), 'QUALIFICATION_SCOPE');
});

test('rejects distillation that deletes a necessary runtime read', t => {
  const f = fixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A005').decision = 'omit';
  });
  rejects(f.check(), 'NECESSARY_ACTION_OMITTED');
});

test('rejects distillation that deletes actual state preparation', t => {
  const f = fixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A002').decision = 'omit';
  });
  rejects(f.check(), 'NECESSARY_ACTION_OMITTED');
});

test('rejects deduplication of a legitimate repeated digit', t => {
  const f = fixture(t, source => { source.actions[8].data.names = ['6', '×', '1', '0', '=']; });
  rejects(f.check(), 'DATA_DEPENDENCY_BROKEN');
});

test('rejects a Procedure that drops the runtime producer-consumer dependency', t => {
  const f = fixture(t, source => { source.procedure.dataDependencies = []; });
  rejects(f.check(), 'DATA_DEPENDENCY_BROKEN');
});

test('rejects code that reads firstResult but consumes fixed 110', t => {
  const f = fixture(t, source => {
    source.candidateSource = source.candidateSource.replace("['6', '×', ...firstResult, '=']", "['6', '×', '1', '1', '0', '=']");
  });
  rejects(f.check(), 'DATA_DEPENDENCY_BROKEN');
});

test('rejects a post-hoc explanation presented as historical firstResult provenance', t => {
  const f = fixture(t, source => { source.dossier.runtimeValues[0].origin = 'inferred later from the final successful result'; });
  rejects(f.check(), 'HISTORICAL_FACT_UNBOUND');
});

test('rejects changed script bytes with an old Candidate and Qualification', t => {
  const f = fixture(t, () => {}, state => {
    state.write('candidate.js', fs.readFileSync(state.file('candidate.js'), 'utf8') + '// changed after freeze\n');
  });
  rejects(f.check(), 'HASH_MISMATCH');
});

test('does not over-reject omission of a nonessential screenshot', t => {
  const f = fixture(t, source => {
    source.distilled.steps.find(step => step.stepId === 'D030').sourceActionRefs = ['A005'];
    const decision = source.distilled.actionDecisions.find(item => item.actionRef === 'A006');
    decision.decision = 'omit'; delete decision.stepRef;
  });
  assert.equal(f.check().verdict, 'pass');
});

for (const decoration of [
  "// await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);\n",
  "/* await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']); */\n",
  "const example = \"clickCalculatorButtons(win, [...firstResult])\";\n",
]) test('does not treat comments or quoted examples as runtime consumers: ' + decoration.slice(0, 12), t => {
  const f = fixture(t, source => {
    source.candidateSource = source.candidateSource.replace("['6', '×', ...firstResult, '=']", "['6', '×', '1', '1', '0', '=']") + decoration;
  });
  rejects(f.check(), 'DATA_DEPENDENCY_BROKEN');
});

test('rejects a retained action missing from its declared step', t => {
  const f = fixture(t, source => { source.distilled.steps[2].sourceActionRefs = ['A006']; });
  rejects(f.check(), 'ACTION_DECISION');
});

test('rejects a self-dependent distilled step', t => {
  const f = fixture(t, source => { source.distilled.steps[0].dependencies = ['D010']; });
  rejects(f.check(), 'STEP_ORDER');
});

test('rejects a reordered Procedure despite complete source coverage', t => {
  const f = fixture(t, source => { source.procedure.businessSteps.reverse(); });
  rejects(f.check(), 'STEP_ORDER');
});

test('rejects a declared producer unrelated to the actual read despite matching output names', t => {
  const f = fixture(t, source => {
    source.procedure.businessSteps[0].outputs.push('firstResult');
    source.procedure.dataDependencies[0].producer = 'B010';
  });
  const report = f.check();
  rejects(report, 'DATA_DEPENDENCY_BROKEN');
  assert.equal(report.boundaries['procedure-synthesize'], 'fail');
});

test('rejects a second raw disposition maintained inside Procedure', t => {
  const f = fixture(t, source => { source.procedure.actionDecisions = source.distilled.actionDecisions; });
  rejects(f.check(), 'DUPLICATE_DISPOSITION');
});

test('requires explicit side-effect state', t => {
  const f = fixture(t, source => { delete source.dossier.sideEffects; });
  rejects(f.check(), 'SIDE_EFFECT_UNKNOWN');
});

test('a failed Qualification cannot pass a normal consumer chain', t => {
  const f = fixture(t, source => { source.qualification.verdict = 'fail'; });
  rejects(f.check(), 'QUALIFICATION_NOT_PASSED');
});

for (const [field, code] of [['actions', 'ACTIONS_REQUIRED'], ['procedure', 'BUSINESS_STEPS']]) {
  test('returns a failure report for malformed ' + field + ' instead of throwing', t => {
    const f = fixture(t, source => {
      if (field === 'actions') source.actions = {};
      else source.procedure.businessSteps = null;
    });
    rejects(f.check(), code);
  });
}

test('unreadable inputs leave downstream boundaries not-run', t => {
  const f = fixture(t);
  fs.unlinkSync(f.file('actions.json'));
  const report = f.check();
  assert.equal(report.verdict, 'fail');
  assert.equal(report.boundaries['trace-distill'], 'not-run');
  assert.equal(report.boundaries.qualification, 'not-run');
});

test('CLI reports semantic and usage failures separately and never executes candidate', t => {
  const f = fixture(t, source => { source.actions = {}; });
  const cli = path.join(REPO, 'workflows/agent-to-recipe/scripts/check-artifact-chain.js');
  const args = Object.entries(f.options).filter(([key]) => key !== 'roots').flatMap(([key, value]) => ['--' + key, value]);
  const result = spawnSync(process.execPath, [cli, ...args, '--root', 'fixture=' + f.root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  rejects(JSON.parse(result.stdout), 'ACTIONS_REQUIRED');
  assert.equal(spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8' }).status, 2);
});

// Stage-prefix checks must not require fabricated future outputs.
for (const [through, removed] of [
  ['trace-distill', ['procedure', 'candidate', 'qualification']],
  ['procedure-synthesize', ['candidate', 'qualification']],
  ['candidate', ['qualification']],
]) test('checks through ' + through + ' without reading future artifacts', t => {
  const f = fixture(t);
  const options = { ...f.options, through };
  for (const name of removed) { fs.unlinkSync(options[name]); delete options[name]; }
  const report = checkArtifactChain(options);
  assert.equal(report.verdict, 'pass', JSON.stringify(report.errors));
  assert.equal(report.through, through);
  assert.equal(report.boundaries.qualification, 'not-run');
  assert.equal(report.liveQualificationGranted, false);
  assert.equal(report.stageComplete, false);
  for (const name of removed) assert.ok(!report.artifacts.some(item => item.name === name));
});

test('does not infer a smaller scope when a required final artifact is missing', t => {
  const f = fixture(t);
  delete f.options.qualification;
  assert.equal(f.check().verdict, 'fail');
});

test('rejects a merged action removed from its declared source step', t => {
  const f = fixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A005').decision = 'merge';
    source.distilled.steps[2].sourceActionRefs = ['A006'];
  });
  rejects(f.check(), 'ACTION_DECISION');
});

test('allows a merged action still present in its declared source step', t => {
  const f = fixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A005').decision = 'merge';
  });
  assert.equal(f.check().verdict, 'pass');
});

test('rejects an unresolved normal-path distillation', t => {
  const f = fixture(t, source => { source.distilled.unresolved = ['first read may belong to another window']; });
  rejects(f.check(), 'UNRESOLVED_ARTIFACT');
});

test('rejects a nonexistent raw-action consumer at the S7 boundary', t => {
  const f = fixture(t, source => { source.dossier.runtimeValues[0].consumers = ['A999']; });
  rejects(f.check(), 'UNKNOWN_CONSUMER');
  assert.equal(f.check().boundaries['trace-distill'], 'fail');
});

test('rejects a claimed plan revision different from the frozen WorkPlan', t => {
  const f = fixture(t, source => { source.distilled.planRevision = 'fixture-r999'; });
  rejects(f.check(), 'WRONG_PLAN_REVISION');
});

test('rejects contract and plan belonging to different tasks', t => {
  const f = fixture(t, source => { source.contract.taskId = 'another-task'; });
  rejects(f.check(), 'MIXED_TASK');
});

test('checks the upstream plan bytes rather than trusting the downstream hash chain', t => {
  const f = fixture(t, () => {}, state => {
    state.write('plan.json', { ...state.source.plan, revision: 'changed-after-freeze' });
  });
  rejects(f.check(), 'HASH_MISMATCH');
});

test('an upstream failure blocks downstream acceptance despite local checks passing', t => {
  const f = fixture(t, source => { source.dossier.runtimeValues[0].evidence = null; });
  const report = f.check();
  assert.equal(report.localChecks.candidate, 'pass');
  assert.equal(report.boundaries.candidate, 'blocked');
  assert.equal(report.boundaries.qualification, 'blocked');
  assert.deepEqual(report.proves, []);
});

test('reports exact input and output snapshots without turning a fixture into qualification', t => {
  const f = fixture(t);
  const report = checkArtifactChain({ ...f.options, through: 'trace-distill' });
  for (const name of ['dossier', 'actions', 'distilled', 'contract', 'plan']) {
    const item = report.artifacts.find(item => item.name === name);
    assert.equal(item.sha256, crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex'));
  }
  assert.equal(report.liveQualificationGranted, false);
  assert.ok(!report.proves.some(item => /Qualification/.test(item)));
});

test('CLI supports prefix Markdown review and rejects unknown or repeated scope flags', t => {
  const f = fixture(t);
  const cli = path.join(REPO, 'workflows/agent-to-recipe/scripts/check-artifact-chain.js');
  const args = ['--through', 'trace-distill', '--dossier', f.options.dossier, '--actions', f.options.actions,
    '--distilled', f.options.distilled, '--root', 'fixture=' + f.root];
  fs.unlinkSync(f.options.procedure); fs.unlinkSync(f.options.candidate); fs.unlinkSync(f.options.qualification);
  const json = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  const result = spawnSync(process.execPath, [cli, ...args, '--format', 'markdown'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('# 阶段工件审阅'));
  assert.ok(result.stdout.includes('not-run'));
  assert.ok(result.stdout.includes(JSON.parse(json.stdout).artifacts[0].sha256));
  assert.equal(spawnSync(process.execPath, [cli, ...args, '--through', 'candidate'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [cli, ...args, '--format', 'html'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [cli, '--through', 'S99'], { encoding: 'utf8' }).status, 2);
});

test('the review renders artifact text as data and reports view truncation', t => {
  const { renderReview } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
  const f = fixture(t, source => {
    source.distilled.steps[0].purpose = '<script>alert(1)</script> [click](javascript:bad) | **PASS**\n' + 'x'.repeat(3000);
  });
  const report = checkArtifactChain({ ...f.options, through: 'trace-distill' });
  const md = renderReview(report);
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('[click](javascript:bad)'));
  assert.ok(md.includes('截断'));
  assert.equal(report.verdict, 'pass');
});

test('S7 rejects a new normal-path step with no observed source', t => {
  const f = fixture(t, source => {
    source.distilled.steps.push({ stepId: 'D070', sourceActionRefs: [], inputs: [], outputs: [], dependencies: [] });
  });
  rejects(checkArtifactChain({ ...f.options, through: 'trace-distill' }), 'SOURCE_ACTIONS');
});

test('a recovery-only action cannot masquerade as the normal runtime producer', t => {
  const f = fixture(t, source => {
    source.distilled.actionDecisions.find(item => item.actionRef === 'A005').decision = 'recovery';
    source.distilled.steps[2].sourceActionRefs = ['A006'];
  });
  rejects(f.check(), 'DATA_DEPENDENCY_BROKEN');
});

for (const variant of ['unexercised', 'excluded']) test('qualification does not gain ' + variant + ' scope', t => {
  const f = fixture(t, source => {
    const scope = source.qualification.qualificationScope;
    if (variant === 'unexercised') scope.qualified.push('another-platform');
    else scope.excluded.push('fixed-chain');
  });
  rejects(f.check(), 'PARTIAL_QUALIFICATION');
});
