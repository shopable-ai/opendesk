// macOS Calculator smoke test for Recorder.pause() / Recorder.resume().
//
// Run from the repository root:
// OPENDESK_RECORDER_CALCULATOR_CONFIRM=authorized-calculator-fixture \
// ./dist/opendesk -allow-recorder-capture \
//   -script tests/human-to-recipe/calculator-pause-resume.js \
//   -console-mode script
//
// This script launches Calculator and visibly enters 9, 8, and 7. The click on
// 8 happens while Recorder is paused, so Calculator ends at 987 while the saved
// recording and actions contain only the clicks on 9 and 7. It does not replay
// or run generated automation.
'use strict';

const CONFIRM_TOKEN = 'authorized-calculator-fixture';
const CALCULATOR_BUNDLE_ID = 'com.apple.calculator';
const CALCULATOR_PATH = '/System/Applications/Calculator.app/Contents/MacOS/Calculator';
const outputRoot = File.join(Execution.workdir, '.runtime', 'tests', 'human-to-recipe');
const runDir = File.join(outputRoot, `calculator-pause-resume-${Date.now()}-${Execution.id}`);

function fail(message, details) {
  const suffix = details === undefined ? '' : `: ${JSON.stringify(details)}`;
  throw new Error(`${message}${suffix}`);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function flatten(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  result.push(node);
  for (const child of Array.isArray(node.children) ? node.children : []) flatten(child, result);
  return result;
}

function checkedBounds(value, label) {
  const result = value && {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
    coordinateSpace: String(value.coordinateSpace || ''),
  };
  assert(result && [result.x, result.y, result.width, result.height].every(Number.isFinite)
    && result.width > 0 && result.height > 0, `${label} has invalid bounds`, value);
  return result;
}

function near(left, right, tolerance = 4) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function normalizeNumber(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? text : null;
}

async function exactActiveWindow(scope) {
  const active = await window.getActiveWindow();
  const processId = Number(active && (active.pid || active.processID));
  assert(processId === scope.processId && String(active.title || '') === scope.title,
    'Calculator is no longer the exact active window', {expected: scope, actual: active});
  assert(String(active.exePath || '') === CALCULATOR_PATH,
    'The active application is not the macOS system Calculator', active);
  return active;
}

async function observeCalculator(scope) {
  const active = await exactActiveWindow(scope);
  const snapshot = await Accessibility.snapshot({
    within: active,
    maxDepth: 12,
    maxNodes: 2000,
    timeout: 10000,
    properties: ['role', 'name', 'value', 'enabled', 'actions', 'nativeBounds'],
  });
  assert(snapshot && snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator Accessibility snapshot is incomplete', snapshot);
  const root = checkedBounds(snapshot.root.nativeBounds, 'Calculator root');
  assert(near(root.x, active.x) && near(root.y, active.y)
    && near(root.width, active.width) && near(root.height, active.height),
  'Calculator snapshot does not match the active window', {root, active});
  return {active, root, nodes: flatten(snapshot.root)};
}

function readDisplay(observation) {
  const candidates = observation.nodes.filter((node) => {
    if (node.role !== 'staticText' || normalizeNumber(node.value) === null || !node.nativeBounds) return false;
    const item = checkedBounds(node.nativeBounds, 'Calculator display candidate');
    const centerY = item.y + item.height / 2;
    return centerY >= observation.root.y
      && centerY <= observation.root.y + observation.root.height * 0.28;
  });
  assert(candidates.length === 1, 'Expected one numeric Calculator display', {
    values: candidates.map((node) => node.value),
  });
  return normalizeNumber(candidates[0].value);
}

function buttonPoint(observation, name) {
  const candidates = observation.nodes.filter((node) => node.role === 'button'
    && String(node.name || '') === name
    && node.enabled === true
    && Array.isArray(node.actions)
    && node.actions.includes('invoke'));
  assert(candidates.length === 1, `Expected one invokable Calculator button ${name}`);
  const target = checkedBounds(candidates[0].nativeBounds, `Calculator button ${name}`);
  assert(target.coordinateSpace === observation.root.coordinateSpace,
    `Calculator button ${name} changed coordinate space`, {root: observation.root, target});

  const relativeX = (target.x + target.width / 2 - observation.root.x) / observation.root.width;
  const relativeY = (target.y + target.height / 2 - observation.root.y) / observation.root.height;
  assert(relativeX > 0 && relativeX < 1 && relativeY > 0 && relativeY < 1,
    `Calculator button ${name} is outside the active window`, {relativeX, relativeY});
  return {
    x: Math.round(observation.active.x + observation.active.width * relativeX),
    y: Math.round(observation.active.y + observation.active.height * relativeY),
  };
}

async function waitForDisplay(scope, expected, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const observation = await observeCalculator(scope);
    last = readDisplay(observation);
    if (last === expected) return observation;
    await page.waitForTimeout(50);
  }
  fail(`Calculator display did not become ${expected}`, {last});
}

async function waitForCount(session, name, minimum, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let status = session.status();
  while (Date.now() < deadline) {
    status = session.status();
    if (Number(status.counts && status.counts[name]) >= minimum) return status;
    await page.waitForTimeout(25);
  }
  fail(`Recorder count ${name} did not reach ${minimum}`, status);
}

async function saveScreenshot(scope, name) {
  await exactActiveWindow(scope);
  return page.screenshot({
    target: 'activeWindow',
    path: File.join(runDir, name),
    returnType: 'path',
  });
}

function parseRaw(file) {
  return String(File.read(file)).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`raw event line ${index + 1} is invalid JSON`, error.message);
    }
  });
}

