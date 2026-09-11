#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {inspectBundle} = require('./inspect-recorder-bundle.js');

const REPORT_FORMAT = 'opendesk.recorder.refinement/v5';
const PUBLIC_ACTION_BY_NATIVE = Object.freeze({AXPress: 'invoke', invoke: 'invoke'});
const ACTION_MARKER = /^\s*\/\/\s*recorder-refinement:\s*action=([A-Za-z0-9._-]+)\s+strategy=([a-z0-9-]+)\s*$/;
const RUNTIME_ROOTS = new Set([
  'Accessibility', 'App', 'Audio', 'Clipboard', 'Command', 'Dialog', 'Events',
  'Execution', 'File', 'Geometry', 'HTTP', 'ImageColor', 'Notifications', 'Page',
  'Path', 'Recorder', 'Scheduler', 'Screen', 'Sound', 'Storage', 'System', 'UI',
  'Vision', 'clipboard', 'command', 'dialog', 'environment', 'events', 'file',
  'globalShortcut', 'http', 'keyboard', 'mouse', 'notify', 'page', 'path',
  'scheduler', 'storage', 'system', 'touchscreen', 'window',
]);
const STANDALONE_RUNTIME_CALLS = new Set(['delay', 'sleep', 'sleepSeconds']);
const ALLOWED_ADDED_RUNTIME_APIS = new Set([
  'Accessibility.find', 'Accessibility.getCapabilities', 'Accessibility.read', 'Accessibility.release',
]);
const INPUT_EFFECTS = [
  'Accessibility.perform',
  'System.sleep',
  'UI.setValue',
  'UI.tapImage',
  'UI.tapMenuItem',
  'UI.tapText',
  'UI.tapTexts',
  'keyboard.combination',
  'keyboard.down',
  'keyboard.press',
  'keyboard.type',
  'keyboard.up',
  'mouse.click',
  'mouse.clickForPID',
  'mouse.clickPoint',
  'mouse.down',
  'mouse.move',
  'mouse.up',
  'mouse.wheel',
  'touchscreen.tap',
];
const SOURCE_ACTION_CALL = {
  click: 'mouse.clickPoint',
  key: 'keyboard.press',
  shortcut: 'keyboard.combination',
  text: 'keyboard.type',
  'text-edit': '__recorderApplyTextEdit',
  wheel: 'mouse.wheel',
};
const ACTION_PRIMITIVES = Object.freeze({
  click: ['mouse.clickPoint'],
  drag: ['mouse.move', 'mouse.down', 'mouse.move', 'mouse.up'],
  wheel: ['mouse.move', 'mouse.wheel'],
  text: ['keyboard.type'],
  'text-edit': ['Accessibility.perform'],
  shortcut: ['keyboard.combination'],
  key: ['keyboard.press'],
});
const FORBIDDEN_REPORT_KEYS = new Set([
  'args', 'axValue', 'eventIds', 'events', 'insertText', 'keyboardText', 'rawBody',
  'rawEvents', 'sourceAction', 'text', 'value',
]);

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
    assert(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_JSON', `${label} must contain an object`);
    return value;
  } catch (error) {
    if (error && error.code) throw error;
    throw failure('INVALID_JSON', `${label} is not valid JSON`);
  }
}

