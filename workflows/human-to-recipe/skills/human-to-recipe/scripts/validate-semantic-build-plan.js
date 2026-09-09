#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DISPOSITIONS = new Set([
  'business', 'runtime-guard', 'qualification', 'evidence', 'excluded', 'unknown',
]);
const VERIFICATION_STATUSES = new Set(['not-run', 'passed', 'failed', 'blocked']);
const SHA256 = /^[a-f0-9]{64}$/;
const EVENT_STYLE_NAME = /^(?:(?:a|e)\d+|(?:click|action|step)[-_]?\d+)$/i;
const PLACEHOLDER = /请.*补充|must\s+ask|\btodo\b|\bunknown\b/i;
const SCHEMA_PATH = path.resolve(__dirname, '..', 'references', 'semantic-build-plan.schema.json');
const BUILD_PLAN_SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value, nonEmpty = false) {
  return Array.isArray(value)
    && (!nonEmpty || value.length > 0)
    && value.every(isNonEmptyString)
    && new Set(value).size === value.length;
}

function push(list, code, location, message) {
  list.push({code, path: location, message});
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveSchemaRef(root, reference) {
  if (!reference.startsWith('#/')) throw new Error(`unsupported schema reference: ${reference}`);
  return reference.slice(2).split('/').reduce((value, part) => {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    return value && value[key];
  }, root);
}

function schemaTypeMatches(value, type) {
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'null') return value === null;
  return true;
}

