(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({ name: 'page.openURLInApp opens isolated HTML fixture', tier: 'live', covers: ['page.openURLInApp'] }, async () => {
    for (const key of ['Meta', 'Shift', 'Control', 'Alt']) {
      try { await keyboard.up(key); } catch (_) {}
    }
    const target = await RuntimeLive.openWith('openURLInApp', 'open-url-in-app');
    assert(String(target.windowInfo.title).includes(RuntimeLive.fixture.title), JSON.stringify(target.windowInfo));
  });

  test({ name: 'page.openApp activates fixture browser', tier: 'live', covers: ['page.openApp'] }, async () => {
    await page.openApp(RuntimeLive.fixture.browserApp);
    await RuntimeLive.refreshTarget();
    await page.waitFor(300);
  });

  test({ name: 'page.title and page.url expose documented strings', tier: 'live', covers: ['page.title', 'page.url'] }, async () => {
    assert(typeof page.title() === 'string', `unexpected title=${JSON.stringify(page.title())}`);
    assert(typeof page.url() === 'string', `unexpected url=${JSON.stringify(page.url())}`);
  });

  test({
    name: 'page permission APIs report a ready non-opening flow',
    tier: 'live',
    covers: [
      'page.checkPermissions', 'page.requestPermissions', 'page.ensurePermissions',
      'page.ensureMacPermissions', 'page.checkScreenshotPermissions', 'page.requestMacPermissions',
    ],
  }, async () => {
    const capabilities = ['screenCapture', 'accessibility'];
    const checked = await page.checkPermissions({ capabilities });
    assert(checked && checked.ok, `checkPermissions=${JSON.stringify(checked)}`);
    const native = await page.checkScreenshotPermissions();
    assert(native && native.ok, `checkScreenshotPermissions=${JSON.stringify(native)}`);
    const requested = await page.requestPermissions({ capabilities, openSettings: false, strict: false });
    assert(requested && requested.ok, `requestPermissions=${JSON.stringify(requested)}`);
    const ensured = await page.ensurePermissions({ capabilities, openSettings: false, strict: true });
    assert(ensured && ensured.ok, `ensurePermissions=${JSON.stringify(ensured)}`);
    const macEnsured = await page.ensureMacPermissions({ section: 'screenCapture', openSettingsOnFail: false, strict: true });
    assert(macEnsured && macEnsured.ok, `ensureMacPermissions=${JSON.stringify(macEnsured)}`);
    const macRequested = await page.requestMacPermissions({ section: 'screenCapture', openSettings: false });
    assert(macRequested && macRequested.ok, `requestMacPermissions=${JSON.stringify(macRequested)}`);
  });

  test({ name: 'page.screenshot returns exact HTML-region metadata', tier: 'live', covers: ['page.screenshot'] }, async () => {
    const { point } = RuntimeLive.target('button-primary');
    const path = `${Execution.artifactDir}/host-api-page-screenshot.png`;
    try {
      const result = await page.screenshot({
        clip: { x: point.x - 20, y: point.y - 20, width: 40, height: 40 },
        path,
        returnType: 'object',
      });
      equal(result.width, 40, JSON.stringify(result));
      equal(result.height, 40, JSON.stringify(result));
      assert(result.sizeBytes > 100 && await File.exists(path), JSON.stringify(result));
    } finally {
      if (await File.exists(path)) await File.remove(path);
    }
  });
})();
