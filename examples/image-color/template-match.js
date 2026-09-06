// Run from the repository root with:
// ./opendesk -script examples/image-color/template-match.js
// Keep both inputs versioned and directly viewable beside this example.
const sourcePath = './examples/image-color/fixtures/template-match/scene_color_blocks.png';
const templatePath = './examples/image-color/fixtures/template-match/template_blue-panel.png';
const sourceDataURL = ImageColor.loadBase64(sourcePath);
const sourceRawBase64 = sourceDataURL.slice(
  sourceDataURL.indexOf('base64,') + 'base64,'.length,
);
const options = {
  threshold: 1,
  region: { x: 200, y: 120, width: 100, height: 90 },
  scales: [0.9, 1, 1.1],
};

const best = ImageColor.findImage(sourceRawBase64, templatePath, options);
if (!best.found || best.x !== 202 || best.y !== 132
  || best.width !== 88 || best.height !== 64
  || best.centerX !== 246 || best.centerY !== 164
  || best.confidence !== 1 || best.scale !== 1) {
  throw new Error(`unexpected ImageColor.findImage result: ${JSON.stringify(best)}`);
}

const matches = ImageColor.findImages(sourceDataURL, templatePath, {
  ...options,
  maxResults: 2,
});
if (matches.length !== 1 || matches[0].x !== 202 || matches[0].y !== 132
  || matches[0].width !== 88 || matches[0].height !== 64
  || matches[0].centerX !== 246 || matches[0].centerY !== 164
  || matches[0].confidence !== 1 || matches[0].scale !== 1) {
  throw new Error(`unexpected ImageColor.findImages result: ${JSON.stringify(matches)}`);
}

const legacy = ImageColor.findPos(sourcePath, templatePath, 1);
if (!legacy.found || legacy.x !== 202 || legacy.y !== 132
  || legacy.width !== 88 || legacy.height !== 64 || legacy.confidence !== 1
  || Object.prototype.hasOwnProperty.call(legacy, 'scale')) {
  throw new Error(`unexpected ImageColor.findPos compatibility result: ${JSON.stringify(legacy)}`);
}

