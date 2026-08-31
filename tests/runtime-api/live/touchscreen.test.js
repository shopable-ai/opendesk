(() => {
  RuntimeAPITest.test({ name: 'touchscreen.tap reaches HTML', tier: 'live', covers: ['touchscreen.tap'] }, async () => {
    const { point } = RuntimeLive.target('button-color');
    await RuntimeLive.reset();
    await touchscreen.tap(point.x, point.y);
    const snapshot = await RuntimeLive.waitForExactCount('click', 1);
    RuntimeAPITest.assert(snapshot.counts.pointerdown === 1 && snapshot.counts.pointerup === 1, JSON.stringify(snapshot));
  });
})();
