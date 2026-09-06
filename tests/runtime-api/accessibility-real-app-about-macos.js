// Controlled macOS real-application visual acceptance for the single allowed
// scenario: a cold-started, owned Chess process and its safe About panel.
// This is a formal test asset, not a public example or a generic app driver.

'use strict';

const target = {
  bundleId: 'com.apple.Chess',
  path: '/System/Applications/Chess.app',
  executablePath: '/System/Applications/Chess.app/Contents/MacOS/Chess',
  menuPath: ['国际象棋', '关于国际象棋'],
  aboutButton: '下载源代码…',
};
const confirmation = 'chess-about-visual-v1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name) {
  const value = Execution.env[name];
  assert(typeof value === 'string' && value.length > 0, `missing ${name}`);
  return value;
}

function ownedInstance(group) {
  const pids = Array.from(group && group.pids || []).map(Number);
  const instances = Array.from(group && group.instances || []);
  assert(pids.length === 1 && pids[0] > 0 && instances.length === 1,
    'launch must resolve exactly one owned instance');
  const instance = instances[0];
  assert(Number(instance.pid) === pids[0], 'launch group PID and instance differ');
  assert(instance.bundleId === target.bundleId && instance.path === target.path &&
    instance.executablePath === target.executablePath, 'launch identity differs from the reviewed Chess target');
  const launchTimeMs = Date.parse(String(instance.launchedAt || ''));
  assert(Number.isFinite(launchTimeMs) && launchTimeMs > 0, 'launch time identity is unavailable');
  return {
    pid: pids[0],
    launchedAt: String(instance.launchedAt),
    launchTimeMs,
    bundleId: instance.bundleId,
    path: instance.path,
    executablePath: instance.executablePath,
  };
}

function fingerprintMatches(instance, owned) {
  return instance && Number(instance.pid) === owned.pid &&
    String(instance.bundleId || '') === owned.bundleId &&
    String(instance.path || '') === owned.path &&
    String(instance.executablePath || '') === owned.executablePath &&
    Math.abs(Date.parse(String(instance.launchedAt || '')) - owned.launchTimeMs) <= 1000;
}

function sanitizeWindow(row) {
  if (!row) return null;
  const pid = Number(row.pid);
  const handle = Number(row.handle);
  const id = String(row.id || '');
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(handle) || handle <= 0 || handle > 0xffffffff ||
      id !== `darwin:${pid}:native:${handle}`) return null;
  for (const field of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(Number(row[field]))) return null;
  }
  if (Number(row.width) <= 0 || Number(row.height) <= 0) return null;
  return {
    id, pid, handle,
    x: Number(row.x), y: Number(row.y), width: Number(row.width), height: Number(row.height),
    exePath: String(row.exePath || ''),
    isForeground: row.isForeground === true,
    hasFocus: row.hasFocus === true,
  };
}

function sameWindow(a, b) {
  return !!a && !!b && a.id === b.id && a.pid === b.pid && a.handle === b.handle &&
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
    a.exePath === b.exePath;
}

async function exactActiveWindow(owned, expectedID) {
  const raw = await window.getActiveWindow();
  const active = sanitizeWindow(raw);
  assert(active, 'active window has no resolved native identity');
  assert(active.pid === owned.pid && active.exePath === owned.executablePath,
    'owned Chess process is no longer the foreground application');
  assert(active.isForeground === true && active.hasFocus === true,
    'owned Chess window is no longer focused');
  if (expectedID) assert(active.id === expectedID, 'active window is not the expected About panel');
  // Native UI/Accessibility calls require the complete documented WindowInfo.
  // Keep the projected form only for comparison and redacted evidence.
  return raw;
}

function currentOwnedGroup(owned) {
  const group = App.get({ pid: owned.pid });
  assert(group && Array.isArray(group.instances) && group.instances.length === 1 &&
    fingerprintMatches(group.instances[0], owned), 'owned Chess process fingerprint changed');
  return group;
}

function verifyHelperReceipt(receipt, owned, aboutWindow) {
  assert(receipt && receipt.schemaVersion === 1,
    'exact-window helper receipt schema changed');
  assert(receipt.scenario === 'accessibility-real-app-chess-about-v1',
    'exact-window helper emitted an unexpected scenario');
  assert(receipt.screenCapturePreflight === true &&
    receipt.captureMethod === 'CGWindowListCreateImage(kCGWindowListOptionIncludingWindow)+opaqueWhiteComposite',
  'exact-window helper did not use the reviewed capture seam');
  const expected = receipt.expected || {};
  assert(Number(expected.pid) === owned.pid && Number(expected.windowId) === aboutWindow.handle,
    'exact-window helper receipt target changed');
  for (const phase of ['preCapture', 'postCapture']) {
    const observed = receipt[phase] || {};
    assert(Number(observed.pid) === owned.pid && Number(observed.windowId) === aboutWindow.handle &&
      Number(observed.layer) === 0 && observed.onScreen === true && Number(observed.sharingState) > 0 && Number(observed.alpha) > 0,
    `exact-window helper ${phase} ownership receipt is incomplete`);
  }
  assert(receipt.image && Number(receipt.image.width) > 0 && Number(receipt.image.height) > 0 &&
    Number(receipt.image.maxAlpha) > 0 && receipt.image.nonBlack === true && receipt.image.colorVariation === true,
  'exact-window helper captured no readable image');
}

