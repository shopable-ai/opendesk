// Run from the repository root:
// ./dist/opendesk -script examples/human-to-recipe/calculator-current.recipe.js -console-mode normal
// Human-to-Recipe continuation, complete-r004 plan, recording
// rec-20260930T174948.202381000Z-cd1bb743a1c5 (Agent-operated; not a human-input claim).
// Reuses the fixed Calculator native read/input/C-to-AC rules. Unsupported initial
// display formats stop before input. Existing integer-read eligibility accepts
// signed old integers; produced task results remain unsigned, at most 12 digits.
// Fractional/error displays are not supported; no new locale/layout/parameter scope.
// Normal output is the two actual reads. Native receipts are debug diagnostics,
// available in execution artifacts or with -console-mode script; never an Oracle.
'use strict';

const CALCULATOR = {bundleId:'com.apple.calculator',title:'Calculator',width:232,height:321};
const BUTTONS = ['0','1','2','3','4','5','6','7','8','9','×','+','='];
const CLEAR = ['清除','全部清除'];
const INTEGER_DISPLAY = /^\d{1,12}$/;
const INITIAL_INTEGER = /^-?\d+$/;

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}
function flatten(node) {
  return [node].concat(...(node.children || []).map(flatten));
}
async function currentCalculator(win) {
  const current = await window.current(win);
  const expected = {id:win.id,pid:win.pid,handle:win.handle,title:CALCULATOR.title,
    width:CALCULATOR.width,height:CALCULATOR.height,x:win.x,y:win.y,isForeground:true,hasFocus:true};
  const changed = Object.keys(expected).filter(key => current[key] !== expected[key]);
  if (changed.length) {
    try { console.debug(JSON.stringify({kind:'calculator-window-guard',changed,expected,
      actual:Object.fromEntries(Object.keys(expected).map(key=>[key,current[key]]))})); }
    catch (_) { /* diagnostics must not change the stop decision */ }
    throw new Error('Calculator identity, bounds or focus changed: ' + changed.join(', '));
  }
  return current;
}
async function inspectCalculator(win, names) {
  const current = await currentCalculator(win);
  const snapshot = await Accessibility.snapshot({within:current,maxDepth:16,maxNodes:300,
    properties:['role','name','enabled','actions','value']});
  requireTrue(snapshot.complete && !snapshot.truncated, 'Incomplete Calculator observation');
  const nodes = flatten(snapshot.root);
  for (const name of new Set(names)) {
    const matches = nodes.filter(node => node.role === 'button' && node.name === name);
    requireTrue(matches.length === 1 && matches[0].enabled === true
      && Array.isArray(matches[0].actions) && matches[0].actions.includes('invoke'),
    'Calculator button missing, disabled or ambiguous: ' + name);
  }
  const displays = nodes.filter(node => node.role === 'staticText' && node.name === '主显示器');
  requireTrue(displays.length === 1 && typeof displays[0].value === 'string',
    'Calculator primary display missing or ambiguous');
  return {nodes,display:displays[0].value};
}
async function readCalculatorDisplay(win, observed) {
  // A preparation snapshot can be reused only before any input. Every post-input
  // caller obtains a new snapshot; neither reads nor element refs are cached.
  const state = observed || await inspectCalculator(win, []);
  const first = await UI.readText({within:win,maxDepth:16,maxNodes:300});
  const second = await UI.readText({within:win,maxDepth:16,maxNodes:300});
  requireTrue(first === second && second === state.display,
    'Actual Calculator display is unstable or disagrees with the primary display');
  return second;
}
async function readCalculatorResult(win) {
  const result = await readCalculatorDisplay(win);
  requireTrue(INTEGER_DISPLAY.test(result), 'Actual result is outside the supported integer format');
  return result;
}
function acknowledged(receipt, names) {
  requireTrue(receipt && receipt.ok === true && receipt.action === 'tapTargets'
    && Array.isArray(receipt.completed) && receipt.completed.length === names.length,
  'Native input receipt is incomplete; outcome may be unknown');
  for (let index = 0; index < names.length; index += 1) {
    const item = receipt.completed[index];
    requireTrue(item && item.actionState === 'acknowledged' && item.backend === 'macos-ax'
      && item.requestId && item.target && item.target.source === 'accessibility'
      && item.target.locator && item.target.locator.role === 'button'
      && item.target.locator.name === names[index],
    'Native input step not fully acknowledged; outcome may be unknown');
  }
  // Diagnostic failure cannot change or replay an acknowledged business action.
  try { console.debug(JSON.stringify({kind:'calculator-input',completed:receipt.completed})); }
  catch (_) { /* optional observability only */ }
  return receipt;
}
async function clickCalculatorButtons(win, names) {
  requireTrue(Array.isArray(names) && names.length > 0 && names.length <= 16,
    'Unsupported Calculator input sequence length');
  for (let index = 0; index < names.length; index += 1) {
    requireTrue(Object.prototype.hasOwnProperty.call(names,index) && BUTTONS.includes(names[index]),
      'Unsupported Calculator button at index ' + index);
  }
  await inspectCalculator(win,names);
  return acknowledged(await UI.tapTargets(names.map(name => ({role:'button',name})),{within:win}),names);
}
async function clearCalculator(win) {
  for (let press = 0; press < 2; press += 1) {
    const state = await inspectCalculator(win,[]);
    const candidates = state.nodes.filter(node => node.role === 'button' && CLEAR.includes(node.name));
    requireTrue(candidates.length === 1 && candidates[0].enabled === true
      && Array.isArray(candidates[0].actions) && candidates[0].actions.includes('invoke'),
    'Clear action unavailable or ambiguous');
    const name = candidates[0].name;
    acknowledged(await UI.tapTargets([{role:'button',name}],{within:win}),[name]);
    if (name === '全部清除') {
      requireTrue(await readCalculatorResult(win) === '0', 'All-clear did not yield zero');
      return;
    }
  }
  throw new Error('Bounded C to AC clear did not complete');
}
async function prepareCalculator() {
  const resolved = await window.get({app:{bundleId:CALCULATOR.bundleId}});
  requireTrue(resolved && resolved.title === CALCULATOR.title
    && resolved.width === CALCULATOR.width && resolved.height === CALCULATOR.height
    && typeof resolved.id === 'string' && !resolved.id.endsWith(':unresolved')
    && resolved.pid > 0 && resolved.handle > 0, 'Open the supported Calculator Basic layout first');
  const win = await window.activate(resolved,{timeout:1000});
  const observed = await inspectCalculator(win,BUTTONS);
  const initialDisplay = await readCalculatorDisplay(win,observed);
  requireTrue(INITIAL_INTEGER.test(initialDisplay),
    'Initial display is outside the inherited integer-read scope; no reset was sent');
  return win;
}

async function main() {
  const win = await prepareCalculator();
  await clearCalculator(win); // Preparation guard, not a recorded business action.

  // first-expression: a0001..a0008 -> UI.tapTargets stepIndex 0..7, original order.
  await clickCalculatorButtons(win,['2','5','×','4','+','1','0','=']);
  // read-first: this UI read produces the only value consumed by the next expression.
  const firstResult = await readCalculatorResult(win);

  await clearCalculator(win); // clear-ui: firstResult remains in this execution.
  // second-expression: every character of the actual producer, including leading zeros.
  await clickCalculatorButtons(win,['6','×',...firstResult,'=']);
  const finalResult = await readCalculatorResult(win); // read-final.
  return {firstResult,finalResult};
}

console.log(JSON.stringify(await main()));
