(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Audio');

  test({ name: 'Audio reports explicit platform and capture capabilities', tier: 'unit', covers: ['Audio.getCapabilities'] }, async () => {
    const capabilities = Audio.getCapabilities();
    equal(capabilities.schemaVersion, 1, 'capability schema version');
    assert(typeof capabilities.backend === 'string' && capabilities.backend.length > 0, 'backend must be explicit');
    equal(capabilities.controls.volume.unit, 'scalar', 'volume unit');
    equal(capabilities.controls.volume.minimum, 0, 'volume minimum');
    equal(capabilities.controls.volume.maximum, 1, 'volume maximum');
    equal(capabilities.capture.microphone.supported, false, 'microphone capture must remain unavailable');
    equal(capabilities.capture.microphone.status, 'notImplemented', 'microphone capture status');
    equal(capabilities.capture.systemAudio.supported, false, 'system audio capture must remain unavailable');
    equal(capabilities.devices.setDefaultOutput, false, 'default-output mutation must not be advertised');
    equal(capabilities.playback.namespace, 'Sound', 'playback compatibility namespace');
    equal(capabilities.playback.blocking, true, 'legacy playback must remain blocking');
    equal(capabilities.playback.nonBlocking, true, 'playback sessions must be non-blocking');
    equal(capabilities.playback.controllable, true, 'playback sessions must be controllable');
  });

  test({ name: 'Audio rejects invalid volume before touching the host', tier: 'unit', covers: ['Audio.setVolume'] }, async () => {
    for (const value of [-0.01, 1.01, NaN, Infinity, '50%', null]) {
      await expectThrow(() => Audio.setVolume(value), 'INVALID_ARGUMENT');
    }
  });
})();
