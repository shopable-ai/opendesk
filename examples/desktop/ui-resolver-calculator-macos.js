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
const outputDir = File.join(File.cwd(), '.runtime', 'examples', 'ui-perception-resolver-calculator', Execution.id);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameWindow(left, right) {
  if (left && right && left.id && right.id) return String(left.id) === String(right.id);
  return Number(left && left.pid) === Number(right && right.pid)
    && String(left && left.title || '') === String(right && right.title || '');
}

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

async function requireActiveCalculator(expected) {
  const active = await window.getActiveWindow();
  assert(sameWindow(active, expected), 'the bound Calculator window is no longer active');
  assert(String(active.exePath || '') === CALCULATOR_PATH, 'the bound window is not system Calculator');
  return active;
}

async function resolveCalculator() {
  await App.launch(APP, {activate: true, waitUntilReady: 'window', timeout: 10000});
  const raw = (await window.list()).filter(candidate =>
    String(candidate.exePath || '') === CALCULATOR_PATH && String(candidate.title || '') === 'Calculator');
  const candidates = raw.filter((candidate, index, values) => values.findIndex(other =>
    String(other.id || '') === String(candidate.id || '')
      && Number(other.pid) === Number(candidate.pid)
      && String(other.handle || '') === String(candidate.handle || '')) === index);
  const foreground = candidates.filter(candidate => candidate.isForeground === true || candidate.hasFocus === true);
  assert(foreground.length === 1, 'expected exactly one foreground Calculator window');
  const selected = foreground[0];
  if (!sameWindow(await window.getActiveWindow(), selected)) {
    await window.activate(selected, {timeout: 3000});
  }
  return requireActiveCalculator(selected);
}

async function clearCalculator(win) {
  // C and AC are Calculator state labels, not part of the business expression.
  // Read the current native state name, then submit via the high-level Resolver.
  for (let press = 0; press < 2; press += 1) {
    const snapshot = await Accessibility.snapshot({
      within: win, timeout: 10000, maxDepth: 12, maxNodes: 2000,
      properties: ['role', 'name', 'enabled', 'actions'],
    });
    assert(snapshot && snapshot.complete === true && snapshot.truncated === false,
      'Calculator clear-state observation is incomplete');
    const clear = flatten(snapshot.root).filter(node => node.role === 'button'
      && ['AC', 'C', 'Clear', 'All Clear', '清除', '全部清除'].includes(String(node.name || '')) && node.enabled === true
      && Array.isArray(node.actions) && node.actions.includes('invoke'));
    assert(clear.length === 1, 'Calculator has no uniquely invokable C or AC control');
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
  throw new Error(`Calculator display expected ${expected}, got ${actual}`);
}

async function preflight(win) {
  const labels = ['2', '5', '×', '4', '+', '1', '0', '=', '6'];
  const resolved = {};
  for (const label of labels) {
    const target = await UI.findText(label, {within: win, timeout: 5000});
    assert(target, `Resolver did not find Calculator key ${label}`);
    resolved[label] = {source: target.source, text: target.text, bounds: target.bounds};
  }
  return resolved;
}

File.ensureDir(outputDir);

const capabilities = UI.getCapabilities();
assert(capabilities.perception && capabilities.perception.resolver === true,
  'UI Perception Resolver is unavailable in this Runtime');
assert(capabilities.perception.cloudVisual.defaultEnabled === false,
  'automatic cloud visual perception must remain disabled by default');

const calculator = await resolveCalculator();
const candidates = await preflight(calculator); // no Calculator input yet
await File.writeJSON(File.join(outputDir, 'preflight.json'), {window: calculator, candidates, capabilities});

await clearCalculator(calculator);
await UI.tapTexts(['2', '5', '×', '4', '+', '1', '0', '='], {within: calculator, timeout: 5000});
const firstResult = await waitForRead(calculator, '110');
const firstScreenshot = await page.screenshot({
  target: 'activeWindow', path: File.join(outputDir, 'first-result-110.png'), returnType: 'path',
});

const secondCalculator = await requireActiveCalculator(calculator);
await clearCalculator(secondCalculator);
await UI.tapTexts(['6', '×', ...String(firstResult), '='], {within: secondCalculator, timeout: 5000});
const finalResult = await waitForRead(secondCalculator, '660');
const finalScreenshot = await page.screenshot({
  target: 'activeWindow', path: File.join(outputDir, 'final-result-660.png'), returnType: 'path',
});

console.log(JSON.stringify({firstResult, finalResult, firstScreenshot, finalScreenshot, outputDir}));
