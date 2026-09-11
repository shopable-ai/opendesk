// Explicit live qualification for the maintained Human-to-Recipe Calculator
// automation. This file is not loaded by ordinary Runtime API gates.
//
// Run from the OpenDesk repository root:
// OPENDESK_CALCULATOR_115_CONFIRM=authorized-calculator-fixture \
// ./dist/opendesk -ui -script tests/runtime-api/calculator-115-semantic-recipe-macos.js -console-mode script

'use strict';

const CONFIRM_TOKEN = 'authorized-calculator-fixture';
const SOURCE_SHA256 = '9238fad978581a6f6308b931dd91cd5ced76ad2d2f892f5ebf0965b3143c9574';
const RECIPE_SHA256 = '5e5fdefe328ce54dead9093a60019b977e0699ba9c7c36a585b3dd959aae5040';
const CALCULATOR = Object.freeze({
  bundleId: 'com.apple.calculator',
  executablePath: '/System/Applications/Calculator.app/Contents/MacOS/Calculator',
  title: 'Calculator',
  width: 232,
  height: 321,
});
const CLEAR_NAMES = new Set(['全部清除', '清除', 'All Clear', 'Clear', 'AC', 'C']);
const ACCESSIBILITY_OPTIONS = Object.freeze({timeout: 10000, maxDepth: 12, maxNodes: 2000});

const SOURCE_ACTIONS = Object.freeze([
  Object.freeze({id: 'a0001', name: '全部清除', identifier: '_NS:407', x: 33, y: 107}),
  Object.freeze({id: 'a0002', name: '2', identifier: '_NS:266', x: 83, y: 239}),
  Object.freeze({id: 'a0003', name: '5', identifier: '_NS:331', x: 82, y: 203}),
  Object.freeze({id: 'a0004', name: '×', identifier: '_NS:339', x: 195, y: 149}),
  Object.freeze({id: 'a0005', name: '4', identifier: '_NS:358', x: 17, y: 198}),
  Object.freeze({id: 'a0006', name: '=', identifier: '_NS:276', x: 205, y: 294}),
  Object.freeze({id: 'a0007', name: '+', identifier: '_NS:374', x: 203, y: 251}),
  Object.freeze({id: 'a0008', name: '2', identifier: '_NS:266', x: 88, y: 247}),
  Object.freeze({id: 'a0009', name: '0', identifier: '_NS:304', x: 76, y: 290}),
  Object.freeze({id: 'a0010', name: '−', identifier: '_NS:321', x: 203, y: 197}),
  Object.freeze({id: 'a0011', name: '5', identifier: '_NS:331', x: 98, y: 197}),
  Object.freeze({id: 'a0012', name: '=', identifier: '_NS:276', x: 204, y: 292}),
]);

// The first transition normalizes a possible C state. The remaining actions
// qualify the production intent and its strict independent display oracle.
const QUALIFICATION_STEPS = Object.freeze([
  Object.freeze({id: 'setup-clear', name: '全部清除', identifier: '_NS:407', x: 33, y: 107, display: '0', dynamicName: true}),
  Object.freeze({id: 'a0001', name: '全部清除', identifier: '_NS:407', x: 33, y: 107, display: '0', dynamicName: true}),
  Object.freeze({id: 'a0002', name: '2', identifier: '_NS:266', x: 83, y: 239, display: '2'}),
  Object.freeze({id: 'a0003', name: '5', identifier: '_NS:331', x: 82, y: 203, display: '25'}),
  Object.freeze({id: 'a0004', name: '×', identifier: '_NS:339', x: 195, y: 149, display: '25'}),
  Object.freeze({id: 'a0005', name: '4', identifier: '_NS:358', x: 17, y: 198, display: '4'}),
  Object.freeze({id: 'a0006', name: '=', identifier: '_NS:276', x: 204, y: 292, display: '100'}),
  Object.freeze({id: 'a0007', name: '+', identifier: '_NS:374', x: 203, y: 251, display: '100'}),
  Object.freeze({id: 'a0008', name: '2', identifier: '_NS:266', x: 83, y: 239, display: '2'}),
  Object.freeze({id: 'a0009', name: '0', identifier: '_NS:304', x: 76, y: 290, display: '20'}),
  Object.freeze({id: 'a0010', name: '−', identifier: '_NS:321', x: 203, y: 197, display: '120'}),
  Object.freeze({id: 'a0011', name: '5', identifier: '_NS:331', x: 82, y: 203, display: '5'}),
  Object.freeze({id: 'a0012', name: '=', identifier: '_NS:276', x: 204, y: 292, display: '115'}),
]);

