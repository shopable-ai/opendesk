(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Screen');

  test({
    name: 'Screen metadata and pixel APIs agree on the primary display',
    tier: 'unit',
    covers: [
      'Screen.getWidth', 'Screen.getHeight', 'Screen.getDisplays', 'Screen.getPrimaryDisplay',
      'Screen.getDisplay', 'Screen.getVirtualBounds', 'Screen.pixel', 'Screen.pixels',
      'Screen.getDisplayCapabilities', 'Screen.getDisplayMode', 'Screen.listDisplayModes',
      'Screen.setDisplayMode',
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
    assert(typeof displays[0].id === 'string' && displays[0].id.length > 0, JSON.stringify(displays[0]));
    assert(typeof displays[0].hardwareId === 'string' && displays[0].hardwareId.length > 0, JSON.stringify(displays[0]));
    assert(primary && primary.width > 0 && primary.height > 0, JSON.stringify(primary));
    assert(first && first.width > 0 && first.height > 0, JSON.stringify(first));
    assert(bounds && bounds.width > 0 && bounds.height > 0, JSON.stringify(bounds));
    const point = { x: Math.round(primary.x + primary.width / 2), y: Math.round(primary.y + primary.height / 2) };
    const color = await Screen.pixel(point.x, point.y);
    const colors = await Screen.pixels([point, [point.x, point.y]], false);
    assert(typeof color === 'string' && color.length > 0, JSON.stringify(color));
    assert(Array.isArray(colors) && colors.length === 2, JSON.stringify(colors));
    equal(colors[0], colors[1], 'same screen coordinate returned different colors');

    const capabilities = Screen.getDisplayCapabilities();
    equal(capabilities.schemaVersion, 1, 'display capability schema version');
    equal(capabilities.inventory.namespace, 'Screen', 'display inventory namespace');
    equal(capabilities.brightness.read, false, 'brightness read must not be implied');
    equal(capabilities.brightness.write, false, 'brightness write must not be implied');
    if (capabilities.modes.read) {
      const currentMode = Screen.getDisplayMode(primary.id);
      const modes = Screen.listDisplayModes(primary.id);
      assert(currentMode && currentMode.isCurrent === true && typeof currentMode.id === 'string', JSON.stringify(currentMode));
      assert(Array.isArray(modes) && modes.length > 0, JSON.stringify(modes));
      assert(modes.some((mode) => mode.id === currentMode.id && mode.isCurrent === true), JSON.stringify({ currentMode, modes }));
      await expectThrow(() => Screen.setDisplayMode(primary.id, 'missing-mode'), 'NOT_FOUND');
    } else {
      await expectThrow(() => Screen.getDisplayMode(primary.id), 'NOT_SUPPORTED');
    }
  });

  test({
    name: 'Screen capture reports explicit experimental boundaries and validates before native UI',
    tier: 'unit',
    covers: ['Screen.getCaptureCapabilities', 'Screen.selectRegion', 'Screen.startRecording'],
  }, async () => {
    const capabilities = Screen.getCaptureCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'backend must be explicit');
    equal(capabilities.audio.system, false, 'system audio must not be implied');
    equal(capabilities.audio.microphone, false, 'microphone audio must not be implied');
    equal(capabilities.audio.namespace, 'Audio', 'audio ownership');
    equal(capabilities.frameStream.supported, false, 'frame stream must not be implied');
    equal(capabilities.frameStream.status, 'notImplemented', 'frame stream status');
    await expectThrow(() => Screen.selectRegion({ minWidth: 1 }), 'INVALID_ARGUMENT');
    await expectThrow(() => Screen.startRecording({
      target: { type: 'display', displayIndex: 1 },
      output: 'relative.mov',
    }), 'INVALID_ARGUMENT');
  });
})();
