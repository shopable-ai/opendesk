shared.wait = (ms) => page.waitFor(ms);

shared.CONFIG = {
  targetChatName: '知乎运营 自己',
  expectedIncomingText: '今天星期几？多少号？',
  replyMessage: '今天星期一，今天是2026年3月16号。',
  enableSend: false,
  allowUnsafeSendOverride: false,
  allowDraftInputWithoutSend: false,
  useClipboardForInput: true,
  regionReportPath: '.runtime/temp/mac/wechat_region_map_latest.json',
  artifactRunRoot: '',
  artifactChatCandidatesPath: '',
  artifactCaptureContractPath: '',
  artifactProbePlanPath: '',
  artifactSendSafetyPath: '',
  artifactCaptureTemplatePath: '',
  maxReportAgeMs: 10 * 60 * 1000,
  replyReadbackWaitMs: 1200,
  sendRetryCount: 2,
  sendRetryDelayMinMs: 600,
  sendRetryDelayMaxMs: 1400,
  sendDedupWindowMs: 60 * 1000,
  sendAuditPath: '.runtime/temp/mac/wechat_structured_send_v2_audit.jsonl',
  stepMode: 'full_non_send',
  visionProfile: {
    provider: 'local',
    language: 'ch',
    minConfidence: 0.0,
    timeoutMs: 15000,
  },
};

shared.CONFIG_OVERRIDE_PATHS = [
  '.runtime/temp/mac/wechat_structured_send_v2.config.json',
  '.runtime/temp/mac/wechat_send.config.json',
];

shared.normalizeText = function normalizeText(v) {
  return String(v || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
};

shared.compactText = function compactText(v) {
  return shared.normalizeText(v).replace(/\s+/g, '');
};

shared.parseJson = function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} 解析失败: ${err && err.message ? err.message : String(err)}`);
  }
};

shared.randomBetween = function randomBetween(min, max) {
  const low = Number(min || 0);
  const high = Number(max || low);
  if (high <= low) return low;
  return low + Math.random() * (high - low);
};

shared.sleepWithJitter = async function sleepWithJitter(min, max) {
  const delay = Math.round(shared.randomBetween(min, max));
  await shared.wait(delay);
  return delay;
};

shared.mergeConfig = function mergeConfig(base, override) {
  const next = { ...base };
  Object.keys(override || {}).forEach((key) => {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key]) && typeof base[key] === 'object') {
      next[key] = { ...base[key], ...override[key] };
      return;
    }
    next[key] = override[key];
  });
  return next;
};

shared.loadConfigOverrides = function loadConfigOverrides() {
  let cfg = { ...shared.CONFIG };
  for (const path of shared.CONFIG_OVERRIDE_PATHS) {
    if (!File.exists(path)) continue;
    const raw = File.read(path);
    if (!raw) continue;
    cfg = shared.mergeConfig(cfg, shared.parseJson(raw, path));
  }
  return cfg;
};

shared.requiresTargetChat = function requiresTargetChat(stepMode) {
  const mode = String(stepMode || 'full_non_send');
  return mode !== 'none';
};

shared.requiresReplyMessage = function requiresReplyMessage(stepMode, cfg) {
  const mode = String(stepMode || 'full_non_send');
  return Boolean(
    cfg?.enableSend ||
      cfg?.allowDraftInputWithoutSend ||
      [
        'type_draft',
        'click_send',
        'verify_draft_cleared',
        'verify_post_send_message',
        'bundle_send_guarded',
        'full_send_guarded',
      ].includes(mode)
  );
};

shared.validateRuntimeConfig = function validateRuntimeConfig(cfg) {
  const errors = [];
  if (shared.requiresTargetChat(cfg?.stepMode) && !shared.normalizeText(cfg?.targetChatName)) {
    errors.push('targetChatName 不能为空');
  }
  if (shared.requiresReplyMessage(cfg?.stepMode, cfg) && !shared.normalizeText(cfg?.replyMessage)) {
    errors.push('replyMessage 不能为空');
  }
  if (cfg?.enableSend && !shared.normalizeText(cfg?.sendAuditPath)) {
    errors.push('enableSend=true 时 sendAuditPath 不能为空');
  }
  if (errors.length > 0) {
    throw new Error(`运行配置校验失败: ${errors.join('；')}`);
  }
  return cfg;
};

shared.makeSendRecordKey = function makeSendRecordKey(target, message) {
  return `${shared.compactText(target)}::${shared.normalizeText(message)}`;
};

shared.readJsonLinesIfExists = function readJsonLinesIfExists(path) {
  if (!path || !File.exists(path)) return [];
  const raw = File.read(path);
  if (!raw) return [];
  return String(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        console.warn(`skip invalid jsonl line ${index + 1} from ${path}: ${err && err.message ? err.message : String(err)}`);
        return null;
      }
    })
    .filter(Boolean);
};

shared.appendAuditLog = async function appendAuditLog(payload) {
  const path = shared.runtimeConfig.sendAuditPath;
  if (!path) return;
  const previous = File.exists(path) ? File.read(path) || '' : '';
  const nextLine = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  })}\n`;
  await File.write(path, `${previous}${nextLine}`);
};

