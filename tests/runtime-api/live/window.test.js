(() => {
  const { assert, test } = RuntimeAPITest;

  async function step(name, fn) {
    const started = Date.now();
    console.log(`[RUNTIME-API-WINDOW STEP] ${name} start`);
    const result = await fn();
    console.log(`[RUNTIME-API-WINDOW STEP] ${name} done durationMs=${Date.now() - started}`);
    return result;
  }

  async function activeFixture() {
    const info = await RuntimeLive.waitForBrowserWindow();
    RuntimeLive.updateTarget(info);
    return info;
  }

  test({
    name: 'window title-based controls mutate only the fixture and restore its bounds',
    tier: 'live',
    covers: [
      'window.getActiveWindow', 'window.getWindowByTitle', 'window.focus',
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
      await step('bringToTop', () => window.bringToTop(title, pid));
      await step('setWindowBounds', () => window.setWindowBounds(title, adjusted.x, adjusted.y, adjusted.width, adjusted.height));
      await page.waitFor(200);
      let current = await step('getWindowByTitle', () => window.getWindowByTitle(title));
      assert(Math.abs(current.width - adjusted.width) <= 4, JSON.stringify({ adjusted, current }));
      await step('setWidth', () => window.setWidth(title, adjusted.width - 20));
      await step('setHeight', () => window.setHeight(title, adjusted.height - 20));
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
