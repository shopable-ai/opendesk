// Independent no-input preflight. Never activates or clears any window.
'use strict';
const win = await window.get({app: {bundleId: 'com.apple.calculator'}});
if (win.title !== 'Calculator' || win.width !== 232 || win.height !== 321) {
  throw new Error('Unsupported Calculator layout');
}
const snapshot = await Accessibility.snapshot({
  within: win, maxDepth: 16, maxNodes: 300,
  properties: ['role', 'name', 'enabled', 'actions', 'value'],
});
if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete preflight');
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
const nodes = flatten(snapshot.root);
const required = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '×', '+', '='];
const clear = nodes.filter(n => n.role === 'button' && ['清除', '全部清除'].includes(n.name));
if (clear.length !== 1) throw new Error('Ambiguous clear state');
for (const name of [...required, clear[0].name]) {
  const found = nodes.filter(n => n.role === 'button' && n.name === name);
  if (found.length !== 1 || found[0].enabled !== true || !found[0].actions.includes('invoke')) {
    throw new Error('Unavailable preflight target: ' + name);
  }
}
const display = nodes.filter(n => n.role === 'staticText' && n.name === '主显示器');
if (display.length !== 1 || typeof display[0].value !== 'string') throw new Error('Unavailable display');
const first = await UI.readText({within: win});
const second = await UI.readText({within: win});
if (first !== second || first !== display[0].value || !/^\d{1,12}$/.test(first)) {
  throw new Error('Unstable or unsupported read channel');
}
console.log(JSON.stringify({preflight: true, window: win, required, clear: clear[0].name, actual: first, snapshot}));
