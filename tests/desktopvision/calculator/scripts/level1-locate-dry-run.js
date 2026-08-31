const REPLAY_PLAN = {
  "app": "Calculator",
  "windowWidth": 232,
  "windowHeight": 321,
  "replayDir": ".runtime/runs/calculator-level1-locate-dry-run",
  "provider": "openai",
  "model": "gpt-5.6-sol",
  "minConfidence": 0.85,
  "promptVersion": "ui-parser-v1",
  "steps": [
    {
      "index": 1,
      "id": "level_1_static_recognition",
      "stage": "level_1_static_recognition",
      "action": "click",
      "button": "left",
      "dryRun": true,
      "target": {
        "id": "calculator-button-7",
        "role": "button",
        "text": "7",
        "bbox_norm": [
          0,
          0.40187,
          0.241379,
          0.548287
        ],
        "bbox_px": [
          0,
          129,
          56,
          176
        ],
        "bbox_window": [
          0,
          129,
          56,
          176
        ],
        "center_window": [
          28,
          152.5
        ],
        "center_screen": [
          224,
          187.5
        ],
        "confidence": 0.99,
        "actionable": true,
        "risk": "low"
      },
      "expected": {
        "type": "visual_text",
        "text": "7",
        "role": "display"
      }
    }
  ]
};
const RUN_ID = "run-" + new Date().toISOString().replace(/[^0-9]/g, "");
const RUN_EVIDENCE_DIR = REPLAY_PLAN.replayDir + "/" + RUN_ID;
const STEPS_DIR = RUN_EVIDENCE_DIR + "/steps";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function sameText(left, right) {
  return normalizeText(left) === normalizeText(right);
}

function stepArtifact(step, suffix) {
  return STEPS_DIR + "/" + String(step.index).padStart(2, "0") + "-" + suffix;
}

async function writeStepJSON(step, suffix, value) {
  await File.write(stepArtifact(step, suffix), JSON.stringify(value, null, 2) + "\n");
}

async function appendEvidenceEvent(value) {
  await File.append(RUN_EVIDENCE_DIR + "/events.ndjson", JSON.stringify(value) + "\n");
}

function approxEqual(left, right, tolerance) {
  return Math.abs(Number(left) - Number(right)) <= Number(tolerance);
}

function bboxFromElement(element) {
  const box = element && (element.bbox || element.bounds);
  if (!box) {
    const bboxWindow = element && element.bbox_window;
    if (Array.isArray(bboxWindow) && bboxWindow.length === 4) {
      const left = Number(bboxWindow[0]);
      const top = Number(bboxWindow[1]);
      const right = Number(bboxWindow[2]);
      const bottom = Number(bboxWindow[3]);
      if ([left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top) {
        return {
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        };
      }
    }
    return null;
  }
  return {
    x: Number(box.x || 0),
    y: Number(box.y || 0),
    width: Number(box.width || 0),
    height: Number(box.height || 0),
  };
}

function normalizedBBoxForWindow(box, activeWindow) {
  if (!box || !activeWindow || !activeWindow.width || !activeWindow.height) {
    return null;
  }
  return [
    box.x / Number(activeWindow.width),
    box.y / Number(activeWindow.height),
    (box.x + box.width) / Number(activeWindow.width),
    (box.y + box.height) / Number(activeWindow.height),
  ];
}

function bboxDistance(left, right) {
  if (!left || !right || left.length !== 4 || right.length !== 4) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(left[0] - right[0]) +
    Math.abs(left[1] - right[1]) +
    Math.abs(left[2] - right[2]) +
    Math.abs(left[3] - right[3]);
}

function normalizedPointForWindow(point, activeWindow) {
  if (!point || !activeWindow || !activeWindow.width || !activeWindow.height) {
    return null;
  }
  return [
    Number(point.x) / Number(activeWindow.width),
    Number(point.y) / Number(activeWindow.height),
  ];
}

function pointDistance(left, right) {
  if (!left || !right || left.length !== 2 || right.length !== 2) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]);
}

