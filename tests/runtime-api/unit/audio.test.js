(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Audio');

  async function expectAudioError(fn, code, operation) {
    let caught = null;
    try {
      await fn();
    } catch (error) {
      caught = error;
    }
    assert(caught, 'expected Audio error ' + code);
    equal(caught.code, code, 'Audio error code');
    equal(caught.operation, operation, 'Audio error operation');
  }

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
    equal(capabilities.capture.systemAudio.status, 'notImplemented', 'system audio recording status');

    const patternWatch = capabilities.patternWatch;
    assert(patternWatch && typeof patternWatch === 'object', 'patternWatch capability must be present');
    assert(typeof patternWatch.supported === 'boolean', 'patternWatch support must be explicit');
    assert(['experimental', 'unsupported'].includes(patternWatch.status), 'patternWatch status must be explicit');
    assert(typeof patternWatch.backend === 'string' && patternWatch.backend.length > 0, 'patternWatch backend must be explicit');
    assert(typeof patternWatch.verified === 'boolean', 'patternWatch verification must be explicit');
    assert(patternWatch.sources && typeof patternWatch.sources === 'object', 'patternWatch sources must be present');
    assert(typeof patternWatch.sources.system.supported === 'boolean', 'system pattern source support must be explicit');
    assert(typeof patternWatch.sources.system.permission === 'string', 'system pattern source permission must be explicit');
    assert(typeof patternWatch.sources.process.supported === 'boolean', 'process pattern source support must be explicit');
    equal(patternWatch.sources.process.selector, 'pid', 'process source selector');
    assert(Array.isArray(patternWatch.formats), 'reference formats must be an array');
    assert(patternWatch.formats.includes('wav'), 'WAV references must be declared');
    assert(patternWatch.formats.includes('mp3'), 'MP3 references must be declared');
    equal(patternWatch.matcherVersion, 'spectral-template-v1', 'matcher version');
    assert(Number.isInteger(patternWatch.maxReferences) && patternWatch.maxReferences > 0, 'reference limit must be bounded');
    assert(Number.isInteger(patternWatch.minReferenceDurationMs) && patternWatch.minReferenceDurationMs > 0, 'minimum reference duration must be bounded');
    assert(Number.isInteger(patternWatch.maxReferenceDurationMs) && patternWatch.maxReferenceDurationMs >= patternWatch.minReferenceDurationMs, 'maximum reference duration must be bounded');
    assert(Number.isInteger(patternWatch.maxConcurrentWatchers) && patternWatch.maxConcurrentWatchers > 0, 'watcher limit must be bounded');
    assert(['native', 'runtime-guard', 'unavailable'].includes(patternWatch.selfPlaybackExclusion), 'self-playback exclusion must be explicit');
    equal(patternWatch.rawAudioExposed, false, 'raw audio must not be exposed');
    equal(patternWatch.rawAudioPersisted, false, 'raw audio must not be persisted');
    equal(capabilities.devices.setDefaultOutput, false, 'default-output mutation must not be advertised');
    equal(capabilities.playback.namespace, 'Sound', 'playback compatibility namespace');
    equal(capabilities.playback.blocking, true, 'legacy playback must remain blocking');
    equal(capabilities.playback.nonBlocking, true, 'playback sessions must be non-blocking');
    equal(capabilities.playback.controllable, true, 'playback sessions must be controllable');
  });

  test({ name: 'Audio rejects invalid volume before touching the host', tier: 'unit', covers: ['Audio.setVolume'] }, async () => {
    for (const value of [-0.01, 1.01, NaN, Infinity, '50%', null]) {
      await expectAudioError(() => Audio.setVolume(value), 'INVALID_ARGUMENT', 'Audio.setVolume');
    }
  });

  test({ name: 'Audio sound-pattern methods are Promise APIs', tier: 'unit', covers: ['Audio.watchSound', 'Audio.waitForSound'] }, async () => {
    equal(typeof Audio.watchSound, 'function', 'watchSound must be exposed');
    equal(typeof Audio.waitForSound, 'function', 'waitForSound must be exposed');

    const watchPromise = Audio.watchSound({}, () => {});
    assert(watchPromise && typeof watchPromise.then === 'function', 'watchSound must return a Promise');
    await expectAudioError(() => watchPromise, 'INVALID_ARGUMENT', 'Audio.watchSound');

    const waitPromise = Audio.waitForSound({});
    assert(waitPromise && typeof waitPromise.then === 'function', 'waitForSound must return a Promise');
    await expectAudioError(() => waitPromise, 'INVALID_ARGUMENT', 'Audio.waitForSound');
  });

  test({ name: 'Audio sound-pattern options fail before capture startup', tier: 'unit', covers: ['Audio.watchSound', 'Audio.waitForSound'] }, async () => {
    const reference = { id: 'order', path: 'does-not-need-to-exist.wav' };

    await expectAudioError(
      () => Audio.watchSound({ source: { type: 'microphone' }, references: [reference] }, () => {}),
      'INVALID_ARGUMENT',
      'Audio.watchSound',
    );
    await expectAudioError(
      () => Audio.watchSound({ source: { type: 'system' }, references: [] }, () => {}),
      'INVALID_ARGUMENT',
      'Audio.watchSound',
    );
    await expectAudioError(
      () => Audio.watchSound({ source: { type: 'system' }, references: [reference], threshold: 0 }, () => {}),
      'INVALID_ARGUMENT',
      'Audio.watchSound',
    );
    await expectAudioError(
      () => Audio.watchSound({ source: { type: 'system' }, references: [reference], cooldownMs: -1 }, () => {}),
      'INVALID_ARGUMENT',
      'Audio.watchSound',
    );
    await expectAudioError(
      () => Audio.watchSound({ source: { type: 'system' }, references: [reference] }, null),
      'INVALID_ARGUMENT',
      'Audio.watchSound',
    );
    await expectAudioError(
      () => Audio.waitForSound({ source: { type: 'system' }, references: [reference], timeoutMs: 0 }),
      'INVALID_ARGUMENT',
      'Audio.waitForSound',
    );
  });

  test({ name: 'Audio sound-pattern source support fails closed', tier: 'unit', covers: ['Audio.watchSound', 'Audio.waitForSound'] }, async () => {
    const capabilities = Audio.getCapabilities().patternWatch;
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing-reference.wav');
    const options = {
      source: { type: 'system' },
      references: [{ id: 'new-order', path: missing }],
    };
    const expectedCode = capabilities.sources.system.supported ? 'NOT_FOUND' : 'NOT_SUPPORTED';

    await expectAudioError(() => Audio.watchSound(options, () => {}), expectedCode, 'Audio.watchSound');
    await expectAudioError(
      () => Audio.waitForSound({ ...options, timeoutMs: 10 }),
      expectedCode,
      'Audio.waitForSound',
    );
  });
})();
