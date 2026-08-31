shared.findRegion = function findRegion(report, id) {
  return (report?.regions || []).find((item) => item.id === id);
};

shared.findTargetRow = function findTargetRow(report, targetChatName) {
  const target = shared.compactText(targetChatName);
  return (report?.chatList?.rows || []).find((row) => shared.compactText(row?.compactText || row?.text || '').includes(target));
};

shared.readJsonIfExists = function readJsonIfExists(path) {
  if (!path || !File.exists(path)) return null;
  const raw = File.read(path);
  if (!raw) return null;
  return shared.parseJson(raw, path);
};

shared.deriveArtifactRunRoot = function deriveArtifactRunRoot(path) {
  const raw = String(path || '');
  const marker = '/infer/chat_candidates.json';
  if (raw.includes(marker)) return raw.slice(0, raw.indexOf(marker));
  return '';
};

shared.findPreferredCompareSummaryPath = function findPreferredCompareSummaryPath(runRoot) {
  const preferred = [
    `${runRoot}/action-gate-compare/summary_report.json`,
    `${runRoot}/snapshot/compare/summary_report.json`,
    `${runRoot}/compare/summary_report.json`,
  ];
  return preferred.find((candidate) => File.exists(candidate)) || '';
};

shared.extractGateStatus = function extractGateStatus(compareSummary, runReport) {
  const summaryGate = compareSummary?.gateStatus || compareSummary?.summary?.gateStatus || null;
  if (summaryGate) {
    return {
      goldenPassed: Boolean(summaryGate.goldenPassed),
      realScreenshotValidationPassed: Boolean(summaryGate.realScreenshotValidationPassed),
      actionStageAllowed: Boolean(summaryGate.actionStageAllowed),
      allowedActionStage: String(summaryGate.allowedActionStage || 'none'),
      sendAllowed: Boolean(summaryGate.sendAllowed),
      source: 'compare_summary',
    };
  }
  return {
    goldenPassed: Boolean(runReport?.gates?.goldenPassed),
    realScreenshotValidationPassed: Boolean(runReport?.gates?.realScreenshotValidationPassed),
    actionStageAllowed: Boolean(runReport?.gates?.actionStageAllowed),
    allowedActionStage: runReport?.gates?.actionStageAllowed ? 'open_chat' : 'none',
    sendAllowed: Boolean(runReport?.gates?.sendAllowed),
    source: 'run_report_fallback',
  };
};

shared.computeAllowedStepMode = function computeAllowedStepMode(allowedActionStage) {
  const stage = String(allowedActionStage || 'none');
  if (stage === 'focus_input') return 'open_chat_verify_header_focus_input';
  if (stage === 'verify_header') return 'open_chat_verify_header';
  if (stage === 'open_chat') return 'open_chat';
  if (stage === 'probe_only') return 'bundle_search_chat';
  return 'none';
};

shared.discoverLatestArtifactBundle = function discoverLatestArtifactBundle() {
  const runsRoot = '.runtime/runs';
  if (!File.isDir(runsRoot)) return null;
  const entries = File.listDir(runsRoot) || [];
  let best = null;
  for (const name of entries) {
    const runRoot = `${runsRoot}/${name}`;
    const runReportPath = `${runRoot}/run_report.json`;
    const runReport = File.exists(runReportPath) ? shared.readJsonIfExists(runReportPath) : null;
    const compareSummaryPath = shared.findPreferredCompareSummaryPath(runRoot);
    const compareSummary = compareSummaryPath ? shared.readJsonIfExists(compareSummaryPath) : null;
    const gateStatus = shared.extractGateStatus(compareSummary, runReport);
    if (!gateStatus.goldenPassed || !gateStatus.realScreenshotValidationPassed) continue;
    if (!gateStatus.actionStageAllowed && gateStatus.allowedActionStage === 'none') continue;
    const tsFromCompare = new Date(compareSummary?.generatedAt || compareSummary?.summary?.generatedAt || 0).getTime() || 0;
    const tsFromRun = new Date(runReport?.finishedAt || runReport?.startedAt || 0).getTime() || 0;
    const ts = Math.max(tsFromCompare, tsFromRun);
    const stageBoost = gateStatus.allowedActionStage === 'focus_input' ? 2000 : gateStatus.allowedActionStage === 'verify_header' ? 1200 : gateStatus.allowedActionStage === 'open_chat' ? 800 : 0;
    const score = ts + stageBoost + (gateStatus.sendAllowed ? 500 : 0);
    if (!best || score > best.score) {
      best = {
        score,
        runRoot,
        runReportPath,
        runReport,
        compareSummaryPath,
        compareSummary,
        gateStatus,
        allowedStepMode: shared.computeAllowedStepMode(gateStatus.allowedActionStage),
        chatCandidatesPath: `${runRoot}/infer/chat_candidates.json`,
        captureContractPath: `${runRoot}/verify/capture_contract.json`,
        probePlanPath: `${runRoot}/verify/probe_execution_plan.json`,
        sendSafetyPath: `${runRoot}/verify/send_safety_report.json`,
        captureTemplatePath: `${runRoot}/verify/capture_template_report.json`,
      };
    }
  }
  return best;
};

