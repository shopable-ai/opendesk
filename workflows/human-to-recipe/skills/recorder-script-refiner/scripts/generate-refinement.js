#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {inspectBundle} = require('./inspect-recorder-bundle.js');

const REPORT_FORMAT = 'opendesk.recorder.refinement/v5';
const COMPILER_ID = 'opendesk.recorder.actions-first-refiner/v4';
const PUBLIC_ACTION_BY_NATIVE = Object.freeze({AXPress: 'invoke', invoke: 'invoke'});
const ACTION_PRIMITIVES = Object.freeze({
  click: ['mouse.clickPoint'],
  drag: ['mouse.move', 'mouse.down', 'mouse.move', 'mouse.up'],
  wheel: ['mouse.move', 'mouse.wheel'],
  text: ['keyboard.type'],
  'text-edit': ['Accessibility.perform'],
  shortcut: ['keyboard.combination'],
  key: ['keyboard.press'],
});

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assert(condition, code, message) {
  if (!condition) throw failure(code, message);
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function hashText(value) {
  return hash(Buffer.from(String(value), 'utf8'));
}

function readRegular(filePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (_) {
    throw failure('FILE_UNREADABLE', `${label} is missing or unreadable`);
  }
  assert(stat.isFile() && !stat.isSymbolicLink(), 'INVALID_FILE', `${label} must be a regular file`);
  return fs.readFileSync(filePath);
}

function parseJSON(bytes, label) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    assert(value && typeof value === 'object' && !Array.isArray(value),
      'INVALID_JSON', `${label} must contain an object`);
    return value;
  } catch (error) {
    if (error && error.code) throw error;
    throw failure('INVALID_JSON', `${label} is not valid JSON`);
  }
}

function fromRelative(repoRoot, relativePath) {
  assert(typeof relativePath === 'string' && relativePath.startsWith('./'),
    'INVALID_LINEAGE', 'inspector returned an invalid repository path');
  return path.resolve(repoRoot, relativePath.slice(2));
}

function relative(repoRoot, filePath) {
  return './' + path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function json(value) {
  return JSON.stringify(value);
}

function renderActionCall(helper, descriptor) {
  const lines = [`await ${helper}({`];
  for (const [field, value] of Object.entries(descriptor)) {
    lines.push(`  ${field}: ${json(value)},`);
  }
  lines.push('});');
  return lines.join('\n') + '\n';
}

function number(value, label, options = {}) {
  assert(Number.isFinite(value), 'INVALID_ACTION', `${label} must be finite`);
  if (options.integer) assert(Number.isInteger(value), 'INVALID_ACTION', `${label} must be an integer`);
  if (options.min !== undefined) assert(value >= options.min, 'INVALID_ACTION', `${label} is too small`);
  if (options.max !== undefined) assert(value <= options.max, 'INVALID_ACTION', `${label} is too large`);
  return value;
}

function nonEmptyString(value, label) {
  assert(typeof value === 'string' && value.length > 0,
    'INVALID_ACTION', `${label} must be a non-empty string`);
  return value;
}

function validateRect(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_ACTION', `${label} is missing`);
  number(value.x, `${label}.x`);
  number(value.y, `${label}.y`);
  number(value.width, `${label}.width`, {min: Number.EPSILON});
  number(value.height, `${label}.height`, {min: Number.EPSILON});
}

function validateElementDescriptor(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_ACTION', `${label} is invalid`);
  nonEmptyString(value.role, `${label}.role`);
  if (value.nativeRole !== undefined) assert(typeof value.nativeRole === 'string',
    'INVALID_ACTION', `${label}.nativeRole is invalid`);
  if (value.name !== undefined) assert(typeof value.name === 'string',
    'INVALID_ACTION', `${label}.name is invalid`);
  if (value.identifier !== undefined) assert(typeof value.identifier === 'string',
    'INVALID_ACTION', `${label}.identifier is invalid`);
  if (value.enabled !== undefined) assert(typeof value.enabled === 'boolean',
    'INVALID_ACTION', `${label}.enabled is invalid`);
  if (value.focused !== undefined) assert(typeof value.focused === 'boolean',
    'INVALID_ACTION', `${label}.focused is invalid`);
  if (value.valueSettable !== undefined) assert(typeof value.valueSettable === 'boolean',
    'INVALID_ACTION', `${label}.valueSettable is invalid`);
  assert(Array.isArray(value.nativeActions)
    && value.nativeActions.every(item => typeof item === 'string' && item.length > 0),
  'INVALID_ACTION', `${label}.nativeActions is invalid`);
  validateRect(value.bounds, `${label}.bounds`);
}

function sameRecordedElementDescriptor(left, right) {
  return Boolean(left && right
    && left.role === right.role
    && left.nativeRole === right.nativeRole
    && left.name === right.name
    && left.identifier === right.identifier
    && left.enabled === right.enabled
    && left.focused === right.focused
    && left.valueSettable === right.valueSettable
    && JSON.stringify(left.nativeActions) === JSON.stringify(right.nativeActions)
    && JSON.stringify(left.bounds) === JSON.stringify(right.bounds));
}

function pointInsideRect(point, bounds) {
  return point && bounds
    && point.offsetX >= 0 && point.offsetY >= 0
    && point.offsetX < bounds.width && point.offsetY < bounds.height;
}

function validateElementEvidence(action) {
  const element = action.target && action.target.element;
  if (!element) return;
  assert(element.source === 'accessibility', 'INVALID_ACTION',
    `${action.id}.target.element has an unsupported source`);
  assert(element.resolution === 'point-hit' || element.resolution === 'nearest-actionable-ancestor',
    'INVALID_ACTION', `${action.id}.target.element has an unsupported resolution`);
  validateElementDescriptor(element, `${action.id}.target.element`);
  validateElementDescriptor(element.hit, `${action.id}.target.element.hit`);
  assert(Array.isArray(element.ancestors), 'INVALID_ACTION',
    `${action.id}.target.element.ancestors is invalid`);
  element.ancestors.forEach((ancestor, index) => validateElementDescriptor(
    ancestor, `${action.id}.target.element.ancestors[${index}]`,
  ));
  if (element.containers !== undefined) {
    assert(Array.isArray(element.containers), 'INVALID_ACTION',
      `${action.id}.target.element.containers is invalid`);
    element.containers.forEach((container, index) => validateElementDescriptor(
      container, `${action.id}.target.element.containers[${index}]`,
    ));
  }
  assert(element.point && typeof element.point === 'object', 'INVALID_ACTION',
    `${action.id}.target.element.point is invalid`);
  number(element.point.offsetX, `${action.id}.target.element.point.offsetX`);
  number(element.point.offsetY, `${action.id}.target.element.point.offsetY`);
  number(element.point.xRatio, `${action.id}.target.element.point.xRatio`, {min: 0, max: 1});
  number(element.point.yRatio, `${action.id}.target.element.point.yRatio`, {min: 0, max: 1});
  assert(pointInsideRect(element.point, element.bounds), 'INVALID_ACTION',
    `${action.id}.target.element.point is outside the selected element`);
  assert(element.point.xRatio < 1 && element.point.yRatio < 1
    && Math.abs(element.point.xRatio - element.point.offsetX / element.bounds.width) <= 1e-12
    && Math.abs(element.point.yRatio - element.point.offsetY / element.bounds.height) <= 1e-12,
  'INVALID_ACTION', `${action.id}.target.element.point ratio does not match its recorded offset`);
  const screenPoint = {
    x: element.bounds.x + element.point.offsetX,
    y: element.bounds.y + element.point.offsetY,
  };
  const containsScreenPoint = descriptor => screenPoint.x >= descriptor.bounds.x
    && screenPoint.y >= descriptor.bounds.y
    && screenPoint.x < descriptor.bounds.x + descriptor.bounds.width
    && screenPoint.y < descriptor.bounds.y + descriptor.bounds.height;
  assert(containsScreenPoint(element.hit)
    && element.ancestors.every(containsScreenPoint)
    && (!element.containers || element.containers.every(containsScreenPoint)),
  'INVALID_ACTION', `${action.id}.target.element ancestry does not contain the recorded point`);
  if (element.resolution === 'point-hit') {
    assert(sameRecordedElementDescriptor(element, element.hit), 'INVALID_ACTION',
      `${action.id}.target.element does not match its recorded point hit`);
  } else {
    assert(element.ancestors.length > 0
      && sameRecordedElementDescriptor(element, element.ancestors[element.ancestors.length - 1]),
    'INVALID_ACTION', `${action.id}.target.element does not match its selected actionable ancestor`);
  }
}

function parseRawEvents(bytes) {
  const text = bytes.toString('utf8');
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const events = [];
  const byId = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    assert(lines[index].length > 0, 'INVALID_RAW', `raw event line ${index + 1} is empty`);
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch (_) {
      throw failure('INVALID_RAW', `raw event line ${index + 1} is not valid JSON`);
    }
    assert(event && typeof event === 'object' && !Array.isArray(event)
      && typeof event.eventId === 'string' && event.eventId.length > 0
      && typeof event.sequence === 'string' && /^\d+$/.test(event.sequence)
      && !byId.has(event.eventId),
    'INVALID_RAW', `raw event line ${index + 1} has invalid identity`);
    byId.set(event.eventId, event);
    events.push(event);
  }
  return {events, byId};
}

