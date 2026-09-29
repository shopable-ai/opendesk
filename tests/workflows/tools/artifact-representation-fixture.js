'use strict';
const fs = require('node:fs');
const { fixture } = require('./artifact-fixture.js');

function representationFixture(t, mutate = () => {}, afterWrite = () => {}) {
  return fixture(t, () => {}, state => {
    const read = name => JSON.parse(fs.readFileSync(state.file(name + '.json'), 'utf8'));
    const documents = Object.fromEntries(['contract', 'plan', 'dossier', 'distilled', 'procedure', 'candidate', 'qualification'].map(name => [name, read(name)]));
    const { dossier, distilled, procedure, candidate } = documents;
    const originalActions = read('actions');
    const ids = new Map(originalActions.map((action, index) => [action.actionId, 'synthetic-action-' + index]));
    const actions = originalActions.map(action => {
      const projected = { ...action, id: ids.get(action.actionId) };
      delete projected.actionId;
      if (action.kind === 'actual-input') {
        projected.targets = action.data.names.map(name => ({ role: 'button', name }));
        projected.receipt = action.data.receipt;
        delete projected.kind; delete projected.data;
      } else if (action.kind === 'actual-read') {
        projected.operation = 'UI.readText';
        projected.actual = action.data.raw ?? action.data.first;
        projected.applicationId = 'synthetic-application';
        projected.targetId = 'synthetic-display';
        delete projected.kind; delete projected.data;
      }
      return projected;
    });
    documents.actions = { taskId: documents.contract.taskId, actions };
    dossier.taskId = documents.contract.taskId;
    documents.plan.revision = dossier.planRevision = distilled.planRevision = 7;
    for (const value of dossier.runtimeValues) value.origin = { actionRef: ids.get(value.origin.match(/\bA\d+\b/)[0]),
      applicationId: 'synthetic-application', targetId: 'synthetic-display' };
    for (const value of dossier.runtimeValues) value.consumers = value.consumers.map(id => ids.get(id) || id);
    dossier.sideEffects = actions.filter(action => action.receipt).map(action => ({ actionRef: action.id,
      state: 'confirmed', receiptState: 'acknowledged' }));
    const verification = () => ({ evidenceRefs: [state.ref('evidence/distillation.txt', 'evidence', 'text/plain')] });
    for (const step of distilled.steps) {
      step.sourceActionRefs = step.sourceActionRefs.map(id => ids.get(id));
      step.inputs = Object.fromEntries(step.inputs.map(name => [name === 'firstResult' ? 'runtimeValue' : name, name]));
      step.verification = verification();
    }
    for (const decision of distilled.actionDecisions) decision.actionRef = ids.get(decision.actionRef);
    for (const step of procedure.businessSteps) {
      step.inputs = Object.fromEntries(step.inputs.map(name => [name === 'firstResult' ? 'runtimeValue' : name, name]));
      step.inputSources = Object.keys(step.inputs).map(input => input === 'runtimeValue'
        ? { input, kind: 'runtime', valueName: step.inputs[input], producer: procedure.dataDependencies.find(edge => edge.consumer === step.stepId).producer }
        : { input, kind: 'user-invariant', source: 'synthetic-contract' });
      step.verification = verification();
      step.sideEffects = 'Synthetic declared effect';
      const sourceIds = step.sourceStepRefs.flatMap(id => distilled.steps.find(item => item.stepId === id).sourceActionRefs);
      step.observation = sourceIds.every(id => actions.find(action => action.id === id).receipt)
        ? null : { target: 'synthetic-display', fullString: true };
      step.consumers = step.consumers.map(id => id === 'output' ? 'final output' : id);
    }
    procedure.runtimeValues = procedure.runtimeValues.map(value => ({ ...dossier.runtimeValues.find(item => item.name === value.name),
      producerStep: value.source.match(/\bB\d+\b/)[0], consumerSteps: value.consumers.map(id => id === 'output' ? 'final output' : id) }));
    for (const edge of procedure.dataDependencies) edge.input = 'runtimeValue';
    const terminal = procedure.runtimeValues.find(value => value.consumerSteps.includes('final output'));
    procedure.dataDependencies.push({ producer: terminal.producerStep, value: terminal.name, consumer: 'final output', transform: 'identity' });
    for (const decision of procedure.capabilityDecisions) {
      const selected = decision.candidates.find(item => item.disposition === 'selected');
      decision.canonicalContractRefs = selected.canonicalContractRefs;
      delete selected.canonicalContractRefs;
      decision.runtimeValidation.scope = decision.runtimeValidation.environmentScope;
      delete decision.runtimeValidation.environmentScope;
    }
    candidate.sourceMapping = candidate.sourceMapping.map(mapping => ({ businessStepRefs: mapping.step.match(/\bB\d+\b/g),
      line: 2, rule: 'synthetic declared code region', capabilityDecisionRefs: mapping.capabilityDecisionRefs }));
    distilled.sourceActionRefs = actions.map(action => action.id);
    mutate(documents);
    state.write('plan.json', documents.plan);
    state.write('actions.json', documents.actions);
    dossier.workPlanRef = state.ref('plan.json', 'WorkPlan');
    dossier.actionsRef = state.ref('actions.json', 'RawTrace', 'json/v1');
    state.write('dossier.json', dossier);
    distilled.workPlanRef = dossier.workPlanRef;
    distilled.dossierRef = state.ref('dossier.json', 'Dossier');
    state.write('distilled.json', distilled);
    procedure.distilledStepsRef = state.ref('distilled.json', 'DistilledSteps');
    state.write('procedure.json', procedure);
    candidate.procedureRef = state.ref('procedure.json', 'SemanticProcedure');
    state.write('candidate.json', candidate);
    documents.qualification.candidateRef = state.ref('candidate.json', 'CandidateManifest');
    state.write('qualification.json', documents.qualification);
    afterWrite(state);
  });
}

module.exports = { representationFixture };