shared.loadArtifactBundleIfAny = function loadArtifactBundleIfAny() {
  const runRoot =
    shared.runtimeConfig.artifactRunRoot ||
    shared.deriveArtifactRunRoot(shared.runtimeConfig.artifactChatCandidatesPath) ||
    shared.discoverLatestArtifactBundle()?.runRoot ||
    '';
  if (!runRoot) return null;
  const bundle = {
    runRoot,
    runReportPath: `${runRoot}/run_report.json`,
    chatCandidatesPath: shared.runtimeConfig.artifactChatCandidatesPath || `${runRoot}/infer/chat_candidates.json`,
    captureContractPath: shared.runtimeConfig.artifactCaptureContractPath || `${runRoot}/verify/capture_contract.json`,
    probePlanPath: shared.runtimeConfig.artifactProbePlanPath || `${runRoot}/verify/probe_execution_plan.json`,
    sendSafetyPath: shared.runtimeConfig.artifactSendSafetyPath || `${runRoot}/verify/send_safety_report.json`,
    captureTemplatePath: shared.runtimeConfig.artifactCaptureTemplatePath || `${runRoot}/verify/capture_template_report.json`,
  };
  bundle.runReport = shared.readJsonIfExists(bundle.runReportPath);
  bundle.chatCandidates = shared.readJsonIfExists(bundle.chatCandidatesPath);
  bundle.captureContract = shared.readJsonIfExists(bundle.captureContractPath);
  bundle.probePlan = shared.readJsonIfExists(bundle.probePlanPath);
  bundle.sendSafety = shared.readJsonIfExists(bundle.sendSafetyPath);
  bundle.captureTemplate = shared.readJsonIfExists(bundle.captureTemplatePath);
  return bundle;
};

shared.loadArtifactCandidatesIfAny = function loadArtifactCandidatesIfAny() {
  if (!shared.runtimeConfig.artifactChatCandidatesPath) return null;
  if (!File.exists(shared.runtimeConfig.artifactChatCandidatesPath)) return null;
  const raw = File.read(shared.runtimeConfig.artifactChatCandidatesPath);
  if (!raw) return null;
  return shared.parseJson(raw, shared.runtimeConfig.artifactChatCandidatesPath);
};

shared.round = function round(value) {
  return Math.round(Number(value || 0));
};

shared.clamp = function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
};

shared.normalizeBox = function normalizeBox(box) {
  return {
    x: shared.round(box?.x ?? box?.X),
    y: shared.round(box?.y ?? box?.Y),
    width: Math.max(1, shared.round(box?.width ?? box?.Width)),
    height: Math.max(1, shared.round(box?.height ?? box?.Height)),
  };
};

shared.normalizePoint = function normalizePoint(point) {
  return {
    x: shared.round(point?.x),
    y: shared.round(point?.y),
  };
};

