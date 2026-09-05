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

  function region(x, y, width, height) {
    return { x: x, y: y, width: width, height: height, coordinateSpace: 'screen' };
  }

  function unitCaptureSize(_, index, records) {
    const clip = records.screenshots[index].clip;
    return [clip.width, clip.height];
  }

  function screenLine(text, bounds, index, records, confidence = 1) {
    const clip = records.screenshots[index].clip;
    return {
      text: text,
      confidence: confidence,
      bbox: {
        x: bounds.x - clip.x,
        y: bounds.y - clip.y,
        width: bounds.width,
        height: bounds.height,
      },
    };
  }

  function scaledScreenLine(text, bounds, index, records, scaleX, scaleY, confidence = 1) {
    const clip = records.screenshots[index].clip;
    return {
      text: text,
      confidence: confidence,
      bbox: {
        x: (bounds.x - clip.x) * scaleX,
        y: (bounds.y - clip.y) * scaleY,
        width: bounds.width * scaleX,
        height: bounds.height * scaleY,
      },
    };
  }

  function assertObservationCounts(records, screenshots, ocrRequests, clicks, message) {
    const prefix = message ? message + ': ' : '';
    equal(records.screenshots.length, screenshots, prefix + 'screenshot count');
    equal(records.ocrRequests.length, ocrRequests, prefix + 'OCR count');
    equal(records.clicks.length, clicks, prefix + 'click count');
    equal(records.screenshots.length, records.ocrRequests.length, prefix + 'each capture must have exactly one OCR request');
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
    const records = {
      screenshots: [], clicks: [], ocrRequests: [], imageRequests: [], waits: [],
      windowReads: [], events: [],
    };
    let screenshotIndex = 0;
    const currentWindow = async function () {
      const index = records.windowReads.length;
      records.events.push({ type: 'window', index: index });
      try {
        const value = options.getActiveWindow
          ? await options.getActiveWindow(index, records)
          : (options.window || windowInfo());
        records.windowReads.push(value);
        return value;
      } catch (error) {
        records.windowReads.push({ error: String(error && error.message ? error.message : error) });
        throw error;
      }
    };
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
        records.events.push({ type: 'screenshot', index: index, request: request });
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
        records.events.push({ type: 'ocr', index: index, request: request });
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
        records.events.push({ type: 'image', index: index, request: request });
        return options.findImages ? options.findImages(image, template, request, index, records) : [];
      },
    };
    globalThis.mouse = {
      click: function (x, y, clickOptions) {
        const click = { x: x, y: y, options: clickOptions };
        records.clicks.push(click);
        records.events.push({ type: 'click', index: records.clicks.length - 1, click: click });
        if (options.onClick) return options.onClick(x, y, clickOptions, records.clicks.length - 1, records);
      },
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

  test({ name: 'UI relative text direction filters all four directions with inclusive gap and overlap boundaries', tier: 'unit', covers: ['UI.findTexts'] }, async () => {
    const anchor = region(400, 400, 80, 40);
    const cases = [
      {
        direction: 'right',
        passing: region(500, 420, 60, 40),
        tooFar: region(501, 420, 60, 40),
        lowOverlap: region(500, 421, 60, 40),
        wrongSide: region(470, 400, 60, 40),
      },
      {
        direction: 'left',
        passing: region(300, 420, 80, 40),
        tooFar: region(299, 420, 80, 40),
        lowOverlap: region(300, 421, 80, 40),
        wrongSide: region(410, 400, 80, 40),
      },
      {
        direction: 'above',
        passing: region(440, 320, 80, 60),
        tooFar: region(440, 319, 80, 60),
        lowOverlap: region(441, 320, 80, 60),
        wrongSide: region(400, 390, 80, 60),
      },
      {
        direction: 'below',
        passing: region(440, 460, 80, 60),
        tooFar: region(440, 461, 80, 60),
        lowOverlap: region(441, 460, 80, 60),
        wrongSide: region(400, 430, 80, 60),
      },
    ];

    for (const item of cases) {
      await withStubs({
        getSize: unitCaptureSize,
        runOCR: function (_, index, records) {
          return {
            provider: 'fixture',
            lines: [
              screenLine('联系人 A', anchor, index, records),
              screenLine('编辑', item.tooFar, index, records, 0.99),
              screenLine('编辑', item.lowOverlap, index, records, 0.98),
              screenLine('编辑', item.wrongSide, index, records, 0.97),
              screenLine('编辑', item.passing, index, records, 0.4),
            ],
          };
        },
      }, async function (records) {
        const matches = await UI.findTexts('编辑', {
          within: windowInfo(),
          relativeTo: { text: '联系人 A', direction: item.direction, maxGap: 20, minOverlap: 0.5 },
        });
        equal(matches.length, 1, item.direction + ' must keep only the inclusive-boundary candidate');
        equal(matches[0].bounds.x, item.passing.x, item.direction + ' candidate x');
        equal(matches[0].bounds.y, item.passing.y, item.direction + ' candidate y');
        assertObservationCounts(records, 1, 1, 0, item.direction);
        equal(records.windowReads.length, 2, item.direction + ' must check the window before and after recognition');
      });
    }

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', anchor, index, records),
          screenLine('编辑', region(480, 400, 40, 40), index, records),
        ] };
      },
    }, async function (records) {
      const match = await UI.findText('编辑', {
        within: windowInfo(),
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 0 },
      });
      assert(match && match.bounds.x === 480, JSON.stringify(match));
      assertObservationCounts(records, 1, 1, 0, 'zero-gap edge contact');
    });
  });

  test({ name: 'UI relative spatial predicates use continuous logical bboxes before public bounds rounding', tier: 'unit', covers: ['UI.findTexts'] }, async () => {
    const win = windowInfo({ x: 10.25, y: 5.25, width: 79.5, height: 29.5 });
    const fractionalCaptureSize = function () { return [120, 45]; };

    await withStubs({
      window: win,
      getSize: fractionalCaptureSize,
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '联系人 A', confidence: 1, bbox: { x: 15, y: 15, width: 30, height: 15 } },
          { text: '编辑', confidence: 1, bbox: { x: 46, y: 15, width: 15, height: 15 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: win,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 0 },
      });
      equal(matches.length, 0, 'a positive fractional gap must not be rounded down to zero');
      assertObservationCounts(records, 1, 1, 0, 'fractional positive gap');
    });

    await withStubs({
      window: win,
      getSize: fractionalCaptureSize,
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '联系人 A', confidence: 1, bbox: { x: 15, y: 15, width: 31, height: 15 } },
          { text: '编辑', confidence: 1, bbox: { x: 46, y: 15, width: 15, height: 15 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: win,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 0 },
      });
      equal(matches.length, 1, 'exact fractional edge contact must remain inclusive');
      assertObservationCounts(records, 1, 1, 0, 'fractional edge contact');
    });

    const edgeWin = windowInfo({ x: 10, y: 5, width: 100, height: 40 });
    await withStubs({
      window: edgeWin,
      getSize: function () { return [110, 44]; },
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '联系人 A', confidence: 1, bbox: { x: 1, y: 5, width: 15, height: 11 } },
          { text: '编辑', confidence: 1, bbox: { x: 16, y: 5, width: 11, height: 11 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: edgeWin,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 0 },
      });
      equal(matches.length, 1, 'shared raw OCR edges must stay equal at a non-terminating capture scale');
      assertObservationCounts(records, 1, 1, 0, 'non-terminating scale edge contact');
    });

    await withStubs({
      window: edgeWin,
      getSize: function () { return [110, 44]; },
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '联系人 A', confidence: 1, bbox: { x: 1, y: 1, width: 15, height: 14 } },
          { text: '编辑', confidence: 1, bbox: { x: 16, y: 8, width: 11, height: 14 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: edgeWin,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 0, minOverlap: 0.5 },
      });
      equal(matches.length, 1, 'an exact fractional minOverlap boundary must remain inclusive');
      assertObservationCounts(records, 1, 1, 0, 'non-terminating scale overlap boundary');
    });

    const decimalWin = windowInfo({ x: 0, y: 0, width: 200, height: 40 });
    await withStubs({
      window: decimalWin,
      getSize: function () { return [200, 40]; },
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '联系人 A', confidence: 1, bbox: { x: 100.1, y: 5, width: 15.3, height: 10 } },
          { text: '编辑', confidence: 1, bbox: { x: 115.4, y: 5, width: 20, height: 10 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: decimalWin,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 0 },
      });
      equal(matches.length, 1, 'decimal OCR edges equal within floating representation must remain inclusive');
      assertObservationCounts(records, 1, 1, 0, 'decimal edge contact');
    });

    await withStubs({
      window: win,
      getSize: fractionalCaptureSize,
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '确定', confidence: 1, bbox: { x: 1, y: 1, width: 15, height: 9 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('确定', {
        within: win,
        region: function (currentWin) {
          return region(currentWin.x, currentWin.y, currentWin.width, currentWin.height);
        },
      });
      equal(matches.length, 1, 'a continuous bbox fully inside a fractional outer region must remain eligible');
      assert(matches[0].bounds.x === 10 && matches[0].bounds.y === 5, JSON.stringify(matches[0]));
      assertObservationCounts(records, 1, 1, 0, 'fractional outer containment');
    });

    await withStubs({
      window: win,
      getSize: fractionalCaptureSize,
      runOCR: function () {
        return { provider: 'fixture', lines: [
          { text: '联系人 A', confidence: 1, bbox: { x: 15, y: 15, width: 30, height: 15 } },
          { text: '编辑', confidence: 1, bbox: { x: 46, y: 15, width: 15, height: 15 } },
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: win,
        relativeTo: {
          text: '联系人 A',
          region: function (anchor) {
            assert(anchor.bounds.x === 20 && anchor.bounds.y === 15 && anchor.bounds.width === 20, JSON.stringify(anchor));
            return region(40.5, 14.5, 11, 11);
          },
        },
      });
      equal(matches.length, 1, 'a continuous bbox fully inside a fractional relative region must remain eligible');
      assertObservationCounts(records, 1, 1, 0, 'fractional relative containment');
    });
  });

  test({ name: 'UI relative text rectangles require full containment and cannot expand the outer search region', tier: 'unit', covers: ['UI.findTexts', 'UI.findText', 'UI.tapText'] }, async () => {
    const win = windowInfo();
    const winBeforeCallbacks = JSON.stringify(win);
    const anchorBounds = region(300, 400, 80, 30);
    let outerCalls = 0;
    let relativeCalls = 0;
    let callbackAnchor = null;
    await withStubs({
      window: win,
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', anchorBounds, index, records),
          screenLine('编辑', region(388, 395, 240, 40), index, records, 0.5),
          screenLine('编辑', region(387, 400, 20, 20), index, records, 0.99),
          screenLine('编辑', region(616, 400, 20, 20), index, records, 0.98),
          screenLine('编辑', region(400, 394, 20, 20), index, records, 0.97),
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: win,
        region: function (currentWin) {
          outerCalls += 1;
          records.events.push({ type: 'region', index: outerCalls - 1 });
          assert(currentWin !== win, 'region callback must receive a fresh protected window snapshot');
          assert(Object.isFrozen(currentWin), 'region callback window snapshot must be protected');
          return region(250, 300, 500, 300);
        },
        relativeTo: {
          text: '联系人 A',
          region: function (anchor) {
            relativeCalls += 1;
            callbackAnchor = anchor;
            records.events.push({ type: 'relative-region', index: relativeCalls - 1 });
            assert(Object.isFrozen(anchor) && Object.isFrozen(anchor.bounds), 'relative callback anchor must be protected');
            return Geometry.regionOffset(anchor.bounds, {
              left: anchor.bounds.width + 8,
              top: -5,
              width: 240,
              height: anchor.bounds.height + 10,
            });
          },
        },
      });
      equal(matches.length, 1, 'only the fully contained target should remain');
      assert(matches[0].bounds.x === 388 && matches[0].bounds.y === 395 && matches[0].bounds.width === 240, JSON.stringify(matches));
      assert(callbackAnchor && callbackAnchor.text === '联系人 A' && callbackAnchor.bounds.coordinateSpace === 'screen', JSON.stringify(callbackAnchor));
      equal(outerCalls, 1, 'outer region rule must run once per observation');
      equal(relativeCalls, 1, 'relative region rule must run once per observation');
      equal(JSON.stringify(win), winBeforeCallbacks, 'callbacks must not mutate the caller-owned window snapshot');
      assert(records.screenshots[0].clip.x === 250 && records.screenshots[0].clip.y === 300 && records.screenshots[0].clip.width === 500 && records.screenshots[0].clip.height === 300, JSON.stringify(records.screenshots[0]));
      assertObservationCounts(records, 1, 1, 0, 'rectangle containment');
      assert(records.events.map(function (event) { return event.type; }).join(',') === 'window,region,screenshot,ocr,relative-region,window', JSON.stringify(records.events));
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', anchorBounds, index, records),
          screenLine('编辑', region(700, 400, 30, 20), index, records),
        ] };
      },
    }, async function (records) {
      const error = await expectCode(() => UI.tapText('编辑', {
        within: win,
        region: region(250, 300, 500, 300),
        relativeTo: { text: '联系人 A', region: function () { return region(760, 400, 50, 50); } },
      }), 'TARGET_NOT_FOUND', 'UI.tapText');
      assert(!error.stage || error.stage === 'target', JSON.stringify(error));
      assertObservationCounts(records, 1, 1, 0, 'empty inner/outer intersection');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('联系人 A', anchorBounds, index, records)] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('联系人 A', {
        within: win,
        relativeTo: { text: '联系人 A', region: function (anchor) { return anchor.bounds; } },
      });
      equal(matches.length, 0, 'the OCR line used as anchor must not also be a target');
      assertObservationCounts(records, 1, 1, 0, 'anchor row exclusion');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('联系人 A 编辑', region(300, 400, 150, 30), index, records),
        ] };
      },
    }, async function (records) {
      const target = await UI.findText('编辑', {
        within: win,
        match: 'contains',
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 240 },
      });
      equal(target, null, 'one merged OCR line must not be split into an inferred anchor and button bbox');
      assertObservationCounts(records, 1, 1, 0, 'merged OCR line');
      equal(records.windowReads.length, 2, 'merged OCR line observation freshness reads');
    });

    await withStubs({}, async function (records) {
      await expectCode(() => UI.findText('编辑', {
        within: win,
        region: function () { return region(1000, 900, 100, 100); },
      }), 'TARGET_SCOPE_NOT_VISIBLE', 'UI.findText');
      equal(records.windowReads.length, 1, 'empty outer scope is rejected after the initial identity read');
      assertObservationCounts(records, 0, 0, 0, 'empty outer/window intersection');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('确定', region(120, 220, 40, 20), index, records)] };
      },
    }, async function (records) {
      const target = await UI.findText('确定', {
        within: win,
        region: function () { return region(50, 150, 200, 200); },
      });
      assert(target && target.bounds.x === 120 && target.bounds.y === 220, JSON.stringify(target));
      const clip = records.screenshots[0].clip;
      assert(clip.x === 100 && clip.y === 200 && clip.width === 150 && clip.height === 150, JSON.stringify(clip));
      assertObservationCounts(records, 1, 1, 0, 'outer region/window intersection');
    });
  });

  test({ name: 'UI relative text anchor absence and ambiguity preserve each public method contract', tier: 'unit', covers: ['UI.findTexts', 'UI.findText', 'UI.hasText', 'UI.tapText', 'UI.tapTexts'] }, async () => {
    const win = windowInfo();
    const positioned = { within: win, relativeTo: { text: '联系人 A', direction: 'right', maxGap: 240 } };
    const missingCases = [
      {
        operation: 'UI.findTexts',
        invoke: function () { return UI.findTexts('编辑', positioned); },
        verify: function (value) { assert(Array.isArray(value) && value.length === 0, JSON.stringify(value)); },
      },
      {
        operation: 'UI.findText',
        invoke: function () { return UI.findText('编辑', positioned); },
        verify: function (value) { equal(value, null, 'missing anchor findText result'); },
      },
      {
        operation: 'UI.hasText',
        invoke: function () { return UI.hasText('编辑', positioned); },
        verify: function (value) { equal(value, false, 'missing anchor hasText result'); },
      },
    ];
    for (const item of missingCases) {
      await withStubs({
        getSize: unitCaptureSize,
        runOCR: function (_, index, records) {
          return { provider: 'fixture', lines: [screenLine('编辑', region(500, 400, 50, 30), index, records)] };
        },
      }, async function (records) {
        item.verify(await item.invoke());
        assertObservationCounts(records, 1, 1, 0, item.operation + ' missing anchor');
        equal(records.windowReads.length, 2, item.operation + ' missing anchor freshness reads');
      });
    }

    let missingAnchorRegionCalls = 0;
    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('编辑', region(500, 400, 50, 30), index, records)] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: win,
        relativeTo: {
          text: '联系人 A',
          region: function () {
            missingAnchorRegionCalls += 1;
            return region(400, 350, 200, 100);
          },
        },
      });
      equal(matches.length, 0, 'missing rectangular anchor result');
      equal(missingAnchorRegionCalls, 0, 'relative region callback must not run without a unique anchor');
      assertObservationCounts(records, 1, 1, 0, 'missing rectangular anchor');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('编辑', region(500, 400, 50, 30), index, records)] };
      },
    }, async function (records) {
      const error = await expectCode(() => UI.tapText('编辑', positioned), 'TARGET_NOT_FOUND', 'UI.tapText');
      equal(error.stage, 'anchor', JSON.stringify(error));
      assertObservationCounts(records, 1, 1, 0, 'tapText missing anchor');
      equal(records.windowReads.length, 2, 'tapText missing anchor freshness reads');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('编辑', region(500, 400, 50, 30), index, records)] };
      },
    }, async function (records) {
      const error = await expectCode(() => UI.tapTexts(['编辑'], positioned), 'TARGET_NOT_FOUND', 'UI.tapTexts');
      assert(error.failedIndex === 0 && error.failedText === '编辑' && error.completed.length === 0, JSON.stringify(error));
      equal(error.stage, 'anchor', JSON.stringify(error));
      equal(error.cause && error.cause.stage, 'anchor', JSON.stringify(error));
      assertObservationCounts(records, 1, 1, 0, 'tapTexts missing anchor');
      equal(records.windowReads.length, 2, 'tapTexts missing anchor freshness reads');
    });

    const ambiguousInvocations = [
      { operation: 'UI.findTexts', invoke: function () { return UI.findTexts('编辑', { ...positioned, index: 0 }); } },
      { operation: 'UI.findText', invoke: function () { return UI.findText('编辑', { ...positioned, index: 0 }); } },
      { operation: 'UI.hasText', invoke: function () { return UI.hasText('编辑', { ...positioned, index: 0 }); } },
      { operation: 'UI.tapText', invoke: function () { return UI.tapText('编辑', { ...positioned, index: 0 }); } },
      { operation: 'UI.tapTexts', invoke: function () { return UI.tapTexts(['编辑'], { ...positioned, index: 0 }); } },
    ];
    for (const item of ambiguousInvocations) {
      await withStubs({
        getSize: unitCaptureSize,
        runOCR: function (_, index, records) {
          return { provider: 'fixture', lines: [
            screenLine('联系人 A', region(300, 380, 80, 30), index, records),
            screenLine('联系人 A', region(300, 440, 80, 30), index, records),
            screenLine('编辑', region(500, 400, 50, 30), index, records),
          ] };
        },
      }, async function (records) {
        const error = await expectCode(item.invoke, 'AMBIGUOUS_TARGET', item.operation);
        const anchorError = item.operation === 'UI.tapTexts' ? error.cause : error;
        equal(error.stage, 'anchor', JSON.stringify(error));
        equal(error.candidateCount, 2, JSON.stringify(error));
        assert(Array.isArray(error.candidates) && error.candidates.length === 2, JSON.stringify(error));
        equal(anchorError && anchorError.stage, 'anchor', JSON.stringify(error));
        equal(anchorError && anchorError.candidateCount, 2, JSON.stringify(error));
        assertObservationCounts(records, 1, 1, 0, item.operation + ' ambiguous anchor');
        equal(records.windowReads.length, 2, item.operation + ' ambiguous anchor freshness reads');
      });
    }
  });

  test({ name: 'UI relative text target disambiguation and index operate after same-frame relationship filtering', tier: 'unit', covers: ['UI.findTexts', 'UI.findText', 'UI.hasText', 'UI.tapText'] }, async () => {
    const win = windowInfo();
    const options = { within: win, relativeTo: { text: '联系人 A', direction: 'right', maxGap: 240 } };
    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (request, index, records) {
        equal(request.image, 'fixture-shot-' + index, 'OCR must consume the current capture');
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', region(400, 400, 80, 30), index, records),
          screenLine('编辑', region(300, 400, 50, 30), index, records, 1),
          screenLine('编辑', region(500, 400, 50, 30), index, records, 0.4),
          screenLine('编辑', region(600, 400, 50, 30), index, records, 0.99),
        ] };
      },
    }, async function (records) {
      const all = await UI.findTexts('编辑', options);
      assert(all.length === 2 && all[0].bounds.x === 500 && all[1].bounds.x === 600, JSON.stringify(all));
      equal(await UI.hasText('编辑', options), true, 'hasText must accept multiple filtered targets');
      const ambiguous = await expectCode(() => UI.findText('编辑', options), 'AMBIGUOUS_TARGET', 'UI.findText');
      equal(ambiguous.candidateCount, 2, JSON.stringify(ambiguous));
      assert(ambiguous.candidates.every(function (candidate) { return candidate.bounds.x >= 500; }), JSON.stringify(ambiguous.candidates));
      const tapAmbiguous = await expectCode(() => UI.tapText('编辑', options), 'AMBIGUOUS_TARGET', 'UI.tapText');
      equal(tapAmbiguous.candidateCount, 2, JSON.stringify(tapAmbiguous));
      equal(records.clicks.length, 0, 'ambiguous relationship targets must not send input');
      const indexed = await UI.findText('编辑', { ...options, index: 1 });
      assert(indexed && indexed.bounds.x === 600, JSON.stringify(indexed));
      const tapped = await UI.tapText('编辑', { ...options, index: 0 });
      assert(tapped.ok === true && tapped.target.bounds.x === 500, JSON.stringify(tapped));
      assertObservationCounts(records, 6, 6, 1, 'relationship-filtered disambiguation');
      assert(records.ocrRequests.every(function (request, index) { return request.image === 'fixture-shot-' + index; }), JSON.stringify(records.ocrRequests));
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('联系人 A archived', region(400, 400, 140, 30), index, records),
          screenLine('编辑按钮', region(560, 400, 70, 30), index, records),
        ] };
      },
    }, async function (records) {
      const result = await UI.findText('编辑', {
        within: win,
        match: 'contains',
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 100 },
      });
      equal(result, null, 'top-level contains must not be inherited by the exact anchor');
      assertObservationCounts(records, 1, 1, 0, 'exact anchor matching');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('  联系人   a  ', region(400, 400, 80, 30), index, records, 0.8),
          screenLine('编辑', region(500, 400, 50, 30), index, records, 0.9),
        ] };
      },
    }, async function (records) {
      const result = await UI.findText('编辑', {
        within: win,
        minConfidence: 0.75,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
      });
      assert(result && result.bounds.x === 500, JSON.stringify(result));
      assertObservationCounts(records, 1, 1, 0, 'anchor normalization and confidence');
    });

    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('联系人 A', region(400, 400, 80, 30), index, records)] };
      },
    }, async function (records) {
      equal(await UI.findText('编辑', options), null, 'missing filtered target without index');
      await expectCode(() => UI.findText('编辑', { ...options, index: 0 }), 'TARGET_NOT_FOUND', 'UI.findText');
      assertObservationCounts(records, 2, 2, 0, 'missing target index behavior');
    });
  });

  test({ name: 'UI dynamic regions use the latest same-window bounds and retry an empty old observation exactly once', tier: 'unit', covers: ['UI.findText', 'UI.tapText'] }, async () => {
    const initial = windowInfo();
    const moved = windowInfo({ x: 300, y: 250, width: 600, height: 500 });
    const ruleArguments = [];
    await withStubs({
      getActiveWindow: async function () { return moved; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('确定', region(350, 300, 50, 30), index, records)] };
      },
    }, async function (records) {
      const target = await UI.findText('确定', {
        within: initial,
        region: function (currentWin) {
          ruleArguments.push(currentWin);
          return Geometry.inset(currentWin, 10);
        },
      });
      assert(target && target.bounds.x === 350 && target.bounds.y === 300, JSON.stringify(target));
      equal(ruleArguments.length, 1, 'dynamic region must run once for the observation');
      assert(ruleArguments[0].x === 300 && ruleArguments[0].width === 600, JSON.stringify(ruleArguments[0]));
      assert(records.screenshots[0].clip.x === 310 && records.screenshots[0].clip.y === 260 && records.screenshots[0].clip.width === 580 && records.screenshots[0].clip.height === 480, JSON.stringify(records.screenshots));
      equal(records.windowReads.length, 2, 'stable latest-window observation must read before and after OCR');
      assertObservationCounts(records, 1, 1, 0, 'already moved dynamic region');
    });

    let current = initial;
    let retryRuleCalls = 0;
    await withStubs({
      getActiveWindow: async function () { return current; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        if (index === 0) {
          current = moved;
          return { provider: 'fixture', lines: [] };
        }
        return { provider: 'fixture', lines: [screenLine('确定', region(350, 300, 50, 30), index, records)] };
      },
    }, async function (records) {
      const result = await UI.tapText('确定', {
        within: initial,
        region: function (currentWin) {
          retryRuleCalls += 1;
          return Geometry.inset(currentWin, 10);
        },
      });
      assert(result.ok === true && result.point.x === 375 && result.point.y === 315, JSON.stringify(result));
      equal(retryRuleCalls, 2, 'dynamic rule must be recomputed for the one retry');
      equal(records.windowReads.length, 3, 'the first post-check snapshot must own the single retry');
      assert(records.screenshots[0].clip.x === 110 && records.screenshots[1].clip.x === 310, JSON.stringify(records.screenshots));
      assertObservationCounts(records, 2, 2, 1, 'old empty observation retry');
    });

    current = initial;
    await withStubs({
      getActiveWindow: async function () { return current; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        if (index === 0) {
          current = moved;
          return { provider: 'fixture', lines: [
            screenLine('联系人 A', region(300, 350, 80, 30), index, records),
            screenLine('编辑', region(400, 350, 50, 30), index, records),
          ] };
        }
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', region(500, 450, 80, 30), index, records),
          screenLine('编辑', region(600, 450, 50, 30), index, records),
        ] };
      },
    }, async function (records) {
      const result = await UI.tapText('编辑', {
        within: initial,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
      });
      assert(result.ok === true && result.target.bounds.x === 600, JSON.stringify(result));
      equal(records.windowReads.length, 3, 'relativeTo-only retry must reuse the moved post-check owner');
      assert(records.screenshots[0].clip.x === 100 && records.screenshots[1].clip.x === 300, JSON.stringify(records.screenshots));
      assertObservationCounts(records, 2, 2, 1, 'relativeTo-only move retry');
    });

    current = initial;
    let relativeRegionCalls = 0;
    await withStubs({
      getActiveWindow: async function () { return current; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        const anchorBounds = index === 0 ? region(300, 350, 80, 30) : region(500, 450, 80, 30);
        const targetBounds = index === 0 ? region(400, 350, 50, 30) : region(600, 450, 50, 30);
        if (index === 0) current = moved;
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', anchorBounds, index, records),
          screenLine('编辑', targetBounds, index, records),
        ] };
      },
    }, async function (records) {
      const result = await UI.tapText('编辑', {
        within: initial,
        relativeTo: {
          text: '联系人 A',
          region: function (anchor) {
            relativeRegionCalls += 1;
            return Geometry.regionOffset(anchor.bounds, {
              left: anchor.bounds.width,
              top: 0,
              width: 100,
              height: anchor.bounds.height,
            });
          },
        },
      });
      assert(result.ok === true && result.target.bounds.x === 600, JSON.stringify(result));
      equal(relativeRegionCalls, 2, 'relative rectangle rule must be recomputed from each retry frame anchor');
      equal(records.windowReads.length, 3, 'relative rectangle retry must reuse the moved post-check owner');
      assertObservationCounts(records, 2, 2, 1, 'relative rectangle move retry');
    });

    const resized = windowInfo({ width: 1000, height: 700 });
    current = initial;
    let resizeCalls = 0;
    await withStubs({
      getActiveWindow: async function () { return current; },
      virtual: { x: 0, y: 0, width: 1400, height: 1000 },
      displays: [displayInfo({ width: 1400, height: 1000, pixelWidth: 1400, pixelHeight: 1000 })],
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        if (index === 0) current = resized;
        const bounds = index === 0 ? region(700, 700, 50, 30) : region(900, 800, 50, 30);
        return { provider: 'fixture', lines: [screenLine('确定', bounds, index, records)] };
      },
    }, async function (records) {
      const target = await UI.findText('确定', {
        within: initial,
        region: function (currentWin) {
          resizeCalls += 1;
          return Geometry.regionByEdges(currentWin, { right: 10, width: 200, bottom: 10, height: 100 });
        },
      });
      assert(target && target.bounds.x === 900 && target.bounds.y === 800, JSON.stringify(target));
      equal(resizeCalls, 2, 'resize must recompute the region');
      equal(records.windowReads.length, 3, 'the resized post-check snapshot must own the single retry');
      assert(records.screenshots[0].clip.x === 690 && records.screenshots[0].clip.y === 690, JSON.stringify(records.screenshots[0]));
      assert(records.screenshots[1].clip.x === 890 && records.screenshots[1].clip.y === 790, JSON.stringify(records.screenshots[1]));
      assertObservationCounts(records, 2, 2, 0, 'resize retry');
    });
  });

  test({ name: 'UI static regions and repeated window changes fail closed without stale input', tier: 'unit', covers: ['UI.findText', 'UI.tapText'] }, async () => {
    const initial = windowInfo();
    const moved1 = windowInfo({ x: 250, y: 260 });
    const moved2 = windowInfo({ x: 400, y: 300 });
    const fixed = Geometry.inset(initial, 10);

    await withStubs({ getActiveWindow: async function () { return moved1; } }, async function (records) {
      await expectCode(() => UI.tapText('确定', { within: initial, region: fixed }), 'STALE_TARGET', 'UI.tapText');
      equal(records.windowReads.length, 1, 'static stale check before capture');
      assertObservationCounts(records, 0, 0, 0, 'already moved static region');
    });

    let current = initial;
    await withStubs({
      getActiveWindow: async function () { return current; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        current = moved1;
        return { provider: 'fixture', lines: [screenLine('确定', region(200, 300, 50, 30), index, records)] };
      },
    }, async function (records) {
      await expectCode(() => UI.tapText('确定', { within: initial, region: fixed }), 'STALE_TARGET', 'UI.tapText');
      equal(records.windowReads.length, 2, 'static region must be checked after OCR');
      assertObservationCounts(records, 1, 1, 0, 'static region moved during OCR');
    });

    current = initial;
    let dynamicCalls = 0;
    await withStubs({
      getActiveWindow: async function () { return current; },
      virtual: { x: 0, y: 0, width: 1600, height: 1200 },
      displays: [displayInfo({ width: 1600, height: 1200, pixelWidth: 1600, pixelHeight: 1200 })],
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        const targetBounds = index === 0 ? region(200, 300, 50, 30) : region(350, 360, 50, 30);
        current = index === 0 ? moved1 : moved2;
        return { provider: 'fixture', lines: [screenLine('确定', targetBounds, index, records)] };
      },
    }, async function (records) {
      await expectCode(() => UI.tapText('确定', {
        within: initial,
        region: function (currentWin) {
          dynamicCalls += 1;
          return Geometry.inset(currentWin, 10);
        },
      }), 'STALE_TARGET', 'UI.tapText');
      equal(dynamicCalls, 2, 'persistent motion must stop after one retry');
      equal(records.windowReads.length, 3, 'A to B retry followed by B to C must stop at the second post-check');
      assertObservationCounts(records, 2, 2, 0, 'persistent window motion');
    });

    const replacement = windowInfo({ id: 'darwin:42:native:100', handle: 100 });
    current = initial;
    await withStubs({
      getActiveWindow: async function () { return current; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        current = replacement;
        return { provider: 'fixture', lines: [screenLine('确定', region(200, 300, 50, 30), index, records)] };
      },
    }, async function (records) {
      await expectCode(() => UI.tapText('确定', {
        within: initial,
        region: function (currentWin) { return Geometry.inset(currentWin, 10); },
      }), 'STALE_TARGET', 'UI.tapText');
      equal(records.windowReads.length, 2, 'identity switch must be detected after OCR');
      assertObservationCounts(records, 1, 1, 0, 'same-title same-PID replacement window');
    });

    await withStubs({ getActiveWindow: async function () { return null; } }, async function (records) {
      await expectCode(() => UI.findText('确定', {
        within: initial,
        region: function (currentWin) { return Geometry.inset(currentWin, 10); },
      }), 'STALE_TARGET', 'UI.findText');
      equal(records.windowReads.length, 1, 'unavailable identity read count');
      assertObservationCounts(records, 0, 0, 0, 'unavailable current window');
    });

    await withStubs({
      getActiveWindow: async function () { return windowInfo({ id: 'darwin:42:unresolved', handle: 0 }); },
    }, async function (records) {
      await expectCode(() => UI.tapText('确定', {
        within: initial,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
      }), 'STALE_TARGET', 'UI.tapText');
      equal(records.windowReads.length, 1, 'unresolved current identity read count');
      assertObservationCounts(records, 0, 0, 0, 'unresolved current window identity');
    });
  });

  test({ name: 'UI.tapTexts recomputes relative targets per step and never redoes a completed input', tier: 'unit', covers: ['UI.tapTexts'] }, async () => {
    const win = windowInfo();
    const movedBetweenSteps = windowInfo({ x: 250, y: 300, width: 650, height: 450 });
    let current = win;
    let regionCalls = 0;
    await withStubs({
      getActiveWindow: async function () { return current; },
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        const anchorBounds = index === 0 ? region(300, 350, 80, 30) : region(450, 500, 80, 30);
        const targetBounds = index === 0 ? region(400, 350, 50, 30) : region(550, 500, 50, 30);
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', anchorBounds, index, records),
          screenLine(index === 0 ? '编辑' : '保存', targetBounds, index, records),
        ] };
      },
      onClick: function (_, __, ___, clickIndex) {
        if (clickIndex === 0) current = movedBetweenSteps;
      },
    }, async function (records) {
      const result = await UI.tapTexts(['编辑', '保存'], {
        within: win,
        region: function (currentWin) {
          regionCalls += 1;
          return Geometry.inset(currentWin, 10);
        },
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
        intervalMs: 1,
      });
      assert(result.ok === true && result.completed.length === 2, JSON.stringify(result));
      equal(regionCalls, 2, 'each tapTexts step must recompute the outer region');
      assert(records.clicks[0].x === 425 && records.clicks[0].y === 365, JSON.stringify(records.clicks));
      assert(records.clicks[1].x === 575 && records.clicks[1].y === 515, JSON.stringify(records.clicks));
      assert(records.screenshots[0].clip.x === 110 && records.screenshots[0].clip.y === 210, JSON.stringify(records.screenshots));
      assert(records.screenshots[1].clip.x === 260 && records.screenshots[1].clip.y === 310, JSON.stringify(records.screenshots));
      equal(records.windowReads.length, 4, 'each tapTexts step must perform pre/post window checks');
      equal(records.waits.filter(function (value) { return value === 1; }).length, 1, JSON.stringify(records.waits));
      assertObservationCounts(records, 2, 2, 2, 'tapTexts fresh steps');
    });

    regionCalls = 0;
    current = win;
    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        const lines = [screenLine('联系人 A', region(300, 350, 80, 30), index, records)];
        if (index === 0) lines.push(screenLine('编辑', region(400, 350, 50, 30), index, records));
        return { provider: 'fixture', lines: lines };
      },
    }, async function (records) {
      const error = await expectCode(() => UI.tapTexts(['编辑', '保存'], {
        within: win,
        region: function (currentWin) {
          regionCalls += 1;
          return Geometry.inset(currentWin, 10);
        },
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
      }), 'TARGET_NOT_FOUND', 'UI.tapTexts');
      assert(error.failedIndex === 1 && error.failedText === '保存', JSON.stringify(error));
      assert(Array.isArray(error.completed) && error.completed.length === 1 && error.cause, JSON.stringify(error));
      equal(regionCalls, 2, 'failed second step must not recompute the first step');
      equal(records.windowReads.length, 4, 'failed target is still followed by a freshness check');
      assertObservationCounts(records, 2, 2, 1, 'tapTexts stops after second-step failure');
    });
  });

  test({ name: 'UI never retries after the mouse input primitive has been invoked', tier: 'unit', covers: ['UI.tapText', 'UI.tapTexts'] }, async () => {
    const win = windowInfo();
    const stub = {
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          screenLine('联系人 A', region(300, 350, 80, 30), index, records),
          screenLine('编辑', region(400, 350, 50, 30), index, records),
        ] };
      },
      onClick: function () { throw new Error('fixture input outcome unknown'); },
    };
    await withStubs(stub, async function (records) {
      await expectCode(() => UI.tapText('编辑', {
        within: win,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
      }), 'STALE_TARGET', 'UI.tapText');
      assertObservationCounts(records, 1, 1, 1, 'tapText input failure');
      equal(records.windowReads.length, 2, 'input failure must not trigger another window observation');
      equal(records.events.map(function (event) { return event.type; }).join(','), 'window,screenshot,ocr,window,click', 'tapText must not observe again after the click primitive throws');
    });

    await withStubs(stub, async function (records) {
      const error = await expectCode(() => UI.tapTexts(['编辑', '编辑'], {
        within: win,
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 },
      }), 'STALE_TARGET', 'UI.tapTexts');
      assert(error.failedIndex === 0 && error.completed.length === 0 && error.cause, JSON.stringify(error));
      assertObservationCounts(records, 1, 1, 1, 'tapTexts input failure');
      equal(records.windowReads.length, 2, 'tapTexts input failure must not retry or begin step two');
      equal(records.events.map(function (event) { return event.type; }).join(','), 'window,screenshot,ocr,window,click', 'tapTexts must stop immediately after the click primitive throws');
    });
  });

  test({ name: 'UI validates positioned text option structures before capture or input', tier: 'unit', covers: ['UI.findText', 'UI.tapText'] }, async () => {
    const win = windowInfo();
    const validDirection = { text: '联系人 A', direction: 'right', maxGap: 20 };
    const invalidOuterRegions = [
      { x: 100, y: 200, width: 100, height: 100 },
      { x: 100, y: 200, width: 100, height: 100, coordinateSpace: 'image' },
      null,
      region(NaN, 200, 100, 100),
      region(100, Infinity, 100, 100),
      region(100, 200, 0, 100),
      region(100, 200, 100, -1),
      { ...region(100, 200, 100, 100), unknown: true },
      'globalThis.__uiRegionExpressionExecuted = true',
    ];
    await withStubs({}, async function (records) {
      globalThis.__uiRegionExpressionExecuted = false;
      for (const invalid of invalidOuterRegions) {
        await expectCode(() => UI.findText('编辑', {
          within: win,
          region: invalid,
          relativeTo: validDirection,
        }), 'INVALID_ARGUMENT', 'UI.findText');
      }
      equal(globalThis.__uiRegionExpressionExecuted, false, 'region strings must never be evaluated');
      assertObservationCounts(records, 0, 0, 0, 'invalid static outer regions');
      equal(records.windowReads.length, 0, 'invalid static regions must fail before window observation');
      delete globalThis.__uiRegionExpressionExecuted;
    });

    const invalidRelative = [
      null,
      { text: '', direction: 'right', maxGap: 20 },
      { text: '   ', direction: 'right', maxGap: 20 },
      { text: '联系人 A', direction: 'diagonal', maxGap: 20 },
      { text: '联系人 A', direction: 'right' },
      { text: '联系人 A', direction: 'right', maxGap: -1 },
      { text: '联系人 A', direction: 'right', maxGap: NaN },
      { text: '联系人 A', direction: 'right', maxGap: Infinity },
      { text: '联系人 A', direction: 'right', maxGap: 20, minOverlap: 0 },
      { text: '联系人 A', direction: 'right', maxGap: 20, minOverlap: 1.01 },
      { text: '联系人 A', direction: 'right', maxGap: 20, minOverlap: NaN },
      { text: '联系人 A', direction: 'right', maxGap: 20, region: function () { return region(0, 0, 1, 1); } },
      { text: '联系人 A', region: function () { return region(0, 0, 1, 1); }, maxGap: 20 },
      { text: '联系人 A', region: function () { return region(0, 0, 1, 1); }, minOverlap: 0.5 },
      { text: '联系人 A', region: region(0, 0, 1, 1) },
      { text: '联系人 A', direction: 'right', maxGap: 20, unknown: true },
      { text: '联系人 A' },
    ];
    await withStubs({}, async function (records) {
      for (const relativeTo of invalidRelative) {
        await expectCode(() => UI.findText('编辑', { within: win, relativeTo: relativeTo }), 'INVALID_ARGUMENT', 'UI.findText');
      }
      assertObservationCounts(records, 0, 0, 0, 'invalid relativeTo structures');
      equal(records.windowReads.length, 0, 'relativeTo schema errors must precede window observation');
    });

    const invalidDynamicResults = [
      function () { return Promise.resolve(region(100, 200, 100, 100)); },
      function () { return null; },
      function () { return { x: 100, y: 200, width: 100, height: 100 }; },
      function () { return { x: 100, y: 200, width: 100, height: 100, coordinateSpace: 'image' }; },
      function () { return region(NaN, 200, 100, 100); },
      function () { return region(100, Infinity, 100, 100); },
      function () { return region(100, 200, 0, 100); },
      function () { return region(100, 200, 100, -1); },
      function () { throw new Error('fixture region callback failure'); },
      function () { return { ...region(100, 200, 100, 100), unknown: true }; },
    ];
    await withStubs({}, async function (records) {
      for (const dynamicRegion of invalidDynamicResults) {
        await expectCode(() => UI.findText('编辑', { within: win, region: dynamicRegion }), 'INVALID_ARGUMENT', 'UI.findText');
      }
      assertObservationCounts(records, 0, 0, 0, 'invalid dynamic outer results');
      equal(records.windowReads.length, invalidDynamicResults.length, 'each dynamic result is evaluated only after one fresh window read');
    });

    const invalidRelativeResults = [
      function () { return Promise.resolve(region(500, 400, 100, 50)); },
      function () { return null; },
      function () { return { x: 500, y: 400, width: 100, height: 50 }; },
      function () { return { x: 500, y: 400, width: 100, height: 50, coordinateSpace: 'image' }; },
      function () { return region(500, 400, NaN, 50); },
      function () { return region(500, 400, 100, Infinity); },
      function () { return region(500, 400, 0, 50); },
      function () { return region(500, 400, 100, -1); },
      function () { throw new Error('fixture relative region callback failure'); },
      function () { return { ...region(500, 400, 100, 50), unknown: true }; },
    ];
    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('联系人 A', region(300, 350, 80, 30), index, records)] };
      },
    }, async function (records) {
      for (const relativeRegion of invalidRelativeResults) {
        await expectCode(() => UI.tapText('编辑', {
          within: win,
          relativeTo: { text: '联系人 A', region: relativeRegion },
        }), 'INVALID_ARGUMENT', 'UI.tapText');
      }
      assertObservationCounts(records, invalidRelativeResults.length, invalidRelativeResults.length, 0, 'invalid relative region results');
      equal(records.windowReads.length, invalidRelativeResults.length, 'invalid relative callback results must stop before the post-OCR window check');
    });

    const explicitScopeFailures = [
      { relativeTo: validDirection },
      { within: displayInfo(), relativeTo: validDirection },
      { within: region(100, 200, 800, 600), relativeTo: validDirection },
    ];
    await withStubs({}, async function (records) {
      for (const options of explicitScopeFailures) {
        await expectCode(() => UI.findText('编辑', options), 'INVALID_ARGUMENT', 'UI.findText');
      }
      await expectCode(() => UI.findText('编辑', {
        within: windowInfo({ id: 'darwin:42:unresolved', handle: 0 }),
        relativeTo: validDirection,
      }), 'STALE_TARGET', 'UI.findText');
      assertObservationCounts(records, 0, 0, 0, 'invalid positioned scopes');
      equal(records.windowReads.length, 0, 'invalid explicit scopes must fail before reading another window');
    });
  });

  test({ name: 'UI wait and image methods reject positioned text options before any observation or input', tier: 'unit', covers: ['UI.waitText', 'UI.waitTextGone', 'UI.findImages', 'UI.findImage', 'UI.tapImage'] }, async () => {
    const win = windowInfo();
    const optionVariants = [
      { within: win, region: Geometry.inset(win, 10) },
      { within: win, relativeTo: { text: '联系人 A', direction: 'right', maxGap: 20 } },
    ];
    const methods = [
      { operation: 'UI.waitText', invoke: function (options) { return UI.waitText('编辑', options); } },
      { operation: 'UI.waitTextGone', invoke: function (options) { return UI.waitTextGone('编辑', options); } },
      { operation: 'UI.findImages', invoke: function (options) { return UI.findImages('template.png', options); } },
      { operation: 'UI.findImage', invoke: function (options) { return UI.findImage('template.png', options); } },
      { operation: 'UI.tapImage', invoke: function (options) { return UI.tapImage('template.png', options); } },
    ];
    await withStubs({}, async function (records) {
      for (const method of methods) {
        for (const options of optionVariants) {
          await expectCode(() => method.invoke(options), 'INVALID_ARGUMENT', method.operation);
        }
      }
      assertObservationCounts(records, 0, 0, 0, 'unsupported positioned options');
      equal(records.imageRequests.length, 0, 'unsupported image methods must not invoke template matching');
      equal(records.windowReads.length, 0, 'unsupported methods must reject options before window observation');
      equal(records.waits.length, 0, 'unsupported wait methods must reject before polling or sleeping');
    });
  });

  test({ name: 'UI relative distances remain screen-logical under negative coordinates and unequal capture scales', tier: 'unit', covers: ['UI.findTexts'] }, async () => {
    const win = windowInfo({ x: -700, y: 100 });
    const scaleX = 1.25;
    const scaleY = 1.5;
    await withStubs({
      window: win,
      virtual: { x: -1920, y: 0, width: 3840, height: 1080 },
      displays: [
        displayInfo({ id: 'left', x: -1920, width: 1920 }),
        displayInfo({ id: 'right', index: 2, x: 0, width: 1920 }),
      ],
      getSize: function () { return [1000, 900]; },
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [
          scaledScreenLine('联系人 A', region(-600, 200, 200, 40), index, records, scaleX, scaleY),
          scaledScreenLine('编辑', region(-370, 210, 50, 20), index, records, scaleX, scaleY, 0.5),
          scaledScreenLine('编辑', region(-369, 210, 50, 20), index, records, scaleX, scaleY, 0.99),
        ] };
      },
    }, async function (records) {
      const matches = await UI.findTexts('编辑', {
        within: win,
        provider: 'fixture-provider',
        lang: 'ch',
        relativeTo: { text: '联系人 A', direction: 'right', maxGap: 30, minOverlap: 1 },
      });
      assert(matches.length === 1 && matches[0].bounds.x === -370 && matches[0].bounds.y === 210, JSON.stringify(matches));
      equal(records.ocrRequests[0].provider, 'fixture-provider', JSON.stringify(records.ocrRequests[0]));
      equal(records.ocrRequests[0].lang, 'ch', JSON.stringify(records.ocrRequests[0]));
      assertObservationCounts(records, 1, 1, 0, 'negative non-uniform relative mapping');
    });
  });

  test({ name: 'UI calls without positioned options retain legacy scope, return, and unknown-option behavior', tier: 'unit', covers: ['UI.findText', 'UI.hasText', 'UI.tapText'] }, async () => {
    const win = windowInfo();
    await withStubs({
      getSize: unitCaptureSize,
      runOCR: function (_, index, records) {
        return { provider: 'fixture', lines: [screenLine('确定', region(200, 300, 50, 30), index, records)] };
      },
    }, async function (records) {
      const target = await UI.findText('确定', { within: win, preexistingUnknownOption: true });
      assert(target && target.source === 'ocr' && target.bounds.coordinateSpace === 'screen' && target.center.coordinateSpace === 'screen', JSON.stringify(target));
      equal(await UI.hasText('确定', { within: win }), true, 'legacy hasText result');
      const tapped = await UI.tapText('确定', { within: win });
      assert(tapped.ok === true && tapped.action === 'tapText' && tapped.target.text === '确定', JSON.stringify(tapped));
      equal(records.windowReads.length, 1, 'legacy find/read calls do not gain positioned freshness reads; legacy tap keeps its existing post-check');
      assertObservationCounts(records, 3, 3, 1, 'legacy compatibility');
      assert(records.screenshots.every(function (request) {
        return request.target === 'screen' && request.returnType === 'base64' && !Object.prototype.hasOwnProperty.call(request, 'path');
      }), JSON.stringify(records.screenshots));
      assert(records.ocrRequests.every(function (request) {
        return Object.keys(request).every(function (key) { return ['image', 'provider', 'providerChain', 'lang'].includes(key); });
      }), JSON.stringify(records.ocrRequests));
    });
  });
})();
