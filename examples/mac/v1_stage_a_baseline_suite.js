const shared = {};

shared.ensureDirForFile = function ensureDirForFile(path) {
  return String(path || '');
};

shared.writeJsonWithEnsure = async function writeJsonWithEnsure(path, payload) {
  shared.ensureDirForFile(path);
  await File.write(path, JSON.stringify(payload, null, 2));
};

shared.appendAuditLog = async function appendAuditLog(path, payload) {
  shared.ensureDirForFile(path);
  const previous = File.exists(path) ? File.read(path) || '' : '';
  const nextLine = JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n';
  await File.write(path, previous + nextLine);
};

shared.buildStepEvidenceSummary = function buildStepEvidenceSummary(events) {
  const list = Array.isArray(events) ? events : [];
  const byStep = {};
  let successCount = 0;
  let failureCount = 0;
  let latestFailure = null;
  for (const event of list) {
    const stepId = String(event?.stepId || 'unknown');
    const ok = Boolean(event?.success);
    if (!byStep[stepId]) byStep[stepId] = { attempts: 0, successCount: 0, failureCount: 0, lastSuccess: null, lastExtra: null };
    byStep[stepId].attempts += 1;
    byStep[stepId].lastExtra = event?.extra || null;
    byStep[stepId].lastSuccess = ok;
    if (ok) {
      successCount += 1;
      byStep[stepId].successCount += 1;
    } else {
      failureCount += 1;
      byStep[stepId].failureCount += 1;
      latestFailure = { stepId, error: event?.extra?.error || '', extra: event?.extra || null };
    }
  }
  return { total: list.length, successCount, failureCount, byStep, latestFailure };
};

shared.captureArtifact = async function captureArtifact(label) {
  const path = '.runtime/temp/mac/' + label + '_' + Date.now() + '.png';
  await page.screenshot({ path });
  return path;
};

shared.readWindowList = async function readWindowList() {
  const list = await window.list();
  return Array.isArray(list) ? list : [];
};

shared.pushCaseEvent = async function pushCaseEvent(runtime, caseContext, stepId, success, extra) {
  const payload = {
    kind: 'stage_case_step',
    stage: runtime.stage,
    suiteId: runtime.suiteId,
    caseId: caseContext.caseId,
    caseLabel: caseContext.label,
    stepId,
    success: Boolean(success),
    extra: extra || {},
  };
  if (!Array.isArray(caseContext.stepEvidence)) caseContext.stepEvidence = [];
  caseContext.stepEvidence.push(payload);
  await shared.appendAuditLog(runtime.auditPath, payload);
  return payload;
};

shared.recordCaseResult = function recordCaseResult(runtime, caseContext) {
  runtime.cases.push({
    caseId: caseContext.caseId,
    label: caseContext.label,
    complexity: caseContext.complexity,
    app: caseContext.app,
    objective: caseContext.objective,
    startedAt: caseContext.startedAt,
    finishedAt: new Date().toISOString(),
    success: Boolean(caseContext.success),
    stepChain: caseContext.stepChain || [],
    successCriteria: caseContext.successCriteria || [],
    failureEvidence: caseContext.failureEvidence || [],
    artifacts: caseContext.artifacts || {},
    statusSummary: caseContext.statusSummary || {},
    stepEvidenceSummary: shared.buildStepEvidenceSummary(caseContext.stepEvidence),
  });
};

shared.runCase = async function runCase(runtime, caseContext, fn) {
  try {
    await fn(caseContext);
    caseContext.success = Boolean(caseContext.statusSummary?.ok);
  } catch (err) {
    caseContext.success = false;
    caseContext.statusSummary = { ...(caseContext.statusSummary || {}), ok: false, error: err && err.message ? err.message : String(err) };
    caseContext.failureEvidence = (caseContext.failureEvidence || []).concat([{ type: 'exception', message: err && err.message ? err.message : String(err) }]);
    await shared.pushCaseEvent(runtime, caseContext, 'case_exception', false, { error: err && err.message ? err.message : String(err) });
  }
  shared.recordCaseResult(runtime, caseContext);
};

shared.isWindowForApp = function isWindowForApp(win, appName) {
  const target = String(appName || '').toLowerCase();
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes(target) || title.includes(target);
};

shared.findWindowForApp = async function findWindowForApp(appName) {
  const list = await shared.readWindowList();
  return list.find((win) => shared.isWindowForApp(win, appName)) || null;
};

shared.closeFrontmostSystemSettingsIfPresent = async function closeFrontmostSystemSettingsIfPresent() {
  const active = await window.getActiveWindow();
  const exe = String(active?.exeName || '').toLowerCase();
  if (!exe.includes('system settings')) return false;
  try {
    await keyboard.combination('Meta', 'w');
    await page.waitFor(700);
    return true;
  } catch (err) {
    return false;
  }
};