const sourcePath = File.join(
  Execution.workdir,
  '.runtime',
  'recordings',
  'rec-20260909T113509.231387000Z-e2232547fa4e',
  'actions.json',
);
const recipePath = File.join(
  Execution.workdir,
  'examples',
  'human-to-recipe',
  'calculator-115.semantic.recipe.js',
);
const runDir = File.join(
  Execution.workdir,
  '.runtime',
  'tests',
  'runtime-api',
  `calculator-115-qualification-${Execution.id}`,
);

function fail(message, details) {
  throw new Error(details === undefined ? message : `${message}: ${JSON.stringify(details)}`);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function flatten(node, output = []) {
  if (!node || typeof node !== 'object') return output;
  output.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, output);
  return output;
}

function numericDisplay(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

function sameWindow(left, right) {
  if (String(left.id || '') && String(right.id || '')) {
    return String(left.id) === String(right.id);
  }
  return Number(left.pid) === Number(right.pid)
    && String(left.title || '') === String(right.title || '');
}

function errorDetails(error) {
  return {
    name: String(error && error.name || 'Error'),
    message: String(error && error.message || error),
    code: error && error.code ? String(error.code) : null,
    operation: error && error.operation ? String(error.operation) : null,
    actionState: error && error.actionState ? String(error.actionState) : null,
  };
}

async function requireActiveCalculator(target) {
  const active = await window.getActiveWindow();
  assert(sameWindow(active, target), 'Calculator is no longer the exact active window', {target, active});
  assert(String(active.exePath || '') === CALCULATOR.executablePath,
    'active executable is not the system Calculator', active);
  assert(Number(active.width) === CALCULATOR.width && Number(active.height) === CALCULATOR.height,
    'Calculator layout changed during qualification', active);
  return active;
}

async function resolveCalculator() {
  const platform = System.getPlatformInfo();
  assert(platform && platform.os === 'darwin', 'this qualification requires macOS', platform);

  const capabilities = Accessibility.getCapabilities();
  assert(capabilities.hostAuthorization && capabilities.hostAuthorization.enabled === true,
    'Accessibility is disabled for this execution', capabilities);
  assert(capabilities.implementation && capabilities.implementation.available === true,
    'native Accessibility is unavailable', capabilities);
  assert(capabilities.permission && capabilities.permission.granted === true,
    'native Accessibility permission is not granted', capabilities);

  await App.launch({bundleId: CALCULATOR.bundleId}, {
    activate: true,
    waitUntilReady: 'window',
    timeout: 10000,
  });
  const matches = (await window.list()).filter((candidate) =>
    String(candidate.exePath || '') === CALCULATOR.executablePath
      && String(candidate.title || '') === CALCULATOR.title);
  assert(matches.length === 1, 'expected exactly one Calculator window', {count: matches.length});
  const target = matches[0];
  assert(Number(target.width) === CALCULATOR.width && Number(target.height) === CALCULATOR.height,
    'Calculator does not use the qualified layout', target);

  const active = await window.getActiveWindow();
  if (!sameWindow(active, target)) {
    await window.bringToTop(target.title, Number(target.pid));
    await sleep(200);
  }
  await requireActiveCalculator(target);
  return target;
}

async function readDisplay(target) {
  const active = await requireActiveCalculator(target);
  const snapshot = await Accessibility.snapshot({
    within: active,
    ...ACCESSIBILITY_OPTIONS,
    properties: ['role', 'value'],
  });
  assert(snapshot && snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator Accessibility snapshot is incomplete', snapshot && {
      complete: snapshot.complete,
      truncated: snapshot.truncated,
      reason: snapshot.reason,
    });
  const displays = flatten(snapshot.root)
    .filter((node) => node.role === 'staticText' && numericDisplay(node.value) !== null)
    .map((node) => numericDisplay(node.value));
  assert(displays.length === 1, 'expected exactly one numeric Calculator display', {displays});
  return displays[0];
}

async function waitForDisplay(target, expected, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await readDisplay(target);
    if (actual === expected) return actual;
    await sleep(50);
  }
  fail('Calculator display transition failed', {expected, actual});
}

