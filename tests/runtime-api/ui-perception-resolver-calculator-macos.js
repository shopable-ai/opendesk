// Explicit real macOS validation for the UI Perception Resolver.
// Run from the repository root only after granting Screen Recording and
// Accessibility permissions:
// OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM=authorized-calculator-fixture \
// ./dist/opendesk -script tests/runtime-api/ui-perception-resolver-calculator-macos.js -console-mode script
'use strict';

const CONFIRM_TOKEN = 'authorized-calculator-fixture';
const CALCULATOR = {bundleId: 'com.apple.calculator'};
const CALCULATOR_PATH = '/System/Applications/Calculator.app/Contents/MacOS/Calculator';
const outputDir = File.join(File.cwd(), '.runtime', 'tests', 'automation-api-r1.3', `resolver-calculator-${Execution.id}`);

function fail(message, details) {
  throw new Error(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}
function assert(condition, message, details) {
  if (!condition) fail(message, details);
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
function sameWindow(left, right) {
  return !!left && !!right && typeof left.id === 'string' && left.id.length > 0
    && left.id === right.id && Number(left.pid) > 0 && Number(left.pid) === Number(right.pid)
    && Number(left.handle) > 0 && Number(left.handle) === Number(right.handle)
    && left.title === right.title;
}
async function requireActiveCalculator(expected) {
  const active = await window.getActiveWindow();
  assert(active && active.isForeground === true && active.hasFocus === true, 'Calculator focus is not proven');
  assert(sameWindow(active, expected), 'Calculator is not the current bound window', {expected, active});
  assert(String(active.exePath || '') === CALCULATOR_PATH, 'active window is not system Calculator', active);
  assert(['x', 'y', 'width', 'height'].every(key => active[key] === expected[key]),
    'the bound Calculator window geometry changed', {expected, active});
  return active;
}
async function resolveCalculator() {
  assert(System.getPlatformInfo().os === 'darwin', 'this test requires macOS');
  const accessibility = Accessibility.getCapabilities();
  assert(accessibility && accessibility.permission && accessibility.permission.granted === true,
    'Calculator test requires granted Accessibility permission', accessibility);
  const permissions = await page.checkPermissions({capabilities: ['screenCapture', 'accessibility']});
  const granted = permissions && permissions.permissions && permissions.permissions.capabilities || {};
  assert(granted.screenCapture === true || granted.screenCapture && granted.screenCapture.granted === true,
    'Calculator test requires Screen Recording permission', permissions);
  assert(granted.accessibility === true || granted.accessibility && granted.accessibility.granted === true,
    'Calculator test requires Accessibility permission', permissions);
  await App.launch(CALCULATOR, {activate: true, waitUntilReady: 'window', timeout: 10000});
  const rawCandidates = (await window.list()).filter((candidate) =>
    String(candidate.exePath || '') === CALCULATOR_PATH && ['Calculator', '计算器'].includes(String(candidate.title || '')));
  // Window.list may contain repeated records for one native window while other
  // concurrent test sessions legitimately own background Calculator windows.
  // Deduplicate exact native identity; when activation is still settling,
  // only a unique system Calculator window may be explicitly activated.
  const candidates = rawCandidates.filter((candidate, index, values) => values.findIndex((other) =>
    String(other.id || '') === String(candidate.id || '')
      && Number(other.pid) === Number(candidate.pid)
      && String(other.handle || '') === String(candidate.handle || '')) === index);
  const foreground = candidates.filter((candidate) => candidate.isForeground === true || candidate.hasFocus === true);
  assert(foreground.length === 1 || candidates.length === 1, 'Calculator window is missing or ambiguous', {
    rawCount: rawCandidates.length, uniqueCount: candidates.length, foregroundCount: foreground.length, candidates,
  });
  const selected = foreground.length === 1 ? foreground[0] : candidates[0];
  let active = await window.getActiveWindow();
  if (!sameWindow(active, selected)) {
    // Reuse the exact WindowInfo action: title-based bringToTop would need to
    // enumerate all same-title Calculator windows again.
    active = await window.activate(selected, {timeout: 3000});
  }
  await requireActiveCalculator(selected);
  return selected;
}
async function snapshot(win) {
  const active = await requireActiveCalculator(win);
  const value = await Accessibility.snapshot({
    within: active, timeout: 10000, maxDepth: 12, maxNodes: 2000,
    properties: ['role', 'name', 'identifier', 'value', 'enabled', 'actions', 'bounds', 'nativeBounds'],
  });
  assert(value && value.complete === true && value.truncated === false && value.root,
    'Calculator Accessibility observation is incomplete', value && {complete: value.complete, truncated: value.truncated, reason: value.reason});
  return value;
}
async function clearCalculator(win) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const observed = await snapshot(win);
    calculatorRegions(win, observed);
    const clear = flatten(observed.root).filter((node) => node.role === 'button'
      && ['AC', 'C', 'Clear', 'All Clear', '清除', '全部清除'].includes(String(node.name || ''))
      && node.enabled === true && Array.isArray(node.actions) && node.actions.includes('invoke'));
    assert(clear.length === 1, 'Calculator clear control is not uniquely invokable', {count: clear.length});
    // Use the ordinary text intention after this read-only preflight; the
    // resolver owns source selection and exactly-once input.
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
  fail('Calculator display did not reach independent expected oracle', {expected, actual});
}
async function preflight(win) {
  const labels = ['2', '5', '×', '4', '+', '1', '0', '=', '6'].map(label => calculatorKey(win, label));
  // Preserve raw local evidence before asking the Resolver to make a decision.
  // If a symbol is missed, this is the input for a targeted diagnosis rather
  // than a reason to guess an alias or submit any input.
  const preflightImage = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, '00-preflight.png'), returnType: 'path',
  });
  const rawOCR = await Vision.runOCR({imagePath: preflightImage, timeoutMs: 10000});
  const ax = await snapshot(win);
  const regions = calculatorRegions(win, ax);
  const evidence = {
    window: await requireActiveCalculator(win),
    ocr: {provider: rawOCR.provider, text: rawOCR.text, lines: rawOCR.lines},
    regions,
    accessibility: flatten(ax.root).filter((node) => ['×', '乘', '4', '+', '加', '=', '等于'].includes(String(node.name || '')))
      .map((node) => ({role: node.role, name: node.name, identifier: node.identifier || null,
        bounds: node.bounds || null, nativeBounds: node.nativeBounds || null, value: node.value || null})),
  };
  const candidates = {};
  try {
    evidence.display = await UI.readText({within: win, ...(regions.display ? {region: regions.display} : {}), timeout: 3000});
    for (const label of labels) {
      const candidate = await findCalculatorKey(win, label);
      assert(candidate, 'Resolver preflight did not find Calculator key', {label});
      candidates[label] = {
        source: candidate.source, text: candidate.text, normalizedText: candidate.normalizedText || null,
        bounds: candidate.bounds, role: candidate.role || null, name: candidate.name || null,
        actionable: candidate.actionable === true, intention: calculatorTarget(win, label),
      };
    }
  } catch (error) {
    evidence.resolverError = {code: error && error.code || null, message: String(error && error.message || error)};
    evidence.candidates = candidates;
    await File.writeJSON(File.join(outputDir, '00-preflight.json'), evidence);
    throw error;
  }
  evidence.candidates = candidates;
  await File.writeJSON(File.join(outputDir, '00-preflight.json'), evidence);
  return {candidates, preflightImage, regions};
}

