// Focused Runtime API acceptance. Run from the repository root with:
// ./opendesk -script tests/runtime-api/image-color-wechat-sidebar-button-template-acceptance-20260906-r1.js -console-mode script

const suiteId = 'image-color-wechat-sidebar-button-template-acceptance-20260906-r1';
const fixtureRoot = `./tests/runtime-api/fixtures/${suiteId}`;
const manifest = await File.readJSON(`${fixtureRoot}/fixture-manifest.json`);
eval(File.read('./tests/runtime-api/crypto.js'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixturePath(relativePath) {
  return `${fixtureRoot}/${relativePath}`;
}

function sameMatch(left, right) {
  return [
    'found', 'x', 'y', 'width', 'height', 'centerX', 'centerY',
    'confidence', 'scale', 'templateIndex',
  ].every((key) => left[key] === right[key]);
}

function sameSingleTemplateHit(left, right) {
  return [
    'found', 'x', 'y', 'width', 'height', 'centerX', 'centerY',
    'confidence', 'scale',
  ].every((key) => left[key] === right[key]);
}

function expectedMatch(result, bounds, templateIndex) {
  return result.found === true
    && result.x === bounds.x && result.y === bounds.y
    && result.width === bounds.width && result.height === bounds.height
    && result.centerX === bounds.x + bounds.width / 2
    && result.centerY === bounds.y + bounds.height / 2
    && result.confidence === 1 && result.scale === 1
    && result.templateIndex === templateIndex;
}

function candidatePositionCount(sourceSize, templatePaths, region) {
  const width = region ? region.width : sourceSize[0];
  const height = region ? region.height : sourceSize[1];
  return templatePaths.reduce((total, templatePath) => {
    const templateSize = ImageColor.getSize(templatePath);
    return total
      + Math.max(0, width - templateSize[0] + 1)
      * Math.max(0, height - templateSize[1] + 1);
  }, 0);
}

assert(manifest && manifest.schemaVersion === 1 && manifest.suiteId === suiteId,
  `unexpected fixture manifest: ${JSON.stringify(manifest)}`);

const fixtureDigestEvidence = [
  ...manifest.sourceSnapshots.map((source) => ({ path: source.path, sha256: source.sha256 })),
  ...manifest.statePairs.flatMap((pair) => pair.templates),
  ...manifest.additionalButtons,
].map((fixture) => {
  const filePath = fixturePath(fixture.path);
  const actualSha256 = RuntimeAPICrypto.hashFile(filePath);
  const matched = actualSha256 === fixture.sha256;
  assert(matched,
    `isolated fixture digest changed for ${filePath}: expected ${fixture.sha256}, got ${actualSha256}`);
  return { path: filePath, expectedSha256: fixture.sha256, actualSha256, matched };
});

const sourceById = {};
const sourceEvidence = manifest.sourceSnapshots.map((source) => {
  const sourcePath = fixturePath(source.path);
  assert(File.exists(sourcePath), `missing isolated source snapshot: ${sourcePath}`);
  const actualSize = ImageColor.getSize(sourcePath);
  const sizeMatches = Array.isArray(actualSize)
    && actualSize[0] === source.size[0] && actualSize[1] === source.size[1];
  assert(sizeMatches, `unexpected isolated source size for ${source.id}: ${JSON.stringify(actualSize)}`);
  sourceById[source.id] = { ...source, path: sourcePath, actualSize };
  return { id: source.id, path: sourcePath, expectedSize: source.size, actualSize, sizeMatches };
});

const fullSource = sourceById['message-selected-panel'];
const compactSource = sourceById['contacts-selected-sidebar'];
assert(fullSource && compactSource, `required source snapshots are missing: ${JSON.stringify(sourceById)}`);

const statePairById = {};
for (const pair of manifest.statePairs) statePairById[pair.id] = pair;
assert(statePairById.messages && statePairById.contacts,
  `required state pairs are missing: ${JSON.stringify(manifest.statePairs)}`);

const buttonRegionById = {
  messages: { x: 0, y: 100, width: 60, height: 44 },
  contacts: { x: 0, y: 148, width: 60, height: 44 },
  favorites: { x: 0, y: 196, width: 60, height: 44 },
  channels: { x: 0, y: 244, width: 60, height: 44 },
  'mini-programs': { x: 0, y: 292, width: 60, height: 44 },
  look: { x: 0, y: 340, width: 60, height: 44 },
  mobile: { x: 0, y: 537, width: 60, height: 44 },
  settings: { x: 0, y: 584, width: 60, height: 44 },
};

const distinctButtons = [
  {
    id: 'messages', label: '消息（已选中）',
    path: statePairById.messages.templates[1].path,
    bounds: statePairById.messages.bounds,
  },
  {
    id: 'contacts', label: '联系人（未选中）',
    path: statePairById.contacts.templates[0].path,
    bounds: statePairById.contacts.bounds,
  },
  ...manifest.additionalButtons.map((button) => ({
    id: button.id,
    label: button.id,
    path: button.path,
    bounds: button.bounds,
  })),
].map((button) => ({ ...button, region: buttonRegionById[button.id] }));

assert(distinctButtons.length === 8, `expected 8 isolated sidebar buttons, got ${distinctButtons.length}`);

const buttonEvidence = distinctButtons.map((button) => {
  const templatePath = fixturePath(button.path);
  assert(File.exists(templatePath), `missing isolated button template: ${templatePath}`);
  assert(button.region, `missing ROI for ${button.id}`);
  const crop = ImageColor.clip(fullSource.path, button.bounds);
  const integrity = ImageColor.diff(crop, templatePath);
  const full = ImageColor.findImage(fullSource.path, templatePath, { threshold: 1, scales: [1] });
  const roi = ImageColor.findImage(fullSource.path, templatePath, {
    threshold: 1,
    region: button.region,
    scales: [1],
  });
  const allInROI = ImageColor.findImages(fullSource.path, templatePath, {
    threshold: 1,
    region: button.region,
    scales: [1],
    maxResults: 2,
  });
  const fullCandidatePositions = candidatePositionCount(fullSource.actualSize, [templatePath]);
  const roiCandidatePositions = candidatePositionCount(fullSource.actualSize, [templatePath], button.region);
  const crossRegionResultsAt095 = distinctButtons
    .filter((other) => other.id !== button.id)
    .map((other) => ({
      regionId: other.id,
      result: ImageColor.findImage(fullSource.path, templatePath, {
        threshold: 0.95,
        region: other.region,
        scales: [1],
      }),
    }));
  const maximumCrossConfidence = Math.max(...crossRegionResultsAt095
    .map((entry) => entry.result.confidence));
  const calibratedThreshold = Math.max(0.95, Math.min(1,
    Math.ceil((maximumCrossConfidence + 0.005) * 1000) / 1000));
  const crossRegionResultsAtCalibratedThreshold = distinctButtons
    .filter((other) => other.id !== button.id)
    .map((other) => ({
      regionId: other.id,
      result: ImageColor.findImage(fullSource.path, templatePath, {
        threshold: calibratedThreshold,
        region: other.region,
        scales: [1],
      }),
    }));
  const checks = {
    templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
    expectedFullHit: expectedMatch(full, button.bounds, 0),
    expectedROIHit: expectedMatch(roi, button.bounds, 0),
    fullEqualsROI: sameMatch(full, roi),
    findImagesAgrees: allInROI.length === 1 && sameSingleTemplateHit(roi, allInROI[0]),
    findImagesTemplateIndexValid: allInROI.length === 1
      && (!Object.prototype.hasOwnProperty.call(allInROI[0], 'templateIndex')
        || allInROI[0].templateIndex === 0),
    crossRegionsSeparable: maximumCrossConfidence < 1,
    calibratedCrossRegionsRejected: crossRegionResultsAtCalibratedThreshold
      .every((entry) => entry.result.found === false),
    reducedSearchSpace: roiCandidatePositions > 0 && roiCandidatePositions < fullCandidatePositions,
  };
  assert(Object.values(checks).every(Boolean),
    `distinct button acceptance failed for ${button.id}: ${JSON.stringify({ button, integrity, full, roi, allInROI, crossRegionResultsAt095, maximumCrossConfidence, calibratedThreshold, crossRegionResultsAtCalibratedThreshold, checks })}`);
  return {
    ...button,
    templatePath,
    integrity,
    full,
    roi,
    allInROI,
    fullCandidatePositions,
    roiCandidatePositions,
    candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
    crossRegionResultsAt095,
    crossFalsePositivesAt095: crossRegionResultsAt095.filter((entry) => entry.result.found).length,
    maximumCrossConfidence,
    calibratedThreshold,
    crossRegionResultsAtCalibratedThreshold,
    checks,
  };
});

const stateCaseDefinitions = {
  messages: [
    { state: 'unselected', source: compactSource, expectedTemplateIndex: 0 },
    { state: 'selected', source: fullSource, expectedTemplateIndex: 1 },
  ],
  contacts: [
    { state: 'unselected', source: fullSource, expectedTemplateIndex: 0 },
    { state: 'selected', source: compactSource, expectedTemplateIndex: 1 },
  ],
};

const stateEvidence = manifest.statePairs.map((pair) => {
  assert(Array.isArray(pair.order) && pair.order.join(',') === 'unselected,selected',
    `state order must remain [unselected, selected] for ${pair.id}: ${JSON.stringify(pair.order)}`);
  const templatePaths = pair.templates.map((template) => fixturePath(template.path));
  const stateDifference = ImageColor.diff(templatePaths[0], templatePaths[1]);
  assert(stateDifference.matched === false,
    `${pair.id} selected and unselected templates must differ: ${JSON.stringify(stateDifference)}`);
  const otherPair = pair.id === 'messages' ? statePairById.contacts : statePairById.messages;
  const otherTemplatePaths = otherPair.templates.map((template) => fixturePath(template.path));

  const cases = stateCaseDefinitions[pair.id].map((stateCase) => {
    const full = ImageColor.findImage(stateCase.source.path, templatePaths, {
      threshold: 1,
      scales: [1],
    });
    const roi = ImageColor.findImage(stateCase.source.path, templatePaths, {
      threshold: 1,
      region: pair.region,
      scales: [1],
    });
    const crop = ImageColor.clip(stateCase.source.path, pair.bounds);
    const integrity = ImageColor.diff(crop, templatePaths[stateCase.expectedTemplateIndex]);
    const correctOnly = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[stateCase.expectedTemplateIndex],
      { threshold: 1, region: pair.region, scales: [1] },
    );
    const opposite = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[1 - stateCase.expectedTemplateIndex],
      { threshold: 0.95, region: pair.region, scales: [1] },
    );
    const unselectedOnly = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[0],
      { threshold: 1, region: pair.region, scales: [1] },
    );
    const selectedOnly = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[1],
      { threshold: 1, region: pair.region, scales: [1] },
    );
    const otherControl = ImageColor.findImage(
      stateCase.source.path,
      otherTemplatePaths,
      { threshold: 0.95, region: pair.region, scales: [1] },
    );
    const action = unselectedOnly.found
      ? 'tap-unselected'
      : selectedOnly.found ? 'no-op' : 'unknown';
    const fullCandidatePositions = candidatePositionCount(stateCase.source.actualSize, templatePaths);
    const roiCandidatePositions = candidatePositionCount(stateCase.source.actualSize, templatePaths, pair.region);
    const checks = {
      templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
      expectedFullState: expectedMatch(full, pair.bounds, stateCase.expectedTemplateIndex),
      expectedROIState: expectedMatch(roi, pair.bounds, stateCase.expectedTemplateIndex),
      fullEqualsROI: sameMatch(full, roi),
      oppositeStateRejected: opposite.found === false,
      correctStateWins: correctOnly.confidence === 1 && correctOnly.confidence > opposite.confidence,
      actionGate: action === (stateCase.expectedTemplateIndex === 0 ? 'tap-unselected' : 'no-op'),
      selectedProbe: selectedOnly.found === (stateCase.expectedTemplateIndex === 1),
      unselectedProbe: unselectedOnly.found === (stateCase.expectedTemplateIndex === 0),
      otherControlRejected: otherControl.found === false,
      reducedSearchSpace: roiCandidatePositions > 0 && roiCandidatePositions < fullCandidatePositions,
    };
    assert(Object.values(checks).every(Boolean),
      `state acceptance failed for ${pair.id}/${stateCase.state}: ${JSON.stringify({ pair, stateCase, full, roi, integrity, correctOnly, opposite, unselectedOnly, selectedOnly, otherControl, action, checks })}`);
    return {
      state: stateCase.state,
      sourceId: stateCase.source.id,
      sourcePath: stateCase.source.path,
      sourceSize: stateCase.source.actualSize,
      bounds: pair.bounds,
      region: pair.region,
      expectedTemplateIndex: stateCase.expectedTemplateIndex,
      crop,
      integrity,
      full,
      roi,
      correctOnly,
      opposite,
      confidenceMargin: correctOnly.confidence - opposite.confidence,
      unselectedOnly,
      selectedOnly,
      otherControl,
      action,
      fullCandidatePositions,
      roiCandidatePositions,
      candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
      checks,
    };
  });

  return {
    id: pair.id,
    order: pair.order,
    templatePaths,
    stateDifference,
    cases,
  };
});

