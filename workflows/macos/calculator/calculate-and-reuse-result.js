// OpenDesk reference Workflow: calculate, read the real display result, and
// reuse that result in a second Calculator operation.
//
// Public command (from the repository root):
//   ./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
//
// Optional Execution.input overrides are intentionally secondary. With no
// input, this file is a complete, readable business task.

const taskContract = Object.freeze({
  goal: 'In macOS Calculator, calculate 125*8, then reuse the real first display result in a dependent calculation.',
  successCriteria: Object.freeze([
    'Calculator is the com.apple.calculator application and one verified window identity remains active.',
    'The first calculation Display ROI OCR normalizes to 1000.',
    'The second expression is built from that OCR value as firstResult/4+37, never from JavaScript arithmetic.',
    'The second calculation Display ROI OCR normalizes to 287.',
  ]),
  application: Object.freeze({ bundleId: 'com.apple.calculator', surface: 'one visible Calculator window' }),
  verifiedLayout: 'macOS Calculator Standard/Basic 232x321 points',
  qualificationAssumptions: Object.freeze([
    'macOS Screen Recording and Accessibility are already granted to the OpenDesk host.',
    'The packaged Apple Vision OCR provider, or another documented OCR provider, is available.',
    'The Calculator window is visible on one display and can be safely normalized to Basic layout.',
  ]),
});

const CALCULATOR_BUNDLE_ID = taskContract.application.bundleId;
const CALCULATOR_LAYOUT = Object.freeze({
  safeSize: Object.freeze({ width: 232, height: 321, tolerance: 2 }),
  displayRegion: Object.freeze({ left: 3, top: 9, width: 94, height: 16 }),
  keyPoints: Object.freeze({
    clear: Object.freeze({ x: 12.1, y: 32.7 }),
    '/': Object.freeze({ x: 87.1, y: 32.7 }),
    '7': Object.freeze({ x: 12.1, y: 47.4 }),
    '8': Object.freeze({ x: 36.6, y: 47.4 }),
    '9': Object.freeze({ x: 61.6, y: 47.4 }),
    '*': Object.freeze({ x: 87.1, y: 47.4 }),
    '4': Object.freeze({ x: 12.1, y: 62.3 }),
    '5': Object.freeze({ x: 36.6, y: 62.3 }),
    '6': Object.freeze({ x: 61.6, y: 62.3 }),
    '-': Object.freeze({ x: 87.1, y: 62.3 }),
    '1': Object.freeze({ x: 12.1, y: 77.3 }),
    '2': Object.freeze({ x: 36.6, y: 77.3 }),
    '3': Object.freeze({ x: 61.6, y: 77.3 }),
    '+': Object.freeze({ x: 87.1, y: 77.3 }),
    '0': Object.freeze({ x: 24.5, y: 92.5 }),
    '.': Object.freeze({ x: 61.6, y: 92.5 }),
    '=': Object.freeze({ x: 87.1, y: 92.5 }),
  }),
});

let calculatorRun;
let resultDocument;

function message(error) {
  return String(error && error.message ? error.message : error);
}

function boundsOf(info) {
  return { x: Number(info.x), y: Number(info.y), width: Number(info.width), height: Number(info.height) };
}

function near(actual, expected, tolerance) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function writeResult() {
  if (!resultDocument || !Execution.artifactDir) return;
  File.write(
    File.join(Execution.artifactDir, 'calculator-workflow-result.json'),
    JSON.stringify(resultDocument, null, 2) + '\n',
  );
}

function tokenize(expression) {
  const compact = String(expression).replace(/\s+/g, '');
  if (!compact || /[^0-9.+\-*/=]/.test(compact)) throw new Error(`Unsupported Calculator expression: ${JSON.stringify(expression)}`);
  const equals = (compact.match(/=/g) || []).length;
  if (equals > 1 || (equals === 1 && !compact.endsWith('='))) throw new Error('Calculator expression may contain one trailing equals sign');
  const body = compact.endsWith('=') ? compact.slice(0, -1) : compact;
  const parts = body.split(/([+\-*/])/);
  if (!body || parts.length % 2 === 0) throw new Error('Calculator expression has a missing operand');
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 1 && !/^[+\-*/]$/.test(parts[index])) throw new Error('Calculator expression has an invalid operator');
    if (index % 2 === 0 && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(parts[index])) throw new Error(`Invalid numeric operand ${JSON.stringify(parts[index])}`);
  }
  return body.split('').concat('=');
}

