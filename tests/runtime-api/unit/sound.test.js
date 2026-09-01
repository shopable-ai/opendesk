(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Sound');

  test({ name: 'Sound.playSound rejects a missing path without audio output', tier: 'unit', covers: ['Sound.playSound'] }, async () => {
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing.wav');
    await expectThrow(() => Sound.playSound(missing), 'not found');
  });
  test({ name: 'Sound.play alias rejects a missing path without audio output', tier: 'unit', covers: ['Sound.play'] }, async () => {
    const missing = File.join('.runtime', 'tests', 'runtime-api', Execution.executionId, 'missing.mp3');
    await expectThrow(() => Sound.play(missing), 'not found');
  });
})();
