// Focused cancellation regression for semantic UI.tapTargets.
// No real desktop input is performed.
(() => {
  const { test, assert, equal } = RuntimeAPITest;
  // Exercise the sole Runtime semantic resolver, rather than the lightweight
  // spelling adapter. The adapter deliberately delegates and has no input
  // lifecycle of its own to cancel.
  const uiSource = File.read(File.join(File.cwd(), 'polyfills/006-ui.js'));
  const facadeSource = File.read(File.join(File.cwd(), 'polyfills/011-ui-targets.js'));
  const windowSource = File.read(File.join(File.cwd(), 'polyfills/003-window.js'));

  test({
    name: 'semantic tapTargets preserves a completed OCR click before honoring cancellation',
    tier: 'unit',
    covers: ['UI.tapTargets'],
  }, async () => {
    const controller = new AbortController();
    const row = {
      id: 'fixture:42:native:7',
      pid: 42,
      processId: 42,
      title: 'Semantic Fixture',
      handle: 7,
      exePath: '/fixture/semantic',
      exeName: 'Semantic Fixture',
      x: 10,
      y: 20,
      width: 500,
      height: 400,
    };
    const host = {
      window: {
        list: () => [{ ...row }],
        getCapabilities: () => ({ platform: 'fixture' }),
        getActiveWindow: () => ({ ...row }),
        getWindowByTitle: () => ({ ...row }),
        getFocusWindow: () => ({ ...row }),
      },
      App: { get: () => ({ pids: [42] }) },
      Geometry,
      Screen: {
        getVirtualBounds: () => ({ x: 0, y: 0, width: 2000, height: 1500 }),
        getDisplays: () => [{
          id: 'fixture-display', index: 1,
          x: 0, y: 0, width: 2000, height: 1500,
          pixelWidth: 2000, pixelHeight: 1500, scale: 1,
        }],
      },
      page: {
        waitFor: async () => {},
        waitForTimeout: async () => {},
        screenshot: async () => 'fixture-shot',
      },
      ImageColor: { getSize: () => [row.width, row.height] },
      Vision: { runOCR: async () => ({
        provider: 'fixture-ocr',
        lines: [{ text: 'A', confidence: 1, bbox: { x: 10, y: 10, width: 20, height: 15 } }],
      }) },
      mouse: { clickPoint: async () => controller.abort() },
    };

    const clock = { now: () => 0 };
    new Function('globalThis', 'window', 'Date', windowSource)(host, host.window, clock);
    new Function('globalThis', 'Date', uiSource)(host, clock);
    new Function('globalThis', facadeSource)(host);

    let error = null;
    try {
      await host.UI.tapTargets(
        [{ text: 'A' }, { text: 'B' }],
        { within: { ...row }, signal: controller.signal },
      );
    } catch (caught) {
      error = caught;
    }

    assert(error, 'expected cancellation after first completed click');
    equal(error.code, 'CANCELED');
    equal(error.operation, 'UI.tapTargets');
    equal(error.failedIndex, 0);
    equal(error.failedPhase, 'input');
    equal(error.completed.length, 1);
    equal(error.completed[0].target.text, 'A');
  });
})();
