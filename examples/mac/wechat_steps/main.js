const shared = {};

shared.loadStep = function loadStep(path) {
  const source = File.read(path);
  if (!source) {
    throw new Error(`缺少 step 模块: ${path}`);
  }
  const runner = new Function('shared', source);
  runner(shared);
};

[
  'examples/mac/wechat_steps/00_window_guard.js',
  'examples/mac/wechat_steps/10_capture_helpers.js',
  'examples/mac/wechat_steps/20_template_relocate.js',
  'examples/mac/wechat_steps/30_search_flow.js',
  'examples/mac/wechat_steps/40_open_chat.js',
  'examples/mac/wechat_steps/50_focus_input.js',
  'examples/mac/wechat_steps/60_send_guard.js',
  'examples/mac/wechat_steps/70_read_reply.js',
].forEach(shared.loadStep);

shared.applyGatePolicyToRuntimeConfig = function applyGatePolicyToRuntimeConfig(config, discovered) {
  const next = { ...config };
  const gateStatus = discovered?.gateStatus || null;
  next.gateStatus = gateStatus;
  next.compareSummaryPath = discovered?.compareSummaryPath || next.compareSummaryPath || '';
  next.allowedActionStage = gateStatus?.allowedActionStage || next.allowedActionStage || 'none';

  if (gateStatus) {
    next.enableSend = Boolean(next.enableSend) && Boolean(gateStatus.sendAllowed);
    if (!gateStatus.sendAllowed) {
      next.allowDraftInputWithoutSend = false;
    }
    const currentMode = String(next.stepMode || '');
    const needsAutoMode = !currentMode || currentMode === 'full_non_send' || currentMode === 'auto';
    if (needsAutoMode && discovered?.allowedStepMode) {
      next.stepMode = discovered.allowedStepMode;
    }
    if (gateStatus.allowedActionStage === 'none' && needsAutoMode) {
      next.stepMode = 'none';
    }
  }

  return next;
};

shared.runtimeConfig = (() => {
  const merged = shared.loadConfigOverrides();
  const discovered = shared.discoverLatestArtifactBundle();
  if (discovered?.runRoot && !merged.artifactRunRoot) {
    merged.artifactRunRoot = discovered.runRoot;
  }
  if (discovered?.chatCandidatesPath && !merged.artifactChatCandidatesPath) {
    merged.artifactChatCandidatesPath = discovered.chatCandidatesPath;
  }
  if (discovered?.captureContractPath && !merged.artifactCaptureContractPath) {
    merged.artifactCaptureContractPath = discovered.captureContractPath;
  }
  if (discovered?.probePlanPath && !merged.artifactProbePlanPath) {
    merged.artifactProbePlanPath = discovered.probePlanPath;
  }
  if (discovered?.sendSafetyPath && !merged.artifactSendSafetyPath) {
    merged.artifactSendSafetyPath = discovered.sendSafetyPath;
  }
  if (discovered?.captureTemplatePath && !merged.artifactCaptureTemplatePath) {
    merged.artifactCaptureTemplatePath = discovered.captureTemplatePath;
  }
  const finalized = shared.applyGatePolicyToRuntimeConfig(merged, discovered);
  return shared.validateRuntimeConfig(finalized);
})();

shared.stepModeEnabled = function stepModeEnabled(stepId) {
  const mode = String(shared.runtimeConfig.stepMode || 'full_non_send');
  if (!mode || mode === 'full_non_send') {
    return !['type_draft', 'click_send', 'verify_draft_cleared', 'verify_post_send_message'].includes(stepId);
  }
  if (mode === 'none') return false;
  if (mode === 'full_send_guarded') return true;
  if (mode === stepId) return true;
  const bundles = {
    open_chat: ['locate_conversation_list', 'open_chat'],
    open_chat_verify_header: ['locate_conversation_list', 'open_chat', 'verify_chat_header'],
    open_chat_verify_header_focus_input: ['locate_conversation_list', 'open_chat', 'verify_chat_header', 'focus_input'],
    bundle_search_chat: ['locate_search_area', 'focus_search_input', 'type_search_query', 'locate_conversation_list', 'open_chat'],
    bundle_open_and_focus_input: ['locate_conversation_list', 'open_chat', 'verify_chat_header', 'focus_input'],
    bundle_send_guarded: ['focus_input', 'type_draft', 'click_send', 'verify_draft_cleared', 'verify_post_send_message'],
    bundle_read_reply: ['verify_message_context', 'scroll_message_list', 'read_reply'],
  };
  return Boolean(bundles[mode]?.includes(stepId));
};

shared.executeEnabledStep = async function executeEnabledStep(stepId, context, handler) {
  if (!shared.stepModeEnabled(stepId)) {
    return { skipped: true, stepId };
  }
  return handler(context);
};

