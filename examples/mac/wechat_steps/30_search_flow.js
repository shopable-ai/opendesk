shared.candidateMatchesTarget = function candidateMatchesTarget(candidate, targetChatName) {
  const target = shared.compactText(targetChatName);
  if (!target) return true;
  if (candidate?.matchesTarget) return true;
  const normalized = shared.compactText(candidate?.normalizedText || candidate?.text || '');
  return normalized.includes(target);
};

shared.locate_search_area = async function locate_search_area(context) {
  const resolved = await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'search_capture',
    'search_area',
    'search_area'
  );
  if (!resolved?.box) {
    throw new Error('search_area 不可用，无法进入搜索链路');
  }
  context.searchResolved = resolved;
  return resolved;
};

shared.focus_search_input = async function focus_search_input(context) {
  const searchBox = context.searchResolved?.box || (await shared.locate_search_area(context)).box;
  const point = {
    x: searchBox.x + Math.round(searchBox.width * 0.45),
    y: searchBox.y + Math.round(searchBox.height * 0.55),
  };
  try {
    await shared.refreshWechatForeground(context.win, 'focus_search_input');
    await mouse.click(context.win.x + point.x, context.win.y + point.y);
    await shared.wait(200);
    context.searchPoint = point;
    const result = { point, box: searchBox };
    await shared.logStepEvidence(context, 'focus_search_input', true, {
      point,
      box: searchBox,
      source: context.searchResolved?.source || 'unknown',
      templateMatch: context.searchResolved?.templateMatch || null,
      templateMatchQuality: context.searchResolved?.templateMatch?.confidence ?? null,
    });
    return result;
  } catch (err) {
    await shared.logStepEvidence(context, 'focus_search_input', false, {
      point,
      box: searchBox,
      source: context.searchResolved?.source || 'unknown',
      templateMatch: context.searchResolved?.templateMatch || null,
      templateMatchQuality: context.searchResolved?.templateMatch?.confidence ?? null,
      error: err && err.message ? err.message : String(err),
    });
    throw err;
  }
};

shared.matchSearchQueryVisible = function matchSearchQueryVisible(ocrText, targetChatName) {
  const base = {
    ok: false,
    matchType: 'not_found',
    tokenChecks: [],
  };
  const target = shared.normalizeText(targetChatName);
  const compactTarget = shared.compactText(targetChatName);
  const compactOCR = shared.compactText(ocrText);
  if (!target || !compactTarget || !compactOCR) {
    return base;
  }
  if (compactOCR.includes(compactTarget)) {
    return {
      ok: true,
      matchType: 'compact_contains',
      tokenChecks: [],
    };
  }
  const tokens = target
    .split(/\s+/)
    .map((token) => shared.normalizeText(token))
    .filter(Boolean);
  const tokenChecks = tokens.map((token) => {
    const compactToken = shared.compactText(token);
    const direct = compactToken ? compactOCR.includes(compactToken) : false;
    const suffix = compactToken.length >= 4 ? compactOCR.includes(compactToken.slice(1)) : false;
    const score = shared.matchTargetTextScore(ocrText, token);
    const passed = direct || suffix || score >= (compactToken.length <= 2 ? 1 : 0.6);
    return {
      token,
      direct,
      suffix,
      score,
      passed,
    };
  });
  const passedCount = tokenChecks.filter((item) => item.passed).length;
  const asciiPassed = tokenChecks.filter((item) => /[a-z0-9]/i.test(item.token) && item.passed).length;
  const hasStrongToken = tokenChecks.some((item) => item.direct || item.suffix || item.score >= 0.85);
  if (tokenChecks.length > 0 && passedCount / tokenChecks.length >= 0.66 && asciiPassed >= 1 && hasStrongToken) {
    return {
      ok: true,
      matchType: 'token_fuzzy_match',
      tokenChecks,
    };
  }
  return {
    ok: false,
    matchType: 'not_found',
    tokenChecks,
  };
};

