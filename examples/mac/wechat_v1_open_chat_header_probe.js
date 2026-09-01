const entry = File.read('examples/mac/wechat_steps/main.js');
if (!entry) {
  throw new Error('缺少入口脚本: examples/mac/wechat_steps/main.js');
}

const patchedEntry = entry.replace('await shared.main();', '');
const probeCode = `
shared.verify_chat_header_probe = async function verify_chat_header_probe(context) {
  const resolved = context.headerResolved || (await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'header_capture',
    'chat_header',
    'chat_header'
  ));
  context.headerResolved = resolved;
  if (!resolved?.box) {
    throw new Error('chat_header 不可用，无法执行 header probe');
  }

  const primaryShot = await shared.captureWindowRegion(context.win, resolved.box, 'wechat_v1_probe_header_full');
  const primaryResult = await shared.verifyContainsText(primaryShot.image, shared.runtimeConfig.targetChatName);

  const titleFocusBox = {
    x: Math.max(0, Number(resolved.box.x || 0) - 12),
    y: Math.max(0, Number(resolved.box.y || 0)),
    width: Math.min(
      Math.max(220, Math.round(Number(resolved.box.width || 0) * 0.36)),
      Math.max(1, Number(context.win?.width || 0) - Math.max(0, Number(resolved.box.x || 0) - 12))
    ),
    height: Math.min(
      Math.max(68, Number(resolved.box.height || 0) + 16),
      Math.max(1, Number(context.win?.height || 0) - Math.max(0, Number(resolved.box.y || 0)))
    ),
  };
  const titleFocusShot = await shared.captureWindowRegion(context.win, titleFocusBox, 'wechat_v1_probe_header_title_focus');
  const titleFocusResult = await shared.verifyContainsText(titleFocusShot.image, shared.runtimeConfig.targetChatName);

  const chosen = titleFocusResult.ok ? titleFocusResult : primaryResult;
  context.headerCheck = chosen;
  context.headerProbe = {
    resolved,
    primaryShotPath: primaryShot.path,
    primaryResult,
    titleFocusBox,
    titleFocusShotPath: titleFocusShot.path,
    titleFocusResult,
    chosenResult: chosen,
  };

  await shared.logStepEvidence(context, 'verify_chat_header_probe', Boolean(chosen.ok), {
    resolvedSource: resolved.source || null,
    resolvedBox: resolved.box || null,
    templateMatch: resolved.templateMatch || null,
    templateMatchQuality: resolved.templateMatch?.confidence ?? null,
    primaryShotPath: primaryShot.path,
    primaryMatchType: primaryResult.matchType,
    primaryOCRTextPreview: String(primaryResult.text || '').slice(0, 200),
    titleFocusBox,
    titleFocusShotPath: titleFocusShot.path,
    titleFocusMatchType: titleFocusResult.matchType,
    titleFocusOCRTextPreview: String(titleFocusResult.text || '').slice(0, 200),
    chosenMatchType: chosen.matchType,
    chosenOK: Boolean(chosen.ok),
  });

  return context.headerProbe;
};

shared.writeHeaderProbeReport = async function writeHeaderProbeReport(context) {
  const stepEvidenceSummary = shared.buildStepEvidenceSummary(context);
  const statusSummary = {
    openChatSucceeded: Boolean(stepEvidenceSummary.byStep?.open_chat?.lastSuccess) || Boolean(context?.openChatPoint),
    headerVerified: Boolean(context?.headerProbe?.chosenResult?.ok),
    inputFocused: false,
    draftVerified: false,
    sendAttempted: false,
    draftCleared: false,
    selfMessageObserved: false,
  };
  const out = {
    timestamp: new Date().toISOString(),
    mode: 'header_probe',
    config: shared.runtimeConfig,
    auditPath: shared.runtimeConfig.sendAuditPath,
    artifactRunRoot: context.artifactBundle?.runRoot || shared.runtimeConfig.artifactRunRoot,
    window: context.win,
    targetSelection: context.targetSelection || null,
    openChatPoint: context.openChatPoint || null,
    headerProbe: context.headerProbe || null,
    statusSummary,
    sendSafety: context.sendSafety || null,
    stepEvidenceSummary,
  };
  const reportPath = '.runtime/temp/mac/wechat_v1_open_chat_header_probe_' + Date.now() + '.json';
  await File.write(reportPath, JSON.stringify(out, null, 2));
  console.log('probe_report:', reportPath);
  return reportPath;
};

shared.headerProbeMain = async function headerProbeMain() {
  const context = await shared.buildInitialContext();
  await shared.locate_conversation_list(context);
  await shared.open_chat(context);
  await shared.verify_chat_header_probe(context);
  return shared.writeHeaderProbeReport(context);
};

await shared.headerProbeMain();
`;

await eval(`(async () => {\n${patchedEntry}\n${probeCode}\n})()`);