shared.bringAppToFront = async function bringAppToFront(appName, options) {
  const opts = options || {};
  const initialWaitMs = Number(opts.initialWaitMs || 0);
  if (initialWaitMs > 0) await page.waitFor(initialWaitMs);
  let target = await shared.findWindowForApp(appName);
  if (!target) throw new Error('未找到应用窗口: ' + appName);
  const pid = target.processId || target.processID || target.pid || 0;
  await window.bringToTop(target.title, pid);
  await page.waitFor(Number(opts.waitMs || 800));
  const active = await window.getActiveWindow();
  const ok = shared.isWindowForApp(active, appName);
  return { ok, targetWindow: target, activeWindow: active || null };
};

shared.tryOCR = async function tryOCR(path) {
  try {
    return await Vision.runOCR({ image: path, visionProfile: 'fast' });
  } catch (err) {
    return { text: '', error: err && err.message ? err.message : String(err) };
  }
};

shared.caseFinderFrontmost = async function caseFinderFrontmost(runtime, caseContext) {
  caseContext.stepChain = [
    'close foreground System Settings if permission page remains open',
    'open Finder',
    'bring Finder window to top explicitly',
    'capture screenshot evidence',
    'verify activeWindow is Finder and a Finder window exists'
  ];
  await shared.closeFrontmostSystemSettingsIfPresent();
  await page.openApp('Finder');
  await page.waitFor(1200);
  const frontmost = await shared.bringAppToFront('Finder', { waitMs: 900 });
  const screenshotPath = await shared.captureArtifact('stage_a_finder_frontmost');
  const ocr = await shared.tryOCR(screenshotPath);
  const ocrText = String(ocr?.text || '');
  const ok = Boolean(frontmost.ok);
  await shared.pushCaseEvent(runtime, caseContext, 'verify_finder_frontmost', ok, {
    targetWindow: frontmost.targetWindow || null,
    activeWindow: frontmost.activeWindow || null,
    screenshotPath,
    ocrTextPreview: ocrText.slice(0, 160),
  });
  caseContext.artifacts = { screenshotPath };
  caseContext.successCriteria = ['Finder successfully becomes the frontmost app window'];
  caseContext.statusSummary = {
    ok,
    finderFrontmost: ok,
    activeWindowTitle: String(frontmost.activeWindow?.title || ''),
    activeExeName: String(frontmost.activeWindow?.exeName || ''),
  };
  caseContext.failureEvidence = ok ? [] : [{ type: 'frontmost_mismatch', activeWindow: frontmost.activeWindow || null }];
};

shared.caseSafariFrontmost = async function caseSafariFrontmost(runtime, caseContext) {
  caseContext.stepChain = [
    'open Safari to stable seed page',
    'bring Safari window to top explicitly',
    'capture screenshot evidence',
    'verify activeWindow is Safari and visible evidence is Safari-like'
  ];
  await page.openURLInApp('Safari', 'https://www.baidu.com');
  await page.waitFor(2600);
  const frontmost = await shared.bringAppToFront('Safari', { waitMs: 900 });
  const screenshotPath = await shared.captureArtifact('stage_a_safari_frontmost');
  const ocr = await shared.tryOCR(screenshotPath);
  const ocrText = String(ocr?.text || '');
  const title = String(frontmost.activeWindow?.title || '');
  const safariVisible = /百度|个人收藏|阅读列表|Safari/i.test(title) || /百度|个人收藏|阅读列表|Apple|iCloud/.test(ocrText);
  const ok = Boolean(frontmost.ok && safariVisible);
  await shared.pushCaseEvent(runtime, caseContext, 'verify_safari_frontmost', ok, {
    targetWindow: frontmost.targetWindow || null,
    activeWindow: frontmost.activeWindow || null,
    screenshotPath,
    ocrTextPreview: ocrText.slice(0, 200),
  });
  caseContext.artifacts = { screenshotPath };
  caseContext.successCriteria = ['Safari becomes frontmost', 'Screenshot/title contains Safari page evidence'];
  caseContext.statusSummary = {
    ok,
    safariFrontmost: Boolean(frontmost.ok),
    safariVisible,
    activeWindowTitle: title,
  };
  caseContext.failureEvidence = ok ? [] : [{ type: 'safari_visibility_mismatch', title, ocrTextPreview: ocrText.slice(0, 200) }];
};

