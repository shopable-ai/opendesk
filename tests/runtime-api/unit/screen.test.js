(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Screen');

  test({
    name: 'Screen metadata and pixel APIs agree on the primary display',
    tier: 'unit',
    covers: [
      'Screen.getWidth', 'Screen.getHeight', 'Screen.getDisplays', 'Screen.getPrimaryDisplay',
      'Screen.getDisplay', 'Screen.getVirtualBounds', 'Screen.pixel', 'Screen.pixels',
    ],
  }, async () => {
    const width = await Screen.getWidth();
    const height = await Screen.getHeight();
    const displays = await Screen.getDisplays();
    const primary = await Screen.getPrimaryDisplay();
    const first = await Screen.getDisplay(displays[0].index);
    const bounds = await Screen.getVirtualBounds();
    assert(width > 0 && height > 0, JSON.stringify({ width, height }));
    assert(Array.isArray(displays) && displays.length > 0, JSON.stringify(displays));
    assert(primary && primary.width > 0 && primary.height > 0, JSON.stringify(primary));
    assert(first && first.width > 0 && first.height > 0, JSON.stringify(first));
    assert(bounds && bounds.width > 0 && bounds.height > 0, JSON.stringify(bounds));
    const point = { x: Math.round(primary.x + primary.width / 2), y: Math.round(primary.y + primary.height / 2) };
    const color = await Screen.pixel(point.x, point.y);
    const colors = await Screen.pixels([point, [point.x, point.y]], false);
    assert(typeof color === 'string' && color.length > 0, JSON.stringify(color));
    assert(Array.isArray(colors) && colors.length === 2, JSON.stringify(colors));
    equal(colors[0], colors[1], 'same screen coordinate returned different colors');
  });
})();