shared.wasSentRecently = function wasSentRecently(target, message) {
  const key = shared.makeSendRecordKey(target, message);
  const cutoff = Date.now() - Number(shared.runtimeConfig.sendDedupWindowMs || 0);
  return shared.readJsonLinesIfExists(shared.runtimeConfig.sendAuditPath).some((entry) => {
    if (!entry?.success || entry?.phase !== 'send_complete') return false;
    if (entry?.recordKey !== key) return false;
    const ts = new Date(entry.timestamp || 0).getTime();
    return Boolean(ts) && ts >= cutoff;
  });
};

shared.logSendPhase = async function logSendPhase(context, phase, success, extra) {
  const payload = {
    phase,
    success: Boolean(success),
    recordKey: shared.makeSendRecordKey(shared.runtimeConfig.targetChatName, shared.runtimeConfig.replyMessage),
    targetChatName: shared.runtimeConfig.targetChatName,
    messagePreview: String(shared.runtimeConfig.replyMessage || '').slice(0, 80),
    openChatPoint: context?.openChatPoint || null,
    focusPoint: context?.focusPoint || null,
    extra: extra || {},
  };
  await shared.appendAuditLog(payload);
  return payload;
};

shared.logStepEvidence = async function logStepEvidence(context, stepId, success, extra) {
  const payload = {
    kind: 'step',
    stepId,
    success: Boolean(success),
    targetChatName: shared.runtimeConfig.targetChatName,
    openChatPoint: context?.openChatPoint || null,
    focusPoint: context?.focusPoint || null,
    extra: extra || {},
  };
  await shared.appendAuditLog(payload);
  if (context) {
    if (!Array.isArray(context.stepEvidence)) {
      context.stepEvidence = [];
    }
    context.stepEvidence.push(payload);
  }
  return payload;
};

shared.updateWindowGuardState = function updateWindowGuardState(context, patch) {
  if (!context) return null;
  const next = {
    frontmostWechatConfirmed: Boolean(context.windowGuard?.frontmostWechatConfirmed),
    windowBoundsStable: Boolean(context.windowGuard?.windowBoundsStable),
    lastCheckedWindow: context.windowGuard?.lastCheckedWindow || null,
    lastStepLabel: context.windowGuard?.lastStepLabel || '',
    lastError: context.windowGuard?.lastError || '',
    ...patch,
  };
  context.windowGuard = next;
  return next;
};

shared.buildSendSafety = function buildSendSafety(context, overrides = {}) {
  const gateStatus = shared.runtimeConfig.gateStatus || null;
  const artifactSafety = context?.artifactBundle?.sendSafety || null;
  const blockingRisks = [];
  const targetChatVerified = Boolean(context?.headerCheck?.ok);
  const draftVerified = Boolean(context?.draftCheck?.ok);
  const frontmostWechatConfirmed = Boolean(context?.windowGuard?.frontmostWechatConfirmed);
  const windowBoundsStable = Boolean(context?.windowGuard?.windowBoundsStable);
  const dedupPassed = !shared.wasSentRecently(shared.runtimeConfig.targetChatName, shared.runtimeConfig.replyMessage);
  const gatePassed = gateStatus ? Boolean(gateStatus.sendAllowed) : true;
  const artifactSafetyAllowed = artifactSafety ? Boolean(artifactSafety.allowed) : null;

  if (!targetChatVerified) blockingRisks.push('target_chat_not_verified');
  if (!draftVerified) blockingRisks.push('draft_not_verified');
  if (!frontmostWechatConfirmed) blockingRisks.push('frontmost_wechat_not_confirmed');
  if (!windowBoundsStable) blockingRisks.push('window_bounds_not_stable');
  if (!dedupPassed) blockingRisks.push('dedup_blocked');
  if (!gatePassed) blockingRisks.push('gate_send_not_allowed');
  if (artifactSafetyAllowed === false) blockingRisks.push('artifact_send_safety_blocked');

  const base = {
    enabled: Boolean(shared.runtimeConfig.enableSend),
    gatePassed,
    targetChatVerified,
    draftVerified,
    dedupPassed,
    frontmostWechatConfirmed,
    windowBoundsStable,
    manualOverrideRequired: false,
    artifactSafetyAllowed,
    blockingRisks,
    decision: blockingRisks.length > 0 ? 'block' : 'allow',
  };
  return {
    ...base,
    ...overrides,
  };
};

