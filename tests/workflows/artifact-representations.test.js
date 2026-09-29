'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');
const { rejects } = require('./tools/artifact-fixture.js');
const { representationFixture } = require('./tools/artifact-representation-fixture.js');

for (const through of ['trace-distill', 'procedure-synthesize', 'candidate', 'qualification']) {
  test('declared alternate representations are structurally consumable through ' + through, t => {
    const f = representationFixture(t);
    const before = fs.readFileSync(f.file('actions.json'));
    const report = checkArtifactChain({ ...f.options, through });
    assert.equal(report.verdict, 'pass', JSON.stringify(report.errors));
    assert.equal(report.businessDataflow.releaseBlocked, true);
    assert.equal(report.liveQualificationGranted, false);
    assert.deepEqual(fs.readFileSync(f.file('actions.json')), before);
    assert.ok(JSON.parse(before).actions.every(action => action.id && !Object.hasOwn(action, 'actionId')));
    assert.equal(report.artifacts.find(item => item.name === 'actions').sha256,
      crypto.createHash('sha256').update(before).digest('hex'));
  });
}

test('explicit business IDs are not restricted to a B-number spelling', t => {
  const f = representationFixture(t, docs => {
    const names = new Map(docs.procedure.businessSteps.map((step, index) => [step.stepId, 'declared-business-' + index]));
    for (const step of docs.procedure.businessSteps) {
      step.stepId = names.get(step.stepId);
      step.consumers = step.consumers.map(id => names.get(id) || id);
      for (const input of step.inputSources) if (input.producer) input.producer = names.get(input.producer);
    }
    for (const value of docs.procedure.runtimeValues) {
      value.producerStep = names.get(value.producerStep);
      value.consumerSteps = value.consumerSteps.map(id => names.get(id) || id);
    }
    for (const edge of docs.procedure.dataDependencies) {
      edge.producer = names.get(edge.producer);
      edge.consumer = names.get(edge.consumer) || edge.consumer;
    }
    for (const choice of docs.procedure.capabilityDecisions) choice.businessStepRefs = choice.businessStepRefs.map(id => names.get(id));
    for (const mapping of docs.candidate.sourceMapping) mapping.businessStepRefs = mapping.businessStepRefs.map(id => names.get(id));
  });
  const report = f.check();
  assert.equal(report.verdict, 'pass', JSON.stringify(report.errors));
  assert.equal(report.businessDataflow.verdict, 'unknown');
});

