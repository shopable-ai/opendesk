'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');

const REPO = path.resolve(__dirname, '../..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures/calculator-artifact-chain');
const SOURCE = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'source.json'), 'utf8'));
const EXPECTED = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'expected.json'), 'utf8'));
const BASE = path.join(REPO, '.runtime/tests/workflows');
fs.mkdirSync(BASE, { recursive: true });
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(t, mutate = () => {}, afterWrite = () => {}) {
  const root = fs.mkdtempSync(path.join(BASE, 'artifact-chain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = clone(SOURCE);
  mutate(source);
  const file = name => path.join(root, name);
  const write = (name, value) => {
    fs.mkdirSync(path.dirname(file(name)), { recursive: true });
    fs.writeFileSync(file(name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const ref = (name, kind, schemaVersion = 'agent-to-recipe/v1') => ({
    kind, rootId: 'fixture', path: name,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file(name))).digest('hex'), schemaVersion,
  });

  for (const [name, value] of Object.entries(source.evidence)) write('evidence/' + name, value);
  for (const [name, value] of Object.entries(source.apiContracts || {})) write('api/' + name, value);
  write('contract.json', source.contract);
  write('plan.json', source.plan);
  write('actions.json', source.actions);

  const dossier = source.dossier;
  dossier.contractRef = ref('contract.json', 'TaskContract');
  dossier.workPlanRef = ref('plan.json', 'WorkPlan');
  dossier.actionsRef = ref('actions.json', 'RawTrace');
  for (const value of dossier.runtimeValues) {
    value.evidenceRefs = value.evidence ? [ref('evidence/' + value.evidence, 'evidence', 'text/plain')] : [];
    delete value.evidence;
  }
  write('dossier.json', dossier);

  const distilled = source.distilled;
  distilled.contractRef = ref('contract.json', 'TaskContract');
  distilled.workPlanRef = ref('plan.json', 'WorkPlan');
  distilled.dossierRef = ref('dossier.json', 'Dossier');
  distilled.sourceActionRefs = [ref('actions.json', 'RawTrace')];
  distilled.evidenceRefs = [ref('evidence/distillation.txt', 'evidence', 'text/plain')];
  write('distilled.json', distilled);

  const procedure = source.procedure;
  procedure.distilledStepsRef = ref('distilled.json', 'DistilledSteps');
  for (const decision of procedure.capabilityDecisions || []) {
    for (const candidateChoice of decision.candidates || []) {
      if (candidateChoice.contract) {
        candidateChoice.canonicalContractRefs = [ref('api/' + candidateChoice.contract, 'CanonicalAPIContract', 'text/markdown')];
        delete candidateChoice.contract;
      }
      if (candidateChoice.validationEvidence) {
        candidateChoice.validationEvidenceRefs = [ref('evidence/' + candidateChoice.validationEvidence, 'evidence', 'text/plain')];
        delete candidateChoice.validationEvidence;
      }
    }
    if (Array.isArray(decision.sharedConstraints)) {
      decision.sharedConstraintRefs = decision.sharedConstraints
        .map(name => ref('api/' + name, 'SharedAPIConstraint', 'text/markdown'));
      delete decision.sharedConstraints;
    }
    if (decision.runtimeValidation && decision.runtimeValidation.evidence) {
      decision.runtimeValidation.evidenceRefs =
        [ref('evidence/' + decision.runtimeValidation.evidence, 'evidence', 'text/plain')];
      delete decision.runtimeValidation.evidence;
    }
  }
  write('procedure.json', procedure);
  write('candidate.js', source.candidateSource);

  const candidate = source.candidate;
  candidate.procedureRef = ref('procedure.json', 'SemanticProcedure');
  candidate.scriptRef = ref('candidate.js', 'script', 'text/javascript');
  const apiRefMap = new Map();
  for (const decision of procedure.capabilityDecisions || []) {
    const selected = (decision.candidates || []).find(item => item.disposition === 'selected');
    for (const apiRef of [...(selected && selected.canonicalContractRefs || []), ...(decision.sharedConstraintRefs || [])]) {
      apiRefMap.set([apiRef.rootId, apiRef.path, apiRef.sha256].join('\u0000'), apiRef);
    }
  }
  candidate.apiRefs = [...apiRefMap.values()];
  write('candidate.json', candidate);

  const qualification = source.qualification;
  qualification.candidateRef = ref('candidate.json', 'CandidateManifest');
  qualification.evidenceRefs = [ref('evidence/qualification.txt', 'evidence', 'text/plain')];
  for (const scenario of qualification.scenarios) {
    scenario.evidenceRefs = scenario.evidence ? [ref('evidence/' + scenario.evidence, 'evidence', 'text/plain')] : [];
    delete scenario.evidence;
  }
  write('qualification.json', qualification);
  afterWrite({ source, root, file, write, ref });

  const options = {
    dossier: file('dossier.json'), actions: file('actions.json'), distilled: file('distilled.json'),
    procedure: file('procedure.json'), candidate: file('candidate.json'), qualification: file('qualification.json'),
    roots: [['fixture', root]],
  };
  return { source, root, file, write, ref, options, check: () => checkArtifactChain(options) };
}

function rejects(report, code) {
  assert.equal(report.verdict, 'fail');
  assert.ok(report.errors.some(error => error.code === code), JSON.stringify(report.errors, null, 2));
  assert.equal(report.desktopActionsAuthorized, false);
}

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

test('rejects a Procedure that omits Recipe-driving capability decisions', t => {
  const f = fixture(t, source => { delete source.procedure.capabilityDecisions; });
  rejects(f.check(), 'CAPABILITY_DECISION_REQUIRED');
});

test('accepts a legacy Procedure/Candidate pair without inventing capability provenance', t => {
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
  assert.equal(report.verdict, 'pass', JSON.stringify(report.errors, null, 2));
  assert.ok(report.notEvaluated.some(item => item.includes('legacy Procedure/Candidate')));
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
