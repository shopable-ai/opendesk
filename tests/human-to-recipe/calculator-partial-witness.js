// Independent read-only Human H7 observer. No Expected or Candidate result data.
// The gate supplies only process completion, after the exact candidate exits.
'use strict';
const win = await window.get({app: {bundleId: 'com.apple.calculator'}});
if (win.title !== 'Calculator' || win.width !== 232 || win.height !== 321
    || !win.id || win.id.endsWith(':unresolved') || win.pid <= 0 || win.handle <= 0) {
  throw new Error('Unsupported Calculator witness scope');
}
function flatten(node) { return [node].concat(...(node.children || []).map(flatten)); }
const observations = [];
let seenInitialClear = false;
let seenFirstInput = false;
let seenClear = false;
const completionFile = Execution.artifactDir + '/candidate-complete.json';
const startedAt = Date.now();
let completion = null;
let terminalValue = null;
let stableSince = null;
let stableTerminalObserved = false;
let unavailableSince = null;
const deadline = Date.now() + 55000;
while (Date.now() < deadline) {
  if (completion === null && File.exists(completionFile)) {
    completion = await File.readJSON(completionFile, {maxBytes: 1024});
    if (!completion || completion.kind !== 'candidate-process-complete'
        || completion.status !== 0 || !Number.isFinite(completion.finishedAt)
        || completion.finishedAt < startedAt || completion.finishedAt > Date.now()) {
      throw new Error('Invalid or failed candidate completion boundary');
    }
    // A full stable interval starts only after process completion is observed.
    terminalValue = null;
  }
  const current = await window.current(win);
  if (current.id !== win.id || current.pid !== win.pid || current.handle !== win.handle
      || current.title !== win.title || current.x !== win.x || current.y !== win.y
      || current.width !== win.width || current.height !== win.height) {
    throw new Error('Calculator witness window identity changed');
  }
  const snapshot = await Accessibility.snapshot({within: current, maxDepth: 16,
    maxNodes: 300, properties: ['role', 'name', 'value']});
  if (!snapshot.complete || snapshot.truncated) throw new Error('Incomplete witness snapshot');
  const displays = flatten(snapshot.root).filter(n => n.role === 'staticText' && n.name === '主显示器');
  if (displays.length > 1) throw new Error('Witness display ambiguous');
  if (displays.length !== 1 || typeof displays[0].value !== 'string') {
    console.log(JSON.stringify({kind: 'display-unavailable', time: new Date().toISOString(),
      requestId: snapshot.requestId, displayCount: displays.length,
      snapshot: unavailableSince === null ? snapshot : undefined}));
    if (completion !== null) throw new Error('Terminal display unavailable after candidate completion');
    if (unavailableSince === null) unavailableSince = Date.now();
    if (Date.now() - unavailableSince > 2000) throw new Error('Witness display unavailable too long');
    await page.waitForTimeout(40);
    continue;
  }
  unavailableSince = null;
  const value = displays[0].value;
  if (completion !== null) {
    if (terminalValue === null) {
      terminalValue = value;
      stableSince = Date.now();
    } else if (value !== terminalValue) {
      throw new Error('Terminal display changed after candidate completion');
    }
  }
  const previous = observations[observations.length - 1];
  if (!previous || previous.value !== value) {
    if (observations.length >= 40) throw new Error('Witness transition budget exhausted');
    const screenshot = current.isForeground ? await page.screenshot({clip: {
      x: current.x, y: current.y, width: current.width, height: current.height,
    }, path: Execution.artifactDir + '/display-' + observations.length + '.png', returnType: 'object'}) : null;
    const row = {time: new Date().toISOString(), value, requestId: snapshot.requestId, screenshot};
    observations.push(row);
    console.log(JSON.stringify({kind: 'display-change', row}));
    if (observations.length === 1) {
      seenInitialClear = value === '0';
      console.log(JSON.stringify({kind: 'witness-ready', executionId: Execution.id, completionFile, window: win}));
      console.log('FRESH_WITNESS_READY');
    } else if (!seenInitialClear) {
      if (value === '0') seenInitialClear = true;
    } else if (value !== '0' && !seenClear) seenFirstInput = true;
    else if (value === '0' && seenFirstInput) seenClear = true;
  }
  if (completion !== null && seenClear && value !== '0'
      && stableSince !== null && Date.now() - stableSince >= 4000) {
    stableTerminalObserved = true;
    break;
  }
  await page.waitForTimeout(40);
}
if (!stableTerminalObserved || !seenInitialClear || !seenClear
    || observations.length < 4 || observations.at(-1).value === '0') {
  throw new Error('Witness did not observe nonzero → clear → nonzero sequence');
}
console.log(JSON.stringify({kind: 'witness-complete', observations,
  executionId: Execution.id, window: win, completion, stableTerminalObserved, stableTerminalMs: Date.now() - stableSince,
  initialObservedValue: observations[0].value, initialClearObserved: seenInitialClear,
  firstResult: 'to-be-correlated-after-Candidate-run',
  lastObservedValue: observations.at(-1).value}));
