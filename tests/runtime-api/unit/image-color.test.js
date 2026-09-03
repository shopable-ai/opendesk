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

  test({
    name: 'ImageColor.findImage and findImages expose canonical template matching',
    tier: 'unit',
    covers: ['ImageColor.findImage', 'ImageColor.findImages', 'ImageColor.findPos'],
  }, async () => {
    const fixtureDir = File.join(File.cwd(), 'tests', 'opencv', 'fixtures', 'image-color');
    const sourcePath = File.join(fixtureDir, 'scene_color_blocks.png');
    const templatePath = File.join(fixtureDir, 'template_blue-panel.png');
    const sourceDataURL = ImageColor.loadBase64(sourcePath);
    const sourceRawBase64 = sourceDataURL.slice(sourceDataURL.indexOf('base64,') + 'base64,'.length);
    const options = {
      threshold: 0.99,
      region: { x: 200, y: 120, width: 100, height: 90 },
      scales: [0.9, 1, 1.1],
    };

    const match = ImageColor.findImage(sourceRawBase64, templatePath, options);
    assert(match && match.found === true, JSON.stringify(match));
    assert(match.x === 202 && match.y === 132 && match.width === 88 && match.height === 64, JSON.stringify(match));
    assert(match.centerX === 246 && match.centerY === 164 && match.scale === 1, JSON.stringify(match));
    assert(match.confidence === 1, JSON.stringify(match));

    const matches = ImageColor.findImages(sourceDataURL, templatePath, { ...options, maxResults: 20 });
    assert(Array.isArray(matches) && matches.length === 1, JSON.stringify(matches));
    assert(matches[0].x === 202 && matches[0].y === 132 && matches[0].scale === 1, JSON.stringify(matches));

    const outside = ImageColor.findImage(sourceDataURL, templatePath, {
      threshold: 0.99,
      region: { x: 0, y: 0, width: 100, height: 100 },
    });
    assert(outside.found === false && outside.x === -1 && outside.y === -1, JSON.stringify(outside));

    const legacy = ImageColor.findPos(sourcePath, templatePath, 0.99);
    assert(legacy.found === true && legacy.x === 202 && legacy.y === 132, JSON.stringify(legacy));
    assert(!Object.prototype.hasOwnProperty.call(legacy, 'scale'), JSON.stringify(legacy));

    await RuntimeAPITest.expectThrow(
      () => ImageColor.findImage(sourceDataURL, templatePath, { threshold: 1.01 }),
      'threshold must be between 0 and 1',
    );
    await RuntimeAPITest.expectThrow(
      () => ImageColor.findImages(sourceDataURL, templatePath, { maxResults: 0 }),
      'maxResults must be between 1',
    );
  });
})();