function expectedText(value, label) {
  if (!['string', 'number'].includes(typeof value)) throw new Error(`${label} must be a string or number`);
  return normalizeDisplay(String(value));
}

function resolveTask(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Execution.input must be an object');
  const task = {
    firstExpression: '125*8',
    firstExpected: '1000',
    followUpTemplate: '{result}/4+37',
    followUpExpected: '287',
  };
  if (Object.keys(input).length === 0) return task;
  if (input.expression !== undefined) task.firstExpression = input.expression;
  if (input.expected !== undefined) task.firstExpected = input.expected;
  if (input.followUp !== undefined) {
    if (!input.followUp || typeof input.followUp !== 'object' || Array.isArray(input.followUp)) throw new Error('Execution.input.followUp must be an object');
    if (input.followUp.expression !== undefined) task.followUpTemplate = input.followUp.expression;
    if (input.followUp.expected !== undefined) task.followUpExpected = input.followUp.expected;
  }
  if (typeof task.firstExpression !== 'string' || !task.firstExpression.trim()) throw new Error('first Calculator expression must be a non-empty string');
  if (typeof task.followUpTemplate !== 'string' || !task.followUpTemplate.includes('{result}')) throw new Error('follow-up expression must contain {result}');
  tokenize(task.firstExpression);
  tokenize(task.followUpTemplate.split('{result}').join('0'));
  task.firstExpected = expectedText(task.firstExpected, 'first expected result');
  task.followUpExpected = expectedText(task.followUpExpected, 'follow-up expected result');
  return task;
}

async function resolveCalculator() {
  const application = await App.launch({ bundleId: CALCULATOR_BUNDLE_ID }, { waitUntilReady: 'window', timeout: 15000 });
  if (!application || application.bundleId !== CALCULATOR_BUNDLE_ID || !Array.isArray(application.pids) || application.pids.length === 0) throw new Error('Calculator application identity could not be resolved');
  const pids = new Set(application.pids.map(Number));
  const matches = (await window.list()).filter(item => pids.has(Number(item.pid)));
  if (matches.length !== 1) throw new Error(`Calculator window identity is ambiguous: found ${matches.length}`);
  const target = matches[0];
  if (!target.id || Number(target.pid) <= 0 || Number(target.width) <= 0 || Number(target.height) <= 0) throw new Error('Calculator window metadata is incomplete');
  return { application, pids, window: target };
}

async function currentCalculatorBounds() {
  if (!calculatorRun) throw new Error('Calculator has not been resolved');
  const matches = (await window.list()).filter(item => calculatorRun.pids.has(Number(item.pid)));
  if (matches.length !== 1) throw new Error(`Calculator window became ambiguous or stale: found ${matches.length}`);
  const current = matches[0];
  if (String(current.id) !== String(calculatorRun.window.id) || Number(current.pid) !== Number(calculatorRun.window.pid)) throw new Error('Calculator window lifecycle identity changed');
  calculatorRun.window = current;
  return current;
}

async function requireActiveCalculator(refocus) {
  let active = await window.getActiveWindow();
  let same = active && String(active.id) === String(calculatorRun.window.id) && Number(active.pid) === Number(calculatorRun.window.pid);
  if (!same && refocus) {
    await currentCalculatorBounds();
    let lastFocusError;
    for (let attempt = 0; attempt < 3 && !same; attempt += 1) {
      try {
        await window.focus(calculatorRun.window.title);
      } catch (error) {
        lastFocusError = error;
      }
      await page.waitForTimeout(100 + attempt * 120);
      active = await window.getActiveWindow();
      same = active && String(active.id) === String(calculatorRun.window.id) && Number(active.pid) === Number(calculatorRun.window.pid);
    }
    if (!same && lastFocusError) throw lastFocusError;
  }
  if (!same) throw new Error('Active window is not the resolved Calculator identity');
  return active;
}