function validateWindowTarget(action) {
  const target = action.target;
  assert(target && (target.kind === 'window' || target.kind === 'editable') && target.window,
    'INVALID_ACTION', `${action.id} requires a window target`);
  const expectedResolution = target.kind === 'editable'
    ? 'application-identity+window-title+accessibility-selector'
    : 'application-identity+window-title';
  assert(target.resolution === expectedResolution, 'INVALID_ACTION',
    `${action.id} has an unsupported window target resolution`);
  const application = target.window.application;
  assert(application && (application.identityKind === 'executable-path'
    || application.identityKind === 'executable-name'),
  'INVALID_ACTION', `${action.id} has an unsupported application identity`);
  nonEmptyString(application.identityValue, `${action.id}.target.window.application.identityValue`);
  nonEmptyString(target.window.title, `${action.id}.target.window.title`);
  validateRect(target.window.bounds, `${action.id}.target.window.bounds`);
}

function validateRelativePosition(action, position, scope) {
  assert(position && position.verified === true && position.space === 'screen-logical',
    'INVALID_ACTION', `${action.id} requires a verified screen-logical position`);
  const relativePosition = position[scope];
  assert(relativePosition && relativePosition.verified === true
    && relativePosition.anchor === 'top-left'
    && relativePosition.space === `${scope}-logical`,
  'INVALID_ACTION', `${action.id} requires a verified ${scope}-relative position`);
  number(relativePosition.offsetX, `${action.id}.${scope}.offsetX`);
  number(relativePosition.offsetY, `${action.id}.${scope}.offsetY`);
  number(relativePosition.xRatio, `${action.id}.${scope}.xRatio`, {min: 0, max: 1});
  number(relativePosition.yRatio, `${action.id}.${scope}.yRatio`, {min: 0, max: 1});
  return relativePosition;
}

function validateDisplayTarget(action) {
  const target = action.target;
  assert(target && target.kind === 'display' && target.display,
    'INVALID_ACTION', `${action.id} requires a display target`);
  assert(target.resolution === 'display-id+hardware-id', 'INVALID_ACTION',
    `${action.id} has an unsupported display target resolution`);
  nonEmptyString(String(target.display.id || ''), `${action.id}.target.display.id`);
  if (target.display.hardwareId !== undefined) {
    assert(typeof target.display.hardwareId === 'string', 'INVALID_ACTION',
      `${action.id}.target.display.hardwareId is invalid`);
  }
  validateRect(target.display, `${action.id}.target.display`);
}

function validatePointerScope(action, position) {
  assert(action.target && (action.target.kind === 'window' || action.target.kind === 'display'),
    'INVALID_ACTION', `${action.id} has an unsupported pointer scope`);
  if (action.target.kind === 'window') {
    validateWindowTarget(action);
    return {scope: 'window', relativePosition: validateRelativePosition(action, position, 'window')};
  }
  validateDisplayTarget(action);
  return {scope: 'display', relativePosition: validateRelativePosition(action, position, 'display')};
}

function validateActionArguments(action) {
  const args = action.args;
  assert(args && typeof args === 'object' && !Array.isArray(args),
    'INVALID_ACTION', `${action.id}.args is required`);
  switch (action.kind) {
    case 'click':
      nonEmptyString(args.button, `${action.id}.args.button`);
      number(args.clickCount, `${action.id}.args.clickCount`, {integer: true, min: 1});
      break;
    case 'drag':
      nonEmptyString(args.button, `${action.id}.args.button`);
      number(args.steps, `${action.id}.args.steps`, {integer: true, min: 2, max: 100});
      break;
    case 'wheel':
      number(args.deltaX, `${action.id}.args.deltaX`, {integer: true});
      number(args.deltaY, `${action.id}.args.deltaY`, {integer: true});
      number(args.steps, `${action.id}.args.steps`, {integer: true, min: 1, max: 100});
      number(args.delayMs, `${action.id}.args.delayMs`, {integer: true, min: 0});
      break;
    case 'text':
      assert(typeof args.text === 'string' && args.editSemantics === 'insert-at-current-focus',
        'INVALID_ACTION', `${action.id} has invalid keyboard text arguments`);
      break;
    case 'text-edit':
      assert(args.textEdit && typeof args.textEdit === 'object',
        'INVALID_ACTION', `${action.id} has invalid text-edit arguments`);
      break;
    case 'shortcut':
      assert(Array.isArray(args.keys) && args.keys.length > 0
        && args.keys.every(key => typeof key === 'string' && key.length > 0),
      'INVALID_ACTION', `${action.id} has invalid shortcut keys`);
      break;
    case 'key':
      nonEmptyString(args.key, `${action.id}.args.key`);
      break;
    default:
      throw failure('UNSUPPORTED_ACTION', `${action.id} has unsupported kind ${String(action.kind)}`);
  }
}

function actionExpectedStrategy(kind) {
  return {
    click: 'mouse.click', drag: 'mouse.drag', wheel: 'mouse.wheel', text: 'keyboard.type',
    'text-edit': 'accessibility.setValue', shortcut: 'keyboard.shortcut', key: 'keyboard.press',
  }[kind];
}

