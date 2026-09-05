// macOS Calculator Agent-to-Recipe example.
//
// Run from the OpenDesk repository root after granting Screen Recording and
// Accessibility and making one Vision OCR provider available:
//   ./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"16*3","expected":"48"}'
//
// A dependent follow-up uses the first Calculator display OCR result:
//   ./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"125*8","expected":"1000","followUp":{"expression":"{result}/4+37","expected":"287"}}'
//
// This recipe supports only the macOS Standard/Basic Calculator layout that
// was verified at 232x321 points. If another Calculator mode changed the
// bounds, it selects Basic with the documented Command+1 shortcut, restores
// the observed position, verifies the safe bounds, and only then clicks keys.

const CALCULATOR_BUNDLE_ID = 'com.apple.calculator';

const CALCULATOR_LAYOUT = Object.freeze({
  name: 'macOS Calculator Standard/Basic 232x321',
  safeSize: Object.freeze({ width: 232, height: 321, tolerance: 2 }),
  displayRegion: Object.freeze({ x: 0.03, y: 0.09, width: 0.94, height: 0.16 }),
  keypadRegion: Object.freeze({ x: 0, y: 0.252, width: 1, height: 0.748 }),
  keyPoints: Object.freeze({
    clear: Object.freeze({ x: 0.121, y: 0.327 }),
    '/': Object.freeze({ x: 0.871, y: 0.327 }),
    '7': Object.freeze({ x: 0.121, y: 0.474 }),
    '8': Object.freeze({ x: 0.366, y: 0.474 }),
    '9': Object.freeze({ x: 0.616, y: 0.474 }),
    '*': Object.freeze({ x: 0.871, y: 0.474 }),
    '4': Object.freeze({ x: 0.121, y: 0.623 }),
    '5': Object.freeze({ x: 0.366, y: 0.623 }),
    '6': Object.freeze({ x: 0.616, y: 0.623 }),
    '-': Object.freeze({ x: 0.871, y: 0.623 }),
    '1': Object.freeze({ x: 0.121, y: 0.773 }),
    '2': Object.freeze({ x: 0.366, y: 0.773 }),
    '3': Object.freeze({ x: 0.616, y: 0.773 }),
    '+': Object.freeze({ x: 0.871, y: 0.773 }),
    '0': Object.freeze({ x: 0.245, y: 0.925 }),
    '.': Object.freeze({ x: 0.616, y: 0.925 }),
    '=': Object.freeze({ x: 0.871, y: 0.925 }),
  }),
});

let calculatorRun = null;
let resultDocument = null;

function errorMessage(error) {
  return String(error && error.message ? error.message : error);
}

function compactBounds(info) {
  return {
    x: Number(info.x),
    y: Number(info.y),
    width: Number(info.width),
    height: Number(info.height),
  };
}

function withinTolerance(actual, expected, tolerance) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function writeResultDocument() {
  if (!resultDocument || !Execution.artifactDir) return;
  File.write(
    File.join(Execution.artifactDir, 'calculator-result.json'),
    JSON.stringify(resultDocument, null, 2) + '\n',
  );
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Execution.input must be a JSON object');
  }
  if (typeof input.expression !== 'string' || input.expression.trim() === '') {
    throw new Error('Execution.input.expression must be a non-empty string');
  }
  tokenizeCalculatorExpression(input.expression);
  if (input.expected !== undefined && !['string', 'number'].includes(typeof input.expected)) {
    throw new Error('Execution.input.expected must be a string or number when provided');
  }
  if (input.followUp !== undefined) {
    const followUp = input.followUp;
    if (!followUp || typeof followUp !== 'object' || Array.isArray(followUp)) {
      throw new Error('Execution.input.followUp must be an object when provided');
    }
    if (typeof followUp.expression !== 'string' || followUp.expression.trim() === '') {
      throw new Error('Execution.input.followUp.expression must be a non-empty string');
    }
    if (!followUp.expression.includes('{result}')) {
      throw new Error('followUp.expression must contain {result}');
    }
    substituteFirstResult(followUp.expression, '0');
    if (followUp.expected !== undefined && !['string', 'number'].includes(typeof followUp.expected)) {
      throw new Error('Execution.input.followUp.expected must be a string or number when provided');
    }
  }
  return input;
}

