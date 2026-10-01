// Application-rule experiment, not a business demonstration or qualification.
// From the repository root:
// ./dist/opendesk -script tests/workflows/calculator/reset-semantics.js -console-mode script -log-dir .runtime/tests/agent-to-recipe/calculator-reset
'use strict';
let order = 0;
let inputs = 0;
const deadline = Date.now() + 120000;
const emit = (kind, data) => console.log(JSON.stringify({kind, order: ++order, time: new Date().toISOString(), data}));
function guard() {
  if (Date.now() >= deadline || inputs > 24) throw new Error('Reset experiment budget exhausted');
}
const win = await window.get({app: {bundleId: 'com.apple.calculator'}});
if (win.exePath !== '/System/Applications/Calculator.app/Contents/MacOS/Calculator'
    || win.title !== 'Calculator' || win.width !== 232 || win.height !== 321
    || win.isForeground !== true || win.hasFocus !== true) throw new Error('Unsupported current Calculator');
emit('initialIdentity', win);
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
async function observe(label) {
  guard();
  const current = await window.current(win);
  if (current.id !== win.id || current.pid !== win.pid || current.handle !== win.handle
      || current.title !== win.title || !current.isForeground || !current.hasFocus
      || current.width !== win.width || current.height !== win.height) throw new Error('Window drift');
  const snapshot = await Accessibility.snapshot({within: current, maxDepth: 8, maxNodes: 100,
    properties: ['role', 'name', 'identifier', 'enabled', 'actions', 'value']});
  emit('actualSnapshot', {label, current, snapshot});
  if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete observation');
  const nodes = flatten(snapshot.root);
  const displays = nodes.filter(n => n.role === 'staticText' && n.name === '主显示器');
  const clears = nodes.filter(n => n.role === 'button' && ['清除', '全部清除'].includes(n.name));
  if (displays.length !== 1 || typeof displays[0].value !== 'string' || clears.length !== 1) throw new Error('Ambiguous display or clear');
  const value = await UI.readText({within: current, timeout: 3000});
  emit('actualRead', {label, windowId: current.id, target: {role: 'staticText', name: '主显示器'}, value});
  if (value !== displays[0].value) throw new Error('Read conflicts with main display');
  for (const name of ['8', '9', '2', '×', '=', clears[0].name]) {
    const matches = nodes.filter(n => n.role === 'button' && n.name === name);
    if (matches.length !== 1 || !matches[0].enabled || !matches[0].actions.includes('invoke')) throw new Error('Unavailable target');
  }
  return {value, clear: clears[0].name, current};
}
async function press(name, label) {
  const before = await observe(label + '/before');
  emit('plannedAction', {label, name, windowId: win.id});
  inputs += 1;
  guard();
  try {
    const receipt = await UI.tapTargets([{role: 'button', name}], {within: before.current, timeout: 3000, intervalMs: 0});
    emit('actualAction', {label, name, receipt});
    if (!receipt.ok || receipt.completed.length !== 1) throw new Error('Incomplete action receipt');
  } catch (error) {
    emit('stop', {label, code: error.code || null, actionState: error.actionState || 'unknown', completed: error.completed || [], retry: false});
    throw error;
  }
  return observe(label + '/after');
}
async function allClear(label) {
  let state = await observe(label + '/entry');
  if (state.clear === '清除') state = await press('清除', label + '/display-clear');
  if (state.clear !== '全部清除') throw new Error('All-clear target not observable');
  state = await press('全部清除', label + '/all-clear');
  if (state.value !== '0' || state.clear !== '全部清除') throw new Error('Clear visible postcondition failed');
  return state;
}
await allClear('setup');
for (const name of ['8', '×', '9']) await press(name, 'seed-pending/' + name);
await press('清除', 'display-only-clear');
await press('2', 'residual-probe/2');
const residual = await press('=', 'residual-probe/equals');
emit('experimentVerification', {scenario: 'C preserves pending multiplication', expected: '16', actual: residual.value,
  status: residual.value === '16' ? 'pass' : 'fail', role: 'controlled application-rule counterexample'});
if (residual.value !== '16') throw new Error('C counterexample differs from preregistered hypothesis');
await allClear('reset-before-second-seed');
for (const name of ['8', '×', '9']) await press(name, 'second-seed/' + name);
await allClear('tested-reset');
await press('2', 'independent-probe/2');
const independent = await press('=', 'independent-probe/equals');
emit('experimentVerification', {scenario: 'C then explicit AC permits independent digit and equals', expected: '2', actual: independent.value,
  status: independent.value === '2' ? 'pass' : 'fail', role: 'controlled application-rule normal path'});
if (independent.value !== '2') throw new Error('Reset did not permit an independent calculation');
await allClear('finish');
emit('experimentClosure', {inputs, pendingStateProbe: residual.value, independentProbe: independent.value,
  supported: 'Observed macOS Calculator Basic Chinese labels, pending multiplication and result states only',
  hiddenStateClaim: false, businessFirstResultProduced: false, businessFinalResultProduced: false});
