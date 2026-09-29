'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { checkWorkflowStage } = require('../../../workflows/agent-to-recipe/scripts/check-workflow-stage.js');

const REPO = path.resolve(__dirname, '../../..');
const ROOT = path.join(REPO, '.runtime/tests/agent-to-recipe/workflow-stage');
const score = { requirements: 25, responsibility: 20, continuation: 20, validation: 20, cost: 15 };
const criteria = Object.entries(score).flatMap(([dimension, maximum], index) =>
  Array.from({ length: maximum / 5 }, (_, item) => ({ id: String.fromCharCode(65 + index) + (item + 1),
    dimension, maxPoints: 5, criterion: 'Synthetic frozen criterion ' + dimension + '-' + (item + 1) })));

function fixture(t) {
  fs.mkdirSync(ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, 'attempt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (name, content, kind = 'evidence', schemaVersion = 'agent-to-recipe/v1') => {
    const filename = path.join(dir, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
    return { rootId: 'run', path: name, sha256: createHash('sha256').update(content).digest('hex'), kind,
      schemaVersion };
  };
  const stages = Array.from({ length: 12 }, (_, i) => 'S' + (i + 1));
  const acceptanceRef = write('acceptance.json', JSON.stringify({ taskId: 't', routing: {
    planRevision: 'r1', dependencies: Object.fromEntries(stages.map((stage, index) =>
      [stage, index ? [stages[index - 1]] : []])), workPackages: [] }, stages: Object.fromEntries(
    stages.map(stage => [stage, { requiredTests: ['test-' + stage],
      scoring: { denominator: 100, granularity: 5, items: criteria.map(item => ({ ...item,
        requiredEvidenceKinds: [stage === 'S3' ? 'ActualExecution' : stage === 'S4'
          ? 'ActualObservation' : stage === 'S12' ? 'FreshRun' : 'evidence'] })) },
      requiredEvidenceKinds: [stage === 'S3' ? 'ActualExecution' : stage === 'S4'
        ? 'ActualObservation' : stage === 'S12' ? 'FreshRun' : 'evidence'] }])) }), 'Acceptance');
  const reviews = [];
  let previous = null;
  for (const stage of stages) {
    const evidence = write(stage + '-observation.txt', 'Synthetic declared observation ' + stage,
      stage === 'S3' ? 'ActualExecution' : stage === 'S4' ? 'ActualObservation'
        : stage === 'S12' ? 'FreshRun' : 'evidence');
    const source = stage === 'S11' ? write('candidate.js', 'module.exports = () => "synthetic";\n', 'CandidateSource') : null;
    const content = stage === 'S11' ? { schemaVersion: 'agent-to-recipe/v1',
      scriptRef: source, scriptHash: source.sha256, dependencies: [] }
      : stage === 'S12' ? { candidateRef: reviews[10].outputs[0],
        schemaVersion: 'agent-to-recipe/v1',
        contractRef: reviews[0].outputs.find(ref => ref.kind === 'TaskContract'),
        qualificationScope: { requested: ['baseline'], exercised: ['baseline'], qualified: ['baseline'], excluded: [] },
        scenarios: [{ id: 'fresh-run-01', scopeRefs: ['baseline'], verdict: 'pass',
          criterionRefs: ['data-flow', 'final-result'],
          evidenceRefs: [evidence] }], verdict: 'pass' } : { stage };
    const outputs = [write(stage + '-output.json', JSON.stringify(content),
      stage === 'S11' ? 'CandidateManifest' : stage === 'S12' ? 'QualificationRecord' : 'StageOutput')];
    if (source) outputs.push(source);
    if (stage === 'S1') outputs.push(write('task-contract.json', JSON.stringify({
      schemaVersion: 'agent-to-recipe/v1', taskId: 't',
      successCriteria: [{ criterionId: 'data-flow' }, { criterionId: 'final-result' }] }), 'TaskContract'));
    const qualificationRequestRef = stage === 'S12' ? write('s12-request.json', JSON.stringify({
      schemaVersion: 'fresh-calculator-s12/v1', candidateRef: reviews[10].outputs[0],
      contractRef: reviews[0].outputs.find(ref => ref.kind === 'TaskContract'),
      requested: ['baseline'], requiredCriteria: ['data-flow', 'final-result'],
      scenarios: [{ id: 'fresh-run-01', scopeRefs: ['baseline'],
        criterionRefs: ['data-flow', 'final-result'] }],
    }), 'QualificationRequest', 'fresh-calculator-s12/v1') : null;
    const inputs = [acceptanceRef, ...(previous?.outputs || [])];
    if (stage === 'S12') inputs.push(...reviews[10].dependencies);
    if (qualificationRequestRef) inputs.push(qualificationRequestRef);
    const review = { stage, taskId: 't', attemptId: 'a', planRevision: 'r1', producerVersion: 'v1',
      producer: 'producer', reviewer: 'independent-reviewer', inputs, outputs, evidence: [evidence],
      score: { ...score }, scoreEvidence: Object.fromEntries(Object.keys(score).map(dimension => [dimension,
        { reason: 'Synthetic fixture review of ' + dimension, refs: [evidence],
          items: criteria.filter(item => item.dimension === dimension).map(item => ({
            id: item.id, score: 5, reason: 'Synthetic criterion evidence', refs: [evidence] })) }])),
      hardFails: [], blockingUnknowns: [], requiredTests: [{ name: 'test-' + stage,
        status: 'pass', evidence: [evidence] }], gate: { verdict: 'pass', evidence: [evidence] },
      actualOutputCorrect: true, inputsSufficient: true, disposition: 'pass',
      audit: { referenceRead: false, futureOutputsRead: false, accessedRefs: [acceptanceRef] },
      ...(stage === 'S11' ? { dependencies: [] } : {}) };
    if (qualificationRequestRef) review.qualificationRequestRef = qualificationRequestRef;
    reviews.push(review);
    previous = review;
  }
  const record = { taskId: 't', attemptId: 'a', planRevision: 'r1', acceptanceRef, stages: reviews,
    final: { referenceAlignment: { basis: 'requirements', verdict: 'compliant',
    referenceRef: write('reference.js', 'module.exports = () => "synthetic reference";\n', 'ReferenceAnswer'),
    aspects: Object.fromEntries(['behavior', 'runtimeDataFlow', 'apiSemantics', 'failureSafety',
      'engineering', 'applicability'].map(key => [key, { verdict: 'compliant',
      reason: 'Synthetic requirement compliance review: ' + key,
      differences: 'Synthetic equivalent implementation, no claimed live validation.',
      requirementRefs: [reviews[0].outputs.find(ref => ref.kind === 'TaskContract')],
      refs: [reviews[11].evidence[0]] }])), hardFails: [] },
    qualification: 'pass', freshRun: 'pass', requirementCoverage: 'pass',
    requestedScenarios: [{ id: 'baseline', status: 'pass' }], evaluator: 'independent-reviewer',
    requirementCriteria: ['data-flow', 'final-result'].map(criterionId => ({ criterionId, status: 'pass',
      evidence: [reviews[11].evidence[0]] })),
    candidateRefs: [...reviews[10].outputs], evidence: [reviews[11].evidence[0]] } };
  const run = (from, to, final = false) => {
    const filename = path.join(dir, 'review.json');
    fs.writeFileSync(filename, JSON.stringify(record));
    return checkWorkflowStage({ record: filename, roots: [['run', dir]], from, to, final });
  };
  return { dir, record, reviews, write, run };
}

module.exports = { fixture };
