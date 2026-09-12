'use strict';

// Python/LangGraph -> OpenDesk, stage 2.
// Before mutating the desktop, re-read the Calculator display and require it to
// match the stage-1 result supplied by the workflow.

const CALCULATOR = Object.freeze({
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
  width: 232,
  height: 321,
});

// clear/0/2/4/5/operators are inherited from the maintained semantic recipe.
// The remaining digit offsets are candidate points for the same qualified
// 232×321 macOS layout and MUST be live-qualified during local acceptance.
const BUTTON = Object.freeze({
  '0': Object.freeze({x: 76, y: 290}),
  '1': Object.freeze({x: 17, y: 239}),
  '2': Object.freeze({x: 83, y: 239}),
  '3': Object.freeze({x: 146, y: 239}),
  '4': Object.freeze({x: 17, y: 198}),
  '5': Object.freeze({x: 82, y: 203}),
  '6': Object.freeze({x: 146, y: 202}),
  '7': Object.freeze({x: 17, y: 158}),
  '8': Object.freeze({x: 82, y: 158}),
  '9': Object.freeze({x: 146, y: 158}),
  plus: Object.freeze({x: 203, y: 251}),
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

  const baseResult = input.data.baseResult;
  const increment = input.data.increment;
  if (!Number.isInteger(baseResult)) throw new Error('data.baseResult must be an integer');
  if (!Number.isInteger(increment) || increment < 5 || increment > 15) {
    throw new Error('data.increment must be an integer between 5 and 15');
  }

  return {
    requestId: input.requestId,
    resultPath,
    data: {baseResult, increment},
  };
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

async function findCalculator() {
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
  return requireActiveCalculator(target);
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

async function pressNumber(target, value) {
  const text = String(value);
  if (!/^\d+$/.test(text)) throw new Error('Calculator number must contain digits only');
  for (const digit of text) await press(target, digit);
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
  const calculator = await findCalculator();

  const currentDisplay = await readCalculatorDisplay(calculator);
  if (currentDisplay !== String(contract.data.baseResult)) {
    throw new Error(
      `Calculator state changed before continuation: expected ${contract.data.baseResult}, got ${currentDisplay}`
    );
  }

  await press(calculator, 'plus');
  await pressNumber(calculator, contract.data.increment);
  await press(calculator, 'equals');

  const expected = contract.data.baseResult + contract.data.increment;
  const finalDisplay = await waitForDisplay(calculator, String(expected));
  const finalResult = Number(finalDisplay);
  if (!Number.isInteger(finalResult)) throw new Error('Calculator final display is not an integer');

  await File.writeJSON(
    contract.resultPath,
    response(contract.requestId, true, {
      baseResult: contract.data.baseResult,
      increment: contract.data.increment,
      finalResult,
      finalDisplay,
    }, null),
  );
  console.log(`[DONE] calculator-add actual display=${finalDisplay}`);
} catch (error) {
  await writeFailure(contract, error);
  throw error;
}
