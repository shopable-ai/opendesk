// Opt-in macOS live suite. scripts/test_runtime_apis.sh injects an isolated local
// HTML fixture configuration before executing this file.

if (!globalThis.RUNTIME_API_FIXTURE) {
  throw new Error('RUNTIME_API_FIXTURE was not injected; run scripts/test_runtime_apis.sh live');
}

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

globalThis.RuntimeLive = (() => {
  const fixture = globalThis.RUNTIME_API_FIXTURE;
  let targetWindow = null;
  let lastSnapshot = null;
  let viewportOrigin = null;

  async function state() {
    const response = await http.get(`${fixture.baseURL}/state`);
    RuntimeAPITest.assert(response && response.status === 200, `fixture state HTTP status=${response && response.status}`);
    lastSnapshot = response.data;
    return lastSnapshot;
  }

  async function reset() {
    // Browser event handlers report through independent fetches. Let the last
    // local interaction drain before clearing server state, then prove no late
    // request repopulated a supposedly clean test.
    await page.waitFor(150);
    const response = await http.get(`${fixture.baseURL}/reset`);
    RuntimeAPITest.assert(response && response.status === 200, 'fixture reset failed');
    await page.waitFor(125);
    const settled = await state();
    const counts = settled.counts || {};
    for (const name of ['pointerdown', 'pointerup', 'click', 'wheel', 'wheel-scroll', 'keydown', 'keyup', 'input', 'primary-action', 'color-action', 'counter-action', 'reset-action', 'visual-settled']) {
      RuntimeAPITest.equal(Number(counts[name] || 0), 0, `fixture reset left stale ${name} events`);
    }
    lastSnapshot = settled;
    return settled;
  }

  async function waitForCount(name, minimum, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    let snapshot = null;
    while (Date.now() < deadline) {
      snapshot = await state();
      if (snapshot && snapshot.counts && Number(snapshot.counts[name] || 0) >= minimum) return snapshot;
      await page.waitFor(50);
    }
    const position = await mouse.getPos();
    throw new Error(
      `HTML fixture did not report ${name}>=${minimum}; state=${JSON.stringify(snapshot)} `
        + `pointer=${JSON.stringify(position)} window=${JSON.stringify(targetWindow)}`,
    );
  }

  async function waitForExactCount(name, expected, timeoutMs = 3000) {
    await waitForCount(name, expected, timeoutMs);
    await page.waitFor(125);
    const snapshot = await state();
    RuntimeAPITest.equal(Number(snapshot.counts[name] || 0), expected, `unexpected ${name} count; state=${JSON.stringify(snapshot)}`);
    return snapshot;
  }

  async function waitForEvent(type, predicate, timeoutMs = 3000) {
    RuntimeAPITest.assert(typeof predicate === 'function', 'waitForEvent predicate must be a function');
    const deadline = Date.now() + timeoutMs;
    let snapshot = null;
    while (Date.now() < deadline) {
      snapshot = await state();
      if (events(snapshot, type).some(predicate)) return snapshot;
      await page.waitFor(50);
    }
    throw new Error(`HTML fixture did not report matching ${type} event; state=${JSON.stringify(snapshot)}`);
  }

  async function waitForBrowserWindow(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let lastWindow = null;
    while (Date.now() < deadline) {
      try {
        lastWindow = await window.getActiveWindow();
        if (
          lastWindow
          && String(lastWindow.title || '').includes(fixture.title)
          && lastWindow.width > 0
          && lastWindow.height > 0
        ) return lastWindow;
      } catch (_) {}
      await page.waitFor(75);
    }
    throw new Error(`browser fixture window did not become active: ${JSON.stringify(lastWindow)}`);
  }

  async function waitForTelemetry(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    let snapshot = null;
    while (Date.now() < deadline) {
      snapshot = await state();
      const telemetry = snapshot && snapshot.telemetry;
      if (
        telemetry
        && telemetry.viewport
        && telemetry.viewport.width > 0
        && telemetry.viewport.height > 0
        && telemetry.elements
        && telemetry.elements['button-primary']
      ) return snapshot;
      await page.waitFor(50);
    }
    throw new Error(`fixture geometry telemetry did not arrive: ${JSON.stringify(snapshot)}`);
  }

  function updateTarget(windowInfo, snapshot = lastSnapshot) {
    RuntimeAPITest.assert(windowInfo && windowInfo.width > 0 && windowInfo.height > 0, `invalid fixture window=${JSON.stringify(windowInfo)}`);
    const telemetry = snapshot && snapshot.telemetry;
    RuntimeAPITest.assert(telemetry && telemetry.viewport, `missing fixture viewport telemetry=${JSON.stringify(snapshot)}`);
    const viewport = telemetry.viewport;
    const horizontalChrome = Math.max(0, (Number(windowInfo.width) - Number(viewport.width)) / 2);
    const verticalChrome = Math.max(0, Number(windowInfo.height) - Number(viewport.height));
    targetWindow = windowInfo;
    viewportOrigin = {
      x: Number(windowInfo.x) + horizontalChrome,
      y: Number(windowInfo.y) + verticalChrome,
      width: Number(viewport.width),
      height: Number(viewport.height),
    };
    RuntimeAPITest.assert(viewportOrigin.width > 0 && viewportOrigin.height > 0, `invalid viewport origin=${JSON.stringify(viewportOrigin)}`);
  }

  async function refreshTarget(timeoutMs = 8000) {
    const windowInfo = await waitForBrowserWindow(timeoutMs);
    const snapshot = await waitForTelemetry();
    updateTarget(windowInfo, snapshot);
    return { windowInfo, snapshot, viewportOrigin: { ...viewportOrigin } };
  }

  async function openWith(method, suffix) {
    await reset();
    const url = `${fixture.baseURL}/?case=${encodeURIComponent(suffix)}&run=${Date.now()}`;
    if (method === 'openURLInApp') await page.openURLInApp(fixture.browserApp, url);
    else await page[method](url);
    await waitForCount('load', 1, 8000);
    const targetInfo = await refreshTarget();
    const { windowInfo, snapshot } = targetInfo;
    console.log(`[RUNTIME-API-LIVE WINDOW] ${JSON.stringify({ method, url, window: windowInfo, viewport: snapshot.telemetry.viewport, viewportOrigin })}`);
    globalThis.RuntimeLiveSession = {
      ...(globalThis.RuntimeLiveSession || {}),
      browserApp: fixture.browserApp,
      window: windowInfo,
      viewport: snapshot.telemetry.viewport,
      viewportOrigin,
    };
    return { url, ...targetInfo };
  }

  function target(id) {
    RuntimeAPITest.assert(typeof id === 'string' && id, 'target id is required');
    RuntimeAPITest.assert(targetWindow && viewportOrigin && lastSnapshot, `target geometry is not ready for ${id}`);
    const telemetry = lastSnapshot.telemetry || {};
    const rect = telemetry.elements && telemetry.elements[id];
    RuntimeAPITest.assert(rect && rect.width > 0 && rect.height > 0, `missing or empty target rect for ${id}: ${JSON.stringify(telemetry)}`);
    const viewport = telemetry.viewport;
    RuntimeAPITest.assert(rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1, `target rect outside viewport for ${id}: ${JSON.stringify({ rect, viewport })}`);
    const point = {
      x: Math.round(viewportOrigin.x + (Number(rect.left) + Number(rect.right)) / 2),
      y: Math.round(viewportOrigin.y + (Number(rect.top) + Number(rect.bottom)) / 2),
    };
    RuntimeAPITest.assert(
      point.x > targetWindow.x && point.x < targetWindow.x + targetWindow.width
        && point.y > targetWindow.y && point.y < targetWindow.y + targetWindow.height,
      `target point outside fixture window for ${id}: ${JSON.stringify({ point, targetWindow, rect, viewportOrigin })}`,
    );
    return { id, rect, point, viewport: { ...viewport }, windowInfo: targetWindow, viewportOrigin: { ...viewportOrigin } };
  }

  function requireTarget(id = 'button-primary') {
    return target(id);
  }

  async function moveToTarget(id, steps = 6) {
    const targetInfo = target(id);
    let actual = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await mouse.move(targetInfo.point.x, targetInfo.point.y, { steps });
      // Quartz mouse movement is asynchronous. Never click a cached point:
      // confirm that the real cursor reached this fixture's current geometry.
      await page.waitFor(25);
      actual = await mouse.getPos();
      if (Math.abs(actual.x - targetInfo.point.x) <= 2 && Math.abs(actual.y - targetInfo.point.y) <= 2) break;
    }
    RuntimeAPITest.assert(
      Math.abs(actual.x - targetInfo.point.x) <= 2 && Math.abs(actual.y - targetInfo.point.y) <= 2,
      `cursor did not reach ${id}: ${JSON.stringify({ target: targetInfo, actual })}`,
    );
    return targetInfo;
  }

  async function resetUI() {
    const resetTarget = await moveToTarget('button-reset');
    await mouse.click(resetTarget.point.x, resetTarget.point.y, { delay: 30 });
    const snapshot = await waitForCount('reset-action', 1);
    RuntimeAPITest.assert(snapshot.telemetry.uiState.primary === 'idle', JSON.stringify(snapshot));
    RuntimeAPITest.assert(snapshot.telemetry.uiState.color === 'blue', JSON.stringify(snapshot));
    RuntimeAPITest.equal(Number(snapshot.telemetry.uiState.count), 0, JSON.stringify(snapshot));
    return snapshot;
  }

  async function restoreWindow(windowInfo) {
    if (!windowInfo || !windowInfo.title) return;
    try { await window.restore(windowInfo.title); } catch (_) {}
    try { await window.setWindowBounds(windowInfo.title, windowInfo.x, windowInfo.y, windowInfo.width, windowInfo.height); } catch (_) {}
    try { await window.focus(windowInfo.title); } catch (_) {}
    await page.waitFor(250);
    await refreshTarget();
  }

  async function capture(path, rect) {
    const shot = await page.screenshot({
      clip: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      path,
      returnType: 'object',
    });
    RuntimeAPITest.assert(shot && shot.width === Math.round(rect.width) && shot.height === Math.round(rect.height) && shot.sizeBytes > 500, JSON.stringify({ shot, rect }));
    return shot;
  }

  function region(ids, padding = 18) {
    const targets = ids.map((id) => target(id));
    const left = Math.min(...targets.map((item) => viewportOrigin.x + item.rect.left));
    const top = Math.min(...targets.map((item) => viewportOrigin.y + item.rect.top));
    const right = Math.max(...targets.map((item) => viewportOrigin.x + item.rect.right));
    const bottom = Math.max(...targets.map((item) => viewportOrigin.y + item.rect.bottom));
    const x = Math.max(targetWindow.x, Math.floor(left - padding));
    const y = Math.max(targetWindow.y, Math.floor(top - padding));
    const rightBound = Math.min(targetWindow.x + targetWindow.width, Math.ceil(right + padding));
    const bottomBound = Math.min(targetWindow.y + targetWindow.height, Math.ceil(bottom + padding));
    return { x, y, width: Math.max(1, rightBound - x), height: Math.max(1, bottomBound - y) };
  }

  async function legacyWriteEvidence(directory, value) {
    await File.ensureDir(directory);
    await File.write(`${directory}/state.json`, JSON.stringify(value.state, null, 2));
    await File.write(`${directory}/events.json`, JSON.stringify(value.events, null, 2));
    await File.write(`${directory}/events.ndjson`, value.events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    await File.write(`${directory}/manifest.json`, JSON.stringify({ ...value.manifest, evidenceDir: directory }, null, 2));
  }

  async function writeEvidence(directory, value) {
    await File.ensureDir(directory);
    const statePath = directory + '/state.json';
    const eventsPath = directory + '/events.json';
    const ndjsonPath = directory + '/events.ndjson';
    const manifestPath = directory + '/manifest.json';
    const events = value.events.map((event, index) => ({
      schemaVersion: '1.0.0',
      runId: RuntimeAPITest.context.runId,
      sequence: index + 1,
      timestamp: new Date(Number(event.at || Date.now())).toISOString(),
      type: String(event.type || ''),
      targetId: String(event.target || event.detail && event.detail.target || ''),
      event,
    }));
    await File.write(statePath, JSON.stringify(value.state, null, 2));
    await File.write(eventsPath, JSON.stringify(events, null, 2));
    await File.write(ndjsonPath, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    const evidenceFiles = [statePath, eventsPath, ndjsonPath]
      .concat([value.manifest.screenshots.pre.path, value.manifest.screenshots.post.path])
      .map((filePath) => ({ path: filePath, sizeBytes: new Uint8Array(File.readBytes(filePath)).length, sha256: RuntimeAPICrypto.hashFile(filePath) }));
    const manifest = {
      schemaVersion: '1.0.0',
      runId: RuntimeAPITest.context.runId,
      ...value.manifest,
      evidenceDir: directory,
      statePath,
      eventArtifacts: [eventsPath, ndjsonPath],
      evidenceFiles,
    };
    await File.write(manifestPath, JSON.stringify(manifest, null, 2));
    globalThis.RuntimeLiveEvidence = {
      directory, manifestPath, statePath, eventsPath, ndjsonPath,
      screenshots: manifest.screenshots, evidenceFiles,
    };
  }

  function events(snapshot, type) {
    return (snapshot.events || []).filter((event) => event.type === type);
  }

  return {
    fixture, state, reset, waitForCount, waitForExactCount, waitForEvent, waitForBrowserWindow, waitForTelemetry, refreshTarget,
    updateTarget, openWith, target, requireTarget, moveToTarget, resetUI, restoreWindow, capture, region,
    writeEvidence, events,
  };
})();

;(async () => {
  let liveFiles = RuntimeAPITestFiles.live;
  if (Array.isArray(RUNTIME_API_FIXTURE.liveFilter) && RUNTIME_API_FIXTURE.liveFilter.length > 0) {
    const requested = new Set(RUNTIME_API_FIXTURE.liveFilter);
    liveFiles = RuntimeAPITestFiles.live.filter((file) => requested.has(file) || requested.has(file.split('/').pop()));
    RuntimeAPITest.equal(liveFiles.length, requested.size, `unknown or duplicate live filter: ${JSON.stringify(RUNTIME_API_FIXTURE.liveFilter)}`);
    console.log(`[RUNTIME-API-LIVE FILTER] ${JSON.stringify(liveFiles)}`);
  }
  await RuntimeLive.openWith('openURLInApp', 'live-session-bootstrap');
  for (const file of liveFiles) RuntimeAPITest.load(file);
  await RuntimeAPITest.run('RUNTIME-API-LIVE');
})();
