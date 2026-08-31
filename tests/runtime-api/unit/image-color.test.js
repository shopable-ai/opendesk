(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('ImageColor');

  test({
    name: 'ImageColor methods transform and inspect a real isolated screenshot',
    tier: 'unit',
    covers: RuntimeAPIObjects.ImageColor.methods.map((method) => `ImageColor.${method}`),
  }, async () => {
    const source = await Screen.screenshot({
      clip: { x: 0, y: 0, width: 16, height: 16 },
      returnType: 'base64',
    });
    assert(typeof source === 'string' && source.includes('base64,'), 'Screen did not return an image data URL');
    const path = `${Execution.artifactDir}/host-api-image-color.png`;
    try {
      assert(await ImageColor.save(source, path, 'png', 100), 'ImageColor.save returned false');
      const loaded = await ImageColor.loadBase64(path);
      const resized = await ImageColor.resize(loaded, 8, 8);
      const clipped = await ImageColor.clip(resized, { x: 0, y: 0, width: 4, height: 4 });
      const size = await ImageColor.getSize(clipped);
      assert(Array.isArray(size) && size[0] === 4 && size[1] === 4, JSON.stringify(size));
      const color = await ImageColor.pixel(clipped, 0, 0);
      assert(/^#[0-9a-f]{6}$/i.test(color), color);
      const rawPosition = await ImageColor.findColor(clipped, color, { x: 0, y: 0, width: 4, height: 4, threshold: 0 });
      assert(typeof rawPosition === 'string' && rawPosition.includes('x'), rawPosition);
      const blocks = await ImageColor.findColorBlocks(clipped, color, { x: 0, y: 0, width: 4, height: 4, threshold: 0 });
      assert(Array.isArray(blocks), JSON.stringify(blocks));
      assert(await ImageColor.hasColor(clipped, color, 0, 0, 4, 4, 0));
      assert(typeof await ImageColor.isGray(clipped, 0, 0, 4, 4, 10) === 'boolean');
      assert(typeof await ImageColor.findRedChannel(clipped, 0, 0, 4, 4) === 'string');
      assert(typeof await ImageColor.findGreenChannel(clipped, 0, 0, 4, 4) === 'string');
      assert(typeof await ImageColor.findBlueChannel(clipped, 0, 0, 4, 4) === 'string');
      assert((await ImageColor.toRGB('#ff0000')).startsWith('rgb('));
      assert((await ImageColor.toRGBA('#ff0000')).startsWith('rgba('));
      assert((await ImageColor.toHSL('#ff0000')).startsWith('hsl('));
      assert((await ImageColor.toHSLA('#ff0000')).startsWith('hsla('));
      const similarity = await ImageColor.isColorSimilar('#ff0000', '#ff0001', 2);
      assert(similarity && typeof similarity === 'object', JSON.stringify(similarity));
      const match = await ImageColor.findPos(resized, clipped, 0);
      assert(match && typeof match.found === 'boolean', JSON.stringify(match));
    } finally {
      if (await File.exists(path)) await File.remove(path);
    }
  });
})();