for (const [name, code, mutate] of [
  ['wrong wrapped task', 'MIXED_TASK', docs => { docs.actions.taskId = 'other'; }],
  ['conflicting raw IDs', 'ACTION_ID', docs => { docs.actions.actions[0].actionId = 'other'; }],
  ['duplicate original IDs', 'ACTION_ID', docs => { docs.actions.actions[1].id = docs.actions.actions[0].id; }],
  ['wrong raw producer', 'HISTORICAL_FACT_UNBOUND', docs => { docs.dossier.runtimeValues[0].origin.actionRef = 'absent'; }],
  ['wrong application identity', 'HISTORICAL_FACT_UNBOUND', docs => { docs.dossier.runtimeValues[0].origin.applicationId = 'other-app'; }],
  ['different actual value', 'HISTORICAL_FACT_UNBOUND', docs => { docs.dossier.runtimeValues[0].observedValue = 'unobserved'; }],
  ['missing source declaration', 'SOURCE_ACTIONS', docs => { docs.distilled.sourceActionRefs.shift(); }],
  ['missing side-effect confirmation', 'SIDE_EFFECT_UNKNOWN', docs => { docs.dossier.sideEffects.pop(); }],
  ['unknown input receipt', 'SIDE_EFFECT_UNKNOWN', docs => { docs.actions.actions.find(action => action.receipt).receipt.completed[0].actionState = 'unknown'; }],
  ['object verification shell', 'STEP_CONTRACT', docs => { docs.distilled.steps[0].verification = {}; }],
  ['changed verification evidence', 'HASH_MISMATCH', docs => { docs.procedure.businessSteps[0].verification.evidenceRefs[0].sha256 = '0'.repeat(64); }],
  ['ambiguous runtime input source', 'DATA_DEPENDENCY_BROKEN', docs => {
    const consumer = docs.procedure.businessSteps.find(step => step.inputs.runtimeValue);
    consumer.inputSources.push({ input: 'runtimeValue', kind: 'constant', value: 'cached' });
  }],
  ['wrong input producer', 'DATA_DEPENDENCY_BROKEN', docs => {
    docs.procedure.businessSteps.find(step => step.inputs.runtimeValue).inputSources.find(source => source.kind === 'runtime').producer = 'B010';
  }],
  ['wrong semantic consumer', 'DATA_DEPENDENCY_BROKEN', docs => { docs.procedure.runtimeValues[0].consumerSteps = ['B010']; }],
  ['conflicting semantic source', 'DATA_DEPENDENCY_BROKEN', docs => { docs.procedure.runtimeValues[0].source = 'B010'; }],
  ['wrong terminal producer', 'DATA_DEPENDENCY_BROKEN', docs => { docs.procedure.dataDependencies.at(-1).producer = 'B010'; }],
  ['unbound terminal', 'DATA_DEPENDENCY_BROKEN', docs => { docs.procedure.businessSteps.at(-1).consumers = ['unknown output']; }],
  ['null observation without downstream read', 'BUSINESS_STEP_CONTRACT', docs => {
    docs.procedure.businessSteps.find(step => step.observation === null).consumers = ['B010'];
  }],
  ['conflicting method scope', 'METHOD_VALIDATION', docs => { docs.procedure.capabilityDecisions[0].runtimeValidation.environmentScope = 'other'; }],
  ['conflicting selected contracts', 'API_REF_MISMATCH', docs => {
    const decision = docs.procedure.capabilityDecisions[0];
    decision.candidates.find(item => item.disposition === 'selected').canonicalContractRefs = [];
  }],
  ['unknown mapped business step', 'SOURCE_MAPPING', docs => { docs.candidate.sourceMapping[0].businessStepRefs = ['B999']; }],
  ['conflicting mapping representation', 'SOURCE_MAPPING', docs => { docs.candidate.sourceMapping[0].step = 'B999'; }],
  ['malformed explicit mapping', 'SOURCE_MAPPING', docs => { docs.candidate.sourceMapping[0].businessStepRefs = 'B010'; }],
  ['line outside frozen source', 'SOURCE_MAPPING', docs => { docs.candidate.sourceMapping[0].line = 1000000; }],
  ['noninteger code line', 'SOURCE_MAPPING', docs => { docs.candidate.sourceMapping[0].line = 1.5; }],
  ['empty code-region rule', 'SOURCE_MAPPING', docs => { docs.candidate.sourceMapping[0].rule = ''; }],
  ['function alias masking an invalid region', 'SOURCE_MAPPING', docs => {
    docs.candidate.sourceMapping[0].function = 'main';
    docs.candidate.sourceMapping[0].line = 0;
  }],
]) {
  test('alternate representation still rejects ' + name, t => {
    const f = representationFixture(t, mutate);
    rejects(f.check(), code);
  });
}

test('content-correct generic role still requires a new formal role-bound publication', t => {
  const f = representationFixture(t, docs => {
    docs.dossier.contractRef.kind = 'evidence';
    docs.distilled.contractRef.kind = 'evidence';
  });
  const report = f.check();
  rejects(report, 'INVALID_REF');
  assert.equal(report.localChecks['trace-distill'], 'pass');
  assert.equal(report.localChecks['procedure-synthesize'], 'pass');
  assert.equal(report.localChecks.candidate, 'pass');
  assert.equal(report.boundaries.candidate, 'blocked');
});
