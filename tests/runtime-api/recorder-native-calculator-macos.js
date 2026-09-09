// Explicit macOS live acceptance. It is never loaded by ordinary Runtime gates.
// Run from the repository root:
// OPENDESK_RECORDER_CALCULATOR_CONFIRM=authorized-calculator-fixture \
// ./dist/opendesk -allow-recorder-capture -script tests/runtime-api/recorder-native-calculator-macos.js -console-mode script
'use strict';

const CONFIRM_TOKEN = 'authorized-calculator-fixture';
const CALCULATOR_BUNDLE_ID = 'com.apple.calculator';
const CALCULATOR_PATH = '/System/Applications/Calculator.app/Contents/MacOS/Calculator';
const BUTTON_NAMES = ['9', '8', '7'];
const outputRoot = File.join(Execution.workdir, '.runtime', 'tests', 'human-to-recipe');
const runDir = File.join(outputRoot, `calculator-live-${Date.now()}-${Execution.id}`);

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

function bounds(value, label) {
  const result = value && {
    x: Number(value.x), y: Number(value.y),
    width: Number(value.width), height: Number(value.height),
    coordinateSpace: value.coordinateSpace ? String(value.coordinateSpace) : '',
  };
  assert(result && [result.x, result.y, result.width, result.height].every(Number.isFinite)
    && result.width > 0 && result.height > 0, `${label} has invalid bounds`, value);
  return result;
}

function near(left, right, tolerance = 4) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function normalizeDisplay(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\u00a0\u202f\s,]/g, '')
    .replace(/\u2212/g, '-');
}

function numericDisplay(value) {
  const normalized = normalizeDisplay(value);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : null;
}

async function exactActive(scope) {
  const active = await window.getActiveWindow();
  const pid = Number(active && (active.pid || active.processID));
  assert(pid === scope.processId && String(active.title || '') === scope.title,
    'Calculator is no longer the exact foreground recording scope', {expected: scope, actual: active});
  assert(String(active.exePath || '') === CALCULATOR_PATH,
    'foreground executable is not the system Calculator', active);
  return active;
}

async function calculatorSnapshot(scope) {
  const active = await exactActive(scope);
  const snapshot = await Accessibility.snapshot({
    within: active,
    maxDepth: 12,
    maxNodes: 2000,
    timeout: 10000,
    properties: ['role', 'name', 'value', 'enabled', 'actions', 'nativeBounds'],
  });
  assert(snapshot && snapshot.complete === true && snapshot.truncated === false && snapshot.root,
    'Calculator Accessibility snapshot is incomplete', snapshot && {
      complete: snapshot.complete, truncated: snapshot.truncated, reason: snapshot.reason,
    });
  const root = bounds(snapshot.root.nativeBounds, 'Calculator Accessibility root');
  assert(near(root.x, active.x) && near(root.y, active.y)
    && near(root.width, active.width) && near(root.height, active.height),
  'Calculator Accessibility root no longer matches the exact active window', {root, active});
  return {active, root, nodes: flatten(snapshot.root)};
}

function displayValue(observation) {
  const candidates = observation.nodes.filter((node) => {
    if (node.role !== 'staticText' || numericDisplay(node.value) === null || !node.nativeBounds) return false;
    const item = bounds(node.nativeBounds, 'Calculator display candidate');
    const centerY = item.y + item.height / 2;
    return centerY >= observation.root.y
      && centerY <= observation.root.y + observation.root.height * 0.28;
  });
  assert(candidates.length === 1, 'Calculator must expose one numeric display in its display region', {
    count: candidates.length,
    values: candidates.map((node) => node.value),
  });
  return numericDisplay(candidates[0].value);
}

function buttonPoint(observation, name) {
  const candidates = observation.nodes.filter((node) => node.role === 'button'
    && String(node.name || '') === name
    && node.enabled === true
    && Array.isArray(node.actions)
    && node.actions.includes('invoke'));
  assert(candidates.length === 1, `Calculator button ${name} must be unique and invokable`, {
    count: candidates.length,
  });
  const target = bounds(candidates[0].nativeBounds, `Calculator button ${name}`);
  assert(target.coordinateSpace === observation.root.coordinateSpace,
    `Calculator button ${name} changed coordinate space`, {root: observation.root, target});

  // Native bounds are used only to establish a window-relative ratio. The
  // final point is projected through the freshly resolved screen-logical window.
  const relativeX = (target.x + target.width / 2 - observation.root.x) / observation.root.width;
  const relativeY = (target.y + target.height / 2 - observation.root.y) / observation.root.height;
  assert(relativeX > 0 && relativeX < 1 && relativeY > 0 && relativeY < 1,
    `Calculator button ${name} lies outside the verified window`, {relativeX, relativeY});
  return {
    x: Math.round(observation.active.x + observation.active.width * relativeX),
    y: Math.round(observation.active.y + observation.active.height * relativeY),
    relativeX, relativeY,
  };
}

