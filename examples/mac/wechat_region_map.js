const wait = (ms) => page.waitFor(ms);

const CONFIG = {
  visionProfile: {
    provider: 'local',
    language: 'ch',
    minConfidence: 0.0,
    timeoutMs: 15000,
  },
  coarseStep: 4,
  refineRadius: 10,
  sampleStep: 18,
  horizontalSampleStep: 22,
  toolbarBand: [0.03, 0.14],
  chatListBand: [0.18, 0.40],
  headerBand: [0.04, 0.18],
  inputBand: [0.68, 0.92],
  output: {
    sourceImage: '.runtime/temp/mac/wechat_region_map_source.png',
    annotatedImage: '.runtime/temp/mac/wechat_region_map_annotated.png',
    reportJson: '.runtime/temp/mac/wechat_region_map_latest.json',
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(v) {
  return String(v || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function compactText(v) {
  return normalizeText(v).replace(/\s+/g, '');
}

function hexToRgb(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  if (raw.length !== 6) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function colorDistance(a, b) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  if (!c1 || !c2) return 0;
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function smoothScores(points, radius = 2) {
  return points.map((point, index) => {
    let sum = 0;
    let count = 0;
    for (let i = index - radius; i <= index + radius; i++) {
      if (!points[i]) continue;
      sum += Number(points[i].score || 0);
      count += 1;
    }
    return { ...point, score: count ? sum / count : Number(point.score || 0) };
  });
}

function bestPoint(points, fallback) {
  if (!points.length) return fallback;
  return points
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Math.abs(a.pos - fallback.pos) - Math.abs(b.pos - fallback.pos))[0];
}

function sortByYThenX(items) {
  return items.slice().sort((a, b) => {
    const ay = Number(a?.bbox?.y || 0);
    const by = Number(b?.bbox?.y || 0);
    if (ay !== by) return ay - by;
    const ax = Number(a?.bbox?.x || 0);
    const bx = Number(b?.bbox?.x || 0);
    return ax - bx;
  });
}

async function getWechatWindow() {
  const list = await window.list();
  const wx = (list || [])
    .filter((w) => {
      const exe = String(w?.exeName || '').toLowerCase();
      const title = String(w?.title || '').toLowerCase();
      return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
    })
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx?.title) {
    throw new Error('未找到微信窗口，请先打开并登录微信桌面版');
  }
  return wx;
}

async function focusWechat() {
  const wx = await getWechatWindow();
  await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
  await wait(500);
  let active = await window.getActiveWindow();
  if ((active?.width || 0) < 900 || (active?.height || 0) < 680) {
    await window.setWindowBounds(wx.title, 80, 60, 1280, 860);
    await wait(700);
    active = await window.getActiveWindow();
  }
  return active || wx;
}

async function captureWindow(win, name) {
  const path = CONFIG.output.sourceImage;
  await page.screenshot({
    path,
    target: 'activeWindow',
    clip: {
      x: 0,
      y: 0,
      width: win.width,
      height: win.height,
    },
  });
  return path;
}

async function getImageBase64(path) {
  return ImageColor.loadBase64(path);
}

function screenPoint(win, localX, localY) {
  return {
    x: Math.round(win.x + localX),
    y: Math.round(win.y + localY),
  };
}

function screenPixels(points) {
  return Screen.pixels(points, true) || [];
}

async function sampleAverageColor(win, box) {
  const xs = [];
  const ys = [];
  for (let i = 1; i <= 4; i++) {
    xs.push(clamp(Math.round(box.x + (box.width * i) / 5), 0, box.x + box.width - 1));
    ys.push(clamp(Math.round(box.y + (box.height * i) / 5), 0, box.y + box.height - 1));
  }
  const points = [];
  for (const x of xs) {
    for (const y of ys) {
      points.push(screenPoint(win, x, y));
    }
  }
  const colors = screenPixels(points);
  const rgbs = colors.map(hexToRgb).filter(Boolean);
  if (!rgbs.length) return '#000000';
  const r = Math.round(average(rgbs.map((v) => v.r)));
  const g = Math.round(average(rgbs.map((v) => v.g)));
  const b = Math.round(average(rgbs.map((v) => v.b)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

async function boundaryScore(win, orientation, pos, spanStart, spanEnd, sampleStep) {
  const points = [];
  for (let other = spanStart; other < spanEnd; other += sampleStep) {
    if (orientation === 'vertical') {
      points.push(screenPoint(win, Math.max(0, pos - 1), other));
      points.push(screenPoint(win, pos, other));
    } else {
      points.push(screenPoint(win, other, Math.max(0, pos - 1)));
      points.push(screenPoint(win, other, pos));
    }
  }
  const colors = screenPixels(points);
  const samples = [];
  for (let i = 0; i + 1 < colors.length; i += 2) {
    samples.push(colorDistance(colors[i], colors[i + 1]));
  }
  return average(samples);
}

async function collectBoundaryPoints(win, orientation, minPos, maxPos, spanStart, spanEnd, coarseStep, sampleStep) {
  const points = [];
  for (let pos = minPos; pos <= maxPos; pos += coarseStep) {
    const score = await boundaryScore(win, orientation, pos, spanStart, spanEnd, sampleStep);
    points.push({ pos, score, orientation });
  }
  return smoothScores(points, 1);
}

async function refineBoundary(win, orientation, roughPos, spanStart, spanEnd, radius, sampleStep) {
  const minPos = Math.max(1, roughPos - radius);
  const maxPos = roughPos + radius;
  const refined = await collectBoundaryPoints(win, orientation, minPos, maxPos, spanStart, spanEnd, 1, sampleStep);
  return bestPoint(refined, { pos: roughPos, score: 0, orientation });
}

async function detectSeparators(win, width, height) {
  const toolbarRange = [Math.round(width * CONFIG.toolbarBand[0]), Math.round(width * CONFIG.toolbarBand[1])];
  const chatListRange = [Math.round(width * CONFIG.chatListBand[0]), Math.round(width * CONFIG.chatListBand[1])];

  const toolbarCoarse = await collectBoundaryPoints(
    win,
    'vertical',
    toolbarRange[0],
    toolbarRange[1],
    0,
    height,
    CONFIG.coarseStep,
    CONFIG.sampleStep
  );
  const chatListCoarse = await collectBoundaryPoints(
    win,
    'vertical',
    chatListRange[0],
    chatListRange[1],
    0,
    height,
    CONFIG.coarseStep,
    CONFIG.sampleStep
  );

  const toolbar = await refineBoundary(
    win,
    'vertical',
    bestPoint(toolbarCoarse, { pos: Math.round(width * 0.08), score: 0 }).pos,
    0,
    height,
    CONFIG.refineRadius,
    CONFIG.sampleStep
  );
  const chatList = await refineBoundary(
    win,
    'vertical',
    bestPoint(chatListCoarse, { pos: Math.round(width * 0.28), score: 0 }).pos,
    0,
    height,
    CONFIG.refineRadius,
    CONFIG.sampleStep
  );

  const rightStart = chatList.pos;
  const headerRange = [Math.round(height * CONFIG.headerBand[0]), Math.round(height * CONFIG.headerBand[1])];
  const inputRange = [Math.round(height * CONFIG.inputBand[0]), Math.round(height * CONFIG.inputBand[1])];
  const headerCoarse = await collectBoundaryPoints(
    win,
    'horizontal',
    headerRange[0],
    headerRange[1],
    rightStart,
    width,
    CONFIG.coarseStep,
    CONFIG.horizontalSampleStep
  );
  const inputCoarse = await collectBoundaryPoints(
    win,
    'horizontal',
    inputRange[0],
    inputRange[1],
    rightStart,
    width,
    CONFIG.coarseStep,
    CONFIG.horizontalSampleStep
  );

  const header = await refineBoundary(
    win,
    'horizontal',
    bestPoint(headerCoarse, { pos: Math.round(height * 0.11), score: 0 }).pos,
    rightStart,
    width,
    CONFIG.refineRadius,
    CONFIG.horizontalSampleStep
  );
  const input = await refineBoundary(
    win,
    'horizontal',
    bestPoint(inputCoarse, { pos: Math.round(height * 0.77), score: 0 }).pos,
    rightStart,
    width,
    CONFIG.refineRadius,
    CONFIG.horizontalSampleStep
  );

  return {
    vertical: [toolbar, chatList],
    horizontal: [header, input],
  };
}

function buildRegions(width, height, separators) {
  const [toolbar, chatList] = separators.vertical;
  const [header, input] = separators.horizontal;
  const toolbarPos = separatorPosition(toolbar);
  const chatListPos = separatorPosition(chatList);
  const headerPos = separatorPosition(header);
  const inputPos = separatorPosition(input);
  return [
    { id: 'toolbar', role: 'toolbar', label: 'Toolbar', bbox: { x: 0, y: 0, width: toolbarPos, height } },
    {
      id: 'conversation_list',
      role: 'conversation_list',
      label: 'Conversation List',
      bbox: { x: toolbarPos, y: 0, width: chatListPos - toolbarPos, height },
    },
    {
      id: 'chat_header',
      role: 'chat_header',
      label: 'Chat Header',
      bbox: { x: chatListPos, y: 0, width: width - chatListPos, height: headerPos },
    },
    {
      id: 'message_list',
      role: 'message_list',
      label: 'Message List',
      bbox: { x: chatListPos, y: headerPos, width: width - chatListPos, height: inputPos - headerPos },
    },
    {
      id: 'input_area',
      role: 'input_area',
      label: 'Input Area',
      bbox: { x: chatListPos, y: inputPos, width: width - chatListPos, height: height - inputPos },
    },
  ];
}

function separatorPosition(separator) {
  return Math.round(Number(separator?.position ?? separator?.pos ?? 0));
}

function separatorConfidence(separator) {
  return Number(separator?.confidence ?? separator?.score ?? 0);
}

function separatorSpan(separator) {
  return {
    start: Number(separator?.meta?.span?.start ?? 0),
    end: Number(separator?.meta?.span?.end ?? 0),
  };
}

function chooseSeparatorFromBand(items, band, total, predicate) {
  const min = Math.round(total * band[0]);
  const max = Math.round(total * band[1]);
  const filtered = (items || [])
    .filter((item) => {
      const position = separatorPosition(item);
      if (position < min || position > max) return false;
      return predicate ? predicate(item) : true;
    })
    .slice()
    .sort((a, b) => separatorConfidence(b) - separatorConfidence(a) || Math.abs(separatorPosition(a) - min) - Math.abs(separatorPosition(b) - min));
  return filtered[0] || null;
}

function confidenceLabel(value) {
  if (value >= 0.6) return 'high';
  if (value >= 0.35) return 'medium';
  return 'low';
}

function buildSemanticLayoutFromSeparators(width, height, separators, sourceMode, warnings) {
  const vertical = (separators?.vertical || []).slice().sort((a, b) => separatorPosition(a) - separatorPosition(b));
  const horizontal = (separators?.horizontal || []).slice().sort((a, b) => separatorPosition(a) - separatorPosition(b));
  const [toolbar, chatList] = vertical;
  const [header, input] = horizontal;
  if (!toolbar || !chatList || !header || !input) {
    throw new Error(`semantic separator set incomplete for ${sourceMode}`);
  }
  if (separatorPosition(chatList) <= separatorPosition(toolbar) + 48) {
    throw new Error(`conversation_list separator collapsed for ${sourceMode}`);
  }
  if (separatorPosition(input) <= separatorPosition(header) + 80) {
    throw new Error(`input separator collapsed for ${sourceMode}`);
  }
  const regions = buildRegions(width, height, { vertical: [toolbar, chatList], horizontal: [header, input] }).map((region) => ({
    ...region,
    confidence: Math.min(
      separatorConfidence(toolbar),
      separatorConfidence(chatList),
      region.id === 'toolbar' || region.id === 'conversation_list'
        ? Math.max(separatorConfidence(toolbar), separatorConfidence(chatList))
        : region.id === 'chat_header'
          ? separatorConfidence(header)
          : region.id === 'input_area'
            ? separatorConfidence(input)
            : Math.min(separatorConfidence(header), separatorConfidence(input))
    ),
  }));
  return {
    sourceMode,
    warnings: warnings || [],
    separators: {
      vertical: [toolbar, chatList],
      horizontal: [header, input],
    },
    regions,
    confidence: {
      toolbar: confidenceLabel(separatorConfidence(toolbar)),
      conversationList: confidenceLabel(separatorConfidence(chatList)),
      header: confidenceLabel(separatorConfidence(header)),
      input: confidenceLabel(separatorConfidence(input)),
    },
  };
}

function buildSemanticLayout(layout, width, height) {
  const vertical = (layout?.separators?.vertical || []).slice().sort((a, b) => separatorPosition(a) - separatorPosition(b));
  const horizontal = (layout?.separators?.horizontal || []).slice().sort((a, b) => separatorPosition(a) - separatorPosition(b));
  const toolbar = chooseSeparatorFromBand(vertical, CONFIG.toolbarBand, width, (item) => {
    const span = separatorSpan(item);
    return span.end - span.start >= height * 0.7;
  });
  const chatList = chooseSeparatorFromBand(vertical, CONFIG.chatListBand, width, (item) => separatorPosition(item) > separatorPosition(toolbar) + 48);
  const header = chooseSeparatorFromBand(horizontal, CONFIG.headerBand, height, (item) => {
    const span = separatorSpan(item);
    return span.start >= separatorPosition(chatList) - 32;
  });
  const input = chooseSeparatorFromBand(horizontal, CONFIG.inputBand, height, (item) => {
    const span = separatorSpan(item);
    return span.start >= separatorPosition(chatList) - 32;
  });
  if (!toolbar || !chatList || !header || !input) {
    throw new Error(`通用 layout 结果不足以映射微信语义区域: ${JSON.stringify(layout?.warnings || [])}`);
  }
  return buildSemanticLayoutFromSeparators(
    width,
    height,
    {
      vertical: [toolbar, chatList],
      horizontal: [header, input],
    },
    'generic_layout',
    layout?.warnings || []
  );
}

function normalizeBox(box) {
  const x = Number(box?.x ?? box?.X ?? 0);
  const y = Number(box?.y ?? box?.Y ?? 0);
  const width = Number(box?.width ?? box?.Width ?? 0);
  const height = Number(box?.height ?? box?.Height ?? 0);
  return {
    x: Math.max(0, Math.round(Number.isFinite(x) ? x : 0)),
    y: Math.max(0, Math.round(Number.isFinite(y) ? y : 0)),
    width: Math.max(1, Math.round(Number.isFinite(width) ? width : 1)),
    height: Math.max(1, Math.round(Number.isFinite(height) ? height : 1)),
  };
}

function overlapY(a, b) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, bottom - top);
}

function median(values) {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function clusterRows(elements, regionBox) {
  const rows = [];
  for (const element of sortByYThenX(elements)) {
    const bbox = normalizeBox(element.bbox || {});
    const centerY = bbox.y + bbox.height / 2;
    const current = rows[rows.length - 1];
    if (!current) {
      rows.push({ items: [element], minY: bbox.y, maxY: bbox.y + bbox.height, centerY });
      continue;
    }
    const currentBox = { y: current.minY, height: current.maxY - current.minY };
    const shouldMerge =
      overlapY(bbox, currentBox) > 4 || Math.abs(centerY - current.centerY) <= Math.max(14, bbox.height * 0.8);
    if (shouldMerge) {
      current.items.push(element);
      current.minY = Math.min(current.minY, bbox.y);
      current.maxY = Math.max(current.maxY, bbox.y + bbox.height);
      current.centerY = (current.minY + current.maxY) / 2;
    } else {
      rows.push({ items: [element], minY: bbox.y, maxY: bbox.y + bbox.height, centerY });
    }
  }

  const centers = rows.map((row) => row.centerY);
  const gaps = [];
  for (let i = 1; i < centers.length; i++) gaps.push(centers[i] - centers[i - 1]);
  const estimatedHeight = clamp(Math.round(median(gaps) || 56), 34, 96);

  return rows.map((row, index) => {
    const texts = row.items
      .slice()
      .sort((a, b) => Number(a?.bbox?.x || 0) - Number(b?.bbox?.x || 0))
      .map((item) => normalizeText(item.text))
      .filter(Boolean);
    const y = clamp(Math.round(row.centerY - estimatedHeight / 2), 0, Math.max(0, regionBox.height - estimatedHeight));
    return {
      id: `row_${String(index + 1).padStart(2, '0')}`,
      role: 'list_row',
      label: `Row ${index + 1}`,
      bbox: {
        x: regionBox.x,
        y: regionBox.y + y,
        width: regionBox.width,
        height: estimatedHeight,
      },
      text: texts.join(' | '),
      compactText: compactText(texts.join(' ')),
    };
  });
}

async function detectUnreadLikely(win, box) {
  const points = [
    screenPoint(win, Math.round(box.x + box.width * 0.86), Math.round(box.y + box.height * 0.28)),
    screenPoint(win, Math.round(box.x + box.width * 0.90), Math.round(box.y + box.height * 0.28)),
    screenPoint(win, Math.round(box.x + box.width * 0.86), Math.round(box.y + box.height * 0.5)),
  ];
  for (const color of screenPixels(points)) {
    const rgb = hexToRgb(color);
    if (!rgb) continue;
    if (rgb.r >= 180 && rgb.r - rgb.g >= 60 && rgb.r - rgb.b >= 60) {
      return true;
    }
  }
  return false;
}

async function analyzeChatListRows(win, sourceImage, region) {
  const clippedImage = await ImageColor.clip(sourceImage, region.bbox);
  let ocr = { text: '', elements: [] };
  try {
    ocr = await Vision.detectUI({
      visionProfile: CONFIG.visionProfile,
      image: clippedImage,
      matchMode: 'contains',
      defaultRole: 'text',
    });
  } catch (error) {
    console.warn(`chat list OCR unavailable, continuing without row text: ${error && error.message ? error.message : String(error)}`);
  }
  const rows = clusterRows(ocr.elements || [], region.bbox);
  for (const row of rows) {
    row.avgColor = await sampleAverageColor(win, row.bbox);
    row.hasUnreadLikely = await detectUnreadLikely(win, row.bbox);
  }
  return { ocrText: normalizeText(ocr.text), rows };
}

async function enrichRegions(win, regions) {
  const out = [];
  for (const region of regions) {
    out.push({
      ...region,
      bbox: normalizeBox(region.bbox),
      center: {
        x: region.bbox.x + Math.round(region.bbox.width / 2),
        y: region.bbox.y + Math.round(region.bbox.height / 2),
      },
      avgColor: await sampleAverageColor(win, region.bbox),
    });
  }
  return out;
}

function percentile(values, p) {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!arr.length) return 0;
  const index = Math.max(0, Math.min(arr.length - 1, Math.round((arr.length - 1) * p)));
  return arr[index];
}

async function detectAllText(image) {
  try {
    return await Vision.detectUI({
      visionProfile: CONFIG.visionProfile,
      image,
      matchMode: 'contains',
      defaultRole: 'text',
    });
  } catch (error) {
    console.warn(`global OCR unavailable during separator refinement: ${error && error.message ? error.message : String(error)}`);
    return { text: '', elements: [] };
  }
}

function refineSeparatorsByText(width, separators, elements) {
  const normalized = (elements || []).map((item) => ({
    ...item,
    bbox: normalizeBox(item?.bbox || {}),
  }));
  const leftTexts = normalized.filter((item) => {
    const x = Number(item?.bbox?.x || 0);
    const text = compactText(item?.text || '');
    return text && x > width * 0.04 && x < width * 0.46;
  });
  const rightEdges = leftTexts.map((item) => item.bbox.x + item.bbox.width).filter((value) => value > width * 0.12);
  if (rightEdges.length >= 3) {
    const textEdge = percentile(rightEdges, 0.8);
    const minChatListSep = Math.round(width * 0.24);
    const maxChatListSep = Math.round(width * 0.42);
    separators.vertical[1].pos = clamp(Math.max(textEdge + 16, separators.vertical[1].pos), minChatListSep, maxChatListSep);
  }
  return separators;
}

async function main() {
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: 'screenCapture',
    strict: true,
  });

  const win = await focusWechat();
  const screenshotPath = await captureWindow(win, 'wechat_region_map');
  const image = await getImageBase64(screenshotPath);
  const layout = await ImageColor.analyzeLayout(image, {
    cellSize: 10,
    quantize: 16,
    tolerance: 32,
    minRegionArea: 6,
    maxRegions: 24,
    separatorHints: {
      vertical: [
        { label: 'toolbar', from: CONFIG.toolbarBand[0], to: CONFIG.toolbarBand[1] },
        { label: 'chatList', from: CONFIG.chatListBand[0], to: CONFIG.chatListBand[1] },
      ],
      horizontal: [
        { label: 'header', from: CONFIG.headerBand[0], to: CONFIG.headerBand[1] },
        { label: 'input', from: CONFIG.inputBand[0], to: CONFIG.inputBand[1] },
      ],
    },
  });
  let semanticLayout = null;
  try {
    semanticLayout = buildSemanticLayout(layout, win.width, win.height);
  } catch (layoutError) {
    console.warn(`generic layout fallback engaged: ${layoutError && layoutError.message ? layoutError.message : String(layoutError)}`);
    const fallbackSeparators = await detectSeparators(win, win.width, win.height);
    const allText = await detectAllText(image);
    const refinedFallbackSeparators = refineSeparatorsByText(win.width, fallbackSeparators, allText?.elements || []);
    semanticLayout = buildSemanticLayoutFromSeparators(
      win.width,
      win.height,
      refinedFallbackSeparators,
      'boundary_scan_with_text_refine',
      [...(layout?.warnings || []), layoutError && layoutError.message ? layoutError.message : String(layoutError)]
    );
  }
  const separators = semanticLayout.separators;
  const regions = await enrichRegions(win, semanticLayout.regions);
  const chatListRegion = regions.find((item) => item.id === 'conversation_list');
  const rowAnalysis = await analyzeChatListRows(win, image, chatListRegion);

  const annotatedPath = CONFIG.output.annotatedImage;
  await Vision.annotateRegions({
    image,
    title: 'WeChat Region Map',
    outputPath: annotatedPath,
    separators,
    regions: [
      ...regions,
      ...rowAnalysis.rows.map((row) => ({
        id: row.id,
        role: row.role,
        label: `${row.label} ${row.text.slice(0, 14)}`,
        bbox: row.bbox,
        avgColor: row.avgColor,
      })),
    ],
  });

  const reportPath = CONFIG.output.reportJson;
  const report = {
    timestamp: new Date().toISOString(),
    workerType: 'wechat_region_map',
    config: CONFIG,
    window: win,
    screenshotPath,
    annotatedPath,
    reportPath,
    layout,
    semanticLayout,
    separators,
    regions,
    chatList: rowAnalysis,
    bridgeHints: {
      preferredScreenshotPath: screenshotPath,
      reportUsage: 'visionrun --mode=validate --real-report <reportPath> --source-image <golden-image>',
    },
  };
  await File.write(reportPath, JSON.stringify(report, null, 2));
  console.log('report:', reportPath);
  console.log('annotated:', annotatedPath);
  console.log('chat rows:', rowAnalysis.rows.length);
}

await main();
