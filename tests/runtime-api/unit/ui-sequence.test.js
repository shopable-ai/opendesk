// Inert registration for the shared OpenDesk Runtime API runner. Native window,
// screenshot, OCR and mouse dependencies are isolated; no desktop input is sent.
(() => {
  const { test, assert, equal } = RuntimeAPITest;
  const uiSource = File.read(File.join(File.cwd(), 'polyfills/006-ui.js'));
  const windowSource = File.read(File.join(File.cwd(), 'polyfills/003-window.js'));
  const unit = (name, fn, covers = ['UI.tapTexts']) => test({ name, tier: 'unit', covers }, fn);
  const line = (text, x = 10) => ({ text, confidence: 1, bbox: { x, y: 10, width: 20, height: 15 } });
  function fixture(settings = {}) {
    const f = {
      now: 0, clicks: [], screenshots: [], ocr: [], waits: [], reads: 0,
      row: { id: 'fixture:1:native:10', pid: 1, title: 'Fixture', handle: 10,
        exePath: '/fixture/app', exeName: 'Fixture', x: 100, y: 200, width: 300, height: 200 },
    };
    async function wait(ms, options) {
      f.waits.push({ ms, at: f.now, signal: options && options.signal });
      if (settings.onWait) await settings.onWait(ms, options, f);
      f.now += ms;
    }
    const host = {
      window: {
        list: () => [{ ...f.row }], getCapabilities: () => ({ platform: 'fixture' }),
        getActiveWindow: () => {
          f.reads++;
          if (settings.onRead) settings.onRead(f);
          return { ...f.row };
        },
        getWindowByTitle: () => ({ ...f.row }), getFocusWindow: () => ({ ...f.row }),
      },
      App: { get: () => ({ pids: [1] }) },
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
        waitFor: wait, waitForTimeout: wait,
        screenshot: async request => {
          f.screenshots.push(request);
          if (settings.onScreenshot) await settings.onScreenshot(f);
          return 'shot-' + (f.screenshots.length - 1);
        },
      },
      ImageColor: { getSize: image => {
        const shot = f.screenshots[Number(image.slice(5))];
        return [shot.clip.width, shot.clip.height];
      } },
      Vision: { runOCR: async request => {
        f.ocr.push({ at: f.now, request });
        return { provider: 'fixture', lines: settings.frames
          ? await settings.frames(f) : [line(['A', 'B', 'C'][f.clicks.length] || 'Z')] };
      } },
      mouse: { clickPoint: async (point, options) => {
        f.clicks.push({ point, options, at: f.now });
        if (settings.onClick) await settings.onClick(f);
      } },
    };
    const clock = { now: () => f.now };
    new Function('globalThis', 'window', 'Date', windowSource)(host, host.window, clock);
    new Function('globalThis', 'Date', uiSource)(host, clock);
    f.host = host;
    return f;
  }
  async function rejects(fn, code, index, phase) {
    let error;
    try { await fn(); } catch (caught) { error = caught; }
    assert(error, 'expected failure ' + code);
    equal(error.code, code, String(error));
    equal(error.operation, 'UI.tapTexts');
    if (index !== undefined) equal(error.failedIndex, index);
    if (phase !== undefined) equal(error.failedPhase, phase);
    return error;
  }

  unit('tapTexts defaults to sequential target waits and 300ms extra intervals', async () => {
    const f = fixture();
    const result = await f.host.UI.tapTexts(['A', 'B', 'C']);
    equal(result.ok, true); equal(result.action, 'tapTexts'); equal(result.completed.length, 3);
    equal(f.clicks.length, 3); equal(f.waits.length, 2); equal(f.ocr.length, 3);
    equal(f.waits.map(w => w.ms).join(','), '300,300');
    equal(f.clicks.map(c => c.at).join(','), '0,300,600');
    equal(result.completed.map(r => r.target.text).join(','), 'A,B,C');
  });
  unit('tapTexts interval is after the prior action with no initial or final delay', async () => {
    const f = fixture();
    await f.host.UI.tapTexts(['A', 'B', 'C'], { intervalMs: 300 });
    equal(f.waits.length, 2); equal(f.clicks.map(c => c.at).join(','), '0,300,600');
    equal(f.now, 600);
    const one = fixture(); await one.host.UI.tapTexts(['A'], { intervalMs: 300 }); equal(one.waits.length, 0);
  });
  unit('tapTexts serializes input completion rather than overlapping clicks', async () => {
    const f = fixture({ onClick: f => { f.now += 40; } });
    await f.host.UI.tapTexts(['A', 'B'], { intervalMs: 10 });
    equal(f.clicks.map(c => c.at).join(','), '0,50');
  });
  unit('tapTexts uses public window.get result and waits only for new target observations', async () => {
    const f = fixture({ frames: f => f.clicks.length === 0 ? [line('A')] : f.now < 500 ? [] : [line('B')] });
    const win = await f.host.window.get({ pid: 1 });
    const result = await f.host.UI.tapTexts(['A', 'B'], {
      within: win, intervalMs: 300, waitForEach: true, timeout: 1000, polling: 100,
    });
    equal(result.completed.length, 2); equal(f.clicks.map(c => c.at).join(','), '0,500');
    equal(f.waits.map(w => w.ms).join(','), '300,100,100'); equal(f.ocr.length, 4);
  }, ['UI.tapTexts', 'window.get']);
  unit('tapTexts explicit waitForEach:false retains fail-fast behavior', async () => {
    const f = fixture({ frames: () => [] });
    await rejects(() => f.host.UI.tapTexts(['A'], { timeout: 1000, waitForEach: false }), 'TARGET_NOT_FOUND', 0, 'locate');
    equal(f.waits.length, 0); equal(f.ocr.length, 1); equal(f.clicks.length, 0);
  });
  unit('tapTexts wait timeout is per step and clips the last polling delay', async () => {
    const f = fixture({ frames: f => f.clicks.length === 0 ? [line('A')] : [] });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B', 'C'], {
      waitForEach: true, intervalMs: 300, timeout: 250, polling: 100,
    }), 'TIMEOUT', 1, 'locate');
    equal(f.now, 550); equal(f.clicks.length, 1); equal(e.completed.length, 1); equal(e.failedText, 'B');
    equal(f.waits.map(w => w.ms).join(','), '300,100,100,50');
  });
  unit('tapTexts refuses a successful observation returned after deadline', async () => {
    const f = fixture({ frames: f => { f.now += 100; return [line('A')]; } });
    await rejects(() => f.host.UI.tapTexts(['A'], { waitForEach: true, timeout: 100 }), 'TIMEOUT', 0, 'locate');
    equal(f.clicks.length, 0); equal(f.ocr.length, 1);
  });
  unit('tapTexts pre-abort performs no window observation or input', async () => {
    const f = fixture(), controller = new AbortController(); controller.abort();
    const e = await rejects(() => f.host.UI.tapTexts(['A'], { waitForEach: true, signal: controller.signal }), 'CANCELED', 0, 'interval');
    equal(f.reads, 0); equal(f.screenshots.length, 0); equal(f.clicks.length, 0); equal(e.completed.length, 0);
  });
  unit('tapTexts interval failure preserves the completed prefix and original cause', async () => {
    const original = Object.assign(new Error('fixture timer failed'), { code: 'CANCELED' });
    const f = fixture({ onWait: () => { throw original; } });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B'], { intervalMs: 300 }), 'CANCELED', 1, 'interval');
    equal(e.completed.length, 1); equal(e.cause, original); equal(f.clicks.length, 1); equal(f.ocr.length, 1);
  });
  unit('tapTexts forwards signal to interval owner and stops after cancellation', async () => {
    const controller = new AbortController();
    const f = fixture({ onWait: (_, options) => { equal(options.signal, controller.signal); controller.abort(); } });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B'], { intervalMs: 300, signal: controller.signal }), 'CANCELED', 1, 'interval');
    equal(e.completed.length, 1); equal(f.clicks.length, 1); equal(f.ocr.length, 1);
  });
  unit('tapTexts stops polling and input when canceled in a wait', async () => {
    const controller = new AbortController();
    const f = fixture({ frames: () => [], onWait: () => controller.abort() });
    await rejects(() => f.host.UI.tapTexts(['A'], { waitForEach: true, signal: controller.signal }), 'CANCELED', 0, 'locate');
    equal(f.ocr.length, 1); equal(f.clicks.length, 0); equal(f.waits.length, 1);
  });
  unit('tapTexts cancellation after capture does not start OCR or input', async () => {
    const controller = new AbortController(); const f = fixture({ onScreenshot: () => controller.abort() });
    await rejects(() => f.host.UI.tapTexts(['A'], { signal: controller.signal }), 'CANCELED', 0, 'locate');
    equal(f.ocr.length, 0); equal(f.clicks.length, 0);
  });
  unit('tapTexts cancellation after OCR does not send input', async () => {
    const controller = new AbortController(); const f = fixture({ frames: () => { controller.abort(); return [line('A')]; } });
    await rejects(() => f.host.UI.tapTexts(['A'], { signal: controller.signal }), 'CANCELED', 0, 'locate');
    equal(f.clicks.length, 0);
  });
  unit('tapTexts never retries a submitted click even if input throws TARGET_NOT_FOUND', async () => {
    const original = Object.assign(new Error('fixture input uncertain'), { code: 'TARGET_NOT_FOUND' });
    const f = fixture({ onClick: () => { throw original; } });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B'], { waitForEach: true }), 'TARGET_NOT_FOUND', 0, 'input');
    equal(f.clicks.length, 1); equal(f.waits.length, 0); equal(e.completed.length, 0); equal(e.cause, original);
  });
  unit('tapTexts cancellation during successful input retains that completed input', async () => {
    const controller = new AbortController(); const f = fixture({ onClick: () => controller.abort() });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B'], { signal: controller.signal }), 'CANCELED', 0, 'input');
    equal(f.clicks.length, 1); equal(e.completed.length, 1); equal(e.completed[0].target.text, 'A');
  });
  unit('tapTexts ambiguity and invalid explicit index fail instead of being polled', async () => {
    const f = fixture({ frames: () => [line('A'), line('A', 60)] });
    const e = await rejects(() => f.host.UI.tapTexts(['A'], { waitForEach: true }), 'AMBIGUOUS_TARGET', 0);
    equal(e.candidateCount, 2); equal(f.waits.length, 0); equal(f.clicks.length, 0);
    const g = fixture(); await rejects(() => g.host.UI.tapTexts(['A'], { waitForEach: true, index: 4 }), 'TARGET_NOT_FOUND', 0);
    equal(g.waits.length, 0); equal(g.clicks.length, 0);
  });
  unit('tapTexts OCR failure remains terminal rather than being reported as a timeout', async () => {
    const f = fixture({ frames: () => { throw Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }); } });
    await rejects(() => f.host.UI.tapTexts(['A'], { waitForEach: true }), 'OCR_FAILED', 0);
    equal(f.waits.length, 0); equal(f.ocr.length, 1); equal(f.clicks.length, 0);
  });
  unit('tapTexts default sequence does not switch to a new foreground window', async () => {
    const f = fixture({ frames: f => f.clicks.length === 0 ? [line('A')] : [],
      onWait: (_, __, f) => { f.row.id = 'fixture:2:native:20'; f.row.pid = 2; } });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B'], { waitForEach: true }), 'STALE_TARGET', 1);
    equal(e.completed.length, 1); equal(f.clicks.length, 1);
  });
  unit('tapTexts default waiting refreshes bounds of the same window after an interval', async () => {
    const f = fixture({ onWait: (_, __, f) => { f.row.x += 100; } });
    await f.host.UI.tapTexts(['A', 'B'], { waitForEach: true, intervalMs: 10, within: { ...f.row } });
    equal(f.clicks[1].point.x - f.clicks[0].point.x, 100);
  });
  unit('tapTexts waits for a missing relative anchor without swallowing ambiguous anchors', async () => {
    const f = fixture({ frames: f => f.now === 0 ? [] : [line('Anchor', 10), line('A', 60)] });
    await f.host.UI.tapTexts(['A'], { within: { ...f.row }, waitForEach: true,
      relativeTo: { text: 'Anchor', direction: 'right', maxGap: 100 }, polling: 10 });
    equal(f.clicks.length, 1); equal(f.waits.length, 1);
    const g = fixture({ frames: () => [line('Anchor', 10), line('Anchor', 40), line('A', 100)] });
    const e = await rejects(() => g.host.UI.tapTexts(['A'], { within: { ...g.row }, waitForEach: true,
      relativeTo: { text: 'Anchor', direction: 'right', maxGap: 100 } }), 'AMBIGUOUS_TARGET', 0);
    equal(e.stage, 'anchor'); equal(g.waits.length, 0); equal(g.clicks.length, 0);
  });
  unit('tapTexts snapshots the string sequence before input and waits', async () => {
    const texts = ['A', 'B']; const f = fixture({ onClick: () => { texts[1] = 'changed'; texts.push('C'); } });
    const result = await f.host.UI.tapTexts(texts, { intervalMs: 10 });
    equal(result.completed.map(r => r.target.text).join(','), 'A,B'); equal(f.clicks.length, 2);
  });
  unit('tapTexts validates timing, sparse inputs and unknown option fields before observation', async () => {
    for (const options of [{ intervalMs: -1 }, { intervalMs: NaN }, { intervalMs: Infinity },
      { intervalMs: 86400001 }, { waitForEach: true, timeout: 300001 }, { waitForEach: true, polling: 10001 },
      { waitForEach: 'yes' }, { signal: {} }, { intervalMS: 100 }, { polling: 0 }, { timeout: 0 },
      { waitForEach: true, within: { x: 0, y: 0, width: 10, height: 10, coordinateSpace: 'screen' } }]) {
      const f = fixture(); await rejects(() => f.host.UI.tapTexts(['A'], options), 'INVALID_ARGUMENT');
      equal(f.screenshots.length, 0); equal(f.clicks.length, 0); equal(f.reads, 0);
    }
    const f = fixture(); const sparse = ['A']; sparse.length = 2;
    await rejects(() => f.host.UI.tapTexts(sparse), 'INVALID_ARGUMENT'); equal(f.clicks.length, 0);
  });
  unit('tapTexts preserves explicit click options and unaffected tapText behavior', async () => {
    const f = fixture(); await f.host.UI.tapTexts(['A'], { click: { button: 'right', clickCount: 1 } });
    equal(f.clicks[0].options.button, 'right');
    const g = fixture(); await g.host.UI.tapText('A'); equal(g.clicks.length, 1);
  }, ['UI.tapTexts', 'UI.tapText']);
  unit('tapTexts classifies untyped interval infrastructure errors without losing the prefix', async () => {
    const original = new Error('timer dependency failed');
    const f = fixture({ onWait: () => { throw original; } });
    const e = await rejects(() => f.host.UI.tapTexts(['A', 'B'], { intervalMs: 10 }), 'BACKEND_FAILED', 1, 'interval');
    equal(e.cause, original); equal(e.completed.length, 1); equal(f.clicks.length, 1);
  });
  unit('tapTexts checks deadline after the last foreground verification before input', async () => {
    const f = fixture({ onRead: f => { if (f.reads === 2) f.now = 100; } });
    await rejects(() => f.host.UI.tapTexts(['A'], { waitForEach: true, timeout: 100 }), 'TIMEOUT', 0, 'locate');
    equal(f.ocr.length, 1); equal(f.clicks.length, 0);
  });
  unit('tapTexts omitted options wait for each delayed target, not just the first', async () => {
    const f = fixture({ frames: f => f.clicks.length === 0
      ? (f.now < 400 ? [] : [line('A')])
      : (f.now < 1100 ? [] : [line('B')]) });
    const result = await f.host.UI.tapTexts(['A', 'B']);
    equal(result.completed.length, 2);
    equal(f.clicks.map(c => c.at).join(','), '400,1100');
    equal(f.waits.map(w => w.ms).join(','), '200,200,300,200,200');
  });
  unit('tapTexts empty options and undefined values preserve documented defaults', async () => {
    for (const options of [{}, { intervalMs: undefined, waitForEach: undefined }]) {
      const f = fixture();
      await f.host.UI.tapTexts(['A', 'B'], options);
      equal(f.clicks.map(c => c.at).join(','), '0,300');
    }
  });
  unit('tapTexts explicit zero interval remains possible with default target waiting', async () => {
    const f = fixture();
    await f.host.UI.tapTexts(['A', 'B'], { intervalMs: 0 });
    equal(f.waits.length, 0); equal(f.clicks.length, 2);
  });
  unit('tapTexts default missing target times out after 10000ms without any input', async () => {
    const f = fixture({ frames: () => [] });
    const error = await rejects(() => f.host.UI.tapTexts(['A']), 'TIMEOUT', 0, 'locate');
    equal(f.now, 10000); equal(f.clicks.length, 0); equal(error.completed.length, 0);
  });
  unit('tapTexts default sequence fails closed when another foreground window appears', async () => {
    const f = fixture({ onWait: (_, __, f) => { f.row.id = 'fixture:2:native:20'; f.row.pid = 2; } });
    const error = await rejects(() => f.host.UI.tapTexts(['A', 'B']), 'STALE_TARGET', 1, 'locate');
    equal(f.clicks.length, 1); equal(error.completed.length, 1);
  });
  unit('tapTexts explicit compatibility mode accepts a tagged region without extra delay', async () => {
    const f = fixture();
    await f.host.UI.tapTexts(['A', 'B'], { waitForEach: false, intervalMs: 0,
      within: { x: 100, y: 200, width: 300, height: 200, coordinateSpace: 'screen' } });
    equal(f.clicks.length, 2); equal(f.waits.length, 0);
  });
})();