async function ensureSelectedWithAdapter(adapter, templates, within) {
  const before = await adapter.findImage(templates, { threshold: 0.95, within, scales: [1] });
  if (!before) {
    return { ok: false, reason: 'unknown-before', before, clicked: false };
  }
  if (before.template === templates[1]) {
    return { ok: true, reason: 'already-selected', before, after: before, clicked: false };
  }
  if (before.template !== templates[0]) {
    return { ok: false, reason: 'unexpected-template', before, clicked: false };
  }
  await adapter.tapImage(templates[0], { threshold: 0.95, within, scales: [1] });
  const after = await adapter.findImage(templates, { threshold: 0.95, within, scales: [1] });
  return {
    ok: Boolean(after && after.template === templates[1]),
    reason: after && after.template === templates[1]
      ? 'selected-after-tap' : 'postcondition-failed',
    before,
    after,
    clicked: true,
  };
}

function workflowAdapter(stateIndexes, templates, changesAfterTap) {
  const records = { finds: [], taps: [] };
  let cursor = 0;
  return {
    records,
    async findImage(templates, options) {
      records.finds.push({ templates, options });
      const index = Math.min(cursor, stateIndexes.length - 1);
      const stateIndex = stateIndexes[index];
      return stateIndex === null ? null : { source: 'image', template: templates[stateIndex] };
    },
    async tapImage(template, options) {
      records.taps.push({ template, options });
      if (changesAfterTap) cursor += 1;
      return { ok: true, action: 'tapImage' };
    },
  };
}