async function clickOCRMenuText(label, screenshotName, display) {
  const menuScope = Geometry.regionOffset(display, { left: 0, top: 0, width: display.width, height: label === '显示' ? 50 : 180 });
  const clip = roundedScreenRegion(menuScope);
  const imagePath = File.join(Execution.artifactDir, screenshotName);
  await page.screenshot({ clip, path: imagePath, returnType: 'path' });
  const ocr = await Vision.runOCR({ imagePath, provider: 'apple', lang: 'ch' });
  const matches = (ocr.lines || []).filter(line => String(line.text || '').includes(label));
  if (matches.length === 0) throw new Error(`Expected an OCR menu line for ${label}, found none`);
  const minY = Math.min(...matches.map(line => Number(line.bbox && line.bbox.y)));
  const topMatches = matches.filter(line => Math.abs(Number(line.bbox && line.bbox.y) - minY) <= 4);
  if (topMatches.length !== 1) throw new Error(`Expected one topmost OCR menu line for ${label}, found ${topMatches.length} of ${matches.length}`);
  const line = topMatches[0];
  const text = String(line.text);
  const start = text.indexOf(label);
  const charWidth = Number(line.bbox.width) / text.length;
  const point = {
    x: clip.x + Number(line.bbox.x) + charWidth * (start + label.length / 2),
    y: clip.y + Number(line.bbox.y) + Number(line.bbox.height) / 2,
  };
  if (![point.x, point.y].every(Number.isFinite)) throw new Error(`OCR menu point for ${label} is not finite`);
  await mouse.click(point.x, point.y);
  await page.waitForTimeout(220);
  return point;
}

async function selectCalculatorViewOption(label, display) {
  const optionIndex = { '标准型': 0, '科学型': 1 }[label];
  if (optionIndex === undefined) throw new Error(`Unsupported Calculator View option ${label}`);
  const menuPoint = await clickOCRMenuText('显示', 'calculator-view-menu.png', display);
  const openMenu = roundedScreenRegion(Geometry.regionOffset(display, { left: 0, top: 0, width: display.width, height: 180 }));
  await page.screenshot({ clip: openMenu, path: File.join(Execution.artifactDir, 'calculator-view-menu-open.png'), returnType: 'path' });
  const optionPoint = { x: menuPoint.x + 20, y: menuPoint.y + 27 + optionIndex * 23 };
  await mouse.click(optionPoint.x, optionPoint.y);
  await page.waitForTimeout(220);
}

async function selectCalculatorView(label) {
  const active = await requireActiveCalculator(true);
  const center = Geometry.center(active);
  const display = Screen.getDisplays().find(item => Geometry.contains(Geometry.rect(item), center));
  if (!display) throw new Error('Calculator window is not inside an identifiable display');
  await selectCalculatorViewOption(label, display);
  await page.waitForTimeout(350);
  await requireActiveCalculator(false);
}

