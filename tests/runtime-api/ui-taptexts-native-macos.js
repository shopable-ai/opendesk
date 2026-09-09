// Explicit opt-in macOS live fixture. It builds and operates only the repository-owned
// AppKit target under .runtime/tests/ui-taptexts-macos/.
'use strict';

const fixture = (0, eval)(File.read(File.join(
  Execution.workdir, 'tests', 'runtime-api', 'fixtures', 'ui-taptexts-macos', 'fixture-lib.js',
)));
fixture.assertEnvironment();

const evidenceRoot = Execution.env.OPENDESK_UI_TAPTEXTS_EVIDENCE_DIR ||
  File.join(Execution.workdir, '.runtime', 'tests', 'ui-taptexts-macos', Execution.id);
const paths = fixture.root(evidenceRoot);
File.ensureDir(paths.outputRoot);

const report = {
  schemaVersion: 1,
  status: 'running',
  executionId: Execution.id,
  startedAt: new Date().toISOString(),
  evidenceRoot: paths.outputRoot,
  runtime: { workdir: Execution.workdir },
  permissions: null,
  scenarios: [],
};
const resultPath = File.join(paths.outputRoot, 'result.json');
await File.writeJSON(resultPath, report);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectCode(promise, code, phase, index) {
  let caught = null;
  try { await promise; } catch (error) { caught = error; }
  assert(caught, `expected ${code}`);
  assert(caught.code === code, `expected ${code}, received ${caught.code}: ${String(caught.message || caught)}`);
  assert(caught.operation === 'UI.tapTexts', `unexpected operation: ${caught.operation}`);
  if (phase !== undefined) assert(caught.failedPhase === phase, `expected phase ${phase}, received ${caught.failedPhase}`);
  if (index !== undefined) assert(caught.failedIndex === index, `expected index ${index}, received ${caught.failedIndex}`);
  return caught;
}

function stateFacts(state) {
  return {
    pid: Number(state.pid), windowNumber: Number(state.windowNumber),
    secondaryWindowNumber: Number(state.secondaryWindowNumber), mode: state.mode, phase: state.phase,
    nextClicks: Number(state.nextClicks), confirmClicks: Number(state.confirmClicks),
    ambiguousClicks: Number(state.ambiguousClicks), launchedAtMs: Number(state.launchedAtMs),
    nextClickedAtMs: Number(state.nextClickedAtMs), movedAtMs: Number(state.movedAtMs),
    confirmShownAtMs: Number(state.confirmShownAtMs), confirmClickedAtMs: Number(state.confirmClickedAtMs),
  };
}

async function capture(win, output) {
  const fresh = await window.get({ id: win.id });
  return page.screenshot({
    target: 'screen',
    clip: { x: fresh.x, y: fresh.y, width: fresh.width, height: fresh.height },
    path: output,
    returnType: 'path',
  });
}

async function runScenario(name, mode, delayMs, body) {
  let session = null;
  const row = { name, mode, status: 'running', startedAt: new Date().toISOString() };
  report.scenarios.push(row);
  await File.writeJSON(resultPath, report);
  try {
    session = await fixture.launch(paths, name, mode, delayMs);
    row.fixture = { pid: session.pid, windowId: session.win.id, executable: paths.executable };
    row.evidence = await body(session);
    row.status = 'passed';
  } catch (error) {
    row.status = 'failed';
    row.error = { code: error && error.code, message: String(error && error.message || error) };
    throw error;
  } finally {
    try {
      await fixture.stop(paths, session);
      row.fixtureStopped = true;
    } catch (stopError) {
      row.fixtureStopped = false;
      row.stopError = String(stopError && stopError.message || stopError);
      if (row.status === 'passed') throw stopError;
    } finally {
      row.finishedAt = new Date().toISOString();
      await File.writeJSON(resultPath, report);
    }
  }
}

const scenarioFilter = String(Execution.env.OPENDESK_UI_TAPTEXTS_SCENARIO || 'all');
const selected = new Set(scenarioFilter === 'all' ? [
  'default', 'explicit', 'legacy', 'move', 'missing', 'ambiguous', 'switch-window',
  'cancel-interval', 'cancel-after-observation',
] : scenarioFilter.split(',').map(value => value.trim()).filter(Boolean));

function wants(name) { return selected.has(name); }

