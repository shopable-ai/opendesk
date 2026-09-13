// Parameterized macOS Calculator automation for the conversational P0 example.
//
// Evidence ownership:
// - App/window identity and Accessibility display reading are preserved from the
//   current production sample: examples/human-to-recipe/calculator-115.semantic.recipe.js.
// - The complete normalized Basic-layout keypad map was qualified by the earlier
//   live Calculator recipe introduced in commit 4eec3c501d94b749ed5d17ae7de5440e66130c91.
//   These points are copied as evidence-backed data; they are not inferred from
//   a visually regular keypad grid.

const CALCULATOR = Object.freeze({
  bundleId: 'com.apple.calculator',
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
});

export const CALCULATOR_LAYOUT = Object.freeze({
  name: 'macOS Calculator Standard/Basic 232x321',
  safeSize: Object.freeze({width: 232, height: 321, tolerance: 2}),
  keyPoints: Object.freeze({
    clear: Object.freeze({x: 0.121, y: 0.327}),
    '7': Object.freeze({x: 0.121, y: 0.474}),
    '8': Object.freeze({x: 0.366, y: 0.474}),
    '9': Object.freeze({x: 0.616, y: 0.474}),
    '*': Object.freeze({x: 0.871, y: 0.474}),
    '4': Object.freeze({x: 0.121, y: 0.623}),
    '5': Object.freeze({x: 0.366, y: 0.623}),
    '6': Object.freeze({x: 0.616, y: 0.623}),
    '-': Object.freeze({x: 0.871, y: 0.623}),
    '1': Object.freeze({x: 0.121, y: 0.773}),
    '2': Object.freeze({x: 0.366, y: 0.773}),
    '3': Object.freeze({x: 0.616, y: 0.773}),
    '+': Object.freeze({x: 0.871, y: 0.773}),
    '0': Object.freeze({x: 0.245, y: 0.925}),
    '=': Object.freeze({x: 0.871, y: 0.925}),
  }),
});

const PUBLIC_TO_CANONICAL_KEY = Object.freeze({
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '+': '+', '-': '-', '×': '*', '=': '=',
});

export class CalculatorTaskError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CalculatorTaskError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CalculatorTaskError(code, message);
}

function abortError() {
  const error = new Error('Calculator task canceled');
  error.name = 'AbortError';
  error.code = 'CANCELED';
  return error;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw abortError();
}

function sameWindow(left, right) {
  if (!left || !right) return false;
  if (String(left.id || '') && String(right.id || '')) return String(left.id) === String(right.id);
  return Number(left.pid) === Number(right.pid) && String(left.title || '') === String(right.title || '');
}

function withinTolerance(actual, expected, tolerance) {
  return Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) <= tolerance;
}

function normalizeDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

function flattenAccessibility(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    flattenAccessibility(child, output);
  }
  return output;
}

function assertPublicButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) fail('INVALID_BUTTONS', 'buttons must be a non-empty array');
  for (const button of buttons) {
    if (!Object.prototype.hasOwnProperty.call(PUBLIC_TO_CANONICAL_KEY, button)) {
      fail('UNSUPPORTED_BUTTON', `unsupported Calculator button: ${JSON.stringify(button)}`);
    }
  }
  if (buttons[buttons.length - 1] !== '=') fail('INVALID_BUTTONS', 'button sequence must end with =');
}

async function emitProgress(onProgress, event) {
  if (typeof onProgress !== 'function') return;
  await onProgress(Object.freeze({...event}));
}

