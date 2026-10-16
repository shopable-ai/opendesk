// Run from the repository root after granting Screen Recording and Accessibility:
// ./dist/opendesk -script examples/desktop/ui-resolver-calculator-macos.js -console-mode script
//
// This is a real macOS Calculator example for the Runtime-owned UI Perception
// Resolver. It does not select an OCR provider, Accessibility backend, VLM, or
// fallback order. It preflights without input, then calculates 25 × 4 + 10 =,
// reads the actual 110, and calculates 6 × 110 = to read the actual 660.
'use strict';

const APP = {bundleId: 'com.apple.calculator'};
const CALCULATOR_PATH = '/System/Applications/Calculator.app/Contents/MacOS/Calculator';
const outputDir = File.join(File.cwd(), '.runtime', 'tests', 'automation-api-r1.3', `resolver-example-${Execution.id}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameWindow(left, right) {
  return !!left && !!right && typeof left.id === 'string' && left.id.length > 0
    && left.id === right.id && Number(left.pid) > 0 && Number(left.pid) === Number(right.pid)
    && Number(left.handle) > 0 && Number(left.handle) === Number(right.handle)
    && left.title === right.title;
}

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

function calculatorKey(win, label) {
  // Observed macOS 26.5.1 Chinese AX names, not OCR aliases.
  return win.title === '计算器' ? ({'×': '乘', '+': '加', '=': '等于'}[label] || label) : label;
}

function calculatorTarget(win, label) {
  const name = calculatorKey(win, label);
  // Numeric text can also belong to the display or a different OCR glyph.
  // The observed Chinese profile proves these exact, invokable AX buttons.
  return win.title === '计算器' && /^[0-9]$/.test(label) ? {role: 'button', name} : name;
}

async function findCalculatorKey(win, label) {
  // A region delegates to legacy OCR. Chinese AX names need the window Resolver.
  const intention = calculatorTarget(win, label);
  const options = {within: win, match: 'exact', timeout: 5000};
  let target;
  if (typeof intention === 'string') {
    target = await UI.findText(intention, options);
  } else {
    const candidates = (await UI.findTexts(intention.name, options)).filter(candidate =>
      candidate.source === 'accessibility' && candidate.role === intention.role && candidate.name === intention.name);
    assert(candidates.length === 1, `Calculator ${label} button is missing or ambiguous`);
    target = candidates[0];
  }
  assert(target, `Resolver did not find Calculator key ${label}`);
  if (win.title === '计算器') {
    assert(target.source === 'accessibility' && target.role === 'button'
      && target.name === calculatorKey(win, label) && target.actionable === true,
      `Calculator key ${label} is not a uniquely invokable native button`);
  }
  return target;
}

function calculatorRegions(win, observed) {
  if (win.title !== '计算器') return {};
  // Scope this profile to the saved golden-new-runtime AX/screenshot evidence
  // under .runtime/tests/automation-api-r1.3; derive regions from fresh AX data.
  const nodes = flatten(observed.root);
  assert(win.width === 230 && win.height === 408
    && nodes.filter(node => node.identifier === 'Mode: basic; unitConversion: false').length === 1,
    'unsupported Chinese Calculator layout or mode');
  const display = nodes.filter(node => node.identifier === 'StandardInputView');
  const keypad = nodes.filter(node => node.identifier === 'CalculatorKeypadView');
  assert(display.length === 1 && keypad.length === 1, 'Calculator display or keypad is ambiguous');
  function rect(node) {
    const bounds = node.nativeBounds;
    assert(bounds && bounds.coordinateSpace === 'macos-global-display-points-top-left'
      && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key]))
      && bounds.width > 0 && bounds.height > 0 && bounds.x >= win.x && bounds.y >= win.y
      && bounds.x + bounds.width <= win.x + win.width && bounds.y + bounds.height <= win.y + win.height,
      'Calculator AX region is not proven inside the bound window');
    return bounds;
  }
  function region(bounds) {
    // This observed native coordinate space shares WindowInfo's top-left basis.
    return Geometry.regionOffset(win, {
      left: bounds.x - win.x, top: bounds.y - win.y, width: bounds.width, height: bounds.height,
    });
  }
  const displayBounds = rect(display[0]);
  assert(displayBounds.height === 42, 'unsupported Calculator result region');
  const buttons = flatten(keypad[0]).filter(node => node.role === 'button');
  assert(buttons.length === 20, 'unsupported Calculator keypad');
  const bounds = buttons.map(rect);
  const left = Math.min(...bounds.map(value => value.x));
  const top = Math.min(...bounds.map(value => value.y));
  assert(top >= displayBounds.y + displayBounds.height, 'Calculator keypad overlaps the result region');
  return {
    display: region(displayBounds),
    keypad: region({x: left, y: top,
      width: Math.max(...bounds.map(value => value.x + value.width)) - left,
      height: Math.max(...bounds.map(value => value.y + value.height)) - top}),
  };
}

async function requireActiveCalculator(expected) {
  const active = await window.getActiveWindow();
  assert(active && active.isForeground === true && active.hasFocus === true, 'Calculator focus is not proven');
  assert(sameWindow(active, expected), 'the bound Calculator window is no longer active');
  assert(String(active.exePath || '') === CALCULATOR_PATH, 'the bound window is not system Calculator');
  assert(['x', 'y', 'width', 'height'].every(key => active[key] === expected[key]),
    'the bound Calculator window geometry changed');
  return active;
}

async function snapshot(win) {
  const observed = await Accessibility.snapshot({
    within: await requireActiveCalculator(win), timeout: 10000, maxDepth: 12, maxNodes: 2000,
    properties: ['role', 'name', 'identifier', 'value', 'enabled', 'actions', 'nativeBounds'],
  });
  assert(observed && observed.complete === true && observed.truncated === false && observed.root,
    'Calculator Accessibility observation is incomplete');
  return observed;
}

async function resolveCalculator() {
  await App.launch(APP, {activate: true, waitUntilReady: 'window', timeout: 10000});
  const raw = (await window.list()).filter(candidate =>
    String(candidate.exePath || '') === CALCULATOR_PATH && ['Calculator', '计算器'].includes(String(candidate.title || '')));
  const candidates = raw.filter((candidate, index, values) => values.findIndex(other =>
    String(other.id || '') === String(candidate.id || '')
      && Number(other.pid) === Number(candidate.pid)
      && String(other.handle || '') === String(candidate.handle || '')) === index);
  const foreground = candidates.filter(candidate => candidate.isForeground === true || candidate.hasFocus === true);
  assert(foreground.length === 1 || candidates.length === 1, 'Calculator window is missing or ambiguous');
  const selected = foreground.length === 1 ? foreground[0] : candidates[0];
  if (!sameWindow(await window.getActiveWindow(), selected)) {
    await window.activate(selected, {timeout: 3000});
  }
  return requireActiveCalculator(selected);
}

async function clearCalculator(win) {
  // C and AC are Calculator state labels, not part of the business expression.
  // Read the current native state name, then submit via the high-level Resolver.
  for (let press = 0; press < 2; press += 1) {
    const observed = await snapshot(win);
    calculatorRegions(win, observed);
    const clear = flatten(observed.root).filter(node => node.role === 'button'
      && ['AC', 'C', 'Clear', 'All Clear', '清除', '全部清除'].includes(String(node.name || '')) && node.enabled === true
      && Array.isArray(node.actions) && node.actions.includes('invoke'));
    assert(clear.length === 1, 'Calculator has no uniquely invokable C or AC control');
    await UI.tapText(String(clear[0].name), {within: win, match: 'exact', timeout: 5000});
  }
  return waitForRead(win, '0');
}

async function waitForRead(win, expected) {
  const regions = calculatorRegions(win, await snapshot(win));
  const deadline = Date.now() + 5000;
  let actual = null;
  while (Date.now() < deadline) {
    await requireActiveCalculator(win);
    actual = await UI.readText({within: win, ...(regions.display ? {region: regions.display} : {}), timeout: 3000});
    // SwiftUI prefixes the actual result with LRM; do not strip other content.
    if (win.title === '计算器') actual = actual.replace(/^\u200e/, '');
    if (actual === expected) return actual;
    await page.waitForTimeout(50);
  }
  throw new Error(`Calculator display expected ${expected}, got ${actual}`);
}

async function preflight(win) {
  const regions = calculatorRegions(win, await snapshot(win));
  const labels = ['2', '5', '×', '4', '+', '1', '0', '=', '6'].map(label => calculatorKey(win, label));
  const display = await UI.readText({within: win, ...(regions.display ? {region: regions.display} : {}), timeout: 3000});
  const resolved = {};
  for (const label of labels) {
    const target = await findCalculatorKey(win, label);
    assert(target, `Resolver did not find Calculator key ${label}`);
    resolved[label] = {
      source: target.source, text: target.text, bounds: target.bounds,
      role: target.role || null, name: target.name || null, actionable: target.actionable === true,
      intention: calculatorTarget(win, label),
    };
  }
  return {candidates: resolved, display, regions};
}

File.ensureDir(outputDir);

const result = {status: 'running', outputDir};
try {
  const capabilities = UI.getCapabilities();
  assert(capabilities.perception && capabilities.perception.resolver === true,
    'UI Perception Resolver is unavailable in this Runtime');
  assert(capabilities.perception.cloudVisual.defaultEnabled === false,
    'automatic cloud visual perception must remain disabled by default');

  const calculator = await resolveCalculator();
  result.window = calculator;
  const observed = await preflight(calculator); // no Calculator input yet
  await File.writeJSON(File.join(outputDir, 'preflight.json'), {window: calculator, ...observed, capabilities});

  await clearCalculator(calculator);
  result.firstActions = await UI.tapTargets(['2', '5', '×', '4', '+', '1', '0', '='].map(label => calculatorTarget(calculator, label)),
    {within: calculator, timeout: 30000});
  const firstResult = await waitForRead(calculator, '110');
  const firstScreenshot = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, 'first-result-110.png'), returnType: 'path',
  });

  const secondCalculator = await requireActiveCalculator(calculator);
  await clearCalculator(secondCalculator);
  result.secondActions = await UI.tapTargets(['6', '×', ...String(firstResult), '='].map(label => calculatorTarget(secondCalculator, label)),
    {within: secondCalculator, timeout: 30000});
  const finalResult = await waitForRead(secondCalculator, '660');
  const finalScreenshot = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, 'final-result-660.png'), returnType: 'path',
  });

  Object.assign(result, {status: 'passed', firstResult, finalResult, firstScreenshot, finalScreenshot});
  console.log(JSON.stringify({firstResult, finalResult, firstScreenshot, finalScreenshot, outputDir}));
} catch (error) {
  result.status = 'failed';
  result.error = {message: String(error.message || error), ...error};
  throw error;
} finally {
  await File.writeJSON(File.join(outputDir, 'result.json'), result);
}