shared.buildInitialContext = async function buildInitialContext() {
  await page.ensureMacPermissions({
    openSettingsOnFail: true,
    section: shared.runtimeConfig.permissionSection || 'all',
    strict: true,
  });
  const win = await shared.focusWechat();
  const artifactBundle = shared.loadArtifactBundleIfAny();
  const report = await shared.loadRegionReport(win, artifactBundle);
  const artifactCandidates = shared.loadArtifactCandidatesIfAny();
  shared.assertArtifactSendSafetyIfNeeded(artifactBundle);
  return {
    win,
    artifactBundle,
    artifactCandidates,
    report,
    windowGuard: {
      frontmostWechatConfirmed: Boolean(shared.isWechatWindow(win)),
      windowBoundsStable: true,
      lastCheckedWindow: win || null,
      lastStepLabel: 'build_initial_context',
      lastError: '',
    },
    sendSafety: null,
    stepEvidence: [],
    headerCheck: { ok: false, skipped: true, text: '', lineCount: 0 },
    incomingCheck: { ok: false, skipped: true, text: '', lineCount: 0 },
    draftCheck: { ok: false, skipped: true, text: '', lineCount: 0 },
    draftAfterCheck: { ok: false, skipped: true, text: '', lineCount: 0 },
    messageAfterCheck: { ok: false, skipped: true, text: '', lineCount: 0 },
    replyReadback: { ok: false, skipped: true, text: '', lineCount: 0 },
    searchInputMode: 'skipped',
    searchInputStrategy: {
      preferred: shared.runtimeConfig.useClipboardForInput ? 'clipboard' : 'keyboardType',
      selected: 'skipped',
      fallbackUsed: false,
      clipboardFirst: Boolean(shared.runtimeConfig.useClipboardForInput),
    },
    inputMode: 'skipped',
    draftInputStrategy: {
      preferred: shared.runtimeConfig.useClipboardForInput ? 'clipboard' : 'keyboardType',
      selected: 'skipped',
      fallbackUsed: false,
      clipboardFirst: Boolean(shared.runtimeConfig.useClipboardForInput),
    },
    sendActions: [],
    draftCleared: false,
    selfMessageObserved: false,
  };
};

shared.buildStepEvidenceSummary = function buildStepEvidenceSummary(context) {
  const events = Array.isArray(context?.stepEvidence) ? context.stepEvidence : [];
  const summary = {
    total: events.length,
    successCount: 0,
    failureCount: 0,
    byStep: {},
    latestFailure: null,
  };
  for (const event of events) {
    const stepId = String(event?.stepId || 'unknown');
    const success = Boolean(event?.success);
    if (!summary.byStep[stepId]) {
      summary.byStep[stepId] = {
        attempts: 0,
        successCount: 0,
        failureCount: 0,
        lastSuccess: null,
        lastExtra: null,
      };
    }
    const bucket = summary.byStep[stepId];
    bucket.attempts += 1;
    bucket.lastExtra = event?.extra || null;
    if (success) {
      summary.successCount += 1;
      bucket.successCount += 1;
      bucket.lastSuccess = true;
    } else {
      summary.failureCount += 1;
      bucket.failureCount += 1;
      bucket.lastSuccess = false;
      summary.latestFailure = {
        stepId,
        error: event?.extra?.error || '',
        extra: event?.extra || null,
      };
    }
  }
  return summary;
};

shared.buildStatusSummary = function buildStatusSummary(context) {
  const stepSummary = shared.buildStepEvidenceSummary(context);
  const openChatStep = stepSummary.byStep?.open_chat || null;
  const focusInputStep = stepSummary.byStep?.focus_input || null;
  return {
    openChatSucceeded: Boolean(openChatStep?.lastSuccess) || Boolean(context?.openChatPoint),
    clickExecuted: Boolean(openChatStep?.lastExtra?.clickExecuted) || Boolean(context?.searchResultRow?.clickExecuted),
    clickTargetTrusted: Boolean(openChatStep?.lastExtra?.clickTargetTrusted) || Boolean(context?.searchResultRow?.clickTargetTrusted),
    chatOpenedSemanticallyCorrect: Boolean(context?.headerCheck?.ok),
    headerVerified: Boolean(context?.headerCheck?.ok),
    inputFocused: Boolean(focusInputStep?.lastSuccess) || Boolean(context?.focusPoint),
    draftVerified: Boolean(context?.draftCheck?.ok),
    sendAttempted: Array.isArray(context?.sendActions) && context.sendActions.length > 0,
    draftCleared: Boolean(context?.draftCleared),
    selfMessageObserved: Boolean(context?.selfMessageObserved),
  };
};