function pointFromElement(element, fallbackBox) {
  const point = element && element.clickPoint;
  if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
    return {
      x: Number(point.x),
      y: Number(point.y),
    };
  }
  if (!fallbackBox) {
    return null;
  }
  return {
    x: fallbackBox.x + fallbackBox.width / 2,
    y: fallbackBox.y + fallbackBox.height / 2,
  };
}

function localPointWithinBox(point, box) {
  return Boolean(
    point &&
    box &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y)) &&
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function boundsFromDisplay(display) {
  if (!display) {
    return null;
  }
  if (display.bounds) {
    return boundsFromDisplay(display.bounds);
  }
  if (
    Number.isFinite(Number(display.x)) &&
    Number.isFinite(Number(display.y)) &&
    Number.isFinite(Number(display.width)) &&
    Number.isFinite(Number(display.height))
  ) {
    return {
      x: Number(display.x),
      y: Number(display.y),
      width: Number(display.width),
      height: Number(display.height),
    };
  }
  return null;
}

function screenPointWithinWindow(point, activeWindow) {
  return Boolean(
    point &&
    activeWindow &&
    typeof activeWindow.x === "number" &&
    typeof activeWindow.y === "number" &&
    typeof activeWindow.width === "number" &&
    typeof activeWindow.height === "number" &&
    point.x >= activeWindow.x &&
    point.x <= activeWindow.x + activeWindow.width &&
    point.y >= activeWindow.y &&
    point.y <= activeWindow.y + activeWindow.height
  );
}

