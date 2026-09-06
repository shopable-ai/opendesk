// Real Custom UI acceptance. Run from the repository root with:
// ./opendesk -ui -script tests/runtime-api/image-color-wechat-sidebar-button-template-visual-acceptance-20260906-r1.js -console-mode script

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

function percent(value, total) {
  return `${((value / total) * 100).toFixed(4)}%`;
}

function integer(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function criterion(label, passed) {
  return `<span class="criterion ${passed ? 'is-pass' : 'is-fail'}"><span>${passed ? '✓' : '×'}</span>${label}</span>`;
}

const capabilities = ui.getCapabilities();
assert(capabilities.enabled && capabilities.available,
  `Custom UI is unavailable: ${capabilities.reason || 'run with -ui on supported macOS'}`);
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
for (const source of manifest.sourceSnapshots) {
  const sourcePath = fixturePath(source.path);
  const actualSize = ImageColor.getSize(sourcePath);
  assert(Array.isArray(actualSize) && actualSize[0] === source.size[0] && actualSize[1] === source.size[1],
    `unexpected source size for ${source.id}: ${JSON.stringify(actualSize)}`);
  sourceById[source.id] = { ...source, path: sourcePath, size: actualSize };
}

const fullSource = sourceById['message-selected-panel'];
const compactSource = sourceById['contacts-selected-sidebar'];
const statePairById = {};
for (const pair of manifest.statePairs) statePairById[pair.id] = pair;

const buttonLabels = {
  messages: '消息',
  contacts: '联系人',
  favorites: '收藏',
  channels: '视频号',
  'mini-programs': '小程序',
  look: '看一看',
  mobile: '手机',
  settings: '设置',
};

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

const buttonDefinitions = [
  { id: 'messages', path: statePairById.messages.templates[1].path, bounds: statePairById.messages.bounds },
  { id: 'contacts', path: statePairById.contacts.templates[0].path, bounds: statePairById.contacts.bounds },
  ...manifest.additionalButtons.map((button) => ({ id: button.id, path: button.path, bounds: button.bounds })),
].map((button) => ({ ...button, region: buttonRegionById[button.id] }));

const buttonEvidence = buttonDefinitions.map((button) => {
  const templatePath = fixturePath(button.path);
  const template = ImageColor.loadBase64(templatePath);
  const integrity = ImageColor.diff(ImageColor.clip(fullSource.path, button.bounds), templatePath);
  const full = ImageColor.findImage(fullSource.path, templatePath, { threshold: 1, scales: [1] });
  const roi = ImageColor.findImage(fullSource.path, templatePath, {
    threshold: 1,
    region: button.region,
    scales: [1],
  });
  const crossRegionResultsAt095 = buttonDefinitions
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
  const calibratedCrossRejected = buttonDefinitions
    .filter((other) => other.id !== button.id)
    .every((other) => ImageColor.findImage(fullSource.path, templatePath, {
      threshold: calibratedThreshold,
      region: other.region,
      scales: [1],
    }).found === false);
  const fullCandidates = candidatePositionCount(fullSource.size, [templatePath]);
  const roiCandidates = candidatePositionCount(fullSource.size, [templatePath], button.region);
  const checks = {
    crop: integrity.matched === true && integrity.diffPixels === 0,
    hit: expectedMatch(full, button.bounds, 0) && expectedMatch(roi, button.bounds, 0),
    same: sameMatch(full, roi),
    cross: maximumCrossConfidence < 1 && calibratedCrossRejected,
    reduced: roiCandidates > 0 && roiCandidates < fullCandidates,
  };
  return {
    ...button,
    label: buttonLabels[button.id],
    templatePath,
    template,
    full,
    roi,
    fullCandidates,
    roiCandidates,
    reduction: fullCandidates / roiCandidates,
    crossFalsePositivesAt095: crossRegionResultsAt095.filter((entry) => entry.result.found).length,
    maximumCrossConfidence,
    calibratedThreshold,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
});

const stateDefinitions = {
  messages: [
    { state: 'unselected', source: compactSource, templateIndex: 0 },
    { state: 'selected', source: fullSource, templateIndex: 1 },
  ],
  contacts: [
    { state: 'unselected', source: fullSource, templateIndex: 0 },
    { state: 'selected', source: compactSource, templateIndex: 1 },
  ],
};

const stateEvidence = manifest.statePairs.flatMap((pair) => {
  const templatePaths = pair.templates.map((template) => fixturePath(template.path));
  const otherPair = pair.id === 'messages' ? statePairById.contacts : statePairById.messages;
  const otherTemplates = otherPair.templates.map((template) => fixturePath(template.path));
  const templatesDiffer = ImageColor.diff(templatePaths[0], templatePaths[1]).matched === false;
  return stateDefinitions[pair.id].map((stateCase) => {
    const full = ImageColor.findImage(stateCase.source.path, templatePaths, { threshold: 1, scales: [1] });
    const roi = ImageColor.findImage(stateCase.source.path, templatePaths, {
      threshold: 1,
      region: pair.region,
      scales: [1],
    });
    const crop = ImageColor.clip(stateCase.source.path, pair.bounds);
    const integrity = ImageColor.diff(crop, templatePaths[stateCase.templateIndex]);
    const opposite = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[1 - stateCase.templateIndex],
      { threshold: 0.95, region: pair.region, scales: [1] },
    );
    const unselected = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[0],
      { threshold: 1, region: pair.region, scales: [1] },
    );
    const selected = ImageColor.findImage(
      stateCase.source.path,
      templatePaths[1],
      { threshold: 1, region: pair.region, scales: [1] },
    );
    const otherControl = ImageColor.findImage(
      stateCase.source.path,
      otherTemplates,
      { threshold: 0.95, region: pair.region, scales: [1] },
    );
    const action = unselected.found ? 'tap-unselected' : selected.found ? 'no-op' : 'unknown';
    const fullCandidates = candidatePositionCount(stateCase.source.size, templatePaths);
    const roiCandidates = candidatePositionCount(stateCase.source.size, templatePaths, pair.region);
    const checks = {
      crop: integrity.matched === true && integrity.diffPixels === 0,
      index: expectedMatch(full, pair.bounds, stateCase.templateIndex)
        && expectedMatch(roi, pair.bounds, stateCase.templateIndex),
      same: sameMatch(full, roi),
      opposite: opposite.found === false,
      action: action === (stateCase.templateIndex === 0 ? 'tap-unselected' : 'no-op'),
      cross: otherControl.found === false,
      reduced: roiCandidates > 0 && roiCandidates < fullCandidates,
      templatesDiffer,
    };
    return {
      controlId: pair.id,
      controlLabel: buttonLabels[pair.id],
      state: stateCase.state,
      stateLabel: stateCase.state === 'selected' ? '绿色 · 已选中' : '灰色 · 未选中',
      sourceId: stateCase.source.id,
      sourceSize: stateCase.source.size,
      templateIndex: stateCase.templateIndex,
      template: ImageColor.loadBase64(templatePaths[stateCase.templateIndex]),
      roiPreview: ImageColor.clip(stateCase.source.path, pair.region),
      bounds: pair.bounds,
      region: pair.region,
      full,
      roi,
      opposite,
      action,
      fullCandidates,
      roiCandidates,
      reduction: fullCandidates / roiCandidates,
      checks,
      passed: Object.values(checks).every(Boolean),
    };
  });
});