shared.translateBoxFromReference = function translateBoxFromReference(referenceBox, currentBox, targetBox) {
  const ref = shared.normalizeBox(referenceBox);
  const cur = shared.normalizeBox(currentBox);
  const target = shared.normalizeBox(targetBox);
  const rx = ref.width > 0 ? (target.x - ref.x) / ref.width : 0;
  const ry = ref.height > 0 ? (target.y - ref.y) / ref.height : 0;
  const rw = ref.width > 0 ? target.width / ref.width : 1;
  const rh = ref.height > 0 ? target.height / ref.height : 1;
  return {
    x: shared.round(cur.x + cur.width * rx),
    y: shared.round(cur.y + cur.height * ry),
    width: Math.max(1, shared.round(cur.width * rw)),
    height: Math.max(1, shared.round(cur.height * rh)),
  };
};

shared.expandBox = function expandBox(box, marginX, marginY, limitBox) {
  const target = shared.normalizeBox(box);
  const limit = shared.normalizeBox(limitBox);
  const x = Math.max(limit.x, target.x - marginX);
  const y = Math.max(limit.y, target.y - marginY);
  const right = Math.min(limit.x + limit.width, target.x + target.width + marginX);
  const bottom = Math.min(limit.y + limit.height, target.y + target.height + marginY);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
};

shared.boxWithin = function boxWithin(containerBox, innerBox, tolerance = 4) {
  const outer = shared.normalizeBox(containerBox);
  const inner = shared.normalizeBox(innerBox);
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
};

shared.translatePointFromReference = function translatePointFromReference(referenceBox, currentBox, point) {
  const ref = shared.normalizeBox(referenceBox);
  const cur = shared.normalizeBox(currentBox);
  const p = shared.normalizePoint(point);
  const rx = ref.width > 0 ? (p.x - ref.x) / ref.width : 0.5;
  const ry = ref.height > 0 ? (p.y - ref.y) / ref.height : 0.5;
  return {
    x: shared.round(cur.x + cur.width * shared.clamp(rx, 0, 1)),
    y: shared.round(cur.y + cur.height * shared.clamp(ry, 0, 1)),
  };
};

shared.captureWindowRegion = async function captureWindowRegion(win, box, label) {
  await shared.refreshWechatForeground(win, `capture:${label}`);
  const path = `.runtime/temp/mac/${label}_${Date.now()}.png`;
  const normalized = shared.normalizeBox(box);
  const relativeClip = {
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
  };
  const absoluteClip = {
    x: shared.round(win.x + normalized.x),
    y: shared.round(win.y + normalized.y),
    width: normalized.width,
    height: normalized.height,
  };
  let image = null;
  try {
    image = await page.screenshot({
      path,
      target: 'activeWindow',
      clip: relativeClip,
    });
  } catch (activeWindowError) {
    console.warn(`activeWindow screenshot failed for ${label}, fallback to screen clip: ${activeWindowError && activeWindowError.message ? activeWindowError.message : String(activeWindowError)}`);
    image = await page.screenshot({
      path,
      target: 'screen',
      clip: absoluteClip,
    });
  }
  let size = ImageColor.getSize(path);
  let width = Array.isArray(size) ? Number(size[0] || 0) : 0;
  let height = Array.isArray(size) ? Number(size[1] || 0) : 0;
  const scaleX = normalized.width > 0 ? width / normalized.width : 0;
  const scaleY = normalized.height > 0 ? height / normalized.height : 0;
  const sameScale = Math.abs(scaleX - scaleY) < 0.01;
  const integerScale = Math.round(scaleX);
  let appliedScale = 1;
  if (
    width > 0 &&
    height > 0 &&
    sameScale &&
    integerScale >= 2 &&
    Math.abs(scaleX - integerScale) < 0.01
  ) {
    image = await ImageColor.resize(image, normalized.width, normalized.height);
    await ImageColor.save(image, path, 'png', 100);
    size = ImageColor.getSize(path);
    width = Array.isArray(size) ? Number(size[0] || 0) : 0;
    height = Array.isArray(size) ? Number(size[1] || 0) : 0;
    appliedScale = integerScale;
  }
  if (width !== normalized.width || height !== normalized.height) {
    throw new Error(
      `capture size mismatch for ${label}: requested=${normalized.width}x${normalized.height} actual=${width}x${height} clip=${JSON.stringify(absoluteClip)}`
    );
  }
  return { path, image, box: normalized, absoluteClip, size: { width, height }, appliedScale };
};

