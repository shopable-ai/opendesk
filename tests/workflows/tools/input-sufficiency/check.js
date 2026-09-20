'use strict';

// Bounded declaration checker for a sequential read -> consume -> terminal-read
// slice. Not an execution engine, general semantic proof, or model evaluator.
const { isDeepStrictEqual: equal } = require('node:util');
const { hash, object, text, requireCheck } = require('../../../../workflows/agent-to-recipe/scripts/artifact-validation.js');
const SCHEMA = 'agent-to-recipe/v1';
const SCOPE = 'sequential-dataflow-v1';
const key = ref => [ref?.rootId, ref?.path, ref?.sha256, ref?.schemaVersion, ref?.kind].join('\0');
const list = value => Array.isArray(value) ? value : [];
const VALUE_FIELDS = ['name', 'meaning', 'type', 'observedValue', 'origin', 'evidenceRefs',
  'consumers', 'allowedTransforms', 'validity', 'reacquireOnFreshRun'];
const POLICY_FIELDS = ['meaning', 'type', 'allowedTransforms', 'validity', 'reacquireOnFreshRun'];
function check(ok, code, message, owner, location) {
  try { requireCheck(ok, code, message); }
  catch (error) { error.owner = owner; error.location = location; throw error; }
}
function unique(items, field, owner, location) {
  check(Array.isArray(items), 'INPUT_MISSING', 'Required array is missing.', owner, location);
  const ids = items.map(item => item?.[field]);
  check(ids.every(text) && new Set(ids).size === ids.length, 'DUPLICATE_ID',
    'IDs must be nonempty and unique.', owner, location);
  return ids;
}
function content(packet, ref) {
  const item = packet.files.find(value => key(value.ref) === key(ref));
  check(item && hash(Buffer.from(item.content)) === ref.sha256, 'INPUT_MISSING',
    'Required source bytes were not delivered to this Producer.', 'coordinator', ref?.path || 'inputRef');
  return item.content;
}
function json(packet, ref) { return JSON.parse(content(packet, ref)); }
function record(packet, ref, recordKind, owner, location) {
  check(ref?.kind === 'evidence' && ref.schemaVersion === SCHEMA, 'SOURCE_FORMAT',
    'This slice needs a versioned structured evidence record, not a path or free-form claim.', owner, location);
  const value = json(packet, ref);
  check(value.schemaVersion === SCHEMA && value.recordKind === recordKind,
    'SOURCE_FORMAT', 'Evidence role or version is unsupported.', owner, location);
  // A structured record is not permission to smuggle full histories into S9.
  const allowed = { observation: ['schemaVersion', 'recordKind', 'taskId', 'actionRef', 'name', 'value', 'applicationId', 'targetId', 'sourceNote'],
    'application-relation': ['schemaVersion', 'recordKind', 'taskId', 'from', 'to', 'kind', 'sourceNote'],
    'capability-selection': ['schemaVersion', 'recordKind', 'taskId', 'planRevision', 'capabilityDecisions', 'sourceNote'] }[recordKind];
  check(Object.keys(value).every(name => allowed.includes(name)), 'INPUT_ROLE',
    'The scoped record contains unsupported fields; request a sourced projection, do not strip history refs.', owner, location);
  return value;
}
function typed(value) {
  return (value.type === 'text' && text(value.observedValue))
    || (value.type === 'digit-string' && typeof value.observedValue === 'string' && /^\d+$/.test(value.observedValue));
}
function outputStep(steps, actionId) {
  return steps.find(step => list(step.sourceActionRefs).includes(actionId));
}