const root = path.resolve(Execution.workdir);
const helper = path.resolve(root, '.runtime/tests/accessibility/tools/exact-window-capture/exact-window-capture');
const evidenceDir = path.resolve(requiredEnvironment('OPENDESK_ACCESSIBILITY_REAL_APP_EVIDENCE_DIR'));
const evidenceRoot = path.resolve(root, '.runtime/tests/accessibility/real-app-about');
const evidencePath = path.resolve(evidenceDir, 'evidence.json');
const screenshotPath = path.resolve(evidenceDir, 'about.png');
const receiptPath = path.resolve(evidenceDir, 'capture-receipt.json');

assert(Execution.env.OPENDESK_ACCESSIBILITY_REAL_APP_CONFIRM === confirmation,
  'real Chess acceptance requires its exact explicit confirmation token');
assert(evidenceDir.startsWith(evidenceRoot + path.sep), 'real Chess evidence must stay below its dedicated .runtime root');
assert(File.isFile(helper), 'exact-window-capture helper is not built');
assert(Command.getCapabilities().enabled === true, 'Command.run is disabled for local real-app acceptance');
File.ensureDir(evidenceDir);
assert(!File.exists(evidencePath) && !File.exists(screenshotPath) && !File.exists(receiptPath),
  'real Chess evidence directory must be fresh');

const report = {
  schemaVersion: 1,
  scenario: 'accessibility-real-app-chess-about-v1',
  status: 'running',
  target: { bundleId: target.bundleId, path: target.path },
  preflight: null,
  precondition: null,
  ownership: null,
  mainWindow: null,
  menuObservation: null,
  menuAction: null,
  actionAttempts: 0,
  aboutWindow: null,
  aboutControl: null,
  screenshot: null,
  cleanup: { attempted: false, terminated: false, identityMatched: false },
  error: null,
};
let owned = null;
let failure = null;

