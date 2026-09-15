// Run from the repository root, after granting Screen Recording and
// Accessibility permissions:
// ./dist/opendesk -script examples/desktop/calculator-semantic-110-660-macos.js -console-mode script
//
// This is a real macOS Calculator input example. It clears Calculator, enters
// 25 × 4 + 10 =, reads the displayed 110, and uses that read value for 6 × 110 =.
'use strict';

const APP = {bundleId: 'com.apple.calculator'};
const CLEAR_NAMES = new Set(['C', 'AC', 'Clear', 'All Clear', '清除', '全部清除']);
const evidenceDir = File.join(File.cwd(), '.runtime', 'examples', 'calculator-semantic-110-660', Execution.id);
File.ensureDir(evidenceDir);

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

async function readDisplay(win) {
  const snapshot = await Accessibility.snapshot({
    within: win, timeout: 10000, maxDepth: 12, maxNodes: 2000,
    properties: ['role', 'value'],
  });
  if (!snapshot || snapshot.complete !== true || snapshot.truncated === true) {
    throw new Error('Calculator display Accessibility snapshot is incomplete');
  }
  const values = flatten(snapshot.root)
    .filter(node => node.role === 'staticText')
    .map(node => String(node.value || '').replace(/[\s,]/g, ''))
    .filter(value => /^\d+$/.test(value));
  if (values.length !== 1) throw new Error(`Expected one numeric Calculator display, found ${values.length}`);
  return values[0];
}

async function waitForDisplay(win, expected) {
  const deadline = Date.now() + 3000;
  let actual = '';
  while (Date.now() < deadline) {
    actual = await readDisplay(win);
    if (actual === expected) return actual;
    await sleep(50);
  }
  throw new Error(`Calculator display expected ${expected}, got ${actual}`);
}

async function clearCalculator(win) {
  // Calculator may expose C after input and AC when fully cleared. Resolve the
  // current native name; no label aliases or resolver policy enter UI.tapTexts.
  for (let press = 0; press < 2; press += 1) {
    const snapshot = await Accessibility.snapshot({
      within: win, timeout: 10000, maxDepth: 12, maxNodes: 2000,
      properties: ['role', 'name', 'identifier', 'enabled', 'actions'],
    });
    const matches = flatten(snapshot.root).filter(node => node.role === 'button'
      && CLEAR_NAMES.has(String(node.name || '')) && node.enabled === true
      && Array.isArray(node.actions) && node.actions.includes('invoke'));
    if (matches.length !== 1) throw new Error(`Expected one enabled Calculator clear button, found ${matches.length}`);
    const clear = {role: 'button', name: matches[0].name};
    if (matches[0].identifier) clear.identifier = matches[0].identifier;
    await UI.tapTargets([clear], {within: win});
  }
  await waitForDisplay(win, '0');
}

async function tapSequence(win, labels, phase) {
  try {
    return await UI.tapTexts(labels, {within: win});
  } catch (error) {
    console.error(`${phase} failed: ` + JSON.stringify({
      code: error && error.code,
      failedIndex: error && error.failedIndex,
      failedText: error && error.failedText,
      failedPhase: error && error.failedPhase,
      actionState: error && error.actionState,
      completed: error && Array.isArray(error.completed) ? error.completed.length : 0,
    }));
    throw error;
  }
}

await App.launch(APP, {activate: true, waitUntilReady: 'window', timeout: 10000});
const calculator = await window.get({app: APP});

await clearCalculator(calculator);
await tapSequence(calculator, ['2', '5', '×', '4', '+', '1', '0', '='], 'first sequence');
const firstResult = await waitForDisplay(calculator, '110');
const firstScreenshot = await page.screenshot({
  target: 'activeWindow', path: File.join(evidenceDir, 'first-result-110.png'), returnType: 'path',
});

const secondCalculator = await window.get({app: APP});
await clearCalculator(secondCalculator);
const secondInputs = ['6', '×', ...firstResult, '='];
await tapSequence(secondCalculator, secondInputs, 'second sequence');
const finalResult = await waitForDisplay(secondCalculator, '660');
const finalScreenshot = await page.screenshot({
  target: 'activeWindow', path: File.join(evidenceDir, 'final-result-660.png'), returnType: 'path',
});

console.log('[PASS] Calculator semantic result flow');
console.log('firstResult=' + firstResult + ' (read from Calculator display)');
console.log('finalResult=' + finalResult + ' (read from Calculator display)');
console.log('screenshots: ' + firstScreenshot + ' | ' + finalScreenshot);