function values(packet, sourceValues, contract, profile, owner) {
  unique(sourceValues, 'name', owner, 'runtimeValues');
  unique(contract.runtimeValuePolicies, 'name', 'automation-plan', 'runtimeValuePolicies');
  check(equal(sourceValues.map(v => v.name).sort(), contract.runtimeValuePolicies.map(v => v.name).sort()),
    'VALUE_COVERAGE', 'Required runtime values, including terminal reads, must all be present.', owner, 'runtimeValues');
  check([SCHEMA, 'agent-to-recipe/app-profile/v1.1'].includes(profile.schemaVersion)
    && Array.isArray(profile.targets) && Array.isArray(profile.relations),
    'APPLICATION_SOURCE', 'Application target and relation information is required.', 'application-engineer', 'AppProfile');
  unique(profile.targets, 'id', 'application-engineer', 'targets');
  for (const value of sourceValues) {
    check(VALUE_FIELDS.every(field => Object.hasOwn(value, field)) && text(value.meaning)
      && text(value.validity) && value.reacquireOnFreshRun === true && object(value.origin)
      && text(value.origin.actionRef) && text(value.origin.applicationId) && text(value.origin.targetId)
      && list(value.evidenceRefs).length && list(value.consumers).length && list(value.allowedTransforms).length,
    'RUNTIME_SOURCE', 'Runtime meaning/type/origin/evidence/consumer/policy is incomplete.', owner, value.name);
    check(typed(value), 'CHECKER_COVERAGE', 'Only text and digit-string values are covered; do not reshape other business data.',
      'validation', value.name + '.type');
    const policy = contract.runtimeValuePolicies.find(item => item.name === value.name);
    for (const field of POLICY_FIELDS) check(equal(value[field], policy[field]), 'VALUE_POLICY',
      'Runtime reuse policy differs from its authorized source.', owner, value.name + '.' + field);
    check(value.allowedTransforms.every(item => ['identity', 'characters'].includes(item)), 'CHECKER_COVERAGE',
      'Only identity and lossless character expansion are checked.', 'validation', value.name + '.allowedTransforms');
    const target = profile.targets.find(item => item.id === value.origin.targetId);
    check(target?.applicationId === value.origin.applicationId, 'APPLICATION_SOURCE',
      'Runtime origin must name an actual supplied application target.', 'application-engineer', value.name + '.origin');
    for (const ref of value.evidenceRefs) {
      const observation = record(packet, ref, 'observation', owner, value.name + '.evidenceRefs');
      check(observation.taskId === contract.taskId && observation.actionRef === value.origin.actionRef
        && observation.name === value.name && equal(observation.value, value.observedValue)
        && observation.applicationId === value.origin.applicationId && observation.targetId === value.origin.targetId,
      'OBSERVATION_MISMATCH', 'Supplied observation does not support the declared runtime source.', owner, value.name);
    }
  }
  for (const relation of profile.relations) {
    check(list(relation.evidenceRefs).length > 0, 'APPLICATION_SOURCE',
      'Application relationships need supplied evidence.', 'application-engineer', relation.id);
    for (const ref of relation.evidenceRefs) {
      const evidence = record(packet, ref, 'application-relation', 'application-engineer', relation.id);
      check(evidence.taskId === contract.taskId && evidence.from === relation.from && evidence.to === relation.to
        && evidence.kind === relation.kind, 'APPLICATION_SOURCE', 'Relationship source disagrees.', 'application-engineer', relation.id);
    }
  }
}

