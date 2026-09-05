(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Geometry');

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
  }

  test({
    name: 'Geometry converts window and display targets into tagged screen coordinates',
    tier: 'unit',
    covers: [
      'Geometry.rect', 'Geometry.center', 'Geometry.pointOffset', 'Geometry.pointPercent',
      'Geometry.regionOffset', 'Geometry.regionPercent', 'Geometry.contains', 'Geometry.intersect',
    ],
  }, async () => {
    const win = windowInfo();
    const display = displayInfo({ x: -1920, y: 0 });

    const rect = Geometry.rect(win);
    assert(rect.coordinateSpace === 'screen' && rect.x === 100 && rect.y === 200 && rect.width === 800 && rect.height === 600, JSON.stringify(rect));

    const center = Geometry.center(win);
    assert(center.coordinateSpace === 'screen' && center.x === 500 && center.y === 500, JSON.stringify(center));

    const displayCenter = Geometry.center(display);
    assert(displayCenter.x === -960 && displayCenter.y === 540, JSON.stringify(displayCenter));

    const offset = Geometry.pointOffset(win, 24, 18);
    assert(offset.x === 124 && offset.y === 218 && offset.coordinateSpace === 'screen', JSON.stringify(offset));

    const percent = Geometry.pointPercent(win, 25, 75);
    assert(percent.x === 300 && percent.y === 650, JSON.stringify(percent));

    const edge = Geometry.pointPercent(win, 100, 100);
    assert(edge.x === 899 && edge.y === 799, JSON.stringify(edge));

    const offsetRegion = Geometry.regionOffset(win, { left: 10, top: 20, width: 300, height: 100 });
    assert(offsetRegion.x === 110 && offsetRegion.y === 220 && offsetRegion.width === 300 && offsetRegion.height === 100, JSON.stringify(offsetRegion));

    const percentRegion = Geometry.regionPercent(win, { left: 0, top: 70, width: 100, height: 30 });
    assert(percentRegion.x === 100 && percentRegion.y === 620 && percentRegion.width === 800 && percentRegion.height === 180, JSON.stringify(percentRegion));

    assert(Geometry.contains(percentRegion, Geometry.center(percentRegion)), 'region should contain its center');
    assert(!Geometry.contains(percentRegion, { x: 900, y: 700, coordinateSpace: 'screen' }), 'right edge must be exclusive');

    const overlap = Geometry.intersect(percentRegion, Geometry.regionOffset(win, { left: 0, top: 450, width: 500, height: 300 }));
    assert(overlap && overlap.x === 100 && overlap.y === 650 && overlap.width === 500 && overlap.height === 150, JSON.stringify(overlap));
    equal(Geometry.intersect(percentRegion, Geometry.regionOffset(win, { left: 0, top: 800, width: 10, height: 10 })), null, 'disjoint regions must return null');
  });

  test({
    name: 'Geometry rejects ambiguous regions and invalid numeric or percent input',
    tier: 'unit',
    covers: ['Geometry.rect', 'Geometry.pointPercent', 'Geometry.regionPercent', 'Geometry.contains'],
  }, async () => {
    const win = windowInfo();
    await expectCode(() => Geometry.rect({ x: 0, y: 0, width: 10, height: 10 }), 'INVALID_ARGUMENT', 'Geometry.rect');
    await expectCode(() => Geometry.pointOffset(win, NaN, 0), 'INVALID_ARGUMENT', 'Geometry.pointOffset');
    await expectCode(() => Geometry.pointOffset(win, Infinity, 0), 'INVALID_ARGUMENT', 'Geometry.pointOffset');
    await expectCode(() => Geometry.pointPercent(win, -1, 50), 'INVALID_ARGUMENT', 'Geometry.pointPercent');
    await expectCode(() => Geometry.pointPercent(win, 101, 50), 'INVALID_ARGUMENT', 'Geometry.pointPercent');
    await expectCode(() => Geometry.regionPercent(win, { left: 50, top: 0, width: 51, height: 10 }), 'INVALID_ARGUMENT', 'Geometry.regionPercent');
    await expectCode(() => Geometry.regionPercent(win, { left: 0, top: 0, width: 0, height: 10 }), 'INVALID_ARGUMENT', 'Geometry.regionPercent');
    await expectCode(() => Geometry.contains(Geometry.rect(win), { x: 100, y: 200 }), 'INVALID_ARGUMENT', 'Geometry.contains');
  });

  test({ name: 'mouse.clickPoint forwards only explicitly tagged screen points', tier: 'unit', covers: ['mouse.clickPoint'] }, async () => {
    const originalMouse = globalThis.mouse;
    const clickPoint = originalMouse.clickPoint;
    const calls = [];
    globalThis.mouse = {
      click: function (x, y, options) { calls.push({ x: x, y: y, options: options }); },
      clickPoint: clickPoint,
    };
    try {
      await mouse.clickPoint({ x: -10, y: 20, coordinateSpace: 'screen' }, { button: 'right' });
      assert(calls.length === 1 && calls[0].x === -10 && calls[0].y === 20 && calls[0].options.button === 'right', JSON.stringify(calls));
      await expectCode(() => mouse.clickPoint({ x: 1, y: 2 }), 'INVALID_ARGUMENT', 'mouse.clickPoint');
      await expectCode(() => mouse.clickPoint({ x: NaN, y: 2, coordinateSpace: 'screen' }), 'INVALID_ARGUMENT', 'mouse.clickPoint');
      await expectCode(() => mouse.clickPoint({ x: 1, y: 2, coordinateSpace: 'image' }), 'INVALID_ARGUMENT', 'mouse.clickPoint');
    } finally {
      globalThis.mouse = originalMouse;
    }
  });
})();
