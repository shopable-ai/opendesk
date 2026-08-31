(() => {
  const { assert, test } = RuntimeAPITest;

  test({ name: 'mouse.move reaches target and mouse.getPos confirms it', tier: 'live', covers: ['mouse.move', 'mouse.getPos'] }, async () => {
    const { point } = RuntimeLive.target('input-name');
    let actual = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await mouse.move(point.x, point.y, { steps: 8 });
      await page.waitFor(25);
      actual = await mouse.getPos();
      if (Math.abs(actual.x - point.x) <= 2 && Math.abs(actual.y - point.y) <= 2) break;
    }
    assert(Math.abs(actual.x - point.x) <= 2 && Math.abs(actual.y - point.y) <= 2, JSON.stringify({ point, actual }));
  });

  test({ name: 'mouse.click default path reaches HTML', tier: 'live', covers: ['mouse.click'] }, async () => {
    const { point } = RuntimeLive.target('button-primary');
    await RuntimeLive.reset();
    await mouse.click(point.x, point.y);
    const snapshot = await RuntimeLive.waitForExactCount('click', 1);
    assert(snapshot.counts.pointerdown === 1 && snapshot.counts.pointerup === 1, JSON.stringify(snapshot));
  });

  test({ name: 'mouse.click explicit delay reaches HTML', tier: 'live', covers: ['mouse.click'] }, async () => {
    const { point } = RuntimeLive.target('button-color');
    await RuntimeLive.reset();
    await mouse.click(point.x, point.y, { delay: 30 });
    await RuntimeLive.waitForExactCount('click', 1);
  });

  test({ name: 'page.mouse.click honors clickCount', tier: 'live', covers: ['mouse.click'] }, async () => {
    const { point } = RuntimeLive.target('button-counter');
    await RuntimeLive.reset();
    await page.mouse.click(point.x, point.y, { clickCount: 2 });
    const snapshot = await RuntimeLive.waitForExactCount('click', 2);
    assert(snapshot.counts.pointerdown >= 1 && snapshot.counts.pointerup >= 1, JSON.stringify(snapshot));
  });

  test({ name: 'mouse.down and mouse.up produce a paired pointer sequence', tier: 'live', covers: ['mouse.down', 'mouse.up'] }, async () => {
    const { point } = RuntimeLive.target('button-reset');
    await mouse.move(point.x, point.y);
    await RuntimeLive.reset();
    let pressed = false;
    try {
      await mouse.down({ button: 'left' });
      pressed = true;
      await RuntimeLive.waitForExactCount('pointerdown', 1);
    } finally {
      if (pressed) await mouse.up({ button: 'left' });
    }
    await RuntimeLive.waitForExactCount('pointerup', 1);
  });

})();
