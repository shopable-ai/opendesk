// Explicit real macOS validation for the UI Perception Resolver.
// Run from the repository root only after granting Screen Recording and
// Accessibility permissions:
// OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM=authorized-calculator-fixture \
// ./dist/opendesk -script tests/runtime-api/ui-perception-resolver-calculator-macos.js -console-mode script
'use strict';

const CONFIRM_TOKEN = 'authorized-calculator-fixture';
const CALCULATOR = {bundleId: 'com.apple.calculator'};
const CALCULATOR_PATH = '/System/Applications/Calculator.app/Contents/MacOS/Calculator';
const outputDir = File.join(File.cwd(), '.runtime', 'tests', 'ui-perception', `calculator-${Execution.id}`);

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
function sameWindow(left, right) {
  if (left && right && left.id && right.id) return String(left.id) === String(right.id);
  return Number(left && left.pid) === Number(right && right.pid)
    && String(left && left.title || '') === String(right && right.title || '');
}
async function requireActiveCalculator(expected) {
  const active = await window.getActiveWindow();
  assert(sameWindow(active, expected), 'Calculator is not the current bound window', {expected, active});
  assert(String(active.exePath || '') === CALCULATOR_PATH, 'active window is not system Calculator', active);
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
    String(candidate.exePath || '') === CALCULATOR_PATH && String(candidate.title || '') === 'Calculator');
  // Window.list may contain repeated records for one native window while other
  // concurrent test sessions legitimately own background Calculator windows.
  // Deduplicate only exact native identity and bind only the one foreground
  // instance; do not choose a background same-title replacement.
  const candidates = rawCandidates.filter((candidate, index, values) => values.findIndex((other) =>
    String(other.id || '') === String(candidate.id || '')
      && Number(other.pid) === Number(candidate.pid)
      && String(other.handle || '') === String(candidate.handle || '')) === index);
  const foreground = candidates.filter((candidate) => candidate.isForeground === true || candidate.hasFocus === true);
  assert(foreground.length === 1, 'expected one foreground Calculator window', {
    rawCount: rawCandidates.length, uniqueCount: candidates.length, foregroundCount: foreground.length, candidates,
  });
  const selected = foreground[0];
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
    const clear = flatten(observed.root).filter((node) => node.role === 'button'
      && ['AC', 'C', 'Clear', 'All Clear', '清除', '全部清除'].includes(String(node.name || ''))
      && node.enabled === true && Array.isArray(node.actions) && node.actions.includes('invoke'));
    assert(clear.length === 1, 'Calculator clear control is not uniquely invokable', {count: clear.length});
    // Use the ordinary text intention after this read-only preflight; the
    // resolver owns source selection and exactly-once input.
    await UI.tapText(String(clear[0].name), {within: win, timeout: 5000});
  }
  return waitForRead(win, '0');
}
async function waitForRead(win, expected) {
  const deadline = Date.now() + 5000;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await UI.readText({within: win, timeout: 3000});
    if (actual === expected) return actual;
    await page.waitForTimeout(50);
  }
  fail('Calculator display did not reach independent expected oracle', {expected, actual});
}
async function preflight(win) {
  const labels = ['2', '5', '×', '4', '+', '1', '0', '=', '6'];
  // Preserve raw local evidence before asking the Resolver to make a decision.
  // If a symbol is missed, this is the input for a targeted diagnosis rather
  // than a reason to guess an alias or submit any input.
  const preflightImage = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, '00-preflight.png'), returnType: 'path',
  });
  const rawOCR = await Vision.runOCR({imagePath: preflightImage, timeoutMs: 10000});
  const ax = await snapshot(win);
  const evidence = {
    window: await requireActiveCalculator(win),
    ocr: {provider: rawOCR.provider, text: rawOCR.text, lines: rawOCR.lines},
    accessibility: flatten(ax.root).filter((node) => ['×', '4', '='].includes(String(node.name || '')))
      .map((node) => ({role: node.role, name: node.name, identifier: node.identifier || null,
        bounds: node.bounds || null, nativeBounds: node.nativeBounds || null, value: node.value || null})),
  };
  const candidates = {};
  try {
    for (const label of labels) {
      const candidate = await UI.findText(label, {within: win, timeout: 5000});
      assert(candidate, 'Resolver preflight did not find Calculator key', {label});
      candidates[label] = {
        source: candidate.source, text: candidate.text, normalizedText: candidate.normalizedText || null,
        bounds: candidate.bounds, role: candidate.role || null, name: candidate.name || null,
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
  return {candidates, preflightImage};
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
  result.firstActions = await UI.tapTexts(['2', '5', '×', '4', '+', '1', '0', '='], {within: win, timeout: 5000});
  result.firstResult = await waitForRead(win, '110'); // actual UI read; 110 is only an independent oracle
  result.firstScreenshot = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, '01-first-result.png'), returnType: 'path',
  });
  const secondWindow = await requireActiveCalculator(win);
  await clearCalculator(secondWindow);
  result.secondActions = await UI.tapTexts(['6', '×', ...String(result.firstResult), '='], {within: secondWindow, timeout: 5000});
  result.finalResult = await waitForRead(secondWindow, '660'); // actual UI read; 660 is only an independent oracle
  result.finalScreenshot = await page.screenshot({
    target: 'activeWindow', path: File.join(outputDir, '02-final-result.png'), returnType: 'path',
  });
  result.status = 'passed';
  console.log(JSON.stringify({firstResult: result.firstResult, finalResult: result.finalResult, outputDir}));
} catch (error) {
  result.status = 'failed';
  result.error = {code: error && error.code || null, operation: error && error.operation || null,
    actionState: error && error.actionState || null, message: String(error && error.message || error)};
  throw error;
} finally {
  await File.writeJSON(File.join(outputDir, 'result.json'), result);
}
