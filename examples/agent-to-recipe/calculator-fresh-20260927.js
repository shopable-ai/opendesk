// Calculator Basic, current macOS locale. Run from the repository root with
// ./dist/opendesk -script examples/agent-to-recipe/calculator-fresh-20260927.js
// Runtime values are read from this execution's native Calculator display.

const APP = { bundleId: 'com.apple.calculator' };
const DISPLAY = { role: 'staticText', name: '主显示器' };
const CLEAR = '清除';
const FIRST_BUTTONS = ['2', '5', '×', '4', '+', '1', '0', '='];
const SECOND_PREFIX = ['6', '×'];

function record(kind, data) {
  console.log(JSON.stringify({ kind, executionId: Execution.id, ...data }));
}

function stop(reason, data = {}) {
  record('stop', { reason, ...data });
  throw new Error(reason);
}

function errorFields(error) {
  return {
    name: error && error.name,
    message: error && error.message,
    code: error && error.code,
    operation: error && error.operation,
    backend: error && error.backend,
    phase: error && error.phase,
    requestId: error && error.requestId,
    actionState: error && error.actionState,
  };
}

async function call(operation, request, invoke) {
  record('request', { operation, request });
  try {
    const receipt = await invoke();
    record('receipt', { operation, receipt });
    return receipt;
  } catch (error) {
    record('error', { operation, error: errorFields(error) });
    throw error;
  }
}

function sameIdentity(original, current) {
  return current && original.id === current.id && original.pid === current.pid &&
    original.handle && current.handle && original.handle === current.handle;
}

function sameBounds(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// B1: resolve one current, exact Calculator window; accept geometry only after activation.
async function openCurrentWindow() {
  const found = await call('window.get', { app: APP }, () => window.get({ app: APP }));
  if (!found || !found.id || !found.pid || !found.handle ||
      !Number.isFinite(found.width) || found.width <= 0 ||
      !Number.isFinite(found.height) || found.height <= 0) {
    stop('unresolved Calculator window');
  }
  const active = found.isForeground ? found : await call(
    'window.activate', { target: found, options: { timeout: 5000 } },
    () => window.activate(found, { timeout: 5000 }),
  );
  if (!sameIdentity(found, active) || active.isForeground !== true) {
    stop('Calculator activation identity or foreground unverified');
  }
  return active;
}

async function refreshWindow(base, acceptedBounds) {
  const current = await call('window.current', { target: base },
    () => window.current(base));
  if (!sameIdentity(base, current) || !sameBounds(acceptedBounds, current)) {
    stop('Calculator window identity or within-run geometry changed', { current });
  }
  if (!sameIdentity(base, current) || !sameBounds(acceptedBounds, current) ||
      current.isForeground !== true) {
    stop('Calculator foreground unverified', { current });
  }
  return current;
}

function fields(node) {
  if (!node || typeof node !== 'object') return node;
  return { ...node, ...(node.properties && typeof node.properties === 'object'
    ? node.properties : {}) };
}

function collectNodes(node, output) {
  if (!node || typeof node !== 'object') return;
  output.push(fields(node));
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodes(child, output);
  }
}

// B1/B2/B4/B5: complete native tree, unique display and all distinct stage buttons.
async function preflight(base, bounds, buttonNames, stage) {
  const current = await refreshWindow(base, bounds);
  const request = {
    within: current, maxDepth: 6, maxNodes: 100,
    properties: ['role', 'name', 'identifier', 'enabled', 'actions', 'value'],
  };
  const snapshot = await call('Accessibility.snapshot',
    { stage, options: { ...request, within: current } },
    () => Accessibility.snapshot(request));
  if (!snapshot || snapshot.complete !== true || snapshot.truncated !== false || !snapshot.root) {
    stop('incomplete Calculator AX preflight', { stage, snapshot });
  }
  const nodes = [];
  collectNodes(snapshot.root, nodes);
  const displays = nodes.filter(n => n && n.role === DISPLAY.role && n.name === DISPLAY.name);
  if (displays.length !== 1 || typeof displays[0].value !== 'string') {
    stop('Calculator display missing, ambiguous, or unreadable', { stage, displays });
  }
  for (const name of new Set(buttonNames)) {
    const matches = nodes.filter(n => n && n.role === 'button' && n.name === name);
    if (matches.length !== 1 || matches[0].enabled !== true ||
        !Array.isArray(matches[0].actions) || !matches[0].actions.includes('invoke')) {
      stop('Calculator button preflight failed', { stage, name, matches });
    }
  }
  record('preflight', { stage, snapshotRequestId: snapshot.requestId,
    nodeCount: nodes.length, buttonNames: [...new Set(buttonNames)] });
}

function valueFromRead(read) {
  const p = fields(read);
  return p && Object.prototype.hasOwnProperty.call(p, 'value') ? p.value : undefined;
}

