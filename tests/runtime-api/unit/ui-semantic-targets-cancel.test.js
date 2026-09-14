// Focused cancellation regression for semantic UI.tapTargets.
// No real desktop input is performed.
(() => {
  const { test, assert, equal } = RuntimeAPITest;
  const facadeSource = File.read(File.join(File.cwd(), 'polyfills/011-ui-targets.js'));

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
    const taps = [];
    const host = {
      window: {
        getActiveWindow: async () => ({ ...row }),
      },
      UI: {
        tapTargets: async () => ({ ok: true, action: 'tapTargets', backend: 'accessibility', completed: [] }),
        tapText: async text => {
          taps.push(text);
          if (text === 'A') controller.abort();
          return {
            point: { x: 10, y: 20 },
            target: { text, provider: 'fixture-ocr', confidence: 1 },
          };
        },
      },
      Accessibility: {
        find: async () => null,
        read: async () => null,
        perform: async () => null,
        release: async () => true,
      },
    };

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
    equal(error.failedPhase, 'action');
    equal(error.completed.length, 1);
    equal(error.completed[0].index, 0);
    equal(error.completed[0].resolver, 'ocr');
    equal(taps.join(','), 'A', 'later targets must not execute after cancellation');
  });
})();