function capabilitySources(packet, distilled, contract) {
  const refs = list(packet.inputs.supplementRefs).filter(ref => ref.kind === 'evidence');
  const selections = refs.filter(ref => {
    try { return json(packet, ref).recordKind === 'capability-selection'; } catch { return false; }
  });
  check(selections.length > 0, 'CAPABILITY_SOURCE_MISSING',
    'Provide the actual scoped selection record from S2-S6; API documentation alone is not a decision.',
    'coordinator', 'inputs.supplementRefs');
  const decisions = [];
  for (const ref of selections) {
    const source = record(packet, ref, 'capability-selection', 'task-demonstrate', ref.path);
    check(source.taskId === contract.taskId && source.planRevision === distilled.planRevision,
      'WRONG_VERSION', 'Selection record belongs to another task/plan.', 'task-demonstrate', ref.path);
    for (const decision of list(source.capabilityDecisions)) {
      check(text(decision.decisionId) && text(decision.capabilityNeed) && list(decision.sourceActionRefs).length
        && list(decision.discoveryPath).length && list(decision.revalidateWhen).length,
      'CAPABILITY_SOURCE', 'Actual selection context is incomplete.', 'task-demonstrate', decision.decisionId);
      check(decision.sourceActionRefs.every(id => outputStep(distilled.steps, id)), 'CAPABILITY_SOURCE',
        'Selection must apply to retained actions.', 'task-demonstrate', decision.decisionId);
      const selected = list(decision.candidates).filter(c => c.disposition === 'selected');
      check(selected.length === 1 && selected[0].method === decision.selectedMethod
        && list(selected[0].canonicalContractRefs).length, 'CAPABILITY_SOURCE',
      'An explicit selected method and its actual canonical contract are needed.', 'task-demonstrate', decision.decisionId);
      for (const candidate of decision.candidates) {
        check(text(candidate.reason) && ['selected', 'rejected', 'failed', 'not-run'].includes(candidate.disposition),
          'CAPABILITY_SOURCE', 'Candidate disposition lacks a sourced reason.', 'task-demonstrate', decision.decisionId);
        if (candidate.disposition === 'failed') check(list(candidate.validationEvidenceRefs).length,
          'CAPABILITY_SOURCE', 'A historical failure cannot be invented.', 'task-demonstrate', decision.decisionId);
        for (const r of list(candidate.canonicalContractRefs)) {
          check(r.kind === 'CanonicalAPIContract' && r.schemaVersion === 'text/markdown', 'CAPABILITY_SOURCE',
            'Canonical contracts cannot be replaced by unrelated evidence.', 'task-demonstrate', decision.decisionId);
          content(packet, r);
        }
        for (const r of list(candidate.validationEvidenceRefs)) content(packet, r);
      }
      for (const r of list(decision.sharedConstraintRefs)) {
        check(r.kind === 'SharedAPIConstraint' && r.schemaVersion === 'text/markdown', 'CAPABILITY_SOURCE',
          'Shared constraints must retain their input role.', 'task-demonstrate', decision.decisionId);
        content(packet, r);
      }
      const validation = decision.runtimeValidation;
      check(object(validation) && ['pass', 'fail', 'partial', 'not-run'].includes(validation.status)
        && text(validation.environmentScope), 'CAPABILITY_SOURCE', 'Actual validation status/scope is required.', 'task-demonstrate', decision.decisionId);
      if (validation.status !== 'not-run') check(list(validation.evidenceRefs).length,
        'CAPABILITY_SOURCE', 'Claimed runtime validation needs actual supplied evidence.', 'task-demonstrate', decision.decisionId);
      for (const r of list(validation.evidenceRefs)) content(packet, r);
      decisions.push({ ...decision, sourceRef: ref });
    }
  }
  unique(decisions, 'decisionId', 'task-demonstrate', 'capabilityDecisions');
  for (const step of distilled.steps) check(step.sourceActionRefs.every(id => decisions.some(d => d.sourceActionRefs.includes(id))),
    'CAPABILITY_SOURCE', 'Every retained action in this slice needs its source decision.', 'task-demonstrate', step.stepId);
  return decisions;
}

