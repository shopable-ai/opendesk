(() => {
  const { assert, test } = RuntimeAPITest;

  async function focusAndClearInput() {
    const { point } = RuntimeLive.target('input-command');
    await RuntimeLive.reset();
    await mouse.click(point.x, point.y);
    const clicked = await RuntimeLive.waitForExactCount('click', 1);
    assert(
      RuntimeLive.events(clicked, 'click').some((event) => (
        (event.target || event.detail && event.detail.target) === 'input-command'
        && event.detail && event.detail.telemetry && event.detail.telemetry.activeElement === 'input-command'
      )),
      `click did not focus HTML input: ${JSON.stringify(clicked)}`,
    );
    await keyboard.combination('Meta', 'a');
    await keyboard.press('Backspace');
    await RuntimeLive.reset();
  }

  test({ name: 'keyboard.type updates focused HTML input', tier: 'live', covers: ['keyboard.type'] }, async () => {
    await focusAndClearInput();
    const value = 'host-type-42';
    await keyboard.type(value);
    const snapshot = await RuntimeLive.waitForEvent('input', (event) => (
      event.target === 'input-command'
      && event.detail && event.detail.value === value
    ));
    const values = RuntimeLive.events(snapshot, 'input').map((event) => event.detail && event.detail.value);
    assert(values.includes(value), JSON.stringify({ values, snapshot }));
  });

  test({ name: 'keyboard.press emits ArrowDown key events', tier: 'live', covers: ['keyboard.press'] }, async () => {
    await focusAndClearInput();
    await keyboard.press('ArrowDown');
    const snapshot = await RuntimeLive.waitForCount('keyup', 1);
    const keys = RuntimeLive.events(snapshot, 'keydown').map((event) => event.detail && event.detail.key);
    assert(keys.includes('ArrowDown'), JSON.stringify(keys));
  });

  test({ name: 'keyboard.down and keyboard.up preserve key pairing', tier: 'live', covers: ['keyboard.down', 'keyboard.up'] }, async () => {
    await focusAndClearInput();
    let pressed = false;
    try {
      await keyboard.down('Shift');
      pressed = true;
      const down = await RuntimeLive.waitForCount('keydown', 1);
      assert(RuntimeLive.events(down, 'keydown').some((event) => event.detail && event.detail.key === 'Shift'), JSON.stringify(down));
    } finally {
      if (pressed) await keyboard.up('Shift');
    }
    const up = await RuntimeLive.waitForCount('keyup', 1);
    assert(RuntimeLive.events(up, 'keyup').some((event) => event.detail && event.detail.key === 'Shift'), JSON.stringify(up));
  });

  test({ name: 'keyboard.combination emits a Shift+q chord', tier: 'live', covers: ['keyboard.combination'] }, async () => {
    await focusAndClearInput();
    await keyboard.combination('Shift', 'q');
    const snapshot = await RuntimeLive.waitForCount('keyup', 1);
    const downs = RuntimeLive.events(snapshot, 'keydown');
    const ups = RuntimeLive.events(snapshot, 'keyup');
    assert(downs.some((event) => event.detail && event.detail.key === 'Q' && event.detail.shiftKey === true), JSON.stringify({ downs, ups }));
    assert(ups.some((event) => event.detail && event.detail.key === 'Q'), JSON.stringify({ downs, ups }));
  });
})();
