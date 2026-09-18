#!/usr/bin/env node
'use strict';

// Read-only S7→S12 consumer check. It binds exact bytes and checks the
// producer/consumer relationships represented by the artifacts. It never runs
// a candidate, reconstructs missing history, or grants desktop authority.
const {
  SCHEMA, JSON_LIMIT, FILE_LIMIT, own, object, text, hash, CheckError,
  requireCheck, makeRoots, resolveFile, entryFile, readBytes, parseJson,
} = require('./artifact-validation.js');

const BOUNDARIES = ['bindings', 'trace-distill', 'procedure-synthesize', 'candidate', 'qualification'];

// A deliberately narrow source-pattern check, not a JavaScript data-flow proof.
// Mask comments and quoted text without shifting offsets into the original file.
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g,
    token => token.replace(/[^\r\n]/g, ' '));
}

function array(value, code, message) {
  requireCheck(Array.isArray(value), code, message);
  return value;
}

function valueStateUnknown(value) {
  if (typeof value === 'string') return /^(unknown|partial|possibly-applied)$/i.test(value.trim());
  if (Array.isArray(value)) return value.some(valueStateUnknown);
  if (object(value)) return Object.values(value).some(valueStateUnknown);
  return false;
}

function observedReadValues(action) {
  if (!object(action) || !object(action.data)) return [];
  return ['raw', 'first', 'second', 'value'].filter(key => text(action.data[key])).map(key => action.data[key]);
}

function containsContiguous(sequence, expected) {
  if (!Array.isArray(sequence) || !Array.isArray(expected) || expected.length === 0) return false;
  return sequence.some((_, index) => expected.every((item, offset) => sequence[index + offset] === item));
}

function referencedSteps(value) {
  return String(value || '').match(/\bB\d+\b/g) || [];
}

function refIdentity(ref) {
  return object(ref) ? [ref.rootId, ref.path, ref.sha256, ref.schemaVersion].join('\u0000') : '';
}

function callSegments(source, functionName) {
  const calls = [];
  const marker = functionName + '(';
  for (let start = source.indexOf(marker); start >= 0; start = source.indexOf(marker, start + marker.length)) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    let end = -1;
    for (let index = start + functionName.length; index < source.length; index += 1) {
      const char = source[index], next = source[index + 1];
      if (lineComment) { if (char === '\n') lineComment = false; continue; }
      if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
      if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
      if (char === '\'' || char === '"' || char === '`') { quote = char; continue; }
      if (char === '(') depth += 1;
      else if (char === ')' && --depth === 0) { end = index + 1; break; }
    }
    if (end > 0) calls.push({ start, end, source: source.slice(start, end) });
  }
  return calls;
}

/**
 * @param {{dossier:string,actions:string,distilled:string,procedure:string,candidate:string,qualification:string,roots:Array<[string,string]>}} options
 */