shared.captureExpandedSearchBox = async function captureExpandedSearchBox(context, label, options = {}) {
  const box = context.searchResolved?.box;
  if (!box) {
    throw new Error('search_area 不可用，无法截取搜索框扩展区域');
  }
  const marginLeft = Number.isFinite(Number(options.marginLeft)) ? Number(options.marginLeft) : 28;
  const marginRight = Number.isFinite(Number(options.marginRight)) ? Number(options.marginRight) : 56;
  const marginTop = Number.isFinite(Number(options.marginTop)) ? Number(options.marginTop) : 4;
  const marginBottom = Number.isFinite(Number(options.marginBottom)) ? Number(options.marginBottom) : 8;
  const x = Math.max(0, Number(box.x || 0) - marginLeft);
  const y = Math.max(0, Number(box.y || 0) - marginTop);
  const maxWidth = Math.max(1, Number(context.win?.width || 0) - x);
  const maxHeight = Math.max(1, Number(context.win?.height || 0) - y);
  const expanded = {
    x,
    y,
    width: Math.min(maxWidth, Number(box.width || 0) + marginLeft + marginRight),
    height: Math.min(maxHeight, Number(box.height || 0) + marginTop + marginBottom),
  };
  return shared.captureWindowRegion(context.win, expanded, label);
};

shared.type_search_query = async function type_search_query(context) {
  if (!shared.runtimeConfig.targetChatName) {
    throw new Error('targetChatName 为空，不应执行 type_search_query');
  }
  try {
    await shared.refreshWechatForeground(context.win, 'type_search_query');
    await keyboard.combination('Meta', 'a');
    await shared.wait(80);
    await keyboard.press('Backspace');
    await shared.wait(120);
    const inputMode = await shared.inputMessage(shared.runtimeConfig.targetChatName);
    await shared.wait(420);
    const primaryShot = await shared.captureExpandedSearchBox(context, 'wechat_v2_search_query_primary', {
      marginLeft: 44,
      marginRight: 140,
      marginTop: 6,
      marginBottom: 18,
    });
    const primaryCheck = await shared.verifyContainsText(primaryShot.image, shared.runtimeConfig.targetChatName);
    const primaryFuzzy = shared.matchSearchQueryVisible(primaryCheck.text, shared.runtimeConfig.targetChatName);
    let bestCheck = {
      ...primaryCheck,
      ok: Boolean(primaryCheck.ok || primaryFuzzy.ok),
      matchType: primaryCheck.ok ? primaryCheck.matchType : primaryFuzzy.matchType,
      tokenChecks: primaryFuzzy.tokenChecks || [],
      capturePath: primaryShot.path,
      passLabel: 'primary',
    };
    if (!bestCheck.ok) {
      await shared.wait(480);
      const retryShot = await shared.captureExpandedSearchBox(context, 'wechat_v2_search_query_retry', {
        marginLeft: 52,
        marginRight: 180,
        marginTop: 8,
        marginBottom: 22,
      });
      const retryCheck = await shared.verifyContainsText(retryShot.image, shared.runtimeConfig.targetChatName);
      const retryFuzzy = shared.matchSearchQueryVisible(retryCheck.text, shared.runtimeConfig.targetChatName);
      const retryResult = {
        ...retryCheck,
        ok: Boolean(retryCheck.ok || retryFuzzy.ok),
        matchType: retryCheck.ok ? retryCheck.matchType : retryFuzzy.matchType,
        tokenChecks: retryFuzzy.tokenChecks || [],
        capturePath: retryShot.path,
        passLabel: 'retry',
      };
      if (retryResult.ok || shared.compactText(retryResult.text || '').length > shared.compactText(bestCheck.text || '').length) {
        bestCheck = retryResult;
      }
    }
    if (!bestCheck.ok) {
      let clipboardText = '';
      try {
        await keyboard.combination('Meta', 'a');
        await shared.wait(80);
        await keyboard.combination('Meta', 'c');
        await shared.wait(120);
        clipboardText = await clipboard.paste();
      } catch (clipboardError) {
        clipboardText = '';
      }
      const compactClipboard = shared.compactText(clipboardText);
      if (compactClipboard && compactClipboard.includes(shared.compactText(shared.runtimeConfig.targetChatName))) {
        bestCheck = {
          ok: true,
          matchType: 'clipboard_contains',
          expectedText: shared.runtimeConfig.targetChatName,
          normalizedExpectedText: shared.normalizeText(shared.runtimeConfig.targetChatName),
          text: shared.normalizeText(clipboardText),
          compactText: compactClipboard,
          lineCount: 1,
          capturePath: bestCheck.capturePath || primaryShot.path,
          passLabel: 'clipboard',
          tokenChecks: [],
        };
      }
    }
    context.searchInputMode = inputMode;
    context.searchQueryMeta = {
      query: shared.runtimeConfig.targetChatName,
      normalizedQuery: shared.compactText(shared.runtimeConfig.targetChatName),
      searchedByExactTargetName: true,
    };
    context.searchQueryVisibleCheck = bestCheck;
    if (!context.searchQueryVisibleCheck.ok) {
      throw new Error(
        `搜索框未显示目标查询词 ${shared.runtimeConfig.targetChatName}，中止搜索链路。OCR: ${bestCheck.text}`
      );
    }
    const result = { inputMode, query: shared.runtimeConfig.targetChatName };
    await shared.logStepEvidence(context, 'type_search_query', true, {
      inputMode,
      queryPreview: String(shared.runtimeConfig.targetChatName || '').slice(0, 80),
      point: context.searchPoint || null,
      box: context.searchResolved?.box || null,
      queryVisible: context.searchQueryVisibleCheck.ok,
      queryVisibleMatchType: context.searchQueryVisibleCheck.matchType,
      queryVisibleOCR: String(context.searchQueryVisibleCheck.text || '').slice(0, 120),
      queryVisibleCapturePath: context.searchQueryVisibleCheck.capturePath,
      queryVisibleTokenChecks: context.searchQueryVisibleCheck.tokenChecks || [],
      queryVisiblePassLabel: context.searchQueryVisibleCheck.passLabel || 'primary',
    });
    return result;
  } catch (err) {
    await shared.logStepEvidence(context, 'type_search_query', false, {
      inputMode: context.searchInputMode || null,
      queryPreview: String(shared.runtimeConfig.targetChatName || '').slice(0, 80),
      point: context.searchPoint || null,
      box: context.searchResolved?.box || null,
      queryVisible: Boolean(context.searchQueryVisibleCheck?.ok),
      queryVisibleMatchType: context.searchQueryVisibleCheck?.matchType || null,
      queryVisibleOCR: String(context.searchQueryVisibleCheck?.text || '').slice(0, 120),
      queryVisibleCapturePath: context.searchQueryVisibleCheck?.capturePath || null,
      queryVisibleTokenChecks: context.searchQueryVisibleCheck?.tokenChecks || [],
      queryVisiblePassLabel: context.searchQueryVisibleCheck?.passLabel || null,
      error: err && err.message ? err.message : String(err),
    });
    throw err;
  }
};

