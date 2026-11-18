// Registration only. All observation/input owners below are inert fixtures;
// these tests provide no live desktop, screenshot or input evidence.
(() => {
  const {test, assert, equal} = RuntimeAPITest;
  const source = File.read(File.join(File.cwd(), 'polyfills/013-ui-perception.js'));
  const unit = (name, run) => test({name, tier: 'unit', covers: ['UI.readText', 'UI.tapTargets']}, run);
  const win = () => ({id: 'fixture:1:2', pid: 1, handle: 2, title: 'Fixture', x: 10, y: 20, width: 300, height: 200});
  const rect = extra => Object.assign({x: 20, y: 30, width: 80, height: 20, coordinateSpace: 'screen'}, extra);
  const node = value => ({value, bounds: rect(), children: []});
  const snapshot = root => ({complete: true, truncated: false, root});
  function fixture(settings = {}) {
    let now = 0;
    const state = {win: win(), aborted: false};
    const calls = {snapshot: [], screenshot: 0, ocr: [], input: 0};
    const signal = {get aborted() { return state.aborted; }, addEventListener() {}, removeEventListener() {}};
    const host = {
      UI: {},
      window: {getActiveWindow: async () => {
        if (settings.window) await settings.window(state);
        return {...state.win};
      }},
      Accessibility: {
        getCapabilities: () => ({available: settings.available !== false}),
        snapshot: async options => {
          calls.snapshot.push(options);
          now += settings.nativeMs || 0;
          if (settings.native) return settings.native(state, options);
          return settings.snapshot || snapshot(null);
        },
      },
      page: {screenshot: async () => {
        calls.screenshot++;
        now += settings.captureMs || 0;
        if (settings.capture) await settings.capture(state);
        return 'fixture-image-no-real-capture';
      }},
      Vision: {runOCR: async options => {
        calls.ocr.push(options);
        now += settings.ocrMs || 0;
        if (settings.ocr) await settings.ocr(state);
        return {lines: [{text: 'fixture OCR result', bbox: {x: 0, y: 0}}]};
      }},
      mouse: {clickPoint: async () => { calls.input++; }},
      setTimeout,
    };
    for (const name of ['findTexts', 'findText', 'hasText', 'tapText', 'tapTexts', 'waitText', 'waitTextGone', 'findTextMatches', 'tapTargets']) {
      host.UI[name] = async () => [];
    }
    host.UI.findTexts = async () => settings.textCandidates || [];
    host.UI.getCapabilities = () => ({});
    new Function('globalThis', 'Date', source)(host, {now: () => now});
    return {UI: host.UI, state, calls, signal};
  }
  async function rejected(run, code) {
    let caught;
    try { await run(); } catch (error) { caught = error; }
    assert(caught, 'expected ' + code);
    equal(caught.code, code);
    return caught;
  }
  unit('F1 distinct native nodes with equal values remain ambiguous', async () => {
    const h = fixture({snapshot: snapshot({children: [node('110'), node('110')]})});
    const error = await rejected(() => h.UI.readText({within: win()}), 'AMBIGUOUS_TARGET');
    equal(error.candidateCount, 2); equal(h.calls.screenshot, 0);
  });
  unit('unique calibrated native value returns without OCR', async () => {
    const h = fixture({snapshot: snapshot(node('660'))});
    equal(await h.UI.readText({within: win()}), '660'); equal(h.calls.screenshot, 0);
  });
  unit('F2 incomplete native result cannot be hidden by successful OCR', async () => {
    const h = fixture({snapshot: {complete: false, truncated: true, root: null}});
    await rejected(() => h.UI.readText({within: win()}), 'SEARCH_INCOMPLETE');
    equal(h.calls.screenshot, 0); equal(h.calls.ocr.length, 0);
  });
  unit('F2 native errors retain their identity and never start OCR', async () => {
    const cause = Object.assign(new Error('fixture denied'), {code: 'PERMISSION_DENIED'});
    const h = fixture({native: () => { throw cause; }});
    equal(await rejected(() => h.UI.readText({within: win()}), cause.code), cause);
    equal(h.calls.screenshot, 0);
  });
  unit('unavailable native observation cannot prove zero native candidates', async () => {
    const h = fixture({available: false});
    await rejected(() => h.UI.readText({within: win()}), 'NOT_SUPPORTED');
    equal(h.calls.screenshot, 0);
  });
  unit('F3 native and OCR share the original deadline and use documented options', async () => {
    const h = fixture({nativeMs: 40, captureMs: 15});
    equal(await h.UI.readText({within: win(), timeout: 100, signal: h.signal}), 'fixture OCR result');
    equal(h.calls.snapshot[0].timeout, 100);
    equal(Object.prototype.hasOwnProperty.call(h.calls.snapshot[0], 'signal'), false);
    equal(h.calls.ocr[0].timeoutMs, 45);
    equal(h.calls.ocr[0].provider, 'local');
    equal(Object.prototype.hasOwnProperty.call(h.calls.ocr[0], 'fallback'), false);
  });
  unit('readText rejects untagged and image-space regions before observation', async () => {
    for (const coordinateSpace of [undefined, 'image']) {
      const h = fixture();
      await rejected(() => h.UI.readText({region: rect({coordinateSpace})}), 'INVALID_ARGUMENT');
      equal(h.calls.snapshot.length, 0);
      equal(h.calls.screenshot, 0);
      equal(h.calls.ocr.length, 0);
    }
  });
  for (const stage of ['native', 'capture', 'ocr']) {
    unit('F3 cancellation after ' + stage + ' rejects before returning data or observing further', async () => {
      const settings = {[stage]: state => { state.aborted = true; return snapshot(node('110')); }};
      const h = fixture(settings);
      await rejected(() => h.UI.readText({within: win(), signal: h.signal}), 'CANCELED');
      if (stage === 'native') equal(h.calls.screenshot, 0);
      if (stage !== 'ocr') equal(h.calls.ocr.length, 0);
    });
    unit('F3 window geometry change after ' + stage + ' rejects stale observations', async () => {
      const h = fixture({[stage]: state => { state.win.x++; return snapshot(node('110')); }});
      await rejected(() => h.UI.readText({within: win()}), 'STALE_TARGET');
      if (stage === 'native') equal(h.calls.screenshot, 0);
      if (stage !== 'ocr') equal(h.calls.ocr.length, 0);
    });
  }
  for (const stage of ['native', 'capture', 'ocr']) {
    unit('F3 exhausted budget after ' + stage + ' cannot return success', async () => {
      const settings = stage === 'native' ? {nativeMs: 100, snapshot: snapshot(node('110'))}
        : stage === 'capture' ? {captureMs: 100} : {ocrMs: 100};
      const h = fixture(settings);
      await rejected(() => h.UI.readText({within: win(), timeout: 100}), 'TIMEOUT');
      if (stage === 'native') equal(h.calls.screenshot, 0);
      if (stage !== 'ocr') equal(h.calls.ocr.length, 0);
    });
  }
  unit('F4 uncalibrated or untagged native bounds never create screen candidates', async () => {
    for (const bounds of [null, rect({coordinateSpace: 'native'}), {x: 20, y: 30, width: 80, height: 20}]) {
      const h = fixture({snapshot: snapshot({name: 'Save', bounds,
        nativeBounds: rect({coordinateSpace: 'macos-global-display-points-top-left'}), children: []})});
      equal((await h.UI.findTexts('Save', {within: win()})).length, 0);
      equal(h.calls.input, 0);
    }
  });
  unit('F5 pure text tapTargets preserves its public action and completed evidence', async () => {
    const target = {text: 'Save', bounds: rect(), center: {x: 60, y: 40, coordinateSpace: 'screen'}};
    const h = fixture({textCandidates: [target]});
    const result = await h.UI.tapTargets(['Save'], {within: win(), intervalMs: 0});
    equal(result.action, 'tapTargets'); equal(result.completed.length, 1);
    equal(result.completed[0].action, 'tapText'); equal(h.calls.input, 1);
  });
  unit('popUpButton Locator creates without observation and preserves its selector at delegation', async () => {
    const locatorSource = File.read(File.join(File.cwd(), 'polyfills/012-ui-scope-locator.js'));
    const calls = [];
    const host = {UI: {tapTargets: async (targets, options) => {
      calls.push({targets, options}); return {ok: true, action: 'tapTargets', completed: []};
    }}, window: {current: async () => win()}};
    new Function('globalThis', locatorSource)(host);
    const target = {role: 'popUpButton', name: 'Format', identifier: 'format-menu'};
    const locator = host.UI.within(win()).locator(target);
    equal(calls.length, 0);
    target.role = 'button';
    const result = await locator.tap();
    equal(result.action, 'tapTargets'); equal(calls.length, 1);
    equal(calls[0].targets[0].role, 'popUpButton');
    equal(calls[0].targets[0].name, 'Format');
    equal(calls[0].targets[0].identifier, 'format-menu');
    equal(calls[0].options.within.id, win().id);
  });
})();
