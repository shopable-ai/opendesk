shared.assertArtifactSendSafetyIfNeeded = function assertArtifactSendSafetyIfNeeded(bundle) {
  const safety = bundle?.sendSafety;
  if (!shared.runtimeConfig.enableSend) return;
  if (!safety) return;
  if (safety.allowed) return;
  if (shared.runtimeConfig.allowUnsafeSendOverride) return;
  throw new Error(
    `artifact send safety gate 未通过，当前禁止真实发送。blockingRisks=${JSON.stringify(safety.blockingRisks || [])}`
  );
};

shared.verifyNotContainsText = async function verifyNotContainsText(imageBase64, unexpectedText) {
  const result = await shared.verifyContainsText(imageBase64, unexpectedText);
  return {
    ...result,
    ok: !result.ok,
    unexpectedText: shared.normalizeText(unexpectedText),
  };
};

shared.type_draft = async function type_draft(context) {
  if (!(shared.runtimeConfig.enableSend || shared.runtimeConfig.allowDraftInputWithoutSend)) {
    context.inputMode = 'skipped';
    context.draftInputStrategy = {
      preferred: shared.runtimeConfig.useClipboardForInput ? 'clipboard' : 'keyboardType',
      selected: 'skipped',
      fallbackUsed: false,
      clipboardFirst: Boolean(shared.runtimeConfig.useClipboardForInput),
    };
    context.draftCheck = { ok: false, skipped: true, text: '', lineCount: 0 };
    return context.draftCheck;
  }
  if (shared.runtimeConfig.enableSend && shared.wasSentRecently(shared.runtimeConfig.targetChatName, shared.runtimeConfig.replyMessage)) {
    throw new Error(
      `检测到 ${Math.round(Number(shared.runtimeConfig.sendDedupWindowMs || 0) / 1000)} 秒内相同目标+消息已成功发送，已阻止重复发送`
    );
  }
  const inputMode = await shared.inputMessage(shared.runtimeConfig.replyMessage);
  const draftInputStrategy = {
    preferred: shared.runtimeConfig.useClipboardForInput ? 'clipboard' : 'keyboardType',
    selected: inputMode,
    fallbackUsed: inputMode === 'clipboard_failed_keyboard_fallback',
    clipboardFirst: Boolean(shared.runtimeConfig.useClipboardForInput),
  };
  await shared.wait(500);
  const inputBox = context.inputResolved?.box;
  const inputBeforeSend = await shared.captureWindowRegion(context.win, inputBox, 'wechat_v2_input_before_send');
  const draftCheck = await shared.verifyContainsText(inputBeforeSend.image, shared.runtimeConfig.replyMessage);
  context.inputMode = inputMode;
  context.draftInputStrategy = draftInputStrategy;
  context.draftCheck = draftCheck;
  await shared.logSendPhase(context, 'draft_input', draftCheck.ok, {
    inputMode,
    draftInputStrategy,
    matchType: draftCheck.matchType,
    expectedText: draftCheck.expectedText,
    normalizedExpectedText: draftCheck.normalizedExpectedText,
    ocrText: draftCheck.text,
    compactText: draftCheck.compactText,
    lineCount: draftCheck.lineCount,
  });
  if (!draftCheck.ok) {
    throw new Error(
      `输入框草稿校验失败。matchType=${draftCheck.matchType} expected=${draftCheck.normalizedExpectedText || '<non-empty>'}\nOCR: ${draftCheck.text}`
    );
  }
  return draftCheck;
};