function validateSchemaNode(value, schema, root, location, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) {
    validateSchemaNode(value, resolveSchemaRef(root, schema.$ref), root, location, errors);
    return;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(candidate => {
      const candidateErrors = [];
      validateSchemaNode(value, candidate, root, location, candidateErrors);
      return candidateErrors.length === 0;
    });
    if (matches.length !== 1) {
      push(errors, 'SCHEMA_VALIDATION', location, 'value must match exactly one allowed schema');
    }
    return;
  }
  if (schema.not) {
    const rejectedErrors = [];
    validateSchemaNode(value, schema.not, root, location, rejectedErrors);
    if (rejectedErrors.length === 0) {
      push(errors, 'SCHEMA_VALIDATION', location, 'value matches a forbidden schema');
    }
  }
  if (schema.type && !schemaTypeMatches(value, schema.type)) {
    push(errors, 'SCHEMA_VALIDATION', location, `expected schema type ${schema.type}`);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !jsonEqual(value, schema.const)) {
    push(errors, 'SCHEMA_VALIDATION', location, 'value does not match the required constant');
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(candidate => jsonEqual(value, candidate))) {
    push(errors, 'SCHEMA_VALIDATION', location, 'value is not in the allowed enum');
  }
  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      push(errors, 'SCHEMA_VALIDATION', location, `string must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) {
      push(errors, 'SCHEMA_VALIDATION', location, 'string does not match the required pattern');
    }
  }
  if (typeof value === 'number' && Number.isFinite(schema.minimum) && value < schema.minimum) {
    push(errors, 'SCHEMA_VALIDATION', location, `number must be at least ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      push(errors, 'SCHEMA_VALIDATION', location, `array must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map(item => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        push(errors, 'SCHEMA_VALIDATION', location, 'array items must be unique');
      }
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchemaNode(item, schema.items, root, `${location}[${index}]`, errors));
    }
  }
  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const key of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        push(errors, 'SCHEMA_VALIDATION', `${location}.${key}`, 'required property is missing');
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          push(errors, 'SCHEMA_VALIDATION', `${location}.${key}`, 'additional property is not allowed');
        }
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateSchemaNode(value[key], childSchema, root, `${location}.${key}`, errors);
      }
    }
  }
}

function requireObject(value, location, errors) {
  if (isObject(value)) return true;
  push(errors, 'INVALID_TYPE', location, 'expected an object');
  return false;
}

function requireArray(value, location, errors, nonEmpty = false) {
  if (Array.isArray(value) && (!nonEmpty || value.length > 0)) return true;
  push(errors, 'INVALID_TYPE', location, nonEmpty ? 'expected a non-empty array' : 'expected an array');
  return false;
}

function requireString(value, location, errors, options = {}) {
  if (!isNonEmptyString(value)) {
    push(errors, 'INVALID_STRING', location, 'expected a non-empty string');
    return false;
  }
  if (options.rejectPlaceholder && PLACEHOLDER.test(value)) {
    push(errors, 'UNRESOLVED_INTENT', location, 'placeholder or unknown text cannot be used as confirmed intent');
    return false;
  }
  return true;
}

function uniqueIds(items, location, errors) {
  const ids = new Set();
  if (!Array.isArray(items)) return ids;
  items.forEach((item, index) => {
    const itemPath = `${location}[${index}]`;
    if (!isObject(item) || !requireString(item.id, `${itemPath}.id`, errors)) return;
    if (ids.has(item.id)) push(errors, 'DUPLICATE_ID', `${itemPath}.id`, `duplicate id ${item.id}`);
    ids.add(item.id);
  });
  return ids;
}

function compareStringSets(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

function resolveActionsPath(source, cwd) {
  if (path.isAbsolute(source.actionsFile)) return path.normalize(source.actionsFile);
  const base = path.isAbsolute(source.workdir)
    ? source.workdir
    : path.resolve(cwd, source.workdir || '.');
  return path.resolve(base, source.actionsFile);
}

function checkActualSource(plan, result, options) {
  const {errors, blockers} = result;
  const source = plan.source;
  if (!isObject(source) || !isNonEmptyString(source.actionsFile)) return;
  const actionsPath = resolveActionsPath(source, options.cwd || process.cwd());
  let bytes;
  try {
    bytes = fs.readFileSync(actionsPath);
  } catch (_) {
    push(blockers, 'ACTIONS_FILE_UNREADABLE', 'source.actionsFile', 'actual actions bytes could not be read');
    return;
  }

  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== source.actionsSha256) {
    push(blockers, 'ACTIONS_HASH_MISMATCH', 'source.actionsSha256', 'actual actions bytes do not match the frozen hash');
  }

  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch (_) {
    push(blockers, 'ACTIONS_JSON_INVALID', 'source.actionsFile', 'actual actions bytes are not valid JSON');
    return;
  }

  if (!isObject(document)) {
    push(blockers, 'ACTIONS_DOCUMENT_INVALID', 'source.actionsFile', 'actual actions JSON must be an object');
    return;
  }
  if (Number(document.revision) !== Number(source.actionsRevision)) {
    push(blockers, 'ACTIONS_REVISION_MISMATCH', 'source.actionsRevision', 'actual actions revision changed');
  }
  if (String(document.readiness || '') !== String(source.actionsReadiness || '')) {
    push(blockers, 'ACTIONS_READINESS_MISMATCH', 'source.actionsReadiness', 'actual actions readiness changed');
  }

  const actualActions = Array.isArray(document.actions) ? document.actions : [];
  const actualIds = actualActions.map(action => String(action && action.id || ''));
  if (!compareStringSets(actualIds, source.actionIds)) {
    push(blockers, 'ACTION_ID_MISMATCH', 'source.actionIds', 'actual action IDs or order changed');
  }

  const dispositionById = new Map(
    (Array.isArray(plan.actionDispositions) ? plan.actionDispositions : [])
      .map(item => [item && item.actionId, item]),
  );
  actualActions.forEach((action) => {
    const actionId = String(action && action.id || '');
    const expected = dispositionById.get(actionId);
    if (!expected) return;
    const eventIds = action && action.source && Array.isArray(action.source.eventIds)
      ? action.source.eventIds.map(String) : [];
    if (!compareStringSets(eventIds, expected.sourceEventIds)) {
      push(blockers, 'SOURCE_EVENT_MISMATCH', `actionDispositions.${actionId}.sourceEventIds`,
        'actual action source event IDs or order changed');
    }
  });

  const raw = isObject(document.raw) ? document.raw : {};
  const frozenRaw = isObject(source.rawReference) ? source.rawReference : {};
  if (String(raw.file || '') !== String(frozenRaw.file || '')
      || String(raw.sha256 || '') !== String(frozenRaw.sha256 || '')
      || Number(raw.bytes) !== Number(frozenRaw.bytes)) {
    push(blockers, 'RAW_REFERENCE_MISMATCH', 'source.rawReference', 'actual actions raw reference changed');
  }

  if (errors.length === 0 && blockers.length === 0) result.sourceChecked = true;
}

function validateSemanticBuildPlan(plan, options = {}) {
  const result = {
    valid: false,
    productionReady: false,
    sourceChecked: false,
    errors: [],
    blockers: [],
    warnings: [],
    summary: {actionCount: 0, businessEpisodeCount: 0, unknownCount: 0},
  };
  const {errors, blockers, warnings} = result;

  if (!requireObject(plan, '$', errors)) return result;
  validateSchemaNode(plan, BUILD_PLAN_SCHEMA, BUILD_PLAN_SCHEMA, '$', errors);
  if (plan.schemaVersion !== 'semantic-build-plan/v1') {
    push(errors, 'UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', 'expected semantic-build-plan/v1');
  }
  if (plan.kind !== 'human-to-recipe-semantic-build-plan') {
    push(errors, 'INVALID_KIND', 'kind', 'expected human-to-recipe-semantic-build-plan');
  }

  const sourceOk = requireObject(plan.source, 'source', errors);
  if (sourceOk) {
    for (const key of ['repository', 'workdir', 'recordingDir', 'actionsFile']) {
      requireString(plan.source[key], `source.${key}`, errors);
    }
    if (!Number.isInteger(plan.source.actionsRevision) || plan.source.actionsRevision < 1) {
      push(errors, 'INVALID_REVISION', 'source.actionsRevision', 'expected a positive integer');
    }
    if (!['ready', 'blocked'].includes(plan.source.actionsReadiness)) {
      push(errors, 'INVALID_READINESS', 'source.actionsReadiness', 'expected ready or blocked');
    } else if (plan.source.actionsReadiness !== 'ready') {
      push(blockers, 'ACTIONS_NOT_READY', 'source.actionsReadiness', 'blocked actions cannot produce a production Recipe');
    }
    if (!SHA256.test(String(plan.source.actionsSha256 || ''))) {
      push(errors, 'INVALID_SHA256', 'source.actionsSha256', 'expected a lowercase SHA-256');
    }
    if (!requireObject(plan.source.rawReference, 'source.rawReference', errors)) {
      // type error already recorded
    } else {
      requireString(plan.source.rawReference.file, 'source.rawReference.file', errors);
      if (!SHA256.test(String(plan.source.rawReference.sha256 || ''))) {
        push(errors, 'INVALID_SHA256', 'source.rawReference.sha256', 'expected a lowercase SHA-256');
      }
      if (!Number.isInteger(plan.source.rawReference.bytes) || plan.source.rawReference.bytes < 1) {
        push(errors, 'INVALID_BYTE_LENGTH', 'source.rawReference.bytes', 'expected a positive integer');
      }
    }
    if (!isStringArray(plan.source.actionIds, true)) {
      push(errors, 'INVALID_ACTION_IDS', 'source.actionIds', 'expected unique non-empty action IDs');
    }
  }

  if (requireObject(plan.intent, 'intent', errors)) {
    requireString(plan.intent.businessGoal, 'intent.businessGoal', errors, {rejectPlaceholder: true});
    if (!isStringArray(plan.intent.successConditions, true)
        || plan.intent.successConditions.some(value => PLACEHOLDER.test(value))) {
      push(errors, 'UNRESOLVED_SUCCESS_CONDITIONS', 'intent.successConditions',
        'expected confirmed, unique success conditions without placeholders');
    }
    for (const key of ['allowedSideEffects', 'forbiddenObjects']) {
      if (!isStringArray(plan.intent[key])) {
        push(errors, 'INVALID_STRING_ARRAY', `intent.${key}`, 'expected unique strings');
      }
    }
  }

  if (requireObject(plan.environment, 'environment', errors)) {
    for (const key of ['applications', 'languages', 'layoutConstraints', 'otherConstraints']) {
      if (!isStringArray(plan.environment[key], key === 'applications')) {
        push(errors, 'INVALID_STRING_ARRAY', `environment.${key}`, 'expected unique strings');
      }
    }
  }

  const actionIds = sourceOk && Array.isArray(plan.source.actionIds) ? plan.source.actionIds : [];
  const actionIdSet = new Set(actionIds);
  result.summary.actionCount = actionIds.length;

  if (requireObject(plan.semanticCoverage, 'semanticCoverage', errors)) {
    const countKeys = [
      'verified', 'unavailable', 'notRequested', 'notApplicable', 'missing',
      'unavailableWithReason', 'unavailableWithoutReason',
    ];
    countKeys.forEach((key) => {
      const value = plan.semanticCoverage[key];
      if (!Number.isInteger(value) || value < 0) {
        push(errors, 'INVALID_COVERAGE_COUNT', `semanticCoverage.${key}`, 'expected a non-negative integer');
      }
    });
    const counted = ['verified', 'unavailable', 'notRequested', 'notApplicable', 'missing']
      .reduce((total, key) => total + (Number.isInteger(plan.semanticCoverage[key]) ? plan.semanticCoverage[key] : 0), 0);
    if (counted !== actionIds.length) {
      push(errors, 'SEMANTIC_COVERAGE_MISMATCH', 'semanticCoverage', 'coverage counts must equal the frozen action count');
    }
    if ((plan.semanticCoverage.unavailableWithReason || 0)
        + (plan.semanticCoverage.unavailableWithoutReason || 0)
        !== (plan.semanticCoverage.unavailable || 0)) {
      push(errors, 'UNAVAILABLE_REASON_MISMATCH', 'semanticCoverage',
        'unavailable reason counts must equal unavailable');
    }
    if (!Array.isArray(plan.semanticCoverage.issues)) {
      push(errors, 'INVALID_TYPE', 'semanticCoverage.issues', 'expected an array');
    }
  }

  const dispositions = new Map();
  const rawEventConsumers = new Map();
  if (requireArray(plan.actionDispositions, 'actionDispositions', errors, true)) {
    plan.actionDispositions.forEach((item, index) => {
      const itemPath = `actionDispositions[${index}]`;
      if (!requireObject(item, itemPath, errors)) return;
      requireString(item.actionId, `${itemPath}.actionId`, errors);
      requireString(item.rationale, `${itemPath}.rationale`, errors);
      if (!DISPOSITIONS.has(item.disposition)) {
        push(errors, 'INVALID_DISPOSITION', `${itemPath}.disposition`, 'unknown disposition value');
      }
      if (!isStringArray(item.sourceEventIds, true)) {
        push(errors, 'INVALID_SOURCE_EVENTS', `${itemPath}.sourceEventIds`, 'expected unique source event IDs');
      }
      if (dispositions.has(item.actionId)) {
        push(errors, 'DUPLICATE_ACTION_DISPOSITION', `${itemPath}.actionId`, 'an action must have exactly one disposition');
      }
      dispositions.set(item.actionId, item);
      if (item.disposition === 'unknown') {
        result.summary.unknownCount += 1;
        push(blockers, 'UNKNOWN_ACTION', `${itemPath}.disposition`, 'unknown actions stop production generation');
      }
      for (const eventId of Array.isArray(item.sourceEventIds) ? item.sourceEventIds : []) {
        if (rawEventConsumers.has(eventId)) {
          push(errors, 'DUPLICATE_SOURCE_EVENT', `${itemPath}.sourceEventIds`,
            `source event ${eventId} is consumed by more than one action`);
        }
        rawEventConsumers.set(eventId, item.actionId);
      }
    });
  }
  for (const actionId of actionIds) {
    if (!dispositions.has(actionId)) {
      push(blockers, 'MISSING_ACTION_DISPOSITION', 'actionDispositions', `action ${actionId} is not classified`);
    }
  }
  for (const actionId of dispositions.keys()) {
    if (!actionIdSet.has(actionId)) {
      push(errors, 'UNKNOWN_ACTION_REFERENCE', 'actionDispositions', `action ${actionId} is not in source.actionIds`);
    }
  }

  const episodesById = new Map();
  const businessEpisodeConsumption = new Map();
  if (requireArray(plan.businessEpisodes, 'businessEpisodes', errors)) {
    uniqueIds(plan.businessEpisodes, 'businessEpisodes', errors);
    plan.businessEpisodes.forEach((episode, index) => {
      const itemPath = `businessEpisodes[${index}]`;
      if (!isObject(episode)) return;
      episodesById.set(episode.id, episode);
      requireString(episode.name, `${itemPath}.name`, errors);
      requireString(episode.purpose, `${itemPath}.purpose`, errors);
      if (EVENT_STYLE_NAME.test(String(episode.id || '')) || EVENT_STYLE_NAME.test(String(episode.name || ''))) {
        push(errors, 'EVENT_STYLE_EPISODE_NAME', itemPath, 'Business Episode names must express business meaning');
      }
      if (!isStringArray(episode.actionIds, true)) {
        push(errors, 'INVALID_EPISODE_ACTIONS', `${itemPath}.actionIds`, 'expected unique business action IDs');
      }
      for (const actionId of Array.isArray(episode.actionIds) ? episode.actionIds : []) {
        const disposition = dispositions.get(actionId);
        if (!disposition || disposition.disposition !== 'business') {
          push(errors, 'NON_BUSINESS_EPISODE_ACTION', `${itemPath}.actionIds`,
            `episode action ${actionId} is not classified as business`);
        }
        if (businessEpisodeConsumption.has(actionId)) {
          push(errors, 'DUPLICATE_BUSINESS_CONSUMPTION', `${itemPath}.actionIds`,
            `business action ${actionId} is consumed by multiple episodes`);
        }
        businessEpisodeConsumption.set(actionId, episode.id);
      }
      for (const key of ['preconditions', 'postconditions']) {
        if (!isStringArray(episode[key])) {
          push(errors, 'INVALID_STRING_ARRAY', `${itemPath}.${key}`, 'expected unique strings');
        }
      }
    });
  }
  result.summary.businessEpisodeCount = episodesById.size;
  for (const [actionId, item] of dispositions) {
    if (item.disposition === 'business' && !businessEpisodeConsumption.has(actionId)) {
      push(blockers, 'UNMAPPED_BUSINESS_ACTION', 'businessEpisodes',
        `business action ${actionId} is not consumed by an episode`);
    }
  }

  const knowledgeIds = requireArray(plan.applicationKnowledge, 'applicationKnowledge', errors)
    ? uniqueIds(plan.applicationKnowledge, 'applicationKnowledge', errors) : new Set();
  const targetIds = requireArray(plan.targets, 'targets', errors, true)
    ? uniqueIds(plan.targets, 'targets', errors) : new Set();
  const strategyIds = requireArray(plan.actionStrategies, 'actionStrategies', errors, true)
    ? uniqueIds(plan.actionStrategies, 'actionStrategies', errors) : new Set();
  const guardIds = requireArray(plan.runtimeGuards, 'runtimeGuards', errors)
    ? uniqueIds(plan.runtimeGuards, 'runtimeGuards', errors) : new Set();
  const recoveryIds = requireArray(plan.recoveryRules, 'recoveryRules', errors)
    ? uniqueIds(plan.recoveryRules, 'recoveryRules', errors) : new Set();

  if (Array.isArray(plan.targets)) {
    plan.targets.forEach((target, index) => {
      const itemPath = `targets[${index}]`;
      if (!isObject(target)) return;
      requireString(target.description, `${itemPath}.description`, errors);
      if (!isStringArray(target.sourceRefs, true)) {
        push(errors, 'INVALID_SOURCE_REFS', `${itemPath}.sourceRefs`, 'expected non-empty source references');
      }
      if (!isStringArray(target.unknowns)) {
        push(errors, 'INVALID_UNKNOWNS', `${itemPath}.unknowns`, 'expected unique strings');
      } else if (target.unknowns.length > 0) {
        push(blockers, 'UNRESOLVED_TARGET', `${itemPath}.unknowns`, 'target unknowns stop production generation');
      }
      if (!isObject(target.locator)) {
        push(errors, 'INVALID_TYPE', `${itemPath}.locator`, 'expected an object');
      } else if (['unavailable', 'not-requested'].includes(target.locator.status)) {
        push(blockers, 'LOCATOR_UNAVAILABLE', `${itemPath}.locator.status`,
          'a production target needs an explicit verified or candidate locator strategy');
      }
      if (!isObject(target.geometry)) {
        push(errors, 'INVALID_TYPE', `${itemPath}.geometry`, 'expected an object');
      } else if (target.geometry.space === 'window-relative'
          && !['Geometry.pointOffset', 'Geometry.pointPercent'].includes(target.geometry.projectionApi)) {
        push(errors, 'GEOMETRY_API_REQUIRED', `${itemPath}.geometry.projectionApi`,
          'window-relative points must use an implemented Geometry projection API');
      }
    });
  }

  if (Array.isArray(plan.actionStrategies)) {
    plan.actionStrategies.forEach((strategy, index) => {
      const itemPath = `actionStrategies[${index}]`;
      if (!isObject(strategy)) return;
      if (!targetIds.has(strategy.targetId)) {
        push(errors, 'UNKNOWN_TARGET_REFERENCE', `${itemPath}.targetId`, 'strategy target does not exist');
      }
      if (!isStringArray(strategy.apiCalls, true)) {
        push(errors, 'INVALID_API_CALLS', `${itemPath}.apiCalls`, 'expected explicit implemented API calls');
      }
      if (strategy.noImplicitFallback !== true) {
        push(errors, 'IMPLICIT_FALLBACK', `${itemPath}.noImplicitFallback`, 'implicit fallback is forbidden');
      }
    });
  }

  function validateActionReferences(items, location) {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      const itemPath = `${location}[${index}]`;
      if (!isObject(item)) return;
      if (!isStringArray(item.actionIds)) {
        push(errors, 'INVALID_ACTION_IDS', `${itemPath}.actionIds`, 'expected unique action IDs');
        return;
      }
      for (const actionId of item.actionIds) {
        if (!actionIdSet.has(actionId)) {
          push(errors, 'UNKNOWN_ACTION_REFERENCE', `${itemPath}.actionIds`, `action ${actionId} is not frozen`);
        }
      }
    });
  }
  validateActionReferences(plan.runtimeGuards, 'runtimeGuards');
  validateActionReferences(plan.recoveryRules, 'recoveryRules');

  const claimIds = new Set();
  if (requireObject(plan.qualification, 'qualification', errors)) {
    if (requireArray(plan.qualification.claims, 'qualification.claims', errors)) {
      for (const id of uniqueIds(plan.qualification.claims, 'qualification.claims', errors)) claimIds.add(id);
    }
    if (!requireObject(plan.qualification.gate, 'qualification.gate', errors)) {
      // type error already recorded
    } else if (plan.qualification.gate.executionMode !== 'freeze-and-execute-production-source') {
      push(errors, 'INVALID_GATE_EXECUTION', 'qualification.gate.executionMode',
        'Gate must freeze and execute the production source');
    }
  }
  const evidenceIds = requireObject(plan.evidence, 'evidence', errors)
    && requireArray(plan.evidence.items, 'evidence.items', errors)
    ? uniqueIds(plan.evidence.items, 'evidence.items', errors) : new Set();

  const knownConsumers = new Set([
    ...knowledgeIds, ...targetIds, ...strategyIds, ...guardIds, ...recoveryIds, ...claimIds, ...evidenceIds,
  ]);
  const mappedActions = new Map();
  if (requireArray(plan.sourceMap, 'sourceMap', errors, true)) {
    plan.sourceMap.forEach((entry, index) => {
      const itemPath = `sourceMap[${index}]`;
      if (!requireObject(entry, itemPath, errors)) return;
      if (mappedActions.has(entry.actionId)) {
        push(errors, 'DUPLICATE_SOURCE_MAP_ENTRY', `${itemPath}.actionId`, 'an action must have one source map entry');
      }
      mappedActions.set(entry.actionId, entry);
      const disposition = dispositions.get(entry.actionId);
      if (!disposition) {
        push(errors, 'UNKNOWN_ACTION_REFERENCE', `${itemPath}.actionId`, 'source map action is not classified');
      } else if (entry.disposition !== disposition.disposition) {
        push(errors, 'SOURCE_MAP_DISPOSITION_CONFLICT', `${itemPath}.disposition`,
          'source map disposition conflicts with action classification');
      }
      if (!isStringArray(entry.consumerIds, true)) {
        push(errors, 'INVALID_CONSUMERS', `${itemPath}.consumerIds`, 'expected explicit consumers');
      } else {
        for (const consumerId of entry.consumerIds) {
          if (!knownConsumers.has(consumerId)) {
            push(errors, 'UNKNOWN_CONSUMER', `${itemPath}.consumerIds`, `consumer ${consumerId} does not exist`);
          }
        }
      }
      const expectedEpisodeId = businessEpisodeConsumption.get(entry.actionId);
      if (disposition && disposition.disposition === 'business') {
        if (!expectedEpisodeId || entry.episodeId !== expectedEpisodeId) {
          push(errors, 'SOURCE_MAP_EPISODE_CONFLICT', `${itemPath}.episodeId`,
            'business source map must reference its unique Business Episode');
        }
      } else if (Object.prototype.hasOwnProperty.call(entry, 'episodeId')) {
        push(errors, 'NON_BUSINESS_EPISODE_REFERENCE', `${itemPath}.episodeId`,
          'only business actions may reference a Business Episode');
      }
    });
  }
  for (const actionId of actionIds) {
    if (!mappedActions.has(actionId)) {
      push(blockers, 'MISSING_SOURCE_MAP_ENTRY', 'sourceMap', `action ${actionId} has no source map entry`);
    }
  }

  if (requireObject(plan.outputs, 'outputs', errors)) {
    const production = plan.outputs.productionRecipe;
    const outputGate = plan.outputs.qualificationGate;
    const qualificationGate = isObject(plan.qualification) ? plan.qualification.gate : null;
    if (!requireObject(production, 'outputs.productionRecipe', errors)) {
      // type error already recorded
    } else {
      requireString(production.path, 'outputs.productionRecipe.path', errors);
      if (production.sha256 !== null && !SHA256.test(String(production.sha256 || ''))) {
        push(errors, 'INVALID_SHA256', 'outputs.productionRecipe.sha256', 'expected null or a lowercase SHA-256');
      }
    }
    if (!requireObject(outputGate, 'outputs.qualificationGate', errors)) {
      // type error already recorded
    } else {
      requireString(outputGate.path, 'outputs.qualificationGate.path', errors);
    }
    if (isObject(production) && isObject(outputGate) && isObject(qualificationGate)) {
      const gateSource = qualificationGate.productionSource;
      if (outputGate.path !== qualificationGate.path) {
        push(errors, 'GATE_PATH_MISMATCH', 'outputs.qualificationGate.path', 'qualification Gate paths must match');
      }
      if (!isObject(gateSource)
          || gateSource.path !== production.path
          || gateSource.sha256 !== production.sha256) {
        push(errors, 'GATE_SOURCE_MISMATCH', 'qualification.gate.productionSource',
          'Gate must reference the exact production path and hash');
      }
    }
    if (!isObject(plan.outputs.renderer)) {
      push(errors, 'INVALID_TYPE', 'outputs.renderer', 'expected renderer status');
    } else if (plan.outputs.renderer.status === 'not-implemented'
        && plan.outputs.renderer.mode !== 'deterministic-agent-instructions') {
      push(errors, 'RENDERER_STATUS_CONFLICT', 'outputs.renderer',
        'an unavailable renderer must use deterministic Agent instructions');
    }
  }

  if (requireObject(plan.verification, 'verification', errors)) {
    if (!['not-generated', 'present'].includes(plan.verification.generated)) {
      push(errors, 'INVALID_GENERATED_STATUS', 'verification.generated', 'expected not-generated or present');
    }
    for (const key of ['staticallyReviewed', 'syntheticallyVerified', 'liveVerified', 'qualified']) {
      if (!VERIFICATION_STATUSES.has(plan.verification[key])) {
        push(errors, 'INVALID_VERIFICATION_STATUS', `verification.${key}`, 'unknown verification status');
      }
    }
    const production = isObject(plan.outputs) ? plan.outputs.productionRecipe : null;
    const gateSource = isObject(plan.qualification) && isObject(plan.qualification.gate)
      ? plan.qualification.gate.productionSource : null;
    if (plan.verification.generated === 'present') {
      if (!isObject(production) || !SHA256.test(String(production.sha256 || ''))
          || !isObject(gateSource) || !SHA256.test(String(gateSource.sha256 || ''))) {
        push(errors, 'GENERATED_SOURCE_NOT_FROZEN', 'verification.generated',
          'present production output needs matching frozen hashes');
      }
    } else if (isObject(production) && production.sha256 !== null) {
      push(errors, 'UNGENERATED_SOURCE_HAS_HASH', 'outputs.productionRecipe.sha256',
        'an ungenerated production output must use a null hash');
    }
    if (plan.verification.qualified === 'passed'
        && (plan.verification.liveVerified !== 'passed' || plan.verification.generated !== 'present')) {
      push(errors, 'QUALIFICATION_STATUS_CONFLICT', 'verification.qualified',
        'qualified requires present production source and passed live verification');
    }
  }

  if (isObject(plan.outputs) && isObject(plan.outputs.renderer)
      && plan.outputs.renderer.status === 'not-implemented') {
    push(warnings, 'RENDERER_NOT_IMPLEMENTED', 'outputs.renderer.status',
      'production code must be authored through the deterministic Agent instructions');
  }

  if (options.checkSource) checkActualSource(plan, result, options);
  result.valid = errors.length === 0;
  result.productionReady = result.valid && blockers.length === 0;
  return result;
}

function loadPlan(planPath) {
  return JSON.parse(fs.readFileSync(planPath, 'utf8'));
}

function main(argv) {
  const args = argv.slice(2);
  const planArg = args.find(arg => !arg.startsWith('--'));
  const unknownFlags = args.filter(arg => arg.startsWith('--') && arg !== '--check-source');
  if (!planArg || unknownFlags.length > 0) {
    process.stderr.write('Usage: validate-semantic-build-plan.js <plan.json> [--check-source]\n');
    process.exitCode = 2;
    return;
  }
  const planPath = path.resolve(process.cwd(), planArg);
  let plan;
  try {
    plan = loadPlan(planPath);
  } catch (_) {
    process.stdout.write(JSON.stringify({
      valid: false,
      productionReady: false,
      sourceChecked: false,
      errors: [{code: 'PLAN_UNREADABLE', path: planArg, message: 'plan file could not be read as JSON'}],
      blockers: [],
      warnings: [],
    }, null, 2) + '\n');
    process.exitCode = 1;
    return;
  }
  const result = validateSemanticBuildPlan(plan, {
    checkSource: args.includes('--check-source'),
    cwd: process.cwd(),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.valid || !result.productionReady) process.exitCode = 1;
}

module.exports = {
  DISPOSITIONS,
  validateSemanticBuildPlan,
  resolveActionsPath,
};

if (require.main === module) main(process.argv);
