(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Sound');

  test({ name: 'Sound.playSound rejects a missing path without audio output', tier: 'unit', covers: ['Sound.playSound'] }, async () => {
    await expectThrow(() => Sound.playSound(`${Execution.artifactDir}/missing.wav`), 'not found');
  });
  test({ name: 'Sound.play alias rejects a missing path without audio output', tier: 'unit', covers: ['Sound.play'] }, async () => {
    await expectThrow(() => Sound.play(`${Execution.artifactDir}/missing.mp3`), 'not found');
  });
})();