function checkArtifactChain(options) {
  const errors = [];
  const checks = [];
  const budget = { bytes: 0 };
  const verified = new Map();
  const entries = {};
  const evaluated = new Set(['bindings']);
  let referenceCount = 0;
  let roots;
  const capabilityDecisionById = new Map();

  const record = (boundary, location, code, message) => errors.push({ boundary, location, code, message });
  const attempt = (boundary, location, action) => {
    try {
      const result = action();
      checks.push({ boundary, location, verdict: 'pass' });
      return result;
    } catch (error) {
      record(boundary, location, error instanceof CheckError ? error.code : 'CHECK_FAILED',
        error instanceof CheckError ? error.message : 'The check could not be completed.');
      return undefined;
    }
  };

  roots = attempt('bindings', 'roots', () => makeRoots(options.roots));
  if (!roots) return report();

  const readEntry = (name, requireObject = true) => attempt('bindings', name, () => {
    const filename = entryFile(roots, options[name]);
    const bytes = readBytes(filename, JSON_LIMIT, budget);
    const parsed = parseJson(bytes);
    requireCheck(!requireObject || object(parsed), 'INVALID_DOCUMENT', name + ' must be a JSON object.');
    entries[name] = { filename, bytes, parsed };
    return parsed;
  });
  const dossier = readEntry('dossier');
  const actions = readEntry('actions', false);
  const distilled = readEntry('distilled');
  const procedure = readEntry('procedure');
  const candidate = readEntry('candidate');
  const qualification = readEntry('qualification');
  if (![dossier, actions, distilled, procedure, candidate, qualification].every(Boolean)) return report();

  const inspectRef = (ref, boundary, location) => attempt(boundary, location, () => {
    requireCheck(object(ref) && text(ref.rootId) && text(ref.path) && text(ref.kind)
      && text(ref.schemaVersion) && /^[0-9a-f]{64}$/.test(ref.sha256),
    'INVALID_REF', 'Expected a complete content-bound reference.');
    requireCheck(++referenceCount <= 1000, 'REFERENCE_LIMIT', 'Too many references for one bounded check.');
    const filename = resolveFile(roots, ref.rootId, ref.path);
    const key = [ref.rootId, ref.path, ref.sha256, ref.schemaVersion].join('\u0000');
    if (!verified.has(key)) {
      const bytes = readBytes(filename, FILE_LIMIT, budget);
      requireCheck(hash(bytes) === ref.sha256, 'HASH_MISMATCH', 'Referenced bytes do not match the recorded SHA-256.');
      verified.set(key, { filename, bytes });
    }
    return verified.get(key);
  });
  const bind = (ref, entryName, boundary, location) => {
    const result = inspectRef(ref, boundary, location);
    if (!result || !entries[entryName]) return;
    attempt(boundary, location + '.binding', () => requireCheck(result.filename === entries[entryName].filename
      && ref.sha256 === hash(entries[entryName].bytes), 'WRONG_VERSION',
    'The reference does not bind the exact supplied artifact version.'));
  };
  const inspectRefs = (refs, boundary, location, required = false) => {
    if (required) attempt(boundary, location, () => requireCheck(Array.isArray(refs) && refs.length > 0,
      'MISSING_EVIDENCE', 'At least one content-bound evidence reference is required.'));
    if (Array.isArray(refs)) refs.forEach((ref, index) => inspectRef(ref, boundary, location + '[' + index + ']'));
  };

  for (const [name, document] of [['dossier', dossier], ['distilled', distilled], ['procedure', procedure],
    ['candidate', candidate], ['qualification', qualification]]) {
    if (document) attempt('bindings', name + '.schemaVersion', () => requireCheck(document.schemaVersion === SCHEMA,
      'SCHEMA_VERSION', 'Only agent-to-recipe/v1 artifacts are accepted.'));
  }

  if (dossier && actions && distilled) attempt('trace-distill', 'structure', () => {
    evaluated.add('trace-distill');
    requireCheck(Array.isArray(actions) && actions.length > 0,
      'ACTIONS_REQUIRED', 'Raw actions must be a nonempty array.');
    bind(dossier.actionsRef, 'actions', 'bindings', 'dossier.actionsRef');
    bind(distilled.dossierRef, 'dossier', 'bindings', 'distilled.dossierRef');
    const actionSource = Array.isArray(distilled.sourceActionRefs) && distilled.sourceActionRefs[0];
    bind(actionSource, 'actions', 'bindings', 'distilled.sourceActionRefs[0]');

    const actionById = new Map();
    actions.forEach((action, index) => attempt('trace-distill', 'actions[' + index + ']', () => {
      requireCheck(object(action) && text(action.actionId) && !actionById.has(action.actionId),
        'ACTION_ID', 'Every raw action needs a unique actionId.');
      actionById.set(action.actionId, { action, index });
    }));
    const steps = array(distilled.steps, 'SOURCE_STEPS', 'DistilledSteps requires a steps array.');
    requireCheck(steps.length > 0, 'SOURCE_STEPS', 'The normal path must not be empty.');
    const stepById = new Map();
    steps.forEach((step, index) => attempt('trace-distill', 'distilled.steps[' + index + ']', () => {
      requireCheck(object(step) && text(step.stepId) && !stepById.has(step.stepId),
        'STEP_ID', 'Every DistilledStep needs a unique stepId.');
      stepById.set(step.stepId, { step, index });
      array(step.sourceActionRefs, 'SOURCE_ACTIONS', 'Each DistilledStep must cite source actions.');
      for (const actionId of step.sourceActionRefs) requireCheck(actionById.has(actionId),
        'UNKNOWN_ACTION', 'A DistilledStep cites an unknown raw action.');
      for (const dependency of array(step.dependencies || [], 'DEPENDENCIES', 'dependencies must be an array.')) {
        requireCheck(stepById.has(dependency) && stepById.get(dependency).index < index,
          'STEP_ORDER', 'Dependencies must name an earlier DistilledStep.');
      }
    }));
    let lastActionIndex = -1;
    for (const step of steps) for (const actionId of step.sourceActionRefs || []) {
      const index = actionById.get(actionId)?.index;
      attempt('trace-distill', 'distilled.steps.' + step.stepId + '.sourceActionRefs', () => requireCheck(index > lastActionIndex,
        'ACTION_ORDER', 'DistilledSteps may not reorder retained source actions.'));
      lastActionIndex = Math.max(lastActionIndex, index);
    }

    const decisionByAction = new Map();
    for (const [index, decision] of array(distilled.actionDecisions, 'ACTION_DECISION', 'actionDecisions must be an array.').entries()) {
      attempt('trace-distill', 'distilled.actionDecisions[' + index + ']', () => {
        requireCheck(object(decision) && actionById.has(decision.actionRef) && !decisionByAction.has(decision.actionRef),
          'ACTION_DECISION', 'Each decision must bind one unique raw action.');
        requireCheck(['retain', 'merge', 'omit', 'recovery', 'unresolved'].includes(decision.decision),
          'ACTION_DECISION', 'Unsupported action decision.');
        if (decision.decision !== 'omit') requireCheck(stepById.has(decision.stepRef),
          'ACTION_DECISION', 'A non-omitted action decision must cite a DistilledStep.');
        requireCheck(text(decision.reason), 'ACTION_DECISION', 'Each disposition needs its source-based reason.');
        if (decision.decision === 'retain') requireCheck(
          stepById.get(decision.stepRef).step.sourceActionRefs.includes(decision.actionRef),
          'ACTION_DECISION', 'A retained action must occur in its declared step.');
        decisionByAction.set(decision.actionRef, decision);
      });
    }
    attempt('trace-distill', 'distilled.actionDecisions.coverage', () => requireCheck(
      decisionByAction.size === actionById.size && [...actionById.keys()].every(id => decisionByAction.has(id)),
      'ACTION_DECISION_COVERAGE', 'Every raw action must have exactly one disposition.'));
    for (const [actionId, item] of actionById) {
      const decision = decisionByAction.get(actionId);
      if (decision && ['actual-input', 'actual-read'].includes(item.action.kind)) {
        attempt('trace-distill', 'distilled.actionDecisions.' + actionId, () => requireCheck(decision.decision !== 'omit',
          'NECESSARY_ACTION_OMITTED', 'Actual input and reads cannot be silently removed during distillation.'));
      }
      if (item.action.kind === 'actual-input') attempt('trace-distill', 'actions.' + actionId + '.receipt', () => {
        const receipt = item.action.data && item.action.data.receipt;
        requireCheck(object(receipt) && receipt.ok === true && Array.isArray(receipt.completed)
          && receipt.completed.length > 0 && receipt.completed.every(done => done.ok === true
            && done.actionState === 'acknowledged'), 'SIDE_EFFECT_UNKNOWN',
        'An actual input with missing, failed, partial or unknown receipt must stop the chain.');
      });
    }
    for (const step of steps) for (const actionId of step.sourceActionRefs) {
      attempt('trace-distill', 'distilled.steps.' + step.stepId + '.disposition', () => {
        const decision = decisionByAction.get(actionId);
        requireCheck(decision && ['retain', 'merge'].includes(decision.decision) && decision.stepRef === step.stepId,
          'ACTION_DECISION', 'Normal-path sources must match their retained or merged disposition.');
      });
    }
    attempt('trace-distill', 'dossier.sideEffects', () => requireCheck(object(dossier.sideEffects)
      && dossier.sideEffects.inputState === 'confirmed' && !valueStateUnknown(dossier.sideEffects),
      'SIDE_EFFECT_UNKNOWN', 'Unknown or partial side effects must be resolved before successful distillation.'));

    for (const [index, runtimeValue] of array(dossier.runtimeValues, 'RUNTIME_VALUES', 'runtimeValues must be an array.').entries()) {
      const base = 'dossier.runtimeValues[' + index + ']';
      const match = text(runtimeValue.origin) && runtimeValue.origin.match(/\bA\d+\b/);
      attempt('trace-distill', base + '.origin', () => requireCheck(match && actionById.has(match[0])
        && actionById.get(match[0]).action.kind === 'actual-read', 'HISTORICAL_FACT_UNBOUND',
      'A runtime value must bind an actual-read action, not a post-hoc explanation.'));
      inspectRefs(runtimeValue.evidenceRefs, 'trace-distill', base + '.evidenceRefs', true);
      if (!match || !actionById.has(match[0])) continue;
      const producerAction = actionById.get(match[0]).action;
      attempt('trace-distill', base + '.observedValue', () => requireCheck(text(runtimeValue.observedValue)
        && observedReadValues(producerAction).includes(runtimeValue.observedValue), 'HISTORICAL_FACT_UNBOUND',
      'The recorded runtime value must equal its cited actual read.'));
      const producerDecision = decisionByAction.get(match[0]);
      const producerStep = producerDecision && stepById.get(producerDecision.stepRef);
      attempt('trace-distill', base + '.producer', () => requireCheck(producerStep
        && (producerStep.step.outputs || []).includes(runtimeValue.name), 'DATA_DEPENDENCY_BROKEN',
      'The producer DistilledStep must output the runtime value.'));
      for (const consumerId of runtimeValue.consumers || []) {
        if (!actionById.has(consumerId)) continue;
        const consumer = actionById.get(consumerId).action;
        const consumerDecision = decisionByAction.get(consumerId);
        const consumerStep = consumerDecision && stepById.get(consumerDecision.stepRef);
        attempt('trace-distill', base + '.consumer.' + consumerId, () => requireCheck(consumerStep
          && (consumerStep.step.inputs || []).includes(runtimeValue.name), 'DATA_DEPENDENCY_BROKEN',
        'The consumer DistilledStep must declare the runtime value as an input.'));
        if (consumer.kind === 'actual-input' && runtimeValue.type === 'digit-string') {
          attempt('trace-distill', base + '.consumer.' + consumerId + '.digits', () => requireCheck(
            containsContiguous(consumer.data && consumer.data.names, [...runtimeValue.observedValue]),
            'DATA_DEPENDENCY_BROKEN', 'Actual input must preserve every observed digit, including repetitions.'));
        }
      }
    }
    inspectRefs(distilled.evidenceRefs, 'trace-distill', 'distilled.evidenceRefs', true);
  });

  if (distilled && procedure) attempt('procedure-synthesize', 'structure', () => {
    evaluated.add('procedure-synthesize');
    bind(procedure.distilledStepsRef, 'distilled', 'bindings', 'procedure.distilledStepsRef');
    attempt('procedure-synthesize', 'procedure.actionDecisions', () => requireCheck(!own(procedure, 'actionDecisions'),
      'DUPLICATE_DISPOSITION', 'Procedure must consume DistilledSteps rather than maintain a second action disposition.'));
    const businessSteps = array(procedure.businessSteps, 'BUSINESS_STEPS', 'Procedure requires businessSteps.');
    const businessById = new Map();
    const sourceToBusiness = new Map();
    businessSteps.forEach((step, index) => attempt('procedure-synthesize', 'procedure.businessSteps[' + index + ']', () => {
      requireCheck(object(step) && text(step.stepId) && !businessById.has(step.stepId),
        'BUSINESS_STEP_ID', 'Every Business Step needs a unique stepId.');
      businessById.set(step.stepId, step);
      for (const sourceId of array(step.sourceStepRefs, 'SOURCE_STEPS', 'Business Steps must cite DistilledSteps.')) {
        requireCheck(!sourceToBusiness.has(sourceId), 'SOURCE_STEP_COVERAGE',
          'A DistilledStep may not be silently reinterpreted by multiple Business Steps.');
        sourceToBusiness.set(sourceId, step);
      }
    }));
    attempt('procedure-synthesize', 'procedure.sourceStepCoverage', () => requireCheck(
      (distilled.steps || []).every(step => sourceToBusiness.has(step.stepId))
        && sourceToBusiness.size === (distilled.steps || []).length,
      'SOURCE_STEP_COVERAGE', 'Every DistilledStep must be consumed exactly once by the Procedure.'));
    attempt('procedure-synthesize', 'procedure.sourceStepOrder', () => requireCheck(
      JSON.stringify(businessSteps.flatMap(step => step.sourceStepRefs))
        === JSON.stringify(distilled.steps.map(step => step.stepId)),
      'STEP_ORDER', 'Business Steps must preserve the distilled source order.'));
    for (const dependency of procedure.dataDependencies || []) {
      attempt('procedure-synthesize', 'procedure.dataDependencies.' + dependency.value, () => {
        const producer = businessById.get(dependency.producer), consumer = businessById.get(dependency.consumer);
        requireCheck(producer && consumer && (producer.outputs || []).includes(dependency.value)
          && (consumer.inputs || []).includes(dependency.value), 'DATA_DEPENDENCY_BROKEN',
        'Procedure data dependency must link a declared producer output to a consumer input.');
      });
    }
    for (const runtimeValue of dossier && dossier.runtimeValues || []) {
      if (!(runtimeValue.consumers || []).some(id => /^A\d+$/.test(id))) continue;
      const dependency = (procedure.dataDependencies || []).find(item => item.value === runtimeValue.name);
      attempt('procedure-synthesize', 'procedure.dataDependencies.' + runtimeValue.name, () => requireCheck(dependency,
        'DATA_DEPENDENCY_BROKEN', 'A demonstrated runtime producer/consumer value needs a Procedure dependency.'));
      if (dependency) attempt('procedure-synthesize', 'procedure.dataDependencies.' + runtimeValue.name + '.provenance', () => {
        const producerId = String(runtimeValue.origin || '').match(/\bA\d+\b/)?.[0];
        const decision = id => distilled.actionDecisions.find(item => item.actionRef === id);
        const producer = sourceToBusiness.get(decision(producerId)?.stepRef);
        requireCheck(producer?.stepId === dependency.producer, 'DATA_DEPENDENCY_BROKEN',
          'Procedure producer must map to the demonstrated runtime read.');
        for (const id of runtimeValue.consumers.filter(item => /^A\d+$/.test(item))) {
          requireCheck(sourceToBusiness.get(decision(id)?.stepRef)?.stepId === dependency.consumer,
            'DATA_DEPENDENCY_BROKEN', 'Procedure consumer must map to the demonstrated downstream action.');
        }
      });
      for (const parameter of Object.values(procedure.parameters || {})) {
        attempt('procedure-synthesize', 'procedure.parameters.' + runtimeValue.name, () => requireCheck(
          !object(parameter) || parameter.value !== runtimeValue.observedValue,
          'OBSERVATION_BECAME_PARAMETER', 'An observed runtime value cannot become a reusable input default.'));
      }
    }

    const capabilityDecisions = array(procedure.capabilityDecisions, 'CAPABILITY_DECISION_REQUIRED',
      'Procedure requires capabilityDecisions for Recipe-driving OpenDesk capability choices.');
    requireCheck(capabilityDecisions.length > 0, 'CAPABILITY_DECISION_REQUIRED',
      'At least one Recipe-driving capability choice must be traceable.');
    for (const [index, decision] of capabilityDecisions.entries()) {
      const base = 'procedure.capabilityDecisions[' + index + ']';
      attempt('procedure-synthesize', base, () => {
        requireCheck(object(decision) && text(decision.decisionId) && !capabilityDecisionById.has(decision.decisionId),
          'CAPABILITY_DECISION', 'Each capability decision needs a unique decisionId.');
        requireCheck(text(decision.capabilityNeed), 'CAPABILITY_DECISION', 'Each capability decision needs a business capability need.');
        const stepRefs = array(decision.businessStepRefs, 'CAPABILITY_DECISION', 'businessStepRefs must be an array.');
        requireCheck(stepRefs.length > 0 && stepRefs.every(stepId => businessById.has(stepId)),
          'CAPABILITY_DECISION', 'Capability decisions must cite existing Business Steps.');
        const discoveryPath = array(decision.discoveryPath, 'DISCOVERY_PATH', 'discoveryPath must be an array.');
        requireCheck(discoveryPath[0] === 'docs/api/agent/README.md'
          && discoveryPath.slice(1).some(item => /^docs\/api\/agent\/[^/]+\.md$/.test(item)),
        'DISCOVERY_PATH', 'Capability discovery must start at the Agent API short entry and include a capability catalog.');
        const candidates = array(decision.candidates, 'METHOD_SELECTION', 'candidates must be an array.');
        requireCheck(candidates.length > 0, 'METHOD_SELECTION', 'Capability discovery must leave at least one method candidate.');
        const selected = candidates.filter(item => object(item) && item.disposition === 'selected');
        requireCheck(selected.length === 1 && text(decision.selectedMethod)
          && selected[0].method === decision.selectedMethod, 'METHOD_SELECTION',
        'Method selection must name exactly one selected candidate.');
        for (const [candidateIndex, candidateChoice] of candidates.entries()) {
          requireCheck(object(candidateChoice) && text(candidateChoice.method)
            && ['selected', 'rejected', 'failed', 'not-run'].includes(candidateChoice.disposition)
            && text(candidateChoice.reason), 'METHOD_SELECTION',
          'Every method candidate needs method, disposition and concise reason.');
          if (candidateChoice.disposition === 'failed') {
            inspectRefs(candidateChoice.validationEvidenceRefs, 'procedure-synthesize',
              base + '.candidates[' + candidateIndex + '].validationEvidenceRefs', true);
          }
        }
        inspectRefs(selected[0].canonicalContractRefs, 'procedure-synthesize',
          base + '.selected.canonicalContractRefs', true);
        inspectRefs(decision.sharedConstraintRefs, 'procedure-synthesize', base + '.sharedConstraintRefs');
        requireCheck(object(decision.runtimeValidation)
          && ['pass', 'fail', 'partial', 'not-run'].includes(decision.runtimeValidation.status),
        'METHOD_VALIDATION', 'runtimeValidation needs an explicit status.');
        requireCheck(decision.runtimeValidation.status === 'pass',
          'METHOD_NOT_VALIDATED', 'A successful Recipe chain may only consume a method validated in the recorded environment.');
        requireCheck(text(decision.runtimeValidation.environmentScope),
          'METHOD_VALIDATION', 'Runtime validation needs an environment scope.');
        inspectRefs(decision.runtimeValidation.evidenceRefs, 'procedure-synthesize',
          base + '.runtimeValidation.evidenceRefs', true);
        requireCheck(array(decision.recipeConsumers, 'CAPABILITY_DECISION', 'recipeConsumers must be an array.')
          .every(text) && decision.recipeConsumers.length > 0,
        'CAPABILITY_DECISION', 'A capability decision needs at least one Recipe consumer.');
        requireCheck(array(decision.revalidateWhen, 'CAPABILITY_DECISION', 'revalidateWhen must be an array.').every(text),
          'CAPABILITY_DECISION', 'revalidateWhen entries must be strings.');
        capabilityDecisionById.set(decision.decisionId, decision);
      });
    }
  });

  let scriptSource;
  if (procedure && candidate) attempt('candidate', 'structure', () => {
    evaluated.add('candidate');
    bind(candidate.procedureRef, 'procedure', 'bindings', 'candidate.procedureRef');
    const script = inspectRef(candidate.scriptRef, 'candidate', 'candidate.scriptRef');
    if (script) scriptSource = script.bytes.toString('utf8');
    const sourceMapping = array(candidate.sourceMapping, 'SOURCE_MAPPING', 'Candidate sourceMapping must be an array.');
    const mappedSteps = new Set(sourceMapping.flatMap(mapping => referencedSteps(mapping.step)));
    attempt('candidate', 'candidate.sourceMapping', () => requireCheck(
      (procedure.businessSteps || []).every(step => mappedSteps.has(step.stepId)),
      'SOURCE_MAPPING', 'Candidate sourceMapping must cover every Business Step.'));

    const apiRefs = array(candidate.apiRefs, 'API_REF_MISMATCH', 'Candidate apiRefs must be an array.');
    inspectRefs(apiRefs, 'candidate', 'candidate.apiRefs', true);
    const apiRefKeys = new Set(apiRefs.map(refIdentity));
    const mappedDecisionIds = new Set();
    for (const [index, mapping] of sourceMapping.entries()) {
      for (const decisionId of mapping.capabilityDecisionRefs || []) {
        attempt('candidate', 'candidate.sourceMapping[' + index + '].capabilityDecisionRefs', () => {
          requireCheck(capabilityDecisionById.has(decisionId), 'CAPABILITY_SOURCE_MAPPING',
            'Candidate sourceMapping cites an unknown capability decision.');
          mappedDecisionIds.add(decisionId);
        });
      }
    }
    for (const [decisionId, decision] of capabilityDecisionById) {
      attempt('candidate', 'candidate.capabilityDecision.' + decisionId, () => {
        requireCheck(mappedDecisionIds.has(decisionId), 'CAPABILITY_SOURCE_MAPPING',
          'Every Procedure capability decision must be consumed by Candidate sourceMapping.');
        const selected = decision.candidates.find(item => item.disposition === 'selected');
        const requiredRefs = [...(selected && selected.canonicalContractRefs || []), ...(decision.sharedConstraintRefs || [])];
        requireCheck(requiredRefs.length > 0 && requiredRefs.every(ref => apiRefKeys.has(refIdentity(ref))),
          'API_REF_MISMATCH', 'Candidate apiRefs must bind the selected canonical contract and required shared constraints.');
      });
    }
    for (const dependency of procedure.dataDependencies || []) {
      const producerMapping = (candidate.sourceMapping || []).find(mapping => referencedSteps(mapping.step).includes(dependency.producer));
      const consumerMapping = (candidate.sourceMapping || []).find(mapping => referencedSteps(mapping.step).includes(dependency.consumer));
      attempt('candidate', 'candidate.dataDependency.' + dependency.value, () => {
        requireCheck(scriptSource && producerMapping && text(producerMapping.function)
          && consumerMapping && text(consumerMapping.function), 'SOURCE_MAPPING',
        'Runtime data dependencies need producer and consumer function mappings.');
        const assignmentPattern = new RegExp('(?:const|let)\\s+' + dependency.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          + '\\s*=\\s*await\\s+' + producerMapping.function.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
        const masked = codeOnly(scriptSource);
        const assignment = assignmentPattern.exec(masked);
        requireCheck(assignment, 'DATA_DEPENDENCY_BROKEN', 'Candidate must assign the actual producer return value.');
        const calls = callSegments(masked, consumerMapping.function).filter(call => call.start > assignment.index);
        const spreadPattern = new RegExp('\\.\\.\\.\\s*' + dependency.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        const dynamicCall = calls.find(call => spreadPattern.test(call.source));
        requireCheck(dynamicCall, 'DATA_DEPENDENCY_BROKEN',
          'Candidate consumer must use the producer value; reading it while using a sample constant is rejected.');
        const observed = (dossier && dossier.runtimeValues || []).find(value => value.name === dependency.value);
        if (observed && /^\d+$/.test(observed.observedValue) && observed.observedValue.length > 1) {
          const literalDigits = [...observed.observedValue]
            .map(digit => "['\"]" + digit + "['\"]").join('\\s*,\\s*');
          requireCheck(!(new RegExp(literalDigits)).test(scriptSource.slice(dynamicCall.start, dynamicCall.end)), 'OBSERVED_VALUE_IN_SOURCE',
            'The consumer call may not also embed the demonstrated digit sequence as literals.');
        }
      });
    }
  });

  if (candidate && qualification) attempt('qualification', 'structure', () => {
    evaluated.add('qualification');
    bind(qualification.candidateRef, 'candidate', 'bindings', 'qualification.candidateRef');
    attempt('qualification', 'qualification.identity', () => requireCheck(text(candidate.taskId)
      && text(candidate.revision) && candidate.taskId === qualification.taskId
      && candidate.revision === qualification.revision, 'MIXED_ATTEMPT',
    'Qualification must identify the same task and candidate revision.'));
    inspectRefs(qualification.evidenceRefs, 'qualification', 'qualification.evidenceRefs', true);
    attempt('qualification', 'qualification.normalPath', () => requireCheck(qualification.verdict === 'pass',
      'QUALIFICATION_NOT_PASSED', 'This consumer check requires a passed qualification; failed records remain diagnostic evidence.'));
    const scope = qualification.qualificationScope;
    attempt('qualification', 'qualification.qualificationScope', () => {
      requireCheck(object(scope), 'QUALIFICATION_SCOPE', 'Qualification requires explicit requested/exercised/qualified scope.');
      const requested = array(scope.requested, 'QUALIFICATION_SCOPE', 'requested scope must be an array.');
      const exercised = new Set(array(scope.exercised, 'QUALIFICATION_SCOPE', 'exercised scope must be an array.'));
      const qualified = new Set(array(scope.qualified, 'QUALIFICATION_SCOPE', 'qualified scope must be an array.'));
      requireCheck([...requested, ...exercised, ...qualified].every(text),
        'QUALIFICATION_SCOPE', 'Scope entries must be nonempty strings.');
      requireCheck(requested.length > 0 && requested.every(item => exercised.has(item) && qualified.has(item)),
        'PARTIAL_QUALIFICATION', 'A pass cannot omit requested scope from exercised or qualified scope.');
      const skipped = new Set((qualification.skipped || []).flatMap(item => typeof item === 'string' ? [item] : [item.scope, item.id]));
      requireCheck(requested.every(item => !skipped.has(item)), 'PARTIAL_QUALIFICATION',
        'Requested scope may not be moved to skipped while claiming pass.');
    });
    if (qualification.verdict === 'pass') {
      attempt('qualification', 'qualification.verdict', () => requireCheck(
        Array.isArray(qualification.failedCriteria) && qualification.failedCriteria.length === 0
          && Array.isArray(qualification.scenarios) && qualification.scenarios.length > 0
          && qualification.scenarios.every(scenario => scenario.verdict === 'pass'),
        'PARTIAL_QUALIFICATION', 'An overall pass requires all recorded scenarios to pass and no failed criteria.'));
    }
    for (const [index, scenario] of (qualification.scenarios || []).entries()) {
      inspectRefs(scenario.evidenceRefs, 'qualification', 'qualification.scenarios[' + index + '].evidenceRefs',
        qualification.verdict === 'pass');
    }
  });

  return report();

  function report() {
    const status = Object.fromEntries(BOUNDARIES.map(boundary => [boundary,
      errors.some(error => error.boundary === boundary) ? 'fail' : evaluated.has(boundary) ? 'pass' : 'not-run']));
    return {
      tool: 'agent-to-recipe-artifact-chain/v1', verdict: errors.length ? 'fail' : 'pass',
      boundaries: status, checkedFiles: new Set([...verified.values()].map(value => value.filename)).size,
      readBytes: budget.bytes, errors,
      proves: ['exact-byte bindings', 'raw-action disposition coverage', 'runtime-value producer/consumer declarations',
        'capability discovery → method selection → canonical contract → recorded runtime validation linkage',
        'selected API contract refs carried into Candidate source mapping',
        'Procedure-to-Candidate direct await/spread source pattern', 'Candidate-to-Qualification declared scope binding'],
      scope: 'Calculator-shaped v1 successful artifact slice; selected stage refs, not a complete schema or dependency closure',
      notEvaluated: ['truth of historical observations beyond bound evidence', 'desktop actions or OS input events',
        'visual correctness', 'human acceptance', 'host skill discovery/loading', 'blind-context model performance',
        'semantic correctness of a catalog/contract beyond its bound bytes or of runtime evidence beyond its cited record',
        'JavaScript reachability, aliasing, shadowing or general data-flow correctness',
        'transitive dependency closure, arbitrary trace formats or business semantics',
        'unsupported inputs, platforms or layouts'],
      desktopActionsAuthorized: false,
      next: errors.length ? 'Return each error to its named boundary; do not infer or replay missing desktop facts.'
        : 'This artifact slice is internally consistent. Use its separate Qualification evidence for live behavior claims.',
    };
  }
}

const HELP = 'Usage: node workflows/agent-to-recipe/scripts/check-artifact-chain.js --dossier <dossier.json> --actions <actions.json> --distilled <distilled-steps.json> --procedure <procedure.json> --candidate <candidate.json> --qualification <qualification.json> --root <id=directory> [--root <id=directory> ...]\nRead-only S7→S12 consumer check. Exit: 0 pass, 1 semantic/integrity failure, 2 usage error.\n';
function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') { process.stdout.write(HELP); return 0; }
  try {
    const options = { roots: [] };
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index], value = argv[index + 1];
      requireCheck(['--dossier', '--actions', '--distilled', '--procedure', '--candidate', '--qualification', '--root']
        .includes(flag) && text(value) && !value.startsWith('--'), 'USAGE', 'Unknown option or missing argument.');
      if (flag === '--root') {
        const separator = value.indexOf('=');
        requireCheck(separator > 0 && separator < value.length - 1, 'USAGE', 'Use --root id=directory.');
        options.roots.push([value.slice(0, separator), value.slice(separator + 1)]);
      } else {
        const key = flag.slice(2);
        requireCheck(!own(options, key), 'USAGE', 'Input options may only be supplied once.');
        options[key] = value;
      }
    }
    for (const name of ['dossier', 'actions', 'distilled', 'procedure', 'candidate', 'qualification']) {
      requireCheck(text(options[name]), 'USAGE', 'All six artifact paths are required.');
    }
    requireCheck(options.roots.length > 0, 'USAGE', 'At least one explicit root is required.');
    const report = checkArtifactChain(options);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.verdict === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write((error instanceof CheckError ? error.message : 'Invalid invocation.') + '\n' + HELP);
    return 2;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { checkArtifactChain, main };