async function waitForDisplay(scope, expected, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const observation = await calculatorSnapshot(scope);
    last = displayValue(observation);
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

async function screenshot(scope, name) {
  await exactActive(scope);
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
      fail(`raw event line ${index + 1} is not valid JSON`, error.message);
    }
  });
}

function pointMatches(actual, expected, tolerance = 3) {
  return actual && near(actual.x, expected.x, tolerance) && near(actual.y, expected.y, tolerance);
}

async function run() {
  if (System.getPlatformInfo().os !== 'darwin') {
    console.log('[SKIP] Recorder Calculator live acceptance requires macOS.');
    return;
  }
  if (Execution.env.OPENDESK_RECORDER_CALCULATOR_CONFIRM !== CONFIRM_TOKEN) {
    fail(`live Calculator input is disabled; set OPENDESK_RECORDER_CALCULATOR_CONFIRM=${CONFIRM_TOKEN}`);
  }

  const recorderCapabilities = Recorder.getCapabilities();
  const accessibilityCapabilities = Accessibility.getCapabilities();
  assert(recorderCapabilities.capture && recorderCapabilities.capture.available === true,
    'Recorder native capture is unavailable', recorderCapabilities.capture);
  assert(accessibilityCapabilities.available === true
    && accessibilityCapabilities.permission && accessibilityCapabilities.permission.granted === true,
  'Calculator Accessibility observation is unavailable', accessibilityCapabilities);
  const permissions = await page.checkPermissions({capabilities: ['screenCapture', 'accessibility']});
  const granted = permissions && permissions.permissions && permissions.permissions.capabilities;
  const screenCaptureGranted = granted && (granted.screenCapture === true
    || granted.screenCapture && granted.screenCapture.granted === true);
  const accessibilityGranted = granted && (granted.accessibility === true
    || granted.accessibility && granted.accessibility.granted === true);
  assert(screenCaptureGranted && accessibilityGranted,
    'screenCapture and accessibility permissions are required', permissions);

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
  'launched Calculator identity does not match the foreground window', {launched, active});

  // Reset the disposable Calculator fixture before capture. Two Escape presses
  // clear both the current entry and any pending operation context.
  await keyboard.press('Escape');
  await page.waitForTimeout(80);
  await keyboard.press('Escape');
  const initialObservation = await waitForDisplay(scope, '0');
  const points = Object.fromEntries(BUTTON_NAMES.map((name) => [name, buttonPoint(initialObservation, name)]));
  await screenshot(scope, '01-initial-zero.png');

  let session = null;
  let saved = null;
  try {
    session = await Recorder.start({
      within: scope,
      captureKeyboard: false,
      evidence: 'target-semantics',
      maxDurationMs: 60000,
    });
    const started = session.status();
    assert(started.captureState === 'recording' && started.counts.accepted === 0,
      'Recorder did not start from a clean recording state', started);

    const beforeNine = session.status();
    await exactActive(scope);
    await mouse.click(points['9'].x, points['9'].y, {button: 'left', clickCount: 1, delay: 30});
    await waitForDisplay(scope, '9');
    await waitForCount(session, 'accepted', Number(beforeNine.counts.accepted) + 3);
    await screenshot(scope, '02-recording-nine.png');

    const paused = await session.pause();
    const pauseNoop = await session.pause();
    assert(paused.changed === true && paused.captureState === 'paused'
      && pauseNoop.changed === false && pauseNoop.captureState === 'paused'
      && pauseNoop.transitionSequence === paused.transitionSequence,
    'pause must be explicit, idempotent, and reuse its transition boundary', {paused, pauseNoop});

    const beforePausedClick = session.status();
    await exactActive(scope);
    await mouse.click(points['8'].x, points['8'].y, {button: 'left', clickCount: 1, delay: 30});
    await waitForDisplay(scope, '98');
    const afterPausedClick = await waitForCount(
      session, 'paused', Number(beforePausedClick.counts.paused) + 2,
    );
    assert(afterPausedClick.captureState === 'paused'
      && afterPausedClick.counts.accepted === beforePausedClick.counts.accepted,
    'paused Calculator input changed accepted raw count', {beforePausedClick, afterPausedClick});
    await screenshot(scope, '03-paused-click-eight.png');

    const resumed = await session.resume();
    const resumeNoop = await session.resume();
    assert(resumed.changed === true && resumed.captureState === 'recording'
      && resumeNoop.changed === false && resumeNoop.captureState === 'recording'
      && resumeNoop.transitionSequence === resumed.transitionSequence,
    'resume must be explicit, idempotent, and reuse its transition boundary', {resumed, resumeNoop});

    const beforeSeven = session.status();
    await exactActive(scope);
    await mouse.click(points['7'].x, points['7'].y, {button: 'left', clickCount: 1, delay: 30});
    await waitForDisplay(scope, '987');
    const finalActiveStatus = await waitForCount(
      session, 'accepted', Number(beforeSeven.counts.accepted) + 3,
    );
    assert(finalActiveStatus.pauseCount === 1 && finalActiveStatus.pausedDurationMs > 0,
      'Recorder status did not retain pause timing', finalActiveStatus);
    await screenshot(scope, '04-resumed-click-seven.png');

    saved = await session.stop();
    session = null;
    assert(saved.captureState === 'stopped' && saved.storageState === 'saved'
      && saved.counts.paused >= 2 && saved.counts.dropped === 0,
    'Recorder stop did not save the expected Calculator session', saved);

    const events = parseRaw(saved.rawFile);
    const pauseEvents = events.filter((event) => event.libraryEvent === 'RECORDER_PAUSED');
    const resumeEvents = events.filter((event) => event.libraryEvent === 'RECORDER_RESUMED');
    assert(pauseEvents.length === 1 && resumeEvents.length === 1,
      'raw must contain exactly one pause and one resume boundary', {pauseEvents, resumeEvents});
    const pauseIndex = events.indexOf(pauseEvents[0]);
    const resumeIndex = events.indexOf(resumeEvents[0]);
    assert(resumeIndex === pauseIndex + 1,
      'paused native input leaked into raw between control boundaries', {
        between: events.slice(pauseIndex + 1, resumeIndex),
      });
    assert(pauseEvents[0].source === 'recorder' && resumeEvents[0].source === 'recorder',
      'pause/resume boundaries must use recorder provenance');

    const rawClicks = events.filter((event) => event.libraryEvent === 'MOUSE_CLICKED');
    assert(rawClicks.length === 2
      && pointMatches(rawClicks[0], points['9'])
      && pointMatches(rawClicks[1], points['7']),
    'raw must retain only the recording and resumed Calculator clicks', {rawClicks, points});

    const manifest = JSON.parse(File.read(saved.manifestFile));
    assert(manifest.state === 'stopped' && manifest.storage.state === 'saved'
      && manifest.counts.paused === saved.counts.paused
      && manifest.counts.accepted === saved.counts.accepted,
    'terminal manifest does not match the stop result', {manifest, saved});
    const pointerContexts = manifest.inputContexts.filter((item) => item.kind === 'pointer');
    assert(pointerContexts.length === 2
      && pointerContexts.every((item) => item.status === 'verified' && item.semanticStatus === 'verified'
        && item.element && item.element.role === 'button'),
    'Calculator pointer contexts must contain verified button semantics', pointerContexts);

    const built = await Recorder.buildActions(saved.recordingDir);
    const actionsDocument = JSON.parse(File.read(built.actionsFile));
    const clickActions = actionsDocument.actions.filter((action) => action.kind === 'click');
    assert(built.readiness === 'ready' && built.actionCount === 2
      && actionsDocument.actions.length === 2 && clickActions.length === 2,
    'Calculator actions must contain exactly the two non-paused clicks', {built, actions: actionsDocument.actions});
    assert(pointMatches(clickActions[0].position, points['9'])
      && pointMatches(clickActions[1].position, points['7'])
      && !clickActions.some((action) => pointMatches(action.position, points['8'])),
    'paused Calculator button was included in actions', {clickActions, points});
    assert(clickActions[0].target.semanticStatus === 'verified'
      && clickActions[0].target.element.name === '9'
      && clickActions[1].target.semanticStatus === 'verified'
      && clickActions[1].target.element.name === '7',
    'Calculator actions did not preserve clicked button labels', clickActions.map((action) => action.target));

    const generated = await Recorder.generateScript(built.actionsFile);
    assert(generated.verification === 'not-run',
      'candidate generation must not claim replay verification', generated);

    const summary = {
      schemaVersion: 1,
      passed: true,
      platform: 'darwin',
      fixture: {
        bundleId: CALCULATOR_BUNDLE_ID,
        executable: CALCULATOR_PATH,
        processId,
        title: scope.title,
        initialDisplay: '0',
        visibleSequence: ['9', '98', '987'],
      },
      contract: {
        runtimeMethods: ['Recorder.start', 'RecorderSession.pause', 'RecorderSession.resume', 'RecorderSession.stop', 'Recorder.buildActions', 'Recorder.generateScript'],
        recordedButtons: ['9', '7'],
        pausedButAppliedButton: '8',
        rawBoundaries: ['RECORDER_PAUSED', 'RECORDER_RESUMED'],
      },
      points,
      saved,
      built,
      generated,
      screenshots: [
        '01-initial-zero.png',
        '02-recording-nine.png',
        '03-paused-click-eight.png',
        '04-resumed-click-seven.png',
      ].map((name) => File.join(runDir, name)),
      evidenceDirectory: runDir,
    };
    await File.writeJSON(File.join(runDir, 'summary.json'), summary);
    await File.writeJSON(File.join(Execution.artifactDir, 'recorder-calculator-live-summary.json'), summary);
    console.log(`[PASS] Recorder Calculator live pause/resume acceptance; evidence=${runDir}`);
  } finally {
    if (session) {
      try {
        await session.stop();
      } catch (error) {
        console.error('[Recorder Calculator live] cleanup stop failed:', error && error.message || String(error));
      }
    }
  }
}

await run();
