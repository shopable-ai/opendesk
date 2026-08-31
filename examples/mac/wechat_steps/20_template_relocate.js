shared.findCapture = function findCapture(bundle, captureId, zoneId) {
  const captures = bundle?.captureContract?.captures || [];
  return captures.find((item) => item.id === captureId || item.zoneId === zoneId) || null;
};

shared.findProbeStep = function findProbeStep(bundle, action) {
  return (bundle?.probePlan?.steps || []).find((item) => item.action === action) || null;
};

shared.captureSoftMinScore = function captureSoftMinScore(capture, configuredMinScore) {
  const zoneId = String(capture?.zoneId || '');
  if (zoneId === 'conversation_list') return Math.min(configuredMinScore, 0.7);
  if (zoneId === 'message_list') return Math.min(configuredMinScore, 0.68);
  return configuredMinScore;
};

shared.resolveRegionBox = function resolveRegionBox(report, bundle, captureId, zoneId, fallbackRegionId) {
  const capture = shared.findCapture(bundle, captureId, zoneId);
  if (capture?.bbox) return capture.bbox;
  return shared.findRegion(report, fallbackRegionId || zoneId)?.bbox || null;
};

shared.freshLocateCapture = async function freshLocateCapture(win, capture, label) {
  if (!capture?.referenceImagePath || !capture?.searchWindow) {
    return null;
  }
  const searchWindow = shared.normalizeBox(capture.searchWindow);
  const searchShot = await shared.captureWindowRegion(win, searchWindow, `${label}_search_window`);
  const minScore = Number(capture?.templateMatch?.minScore || 0.72);
  const softMinScore = shared.captureSoftMinScore(capture, minScore);
  let match = null;
  try {
    match = await ImageColor.findPos(searchShot.image, capture.referenceImagePath, 0);
  } catch (err) {
    return {
      ok: false,
      reason: `template match error: ${err && err.message ? err.message : String(err)}`,
      searchWindow,
      templatePath: capture.referenceImagePath,
    };
  }
  if (!match?.found) {
    return {
      ok: false,
      reason: 'template not found',
      searchWindow,
      templatePath: capture.referenceImagePath,
      confidence: Number(match?.confidence || 0),
      minScore,
      softMinScore,
    };
  }
  const matchedBox = {
    x: searchWindow.x + shared.round(match.x),
    y: searchWindow.y + shared.round(match.y),
    width: shared.round(match.width || capture?.bbox?.width),
    height: shared.round(match.height || capture?.bbox?.height),
  };
  if (!shared.boxWithin(searchWindow, matchedBox)) {
    return {
      ok: false,
      reason: 'template match escaped search window',
      searchWindow,
      matchedBox,
      templatePath: capture.referenceImagePath,
      confidence: Number(match?.confidence || 0),
    };
  }
  const confidence = Number(match?.confidence || 0);
  if (confidence < softMinScore) {
    return {
      ok: false,
      reason: 'template score below soft threshold',
      searchWindow,
      matchedBox,
      templatePath: capture.referenceImagePath,
      confidence,
      minScore,
      softMinScore,
    };
  }
  return {
    ok: true,
    captureId: capture.id,
    zoneId: capture.zoneId,
    matchedBox,
    confidence,
    templatePath: capture.referenceImagePath,
    searchWindow,
    quality: confidence >= minScore ? 'strict' : 'soft',
  };
};

shared.freshLocateConversationCandidate = async function freshLocateConversationCandidate(
  win,
  conversationBox,
  referenceConversationBox,
  candidate,
  label
) {
  if (!candidate?.path || !candidate?.bbox || !conversationBox || !referenceConversationBox) {
    return null;
  }
  const expectedBox = shared.translateBoxFromReference(referenceConversationBox, conversationBox, candidate.bbox);
  const searchBox = shared.expandBox(
    expectedBox,
    Math.max(16, Math.round(expectedBox.width * 0.25)),
    Math.max(16, Math.round(expectedBox.height * 0.35)),
    conversationBox
  );
  const searchShot = await shared.captureWindowRegion(win, searchBox, `${label}_candidate_search`);
  let match = null;
  try {
    match = await ImageColor.findPos(searchShot.image, candidate.path, 0.72);
  } catch (err) {
    return {
      ok: false,
      reason: `candidate template match error: ${err && err.message ? err.message : String(err)}`,
      candidateId: candidate.id,
      searchBox,
      candidatePath: candidate.path,
    };
  }
  if (!match?.found) {
    return {
      ok: false,
      reason: 'candidate template not found',
      candidateId: candidate.id,
      confidence: Number(match?.confidence || 0),
      searchBox,
      candidatePath: candidate.path,
    };
  }
  const matchedBox = {
    x: searchBox.x + shared.round(match.x),
    y: searchBox.y + shared.round(match.y),
    width: shared.round(match.width || expectedBox.width),
    height: shared.round(match.height || expectedBox.height),
  };
  if (!shared.boxWithin(searchBox, matchedBox)) {
    return {
      ok: false,
      reason: 'candidate template match escaped search box',
      candidateId: candidate.id,
      confidence: Number(match?.confidence || 0),
      searchBox,
      matchedBox,
      candidatePath: candidate.path,
    };
  }
  return {
    ok: true,
    candidateId: candidate.id,
    matchedBox,
    point: {
      x: matchedBox.x + Math.round(matchedBox.width * 0.3),
      y: matchedBox.y + Math.round(matchedBox.height / 2),
    },
    confidence: Number(match?.confidence || 0),
    searchBox,
    expectedBox,
    candidatePath: candidate.path,
  };
};

shared.resolveRegionBoxWithTemplate = async function resolveRegionBoxWithTemplate(win, report, bundle, captureId, zoneId, fallbackRegionId) {
  const capture = shared.findCapture(bundle, captureId, zoneId);
  const fallbackBox = shared.resolveRegionBox(report, bundle, captureId, zoneId, fallbackRegionId);
  if (!capture?.referenceImagePath) {
    return { box: fallbackBox, templateMatch: null, source: 'artifact-bbox' };
  }
  const located = await shared.freshLocateCapture(win, capture, captureId || zoneId || 'capture');
  const forceFallbackForHeader =
    zoneId === 'chat_header' &&
    (!located?.ok || !located?.matchedBox || Number(located?.confidence || 0) < 0.6);
  if (located?.ok && located?.matchedBox && !forceFallbackForHeader) {
    return { box: located.matchedBox, templateMatch: located, source: 'template-match' };
  }
  const fallbackSource = forceFallbackForHeader ? 'artifact-bbox-header-guard' : 'artifact-bbox-fallback';
  return { box: fallbackBox, templateMatch: located || null, source: fallbackSource };
};