shared.buildRankedCandidatesPreview = function buildRankedCandidatesPreview(ranked, limit = 3) {
  return (ranked || []).slice(0, limit).map((item) => ({
    textPreview: String(item?.row?.text || '').slice(0, 120),
    score: Number(item?.score || 0),
    bbox: item?.row?.bbox || null,
  }));
};

shared.clear_search_query = async function clear_search_query(context) {
  if (!context.searchResolved?.box) return { skipped: true };
  await shared.refreshWechatForeground(context.win, 'clear_search_query');
  await mouse.click(
    context.win.x + context.searchResolved.box.x + Math.round(context.searchResolved.box.width * 0.45),
    context.win.y + context.searchResolved.box.y + Math.round(context.searchResolved.box.height * 0.55)
  );
  await shared.wait(120);
  await keyboard.combination('Meta', 'a');
  await shared.wait(60);
  await keyboard.press('Backspace');
  await shared.wait(120);
  try {
    await keyboard.press('Escape');
  } catch (err) {
    console.warn(`clear_search_query escape failed: ${err && err.message ? err.message : String(err)}`);
  }
  return { cleared: true };
};

shared.locate_conversation_list = async function locate_conversation_list(context) {
  const resolved = await shared.resolveRegionBoxWithTemplate(
    context.win,
    context.report,
    context.artifactBundle,
    'conversation_capture',
    'conversation_list',
    'conversation_list'
  );
  if (!resolved?.box) {
    throw new Error('conversation_list 不可用，无法继续 open_chat');
  }
  context.conversationResolved = resolved;
  return resolved;
};