shared.click_send = async function click_send(context) {
  const sendResolved = context.sendResolved || (await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'send_capture',
    'send_action_zone',
    'input_area'
  ));
  context.sendResolved = sendResolved;
  const sendActions = [];
  if (!shared.runtimeConfig.enableSend) {
    context.sendSafety = shared.buildSendSafety(context, {
      enabled: false,
      manualOverrideRequired: false,
    });
    context.sendActions = sendActions;
    return sendActions;
  }
  await shared.refreshWechatForegroundForContext(context, 'send_click');
  const allowUnsafeOverride = Boolean(shared.runtimeConfig.allowUnsafeSendOverride);
  context.sendSafety = shared.buildSendSafety(context, {
    manualOverrideRequired: allowUnsafeOverride && Boolean(context?.artifactBundle?.sendSafety?.allowed === false),
  });
  if (context.sendSafety.decision !== 'allow' && !allowUnsafeOverride) {
    throw new Error(`发送安全检查未通过，已阻止真实发送。blockingRisks=${JSON.stringify(context.sendSafety.blockingRisks || [])}`);
  }
  if (context.sendSafety.decision !== 'allow' && allowUnsafeOverride) {
    context.sendSafety = {
      ...context.sendSafety,
      manualOverrideRequired: true,
      decision: 'allow',
      blockingRisks: context.sendSafety.blockingRisks || [],
      overrideApplied: true,
      originalDecision: 'block',
    };
  }
  const sendCapture = shared.findCapture(context.artifactBundle, 'send_capture', 'send_action_zone');
  if (sendResolved?.templateMatch?.ok && sendCapture?.bbox) {
    const sendPoint = shared.translatePointFromReference(sendCapture.bbox, sendResolved.box, {
      x: sendCapture.bbox.x + sendCapture.bbox.width - Math.min(48, Math.round(sendCapture.bbox.width * 0.08)),
      y: sendCapture.bbox.y + Math.round(sendCapture.bbox.height / 2),
    });
    await mouse.click(context.win.x + sendPoint.x, context.win.y + sendPoint.y);
    sendActions.push('mouse.click.send-zone');
    await shared.wait(250);
  } else {
    await keyboard.press('Enter');
    sendActions.push('keyboard.enter');
    await shared.wait(400);
  }
  context.sendActions = sendActions;
  await shared.logSendPhase(context, 'send_click', sendActions.length > 0, {
    sendActions,
    templateMatch: sendResolved?.templateMatch || null,
    sendSafety: context.sendSafety || null,
  });
  return sendActions;
};

shared.verify_draft_cleared = async function verify_draft_cleared(context) {
  const inputBox = context.inputResolved?.box;
  if (!inputBox) {
    throw new Error('input_area 不可用，无法执行 verify_draft_cleared');
  }
  await shared.wait(350);
  const shot = await shared.captureWindowRegion(context.win, inputBox, 'wechat_v2_input_after_send');
  const result = await shared.verifyNotContainsText(shot.image, shared.runtimeConfig.replyMessage);
  context.draftAfterCheck = result;
  context.draftCleared = result.ok;
  await shared.logSendPhase(context, 'draft_cleared', result.ok, {
    matchType: result.matchType,
    unexpectedText: result.unexpectedText,
    ocrText: result.text,
    compactText: result.compactText,
    lineCount: result.lineCount,
  });
  return result;
};

shared.verify_post_send_message = async function verify_post_send_message(context) {
  const resolved = context.messageResolved?.box;
  if (!resolved) {
    throw new Error('message_list 不可用，无法执行 verify_post_send_message');
  }
  await shared.wait(500);
  const shot = await shared.captureWindowRegion(context.win, resolved, 'wechat_v2_message_after_send');
  const result = await shared.verifyContainsText(shot.image, shared.runtimeConfig.replyMessage);
  context.messageAfterCheck = result;
  context.selfMessageObserved = result.ok;
  await shared.logSendPhase(context, 'message_observed', result.ok, {
    matchType: result.matchType,
    expectedText: result.expectedText,
    normalizedExpectedText: result.normalizedExpectedText,
    ocrText: result.text,
    compactText: result.compactText,
    lineCount: result.lineCount,
  });
  if (result.ok) {
    await shared.logSendPhase(context, 'send_complete', true, {
      sendActions: context.sendActions || [],
    });
  }
  return result;
};
