(() => {
  const { assert, equal, expectThrow, test, withGlobal } = RuntimeAPITest;
  RuntimeAPITest.contractObject('page');

  async function withNative(overrides, fn) {
    return withGlobal('page____Inject', overrides, fn);
  }

  const pageWaitRequirementsPath = File.join(File.cwd(), 'tests/runtime-api/page-wait-requirements.js');
  assert(File.isFile(pageWaitRequirementsPath), 'Page wait requirements are missing: ' + pageWaitRequirementsPath);
  const pageWaitRequirements = (0, eval)(File.read(pageWaitRequirementsPath) + '\n//# sourceURL=' + pageWaitRequirementsPath);
  assert(Array.isArray(pageWaitRequirements) && pageWaitRequirements.length > 0, 'Page wait requirements registered no behavior');

  const pageWaitCasesPath = File.join(File.cwd(), 'tests/runtime-api/page-wait-cases.js');
  assert(File.isFile(pageWaitCasesPath), 'shared Page wait cases are missing: ' + pageWaitCasesPath);
  const createPageWaitCases = (0, eval)(File.read(pageWaitCasesPath) + '\n//# sourceURL=' + pageWaitCasesPath);
  assert(typeof createPageWaitCases === 'function', 'shared Page wait cases must export a factory');
  const discoveredPageWaitCases = createPageWaitCases({ assert, equal });
  assert(Array.isArray(discoveredPageWaitCases) && discoveredPageWaitCases.length > 0, 'shared Page wait cases registered no cases');

  function pageWaitSignature(item) {
    return JSON.stringify([item.group, item.name, item.covers]);
  }

  const requirementIds = new Set();
  const requirementSignatures = new Set();
  for (const requirement of pageWaitRequirements) {
    assert(requirement && typeof requirement === 'object', 'Page wait requirement must be an object');
    assert(typeof requirement.id === 'string' && requirement.id.length > 0, 'Page wait requirement has no stable id');
    assert(typeof requirement.group === 'string' && requirement.group.length > 0, 'Page wait requirement has no group: ' + requirement.id);
    assert(typeof requirement.name === 'string' && requirement.name.length > 0, 'Page wait requirement has no name: ' + requirement.id);
    assert(Array.isArray(requirement.covers) && requirement.covers.length > 0, 'Page wait requirement has no covers: ' + requirement.id);
    assert(!requirementIds.has(requirement.id), 'duplicate Page wait requirement id: ' + requirement.id);
    requirementIds.add(requirement.id);
    const signature = pageWaitSignature(requirement);
    assert(!requirementSignatures.has(signature), 'duplicate Page wait requirement metadata: ' + signature);
    requirementSignatures.add(signature);
  }

  const discoveredSignatures = new Set();
  for (const item of discoveredPageWaitCases) {
    assert(item && typeof item === 'object' && typeof item.run === 'function', 'invalid shared Page wait case');
    assert(typeof item.group === 'string' && typeof item.name === 'string' && Array.isArray(item.covers), 'invalid shared Page wait case metadata');
    const signature = pageWaitSignature(item);
    assert(!discoveredSignatures.has(signature), 'duplicate shared Page wait case: ' + signature);
    discoveredSignatures.add(signature);
    assert(requirementSignatures.has(signature), 'unregistered shared Page wait case: ' + signature);
  }
  equal(discoveredPageWaitCases.length, pageWaitRequirements.length, 'Page wait required/discovered behavior count differs');

  const pageWaitCases = pageWaitRequirements.map((requirement) => {
    const signature = pageWaitSignature(requirement);
    const matches = discoveredPageWaitCases.filter((item) => pageWaitSignature(item) === signature);
    equal(matches.length, 1, 'Page wait requirement must have exactly one shared case: ' + requirement.id);
    return { id: requirement.id, group: requirement.group, name: requirement.name, covers: requirement.covers, run: matches[0].run };
  });

  for (const item of pageWaitCases) {
    test({ name: 'page wait [' + item.id + ']: ' + item.name, tier: 'unit', covers: item.covers }, item.run);
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

  test({ name: 'page.openApp is forwarded by the generic native wrapper', tier: 'unit', covers: ['page.openApp'] }, async () => {
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

  test({ name: 'page.checkPermissions normalizes native report', tier: 'unit', covers: ['page.checkPermissions'] }, async () => {
    await withNative({ checkScreenshotPermissions: async () => ({ screenCapture: true, accessibility: true, ok: true }) }, async () => {
      const report = await page.checkPermissions({ capabilities: ['screenCapture', 'accessibility'] });
      assert(report.ok && report.permissions.capabilities.screenCapture.granted, JSON.stringify(report));
    });
  });

  test({ name: 'page.requestPermissions uses a non-opening native flow', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    const options = [];
    let checks = 0;
    await withNative({
      requestMacPermissions: async (actual) => {
        options.push(actual);
        return { ok: true, after: { screenCapture: true, accessibility: true, ok: true } };
      },
      checkScreenshotPermissions: async () => (++checks === 1
        ? { screenCapture: false, accessibility: false, ok: false }
        : { screenCapture: true, accessibility: true, ok: true }),
    }, async () => {
      const report = await page.requestPermissions({ capabilities: ['screenCapture', 'accessibility'], openSettings: false });
      assert(report.ok, JSON.stringify(report));
      equal(JSON.stringify(options.map((item) => item.section)), JSON.stringify(['screenCapture', 'accessibility']));
      assert(options.every((item) => item.openSettings === false && item.forceOpenSettings === false), JSON.stringify(options));
    });
  });

  test({ name: 'page.requestPermissions short-circuits an already-granted scoped preflight', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    let requestCalls = 0;
    await withNative({
      // The native compatibility report is intentionally aggregate, but the
      // public facade must evaluate only the requested capability.
      requestMacPermissions: async () => { requestCalls += 1; return { ok: false }; },
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, ok: false }),
    }, async () => {
      const report = await page.requestPermissions({ capabilities: ['accessibility'], openSettings: false, strict: true });
      assert(report.ok, JSON.stringify(report));
      assert(report.permissions.capabilities.accessibility.granted, JSON.stringify(report));
      assert(report.skipped, JSON.stringify(report));
      equal(report.reason, 'already_granted');
      equal(report.settingsOpened, false);
    });
    equal(requestCalls, 0, 'native request flow must not run after a granted preflight');
  });

  test({ name: 'page.checkPermissions preserves Input Monitoring as unknown', tier: 'unit', covers: ['page.checkPermissions'] }, async () => {
    await withNative({
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, inputMonitoringStatus: 'unknown', ok: false }),
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
      checkScreenshotPermissions: async () => ({ screenCapture: false, accessibility: true, inputMonitoringStatus: 'unknown', ok: false }),
    }, async () => {
      const report = await page.checkPermissions({ section: 'globalShortcut' });
      assert(!report.ok, JSON.stringify(report));
      equal(JSON.stringify(report.capabilities), JSON.stringify(['accessibility', 'inputMonitoring']));
      equal(report.permissions.capabilities.accessibility.granted, true);
      equal(report.permissions.capabilities.inputMonitoring.state, 'unknown');
      equal(report.permissions.capabilities.inputMonitoring.granted, false);
    });
  });

  test({ name: 'page.checkPermissions accepts granted Input Monitoring from IOHID preflight', tier: 'unit', covers: ['page.checkPermissions'] }, async () => {
    await withNative({
      checkScreenshotPermissions: async () => ({
        screenCapture: false,
        accessibility: true,
        inputMonitoring: true,
        inputMonitoringStatus: 'granted',
        ok: false,
      }),
    }, async () => {
      const report = await page.checkPermissions({ section: 'globalShortcut' });
      assert(report.ok, JSON.stringify(report));
      equal(report.permissions.capabilities.inputMonitoring.state, 'granted');
      equal(report.permissions.capabilities.inputMonitoring.granted, true);
    });
  });

  test({ name: 'page.requestPermissions skips an already-granted globalShortcut request', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    let requestCalls = 0;
    await withNative({
      requestMacPermissions: async () => { requestCalls += 1; return { ok: true }; },
      checkScreenshotPermissions: async () => ({
        screenCapture: false,
        accessibility: true,
        inputMonitoring: true,
        inputMonitoringStatus: 'granted',
        ok: false,
      }),
    }, async () => {
      const report = await page.requestPermissions({ section: 'globalShortcut', openSettings: true, strict: true });
      assert(report.ok && report.skipped, JSON.stringify(report));
      equal(report.reason, 'already_granted');
      equal(report.settingsOpened, false);
    });
    equal(requestCalls, 0, 'already-granted request must not invoke native permission request');
  });

  test({ name: 'page.requestPermissions forceOpenSettings bypasses the granted short-circuit', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    let options = null;
    const granted = {
      screenCapture: false,
      accessibility: true,
      inputMonitoring: true,
      inputMonitoringStatus: 'granted',
      ok: false,
    };
    await withNative({
      requestMacPermissions: async (actual) => {
        options = actual;
        return { ok: true, settingsOpened: true, after: granted };
      },
      checkScreenshotPermissions: async () => granted,
    }, async () => {
      const report = await page.requestPermissions({
        section: 'globalShortcut',
        openSettings: true,
        forceOpenSettings: true,
        strict: true,
      });
      assert(report.ok && report.settingsOpened, JSON.stringify(report));
    });
    equal(options.forceOpenSettings, true);
    equal(options.section, 'globalShortcut');
  });

  test({ name: 'page.requestPermissions ignores forceOpenSettings when settings navigation is disabled', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
    let requestCalls = 0;
    await withNative({
      requestMacPermissions: async () => { requestCalls += 1; return { ok: true }; },
      checkScreenshotPermissions: async () => ({
        screenCapture: false,
        accessibility: true,
        inputMonitoring: true,
        inputMonitoringStatus: 'granted',
        ok: false,
      }),
    }, async () => {
      const report = await page.requestPermissions({
        section: 'globalShortcut',
        openSettings: false,
        forceOpenSettings: true,
        strict: true,
      });
      assert(report.ok && report.skipped && !report.settingsOpened, JSON.stringify(report));
    });
    equal(requestCalls, 0, 'forceOpenSettings must not override openSettings=false');
  });

  test({ name: 'page.requestPermissions keeps a pending globalShortcut flow fail-closed', tier: 'unit', covers: ['page.requestPermissions'] }, async () => {
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
    equal(options.forceOpenSettings, false);
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
    equal(options.section, 'screenCapture');
  });

  test({ name: 'page.requestMacAutomationPermission delegates target app', tier: 'unit', covers: ['page.requestMacAutomationPermission'] }, async () => {
    let target = null;
    await withNative({ requestMacAutomationPermission: async (actual) => { target = actual; return { triggered: true }; } }, async () => {
      assert((await page.requestMacAutomationPermission('Finder')).triggered);
    });
    equal(target, 'Finder');
  });
})();
