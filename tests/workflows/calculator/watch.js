// Independent read-only live witness. Does not load, patch or supply data to Recipe.
// Test expectations only select evidence; actual values always come from snapshot.
'use strict';
const win = await window.get({app: {bundleId: 'com.apple.calculator'}});
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
const observations = [];
let firstCapture = null;
let ready = false;
let unavailableSince = null;
const deadline = Date.now() + 50000;
while (Date.now() < deadline) {
  const current = await window.current(win);
  if (!current.isForeground || !current.hasFocus || current.title !== 'Calculator'
      || current.width !== 232 || current.height !== 321) throw new Error('Witness scope changed');
  const snapshot = await Accessibility.snapshot({
    within: win, maxDepth: 16, maxNodes: 300, properties: ['role', 'name', 'value'],
  });
  if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete witness observation');
  const display = flatten(snapshot.root).filter(n => n.role === 'staticText' && n.name === '主显示器');
  // During an input transition the display can temporarily have no readable value.
  // Retain the observation; wait only for this read-only condition, never retry input.
  if (display.length !== 1 || typeof display[0].value !== 'string') {
    console.log(JSON.stringify({kind: 'display-unavailable', time: new Date().toISOString(), snapshot}));
    if (display.length > 1) throw new Error('Witness display ambiguous');
    if (unavailableSince === null) unavailableSince = Date.now();
    if (Date.now() - unavailableSince > 2000) throw new Error('Witness display unavailable for 2 seconds');
    await page.waitForTimeout(50);
    continue;
  }
  unavailableSince = null;
  const value = display[0].value;
  if (!observations.length || observations[observations.length - 1].value !== value) {
    observations.push({time: new Date().toISOString(), value, requestId: snapshot.requestId});
    console.log(JSON.stringify({kind: 'display-change', observation: observations[observations.length - 1]}));
  }
  if (!ready && observations.length === 1 && value === '0') {
    ready = true;
    console.log('CALCULATOR_WITNESS_READY');
  }
  if (value === '110' && !firstCapture) {
    firstCapture = await page.screenshot({
      clip: {x: current.x, y: current.y, width: current.width, height: current.height},
      path: Execution.artifactDir + '/first-result.png', returnType: 'object',
    });
  }
  if (value === '660' && firstCapture) break;
  await page.waitForTimeout(50);
}
console.log(JSON.stringify({observations, firstCapture}));