if (Execution.env.OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM !== CONFIRM_TOKEN) {
  fail(`live Calculator input is disabled; set OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM=${CONFIRM_TOKEN}`);
}

File.ensureDir(outputDir);
const result = {live: true, status: 'not-run', firstResult: null, finalResult: null, outputDir};
try {
  const capabilities = UI.getCapabilities();
  assert(capabilities.perception && capabilities.perception.resolver === true,
    'UI Perception Resolver is not installed', capabilities);
  assert(capabilities.perception.cloudVisual.defaultEnabled === false,
    'cloud visual observation must remain disabled by default', capabilities.perception.cloudVisual);
  const win = await resolveCalculator();
  result.preflight = await preflight(win); // no desktop input has occurred before this point
  await clearCalculator(win);
  result.firstActions = await UI.tapTargets(['2', '5', '×', '4', '+', '1', '0', '='].map(label => calculatorTarget(win, label)),
    {within: win, timeout: 30000});
  result.firstResult = await waitForRead(win, '110'); // actual UI read; 110 is only an independent oracle
  result.firstScreenshot = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, '01-first-result.png'), returnType: 'path',
  });
  const secondWindow = await requireActiveCalculator(win);
  await clearCalculator(secondWindow);
  result.secondActions = await UI.tapTargets(['6', '×', ...String(result.firstResult), '='].map(label => calculatorTarget(secondWindow, label)),
    {within: secondWindow, timeout: 30000});
  result.finalResult = await waitForRead(secondWindow, '660'); // actual UI read; 660 is only an independent oracle
  result.finalScreenshot = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, '02-final-result.png'), returnType: 'path',
  });
  result.status = 'passed';
  console.log(JSON.stringify({firstResult: result.firstResult, finalResult: result.finalResult, outputDir}));
} catch (error) {
  result.status = 'failed';
  result.error = {code: error && error.code || null, operation: error && error.operation || null,
    actionState: error && error.actionState || null, message: String(error && error.message || error),
    failedIndex: error && error.failedIndex, failedPhase: error && error.failedPhase,
    candidateCount: error && error.candidateCount, candidates: error && error.candidates,
    completed: error && error.completed, cause: error && error.cause};
  throw error;
} finally {
  await File.writeJSON(File.join(outputDir, 'result.json'), result);
}