function relative(repoRoot, filePath) {
  return './' + path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function resolveArtifact(repoRoot, input, label, suffix) {
  assert(typeof input === 'string' && input.length > 0, 'INVALID_ARGUMENT', `${label} is required`);
  assert(!/[\x00-\x1f\x7f`]/.test(input), 'INVALID_ARGUMENT', `${label} contains unsafe characters`);
  const filePath = path.resolve(repoRoot, input.replace(/\\/g, path.sep));
  const rel = path.relative(repoRoot, filePath);
  assert(rel && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel),
    'PATH_OUTSIDE_REPOSITORY', `${label} must stay within the current repository`);
  assert(filePath.endsWith(suffix), 'INVALID_ARTIFACT_PATH', `${label} must end with ${suffix}`);
  return filePath;
}

function assertArtifactPair(sourcePath, refinedPath, reportPath) {
  const filename = path.basename(sourcePath);
  const stem = filename.endsWith('.recipe.js')
    ? filename.slice(0, -'.recipe.js'.length) : filename.slice(0, -'.js'.length);
  const refinedMatch = path.basename(refinedPath).match(
    new RegExp(`^${escapeRegex(stem)}\\.refined(?:\\.v([2-9]|[1-9][0-9]+))?\\.recipe\\.js$`),
  );
  const reportMatch = path.basename(reportPath).match(
    new RegExp(`^${escapeRegex(stem)}\\.refinement(?:\\.v([2-9]|[1-9][0-9]+))?\\.json$`),
  );
  assert(refinedMatch && reportMatch && (refinedMatch[1] || '') === (reportMatch[1] || ''),
    'ARTIFACT_VERSION_MISMATCH', 'refined script and report must use the same valid output version');
  return refinedMatch[1] ? Number(refinedMatch[1]) : 1;
}

// Mask strings and comments while preserving line breaks and token positions. This is
// intentionally a conservative lexical pass; vm.Script below remains the syntax oracle.
function maskNonCode(source) {
  const chars = Array.from(source);
  let state = 'code';
  let escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];
    if (state === 'code') {
      if (char === "'") state = 'single';
      else if (char === '"') state = 'double';
      else if (char === '`') state = 'template';
      else if (char === '/' && next === '/') {
        chars[index] = chars[index + 1] = ' ';
        index += 1;
        state = 'line-comment';
        continue;
      } else if (char === '/' && next === '*') {
        chars[index] = chars[index + 1] = ' ';
        index += 1;
        state = 'block-comment';
        continue;
      } else {
        continue;
      }
      chars[index] = ' ';
      escaped = false;
      continue;
    }
    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') state = 'code';
      else chars[index] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        chars[index] = chars[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (char !== '\n' && char !== '\r') {
        chars[index] = ' ';
      }
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (state !== 'template') escaped = false;
      continue;
    }
    chars[index] = ' ';
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if ((state === 'single' && char === "'") ||
        (state === 'double' && char === '"') ||
        (state === 'template' && char === '`')) {
      state = 'code';
    }
  }
  return chars.join('');
}

function syntaxCheck(source, label) {
  try {
    new vm.Script(`(async function () {\n${source}\n})`, {filename: label});
  } catch (error) {
    throw failure('INVALID_JAVASCRIPT', `${label} does not parse: ${error.message}`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countCalls(masked, name) {
  const expression = new RegExp(`\\b${escapeRegex(name)}\\s*\\(`, 'g');
  return Array.from(masked.matchAll(expression)).length;
}

function functionBlock(source, name) {
  const masked = maskNonCode(source);
  const expression = new RegExp(`(?:async\\s+)?function\\s+${escapeRegex(name)}\\s*\\([^)]*\\)\\s*\\{`);
  const match = expression.exec(masked);
  if (!match) return '';
  const open = masked.indexOf('{', match.index);
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '{') depth += 1;
    else if (masked[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return '';
}

function scanRuntimeApis(masked) {
  const result = new Set();
  for (const match of masked.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (RUNTIME_ROOTS.has(match[1])) result.add(`${match[1]}.${match[2]}`);
  }
  for (const name of STANDALONE_RUNTIME_CALLS) {
    if (countCalls(masked, name) > 0) result.add(name);
  }
  return Array.from(result).sort();
}

function scanInputEffects(masked) {
  const result = {};
  for (const name of INPUT_EFFECTS) {
    const count = countCalls(masked, name);
    if (count > 0) result[name] = count;
  }
  return result;
}

function scanDelays(masked) {
  const result = [];
  for (const match of masked.matchAll(/\b(?:delay|sleep|sleepSeconds)\s*\(\s*(\d+(?:\.\d+)?)\s*\)/g)) {
    result.push(Number(match[1]));
  }
  return result;
}

function scanControlFlow(masked) {
  return {
    catchBlocks: Array.from(masked.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)).length,
    loops: Array.from(masked.matchAll(/\b(?:for|while)\s*\(|\bdo\s*\{/g)).length,
    retryWaitCalls: Array.from(masked.matchAll(/\b(?:setInterval|window\.wait|page\.waitForFunction)\s*\(/g)).length,
  };
}

function scanTargetResolution(masked) {
  return {
    windowIdentityOnlyCalls: Array.from(masked.matchAll(
      /\bwindow\.get\s*\(\s*identity\s*\)/g,
    )).length,
    displayAlternativeIdentitySelections: Array.from(masked.matchAll(
      /\bidMatches\.length\s*===\s*1\s*\?\s*idMatches\s*:\s*\(\s*hardwareMatches\.length\s*===\s*1\s*\?\s*hardwareMatches/g,
    )).length,
  };
}

function parseMarkers(source) {
  const markers = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(ACTION_MARKER);
    if (match) markers.push({actionId: match[1], strategy: match[2], line: index + 1, lineIndex: index});
  }
  return {markers, lines};
}

function sameJSON(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function refinedActionCall(action, strategy) {
  if (action.kind === 'click') {
    if (strategy === 'display-offset') return '__refinerClickDisplayAction';
    if (strategy === 'verified-accessibility-guarded-window-offset') {
      return '__refinerClickVerifiedWindowAction';
    }
    return '__refinerClickWindowAction';
  }
  return action.kind === 'text-edit' ? '__refinerApplyTextEdit' : SOURCE_ACTION_CALL[action.kind];
}

function plannedInputSideEffects(actions) {
  const counts = {};
  for (const action of actions) {
    for (const primitive of ACTION_PRIMITIVES[action.kind] || []) {
      counts[primitive] = (counts[primitive] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function decodeJSONString(literal, actionId) {
  try {
    return JSON.parse(literal);
  } catch (_) {
    throw failure('ACTION_ARGUMENT_MISMATCH', `${actionId} must use a JSON string literal for recorded input`);
  }
}

function assertRecordedArguments(block, action) {
  if (action.kind === 'click') {
    const match = block.match(/\bmouse\.clickPoint\s*\([\s\S]*?,\s*\{\s*button\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*clickCount\s*:\s*(\d+)\s*\}\s*\)/);
    assert(match, 'ACTION_ARGUMENT_MISMATCH', `${action.id} click options are not statically auditable`);
    assert(action.args && decodeJSONString(match[1], action.id) === action.args.button
      && Number(match[2]) === action.args.clickCount,
    'ACTION_ARGUMENT_MISMATCH', `${action.id} changed the recorded click button or count`);
  } else if (action.kind === 'text') {
    const match = block.match(/\bkeyboard\.type\s*\(\s*("(?:[^"\\]|\\.)*")\s*\)/);
    assert(match, 'ACTION_ARGUMENT_MISMATCH', `${action.id} keyboard input is not statically auditable`);
    assert(action.args && decodeJSONString(match[1], action.id) === action.args.text,
      'ACTION_ARGUMENT_MISMATCH', `${action.id} changed the recorded keyboard input`);
  } else if (action.kind === 'key') {
    const match = block.match(/\bkeyboard\.press\s*\(\s*("(?:[^"\\]|\\.)*")\s*\)/);
    assert(match && action.args && decodeJSONString(match[1], action.id) === action.args.key,
      'ACTION_ARGUMENT_MISMATCH', `${action.id} changed the recorded key`);
  } else if (action.kind === 'shortcut') {
    const match = block.match(/\bkeyboard\.combination\s*\(\s*\.\.\.(\[[^\n;]*\])\s*\)/);
    let keys;
    try { keys = match && JSON.parse(match[1]); } catch (_) { keys = null; }
    assert(match && action.args && sameJSON(keys, action.args.keys),
      'ACTION_ARGUMENT_MISMATCH', `${action.id} changed the recorded shortcut keys`);
  } else if (action.kind === 'wheel') {
    const match = block.match(/\bmouse\.wheel\s*\(\s*\{\s*deltaX\s*:\s*(-?\d+)\s*,\s*deltaY\s*:\s*(-?\d+)\s*,\s*steps\s*:\s*(\d+)\s*,\s*delay\s*:\s*(\d+)\s*\}\s*\)/);
    assert(match && action.args && Number(match[1]) === action.args.deltaX
      && Number(match[2]) === action.args.deltaY && Number(match[3]) === action.args.steps
      && Number(match[4]) === action.args.delayMs,
    'ACTION_ARGUMENT_MISMATCH', `${action.id} changed the recorded wheel arguments`);
  } else if (action.kind === 'drag') {
    const down = block.match(/\bmouse\.down\s*\(\s*\{\s*button\s*:\s*("(?:[^"\\]|\\.)*")\s*\}\s*\)/);
    const up = block.match(/\bmouse\.up\s*\(\s*\{\s*button\s*:\s*("(?:[^"\\]|\\.)*")\s*\}\s*\)/);
    const move = block.match(/\bmouse\.move\s*\([^\n;]*\{\s*steps\s*:\s*(\d+)\s*\}\s*\)/);
    assert(down && up && move && action.args
      && decodeJSONString(down[1], action.id) === action.args.button
      && decodeJSONString(up[1], action.id) === action.args.button
      && Number(move[1]) === action.args.steps,
    'ACTION_ARGUMENT_MISMATCH', `${action.id} changed the recorded drag arguments`);
  }
}

function assertNoSensitiveReportKeys(value, pointer = '$') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveReportKeys(item, `${pointer}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert(!FORBIDDEN_REPORT_KEYS.has(key), 'REPORT_PRIVACY_VIOLATION', `${pointer}.${key} is forbidden in a refinement report`);
    assertNoSensitiveReportKeys(child, `${pointer}.${key}`);
  }
}

function validateRefinement(sourceInput, refinedInput, reportInput, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const inspected = inspectBundle(sourceInput, {repoRoot});
  const sourcePath = path.resolve(repoRoot, inspected.script.file.slice(2));
  const refinedPath = resolveArtifact(repoRoot, refinedInput, 'refinedFile', '.js');
  const reportPath = resolveArtifact(repoRoot, reportInput, 'reportFile', '.json');
  const generatedDir = path.dirname(sourcePath);
  assert(path.dirname(refinedPath) === generatedDir && path.dirname(reportPath) === generatedDir,
    'ARTIFACT_SCOPE_MISMATCH', 'refinedFile and reportFile must be siblings of the source script');
  assert(refinedPath !== sourcePath, 'ARTIFACT_SCOPE_MISMATCH', 'refinedFile must not overwrite the source script');
  const outputVersion = assertArtifactPair(sourcePath, refinedPath, reportPath);

  const sourceBytes = readRegular(sourcePath, 'sourceFile');
  const refinedBytes = readRegular(refinedPath, 'refinedFile');
  const reportBytes = readRegular(reportPath, 'reportFile');
  const source = sourceBytes.toString('utf8');
  const refined = refinedBytes.toString('utf8');
  const sourceLines = source.split(/\r?\n/);
  const report = parseJSON(reportBytes, 'reportFile');
  const actions = parseJSON(readRegular(path.resolve(repoRoot, inspected.actions.file.slice(2)), 'actionsFile'), 'actionsFile');
  const candidate = parseJSON(readRegular(path.resolve(repoRoot, inspected.candidate.file.slice(2)), 'candidateFile'), 'candidateFile');

  // Recompile from the authoritative actions/raw/candidate lineage. The source
  // recipe is deliberately excluded from this expected-code path and is used
  // only by the independent static-difference checks below.
  const {buildRefinement} = require('./generate-refinement.js');
  const expected = buildRefinement(sourceInput, {
    repoRoot,
    output: {version: outputVersion, refinedPath, reportPath},
  });
  assert(refinedBytes.equals(expected.refinedBytes), 'ACTIONS_FIRST_COMPILER_MISMATCH',
    'refined JavaScript does not exactly match a fresh actions-first compilation');

  assert(report.formatVersion === REPORT_FORMAT && report.recordingId === inspected.recordingId,
    'REPORT_IDENTITY_MISMATCH', 'report format or recording identity does not match the inspected bundle');
  assertNoSensitiveReportKeys(report);
  assert(sameJSON(report, expected.report), 'REPORT_COMPILER_MISMATCH',
    'report does not exactly match the deterministic actions-first static report');

  const expectedSource = {
    script: inspected.script,
    candidate: inspected.candidate,
    actions: inspected.actions,
    manifest: inspected.manifest,
    raw: inspected.raw,
  };
  assert(sameJSON(report.source, expectedSource), 'REPORT_LINEAGE_MISMATCH', 'report source lineage does not match the inspected bundle');
  assert(report.refined && report.refined.file === relative(repoRoot, refinedPath)
    && report.refined.sha256 === hash(refinedBytes),
  'REFINED_HASH_MISMATCH', 'report refined file or hash does not match actual bytes');

  syntaxCheck(source, inspected.script.file);
  syntaxCheck(refined, relative(repoRoot, refinedPath));
  const sourceMasked = maskNonCode(source);
  const refinedMasked = maskNonCode(refined);
  assert(!/\bnativeBounds\b/.test(refinedMasked), 'UNSAFE_COORDINATE_CONVERSION',
    'refined JavaScript must not use Accessibility nativeBounds as mouse coordinates');
  const sourceApis = scanRuntimeApis(sourceMasked);
  const refinedApis = scanRuntimeApis(refinedMasked);
  const addedApis = refinedApis.filter(name => !sourceApis.includes(name));
  const sourceEffects = scanInputEffects(sourceMasked);
  const refinedEffects = scanInputEffects(refinedMasked);
  const sourceControl = scanControlFlow(sourceMasked);
  const refinedControl = scanControlFlow(refinedMasked);
  const sourceTargetResolution = scanTargetResolution(sourceMasked);
  const refinedTargetResolution = scanTargetResolution(refinedMasked);
  const sourceDelays = scanDelays(sourceMasked);
  const refinedDelays = scanDelays(refinedMasked);
  const actionRows = Array.isArray(actions.actions) ? actions.actions : [];
  const plannedEffects = plannedInputSideEffects(actionRows);

  assert(report.staticAnalysis && sameJSON(report.staticAnalysis.runtimeApis, {
    source: sourceApis, refined: refinedApis, added: addedApis,
  }), 'RUNTIME_API_MISMATCH', 'reported Runtime API sets do not match the scripts');
  assert(addedApis.every(name => ALLOWED_ADDED_RUNTIME_APIS.has(name)),
    'RUNTIME_API_DRIFT', 'refinement added a Runtime API outside the semantic observation allowlist');
  assert(sameJSON(report.staticAnalysis.inputSideEffects, {
    source: sourceEffects, refined: refinedEffects,
  }), 'INPUT_EFFECT_MISMATCH', 'reported input side effects do not match the scripts');
  assert(sameJSON(report.staticAnalysis.actionPlanInputSideEffects, {
    source: plannedEffects, refined: plannedEffects,
  }), 'INPUT_EFFECT_DRIFT', 'actions-first planned input side effects do not preserve every source action primitive');
  assert(sameJSON(report.staticAnalysis.controlFlow, {
    source: sourceControl, refined: refinedControl,
    refinedFallbackOrRetryAdded: false,
    sourceOnlyScopeRelaxationRemoved:
      sourceTargetResolution.windowIdentityOnlyCalls
        + sourceTargetResolution.displayAlternativeIdentitySelections > 0
      && refinedTargetResolution.windowIdentityOnlyCalls
        + refinedTargetResolution.displayAlternativeIdentitySelections === 0,
  }), 'CONTROL_FLOW_MISMATCH', 'reported fallback/retry control-flow counts do not match the scripts');
  assert(refinedControl.catchBlocks === 0 && refinedControl.retryWaitCalls === 0,
    'FALLBACK_RETRY_DRIFT', 'refinement introduced a catch fallback or retry/wait call');
  const exactCompositeTargetActionIds = actionRows.map(action => action.id);
  assert(report.staticAnalysis.targetResolution && sameJSON(report.staticAnalysis.targetResolution, {
    source: sourceTargetResolution,
    refined: refinedTargetResolution,
    exactCompositeTargetActionIds,
    runtimeScopeRelaxationUsed: false,
  }), 'TARGET_RESOLUTION_MISMATCH', 'reported target resolution does not match the scripts and actions');
  assert(refinedTargetResolution.windowIdentityOnlyCalls === 0
    && refinedTargetResolution.displayAlternativeIdentitySelections === 0,
  'TARGET_SCOPE_RELAXATION', 'refinement contains a runtime target-scope relaxation');
  const windowResolver = functionBlock(refined, '__refinerResolveWindow');
  assert(windowResolver
    && countCalls(maskNonCode(windowResolver), 'window.get') === 1
    && /\bwindow\.get\s*\(\s*\{\s*\.\.\.identity\s*,\s*title\s*:\s*target\.title\s*\}\s*\)/.test(maskNonCode(windowResolver))
    && !/\bcatch\b/.test(maskNonCode(windowResolver)),
  'TARGET_SCOPE_RELAXATION', 'window resolver must use one exact application-identity and title query');
  if (actionRows.some(action => action.target.kind === 'display')) {
    const displayResolver = functionBlock(refined, '__refinerResolveDisplay');
    assert(displayResolver
      && /String\s*\(\s*row\.id\s*\|\|\s*\)\s*===\s*target\.id/.test(maskNonCode(displayResolver))
      && /!\s*target\.hardwareId\s*\|\|\s*String\s*\(\s*row\.hardwareId\s*\|\|\s*\)\s*===\s*target\.hardwareId/.test(maskNonCode(displayResolver)),
    'TARGET_SCOPE_RELAXATION', 'display resolver must AND-match ID and available hardware ID');
  }
  const activeWindowGuard = functionBlock(refined, '__refinerRequireResolvedActiveWindow');
  assert(activeWindowGuard
    && activeWindowGuard.includes('String(active.id) === String(expected.id)')
    && activeWindowGuard.includes('Number(active.x) === Number(expected.x)')
    && activeWindowGuard.includes('Number(active.y) === Number(expected.y)')
    && activeWindowGuard.includes('Number(active.width) === Number(expected.width)')
    && activeWindowGuard.includes('Number(active.height) === Number(expected.height)')
    && !activeWindowGuard.includes('Number(active.pid) === Number(expected.pid)'),
  'FRESH_STATE_MISMATCH', 'active-window guard must match exact window ID and action snapshot geometry');
  assert(sameJSON(sourceDelays, refinedDelays), 'TIMING_DRIFT', 'refinement changed fixed timing call literals or order');
  assert(report.timing && sameJSON(report.timing.delaysMs, refinedDelays),
    'TIMING_REPORT_MISMATCH', 'reported timing does not match the refined script');

  const sourceMappings = Array.isArray(candidate.mappings) ? candidate.mappings : [];
  const {markers, lines} = parseMarkers(refined);
  const audits = Array.isArray(report.actionAudit) ? report.actionAudit : [];
  assert(markers.length === actionRows.length && audits.length === actionRows.length,
    'ACTION_MAPPING_MISMATCH', 'markers and actionAudit must cover every source action exactly once');
  for (let index = 0; index < actionRows.length; index += 1) {
    const action = actionRows[index];
    const marker = markers[index];
    const audit = audits[index];
    const sourceMapping = sourceMappings[index];
    assert(action && marker.actionId === action.id && audit && audit.actionId === action.id,
      'ACTION_MAPPING_MISMATCH', `action ${index + 1} is missing, duplicated, or reordered`);
    assert(audit.sourceIndex === index + 1 && audit.sourceLine === sourceMapping.line
      && audit.refinedLine === marker.line && audit.kind === action.kind
      && audit.semanticStatus === String(action.target && action.target.semanticStatus || 'unknown')
      && audit.strategy === marker.strategy,
    'ACTION_AUDIT_MISMATCH', `action audit metadata does not match ${action.id}`);

    const nextLine = index + 1 < markers.length ? markers[index + 1].lineIndex : lines.length;
    const rawBlock = lines.slice(marker.lineIndex + 1, nextLine).join('\n');
    const block = maskNonCode(rawBlock);
    const nextSourceLine = index + 1 < sourceMappings.length
      ? sourceMappings[index + 1].line - 1
      : sourceLines.length;
    const sourceBlock = maskNonCode(sourceLines.slice(sourceMapping.line - 1, nextSourceLine).join('\n'));
    const sourceCall = SOURCE_ACTION_CALL[action.kind];
    const refinedCall = refinedActionCall(action, marker.strategy);
    if (sourceCall && refinedCall) {
      assert(countCalls(sourceBlock, sourceCall) === 1, 'SOURCE_MAPPING_MISMATCH',
        `${action.id} candidate sourceLine does not map to exactly one ${sourceCall} call`);
      assert(countCalls(block, refinedCall) === 1, 'ACTION_EFFECT_MAPPING_MISMATCH',
        `${action.id} must contain exactly one ${refinedCall} call in its mapped block`);
    }
    assertRecordedArguments(sourceLines.slice(sourceMapping.line - 1, nextSourceLine).join('\n'), action);
    const expectedDelay = expected.compiled.timingRows[index].delayMs;
    assert(audit.timingAfterMs === expectedDelay, 'TIMING_REPORT_MISMATCH',
      `${action.id} timingAfterMs does not match the preserved timing sequence`);
    if (action.target.kind === 'window' || action.target.kind === 'editable') {
      const application = action.target.window.application;
      assert(rawBlock.includes(JSON.stringify(application.identityValue))
        && rawBlock.includes(JSON.stringify(action.target.window.title)),
      'TARGET_RESOLUTION_MISMATCH', `${action.id} omits part of its exact window target descriptor`);
    } else if (action.target.kind === 'display') {
      assert(rawBlock.includes(JSON.stringify(String(action.target.display.id)))
        && (!action.target.display.hardwareId
          || rawBlock.includes(JSON.stringify(action.target.display.hardwareId))),
      'TARGET_RESOLUTION_MISMATCH', `${action.id} omits part of its exact display target descriptor`);
    }
    if (marker.strategy.startsWith('verified-accessibility-')) {
      assert(countCalls(block, '__refinerClickVerifiedWindowAction') === 1,
        'SEMANTIC_LOCATOR_MISMATCH', `${action.id} does not invoke its verified semantic click contract exactly once`);
      const element = action.target && action.target.element;
      assert(element && element.role === 'button' && element.enabled === true,
        'SEMANTIC_LOCATOR_MISMATCH', `${action.id} is not eligible for a verified single-click guard`);
      for (const field of ['role', 'name', 'identifier', 'nativeRole']) {
        assert(typeof element[field] === 'string' && element[field].length > 0
          && rawBlock.includes(`${JSON.stringify(field)}:${JSON.stringify(element[field])}`),
        'SEMANTIC_LOCATOR_MISMATCH', `${action.id} omits recorded ${field} from its runtime identity descriptor`);
      }
      const publicActions = Array.from(new Set(
        element.nativeActions.map(name => PUBLIC_ACTION_BY_NATIVE[name]),
      )).sort();
      assert(publicActions.length > 0 && publicActions.every(Boolean)
        && publicActions.includes('invoke')
        && rawBlock.includes(`"enabled":true`)
        && rawBlock.includes(`"nativeActions":${JSON.stringify(element.nativeActions)}`)
        && rawBlock.includes(`"publicActions":${JSON.stringify(publicActions)}`),
      'SEMANTIC_LOCATOR_MISMATCH', `${action.id} omits enabled or native-to-public action identity evidence`);
    }
    if (action.kind === 'click') {
      assert(countCalls(block, 'mouse.clickForPID') === 0
        && countCalls(block, 'Accessibility.perform') === 0,
      'ACTION_EFFECT_MAPPING_MISMATCH', `${action.id} replaced a physical click with a native invoke`);
      if (action.target.kind === 'window') {
        const expectedHelper = marker.strategy.startsWith('verified-accessibility-')
          ? '__refinerClickVerifiedWindowAction' : '__refinerClickWindowAction';
        assert(countCalls(block, expectedHelper) === 1,
          'FRESH_STATE_MISMATCH', `${action.id} must compile to one fresh window action helper call`);
      } else {
        assert(countCalls(block, '__refinerClickDisplayAction') === 1,
          'FRESH_STATE_MISMATCH', `${action.id} must compile to one fresh display action helper call`);
      }
    }
    if (action.target.kind === 'window' && (action.kind === 'drag' || action.kind === 'wheel')) {
      assert(countCalls(block, '__refinerRequireRecordedWindowGeometry') === 1
        && countCalls(block, '__refinerRequireResolvedActiveWindow') === 1,
      'FRESH_STATE_MISMATCH', `${action.id} must guard recorded window geometry and active-window identity before input`);
    }
    if (action.target.kind === 'display' && ['click', 'drag', 'wheel'].includes(action.kind)) {
      const displayGeometryGuarded = action.kind === 'click'
        ? countCalls(block, '__refinerClickDisplayAction') === 1
        : countCalls(block, '__refinerRequireRecordedDisplayGeometry') === 1;
      assert(displayGeometryGuarded,
        'FRESH_STATE_MISMATCH', `${action.id} must guard recorded display geometry before input`);
    }
  }

  const eligible = actionRows.filter(action => action && action.kind === 'click'
    && action.target && action.target.semanticStatus === 'verified' && action.target.element)
    .map(action => action.id);
  const applied = audits.filter(audit => String(audit.strategy || '').startsWith('verified-accessibility-'))
    .map(audit => audit.actionId);
  const skipped = eligible.filter(id => !applied.includes(id));
  assert(report.semanticCoverage && sameJSON(report.semanticCoverage, {
    eligibleActionIds: eligible,
    appliedActionIds: applied,
    skippedActionIds: skipped,
  }), 'SEMANTIC_COVERAGE_MISMATCH', 'semantic locator coverage does not match actions and strategies');
  if (applied.length > 0) {
    for (const name of ['Accessibility.find', 'Accessibility.read', 'Accessibility.release']) {
      assert(refinedApis.includes(name), 'SEMANTIC_LOCATOR_MISMATCH', `semantic strategies require ${name}`);
    }
    const helper = functionBlock(refined, '__refinerClickVerifiedWindowAction');
    assert(helper
      && helper.indexOf('__refinerRequireRecordedWindowGeometry') < helper.indexOf('__refinerGuardVerifiedElement')
      && helper.indexOf('__refinerGuardVerifiedElement') < helper.indexOf('__refinerPoint')
      && helper.indexOf('__refinerPoint') < helper.indexOf('__refinerRequireResolvedActiveWindow')
      && helper.indexOf('__refinerRequireResolvedActiveWindow') < helper.indexOf('mouse.clickPoint'),
    'SEMANTIC_LOCATOR_MISMATCH', 'verified click helper must order geometry, semantic, point, active-window, then physical input checks');
    const guardHelper = functionBlock(refined, '__refinerGuardVerifiedElement');
    assert(guardHelper
      && guardHelper.includes('descriptor.expected.enabled')
      && guardHelper.includes('descriptor.expected.nativeActions')
      && guardHelper.includes('descriptor.expected.publicActions')
      && guardHelper.includes('current.actions'),
    'SEMANTIC_LOCATOR_MISMATCH', 'verified element helper must consume the complete runtime identity descriptor');
  }

  const windowPointerActionIds = actionRows.filter(action => action.target.kind === 'window'
    && ['click', 'drag', 'wheel'].includes(action.kind)).map(action => action.id);
  const displayPointerActionIds = actionRows.filter(action => action.target.kind === 'display'
    && ['click', 'drag', 'wheel'].includes(action.kind)).map(action => action.id);
  const activeWindowGuardedActionIds = actionRows.filter(action => action.target.kind === 'window'
    || action.target.kind === 'editable')
    .map(action => action.id);
  const explicitActionCallIds = actionRows.map(action => action.id);
  assert(report.staticAnalysis && sameJSON(report.staticAnalysis.quality, {
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
  }), 'QUALITY_REPORT_MISMATCH', 'reported semantic/geometry/focus/action-call quality does not match actions');
  if (windowPointerActionIds.length > 0) {
    assert(functionBlock(refined, '__refinerRequireRecordedWindowGeometry'),
      'FRESH_STATE_MISMATCH', 'window-relative pointer actions require an exact recorded geometry guard');
  }
  if (displayPointerActionIds.length > 0) {
    assert(functionBlock(refined, '__refinerRequireRecordedDisplayGeometry'),
      'FRESH_STATE_MISMATCH', 'display-relative pointer actions require an exact recorded geometry guard');
    if (actionRows.some(action => action.kind === 'click' && action.target.kind === 'display')) {
      const displayClickHelper = functionBlock(refined, '__refinerClickDisplayAction');
      assert(displayClickHelper
        && displayClickHelper.indexOf('__refinerRequireRecordedDisplayGeometry')
          < displayClickHelper.indexOf('__refinerPoint')
        && displayClickHelper.indexOf('__refinerPoint')
          < displayClickHelper.indexOf('mouse.clickPoint'),
      'FRESH_STATE_MISMATCH', 'display click helper must order geometry, point, then physical input');
    }
  }

  const checks = report.staticChecks || {};
  for (const name of [
    'sourceLineage', 'actionsFirstCompilation', 'syntax', 'sourceMapping', 'runtimeApis',
    'inputParameters', 'inputSideEffects', 'targetResolution', 'fallbackRetry', 'timing', 'freshState',
    'semanticLocators', 'quality', 'reportPrivacy',
  ]) {
    assert(checks[name] === true, 'STATIC_CHECK_STATUS_INVALID', `staticChecks.${name} must be true`);
  }
  assert(report.status && report.status.generated === 'passed'
    && report.status.staticallyReviewed === 'passed'
    && report.status.liveVerified === 'not-run'
    && report.status.qualified === 'not-run'
    && report.status.visualVerified === 'not-run',
  'STATUS_INVALID', 'report execution status is invalid for a static refinement');

  return {
    valid: true,
    recordingId: inspected.recordingId,
    sourceSha256: inspected.script.sha256,
    refinedSha256: hash(refinedBytes),
    actionCount: actionRows.length,
    semanticEligible: eligible.length,
    semanticApplied: applied.length,
    runtimeApis: {source: sourceApis, refined: refinedApis, added: addedApis},
    inputSideEffects: {source: sourceEffects, refined: refinedEffects},
    plannedInputSideEffects: {source: plannedEffects, refined: plannedEffects},
    timingDelaysMs: refinedDelays,
    status: report.status,
  };
}

module.exports = {
  maskNonCode,
  scanControlFlow,
  scanDelays,
  scanInputEffects,
  scanRuntimeApis,
  scanTargetResolution,
  validateRefinement,
};

if (require.main === module) {
  try {
    const result = validateRefinement(process.argv[2], process.argv[3], process.argv[4]);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({
      valid: false,
      code: error && error.code ? error.code : 'VALIDATION_FAILED',
      message: error && error.message ? error.message : String(error),
    }) + '\n');
    process.exitCode = 1;
  }
}
