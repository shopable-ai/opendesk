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
    const fixtureDir = File.join(File.cwd(), 'examples', 'image-color', 'fixtures');
    const expectedPath = File.join(fixtureDir, 'expected.png');
    const identicalPath = File.join(fixtureDir, 'actual-identical.png');
    const actualPath = File.join(fixtureDir, 'actual-rgb.png');
    const alphaPath = File.join(fixtureDir, 'actual-alpha.png');
    const ignoredPath = File.join(fixtureDir, 'actual-ignore.png');
    const smallerPath = File.join(fixtureDir, 'different-size.png');
    const expected = ImageColor.loadBase64(expectedPath);
    const bareExpected = expected.slice(expected.indexOf('base64,') + 'base64,'.length);
    const diffPath = `${Execution.artifactDir}/image-diff-output/nested/diff.png`;
    try {
      const identical = ImageColor.diff(identicalPath, expectedPath);
      assert(identical.matched === true && identical.diffPixels === 0
        && identical.changedBounds === null, JSON.stringify(identical));

      const result = ImageColor.diff(actualPath, bareExpected, {
        pixelThreshold: 8,
        maxDiffPixels: 3,
        maxDiffRatio: 0.015625,
        outputPath: diffPath,
        includeDiffImage: true,
      });
      assert(result && result.matched === true, JSON.stringify(result));
      assert(result.width === 16 && result.height === 12 && result.totalPixels === 192, JSON.stringify(result));
      assert(result.comparedPixels === 192 && result.ignoredPixels === 0, JSON.stringify(result));
      assert(result.diffPixels === 3 && result.diffRatio === 0.015625, JSON.stringify(result));
      assert(Math.abs(result.meanAbsoluteError - (73 / 576)) < 1e-12, JSON.stringify(result));
      assert(result.maxChannelDiff === 20, JSON.stringify(result));
      assert(result.changedBounds && result.changedBounds.x === 4 && result.changedBounds.y === 2
        && result.changedBounds.width === 9 && result.changedBounds.height === 8, JSON.stringify(result));
      assert(result.pixelThreshold === 8 && result.includeAlpha === false, JSON.stringify(result));
      assert(result.diffPath === diffPath && await File.exists(diffPath), JSON.stringify(result));
      assert(typeof result.diffImage === 'string' && result.diffImage.startsWith('data:image/png;base64,'), JSON.stringify(result));
      const diffSize = ImageColor.getSize(result.diffImage);
      assert(Array.isArray(diffSize) && diffSize[0] === 16 && diffSize[1] === 12, JSON.stringify(diffSize));

      const alphaIgnored = ImageColor.diff(alphaPath, expectedPath);
      assert(alphaIgnored.matched === true && alphaIgnored.diffPixels === 0, JSON.stringify(alphaIgnored));
      const alphaCompared = ImageColor.diff(alphaPath, expectedPath, { includeAlpha: true });
      assert(alphaCompared.matched === false && alphaCompared.diffPixels === 1
        && alphaCompared.maxChannelDiff === 128
        && alphaCompared.changedBounds.x === 7 && alphaCompared.changedBounds.y === 5,
      JSON.stringify(alphaCompared));

      const overlappingIgnore = ImageColor.diff(ignoredPath, expectedPath, {
        ignoreRegions: [
          { x: 0, y: 0, width: 4, height: 3 },
          { x: 2, y: 1, width: 4, height: 3 },
        ],
      });
      assert(overlappingIgnore.ignoredPixels === 20 && overlappingIgnore.comparedPixels === 172
        && overlappingIgnore.diffPixels === 1
        && overlappingIgnore.changedBounds.x === 14 && overlappingIgnore.changedBounds.y === 10,
      JSON.stringify(overlappingIgnore));

      const allIgnored = ImageColor.diff(actualPath, expectedPath, {
        ignoreRegions: [{ x: -5, y: -5, width: 30, height: 30 }],
      });
      assert(allIgnored.matched === true && allIgnored.comparedPixels === 0
        && allIgnored.diffPixels === 0 && allIgnored.diffRatio === 0
        && allIgnored.meanAbsoluteError === 0 && allIgnored.changedBounds === null, JSON.stringify(allIgnored));

      await RuntimeAPITest.expectThrow(
        () => ImageColor.diff(smallerPath, expectedPath),
        'actual=12x8 expected=16x12',
      );
      await RuntimeAPITest.expectThrow(
        () => ImageColor.diff(actualPath, expectedPath, { ignoreRegions: [{ x: 0, y: 0, width: -1, height: 1 }] }),
        'ignoreRegions[0].width',
      );
    } finally {
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

    const wechatFixtureRoot = File.join(File.cwd(), 'examples', 'image-color', 'fixtures');
    const wechatPanelPath = File.join(wechatFixtureRoot, 'wechat-panel.png');
    const wechatStateSourcePath = File.join(wechatFixtureRoot, 'wechat-sidebar-states.png');
    const statePairs = [
      {
        id: 'messages',
        templates: [
          File.join(wechatFixtureRoot, 'wechat-message', 'unselected.png'),
          File.join(wechatFixtureRoot, 'wechat-message', 'selected.png'),
        ],
        cases: [
          {
            state: 'unselected', sourcePath: wechatStateSourcePath, templateIndex: 0,
            bounds: { x: 18, y: 21, width: 24, height: 22 },
            region: { x: 0, y: 10, width: 60, height: 44 },
          },
          {
            state: 'selected', sourcePath: wechatPanelPath, templateIndex: 1,
            bounds: { x: 18, y: 111, width: 24, height: 22 },
            region: { x: 0, y: 100, width: 60, height: 44 },
          },
        ],
      },
      {
        id: 'contacts',
        templates: [
          File.join(wechatFixtureRoot, 'wechat-sidebar', 'contacts.png'),
          File.join(wechatFixtureRoot, 'wechat-contacts', 'selected.png'),
        ],
        cases: [
          {
            state: 'unselected', sourcePath: wechatPanelPath, templateIndex: 0,
            bounds: { x: 18, y: 159, width: 24, height: 22 },
            region: { x: 0, y: 148, width: 60, height: 44 },
          },
          {
            state: 'selected', sourcePath: wechatStateSourcePath, templateIndex: 1,
            bounds: { x: 18, y: 69, width: 24, height: 22 },
            region: { x: 0, y: 58, width: 60, height: 44 },
          },
        ],
      },
    ];
    assert(File.exists(wechatPanelPath) && File.exists(wechatStateSourcePath), 'WeChat state source fixtures are missing');
    assert(JSON.stringify(ImageColor.getSize(wechatStateSourcePath)) === JSON.stringify([62, 200]),
      'unexpected sanitized WeChat sidebar-state source dimensions');

    const matchKeys = ['found', 'x', 'y', 'width', 'height', 'centerX', 'centerY', 'confidence', 'scale', 'templateIndex'];
    const candidatePositionCount = (sourceSize, templates, region) => templates.reduce((total, template) => {
      const size = ImageColor.getSize(template);
      const width = region ? region.width : sourceSize[0];
      const height = region ? region.height : sourceSize[1];
      return total + Math.max(0, width - size[0] + 1) * Math.max(0, height - size[1] + 1);
    }, 0);
    const expectedStateMatch = (stateCase, match) => match.found === true
      && match.x === stateCase.bounds.x && match.y === stateCase.bounds.y
      && match.width === stateCase.bounds.width && match.height === stateCase.bounds.height
      && match.centerX === stateCase.bounds.x + stateCase.bounds.width / 2
      && match.centerY === stateCase.bounds.y + stateCase.bounds.height / 2
      && match.confidence === 1 && match.scale === 1 && match.templateIndex === stateCase.templateIndex;

    statePairs.forEach((pair) => {
      pair.templates.forEach((path) => assert(File.exists(path), `${pair.id} state fixture is missing: ${path}`));
      const stateTemplates = pair.templates.map((path) => ImageColor.loadBase64(path));
      const stateDiff = ImageColor.diff(stateTemplates[0], stateTemplates[1]);
      assert(stateDiff.matched === false, `${pair.id} selected and unselected templates must differ: ${JSON.stringify(stateDiff)}`);

      pair.cases.forEach((stateCase) => {
        const template = stateTemplates[stateCase.templateIndex];
        const integrity = ImageColor.diff(ImageColor.clip(stateCase.sourcePath, stateCase.bounds), template);
        assert(integrity.matched === true && integrity.diffPixels === 0,
          `${pair.id} ${stateCase.state} crop integrity failed: ${JSON.stringify(integrity)}`);

        const full = ImageColor.findImage(stateCase.sourcePath, pair.templates, { threshold: 1 });
        const roi = ImageColor.findImage(stateCase.sourcePath, pair.templates, {
          threshold: 1,
          region: stateCase.region,
        });
        assert(expectedStateMatch(stateCase, full) && expectedStateMatch(stateCase, roi),
          `${pair.id} ${stateCase.state} state selection failed: ${JSON.stringify({ full, roi })}`);
        matchKeys.forEach((key) => assert(full[key] === roi[key],
          `${pair.id} ${stateCase.state} full image and ROI disagree on ${key}: ${JSON.stringify({ full, roi })}`));

        const opposite = ImageColor.findImage(stateCase.sourcePath, pair.templates[1 - stateCase.templateIndex], {
          threshold: 0.95,
          region: stateCase.region,
        });
        assert(opposite.found === false,
          `${pair.id} ${stateCase.state} must reject the opposite-state template at 0.95: ${JSON.stringify(opposite)}`);

        // A state array is used to classify the current screenshot. The
        // business action gate then searches only for the unselected visual
        // state, so an already-selected toggle is never clicked again.
        const unselectedOnly = ImageColor.findImage(stateCase.sourcePath, pair.templates[0], {
          threshold: 1,
          region: stateCase.region,
        });
        const selectedOnly = ImageColor.findImage(stateCase.sourcePath, pair.templates[1], {
          threshold: 1,
          region: stateCase.region,
        });
        assert(unselectedOnly.found === (stateCase.templateIndex === 0),
          `${pair.id} ${stateCase.state} unselected-only action gate is wrong: ${JSON.stringify(unselectedOnly)}`);
        assert(selectedOnly.found === (stateCase.templateIndex === 1),
          `${pair.id} ${stateCase.state} selected-only probe is wrong: ${JSON.stringify(selectedOnly)}`);

        const sourceSize = ImageColor.getSize(stateCase.sourcePath);
        const fullCandidatePositions = candidatePositionCount(sourceSize, pair.templates);
        const roiCandidatePositions = candidatePositionCount(sourceSize, pair.templates, stateCase.region);
        assert(fullCandidatePositions > 0 && roiCandidatePositions > 0 && roiCandidatePositions < fullCandidatePositions,
          `${pair.id} ${stateCase.state} has invalid deterministic search-space counts: ${JSON.stringify({ fullCandidatePositions, roiCandidatePositions })}`);
      });
    });

    const selectedMessageIcon = ImageColor.loadBase64(statePairs[0].templates[1]);
    const deterministicTie = ImageColor.findImage(wechatPanelPath, [selectedMessageIcon, selectedMessageIcon], {
      threshold: 1,
      region: statePairs[0].cases[1].region,
    });
    assert(deterministicTie.found === true && deterministicTie.templateIndex === 0, JSON.stringify(deterministicTie));

    await RuntimeAPITest.expectThrow(
      () => ImageColor.findImage(sourceDataURL, templatePath, { threshold: 1.01 }),
      'threshold must be between 0 and 1',
    );
    await RuntimeAPITest.expectThrow(
      () => ImageColor.findImage(sourceDataURL, [], { threshold: 0.99 }),
      'template must be a non-empty string array',
    );
    await RuntimeAPITest.expectThrow(
      () => ImageColor.findImage(sourceDataURL, [templatePath, ''], { threshold: 0.99 }),
      'template[1] must be a non-empty string',
    );
    await RuntimeAPITest.expectThrow(
      () => ImageColor.findImages(sourceDataURL, templatePath, { maxResults: 0 }),
      'maxResults must be between 1',
    );
  });
})();
