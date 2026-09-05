(() => {
  const { assert, equal, test } = RuntimeAPITest;

  function windowInfo(overrides = {}) {
    return {
      id: 'darwin:42:native:99',
      title: 'Fixture',
      pid: 42,
      processId: 42,
      x: 100,
      y: 200,
      width: 800,
      height: 600,
      handle: 99,
      ...overrides,
    };
  }

  function displayInfo(overrides = {}) {
    return {
      id: 'display-1',
      index: 1,
      pixelWidth: 1920,
      pixelHeight: 1080,
      scale: 1,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      ...overrides,
    };
  }

  function assertRegion(actual, expected, message) {
    assert(actual && actual.coordinateSpace === 'screen', (message || 'region') + ': ' + JSON.stringify(actual));
    for (const key of ['x', 'y', 'width', 'height']) {
      equal(actual[key], expected[key], (message || 'region') + '.' + key);
    }
    equal(Object.keys(actual).sort().join(','), 'coordinateSpace,height,width,x,y', (message || 'region') + ' fields');
  }

  function assertPoint(actual, expected, message) {
    assert(actual && actual.coordinateSpace === 'screen', (message || 'point') + ': ' + JSON.stringify(actual));
    equal(actual.x, expected.x, (message || 'point') + '.x');
    equal(actual.y, expected.y, (message || 'point') + '.y');
    equal(Object.keys(actual).sort().join(','), 'coordinateSpace,x,y', (message || 'point') + ' fields');
  }

  async function expectCode(fn, code, operation, messagePart) {
    let caught = null;
    try {
      await fn();
    } catch (error) {
      caught = error;
    }
    assert(caught, 'expected ' + code + ' from ' + operation);
    equal(caught.code, code, String(caught));
    equal(caught.operation, operation, String(caught));
    if (messagePart) {
      assert(String(caught.message).includes(messagePart), 'unexpected error message: ' + String(caught.message));
    }
    return caught;
  }

  test({
    name: 'Geometry.regionByEdges supports every horizontal and vertical constraint pair',
    tier: 'unit',
    covers: ['Geometry.regionByEdges'],
  }, async () => {
    const parent = windowInfo();

    assertRegion(
      Geometry.regionByEdges(parent, { left: 10, width: 300, top: 20, height: 100 }),
      { x: 110, y: 220, width: 300, height: 100 },
      'left + width',
    );
    assertRegion(
      Geometry.regionByEdges(parent, { right: 0, width: 300, top: 20, height: 100 }),
      { x: 600, y: 220, width: 300, height: 100 },
      'right + width',
    );
    assertRegion(
      Geometry.regionByEdges(parent, { left: 16, right: 16, top: 20, height: 100 }),
      { x: 116, y: 220, width: 768, height: 100 },
      'left + right',
    );

    assertRegion(
      Geometry.regionByEdges(parent, { left: 10, width: 300, top: 20, height: 100 }),
      { x: 110, y: 220, width: 300, height: 100 },
      'top + height',
    );
    assertRegion(
      Geometry.regionByEdges(parent, { left: 10, width: 300, bottom: 0, height: 100 }),
      { x: 110, y: 700, width: 300, height: 100 },
      'bottom + height',
    );
    assertRegion(
      Geometry.regionByEdges(parent, { left: 10, width: 300, top: 20, bottom: 30 }),
      { x: 110, y: 220, width: 300, height: 550 },
      'top + bottom',
    );

    assertRegion(
      Geometry.regionByEdges(parent, { left: 16, right: 16, bottom: 12, height: 60 }),
      { x: 116, y: 728, width: 768, height: 60 },
      'bottom stretched region',
    );
    assertRegion(
      Geometry.regionByEdges(parent, { top: 0, bottom: 0, right: 0, width: 300 }),
      { x: 600, y: 200, width: 300, height: 600 },
      'right fixed-width region',
    );
    assertRegion(
      Geometry.regionByEdges(parent, { right: 16, bottom: 12, width: 180, height: 64 }),
      { x: 704, y: 724, width: 180, height: 64 },
      'bottom-right fixed region',
    );

    const zeroEdges = Geometry.regionByEdges(parent, { left: 0, right: 0, top: 0, bottom: 0 });
    assertRegion(zeroEdges, { x: 100, y: 200, width: 800, height: 600 }, 'zero edges');
    assertRegion(
      Geometry.regionByEdges(parent, { left: undefined, right: 0, width: 10, top: 0, height: 10 }),
      { x: 890, y: 200, width: 10, height: 10 },
      'undefined is omitted while zero is provided',
    );
    assertRegion(
      Geometry.regionByEdges(
        displayInfo({ x: -1920, y: -100 }),
        { right: 0, width: 300, bottom: 0, height: 100 },
      ),
      { x: -300, y: 880, width: 300, height: 100 },
      'display target',
    );
  });

  test({
    name: 'Geometry.regionByEdges rejects incomplete, excessive, invalid, and impossible constraints',
    tier: 'unit',
    covers: ['Geometry.regionByEdges'],
  }, async () => {
    const parent = windowInfo();
    await expectCode(
      () => Geometry.regionByEdges(parent, { left: 0, top: 0, height: 10 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'cannot determine region width',
    );
    await expectCode(
      () => Geometry.regionByEdges(parent, { left: 0, right: 0, width: 800, top: 0, height: 10 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'horizontal constraints are over-specified',
    );
    await expectCode(
      () => Geometry.regionByEdges(parent, { left: 0, width: 10, top: 0 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'cannot determine region height',
    );
    await expectCode(
      () => Geometry.regionByEdges(parent, { left: 0, width: 10, top: 0, bottom: 0, height: 600 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'vertical constraints are over-specified',
    );

    await expectCode(
      () => Geometry.regionByEdges(parent, { right: 16, width: 800, bottom: 12, height: 60 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'right 16 and width 800',
    );
    await expectCode(
      () => Geometry.regionByEdges(parent, { left: 400, right: 400, top: 0, height: 10 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'leave no positive width',
    );
    await expectCode(
      () => Geometry.regionByEdges(parent, { left: 0, width: 10, bottom: 12, height: 600 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'bottom 12 and height 600',
    );

    const invalidRules = [
      { left: -1, width: 10, top: 0, height: 10 },
      { left: 0, width: 10, top: -1, height: 10 },
      { left: NaN, width: 10, top: 0, height: 10 },
      { left: 0, width: Infinity, top: 0, height: 10 },
      { left: '0', width: 10, top: 0, height: 10 },
      { left: 0, width: 0, top: 0, height: 10 },
      { left: 0, width: 10, top: 0, height: -1 },
      { left: '50%', width: 10, top: 0, height: 10 },
    ];
    for (const rule of invalidRules) {
      await expectCode(() => Geometry.regionByEdges(parent, rule), 'INVALID_ARGUMENT', 'Geometry.regionByEdges');
    }
    await expectCode(() => Geometry.regionByEdges(parent), 'INVALID_ARGUMENT', 'Geometry.regionByEdges');
    await expectCode(
      () => Geometry.regionByEdges({ x: 0, y: 0, width: 10, height: 10 }, { left: 0, width: 1, top: 0, height: 1 }),
      'INVALID_ARGUMENT', 'Geometry.regionByEdges', 'target must be',
    );
  });

  test({
    name: 'Geometry.regionByEdges preserves negative origins, fractional precision, and input objects',
    tier: 'unit',
    covers: ['Geometry.regionByEdges'],
  }, async () => {
    const moved = windowInfo({ x: -1200, y: 40, width: 1000, height: 700 });
    const rule = { left: 16, right: 16, bottom: 12, height: 60 };
    const movedBefore = JSON.stringify(moved);
    const ruleBefore = JSON.stringify(rule);
    assertRegion(
      Geometry.regionByEdges(moved, rule),
      { x: -1184, y: 668, width: 968, height: 60 },
      'negative origin',
    );
    equal(JSON.stringify(moved), movedBefore, 'target must not be modified');
    equal(JSON.stringify(rule), ruleBefore, 'rule must not be modified');

    const fractional = windowInfo({ x: -10.5, y: 20.25, width: 100.5, height: 50.75 });
    assertRegion(
      Geometry.regionByEdges(fractional, { left: 0.25, right: 0.5, top: 0.125, bottom: 0.625 }),
      { x: -10.25, y: 20.375, width: 99.75, height: 50 },
      'fractional region',
    );
  });

  test({
    name: 'Geometry.inset applies uniform and per-edge margins without mutation',
    tier: 'unit',
    covers: ['Geometry.inset', 'Geometry.regionByEdges'],
  }, async () => {
    const parent = windowInfo();
    const footer = Geometry.regionByEdges(parent, { left: 16, right: 16, bottom: 12, height: 60 });
    const footerBefore = JSON.stringify(footer);

    assertRegion(
      Geometry.inset(footer, 12),
      { x: 128, y: 740, width: 744, height: 36 },
      'uniform inset',
    );
    const margins = { left: 12, right: 12, top: 4, bottom: 8 };
    const marginsBefore = JSON.stringify(margins);
    assertRegion(
      Geometry.inset(footer, margins),
      { x: 128, y: 732, width: 744, height: 48 },
      'per-edge inset',
    );
    equal(JSON.stringify(margins), marginsBefore, 'margins must not be modified');
    assertRegion(
      Geometry.inset(parent, { left: 12 }),
      { x: 112, y: 200, width: 788, height: 600 },
      'omitted inset edges default to zero',
    );
    const zero = Geometry.inset(footer, 0);
    assertRegion(zero, footer, 'zero inset');
    assert(zero !== footer, 'inset must return a new region');
    assertRegion(
      Geometry.inset(
        { x: -10.5, y: 20.25, width: 100.5, height: 50.75, coordinateSpace: 'screen' },
        { left: 0.25, right: 0.5, top: 0.125, bottom: 0.625 },
      ),
      { x: -10.25, y: 20.375, width: 99.75, height: 50 },
      'fractional inset',
    );
    equal(JSON.stringify(footer), footerBefore, 'inset target must not be modified');
  });

  test({
    name: 'Geometry.inset rejects missing, invalid, and area-consuming margins',
    tier: 'unit',
    covers: ['Geometry.inset'],
  }, async () => {
    const parent = windowInfo({ width: 100, height: 80 });
    const invalidMargins = [undefined, -1, NaN, Infinity, '12', null, [], { left: -1 }, { top: Infinity }, { right: '1' }];
    for (const margins of invalidMargins) {
      await expectCode(() => Geometry.inset(parent, margins), 'INVALID_ARGUMENT', 'Geometry.inset');
    }
    await expectCode(() => Geometry.inset(parent, { left: 50, right: 50 }), 'INVALID_ARGUMENT', 'Geometry.inset', 'no positive width');
    await expectCode(() => Geometry.inset(parent, { top: 40, bottom: 40 }), 'INVALID_ARGUMENT', 'Geometry.inset', 'no positive height');
    await expectCode(() => Geometry.inset(parent, 50), 'INVALID_ARGUMENT', 'Geometry.inset');
    await expectCode(
      () => Geometry.inset({ x: 0, y: 0, width: 10, height: 10 }, 1),
      'INVALID_ARGUMENT', 'Geometry.inset', 'target must be',
    );
  });

  test({
    name: 'Geometry.anchorPoint returns all nine integer anchors inside half-open bounds',
    tier: 'unit',
    covers: ['Geometry.anchorPoint'],
  }, async () => {
    const parent = windowInfo();
    const expected = {
      'top-left': { x: 100, y: 200 },
      'top-center': { x: 500, y: 200 },
      'top-right': { x: 899, y: 200 },
      'center-left': { x: 100, y: 500 },
      center: { x: 500, y: 500 },
      'center-right': { x: 899, y: 500 },
      'bottom-left': { x: 100, y: 799 },
      'bottom-center': { x: 500, y: 799 },
      'bottom-right': { x: 899, y: 799 },
    };
    for (const position of Object.keys(expected)) {
      const point = Geometry.anchorPoint(parent, position);
      assertPoint(point, expected[position], position);
      assert(Geometry.contains(Geometry.rect(parent), point), position + ' must remain inside parent');
    }
    assertPoint(Geometry.anchorPoint(parent, 'center'), Geometry.center(parent), 'center compatibility');
  });

  test({
    name: 'Geometry.anchorPoint applies shared inset rules and rejects unusable anchors',
    tier: 'unit',
    covers: ['Geometry.anchorPoint', 'Geometry.inset'],
  }, async () => {
    const parent = windowInfo();
    const parentBefore = JSON.stringify(parent);
    assertPoint(
      Geometry.anchorPoint(parent, 'bottom-right', { inset: 12 }),
      { x: 887, y: 787 },
      'uniform inset anchor',
    );
    const options = { inset: { right: 16, bottom: 12 } };
    const optionsBefore = JSON.stringify(options);
    const point = Geometry.anchorPoint(parent, 'bottom-right', options);
    assertPoint(point, { x: 883, y: 787 }, 'per-edge inset anchor');
    const inner = Geometry.inset(parent, options.inset);
    assert(Geometry.contains(inner, point), 'right/bottom anchor must be inside inset region');
    assert(point.x < inner.x + inner.width && point.y < inner.y + inner.height, 'right/bottom edge must be exclusive');
    equal(JSON.stringify(parent), parentBefore, 'anchor target must not be modified');
    equal(JSON.stringify(options), optionsBefore, 'anchor options must not be modified');

    await expectCode(() => Geometry.anchorPoint(parent, 'left'), 'INVALID_ARGUMENT', 'Geometry.anchorPoint', 'position must be one of');
    await expectCode(() => Geometry.anchorPoint(parent, 'center', null), 'INVALID_ARGUMENT', 'Geometry.anchorPoint');
    await expectCode(() => Geometry.anchorPoint(parent, 'center', { inset: -1 }), 'INVALID_ARGUMENT', 'Geometry.anchorPoint');
    await expectCode(
      () => Geometry.anchorPoint({ x: 0, y: 0, width: 10, height: 10 }, 'center'),
      'INVALID_ARGUMENT', 'Geometry.anchorPoint', 'target must be',
    );
    await expectCode(
      () => Geometry.anchorPoint({ x: 0.1, y: 0.1, width: 0.1, height: 0.1, coordinateSpace: 'screen' }, 'center'),
      'INVALID_ARGUMENT', 'Geometry.anchorPoint', 'addressable screen point',
    );

    const fractional = { x: -10.2, y: -3.4, width: 5.7, height: 4.8, coordinateSpace: 'screen' };
    const fractionalPoint = Geometry.anchorPoint(fractional, 'bottom-right');
    assert(Number.isInteger(fractionalPoint.x) && Number.isInteger(fractionalPoint.y), JSON.stringify(fractionalPoint));
    assert(Geometry.contains(fractional, fractionalPoint), JSON.stringify({ fractional: fractional, point: fractionalPoint }));
  });

  test({
    name: 'Geometry layout rules recompute deterministically from updated window snapshots',
    tier: 'unit',
    covers: ['Geometry.regionByEdges'],
  }, async () => {
    const rule = { left: 16, right: 16, bottom: 12, height: 60 };
    const original = Geometry.regionByEdges(windowInfo(), rule);
    assertRegion(original, { x: 116, y: 728, width: 768, height: 60 }, 'original snapshot');

    assertRegion(
      Geometry.regionByEdges(windowInfo({ x: -200, y: -100 }), rule),
      { x: -184, y: 428, width: 768, height: 60 },
      'moved snapshot',
    );
    assertRegion(
      Geometry.regionByEdges(windowInfo({ width: 1000 }), rule),
      { x: 116, y: 728, width: 968, height: 60 },
      'wider snapshot',
    );
    assertRegion(
      Geometry.regionByEdges(windowInfo({ height: 700 }), rule),
      { x: 116, y: 828, width: 768, height: 60 },
      'taller snapshot',
    );
    assertRegion(
      Geometry.regionByEdges(windowInfo({ x: -1200, y: 40, width: 1000, height: 700 }), rule),
      { x: -1184, y: 668, width: 968, height: 60 },
      'fully updated snapshot',
    );
    assertRegion(original, { x: 116, y: 728, width: 768, height: 60 }, 'old snapshot remains static');
  });

  test({
    name: 'Geometry layout outputs preserve legacy Geometry shapes and work as UI within scopes',
    tier: 'unit',
    covers: ['Geometry.regionByEdges', 'Geometry.inset', 'Geometry.anchorPoint', 'Geometry.rect', 'Geometry.center', 'UI.findText'],
  }, async () => {
    const parent = windowInfo();
    const footer = Geometry.regionByEdges(parent, { left: 16, right: 16, bottom: 12, height: 60 });
    assertRegion(Geometry.rect(footer), footer, 'rect accepts derived region');
    assertPoint(Geometry.center(footer), { x: 500, y: 758 }, 'legacy center on derived region');

    const original = {
      window: globalThis.window,
      Screen: globalThis.Screen,
      page: globalThis.page,
      Vision: globalThis.Vision,
      ImageColor: globalThis.ImageColor,
    };
    const screenshots = [];
    globalThis.window = { getActiveWindow: async function () { return parent; } };
    globalThis.Screen = {
      getVirtualBounds: function () { return { x: 0, y: 0, width: 1920, height: 1080 }; },
      getDisplays: function () { return [displayInfo()]; },
    };
    globalThis.page = {
      screenshot: async function (request) { screenshots.push(request); return 'geometry-layout-fixture'; },
      waitFor: async function () {},
    };
    globalThis.Vision = {
      runOCR: async function () {
        return { provider: 'fixture', lines: [{ text: '确定', confidence: 1, bbox: { x: 10, y: 10, width: 100, height: 20 } }] };
      },
    };
    globalThis.ImageColor = {
      getSize: function () { return [768, 60]; },
      findImages: async function () { return []; },
    };
    try {
      const found = await UI.findText('确定', { within: footer });
      assert(found && found.bounds.x === 126 && found.bounds.y === 738, JSON.stringify(found));
      assert(screenshots.length === 1, JSON.stringify(screenshots));
      for (const key of ['x', 'y', 'width', 'height']) {
        equal(screenshots[0].clip[key], footer[key], 'UI screenshot clip.' + key);
      }
    } finally {
      globalThis.window = original.window;
      globalThis.Screen = original.Screen;
      globalThis.page = original.page;
      globalThis.Vision = original.Vision;
      globalThis.ImageColor = original.ImageColor;
    }
  });

  test({
    name: 'Geometry.anchorPoint outputs are accepted by mouse.clickPoint without desktop input',
    tier: 'unit',
    covers: ['Geometry.anchorPoint', 'mouse.clickPoint'],
  }, async () => {
    const originalMouse = globalThis.mouse;
    const clickPoint = originalMouse.clickPoint;
    const calls = [];
    globalThis.mouse = {
      click: function (x, y, options) { calls.push({ x: x, y: y, options: options }); },
      clickPoint: clickPoint,
    };
    try {
      const point = Geometry.anchorPoint(windowInfo(), 'bottom-right', { inset: { right: 16, bottom: 12 } });
      await mouse.clickPoint(point, { button: 'right' });
      assert(calls.length === 1, JSON.stringify(calls));
      equal(calls[0].x, 883, 'mouse point x');
      equal(calls[0].y, 787, 'mouse point y');
      equal(calls[0].options.button, 'right', 'mouse options');
    } finally {
      globalThis.mouse = originalMouse;
    }
  });
})();
