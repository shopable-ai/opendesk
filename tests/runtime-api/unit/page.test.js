(() => {
  const { assert, equal, expectThrow, test, withGlobal } = RuntimeAPITest;
  RuntimeAPITest.contractObject('page');

  async function withNative(overrides, fn) {
    return withGlobal('page____Inject', overrides, fn);
  }

  test({ name: 'page.screenshot delegates options and result', tier: 'unit', covers: ['page.screenshot'] }, async () => {
    const options = { returnType: 'object', clip: { x: 1, y: 2, width: 3, height: 4 } };
    await withNative({ screenshot: async (actual) => ({ actual }) }, async () => {
      const result = await page.screenshot(options);
      equal(result.actual, options, 'page.screenshot changed options');
    });
  });

  test({ name: 'page.goto delegates URL', tier: 'unit', covers: ['page.goto'] }, async () => {
    let actual = null;
    await withNative({ goto: async (url) => { actual = url; } }, async () => page.goto('http://127.0.0.1/goto'));
    equal(actual, 'http://127.0.0.1/goto');
  });

  test({ name: 'page.openURL delegates URL', tier: 'unit', covers: ['page.openURL'] }, async () => {
    let actual = null;
    await withNative({ openURL: async (url) => { actual = url; } }, async () => page.openURL('http://127.0.0.1/open'));
    equal(actual, 'http://127.0.0.1/open');
  });

  test({ name: 'page.openApp delegates app name', tier: 'unit', covers: ['page.openApp'] }, async () => {
    let actual = null;
    await withNative({ openApp: async (name) => { actual = name; } }, async () => page.openApp('Safari'));
    equal(actual, 'Safari');
  });

  test({ name: 'page.openURLInApp delegates app and URL', tier: 'unit', covers: ['page.openURLInApp'] }, async () => {
    let actual = null;
    await withNative({ openURLInApp: async (...args) => { actual = args; } }, async () => page.openURLInApp('Safari', 'http://127.0.0.1/app'));
    equal(JSON.stringify(actual), JSON.stringify(['Safari', 'http://127.0.0.1/app']));
  });

  test({ name: 'page.title returns native title', tier: 'unit', covers: ['page.title'] }, async () => {
    await withNative({ title: () => 'fixture-title' }, async () => equal(page.title(), 'fixture-title'));
  });

  test({ name: 'page.url returns native executable value', tier: 'unit', covers: ['page.url'] }, async () => {
    await withNative({ url: () => '/Applications/Safari.app' }, async () => equal(page.url(), '/Applications/Safari.app'));
  });

  test({ name: 'page.waitFor accepts numeric waits', tier: 'unit', covers: ['page.waitFor'] }, async () => {
    const started = Date.now();
    await page.waitFor(5);
    assert(Date.now() >= started, 'clock moved backwards');
  });

  test({ name: 'page.waitForTimeout resolves', tier: 'unit', covers: ['page.waitForTimeout'] }, async () => {
    await page.waitForTimeout(5);
  });

  test({ name: 'page.waitForNavigation detects URL change', tier: 'unit', covers: ['page.waitForNavigation'] }, async () => {
    const original = page.url;
    let value = 'before';
    page.url = () => value;
    try {
      setTimeout(() => { value = 'after'; }, 10);
      await page.waitForNavigation({ timeout: 500 });
    } finally {
      page.url = original;
    }
  });

  test({ name: 'page.waitForFunction passes arguments and result', tier: 'unit', covers: ['page.waitForFunction'] }, async () => {
    const result = await page.waitForFunction((left, right) => left + right === 5 && 'ready', { timeout: 200, polling: 5 }, 2, 3);
    equal(result, 'ready');
  });

  test({ name: 'page.waitForAll returns ordered results', tier: 'unit', covers: ['page.waitForAll'] }, async () => {
    const result = await page.waitForAll([Promise.resolve('left'), Promise.resolve('right')], { timeout: 50 });
    equal(JSON.stringify(result), JSON.stringify(['left', 'right']));
  });

  test({ name: 'page.checkPermissions normalizes native report', tier: 'unit', covers: ['page.checkPermissions'] }, async () => {
    await withNative({ checkScreenshotPermissions: async () => ({ screenCapture: true, accessibility: true, ok: true }) }, async () => {
      const report = await page.checkPermissions({ capabilities: ['screenCapture', 'accessibility'] });
      assert(report.ok && report.permissions.capabilities.screenCapture.granted, JSON.stringify(report));
    });
  });

  test({ name: 'page.requestPermissions uses a non-opening native flow', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    let options = null;
    await withNative({
      requestMacPermissions: async (actual) => { options = actual; return { ok: true, after: { screenCapture: true, accessibility: true, ok: true } }; },
      checkScreenshotPermissions: async () => ({ screenCapture: true, accessibility: true, ok: true }),
    }, async () => {
      const report = await page.requestPermissions({ capabilities: ['screenCapture', 'accessibility'], openSettings: false });
      assert(report.ok, JSON.stringify(report));
      equal(options.openSettings, false);
    });
  });

  test({ name: 'page.requestPermissions keeps an accessibility-only preflight independent from Screen Recording', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    await withNative({
      // The native compatibility report is intentionally aggregate, but the
      // public facade must evaluate only the requested capability.
      requestMacPermissions: async () => ({ ok: false, after: { screenCapture: false, accessibility: true, ok: false } }),
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, ok: false }),
    }, async () => {
      const report = await page.requestPermissions({ capabilities: ['accessibility'], openSettings: false, strict: true });
      assert(report.ok, JSON.stringify(report));
      assert(report.permissions.capabilities.accessibility.granted, JSON.stringify(report));
    });
  });

  test({ name: 'page.checkPermissions preserves Input Monitoring as unknown', tier: 'unit', covers: ['page.checkPermissions'] }, async () => {
    await withNative({
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, ok: false }),
    }, async () => {
      const report = await page.checkPermissions({ capabilities: ['accessibility', 'inputMonitoring'] });
      assert(!report.ok, JSON.stringify(report));
      equal(report.permissions.capabilities.accessibility.state, 'granted');
      equal(report.permissions.capabilities.inputMonitoring.state, 'unknown');
      equal(report.permissions.capabilities.inputMonitoring.granted, false);
    });
  });

  test({ name: 'page.checkPermissions expands the globalShortcut section without treating Input Monitoring as granted', tier: 'unit', covers: ['page.checkPermissions'] }, async () => {
    await withNative({
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, ok: false }),
    }, async () => {
      const report = await page.checkPermissions({ section: 'globalShortcut' });
      assert(!report.ok, JSON.stringify(report));
      equal(JSON.stringify(report.capabilities), JSON.stringify(['accessibility', 'inputMonitoring']));
      equal(report.permissions.capabilities.accessibility.granted, true);
      equal(report.permissions.capabilities.inputMonitoring.state, 'unknown');
      equal(report.permissions.capabilities.inputMonitoring.granted, false);
    });
  });

  test({ name: 'page.requestPermissions opens the combined globalShortcut privacy flow without claiming Input Monitoring approval', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    let options = null;
    await withNative({
      requestMacPermissions: async (actual) => {
        options = actual;
        return {
          ok: false,
          after: { screenCapture: false, accessibility: true, ok: false },
          inputMonitoring: { state: 'unknown', granted: false },
        };
      },
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, ok: false }),
    }, async () => {
      const report = await page.requestPermissions({
        section: 'globalShortcut',
        openSettings: true,
        strict: false,
      });
      assert(!report.ok, JSON.stringify(report));
      equal(report.permissions.capabilities.accessibility.state, 'granted');
      equal(report.permissions.capabilities.inputMonitoring.state, 'unknown');
      equal(report.permissions.capabilities.inputMonitoring.granted, false);
    });
    equal(options.section, 'globalShortcut');
    equal(options.openSettings, true);
  });

  test({ name: 'page.ensurePermissions rejects an unverifiable Input Monitoring request', tier: 'unit', covers: ['page.ensurePermissions'] }, async () => {
    await withNative({
      requestMacPermissions: async () => ({ ok: false, after: { screenCapture: false, accessibility: true, ok: false } }),
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, ok: false }),
    }, async () => {
      await expectThrow(
        () => page.ensurePermissions({ section: 'globalShortcut', openSettings: false }),
        'Permissions are not ready',
      );
    });
  });

  test({ name: 'page.ensurePermissions enforces strict permission success', tier: 'unit', covers: ['page.ensurePermissions'] }, async () => {
    await withNative({
      requestMacPermissions: async () => ({ ok: true, after: { screenCapture: true, accessibility: true, ok: true } }),
      checkScreenshotPermissions: async () => ({ screenCapture: true, accessibility: true, ok: true }),
    }, async () => assert((await page.ensurePermissions({ capabilities: ['screenCapture'], openSettings: false })).ok));
  });

  test({ name: 'page.ensureMacPermissions maps section options', tier: 'unit', covers: ['page.ensureMacPermissions'] }, async () => {
    await withNative({
      requestMacPermissions: async () => ({ ok: true, after: { screenCapture: true, accessibility: true, ok: true } }),
      checkScreenshotPermissions: async () => ({ screenCapture: true, accessibility: true, ok: true }),
    }, async () => assert((await page.ensureMacPermissions({ section: 'screenCapture', openSettingsOnFail: false })).ok));
  });

  test({ name: 'page.checkScreenshotPermissions delegates native result', tier: 'unit', covers: ['page.checkScreenshotPermissions'] }, async () => {
    await withNative({ checkScreenshotPermissions: async () => ({ ok: true, marker: 42 }) }, async () => {
      equal((await page.checkScreenshotPermissions()).marker, 42);
    });
  });

  test({ name: 'page.openMacOSPrivacySettings delegates section', tier: 'unit', covers: ['page.openMacOSPrivacySettings'] }, async () => {
    let section = null;
    await withNative({ openMacOSPrivacySettings: async (actual) => { section = actual; return { ok: true }; } }, async () => {
      assert((await page.openMacOSPrivacySettings('accessibility')).ok);
    });
    equal(section, 'accessibility');
  });

  test({ name: 'page.requestMacPermissions delegates safe options', tier: 'unit', covers: ['page.requestMacPermissions'] }, async () => {
    let options = null;
    await withNative({ requestMacPermissions: async (actual) => { options = actual; return { ok: true }; } }, async () => {
      assert((await page.requestMacPermissions({ section: 'screenCapture', openSettings: false })).ok);
    });
    equal(options.openSettings, false);
  });

  test({ name: 'page.requestMacAutomationPermission delegates target app', tier: 'unit', covers: ['page.requestMacAutomationPermission'] }, async () => {
    let target = null;
    await withNative({ requestMacAutomationPermission: async (actual) => { target = actual; return { triggered: true }; } }, async () => {
      assert((await page.requestMacAutomationPermission('Finder')).triggered);
    });
    equal(target, 'Finder');
  });
})();
