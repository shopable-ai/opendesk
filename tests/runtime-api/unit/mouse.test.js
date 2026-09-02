(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('mouse');

  test({ name: 'mouse.click rejects invalid buttons before OS input', tier: 'unit', covers: ['mouse.click'] }, async () => {
    await expectThrow(() => mouse.click(0, 0, { button: 'invalid' }), 'invalid button type');
  });

  test({ name: 'mouse.clickForPID rejects an invalid PID before AX access', tier: 'unit', covers: ['mouse.clickForPID'] }, async () => {
    await expectThrow(() => mouse.clickForPID(0, 0, 0), 'processID');
  });

  test({ name: 'mouse.down rejects invalid buttons before OS input', tier: 'unit', covers: ['mouse.down'] }, async () => {
    await expectThrow(() => mouse.down({ button: 'invalid' }), 'invalid button type');
  });

  test({ name: 'mouse.up rejects invalid buttons before OS input', tier: 'unit', covers: ['mouse.up'] }, async () => {
    await expectThrow(() => mouse.up({ button: 'invalid' }), 'invalid button type');
  });

  test({ name: 'mouse.wheel accepts a zero-delta request', tier: 'unit', covers: ['mouse.wheel'] }, async () => {
    await mouse.wheel({ deltaX: 0, deltaY: 0, steps: 2, delay: 0 });
  });
})();
