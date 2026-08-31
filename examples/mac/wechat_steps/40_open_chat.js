shared.chooseChatClickTarget = async function chooseChatClickTarget(context) {
  const conversationCapture = shared.findCapture(context.artifactBundle, 'conversation_capture', 'conversation_list');
  const rawCandidates = context.artifactCandidates?.candidates || [];
  const candidates = rawCandidates.filter((candidate) => shared.candidateMatchesTarget(candidate, shared.runtimeConfig.targetChatName));
  if (context.conversationResolved?.box && conversationCapture?.bbox && candidates.length > 0) {
    for (const candidate of candidates) {
      const located = await shared.freshLocateConversationCandidate(
        context.win,
        context.conversationResolved.box,
        conversationCapture.bbox,
        candidate,
        `open_chat_${candidate.id || 'candidate'}`
      );
      if (located?.ok && located?.point) {
        return {
          source: 'candidate-template-match',
          point: located.point,
          candidate,
          locatedCandidate: located,
        };
      }
    }
  }
  if (shared.compactText(shared.runtimeConfig.targetChatName)) {
    return {
      source: 'search-flow-needed',
      point: null,
      candidatesConsidered: rawCandidates.length,
    };
  }
  const probeStep = shared.findProbeStep(context.artifactBundle, 'open_chat');
  if (probeStep?.point) {
    return {
      source: 'probe-plan-open-chat',
      point: probeStep.point,
      probeStep,
    };
  }
  if (context.artifactCandidates?.bestCandidate?.point) {
    return {
      source: 'artifact-best-candidate',
      point: context.artifactCandidates.bestCandidate.point,
      bestCandidate: context.artifactCandidates.bestCandidate,
    };
  }
  const row = shared.findTargetRow(context.report, shared.runtimeConfig.targetChatName);
  if (!row?.bbox) {
    throw new Error(`未找到目标会话: ${shared.runtimeConfig.targetChatName}`);
  }
  return {
    source: 'region-map-row',
    point: {
      x: row.bbox.x + Math.round(Math.min(120, row.bbox.width * 0.3)),
      y: row.bbox.y + Math.round(row.bbox.height / 2),
    },
    row,
  };
};

shared.open_chat = async function open_chat(context) {
  const retryCount = Math.max(1, Number(shared.runtimeConfig.sendRetryCount || 1));
  let lastError = null;
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      if (!context.conversationResolved) {
        await shared.locate_conversation_list(context);
      }
      const target = await shared.chooseChatClickTarget(context);
      let openChatPoint = target.point;
      const conversationCapture = shared.findCapture(context.artifactBundle, 'conversation_capture', 'conversation_list');

      if (target?.source === 'search-flow-needed') {
        await shared.focus_search_input(context);
        await shared.type_search_query(context);
        // Degraded fallback to the first visible search row is only allowed after
        // same-run explicit exact-target search, and header verification stays mandatory.
        const searchResult = await shared.locate_search_result_row(context);
        openChatPoint = searchResult.point;
        target.searchResult = searchResult;
        target.degradedSearchFallback = Boolean(searchResult?.fallback);
      } else if (target?.source !== 'candidate-template-match' && context.conversationResolved?.box && conversationCapture?.bbox && target?.point) {
        openChatPoint = shared.translatePointFromReference(conversationCapture.bbox, context.conversationResolved.box, target.point);
      }

      if (!openChatPoint) {
        throw new Error('open_chat 未得到可点击坐标');
      }
      await shared.refreshWechatForeground(context.win, 'open_chat');
      await mouse.click(context.win.x + openChatPoint.x, context.win.y + openChatPoint.y);
      await shared.wait(800);
      context.targetSelection = target;
      context.openChatPoint = openChatPoint;
      context.openChatAttempt = attempt;
      if (context.searchResultRow) {
        context.searchResultRow.clickExecuted = true;
      }
      await shared.logStepEvidence(context, 'open_chat', true, {
        attempt,
        point: openChatPoint,
        targetSource: target?.source || 'unknown',
        fallbackUsed: target?.source === 'search-flow-needed' || Boolean(context.searchResultRow?.fallback),
        selectionSource: context.searchResultRow?.selectionSource || null,
        selectedRowScore: context.searchResultRow?.score ?? null,
        selectionReason: context.searchResultRow?.reason || null,
        rankedCandidatesPreview: context.searchResultRow?.rankedCandidatesPreview || null,
        rejectedCandidatesPreview: context.searchResultRow?.rejectedCandidatesPreview || null,
        degradedSearchFallback: Boolean(target?.degradedSearchFallback),
        candidateId: target?.candidate?.id || target?.locatedCandidate?.candidateId || null,
        templateMatchQuality: target?.locatedCandidate?.confidence ?? null,
        templateMatch: target?.locatedCandidate || null,
        clickExecuted: true,
        clickTargetTrusted: Boolean(context.searchResultRow?.clickTargetTrusted),
        targetTrust: context.searchResultRow?.targetTrust || null,
      });
      return { target, point: openChatPoint, attempt };
    } catch (err) {
      lastError = err;
      context.openChatAttempt = attempt;
      await shared.logStepEvidence(context, 'open_chat', false, {
        attempt,
        point: context.openChatPoint || null,
        targetSource: context.targetSelection?.source || null,
        fallbackUsed: Boolean(context.searchResultRow?.fallback),
        selectionSource: context.searchResultRow?.selectionSource || null,
        selectedRowScore: context.searchResultRow?.score ?? null,
        selectionReason: context.searchResultRow?.reason || null,
        rankedCandidatesPreview: context.searchResultRow?.rankedCandidatesPreview || null,
        rejectedCandidatesPreview: context.searchResultRow?.rejectedCandidatesPreview || null,
        degradedSearchFallback: Boolean(context.targetSelection?.degradedSearchFallback),
        candidateId: context.targetSelection?.candidate?.id || context.targetSelection?.locatedCandidate?.candidateId || null,
        templateMatchQuality: context.targetSelection?.locatedCandidate?.confidence ?? null,
        clickExecuted: Boolean(context.searchResultRow?.clickExecuted),
        clickTargetTrusted: Boolean(context.searchResultRow?.clickTargetTrusted),
        targetTrust: context.searchResultRow?.targetTrust || null,
        error: err && err.message ? err.message : String(err),
      });
      if (attempt >= retryCount) break;
      if (context.searchResolved?.box) {
        await shared.clear_search_query(context);
      }
      await shared.sleepWithJitter(
        shared.runtimeConfig.sendRetryDelayMinMs,
        shared.runtimeConfig.sendRetryDelayMaxMs
      );
    }
  }
  throw lastError || new Error('open_chat failed');
};