function samePoint(actual, expected, tolerance = 3) {
  return actual && near(actual.x, expected.x, tolerance) && near(actual.y, expected.y, tolerance);
}

async function main() {
  assert(System.getPlatformInfo().os === 'darwin', 'This example requires macOS Calculator');
  assert(Execution.env.OPENDESK_RECORDER_CALCULATOR_CONFIRM === CONFIRM_TOKEN,
    `This example controls Calculator; set OPENDESK_RECORDER_CALCULATOR_CONFIRM=${CONFIRM_TOKEN}`);

  const recorderCapabilities = Recorder.getCapabilities();
  const accessibilityCapabilities = Accessibility.getCapabilities();
  assert(recorderCapabilities.capture && recorderCapabilities.capture.available === true,
    'Recorder native capture is unavailable', recorderCapabilities.capture);
  assert(accessibilityCapabilities.available === true
    && accessibilityCapabilities.permission
    && accessibilityCapabilities.permission.granted === true,
  'Accessibility permission is unavailable', accessibilityCapabilities);

  const permissions = await page.checkPermissions({capabilities: ['screenCapture', 'accessibility']});
  const granted = permissions && permissions.permissions && permissions.permissions.capabilities;
  const screenCaptureGranted = granted && (granted.screenCapture === true
    || granted.screenCapture && granted.screenCapture.granted === true);
  const accessibilityGranted = granted && (granted.accessibility === true
    || granted.accessibility && granted.accessibility.granted === true);
  assert(screenCaptureGranted && accessibilityGranted,
    'Screen Recording and Accessibility permissions are required', permissions);

  File.ensureDir(runDir);
  const launched = await App.launch(
    {bundleId: CALCULATOR_BUNDLE_ID},
    {activate: true, waitUntilReady: 'window', timeout: 10000},
  );
  await page.waitForTimeout(350);
  const active = await window.getActiveWindow();
  const processId = Number(active && (active.pid || active.processID));
  const scope = {processId, title: String(active && active.title || '')};
  assert(Number.isInteger(processId) && processId > 0 && scope.title !== '',
    'Calculator active window identity is incomplete', active);
  assert(String(active.exePath || '') === CALCULATOR_PATH
    && Array.isArray(launched.pids) && launched.pids.map(Number).includes(processId),
  'Launched Calculator does not match the active window', {launched, active});

  // Reset the disposable Calculator fixture before recording starts.
  await keyboard.press('Escape');
  await page.waitForTimeout(80);
  await keyboard.press('Escape');
  const initial = await waitForDisplay(scope, '0');
  const points = Object.fromEntries(['9', '8', '7'].map((name) => [name, buttonPoint(initial, name)]));
  await saveScreenshot(scope, '01-initial-zero.png');

  let session = null;
  let saved = null;
  try {
    session = await Recorder.start({
      within: scope,
      captureKeyboard: false,
      evidence: 'none',
      maxDurationMs: 60000,
    });

    const beforeNine = session.status();
    await mouse.click(points['9'].x, points['9'].y, {button: 'left', clickCount: 1, delay: 30});
    await waitForDisplay(scope, '9');
    await waitForCount(session, 'accepted', Number(beforeNine.counts.accepted) + 3);

    const paused = await session.pause();
    assert(paused.changed === true && paused.captureState === 'paused',
      'Recorder did not enter paused state', paused);
    const beforeEight = session.status();
    await mouse.click(points['8'].x, points['8'].y, {button: 'left', clickCount: 1, delay: 30});
    await waitForDisplay(scope, '98');
    const afterEight = await waitForCount(session, 'paused', Number(beforeEight.counts.paused) + 2);
    assert(afterEight.counts.accepted === beforeEight.counts.accepted,
      'The paused click changed the accepted event count', {beforeEight, afterEight});
    await saveScreenshot(scope, '02-paused-display-98.png');

    const resumed = await session.resume();
    assert(resumed.changed === true && resumed.captureState === 'recording',
      'Recorder did not resume recording', resumed);
    const beforeSeven = session.status();
    await mouse.click(points['7'].x, points['7'].y, {button: 'left', clickCount: 1, delay: 30});
    await waitForDisplay(scope, '987');
    await waitForCount(session, 'accepted', Number(beforeSeven.counts.accepted) + 3);
    await saveScreenshot(scope, '03-final-display-987.png');

    saved = await session.stop();
    session = null;
    assert(saved.captureState === 'stopped' && saved.storageState === 'saved'
      && saved.counts.paused >= 2 && saved.counts.dropped === 0,
    'Recorder did not save a clean stopped session', saved);

    const events = parseRaw(saved.rawFile);
    const pauseIndex = events.findIndex((event) => event.libraryEvent === 'RECORDER_PAUSED');
    const resumeIndex = events.findIndex((event) => event.libraryEvent === 'RECORDER_RESUMED');
    assert(pauseIndex >= 0 && resumeIndex === pauseIndex + 1,
      'Native input leaked into raw data while paused', {pauseIndex, resumeIndex});
    const rawClicks = events.filter((event) => event.libraryEvent === 'MOUSE_CLICKED');
    assert(rawClicks.length === 2
      && samePoint(rawClicks[0], points['9'])
      && samePoint(rawClicks[1], points['7'])
      && !rawClicks.some((event) => samePoint(event, points['8'])),
    'Raw data should contain only the clicks on 9 and 7', {rawClicks, points});

    const built = await Recorder.buildActions(saved.recordingDir);
    const actionsDocument = JSON.parse(File.read(built.actionsFile));
    const clickActions = actionsDocument.actions.filter((action) => action.kind === 'click');
    assert(built.readiness === 'ready' && actionsDocument.actions.length === 2
      && clickActions.length === 2
      && samePoint(clickActions[0].position, points['9'])
      && samePoint(clickActions[1].position, points['7'])
      && !clickActions.some((action) => samePoint(action.position, points['8'])),
    'Actions should contain only the clicks on 9 and 7', {built, actions: actionsDocument.actions});

    const summary = {
      passed: true,
      visibleSequence: ['9', '98', '987'],
      recordedButtons: ['9', '7'],
      ignoredWhilePaused: '8',
      pausedEventCount: saved.counts.paused,
      actionCount: built.actionCount,
      readiness: built.readiness,
      recordingDir: saved.recordingDir,
      screenshots: [
        File.join(runDir, '01-initial-zero.png'),
        File.join(runDir, '02-paused-display-98.png'),
        File.join(runDir, '03-final-display-987.png'),
      ],
      evidenceDirectory: runDir,
    };
    await File.writeJSON(File.join(runDir, 'summary.json'), summary);

    console.log('[PASS] Recorder pause/resume Calculator smoke test');
    console.log('[PASS] visible Calculator sequence: 9 -> 98 -> 987');
    console.log(`[PASS] recorded clicks: 9, 7; paused click 8 ignored; paused callbacks: ${saved.counts.paused}`);
    console.log(`[PASS] actions: ${built.actionCount}; readiness: ${built.readiness}`);
    console.log(`[PASS] evidence: ${runDir}`);
  } finally {
    if (session) {
      try {
        await session.stop();
      } catch (error) {
        console.error('[Recorder] cleanup failed:', error && error.message || String(error));
      }
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('[FAIL] Recorder pause/resume Calculator smoke test:', error && error.message || String(error));
  throw error;
}