function validateActions(actionsDocument, candidate, raw) {
  assert(actionsDocument.formatVersion === 'opendesk.recorder.actions/v2'
    && actionsDocument.readiness === 'ready'
    && actionsDocument.environment && actionsDocument.environment.coordinateSpace === 'screen-logical',
  'INVALID_ACTIONS', 'actions document is not a ready Recorder actions/v2 input');
  assert(candidate && candidate.formatVersion === 'opendesk.recorder.basic-candidate/v3'
    && candidate.mode === 'basic' && candidate.timing,
  'INVALID_CANDIDATE', 'candidate does not contain the required basic timing policy');
  const timing = candidate.timing;
  number(timing.minimumDelayMs, 'candidate.timing.minimumDelayMs', {integer: true, min: 0});
  number(timing.maximumDelayMs, 'candidate.timing.maximumDelayMs', {integer: true, min: 0});
  number(timing.speedMultiplier, 'candidate.timing.speedMultiplier', {min: Number.EPSILON});
  assert(timing.maximumDelayMs >= timing.minimumDelayMs,
    'INVALID_CANDIDATE', 'candidate timing range is invalid');
  const rows = actionsDocument.actions;
  assert(Array.isArray(rows) && rows.length > 0, 'INVALID_ACTIONS', 'actions list must be non-empty');
  const seen = new Set();
  let priorSequence = null;
  for (let index = 0; index < rows.length; index += 1) {
    const action = rows[index];
    assert(action && typeof action === 'object' && !Array.isArray(action),
      'INVALID_ACTION', `action ${index + 1} is invalid`);
    nonEmptyString(action.id, `action ${index + 1}.id`);
    assert(!seen.has(action.id), 'INVALID_ACTION', `${action.id} is duplicated`);
    seen.add(action.id);
    assert(action.review && action.review.required === false && action.review.status === 'not-required',
      'INVALID_ACTION', `${action.id} is not ready for deterministic generation`);
    assert(action.target && typeof action.target === 'object'
      && typeof action.target.resolution === 'string' && action.target.resolution.length > 0
      && ['verified', 'unavailable', 'not-applicable', 'not-requested'].includes(action.target.semanticStatus),
    'INVALID_ACTION', `${action.id} target evidence is incomplete`);
    assert(action.strategy === actionExpectedStrategy(action.kind),
      'INVALID_ACTION', `${action.id} strategy does not match its recorded input primitive`);
    validateActionArguments(action);
    if (['click', 'wheel', 'drag'].includes(action.kind)) {
      validatePointerScope(action, action.position);
      if (action.kind === 'drag') {
        const destination = validatePointerScope(action, action.destination);
        assert(destination.scope === action.target.kind,
          'INVALID_ACTION', `${action.id} drag endpoints changed scope`);
      }
    } else {
      validateWindowTarget(action);
    }
    validateElementEvidence(action);
    if (action.kind === 'click' && action.target.kind === 'window') {
      assert((action.target.semanticStatus === 'verified') === Boolean(action.target.element),
        'INVALID_ACTION', `${action.id} semantic status and element evidence disagree`);
    }
    const sourceIds = action.source && action.source.eventIds;
    assert(Array.isArray(sourceIds) && sourceIds.length > 0,
      'INVALID_ACTION', `${action.id} source events are missing`);
    const sourceEvents = sourceIds.map(eventId => raw.byId.get(eventId));
    assert(sourceEvents.every(Boolean) && new Set(sourceIds).size === sourceIds.length,
      'INVALID_ACTION', `${action.id} source events do not uniquely exist in raw`);
    const start = sourceEvents[0];
    const end = sourceEvents[sourceEvents.length - 1];
    assert(sourceEvents.every((event, sourceIndex) => sourceIndex === 0
      || BigInt(event.sequence) > BigInt(sourceEvents[sourceIndex - 1].sequence)),
    'INVALID_ACTION', `${action.id} source events are out of order`);
    assert(action.timing && action.timing.sequenceStart === start.sequence
      && action.timing.sequenceEnd === end.sequence
      && action.timing.nativeStart === start.nativeTime
      && action.timing.nativeEnd === end.nativeTime
      && action.timing.nativeUnit === start.nativeUnit
      && action.timing.nativeUnit === end.nativeUnit,
    'INVALID_ACTION', `${action.id} timing does not match its raw source boundary`);
    const sequence = BigInt(action.timing.sequenceStart);
    assert(priorSequence === null || sequence > priorSequence,
      'INVALID_ACTION', `${action.id} is out of source order`);
    priorSequence = sequence;
  }
  return rows;
}

function nativeMilliseconds(value, unit) {
  const native = BigInt(value);
  if (unit === 'milliseconds') return native;
  assert(unit === 'nanoseconds', 'INVALID_ACTION', `unsupported native timing unit ${String(unit)}`);
  return native / 1000000n;
}

function hasPauseBoundary(rawEvents, afterSequence, beforeSequence) {
  const after = BigInt(afterSequence);
  const before = BigInt(beforeSequence);
  return rawEvents.some(event => {
    const sequence = BigInt(event.sequence);
    return sequence > after && sequence < before
      && (event.libraryEvent === 'RECORDER_PAUSED' || event.libraryEvent === 'RECORDER_RESUMED');
  });
}

function computeTiming(actions, candidateTiming, rawEvents) {
  const result = [];
  for (let index = 0; index < actions.length; index += 1) {
    if (index === actions.length - 1) {
      result.push({delayMs: null, recordedGapMs: null, pauseBoundary: false});
      continue;
    }
    const current = actions[index];
    const next = actions[index + 1];
    const paused = hasPauseBoundary(rawEvents, current.timing.sequenceEnd, next.timing.sequenceStart);
    if (paused) {
      result.push({delayMs: null, recordedGapMs: null, pauseBoundary: true});
      continue;
    }
    const currentEnd = nativeMilliseconds(current.timing.nativeEnd, current.timing.nativeUnit);
    const nextStart = nativeMilliseconds(next.timing.nativeStart, next.timing.nativeUnit);
    const gap = nextStart > currentEnd ? nextStart - currentEnd : 0n;
    const recordedGapMs = Number(gap);
    let delayMs = Math.round(recordedGapMs / candidateTiming.speedMultiplier);
    delayMs = Math.max(candidateTiming.minimumDelayMs, Math.min(candidateTiming.maximumDelayMs, delayMs));
    result.push({delayMs: delayMs > 0 ? delayMs : null, recordedGapMs, pauseBoundary: false});
  }
  return result;
}

function windowDescriptor(action) {
  const snapshot = action.target.window;
  return {
    application: {
      identityKind: snapshot.application.identityKind,
      identityValue: snapshot.application.identityValue,
    },
    title: snapshot.title,
  };
}

function recordedWindowGeometry(action) {
  const bounds = action.target.window.bounds;
  return {width: bounds.width, height: bounds.height};
}

function recordedDisplayGeometry(action) {
  const snapshot = action.target.display;
  return {width: snapshot.width, height: snapshot.height};
}

function displayDescriptor(action) {
  const snapshot = action.target.display;
  const hardwareId = typeof snapshot.hardwareId === 'string'
    && !snapshot.hardwareId.toLowerCase().startsWith('unknown') ? snapshot.hardwareId : '';
  return {id: String(snapshot.id), hardwareId};
}

function semanticGuardDescriptor(action) {
  const target = action.target;
  const element = target && target.element;
  if (action.kind !== 'click' || !target || target.kind !== 'window'
      || target.semanticStatus !== 'verified' || !element
      || element.source !== 'accessibility' || element.enabled !== true
      || element.role !== 'button'
      || typeof element.name !== 'string' || element.name.length === 0
      || typeof element.identifier !== 'string' || element.identifier.length === 0
      || typeof element.nativeRole !== 'string' || element.nativeRole.length === 0
      || !Array.isArray(element.nativeActions) || element.nativeActions.length === 0) return null;
  const recordedNativeActions = [...element.nativeActions];
  const publicActions = recordedNativeActions.map(name => PUBLIC_ACTION_BY_NATIVE[name]);
  if (publicActions.some(name => !name)) return null;
  const uniquePublicActions = Array.from(new Set(publicActions)).sort();
  if (!uniquePublicActions.includes('invoke')) return null;
  const selector = {
    role: element.role,
    name: element.name,
    identifier: element.identifier,
  };
  return {
    selector,
    expected: {
      ...selector,
      nativeRole: element.nativeRole,
      enabled: true,
      nativeActions: recordedNativeActions,
      publicActions: uniquePublicActions,
    },
  };
}

function semanticGuardSkipReason(action) {
  const target = action.target;
  const element = target && target.element;
  if (action.kind !== 'click' || !target || target.kind !== 'window'
      || target.semanticStatus !== 'verified' || !element) return null;
  if (element.source !== 'accessibility') return 'SEMANTIC_SOURCE_UNSUPPORTED';
  if (element.role !== 'button') return 'SEMANTIC_ROLE_NOT_SINGLE_CLICK_BUTTON';
  if (typeof element.name !== 'string' || element.name.length === 0
      || typeof element.identifier !== 'string' || element.identifier.length === 0
      || typeof element.nativeRole !== 'string' || element.nativeRole.length === 0) {
    return 'EXACT_SEMANTIC_IDENTITY_INCOMPLETE';
  }
  if (element.enabled !== true) return 'RECORDED_ELEMENT_NOT_ENABLED';
  if (!Array.isArray(element.nativeActions) || element.nativeActions.length === 0
      || element.nativeActions.some(name => !PUBLIC_ACTION_BY_NATIVE[name])) {
    return 'NATIVE_ACTION_MAPPING_INCOMPLETE';
  }
  if (!element.nativeActions.map(name => PUBLIC_ACTION_BY_NATIVE[name]).includes('invoke')) {
    return 'RECORDED_CLICK_ACTION_NOT_EQUIVALENT';
  }
  return semanticGuardDescriptor(action) ? null : 'RECORDED_SEMANTIC_EVIDENCE_INELIGIBLE';
}