shared.verifyContainsTextWithLocateAnything = async function verifyContainsTextWithLocateAnything(imageBase64, expectedText, ocrError) {
  if (!shared.runtimeConfig?.serviceUrl || !shared.normalizeText(expectedText)) {
    throw ocrError;
  }
  const response = await axios.post(`${shared.runtimeConfig.serviceUrl}/v1/ground`, {
    imageBase64,
    imageName: `verify_text_${Date.now()}.png`,
    task: 'text',
    phrase: String(expectedText || ''),
    profile: 'quality',
  }, {
    timeout: Number(shared.runtimeConfig.requestTimeoutMs || 20000),
  });
  const data = response.data || {};
  const ok = Array.isArray(data.boxes) && data.boxes.length > 0;
  return {
    ok,
    matchType: ok ? 'locateanything_text' : 'not_found',
    expectedText: String(expectedText || ''),
    normalizedExpectedText: shared.normalizeText(expectedText),
    text: '',
    compactText: '',
    lineCount: 0,
    locateAnything: {
      backend: data.backend || '',
      profileUsed: data.profile_used || '',
      boxCount: Array.isArray(data.boxes) ? data.boxes.length : 0,
      answer: data.answer || '',
      ocrError: ocrError && ocrError.message ? ocrError.message : String(ocrError),
    },
  };
};

shared.verifyContainsText = async function verifyContainsText(imageBase64, expectedText) {
  let ocr = null;
  try {
    ocr = await Vision.runOCR({
      visionProfile: shared.runtimeConfig.visionProfile,
      image: imageBase64,
    });
  } catch (error) {
    return shared.verifyContainsTextWithLocateAnything(imageBase64, expectedText, error);
  }
  const text = shared.normalizeText(ocr?.text || '');
  const compactText = shared.compactText(text);
  const normalizedExpectedText = shared.normalizeText(expectedText);
  const compactExpectedText = shared.compactText(expectedText);
  let ok = false;
  let matchType = 'not_found';
  if (!normalizedExpectedText) {
    ok = text.length > 0;
    matchType = ok ? 'non_empty' : 'not_found';
  } else if (text.includes(normalizedExpectedText)) {
    ok = true;
    matchType = 'exact_contains';
  } else if (compactExpectedText && compactText.includes(compactExpectedText)) {
    ok = true;
    matchType = 'compact_contains';
  }
  return {
    ok,
    matchType,
    expectedText: String(expectedText || ''),
    normalizedExpectedText,
    text,
    compactText,
    lineCount: Number(ocr?.lineCount || 0),
  };
};

shared.inputMessage = async function inputMessage(message) {
  if (shared.runtimeConfig.useClipboardForInput) {
    try {
      await clipboard.copy(message);
      await shared.wait(120);
      await keyboard.combination('Meta', 'v');
      return 'clipboard';
    } catch (err) {
      console.warn(`clipboard input failed, fallback to keyboard.type: ${err && err.message ? err.message : String(err)}`);
      await keyboard.type(message);
      return 'clipboard_failed_keyboard_fallback';
    }
  }
  await keyboard.type(message);
  return 'keyboardType';
};

shared.loadRegionReport = async function loadRegionReport(win, artifactBundle) {
  const raw = File.read(shared.runtimeConfig.regionReportPath);
  if (!raw) {
    if (artifactBundle) return { regions: [], chatList: { rows: [] }, window: win, stale: true, source: 'artifact-only' };
    throw new Error(`缺少区域分析结果: ${shared.runtimeConfig.regionReportPath}，请先运行 examples/mac/wechat_region_map.js`);
  }
  const report = shared.parseJson(raw, shared.runtimeConfig.regionReportPath);
  const ts = new Date(report?.timestamp || '').getTime();
  if (!ts || Date.now() - ts > shared.runtimeConfig.maxReportAgeMs) {
    if (!artifactBundle) {
      throw new Error(`区域分析结果过期，请重新运行 examples/mac/wechat_region_map.js`);
    }
    report.stale = true;
  }
  if (!shared.sameWindow(report?.window, win)) {
    if (!artifactBundle) {
      throw new Error(`区域分析结果与当前微信窗口尺寸不匹配，请重新运行 examples/mac/wechat_region_map.js`);
    }
    report.windowMismatch = true;
  }
  return report;
};