function tokenizeCalculatorExpression(expression) {
  const compact = String(expression).replace(/\s+/g, '');
  if (compact === '') throw new Error('Calculator expression must not be empty');
  if (/[^0-9.+\-*/=]/.test(compact)) {
    throw new Error(`Unsupported Calculator expression character in ${JSON.stringify(expression)}`);
  }
  const equalsCount = (compact.match(/=/g) || []).length;
  if (equalsCount > 1 || (equalsCount === 1 && !compact.endsWith('='))) {
    throw new Error('Calculator expression may contain one optional trailing equals sign');
  }
  const body = compact.endsWith('=') ? compact.slice(0, -1) : compact;
  if (body === '') throw new Error('Calculator expression must contain an operand');
  const parts = body.split(/([+\-*/])/);
  if (parts.length % 2 === 0) throw new Error('Calculator expression has a missing operand');
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index % 2 === 1) {
      if (!/^[+\-*/]$/.test(part)) throw new Error(`Invalid operator ${JSON.stringify(part)}`);
    } else if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)) {
      throw new Error(`Invalid numeric operand ${JSON.stringify(part)}`);
    }
  }
  return body.split('').concat('=');
}

async function resolveCalculatorWindow() {
  const application = await App.launch(
    { bundleId: CALCULATOR_BUNDLE_ID },
    { waitUntilReady: 'window', timeout: 15000 },
  );
  if (application.bundleId !== CALCULATOR_BUNDLE_ID || !Array.isArray(application.pids) || application.pids.length === 0) {
    throw new Error('App.launch did not resolve the Calculator bundle/PID group');
  }
  const pids = new Set(application.pids.map(Number));
  const matches = (await window.list()).filter(item => pids.has(Number(item.pid)));
  if (matches.length !== 1) {
    throw new Error(`Calculator window identity is ambiguous: expected 1 PID-group window, found ${matches.length}`);
  }
  const target = matches[0];
  if (!target.id || Number(target.pid) <= 0 || Number(target.width) <= 0 || Number(target.height) <= 0) {
    throw new Error('Calculator window metadata is incomplete');
  }
  return { application, window: target, pids };
}

async function getCalculatorBounds() {
  if (!calculatorRun) throw new Error('Calculator has not been resolved for this execution');
  const matches = (await window.list()).filter(item => calculatorRun.pids.has(Number(item.pid)));
  if (matches.length !== 1) {
    throw new Error(`Calculator window became ambiguous or stale: found ${matches.length}`);
  }
  const current = matches[0];
  if (String(current.id) !== String(calculatorRun.window.id) || Number(current.pid) !== Number(calculatorRun.window.pid)) {
    throw new Error('Calculator window lifecycle identity changed during execution');
  }
  calculatorRun.window = current;
  return compactBounds(current);
}

async function ensureCalculatorActive(allowRefocus = false) {
  let active = await window.getActiveWindow();
  let matches = active
    && Number(active.pid) === Number(calculatorRun.window.pid)
    && String(active.id) === String(calculatorRun.window.id);
  if (!matches && allowRefocus) {
    await getCalculatorBounds();
    await window.focus(calculatorRun.window.title);
    await page.waitForTimeout(80);
    active = await window.getActiveWindow();
    matches = active
      && Number(active.pid) === Number(calculatorRun.window.pid)
      && String(active.id) === String(calculatorRun.window.id);
  }
  if (!matches) {
    throw new Error('Active window is no longer the resolved Calculator PID/window identity');
  }
  return active;
}

async function selectBasicCalculatorLayout() {
  await ensureCalculatorActive(true);
  await keyboard.down('Meta');
  try {
    await keyboard.press('1');
  } finally {
    await keyboard.up('Meta');
  }
  await page.waitForTimeout(400);
  await ensureCalculatorActive();
}

