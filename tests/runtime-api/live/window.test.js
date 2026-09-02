(() => {
  const runtimeAPITest = globalThis.RuntimeAPITest;
  const live = globalThis.RuntimeLive;
  if (!runtimeAPITest) throw new Error('RuntimeAPITest was not loaded; use tests/runtime-api/macos_live.js');
  const { assert, test } = runtimeAPITest;
  assert(
    live
      && live.fixture
      && typeof live.fixture.title === 'string'
      && live.fixture.title.length > 0
      && typeof live.fixture.browserApp === 'string'
      && live.fixture.browserApp.length > 0
      && typeof live.refreshTarget === 'function',
    'RuntimeLive fixture driver was not loaded; use tests/runtime-api/macos_live.js',
  );
  const fixture = live.fixture;
  const evidenceDirectory = '.runtime/tests/platform-primitives/task-008-window-parity';
  const screenshotPath = `${evidenceDirectory}/window.png`;
  const evidencePath = `${evidenceDirectory}/evidence.json`;

  async function step(name, fn) {
    const started = Date.now();
    console.log(`[RUNTIME-API-WINDOW STEP] ${name} start`);
    const result = await fn();
    console.log(`[RUNTIME-API-WINDOW STEP] ${name} done durationMs=${Date.now() - started}`);
    return result;
  }

  function assertFixtureWindow(info, expectedPid) {
    assert(info && typeof info === 'object', JSON.stringify(info));
    assert(String(info.title || '').includes(fixture.title), JSON.stringify(info));
    assert(Number.isInteger(info.pid) && info.pid > 0, JSON.stringify(info));
    assert(Number.isFinite(info.x) && Number.isFinite(info.y), JSON.stringify(info));
    assert(Number.isFinite(info.width) && info.width > 0, JSON.stringify(info));
    assert(Number.isFinite(info.height) && info.height > 0, JSON.stringify(info));

    const identityPrefix = `darwin:${info.pid}:`;
    const nativeIdentity = typeof info.id === 'string' && info.id.startsWith(`${identityPrefix}native:`);
    const unresolvedIdentity = info.id === `${identityPrefix}unresolved`;
    assert(nativeIdentity || unresolvedIdentity, JSON.stringify(info));
    assert(typeof info.handle === 'number' && Number.isFinite(info.handle) && info.handle >= 0, JSON.stringify(info));
    if (nativeIdentity) assert(info.handle > 0, JSON.stringify(info));
    if (unresolvedIdentity) assert(info.handle === 0, JSON.stringify(info));
    if (expectedPid !== undefined) assert(info.pid === expectedPid, JSON.stringify({ expectedPid, info }));
    return info;
  }

  function assertBounds(info, expected) {
    assertFixtureWindow(info, expected.pid);
    assert(Math.abs(info.x - expected.x) <= 4, JSON.stringify({ expected, info }));
    assert(Math.abs(info.y - expected.y) <= 4, JSON.stringify({ expected, info }));
    assert(Math.abs(info.width - expected.width) <= 4, JSON.stringify({ expected, info }));
    assert(Math.abs(info.height - expected.height) <= 4, JSON.stringify({ expected, info }));
  }

  async function activeFixture() {
    const info = assertFixtureWindow((await live.refreshTarget()).windowInfo);
    return info;
  }

  test({
    name: 'window title-based controls mutate only the fixture and restore its bounds',
    tier: 'live',
    covers: [
      'window.getActiveWindow', 'window.getWindowByTitle', 'window.focus',
      'window.getFocusWindow',
      'window.setWindowBounds', 'window.setWidth', 'window.setHeight',
      'window.maximize', 'window.minimize', 'window.restore', 'window.bringToTop',
    ],
  }, async () => {
    const original = await activeFixture();
    const title = original.title;
    const pid = Number(original.pid);
    assert(Number.isInteger(pid) && pid > 0, JSON.stringify(original));
    const adjusted = {
      pid,
      x: Number(original.x) + 12,
      y: Number(original.y) + 12,
      width: Math.max(640, Number(original.width) - 24),
      height: Math.max(480, Number(original.height) - 24),
    };
    const resized = {
      ...adjusted,
      width: adjusted.width - 20,
      height: adjusted.height - 20,
    };
    try {
      await step('focus', () => window.focus(title));
      const focused = await step('getFocusWindow', () => window.getFocusWindow());
      assertFixtureWindow(focused, pid);
      assert(focused.isForeground === true && focused.hasFocus === true, JSON.stringify(focused));
      await step('bringToTop', () => window.bringToTop(title, pid));
      await step('setWindowBounds', () => window.setWindowBounds(title, adjusted.x, adjusted.y, adjusted.width, adjusted.height));
      await page.waitFor(200);
      let current = await step('getWindowByTitle', () => window.getWindowByTitle(title));
      assertBounds(current, adjusted);
      await step('setWidth', () => window.setWidth(title, resized.width));
      await step('setHeight', () => window.setHeight(title, resized.height));
      current = await step('getWindowByTitle-after-resize', () => window.getWindowByTitle(title));
      assertBounds(current, resized);
      File.ensureDir(evidenceDirectory);
      const screenshot = await page.screenshot({
        clip: { x: current.x, y: current.y, width: current.width, height: current.height },
        path: screenshotPath,
        returnType: 'object',
      });
      assert(screenshot && screenshot.sizeBytes > 500, JSON.stringify(screenshot));
      const capabilities = window.getCapabilities();
      const fixtureMatched = String(current.title).includes(fixture.title) && current.pid === pid;
      assert(fixtureMatched, JSON.stringify({ fixture, current }));
      File.write(evidencePath, JSON.stringify({
        schemaVersion: 1,
        platform: capabilities.platform,
        backend: capabilities.backend,
        target: { app: fixture.browserApp, identity: current.id, pid: current.pid },
        operations: ['focus', 'getFocusWindow', 'bringToTop', 'setWindowBounds', 'setWidth', 'setHeight'],
        before: { x: original.x, y: original.y, width: original.width, height: original.height },
        readback: { x: current.x, y: current.y, width: current.width, height: current.height },
        coordinateSpace: capabilities.coordinateSpace,
        screenshot: { path: screenshotPath, width: screenshot.width, height: screenshot.height, sizeBytes: screenshot.sizeBytes },
        postcondition: { fixtureMatched },
      }, null, 2));
      await step('maximize', () => window.maximize(title));
      await page.waitFor(200);
      await step('restore-after-maximize', () => window.restore(title));
      await page.waitFor(200);
      await step('minimize', () => window.minimize(title));
      await page.waitFor(200);
      await step('restore-after-minimize', () => window.restore(title));
      await page.waitFor(300);
      current = await activeFixture();
      assertFixtureWindow(current, pid);
    } finally {
      try { await window.restore(title); } catch (_) {}
      try { await window.setWindowBounds(title, original.x, original.y, original.width, original.height); } catch (_) {}
      try { await window.focus(title); } catch (_) {}
      await page.waitFor(250);
      const restored = await activeFixture();
      assertBounds(restored, original);
    }
  });

  test({
    name: 'window PID controls minimize, maximize, and restore only the fixture process',
    tier: 'live',
    covers: ['window.restoreByPID', 'window.minimizeByPID', 'window.maximizeByPID'],
  }, async () => {
    const original = await activeFixture();
    const pid = Number(original.pid);
    assert(Number.isInteger(pid) && pid > 0, JSON.stringify(original));
    try {
      await step('maximizeByPID', () => window.maximizeByPID(pid));
      await page.waitFor(200);
      await step('restoreByPID-after-maximize', () => window.restoreByPID(pid));
      await page.waitFor(200);
      await step('minimizeByPID', () => window.minimizeByPID(pid));
      await page.waitFor(200);
      await step('restoreByPID-after-minimize', () => window.restoreByPID(pid));
      await page.waitFor(300);
      const restored = await activeFixture();
      assertFixtureWindow(restored, pid);
    } finally {
      try { await window.restoreByPID(pid); } catch (_) {}
      try { await window.setWindowBounds(original.title, original.x, original.y, original.width, original.height); } catch (_) {}
      try { await window.focus(original.title); } catch (_) {}
      await page.waitFor(250);
      assertBounds(await activeFixture(), original);
    }
  });
})();
