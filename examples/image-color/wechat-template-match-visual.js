// Run from the repository root with:
// ./opendesk -ui -script examples/image-color/wechat-template-match-visual.js -console-mode script
//
// Manual acceptance for one real control's ordered visual states. It remains
// open until closed so the two source screenshots, their ROIs, template order,
// returned templateIndex values, and pass/fail criteria can be inspected.

function assertCustomUIAvailable() {
  const capabilities = ui.getCapabilities();
  if (!capabilities.enabled || !capabilities.available) {
    throw new Error(`Custom UI is unavailable: ${capabilities.reason || 'run with -ui on a supported platform'}`);
  }
}

const matchKeys = ['found', 'x', 'y', 'width', 'height', 'centerX', 'centerY', 'confidence', 'scale', 'templateIndex'];

function sameMatch(left, right) {
  return matchKeys.every((key) => left[key] === right[key]);
}

function candidatePositionCount(sourceSize, templates, region) {
  const width = region ? region.width : sourceSize[0];
  const height = region ? region.height : sourceSize[1];
  return templates.reduce((total, template) => {
    const size = ImageColor.getSize(template.path);
    return total + Math.max(0, width - size[0] + 1) * Math.max(0, height - size[1] + 1);
  }, 0);
}

function expectedMatch(stateCase, match) {
  const { bounds, templateIndex } = stateCase;
  return match.found === true
    && match.x === bounds.x && match.y === bounds.y
    && match.width === bounds.width && match.height === bounds.height
    && match.centerX === bounds.x + bounds.width / 2
    && match.centerY === bounds.y + bounds.height / 2
    && match.confidence === 1 && match.scale === 1
    && match.templateIndex === templateIndex;
}

function percent(value, total) {
  return `${(value / total) * 100}%`;
}

