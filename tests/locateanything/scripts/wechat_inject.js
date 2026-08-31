shared.LOCATEANYTHING_SURFACE_PROMPTS = {
  search_area: {
    task: 'gui_box',
    phrase: 'the search box',
    profile: 'auto'
  },
  conversation_list: {
    task: 'gui_box',
    phrase: 'the conversation list',
    profile: 'auto'
  },
  chat_header: {
    task: 'text',
    phrase: 'the current chat title area',
    profile: 'quality'
  },
  input_area: {
    task: 'gui_box',
    phrase: 'the message input box',
    profile: 'auto'
  },
  send_action_zone: {
    task: 'gui_box',
    phrase: 'the send button and send action zone',
    profile: 'auto'
  }
};

shared.initLocateAnythingState = function initLocateAnythingState() {
  const lane = String(shared.runtimeConfig.workflowLane || 'BASELINE');
  const lanePolicy = shared.LANE_POLICIES[lane] || shared.LANE_POLICIES.BASELINE;
  shared.locateAnythingState = {
    lane,
    lanePolicy,
    trace: [],
    surfacesVisited: [],
    surfacesModeled: [],
    calls: 0
  };
  return shared.locateAnythingState;
};

shared.markSurfaceVisited = function markSurfaceVisited(surface) {
  if (!shared.locateAnythingState) {
    shared.initLocateAnythingState();
  }
  shared.locateAnythingState.surfacesVisited.push(surface);
};

shared.markSurfaceModeled = function markSurfaceModeled(surface) {
  if (!shared.locateAnythingState) {
    shared.initLocateAnythingState();
  }
  shared.locateAnythingState.surfacesModeled.push(surface);
};

shared.captureWholeWechatWindow = async function captureWholeWechatWindow(win, label) {
  await shared.refreshWechatForeground(win, `locateanything:${label}`);
  const path = `.runtime/temp/mac/${label}_${Date.now()}.png`;
  const clip = {
    x: 0,
    y: 0,
    width: shared.round(win.width),
    height: shared.round(win.height)
  };
  const image = await page.screenshot({ path, target: 'activeWindow', clip });
  return {
    path,
    image,
    offset: { x: 0, y: 0 },
    width: clip.width,
    height: clip.height
  };
};

shared.captureLocateAnythingRegion = async function captureLocateAnythingRegion(win, box, label) {
  if (!box) {
    return shared.captureWholeWechatWindow(win, label);
  }
  const shot = await shared.captureWindowRegion(win, box, label);
  return {
    path: shot.path,
    image: shot.image,
    offset: {
      x: Number(box.x || 0),
      y: Number(box.y || 0)
    },
    width: Number(box.width || 0),
    height: Number(box.height || 0)
  };
};

shared.shouldUseLocateAnythingForSurface = function shouldUseLocateAnythingForSurface(surface, baseResolved, context) {
  if (!shared.locateAnythingState) {
    shared.initLocateAnythingState();
  }
  const state = shared.locateAnythingState;
  const policy = state.lanePolicy || shared.LANE_POLICIES.BASELINE;
  if (policy.maxModelSteps <= 0) return false;
  if (state.calls >= policy.maxModelSteps) return false;
  if ((policy.forceSurfaces || []).includes(surface)) return true;
  if (!policy.fallbackOnly) return false;
  if (!baseResolved) return true;
  if (!baseResolved.box && !baseResolved.point) return true;
  if (surface === 'search_result_row' && !context?.searchResultRow?.clickTargetTrusted) return true;
  if (baseResolved.templateMatch && Number(baseResolved.templateMatch.confidence || 0) < 0.68) return true;
  if (baseResolved.source && String(baseResolved.source).includes('fallback')) return true;
  return false;
};

shared.makeLocateAnythingPayload = function makeLocateAnythingPayload(surface, context) {
  if (surface === 'search_result_row') {
    return {
      task: 'gui_point',
      phrase: shared.runtimeConfig.targetChatName
        ? `the search result row for ${shared.runtimeConfig.targetChatName}`
        : 'the first search result row',
      profile: 'quality'
    };
  }
  const preset = shared.LOCATEANYTHING_SURFACE_PROMPTS[surface];
  if (!preset) {
    throw new Error(`unsupported LocateAnything surface: ${surface}`);
  }
  return preset;
};