async function normalizeAndVerifyLayout() {
  const safe = CALCULATOR_LAYOUT.safeSize;
  let bounds = await getCalculatorBounds();
  const initialBounds = { ...bounds };
  const layoutEvidence = {
    strategy: 'B',
    verifiedLayout: CALCULATOR_LAYOUT.name,
    initialBounds,
    recoveryActions: [],
    recovered: false,
  };
  resultDocument.layout = layoutEvidence;

  if (!withinTolerance(bounds.width, safe.width, safe.tolerance) || !withinTolerance(bounds.height, safe.height, safe.tolerance)) {
    await selectBasicCalculatorLayout();
    layoutEvidence.recoveryActions.push('select-basic-with-command-1');
    bounds = await getCalculatorBounds();
  }
  if (!withinTolerance(bounds.width, safe.width, safe.tolerance) || !withinTolerance(bounds.height, safe.height, safe.tolerance)) {
    await window.setWindowBounds(
      calculatorRun.window.title,
      initialBounds.x,
      initialBounds.y,
      safe.width,
      safe.height,
    );
    layoutEvidence.recoveryActions.push('restore-safe-bounds');
    await page.waitForTimeout(250);
    bounds = await getCalculatorBounds();
  }
  if (!withinTolerance(bounds.x, initialBounds.x, safe.tolerance) || !withinTolerance(bounds.y, initialBounds.y, safe.tolerance)) {
    await window.setWindowBounds(
      calculatorRun.window.title,
      initialBounds.x,
      initialBounds.y,
      safe.width,
      safe.height,
    );
    layoutEvidence.recoveryActions.push('restore-detected-position');
    await page.waitForTimeout(250);
    bounds = await getCalculatorBounds();
  }
  layoutEvidence.finalBounds = { ...bounds };
  if (!withinTolerance(bounds.width, safe.width, safe.tolerance) || !withinTolerance(bounds.height, safe.height, safe.tolerance)) {
    throw new Error(
      `Unsupported Calculator layout/size ${bounds.width}x${bounds.height}; expected verified Standard/Basic ${safe.width}x${safe.height}`,
    );
  }
  if (!withinTolerance(bounds.x, initialBounds.x, safe.tolerance) || !withinTolerance(bounds.y, initialBounds.y, safe.tolerance)) {
    throw new Error(
      `Calculator Basic layout changed position from (${initialBounds.x},${initialBounds.y}) to (${bounds.x},${bounds.y})`,
    );
  }
  layoutEvidence.recovered = layoutEvidence.recoveryActions.length > 0;
  layoutEvidence.verified = true;
  return bounds;
}

function toGlobalPoint(relativePoint, bounds) {
  if (!relativePoint || !bounds) throw new Error('Relative point and bounds are required');
  const point = {
    x: bounds.x + Number(relativePoint.x) * bounds.width,
    y: bounds.y + Number(relativePoint.y) * bounds.height,
  };
  if (![point.x, point.y].every(Number.isFinite)) throw new Error('Projected Calculator point is not finite');
  return point;
}

async function pressCalculatorKey(key) {
  const relativePoint = CALCULATOR_LAYOUT.keyPoints[key];
  if (!relativePoint) throw new Error(`Unsupported canonical Calculator key: ${JSON.stringify(key)}`);
  const active = await ensureCalculatorActive(true);
  const bounds = compactBounds(active);
  const point = toGlobalPoint(relativePoint, bounds);
  if (!(point.x > bounds.x && point.x < bounds.x + bounds.width && point.y > bounds.y && point.y < bounds.y + bounds.height)) {
    throw new Error(`Projected point for Calculator key ${key} is outside the current window`);
  }
  await mouse.clickForPID(Number(calculatorRun.window.pid), point.x, point.y);
  await page.waitForTimeout(key === '=' ? 180 : 70);
}

async function enterCalculatorExpression(expression) {
  const keys = tokenizeCalculatorExpression(expression);
  for (const key of keys) await pressCalculatorKey(key);
}

async function clearCalculator() {
  // One click may be C (current entry) rather than AC. A second click is the
  // idempotent full reset needed for a fresh run from arbitrary old state.
  await pressCalculatorKey('clear');
  await pressCalculatorKey('clear');
}

