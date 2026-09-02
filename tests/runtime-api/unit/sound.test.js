(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Sound');

  test({ name: 'Sound exposes the controllable playback lifecycle', tier: 'unit', covers: ['Sound.start', 'Sound.playAsync', 'Sound.stop', 'Sound.stopAll', 'Sound.getActive'] }, async () => {
    const active = Sound.getActive();
    if (!Array.isArray(active) || active.length !== 0) throw new Error('fresh Sound runtime must have no active playback');
    if (Sound.stopAll() !== 0) throw new Error('stopAll must report no work for an empty runtime');
    if (Sound.stop('unknown-playback') !== false) throw new Error('unknown playback stop must be false');
  });

  test({ name: 'Sound.start validates options before opening audio', tier: 'unit', covers: ['Sound.start'] }, async () => {
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing.wav');
    await expectThrow(() => Sound.start(missing, { loop: 'yes' }), 'INVALID_ARGUMENT');
    await expectThrow(() => Sound.start(missing, { extra: true }), 'INVALID_ARGUMENT');
    await expectThrow(() => Sound.start(missing, { loop: true }), 'NOT_FOUND');
  });

  test({ name: 'Sound.playAsync is the non-blocking start alias', tier: 'unit', covers: ['Sound.playAsync'] }, async () => {
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing.mp3');
    await expectThrow(() => Sound.playAsync(missing), 'NOT_FOUND');
  });

  test({ name: 'Sound.stop validates playback ids', tier: 'unit', covers: ['Sound.stop'] }, async () => {
    await expectThrow(() => Sound.stop(), 'INVALID_ARGUMENT');
    await expectThrow(() => Sound.stop(42), 'INVALID_ARGUMENT');
  });

  test({ name: 'Sound.playSound rejects a missing path without audio output', tier: 'unit', covers: ['Sound.playSound'] }, async () => {
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing.wav');
    await expectThrow(() => Sound.playSound(missing), 'not found');
  });
  test({ name: 'Sound.play alias rejects a missing path without audio output', tier: 'unit', covers: ['Sound.play'] }, async () => {
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing.mp3');
    await expectThrow(() => Sound.play(missing), 'not found');
  });
})();