function screenPointWithinBounds(point, bounds) {
  return Boolean(
    point &&
    bounds &&
    Number.isFinite(Number(bounds.x)) &&
    Number.isFinite(Number(bounds.y)) &&
    Number.isFinite(Number(bounds.width)) &&
    Number.isFinite(Number(bounds.height)) &&
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

async function displayBoundsForWindow(activeWindow) {
  if (typeof Screen !== "undefined" && typeof Screen.getDisplays === "function") {
    const displays = await Screen.getDisplays();
    const center = {
      x: activeWindow.x + activeWindow.width / 2,
      y: activeWindow.y + activeWindow.height / 2,
    };
    for (const display of Array.isArray(displays) ? displays : []) {
      const bounds = boundsFromDisplay(display);
      if (screenPointWithinBounds(center, bounds)) {
        return bounds;
      }
    }
  }
  if (typeof Screen !== "undefined" && typeof Screen.getVirtualBounds === "function") {
    return boundsFromDisplay(await Screen.getVirtualBounds());
  }
  return null;
}

async function ensureWindowAnchor() {
  const active = await window.getActiveWindow();
  if (!active || !active.width || !active.height) {
    throw new Error("active window metadata is unavailable");
  }
  if (REPLAY_PLAN.windowTitle && !sameText(active.title, REPLAY_PLAN.windowTitle)) {
    throw new Error("active window title drifted from replay anchor");
  }
  if (REPLAY_PLAN.app && (!active.exeName || !sameText(active.exeName, REPLAY_PLAN.app))) {
	throw new Error("active app drifted from replay anchor");
  }
  if (REPLAY_PLAN.windowWidth && !approxEqual(active.width, REPLAY_PLAN.windowWidth, 2)) {
    throw new Error("active window width drifted from replay anchor");
  }
  if (REPLAY_PLAN.windowHeight && !approxEqual(active.height, REPLAY_PLAN.windowHeight, 2)) {
    throw new Error("active window height drifted from replay anchor");
  }
  return active;
}

async function captureStep(step, phase) {
  await File.ensureDir(STEPS_DIR);
  const padded = String(step.index).padStart(2, "0");
  const evidencePrefix = STEPS_DIR + "/" + padded + "-" + phase;
  const path = evidencePrefix + ".png";
  await page.screenshot({ path, target: "activeWindow" });
  return { path, evidencePrefix, capturedAtMs: Date.now() };
}

function ensureFreshCapture(capture) {
  if (!capture || !capture.path || !Number.isFinite(Number(capture.capturedAtMs))) {
    throw new Error("screenshot capture metadata is unavailable");
  }
  if (Date.now() - Number(capture.capturedAtMs) > 30000) {
    throw new Error("screenshot became stale before action");
  }
}

async function ensureActionPermissions() {
  const permissions = await page.checkScreenshotPermissions();
  if (!permissions || permissions.screenCapture !== true || permissions.accessibility !== true) {
    throw new Error("screen capture or accessibility permission is unavailable");
  }
}

async function parseVisionStep(step, capture, text, role, purpose, phase) {
  if (typeof DesktopVision === "undefined" || typeof DesktopVision.parse !== "function") {
    throw new Error("audited DesktopVision bridge is unavailable");
  }
  if (!REPLAY_PLAN.provider || !REPLAY_PLAN.model) {
    throw new Error("verified vision provider and model are required");
  }
  const result = await DesktopVision.parse({
    imagePath: capture.path,
    auditPath: capture.evidencePrefix + "-model-invocation.json",
    annotatedPath: capture.evidencePrefix + "-annotated.png",
    capturedAt: new Date(capture.capturedAtMs).toISOString(),
    app: REPLAY_PLAN.app,
    provider: REPLAY_PLAN.provider,
    model: REPLAY_PLAN.model,
    promptVersion: REPLAY_PLAN.promptVersion,
    targetText: text || "",
    targetRole: role || "",
    purpose: purpose || "",
    actionStep: step.id,
    phase,
    timeoutMs: 90000,
  });
  const perception = result && result.perception;
  const invocation = result && result.invocation;
  if (!perception || !invocation || invocation.succeeded !== true) {
    throw new Error("audited desktop vision call did not succeed");
  }
  if (!invocation.image_sha256 || invocation.image_sha256 !== invocation.response_image_sha256) {
    throw new Error("model response screenshot SHA mismatch");
  }
  if (!perception.image || perception.image.hash !== invocation.image_sha256) {
    throw new Error("perception screenshot SHA mismatch");
  }
  await File.write(capture.evidencePrefix + "-perception.json", JSON.stringify(perception, null, 2) + "\n");
  if (step.index === 1 && phase === "pre") {
    await File.copy(capture.path, RUN_EVIDENCE_DIR + "/pre.png");
    await File.copy(capture.evidencePrefix + "-annotated.png", RUN_EVIDENCE_DIR + "/annotated.png");
    await File.write(RUN_EVIDENCE_DIR + "/perception.json", JSON.stringify(perception, null, 2) + "\n");
  }
  if (phase === "pre") {
    await writeStepJSON(step, "perception.json", perception);
  }
  return result;
}

function chooseCandidate(step, activeWindow, detectResult) {
  const candidates = (detectResult && detectResult.elements ? detectResult.elements : [])
    .map((element) => {
      const box = bboxFromElement(element);
      const localClickPoint = pointFromElement(element, box);
      const normBox = normalizedBBoxForWindow(box, activeWindow);
      const normPoint = normalizedPointForWindow(localClickPoint, activeWindow);
      const confidence = Number(element.score ?? element.confidence ?? 0);
      return {
        element,
        box,
        localClickPoint,
        normBox,
        normPoint,
        confidence,
        distance: bboxDistance(normBox, step.target.bbox_norm) +
          pointDistance(normPoint, step.target.center_window ? normalizedPointForWindow({
            x: step.target.center_window[0],
            y: step.target.center_window[1],
          }, activeWindow) : null),
      };
    })
    .filter((candidate) => {
      const textMatches = !step.target.text || sameText(candidate.element.text, step.target.text);
      const roleMatches = !step.target.role || sameText(candidate.element.role, step.target.role);
      const confidencePasses = candidate.confidence >= Math.max(REPLAY_PLAN.minConfidence || 0, step.target.confidence || 0);
      const riskPasses = sameText(candidate.element.risk, "low");
      const actionable = candidate.element.actionable === true;
      return Boolean(candidate.box) &&
        Boolean(candidate.localClickPoint) &&
        localPointWithinBox(candidate.localClickPoint, candidate.box) &&
        textMatches &&
        roleMatches &&
        confidencePasses &&
        riskPasses &&
        actionable;
    })
    .sort((left, right) => left.distance - right.distance);

  if (candidates.length !== 1) {
    throw new Error("target is not unique after re-detection");
  }
  if (!Number.isFinite(candidates[0].distance)) {
    throw new Error("target is not unique after re-detection");
  }
  return candidates[0];
}

async function verifyExpectation(step) {
  if (!step.expected || (!step.expected.text && !step.expected.role)) {
    return;
  }
  const activeWindow = await ensureWindowAnchor();
  const capture = await captureStep(step, "post");
  const detected = await parseVisionStep(
    step,
    capture,
    step.expected.text || "",
    step.expected.role || "display",
    "verify_postcondition",
    "post"
  );
  ensureFreshCapture(capture);
  const perception = detected && detected.perception;
  const matches = (perception && perception.elements ? perception.elements : []).filter((element) => {
    const confidence = Number(element.score ?? element.confidence ?? 0);
    const textMatches = !step.expected.text || sameText(element.text, step.expected.text);
    const roleMatches = !step.expected.role || sameText(element.role, step.expected.role);
    return textMatches &&
      roleMatches &&
      sameText(element.risk, "low") &&
      confidence >= Math.max(REPLAY_PLAN.minConfidence || 0, step.target.confidence || 0);
  });
  if (matches.length !== 1) {
    throw new Error("postcondition verification failed");
  }
  if (!activeWindow.width || !activeWindow.height) {
    throw new Error("active window became invalid during verification");
  }
  const verification = {
    ok: true,
    expected: step.expected,
    observed: matches[0],
    screenshot_sha256: detected.invocation.image_sha256,
    response_image_sha256: detected.invocation.response_image_sha256,
    provider: REPLAY_PLAN.provider,
    model: REPLAY_PLAN.model,
  };
  await writeStepJSON(step, "verification.json", verification);
  await File.copy(capture.path, RUN_EVIDENCE_DIR + "/post.png");
  return { capture, detected, verification };
}

async function runStep(step) {
  const activeWindow = await ensureWindowAnchor();
  const capture = await captureStep(step, "pre");
  const detected = await parseVisionStep(
    step,
    capture,
    step.target.text || "",
    step.target.role || "button",
    "locate_action_target",
    "pre"
  );
  ensureFreshCapture(capture);
  const candidate = chooseCandidate(step, activeWindow, detected.perception);
  const localClickPoint = candidate.localClickPoint;
  if (!localPointWithinBox(localClickPoint, candidate.box)) {
    throw new Error("resolved click point escaped the candidate bounds");
  }
  const clickPoint = {
    x: activeWindow.x + localClickPoint.x,
    y: activeWindow.y + localClickPoint.y,
  };
  const displayBounds = await displayBoundsForWindow(activeWindow);
  if (!screenPointWithinBounds(clickPoint, displayBounds)) {
    throw new Error("resolved click point escaped the active display bounds");
  }
  if (!screenPointWithinWindow(clickPoint, activeWindow)) {
    throw new Error("resolved click point escaped the active window bounds");
  }
	await writeStepJSON(step, "plan.json", {
	  step,
	  provider: REPLAY_PLAN.provider,
	  model: REPLAY_PLAN.model,
	  screenshot_sha256: detected.invocation.image_sha256,
	  resolved_target: candidate.element,
	  resolved_screen_point: clickPoint,
	  gates: {
	    application_identity: true,
	    window_identity: true,
	    screenshot_fresh: true,
	    target_unique: true,
	    confidence: true,
	    coordinate_inside_target: true,
	    coordinate_inside_window: true,
	    coordinate_inside_display: true,
	    risk_low: true,
	  },
	});
	if (step.dryRun) {
	  const verification = {
	    ok: true,
	    dry_run: true,
	    screenshot_sha256: detected.invocation.image_sha256,
	    response_image_sha256: detected.invocation.response_image_sha256,
	    provider: REPLAY_PLAN.provider,
	    model: REPLAY_PLAN.model,
	    target: candidate.element,
	    resolved_screen_point: clickPoint,
	  };
	  await writeStepJSON(step, "verification.json", verification);
	  await File.copy(capture.path, RUN_EVIDENCE_DIR + "/post.png");
	  await appendEvidenceEvent({
	    timestamp: new Date().toISOString(),
	    stage: step.stage,
	    action: "dry_run_locate",
	    screenshot_sha256: detected.invocation.image_sha256,
	    target: candidate.element,
	    resolved_screen_point: clickPoint,
	    verification,
	  });
	  console.log("dry-run: visual target resolved without action", step.id, clickPoint);
	  return verification;
	}

  await ensureActionPermissions();
  const currentWindow = await ensureWindowAnchor();
  if (
    currentWindow.x !== activeWindow.x ||
    currentWindow.y !== activeWindow.y ||
    currentWindow.width !== activeWindow.width ||
    currentWindow.height !== activeWindow.height
  ) {
    throw new Error("active window changed after visual re-detection");
  }

  if (step.action === "click") {
    await mouse.click(clickPoint.x, clickPoint.y, { button: step.button || "left" });
  } else if (step.action === "type") {
    await mouse.click(clickPoint.x, clickPoint.y, { button: step.button || "left" });
    await keyboard.type(step.text || "");
  } else if (step.action === "shortcut") {
    await keyboard.press(step.shortcut || "");
  } else if (step.action === "focus") {
    await mouse.click(clickPoint.x, clickPoint.y, { button: step.button || "left" });
  } else {
    throw new Error("unsupported replay action: " + step.action);
  }

  const post = await verifyExpectation(step);
  await appendEvidenceEvent({
    timestamp: new Date().toISOString(),
    stage: step.stage,
    action: step.action,
    screenshot_sha256: detected.invocation.image_sha256,
    target: candidate.element,
    resolved_screen_point: clickPoint,
    verification: post ? post.verification : null,
  });
  return post ? post.verification : { ok: true };
}

async function main() {
  await File.ensureDir(STEPS_DIR);
  await File.write(RUN_EVIDENCE_DIR + "/events.ndjson", "");
  await File.write(RUN_EVIDENCE_DIR + "/plan.json", JSON.stringify(REPLAY_PLAN, null, 2) + "\n");
  let completed = 0;
  let actionsExecuted = 0;
  try {
    if (REPLAY_PLAN.steps.some((step) => !step.dryRun)) {
      await ensureActionPermissions();
    }
    for (const step of REPLAY_PLAN.steps) {
      await runStep(step);
      completed += 1;
      if (!step.dryRun) {
        actionsExecuted += 1;
      }
    }
  } catch (error) {
    await File.write(RUN_EVIDENCE_DIR + "/verification.json", JSON.stringify({
      ok: false,
      provider: REPLAY_PLAN.provider,
      model: REPLAY_PLAN.model,
      completed_steps: completed,
      actions_executed: actionsExecuted,
      error: String(error && error.stack ? error.stack : error),
    }, null, 2) + "\n");
    throw error;
  }
  await File.write(RUN_EVIDENCE_DIR + "/verification.json", JSON.stringify({
    ok: true,
    provider: REPLAY_PLAN.provider,
    model: REPLAY_PLAN.model,
    completed_steps: completed,
    actions_executed: actionsExecuted,
    misclicks: 0,
  }, null, 2) + "\n");
  console.log("evidence directory", RUN_EVIDENCE_DIR);
}

await main();