shared.matchTargetTextScore = function matchTargetTextScore(text, targetChatName) {
  const target = shared.compactText(targetChatName);
  const normalized = shared.compactText(text);
  if (!target || !normalized) return 0;
  if (normalized.includes(target)) return 1;

  let matched = 0;
  let cursor = 0;
  for (const ch of target) {
    const idx = normalized.indexOf(ch, cursor);
    if (idx >= 0) {
      matched += 1;
      cursor = idx + 1;
    }
  }
  return matched / target.length;
};

shared.mergeBBox = function mergeBBox(items) {
  const valid = (items || []).map((item) => item?.bbox).filter(Boolean);
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((bbox) => Number(bbox.x || 0)));
  const top = Math.min(...valid.map((bbox) => Number(bbox.y || 0)));
  const right = Math.max(...valid.map((bbox) => Number(bbox.x || 0) + Number(bbox.width || 0)));
  const bottom = Math.max(...valid.map((bbox) => Number(bbox.y || 0) + Number(bbox.height || 0)));
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

shared.clusterOCRRows = function clusterOCRRows(lines) {
  const sorted = (lines || [])
    .map((line) => ({
      ...line,
      bbox: shared.normalizeBox(line?.bbox || {}),
      normalizedText: shared.normalizeText(line?.text || ''),
    }))
    .filter((line) => line.normalizedText)
    .sort((a, b) => {
      const ay = Number(a?.bbox?.y || 0);
      const by = Number(b?.bbox?.y || 0);
      if (ay !== by) return ay - by;
      return Number(a?.bbox?.x || 0) - Number(b?.bbox?.x || 0);
    });

  const rows = [];
  for (const line of sorted) {
    const bbox = line.bbox || {};
    const centerY = Number(bbox.y || 0) + Number(bbox.height || 0) / 2;
    const height = Number(bbox.height || 0);
    const width = Number(bbox.width || 0);
    const isFullWidthText = width >= 150;
    const yTolerance = Math.max(10, Math.min(22, height * 0.7));
    let existing = rows.find((row) => Math.abs(centerY - row.centerY) <= yTolerance);
    if (!existing && isFullWidthText) {
      existing = rows.find((row) => Math.abs(Number(bbox.y || 0) - row.bottom) <= 4);
    }
    if (existing) {
      existing.items.push(line);
      existing.centerY = (existing.centerY * (existing.items.length - 1) + centerY) / existing.items.length;
      existing.bottom = Math.max(existing.bottom, Number(bbox.y || 0) + height);
      continue;
    }
    rows.push({ centerY, bottom: Number(bbox.y || 0) + height, items: [line] });
  }

  return rows.map((row, index) => {
    const items = row.items.sort((a, b) => Number(a?.bbox?.x || 0) - Number(b?.bbox?.x || 0));
    const text = items.map((item) => item.normalizedText).filter(Boolean).join(' ');
    const bbox = shared.mergeBBox(items);
    return {
      id: `ocr_row_${index + 1}`,
      text,
      compactText: shared.compactText(text),
      bbox,
      items,
      itemCount: items.length,
      minX: Math.min(...items.map((item) => Number(item?.bbox?.x || 0))),
      maxRight: Math.max(...items.map((item) => Number(item?.bbox?.x || 0) + Number(item?.bbox?.width || 0))),
      avgHeight: items.reduce((sum, item) => sum + Number(item?.bbox?.height || 0), 0) / Math.max(1, items.length),
    };
  });
};

shared.SEARCH_RESULT_SECTION_BREAKERS = [/搜索\s*网\s*络\s*结果/, /^全\s*部\s*\(\d+\)/, /^聊天记录$/, /^联系人$/, /^记录$/];

