// Capture-only validation for the existing repository-owned macOS fixture.
// It neither opens a menu nor invokes an Accessibility action.

'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name) {
  const value = Execution.env[name];
  assert(typeof value === 'string' && value.length > 0, `missing ${name}`);
  return value;
}

function exactWindow(rows, pid, expectedID, executablePath) {
  const matches = rows.filter((row) => row && Number(row.pid) === pid && String(row.id) === expectedID);
  assert(matches.length === 1, 'fixture exact window identity is not unique');
  const row = matches[0];
  assert(Number(row.handle) > 0 && Number(row.handle) <= 0xffffffff,
    'fixture window does not expose a 32-bit CGWindowID');
  assert(String(row.id) === `darwin:${pid}:native:${Number(row.handle)}`,
    'fixture window ID/handle mapping changed');
  assert(path.resolve(String(row.exePath || '')) === executablePath,
    'fixture window executable path changed');
  assert(row.isForeground === true && row.hasFocus === true,
    'fixture is not the verified foreground window');
  for (const field of ['x', 'y', 'width', 'height']) {
    assert(Number.isFinite(Number(row[field])), `fixture window ${field} is not finite`);
  }
  assert(Number(row.width) > 0 && Number(row.height) > 0, 'fixture window has invalid bounds');
  return row;
}

function ownedInstance(group, pid, appPath, executablePath) {
  assert(group && Array.isArray(group.pids) && group.pids.length === 1 && Number(group.pids[0]) === pid,
    'fixture App group did not preserve the unique PID');
  const instances = Array.from(group.instances || []);
  assert(instances.length === 1 && Number(instances[0].pid) === pid,
    'fixture App group did not preserve a unique instance');
  const instance = instances[0];
  assert(instance.bundleId === 'com.opendesk.accessibility-fixture', 'fixture bundle identity changed');
  assert(path.resolve(String(instance.path || '')) === appPath, 'fixture bundle path changed');
  assert(path.resolve(String(instance.executablePath || '')) === executablePath, 'fixture executable identity changed');
  const launchTimeMs = Date.parse(String(instance.launchedAt || ''));
  assert(Number.isFinite(launchTimeMs) && launchTimeMs > 0, 'fixture launch timestamp is unavailable');
  return { instance, launchTimeMs };
}

