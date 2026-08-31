shared.CONFIG_PATHS = [
  'tests/locateanything/config/default.config.json',
  'tests/locateanything/config/local.override.json',
  '.runtime/temp/locateanything.config.json'
];

shared.LANE_POLICIES = {
  BASELINE: {
    lane: 'BASELINE',
    maxModelSteps: 0,
    forceSurfaces: [],
    fallbackOnly: false
  },
  L10: {
    lane: 'L10',
    maxModelSteps: 1,
    forceSurfaces: [],
    fallbackOnly: true
  },
  L30: {
    lane: 'L30',
    maxModelSteps: 2,
    forceSurfaces: ['search_area', 'input_area', 'send_action_zone'],
    fallbackOnly: false
  },
  L50: {
    lane: 'L50',
    maxModelSteps: 3,
    forceSurfaces: ['search_area', 'conversation_list', 'search_result_row', 'input_area'],
    fallbackOnly: false
  },
  L70: {
    lane: 'L70',
    maxModelSteps: 5,
    forceSurfaces: ['search_area', 'conversation_list', 'search_result_row', 'chat_header', 'input_area', 'send_action_zone'],
    fallbackOnly: false
  },
  L90: {
    lane: 'L90',
    maxModelSteps: 7,
    forceSurfaces: ['search_area', 'conversation_list', 'search_result_row', 'chat_header', 'input_area', 'send_action_zone'],
    fallbackOnly: false,
    allowVerifyRetry: true
  }
};

shared.parseJson = function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`failed to parse ${label}: ${error && error.message ? error.message : String(error)}`);
  }
};

shared.mergeDeep = function mergeDeep(base, override) {
  const next = Array.isArray(base) ? base.slice() : { ...base };
  Object.keys(override || {}).forEach((key) => {
    const baseValue = next[key];
    const overrideValue = override[key];
    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === 'object' &&
      typeof overrideValue === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      next[key] = shared.mergeDeep(baseValue, overrideValue);
      return;
    }
    next[key] = overrideValue;
  });
  return next;
};

shared.loadLocateAnythingConfig = function loadLocateAnythingConfig() {
  let config = {};
  for (const path of shared.CONFIG_PATHS) {
    if (!File.exists(path)) continue;
    const raw = File.read(path);
    if (!raw) continue;
    config = shared.mergeDeep(config, shared.parseJson(raw, path));
  }
  if (!config.serviceUrl) {
    throw new Error('LocateAnything config missing serviceUrl');
  }
  config.serviceUrl = String(config.serviceUrl).replace(/\/+$/, '');
  config.remoteModelServiceUrl = String(config.remoteModelServiceUrl || 'http://teaderMac.local:18777').replace(/\/+$/, '');
  config.localMockServiceUrl = String(config.localMockServiceUrl || 'http://127.0.0.1:18777').replace(/\/+$/, '');
  config.workflowLane = String(config.workflowLane || 'L10');
  config.requestTimeoutMs = Number(config.requestTimeoutMs || 20000);
  config.enableSend = Boolean(config.enableSend);
  config.sendGuardMode = String(config.sendGuardMode || 'strict');
  return config;
};

shared.basename = function basename(path) {
  return String(path || '').split(/[\\/]/).pop() || 'image.png';
};

shared.buildBridgeImagePayload = async function buildBridgeImagePayload(imagePath) {
  if (!imagePath) {
    throw new Error('imagePath is required to build bridge payload');
  }
  const imageBase64 = await ImageColor.loadBase64(imagePath);
  return {
    imagePath,
    imageBase64,
    imageName: shared.basename(imagePath)
  };
};

shared.describeBridgeHealth = function describeBridgeHealth(health) {
  const backend = String(health?.data?.backend || '');
  const acceptsBase64 = Boolean(health?.data?.transport?.accepts?.imageBase64);
  return {
    backend,
    acceptsBase64,
    label: backend ? `${backend}${acceptsBase64 ? ' + inline-image' : ''}` : 'unknown'
  };
};