shared.isSectionBreakerRow = function isSectionBreakerRow(row) {
  const text = String(row?.text || '');
  const compact = shared.compactText(text);
  return shared.SEARCH_RESULT_SECTION_BREAKERS.some((pattern) => pattern.test(text) || pattern.test(compact));
};

shared.classifySearchRow = function classifySearchRow(row, listBox) {
  const text = String(row?.text || '');
  const compact = shared.compactText(text);
  const bbox = row?.bbox || null;
  const width = Number(bbox?.width || 0);
  const height = Number(bbox?.height || 0);
  const minX = Number(row?.minX || bbox?.x || 0);
  const itemCount = Number(row?.itemCount || 0);
  const avgHeight = Number(row?.avgHeight || height || 0);
  const listWidth = Math.max(1, Number(listBox?.width || 0));
  const widthRatio = width / listWidth;
  const flags = {
    sectionBreaker: shared.isSectionBreakerRow(row),
    targetLike: shared.matchTargetTextScore(text, shared.runtimeConfig.targetChatName) >= 0.6,
    fullWidth: widthRatio >= 0.82,
    leftAnchored: minX <= 34,
    hasSearchKeyword: /搜索|网络结果/.test(text),
    hasRecordKeyword: /记录|聊天记录/.test(text),
    hasContactKeyword: /联系人/.test(text),
    hasNetworkNoise: /公众号|小红书|开店|赚钱|客服群|卡密/.test(text),
  };
  let kind = 'candidate';
  if (flags.sectionBreaker) kind = 'section_breaker';
  else if (flags.hasSearchKeyword || flags.hasNetworkNoise) kind = 'network_or_suggestion';
  else if (flags.hasRecordKeyword && !flags.targetLike) kind = 'history_section';
  else if (flags.hasContactKeyword && !flags.targetLike) kind = 'contact_section';
  else if (itemCount >= 4 && flags.fullWidth) kind = 'oversized_cluster';
  else if (height >= 58 || avgHeight >= 28 && itemCount >= 3 && flags.fullWidth) kind = 'oversized_cluster';
  else if (!flags.leftAnchored && !flags.targetLike) kind = 'noise';
  return {
    kind,
    flags,
    metrics: { width, height, widthRatio, minX, itemCount, avgHeight },
  };
};

shared.scan_conversation_list = async function scan_conversation_list(context, label = 'conversation_scan') {
  const resolved = context.conversationResolved || (await shared.locate_conversation_list(context));
  const shot = await shared.captureWindowRegion(context.win, resolved.box, label);
  const ocr = await Vision.detectUI({
    visionProfile: shared.runtimeConfig.visionProfile,
    image: shot.image,
    matchMode: 'contains',
    defaultRole: 'text',
  });
  let rows = shared.clusterOCRRows(Array.isArray(ocr?.elements) ? ocr.elements : []);
  if ((!rows || rows.length === 0) && shared.normalizeText(ocr?.text || '')) {
    const textRows = String(ocr.text)
      .split(/\r?\n+/)
      .map((line) => shared.normalizeText(line))
      .filter(Boolean)
      .map((text, index) => ({
        id: `ocr_text_row_${index + 1}`,
        text,
        compactText: shared.compactText(text),
        bbox: null,
        items: [],
      }));
    rows = textRows;
  }
  context.conversationScan = {
    shot,
    text: shared.normalizeText(ocr?.text || ''),
    lineCount: Number(ocr?.lineCount || 0),
    rows,
  };
  return context.conversationScan;
};

