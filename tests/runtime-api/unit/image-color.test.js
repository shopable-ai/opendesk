(() => {
  const { assert, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('ImageColor');

  test({
    name: 'ImageColor methods transform and inspect a real isolated screenshot',
    tier: 'unit',
    covers: RuntimeAPIObjects.ImageColor.methods.filter((method) => method !== 'diff').map((method) => `ImageColor.${method}`),
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

  test({
    name: 'ImageColor.diff deterministically compares public image inputs',
    tier: 'unit',
    covers: ['ImageColor.diff'],
  }, async () => {
    const actual = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR42mPgEpH7r2Fk85/BLSDqf0pexX8AMtoHCQBDMTYAAAAASUVORK5CYII=';
    const expected = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAGklEQVR42mPgEpH7r2Fk85/BLSDqf0VexX8AMyoHHchYPi8AAAAASUVORK5CYII=';
    const bareExpected = expected.slice(expected.indexOf('base64,') + 'base64,'.length);
    const actualPath = `${Execution.artifactDir}/image-diff-actual.png`;
    const diffPath = `${Execution.artifactDir}/image-diff-output/nested/diff.png`;
    try {
      assert(await ImageColor.save(actual, actualPath, 'png', 100), 'failed to save deterministic actual image');
      const result = ImageColor.diff(actualPath, bareExpected, {
        pixelThreshold: 8,
        maxDiffPixels: 1,
        maxDiffRatio: 0.25,
        outputPath: diffPath,
        includeDiffImage: true,
      });
      assert(result && result.matched === true, JSON.stringify(result));
      assert(result.width === 2 && result.height === 2 && result.totalPixels === 4, JSON.stringify(result));
      assert(result.comparedPixels === 4 && result.ignoredPixels === 0, JSON.stringify(result));
      assert(result.diffPixels === 1 && result.diffRatio === 0.25, JSON.stringify(result));
      assert(Math.abs(result.meanAbsoluteError - (20 / 12)) < 1e-12, JSON.stringify(result));
      assert(result.maxChannelDiff === 20, JSON.stringify(result));
      assert(result.changedBounds && result.changedBounds.x === 1 && result.changedBounds.y === 1
        && result.changedBounds.width === 1 && result.changedBounds.height === 1, JSON.stringify(result));
      assert(result.pixelThreshold === 8 && result.includeAlpha === false, JSON.stringify(result));
      assert(result.diffPath === diffPath && await File.exists(diffPath), JSON.stringify(result));
      assert(typeof result.diffImage === 'string' && result.diffImage.startsWith('data:image/png;base64,'), JSON.stringify(result));
      const diffSize = ImageColor.getSize(result.diffImage);
      assert(Array.isArray(diffSize) && diffSize[0] === 2 && diffSize[1] === 2, JSON.stringify(diffSize));

      const allIgnored = ImageColor.diff(actual, expected, {
        ignoreRegions: [{ x: -5, y: -5, width: 20, height: 20 }],
      });
      assert(allIgnored.matched === true && allIgnored.comparedPixels === 0
        && allIgnored.diffPixels === 0 && allIgnored.diffRatio === 0
        && allIgnored.meanAbsoluteError === 0 && allIgnored.changedBounds === null, JSON.stringify(allIgnored));

      const smaller = ImageColor.resize(actual, 1, 1);
      await RuntimeAPITest.expectThrow(
        () => ImageColor.diff(actual, smaller),
        'actual=2x2 expected=1x1',
      );
      await RuntimeAPITest.expectThrow(
        () => ImageColor.diff(actual, expected, { ignoreRegions: [{ x: 0, y: 0, width: -1, height: 1 }] }),
        'ignoreRegions[0].width',
      );
    } finally {
      if (await File.exists(actualPath)) await File.remove(actualPath);
      if (await File.exists(diffPath)) await File.remove(diffPath);
    }
  });
})();