const workflowTemplates = statePairById.messages.templates.map((template) => fixturePath(template.path));
const workflowWithin = { ...statePairById.messages.region, coordinateSpace: 'screen' };
const workflowScenarios = [];
for (const scenario of [
  {
    id: 'already-selected',
    stateIndexes: [1],
    changesAfterTap: false,
    expected: { ok: true, reason: 'already-selected', taps: 0, finds: 1 },
  },
  {
    id: 'unselected-to-selected',
    stateIndexes: [0, 1],
    changesAfterTap: true,
    expected: { ok: true, reason: 'selected-after-tap', taps: 1, finds: 2 },
  },
  {
    id: 'unknown-before',
    stateIndexes: [null],
    changesAfterTap: false,
    expected: { ok: false, reason: 'unknown-before', taps: 0, finds: 1 },
  },
  {
    id: 'tap-without-state-change',
    stateIndexes: [0],
    changesAfterTap: false,
    expected: { ok: false, reason: 'postcondition-failed', taps: 1, finds: 2 },
  },
]) {
  const adapter = workflowAdapter(scenario.stateIndexes, workflowTemplates, scenario.changesAfterTap);
  const result = await ensureSelectedWithAdapter(adapter, workflowTemplates, workflowWithin);
  const observed = {
    ok: result.ok,
    reason: result.reason,
    taps: adapter.records.taps.length,
    finds: adapter.records.finds.length,
  };
  assert(JSON.stringify(observed) === JSON.stringify(scenario.expected),
    `safe toggle workflow failed for ${scenario.id}: ${JSON.stringify({ observed, expected: scenario.expected, result, records: adapter.records })}`);
  assert(adapter.records.taps.every((tap) => tap.template === workflowTemplates[0]),
    `safe toggle workflow must only tap the unselected template: ${JSON.stringify(adapter.records.taps)}`);
  assert(adapter.records.finds.every((find) => find.options.within.coordinateSpace === 'screen'
      && !Object.prototype.hasOwnProperty.call(find.options, 'region')),
  `UI workflow must use tagged screen within rather than ImageColor region: ${JSON.stringify(adapter.records.finds)}`);
  workflowScenarios.push({ id: scenario.id, result, records: adapter.records, observed });
}

