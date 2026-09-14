// Run from the OpenDesk repository root after granting Accessibility:
//   ./dist/opendesk -script examples/accessibility/macos-calculator-tap-targets.js -console-mode script
// This example clears and changes the real macOS Calculator.

const APP = { bundleId: 'com.apple.calculator' };
const INPUT = ['2', '5', '×', '4', '='];
const CLEAR_STATES = new Map([
  ['C', 'entry-clear'],
  ['Clear', 'entry-clear'],
  ['清除', 'entry-clear'],
  ['AC', 'all-clear'],
  ['All Clear', 'all-clear'],
  ['全部清除', 'all-clear'],
]);
const AX_OPTIONS = {
  timeout: 3000,
  maxDepth: 8,
  maxNodes: 1000,
};
const TAP_OPTIONS = {
  timeout: 3000,
  maxDepth: 8,
  maxNodes: 1000,
  refocus: 'if-needed',
  refocusTimeout: 1000,
};
function fail(message) {
  throw new Error(`Calculator: ${message}`);
}

function flatten(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  result.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    flatten(child, result);
  }
  return result;
}

function exactOne(items, description) {
  if (items.length !== 1) fail(`${description} must be unique; found ${items.length}`);
  return items[0];
}
function usableBounds(node) {
  const value = node && node.nativeBounds;
  if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite)) return null;
  if (value.width <= 0 || value.height <= 0) return null;
  return value;
}
function sameWindow(expected, actual) {
  return expected && actual
    && String(actual.id) === String(expected.id)
    && Number(actual.pid) === Number(expected.pid)
    && String(actual.title) === String(expected.title)
    && Number(actual.handle) === Number(expected.handle)
    && ['x', 'y', 'width', 'height'].every(key => Number(actual[key]) === Number(expected[key]));
}
async function requireCurrentWindow(win) {
  const current = await window.current(win);
  if (!sameWindow(win, current)) fail('window identity or bounds changed');
  return current;
}
function inspectSnapshot(snapshot) {
  if (!snapshot || snapshot.complete !== true || snapshot.truncated === true || !snapshot.root) {
    fail('Accessibility snapshot is incomplete or truncated');
  }
  const nodes = flatten(snapshot.root);
  const buttons = nodes.filter(node => node.role === 'button');
  const required = INPUT.map(name => exactOne(
    buttons.filter(node => node.name === name),
    `button ${JSON.stringify(name)}`,
  ));
  for (const button of required) {
    if (button.enabled !== true || !Array.isArray(button.actions) || !button.actions.includes('invoke')) {
      fail(`button ${JSON.stringify(button.name)} is not enabled and invokable`);
    }
  }
  const clear = exactOne(
    buttons.filter(node => CLEAR_STATES.has(String(node.name || ''))),
    'observed C/AC button',
  );
  const clearName = String(clear.name);
  if (clear.enabled !== true || !Array.isArray(clear.actions) || !clear.actions.includes('invoke')) {
    fail(`clear button ${JSON.stringify(clearName)} is not enabled and invokable`);
  }
  const keypadTop = Math.min(...required.concat(clear).map(node => {
    const bounds = usableBounds(node);
    if (!bounds) fail(`button ${JSON.stringify(node.name)} has no usable native bounds`);
    return bounds.y;
  }));
  const display = exactOne(nodes.filter(node => {
    const bounds = usableBounds(node);
    return node.role === 'staticText'
      && typeof node.value === 'string'
      && node.value.trim() !== ''
      && bounds
      && bounds.y + bounds.height <= keypadTop;
  }), 'Accessibility Display');

  return {
    clearName,
    clearState: CLEAR_STATES.get(clearName),
    display: display.value.trim(),
  };
}
async function observe(win) {
  await requireCurrentWindow(win);
  const snapshot = await Accessibility.snapshot({
    within: win,
    ...AX_OPTIONS,
    properties: ['role', 'name', 'value', 'identifier', 'enabled', 'actions', 'nativeBounds'],
  });
  await requireCurrentWindow(win);
  return inspectSnapshot(snapshot);
}
async function tapNames(win, names) {
  const result = await UI.tapTargets(
    names.map(name => ({ locator: { role: 'button', name } })),
    { within: win, ...TAP_OPTIONS },
  );
  if (result.backend !== 'accessibility' || result.completed.length !== names.length) {
    fail(`UI.tapTargets completed ${result.completed.length}/${names.length} via ${result.backend}`);
  }
  return result;
}
const win = await window.get({ app: APP });
let state = await observe(win);
for (let attempt = 0; attempt < 2 && (state.display !== '0' || state.clearState !== 'all-clear'); attempt += 1) {
  await tapNames(win, [state.clearName]);
  state = await observe(win);
}
if (state.display !== '0' || state.clearState !== 'all-clear') {
  fail(`could not reach all-clear Display 0; saw ${JSON.stringify(state)}`);
}

const action = await tapNames(win, INPUT);
const first = await observe(win);
const second = await observe(win);
if (first.display !== '100' || second.display !== '100') {
  fail(`Display was not stably 100: ${JSON.stringify([first.display, second.display])}`);
}

console.log(JSON.stringify({
  ok: true,
  backend: action.backend,
  completed: action.completed.length,
  display: second.display,
}));