shared.recordLocateAnythingAttempt = function recordLocateAnythingAttempt(surface, capture, payload, response, accepted, extra) {
  if (!shared.locateAnythingState) {
    shared.initLocateAnythingState();
  }
  shared.locateAnythingState.calls += 1;
  const entry = {
    timestamp: new Date().toISOString(),
    surface,
    payload,
    capturePath: capture.path,
    accepted,
    profileUsed: response?.profile_used || '',
    attempts: (response?.attempts || []).map((item) => item.profile),
    pointCount: Number((response?.points || []).length),
    boxCount: Number((response?.boxes || []).length),
    extra: extra || {}
  };
  shared.locateAnythingState.trace.push(entry);
  if (accepted) {
    shared.markSurfaceModeled(surface);
  }
  return entry;
};

shared.callLocateAnythingForSurface = async function callLocateAnythingForSurface(win, surface, context, captureBox) {
  const payload = shared.makeLocateAnythingPayload(surface, context);
  const capture = await shared.captureLocateAnythingRegion(win, captureBox || null, `locateanything_${surface}`);
  const imagePayload = await shared.buildBridgeImagePayload(capture.path);
  const response = await axios.post(`${shared.runtimeConfig.serviceUrl}/v1/ground`, {
    ...imagePayload,
    task: payload.task,
    phrase: payload.phrase,
    profile: payload.profile || 'auto'
  }, {
    timeout: Number(shared.runtimeConfig.requestTimeoutMs || 20000)
  });
  const data = response.data;
  const point = (data.points || [])[0]
    ? {
        x: Number((data.points || [])[0].x || 0) + capture.offset.x,
        y: Number((data.points || [])[0].y || 0) + capture.offset.y
      }
    : null;
  const box = (data.boxes || [])[0]
    ? {
        x: Number((data.boxes || [])[0].x || 0) + capture.offset.x,
        y: Number((data.boxes || [])[0].y || 0) + capture.offset.y,
        width: Number((data.boxes || [])[0].width || 0),
        height: Number((data.boxes || [])[0].height || 0)
      }
    : null;
  const accepted = Boolean(point || box);
  shared.recordLocateAnythingAttempt(surface, capture, payload, data, accepted, {
    captureOffset: capture.offset
  });
  return {
    ok: accepted,
    response: data,
    point,
    box,
    payload,
    capture
  };
};

shared.installLocateAnythingOverrides = function installLocateAnythingOverrides() {
  shared.initLocateAnythingState();
  const originalResolveRegionBoxWithTemplate = shared.resolveRegionBoxWithTemplate;
  const originalLocateSearchResultRow = shared.locate_search_result_row;

  shared.resolveRegionBoxWithTemplate = async function resolveRegionBoxWithTemplateWithLocateAnything(win, report, bundle, captureId, zoneId, fallbackRegionId) {
    const baseResolved = await originalResolveRegionBoxWithTemplate(win, report, bundle, captureId, zoneId, fallbackRegionId);
    shared.markSurfaceVisited(zoneId);
    if (!shared.shouldUseLocateAnythingForSurface(zoneId, baseResolved, null)) {
      return baseResolved;
    }
    try {
      const located = await shared.callLocateAnythingForSurface(win, zoneId, null, null);
      if (located.ok && located.box) {
        return {
          box: located.box,
          templateMatch: located,
          source: 'locateanything'
        };
      }
    } catch (error) {
      shared.recordLocateAnythingAttempt(zoneId, { path: '', offset: { x: 0, y: 0 } }, { task: 'error', phrase: String(error) }, null, false, {
        error: error && error.message ? error.message : String(error)
      });
    }
    return baseResolved;
  };

  shared.locate_search_result_row = async function locateSearchResultRowWithLocateAnything(context) {
    shared.markSurfaceVisited('search_result_row');
    let baseResult = null;
    let baseError = null;
    try {
      baseResult = await originalLocateSearchResultRow(context);
    } catch (error) {
      baseError = error;
    }
    const shouldUse = shared.shouldUseLocateAnythingForSurface(
      'search_result_row',
      {
        point: baseResult?.point || context?.searchResultRow?.point || null,
        source: context?.searchResultRow?.selectionSource || 'search-result-row',
        trusted: Boolean(context?.searchResultRow?.clickTargetTrusted)
      },
      context
    );
    if (!shouldUse) {
      if (baseError) throw baseError;
      return baseResult;
    }
    try {
      const captureBox = context?.conversationResolved?.box || null;
      const located = await shared.callLocateAnythingForSurface(context.win, 'search_result_row', context, captureBox);
      if (located.ok && located.point) {
        context.searchResultRow = {
          row: {
            text: shared.runtimeConfig.targetChatName || '',
            bbox: located.box || null
          },
          selectionSource: 'locateanything-search-result-row',
          score: 1,
          point: located.point,
          fallback: true,
          reason: `LocateAnything selected search result row for ${shared.runtimeConfig.targetChatName || 'target chat'}`,
          rankedCandidatesPreview: [],
          rejectedCandidatesPreview: [],
          targetTrust: 'locateanything',
          trustLevel: 'medium',
          clickExecuted: false,
          clickTargetTrusted: true,
          locateAnything: located
        };
        await shared.logStepEvidence(context, 'locate_search_result_row', true, {
          point: located.point,
          box: located.box || null,
          selectionSource: context.searchResultRow.selectionSource,
          locateAnything: true,
          profileUsed: located.response?.profile_used || '',
          attemptProfiles: (located.response?.attempts || []).map((item) => item.profile)
        });
        return context.searchResultRow;
      }
    } catch (error) {
      await shared.logStepEvidence(context, 'locate_search_result_row', false, {
        point: null,
        box: null,
        selectionSource: 'locateanything-search-result-row',
        locateAnything: true,
        error: error && error.message ? error.message : String(error)
      });
    }
    if (baseError) throw baseError;
    return baseResult;
  };
};