function number(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function resultText(match) {
  if (!match.found) return '未命中';
  return `(${match.x}, ${match.y}) · ${match.width} × ${match.height} · 中心 (${match.centerX}, ${match.centerY}) · #${match.templateIndex}`;
}

function criterion(label, passed) {
  return `<span class="criterion ${passed ? 'is-pass' : 'is-fail'}"><span class="criterion-mark">${passed ? '✓' : '×'}</span>${label}</span>`;
}

function sourceFigure(stateCase) {
  const hit = stateCase.roi.result;
  const [width, height] = stateCase.sourceSize;
  const { region } = stateCase;
  const compact = stateCase.sourceAsset.includes('wechat-sidebar-states');
  const hitMarkup = hit.found
    ? `<div class="hit-box" style="left:${percent(hit.x, width)};top:${percent(hit.y, height)};width:${percent(hit.width, width)};height:${percent(hit.height, height)}"></div>`
    : '<div class="missing-hit">未命中</div>';
  return `<div class="source-figure ${compact ? 'is-compact' : 'is-full'}">
    <div class="source-caption"><strong>${stateCase.stateLabel}</strong><span>${stateCase.sourceLabel} · ${width} × ${height}</span></div>
    <div class="source-stage">
      <img src="${stateCase.sourceAsset}" alt="${stateCase.stateLabel} 的真实 source 截图">
      <div class="roi-box" style="left:${percent(region.x, width)};top:${percent(region.y, height)};width:${percent(region.width, width)};height:${percent(region.height, height)}"><span class="roi-label">ROI</span></div>
      ${hitMarkup}
    </div>
  </div>`;
}

function stateCard(stateCase, templates, templatePairDifferent) {
  const passed = Object.values(stateCase.checks).every(Boolean) && templatePairDifferent;
  const matchedTemplate = templates[stateCase.templateIndex];
  return `<div class="state-card ${passed ? 'is-pass' : 'is-fail'}">
    <header><div><span class="eyebrow">STATE #${stateCase.templateIndex}</span><strong>${stateCase.stateLabel}</strong></div><span class="verdict">${passed ? '通过' : '失败'}</span></header>
    <div class="state-body">
      <div class="preview-group"><div><span>状态模板</span><img src="${matchedTemplate.previewPath}" alt="${stateCase.stateLabel} 模板"></div><div><span>source 裁剪</span><img src="${stateCase.crop}" alt="${stateCase.stateLabel} source 裁剪"></div></div>
      <div class="result-lines"><p><strong>全图</strong><span>${resultText(stateCase.full.result)}</span></p><p><strong>ROI</strong><span>${resultText(stateCase.roi.result)}</span></p><p><strong>候选</strong><span>${number(stateCase.roi.candidatePositions)} / ${number(stateCase.full.candidatePositions)} · ${stateCase.candidateReductionFactor.toFixed(1)}× 缩减</span></p><p><strong>反向</strong><span>${stateCase.opposite.found ? '错误命中' : `0.95 拒绝 · ${stateCase.opposite.confidence.toFixed(3)}`}</span></p><p><strong>动作</strong><span>${stateCase.actionGate.action === 'tap-unselected' ? '只允许点 #0 未选中模板' : '已选中：不点击'}</span></p></div>
    </div>
    <div class="criteria">${criterion('裁剪一致', stateCase.checks.templateIntegrity)}${criterion('状态下标', stateCase.checks.expectedState)}${criterion('全图 = ROI', stateCase.checks.sameMatch)}${criterion('反向拒绝', stateCase.checks.oppositeStateRejected)}${criterion('动作 gate', stateCase.checks.unselectedActionGate)}${criterion('ROI 缩减', stateCase.checks.reducedSearchSpace)}${criterion('模板不同', templatePairDifferent)}</div>
  </div>`;
}

function renderVisual(report) {
  const passed = report.templatePairDifferent && report.cases.every((stateCase) => Object.values(stateCase.checks).every(Boolean));
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <main id="visualAcceptance" class="${passed ? 'result-pass' : 'result-fail'}">
      <header id="dragBar" data-clawdesk-drag><div><span class="eyebrow">IMAGECOLOR · MANUAL ACCEPTANCE</span><strong class="page-title">微信“消息”按钮 · 选中 / 未选中状态匹配</strong><span class="subtitle">有序数组：#0 灰色未选中 · #1 绿色已选中</span></div><div class="overall-result"><span>${passed ? '✓' : '×'}</span><div><strong>${passed ? '验收通过' : '验收失败'}</strong><span>${passed ? '两种真实状态均返回预期 templateIndex' : '请检查红色失败项、模板或 ROI'}</span></div></div></header>
      <section class="notice"><strong>业务规则：</strong>数组只用于识别当前状态；切换时仅点击 #0 未选中模板，#1 已选中必须 no-op。下方两张 source 来自不同 fixture；它们证明状态数组契约，不等于跨主题/DPI 的 live 兼容性。</section>
      <section class="content">
        <section class="source-section"><div class="section-heading"><div><span class="eyebrow">SOURCE EVIDENCE</span><strong>两张真实 source：ROI 与 matcher 返回位置</strong></div><div class="legend"><span class="legend-swatch legend-roi"></span>ROI <span class="legend-swatch legend-hit"></span>命中</div></div><div class="source-grid">${report.cases.map(sourceFigure).join('')}</div></section>
        <section class="state-section"><div class="section-heading"><div><span class="eyebrow">ORDERED STATE ARRAY</span><strong>每种状态都必须命中自己的数组下标</strong></div><span class="array-code">[ unselected, selected ]</span></div><div class="state-cards">${report.cases.map((stateCase) => stateCard(stateCase, report.templates, report.templatePairDifferent)).join('')}</div></section>
      </section>
      <footer><span>蓝框是实际搜索 ROI；红框来自 matcher，不代表失败。关闭窗口后结束人工验收。</span><button id="close" type="button">关闭</button></footer>
    </main>
  </body></html>`;
}

const visualCSS = `
  html,body{height:100%;margin:0;background:#f4f6f8;color:#1b2732;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}#visualAcceptance{min-height:100%;display:flex;flex-direction:column;background:#f4f6f8}#dragBar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 20px;border-bottom:1px solid #dbe2e8;background:#fff;user-select:none}.eyebrow{display:block;color:#6a7b88;font-size:9px;font-weight:700;letter-spacing:.12em}.page-title{display:block;margin-top:3px;font-size:20px;letter-spacing:-.02em}.subtitle{display:block;margin-top:3px;color:#566a7a;font-size:11px}.overall-result{display:flex;align-items:center;gap:9px;padding:8px 11px;border:1px solid #cfe5d6;border-radius:7px;background:#f1faf4;color:#1a6d3b}.result-fail .overall-result{border-color:#efc4c4;background:#fff3f3;color:#a43434}.overall-result>span{display:grid;width:23px;height:23px;place-items:center;border-radius:50%;background:currentColor;color:#fff;font-weight:800}.overall-result strong,.overall-result div span{display:block}.overall-result div span{margin-top:2px;color:#587160;font-size:10px}.result-fail .overall-result div span{color:#895555}.notice{margin:10px 20px 0;padding:7px 10px;border-left:3px solid #d79929;background:#fff9ed;color:#644f2b;font-size:10px;line-height:1.4}.content{display:grid;gap:12px;flex:1;padding:12px 20px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:7px}.section-heading strong{display:block;margin-top:2px;font-size:14px}.legend{display:flex;align-items:center;gap:4px;color:#5d6d7b;font-size:10px;white-space:nowrap}.legend-swatch{display:inline-block;width:12px;height:9px;margin-left:4px}.legend-roi{border:2px solid #2784cf;background:rgba(39,132,207,.16)}.legend-hit{border:2px solid #df3939}.source-grid{display:grid;grid-template-columns:minmax(360px,1fr) 150px;gap:12px;align-items:stretch}.source-figure{margin:0;padding:8px;border:1px solid #d6dee4;border-radius:8px;background:#fff}.source-caption{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;color:#687986;font-size:10px}.source-caption strong{color:#293d4c;font-size:11px}.source-stage{position:relative;overflow:hidden;border:1px solid #cad5dd;border-radius:5px;background:#e6eaee}.source-stage img{display:block;width:100%;height:100%}.is-full .source-stage{aspect-ratio:880/640}.is-compact .source-stage{aspect-ratio:62/200;max-width:92px;margin:auto}.roi-box,.hit-box{position:absolute;pointer-events:none}.roi-box{border:1.5px solid #2784cf;background:rgba(39,132,207,.16)}.hit-box{border:2px solid #df3939;box-shadow:0 0 0 1px rgba(255,255,255,.88)}.roi-label{position:absolute;left:-2px;padding:2px 4px;border-radius:3px;color:#fff;font-size:8px;font-weight:700;line-height:1;white-space:nowrap}.roi-label{top:-15px;background:#2275b7}.missing-hit{position:absolute;inset:42% 20%;padding:5px;border-radius:4px;background:#a43434;color:#fff;font-weight:700;text-align:center}.array-code{padding:4px 7px;border-radius:4px;background:#e9eef2;color:#334958;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.state-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.state-card{padding:9px 10px;border:1px solid #d6e3da;border-left:3px solid #2b9460;border-radius:8px;background:#fff}.state-card.is-fail{border-color:#ecd1d1;border-left-color:#c43c3c}.state-card header{display:flex;align-items:center;justify-content:space-between;gap:8px}.state-card header strong{display:block;margin-top:2px;font-size:14px}.verdict{padding:3px 6px;border-radius:4px;background:#eaf7ee;color:#217342;font-size:10px;font-weight:700}.state-card.is-fail .verdict{background:#fff0f0;color:#ad3434}.state-body{display:grid;grid-template-columns:142px minmax(0,1fr);gap:10px}.preview-group{display:flex;gap:6px}.preview-group>div{width:67px;color:#6b7c89;font-size:9px;text-align:center}.preview-group span{display:block;margin-bottom:3px}.preview-group img{display:block;width:67px;height:56px;border:1px solid #d6dee4;border-radius:4px;background:#f2f5f6;image-rendering:pixelated;object-fit:fill}.result-lines{display:grid;gap:3px;min-width:0}.result-lines p{display:grid;grid-template-columns:29px minmax(0,1fr);gap:4px;margin:0;color:#526675;font-size:10px;line-height:1.2}.result-lines strong{color:#293d4c}.criteria{display:flex;flex-wrap:wrap;gap:4px 7px;margin-top:7px;padding-top:6px;border-top:1px solid #edf1f3}.criterion{display:inline-flex;align-items:center;gap:2px;color:#667783;font-size:9px;white-space:nowrap}.criterion-mark{display:grid;width:12px;height:12px;place-items:center;border-radius:50%;font-size:9px}.criterion.is-pass .criterion-mark{background:#e2f3e7;color:#237542}.criterion.is-fail .criterion-mark{background:#ffe4e4;color:#b03131}footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 20px;border-top:1px solid #dbe2e8;background:#fff;color:#687986;font-size:10px}button{padding:6px 13px;border:1px solid #596c7a;border-radius:5px;background:#fff;color:#263b4b;font:inherit;font-weight:700}button:hover{background:#f4f7f8}
  .content{display:flex;flex-direction:column;gap:12px;flex:1;padding:12px 20px}
  .source-grid{grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
  .source-stage img{object-fit:fill}
  .is-full .source-stage{width:300px;height:218px;margin:auto;aspect-ratio:auto}
  .is-compact .source-stage{width:68px;height:218px;max-width:none;margin:auto;aspect-ratio:auto}
`;

async function main() {
  assertCustomUIAvailable();

  const templates = [
    { state: 'unselected', path: './examples/image-color/fixtures/wechat-message/unselected.png', previewPath: 'fixtures/wechat-message/unselected.png' },
    { state: 'selected', path: './examples/image-color/fixtures/wechat-message/selected.png', previewPath: 'fixtures/wechat-message/selected.png' },
  ];
  const templatePaths = templates.map((template) => template.path);
  const templateImages = templatePaths.map((path) => ImageColor.loadBase64(path));
  const stateDifference = ImageColor.diff(templateImages[0], templateImages[1]);
  const templatePairDifferent = stateDifference.matched === false;
  const cases = [
    {
      stateLabel: '灰色未选中 · templateIndex 0', sourcePath: './examples/image-color/fixtures/wechat-sidebar-states.png',
      sourceAsset: 'fixtures/wechat-sidebar-states.png', sourceLabel: '精简侧栏状态 source', templateIndex: 0,
      bounds: { x: 18, y: 21, width: 24, height: 22 }, region: { x: 0, y: 10, width: 60, height: 44 },
    },
    {
      stateLabel: '绿色已选中 · templateIndex 1', sourcePath: './examples/image-color/fixtures/wechat-panel.png',
      sourceAsset: 'fixtures/wechat-panel.png', sourceLabel: '完整微信面板 source', templateIndex: 1,
      bounds: { x: 18, y: 111, width: 24, height: 22 }, region: { x: 0, y: 100, width: 60, height: 44 },
    },
  ].map((stateCase) => {
    const sourceSize = ImageColor.getSize(stateCase.sourcePath);
    const crop = ImageColor.clip(stateCase.sourcePath, stateCase.bounds);
    const integrity = ImageColor.diff(crop, templateImages[stateCase.templateIndex]);
    const full = { result: ImageColor.findImage(stateCase.sourcePath, templatePaths, { threshold: 1 }) };
    const roi = { result: ImageColor.findImage(stateCase.sourcePath, templatePaths, { threshold: 1, region: stateCase.region }) };
    const opposite = ImageColor.findImage(stateCase.sourcePath, templatePaths[1 - stateCase.templateIndex], {
      threshold: 0.95,
      region: stateCase.region,
    });
    const unselectedOnly = ImageColor.findImage(stateCase.sourcePath, templatePaths[0], {
      threshold: 1,
      region: stateCase.region,
    });
    const action = unselectedOnly.found ? 'tap-unselected' : 'no-op';
    const fullCandidatePositions = candidatePositionCount(sourceSize, templates);
    const roiCandidatePositions = candidatePositionCount(sourceSize, templates, stateCase.region);
    return {
      ...stateCase,
      sourceSize,
      crop,
      integrity,
      full: { ...full, candidatePositions: fullCandidatePositions },
      roi: { ...roi, candidatePositions: roiCandidatePositions },
      opposite,
      actionGate: { unselectedOnly, action },
      candidateReductionFactor: fullCandidatePositions / roiCandidatePositions,
      checks: {
        templateIntegrity: integrity.matched === true && integrity.diffPixels === 0,
        expectedState: expectedMatch(stateCase, full.result) && expectedMatch(stateCase, roi.result),
        sameMatch: sameMatch(full.result, roi.result),
        oppositeStateRejected: opposite.found === false,
        unselectedActionGate: unselectedOnly.found === (stateCase.templateIndex === 0)
          && action === (stateCase.templateIndex === 0 ? 'tap-unselected' : 'no-op'),
        reducedSearchSpace: roiCandidatePositions < fullCandidatePositions,
      },
    };
  });
  const passed = templatePairDifferent && cases.every((stateCase) => Object.values(stateCase.checks).every(Boolean));

  const panel = await ui.createWindow({
    id: 'wechatTemplateMatchVisualAcceptance',
    kind: 'normal',
    title: '微信消息按钮 · 状态模板匹配验收',
    position: { mode: 'anchor', size: { width: 1240, height: 800 }, horizontal: 'center', vertical: 'center', margin: 20, display: 'primary' },
    alwaysOnTop: false,
    draggable: true,
    theme: 'system',
    content: { html: renderVisual({ templates, templatePairDifferent, cases }), css: visualCSS },
  });
  panel.control('close').on('click', () => panel.close());
  const shown = await panel.show();
  console.log(`WECHAT_TEMPLATE_MATCH_VISUAL_READY=${passed ? 'PASS' : 'FAIL'} · states ${cases.filter((stateCase) => Object.values(stateCase.checks).every(Boolean)).length}/${cases.length} · window ${shown.bounds.width} × ${shown.bounds.height}`);
  await panel.waitUntilClosed();
  if (!passed) throw new Error('WeChat state-template visual acceptance failed; inspect the displayed failed criteria.');
  console.log(`WECHAT_TEMPLATE_MATCH_VISUAL_COMPLETE=PASS · window ${shown.bounds.width} × ${shown.bounds.height}`);
}

await main();