async function normalizeLayout() {
  const safe = CALCULATOR_LAYOUT.safeSize;
  let current = await currentCalculatorBounds();
  const initial = boundsOf(current);
  const layout = { verifiedLayout: taskContract.verifiedLayout, initialBounds: initial, recoveryActions: [], recovered: false, verified: false };
  resultDocument.layout = layout;
  if (!near(current.width, safe.width, safe.tolerance) || !near(current.height, safe.height, safe.tolerance)) {
    await selectCalculatorView('标准型');
    layout.recoveryActions.push('select-basic-with-view-menu');
    current = await currentCalculatorBounds();
  }
  if (!near(current.width, safe.width, safe.tolerance) || !near(current.height, safe.height, safe.tolerance)) {
    await window.setWindowBounds(calculatorRun.window.title, initial.x, initial.y, safe.width, safe.height);
    layout.recoveryActions.push('restore-safe-bounds');
    await page.waitForTimeout(250);
    current = await currentCalculatorBounds();
  }
  if (!near(current.x, initial.x, safe.tolerance) || !near(current.y, initial.y, safe.tolerance)) {
    await window.setWindowBounds(calculatorRun.window.title, initial.x, initial.y, safe.width, safe.height);
    layout.recoveryActions.push('restore-detected-position');
    await page.waitForTimeout(250);
    current = await currentCalculatorBounds();
  }
  layout.finalBounds = boundsOf(current);
  if (!near(current.width, safe.width, safe.tolerance) || !near(current.height, safe.height, safe.tolerance)) throw new Error(`Unsupported Calculator layout ${current.width}x${current.height}`);
  if (!near(current.x, initial.x, safe.tolerance) || !near(current.y, initial.y, safe.tolerance)) throw new Error('Calculator recovery changed its verified position');
  layout.recovered = layout.recoveryActions.length > 0;
  layout.verified = true;
  return current;
}

function roundedScreenRegion(region) {
  return { x: Math.round(region.x), y: Math.round(region.y), width: Math.max(1, Math.round(region.width)), height: Math.max(1, Math.round(region.height)) };
}

async function pressKey(key) {
  const relative = CALCULATOR_LAYOUT.keyPoints[key];
  if (!relative) throw new Error(`Unsupported Calculator key: ${JSON.stringify(key)}`);
  const active = await requireActiveCalculator(true);
  const point = Geometry.pointPercent(active, relative.x, relative.y);
  const current = Geometry.rect(active);
  if (!Geometry.contains(current, point)) throw new Error(`Calculator key ${key} projected outside the current window`);
  await mouse.clickForPID(Number(active.pid), point.x, point.y);
  await page.waitForTimeout(key === '=' ? 180 : 70);
}

async function clearCalculator() {
  await pressKey('clear');
  await pressKey('clear');
}

async function enterExpression(expression) {
  for (const key of tokenize(expression)) await pressKey(key);
}

async function captureDisplay(number) {
  const active = await requireActiveCalculator(false);
  const region = Geometry.regionPercent(active, CALCULATOR_LAYOUT.displayRegion);
  const clip = roundedScreenRegion(region);
  const path = File.join(Execution.artifactDir, `calculator-display-${number}.png`);
  const screenshot = await page.screenshot({ clip, path, returnType: 'object' });
  if (!screenshot || !screenshot.path || Number(screenshot.width) <= 0 || Number(screenshot.height) <= 0) throw new Error(`Calculator display ${number} screenshot is unavailable`);
  return screenshot;
}

async function runOCR(imagePath) {
  const capabilities = await Vision.getCapabilities({});
  const providers = Array.isArray(capabilities.providers) ? capabilities.providers : [];
  const candidates = [
    providers.find(item => item.provider === 'apple' && item.implemented && item.available),
    providers.find(item => item.provider === 'local' && item.implemented),
    providers.find(item => item.provider === 'paddle' && item.implemented && (!item.endpointRequired || item.endpointConfigured)),
  ].filter(Boolean);
  if (candidates.length === 0) throw new Error('No documented OCR provider is available for Calculator');
  let lastError;
  for (const candidate of candidates) {
    try {
      const response = await Vision.runOCR({ imagePath, provider: candidate.provider, lang: candidate.provider === 'apple' ? 'en' : 'eng', recognitionLevel: 'accurate' });
      return { provider: `Vision/${response.provider || candidate.provider}`, rawText: response.text, lines: Array.isArray(response.lines) ? response.lines : [] };
    } catch (error) { lastError = error; }
  }
  throw new Error(`Calculator Display OCR failed: ${message(lastError)}`);
}