shared.buildLocateAnythingSummary = function buildLocateAnythingSummary() {
  const state = shared.locateAnythingState || shared.initLocateAnythingState();
  const uniqueVisited = Array.from(new Set(state.surfacesVisited));
  const uniqueModeled = Array.from(new Set(state.surfacesModeled));
  return {
    lane: state.lane,
    maxModelSteps: state.lanePolicy?.maxModelSteps || 0,
    totalResolutionSteps: uniqueVisited.length,
    modeledResolutionSteps: uniqueModeled.length,
    modeledResolutionRatio: uniqueVisited.length > 0 ? Number((uniqueModeled.length / uniqueVisited.length).toFixed(3)) : 0,
    trace: state.trace,
    surfacesVisited: uniqueVisited,
    surfacesModeled: uniqueModeled
  };
};

shared.writeStage03ScenarioResult = async function writeStage03ScenarioResult(caseDef, reportPath, success, failureMessage) {
  const stageRoot = String(shared.runtimeConfig.locateAnythingStageRoot || '');
  const outPath = String(shared.runtimeConfig.locateAnythingScenarioResultPath || reportPath || `${stageRoot}/report.json`);
  const report = reportPath && File.exists(reportPath) ? shared.parseJson(File.read(reportPath), reportPath) : {};
  report.stageCase = caseDef;
  report.locateAnything = shared.buildLocateAnythingSummary();
  report.scenarioStatus = {
    ok: success,
    failureMessage: failureMessage || ''
  };
  await File.write(outPath, JSON.stringify(report, null, 2));
  return outPath;
};

shared.locateAnythingScenarioMain = async function locateAnythingScenarioMain(caseDef) {
  shared.installLocateAnythingOverrides();
  let reportPath = '';
  try {
    reportPath = await shared.main();
    const finalPath = await shared.writeStage03ScenarioResult(caseDef, reportPath, true, '');
    console.log(JSON.stringify({
      ok: true,
      caseId: caseDef.id,
      lane: caseDef.lane,
      reportPath: finalPath,
      locateAnything: shared.buildLocateAnythingSummary()
    }, null, 2));
    return finalPath;
  } catch (error) {
    const finalPath = await shared.writeStage03ScenarioResult(caseDef, reportPath, false, error && error.message ? error.message : String(error));
    console.log(JSON.stringify({
      ok: false,
      caseId: caseDef.id,
      lane: caseDef.lane,
      reportPath: finalPath,
      failure: error && error.message ? error.message : String(error),
      locateAnything: shared.buildLocateAnythingSummary()
    }, null, 2));
    return finalPath;
  }
};