shared.verify_chat_header = async function verify_chat_header(context) {
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
    throw new Error('chat_header 不可用，无法执行 header 校验');
  }
  const headerShot = await shared.captureWindowRegion(context.win, resolved.box, 'wechat_v2_header');
  let result = await shared.verifyContainsText(headerShot.image, shared.runtimeConfig.targetChatName);
  let alternateHeaderShot = null;
  let alternateResult = null;
  if (!result.ok) {
    const titleFocusBox = {
      x: Math.max(0, Number(resolved.box.x || 0) - 72),
      y: Math.max(0, Number(resolved.box.y || 0)),
      width: Math.min(
        Math.max(1, Number(context.win?.width || 0) - Math.max(0, Number(resolved.box.x || 0) - 72)),
        Math.max(220, Math.min(Number(resolved.box.width || 0), 420))
      ),
      height: Math.min(
        Math.max(1, Number(context.win?.height || 0) - Math.max(0, Number(resolved.box.y || 0))),
        Math.max(Number(resolved.box.height || 0) + 16, 68)
      ),
    };
    alternateHeaderShot = await shared.captureWindowRegion(context.win, titleFocusBox, 'wechat_v2_header_title_focus');
    alternateResult = await shared.verifyContainsText(alternateHeaderShot.image, shared.runtimeConfig.targetChatName);
    if (alternateResult.ok || ((!result.text || result.lineCount === 0) && alternateResult.text)) {
      result = alternateResult.ok ? alternateResult : {
        ...alternateResult,
        ok: false,
        matchType: `${alternateResult.matchType || 'not_found'}_title_focus`,
      };
    }
  }
  context.headerCheck = result;
  if (!result.ok) {
    await shared.logStepEvidence(context, 'verify_chat_header', false, {
      box: resolved.box,
      point: context.openChatPoint || null,
      headerCapturePath: headerShot.path,
      alternateHeaderCapturePath: alternateHeaderShot?.path || null,
      ocrTextPreview: String(result.text || '').slice(0, 200),
      alternateOCRTextPreview: String(alternateResult?.text || '').slice(0, 200),
      lineCount: result.lineCount,
      matchType: result.matchType,
      alternateMatchType: alternateResult?.matchType || null,
      templateMatch: resolved.templateMatch || null,
      templateMatchQuality: resolved.templateMatch?.confidence ?? null,
      resolvedSource: resolved.source || null,
      fallbackUsed: Boolean(context.searchResultRow?.fallback),
      degradedSearchFallback: Boolean(context.targetSelection?.degradedSearchFallback),
      error: `会话 header 校验失败，未识别到目标会话 ${shared.runtimeConfig.targetChatName}`,
    });
    throw new Error(`会话 header 校验失败，未识别到目标会话 ${shared.runtimeConfig.targetChatName}。\nOCR: ${result.text}`);
  }
  await shared.logStepEvidence(context, 'verify_chat_header', true, {
    box: resolved.box,
    point: context.openChatPoint || null,
    headerCapturePath: headerShot.path,
    alternateHeaderCapturePath: alternateHeaderShot?.path || null,
    ocrTextPreview: String(result.text || '').slice(0, 200),
    alternateOCRTextPreview: String(alternateResult?.text || '').slice(0, 200),
    lineCount: result.lineCount,
    matchType: result.matchType,
    alternateMatchType: alternateResult?.matchType || null,
    templateMatch: resolved.templateMatch || null,
    templateMatchQuality: resolved.templateMatch?.confidence ?? null,
    resolvedSource: resolved.source || null,
    fallbackUsed: Boolean(context.searchResultRow?.fallback),
    degradedSearchFallback: Boolean(context.targetSelection?.degradedSearchFallback),
  });
  return result;
};
