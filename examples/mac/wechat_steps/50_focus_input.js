shared.focus_input = async function focus_input(context) {
  const resolved = context.inputResolved || (await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'input_capture',
    'input_area',
    'input_area'
  ));
  context.inputResolved = resolved;
  if (!resolved?.box) {
    throw new Error('input_area 不可用，无法执行 focus_input');
  }
  const focusInputStep = shared.findProbeStep(context.artifactBundle, 'focus_input');
  let focusPoint = focusInputStep?.point || {
    x: resolved.box.x + Math.round(resolved.box.width * 0.6),
    y: resolved.box.y + Math.round(resolved.box.height * 0.72),
  };
  const inputCapture = shared.findCapture(context.artifactBundle, 'input_capture', 'input_area');
  if (resolved?.box && inputCapture?.bbox && focusInputStep?.point) {
    focusPoint = shared.translatePointFromReference(inputCapture.bbox, resolved.box, focusInputStep.point);
  }
  try {
    await shared.refreshWechatForeground(context.win, 'focus_input');
    await mouse.click(context.win.x + focusPoint.x, context.win.y + focusPoint.y);
    await shared.wait(200);
    context.focusPoint = focusPoint;
    const result = { point: focusPoint, box: resolved.box };
    await shared.logStepEvidence(context, 'focus_input', true, {
      point: focusPoint,
      box: resolved.box,
      fallbackUsed: !Boolean(focusInputStep?.point),
      probePointUsed: Boolean(focusInputStep?.point),
      templateMatch: resolved.templateMatch || null,
      templateMatchQuality: resolved.templateMatch?.confidence ?? null,
    });
    return result;
  } catch (err) {
    await shared.logStepEvidence(context, 'focus_input', false, {
      point: focusPoint,
      box: resolved.box,
      fallbackUsed: !Boolean(focusInputStep?.point),
      probePointUsed: Boolean(focusInputStep?.point),
      templateMatch: resolved.templateMatch || null,
      templateMatchQuality: resolved.templateMatch?.confidence ?? null,
      error: err && err.message ? err.message : String(err),
    });
    throw err;
  }
};