export function createCalculatorAutomation(environment = globalThis) {
  const System = environment.System;
  const App = environment.App;
  const desktopWindow = environment.window;
  const Geometry = environment.Geometry;
  const mouse = environment.mouse;
  const Accessibility = environment.Accessibility;
  const sleep = environment.sleep;

  function requireApi(value, name) {
    if (!value) fail('RUNTIME_API_UNAVAILABLE', `OpenDesk Runtime API is unavailable: ${name}`);
    return value;
  }

  async function requireActiveCalculator(target, signal) {
    throwIfAborted(signal);
    const api = requireApi(desktopWindow, 'window');
    const active = await api.getActiveWindow();
    throwIfAborted(signal);
    const safe = CALCULATOR_LAYOUT.safeSize;
    if (!sameWindow(active, target)
        || String(active.exePath || '') !== CALCULATOR.executablePath
        || String(active.title || '') !== CALCULATOR.title
        || !withinTolerance(active.width, safe.width, safe.tolerance)
        || !withinTolerance(active.height, safe.height, safe.tolerance)
        || ![active.x, active.y].every(Number.isFinite)) {
      fail('CALCULATOR_FOCUS_OR_LAYOUT_CHANGED', 'Calculator is no longer the qualified active 232×321 Basic window');
    }
    return active;
  }

  async function openCalculator(signal) {
    throwIfAborted(signal);
    const platform = requireApi(System, 'System').getPlatformInfo();
    if (!platform || platform.os !== 'darwin') {
      fail('UNSUPPORTED_PLATFORM', 'This example currently supports macOS Calculator only');
    }
    await requireApi(App, 'App').launch(
      {bundleId: CALCULATOR.bundleId},
      {activate: true, waitUntilReady: 'window', timeout: 10000},
    );
    throwIfAborted(signal);

    const api = requireApi(desktopWindow, 'window');
    const matches = (await api.list()).filter((candidate) =>
      String(candidate.exePath || '') === CALCULATOR.executablePath
        && String(candidate.title || '') === CALCULATOR.title);
    if (matches.length !== 1) {
      fail('CALCULATOR_WINDOW_AMBIGUOUS', `Expected exactly one Calculator window, found ${matches.length}`);
    }
    const target = matches[0];
    const safe = CALCULATOR_LAYOUT.safeSize;
    if (!withinTolerance(target.width, safe.width, safe.tolerance)
        || !withinTolerance(target.height, safe.height, safe.tolerance)) {
      fail(
        'UNSUPPORTED_CALCULATOR_LAYOUT',
        `Calculator must use the qualified ${safe.width}×${safe.height} Basic layout`,
      );
    }

    const active = await api.getActiveWindow();
    if (!sameWindow(active, target)) {
      throwIfAborted(signal);
      await api.bringToTop(target.title, Number(target.pid));
      await requireApi(sleep, 'sleep')(200);
    }
    await requireActiveCalculator(target, signal);
    return target;
  }

  async function pressCanonicalKey(target, canonicalKey, signal, onProgress, stage) {
    throwIfAborted(signal);
    const relativePoint = CALCULATOR_LAYOUT.keyPoints[canonicalKey];
    if (!relativePoint) fail('UNSUPPORTED_BUTTON', `unqualified Calculator key: ${JSON.stringify(canonicalKey)}`);
    const active = await requireActiveCalculator(target, signal);
    const geometry = requireApi(Geometry, 'Geometry');
    const offsetX = relativePoint.x * Number(active.width);
    const offsetY = relativePoint.y * Number(active.height);
    const point = geometry.pointOffset(active, offsetX, offsetY);
    if (!geometry.contains(geometry.rect(active), point)) {
      fail('KEY_OUTSIDE_WINDOW', `Calculator key is outside the current window: ${canonicalKey}`);
    }

    // Cancellation is checked immediately before submitting the native click.
    throwIfAborted(signal);
    await requireApi(mouse, 'mouse').clickForPID(Number(active.pid), point.x, point.y);
    await emitProgress(onProgress, {phase: 'click', stage, key: canonicalKey === '*' ? '×' : canonicalKey});
    await requireApi(sleep, 'sleep')(canonicalKey === '=' ? 180 : 80);
    throwIfAborted(signal);
  }

  async function pressPublicButtons(target, buttons, signal, onProgress, stage) {
    assertPublicButtons(buttons);
    for (const button of buttons) {
      throwIfAborted(signal);
      await pressCanonicalKey(target, PUBLIC_TO_CANONICAL_KEY[button], signal, onProgress, stage);
    }
  }

  async function clearCalculator(target, signal, onProgress, stage) {
    await emitProgress(onProgress, {phase: 'clearing', stage});
    // The first press may turn C into AC; the second establishes a fresh state.
    await pressCanonicalKey(target, 'clear', signal, onProgress, stage);
    await pressCanonicalKey(target, 'clear', signal, onProgress, stage);
  }

  async function readDisplayOnce(target, signal) {
    const active = await requireActiveCalculator(target, signal);
    const snapshot = await requireApi(Accessibility, 'Accessibility').snapshot({
      within: active,
      maxDepth: 12,
      maxNodes: 2000,
      timeout: 10000,
      properties: ['role', 'value'],
    });
    throwIfAborted(signal);
    if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
      fail('DISPLAY_INCOMPLETE', 'Calculator display Accessibility snapshot is incomplete');
    }
    const displays = flattenAccessibility(snapshot.root)
      .filter((node) => node.role === 'staticText' && normalizeDisplay(node.value) !== null)
      .map((node) => normalizeDisplay(node.value));
    if (displays.length !== 1) {
      fail('DISPLAY_AMBIGUOUS', `Expected exactly one numeric Calculator display, found ${displays.length}`);
    }
    return displays[0];
  }

  async function readStableDisplay(target, signal, onProgress, stage, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 2500);
    const pollMs = Number(options.pollMs || 80);
    const deadline = Date.now() + timeoutMs;
    let previous = null;
    let stableReads = 0;
    await emitProgress(onProgress, {phase: 'reading', stage});
    while (Date.now() <= deadline) {
      throwIfAborted(signal);
      const current = await readDisplayOnce(target, signal);
      if (current === previous) stableReads += 1;
      else {
        previous = current;
        stableReads = 1;
      }
      if (stableReads >= 2) {
        await emitProgress(onProgress, {phase: 'read', stage, value: current});
        return current;
      }
      await requireApi(sleep, 'sleep')(pollMs);
    }
    fail('DISPLAY_UNSTABLE', 'Calculator display did not produce two consecutive identical reads in time');
  }

  async function pressAndRead(options) {
    const buttons = options && options.buttons;
    const signal = options && options.signal;
    const onProgress = options && options.onProgress;
    assertPublicButtons(buttons);
    await emitProgress(onProgress, {phase: 'opening', stage: 'single'});
    const target = await openCalculator(signal);
    await clearCalculator(target, signal, onProgress, 'single');
    await pressPublicButtons(target, buttons, signal, onProgress, 'single');
    const result = await readStableDisplay(target, signal, onProgress, 'single');
    return Object.freeze({task: 'calculator.pressAndRead', result});
  }

  async function twoStage(options) {
    const buttons = options && options.buttons;
    const multiplier = options && options.multiplier;
    const signal = options && options.signal;
    const onProgress = options && options.onProgress;
    assertPublicButtons(buttons);
    if (typeof multiplier !== 'string' || !/^\d{1,12}$/.test(multiplier)) {
      fail('INVALID_MULTIPLIER', 'multiplier must be a 1-12 digit non-negative integer string');
    }

    await emitProgress(onProgress, {phase: 'opening', stage: 'first'});
    const target = await openCalculator(signal);
    await clearCalculator(target, signal, onProgress, 'first');
    await pressPublicButtons(target, buttons, signal, onProgress, 'first');
    const firstResult = await readStableDisplay(target, signal, onProgress, 'first');

    // The second-stage input is derived only from the just-read display value.
    // Decimal/negative/overlong values are not silently transformed or guessed.
    if (!/^\d{1,12}$/.test(firstResult)) {
      fail('FIRST_RESULT_NOT_REENTERABLE', 'firstResult is not a supported 1-12 digit non-negative integer');
    }
    const secondStageButtons = [
      ...multiplier.split(''),
      '×',
      ...firstResult.split(''),
      '=',
    ];
    assertPublicButtons(secondStageButtons);

    throwIfAborted(signal);
    await clearCalculator(target, signal, onProgress, 'second');
    await pressPublicButtons(target, secondStageButtons, signal, onProgress, 'second');
    const finalResult = await readStableDisplay(target, signal, onProgress, 'second');
    return Object.freeze({
      task: 'calculator.twoStage',
      firstResult,
      finalResult,
      secondStageButtons: Object.freeze([...secondStageButtons]),
    });
  }

  return Object.freeze({pressAndRead, twoStage, readStableDisplay});
}

export async function pressAndRead(options) {
  return createCalculatorAutomation().pressAndRead(options);
}

export async function twoStage(options) {
  return createCalculatorAutomation().twoStage(options);
}
