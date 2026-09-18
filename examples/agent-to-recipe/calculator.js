// From the repository root:
// ./dist/opendesk -script examples/agent-to-recipe/calculator.js -console-mode script
// macOS Calculator Basic, 232x321, Chinese native clear/display labels.
// Clears Calculator twice. A failed/unknown input stops; never automatically rerun.
'use strict';

const BUTTONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '×', '+', '='];
const CLEAR_NAMES = ['清除', '全部清除'];

function flatten(node) {
  return [node].concat(...(node.children || []).map(flatten));
}

async function currentCalculator(win) {
  const current = await window.current(win);
  if (current.title !== 'Calculator' || current.width !== 232 || current.height !== 321
      || !current.isForeground || !current.hasFocus) {
    throw new Error('Calculator identity, focus or Basic layout changed');
  }
  return current;
}

// Read-only: check every required distinct target and the native display channel.
async function inspectCalculator(win, buttons) {
  win = await currentCalculator(win);
  const snapshot = await Accessibility.snapshot({
    within: win, maxDepth: 16, maxNodes: 300,
    properties: ['role', 'name', 'enabled', 'actions', 'value'],
  });
  if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete Calculator observation');
  const nodes = flatten(snapshot.root);
  for (const name of new Set(buttons)) {
    const matches = nodes.filter(node => node.role === 'button' && node.name === name);
    if (matches.length !== 1 || matches[0].enabled !== true
        || !Array.isArray(matches[0].actions) || !matches[0].actions.includes('invoke')) {
      throw new Error('Calculator button missing, disabled or ambiguous: ' + name);
    }
  }
  const display = nodes.filter(node => node.role === 'staticText' && node.name === '主显示器');
  if (display.length !== 1 || typeof display[0].value !== 'string') {
    throw new Error('Calculator display missing or ambiguous');
  }
  return nodes;
}

async function readCalculatorResult(win) {
  await currentCalculator(win);
  const first = await UI.readText({within: win});
  const second = await UI.readText({within: win});
  if (first !== second || !/^\d{1,12}$/.test(second)) {
    throw new Error('Calculator result is unstable or outside the unsigned integer format');
  }
  return second;
}

// Explicit state preparation, at most C then AC. Zero alone is not proof of AC.
async function clearCalculator(win) {
  for (let press = 0; press < 2; press += 1) {
    const nodes = await inspectCalculator(win, []);
    const matches = nodes.filter(node => node.role === 'button' && CLEAR_NAMES.includes(node.name));
    if (matches.length !== 1) throw new Error('Calculator clear button missing or ambiguous');
    const name = matches[0].name;
    await inspectCalculator(win, [name]);
    await UI.tapTargets([{role: 'button', name}], {within: win});
    if (name === '全部清除') {
      if (await readCalculatorResult(win) !== '0') throw new Error('Calculator all-clear failed');
      return;
    }
  }
  throw new Error('Calculator did not expose all-clear');
}

// Click exactly these buttons; no implicit clear, equals, arithmetic or retry.
// Returns the unmodified native completion receipt, not a business verdict.
async function clickCalculatorButtons(win, buttons) {
  if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 16) {
    throw new Error('Expected 1..16 Calculator buttons');
  }
  for (let i = 0; i < buttons.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(buttons, i) || !BUTTONS.includes(buttons[i])) {
      throw new Error('Unsupported Calculator button at index ' + i);
    }
  }
  await inspectCalculator(win, buttons);
  return UI.tapTargets(buttons.map(name => ({role: 'button', name})), {within: win});
}

async function main() {
  let win = await window.get({app: {bundleId: 'com.apple.calculator'}});
  if (win.title !== 'Calculator' || win.width !== 232 || win.height !== 321) {
    throw new Error('Open Calculator in the supported Basic layout first');
  }
  win = await window.activate(win);
  await inspectCalculator(win, BUTTONS);
  await readCalculatorResult(win);

  await clearCalculator(win);
  const firstInput = await clickCalculatorButtons(win, ['2', '5', '×', '4', '+', '1', '0', '=']);
  const firstResult = await readCalculatorResult(win);

  await clearCalculator(win);
  const secondInput = await clickCalculatorButtons(win, ['6', '×', ...firstResult, '=']);
  const finalResult = await readCalculatorResult(win);
  return {firstResult, finalResult, firstInput, secondInput};
}

console.log(JSON.stringify(await main()));
