#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VALIDATOR_PATH = path.resolve(__dirname, 'validate-semantic-build-plan.js');
const {validateSemanticBuildPlan} = require(VALIDATOR_PATH);

const RUBRIC_PATH = path.resolve(
  __dirname, '..', 'references', 'semantic-quality-rubric.json',
);
const RUBRIC = JSON.parse(fs.readFileSync(RUBRIC_PATH, 'utf8'));
const SHA256 = /^[a-f0-9]{64}$/;
const EVENT_STYLE_NAME = /^(?:(?:a|e)\d+|(?:click|action|step)[-_]?\d+)$/i;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasSourceRefs(value) {
  return isObject(value)
    && Array.isArray(value.sourceRefs)
    && value.sourceRefs.length > 0
    && value.sourceRefs.every(isNonEmptyString);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function resolveArtifactPath(value, cwd) {
  if (!isNonEmptyString(value)) return null;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

function validateRubric(rubric) {
  if (!isObject(rubric)
      || rubric.formatVersion !== 'human-to-recipe.semantic-quality-rubric/v1'
      || !Number.isInteger(rubric.passThreshold)
      || !Array.isArray(rubric.hardGates)
      || !Array.isArray(rubric.dimensions)) {
    throw new Error('semantic quality rubric has an invalid top-level contract');
  }
  const hardGateIds = new Set(rubric.hardGates);
  if (hardGateIds.size !== rubric.hardGates.length) {
    throw new Error('semantic quality rubric has duplicate hard gate IDs');
  }
  const checkIds = new Set();
  let total = 0;
  for (const dimension of rubric.dimensions) {
    if (!isObject(dimension) || !Array.isArray(dimension.checks)) {
      throw new Error('semantic quality rubric has an invalid dimension');
    }
    const sum = dimension.checks.reduce((value, check) => {
      if (!isObject(check) || !isNonEmptyString(check.id)
          || !Number.isInteger(check.points) || check.points < 1) {
        throw new Error(`semantic quality rubric has an invalid check in ${dimension.id}`);
      }
      if (checkIds.has(check.id)) throw new Error(`duplicate rubric check ID ${check.id}`);
      checkIds.add(check.id);
      return value + check.points;
    }, 0);
    if (sum !== dimension.maxPoints
        || !Number.isInteger(dimension.minimumPoints)
        || dimension.minimumPoints < 0
        || dimension.minimumPoints > dimension.maxPoints) {
      throw new Error(`semantic quality rubric dimension ${dimension.id} has inconsistent points`);
    }
    total += dimension.maxPoints;
  }
  if (total !== 100) throw new Error(`semantic quality rubric totals ${total}, expected 100`);
  return {hardGateIds, checkIds, total};
}

const RUBRIC_CONTRACT = validateRubric(RUBRIC);
const API_POLICY = new Map(
  RUBRIC.runtimeApiPolicy.primitives.map(item => [item.name, item.productionPolicy]),
);
const RECOGNIZED_API_ROOTS = new Set(RUBRIC.runtimeApiPolicy.recognizedRoots);

function stripJavaScriptText(source) {
  let output = '';
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (current === '/' && next === '/') {
        state = 'line-comment';
        output += '  ';
        index += 1;
      } else if (current === '/' && next === '*') {
        state = 'block-comment';
        output += '  ';
        index += 1;
      } else if (current === "'") {
        state = 'single-string';
        output += ' ';
      } else if (current === '"') {
        state = 'double-string';
        output += ' ';
      } else if (current === '`') {
        state = 'template-string';
        output += ' ';
      } else {
        output += current;
      }
      continue;
    }
    if (state === 'line-comment') {
      if (current === '\n') {
        state = 'code';
        output += '\n';
      } else {
        output += ' ';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        state = 'code';
        output += '  ';
        index += 1;
      } else {
        output += current === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (current === '\\') {
      output += '  ';
      index += 1;
    } else if ((state === 'single-string' && current === "'")
        || (state === 'double-string' && current === '"')
        || (state === 'template-string' && current === '`')) {
      state = 'code';
      output += ' ';
    } else {
      output += current === '\n' ? '\n' : ' ';
    }
  }
  return output;
}

function extractRuntimeCalls(source) {
  const stripped = stripJavaScriptText(source);
  const calls = new Set();
  const expression = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of stripped.matchAll(expression)) {
    if (RECOGNIZED_API_ROOTS.has(match[1])) calls.add(`${match[1]}.${match[2]}`);
  }
  return [...calls].sort();
}

function intentResolution(plan, key) {
  const explicit = plan.intent && plan.intent.resolution && plan.intent.resolution[key];
  if (isObject(explicit)) return {status: explicit.status, explicit: true};
  if (key === 'businessGoal') {
    return {status: isNonEmptyString(plan.intent && plan.intent.businessGoal) ? 'confirmed' : 'unknown', explicit: false};
  }
  if (key === 'successConditions') {
    return {
      status: Array.isArray(plan.intent && plan.intent.successConditions)
        && plan.intent.successConditions.length > 0 ? 'confirmed' : 'unknown',
      explicit: false,
    };
  }
  return {
    status: Array.isArray(plan.intent && plan.intent.allowedSideEffects)
      && plan.intent.allowedSideEffects.length > 0 ? 'confirmed' : 'unknown',
    explicit: false,
  };
}

function collectKnownConsumers(plan) {
  const values = [];
  for (const key of ['applicationKnowledge', 'targets', 'actionStrategies', 'runtimeGuards', 'recoveryRules']) {
    for (const item of Array.isArray(plan[key]) ? plan[key] : []) values.push(item && item.id);
  }
  for (const item of plan.qualification && Array.isArray(plan.qualification.claims)
    ? plan.qualification.claims : []) values.push(item && item.id);
  for (const item of plan.evidence && Array.isArray(plan.evidence.items)
    ? plan.evidence.items : []) values.push(item && item.id);
  return new Set(values.filter(isNonEmptyString));
}

function inspectArtifact(plan, cwd) {
  const generated = plan.verification && plan.verification.generated;
  const production = plan.outputs && plan.outputs.productionRecipe;
  const artifactPath = resolveArtifactPath(production && production.path, cwd);
  const result = {
    stage: generated === 'present' ? 'production' : 'plan',
    path: production && production.path || null,
    exists: false,
    expectedSha256: production && production.sha256 || null,
    actualSha256: null,
    integrity: false,
    runtimeCalls: [],
    illegalCalls: [],
    layerViolations: [],
  };
  if (generated !== 'present') {
    result.exists = Boolean(artifactPath && fs.existsSync(artifactPath));
    result.integrity = production && production.sha256 === null && !result.exists;
    return result;
  }
  if (!artifactPath) return result;
  let bytes;
  try {
    bytes = fs.readFileSync(artifactPath);
  } catch (_) {
    return result;
  }
  result.exists = true;
  result.actualSha256 = sha256(bytes);
  result.integrity = SHA256.test(String(result.expectedSha256 || ''))
    && result.actualSha256 === result.expectedSha256;
  if (!result.integrity) return result;

  result.runtimeCalls = extractRuntimeCalls(bytes.toString('utf8'));
  const declared = new Set(
    (Array.isArray(plan.actionStrategies) ? plan.actionStrategies : [])
      .flatMap(item => Array.isArray(item && item.apiCalls) ? item.apiCalls : []),
  );
  for (const call of result.runtimeCalls) {
    const policy = API_POLICY.get(call);
    if (!policy) {
      result.illegalCalls.push(call);
    } else if (policy === 'forbidden') {
      result.layerViolations.push({call, reason: 'forbidden-in-production'});
    } else if (policy === 'requires-plan-declaration' && !declared.has(call)) {
      result.layerViolations.push({call, reason: 'missing-plan-declaration'});
    }
  }
  return result;
}

function evidence(pathValue, observed) {
  return {path: pathValue, observed};
}

function scoreSemanticBuildPlan(plan, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const rubricEvidencePath = path.relative(cwd, RUBRIC_PATH).split(path.sep).join('/');
  const validation = validateSemanticBuildPlan(plan, {checkSource: true, cwd});
  const validationCodes = {
    errors: validation.errors.map(item => item.code),
    blockers: validation.blockers.map(item => item.code),
    warnings: validation.warnings.map(item => item.code),
  };
  const actionIds = plan.source && Array.isArray(plan.source.actionIds) ? plan.source.actionIds : [];
  const dispositions = Array.isArray(plan.actionDispositions) ? plan.actionDispositions : [];
  const sourceMap = Array.isArray(plan.sourceMap) ? plan.sourceMap : [];
  const episodes = Array.isArray(plan.businessEpisodes) ? plan.businessEpisodes : [];
  const targets = Array.isArray(plan.targets) ? plan.targets : [];
  const strategies = Array.isArray(plan.actionStrategies) ? plan.actionStrategies : [];
  const guards = Array.isArray(plan.runtimeGuards) ? plan.runtimeGuards : [];
  const recoveries = Array.isArray(plan.recoveryRules) ? plan.recoveryRules : [];
  const knowledge = Array.isArray(plan.applicationKnowledge) ? plan.applicationKnowledge : [];
  const claims = plan.qualification && Array.isArray(plan.qualification.claims)
    ? plan.qualification.claims : [];
  const evidenceItems = plan.evidence && Array.isArray(plan.evidence.items)
    ? plan.evidence.items : [];
  const goal = intentResolution(plan, 'businessGoal');
  const success = intentResolution(plan, 'successConditions');
  const sideEffects = intentResolution(plan, 'sideEffects');
  const artifact = inspectArtifact(plan, cwd);
  const dispositionIds = dispositions.map(item => item && item.actionId);
  const mapIds = sourceMap.map(item => item && item.actionId);
  const businessActions = dispositions
    .filter(item => item && item.disposition === 'business')
    .map(item => item.actionId);
  const episodeActions = episodes.flatMap(item => Array.isArray(item && item.actionIds) ? item.actionIds : []);
  const knownConsumers = collectKnownConsumers(plan);
  const targetIds = new Set(targets.map(item => item && item.id));
  const planApiCalls = [...new Set(strategies.flatMap(item => Array.isArray(item && item.apiCalls)
    ? item.apiCalls : []))].sort();
  const illegalPlanCalls = planApiCalls.filter(call => !API_POLICY.has(call));
  const forbiddenPlanCalls = planApiCalls.filter(call => API_POLICY.get(call) === 'forbidden');
  const nonIntentBlockers = validation.blockers.filter(item => ![
    'UNRESOLVED_BUSINESS_GOAL',
    'UNRESOLVED_SUCCESS_CONDITIONS',
    'UNRESOLVED_SIDE_EFFECT_AUTHORIZATION',
  ].includes(item.code));
  const gate = plan.qualification && plan.qualification.gate;
  const production = plan.outputs && plan.outputs.productionRecipe;
  const outputGate = plan.outputs && plan.outputs.qualificationGate;
  const evidenceRoot = plan.outputs && plan.outputs.evidenceRoot;
  const artifactPathsDistinct = Boolean(production && outputGate
    && isNonEmptyString(production.path)
    && isNonEmptyString(outputGate.path)
    && isNonEmptyString(evidenceRoot)
    && new Set([production.path, outputGate.path, evidenceRoot]).size === 3);
  const exactGateBinding = Boolean(gate && production && outputGate
    && gate.path === outputGate.path
    && gate.productionSource
    && gate.productionSource.path === production.path
    && gate.productionSource.sha256 === production.sha256
    && gate.executionMode === 'freeze-and-execute-production-source');
  const uniqueDisposition = dispositionIds.length === actionIds.length
    && new Set(dispositionIds).size === actionIds.length
    && actionIds.every(id => dispositionIds.includes(id));
  const oneSourceMap = mapIds.length === actionIds.length
    && new Set(mapIds).size === actionIds.length
    && actionIds.every(id => mapIds.includes(id));
  const consumersResolved = sourceMap.every(item => isObject(item)
    && Array.isArray(item.consumerIds)
    && item.consumerIds.length > 0
    && item.consumerIds.every(id => knownConsumers.has(id)));
  const businessCoverage = businessActions.length > 0
    && episodeActions.length === businessActions.length
    && new Set(episodeActions).size === businessActions.length
    && businessActions.every(id => episodeActions.includes(id));
  const episodeStructure = businessCoverage && episodes.every(item => isObject(item)
    && isNonEmptyString(item.id)
    && isNonEmptyString(item.name)
    && isNonEmptyString(item.purpose)
    && !EVENT_STYLE_NAME.test(item.id)
    && !EVENT_STYLE_NAME.test(item.name)
    && Array.isArray(item.preconditions)
    && Array.isArray(item.postconditions));
  const episodeSourceMap = businessActions.every(actionId => {
    const owner = episodes.find(item => item.actionIds.includes(actionId));
    const entry = sourceMap.find(item => item.actionId === actionId);
    return owner && entry && entry.episodeId === owner.id && entry.disposition === 'business';
  });
  const resolvedTargets = targets.length > 0 && targets.every(item => isObject(item)
    && item.locator && item.locator.status === 'verified'
    && Array.isArray(item.unknowns) && item.unknowns.length === 0);
  const noImplicitFallback = strategies.length > 0
    && strategies.every(item => item && item.noImplicitFallback === true)
    && targets.every(item => item && item.locator && item.locator.fallbackPolicy === 'none');
  const legalGeometry = targets.length > 0 && targets.every(item => {
    if (!item || !item.geometry) return false;
    const {space, projectionApi} = item.geometry;
    if (space === 'window-relative' || space === 'display-relative') {
      return ['Geometry.pointOffset', 'Geometry.pointPercent'].includes(projectionApi);
    }
    return projectionApi === 'none';
  });
  const guardStructure = guards.length > 0 && guards.every(item => hasSourceRefs(item)
    && Array.isArray(item.actionIds)
    && item.actionIds.every(id => actionIds.includes(id)));
  const recoveryStructure = recoveries.every(item => hasSourceRefs(item)
    && Number.isInteger(item.maxAttempts) && item.maxAttempts >= 0
    && Array.isArray(item.actionIds)
    && item.actionIds.every(id => actionIds.includes(id)));
  const knowledgeStructure = knowledge.length > 0
    && knowledge.every(hasSourceRefs);
  const claimsStructure = claims.length > 0 && claims.every(hasSourceRefs);
  const allProvenanced = [...knowledge, ...targets, ...strategies, ...guards, ...recoveries,
    ...claims, ...evidenceItems].every(hasSourceRefs);
  const targetStrategyLinks = strategies.length > 0
    && strategies.every(item => item && targetIds.has(item.targetId));
  const sourceMetadata = Boolean(plan.source
    && Number.isInteger(plan.source.actionsRevision) && plan.source.actionsRevision > 0
    && SHA256.test(String(plan.source.actionsSha256 || ''))
    && plan.source.rawReference && SHA256.test(String(plan.source.rawReference.sha256 || ''))
    && Number.isInteger(plan.source.rawReference.bytes) && plan.source.rawReference.bytes > 0
    && actionIds.length > 0);
  const sourceEventFidelity = validation.sourceChecked
    && !validationCodes.errors.includes('DUPLICATE_SOURCE_EVENT')
    && !validationCodes.blockers.includes('SOURCE_EVENT_MISMATCH');
  const outputContract = Boolean(production && outputGate && plan.outputs.renderer)
    && artifact.integrity;
  const rendererContract = Boolean(plan.outputs && plan.outputs.renderer
    && ((plan.outputs.renderer.status === 'not-implemented'
      && plan.outputs.renderer.mode === 'deterministic-agent-instructions')
      || (plan.outputs.renderer.status === 'implemented'
        && plan.outputs.renderer.mode === 'renderer')));
  const productionSurfaceClean = artifact.layerViolations.length === 0;
  const apiCatalogLegal = illegalPlanCalls.length === 0
    && forbiddenPlanCalls.length === 0
    && artifact.illegalCalls.length === 0;
  const verificationState = Boolean(plan.verification
    && !validationCodes.errors.includes('QUALIFICATION_STATUS_CONFLICT')
    && !validationCodes.errors.includes('GENERATED_SOURCE_NOT_FROZEN')
    && !validationCodes.errors.includes('UNGENERATED_SOURCE_HAS_HASH'));
  const globalIds = [...knowledge, ...targets, ...strategies, ...guards, ...recoveries,
    ...claims, ...evidenceItems, ...episodes].map(item => item && item.id).filter(isNonEmptyString);
  const uniqueDomainIds = new Set(globalIds).size === globalIds.length;
  const explicitIntentResolution = Boolean(plan.intent && plan.intent.resolution
    && ['businessGoal', 'successConditions', 'sideEffects']
      .every(key => hasSourceRefs(plan.intent.resolution[key])));

  const facts = {
    goalResolved: goal.status === 'confirmed',
    successResolved: success.status === 'confirmed',
    sideEffectsAuthorized: sideEffects.status === 'confirmed'
      && Array.isArray(plan.intent && plan.intent.allowedSideEffects)
      && plan.intent.allowedSideEffects.length > 0,
    uniqueDisposition,
    businessCoverage,
    knowledgeStructure,
    sourceMetadata,
    sourceChecked: validation.sourceChecked,
    sourceEventFidelity,
    oneSourceMap,
    consumersResolved,
    episodeStructure,
    episodeSourceMap,
    targetStrategyLinks,
    outputContract,
    rendererContract,
    resolvedTargets,
    noImplicitFallback,
    legalGeometry,
    guardStructure,
    recoveryStructure,
    claimsStructure,
    exactGateBinding,
    artifactPathsDistinct,
    productionSurfaceClean,
    verificationState,
    uniqueDomainIds,
    allProvenanced,
    apiCatalogLegal,
    explicitIntentResolution,
    deterministicRubric: RUBRIC_CONTRACT.total === 100,
  };

  const checkEvidence = {
    'SQ-SEM-01-resolved-business-goal': [evidence('$.intent.businessGoal', goal.status), evidence('$.intent.resolution.businessGoal.status', goal.explicit ? goal.status : 'legacy-confirmed')],
    'SQ-SEM-02-resolved-success-conditions': [evidence('$.intent.successConditions', success.status), evidence('$.intent.resolution.successConditions.status', success.explicit ? success.status : 'legacy-confirmed')],
    'SQ-SEM-03-unique-action-dispositions': [evidence('$.source.actionIds', actionIds.length), evidence('$.actionDispositions', dispositionIds.length)],
    'SQ-SEM-04-business-episode-coverage': [evidence('$.actionDispositions[disposition=business]', businessActions.length), evidence('$.businessEpisodes[].actionIds', episodeActions.length)],
    'SQ-SEM-05-provenanced-knowledge': [evidence('$.applicationKnowledge', {
      count: knowledge.length,
      candidateCount: knowledge.filter(item => item && item.kind === 'candidate').length,
      unprovenancedCount: knowledge.filter(item => !hasSourceRefs(item)).length,
    })],
    'SQ-TRACE-01-frozen-source-metadata': [evidence('$.source', {actionCount: actionIds.length, sha256: SHA256.test(String(plan.source && plan.source.actionsSha256 || '')), raw: Boolean(plan.source && plan.source.rawReference)})],
    'SQ-TRACE-02-actual-source-bytes': [evidence('validator.sourceChecked', validation.sourceChecked)],
    'SQ-TRACE-03-source-event-fidelity': [evidence('validator.sourceEventFidelity', {passed: sourceEventFidelity, errors: validationCodes.errors, blockers: validationCodes.blockers})],
    'SQ-TRACE-04-one-source-map-per-action': [evidence('$.sourceMap', {expected: actionIds.length, actual: sourceMap.length, unique: new Set(mapIds).size})],
    'SQ-TRACE-05-resolved-consumers': [evidence('$.sourceMap[].consumerIds', {knownConsumers: knownConsumers.size, passed: consumersResolved})],
    'SQ-STRUCT-01-episode-structure': [evidence('$.businessEpisodes', {count: episodes.length, businessActions: businessActions.length})],
    'SQ-STRUCT-02-episode-source-map': [evidence('$.sourceMap[].episodeId', episodeSourceMap)],
    'SQ-STRUCT-03-target-strategy-links': [evidence('$.actionStrategies[].targetId', {targets: targetIds.size, strategies: strategies.length, passed: targetStrategyLinks})],
    'SQ-STRUCT-04-output-contract': [evidence('$.verification.generated', artifact.stage), evidence('$.outputs.productionRecipe', {path: artifact.path, integrity: artifact.integrity})],
    'SQ-STRUCT-05-renderer-contract': [evidence('$.outputs.renderer', plan.outputs && plan.outputs.renderer || null)],
    'SQ-ROBUST-01-resolved-targets': [evidence('$.targets', {count: targets.length, unresolved: targets.filter(item => !item || !item.locator || item.locator.status !== 'verified' || !Array.isArray(item.unknowns) || item.unknowns.length > 0).length})],
    'SQ-ROBUST-02-no-implicit-fallback': [evidence('$.actionStrategies[].noImplicitFallback', noImplicitFallback), evidence('$.targets[].locator.fallbackPolicy', targets.map(item => item && item.locator && item.locator.fallbackPolicy))],
    'SQ-ROBUST-03-legal-geometry': [evidence('$.targets[].geometry', {count: targets.length, passed: legalGeometry})],
    'SQ-ROBUST-04-provenanced-runtime-guards': [evidence('$.runtimeGuards', {count: guards.length, passed: guardStructure})],
    'SQ-ROBUST-05-bounded-recovery': [evidence('$.recoveryRules', {count: recoveries.length, passed: recoveryStructure})],
    'SQ-LAYER-01-provenanced-claims': [evidence('$.qualification.claims', {count: claims.length, passed: claimsStructure})],
    'SQ-LAYER-02-exact-gate-binding': [evidence('$.qualification.gate.productionSource', exactGateBinding)],
    'SQ-LAYER-03-distinct-artifact-layers': [evidence('$.outputs', {production: production && production.path, gate: outputGate && outputGate.path, evidence: evidenceRoot, distinct: artifactPathsDistinct})],
    'SQ-LAYER-04-production-api-surface': [evidence(artifact.path || '$.verification.generated', {calls: artifact.runtimeCalls, layerViolations: artifact.layerViolations})],
    'SQ-LAYER-05-verification-state': [evidence('$.verification', plan.verification || null)],
    'SQ-MAINT-01-unique-domain-ids': [evidence('$..id', {count: globalIds.length, unique: new Set(globalIds).size})],
    'SQ-MAINT-02-structured-source-refs': [evidence('$..sourceRefs', allProvenanced)],
    'SQ-MAINT-03-versioned-api-catalog': [evidence(rubricEvidencePath, {planCalls: planApiCalls, illegalPlanCalls, artifactIllegalCalls: artifact.illegalCalls})],
    'SQ-MAINT-04-explicit-intent-resolution': [evidence('$.intent.resolution', explicitIntentResolution)],
    'SQ-MAINT-05-deterministic-rubric': [evidence(rubricEvidencePath, {total: RUBRIC_CONTRACT.total, checkCount: RUBRIC_CONTRACT.checkIds.size})],
  };
  const checkFacts = {
    'SQ-SEM-01-resolved-business-goal': facts.goalResolved,
    'SQ-SEM-02-resolved-success-conditions': facts.successResolved,
    'SQ-SEM-03-unique-action-dispositions': facts.uniqueDisposition,
    'SQ-SEM-04-business-episode-coverage': facts.businessCoverage,
    'SQ-SEM-05-provenanced-knowledge': facts.knowledgeStructure,
    'SQ-TRACE-01-frozen-source-metadata': facts.sourceMetadata,
    'SQ-TRACE-02-actual-source-bytes': facts.sourceChecked,
    'SQ-TRACE-03-source-event-fidelity': facts.sourceEventFidelity,
    'SQ-TRACE-04-one-source-map-per-action': facts.oneSourceMap,
    'SQ-TRACE-05-resolved-consumers': facts.consumersResolved,
    'SQ-STRUCT-01-episode-structure': facts.episodeStructure,
    'SQ-STRUCT-02-episode-source-map': facts.episodeSourceMap,
    'SQ-STRUCT-03-target-strategy-links': facts.targetStrategyLinks,
    'SQ-STRUCT-04-output-contract': facts.outputContract,
    'SQ-STRUCT-05-renderer-contract': facts.rendererContract,
    'SQ-ROBUST-01-resolved-targets': facts.resolvedTargets,
    'SQ-ROBUST-02-no-implicit-fallback': facts.noImplicitFallback,
    'SQ-ROBUST-03-legal-geometry': facts.legalGeometry,
    'SQ-ROBUST-04-provenanced-runtime-guards': facts.guardStructure,
    'SQ-ROBUST-05-bounded-recovery': facts.recoveryStructure,
    'SQ-LAYER-01-provenanced-claims': facts.claimsStructure,
    'SQ-LAYER-02-exact-gate-binding': facts.exactGateBinding,
    'SQ-LAYER-03-distinct-artifact-layers': facts.artifactPathsDistinct,
    'SQ-LAYER-04-production-api-surface': facts.productionSurfaceClean,
    'SQ-LAYER-05-verification-state': facts.verificationState,
    'SQ-MAINT-01-unique-domain-ids': facts.uniqueDomainIds,
    'SQ-MAINT-02-structured-source-refs': facts.allProvenanced,
    'SQ-MAINT-03-versioned-api-catalog': facts.apiCatalogLegal,
    'SQ-MAINT-04-explicit-intent-resolution': facts.explicitIntentResolution,
    'SQ-MAINT-05-deterministic-rubric': facts.deterministicRubric,
  };

  const hardGateFacts = {
    'HG-01-valid-schema': {
      passed: validation.valid,
      evidence: [evidence('validator.valid', validation.valid), evidence('validator.errors', validationCodes.errors)],
    },
    'HG-02-source-bytes': {
      passed: validation.sourceChecked,
      evidence: [evidence('validator.sourceChecked', validation.sourceChecked), evidence('$.source.actionsSha256', sourceMetadata)],
    },
    'HG-03-action-trace': {
      passed: uniqueDisposition && oneSourceMap && consumersResolved && sourceEventFidelity,
      evidence: [evidence('$.actionDispositions', uniqueDisposition), evidence('$.sourceMap', {oneSourceMap, consumersResolved}), evidence('validator.sourceEventFidelity', sourceEventFidelity)],
    },
    'HG-04-resolved-intent': {
      passed: facts.goalResolved && facts.successResolved,
      evidence: [evidence('$.intent.resolution.businessGoal.status', goal.status), evidence('$.intent.resolution.successConditions.status', success.status)],
    },
    'HG-05-authorized-side-effects': {
      passed: facts.sideEffectsAuthorized,
      evidence: [evidence('$.intent.allowedSideEffects', Array.isArray(plan.intent && plan.intent.allowedSideEffects) ? plan.intent.allowedSideEffects.length : 0), evidence('$.intent.resolution.sideEffects.status', sideEffects.status)],
    },
    'HG-06-no-production-unknowns': {
      passed: nonIntentBlockers.length === 0 && resolvedTargets,
      evidence: [evidence('validator.nonIntentBlockers', nonIntentBlockers.map(item => item.code)), evidence('$.targets', {resolved: resolvedTargets}), evidence('validator.summary.unknownCount', validation.summary.unknownCount)],
    },
    'HG-07-layer-separation': {
      passed: exactGateBinding && artifactPathsDistinct && productionSurfaceClean,
      evidence: [evidence('$.qualification.gate.productionSource', exactGateBinding), evidence('$.outputs', artifactPathsDistinct), evidence(artifact.path || '$.verification.generated', artifact.layerViolations)],
    },
    'HG-08-legal-primitives': {
      passed: apiCatalogLegal,
      evidence: [evidence(rubricEvidencePath, {illegalPlanCalls, forbiddenPlanCalls, artifactIllegalCalls: artifact.illegalCalls})],
    },
    'HG-09-artifact-integrity': {
      passed: artifact.integrity,
      evidence: [evidence(artifact.path || '$.outputs.productionRecipe', {stage: artifact.stage, exists: artifact.exists, expectedSha256: artifact.expectedSha256, actualSha256: artifact.actualSha256, integrity: artifact.integrity})],
    },
  };

  const hardGates = RUBRIC.hardGates.map(id => ({id, ...hardGateFacts[id]}));
  const dimensions = RUBRIC.dimensions.map(dimension => {
    const checks = dimension.checks.map(check => {
      const passed = checkFacts[check.id] === true;
      const structuredEvidence = checkEvidence[check.id];
      if (!Array.isArray(structuredEvidence) || structuredEvidence.length === 0) {
        throw new Error(`quality check ${check.id} has no structured evidence`);
      }
      return {...check, earned: passed ? check.points : 0, passed, evidence: structuredEvidence};
    });
    const score = checks.reduce((total, check) => total + check.earned, 0);
    return {
      id: dimension.id,
      maxPoints: dimension.maxPoints,
      minimumPoints: dimension.minimumPoints,
      score,
      passed: score >= dimension.minimumPoints,
      checks,
    };
  });
  const totalScore = dimensions.reduce((total, dimension) => total + dimension.score, 0);
  const gatesPassed = hardGates.every(gateItem => gateItem.passed);
  const dimensionsPassed = dimensions.every(dimension => dimension.passed);

  return {
    formatVersion: 'human-to-recipe.semantic-quality-report/v1',
    tooling: {
      scorer: {
        path: path.relative(cwd, __filename).split(path.sep).join('/'),
        sha256: sha256(fs.readFileSync(__filename)),
      },
      validator: {
        path: path.relative(cwd, VALIDATOR_PATH).split(path.sep).join('/'),
        sha256: sha256(fs.readFileSync(VALIDATOR_PATH)),
      },
    },
    rubric: {
      path: path.relative(cwd, RUBRIC_PATH).split(path.sep).join('/'),
      sha256: sha256(fs.readFileSync(RUBRIC_PATH)),
      passThreshold: RUBRIC.passThreshold,
    },
    subject: {
      schemaVersion: plan.schemaVersion || null,
      actionsFile: plan.source && plan.source.actionsFile || null,
      actionsSha256: plan.source && plan.source.actionsSha256 || null,
      stage: artifact.stage,
      productionRecipe: artifact.path,
      productionSha256: artifact.actualSha256,
    },
    hardGates,
    dimensions,
    totalScore,
    pass: gatesPassed && totalScore >= RUBRIC.passThreshold && dimensionsPassed,
    decision: {
      hardGatesPassed: gatesPassed,
      totalThresholdPassed: totalScore >= RUBRIC.passThreshold,
      criticalDimensionsPassed: dimensionsPassed,
    },
    validator: {
      valid: validation.valid,
      productionReady: validation.productionReady,
      sourceChecked: validation.sourceChecked,
      errors: validation.errors,
      blockers: validation.blockers,
      warnings: validation.warnings,
      summary: validation.summary,
    },
    staticOnly: {
      generated: plan.verification && plan.verification.generated || 'not-generated',
      staticallyReviewed: plan.verification && plan.verification.staticallyReviewed || 'not-run',
      syntheticallyVerified: plan.verification && plan.verification.syntheticallyVerified || 'not-run',
      liveVerified: 'not-run',
      qualified: 'not-run',
      visualVerified: 'not-run'
    }
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let planFile = null;
  let output = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--output') {
      output = args[index + 1];
      index += 1;
    } else if (arg.startsWith('--') || planFile) {
      throw new Error('Usage: score-semantic-build-plan.js <plan.json> [--output <report.json>]');
    } else {
      planFile = arg;
    }
  }
  if (!planFile || (output !== null && !isNonEmptyString(output))) {
    throw new Error('Usage: score-semantic-build-plan.js <plan.json> [--output <report.json>]');
  }
  return {planFile, output};
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 2;
    return;
  }
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.planFile), 'utf8'));
  } catch (_) {
    process.stderr.write('plan file could not be read as JSON\n');
    process.exitCode = 2;
    return;
  }
  const report = scoreSemanticBuildPlan(plan, {cwd: process.cwd()});
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    let descriptor;
    try {
      descriptor = fs.openSync(outputPath, 'wx', 0o600);
      fs.writeFileSync(descriptor, serialized);
    } catch (error) {
      process.stderr.write(`quality report exclusive-create failed: ${error.code || error.message}\n`);
      process.exitCode = 2;
      return;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
  process.stdout.write(serialized);
  if (!report.pass) process.exitCode = 1;
}

module.exports = {
  RUBRIC,
  extractRuntimeCalls,
  scoreSemanticBuildPlan,
  validateRubric,
};

if (require.main === module) main(process.argv);