function strategyFor(action) {
  if (action.kind === 'click') {
    if (action.target.kind === 'display') return 'display-offset';
    return semanticGuardDescriptor(action)
      ? 'verified-accessibility-guarded-window-offset' : 'window-offset';
  }
  return {
    drag: `${action.target.kind}-offset-drag`,
    wheel: `${action.target.kind}-offset-wheel`,
    text: 'active-window-keyboard-type',
    'text-edit': 'verified-accessibility-text-edit',
    shortcut: 'active-window-keyboard-shortcut',
    key: 'active-window-keyboard-key',
  }[action.kind];
}

function plannedInputSideEffects(actions) {
  const counts = {};
  for (const action of actions) {
    for (const primitive of ACTION_PRIMITIVES[action.kind]) {
      counts[primitive] = (counts[primitive] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

const TEXT_EDIT_HELPERS = `function __refinerRightRotate(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}
function __refinerSHA256(bytes) {
  const words = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const message = Array.from(bytes), bitLength = message.length * 8;
  message.push(0x80);
  while ((message.length % 64) !== 56) message.push(0);
  for (let index = 7; index >= 0; index -= 1) message.push((bitLength / Math.pow(2, index * 8)) & 0xff);
  const result = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const schedule = new Array(64);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) schedule[index] = ((message[offset+index*4]<<24)|(message[offset+index*4+1]<<16)|(message[offset+index*4+2]<<8)|message[offset+index*4+3]) >>> 0;
    for (let index = 16; index < 64; index += 1) {
      const a = __refinerRightRotate(schedule[index-15],7)^__refinerRightRotate(schedule[index-15],18)^(schedule[index-15]>>>3);
      const b = __refinerRightRotate(schedule[index-2],17)^__refinerRightRotate(schedule[index-2],19)^(schedule[index-2]>>>10);
      schedule[index] = (schedule[index-16]+a+schedule[index-7]+b) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = result;
    for (let index = 0; index < 64; index += 1) {
      const s1=__refinerRightRotate(e,6)^__refinerRightRotate(e,11)^__refinerRightRotate(e,25), choose=(e&f)^(~e&g);
      const t1=(h+s1+choose+words[index]+schedule[index])>>>0, s0=__refinerRightRotate(a,2)^__refinerRightRotate(a,13)^__refinerRightRotate(a,22), majority=(a&b)^(a&c)^(b&c), t2=(s0+majority)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    result[0]=(result[0]+a)>>>0; result[1]=(result[1]+b)>>>0; result[2]=(result[2]+c)>>>0; result[3]=(result[3]+d)>>>0;
    result[4]=(result[4]+e)>>>0; result[5]=(result[5]+f)>>>0; result[6]=(result[6]+g)>>>0; result[7]=(result[7]+h)>>>0;
  }
  return result.map(part => part.toString(16).padStart(8,"0")).join("");
}
function __refinerUTF16SHA256(value) {
  const bytes = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) { const unit = value.charCodeAt(index); bytes[index*2] = unit & 0xff; bytes[index*2+1] = unit >>> 8; }
  return __refinerSHA256(bytes);
}
async function __refinerApplyTextEdit(win, selector, edit) {
  const ref = await Accessibility.find(selector, { within: win, maxDepth: 32, maxNodes: 5000 });
  if (!ref) throw new Error("Recorder refinement editable target was not found");
  try {
    const read = await Accessibility.read(ref, { properties: ["value"] });
    const current = read && read.properties && read.properties.value;
    if (typeof current !== "string" || current.length !== edit.before.utf16Units || __refinerUTF16SHA256(current) !== edit.before.sha256) throw new Error("Recorder refinement editable value precondition mismatch");
    const patch = edit.patch;
    if (patch.start < 0 || patch.deleteCount < 0 || patch.start + patch.deleteCount > current.length) throw new Error("Recorder refinement text patch boundary is invalid");
    const next = current.slice(0, patch.start) + patch.insertText + current.slice(patch.start + patch.deleteCount);
    if (next.length !== edit.after.utf16Units || __refinerUTF16SHA256(next) !== edit.after.sha256) throw new Error("Recorder refinement text patch integrity mismatch");
    const performed = await Accessibility.perform(ref, { action: "setValue", value: next });
    if (!performed || (performed.actionState !== "acknowledged" && performed.actionState !== "not_needed")) throw new Error("Recorder refinement text edit was not acknowledged");
    const verified = await Accessibility.read(ref, { properties: ["value"] });
    const actual = verified && verified.properties && verified.properties.value;
    if (typeof actual !== "string" || actual.length !== edit.after.utf16Units || __refinerUTF16SHA256(actual) !== edit.after.sha256) throw new Error("Recorder refinement text edit postcondition mismatch");
  } finally {
    await Accessibility.release(ref);
  }
}
`;

function compileRefinedScript(actionsDocument, candidate, rawEvents) {
  const actions = actionsDocument.actions;
  const timingRows = computeTiming(actions, candidate.timing, rawEvents);
  const hasDisplay = actions.some(action => action.target.kind === 'display');
  const hasGuard = actions.some(action => Boolean(semanticGuardDescriptor(action)));
  const hasVerifiedWindowClick = actions.some(action => action.kind === 'click'
    && action.target.kind === 'window' && Boolean(semanticGuardDescriptor(action)));
  const hasConservativeWindowClick = actions.some(action => action.kind === 'click'
    && action.target.kind === 'window' && !semanticGuardDescriptor(action));
  const hasDisplayClick = actions.some(action => action.kind === 'click'
    && action.target.kind === 'display');
  const hasWindowPointer = actions.some(action => ['click', 'drag', 'wheel'].includes(action.kind)
    && action.target.kind === 'window');
  const hasDisplayPointer = actions.some(action => ['click', 'drag', 'wheel'].includes(action.kind)
    && action.target.kind === 'display');
  const hasTextEdit = actions.some(action => action.kind === 'text-edit');
  let source = '';
  let line = 1;
  const compiledActions = [];
  const write = value => {
    source += value;
    line += (value.match(/\n/g) || []).length;
  };
  write('// Generated deterministically from Recorder actions.json by the actions-first refiner.\n');
  write('// The basic recipe is lineage and static-audit input only; it is not this file\'s template.\n');
  write('const __refinerPlatform = System.getPlatformInfo();\n');
  write(`if (!__refinerPlatform || __refinerPlatform.os !== ${json(actionsDocument.environment.platform)}) throw new Error("Recorder refinement platform mismatch");\n`);
  write('async function __refinerResolveWindow(target) {\n');
  write('  let identity;\n');
  write('  switch (target.application.identityKind) {\n');
  write('    case "executable-path": identity = { exePath: target.application.identityValue }; break;\n');
  write('    case "executable-name": identity = { exeName: target.application.identityValue }; break;\n');
  write('    default: throw new Error("Unsupported Recorder application identity kind");\n');
  write('  }\n');
  write('  return await window.get({ ...identity, title: target.title });\n');
  write('}\n');
  if (hasDisplay) {
    write('function __refinerResolveDisplay(target) {\n');
    write('  const rows = Screen.getDisplays();\n');
    write('  const matches = rows.filter(row => String(row.id || "") === target.id && (!target.hardwareId || String(row.hardwareId || "") === target.hardwareId));\n');
    write('  if (matches.length !== 1) throw new Error("Recorder refinement could not resolve one current target display");\n');
    write('  const row = matches[0];\n');
    write('  if (![row.x, row.y, row.width, row.height].every(Number.isFinite) || row.width <= 0 || row.height <= 0) throw new Error("Recorder refinement resolved invalid display bounds");\n');
    write('  return row;\n');
    write('}\n');
  }
  write('async function __refinerRequireResolvedActiveWindow(expected, actionId) {\n');
  write('  const active = await window.getActiveWindow();\n');
  write('  const sameCurrentWindow = String(active.id || "") !== "" && String(expected.id || "") !== "" && String(active.id) === String(expected.id);\n');
  write('  const sameSnapshotGeometry = [active.x, active.y, active.width, active.height, expected.x, expected.y, expected.width, expected.height].every(Number.isFinite) && Number(active.x) === Number(expected.x) && Number(active.y) === Number(expected.y) && Number(active.width) === Number(expected.width) && Number(active.height) === Number(expected.height);\n');
  write('  if (!sameCurrentWindow || !sameSnapshotGeometry) throw new Error("Recorder refinement active window identity or geometry mismatch for " + actionId);\n');
  write('  return active;\n');
  write('}\n');
  write('async function __refinerRequireActiveWindow(target, actionId) {\n');
  write('  return await __refinerRequireResolvedActiveWindow(await __refinerResolveWindow(target), actionId);\n');
  write('}\n');
  if (hasWindowPointer) {
    write('function __refinerRequireRecordedWindowGeometry(current, recorded, actionId) {\n');
    write('  if (![current.width, current.height].every(Number.isFinite) || Number(current.width) !== recorded.width || Number(current.height) !== recorded.height) throw new Error("Recorder refinement window geometry differs from the recorded coordinate basis for " + actionId);\n');
    write('  return current;\n');
    write('}\n');
  }
  if (hasDisplayPointer) {
    write('function __refinerRequireRecordedDisplayGeometry(current, recorded, actionId) {\n');
    write('  if (![current.width, current.height].every(Number.isFinite) || Number(current.width) !== recorded.width || Number(current.height) !== recorded.height) throw new Error("Recorder refinement display geometry differs from the recorded coordinate basis for " + actionId);\n');
    write('  return current;\n');
    write('}\n');
  }
  write('function __refinerPoint(row, position, targetKind, actionId) {\n');
  write('  const point = Geometry.pointOffset(row, position.offsetX, position.offsetY);\n');
  write('  if (!Geometry.contains(Geometry.rect(row), point)) throw new Error("Recorder refinement relative point is outside current " + targetKind + " bounds for " + actionId);\n');
  write('  return point;\n');
  write('}\n');
  if (actions.some(action => action.kind === 'drag')) {
    write('function __refinerRequirePointer(point, actionId, phase) {\n');
    write('  const actual = mouse.getPos();\n');
    write('  if (!actual || Math.abs(Number(actual.x) - Number(point.x)) > 2 || Math.abs(Number(actual.y) - Number(point.y)) > 2) throw new Error("Recorder refinement pointer position mismatch for " + actionId + " " + phase);\n');
    write('}\n');
  }
  if (hasGuard) {
    write('async function __refinerGuardVerifiedElement(win, descriptor, actionId) {\n');
    write('  const ref = await Accessibility.find(descriptor.selector, { within: win, maxDepth: 32, maxNodes: 5000 });\n');
    write('  if (!ref) throw new Error("Recorder refinement verified element was not found for " + actionId);\n');
    write('  try {\n');
    write('    const read = await Accessibility.read(ref, { properties: ["role", "nativeRole", "name", "identifier", "enabled", "actions"] });\n');
    write('    const current = read && read.properties;\n');
    write('    if (!current || current.role !== descriptor.expected.role || current.nativeRole !== descriptor.expected.nativeRole || current.name !== descriptor.expected.name || current.identifier !== descriptor.expected.identifier) throw new Error("Recorder refinement verified element identity mismatch for " + actionId);\n');
    write('    if (descriptor.expected.enabled !== true || current.enabled !== descriptor.expected.enabled) throw new Error("Recorder refinement verified element is disabled for " + actionId);\n');
    write('    if (!Array.isArray(descriptor.expected.nativeActions) || descriptor.expected.nativeActions.length === 0 || !Array.isArray(descriptor.expected.publicActions) || descriptor.expected.publicActions.length === 0 || !Array.isArray(current.actions) || !descriptor.expected.publicActions.every(action => current.actions.includes(action))) throw new Error("Recorder refinement verified element action mismatch for " + actionId);\n');
    write('  } finally {\n');
    write('    await Accessibility.release(ref);\n');
    write('  }\n');
    write('}\n');
  }
  if (hasVerifiedWindowClick) {
    write('async function __refinerClickVerifiedWindowAction(action) {\n');
    write('  const current = __refinerRequireRecordedWindowGeometry(await __refinerResolveWindow(action.target), action.recordedWindow, action.actionId);\n');
    write('  await __refinerGuardVerifiedElement(current, action.semantic, action.actionId);\n');
    write('  const point = __refinerPoint(current, action.position, "window", action.actionId);\n');
    write('  await __refinerRequireResolvedActiveWindow(current, action.actionId);\n');
    write('  await mouse.clickPoint(point, { button: action.input.button, clickCount: action.input.clickCount });\n');
    write('}\n');
  }
  if (hasConservativeWindowClick) {
    write('async function __refinerClickWindowAction(action) {\n');
    write('  const current = __refinerRequireRecordedWindowGeometry(await __refinerResolveWindow(action.target), action.recordedWindow, action.actionId);\n');
    write('  const point = __refinerPoint(current, action.position, "window", action.actionId);\n');
    write('  await __refinerRequireResolvedActiveWindow(current, action.actionId);\n');
    write('  await mouse.clickPoint(point, { button: action.input.button, clickCount: action.input.clickCount });\n');
    write('}\n');
  }
  if (hasDisplayClick) {
    write('async function __refinerClickDisplayAction(action) {\n');
    write('  const current = __refinerRequireRecordedDisplayGeometry(__refinerResolveDisplay(action.target), action.recordedDisplay, action.actionId);\n');
    write('  const point = __refinerPoint(current, action.position, "display", action.actionId);\n');
    write('  await mouse.clickPoint(point, { button: action.input.button, clickCount: action.input.clickCount });\n');
    write('}\n');
  }
  if (hasTextEdit) write(TEXT_EDIT_HELPERS);

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const suffix = index + 1;
    const strategy = strategyFor(action);
    const markerLine = line;
    write(`// recorder-refinement: action=${action.id} strategy=${strategy}\n`);
    switch (action.kind) {
      case 'click': {
        if (action.target.kind === 'display') {
          write(renderActionCall('__refinerClickDisplayAction', {
            actionId: action.id,
            target: displayDescriptor(action),
            recordedDisplay: recordedDisplayGeometry(action),
            position: action.position.display,
            input: {button: action.args.button, clickCount: action.args.clickCount},
          }));
        } else {
          const guard = semanticGuardDescriptor(action);
          const descriptor = {
            actionId: action.id,
            target: windowDescriptor(action),
            recordedWindow: recordedWindowGeometry(action),
            position: action.position.window,
            input: {button: action.args.button, clickCount: action.args.clickCount},
          };
          if (guard) descriptor.semantic = guard;
          write(renderActionCall(
            guard ? '__refinerClickVerifiedWindowAction' : '__refinerClickWindowAction',
            descriptor,
          ));
        }
        break;
      }
      case 'drag': {
        const scope = action.target.kind;
        const variable = scope === 'display' ? `__refinerDisplay${suffix}` : `__refinerWindow${suffix}`;
        if (scope === 'display') write(`const ${variable} = __refinerRequireRecordedDisplayGeometry(__refinerResolveDisplay(${json(displayDescriptor(action))}), ${json(recordedDisplayGeometry(action))}, ${json(action.id)});\n`);
        else {
          write(`const ${variable} = __refinerRequireRecordedWindowGeometry(await __refinerResolveWindow(${json(windowDescriptor(action))}), ${json(recordedWindowGeometry(action))}, ${json(action.id)});\n`);
        }
        write(`const __refinerDragStart${suffix} = __refinerPoint(${variable}, ${json(action.position[scope])}, ${json(scope)}, ${json(action.id)});\n`);
        write(`const __refinerDragEnd${suffix} = __refinerPoint(${variable}, ${json(action.destination[scope])}, ${json(scope)}, ${json(action.id)});\n`);
        write(`await mouse.move(__refinerDragStart${suffix}.x, __refinerDragStart${suffix}.y);\n`);
        write(`__refinerRequirePointer(__refinerDragStart${suffix}, ${json(action.id)}, "start-position-confirmed");\n`);
        if (scope === 'window') write(`await __refinerRequireResolvedActiveWindow(__refinerWindow${suffix}, ${json(action.id)});\n`);
        write(`await mouse.down({ button: ${json(action.args.button)} });\n`);
        write('try {\n');
        write(`  await mouse.move(__refinerDragEnd${suffix}.x, __refinerDragEnd${suffix}.y, { steps: ${action.args.steps} });\n`);
        write(`  __refinerRequirePointer(__refinerDragEnd${suffix}, ${json(action.id)}, "end-position-confirmed");\n`);
        write('} finally {\n');
        write(`  await mouse.up({ button: ${json(action.args.button)} });\n`);
        write('}\n');
        break;
      }
      case 'wheel': {
        const scope = action.target.kind;
        const variable = scope === 'display' ? `__refinerDisplay${suffix}` : `__refinerWindow${suffix}`;
        if (scope === 'display') write(`const ${variable} = __refinerRequireRecordedDisplayGeometry(__refinerResolveDisplay(${json(displayDescriptor(action))}), ${json(recordedDisplayGeometry(action))}, ${json(action.id)});\n`);
        else {
          write(`const ${variable} = __refinerRequireRecordedWindowGeometry(await __refinerResolveWindow(${json(windowDescriptor(action))}), ${json(recordedWindowGeometry(action))}, ${json(action.id)});\n`);
        }
        write(`const __refinerWheelPoint${suffix} = __refinerPoint(${variable}, ${json(action.position[scope])}, ${json(scope)}, ${json(action.id)});\n`);
        write(`await mouse.move(__refinerWheelPoint${suffix}.x, __refinerWheelPoint${suffix}.y);\n`);
        if (scope === 'window') write(`await __refinerRequireResolvedActiveWindow(__refinerWindow${suffix}, ${json(action.id)});\n`);
        write(`await mouse.wheel({ deltaX: ${action.args.deltaX}, deltaY: ${action.args.deltaY}, steps: ${action.args.steps}, delay: ${action.args.delayMs} });\n`);
        break;
      }
      case 'text':
        write(`await __refinerRequireActiveWindow(${json(windowDescriptor(action))}, ${json(action.id)});\n`);
        write(`await keyboard.type(${json(action.args.text)});\n`);
        break;
      case 'shortcut':
        write(`await __refinerRequireActiveWindow(${json(windowDescriptor(action))}, ${json(action.id)});\n`);
        write(`await keyboard.combination(...${json(action.args.keys)});\n`);
        break;
      case 'key':
        write(`await __refinerRequireActiveWindow(${json(windowDescriptor(action))}, ${json(action.id)});\n`);
        write(`await keyboard.press(${json(action.args.key)});\n`);
        break;
      case 'text-edit': {
        const editable = action.target.editable;
        assert(editable && editable.role && (editable.identifier || editable.name),
          'INVALID_ACTION', `${action.id} text-edit selector is incomplete`);
        const selector = {role: editable.role};
        if (editable.identifier) selector.identifier = editable.identifier;
        else selector.name = editable.name;
        write(`const __refinerTextWindow${suffix} = await __refinerRequireActiveWindow(${json(windowDescriptor(action))}, ${json(action.id)});\n`);
        write(`await __refinerApplyTextEdit(__refinerTextWindow${suffix}, ${json(selector)}, ${json(action.args.textEdit)});\n`);
        break;
      }
      default:
        throw failure('UNSUPPORTED_ACTION', `${action.id} has unsupported kind`);
    }
    const timing = timingRows[index];
    if (timing.delayMs !== null) {
      write(`await sleep(${timing.delayMs}); // recorded gap: ${timing.recordedGapMs}ms\n`);
    }
    compiledActions.push({actionId: action.id, sourceIndex: index + 1, markerLine, strategy, timing});
  }
  return {source, compiledActions, timingRows};
}

function safeActionAudit(action, mapping, compiled) {
  const target = action.target;
  const windowTarget = target.kind === 'window' || target.kind === 'editable' ? target.window : null;
  const displayTarget = target.kind === 'display' ? target.display : null;
  const element = target.element || null;
  const guard = semanticGuardDescriptor(action);
  const point = action.position && action.position[target.kind];
  const selectorFields = guard ? Object.keys(guard.selector).sort() : [];
  const selectorHashes = {};
  if (guard) {
    for (const field of selectorFields) selectorHashes[field] = hashText(guard.selector[field]);
  }
  const hit = element && element.hit;
  const hitMatchesElementIdentity = Boolean(element && hit
    && element.role === hit.role && element.nativeRole === hit.nativeRole
    && element.name === hit.name && element.identifier === hit.identifier
    && element.enabled === hit.enabled
    && JSON.stringify(element.nativeActions) === JSON.stringify(hit.nativeActions));
  const elementPointInsideRecordedBounds = Boolean(element && element.bounds && element.point
    && element.point.offsetX >= 0 && element.point.offsetY >= 0
    && element.point.offsetX < element.bounds.width && element.point.offsetY < element.bounds.height);
  return {
    actionId: action.id,
    sourceIndex: compiled.sourceIndex,
    sourceLine: mapping.line,
    refinedLine: compiled.markerLine,
    kind: action.kind,
    semanticStatus: String(target.semanticStatus || 'unknown'),
    strategy: compiled.strategy,
    sourceEvidence: {
      eventCount: action.source.eventIds.length,
      basisSha256: hashText(action.source.basis || ''),
      sequenceStart: action.timing.sequenceStart,
      sequenceEnd: action.timing.sequenceEnd,
      nativeUnit: action.timing.nativeUnit,
    },
    scopeEvidence: {
      kind: target.kind,
      resolution: target.resolution,
      exactCompositeTarget: true,
      runtimeFallbackAllowed: false,
      applicationIdentityKind: windowTarget ? windowTarget.application.identityKind : null,
      applicationIdentitySha256: windowTarget ? hashText(windowTarget.application.identityValue) : null,
      windowTitleSha256: windowTarget ? hashText(windowTarget.title) : null,
      displayIdSha256: displayTarget ? hashText(displayTarget.id) : null,
      displayHardwareIdSha256: displayTarget ? hashText(displayTarget.hardwareId || '') : null,
      recordedBoundsPresent: Boolean((windowTarget || displayTarget) && Number.isFinite((windowTarget || displayTarget).width || (windowTarget || displayTarget).bounds && (windowTarget || displayTarget).bounds.width)),
      recordedWindowGeometryGuarded: Boolean(windowTarget
        && ['click', 'drag', 'wheel'].includes(action.kind)),
      recordedDisplayGeometryGuarded: Boolean(displayTarget
        && ['click', 'drag', 'wheel'].includes(action.kind)),
      activeWindowGuardedBeforeInput: Boolean(windowTarget),
      activeWindowSnapshotGeometryGuarded: Boolean(windowTarget),
    },
    semanticEvidence: {
      source: element ? element.source : null,
      role: element ? element.role : null,
      nativeRole: element ? element.nativeRole || null : null,
      enabled: element ? element.enabled === true : null,
      nativeActions: element && Array.isArray(element.nativeActions) ? [...element.nativeActions].sort() : [],
      selectorFields,
      selectorFieldHashes: selectorHashes,
      ancestorCount: element && Array.isArray(element.ancestors) ? element.ancestors.length : 0,
      recordedElementBoundsPresent: Boolean(element && element.bounds),
      recordedElementBoundsSpace: element ? element.boundsSpace || 'unlabeled-recording-fact' : null,
      recordedHitMatchesElementIdentity: hitMatchesElementIdentity,
      recordedElementPointInsideBounds: elementPointInsideRecordedBounds,
      recordedElementPoint: element && element.point ? {
        offsetX: element.point.offsetX,
        offsetY: element.point.offsetY,
        xRatio: element.point.xRatio,
        yRatio: element.point.yRatio,
        usedForClick: false,
      } : null,
      currentScreenLogicalBoundsUsed: false,
      guardApplied: Boolean(guard),
      firstClassRuntimeIdentityDescriptor: Boolean(guard),
      runtimeIdentityFields: guard ? [
        'role', 'name', 'identifier', 'nativeRole', 'enabled', 'nativeActions', 'publicActions',
      ] : [],
      nativeActionsMappedToPublicActions: Boolean(guard),
      skipReasonCode: guard ? null : semanticGuardSkipReason(action),
    },
    pointEvidence: point ? {
      basis: `${target.kind}-top-left-offset`,
      coordinateSpace: point.space,
      verified: point.verified === true,
      offsetX: point.offsetX,
      offsetY: point.offsetY,
      recordedElementOffsetPresent: Boolean(element && element.point),
      recordedElementOffsetUsed: false,
    } : null,
    inputPrimitive: ACTION_PRIMITIVES[action.kind],
    timingAfterMs: compiled.timing.delayMs,
    timingPauseBoundary: compiled.timing.pauseBoundary,
  };
}

function chooseOutputPair(sourcePath) {
  const directory = path.dirname(sourcePath);
  const filename = path.basename(sourcePath);
  const stem = filename.endsWith('.recipe.js')
    ? filename.slice(0, -'.recipe.js'.length) : filename.slice(0, -'.js'.length);
  for (let version = 1; version < 10000; version += 1) {
    const suffix = version === 1 ? '' : `.v${version}`;
    const refinedPath = path.join(directory, `${stem}.refined${suffix}.recipe.js`);
    const reportPath = path.join(directory, `${stem}.refinement${suffix}.json`);
    let occupied = false;
    for (const filePath of [refinedPath, reportPath]) {
      try {
        fs.lstatSync(filePath);
        occupied = true;
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
      }
    }
    if (!occupied) return {version, refinedPath, reportPath};
  }
  throw failure('OUTPUT_VERSION_EXHAUSTED', 'no free refinement output pair is available');
}

function writeExclusivePair(refinedPath, refinedBytes, reportPath, reportBytes) {
  let refinedFd;
  let reportFd;
  let refinedCreated = false;
  let reportCreated = false;
  try {
    refinedFd = fs.openSync(refinedPath, 'wx', 0o600);
    refinedCreated = true;
    reportFd = fs.openSync(reportPath, 'wx', 0o600);
    reportCreated = true;
    fs.writeFileSync(refinedFd, refinedBytes);
    fs.writeFileSync(reportFd, reportBytes);
    fs.fsyncSync(refinedFd);
    fs.fsyncSync(reportFd);
  } catch (error) {
    if (reportFd !== undefined) fs.closeSync(reportFd);
    if (refinedFd !== undefined) fs.closeSync(refinedFd);
    reportFd = refinedFd = undefined;
    if (reportCreated) fs.unlinkSync(reportPath);
    if (refinedCreated) fs.unlinkSync(refinedPath);
    throw failure(error && error.code === 'EEXIST' ? 'OUTPUT_OCCUPIED' : 'OUTPUT_WRITE_FAILED',
      'could not exclusively create the refinement output pair');
  } finally {
    if (reportFd !== undefined) fs.closeSync(reportFd);
    if (refinedFd !== undefined) fs.closeSync(refinedFd);
  }
}

function buildRefinement(sourceInput, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const inspected = inspectBundle(sourceInput, {repoRoot});
  const sourcePath = fromRelative(repoRoot, inspected.script.file);
  const actionsDocument = parseJSON(readRegular(fromRelative(repoRoot, inspected.actions.file), 'actionsFile'), 'actionsFile');
  const candidate = parseJSON(readRegular(fromRelative(repoRoot, inspected.candidate.file), 'candidateFile'), 'candidateFile');
  const rawBytes = readRegular(fromRelative(repoRoot, inspected.raw.file), 'rawFile');
  const raw = parseRawEvents(rawBytes);
  const actions = validateActions(actionsDocument, candidate, raw);
  const output = options.output || chooseOutputPair(sourcePath);
  assert(path.dirname(output.refinedPath) === path.dirname(sourcePath)
    && path.dirname(output.reportPath) === path.dirname(sourcePath),
  'ARTIFACT_SCOPE_MISMATCH', 'refinement outputs must stay beside the source script');
  const compiled = compileRefinedScript(actionsDocument, candidate, raw.events);
  const refinedBytes = Buffer.from(compiled.source, 'utf8');
  const sourceBytes = readRegular(sourcePath, 'sourceFile');
  const {
    scanControlFlow, scanDelays, scanInputEffects, scanRuntimeApis,
    scanTargetResolution, maskNonCode,
  } = require('./validate-refinement.js');
  const sourceMasked = maskNonCode(sourceBytes.toString('utf8'));
  const refinedMasked = maskNonCode(compiled.source);
  const sourceApis = scanRuntimeApis(sourceMasked);
  const refinedApis = scanRuntimeApis(refinedMasked);
  const sourceTargetResolution = scanTargetResolution(sourceMasked);
  const refinedTargetResolution = scanTargetResolution(refinedMasked);
  const eligible = actions.filter(action => action.kind === 'click' && action.target
    && action.target.semanticStatus === 'verified' && action.target.element).map(action => action.id);
  const applied = actions.filter(action => Boolean(semanticGuardDescriptor(action))).map(action => action.id);
  const skipped = eligible.filter(id => !applied.includes(id));
  const skippedByReason = {};
  for (const action of actions) {
    const reasonCode = semanticGuardSkipReason(action);
    if (!reasonCode) continue;
    if (!skippedByReason[reasonCode]) skippedByReason[reasonCode] = [];
    skippedByReason[reasonCode].push(action.id);
  }
  const windowPointerActionIds = actions.filter(action => action.target.kind === 'window'
    && ['click', 'drag', 'wheel'].includes(action.kind)).map(action => action.id);
  const displayPointerActionIds = actions.filter(action => action.target.kind === 'display'
    && ['click', 'drag', 'wheel'].includes(action.kind)).map(action => action.id);
  const activeWindowGuardedActionIds = actions.filter(action => action.target.kind === 'window'
    || action.target.kind === 'editable')
    .map(action => action.id);
  const exactCompositeTargetActionIds = actions.map(action => action.id);
  const explicitActionCallIds = actions.map(action => action.id);
  const sourceScopeRelaxationCount = sourceTargetResolution.windowIdentityOnlyCalls
    + sourceTargetResolution.displayAlternativeIdentitySelections;
  const refinedScopeRelaxationCount = refinedTargetResolution.windowIdentityOnlyCalls
    + refinedTargetResolution.displayAlternativeIdentitySelections;
  const report = {
    formatVersion: REPORT_FORMAT,
    recordingId: inspected.recordingId,
    generation: {
      compiler: COMPILER_ID,
      authoritativeActionInput: inspected.actions,
      candidateUsage: ['lineage', 'source-mapping', 'timing-policy'],
      basicScriptUsage: ['lineage-hash', 'candidate-source-mapping', 'static-difference-audit'],
      sourceTemplateUsed: false,
      publicAccessibilityElementScreenLogicalBounds: false,
      qualityGoal: [
        'source-fidelity', 'semantic-evidence', 'fail-closed-geometry-focus',
        'fresh-state', 'explicit-action-auditability',
      ],
    },
    source: {
      script: inspected.script,
      candidate: inspected.candidate,
      actions: inspected.actions,
      manifest: inspected.manifest,
      raw: inspected.raw,
    },
    refined: {file: relative(repoRoot, output.refinedPath), sha256: hash(refinedBytes)},
    actionAudit: actions.map((action, index) => safeActionAudit(
      action, candidate.mappings[index], compiled.compiledActions[index],
    )),
    semanticCoverage: {eligibleActionIds: eligible, appliedActionIds: applied, skippedActionIds: skipped},
    staticAnalysis: {
      runtimeApis: {
        source: sourceApis,
        refined: refinedApis,
        added: refinedApis.filter(name => !sourceApis.includes(name)),
      },
      inputSideEffects: {
        source: scanInputEffects(sourceMasked),
        refined: scanInputEffects(refinedMasked),
      },
      actionPlanInputSideEffects: {
        source: plannedInputSideEffects(actions),
        refined: plannedInputSideEffects(actions),
      },
      controlFlow: {
        source: scanControlFlow(sourceMasked),
        refined: scanControlFlow(refinedMasked),
        refinedFallbackOrRetryAdded: false,
        sourceOnlyScopeRelaxationRemoved: sourceScopeRelaxationCount > 0
          && refinedScopeRelaxationCount === 0,
      },
      targetResolution: {
        source: sourceTargetResolution,
        refined: refinedTargetResolution,
        exactCompositeTargetActionIds,
        runtimeScopeRelaxationUsed: false,
      },
      compilerMatch: true,
      freshStatePerAction: true,
      nativeBoundsUsed: false,
      accessibilityInvokeUsedForRecordedClicks: false,
      quality: {
        exactCompositeTargetActionIds,
        targetScopeRelaxationUsed: false,
        semanticIdentityDescriptorActionIds: applied,
        semanticIdentityRuntimeFields: [
          'role', 'name', 'identifier', 'nativeRole', 'enabled', 'nativeActions', 'publicActions',
        ],
        nativeActionMappingActionIds: applied,
        recordedWindowGeometryGuardActionIds: windowPointerActionIds,
        recordedDisplayGeometryGuardActionIds: displayPointerActionIds,
        activeWindowGuardBeforeInputActionIds: activeWindowGuardedActionIds,
        activeWindowSnapshotGeometryGuardActionIds: activeWindowGuardedActionIds,
        explicitActionCallIds,
        actionInterpreterLoopUsed: false,
        structuredReadableActionDescriptors: true,
        actionIdErrorContext: true,
      },
    },
    timing: {
      delaysMs: scanDelays(refinedMasked),
      afterAction: compiled.timingRows.map(row => row.delayMs),
      pauseBoundaries: compiled.timingRows.map(row => row.pauseBoundary),
    },
    adoptedImprovements: [
      {
        kind: 'exact-composite-target-no-fallback', actionIds: exactCompositeTargetActionIds,
        windowPolicy: 'application-identity-and-exact-title',
        displayPolicy: 'session-id-and-available-hardware-id',
        sourceOnlyScopeRelaxationRemoved: sourceScopeRelaxationCount > 0
          && refinedScopeRelaxationCount === 0,
      },
      ...(applied.length > 0 ? [{
        kind: 'verified-accessibility-identity-guard', actionIds: applied,
        firstClassRuntimeDescriptor: true,
        runtimeIdentityFields: [
          'role', 'name', 'identifier', 'nativeRole', 'enabled', 'nativeActions', 'publicActions',
        ],
        nativeActionsMappedToPublicActions: true,
        physicalInputPreserved: true, pointBasis: 'recorded-window-offset',
      }] : []),
      ...(windowPointerActionIds.length > 0 ? [{
        kind: 'recorded-window-geometry-guard', actionIds: windowPointerActionIds,
        policy: 'fresh-width-height-must-match-recording',
      }] : []),
      ...(displayPointerActionIds.length > 0 ? [{
        kind: 'recorded-display-geometry-guard', actionIds: displayPointerActionIds,
        policy: 'fresh-width-height-must-match-recording',
      }] : []),
      ...(activeWindowGuardedActionIds.length > 0 ? [{
        kind: 'active-window-guard-before-input', actionIds: activeWindowGuardedActionIds,
        policy: 'same-window-id-and-same-snapshot-geometry',
      }] : []),
      {
        kind: 'explicit-actions-first-call-structure', actionIds: explicitActionCallIds,
        actionInterpreterLoopUsed: false,
        structuredReadableActionDescriptors: true,
        actionIdErrorContext: true,
      },
    ],
    skippedImprovements: [
      ...(applied.length > 0 ? [{
        kind: 'fresh-accessibility-element-bounds', actionIds: applied,
        reasonCode: 'PUBLIC_SCREEN_LOGICAL_BOUNDS_UNAVAILABLE',
      }] : []),
      ...Object.entries(skippedByReason).sort(([left], [right]) => left.localeCompare(right))
        .map(([reasonCode, actionIds]) => ({
          kind: 'semantic-identity-guard', actionIds, reasonCode,
        })),
    ],
    staticChecks: {
      sourceLineage: true,
      actionsFirstCompilation: true,
      syntax: true,
      sourceMapping: true,
      targetResolution: true,
      runtimeApis: true,
      inputParameters: true,
      inputSideEffects: true,
      fallbackRetry: true,
      timing: true,
      freshState: true,
      semanticLocators: true,
      quality: true,
      reportPrivacy: true,
    },
    status: {
      generated: 'passed', staticallyReviewed: 'passed', liveVerified: 'not-run',
      qualified: 'not-run', visualVerified: 'not-run',
    },
  };
  return {
    inspected, sourcePath, output, actionsDocument, candidate, rawEvents: raw.events,
    compiled, refinedBytes, report, reportBytes: Buffer.from(JSON.stringify(report, null, 2) + '\n'),
  };
}

function generateRefinement(sourceInput, options = {}) {
  const built = buildRefinement(sourceInput, options);
  writeExclusivePair(
    built.output.refinedPath, built.refinedBytes,
    built.output.reportPath, built.reportBytes,
  );
  let validation;
  try {
    const {validateRefinement} = require('./validate-refinement.js');
    validation = validateRefinement(
      sourceInput,
      relative(path.resolve(options.repoRoot || process.cwd()), built.output.refinedPath),
      relative(path.resolve(options.repoRoot || process.cwd()), built.output.reportPath),
      {repoRoot: path.resolve(options.repoRoot || process.cwd())},
    );
  } catch (error) {
    // These files were exclusively created by this call. Remove only this
    // incomplete pair; pre-existing versions are never opened or touched.
    for (const filePath of [built.output.reportPath, built.output.refinedPath]) {
      try { fs.unlinkSync(filePath); } catch (_) { /* best-effort cleanup of this call only */ }
    }
    throw error;
  }
  return {
    valid: true,
    recordingId: built.inspected.recordingId,
    version: built.output.version,
    refinedFile: relative(path.resolve(options.repoRoot || process.cwd()), built.output.refinedPath),
    reportFile: relative(path.resolve(options.repoRoot || process.cwd()), built.output.reportPath),
    sourceSha256: built.inspected.script.sha256,
    refinedSha256: built.report.refined.sha256,
    actionCount: built.actionsDocument.actions.length,
    semanticApplied: built.report.semanticCoverage.appliedActionIds.length,
    staticValidation: validation.valid,
    status: built.report.status,
  };
}

module.exports = {
  ACTION_PRIMITIVES,
  COMPILER_ID,
  REPORT_FORMAT,
  buildRefinement,
  chooseOutputPair,
  compileRefinedScript,
  computeTiming,
  generateRefinement,
  semanticGuardDescriptor,
  strategyFor,
  plannedInputSideEffects,
  validateActions,
  writeExclusivePair,
};

if (require.main === module) {
  try {
    const result = generateRefinement(process.argv[2]);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({
      valid: false,
      code: error && error.code ? error.code : 'GENERATION_FAILED',
      message: error && error.message ? error.message : String(error),
    }) + '\n');
    process.exitCode = 1;
  }
}
