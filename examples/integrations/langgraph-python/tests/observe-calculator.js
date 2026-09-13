'use strict';

// Read-only qualification observer. It does not reproduce Calculator actions;
// it independently reads the active production target and captures evidence.

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
  requireExactKeys(input.data, ['label'], 'data');
  if (typeof input.data.label !== 'string' || !/^[a-z0-9-]{1,80}$/.test(input.data.label)) {
    throw new Error('data.label is invalid');
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
    label: input.data.label,
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

const snapshot = await Accessibility.snapshot({
  within: active,
  maxDepth: 12,
  maxNodes: 2000,
  timeout: 10000,
  properties: ['role', 'value'],
});
if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
  throw new Error('Calculator qualification observation is incomplete');
}
const displays = flatten(snapshot.root)
  .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
  .map((node) => numericDisplay(node.value));
if (displays.length !== 1) {
  throw new Error('Expected one Calculator display, found ' + String(displays.length));
}

const screenshot = await page.screenshot({
  clip: {
    x: Number(active.x),
    y: Number(active.y),
    width: Number(active.width),
    height: Number(active.height),
  },
  path: File.join(Execution.artifactDir, contract.label + '.png'),
  returnType: 'object',
});
await File.writeJSON(contract.resultPath, {
  schemaVersion: 1,
  requestId: contract.requestId,
  ok: true,
  data: {
    display: displays[0],
    target: {id: String(active.id || ''), pid: Number(active.pid), title: active.title},
    screenshot,
  },
  error: null,
});