async function inspectStepTarget(target, step) {
  const ref = await Accessibility.find(
    {role: 'button', identifier: step.identifier},
    {within: target, ...ACCESSIBILITY_OPTIONS},
  );
  assert(ref, `Calculator target ${step.id} was not found`, step);
  try {
    const current = await Accessibility.read(ref, {
      properties: ['role', 'name', 'identifier', 'enabled', 'actions'],
      timeout: ACCESSIBILITY_OPTIONS.timeout,
    });
    const properties = current && current.properties || {};
    assert(properties.role === 'button'
      && properties.identifier === step.identifier
      && properties.enabled === true
      && Array.isArray(properties.actions)
      && properties.actions.includes('invoke'),
    `Calculator target ${step.id} is not uniquely invokable`, properties);
    if (step.dynamicName) {
      assert(CLEAR_NAMES.has(String(properties.name || '')),
        'Calculator clear control has an unexpected state name', properties);
    } else {
      assert(String(properties.name || '') === step.name,
        `Calculator target ${step.id} name changed`, {expected: step.name, actual: properties.name});
    }

    return properties;
  } finally {
    await Accessibility.release(ref);
  }
}

async function runQualifiedRecipe(target, recipeSource, observations, notificationTrace) {
  const originalClickForPID = mouse.clickForPID;
  const originalNotify = ui.notify;
  let nextStep = 0;
  mouse.clickForPID = async (processID, x, y) => {
    const step = QUALIFICATION_STEPS[nextStep];
    assert(step, 'production recipe emitted more actions than the qualification contract', {
      processID, x, y, expectedCount: QUALIFICATION_STEPS.length,
    });

    const active = await requireActiveCalculator(target);
    assert(Number(processID) === Number(active.pid),
      `production recipe targeted the wrong PID at ${step.id}`, {processID, activePid: active.pid});
    const expectedPoint = Geometry.pointOffset(active, step.x, step.y);
    assert(Number(x) === expectedPoint.x && Number(y) === expectedPoint.y,
      `production recipe projected the wrong point at ${step.id}`, {
        expected: expectedPoint,
        actual: {x, y},
      });

    const properties = await inspectStepTarget(active, step);
    await originalClickForPID.call(mouse, processID, x, y);
    const display = await waitForDisplay(target, step.display);
    observations.push({
      id: step.id,
      identifier: step.identifier,
      expectedName: step.name,
      actualName: properties.name,
      point: expectedPoint,
      expectedDisplay: step.display,
      actualDisplay: display,
    });
    nextStep += 1;
  };
  ui.notify = async (options) => {
    const handle = await originalNotify(options);
    const id = String(handle.id || '');
    notificationTrace.push({operation: 'create', id, options: JSON.parse(JSON.stringify(options))});
    return Object.freeze({
      id,
      async update(patch) {
        notificationTrace.push({operation: 'update', id, patch: JSON.parse(JSON.stringify(patch))});
        return handle.update(patch);
      },
      async close() {
        notificationTrace.push({operation: 'close', id});
        return handle.close();
      },
      async getState() {
        notificationTrace.push({operation: 'getState', id});
        return handle.getState();
      },
      async waitUntilClosed() {
        notificationTrace.push({operation: 'waitUntilClosed', id});
        return handle.waitUntilClosed();
      },
    });
  };

  try {
    // Execute the exact frozen production bytes. The harness only instruments
    // the existing native action boundary so it can observe each transition;
    // it does not carry a second business replay implementation.
    await (0, eval)(`(async () => {\n${recipeSource}\n})()`);
  } finally {
    mouse.clickForPID = originalClickForPID;
    ui.notify = originalNotify;
  }
  assert(nextStep === QUALIFICATION_STEPS.length,
    'production recipe emitted fewer actions than the qualification contract', {
      expected: QUALIFICATION_STEPS.length,
      actual: nextStep,
    });
  const presentations = notificationTrace.filter((item) =>
    item.operation === 'create' || item.operation === 'update');
  assert(presentations.length === 4,
    'recipe must create one notification and update it for later semantic stages and success',
    notificationTrace);
  const messages = presentations.map((item) =>
    String(item.options && item.options.message || item.patch && item.patch.message || ''));
  assert(JSON.stringify(messages) === JSON.stringify([
    '计算 25 乘以 4',
    '在当前结果上加 20',
    '从当前结果减去 5',
    '任务完成',
  ]), 'notification messages must come from the reviewed Business Episodes', messages);
  assert(new Set(presentations.map((item) => item.id)).size === 1,
    'semantic stages created more than one notification handle', notificationTrace);
}

