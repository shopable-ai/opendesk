// macOS interactive validation for UI.tapTargets semantic targets.
// Run from repository root after building OpenDesk and granting the required
// Screen Recording + Accessibility permissions:
//
// ./dist/opendesk -script examples/desktop/ui-semantic-targets-calculator.js -console-mode script
//
// This example performs real Calculator input. It is intentionally not part of
// the inert unit gate.
'use strict';

const calculator = { bundleId: 'com.apple.calculator' };

await App.launch(calculator, {
  activate: true,
  waitUntilReady: 'window',
  timeout: 10000,
});

const win = await window.wait(
  { app: calculator },
  { timeout: 10000, polling: 200 },
);

// Normalize Calculator state without teaching UI.tapTargets button aliases.
// Calculator normally exposes AC in the cleared state and C after input.
let cleared = false;
for (const clearName of ['AC', 'C']) {
  try {
    await UI.tapTargets(
      [{ role: 'button', name: clearName }],
      { within: win, timeout: 3000 },
    );
    cleared = true;
    break;
  } catch (error) {
    if (!error || error.code !== 'TARGET_NOT_FOUND') throw error;
  }
}
if (!cleared) throw new Error('Calculator clear button (AC/C) was not found');

// Mixed resolver sequence:
// - text-only numbers/operators use the Runtime-owned auto path;
// - × carries a native semantic constraint and must use Accessibility directly.
// No strategy/fallback/provider/coordinates are supplied by the caller.
const receipt = await UI.tapTargets([
  { text: '2' },
  { text: '5' },
  { role: 'button', name: '×' },
  { text: '4' },
  { text: '=' },
], {
  within: win,
  timeout: 5000,
});

console.log('tapTargets completed:', receipt.completed.map(item => ({
  index: item.index,
  resolver: item.resolver,
  action: item.action,
  backend: item.backend,
})));

// Independent business-visible oracle. The value is not used to drive clicks;
// it only proves that the real Calculator processed 25 × 4 = 100.
await UI.waitText('100', {
  within: win,
  match: 'exact',
  timeout: 5000,
});

console.log('Calculator semantic tapTargets validation passed: 25 × 4 = 100');