shared.loadManifest = function loadManifest(path) {
  const raw = File.read(path);
  if (!raw) {
    throw new Error(`missing manifest: ${path}`);
  }
  const manifest = shared.parseJson(raw, path);
  if (!Array.isArray(manifest)) {
    throw new Error(`manifest must be an array: ${path}`);
  }
  return manifest;
};

shared.ensureDir = async function ensureDir(path) {
  await File.ensureDir(path);
  return path;
};

shared.slugify = function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'case';
};

shared.round = function round(value) {
  return Math.round(Number(value || 0));
};

shared.clamp = function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
};

shared.normalizePoint = function normalizePoint(point, image) {
  return {
    x: Number(point?.x || 0),
    y: Number(point?.y || 0),
    normalized: point?.normalized || {
      x: image.width > 0 ? Number(point?.x || 0) / image.width : 0,
      y: image.height > 0 ? Number(point?.y || 0) / image.height : 0
    }
  };
};

shared.normalizeBox = function normalizeBox(box, image) {
  const normalized = box?.normalized || {
    x1: image.width > 0 ? Number(box?.x || 0) / image.width : 0,
    y1: image.height > 0 ? Number(box?.y || 0) / image.height : 0,
    x2: image.width > 0 ? (Number(box?.x || 0) + Number(box?.width || 0)) / image.width : 0,
    y2: image.height > 0 ? (Number(box?.y || 0) + Number(box?.height || 0)) / image.height : 0
  };
  return {
    x: Number(box?.x || 0),
    y: Number(box?.y || 0),
    width: Number(box?.width || 0),
    height: Number(box?.height || 0),
    normalized
  };
};

