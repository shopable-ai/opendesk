'use strict';

// Python/LangGraph -> OpenDesk, stage 1.
// The business result written to resultPath comes from the real Calculator display.

const CALCULATOR = Object.freeze({
  bundleId: 'com.apple.calculator',
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
  width: 232,
  height: 321,
});

const BUTTON = Object.freeze({
  clear: Object.freeze({x: 33, y: 107}),
  '2': Object.freeze({x: 83, y: 239}),
  '4': Object.freeze({x: 17, y: 198}),
  '5': Object.freeze({x: 82, y: 203}),
  multiply: Object.freeze({x: 195, y: 149}),
  equals: Object.freeze({x: 204, y: 292}),
});

function requireBridgeInput() {
  const input = Execution.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Execution.input must be an object');
  }
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 256) {
    throw new Error('requestId must be a non-empty string');
  }
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
    throw new Error('data must be an object');
  }
  if (!input.meta || typeof input.meta !== 'object' || Array.isArray(input.meta)) {
    throw new Error('meta must be an object');
  }
  const resultPath = input.meta.resultPath;
  if (
    typeof resultPath !== 'string'
    || !/^\.runtime\/external-workflow-results\/[A-Za-z0-9._-]+\.json$/.test(resultPath)
  ) {
    throw new Error('meta.resultPath is outside the bridge result namespace');
  }
  return {requestId: input.requestId, data: input.data, resultPath};
}

function response(requestId, ok, data, error) {
  return {schemaVersion: 1, requestId, ok, data, error};
}

async function writeFailure(contract, error) {
  if (!contract) return;
  try {
    await File.writeJSON(
      contract.resultPath,
      response(contract.requestId, false, null, {
        code: String(error && error.code || error && error.name || 'RECIPE_ERROR'),
        message: String(error && error.message || error || 'Recipe failed'),
      }),
    );
  } catch (_) {
    // Preserve the original execution failure.
  }
}

function sameWindow(left, right) {
  if (String(left.id || '') && String(right.id || '')) return String(left.id) === String(right.id);
  return Number(left.pid) === Number(right.pid) && String(left.title || '') === String(right.title || '');
}

async function requireActiveCalculator(target) {
  const active = await window.getActiveWindow();
  if (
    !sameWindow(active, target)
    || String(active.exePath || '') !== CALCULATOR.executablePath
    || Number(active.width) !== CALCULATOR.width
    || Number(active.height) !== CALCULATOR.height
    || ![active.x, active.y].every(Number.isFinite)
  ) {
    throw new Error('Calculator target is no longer the qualified active window');
  }
  return active;
}

async function openCalculator() {
  const platform = System.getPlatformInfo();
  if (!platform || platform.os !== 'darwin') throw new Error('This recipe requires macOS Calculator');

  await App.launch({bundleId: CALCULATOR.bundleId}, {
    activate: true,
    waitUntilReady: 'window',
    timeout: 10000,
  });

  const matches = (await window.list()).filter((candidate) =>
    String(candidate.exePath || '') === CALCULATOR.executablePath
      && String(candidate.title || '') === CALCULATOR.title);
  if (matches.length !== 1) throw new Error(`Expected one Calculator window, found ${matches.length}`);

  const target = matches[0];
  if (Number(target.width) !== CALCULATOR.width || Number(target.height) !== CALCULATOR.height) {
    throw new Error('Calculator must use the qualified 232×321 layout');
  }

  const active = await window.getActiveWindow();
  if (!sameWindow(active, target)) {
    await window.bringToTop(target.title, Number(target.pid));
    await sleep(200);
  }
  await requireActiveCalculator(target);
  return target;
}

async function press(target, key) {
  const offset = BUTTON[key];
  if (!offset) throw new Error(`Unknown Calculator key: ${key}`);
  const active = await requireActiveCalculator(target);
  const point = Geometry.pointOffset(active, offset.x, offset.y);
  if (!Geometry.contains(Geometry.rect(active), point)) {
    throw new Error(`Calculator key is outside the qualified window: ${key}`);
  }
  await mouse.clickForPID(Number(active.pid), point.x, point.y);
  await sleep(120);
}

async function pressKeys(target, keys) {
  for (const key of keys) await press(target, key);
}

function flattenAccessibility(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    flattenAccessibility(child, output);
  }
  return output;
}

function numericDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

async function readCalculatorDisplay(target) {
  const active = await requireActiveCalculator(target);
  const snapshot = await Accessibility.snapshot({
    within: active,
    maxDepth: 12,
    maxNodes: 2000,
    timeout: 10000,
    properties: ['role', 'value'],
  });
  if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
    throw new Error('Calculator result observation is incomplete');
  }
  const displays = flattenAccessibility(snapshot.root)
    .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
    .map((node) => numericDisplay(node.value));
  if (displays.length !== 1) throw new Error(`Expected one Calculator display, found ${displays.length}`);
  return displays[0];
}

async function waitForDisplay(target, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await readCalculatorDisplay(target);
    if (actual === expected) return actual;
    await sleep(50);
  }
  throw new Error(`Calculator result mismatch: expected ${expected}, got ${actual}`);
}

let contract = null;
try {
  contract = requireBridgeInput();
  const calculator = await openCalculator();

  // Establish the same qualified AC start as the maintained semantic recipe.
  await pressKeys(calculator, ['clear', 'clear']);
  await pressKeys(calculator, ['2', '5', 'multiply', '4', 'equals']);

  const baseDisplay = await waitForDisplay(calculator, '100');
  const baseResult = Number(baseDisplay);
  if (!Number.isInteger(baseResult)) throw new Error('Calculator base display is not an integer');

  await File.writeJSON(
    contract.resultPath,
    response(contract.requestId, true, {baseResult, baseDisplay}, null),
  );
  console.log(`[DONE] calculator-base actual display=${baseDisplay}`);
} catch (error) {
  await writeFailure(contract, error);
  throw error;
}