shared.locate_search_result_row = async function locate_search_result_row(context) {
  const scan = await shared.scan_conversation_list(context, 'conversation_search_results');
  const classifiedRows = (scan.rows || []).map((row, index) => ({
    row,
    index,
    classification: shared.classifySearchRow(row, context.conversationResolved?.box || { width: 0 }),
    score: shared.matchTargetTextScore(row.text, shared.runtimeConfig.targetChatName),
    compactText: shared.compactText(row.text || ''),
  }));
  const ranked = classifiedRows
    .filter((item) => item.score >= 0.6)
    .filter((item) => item.classification.kind === 'candidate')
    .sort((a, b) => {
      const scoreGap = b.score - a.score;
      if (Math.abs(scoreGap) > 0.001) return scoreGap;
      const aWidth = Number(a.row?.bbox?.width || 0);
      const bWidth = Number(b.row?.bbox?.width || 0);
      if (aWidth !== bWidth) return aWidth - bWidth;
      return Number(a.row?.bbox?.y || 0) - Number(b.row?.bbox?.y || 0);
    });
  const rankedCandidatesPreview = ranked.slice(0, 5).map((item) => ({
    textPreview: String(item?.row?.text || '').slice(0, 120),
    score: Number(item?.score || 0),
    bbox: item?.row?.bbox || null,
    classification: item?.classification || null,
  }));
  const rejectedPreview = classifiedRows
    .filter((item) => item.score >= 0.45 && item.classification.kind !== 'candidate')
    .slice(0, 8)
    .map((item) => ({
      textPreview: String(item?.row?.text || '').slice(0, 120),
      score: Number(item?.score || 0),
      bbox: item?.row?.bbox || null,
      rejectedAs: item?.classification?.kind || 'unknown',
      metrics: item?.classification?.metrics || null,
    }));

  if (ranked.length === 0) {
    const failureReason = rejectedPreview.length > 0
      ? `搜索结果已识别到目标相关文本，但均被判定为非可信会话行，已阻止 open_chat: ${shared.runtimeConfig.targetChatName}`
      : `搜索结果中未定位到可信目标会话行，已阻止 open_chat: ${shared.runtimeConfig.targetChatName}`;
    await shared.logStepEvidence(context, 'locate_search_result_row', false, {
      point: null,
      box: context.conversationResolved?.box || null,
      selectionSource: 'search-result-no-trusted-chat-row',
      selectedRowScore: ranked[0]?.score ?? 0,
      fallbackUsed: false,
      fallbackReason: 'only trusted chat row bbox can be clicked',
      rankedCandidatesPreview,
      rejectedCandidatesPreview: rejectedPreview,
      ocrTextPreview: String(scan.text || '').slice(0, 240),
      ocrRowCount: Array.isArray(scan.rows) ? scan.rows.length : 0,
      error: failureReason,
    });
    throw new Error(failureReason);
  }

  const best = ranked[0];
  const bbox = best.row.bbox;
  const point = {
    x: Number(bbox.x || 0) + Math.round(Math.max(28, Math.min(92, Number(bbox.width || 0) * 0.28))),
    y: Number(bbox.y || 0) + Math.round(Number(bbox.height || 0) / 2),
  };
  const absolutePoint = {
    x: context.conversationResolved.box.x + point.x,
    y: context.conversationResolved.box.y + point.y,
  };

  context.searchResultRow = {
    row: best.row,
    selectionSource: 'trusted-search-result-row',
    score: best.score,
    point: absolutePoint,
    fallback: false,
    reason: `selected trusted search row for ${shared.runtimeConfig.targetChatName}`,
    rankedCandidatesPreview,
    rejectedCandidatesPreview: rejectedPreview,
    targetTrust: 'trusted_bbox',
    trustLevel: 'high',
    clickExecuted: false,
    clickTargetTrusted: true,
  };
  await shared.logStepEvidence(context, 'locate_search_result_row', true, {
    point: absolutePoint,
    box: best.row.bbox,
    selectionSource: context.searchResultRow.selectionSource,
    selectedRowScore: best.score,
    fallbackUsed: false,
    selectionReason: context.searchResultRow.reason,
    rankedCandidatesPreview,
    rejectedCandidatesPreview: rejectedPreview,
    rowTextPreview: String(best.row?.text || '').slice(0, 120),
    ocrTextPreview: String(scan.text || '').slice(0, 200),
    ocrRowCount: Array.isArray(scan.rows) ? scan.rows.length : 0,
    targetTrust: context.searchResultRow.targetTrust,
    trustLevel: context.searchResultRow.trustLevel,
  });
  return context.searchResultRow;
};
