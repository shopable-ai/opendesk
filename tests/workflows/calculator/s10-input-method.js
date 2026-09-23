// S10 harden only: validate a bounded prefix of the fixed Calculator task.
// This is not a business Recipe or an S12 qualification run.
'use strict';

function requireTrue(value, message) {
  if (!value) throw new Error(message);
}
function flatten(node) {
  return [node].concat(...(node.children || []).map(flatten));
}
function sameWindow(original, current) {
  requireTrue(current.id === original.id && current.pid === original.pid
    && current.handle === original.handle && current.title === 'Calculator'
    && current.width === 232 && current.height === 321
    && current.x === original.x && current.y === original.y
    && current.isForeground === true && current.hasFocus === true,
  'Exact Calculator window, bounds or focus changed');
}
async function inspect(win) {
  const current = await window.current(win);
  sameWindow(win, current);
  const snapshot = await Accessibility.snapshot({
    within: current, maxDepth: 16, maxNodes: 300,
    properties: ['role', 'name', 'enabled', 'actions', 'value'],
  });
  requireTrue(snapshot.complete && !snapshot.truncated, 'Incomplete Calculator snapshot');
  const nodes = flatten(snapshot.root);
  const clear = nodes.filter(n => n.role === 'button'
    && ['清除', '全部清除'].includes(n.name));
  requireTrue(clear.length === 1, 'Ambiguous Calculator clear');
  for (const name of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '×', '+', '=', clear[0].name]) {
    const found = nodes.filter(n => n.role === 'button' && n.name === name);
    requireTrue(found.length === 1 && found[0].enabled === true
      && found[0].actions.includes('invoke'), 'Unavailable Calculator target: ' + name);
  }
  const display = nodes.filter(n => n.role === 'staticText' && n.name === '主显示器');
  requireTrue(display.length === 1 && typeof display[0].value === 'string',
    'Unavailable Calculator display');
  const actual = await UI.readText({within: current});
  requireTrue(actual === display[0].value && /^\d{1,12}$/.test(actual),
    'Actual Calculator display and read channel disagree');
  return {current, clear: clear[0].name, actual};
}
async function input(win, name) {
  // One semantic action only. Any unknown effect terminates this Execution.
  const receipt = await UI.tapTargets([{role: 'button', name}], {within: win});
  const completed = receipt && receipt.completed;
  console.log(JSON.stringify({phase: 'native-receipt', name, receipt}));
  requireTrue(receipt.ok === true && receipt.action === 'tapTargets'
    && Array.isArray(completed) && completed.length === 1
    && completed[0].target.source === 'accessibility'
    && completed[0].target.locator.role === 'button'
    && completed[0].target.locator.name === name
    && completed[0].backend === 'macos-ax'
    && completed[0].actionState === 'acknowledged'
    && completed[0].requestId, 'Native input receipt is not fully acknowledged; stop');
  return receipt;
}

const resolved = await window.get({app: {bundleId: 'com.apple.calculator'}});
requireTrue(resolved && resolved.title === 'Calculator'
  && resolved.width === 232 && resolved.height === 321
  && typeof resolved.id === 'string' && !resolved.id.endsWith(':unresolved')
  && resolved.pid > 0 && resolved.handle > 0,
  'Exact Calculator Basic window not resolved');
// Activation counts against the four-action allowance even if already foreground.
const active = await window.activate(resolved, {timeout: 1000});
sameWindow(resolved, active);
console.log(JSON.stringify({phase: 'focus-verified', window: active}));
const before = await inspect(active);
requireTrue(await UI.readText({within: active}) === before.actual,
  'Unstable Calculator display before input');
console.log(JSON.stringify({phase: 'pre-input', actual: before.actual, clear: before.clear}));
let cleared = false;
for (let press = 0; press < 2; press += 1) {
  const state = await inspect(active);
  await input(active, state.clear);
  if (state.clear === '全部清除') { cleared = true; break; }
}
requireTrue(cleared, 'Bounded C to AC clear did not complete');
const clean = await inspect(active);
requireTrue(clean.actual === '0', 'Calculator did not show a clean zero');
console.log(JSON.stringify({phase: 'clean', actual: clean.actual}));
await input(active, '2');
const after = await inspect(active);
requireTrue(after.actual === '2', 'Fixed-task digit prefix was not displayed');
requireTrue(await UI.readText({within: active}) === after.actual,
  'Unstable display after fixed-task prefix');
console.log(JSON.stringify({phase: 's10-method-validated', actual: after.actual,
  actionsUpperBound: 4, businessQualification: 'not-run'}));