shared.pointDistanceNormalized = function pointDistanceNormalized(point, expected) {
  const dx = Number(point?.normalized?.x || 0) - Number(expected?.x || 0);
  const dy = Number(point?.normalized?.y || 0) - Number(expected?.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
};

shared.boxCenterDistanceNormalized = function boxCenterDistanceNormalized(box, expectedBox) {
  const center = {
    x: (Number(box?.normalized?.x1 || 0) + Number(box?.normalized?.x2 || 0)) / 2,
    y: (Number(box?.normalized?.y1 || 0) + Number(box?.normalized?.y2 || 0)) / 2
  };
  const expectedCenter = {
    x: (Number(expectedBox?.x1 || 0) + Number(expectedBox?.x2 || 0)) / 2,
    y: (Number(expectedBox?.y1 || 0) + Number(expectedBox?.y2 || 0)) / 2
  };
  const dx = center.x - expectedCenter.x;
  const dy = center.y - expectedCenter.y;
  return Math.sqrt(dx * dx + dy * dy);
};

shared.getImageSize = function getImageSize(imagePath) {
  const size = ImageColor.getSize(imagePath);
  return {
    width: Array.isArray(size) ? Number(size[0] || 0) : 0,
    height: Array.isArray(size) ? Number(size[1] || 0) : 0
  };
};

shared.makeRegionFromBox = function makeRegionFromBox(box, id, label, confidence) {
  return {
    id,
    role: 'grounded-box',
    label,
    confidence,
    bbox: {
      x: shared.round(box.x),
      y: shared.round(box.y),
      width: Math.max(1, shared.round(box.width)),
      height: Math.max(1, shared.round(box.height))
    }
  };
};

shared.makeRegionFromPoint = function makeRegionFromPoint(point, image, id, label, confidence) {
  const radius = 18;
  const x = shared.clamp(shared.round(point.x - radius), 0, Math.max(0, image.width - 1));
  const y = shared.clamp(shared.round(point.y - radius), 0, Math.max(0, image.height - 1));
  const width = Math.max(1, Math.min(radius * 2, image.width - x));
  const height = Math.max(1, Math.min(radius * 2, image.height - y));
  return {
    id,
    role: 'grounded-point',
    label,
    confidence,
    bbox: { x, y, width, height }
  };
};

shared.evaluateExpectedTarget = function evaluateExpectedTarget(caseDef, response) {
  const expectedKind = String(caseDef.expectedKind || '');
  const expectedTarget = caseDef.expectedTarget || {};
  const image = response.image || { width: 0, height: 0 };
  const boxes = (response.boxes || []).map((box) => shared.normalizeBox(box, image));
  const points = (response.points || []).map((point) => shared.normalizePoint(point, image));
  const reasons = [];
  let ok = true;

  if (expectedKind === 'point') {
    if (points.length < 1) {
      ok = false;
      reasons.push('expected at least one point');
    } else if (expectedTarget.referenceNormalizedPoint) {
      const distance = shared.pointDistanceNormalized(points[0], expectedTarget.referenceNormalizedPoint);
      if (distance > Number(expectedTarget.distanceTolerance || 0.18)) {
        ok = false;
        reasons.push(`point distance ${distance.toFixed(3)} > tolerance ${Number(expectedTarget.distanceTolerance || 0.18).toFixed(3)}`);
      }
    }
  } else if (expectedKind === 'box') {
    if (boxes.length < 1) {
      ok = false;
      reasons.push('expected at least one box');
    } else if (expectedTarget.referenceNormalizedBox) {
      const distance = shared.boxCenterDistanceNormalized(boxes[0], expectedTarget.referenceNormalizedBox);
      if (distance > Number(expectedTarget.centerTolerance || 0.22)) {
        ok = false;
        reasons.push(`box center distance ${distance.toFixed(3)} > tolerance ${Number(expectedTarget.centerTolerance || 0.22).toFixed(3)}`);
      }
    }
  } else if (expectedKind === 'multi_box') {
    if (boxes.length < Number(expectedTarget.minCount || 2)) {
      ok = false;
      reasons.push(`expected at least ${Number(expectedTarget.minCount || 2)} boxes`);
    }
  }

  if (expectedTarget.expectedProfileUsed && String(response.profile_used || '') !== String(expectedTarget.expectedProfileUsed)) {
    ok = false;
    reasons.push(`profile_used=${response.profile_used} != ${expectedTarget.expectedProfileUsed}`);
  }

  return {
    ok,
    reasons
  };
};

shared.annotateBridgeResponse = async function annotateBridgeResponse(caseDef, response, outputPath) {
  const regions = [];
  (response.boxes || []).forEach((box, index) => {
    regions.push(
      shared.makeRegionFromBox(
        box,
        `${caseDef.id}-box-${index + 1}`,
        `${caseDef.phrase} [${response.profile_used}]`,
        0.9
      )
    );
  });
  (response.points || []).forEach((point, index) => {
    regions.push(
      shared.makeRegionFromPoint(
        point,
        response.image,
        `${caseDef.id}-point-${index + 1}`,
        `${caseDef.phrase} [${response.profile_used}]`,
        0.9
      )
    );
  });
  return Vision.annotateRegions({
    imagePath: caseDef.imagePath,
    regions,
    separators: [],
    outputPath,
    title: `${caseDef.stage}: ${caseDef.scene}`
  });
};

shared.callBridge = async function callBridge(config, payload) {
  const response = await axios.post(`${config.serviceUrl}/v1/ground`, payload, {
    timeout: config.requestTimeoutMs
  });
  return response.data;
};

shared.healthCheck = async function healthCheck(url, timeoutMs) {
  try {
    const response = await axios.get(`${String(url).replace(/\/+$/, '')}/health`, {
      timeout: timeoutMs
    });
    return {
      ok: true,
      url,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error && error.message ? error.message : String(error)
    };
  }
};

shared.runStaticCase = async function runStaticCase(caseDef, config, outputRoot) {
  const caseDir = `${outputRoot}/${shared.slugify(caseDef.id)}`;
  await shared.ensureDir(caseDir);
  const startedAt = Date.now();
  const imagePath = caseDef.imagePath || config.defaultImagePath;
  const payload = {
    ...(await shared.buildBridgeImagePayload(imagePath)),
    task: caseDef.task,
    phrase: caseDef.phrase,
    profile: caseDef.profile || 'auto'
  };
  const response = await shared.callBridge(config, payload);
  const durationMs = Date.now() - startedAt;
  const evaluation = shared.evaluateExpectedTarget(caseDef, response);
  const rawPath = `${caseDir}/response.json`;
  const annotatedPath = `${caseDir}/annotated.png`;
  const metaPath = `${caseDir}/meta.json`;
  await File.write(rawPath, JSON.stringify(response, null, 2));
  await shared.annotateBridgeResponse(caseDef, response, annotatedPath);
  const meta = {
    id: caseDef.id,
    stage: caseDef.stage,
    lane: caseDef.lane,
    scene: caseDef.scene,
    payload,
    durationMs,
    evaluation,
    profileUsed: response.profile_used,
    attemptProfiles: (response.attempts || []).map((attempt) => attempt.profile),
    backend: response.backend || ''
  };
  await File.write(metaPath, JSON.stringify(meta, null, 2));
  return {
    ...meta,
    rawPath,
    annotatedPath,
    response
  };
};

shared.renderStaticReport = async function renderStaticReport(stageId, summary, reportPath) {
  const titleMap = {
    stage_02_model_only: 'Stage 02 Model Only Report',
    stage_04_boundary_stress: 'Stage 04 Boundary Stress Report'
  };
  const lines = [
    `# ${titleMap[stageId] || stageId}`,
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Service URL: \`${summary.serviceUrl}\``,
    `- Bridge backend: \`${summary.bridgeBackend || 'unknown'}\``,
    `- Inline image transport: \`${summary.inlineImageTransport ? 'enabled' : 'disabled' }\``,
    `- Lane coverage: ${summary.lanes.join(', ') || 'n/a'}`,
    `- Cases: ${summary.totalCases}`,
    `- Passed: ${summary.passedCases}`,
    `- Failed: ${summary.failedCases}`,
    '',
    '| Case | Lane | Task | Profile | Result | Notes |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  for (const item of summary.results) {
    lines.push(
      `| ${item.id} | ${item.lane} | ${item.payload.task} | ${item.profileUsed} | ${item.evaluation.ok ? 'PASS' : 'FAIL'} | ${(item.evaluation.reasons || []).join('; ') || 'ok'} |`
    );
  }
  lines.push('');
  lines.push('## Profile Observations');
  lines.push('');
  for (const item of summary.results) {
    lines.push(`- \`${item.id}\`: attempts=${item.attemptProfiles.join(' -> ') || 'none'}, duration=${item.durationMs}ms`);
  }
  await File.write(reportPath, lines.join('\n'));
};

shared.runStaticStage = async function runStaticStage(options) {
  const config = shared.loadLocateAnythingConfig();
  const manifest = shared.loadManifest(options.manifestPath);
  const outputRoot = `${config.artifactRoot}/${options.outputSubdir}`;
  await shared.ensureDir(outputRoot);
  const health = await shared.healthCheck(config.serviceUrl, config.requestTimeoutMs);
  if (!health.ok) {
    throw new Error(`LocateAnything bridge health check failed for ${config.serviceUrl}: ${health.error || 'unknown error'}`);
  }
  const bridgeHealth = shared.describeBridgeHealth(health);
  const results = [];
  for (const caseDef of manifest) {
    results.push(await shared.runStaticCase(caseDef, config, outputRoot));
  }
  const summary = {
    stage: options.stageId,
    generatedAt: new Date().toISOString(),
    serviceUrl: config.serviceUrl,
    health,
    bridgeBackend: bridgeHealth.backend,
    inlineImageTransport: bridgeHealth.acceptsBase64,
    totalCases: results.length,
    passedCases: results.filter((item) => item.evaluation.ok).length,
    failedCases: results.filter((item) => !item.evaluation.ok).length,
    lanes: Array.from(new Set(results.map((item) => item.lane))),
    results: results.map((item) => ({
      id: item.id,
      lane: item.lane,
      scene: item.scene,
      payload: item.payload,
      durationMs: item.durationMs,
      evaluation: item.evaluation,
      profileUsed: item.profileUsed,
      attemptProfiles: item.attemptProfiles,
      backend: item.backend,
      rawPath: item.rawPath,
      annotatedPath: item.annotatedPath
    }))
  };
  await File.write(options.summaryPath, JSON.stringify(summary, null, 2));
  await shared.renderStaticReport(options.stageId, summary, options.reportPath);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
};
