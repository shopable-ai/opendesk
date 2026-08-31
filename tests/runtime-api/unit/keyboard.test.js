(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('keyboard');

  test({ name: 'keyboard.type rejects empty input', tier: 'unit', covers: ['keyboard.type'] }, async () => {
    await expectThrow(() => keyboard.type(''), 'cannot be empty');
  });
  test({ name: 'keyboard.press rejects an empty key', tier: 'unit', covers: ['keyboard.press'] }, async () => {
    await expectThrow(() => keyboard.press(''), 'cannot be empty');
  });
  test({ name: 'keyboard.down rejects an empty key', tier: 'unit', covers: ['keyboard.down'] }, async () => {
    await expectThrow(() => keyboard.down(''), 'cannot be empty');
  });
  test({ name: 'keyboard.up rejects an empty key', tier: 'unit', covers: ['keyboard.up'] }, async () => {
    await expectThrow(() => keyboard.up(''), 'cannot be empty');
  });
  test({ name: 'keyboard.combination rejects an empty chord', tier: 'unit', covers: ['keyboard.combination'] }, async () => {
    await expectThrow(() => keyboard.combination(), 'no keys provided');
  });
})();