const passedButtons = buttonEvidence.filter((button) => button.passed).length;
const passedStates = stateEvidence.filter((stateCase) => stateCase.passed).length;
const passed = passedButtons === buttonEvidence.length && passedStates === stateEvidence.length;

function stateCard(stateCase) {
  const hitLeft = stateCase.roi.x - stateCase.region.x;
  const hitTop = stateCase.roi.y - stateCase.region.y;
  const centerLeft = stateCase.roi.centerX - stateCase.region.x;
  const centerTop = stateCase.roi.centerY - stateCase.region.y;
  return `<div class="state-card ${stateCase.passed ? 'is-pass' : 'is-fail'}">
    <div class="card-head"><div><span class="overline">${stateCase.controlLabel.toUpperCase()} · ${stateCase.sourceId}</span><strong>${stateCase.stateLabel}</strong></div><span class="state-index">#${stateCase.templateIndex} ${stateCase.passed ? 'PASS' : 'FAIL'}</span></div>
    <div class="state-body">
      <div class="roi-column"><span class="mini-label">实际 ROI · ${stateCase.region.width}×${stateCase.region.height}</span><div class="roi-stage"><img src="${stateCase.roiPreview}" alt="${stateCase.controlLabel}${stateCase.stateLabel} ROI"><span class="hit-box" style="left:${percent(hitLeft, stateCase.region.width)};top:${percent(hitTop, stateCase.region.height)};width:${percent(stateCase.roi.width, stateCase.region.width)};height:${percent(stateCase.roi.height, stateCase.region.height)}"></span><span class="center-mark" style="left:${percent(centerLeft, stateCase.region.width)};top:${percent(centerTop, stateCase.region.height)}"></span></div></div>
      <div class="template-column"><span class="mini-label">命中模板</span><img class="template-preview" src="${stateCase.template}" alt="${stateCase.controlLabel}${stateCase.stateLabel}模板"><span class="template-size">${stateCase.roi.width}×${stateCase.roi.height}</span></div>
      <div class="facts"><p><strong>命中</strong><span>(${stateCase.roi.x},${stateCase.roi.y}) ${stateCase.roi.width}×${stateCase.roi.height} · C(${stateCase.roi.centerX},${stateCase.roi.centerY})</span></p><p><strong>全图=ROI</strong><span>1.000 · #${stateCase.full.templateIndex} = #${stateCase.roi.templateIndex}</span></p><p><strong>反态</strong><span>拒绝 @ 0.95 · ${stateCase.opposite.confidence.toFixed(3)}</span></p><p><strong>动作门</strong><span>${stateCase.action === 'tap-unselected' ? '仅点 #0 未选中' : '#1 已选中 · no-op'}</span></p><p><strong>搜索</strong><span>${integer(stateCase.fullCandidates)} → ${integer(stateCase.roiCandidates)} · ${stateCase.reduction.toFixed(1)}×</span></p></div>
    </div>
    <div class="criteria">${criterion('裁剪', stateCase.checks.crop)}${criterion('下标', stateCase.checks.index)}${criterion('全图=ROI', stateCase.checks.same)}${criterion('反态拒绝', stateCase.checks.opposite)}${criterion('动作门', stateCase.checks.action)}${criterion('跨控件拒绝', stateCase.checks.cross)}</div>
  </div>`;
}