function normalizeDisplay(rawText) {
  const raw = String(rawText == null ? '' : rawText);
  const cleaned = raw.replace(/[\s,，'’]/g, '').replace(/[−–—﹣－]/g, '-').replace(/^[^0-9+\-.]+/, '').replace(/[^0-9.]+$/, '');
  const matches = cleaned.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) || [];
  if (matches.length !== 1) throw new Error(`Calculator Display OCR is not one numeric value: ${JSON.stringify(raw)}`);
  return matches[0].replace(/^\+/, '');
}

async function readDisplay(number) {
  const screenshot = await captureDisplay(number);
  try {
    const ocr = await runOCR(screenshot.path);
    return { screenshot, ocr, rawDisplay: ocr.rawText, normalizedResult: normalizeDisplay(ocr.rawText) };
  } catch (error) {
    File.write(File.join(Execution.artifactDir, `calculator-display-${number}-ocr-error.json`), JSON.stringify({ screenshot, error: message(error) }, null, 2) + '\n');
    throw error;
  }
}

async function calculate(label, expression, expected, number) {
  await clearCalculator();
  await enterExpression(expression);
  const display = await readDisplay(number);
  const calculation = { label, expression, expected, rawDisplay: display.rawDisplay, normalizedResult: display.normalizedResult, displayScreenshot: display.screenshot.path, ocr: { provider: display.ocr.provider, lines: display.ocr.lines }, verified: display.normalizedResult === expected };
  resultDocument.calculations.push(calculation);
  if (!calculation.verified) throw new Error(`${label} mismatch: expected ${expected}, observed ${display.normalizedResult}`);
  writeResult();
  return display.normalizedResult;
}

async function main() {
  resultDocument = { executionId: Execution.id, workflow: 'macos/calculator/calculate-and-reuse-result', taskContract, input: Execution.input, application: { bundleId: CALCULATOR_BUNDLE_ID, pid: 0, windowId: '', windowTitle: '' }, calculations: [], reuse: null, passed: false };
  try {
    const task = resolveTask(Execution.input);
    resultDocument.task = task;
    await page.ensurePermissions({ capabilities: ['screenCapture', 'accessibility'], openSettings: false });
    calculatorRun = await resolveCalculator();
    resultDocument.application.pid = Number(calculatorRun.window.pid);
    resultDocument.application.windowId = String(calculatorRun.window.id);
    resultDocument.application.windowTitle = String(calculatorRun.window.title || '');
    await requireActiveCalculator(true);
    const layout = await normalizeLayout();
    resultDocument.windowBounds = boundsOf(layout);
    const initial = await page.screenshot({ clip: roundedScreenRegion(Geometry.rect(layout)), path: File.join(Execution.artifactDir, 'calculator-window-initial.png'), returnType: 'object' });
    if (!initial || Number(initial.width) !== Math.round(layout.width) || Number(initial.height) !== Math.round(layout.height)) throw new Error('Calculator initial screenshot does not match current bounds');
    resultDocument.initialScreenshot = initial.path;
    writeResult();

    const firstResult = await calculate('first calculation', task.firstExpression, task.firstExpected, 1);
    const dependentExpression = task.followUpTemplate.split('{result}').join(firstResult);
    tokenize(dependentExpression);
    resultDocument.reuse = { source: 'Calculator Display ROI OCR', firstResult, expressionTemplate: task.followUpTemplate, resolvedExpression: dependentExpression };
    const finalResult = await calculate('dependent calculation', dependentExpression, task.followUpExpected, 2);
    resultDocument.finalResult = finalResult;
    resultDocument.passed = resultDocument.calculations.every(item => item.verified === true) && resultDocument.reuse.firstResult === firstResult;
    if (!resultDocument.passed) throw new Error('Calculator Workflow success criteria were not all verified');
    writeResult();
    console.log(JSON.stringify({ executionId: Execution.id, artifactDir: Execution.artifactDir, workflow: resultDocument.workflow, firstResult, dependentExpression, finalResult, passed: true }));
    return resultDocument;
  } catch (error) {
    resultDocument.error = message(error);
    resultDocument.passed = false;
    writeResult();
    throw error;
  }
}

main();
