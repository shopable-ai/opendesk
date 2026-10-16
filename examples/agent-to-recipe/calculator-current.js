// From the repository root:
// ./dist/opendesk -script examples/agent-to-recipe/calculator-current.js -console-mode script
// Fixed Calculator Basic task: 25 × 4 + 10, then 6 × the actual first display value.
// An unknown input outcome stops this execution; it must never be replayed blindly.
'use strict';

const BUTTONS = ['0','1','2','3','4','5','6','7','8','9','×','+','='];
const CLEAR = ['清除','全部清除'];

// Preserve r009's business sequence; only these observed Basic layouts qualify.
function modernCalculator(win) {
  return win.title === '计算器' && win.width === 230 && win.height === 408
    && win.exePath === '/System/Applications/Calculator.app/Contents/MacOS/Calculator';
}
function supportedCalculator(win) {
  return modernCalculator(win) || (win.title === 'Calculator' && win.width === 232 && win.height === 321);
}
function buttonName(win, name) {
  return modernCalculator(win) ? ({'×':'乘','+':'加','=':'等于'}[name] || name) : name;
}
function displayValue(win, value) {
  // SwiftUI prefixes its AX display with LRM; preserve all actual digits.
  return modernCalculator(win) && typeof value === 'string' ? value.replace(/^\u200e/, '') : value;
}
const evidenceDir = typeof Execution !== 'undefined' && Execution.env.OPENDESK_CALCULATOR_EVIDENCE;
async function captureResult(win, phase, value) {
  if (!evidenceDir) return;
  await verifyExactCalculator(win);
  File.ensureDir(evidenceDir);
  const screenshot = await page.screenshot({target:'activeWindow',path:File.join(evidenceDir,phase+'.png'),returnType:'path'});
  const snapshot = await Accessibility.snapshot({within:win,maxDepth:16,maxNodes:300,
    properties:['role','name','identifier','value','enabled','actions','nativeBounds']});
  requireTrue(snapshot.complete && !snapshot.truncated, 'Incomplete result evidence');
  await File.writeJSON(File.join(evidenceDir,phase+'.json'), {window:win,value,screenshot,snapshot});
}

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}
function flatten(node) {
  return [node].concat(...(node.children || []).map(flatten));
}
async function verifyExactCalculator(win) {
  const current = await window.current(win);
  requireTrue(current.id === win.id && current.pid === win.pid
    && current.handle === win.handle && current.title === win.title
    && current.width === win.width && current.height === win.height && supportedCalculator(current)
    && current.x === win.x && current.y === win.y
    && current.isForeground === true && current.hasFocus === true,
  'Calculator identity, bounds or focus changed');
  return current;
}
async function inspectCalculator(win, names) {
  const current = await verifyExactCalculator(win);
  const snapshot = await Accessibility.snapshot({
    within: current, maxDepth: 16, maxNodes: 300,
    properties: ['role','name','identifier','enabled','actions','value','nativeBounds'],
  });
  requireTrue(snapshot.complete && !snapshot.truncated, 'Incomplete Calculator observation');
  const nodes = flatten(snapshot.root);
  if (modernCalculator(win)) requireTrue(nodes.filter(node => node.identifier === 'Mode: basic; unitConversion: false').length === 1,
    'Calculator must remain in observed Basic mode');
  for (const name of new Set(names)) {
    const matches = nodes.filter(node => node.role === 'button' && node.name === buttonName(win, name));
    requireTrue(matches.length === 1 && matches[0].enabled === true
      && Array.isArray(matches[0].actions) && matches[0].actions.includes('invoke'),
    'Calculator button missing, disabled or ambiguous: ' + name);
  }
  const containers = nodes.filter(node => node.identifier === 'StandardInputView');
  if (modernCalculator(win)) requireTrue(containers.length === 1, 'Calculator input display missing or ambiguous');
  const display = modernCalculator(win)
    ? flatten(containers[0]).filter(node => node.role === 'staticText' && typeof node.value === 'string')
    : nodes.filter(node => node.role === 'staticText' && node.name === '主显示器');
  requireTrue(display.length === 1 && typeof display[0].value === 'string',
    'Calculator display missing or ambiguous');
  let region;
  if (modernCalculator(win)) {
    const rect = containers[0].nativeBounds;
    requireTrue(rect && rect.coordinateSpace === 'macos-global-display-points-top-left'
      && rect.x >= win.x && rect.y >= win.y && rect.width > 0 && rect.height > 0
      && rect.x + rect.width <= win.x + win.width && rect.y + rect.height <= win.y + win.height,
    'Calculator display region is not proven inside the bound window');
    region = {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  }
  return {nodes, display: displayValue(win, display[0].value), region};
}
async function readCalculatorResult(win) {
  const observed = await inspectCalculator(win, []);
  const options = {within:win};
  if (observed.region) options.region = observed.region;
  const first = displayValue(win, await UI.readText(options));
  const second = displayValue(win, await UI.readText(options));
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
  names = names.map(name => buttonName(win, name));
  return acknowledged(await UI.tapTargets(names.map(name => ({role:'button',name})),
    {within: win,timeout:30000}), names);
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
  requireTrue(resolved && supportedCalculator(resolved)
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
  await captureResult(win, 'first-result', firstResult);
  console.log(JSON.stringify({phase:'first-result',firstResult}));

  const secondClear = await clearCalculator(win);
  const secondInput = await clickCalculatorButtons(win,['6','×',...firstResult,'=']);
  const finalResult = await readCalculatorResult(win);
  await captureResult(win, 'final-result', finalResult);
  return {firstResult,finalResult,firstInput,secondInput,firstClear,secondClear};
}

try {
  console.log(JSON.stringify(await main()));
} catch (error) {
  // Keep the structured receipt on failure; never replay an unknown prefix.
  if (evidenceDir) {
    File.ensureDir(evidenceDir);
    await File.writeJSON(File.join(evidenceDir,'failure.json'), {message:String(error.message),...error});
  }
  throw error;
}