async function captureCalculatorDisplay(calculationNumber) {
  const active = await ensureCalculatorActive();
  const bounds = compactBounds(active);
  const region = CALCULATOR_LAYOUT.displayRegion;
  const clip = {
    x: bounds.x + region.x * bounds.width,
    y: bounds.y + region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height,
  };
  const path = File.join(Execution.artifactDir, `calculator-display-${calculationNumber}.png`);
  const screenshot = await page.screenshot({ clip, path, returnType: 'object' });
  if (!screenshot || !screenshot.path || Number(screenshot.width) <= 0 || Number(screenshot.height) <= 0) {
    throw new Error(`Calculator display ${calculationNumber} screenshot is unavailable`);
  }
  return screenshot;
}

async function runDisplayOCR(imagePath) {
  const capabilities = await Vision.getCapabilities({});
  const providers = Array.isArray(capabilities.providers) ? capabilities.providers : [];
  const apple = providers.find(item => item.provider === 'apple');
  const paddle = providers.find(item => item.provider === 'paddle');
  const local = providers.find(item => item.provider === 'local');
  const provider = apple && apple.implemented && apple.available
    ? { name: 'apple', lang: 'ch', recognitionLevel: 'accurate' }
    : paddle && paddle.implemented && (!paddle.endpointRequired || paddle.endpointConfigured)
      ? { name: 'paddle', lang: 'en' }
      : local && local.implemented
        ? { name: 'local', lang: 'en' }
        : null;

  let visionError = null;
  if (provider) {
    try {
      const response = await Vision.runOCR({
        imagePath,
        provider: provider.name,
        lang: provider.lang,
        recognitionLevel: provider.recognitionLevel,
        includeRaw: true,
      });
      return {
        provider: `Vision/${response.provider || provider.name}`,
        rawText: response.text,
        lines: Array.isArray(response.lines) ? response.lines : [],
        raw: response.raw,
        capabilities,
      };
    } catch (error) {
      visionError = errorMessage(error);
    }
  }

  if (globalThis.NativeExtensions && NativeExtensions.macosVision && typeof NativeExtensions.macosVision.ocr === 'function') {
    const response = NativeExtensions.macosVision.ocr({
      imagePath,
      recognitionLevel: 'accurate',
      languages: ['en-US'],
    });
    return {
      provider: 'NativeExtensions/macosVision',
      rawText: response.text,
      lines: Array.isArray(response.items) ? response.items : [],
      capabilities,
      standardVisionError: visionError,
    };
  }

  throw new Error(
    `No usable OCR provider for Calculator display${visionError ? `; Vision failed: ${visionError}` : ''}`,
  );
}