function buttonCard(button) {
  return `<div class="button-card ${button.passed ? 'is-pass' : 'is-fail'}"><img src="${button.template}" alt="${button.label}模板"><div class="button-copy"><div><strong>${button.label}</strong><span>${button.passed ? 'PASS' : 'FAIL'}</span></div><p>命中 (${button.roi.x}, ${button.roi.y}) · 中心 (${button.roi.centerX}, ${button.roi.centerY})</p><p>ROI y=${button.region.y} · 安全阈值 ${button.calibratedThreshold.toFixed(3)}</p><p>0.95 跨行候选 ${button.crossFalsePositivesAt095} · ${button.reduction.toFixed(0)}× 缩减</p><div class="micro-checks">${criterion('crop', button.checks.crop)}${criterion('hit', button.checks.hit)}${criterion('same', button.checks.same)}${criterion('calibrated', button.checks.cross)}</div></div></div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <main id="acceptanceRoot" class="${passed ? 'is-pass' : 'is-fail'}">
    <header id="dragBar" data-clawdesk-drag><div><span class="overline">IMAGECOLOR · ISOLATED ACCEPTANCE · 20260906 R1</span><strong class="page-title">微信侧栏按钮模板匹配</strong><span class="subtitle">${fixtureDigestEvidence.length} 个 SHA-256 冻结资产 · 8 个独立按钮 · 2 组有序双态模板 · 0 次桌面点击</span></div><div class="overall"><span>${passed ? '✓' : '×'}</span><div><strong>${passed ? '验收通过' : '验收失败'}</strong><p>按钮 ${passedButtons}/${buttonEvidence.length} · 状态 ${passedStates}/${stateEvidence.length}</p></div></div></header>
    <section class="rule"><strong>业务边界</strong><span>状态数组只做分类：[ #0 未选中, #1 已选中 ]。只有 #0 可打开点击动作门；#1 必须 no-op。不同按钮始终独立匹配。</span><span class="legend"><span class="legend-hit"></span>实际命中 <span class="legend-center"></span>中心点</span></section>
    <div class="content-grid">
      <section class="state-panel"><div class="section-head"><div><span class="overline">STATE CLASSIFICATION</span><strong>消息 / 联系人 · 双态逐项证据</strong></div><span>同一 ROI 坐标跨两张 source</span></div><div class="state-grid">${stateEvidence.map(stateCard).join('')}</div></section>
      <section class="button-panel"><div class="section-head"><div><span class="overline">DISTINCT BUTTONS</span><strong>8 个按钮分别匹配</strong></div><span>固定 ROI · scale 1</span></div><div class="button-grid">${buttonEvidence.map(buttonCard).join('')}</div><div class="button-note">0.95 是真实屏幕起点，不保证灰色图标跨行互斥。这里保留 0.95 负样本计数，并以“最高跨行 confidence + 0.005”校准每个模板；业务仍必须使用对应行的紧 ROI。</div></section>
    </div>
    <footer><span>蓝色底图是 60×44 搜索 ROI；红框与十字是 matcher 的实际返回，不代表失败。</span><button id="close" type="button">关闭验收窗口</button></footer>
  </main>
</body></html>`;

const css = `
  html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#edf1f4;color:#1c2a35;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}#acceptanceRoot{display:flex;height:100%;flex-direction:column;background:#edf1f4}#dragBar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 18px;border-bottom:1px solid #d4dde4;background:#fff;user-select:none}.overline{display:block;color:#6b7e8c;font-size:9px;font-weight:750;letter-spacing:.12em}.page-title{display:block;margin-top:3px;font-size:21px;letter-spacing:-.02em}.subtitle{display:block;margin-top:3px;color:#607482;font-size:10px}.overall{display:flex;align-items:center;gap:9px;min-width:190px;padding:8px 11px;border:1px solid #c8e3d2;border-radius:8px;background:#f0faf3;color:#19713d}.is-fail .overall{border-color:#efc4c4;background:#fff1f1;color:#a73131}.overall>span{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:currentColor;color:#fff;font-size:16px;font-weight:800}.overall strong,.overall p{display:block;margin:0}.overall p{margin-top:2px;color:#567161;font-size:10px}.rule{display:flex;align-items:center;gap:9px;margin:9px 18px 0;padding:7px 10px;border-left:3px solid #c88b25;background:#fff9ec;color:#5c4b2c;font-size:10px}.rule>span:nth-child(2){flex:1}.legend{display:flex;align-items:center;gap:4px;white-space:nowrap}.legend-hit{display:inline-block;width:13px;height:10px;border:2px solid #df3434;background:rgba(223,52,52,.08)}.legend-center{display:inline-block;width:10px;height:10px;border:1px solid #df3434;border-radius:50%;background:#fff}.content-grid{display:grid;grid-template-columns:minmax(0,1.42fr) minmax(410px,.88fr);gap:10px;min-height:0;flex:1;padding:10px 18px}.state-panel,.button-panel{min-width:0}.section-head{display:flex;align-items:end;justify-content:space-between;gap:8px;margin-bottom:6px}.section-head strong{display:block;margin-top:2px;font-size:13px}.section-head>span{color:#758692;font-size:9px}.state-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.state-card{min-width:0;padding:8px;border:1px solid #d3e2d8;border-left:3px solid #29915c;border-radius:7px;background:#fff}.state-card.is-fail{border-color:#edcaca;border-left-color:#c73c3c}.card-head{display:flex;align-items:center;justify-content:space-between;gap:6px}.card-head strong{display:block;margin-top:2px;font-size:13px}.state-index{padding:3px 5px;border-radius:4px;background:#e9f7ee;color:#1b7140;font-size:9px;font-weight:750}.state-card.is-fail .state-index{background:#fff0f0;color:#a82f2f}.state-body{display:grid;grid-template-columns:126px 50px minmax(0,1fr);gap:7px;align-items:start;margin-top:6px}.mini-label{display:block;margin-bottom:3px;color:#6f808c;font-size:8px;text-align:center}.roi-stage{position:relative;width:126px;height:92px;overflow:hidden;border:1px solid #6aa5d0;border-radius:4px;background:#dcebf6}.roi-stage img{display:block;width:100%;height:100%;image-rendering:pixelated}.hit-box{position:absolute;border:2px solid #df3434;box-shadow:0 0 0 1px rgba(255,255,255,.88)}.center-mark{position:absolute;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border:1.5px solid #df3434;border-radius:50%;background:rgba(255,255,255,.8)}.center-mark:before,.center-mark:after{position:absolute;top:4px;left:-4px;width:16px;height:1px;background:#df3434;content:""}.center-mark:after{top:-4px;left:4px;width:1px;height:16px}.template-column{text-align:center}.template-preview{display:block;width:50px;height:46px;border:1px solid #d7e0e6;border-radius:4px;background:#f5f7f8;image-rendering:pixelated;object-fit:fill}.template-size{display:block;margin-top:3px;color:#758692;font-size:8px}.facts{display:grid;gap:3px;min-width:0}.facts p{display:grid;grid-template-columns:55px minmax(0,1fr);gap:4px;margin:0;color:#5d707e;font-size:9px;line-height:1.2}.facts strong{color:#2a3d4a}.facts span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.criteria{display:flex;flex-wrap:wrap;gap:3px 7px;margin-top:6px;padding-top:5px;border-top:1px solid #edf1f3}.criterion{display:inline-flex;align-items:center;gap:2px;color:#687b88;font-size:8px;white-space:nowrap}.criterion>span{display:grid;width:11px;height:11px;place-items:center;border-radius:50%;font-size:8px}.criterion.is-pass>span{background:#e0f2e6;color:#237544}.criterion.is-fail>span{background:#ffe4e4;color:#af3030}.button-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.button-card{display:grid;grid-template-columns:54px minmax(0,1fr);gap:7px;min-width:0;padding:7px;border:1px solid #d6e1e6;border-left:3px solid #29915c;border-radius:7px;background:#fff}.button-card.is-fail{border-color:#edcaca;border-left-color:#c73c3c}.button-card>img{width:54px;height:48px;border:1px solid #d7e0e6;border-radius:4px;background:#f5f7f8;image-rendering:pixelated;object-fit:fill}.button-copy{min-width:0}.button-copy>div{display:flex;align-items:center;justify-content:space-between;gap:4px}.button-copy strong{font-size:11px}.button-copy>div>span{color:#247346;font-size:8px;font-weight:750}.button-copy p{margin:3px 0 0;overflow:hidden;color:#627582;font-size:8px;text-overflow:ellipsis;white-space:nowrap}.micro-checks{display:flex;flex-wrap:wrap;gap:2px 5px;margin-top:4px}.button-note{margin-top:7px;padding:6px 8px;border:1px solid #d7e1e6;border-radius:6px;background:#f8fafb;color:#647682;font-size:9px;line-height:1.35}footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 18px;border-top:1px solid #d4dde4;background:#fff;color:#647682;font-size:9px}button{padding:6px 12px;border:1px solid #5c7080;border-radius:5px;background:#fff;color:#263b4a;font:inherit;font-weight:700}button:hover{background:#f1f5f7}
  .overall>span{background:#278a55}.is-fail .overall>span{background:#b43a3a}.state-body{grid-template-columns:112px 44px minmax(0,1fr)}.roi-stage{width:112px;height:82px}.template-preview{width:44px;height:41px}.facts p{grid-template-columns:51px minmax(0,1fr)}.facts span{overflow:visible;text-overflow:clip}
`;

const report = {
  suiteId,
  passed,
  summary: {
    fixtureDigestsPassed: fixtureDigestEvidence.filter((entry) => entry.matched).length,
    fixtureDigestsTotal: fixtureDigestEvidence.length,
    buttonsPassed: passedButtons,
    buttonsTotal: buttonEvidence.length,
    stateCasesPassed: passedStates,
    stateCasesTotal: stateEvidence.length,
    desktopClicks: 0,
  },
  buttons: buttonEvidence.map((button) => ({
    id: button.id,
    bounds: button.bounds,
    region: button.region,
    full: button.full,
    roi: button.roi,
    reduction: button.reduction,
    crossFalsePositivesAt095: button.crossFalsePositivesAt095,
    maximumCrossConfidence: button.maximumCrossConfidence,
    calibratedThreshold: button.calibratedThreshold,
    checks: button.checks,
  })),
  states: stateEvidence.map((stateCase) => ({
    controlId: stateCase.controlId,
    state: stateCase.state,
    sourceId: stateCase.sourceId,
    bounds: stateCase.bounds,
    region: stateCase.region,
    templateIndex: stateCase.templateIndex,
    full: stateCase.full,
    roi: stateCase.roi,
    opposite: stateCase.opposite,
    action: stateCase.action,
    reduction: stateCase.reduction,
    checks: stateCase.checks,
  })),
};
await File.writeJSON(`${Execution.artifactDir}/wechat-sidebar-button-template-visual-acceptance-20260906-r1.json`, report);

const panel = await ui.createWindow({
  id: 'wechatSidebarTemplateAcceptance20260906R1',
  kind: 'normal',
  title: '微信侧栏按钮模板匹配 · 隔离验收 R1',
  position: {
    mode: 'anchor',
    size: { width: 1280, height: 680 },
    horizontal: 'center',
    vertical: 'center',
    margin: 16,
    display: 'primary',
  },
  alwaysOnTop: false,
  draggable: true,
  theme: 'system',
  content: { html, css },
});
panel.control('close').on('click', () => panel.close());
const shown = await panel.show();
console.log(`WECHAT_SIDEBAR_BUTTON_TEMPLATE_VISUAL_20260906_R1_READY=${passed ? 'PASS' : 'FAIL'} buttons=${passedButtons}/${buttonEvidence.length} states=${passedStates}/${stateEvidence.length} window=${shown.bounds.width}x${shown.bounds.height}`);
await panel.waitUntilClosed();
if (!passed) throw new Error('WeChat sidebar button template visual acceptance failed; inspect the red criteria.');
console.log(`WECHAT_SIDEBAR_BUTTON_TEMPLATE_VISUAL_20260906_R1_COMPLETE=PASS window=${shown.bounds.width}x${shown.bounds.height}`);
