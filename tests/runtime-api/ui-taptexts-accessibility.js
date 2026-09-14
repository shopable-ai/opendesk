(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('UI');
  RuntimeAPITest.contractObject('Accessibility');

  const FIXED = Object.freeze({
    id: 'darwin:42:native:99', title: 'tapTexts fixture',
    pid: 42, processId: 42, handle: 99,
    x: 100, y: 100, width: 600, height: 400,
    isForeground: true, hasFocus: true,
  });

  function failure(code) {
    return Object.assign(new Error(code), { code });
  }

  async function expectCode(fn, code) {
    let caught = null;
    try { await fn(); } catch (error) { caught = error; }
    assert(caught, 'expected ' + code);
    equal(caught.code, code, String(caught));
    return caught;
  }

  async function fixture(config, fn) {
    const names = ['window', 'Screen', 'page', 'Vision', 'ImageColor', 'mouse', 'Accessibility'];
    const saved = names.map((name) => ({ name, descriptor: Object.getOwnPropertyDescriptor(globalThis, name) }));
    const records = { ax: [], clicks: [], releases: [], ocr: 0, performs: 0 };
    let live = { ...FIXED };
    const ax = (name) => { records.ax.push(name); };
    try {
      globalThis.window = {
        current: async () => ({ ...live }),
        getActiveWindow: async () => ({ ...live }),
        activate: async () => ({ ...live }),
      };
      globalThis.Screen = {
        getVirtualBounds: () => ({ x: 0, y: 0, width: 1800, height: 1000 }),
        getDisplays: () => [{ id: 'display-1', index: 1, x: 0, y: 0, width: 1800, height: 1000, pixelWidth: 1800, pixelHeight: 1000, scale: 1 }],
      };
      globalThis.page = {
        screenshot: async (request) => {
          records.lastClip = request.clip;
          return 'taptexts-fixture-image';
        },
        waitForTimeout: async () => {},
      };
      globalThis.ImageColor = {
        getSize: () => [records.lastClip.width, records.lastClip.height],
      };
      globalThis.Vision = {
        runOCR: async () => {
          records.ocr += 1;
          if (config.ocrError) throw failure(config.ocrError);
          const words = config.words || [];
          return {
            provider: 'fixture',
            lines: words.map((text, index) => ({
              text,
              confidence: 1,
              bbox: { x: 30 + index * 80, y: 30, width: 40, height: 30 },
            })),
          };
        },
      };
      globalThis.mouse = {
        clickPoint: async (point) => { records.clicks.push(point); },
        click: async (x, y) => { records.clicks.push({ x, y }); },
      };
      globalThis.Accessibility = {
        getCapabilities: () => {
          ax('getCapabilities');
          return {
            hostAuthorization: { enabled: true },
            implementation: { available: true, actions: { invoke: true } },
            permission: { granted: true },
          };
        },
        find: async (locator, options) => {
          ax('find');
          records.locator = locator;
          records.findWithin = options.within;
          if (config.findError) throw failure(config.findError);
          return config.noRef ? null : Object.freeze({ kind: 'AccessibilityElementRef', id: 'fixture-ref', role: 'button' });
        },
        read: async () => {
          ax('read');
          return { properties: {
            role: 'button',
            name: config.axName || '×',
            identifier: config.axIdentifier || null,
            enabled: config.enabled === undefined ? true : config.enabled,
            actions: config.actions || ['invoke'],
          } };
        },
        perform: async () => {
          ax('perform');
          records.performs += 1;
          return { backend: 'fixture-ax', requestId: 'perform-1', actionState: config.actionState || 'acknowledged' };
        },
        release: async () => { ax('release'); records.releases.push('fixture-ref'); return true; },
      };
      await fn(records, () => { live = { ...live, x: live.x + 1 }; });
    } finally {
      for (let index = saved.length - 1; index >= 0; index -= 1) {
        const item = saved[index];
        if (item.descriptor) Object.defineProperty(globalThis, item.name, item.descriptor);
        else delete globalThis[item.name];
      }
    }
  }

  test({ name: 'UI.tapTexts legacy string sequence stays OCR-only', tier: 'unit', covers: ['UI.tapTexts'] }, async () => {
    await fixture({ words: ['2'] }, async (records) => {
      const result = await UI.tapTexts(['2'], { within: { ...FIXED }, intervalMs: 0, waitForEach: false });
      equal(result.ok, true);
      equal(records.ax.length, 0, 'legacy string path must not touch Accessibility');
      equal(records.clicks.length, 1);
    });
  });

  test({ name: 'UI.tapTexts structured zero OCR match uses exact caller locator once', tier: 'unit', covers: ['UI.tapTexts', 'Accessibility.find', 'Accessibility.perform'] }, async () => {
    await fixture({ words: [], axName: '×' }, async (records) => {
      const result = await UI.tapTexts([
        { text: '×', locator: { role: 'button', name: '×' } },
      ], { within: { ...FIXED }, intervalMs: 0, timeout: 1000 });
      equal(result.ok, true);
      equal(records.clicks.length, 0);
      equal(records.performs, 1, 'native action must be submitted at most once');
      equal(records.releases.length, 1, 'managed ref must be released');
      equal(JSON.stringify(records.locator), JSON.stringify({ role: 'button', name: '×' }));
      assert(records.ax.indexOf('find') >= 0 && records.ax.indexOf('read') >= 0 && records.ax.indexOf('perform') >= 0, JSON.stringify(records.ax));
    });
  });

  test({ name: 'UI.tapTexts OCR ambiguity never falls back to Accessibility', tier: 'unit', covers: ['UI.tapTexts'] }, async () => {
    await fixture({ words: ['5', '5'], axName: '5' }, async (records) => {
      await expectCode(() => UI.tapTexts([
        { text: '5', locator: { role: 'button', name: '5' } },
      ], { within: { ...FIXED }, intervalMs: 0, timeout: 1000 }), 'AMBIGUOUS_TARGET');
      equal(records.ax.length, 0, 'ambiguous visual observations must not call Accessibility');
      equal(records.clicks.length, 0);
    });
  });

  test({ name: 'UI.tapTexts OCR infrastructure failure never falls back to Accessibility', tier: 'unit', covers: ['UI.tapTexts'] }, async () => {
    await fixture({ ocrError: 'OCR_FAILED', axName: '×' }, async (records) => {
      await expectCode(() => UI.tapTexts([
        { text: '×', locator: { role: 'button', name: '×' } },
      ], { within: { ...FIXED }, intervalMs: 0, timeout: 1000 }), 'OCR_FAILED');
      equal(records.ax.length, 0, 'OCR failure must not call Accessibility');
      equal(records.performs, 0);
    });
  });

  test({ name: 'UI.tapTexts unknown native action state stops without retry', tier: 'unit', covers: ['UI.tapTexts', 'Accessibility.perform'] }, async () => {
    await fixture({ words: [], axName: '×', actionState: 'unknown' }, async (records) => {
      const error = await expectCode(() => UI.tapTexts([
        { text: '×', locator: { role: 'button', name: '×' } },
        { text: '4', locator: { role: 'button', name: '4' } },
      ], { within: { ...FIXED }, intervalMs: 0, timeout: 1000 }), 'STATE_UNKNOWN');
      equal(records.performs, 1, 'unknown completion state must never retry');
      equal(error.failedIndex, 0);
      equal(error.completed.length, 0);
      equal(records.releases.length, 1);
    });
  });

  test({ name: 'UI.tapTexts structured RegExp keeps OCR matching separate from exact AX locator', tier: 'unit', covers: ['UI.tapTexts'] }, async () => {
    await fixture({ words: [], axName: '确定' }, async (records) => {
      const result = await UI.tapTexts([
        { text: /^确.*$/, locator: { role: 'button', name: '确定' } },
      ], { within: { ...FIXED }, intervalMs: 0, timeout: 1000 });
      equal(result.ok, true);
      equal(records.performs, 1);
      equal(records.locator.name, '确定', 'RegExp text must never be converted into an Accessibility selector');
    });
  });
})();