try {
  const preflightCommand = await Command.run(helper, ['--preflight'], {
    cwd: root, timeout: 10_000, maxOutputBytes: 65_536,
  });
  assert(preflightCommand.exitCode === 0 && preflightCommand.stderr === '',
    'exact-window helper preflight command failed');
  const preflight = JSON.parse(preflightCommand.stdout);
  assert(preflight && preflight.schemaVersion === 1 && preflight.mode === 'preflight' &&
    typeof preflight.screenCaptureAccess === 'boolean', 'exact-window helper preflight response changed');
  report.preflight = preflight;
  if (!preflight.screenCaptureAccess) {
    report.status = 'blocked';
  } else {
    const runningByBundle = App.isRunning({ bundleId: target.bundleId });
    const runningByPath = App.isRunning({ path: target.path });
    report.precondition = { runningByBundle, runningByPath };
    assert(runningByBundle === false && runningByPath === false,
      'COLD_START_PRECONDITION: Chess was already running; no launch or menu action was taken');

    const launched = await App.launch({ path: target.path }, {
      activate: true, waitUntilReady: 'window', timeout: 15_000,
    });
    owned = ownedInstance(launched);
    report.ownership = owned;
    const mainWindow = await exactActiveWindow(owned);
    report.mainWindow = sanitizeWindow(mainWindow);

    const observed = await UI.getMenuItems({ within: mainWindow, maxDepth: 2, maxNodes: 128, timeout: 10_000 });
    assert(observed && Array.isArray(observed.items) && observed.items.some((node) => node && node.name === target.menuPath[0]),
      'read-only menu observation did not find the exact Chess application menu');
    report.menuObservation = {
      complete: observed.complete, truncated: observed.truncated, reason: observed.reason,
      applicationMenuObserved: true,
    };

    assert(report.actionAttempts === 0, 'menu action may be attempted only once');
    report.actionAttempts = 1;
    const action = await UI.tapMenuItem(target.menuPath, { within: mainWindow, timeout: 20_000 });
    report.menuAction = {
      action: action.action, actionState: action.actionState,
      completedLevels: action.completedLevels, expansionOccurred: action.expansionOccurred,
    };
    assert(action.action === 'invoke' && action.actionState === 'acknowledged' && action.completedLevels === 2,
      'Chess About action was not acknowledged exactly once');

    let aboutWindow = null;
    let priorCandidate = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await page.waitForTimeout(250);
      const active = await exactActiveWindow(owned);
      if (active.id !== mainWindow.id && priorCandidate && sameWindow(priorCandidate, active)) {
        aboutWindow = active;
        break;
      }
      priorCandidate = active.id === mainWindow.id ? null : active;
    }
    assert(aboutWindow, 'Chess About action did not produce a stable new active owned panel');
    await exactActiveWindow(owned, aboutWindow.id);
    currentOwnedGroup(owned);
    report.aboutWindow = sanitizeWindow(aboutWindow);

    const button = await Accessibility.find({ role: 'button', name: target.aboutButton }, {
      within: aboutWindow, timeout: 10_000,
    });
    assert(button, 'exact Chess About accessibility control was not found');
    try {
      report.aboutControl = { role: button.role, nativeRole: button.nativeRole, exactName: target.aboutButton };
    } finally {
      assert(await Accessibility.release(button) === true, 'Chess About control release failed');
    }

    await exactActiveWindow(owned, aboutWindow.id);
    currentOwnedGroup(owned);
    const capture = await Command.run(helper, [
      '--scenario', 'accessibility-real-app-chess-about-v1',
      '--pid', String(owned.pid), '--window-id', String(aboutWindow.handle),
      '--launch-time-ms', String(owned.launchTimeMs),
      '--x', String(aboutWindow.x), '--y', String(aboutWindow.y),
      '--width', String(aboutWindow.width), '--height', String(aboutWindow.height),
      '--output', screenshotPath,
    ], { cwd: root, timeout: 10_000, maxOutputBytes: 65_536 });
    assert(capture.exitCode === 0 && capture.stderr === '', 'exact-window helper capture command failed');
    const captureReceipt = JSON.parse(capture.stdout);
    verifyHelperReceipt(captureReceipt, owned, aboutWindow);
    const screenshotBytes = new Uint8Array(File.readBytes(screenshotPath));
    assert(File.isFile(screenshotPath) && screenshotBytes.length > 0,
      'exact-window helper did not publish a PNG');
    const hash = await Command.run('/usr/bin/shasum', ['-a', '256', screenshotPath], {
      cwd: root, timeout: 10_000, maxOutputBytes: 65_536,
    });
    const hashMatch = /^([a-f0-9]{64})\s/.exec(hash.stdout);
    assert(hash.exitCode === 0 && hash.stderr === '' && hashMatch,
      'exact-window PNG digest could not be verified');
    await exactActiveWindow(owned, aboutWindow.id);
    currentOwnedGroup(owned);
    await File.writeJSON(receiptPath, {
      schemaVersion: 1,
      scenario: report.scenario,
      helperReceipt: captureReceipt,
      screenshot: { path: screenshotPath, bytes: screenshotBytes.length, sha256: hashMatch[1] },
    }, { spaces: 2, createDirs: true });
    report.screenshot = { path: screenshotPath, receipt: receiptPath, sha256: hashMatch[1] };
    report.status = 'passed';
  }
} catch (error) {
  failure = error;
  report.status = 'failed';
  report.error = {
    name: String(error && error.name || 'Error'),
    code: error && error.code ? String(error.code) : null,
    operation: error && error.operation ? String(error.operation) : null,
    actionState: error && error.actionState ? String(error.actionState) : null,
    message: String(error && error.message || error),
  };
  if (File.isFile(screenshotPath)) File.remove(screenshotPath);
} finally {
  if (owned) {
    report.cleanup.attempted = true;
    try {
      const group = App.get({ pid: owned.pid });
      assert(group && Array.isArray(group.instances) && group.instances.length === 1 &&
        fingerprintMatches(group.instances[0], owned), 'cleanup refused because owned Chess fingerprint changed');
      report.cleanup.identityMatched = true;
      let terminated;
      try {
        terminated = await App.terminate({ pid: owned.pid }, { timeout: 15_000 });
        report.cleanup.force = false;
      } catch (terminateError) {
        if (!terminateError || terminateError.code !== 'TIMEOUT') throw terminateError;
        const afterTimeout = App.get({ pid: owned.pid });
        if (!afterTimeout) {
          terminated = { terminated: true, pids: [owned.pid], force: false };
          report.cleanup.force = false;
        } else {
          assert(Array.isArray(afterTimeout.instances) && afterTimeout.instances.length === 1 &&
            fingerprintMatches(afterTimeout.instances[0], owned),
          'force cleanup refused because owned Chess fingerprint changed');
          terminated = await App.terminate({ pid: owned.pid }, { force: true, timeout: 15_000 });
          report.cleanup.force = true;
        }
      }
      assert(terminated && terminated.terminated === true && Array.isArray(terminated.pids) &&
        terminated.pids.length === 1 && Number(terminated.pids[0]) === owned.pid,
      'owned Chess cleanup did not terminate exactly one PID');
      assert(App.get({ pid: owned.pid }) === null, 'owned Chess PID remains after cleanup');
      report.cleanup.terminated = true;
    } catch (cleanupError) {
      report.cleanup.error = String(cleanupError && cleanupError.message || cleanupError);
      if (!failure) failure = cleanupError;
      report.status = 'failed';
    }
  }
  await File.writeJSON(evidencePath, report, { spaces: 2, createDirs: true });
}

console.log('[REAL-APP-ABOUT] ' + JSON.stringify({
  status: report.status,
  evidence: evidencePath,
  screenshot: report.screenshot && report.screenshot.path,
  actionAttempts: report.actionAttempts,
  cleanup: report.cleanup,
}));

if (failure) throw failure;
