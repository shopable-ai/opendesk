// Test setup only, after a successful no-input preflight and known prior outcome.
'use strict';
const win = await window.activate(await window.get({app: {bundleId: 'com.apple.calculator'}}));
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
const receipts = [];
let cleared = false;
for (let press = 0; press < 2; press += 1) {
  const current = await window.current(win);
  if (!current.hasFocus || !current.isForeground || current.title !== 'Calculator'
      || current.width !== 232 || current.height !== 321) throw new Error('Preparation scope changed');
  const snapshot = await Accessibility.snapshot({
    within: win, maxDepth: 16, maxNodes: 300, properties: ['role', 'name', 'enabled', 'actions'],
  });
  if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete preparation observation');
  const matches = flatten(snapshot.root).filter(n => n.role === 'button' && ['清除', '全部清除'].includes(n.name));
  if (matches.length !== 1 || matches[0].enabled !== true || !matches[0].actions.includes('invoke')) {
    throw new Error('Unavailable clear target');
  }
  const name = matches[0].name;
  receipts.push(await UI.tapTargets([{role: 'button', name}], {within: win}));
  if (name === '全部清除') { cleared = true; break; }
}
const actual = await UI.readText({within: win});
if (!cleared || actual !== '0') throw new Error('Preparation failed');
console.log(JSON.stringify({actual, receipts}));
