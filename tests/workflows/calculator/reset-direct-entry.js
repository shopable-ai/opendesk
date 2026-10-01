// Local rule validation: starts only at the observed zero/AC entry state.
// From the repository root:
// ./dist/opendesk -script tests/workflows/calculator/reset-direct-entry.js -console-mode script -log-dir .runtime/tests/agent-to-recipe/calculator-direct-reset
'use strict';
const win = await window.get({app: {bundleId: 'com.apple.calculator'}});
if (win.title !== 'Calculator' || win.width !== 232 || win.height !== 321
    || win.exePath !== '/System/Applications/Calculator.app/Contents/MacOS/Calculator'
    || !win.isForeground || !win.hasFocus) throw new Error('Unsupported current window');
const events = [];
function emit(kind, data) {
  const event = {kind, order: events.length + 1, time: new Date().toISOString(), data};
  events.push(event);
  console.log(JSON.stringify(event));
}
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
async function inspect(label) {
  const current = await window.current(win);
  if (current.id !== win.id || current.pid !== win.pid || current.handle !== win.handle
      || current.width !== win.width || current.height !== win.height
      || !current.isForeground || !current.hasFocus) throw new Error('Window drift');
  const snapshot = await Accessibility.snapshot({within: current, maxDepth: 8, maxNodes: 100,
    properties: ['role', 'name', 'enabled', 'actions', 'value']});
  if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete observation');
  const nodes = flatten(snapshot.root);
  const display = nodes.filter(n => n.role === 'staticText' && n.name === '主显示器');
  const clear = nodes.filter(n => n.role === 'button' && ['清除', '全部清除'].includes(n.name));
  if (display.length !== 1 || typeof display[0].value !== 'string' || clear.length !== 1) throw new Error('Ambiguous state');
  const value = await UI.readText({within: current, timeout: 3000});
  if (value !== display[0].value) throw new Error('Read conflict');
  for (const name of ['2', '=', clear[0].name]) {
    const found = nodes.filter(n => n.role === 'button' && n.name === name);
    if (found.length !== 1 || !found[0].enabled || !found[0].actions.includes('invoke')) throw new Error('Unavailable target');
  }
  emit('actualObservation', {label, current, snapshot, value, clear: clear[0].name});
  return {current, value, clear: clear[0].name};
}
async function press(name, label) {
  const before = await inspect(label + '/before');
  emit('plannedAction', {label, name});
  try {
    const receipt = await UI.tapTargets([{role: 'button', name}], {within: before.current, timeout: 3000});
    emit('actualAction', {label, name, receipt});
    if (!receipt.ok || receipt.completed.length !== 1) throw new Error('Incomplete receipt');
  } catch (error) {
    emit('stop', {label, code: error.code || null, actionState: error.actionState || 'unknown', retry: false});
    throw error;
  }
  return inspect(label + '/after');
}
const entry = await inspect('entry');
if (entry.value !== '0' || entry.clear !== '全部清除') throw new Error('Direct AC entry not currently satisfied; no input');
await press('全部清除', 'direct-AC');
await press('2', 'next-digit');
const result = await press('=', 'next-equals');
emit('ruleVerification', {expected: '2', actual: result.value, verdict: result.value === '2' ? 'pass' : 'fail',
  businessFirstResult: false, businessFinalResult: false, allHiddenStateClaim: false});
if (result.value !== '2') throw new Error('Direct AC does not support the tested independent continuation');
const cleared = await press('清除', 'finish-C');
if (cleared.clear !== '全部清除') throw new Error('AC not visible after finish C');
const final = await press('全部清除', 'finish-AC');
if (final.value !== '0') throw new Error('Cleanup visible state failed');
