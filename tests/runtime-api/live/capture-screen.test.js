(() => {
  const { assert, equal, test } = RuntimeAPITest;
  test({ name: 'page.captureScreen records a real fixture region', tier: 'live', covers: ['page.captureScreen'] }, async () => {
    await RuntimeLive.openWith('openURLInApp', 'capture-screen');
    const { point } = RuntimeLive.target('button-primary');
    const path = File.join(RuntimeAPITest.context.runDir, 'evidence', 'capture-screen.png');
    const result = await page.captureScreen({
      clip: { x: point.x - 20, y: point.y - 20, width: 40, height: 40 },
      path,
      returnType: 'object',
    });
    assert(result && await File.exists(path), 'captureScreen did not produce the requested evidence file');
    if (typeof result === 'object') {
      equal(result.width, 40, JSON.stringify(result));
      equal(result.height, 40, JSON.stringify(result));
    }
  });
})();
