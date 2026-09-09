(() => {
  const { assert, equal, test } = RuntimeAPITest;

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
    await RuntimeLive.waitForExactCount('click', 1);
    await RuntimeLive.waitForExactCount('pointerdown', 1);
    const snapshot = await RuntimeLive.waitForExactCount('pointerup', 1);
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

  test({ name: 'mouse.down move and mouse.up preserve held-button drag semantics', tier: 'live', covers: ['mouse.move', 'mouse.down', 'mouse.up'] }, async () => {
    const value = 'recorder-drag-business-proof';
    const replacement = 'D';
    const target = RuntimeLive.target('input-name');
    const y = Math.round(target.viewportOrigin.y + (target.rect.top + target.rect.bottom) / 2);
    const clientY = Math.round((target.rect.top + target.rect.bottom) / 2);
    const startClientX = Math.round(target.rect.right - 8);
    const endClientX = Math.round(target.rect.left + 8);
    const startX = Math.round(target.viewportOrigin.x + startClientX);
    const endX = Math.round(target.viewportOrigin.x + endClientX);

    await RuntimeLive.reset();
    await mouse.click(target.point.x, target.point.y);
    await RuntimeLive.waitForExactCount('pointerup', 1);
    await keyboard.type(value);
    await RuntimeLive.waitForEvent('input', event => event.detail && event.detail.value === value);

    await mouse.move(startX, y);
    const startActual = mouse.getPos();
    assert(Math.abs(startActual.x - startX) <= 2 && Math.abs(startActual.y - y) <= 2, JSON.stringify({ startX, y, startActual }));
    let pressed = false;
    try {
      await mouse.down({ button: 'left' });
      pressed = true;
      await RuntimeLive.waitForEvent(
        'pointerdown',
        event => event.detail && Math.abs(event.detail.x - startClientX) <= 2 && Math.abs(event.detail.y - clientY) <= 2,
      );
      await mouse.move(endX, y, { steps: 37 });
    } finally {
      if (pressed) await mouse.up({ button: 'left' });
    }
    await RuntimeLive.waitForEvent(
      'pointerup',
      event => event.detail && Math.abs(event.detail.x - endClientX) <= 2 && Math.abs(event.detail.y - clientY) <= 2,
    );

    await keyboard.type(replacement);
    const snapshot = await RuntimeLive.waitForEvent(
      'input',
      event => event.detail && event.detail.value === replacement,
    );
    equal(snapshot.telemetry.uiState.name, replacement, JSON.stringify({
      start: { x: startX, y },
      end: { x: endX, y },
      state: snapshot.telemetry.uiState,
      events: snapshot.events,
    }));
    console.log(`[RUNTIME-API-LIVE DRAG BUSINESS] ${JSON.stringify({
      initialValue: value,
      finalValue: snapshot.telemetry.uiState.name,
      start: { x: startX, y },
      end: { x: endX, y },
      steps: 37,
    })}`);
  });

})();
