// From the repository root:
// ./dist/opendesk -script examples/agent-to-recipe/calculator-current.js -console-mode script
// Fixed Calculator Basic task: 25 × 4 + 10, then 6 × the actual first display value.
// An unknown input outcome stops this execution; it must never be replayed blindly.
'use strict';

const BUTTONS = ['0','1','2','3','4','5','6','7','8','9','×','+','='];
const CLEAR = ['清除','全部清除'];

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}
function flatten(node) {
  return [node].concat(...(node.children || []).map(flatten));
}
async function verifyExactCalculator(win) {
  const current = await window.current(win);
  requireTrue(current.id === win.id && current.pid === win.pid
    && current.handle === win.handle && current.title === 'Calculator'
    && current.width === 232 && current.height === 321
    && current.x === win.x && current.y === win.y
    && current.isForeground === true && current.hasFocus === true,
  'Calculator identity, bounds or focus changed');
  return current;
}
async function inspectCalculator(win, names) {
  const current = await verifyExactCalculator(win);
  const snapshot = await Accessibility.snapshot({
    within: current, maxDepth: 16, maxNodes: 300,
    properties: ['role','name','enabled','actions','value'],
  });
  requireTrue(snapshot.complete && !snapshot.truncated, 'Incomplete Calculator observation');
  const nodes = flatten(snapshot.root);
  for (const name of new Set(names)) {
    const matches = nodes.filter(node => node.role === 'button' && node.name === name);
    requireTrue(matches.length === 1 && matches[0].enabled === true
      && Array.isArray(matches[0].actions) && matches[0].actions.includes('invoke'),
    'Calculator button missing, disabled or ambiguous: ' + name);
  }
  const display = nodes.filter(node => node.role === 'staticText' && node.name === '主显示器');
  requireTrue(display.length === 1 && typeof display[0].value === 'string',
    'Calculator display missing or ambiguous');
  return {nodes, display: display[0].value};
}
async function readCalculatorResult(win) {
  const observed = await inspectCalculator(win, []);
  const first = await UI.readText({within: win});
  const second = await UI.readText({within: win});
  requireTrue(first === second && second === observed.display && /^\d{1,12}$/.test(second),
    'Actual Calculator display is unstable, mismatched or outside the supported format');
  return second;
}
function acknowledged(receipt, names) {
  requireTrue(receipt && receipt.ok === true && receipt.action === 'tapTargets'
    && Array.isArray(receipt.completed) && receipt.completed.length === names.length,
  'Native input receipt is incomplete; outcome may be unknown');
  for (let i = 0; i < names.length; i += 1) {
    const item = receipt.completed[i];
    requireTrue(item && item.actionState === 'acknowledged'
      && item.backend === 'macos-ax' && item.requestId
      && item.target && item.target.source === 'accessibility'
      && item.target.locator && item.target.locator.role === 'button'
      && item.target.locator.name === names[i],
    'Native input step not fully acknowledged; outcome may be unknown');
  }
  return receipt;
}
async function clickCalculatorButtons(win, names) {
  requireTrue(Array.isArray(names) && names.length > 0 && names.length <= 16,
    'Unsupported Calculator input sequence length');
  for (let i = 0; i < names.length; i += 1) {
    requireTrue(Object.prototype.hasOwnProperty.call(names, i) && BUTTONS.includes(names[i]),
      'Unsupported Calculator button at index ' + i);
  }
  await inspectCalculator(win, names);
  return acknowledged(await UI.tapTargets(names.map(name => ({role:'button',name})),
    {within: win}), names);
}
async function clearCalculator(win) {
  const receipts = [];
  for (let press = 0; press < 2; press += 1) {
    const state = await inspectCalculator(win, BUTTONS);
    const candidates = state.nodes.filter(node => node.role === 'button' && CLEAR.includes(node.name));
    requireTrue(candidates.length === 1 && candidates[0].enabled === true
      && candidates[0].actions.includes('invoke'), 'Clear action unavailable or ambiguous');
    const name = candidates[0].name;
    receipts.push(acknowledged(await UI.tapTargets([{role:'button',name}], {within:win}),[name]));
    if (name === '全部清除') {
      requireTrue(await readCalculatorResult(win) === '0', 'All-clear did not yield zero');
      return receipts;
    }
  }
  throw new Error('Bounded C to AC clear did not complete');
}

async function main() {
  const resolved = await window.get({app:{bundleId:'com.apple.calculator'}});
  requireTrue(resolved && resolved.title === 'Calculator'
    && resolved.width === 232 && resolved.height === 321
    && typeof resolved.id === 'string' && !resolved.id.endsWith(':unresolved')
    && resolved.pid > 0 && resolved.handle > 0,
  'Open the supported Calculator Basic layout first');
  const win = await window.activate(resolved,{timeout:1000});
  await verifyExactCalculator(win);
  await inspectCalculator(win,BUTTONS);
  await readCalculatorResult(win);

  const firstClear = await clearCalculator(win);
  const firstInput = await clickCalculatorButtons(win,['2','5','×','4','+','1','0','=']);
  const firstResult = await readCalculatorResult(win);
  console.log(JSON.stringify({phase:'first-result',firstResult}));

  const secondClear = await clearCalculator(win);
  const secondInput = await clickCalculatorButtons(win,['6','×',...firstResult,'=']);
  const finalResult = await readCalculatorResult(win);
  return {firstResult,finalResult,firstInput,secondInput,firstClear,secondClear};
}

console.log(JSON.stringify(await main()));