// Every sidebar input below is a real, versioned crop from wechat-panel.png.
// They deliberately represent distinct buttons, so each is matched in its own
// tight ROI instead of being passed as a state-variant array.
const wechatPanelPath = './examples/image-color/fixtures/wechat-panel.png';
const selectedMessageTemplatePath = './examples/image-color/fixtures/wechat-message/selected.png';
const unselectedMessageTemplatePath = './examples/image-color/fixtures/wechat-message/unselected.png';
const sidebarButtons = [
  { id: 'messages', label: '消息（已选中）', templatePath: selectedMessageTemplatePath, x: 18, y: 111, regionY: 100 },
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

const selectedMessageExists = File.exists(selectedMessageTemplatePath);
const unselectedMessageExists = File.exists(unselectedMessageTemplatePath);
if (unselectedMessageExists) {
  const unselected = ImageColor.loadBase64(unselectedMessageTemplatePath);
  const unselectedSize = ImageColor.getSize(unselected);
  if (unselectedSize[0] !== 24 || unselectedSize[1] !== 22) {
    throw new Error(`unselected WeChat message fixture must be a real 24x22 crop: ${JSON.stringify(unselectedSize)}`);
  }
  const stateDiff = ImageColor.diff(unselected, ImageColor.loadBase64(selectedMessageTemplatePath));
  if (stateDiff.matched) {
    throw new Error(`unselected WeChat message fixture must differ from selected.png: ${JSON.stringify(stateDiff)}`);
  }
}

function candidatePositionCount(sourceSize, template, region) {
  const width = region ? region.width : sourceSize[0];
  const height = region ? region.height : sourceSize[1];
  const size = ImageColor.getSize(template);
  return Math.max(0, width - size[0] + 1) * Math.max(0, height - size[1] + 1);
}

function timedMatch(template, options) {
  const startedAt = Date.now();
  const result = ImageColor.findImage(wechatPanelPath, template, options);
  return { result, durationMs: Date.now() - startedAt };
}

function sameMatch(left, right) {
  return ['found', 'x', 'y', 'width', 'height', 'centerX', 'centerY', 'confidence', 'scale', 'templateIndex']
    .every((key) => left[key] === right[key]);
}

const wechatPanelSize = ImageColor.getSize(wechatPanelPath);
const wechatSidebarEvidence = sidebarButtons.map((button) => {
  const template = ImageColor.loadBase64(button.templatePath);
  const sourceCrop = ImageColor.clip(wechatPanelPath, {
    x: button.x, y: button.y, width: button.width, height: button.height,
  });
  const integrity = ImageColor.diff(sourceCrop, template);
  const full = timedMatch(template, { threshold: 1 });
  const roi = timedMatch(template, { threshold: 1, region: button.region });
  const fullCandidatePositions = candidatePositionCount(wechatPanelSize, template);
  const roiCandidatePositions = candidatePositionCount(wechatPanelSize, template, button.region);
  const expected = (match) => match.found === true
    && match.x === button.x && match.y === button.y
    && match.width === button.width && match.height === button.height
    && match.centerX === button.x + button.width / 2 && match.centerY === button.y + button.height / 2
    && match.confidence === 1 && match.scale === 1 && match.templateIndex === 0;
  const checks = {
    templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
    expectedHit: expected(full.result) && expected(roi.result),
    sameMatch: sameMatch(full.result, roi.result),
    reducedSearchSpace: roiCandidatePositions < fullCandidatePositions,
  };
  if (!Object.values(checks).every(Boolean)) {
    throw new Error(`unexpected WeChat sidebar comparison for ${button.id}: ${JSON.stringify({ button, integrity, full, roi, checks })}`);
  }
  return {
    ...button,
    integrity,
    full: { ...full, candidatePositions: fullCandidatePositions },
    roi: { ...roi, candidatePositions: roiCandidatePositions },
    candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
    checks,
  };
});

// A template array is for alternate visual states of the same control. The
// two entries below deliberately keep their state ordering stable: #0 is
// unselected and #1 is selected. Each source screenshot exercises exactly one
// of those states, so the returned templateIndex is a state result, not merely
// proof that both fixture files exist.
const wechatStateSourcePath = './examples/image-color/fixtures/wechat-sidebar-states.png';
const statePairs = [
  {
    id: 'messages',
    label: '消息',
    templates: [
      { state: 'unselected', path: unselectedMessageTemplatePath },
      { state: 'selected', path: selectedMessageTemplatePath },
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
    label: '联系人',
    templates: [
      { state: 'unselected', path: './examples/image-color/fixtures/wechat-sidebar/contacts.png' },
      { state: 'selected', path: './examples/image-color/fixtures/wechat-contacts/selected.png' },
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

function expectedStateMatch(stateCase, match) {
  const { bounds, templateIndex } = stateCase;
  return match.found === true
    && match.x === bounds.x && match.y === bounds.y
    && match.width === bounds.width && match.height === bounds.height
    && match.centerX === bounds.x + bounds.width / 2
    && match.centerY === bounds.y + bounds.height / 2
    && match.confidence === 1 && match.scale === 1
    && match.templateIndex === templateIndex;
}

function stateCandidatePositionCount(sourceSize, templates, region) {
  const width = region ? region.width : sourceSize[0];
  const height = region ? region.height : sourceSize[1];
  return templates.reduce((total, template) => {
    const size = ImageColor.getSize(template.path);
    return total + Math.max(0, width - size[0] + 1) * Math.max(0, height - size[1] + 1);
  }, 0);
}

const wechatStateEvidence = statePairs.map((pair) => {
  const templatePaths = pair.templates.map((template) => template.path);
  const templateImages = templatePaths.map((path) => ImageColor.loadBase64(path));
  const stateDifference = ImageColor.diff(templateImages[0], templateImages[1]);
  if (stateDifference.matched) {
    throw new Error(`${pair.id} selected and unselected templates must not be identical`);
  }

  const cases = pair.cases.map((stateCase) => {
    const sourceSize = ImageColor.getSize(stateCase.sourcePath);
    const crop = ImageColor.clip(stateCase.sourcePath, stateCase.bounds);
    const integrity = ImageColor.diff(crop, templateImages[stateCase.templateIndex]);
    const full = timedMatchState(stateCase.sourcePath, templatePaths, { threshold: 1 });
    const roi = timedMatchState(stateCase.sourcePath, templatePaths, {
      threshold: 1,
      region: stateCase.region,
    });
    const opposite = ImageColor.findImage(
      stateCase.sourcePath,
      templatePaths[1 - stateCase.templateIndex],
      { threshold: 0.95, region: stateCase.region },
    );
    // Business action gate: only the unselected template is eligible for a
    // click. A state array is for classification; it must not be handed to a
    // toggle action that is meant to ensure the selected state.
    const unselectedOnly = ImageColor.findImage(
      stateCase.sourcePath,
      templatePaths[0],
      { threshold: 1, region: stateCase.region },
    );
    const selectedOnly = ImageColor.findImage(
      stateCase.sourcePath,
      templatePaths[1],
      { threshold: 1, region: stateCase.region },
    );
    const action = unselectedOnly.found ? 'tap-unselected' : 'no-op';
    const fullCandidatePositions = stateCandidatePositionCount(sourceSize, pair.templates);
    const roiCandidatePositions = stateCandidatePositionCount(sourceSize, pair.templates, stateCase.region);
    const checks = {
      templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
      expectedState: expectedStateMatch(stateCase, full.result) && expectedStateMatch(stateCase, roi.result),
      sameMatch: sameMatch(full.result, roi.result),
      oppositeStateRejected: opposite.found === false,
      unselectedActionGate: unselectedOnly.found === (stateCase.templateIndex === 0)
        && action === (stateCase.templateIndex === 0 ? 'tap-unselected' : 'no-op'),
      selectedProbe: selectedOnly.found === (stateCase.templateIndex === 1),
      reducedSearchSpace: roiCandidatePositions < fullCandidatePositions,
    };
    if (!Object.values(checks).every(Boolean)) {
      throw new Error(`unexpected ${pair.id} ${stateCase.state} state match: ${JSON.stringify({ pair, stateCase, integrity, full, roi, opposite, checks })}`);
    }
    return {
      state: stateCase.state,
      sourcePath: stateCase.sourcePath,
      bounds: stateCase.bounds,
      region: stateCase.region,
      expectedTemplateIndex: stateCase.templateIndex,
      integrity,
      full: { ...full, candidatePositions: fullCandidatePositions },
      roi: { ...roi, candidatePositions: roiCandidatePositions },
      opposite,
      actionGate: { unselectedOnly, selectedOnly, action },
      candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
      checks,
    };
  });

  return {
    id: pair.id,
    label: pair.label,
    templates: pair.templates,
    stateDifference,
    cases,
  };
});

function timedMatchState(source, templates, options) {
  const startedAt = Date.now();
  const result = ImageColor.findImage(source, templates, options);
  return { result, durationMs: Date.now() - startedAt };
}

console.log(`IMAGE_COLOR_TEMPLATE_MATCH_RESULT=${JSON.stringify({
  sourcePath,
  templatePath,
  best,
  matches,
  legacy,
  wechatPanelPath,
  selectedMessageTemplatePath,
  unselectedMessageTemplatePath,
  selectedTemplateIntegrity: wechatSidebarEvidence[0].integrity,
  stateFixtureAudit: {
    selectedMessageExists,
    unselectedMessageExists,
    realDualStateAvailable: unselectedMessageExists,
    note: unselectedMessageExists
      ? 'selected and unselected templates are both versioned fixtures'
      : 'selected-only message-state coverage; every sidebar-button template in wechatSidebarEvidence is a real crop',
  },
  wechatSidebarEvidence,
  wechatStateEvidence,
})}`);
