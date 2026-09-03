;(async () => {
  const run = async () => {
    const screenshot = await Screen.screenshot({
      target: 'activeWindow',
      returnType: 'base64',
    });
    const size = ImageColor.getSize(screenshot);
    const assert = globalThis.RuntimeAPITest ? RuntimeAPITest.assert : (condition, message) => {
      if (!condition) throw new Error(message || 'assertion failed');
    };
    assert(Array.isArray(size) && size[0] >= 8 && size[1] >= 8, JSON.stringify(size));
    const template = ImageColor.clip(screenshot, {
      x: 0,
      y: 0,
      width: Math.min(16, size[0]),
      height: Math.min(16, size[1]),
    });
    const match = ImageColor.findImage(screenshot, template, { threshold: 1 });
    assert(match && match.found === true && match.x === 0 && match.y === 0, JSON.stringify(match));
  };

  if (globalThis.RuntimeAPITest) {
    RuntimeAPITest.test({
      name: 'Screen activeWindow screenshot composes with ImageColor.findImage',
      tier: 'live',
      covers: ['Screen.screenshot', 'ImageColor.findImage'],
    }, run);
    return;
  }
  await run();
})();