async function qualifySource() {
  assert(File.isFile(sourcePath), 'source actions file is missing', sourcePath);
  assert(File.isFile(recipePath), 'maintained recipe is missing', recipePath);

  const cryptoPath = File.join(Execution.workdir, 'tests', 'runtime-api', 'crypto.js');
  assert(File.isFile(cryptoPath), 'Runtime API SHA-256 helper is missing', cryptoPath);
  (0, eval)(File.read(cryptoPath));

  const sourceSha256 = RuntimeAPICrypto.hashFile(sourcePath);
  assert(sourceSha256 === SOURCE_SHA256, 'source actions hash changed', {
    expected: SOURCE_SHA256,
    actual: sourceSha256,
  });

  const source = await File.readJSON(sourcePath);
  assert(source && source.formatVersion === 'opendesk.recorder.actions/v2',
    'unexpected source actions format', source && source.formatVersion);
  assert(source.recordingId === 'rec-20260909T113509.231387000Z-e2232547fa4e'
    && Number(source.revision) === 1
    && source.readiness === 'ready'
    && Array.isArray(source.issues)
    && source.issues.length === 0,
  'source actions are not the qualified ready revision', source);
  assert(Array.isArray(source.actions) && source.actions.length === SOURCE_ACTIONS.length,
    'source action count changed', {count: source.actions && source.actions.length});

  source.actions.forEach((action, index) => {
    const expected = SOURCE_ACTIONS[index];
    const element = action && action.target && action.target.element || {};
    const sourceWindow = action && action.target && action.target.window || {};
    const application = sourceWindow.application || {};
    const bounds = sourceWindow.bounds || {};
    const position = action && action.position && action.position.window || {};
    assert(action.kind === 'click'
      && action.id === expected.id
      && action.target.semanticStatus === 'verified'
      && sourceWindow.title === CALCULATOR.title
      && application.identityKind === 'executable-path'
      && application.identityValue === CALCULATOR.executablePath
      && Number(bounds.width) === CALCULATOR.width
      && Number(bounds.height) === CALCULATOR.height
      && element.role === 'button'
      && element.nativeRole === 'AXButton'
      && element.name === expected.name
      && element.identifier === expected.identifier
      && Array.isArray(element.nativeActions)
      && element.nativeActions.includes('AXPress')
      && position.space === 'window-logical'
      && position.verified === true
      && Number(position.offsetX) === expected.x
      && Number(position.offsetY) === expected.y,
    `source action ${expected.id} changed`, {expected, action});
  });

  const recipeSource = File.read(recipePath);
  const recipeSha256 = RuntimeAPICrypto.hashFile(recipePath);
  assert(recipeSha256 === RECIPE_SHA256, 'production recipe hash changed', {
    expected: RECIPE_SHA256,
    actual: recipeSha256,
  });
  for (const forbidden of ['expectedDisplay', 'finalDisplay', 'File.writeJSON', '[PASS]']) {
    assert(!recipeSource.includes(forbidden),
      `production recipe crossed the qualification boundary: ${forbidden}`);
  }

  return {
    recipeSource,
    summary: {
      recordingId: source.recordingId,
      revision: source.revision,
      actionsSha256: sourceSha256,
      actionCount: source.actions.length,
      recipeSha256,
    },
  };
}

async function capture(name) {
  return page.screenshot({
    target: 'activeWindow',
    path: File.join(runDir, name),
    returnType: 'path',
  });
}

const result = {
  schemaVersion: 1,
  kind: 'human-to-recipe-calculator-115-qualification',
  passed: false,
  executionId: Execution.id,
  startedAt: new Date().toISOString(),
  evidenceDirectory: runDir,
  source: null,
  screenshots: {},
  observations: [],
  notificationTrace: [],
  finalDisplay: null,
  error: null,
};

await File.ensureDir(runDir);
try {
  assert(Execution.env.OPENDESK_CALCULATOR_115_CONFIRM === CONFIRM_TOKEN,
    `live Calculator input is disabled; set OPENDESK_CALCULATOR_115_CONFIRM=${CONFIRM_TOKEN}`);
  const qualifiedSource = await qualifySource();
  result.source = qualifiedSource.summary;
  const target = await resolveCalculator();
  result.target = {
    id: target.id,
    pid: target.pid,
    title: target.title,
    executablePath: target.exePath,
    width: target.width,
    height: target.height,
  };
  result.screenshots.before = await capture('before.png');
  await runQualifiedRecipe(
    target,
    qualifiedSource.recipeSource,
    result.observations,
    result.notificationTrace,
  );
  result.finalDisplay = await readDisplay(target);
  assert(result.finalDisplay === '115', 'final Calculator business oracle failed', {
    expected: '115',
    actual: result.finalDisplay,
  });
  result.screenshots.after = await capture('after.png');
  result.passed = true;
  result.completedAt = new Date().toISOString();
  await File.writeJSON(File.join(runDir, 'result.json'), result);
  console.log(`[PASS] Calculator 115 qualification; evidence=${runDir}`);
} catch (error) {
  result.error = errorDetails(error);
  result.completedAt = new Date().toISOString();
  await File.writeJSON(File.join(runDir, 'result.json'), result);
  throw error;
}
