'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkArtifactChain } = require('../../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');

const REPO = path.resolve(__dirname, '../../..');
const FIXTURE_DIR = path.join(__dirname, '../fixtures/calculator-artifact-chain');
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


module.exports = { fixture, rejects, REPO, SOURCE, EXPECTED, clone };