function checkSequential(packet, output, outputSha256) {
  const stage = packet.stage;
  const report = { through: stage, verdict: 'fail', scope: SCOPE, boundaries: { [stage]: 'fail', candidate: 'not-run', qualification: 'not-run' },
    localChecks: { [stage]: 'fail', qualification: 'not-run' }, artifacts: [], errors: [], pendingEngineering: [],
    proves: [], notEvaluated: ['历史事实真实性、自然语言语义、复杂分支／恢复、模型行为、桌面与业务资格'],
    next: '按错误责任定向补证；不重放未知副作用。' };
  report.artifacts = packet.files.map(item => ({ name: item.ref.kind, path: item.ref.rootId + '/' + item.ref.path,
    sha256: item.ref.sha256, rows: [], omitted: 0 }));
  report.artifacts.push({ name: stage === 'trace-distill' ? 'distilled' : 'procedure', path: '本次实际输出', sha256: outputSha256,
    rows: ['runtimeValues', 'dataDependencies', 'capabilityDecisions', 'unresolved'].filter(field => field in output)
      .map(field => { const value = JSON.stringify(output[field]); return { field,
        value: value.length > 1800 ? value.slice(0, 1800) + '〔已截断；请查固定输出〕' : value }; }), omitted: 0 });
  try {
    const contract = json(packet, packet.inputs.contract), plan = json(packet, packet.inputs.plan);
    check(contract.schemaVersion === SCHEMA && plan.schemaVersion === SCHEMA && text(contract.taskId)
      && contract.taskId === plan.taskId && text(plan.revision), 'WRONG_VERSION',
    'Contract/plan identity or version is inconsistent.', 'automation-plan', 'contract/plan');
    check(list(packet.inputs.appProfiles).length === 1, 'CHECKER_COVERAGE',
      'This bounded slice consumes one profile (which may describe several applications).', 'validation', 'appProfiles');
    const profile = json(packet, packet.inputs.appProfiles[0]);
    check(profile.taskId === contract.taskId, 'APPLICATION_SOURCE', 'Profile belongs to another task.', 'application-engineer', 'AppProfile');
    let distilled;
    if (stage === 'trace-distill') {
      const dossier = json(packet, packet.inputs.dossier), actions = json(packet, packet.inputs.actions);
      check(dossier.checkerScope === SCOPE, 'CHECKER_COVERAGE', 'Unsupported trajectory: retain it unchanged for another scoped review.', 'validation', 'Dossier.checkerScope');
      check(dossier.planRevision === plan.revision && dossier.taskId === contract.taskId,
        'WRONG_VERSION', 'Dossier does not match the current fixed plan.', 'task-demonstrate', 'Dossier');
      check(dossier.sideEffects?.inputState === 'confirmed', 'SIDE_EFFECT_UNKNOWN',
        'Observe effects first; never replay an uncertain action.', 'task-demonstrate', 'sideEffects');
      const actionIds = unique(actions, 'actionId', 'task-demonstrate', 'actions');
      check(actions.every(a => ['actual-read', 'actual-input'].includes(a.kind)), 'CHECKER_COVERAGE',
        'This slice covers sequential actual reads and inputs only.', 'validation', 'actions.kind');
      values(packet, dossier.runtimeValues, contract, profile, 'task-demonstrate');
      // Check the source ledger itself, not only the projection made from it.
      const names = dossier.runtimeValues.map(v => v.name);
      check(actions.every(a => Array.isArray(a.inputs) && Array.isArray(a.outputs)
        && a.inputs.every(name => names.includes(name)) && a.outputs.every(name => names.includes(name))),
      'DATA_RELATION', 'Every declared action input/output needs a supplied runtime source in this slice.', 'task-demonstrate', 'actions.inputs/outputs');
      check(output.schemaVersion === SCHEMA && output.planRevision === plan.revision
        && key(output.dossierRef) === key(packet.inputs.dossier), 'WRONG_VERSION', 'S7 output lineage/version is wrong.', stage, 'DistilledSteps');
      check(key(output.contractRef) === key(packet.inputs.contract) && key(output.workPlanRef) === key(packet.inputs.plan)
        && equal(output.appProfileRefs, packet.inputs.appProfiles) && equal(output.sourceActionRefs, [packet.inputs.actions])
        && equal(output.sideEffects, dossier.sideEffects),
        'WRONG_VERSION', 'S7 must retain contract/plan/profile bindings and known effect state.', stage, 'DistilledSteps');
      const stepIds = unique(output.steps, 'stepId', stage, 'steps');
      check(equal(output.steps.flatMap(s => list(s.sourceActionRefs)), actionIds), 'ACTION_COVERAGE',
        'Every source action must be retained in order; adjacent merges may not drop actions.', stage, 'steps.sourceActionRefs');
      unique(output.actionDecisions, 'actionRef', stage, 'actionDecisions');
      check(equal(output.actionDecisions.map(d => d.actionRef).sort(), [...actionIds].sort()), 'ACTION_COVERAGE',
        'Every raw action needs one disposition.', stage, 'actionDecisions');
      for (const step of output.steps) {
        check(text(step.purpose) && Array.isArray(step.inputs) && Array.isArray(step.outputs)
          && list(step.preconditions).length && text(step.verification) && text(step.expectedOutcome)
          && text(step.classification) && Array.isArray(step.dependencies), 'STEP_CONTRACT',
        'Necessary step input/output/conditions/verification is incomplete.', stage, step.stepId);
        const source = actions.filter(a => step.sourceActionRefs.includes(a.actionId));
        check(equal([...new Set(source.flatMap(a => list(a.inputs)))].sort(), [...step.inputs].sort())
          && equal([...new Set(source.flatMap(a => list(a.outputs)))].sort(), [...step.outputs].sort()),
        'DATA_RELATION', 'Merged step must retain all declared inputs and outputs.', stage, step.stepId);
        check(step.dependencies.every(id => stepIds.indexOf(id) >= 0 && stepIds.indexOf(id) < stepIds.indexOf(step.stepId)),
          'DATA_RELATION', 'Dependencies must point to earlier retained steps.', stage, step.stepId);
      }
      for (const d of output.actionDecisions) check(['retain', 'merge'].includes(d.decision) && text(d.reason)
        && outputStep(output.steps, d.actionRef)?.stepId === d.stepRef, 'ACTION_COVERAGE',
      'Disposition must point to the step that actually retained the action.', stage, d.actionRef);
      unique(output.runtimeValues, 'name', stage, 'runtimeValues');
      check(equal(output.runtimeValues.map(v => v.name).sort(), dossier.runtimeValues.map(v => v.name).sort()),
        'VALUE_COVERAGE', 'S7 must retain all required runtime values, including terminal reads.', stage, 'runtimeValues');
      for (const v of dossier.runtimeValues) {
        const projected = output.runtimeValues.find(p => p.name === v.name);
        for (const field of VALUE_FIELDS) check(equal(projected[field], v[field]), 'RUNTIME_SOURCE',
          'S7 lost or changed an upstream runtime fact/policy.', stage, v.name + '.' + field);
        const producer = actions.find(a => a.actionId === v.origin.actionRef);
        check(producer?.kind === 'actual-read' && producer.outputs.includes(v.name) && equal(producer.data.value, v.observedValue),
          'RUNTIME_SOURCE', 'Runtime producer is not the recorded read.', 'task-demonstrate', v.name);
        check(producer.data.applicationId === v.origin.applicationId && producer.data.targetId === v.origin.targetId,
          'OBSERVATION_MISMATCH', 'The actual read and its observation name different application targets.', 'task-demonstrate', v.name + '.origin');
        check(equal(actions.filter(a => a.outputs.includes(v.name)).map(a => a.actionId), [producer.actionId]),
          'DATA_RELATION', 'A runtime value must identify its one actual source read in this slice.', 'task-demonstrate', v.name + '.producer');
        check(equal([...v.consumers.filter(id => id !== 'final output')].sort(),
          actions.filter(a => a.inputs.includes(v.name)).map(a => a.actionId).sort()),
        'DATA_RELATION', 'The source ledger omitted, duplicated or invented an actual consumer.', 'task-demonstrate', v.name + '.consumers');
        const producerStep = outputStep(output.steps, producer.actionId).stepId;
        const consumers = v.consumers.map(id => id === 'final output' ? id : outputStep(output.steps, id)?.stepId);
        const bindings = v.consumers.filter(id => id !== 'final output').map(id => {
          const a = actions.find(a => a.actionId === id), b = a?.data?.bindings?.find(b => b.name === v.name);
          return { actionRef: id, targetId: a?.data?.targetId, transform: b?.transform, observedInput: b?.actual };
        });
        check(equal(projected.consumerBindings, bindings), 'DATA_RELATION',
          'S7 must deliver actual consumer bindings, not only a list of allowed transforms.', stage, v.name + '.consumerBindings');
        check(projected.producerStep === producerStep && equal(projected.consumerSteps, consumers) && consumers.every(text),
          'DATA_RELATION', 'S7 producer/consumer mapping is wrong.', stage, v.name);
        for (const id of v.consumers.filter(id => id !== 'final output')) {
          const consumer = actions.find(a => a.actionId === id);
          const bindings = list(consumer?.data?.bindings).filter(b => b.name === v.name);
          const binding = bindings[0];
          check(bindings.length === 1, 'DATA_RELATION', 'Each actual consumer needs one unambiguous binding for this value.', 'task-demonstrate', v.name);
          const target = profile.targets.find(t => t.id === consumer?.data?.targetId);
          check(target && target.applicationId === consumer.data.applicationId, 'APPLICATION_SOURCE',
            'The actual consumer target/application disagrees with the supplied profile.', 'task-demonstrate', v.name + '.consumers');
          check(actionIds.indexOf(id) > actionIds.indexOf(producer.actionId) && consumer.inputs.includes(v.name)
            && v.allowedTransforms.includes(binding?.transform)
            && equal(binding.actual, binding.transform === 'characters' ? [...v.observedValue] : v.observedValue),
          'DATA_RELATION', 'Actual consumer must use the observed value through an allowed lossless transform.', 'task-demonstrate', v.name);
          check(profile.relations.some(r => r.from === v.origin.targetId && r.to === consumer.data.targetId && r.kind === 'same-record-key'),
            'APPLICATION_SOURCE', 'The cross-target data relationship has no supplied basis.', 'application-engineer', v.name);
        }
      }
      distilled = output;
    } else {
      distilled = json(packet, packet.inputs.distilled);
      check(distilled.planRevision === plan.revision && output.schemaVersion === SCHEMA
        && key(output.distilledStepsRef) === key(packet.inputs.distilled), 'WRONG_VERSION', 'S9 must consume the exact S7 version.', stage, 'distilledStepsRef');
      values(packet, distilled.runtimeValues, contract, profile, 'trace-distill');
      const decisions = capabilitySources(packet, distilled, contract);
      const ids = unique(output.businessSteps, 'stepId', stage, 'businessSteps');
      check(equal(output.businessSteps.flatMap(s => list(s.sourceStepRefs)), distilled.steps.map(s => s.stepId)),
        'STEP_COVERAGE', 'Business steps must retain the ordered S7 path exactly once.', stage, 'businessSteps');
      const mapped = id => id === 'final output' ? id : output.businessSteps.find(s => s.sourceStepRefs.includes(id))?.stepId;
      for (const step of output.businessSteps) {
        check(text(step.purpose) && text(step.execution) && text(step.observation) && text(step.verification)
          && ['inputs', 'outputs', 'inputSources', 'preconditions', 'postconditions', 'stopConditions', 'consumers', 'sideEffects'].every(k => Array.isArray(step[k]))
          && step.preconditions.length && step.postconditions.length && step.stopConditions.length,
        'STEP_CONTRACT', 'Business step has a critical semantic gap.', stage, step.stepId);
        const sources = distilled.steps.filter(s => step.sourceStepRefs.includes(s.stepId));
        check(equal([...new Set(sources.flatMap(s => s.inputs))].sort(), [...step.inputs].sort())
          && equal([...new Set(sources.flatMap(s => s.outputs))].sort(), [...step.outputs].sort()),
        'DATA_RELATION', 'Business input/output differs from S7.', stage, step.stepId);
        check(equal(step.inputSources.map(s => s.name).sort(), [...step.inputs].sort()),
          'DATA_RELATION', 'Every business input needs exactly one source; conflicting extra sources are not evidence.', stage, step.stepId + '.inputSources');
        const expectedConsumers = [...new Set(distilled.runtimeValues
          .filter(v => mapped(v.producerStep) === step.stepId).flatMap(v => v.consumerSteps.map(mapped)))];
        check(equal([...step.consumers].sort(), expectedConsumers.sort()), 'DATA_RELATION',
          'Business consumers must preserve the same runtime and terminal destinations.', stage, step.stepId + '.consumers');
      }
      unique(output.runtimeValues, 'name', stage, 'runtimeValues');
      for (const role of ['parameters', 'config', 'secretRefs']) {
        const entries = Array.isArray(output[role]) ? output[role] : object(output[role]) ? Object.keys(output[role]).map(name => ({ name })) : [];
        check(!entries.some(item => distilled.runtimeValues.some(v => v.name === (typeof item === 'string' ? item : item.name))),
          'RUNTIME_AS_PARAMETER', 'Observed runtime values cannot become default inputs/configuration/secrets.', stage, role);
      }
      check(equal(output.runtimeValues.map(v => v.name).sort(), distilled.runtimeValues.map(v => v.name).sort()),
        'VALUE_COVERAGE', 'S9 omitted or invented a runtime value.', stage, 'runtimeValues');
      const expectedEdges = [];
      for (const v of distilled.runtimeValues) {
        const actual = output.runtimeValues.find(p => p.name === v.name);
        for (const field of [...VALUE_FIELDS, 'consumerBindings']) check(equal(actual[field], v[field]), 'RUNTIME_SOURCE',
          'S9 must preserve the sourced runtime facts/policy.', stage, v.name + '.' + field);
        const producer = mapped(v.producerStep), consumers = v.consumerSteps.map(mapped);
        check(actual.producerStep === producer && equal(actual.consumerSteps, consumers)
          && output.businessSteps.find(s => s.stepId === producer)?.outputs.includes(v.name),
        'DATA_RELATION', 'S9 runtime producer/consumer is wrong.', stage, v.name);
        // Different actions can legally merge into one step while consuming the
        // same value via different transforms. Bind by action, not first step match.
        for (const binding of v.consumerBindings) {
          const sourceStep = outputStep(distilled.steps, binding.actionRef)?.stepId;
          const consumer = mapped(sourceStep);
          check(ids.indexOf(producer) < ids.indexOf(consumer), 'CHECKER_COVERAGE',
            'This checker requires cross-business-step forward data edges.', 'validation', v.name);
          expectedEdges.push([producer, v.name, consumer, binding.transform].join('\0'));
          const step = output.businessSteps.find(s => s.stepId === consumer);
          check(step.inputSources.some(s => s.name === v.name && s.kind === 'runtime-value' && s.producer === producer),
            'DATA_RELATION', 'Business input source must explicitly bind the actual runtime producer.', stage, v.name);
        }
      }
      check(Array.isArray(output.dataDependencies), 'DATA_RELATION', 'Runtime edges are required.', stage, 'dataDependencies');
      const edges = output.dataDependencies.map(d => [d.producer, d.value, d.consumer, d.transform].join('\0'));
      check(equal([...edges].sort(), expectedEdges.sort()), 'DATA_RELATION', 'Runtime edges differ from actual source relationships.', stage, 'dataDependencies');
      for (const edge of output.dataDependencies) check(distilled.runtimeValues.find(v => v.name === edge.value).allowedTransforms.includes(edge.transform),
        'DATA_RELATION', 'Transformation is not authorized by the source policy.', stage, edge.value);
      unique(output.capabilityDecisions, 'decisionId', stage, 'capabilityDecisions');
      check(output.capabilityDecisions.length === decisions.length, 'CAPABILITY_SOURCE', 'Selection coverage differs.', stage, 'capabilityDecisions');
      for (const decision of decisions) {
        const businessStepRefs = [...new Set(decision.sourceActionRefs.map(id => mapped(outputStep(distilled.steps, id).stepId)))];
        const expected = { ...decision, businessStepRefs };
        delete expected.sourceActionRefs;
        check(equal(output.capabilityDecisions.find(d => d.decisionId === decision.decisionId), expected),
          'CAPABILITY_SOURCE', 'S9 selection must derive from the supplied record, not documentation or an answer.', stage, decision.decisionId);
        if (decision.runtimeValidation.status !== 'pass') report.pendingEngineering.push({ decisionId: decision.decisionId, owner: 'application-engineer', mode: 'harden', status: decision.runtimeValidation.status });
      }
    }
    check(Array.isArray(output.unresolved) && output.unresolved.length === 0, 'SEMANTIC_GAP',
      'Critical unresolved work cannot become a normal downstream result.', stage, 'unresolved');
    report.valueLineage = output.runtimeValues.map(v => {
      const source = distilled.runtimeValues.find(item => item.name === v.name);
      return { value: v.name, observedClaim: v.observedValue, action: v.origin.actionRef, consumers: v.consumers,
        distilled: [source.producerStep, ...source.consumerSteps],
        business: stage === 'procedure-synthesize' ? [v.producerStep, ...v.consumerSteps] : [],
        code: [], evidence: v.evidenceRefs, qualification: 'not-run' };
    });
    report.verdict = 'pass'; report.boundaries[stage] = 'pass'; report.localChecks[stage] = 'pass';
    report.proves = ['本输入包中的来源字节、声明映射、终点读值及有来源选型在限定顺序切片内一致'];
    report.next = stage === 'trace-distill' ? '仅交 S9，不授予业务资格。' : '语义切片可交接；待工程验证交 S10，不直接资格化候选。';
  } catch (error) {
    report.errors.push({ code: error.code || 'INPUT_FORMAT', message: error.message, boundary: stage,
      owner: error.owner || stage, location: error.location || 'input/output' });
    report.nextRequest = { owner: error.owner || stage, required: error.location || 'input/output',
      reason: error.message, ...(error.code === 'CAPABILITY_SOURCE_MISSING' ? { sourceOwner: 'task-demonstrate' } : {}),
      nextSafeAction: error.code === 'SIDE_EFFECT_UNKNOWN'
        ? '核对实际效果；禁止重放动作。' : '修正原责任成果或补充获准证据；保留旧版本，重新核验受影响边界。' };
  }
  return report;
}
module.exports = { checkSequential, SCOPE };