// B1/B3/B4/B6: preserve raw native read; parse digits only at result boundaries.
async function readDisplay(base, bounds, label) {
  const current = await refreshWindow(base, bounds);
  const ref = await call('Accessibility.find', { selector: DISPLAY, options: { within: current, maxDepth: 6, maxNodes: 100 } },
    () => Accessibility.find(DISPLAY, { within: current, maxDepth: 6, maxNodes: 100 }));
  if (!ref) stop('Calculator display target missing', { label });
  let failed = false;
  try {
    const read = await call('Accessibility.read',
      { label, ref, options: { properties: ['role', 'name', 'identifier', 'value'] } },
      () => Accessibility.read(ref, { properties: ['role', 'name', 'identifier', 'value'] }));
    const p = fields(read);
    if (!p || p.role !== DISPLAY.role || p.name !== DISPLAY.name ||
        typeof valueFromRead(read) !== 'string') {
      stop('Calculator display read shape or value invalid', { label, read });
    }
    const raw = valueFromRead(read);
    record('display', { label, raw });
    return raw;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await call('Accessibility.release', { ref }, () => Accessibility.release(ref));
    } catch (error) {
      if (!failed) throw error;
    }
  }
}

function decimalDigits(raw, label) {
  const parsed = raw.trim();
  if (!/^[0-9]+$/.test(parsed)) stop('non-decimal Calculator display', { label, raw });
  record('parsed-display', { label, raw, parsed });
  return parsed;
}

// One fresh exact semantic target and at most one native submission per button.
async function press(base, bounds, name, label) {
  const current = await refreshWindow(base, bounds);
  const selector = { role: 'button', name };
  const ref = await call('Accessibility.find', { selector, options: { within: current, maxDepth: 6, maxNodes: 100 } },
    () => Accessibility.find(selector, { within: current, maxDepth: 6, maxNodes: 100 }));
  if (!ref) stop('Calculator button target missing', { label, name });
  let failed = false;
  try {
    const target = await call('Accessibility.read',
      { label, ref, options: { properties: ['role', 'name', 'enabled', 'actions'] } },
      () => Accessibility.read(ref, { properties: ['role', 'name', 'enabled', 'actions'] }));
    const p = fields(target);
    if (!p || p.role !== 'button' || p.name !== name || p.enabled !== true ||
        !Array.isArray(p.actions) || !p.actions.includes('invoke')) {
      stop('Calculator button identity or action invalid', { label, name, target });
    }
    const receipt = await call('Accessibility.perform',
      { label, ref, action: { action: 'invoke' } },
      () => Accessibility.perform(ref, { action: 'invoke' }));
    if (!receipt || receipt.actionState !== 'acknowledged') {
      stop('Calculator action unacknowledged; no replay', { label, name, receipt });
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await call('Accessibility.release', { ref }, () => Accessibility.release(ref));
    } catch (error) {
      if (!failed) throw error;
    }
  }
  await readDisplay(base, bounds, `after-${label}`);
}

async function clearAndCheck(base, bounds, label) {
  await press(base, bounds, CLEAR, label);
  const raw = await readDisplay(base, bounds, `${label}-zero`);
  if (decimalDigits(raw, `${label}-zero`) !== '0') {
    stop('Calculator clear did not produce zero', { label, raw });
  }
}

async function main() {
  if (Execution.input && Object.keys(Execution.input).length !== 0) {
    stop('this fixed Calculator recipe accepts no caller parameters');
  }
  record('start', { artifactDir: Execution.artifactDir });
  const base = await openCurrentWindow();
  const bounds = { x: base.x, y: base.y, width: base.width, height: base.height };

  await preflight(base, bounds, [CLEAR, ...FIRST_BUTTONS], 'first');
  await clearAndCheck(base, bounds, 'B1-clear');
  for (const name of FIRST_BUTTONS) {
    await press(base, bounds, name, `B2-${name}`);
  }
  const firstRaw = await readDisplay(base, bounds, 'B3-first-result');
  const firstResult = decimalDigits(firstRaw, 'B3-first-result');
  record('runtime-value', { name: 'firstResult', raw: firstRaw, value: firstResult });

  await preflight(base, bounds, [CLEAR], 'second-clear');
  await clearAndCheck(base, bounds, 'B4-clear');
  const secondButtons = [...SECOND_PREFIX, ...firstResult.split(''), '='];
  await preflight(base, bounds, secondButtons, 'second');
  for (const name of secondButtons) {
    await press(base, bounds, name, `B5-${name}`);
  }
  const finalRaw = await readDisplay(base, bounds, 'B6-final-result');
  const finalResult = decimalDigits(finalRaw, 'B6-final-result');
  record('runtime-value', { name: 'finalResult', raw: finalRaw, value: finalResult });
  console.log(finalResult);
  return finalResult;
}

// -script does not publish an ordinary function return field. Keep the real return
// and capture that same call value in this execution's human-readable stdout.
try {
  const returned = await main();
  record('main-return', { value: returned });
} catch (error) {
  record('stopped', { error: errorFields(error), sideEffectState: 'inspect-read-only-before-retry' });
  throw error;
}