try {
  report.permissions = await page.checkPermissions({
    capabilities: ['screenCapture', 'accessibility'], openSettings: false, strict: false,
  });
  const permissionMap = report.permissions && report.permissions.permissions && report.permissions.permissions.capabilities;
  assert(permissionMap && permissionMap.screenCapture && permissionMap.screenCapture.granted === true,
    `screenCapture permission is not granted: ${JSON.stringify(report.permissions)}`);
  assert(permissionMap.accessibility && permissionMap.accessibility.granted === true,
    `accessibility permission is not granted: ${JSON.stringify(report.permissions)}`);
  await fixture.build(paths);

  if (wants('default')) await runScenario('default', 'flow', 900, async session => {
    const screenshotDir = File.join(paths.outputRoot, 'screenshots');
    File.ensureDir(screenshotDir);
    const startPath = File.join(screenshotDir, 'default-start.png');
    const middlePath = File.join(screenshotDir, 'default-middle.png');
    const completePath = File.join(screenshotDir, 'default-complete.png');
    await capture(session.win, startPath);

    // The exact public call under acceptance: no options and no test-only facade.
    const pending = UI.tapTexts(['下一步', '确认']);
    const middle = await fixture.waitForState(session, state => Number(state.nextClicks) === 1);
    assert(Number(middle.confirmShownAtMs) === 0, `confirmation appeared before middle evidence: ${JSON.stringify(middle)}`);
    await capture(session.win, middlePath);
    const result = await pending;
    const final = await fixture.waitForState(session, state => state.phase === 'complete');
    const fresh = await window.get({ id: session.win.id });
    await capture(fresh, completePath);
    const completedVisible = await UI.hasText('完成', { within: fresh, match: 'exact' });
    assert(result && result.ok === true && result.action === 'tapTexts', JSON.stringify(result));
    assert(Array.isArray(result.completed) && result.completed.length === 2, JSON.stringify(result));
    assert(result.completed.map(item => item.target.text).join(',') === '下一步,确认', JSON.stringify(result));
    assert(Number(final.nextClicks) === 1 && Number(final.confirmClicks) === 1, JSON.stringify(final));
    assert(Number(final.confirmShownAtMs) > Number(final.nextClickedAtMs), JSON.stringify(final));
    assert(Number(final.confirmClickedAtMs) >= Number(final.confirmShownAtMs), JSON.stringify(final));
    assert(completedVisible === true, 'final fixture window does not visibly contain 完成');
    return { call: "await UI.tapTexts(['下一步', '确认'])", result, state: stateFacts(final), completedVisible,
      screenshots: { startPath, middlePath, completePath } };
  });

  if (wants('explicit')) await runScenario('explicit', 'flow', 400, async session => {
    const result = await UI.tapTexts(['下一步', '确认'], {
      within: session.win, intervalMs: 700, timeout: 30000,
    });
    const final = await fixture.waitForState(session, state => state.phase === 'complete');
    const elapsed = Number(final.confirmClickedAtMs) - Number(final.nextClickedAtMs);
    assert(result.completed.length === 2, JSON.stringify(result));
    assert(Number(final.nextClicks) === 1 && Number(final.confirmClicks) === 1, JSON.stringify(final));
    assert(elapsed >= 650, `interval override was not observed by fixture timestamps: ${elapsed}ms`);
    return { result, state: stateFacts(final), clickIntervalMs: elapsed };
  });

  if (wants('legacy')) await runScenario('legacy', 'flow', 900, async session => {
    const error = await expectCode(UI.tapTexts(['下一步', '确认'], {
      within: session.win, intervalMs: 0, waitForEach: false,
    }), 'TARGET_NOT_FOUND', 'locate', 1);
    const final = await fixture.waitForState(session, state => Number(state.confirmShownAtMs) > 0);
    assert(Array.isArray(error.completed) && error.completed.length === 1, JSON.stringify(error));
    assert(Number(final.nextClicks) === 1 && Number(final.confirmClicks) === 0, JSON.stringify(final));
    return { error: { code: error.code, failedIndex: error.failedIndex, failedPhase: error.failedPhase,
      completed: error.completed.length }, state: stateFacts(final) };
  });

  if (wants('move')) await runScenario('move', 'move', 800, async session => {
    const before = { x: session.win.x, y: session.win.y };
    const result = await UI.tapTexts(['下一步', '确认'], { within: session.win, timeout: 30000 });
    const final = await fixture.waitForState(session, state => state.phase === 'complete');
    const moved = await window.get({ id: session.win.id });
    assert(result.completed.length === 2, JSON.stringify(result));
    assert(Number(final.movedAtMs) > 0 && (moved.x !== before.x || moved.y !== before.y), JSON.stringify({ before, moved, final }));
    assert(Number(final.nextClicks) === 1 && Number(final.confirmClicks) === 1, JSON.stringify(final));
    return { result, state: stateFacts(final), before, after: { x: moved.x, y: moved.y } };
  });

  if (wants('missing')) await runScenario('missing', 'missing', 0, async session => {
    const error = await expectCode(UI.tapTexts(['永不出现'], {
      within: session.win, timeout: 800, polling: 200,
    }), 'TIMEOUT', 'locate', 0);
    const final = await fixture.readState(session);
    assert(error.completed.length === 0, JSON.stringify(error));
    assert(Number(final.nextClicks) === 0 && Number(final.confirmClicks) === 0 && Number(final.ambiguousClicks) === 0,
      JSON.stringify(final));
    return { error: { code: error.code, failedIndex: error.failedIndex, failedPhase: error.failedPhase,
      completed: error.completed.length }, state: stateFacts(final) };
  });

  if (wants('ambiguous')) await runScenario('ambiguous', 'ambiguous', 0, async session => {
    const error = await expectCode(UI.tapTexts(['重复目标'], { within: session.win, timeout: 30000 }),
      'AMBIGUOUS_TARGET', 'locate', 0);
    const final = await fixture.readState(session);
    assert(Number(error.candidateCount) >= 2, JSON.stringify(error));
    assert(Number(final.ambiguousClicks) === 0, JSON.stringify(final));
    return { error: { code: error.code, failedIndex: error.failedIndex, failedPhase: error.failedPhase,
      candidateCount: error.candidateCount, completed: error.completed.length }, state: stateFacts(final) };
  });

  if (wants('switch-window')) await runScenario('switch-window', 'switch', 500, async session => {
    const error = await expectCode(UI.tapTexts(['下一步', '确认'], { timeout: 30000 }),
      'STALE_TARGET', 'locate', 1);
    const final = await fixture.waitForState(session, state => Number(state.secondaryWindowNumber) > 0);
    assert(error.completed.length === 1, JSON.stringify(error));
    assert(Number(final.nextClicks) === 1 && Number(final.confirmClicks) === 0, JSON.stringify(final));
    return { error: { code: error.code, failedIndex: error.failedIndex, failedPhase: error.failedPhase,
      completed: error.completed.length }, state: stateFacts(final) };
  });

  if (wants('cancel-interval')) await runScenario('cancel-interval', 'flow', 500, async session => {
    const controller = new AbortController();
    const pending = UI.tapTexts(['下一步', '确认'], {
      within: session.win, intervalMs: 1000, timeout: 30000, signal: controller.signal,
    });
    await fixture.waitForState(session, state => Number(state.nextClicks) === 1);
    await sleep(150);
    controller.abort();
    const error = await expectCode(pending, 'CANCELED', 'interval', 1);
    const final = await fixture.waitForState(session, state => Number(state.confirmShownAtMs) > 0);
    assert(error.completed.length === 1, JSON.stringify(error));
    assert(Number(final.nextClicks) === 1 && Number(final.confirmClicks) === 0, JSON.stringify(final));
    return { error: { code: error.code, failedIndex: error.failedIndex, failedPhase: error.failedPhase,
      completed: error.completed.length }, state: stateFacts(final) };
  });

  if (wants('cancel-after-observation')) await runScenario('cancel-after-observation', 'observation-cancel', 0, async session => {
    const controller = new AbortController();
    const originalScreenshot = page.screenshot;
    const originalOCR = Vision.runOCR;
    let screenshotCalls = 0;
    let ocrCalls = 0;
    let provider = null;
    page.screenshot = async function (options) {
      const value = await originalScreenshot(options);
      screenshotCalls += 1;
      return value;
    };
    Vision.runOCR = async function (options) {
      const value = await originalOCR(options);
      ocrCalls += 1;
      provider = value && value.provider;
      controller.abort();
      return value;
    };
    let error;
    try {
      error = await expectCode(UI.tapTexts(['观察后取消目标'], {
        within: session.win, timeout: 30000, polling: 200, signal: controller.signal,
      }), 'CANCELED', 'locate', 0);
    } finally {
      page.screenshot = originalScreenshot;
      Vision.runOCR = originalOCR;
    }
    const final = await fixture.readState(session);
    assert(screenshotCalls === 1 && ocrCalls === 1 && typeof provider === 'string' && provider.length > 0,
      JSON.stringify({ screenshotCalls, ocrCalls, provider }));
    assert(error.completed.length === 0, JSON.stringify(error));
    assert(Number(final.nextClicks) === 0 && Number(final.confirmClicks) === 0 && Number(final.ambiguousClicks) === 0,
      JSON.stringify(final));
    return { error: { code: error.code, failedIndex: error.failedIndex, failedPhase: error.failedPhase,
      completed: error.completed.length }, actualObservation: { screenshotCalls, ocrCalls, provider }, state: stateFacts(final) };
  });

  const unknown = Array.from(selected).filter(name => !report.scenarios.some(row => row.name === name));
  assert(unknown.length === 0, `unknown or unexecuted scenario filter: ${unknown.join(',')}`);
  report.status = 'passed';
  report.finishedAt = new Date().toISOString();
  await File.writeJSON(resultPath, report);
  console.log(`[UI-TAPTEXTS-NATIVE-MACOS PASS] ${JSON.stringify({ resultPath, scenarios: report.scenarios.map(row => row.name) })}`);
} catch (error) {
  report.status = 'failed';
  report.finishedAt = new Date().toISOString();
  report.error = { code: error && error.code, message: String(error && error.message || error) };
  await File.writeJSON(resultPath, report);
  throw error;
}
