(() => {
  RuntimeAPITest.test({ name: 'Screen.screenshot returns exact clip metadata', tier: 'live', covers: ['Screen.screenshot'] }, async () => {
    const { point } = RuntimeLive.target('color-swatch');
    const path = `${Execution.artifactDir}/host-api-screen-screenshot.png`;
    try {
      const result = await Screen.screenshot({
        clip: { x: point.x - 16, y: point.y - 16, width: 32, height: 32 },
        path,
        returnType: 'object',
      });
      RuntimeAPITest.equal(result.width, 32, JSON.stringify(result));
      RuntimeAPITest.equal(result.height, 32, JSON.stringify(result));
      RuntimeAPITest.assert(result.sizeBytes > 100 && await File.exists(path), JSON.stringify(result));
    } finally {
      if (await File.exists(path)) await File.remove(path);
    }
  });
})();
