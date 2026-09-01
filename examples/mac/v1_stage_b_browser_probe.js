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
  await File.write(path, previous + JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n');
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

shared.logStep = async function logStep(context, stepId, success, extra) {
  const payload = { kind: 'stage_b_step', stage: 'B', stepId, success: Boolean(success), extra: extra || {} };
  if (!Array.isArray(context.stepEvidence)) context.stepEvidence = [];
  context.stepEvidence.push(payload);
  await shared.appendAuditLog(context.auditPath, payload);
};

shared.captureArtifact = async function captureArtifact(label) {
  const path = '.runtime/temp/mac/' + label + '_' + Date.now() + '.png';
  await page.screenshot({ path });
  return path;
};

shared.tryOCR = async function(path) {
  try {
    return await Vision.runOCR({ image: path, visionProfile: 'fast' });
  } catch (err) {
    return { text: '', error: err && err.message ? err.message : String(err) };
  }
};

shared.findSafariWindow = async function() {
  const windows = await window.list();
  return (windows || []).find((w) => {
    const exe = String(w?.exeName || '').toLowerCase();
    const title = String(w?.title || '').toLowerCase();
    return exe.includes('safari') || title.includes('safari');
  }) || null;
};

shared.bringSafariToFront = async function() {
  const safariWin = await shared.findSafariWindow();
  if (safariWin?.title) {
    await window.bringToTop(safariWin.title, safariWin.processId || safariWin.pid || 0);
    await page.waitFor(700);
  }
  const active = await window.getActiveWindow();
  return { safariWin, active };
};

shared.captureSafariWindow = async function(win, label) {
  const path = '.runtime/temp/mac/' + label + '_' + Date.now() + '.png';
  await page.screenshot({
    path,
    x: Number(win.x || 0),
    y: Number(win.y || 0),
    width: Number(win.width || 0),
    height: Number(win.height || 0),
  });
  return path;
};

shared.readAddressBarEvidence = async function() {
  let copied = '';
  try {
    await keyboard.combination('Meta', 'l');
    await page.waitFor(180);
    await keyboard.combination('Meta', 'c');
    await page.waitFor(220);
    copied = await clipboard.paste();
  } catch (err) {
    copied = '';
  }
  return String(copied || '');
};

shared.derivePageEvidence = function(title, ocrText, addressBarText) {
  const combined = [String(title || ''), String(ocrText || ''), String(addressBarText || '')].join(' ');
  return {
    titleOk: /Example Domain/i.test(title) || /example\.com/i.test(title),
    ocrOk: /Example Domain/i.test(ocrText) || /illustrative examples/i.test(ocrText),
    urlOk: /https?:\/\/example\.com\/?/i.test(addressBarText) || /example\.com/i.test(addressBarText),
    combinedPreview: combined.slice(0, 240),
  };
};

shared.stageBMain = async function stageBMain() {
  const context = {
    reportPath: '.runtime/runs/macos_v1/stage_b/report.json',
    auditPath: '.runtime/runs/macos_v1/stage_b/audit.jsonl',
    stepEvidence: []
  };
  const targetUrl = 'https://example.com';
  const seedUrl = 'https://www.baidu.com';
  let safariWindow = null;
  let active = null;
  let fullScreenshotPath = '';
  let safariWindowShotPath = '';
  let ocr = null;
  let addressBarText = '';
  let title = '';

  await page.ensureMacPermissions({ openSettingsOnFail: true, section: 'baseline', strict: true });

  try {
    await page.openURLInApp('Safari', seedUrl);
    await page.waitFor(2400);
    await shared.logStep(context, 'open_browser', true, { app: 'Safari', seedUrl });

    const frontSeed = await shared.bringSafariToFront();
    safariWindow = frontSeed.safariWin || null;
    active = frontSeed.active || null;
    const safariFrontmostOnSeed = /safari/i.test(String(active?.exeName || ''));
    await shared.logStep(context, 'verify_safari_frontmost_seed', safariFrontmostOnSeed, { safariWindow, activeWindow: active || null });

    await keyboard.combination('Meta', 'l');
    await page.waitFor(180);
    await shared.logStep(context, 'focus_address_bar', true, {});

    await keyboard.type(targetUrl);
    await page.waitFor(180);
    await shared.logStep(context, 'type_url', true, { targetUrl });

    await keyboard.press('Enter');
    await page.waitFor(4200);
    await shared.logStep(context, 'open_page', true, { targetUrl });

    const frontTarget = await shared.bringSafariToFront();
    safariWindow = frontTarget.safariWin || safariWindow;
    active = frontTarget.active || active;
    title = String(active?.title || safariWindow?.title || '');
    const safariFrontmost = /safari/i.test(String(active?.exeName || ''));
    await shared.logStep(context, 'verify_safari_frontmost_target', safariFrontmost, { safariWindow, activeWindow: active || null, title });

    fullScreenshotPath = await shared.captureArtifact('stage_b_browser_example_full');
    if (safariWindow) {
      safariWindowShotPath = await shared.captureSafariWindow(safariWindow, 'stage_b_browser_example_window');
    }
    ocr = await shared.tryOCR(safariWindowShotPath || fullScreenshotPath);
    addressBarText = await shared.readAddressBarEvidence();

    const ocrText = String(ocr?.text || '');
    const evidence = shared.derivePageEvidence(title, ocrText, addressBarText);
    const ok = Boolean(safariFrontmost && (evidence.titleOk || evidence.ocrOk || evidence.urlOk));
    await shared.logStep(context, 'verify_page_evidence', ok, {
      activeWindow: active || null,
      safariWindow: safariWindow || null,
      title,
      addressBarText,
      screenshotPath: fullScreenshotPath,
      safariWindowShotPath,
      ocrTextPreview: ocrText.slice(0, 220),
      evidence,
    });
  } catch (err) {
    await shared.logStep(context, 'stage_b_exception', false, { error: err && err.message ? err.message : String(err) });
  }

  const stepEvidenceSummary = shared.buildStepEvidenceSummary(context.stepEvidence);
  const verifyExtra = stepEvidenceSummary.byStep?.verify_page_evidence?.lastExtra || {};
  const evidence = verifyExtra.evidence || { titleOk: false, ocrOk: false, urlOk: false, combinedPreview: '' };
  const statusSummary = {
    browserOpened: Boolean(stepEvidenceSummary.byStep?.open_browser?.lastSuccess),
    safariFrontmostSeed: Boolean(stepEvidenceSummary.byStep?.verify_safari_frontmost_seed?.lastSuccess),
    addressBarFocused: Boolean(stepEvidenceSummary.byStep?.focus_address_bar?.lastSuccess),
    urlTyped: Boolean(stepEvidenceSummary.byStep?.type_url?.lastSuccess),
    pageOpened: Boolean(stepEvidenceSummary.byStep?.open_page?.lastSuccess),
    safariFrontmostTarget: Boolean(stepEvidenceSummary.byStep?.verify_safari_frontmost_target?.lastSuccess),
    titleVerified: Boolean(evidence.titleOk),
    screenshotOCRVerified: Boolean(evidence.ocrOk),
    urlVerified: Boolean(evidence.urlOk),
    browserStepPatternReusable: Boolean(stepEvidenceSummary.byStep?.verify_page_evidence?.lastSuccess),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    stage: 'B',
    scenario: 'single_browser_safari_medium_complexity',
    targetUrl,
    reusableStepPattern: {
      patternId: 'safari_open_navigate_verify_v2',
      browser: 'Safari',
      steps: ['open_browser', 'verify_safari_frontmost_seed', 'focus_address_bar', 'type_url', 'open_page', 'verify_safari_frontmost_target', 'verify_page_evidence'],
      assertions: [
        '固定到 Safari，避免默认浏览器不确定态',
        '导航后重新显式 bring Safari to front，避免截图抓到调用终端',
        '页面验证同时看标题、截图 OCR、地址栏实值'
      ],
      fallbackGuidance: [
        '若 OCR 仍弱，优先信任地址栏实值与 Safari 前台确认',
        '若地址栏复制失败，再补充 app-specific DOM/browser stack probe，而不是退回默认浏览器标题猜测'
      ]
    },
    artifacts: {
      fullScreenshotPath,
      safariWindowShotPath,
      activeWindow: active || null,
      safariWindow: safariWindow || null,
      addressBarText,
      title,
    },
    reportPath: context.reportPath,
    auditPath: context.auditPath,
    statusSummary,
    stepEvidenceSummary
  };
  await shared.writeJsonWithEnsure(context.reportPath, report);
  console.log(JSON.stringify({ reportPath: context.reportPath, auditPath: context.auditPath, statusSummary, stepEvidenceSummary }, null, 2));
};

await shared.stageBMain();
