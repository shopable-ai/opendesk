(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('UI');

  function windowInfo(overrides = {}) {
    return {
      id: 'darwin:42:native:99', title: 'Fixture', pid: 42, processId: 42, handle: 99,
      x: 100, y: 200, width: 800, height: 600,
      ...overrides,
    };
  }

  function displayInfo(overrides = {}) {
    return {
      id: 'display-1', index: 1, x: 0, y: 0, width: 1920, height: 1080,
      pixelWidth: 1920, pixelHeight: 1080, scale: 1,
      ...overrides,
    };
  }

  async function expectCode(fn, code, operation) {
    let caught = null;
    try {
      await fn();
    } catch (error) {
      caught = error;
    }
    assert(caught, 'expected ' + code);
    equal(caught.code, code, String(caught));
    if (operation) equal(caught.operation, operation, String(caught));
    return caught;
  }

  async function withStubs(options, fn) {
    const original = {
      window: globalThis.window,
      Screen: globalThis.Screen,
      page: globalThis.page,
      Vision: globalThis.Vision,
      ImageColor: globalThis.ImageColor,
      mouse: globalThis.mouse,
    };
    const records = { screenshots: [], clicks: [], ocrRequests: [], imageRequests: [], waits: [] };
    let screenshotIndex = 0;
    const currentWindow = options.getActiveWindow || (async function () { return options.window || windowInfo(); });
    const nativeClickPoint = original.mouse.clickPoint;

    globalThis.window = { getActiveWindow: currentWindow };
    globalThis.Screen = {
      getVirtualBounds: function () { return options.virtual || { x: 0, y: 0, width: 1920, height: 1080 }; },
      getDisplays: function () { return options.displays || [displayInfo()]; },
    };
    globalThis.page = {
      screenshot: async function (request) {
        records.screenshots.push(request);
        const index = screenshotIndex;
        screenshotIndex += 1;
        if (options.screenshot) return options.screenshot(request, index, records);
        const image = 'fixture-shot-' + index;
        return image;
      },
      waitFor: async function (milliseconds) { records.waits.push(milliseconds); },
    };
    globalThis.Vision = {
      runOCR: async function (request) {
        records.ocrRequests.push(request);
        const index = records.ocrRequests.length - 1;
        if (options.runOCR) return options.runOCR(request, index, records);
        return { provider: 'fixture', lines: [] };
      },
    };
    globalThis.ImageColor = {
      getSize: function (image) {
        const index = Number(String(image).replace('fixture-shot-', ''));
        return options.getSize ? options.getSize(image, index, records) : [1000, 750];
      },
      findImages: async function (image, template, request) {
        records.imageRequests.push({ image: image, template: template, request: request });
        const index = records.imageRequests.length - 1;
        return options.findImages ? options.findImages(image, template, request, index, records) : [];
      },
    };
    globalThis.mouse = {
      click: function (x, y, clickOptions) { records.clicks.push({ x: x, y: y, options: clickOptions }); },
      clickPoint: nativeClickPoint,
    };
    try {
      return await fn(records);
    } finally {
      globalThis.window = original.window;
      globalThis.Screen = original.Screen;
      globalThis.page = original.page;
      globalThis.Vision = original.Vision;
      globalThis.ImageColor = original.ImageColor;
      globalThis.mouse = original.mouse;
    }
  }

  test({ name: 'UI exposes only implemented high-level capabilities', tier: 'unit', covers: ['UI.getCapabilities'] }, async () => {
    const capabilities = UI.getCapabilities();
    assert(capabilities.text.backend === 'Vision.runOCR' && capabilities.image.backend === 'ImageColor.findImages', JSON.stringify(capabilities));
    assert(capabilities.accessibility.available === false && capabilities.accessibility.status === 'notImplemented', JSON.stringify(capabilities));
    assert(capabilities.coordinateMapping.actualCaptureScale === true && capabilities.coordinateMapping.mixedDPIScope === false, JSON.stringify(capabilities));
  });

  test({ name: 'UI projects OCR bboxes with actual capture scale including non-uniform and negative scopes', tier: 'unit', covers: ['UI.findTexts', 'UI.findText'] }, async () => {
    const scales = [
      { x: 1, y: 1, image: [800, 600] },
      { x: 1.25, y: 1.25, image: [1000, 750] },
      { x: 1.5, y: 1.5, image: [1200, 900] },
      { x: 1.75, y: 1.75, image: [1400, 1050] },
      { x: 2, y: 2, image: [1600, 1200] },
      { x: 1.25, y: 1.5, image: [1000, 900] },
    ];
    await withStubs({
      getSize: function (_, index) { return scales[index].image; },
      runOCR: function (_, index) {
        const scale = scales[index];
        return {
          provider: 'fixture',
          lines: [{ text: '确定', confidence: 0.9, bbox: {
            x: 100 * scale.x, y: 100 * scale.y, width: 200 * scale.x, height: 40 * scale.y,
          } }],
        };
      },
    }, async function (records) {
      for (let index = 0; index < scales.length; index += 1) {
        const target = await UI.findText('确定', { within: windowInfo() });
        assert(target && target.bounds.x === 200 && target.bounds.y === 300 && target.bounds.width === 200 && target.bounds.height === 40, JSON.stringify(target));
        assert(target.center.x === 300 && target.center.y === 320 && target.center.coordinateSpace === 'screen', JSON.stringify(target.center));
      }
      assert(records.screenshots.every(function (request) {
        return request.target === 'screen' && request.returnType === 'base64' && request.clip.x === 100 && request.clip.y === 200 && request.clip.width === 800 && request.clip.height === 600;
      }), JSON.stringify(records.screenshots));
    });

    await withStubs({
      window: windowInfo({ x: -700, y: 100 }),
      virtual: { x: -1920, y: 0, width: 3840, height: 1080 },
      displays: [displayInfo({ x: -1920, width: 1920 })],
      getSize: function () { return [1000, 750]; },
      runOCR: function () { return { provider: 'fixture', lines: [{ text: '负坐标', confidence: 1, bbox: { x: 125, y: 125, width: 250, height: 50 } }] }; },
    }, async function (records) {
      const target = await UI.findText('负坐标', { within: windowInfo({ x: -700, y: 100 }) });
      assert(target && target.bounds.x === -600 && target.bounds.y === 200, JSON.stringify(target));
      assert(records.screenshots[0].clip.x === -700 && records.screenshots[0].clip.y === 100, JSON.stringify(records.screenshots));
    });
  });

  test({ name: 'UI text matching normalizes whitespace, supports contains, sorts reading order, and fails closed on ambiguity', tier: 'unit', covers: ['UI.findTexts', 'UI.findText', 'UI.hasText'] }, async () => {
    const lines = [
      { text: '  Foo   Bar  ', confidence: 0.9, bbox: { x: 300, y: 100, width: 100, height: 20 } },
      { text: 'foo bar', confidence: 0.8, bbox: { x: 100, y: 100, width: 100, height: 20 } },
      { text: 'Prefix Foo Bar Suffix', confidence: 0.7, bbox: { x: 100, y: 200, width: 100, height: 20 } },
    ];
    await withStubs({ runOCR: function () { return { provider: 'fixture', lines: lines }; } }, async function () {
      const all = await UI.findTexts('FOO BAR', { within: windowInfo() });
      assert(all.length === 2 && all[0].bounds.x < all[1].bounds.x, JSON.stringify(all));
      const contains = await UI.findTexts('foo bar', { within: windowInfo(), match: 'contains' });
      assert(contains.length === 3, JSON.stringify(contains));
      const indexed = await UI.findText('foo bar', { within: windowInfo(), index: 1 });
      assert(indexed && indexed.text === '  Foo   Bar  ', JSON.stringify(indexed));
      const ambiguous = await expectCode(() => UI.findText('foo bar', { within: windowInfo() }), 'AMBIGUOUS_TARGET', 'UI.findText');
      assert(ambiguous.candidateCount === 2 && Array.isArray(ambiguous.candidates), JSON.stringify(ambiguous));
      await expectCode(() => UI.findText('foo bar', { within: windowInfo(), index: 9 }), 'TARGET_NOT_FOUND', 'UI.findText');
      equal(await UI.findText('missing', { within: windowInfo() }), null, 'no text should return null');
      equal(await UI.hasText('missing', { within: windowInfo() }), false, 'hasText must not throw on no result');
    });
  });

  test({ name: 'UI uses visible intersection and rejects a mixed-DPI capture scope', tier: 'unit', covers: ['UI.findText'] }, async () => {
    await withStubs({
      window: windowInfo({ x: -200, y: 100, width: 400, height: 300 }),
      virtual: { x: 0, y: 0, width: 1920, height: 1080 },
      displays: [displayInfo()],
      getSize: function () { return [250, 375]; },
      runOCR: function () { return { provider: 'fixture', lines: [{ text: '部分可见', confidence: 1, bbox: { x: 125, y: 125, width: 50, height: 50 } }] }; },
    }, async function (records) {
      await UI.findText('部分可见', { within: windowInfo({ x: -200, y: 100, width: 400, height: 300 }) });
      const clip = records.screenshots[0].clip;
      assert(clip.x === 0 && clip.y === 100 && clip.width === 200 && clip.height === 300, JSON.stringify(clip));
    });

    await withStubs({
      window: windowInfo({ x: 0, y: 0, width: 200, height: 100 }),
      virtual: { x: 0, y: 0, width: 200, height: 100 },
      displays: [
        displayInfo({ id: 'left', x: 0, y: 0, width: 100, height: 100, pixelWidth: 100, pixelHeight: 100, scale: 1 }),
        displayInfo({ id: 'right', index: 2, x: 100, y: 0, width: 100, height: 100, pixelWidth: 150, pixelHeight: 150, scale: 1.5 }),
      ],
    }, async function (records) {
      await expectCode(() => UI.findText('确定', { within: windowInfo({ x: 0, y: 0, width: 200, height: 100 }) }), 'UNSUPPORTED_MIXED_DPI_SCOPE', 'UI.findText');
      equal(records.screenshots.length, 0, 'mixed-DPI scope must fail before screenshot');
    });
  });

  test({ name: 'UI fails closed for invalid scopes, capture failures, and unusable coordinate mappings', tier: 'unit', covers: ['UI.findText', 'UI.findImages'] }, async () => {
    await withStubs({}, async function (records) {
      await expectCode(() => UI.findText('确定', { within: { x: 100, y: 200, width: 80, height: 30 } }), 'INVALID_ARGUMENT', 'UI.findText');
      equal(records.screenshots.length, 0, 'unmarked regions must not be captured');
    });

    await withStubs({
      window: windowInfo({ x: 3000, y: 200 }),
    }, async function (records) {
      await expectCode(() => UI.findText('确定', { within: windowInfo({ x: 3000, y: 200 }) }), 'TARGET_SCOPE_NOT_VISIBLE', 'UI.findText');
      equal(records.screenshots.length, 0, 'invisible scopes must not be captured');
    });

    await withStubs({
      screenshot: async function () { throw new Error('fixture capture failure'); },
    }, async function () {
      await expectCode(() => UI.findText('确定', { within: windowInfo() }), 'SCREENSHOT_FAILED', 'UI.findText');
    });

    await withStubs({
      getSize: function () { return [0, 750]; },
    }, async function () {
      await expectCode(() => UI.findText('确定', { within: windowInfo() }), 'UNSUPPORTED_COORDINATE_MAPPING', 'UI.findText');
    });

    await withStubs({
      runOCR: async function () { throw new Error('fixture OCR failure'); },
    }, async function () {
      await expectCode(() => UI.findText('确定', { within: windowInfo() }), 'OCR_FAILED', 'UI.findText');
    });

    await withStubs({
      runOCR: function () { return { provider: 'fixture', lines: [{ text: '确定', confidence: 1, bbox: { x: -1, y: 100, width: 100, height: 40 } }] }; },
    }, async function () {
      await expectCode(() => UI.findText('确定', { within: windowInfo() }), 'OCR_FAILED', 'UI.findText');
    });

    await withStubs({
      findImages: async function () { throw new Error('fixture image matcher failure'); },
    }, async function () {
      await expectCode(() => UI.findImages('template.png', { within: windowInfo() }), 'IMAGE_MATCH_FAILED', 'UI.findImages');
    });
  });

  test({ name: 'UI.tapText and UI.tapTexts use fresh recognition and only mapped screen points', tier: 'unit', covers: ['UI.tapText', 'UI.tapTexts'] }, async () => {
    await withStubs({
      runOCR: function () { return { provider: 'fixture', lines: [{ text: '确定', confidence: 1, bbox: { x: 125, y: 125, width: 250, height: 50 } }] }; },
    }, async function (records) {
      const result = await UI.tapText('确定', { within: windowInfo(), click: { button: 'right' } });
      assert(result.ok === true && result.action === 'tapText' && result.point.x === 300 && result.point.y === 320, JSON.stringify(result));
      assert(records.clicks.length === 1 && records.clicks[0].x === 300 && records.clicks[0].y === 320 && records.clicks[0].options.button === 'right', JSON.stringify(records.clicks));
    });

    await withStubs({
      runOCR: function (_, index) {
        return { provider: 'fixture', lines: [{ text: index === 0 ? '1' : '2', confidence: 1, bbox: { x: 100, y: 100, width: 100, height: 40 } }] };
      },
    }, async function (records) {
      const result = await UI.tapTexts(['1', '2'], { within: windowInfo(), match: 'exact', intervalMs: 1 });
      assert(result.ok === true && result.completed.length === 2, JSON.stringify(result));
      assert(result.completed.every(function (item) { return item.action === 'tapText'; }), JSON.stringify(result));
      equal(records.screenshots.length, 2, 'each text action requires a fresh screenshot');
      equal(records.ocrRequests.length, 2, 'each text action requires fresh OCR');
      assert(records.waits.includes(1), JSON.stringify(records.waits));
    });

    await withStubs({
      runOCR: function (_, index) {
        return { provider: 'fixture', lines: index === 0 ? [{ text: '1', confidence: 1, bbox: { x: 100, y: 100, width: 100, height: 40 } }] : [] };
      },
    }, async function () {
      const error = await expectCode(() => UI.tapTexts(['1', 'missing'], { within: windowInfo() }), 'TARGET_NOT_FOUND', 'UI.tapTexts');
      assert(error.failedIndex === 1 && error.failedText === 'missing' && Array.isArray(error.completed) && error.completed.length === 1 && error.cause, JSON.stringify(error));
    });
  });

  test({ name: 'UI waits with fresh polling captures until text appears or disappears', tier: 'unit', covers: ['UI.waitText', 'UI.waitTextGone'] }, async () => {
    await withStubs({
      runOCR: function (_, index) {
        return { provider: 'fixture', lines: index === 0 ? [] : [{ text: '完成', confidence: 1, bbox: { x: 100, y: 100, width: 100, height: 40 } }] };
      },
    }, async function (records) {
      const target = await UI.waitText('完成', { within: windowInfo(), timeout: 50, polling: 1 });
      assert(target && target.text === '完成' && records.screenshots.length === 2, JSON.stringify({ target: target, calls: records.screenshots.length }));
    });

    await withStubs({
      runOCR: function (_, index) {
        return { provider: 'fixture', lines: index === 0 ? [{ text: '完成', confidence: 1, bbox: { x: 100, y: 100, width: 100, height: 40 } }] : [] };
      },
    }, async function (records) {
      equal(await UI.waitTextGone('完成', { within: windowInfo(), timeout: 50, polling: 1 }), true, 'waitTextGone result');
      equal(records.screenshots.length, 2, 'waitTextGone requires fresh captures');
    });
  });

  test({ name: 'UI image search and tap project template bboxes without legacy centerX/centerY', tier: 'unit', covers: ['UI.findImages', 'UI.findImage', 'UI.tapImage'] }, async () => {
    await withStubs({
      findImages: function () { return [{ found: true, confidence: 0.99, scale: 1, x: 125, y: 125, width: 250, height: 50, centerX: 2500, centerY: 2500 }]; },
    }, async function (records) {
      const matches = await UI.findImages('template.png', { within: windowInfo(), threshold: 0.9 });
      assert(matches.length === 1 && matches[0].bounds.x === 200 && matches[0].bounds.y === 300 && matches[0].center.x === 300 && matches[0].center.y === 320, JSON.stringify(matches));
      const unique = await UI.findImage('template.png', { within: windowInfo() });
      assert(unique && unique.center.x === 300 && unique.center.y === 320, JSON.stringify(unique));
      const result = await UI.tapImage('template.png', { within: windowInfo() });
      assert(result.ok && records.clicks.length === 1 && records.clicks[0].x === 300 && records.clicks[0].y === 320, JSON.stringify({ result: result, clicks: records.clicks }));
    });

    await withStubs({
      findImages: function () {
        return [
          { found: true, confidence: 0.99, scale: 1, x: 125, y: 125, width: 100, height: 50 },
          { found: true, confidence: 0.98, scale: 1, x: 500, y: 125, width: 100, height: 50 },
        ];
      },
    }, async function () {
      const ambiguous = await expectCode(() => UI.findImage('template.png', { within: windowInfo() }), 'AMBIGUOUS_TARGET', 'UI.findImage');
      equal(ambiguous.candidateCount, 2, 'image ambiguity candidate count');
      const indexed = await UI.findImage('template.png', { within: windowInfo(), index: 1 });
      assert(indexed && indexed.bounds.x === 500, JSON.stringify(indexed));
      await expectCode(() => UI.findImage('template.png', { within: windowInfo(), index: 2 }), 'TARGET_NOT_FOUND', 'UI.findImage');
    });
  });

  test({ name: 'UI detects stale window identity and retries exactly once after a window move or resize', tier: 'unit', covers: ['UI.tapText'] }, async () => {
    const initial = windowInfo();
    const replacement = windowInfo({ id: 'darwin:43:native:100', pid: 43, processId: 43, handle: 100, title: 'Other' });
    await withStubs({
      getActiveWindow: async function () { return initial; },
      runOCR: function () { return { provider: 'fixture', lines: [{ text: '确定', confidence: 1, bbox: { x: 125, y: 125, width: 250, height: 50 } }] }; },
    }, async function (records) {
      // Switch the active window only after the discovery capture has completed.
      globalThis.window.getActiveWindow = async function () { return records.screenshots.length === 0 ? initial : replacement; };
      await expectCode(() => UI.tapText('确定'), 'STALE_TARGET', 'UI.tapText');
      equal(records.clicks.length, 0, 'stale target must not send input');
    });

    const moved = windowInfo({ x: 300, y: 400, width: 600, height: 500 });
    let reads = 0;
    await withStubs({
      getActiveWindow: async function () {
        reads += 1;
        return reads === 1 ? initial : moved;
      },
      getSize: function () { return [1000, 750]; },
      runOCR: function () { return { provider: 'fixture', lines: [{ text: '确定', confidence: 1, bbox: { x: 125, y: 125, width: 250, height: 50 } }] }; },
    }, async function (records) {
      const result = await UI.tapText('确定');
      assert(result.ok === true && records.screenshots.length === 2, JSON.stringify({ result: result, screenshots: records.screenshots }));
      assert(records.screenshots[0].clip.x === 100 && records.screenshots[0].clip.width === 800, JSON.stringify(records.screenshots));
      assert(records.screenshots[1].clip.x === 300 && records.screenshots[1].clip.width === 600, JSON.stringify(records.screenshots));
      equal(records.clicks.length, 1, 'only the refreshed target can be clicked');
    });
  });
})();
