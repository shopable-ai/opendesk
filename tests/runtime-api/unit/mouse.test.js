(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('mouse');

  test({ name: 'mouse.getPos returns numeric coordinates', tier: 'unit', covers: ['mouse.getPos'] }, async () => {
    const point = await mouse.getPos();
    assert(point && typeof point.x === 'number' && typeof point.y === 'number', JSON.stringify(point));
  });

  test({ name: 'mouse.move accepts a no-displacement move', tier: 'unit', covers: ['mouse.move'] }, async () => {
    const before = await mouse.getPos();
    await mouse.move(before.x, before.y, { steps: 2 });
    const after = await mouse.getPos();
    assert(Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1, JSON.stringify({ before, after }));
  });

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