shared.sameWindow = function sameWindow(a, b) {
  return (
    Number(a?.x || 0) === Number(b?.x || 0) &&
    Number(a?.y || 0) === Number(b?.y || 0) &&
    Number(a?.width || 0) === Number(b?.width || 0) &&
    Number(a?.height || 0) === Number(b?.height || 0)
  );
};

shared.nearlySameWindow = function nearlySameWindow(a, b, tolerance = 8) {
  return (
    Math.abs(Number(a?.x || 0) - Number(b?.x || 0)) <= tolerance &&
    Math.abs(Number(a?.y || 0) - Number(b?.y || 0)) <= tolerance &&
    Math.abs(Number(a?.width || 0) - Number(b?.width || 0)) <= tolerance &&
    Math.abs(Number(a?.height || 0) - Number(b?.height || 0)) <= tolerance
  );
};

shared.isWechatWindow = function isWechatWindow(win) {
  const exe = String(win?.exeName || '').toLowerCase();
  const title = String(win?.title || '').toLowerCase();
  return exe.includes('wechat') || title.includes('微信') || title.includes('wechat');
};

shared.getWechatWindow = async function getWechatWindow() {
  const list = await window.list();
  const wx = (list || [])
    .filter((item) => shared.isWechatWindow(item))
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  if (!wx?.title) {
    throw new Error('未找到微信窗口，请先打开并登录微信桌面版');
  }
  return wx;
};

shared.focusWechat = async function focusWechat() {
  const wx = await shared.getWechatWindow();
  await window.bringToTop(wx.title, wx.processId || wx.processID || wx.pid || 0);
  await shared.wait(500);
  let active = await window.getActiveWindow();
  if ((active?.width || 0) < 900 || (active?.height || 0) < 680) {
    await window.setWindowBounds(wx.title, 80, 60, 1280, 860);
    await shared.wait(700);
    active = await window.getActiveWindow();
  }
  return active || wx;
};

shared.assertWechatWindowStable = async function assertWechatWindowStable(expectedWin, stepLabel) {
  let lastActive = null;
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const active = await window.getActiveWindow();
    lastActive = active || null;
    if (shared.isWechatWindow(active) && shared.nearlySameWindow(active, expectedWin)) {
      return active;
    }
    if (attempt < attempts && expectedWin?.title) {
      try {
        await window.bringToTop(expectedWin.title, expectedWin.processId || expectedWin.processID || expectedWin.pid || 0);
      } catch (err) {
        console.warn(`assertWechatWindowStable bringToTop failed @${stepLabel} attempt=${attempt}: ${err && err.message ? err.message : String(err)}`);
      }
      await shared.wait(180);
    }
  }
  if (!shared.isWechatWindow(lastActive)) {
    throw new Error(`执行中断：${stepLabel} 前当前活动窗口已不是微信，请保持微信前台且不要切换窗口`);
  }
  throw new Error(`执行中断：${stepLabel} 前微信窗口位置/尺寸发生漂移，请重新开始`);
};

shared.refreshWechatForeground = async function refreshWechatForeground(expectedWin, stepLabel) {
  if (!expectedWin?.title) {
    throw new Error(`执行中断：${stepLabel} 前缺少微信窗口信息`);
  }
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await window.bringToTop(expectedWin.title, expectedWin.processId || expectedWin.processID || expectedWin.pid || 0);
      await shared.wait(180);
      return await shared.assertWechatWindowStable(expectedWin, stepLabel);
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await shared.wait(220);
      }
    }
  }
  throw lastErr || new Error(`执行中断：${stepLabel} 前无法重新聚焦微信窗口`);
};

shared.refreshWechatForegroundForContext = async function refreshWechatForegroundForContext(context, stepLabel) {
  const expectedWin = context?.win;
  try {
    const active = await shared.refreshWechatForeground(expectedWin, stepLabel);
    if (context) {
      context.win = active || expectedWin;
      shared.updateWindowGuardState(context, {
        frontmostWechatConfirmed: Boolean(shared.isWechatWindow(active)),
        windowBoundsStable: Boolean(shared.nearlySameWindow(active, expectedWin)),
        lastCheckedWindow: active || null,
        lastStepLabel: stepLabel || '',
        lastError: '',
      });
    }
    return active;
  } catch (err) {
    if (context) {
      shared.updateWindowGuardState(context, {
        frontmostWechatConfirmed: false,
        windowBoundsStable: false,
        lastCheckedWindow: null,
        lastStepLabel: stepLabel || '',
        lastError: err && err.message ? err.message : String(err),
      });
    }
    throw err;
  }
};