async function waitForOwnedInstance(pid, appPath, executablePath) {
  const deadline = Date.now() + 5_000;
  let lastError = null;
  do {
    try {
      return ownedInstance(App.get({ path: appPath }), pid, appPath, executablePath);
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  throw lastError || new Error('fixture App identity did not become observable');
}

function expectedCaptureReceipt(value, pid, windowRow) {
  assert(value && value.schemaVersion === 1,
    'exact-window helper receipt schema changed');
  assert(value.scenario === 'accessibility-native-fixture-capture-v1',
    'exact-window helper emitted the wrong scenario');
  assert(value.screenCapturePreflight === true,
    'exact-window helper did not report granted capture preflight');
  assert(value.captureMethod === 'CGWindowListCreateImage(kCGWindowListOptionIncludingWindow)+opaqueWhiteComposite',
    'exact-window helper used an unsafe capture method');
  const expected = value.expected || {};
  assert(Number(expected.pid) === pid && Number(expected.windowId) === Number(windowRow.handle),
    'exact-window helper receipt target changed');
  for (const phase of ['preCapture', 'postCapture']) {
    const observed = value[phase] || {};
    assert(Number(observed.pid) === pid && Number(observed.windowId) === Number(windowRow.handle),
      `exact-window helper ${phase} identity changed`);
    assert(Number(observed.layer) === 0 && observed.onScreen === true && Number(observed.sharingState) > 0 &&
      Number(observed.alpha) > 0,
      `exact-window helper ${phase} ownership receipt is incomplete`);
  }
  assert(value.image && Number(value.image.width) > 0 && Number(value.image.height) > 0 && Number(value.image.maxAlpha) > 0 &&
    value.image.nonBlack === true && value.image.colorVariation === true,
    'exact-window helper receipt has no readable image');
}

const root = path.resolve(Execution.workdir);
const helper = path.resolve(root, '.runtime/tests/accessibility/tools/exact-window-capture/exact-window-capture');
const pid = Number(requiredEnvironment('OPENDESK_ACCESSIBILITY_TARGET_PID'));
const windowID = requiredEnvironment('OPENDESK_ACCESSIBILITY_WINDOW_ID');
const statePath = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_STATE_PATH'));
const appPath = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_APP_PATH'));
const evidenceDir = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_CAPTURE_EVIDENCE_DIR'));
const expectedRoot = path.resolve(root, '.runtime/tests/accessibility/macos/exact-window-capture');
const executablePath = path.resolve(appPath, 'Contents/MacOS/OpenDeskAccessibilityFixture');
const screenshotPath = path.resolve(evidenceDir, 'fixture-window.png');
const receiptPath = path.resolve(evidenceDir, 'capture-receipt.json');

assert(Number.isInteger(pid) && pid > 0, 'fixture PID must be a positive integer');
assert(windowID.startsWith(`darwin:${pid}:native:`), 'fixture WindowInfo ID has an unexpected owner');
assert(appPath === path.resolve(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app'),
  'fixture path is outside the repository-owned fixture location');
assert(evidenceDir.startsWith(expectedRoot + path.sep), 'capture evidence path is outside the fixture evidence root');
assert(File.isFile(helper) && File.isFile(statePath) && File.isFile(executablePath),
  'capture helper or fixture prerequisites are missing');
assert(Command.getCapabilities().enabled === true, 'Command.run is disabled for local capture validation');
File.ensureDir(evidenceDir);
assert(!File.exists(screenshotPath) && !File.exists(receiptPath),
  'capture evidence directory must be fresh');

const report = {
  schemaVersion: 1,
  scenario: 'accessibility-native-fixture-capture-v1',
  status: 'running',
  helper,
  actionCounts: { menu: 0, accessibility: 0, exactCapture: 0 },
  screenshot: null,
  error: null,
};
let failure = null;

try {
  const state = JSON.parse(File.read(statePath));
  assert(state && Number(state.pid) === pid && Number(state.windowNumber) > 0,
    'fixture state did not publish the reviewed PID/window number');
  assert(windowID === `darwin:${pid}:native:${Number(state.windowNumber)}`,
    'fixture state does not match the reviewed WindowInfo ID');

  const initial = await waitForOwnedInstance(pid, appPath, executablePath);
  const activated = await App.launch({ path: appPath }, {
    activate: true,
    waitUntilReady: 'window',
    timeout: 10_000,
  });
  const owned = ownedInstance(activated, pid, appPath, executablePath);
  assert(owned.launchTimeMs === initial.launchTimeMs, 'fixture activation changed its launch fingerprint');
  const windowRow = exactWindow(await window.list(), pid, windowID, executablePath);
  report.ownership = { pid, launchedAt: owned.instance.launchedAt, windowId: windowID, handle: Number(windowRow.handle) };

  report.actionCounts.exactCapture += 1;
  const command = await Command.run(helper, [
    '--scenario', 'accessibility-native-fixture-capture-v1',
    '--pid', String(pid),
    '--window-id', String(windowRow.handle),
    '--launch-time-ms', String(owned.launchTimeMs),
    '--x', String(windowRow.x), '--y', String(windowRow.y),
    '--width', String(windowRow.width), '--height', String(windowRow.height),
    '--output', screenshotPath,
  ], { cwd: root, timeout: 10_000, maxOutputBytes: 65_536 });
  assert(command.exitCode === 0 && command.stderr === '', 'exact-window helper command failed');
  const helperReceipt = JSON.parse(command.stdout);
  expectedCaptureReceipt(helperReceipt, pid, windowRow);
  const after = exactWindow(await window.list(), pid, windowID, executablePath);
  assert(Number(after.handle) === Number(windowRow.handle), 'fixture WindowInfo changed during exact capture');
  const afterOwned = await waitForOwnedInstance(pid, appPath, executablePath);
  assert(afterOwned.launchTimeMs === owned.launchTimeMs, 'fixture launch fingerprint changed during exact capture');
  const screenshotBytes = new Uint8Array(File.readBytes(screenshotPath));
  assert(File.isFile(screenshotPath) && screenshotBytes.length > 0,
    'exact-window helper did not create a PNG artifact');

  report.screenshot = {
    path: screenshotPath,
    bytes: screenshotBytes.length,
    helperReceipt,
  };
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.status = 'failed';
  report.error = {
    code: error && error.code ? String(error.code) : null,
    message: String(error && error.message || error),
    stderr: error && error.stderr ? String(error.stderr).slice(0, 1024) : null,
  };
  if (File.isFile(screenshotPath)) File.remove(screenshotPath);
} finally {
  await File.writeJSON(receiptPath, report, { spaces: 2, createDirs: true });
}

console.log('[EXACT-WINDOW-CAPTURE-FIXTURE] ' + JSON.stringify({
  status: report.status,
  receipt: receiptPath,
  screenshot: report.screenshot && report.screenshot.path,
  actionCounts: report.actionCounts,
}));

if (failure) throw failure;
