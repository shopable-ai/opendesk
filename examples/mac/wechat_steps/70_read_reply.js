shared.verify_message_context = async function verify_message_context(context) {
  const resolved = context.messageResolved || (await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'reply_capture',
    'message_list',
    'message_list'
  ));
  context.messageResolved = resolved;
  if (!resolved?.box) {
    throw new Error('message_list 不可用，无法校验上下文');
  }
  const messageBefore = await shared.captureWindowRegion(context.win, resolved.box, 'wechat_v2_message_before');
  const result = await shared.verifyContainsText(messageBefore.image, shared.runtimeConfig.expectedIncomingText);
  context.incomingCheck = result;
  if (!result.ok) {
    throw new Error(
      `消息区未识别到预期上下文。matchType=${result.matchType} expected=${result.normalizedExpectedText || '<non-empty>'}\nOCR: ${result.text}`
    );
  }
  return result;
};

shared.scroll_message_list = async function scroll_message_list(context) {
  const resolved = context.messageResolved || (await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'reply_capture',
    'message_list',
    'message_list'
  ));
  context.messageResolved = resolved;
  if (!resolved?.box) {
    throw new Error('message_list 不可用，无法执行滚动采样');
  }
  const point = {
    x: resolved.box.x + Math.round(resolved.box.width * 0.5),
    y: resolved.box.y + Math.round(resolved.box.height * 0.6),
  };
  await shared.refreshWechatForeground(context.win, 'scroll_message_list');
  await mouse.move(context.win.x + point.x, context.win.y + point.y);
  await shared.wait(120);
  await mouse.wheel({ deltaY: -3 });
  await shared.wait(400);
  context.messageScrollPoint = point;
  return { point, box: resolved.box };
};

shared.read_reply = async function read_reply(context) {
  const resolved = context.messageResolved || (await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'reply_capture',
    'message_list',
    'message_list'
  ));
  context.messageResolved = resolved;
  if (!resolved?.box) {
    throw new Error('message_list 不可用，无法执行 read_reply');
  }
  await shared.wait(shared.runtimeConfig.replyReadbackWaitMs);
  const replyReadbackShot = await shared.captureWindowRegion(context.win, resolved.box, 'wechat_v2_reply_readback');
  const ocr = await Vision.runOCR({
    visionProfile: shared.runtimeConfig.visionProfile,
    image: replyReadbackShot.image,
  });
  const text = shared.normalizeText(ocr?.text || '');
  const compactText = shared.compactText(text);
  const result = {
    ok: text.length > 0,
    text,
    lineCount: Number(ocr?.lineCount || 0),
    compactText,
    mode: 'raw_readback',
  };
  context.replyReadback = result;
  return result;
};
