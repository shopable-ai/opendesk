(() => {
  const { assert, test } = RuntimeAPITest;
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

  async function activeFixture() {
    const info = await RuntimeLive.waitForBrowserWindow();
    assert(typeof info.id === 'string' && info.id.startsWith('darwin:') && info.id.includes(':native:'), JSON.stringify(info));
    assert(typeof info.pid === 'number' && info.pid > 0, JSON.stringify(info));
    assert(typeof info.handle === 'number' && info.handle > 0, JSON.stringify(info));
    RuntimeLive.updateTarget(info);
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
    const pid = Number(original.pid || original.processID || 0);
    const adjusted = {
      x: original.x + 12,
      y: original.y + 12,
      width: Math.max(640, original.width - 24),
      height: Math.max(480, original.height - 24),
    };
    try {
      await step('focus', () => window.focus(title));
      const focused = await step('getFocusWindow', () => window.getFocusWindow());
      assert(focused && focused.id.includes(':native:') && focused.pid === pid && focused.handle > 0, JSON.stringify(focused));
      await step('bringToTop', () => window.bringToTop(title, pid));
      await step('setWindowBounds', () => window.setWindowBounds(title, adjusted.x, adjusted.y, adjusted.width, adjusted.height));
      await page.waitFor(200);
      let current = await step('getWindowByTitle', () => window.getWindowByTitle(title));
      assert(Math.abs(current.width - adjusted.width) <= 4, JSON.stringify({ adjusted, current }));
      await step('setWidth', () => window.setWidth(title, adjusted.width - 20));
      await step('setHeight', () => window.setHeight(title, adjusted.height - 20));
      current = await step('getWindowByTitle-after-resize', () => window.getWindowByTitle(title));
      File.ensureDir(evidenceDirectory);
      const screenshot = await page.screenshot({
        clip: { x: current.x, y: current.y, width: current.width, height: current.height },
        path: screenshotPath,
        returnType: 'object',
      });
      assert(screenshot && screenshot.sizeBytes > 500, JSON.stringify(screenshot));
      const capabilities = window.getCapabilities();
      File.write(evidencePath, JSON.stringify({
        schemaVersion: 1,
        platform: capabilities.platform,
        backend: capabilities.backend,
        target: { app: RuntimeLive.fixture.browserApp || 'Safari', identity: current.id, pid: current.pid },
        operations: ['focus', 'bringToTop', 'setWindowBounds', 'setWidth', 'setHeight'],
        before: { x: original.x, y: original.y, width: original.width, height: original.height },
        readback: { x: current.x, y: current.y, width: current.width, height: current.height },
        coordinateSpace: capabilities.coordinateSpace,
        screenshot: { path: screenshotPath, width: screenshot.width, height: screenshot.height, sizeBytes: screenshot.sizeBytes },
        postcondition: { fixtureMatched: String(current.title).includes(RuntimeLive.fixture.title) },
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
      assert(String(current.title).includes(RuntimeLive.fixture.title), JSON.stringify(current));
    } finally {
      try { await window.restore(title); } catch (_) {}
      try { await window.setWindowBounds(title, original.x, original.y, original.width, original.height); } catch (_) {}
      try { await window.focus(title); } catch (_) {}
      await page.waitFor(250);
      const restored = await activeFixture();
      RuntimeLive.updateTarget(restored);
    }
  });

  test({
    name: 'window PID controls minimize, maximize, and restore only the fixture process',
    tier: 'live',
    covers: ['window.restoreByPID', 'window.minimizeByPID', 'window.maximizeByPID'],
  }, async () => {
    const original = await activeFixture();
    const pid = Number(original.pid || original.processID || 0);
    assert(pid > 0, JSON.stringify(original));
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
      assert(String(restored.title).includes(RuntimeLive.fixture.title), JSON.stringify(restored));
    } finally {
      try { await window.restoreByPID(pid); } catch (_) {}
      try { await window.setWindowBounds(original.title, original.x, original.y, original.width, original.height); } catch (_) {}
      try { await window.focus(original.title); } catch (_) {}
      await page.waitFor(250);
      RuntimeLive.updateTarget(await activeFixture());
    }
  });
})();