shared.writeReport = async function writeReport(context) {
  const statusSummary = shared.buildStatusSummary(context);
  const stepEvidenceSummary = shared.buildStepEvidenceSummary(context);
  const reportOut = {
    timestamp: new Date().toISOString(),
    config: shared.runtimeConfig,
    stepModeResolved: String(shared.runtimeConfig.stepMode || 'full_non_send'),
    statusSummary,
    window: context.win,
    windowGuard: context.windowGuard || null,
    regionReportPath: shared.runtimeConfig.regionReportPath,
    compareSummaryPath: shared.runtimeConfig.compareSummaryPath || '',
    gateStatus: shared.runtimeConfig.gateStatus || null,
    artifactRunRoot: context.artifactBundle?.runRoot || shared.runtimeConfig.artifactRunRoot,
    artifactChatCandidatesPath: shared.runtimeConfig.artifactChatCandidatesPath,
    artifactCaptureContractPath: context.artifactBundle?.captureContractPath || shared.runtimeConfig.artifactCaptureContractPath,
    artifactProbePlanPath: context.artifactBundle?.probePlanPath || shared.runtimeConfig.artifactProbePlanPath,
    artifactSendSafetyPath: context.artifactBundle?.sendSafetyPath || shared.runtimeConfig.artifactSendSafetyPath,
    artifactCaptureTemplatePath: context.artifactBundle?.captureTemplatePath || shared.runtimeConfig.artifactCaptureTemplatePath,
    resolvedBoxes: {
      searchBox: context.searchResolved?.box || null,
      conversationBox: context.conversationResolved?.box || null,
      headerBox: context.headerResolved?.box || null,
      messageBox: context.messageResolved?.box || null,
      inputBox: context.inputResolved?.box || null,
      sendBox: context.sendResolved?.box || null,
    },
    templateRelocation: {
      search: context.searchResolved || null,
      conversation: context.conversationResolved || null,
      header: context.headerResolved || null,
      message: context.messageResolved || null,
      input: context.inputResolved || null,
      send: context.sendResolved || null,
    },
    targetSelection: context.targetSelection || null,
    searchResultRow: context.searchResultRow || null,
    openChatPoint: context.openChatPoint || null,
    focusPoint: context.focusPoint || null,
    headerCheck: context.headerCheck,
    incomingCheck: context.incomingCheck,
    searchInputMode: context.searchInputMode,
    searchInputStrategy: context.searchInputStrategy || null,
    inputMode: context.inputMode,
    draftInputStrategy: context.draftInputStrategy || null,
    draftCheck: context.draftCheck,
    draftAfterCheck: context.draftAfterCheck,
    messageAfterCheck: context.messageAfterCheck,
    draftCleared: context.draftCleared,
    selfMessageObserved: context.selfMessageObserved,
    sendSafety: context.sendSafety || null,
    sendActions: context.sendActions,
    replyReadback: context.replyReadback,
    stepEvidenceSummary,
    sendAuditPath: shared.runtimeConfig.sendAuditPath,
  };
  const reportPath = `.runtime/temp/mac/wechat_structured_send_v2_${Date.now()}.json`;
  await File.write(reportPath, JSON.stringify(reportOut, null, 2));
  console.log('report:', reportPath);
  return reportPath;
};

shared.main = async function main() {
  const context = await shared.buildInitialContext();

  await shared.executeEnabledStep('locate_search_area', context, shared.locate_search_area);
  await shared.executeEnabledStep('focus_search_input', context, shared.focus_search_input);
  await shared.executeEnabledStep('type_search_query', context, shared.type_search_query);
  await shared.executeEnabledStep('locate_conversation_list', context, shared.locate_conversation_list);
  await shared.executeEnabledStep('open_chat', context, shared.open_chat);
  context.headerCheck = await shared.executeEnabledStep('verify_chat_header', context, shared.verify_chat_header);
  context.incomingCheck = await shared.executeEnabledStep('verify_message_context', context, shared.verify_message_context);
  await shared.executeEnabledStep('focus_input', context, shared.focus_input);
  context.draftCheck = await shared.executeEnabledStep('type_draft', context, shared.type_draft);
  context.sendActions = await shared.executeEnabledStep('click_send', context, shared.click_send);
  context.draftAfterCheck = await shared.executeEnabledStep('verify_draft_cleared', context, shared.verify_draft_cleared);
  context.messageAfterCheck = await shared.executeEnabledStep('verify_post_send_message', context, shared.verify_post_send_message);
  await shared.executeEnabledStep('scroll_message_list', context, shared.scroll_message_list);
  context.replyReadback = await shared.executeEnabledStep('read_reply', context, shared.read_reply);

  return shared.writeReport(context);
};

await shared.main();