const report = {
  suiteId,
  fixtureRoot,
  sourceEvidence,
  fixtureDigestEvidence,
  summary: {
    fixtureDigestsPassed: fixtureDigestEvidence.filter((entry) => entry.matched).length,
    fixtureDigestsTotal: fixtureDigestEvidence.length,
    sourceSnapshotsPassed: sourceEvidence.filter((entry) => entry.sizeMatches).length,
    sourceSnapshotsTotal: sourceEvidence.length,
    distinctButtonsPassed: buttonEvidence.filter((entry) => Object.values(entry.checks).every(Boolean)).length,
    distinctButtonsTotal: buttonEvidence.length,
    stateCasesPassed: stateEvidence.flatMap((pair) => pair.cases)
      .filter((entry) => Object.values(entry.checks).every(Boolean)).length,
    stateCasesTotal: stateEvidence.flatMap((pair) => pair.cases).length,
    workflowScenariosPassed: workflowScenarios.length,
    workflowScenariosTotal: 4,
    realDesktopInputAPIsInvoked: false,
  },
  buttonEvidence,
  stateEvidence,
  workflowScenarios,
};

await File.writeJSON(`${Execution.artifactDir}/wechat-sidebar-button-template-acceptance-20260906-r1.json`, report);
console.log(`WECHAT_SIDEBAR_BUTTON_TEMPLATE_ACCEPTANCE_20260906_R1=${JSON.stringify(report.summary)}`);
