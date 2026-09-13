'use strict';

// Qualification-only external actor. It changes Calculator state independently
// so calculator-add.js must detect drift and stop before pressing plus.

const CALCULATOR = Object.freeze({
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
  width: 232,
  height: 321,
});

function requireExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(name + ' fields do not match the qualification contract');
  }
}

function requireJSONInteger(value, name) {
  let normalized = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const hostNumberKeys = ['Float64', 'Int64', 'String'];
    const isHostJSONNumber = JSON.stringify(keys) === JSON.stringify(hostNumberKeys)
      && hostNumberKeys.every((key) => typeof value[key] === 'function');
    if (!isHostJSONNumber) throw new Error(name + ' must be an integer');
    const raw = String(value);
    if (!/^-?(?:0|[1-9]\d*)$/.test(raw)) throw new Error(name + ' must be an integer');
    normalized = Number(raw);
  }
  if (!Number.isSafeInteger(normalized)) throw new Error(name + ' must be an integer');
  return normalized;
}

function requireInput() {
  const input = Execution.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Execution.input must be an object');
  }
  requireExactKeys(input, ['schemaVersion', 'requestId', 'data', 'meta'], 'Execution.input');
  if (requireJSONInteger(input.schemaVersion, 'schemaVersion') !== 1) {
    throw new Error('schemaVersion must be 1');
  }
  if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 256) {
    throw new Error('requestId must be a non-empty string');
  }
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
    throw new Error('data must be an object');
  }
  requireExactKeys(input.data, ['button'], 'data');
  if (typeof input.data.button !== 'string' || !/^\d$/.test(input.data.button)) {
    throw new Error('data.button must be one digit');
  }
  if (!input.meta || typeof input.meta !== 'object' || Array.isArray(input.meta)) {
    throw new Error('meta must be an object');
  }
  requireExactKeys(input.meta, ['resultPath'], 'meta');
  if (
    typeof input.meta.resultPath !== 'string'
    || !/^\.runtime\/external-workflow-results\/[A-Za-z0-9._-]+\.json$/.test(input.meta.resultPath)
  ) {
    throw new Error('meta.resultPath is outside the bridge result namespace');
  }
  return {
    requestId: input.requestId,
    resultPath: input.meta.resultPath,
    button: input.data.button,
  };
}

function sameWindow(left, right) {
  if (String(left.id || '') && String(right.id || '')) return String(left.id) === String(right.id);
  return Number(left.pid) === Number(right.pid) && String(left.title || '') === String(right.title || '');
}

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

function numericDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

const contract = requireInput();
const matches = (await window.list()).filter((candidate) =>
  String(candidate.exePath || '') === CALCULATOR.executablePath
    && String(candidate.title || '') === CALCULATOR.title);
if (matches.length !== 1) {
  throw new Error('Expected one Calculator window, found ' + String(matches.length));
}
const target = matches[0];
if (Number(target.width) !== CALCULATOR.width || Number(target.height) !== CALCULATOR.height) {
  throw new Error('Calculator must use the qualified 232x321 layout');
}
let active = await window.getActiveWindow();
if (!sameWindow(active, target)) {
  await window.bringToTop(target.title, Number(target.pid));
  await sleep(200);
  active = await window.getActiveWindow();
}
if (!sameWindow(active, target)) throw new Error('Calculator is not the active qualification target');

const ref = await Accessibility.find(
  {role: 'button', name: contract.button},
  {within: active, maxDepth: 12, maxNodes: 2000, timeout: 10000},
);
if (!ref) throw new Error('Calculator perturbation button was not found');
try {
  const state = await Accessibility.read(ref, {
    properties: ['role', 'name', 'enabled', 'actions'],
    timeout: 10000,
  });
  const properties = state && state.properties || {};
  if (
    properties.role !== 'button'
    || properties.name !== contract.button
    || properties.enabled !== true
    || !Array.isArray(properties.actions)
    || !properties.actions.includes('invoke')
  ) {
    throw new Error('Calculator perturbation target is not uniquely invokable');
  }
  const action = await Accessibility.perform(ref, {action: 'invoke'}, {timeout: 10000});
  if (!action || action.actionState !== 'acknowledged') {
    throw new Error('Calculator perturbation action was not acknowledged');
  }
} finally {
  await Accessibility.release(ref);
}
await sleep(200);

let observationTarget = await window.getActiveWindow();
if (!sameWindow(observationTarget, target)) {
  await window.bringToTop(target.title, Number(target.pid));
  await sleep(200);
  observationTarget = await window.getActiveWindow();
}
if (!sameWindow(observationTarget, target)) {
  throw new Error('Calculator is not active after the external perturbation');
}

const snapshot = await Accessibility.snapshot({
  within: observationTarget,
  maxDepth: 12,
  maxNodes: 2000,
  timeout: 10000,
  properties: ['role', 'value'],
});
if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
  throw new Error('Calculator perturbation observation is incomplete');
}
const displays = flatten(snapshot.root)
  .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
  .map((node) => numericDisplay(node.value));
if (displays.length !== 1) {
  throw new Error('Expected one Calculator display, found ' + String(displays.length));
}
await File.writeJSON(contract.resultPath, {
  schemaVersion: 1,
  requestId: contract.requestId,
  ok: true,
  data: {button: contract.button, display: displays[0]},
  error: null,
});
