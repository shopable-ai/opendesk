(() => {
  RuntimeAPITest.test({ name: 'touchscreen.tap reaches HTML', tier: 'live', covers: ['touchscreen.tap'] }, async () => {
    const { point } = RuntimeLive.target('button-color');
    await RuntimeLive.reset();
    await touchscreen.tap(point.x, point.y);
    await RuntimeLive.waitForExactCount('click', 1);
    await RuntimeLive.waitForExactCount('pointerdown', 1);
    const snapshot = await RuntimeLive.waitForExactCount('pointerup', 1);
    RuntimeAPITest.assert(snapshot.counts.pointerdown === 1 && snapshot.counts.pointerup === 1, JSON.stringify(snapshot));
  });
})();
