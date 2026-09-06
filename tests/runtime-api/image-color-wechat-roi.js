// Focused Runtime API scenario. Run from the repository root with:
// ./opendesk -script tests/runtime-api/image-color-wechat-roi.js -console-mode script
//
// Sidebar templates are real crops from fixture screenshots. In addition to
// single-template button coverage, this test proves that each true state pair
// finds the correct #0/#1 state and that the business action gate only clicks
// the unselected template before verifying the selected postcondition.
;(async () => {
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function candidatePositionCount(sourceSize, template, region) {
    const width = region ? region.width : sourceSize[0];
    const height = region ? region.height : sourceSize[1];
    const size = ImageColor.getSize(template);
    return Math.max(0, width - size[0] + 1) * Math.max(0, height - size[1] + 1);
  }

  function sameMatch(left, right) {
    return ['found', 'x', 'y', 'width', 'height', 'centerX', 'centerY', 'confidence', 'scale', 'templateIndex']
      .every((key) => left[key] === right[key]);
  }

  function expectedMatch(button, match) {
    return match.found === true
      && match.x === button.x && match.y === button.y
      && match.width === button.width && match.height === button.height
      && match.centerX === button.x + button.width / 2 && match.centerY === button.y + button.height / 2
      && match.confidence === 1 && match.scale === 1 && match.templateIndex === 0;
  }

  const panelPath = './examples/image-color/fixtures/wechat-panel.png';
  const selectedPath = './examples/image-color/fixtures/wechat-message/selected.png';
  const unselectedPath = './examples/image-color/fixtures/wechat-message/unselected.png';
  const stateSourcePath = './examples/image-color/fixtures/wechat-sidebar-states.png';
  const sidebarButtons = [
    { id: 'messages', label: '消息（已选中）', templatePath: selectedPath, x: 18, y: 111, regionY: 100 },
    { id: 'contacts', label: '联系人', templatePath: './examples/image-color/fixtures/wechat-sidebar/contacts.png', x: 18, y: 159, regionY: 148 },
    { id: 'favorites', label: '收藏', templatePath: './examples/image-color/fixtures/wechat-sidebar/favorites.png', x: 18, y: 207, regionY: 196 },
    { id: 'channels', label: '视频号', templatePath: './examples/image-color/fixtures/wechat-sidebar/channels.png', x: 18, y: 255, regionY: 244 },
    { id: 'mini-programs', label: '小程序', templatePath: './examples/image-color/fixtures/wechat-sidebar/mini-programs.png', x: 18, y: 303, regionY: 292 },
    { id: 'look', label: '看一看', templatePath: './examples/image-color/fixtures/wechat-sidebar/look.png', x: 18, y: 351, regionY: 340 },
    { id: 'mobile', label: '手机', templatePath: './examples/image-color/fixtures/wechat-sidebar/mobile.png', x: 18, y: 548, regionY: 537 },
    { id: 'settings', label: '设置与菜单', templatePath: './examples/image-color/fixtures/wechat-sidebar/settings.png', x: 14, y: 592, width: 32, height: 28, regionY: 584 },
  ].map((button) => ({
    ...button,
    width: button.width || 24,
    height: button.height || 22,
    region: { x: 0, y: button.regionY, width: 60, height: 44 },
  }));

  const selectedExists = File.exists(selectedPath);
  const unselectedExists = File.exists(unselectedPath);
  assert(selectedExists && unselectedExists && File.exists(stateSourcePath),
    `WeChat message state fixtures are missing: ${JSON.stringify({ selectedPath, unselectedPath, stateSourcePath })}`);
  assert(JSON.stringify(ImageColor.getSize(stateSourcePath)) === JSON.stringify([62, 200]),
    'unexpected sanitized sidebar-state source dimensions');

  const panelSize = ImageColor.getSize(panelPath);
  const sidebarEvidence = sidebarButtons.map((button) => {
    assert(File.exists(button.templatePath), `sidebar fixture is missing: ${button.templatePath}`);
    const template = ImageColor.loadBase64(button.templatePath);
    const sourceCrop = ImageColor.clip(panelPath, {
      x: button.x, y: button.y, width: button.width, height: button.height,
    });
    const integrity = ImageColor.diff(sourceCrop, template);
    assert(integrity.matched === true && integrity.diffPixels === 0,
      `${button.id} fixture differs from its panel crop: ${JSON.stringify(integrity)}`);

    const timedFind = (options) => {
      const startedAt = Date.now();
      return { result: ImageColor.findImage(panelPath, template, options), durationMs: Date.now() - startedAt };
    };
    const full = timedFind({ threshold: 1 });
    const roi = timedFind({ threshold: 1, region: button.region });
    assert(expectedMatch(button, full.result) && expectedMatch(button, roi.result)
      && sameMatch(full.result, roi.result),
    `${button.id} full image and ROI must resolve the exact same match: ${JSON.stringify({ full, roi })}`);

    const fullCandidatePositions = candidatePositionCount(panelSize, template);
    const roiCandidatePositions = candidatePositionCount(panelSize, template, button.region);
    assert(fullCandidatePositions > 0 && roiCandidatePositions > 0
      && roiCandidatePositions < fullCandidatePositions,
    `${button.id} has invalid deterministic search-space counts: ${JSON.stringify({ fullCandidatePositions, roiCandidatePositions })}`);

    return {
      id: button.id,
      label: button.label,
      templatePath: button.templatePath,
      expectedBounds: { x: button.x, y: button.y, width: button.width, height: button.height },
      region: button.region,
      integrity,
      full: { ...full, candidatePositions: fullCandidatePositions },
      roi: { ...roi, candidatePositions: roiCandidatePositions },
      candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
      checks: {
        templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
        expectedHit: expectedMatch(button, full.result) && expectedMatch(button, roi.result),
        sameMatch: sameMatch(full.result, roi.result),
        reducedSearchSpace: roiCandidatePositions < fullCandidatePositions,
      },
    };
  });

  const statePairs = [
    {
      id: 'messages',
      templates: [unselectedPath, selectedPath],
      cases: [
        {
          state: 'unselected', sourcePath: stateSourcePath, templateIndex: 0,
          bounds: { x: 18, y: 21, width: 24, height: 22 },
          region: { x: 0, y: 10, width: 60, height: 44 },
        },
        {
          state: 'selected', sourcePath: panelPath, templateIndex: 1,
          bounds: { x: 18, y: 111, width: 24, height: 22 },
          region: { x: 0, y: 100, width: 60, height: 44 },
        },
      ],
    },
    {
      id: 'contacts',
      templates: [
        './examples/image-color/fixtures/wechat-sidebar/contacts.png',
        './examples/image-color/fixtures/wechat-contacts/selected.png',
      ],
      cases: [
        {
          state: 'unselected', sourcePath: panelPath, templateIndex: 0,
          bounds: { x: 18, y: 159, width: 24, height: 22 },
          region: { x: 0, y: 148, width: 60, height: 44 },
        },
        {
          state: 'selected', sourcePath: stateSourcePath, templateIndex: 1,
          bounds: { x: 18, y: 69, width: 24, height: 22 },
          region: { x: 0, y: 58, width: 60, height: 44 },
        },
      ],
    },
  ];
  const stateEvidence = statePairs.map((pair) => {
    pair.templates.forEach((template) => assert(File.exists(template), `${pair.id} template is missing: ${template}`));
    const templateImages = pair.templates.map((template) => ImageColor.loadBase64(template));
    const stateDiff = ImageColor.diff(templateImages[0], templateImages[1]);
    assert(stateDiff.matched === false, `${pair.id} state templates must differ: ${JSON.stringify(stateDiff)}`);
    const cases = pair.cases.map((stateCase) => {
      const integrity = ImageColor.diff(
        ImageColor.clip(stateCase.sourcePath, stateCase.bounds),
        templateImages[stateCase.templateIndex],
      );
      const full = ImageColor.findImage(stateCase.sourcePath, pair.templates, { threshold: 1 });
      const roi = ImageColor.findImage(stateCase.sourcePath, pair.templates, {
        threshold: 1,
        region: stateCase.region,
      });
      const expected = (match) => match.found === true
        && match.x === stateCase.bounds.x && match.y === stateCase.bounds.y
        && match.width === stateCase.bounds.width && match.height === stateCase.bounds.height
        && match.centerX === stateCase.bounds.x + stateCase.bounds.width / 2
        && match.centerY === stateCase.bounds.y + stateCase.bounds.height / 2
        && match.confidence === 1 && match.scale === 1 && match.templateIndex === stateCase.templateIndex;
      const opposite = ImageColor.findImage(stateCase.sourcePath, pair.templates[1 - stateCase.templateIndex], {
        threshold: 0.95,
        region: stateCase.region,
      });
      const unselectedOnly = ImageColor.findImage(stateCase.sourcePath, pair.templates[0], {
        threshold: 1,
        region: stateCase.region,
      });
      const selectedOnly = ImageColor.findImage(stateCase.sourcePath, pair.templates[1], {
        threshold: 1,
        region: stateCase.region,
      });
      const action = unselectedOnly.found ? 'tap-unselected' : 'no-op';
      const sourceSize = ImageColor.getSize(stateCase.sourcePath);
      const fullCandidatePositions = pair.templates.reduce((total, template) => total + candidatePositionCount(sourceSize, template), 0);
      const roiCandidatePositions = pair.templates.reduce((total, template) => total + candidatePositionCount(sourceSize, template, stateCase.region), 0);
      const checks = {
        templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
        expectedState: expected(full) && expected(roi),
        sameMatch: sameMatch(full, roi),
        oppositeStateRejected: opposite.found === false,
        unselectedActionGate: unselectedOnly.found === (stateCase.templateIndex === 0)
          && action === (stateCase.templateIndex === 0 ? 'tap-unselected' : 'no-op'),
        selectedProbe: selectedOnly.found === (stateCase.templateIndex === 1),
        reducedSearchSpace: roiCandidatePositions < fullCandidatePositions,
      };
      assert(Object.values(checks).every(Boolean),
        `${pair.id} ${stateCase.state} state matching failed: ${JSON.stringify({ stateCase, integrity, full, roi, opposite, checks })}`);
      return {
        state: stateCase.state,
        sourcePath: stateCase.sourcePath,
        expectedTemplateIndex: stateCase.templateIndex,
        bounds: stateCase.bounds,
        region: stateCase.region,
        integrity,
        full: { result: full, candidatePositions: fullCandidatePositions },
        roi: { result: roi, candidatePositions: roiCandidatePositions },
        opposite,
        actionGate: { unselectedOnly, selectedOnly, action },
        candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
        checks,
      };
    });
    return { id: pair.id, templates: pair.templates, stateDiff, cases };
  });

  // Verify the business-safe UI workflow: inspect the ordered pair, click
  // only the unselected template, then inspect again. Passing the pair to
  // UI.tapImage would also click an already-selected toggle.
  const originals = {
    window: globalThis.window,
    Screen: globalThis.Screen,
    page: globalThis.page,
    ImageColor: globalThis.ImageColor,
    mouse: globalThis.mouse,
  };
  let uiRecords = { screenshots: [], imageRequests: [], waits: [], clicks: [] };
  const uiStateWorkflow = [];
  const fixtureWindow = {
    id: 'darwin:42:native:99', title: 'Fixture', pid: 42, processId: 42, handle: 99,
    x: 100, y: 200, width: 800, height: 600,
  };
  try {
    globalThis.window = { getActiveWindow: async () => fixtureWindow };
    globalThis.Screen = {
      getVirtualBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
      getDisplays: () => [{
        id: 'display-1', index: 1, x: 0, y: 0, width: 1920, height: 1080,
        pixelWidth: 1920, pixelHeight: 1080, scale: 1,
      }],
    };
    globalThis.page = {
      screenshot: async (request) => {
        uiRecords.screenshots.push(request);
        return 'fixture-shot';
      },
      waitFor: async (milliseconds) => { uiRecords.waits.push(milliseconds); },
    };
    let simulatedState = 'selected';
    let transitionOnClick = true;
    const resetRecords = () => {
      uiRecords = { screenshots: [], imageRequests: [], waits: [], clicks: [] };
    };
    const messageStates = ['message-unselected.png', 'message-selected.png'];
    const stateOptions = { within: fixtureWindow, threshold: 0.95, timeout: 1, polling: 1 };
    const activeTemplate = () => simulatedState === 'unselected'
      ? messageStates[0]
      : simulatedState === 'selected' ? messageStates[1] : '';
    globalThis.ImageColor = {
      getSize: () => [1000, 750],
      findImages: async (image, template, request) => {
        uiRecords.imageRequests.push({ image, template, request });
        return template === activeTemplate()
          ? [{ found: true, confidence: 0.99, scale: 1, x: 125, y: 125, width: 250, height: 50 }]
          : [];
      },
    };
    globalThis.mouse = {
      clickPoint: async (point, options) => {
        uiRecords.clicks.push({ point, options });
        if (transitionOnClick && simulatedState === 'unselected') simulatedState = 'selected';
      },
    };
    const inspectState = async () => {
      const target = await UI.findImage(messageStates, stateOptions);
      if (!target) return { state: 'unknown', target: null };
      if (target.template === messageStates[0]) return { state: 'unselected', target };
      if (target.template === messageStates[1]) return { state: 'selected', target };
      throw new Error(`unexpected state template: ${JSON.stringify(target)}`);
    };
    const ensureSelectedOnce = async () => {
      const before = await inspectState();
      if (before.state !== 'unselected') return { before, changed: false, after: before, verified: before.state === 'selected' };
      const tap = await UI.tapImage(messageStates[0], stateOptions);
      const after = await inspectState();
      return { before, changed: true, tap, after, verified: after.state === 'selected' };
    };
    const captureScenario = async (name, state, transitions) => {
      simulatedState = state;
      transitionOnClick = transitions;
      resetRecords();
      const result = await ensureSelectedOnce();
      const evidence = { name, initialState: state, transitionOnClick: transitions, result, records: uiRecords };
      uiStateWorkflow.push(evidence);
      return evidence;
    };

    const alreadySelected = await captureScenario('already-selected', 'selected', true);
    assert(alreadySelected.result.verified === true && alreadySelected.result.changed === false
      && alreadySelected.records.screenshots.length === 1 && alreadySelected.records.imageRequests.length === 2
      && alreadySelected.records.clicks.length === 0 && alreadySelected.records.waits.length === 0,
    `selected state must be a no-op: ${JSON.stringify(alreadySelected)}`);

    const selectedAfterTap = await captureScenario('unselected-to-selected', 'unselected', true);
    assert(selectedAfterTap.result.verified === true && selectedAfterTap.result.changed === true
      && selectedAfterTap.result.tap.target.template === messageStates[0]
      && selectedAfterTap.result.after.state === 'selected'
      && selectedAfterTap.records.screenshots.length === 3 && selectedAfterTap.records.imageRequests.length === 5
      && selectedAfterTap.records.clicks.length === 1 && selectedAfterTap.records.waits.length === 0,
    `unselected state must click only the unselected template then verify selected: ${JSON.stringify(selectedAfterTap)}`);

    const unknown = await captureScenario('unknown-state', 'unknown', true);
    assert(unknown.result.verified === false && unknown.result.changed === false
      && unknown.records.screenshots.length === 1 && unknown.records.imageRequests.length === 2
      && unknown.records.clicks.length === 0,
    `unknown state must not click: ${JSON.stringify(unknown)}`);

    const unchangedAfterTap = await captureScenario('tap-without-state-change', 'unselected', false);
    assert(unchangedAfterTap.result.verified === false && unchangedAfterTap.result.changed === true
      && unchangedAfterTap.result.after.state === 'unselected'
      && unchangedAfterTap.records.clicks.length === 1,
    `a click without a selected postcondition must not be reported as success: ${JSON.stringify(unchangedAfterTap)}`);
  } finally {
    globalThis.window = originals.window;
    globalThis.Screen = originals.Screen;
    globalThis.page = originals.page;
    globalThis.ImageColor = originals.ImageColor;
    globalThis.mouse = originals.mouse;
  }

  console.log(`WECHAT_TEMPLATE_ROI_TEST_RESULT=${JSON.stringify({
    panelPath,
    panelSize,
    sidebarFixtureCount: sidebarEvidence.length,
    stateFixtureAudit: {
      selectedExists,
      unselectedExists,
      realDualStateAvailable: true,
      note: 'both message and contacts state pairs use versioned, real screenshot crops',
    },
    sidebarEvidence,
    stateEvidence,
    uiStateWorkflow,
  })}`);
})();