function normalizeCalculatorDisplay(rawText) {
  const raw = String(rawText === undefined || rawText === null ? '' : rawText);
  const cleaned = raw
    .replace(/[\s,，'’]/g, '')
    .replace(/[−–—﹣－]/g, '-')
    .replace(/^[^0-9+\-.]+/, '')
    .replace(/[^0-9.]+$/, '');
  const matches = cleaned.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) || [];
  if (matches.length !== 1) {
    throw new Error(`Calculator display OCR is not one unambiguous numeric value: ${JSON.stringify(raw)}`);
  }
  return matches[0].replace(/^\+/, '');
}

async function readCalculatorDisplay(calculationNumber) {
  const screenshot = await captureCalculatorDisplay(calculationNumber);
  try {
    const ocr = await runDisplayOCR(screenshot.path);
    const normalizedResult = normalizeCalculatorDisplay(ocr.rawText);
    return { screenshot, ocr, rawDisplay: ocr.rawText, normalizedResult };
  } catch (error) {
    File.write(
      File.join(Execution.artifactDir, `calculator-display-${calculationNumber}-ocr-error.json`),
      JSON.stringify({ screenshot, error: errorMessage(error) }, null, 2) + '\n',
    );
    throw error;
  }
}

function normalizeExpected(expected) {
  return normalizeCalculatorDisplay(String(expected));
}

function verifyCalculatorResult(observed, expected) {
  if (expected === undefined) return false;
  const normalizedExpected = normalizeExpected(expected);
  if (observed !== normalizedExpected) {
    throw new Error(`Calculator result mismatch: expected ${JSON.stringify(normalizedExpected)}, observed ${JSON.stringify(observed)}`);
  }
  return true;
}

async function evaluateCalculatorExpression(expression, expected, calculationNumber) {
  tokenizeCalculatorExpression(expression);
  await clearCalculator();
  await enterCalculatorExpression(expression);
  const display = await readCalculatorDisplay(calculationNumber);
  const calculation = {
    expression,
    rawDisplay: display.rawDisplay,
    normalizedResult: display.normalizedResult,
    expected: expected === undefined ? null : normalizeExpected(expected),
    verified: false,
    displayScreenshot: display.screenshot.path,
    ocr: {
      provider: display.ocr.provider,
      lines: display.ocr.lines,
    },
  };
  resultDocument.calculations.push(calculation);
  calculation.verified = verifyCalculatorResult(display.normalizedResult, expected);
  writeResultDocument();
  return display.normalizedResult;
}

function substituteFirstResult(expression, firstResult) {
  if (typeof expression !== 'string' || !expression.includes('{result}')) {
    throw new Error('followUp.expression must contain {result}');
  }
  const substituted = expression.split('{result}').join(firstResult);
  if (/[{}]/.test(substituted)) throw new Error('followUp.expression contains an unsupported placeholder');
  tokenizeCalculatorExpression(substituted);
  return substituted;
}

async function main() {
  const input = Execution.input;
  resultDocument = {
    executionId: Execution.id,
    application: {
      bundleId: CALCULATOR_BUNDLE_ID,
      pid: 0,
      windowTitle: '',
    },
    windowBounds: {},
    input,
    calculations: [],
    finalResult: null,
    passed: false,
  };

  try {
    validateInput(input);
    await page.ensurePermissions({
      capabilities: ['screenCapture', 'accessibility'],
      openSettings: false,
    });
    calculatorRun = await resolveCalculatorWindow();
    resultDocument.application.pid = Number(calculatorRun.window.pid);
    resultDocument.application.windowTitle = String(calculatorRun.window.title || '');

    await window.focus(calculatorRun.window.title);
    await page.waitForTimeout(250);
    await ensureCalculatorActive();
    const bounds = await normalizeAndVerifyLayout();
    resultDocument.windowBounds = bounds;

    const initialScreenshot = await page.screenshot({
      clip: bounds,
      path: File.join(Execution.artifactDir, 'calculator-window-initial.png'),
      returnType: 'object',
    });
    if (
      !initialScreenshot
      || Number(initialScreenshot.width) !== Math.round(bounds.width)
      || Number(initialScreenshot.height) !== Math.round(bounds.height)
    ) {
      throw new Error('Calculator initial screenshot does not match the verified current window bounds');
    }
    resultDocument.initialScreenshot = initialScreenshot.path;
    writeResultDocument();

    const firstResult = await evaluateCalculatorExpression(input.expression, input.expected, 1);
    let finalResult = firstResult;
    if (input.followUp) {
      const dependentExpression = substituteFirstResult(input.followUp.expression, firstResult);
      resultDocument.followUpExpression = dependentExpression;
      finalResult = await evaluateCalculatorExpression(dependentExpression, input.followUp.expected, 2);
    }

    resultDocument.finalResult = finalResult;
    resultDocument.passed = resultDocument.calculations.every(item => item.verified === true);
    writeResultDocument();
    console.log(JSON.stringify({
      executionId: Execution.id,
      artifactDir: Execution.artifactDir,
      calculations: resultDocument.calculations.map(item => ({
        expression: item.expression,
        result: item.normalizedResult,
        verified: item.verified,
      })),
      finalResult,
      passed: resultDocument.passed,
    }));
    return resultDocument;
  } catch (error) {
    resultDocument.error = errorMessage(error);
    resultDocument.passed = false;
    writeResultDocument();
    throw error;
  }
}

main();