shared.caseClipboardRoundtrip = async function caseClipboardRoundtrip(runtime, caseContext) {
  caseContext.stepChain = [
    'write deterministic text into clipboard',
    'read clipboard back',
    'capture screenshot evidence of current frontmost desktop state',
    'verify clipboard roundtrip matches exactly'
  ];
  const payload = 'TM_STAGE_A_CLIPBOARD_ROUNDTRIP_' + Date.now();
  await clipboard.copy(payload);
  await page.waitFor(150);
  const copied = await clipboard.paste();
  const screenshotPath = await shared.captureArtifact('stage_a_clipboard_roundtrip');
  const active = await window.getActiveWindow();
  const ok = String(copied || '') === payload;
  await shared.pushCaseEvent(runtime, caseContext, 'verify_clipboard_roundtrip', ok, {
    expected: payload,
    actual: copied || '',
    activeWindow: active || null,
    screenshotPath,
  });
  caseContext.artifacts = { screenshotPath };
  caseContext.successCriteria = ['Clipboard write/read roundtrip is exact'];
  caseContext.statusSummary = {
    ok,
    clipboardRoundtrip: ok,
    activeWindowTitle: String(active?.title || ''),
    activeExeName: String(active?.exeName || ''),
  };
  caseContext.failureEvidence = ok ? [] : [{ type: 'clipboard_roundtrip_mismatch', expected: payload, actual: copied || '' }];
};

shared.stageAMain = async function stageAMain() {
  const runtime = {
    stage: 'A',
    suiteId: 'macos_v1_baseline_suite',
    reportPath: '.runtime/runs/macos_v1/stage_a/report.json',
    auditPath: '.runtime/runs/macos_v1/stage_a/audit.jsonl',
    startedAt: new Date().toISOString(),
    cases: []
  };

  await page.ensureMacPermissions({ openSettingsOnFail: true, section: 'baseline', strict: true });

  const cases = [
    { caseId: 'a1_finder_frontmost', label: 'Finder 打开并置前', complexity: 'low', app: 'Finder', objective: '验证稳定 app open + frontmost verify', startedAt: new Date().toISOString(), stepEvidence: [] },
    { caseId: 'a2_safari_frontmost', label: 'Safari 打开并置前', complexity: 'low', app: 'Safari', objective: '验证稳定浏览器 app open + frontmost verify + screenshot evidence', startedAt: new Date().toISOString(), stepEvidence: [] },
    { caseId: 'a3_clipboard_roundtrip', label: 'Clipboard 精确回读', complexity: 'low', app: 'System', objective: '验证稳定文本写入/读取与最小系统级证据链', startedAt: new Date().toISOString(), stepEvidence: [] }
  ];

  await shared.runCase(runtime, cases[0], async function (c) { await shared.caseFinderFrontmost(runtime, c); });
  await shared.runCase(runtime, cases[1], async function (c) { await shared.caseSafariFrontmost(runtime, c); });
  await shared.runCase(runtime, cases[2], async function (c) { await shared.caseClipboardRoundtrip(runtime, c); });

  const successCount = runtime.cases.filter((c) => c.success).length;
  const failureCount = runtime.cases.length - successCount;
  const statusSummary = {
    stage: 'A',
    suiteId: runtime.suiteId,
    baselineSuiteEstablished: successCount >= 2,
    totalCases: runtime.cases.length,
    successCount,
    failureCount
  };
  const stepEvidenceSummary = {
    totalCases: runtime.cases.length,
    successCases: successCount,
    failureCases: failureCount,
    caseSummaries: runtime.cases.map((item) => ({ caseId: item.caseId, success: item.success, stepEvidenceSummary: item.stepEvidenceSummary }))
  };
  const report = {
    generatedAt: new Date().toISOString(),
    stage: 'A',
    suiteId: runtime.suiteId,
    design: {
      route: '稳定系统 baseline 替换旧不稳样例',
      principles: [
        '不用 Spotlight 这类依赖全局热键与前台状态的脆弱样例做 baseline',
        '不用 TextEdit 打开对话框这类受系统默认行为污染的编辑面做 baseline',
        '优先使用 app open + bringToTop + activeWindow + screenshot/clipboard 这类确定性链路'
      ],
      selectedCaseTypes: ['Finder frontmost verify', 'Safari frontmost verify', 'clipboard roundtrip']
    },
    cases: runtime.cases,
    reportPath: runtime.reportPath,
    auditPath: runtime.auditPath,
    statusSummary,
    stepEvidenceSummary
  };
  await shared.writeJsonWithEnsure(runtime.reportPath, report);
  console.log(JSON.stringify({ reportPath: runtime.reportPath, auditPath: runtime.auditPath, statusSummary, stepEvidenceSummary }, null, 2));
};

await shared.stageAMain();
