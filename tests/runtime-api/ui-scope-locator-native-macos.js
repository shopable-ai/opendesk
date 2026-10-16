// Explicit macOS smoke for UI.within + lightweight Locator. It owns every
// target AppKit process through the existing repository fixture and keeps all
// evidence under .runtime/tests/ui-scope-locator-macos/.
// From the repository root (requires screen capture and Accessibility permissions):
// ./dist/opendesk -script tests/runtime-api/ui-scope-locator-native-macos.js -console-mode script -log-dir .runtime/tests/ui-scope-locator-macos/logs
'use strict';

const fixture = (0, eval)(File.read(File.join(
  Execution.workdir, 'tests', 'runtime-api', 'fixtures', 'ui-taptexts-macos', 'fixture-lib.js',
)));
fixture.assertEnvironment();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertButtonMatch(match, win, text, identifier, source) {
  assert(match && (source ? match.source === source : ['ocr', 'accessibility'].includes(match.source)),
    `unexpected button source: ${JSON.stringify(match)}`);
  assert(match.window && match.window.id === win.id && match.window.pid === win.pid && match.window.handle === win.handle,
    `button escaped fixture identity: ${JSON.stringify(match)}`);
  const b = match.bounds;
  assert(b && b.coordinateSpace === 'screen' && [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
    b.width > 0 && b.height > 0 && b.x >= win.x && b.y >= win.y &&
    b.x + b.width <= win.x + win.width && b.y + b.height <= win.y + win.height,
  `button bounds escaped fixture window: ${JSON.stringify(match)}`);
  assert(match.text === text || (source === 'accessibility' && match.name === text),
    `button text mismatch: ${JSON.stringify(match)}`);
  if (match.source === 'accessibility') {
    assert(match.role === 'button' && match.name === text && match.identifier === identifier,
      `native button identity mismatch: ${JSON.stringify(match)}`);
  } else {
    assert(typeof match.provider === 'string' && match.provider.length > 0 &&
      match.role === undefined && match.name === undefined && match.identifier === undefined,
    `OCR evidence must retain its provider and not claim native identity: ${JSON.stringify(match)}`);
  }
}

function assertSemanticButtonMatch(match, win, text, identifier) {
  assert(match && match.source === 'accessibility' && match.role === 'button' &&
    match.name === text && match.identifier === identifier && match.enabled === true,
  `native semantic button identity/state mismatch: ${JSON.stringify(match)}`);
  const scope = match.window;
  const b = scope && scope.bounds;
  assert(scope && scope.id === win.id && scope.pid === win.pid && scope.handle === win.handle &&
    b && b.coordinateSpace === 'screen' && b.x === win.x && b.y === win.y &&
    b.width === win.width && b.height === win.height,
  `semantic button escaped fixture window: ${JSON.stringify(match)}`);
  // Native invoke does not need pointer geometry. Validate an element box
  // when the owner exposes one, without inventing it from nativeBounds.
  if (match.bounds !== undefined) assertButtonMatch(match, win, text, identifier, 'accessibility');
}

async function findButtonEvidence(locator, win, text, identifier, source) {
  const observed = await locator.find();
  assertButtonMatch(observed, win, text, identifier, source);
  // Keep the Resolver's fused candidate list: do not accept the first of
  // several matches or relabel native evidence as OCR.
  const candidates = await UI.findTexts(text, { within: win });
  assert(Array.isArray(candidates) && candidates.length === 1,
    `fixture button is not unique: ${JSON.stringify(candidates)}`);
  assertButtonMatch(candidates[0], win, text, identifier, source);
  assert(candidates[0].source === observed.source, 'button source changed between read-only observations');
  return { observed, candidates };
}

async function findOCRButtonEvidence(win, text, identifier) {
  // Exercise the real visual owner without AX fusion. Keep its actual OCR
  // line box and scoped observations; never decorate a raw line with a window.
  const nativeAccessibility = globalThis.Accessibility;
  try {
    globalThis.Accessibility = undefined;
    const locator = UI.within(win).locator({ text });
    const evidence = await findButtonEvidence(locator, win, text, identifier, 'ocr');
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    return evidence;
  } finally {
    globalThis.Accessibility = nativeAccessibility;
  }
}

function assertOCRCapabilities(capabilities) {
  const providers = capabilities && capabilities.providers;
  const selected = Array.isArray(providers) ? providers.filter(provider =>
    provider && provider.provider === capabilities.defaultProvider) : [];
  assert(selected.length === 1 && selected[0].implemented === true && selected[0].available === true,
    `fixture requires an available default OCR provider for its no-tree observation; use the bundled executable with its native helper: ${JSON.stringify(capabilities)}`);
}

function failureEvidence(error, depth = 0) {
  const evidence = { code: error && error.code || null, message: String(error && error.message || error) };
  for (const key of ['operation', 'phase', 'actionState', 'backend', 'requestId', 'candidateCount', 'candidates']) {
    if (error && error[key] !== undefined) evidence[key] = error[key];
  }
  if (error && error.cause !== undefined && depth < 4) evidence.cause = failureEvidence(error.cause, depth + 1);
  return evidence;
}

async function expectCode(run, code) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert(caught, `expected ${code}`);
  assert(caught.code === code, `expected ${code}, received ${caught.code}: ${String(caught.message || caught)}`);
  return caught;
}

async function exactWindow(session) {
  let win = await window.wait({ id: session.win.id }, { timeout: 10000, polling: 100 });
  assert(win.id === session.win.id && win.pid === session.win.pid && win.handle === session.win.handle,
    `window.wait did not preserve fixture identity: ${JSON.stringify(win)}`);
  // Window enumeration may lag the launch-time activation. Refresh only
  // our owned exact identity before screenshot/OCR preflight.
  win = await window.activate(win, { timeout: 5000 });
  assert(win.id === session.win.id && win.pid === session.win.pid && win.handle === session.win.handle,
    `window.activate did not preserve fixture identity: ${JSON.stringify(win)}`);
  await fixture.waitForActive(win);
  return win;
}

async function waitForMovedWindow(before, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let moved;
  do {
    moved = await window.current(before);
    assert(moved.id === before.id && moved.pid === before.pid && moved.handle === before.handle,
      `moved fixture identity changed: ${JSON.stringify({ before, moved })}`);
    if ((moved.x !== before.x || moved.y !== before.y) && moved.width !== before.width) return moved;
    if (Date.now() >= deadline) break;
    // AppKit's writeState can precede WindowServer's geometry observation.
    await sleep(100);
  } while (Date.now() <= deadline);
  throw new Error(`same window geometry did not refresh after move/resize: ${JSON.stringify({ before, moved })}`);
}

async function captureWindow(win, output) {
  const fresh = await window.current(win);
  const captured = await page.screenshot({
    target: 'screen',
    clip: { x: fresh.x, y: fresh.y, width: fresh.width, height: fresh.height },
    path: output,
    returnType: 'path',
  });
  assert(captured === output && File.isFile(output), `window screenshot was not written: ${output}`);
  return captured;
}

async function withSession(paths, name, mode, delayMs, body) {
  let session = null;
  try {
    session = await fixture.launch(paths, name, mode, delayMs);
    return await body(session);
  } finally {
    await fixture.stop(paths, session);
  }
}

const evidenceRoot = Execution.env.OPENDESK_UI_SCOPE_LOCATOR_EVIDENCE_DIR || File.join(
  Execution.workdir, '.runtime', 'tests', 'ui-scope-locator-macos', Execution.id,
);
const paths = fixture.root(evidenceRoot);
const display = Screen.getPrimaryDisplay();
assert(display && Number.isFinite(display.x) && Number.isFinite(display.y) &&
  Number.isFinite(display.width) && Number.isFinite(display.height),
`primary display is unavailable: ${JSON.stringify(display)}`);
paths.origin = {
  x: Math.round(display.x + Math.max(40, (display.width - 680) / 2)),
  y: Math.round(display.y + Math.max(40, (display.height - 408) / 2)),
};
File.ensureDir(evidenceRoot);
const screenshotDir = File.join(evidenceRoot, 'screenshots');
File.ensureDir(screenshotDir);
const resultPath = File.join(evidenceRoot, 'result.json');
const report = {
  schemaVersion: 1,
  status: 'running',
  executionId: Execution.id,
  startedAt: new Date().toISOString(),
  evidenceRoot,
  scenarios: [],
};
await File.writeJSON(resultPath, report, { spaces: 2 });

async function scenario(name, body) {
  const row = { name, status: 'running', startedAt: new Date().toISOString() };
  report.scenarios.push(row);
  await File.writeJSON(resultPath, report, { spaces: 2 });
  try {
    row.evidence = await body(row);
    row.status = 'passed';
  } catch (error) {
    row.status = 'failed';
    row.error = failureEvidence(error);
    throw error;
  } finally {
    row.finishedAt = new Date().toISOString();
    await File.writeJSON(resultPath, report, { spaces: 2 });
  }
}

try {
  // AX can resolve text even when OCR is unavailable. Prove the separate
  // OCR prerequisite before launching a fixture or hiding Accessibility;
  // an unavailable helper must fail this smoke, never count as no-match.
  report.ocrCapabilities = await Vision.getCapabilities();
  assertOCRCapabilities(report.ocrCapabilities);
  const permissions = await page.checkPermissions({
    capabilities: ['screenCapture', 'accessibility'], openSettings: false, strict: false,
  });
  const permissionMap = permissions && permissions.permissions && permissions.permissions.capabilities;
  assert(permissionMap && permissionMap.screenCapture && permissionMap.screenCapture.granted === true,
    `screenCapture permission is not granted: ${JSON.stringify(permissions)}`);
  assert(permissionMap.accessibility && permissionMap.accessibility.granted === true,
    `accessibility permission is not granted: ${JSON.stringify(permissions)}`);
  report.permissions = permissions;
  await fixture.build(paths);

  await scenario('visual-text-move-and-no-tree', async () => withSession(paths, 'visual-text', 'move', 500, async session => {
    const win = await exactWindow(session);
    const beforeScreenshot = File.join(screenshotDir, 'visual-before.png');
    const afterScreenshot = File.join(screenshotDir, 'visual-after.png');
    await captureWindow(win, beforeScreenshot);
    const app = UI.within(win);
    assert(typeof app.locator === 'function', 'scope.locator is missing');
    const next = app.locator({ text: '下一步' });
    const nextEvidence = await findButtonEvidence(next, win, '下一步', 'fixture.next');
    const observed = nextEvidence.observed;
    // Native snapshots do not infer visibility from bounds. Exercise visual
    // waiting below with the native owner hidden instead.
    await next.waitFor({ state: 'exists', timeout: 10000 });

    // The Locator checks visual capability dynamically. This real observation
    // proves UI tree absence cannot disable OCR.
    const noTreeEvidence = await findOCRButtonEvidence(win, '下一步', 'fixture.next');

    await fixture.waitForActive(await window.current(win));
    const tap = await next.tap();
    assert(tap && tap.ok === true && tap.action === 'tapText', `text tap was not delegated: ${JSON.stringify(tap)}`);
    assertButtonMatch(tap.target, win, '下一步', 'fixture.next');
    if (tap.target.source === 'accessibility') {
      assert(tap.backend === 'accessibility' && tap.actionState === 'acknowledged', JSON.stringify(tap));
    }
    const waiting = await fixture.waitForState(session, state => Number(state.nextClicks) === 1 && Number(state.movedAtMs) > 0);
    const moved = await waitForMovedWindow(win);
    const confirm = app.locator({ text: '确认' });
    await confirm.waitFor({ state: 'exists', timeout: 10000 });
    const confirmEvidence = await findButtonEvidence(confirm, moved, '确认', 'fixture.confirm');
    const confirmObserved = confirmEvidence.observed;
    assert(confirmObserved && confirmObserved.window && confirmObserved.window.bounds.width === moved.width,
      `old Scope did not refresh moved/resized geometry: ${JSON.stringify({ confirmObserved, moved })}`);
    await fixture.waitForActive(await window.current(moved));
    const confirmTap = await confirm.tap();
    assert(confirmTap && confirmTap.ok === true && confirmTap.action === 'tapText', JSON.stringify(confirmTap));
    assertButtonMatch(confirmTap.target, moved, '确认', 'fixture.confirm');
    if (confirmTap.target.source === 'accessibility') {
      assert(confirmTap.backend === 'accessibility' && confirmTap.actionState === 'acknowledged', JSON.stringify(confirmTap));
    }
    const done = await fixture.waitForState(session, state => state.phase === 'complete');
    await captureWindow(moved, afterScreenshot);
    assert(Number(done.nextClicks) === 1 && Number(done.confirmClicks) === 1, JSON.stringify(done));
    return { initialWindow: { id: win.id, x: win.x, y: win.y, width: win.width },
      movedWindow: { x: moved.x, y: moved.y, width: moved.width },
      observed, nextEvidence, noTreeEvidence, confirmEvidence, tap, confirmTap,
      screenshots: { beforeScreenshot, afterScreenshot },
      state: { nextClicks: Number(done.nextClicks), confirmClicks: Number(done.confirmClicks) } };
  }));

  await scenario('image-find-wait-tap', async () => withSession(paths, 'image', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const app = UI.within(win);
    const text = app.locator({ text: '下一步' });
    const textEvidence = await findButtonEvidence(text, win, '下一步', 'fixture.next');
    const templateEvidence = await findOCRButtonEvidence(win, '下一步', 'fixture.next');
    const observed = templateEvidence.observed;
    // Use the actual OCR glyph box plus context. Padding the full AX button
    // frame produces a mostly blank template with unrelated visual matches.
    const padding = 8;
    const crop = {
      x: Math.max(win.x, observed.bounds.x - padding),
      y: Math.max(win.y, observed.bounds.y - padding),
      width: Math.min(win.x + win.width, observed.bounds.x + observed.bounds.width + padding) - Math.max(win.x, observed.bounds.x - padding),
      height: Math.min(win.y + win.height, observed.bounds.y + observed.bounds.height + padding) - Math.max(win.y, observed.bounds.y - padding),
    };
    assert(crop.width > observed.bounds.width && crop.height > observed.bounds.height,
      `button template padding was clipped unexpectedly: ${JSON.stringify({ observed, crop })}`);
    const template = File.join(evidenceRoot, 'image-next-template.png');
    if (File.exists(template)) File.remove(template);
    await page.screenshot({ target: 'screen', clip: crop, path: template, returnType: 'path' });
    assert(File.isFile(template), 'template screenshot was not written');
    const image = app.locator({ image: template });
    const imageMatch = await image.find({ timeout: 10000 });
    assert(imageMatch && imageMatch.source === 'image', `image find failed: ${JSON.stringify(imageMatch)}`);
    await image.waitFor({ state: 'visible', timeout: 10000 });
    await fixture.waitForActive(await window.current(win));
    const tap = await image.tap();
    assert(tap && tap.ok === true && tap.action === 'tapImage', `image tap was not delegated: ${JSON.stringify(tap)}`);
    const state = await fixture.waitForState(session, value => Number(value.nextClicks) === 1);
    assert(Number(state.confirmClicks) === 0, JSON.stringify(state));
    return { template, crop, textEvidence, templateEvidence, imageMatch, tap, nextClicks: Number(state.nextClicks) };
  }));

  await scenario('semantic-native-and-value-roundtrip', async () => withSession(paths, 'semantic', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const beforeScreenshot = File.join(screenshotDir, 'semantic-before.png');
    const afterScreenshot = File.join(screenshotDir, 'semantic-after.png');
    await captureWindow(win, beforeScreenshot);
    const app = UI.within(win);
    const button = app.locator({ role: 'button', identifier: 'fixture.next' });
    await button.waitFor({ state: 'exists', timeout: 10000 });
    const observed = await button.find();
    assertSemanticButtonMatch(observed, win, '下一步', 'fixture.next');
    await fixture.waitForActive(await window.current(win));
    const tap = await button.tap();
    assert(tap && tap.ok === true && tap.action === 'tapTargets', `semantic tap was not delegated: ${JSON.stringify(tap)}`);
    assert(Array.isArray(tap.completed) && tap.completed.length === 1, JSON.stringify(tap));
    const activation = tap.completed[0];
    assert(activation.action === 'invoke' && activation.actionState === 'acknowledged' &&
      activation.target && activation.target.source === 'accessibility' && activation.target.locator &&
      activation.target.locator.role === 'button' && activation.target.locator.identifier === 'fixture.next' &&
      typeof activation.requestId === 'string' && activation.requestId.length > 0 &&
      typeof activation.backend === 'string' && activation.backend.length > 0, JSON.stringify(tap));
    const clicked = await fixture.waitForState(session, state => Number(state.nextClicks) === 1);

    const input = app.locator({ role: 'textField', identifier: 'fixture.messageInput' });
    await input.waitFor({ state: 'exists', timeout: 10000 });
    const before = await input.getValue();
    assert(typeof before === 'string', `native text field did not expose a string value: ${JSON.stringify(before)}`);
    const marker = '你好，Locator 原生回读 👋🧪';
    const receipt = await input.setValue(marker);
    assert(receipt && receipt.operation === 'UI.setValue' && receipt.action === 'setValue' &&
      typeof receipt.requestId === 'string' && receipt.requestId.length > 0 &&
      typeof receipt.backend === 'string' && receipt.backend.length > 0 &&
      receipt.verified === true && receipt.actionState === 'acknowledged', JSON.stringify(receipt));
    const after = await input.getValue();
    assert(after === marker, `locator native value mismatch: ${JSON.stringify({ marker, after })}`);
    const state = await fixture.waitForState(session, value => value.messageInput === marker);

    let ref = null;
    let direct;
    try {
      ref = await Accessibility.find({ role: 'textField', identifier: 'fixture.messageInput' }, { within: await window.current(win) });
      assert(ref, 'independent Accessibility value check could not locate fixture input');
      direct = await Accessibility.read(ref, { properties: ['role', 'identifier', 'value'] });
      assert(direct && direct.properties && direct.properties.role === 'textField' && direct.properties.value === marker,
        `independent native readback mismatch: ${JSON.stringify(direct)}`);
      assert(direct.properties.identifier === 'fixture.messageInput', JSON.stringify(direct));
    } finally {
      if (ref) assert(await Accessibility.release(ref) === true, 'independent native ref was not released');
    }
    await captureWindow(win, afterScreenshot);
    assert(Number(state.nextClicks) === 1 && Number(state.confirmClicks) === 0, JSON.stringify(state));
    return { semantic: observed, tap, receipt, nextClicks: Number(clicked.nextClicks), before, marker,
      after, direct, stateValue: state.messageInput, screenshots: { beforeScreenshot, afterScreenshot } };
  }));

  await scenario('text-zero-timeout-real-observation', async () => withSession(paths, 'zero-timeout', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const originalOCR = Vision.runOCR;
    const observations = [];
    const started = Date.now();
    try {
      Vision.runOCR = async function (options) {
        const result = await originalOCR.apply(this, arguments);
        observations.push({provider: result.provider, lines: result.lines, timeoutMs: options.timeoutMs});
        return result;
      };
      await UI.within(win).locator({text: '下一步'}).waitFor({state: 'exists', timeout: 0});
    } finally { Vision.runOCR = originalOCR; }
    const state = await fixture.readState(session);
    assert(observations.length === 1 && observations[0].lines.some(line => line.text === '下一步'), JSON.stringify(observations));
    assert(Number(state.nextClicks) === 0 && Number(state.confirmClicks) === 0, JSON.stringify(state));
    return {observations, elapsedMs: Date.now() - started, state};
  }));

  await scenario('text-tap-canceled-after-real-ocr', async row => withSession(paths, 'cancel-after-ocr', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const locator = UI.within(win).locator({ text: '下一步' });
    const controller = new AbortController();
    const evidence = row.evidence = { timeout: 30000, ownerCalls: [], ocrObservations: [], inputCalls: 0 };
    const originalOCR = Vision.runOCR;
    const originalTapText = UI.tapText;
    const originalClickPoint = mouse.clickPoint;
    const nativeAccessibility = globalThis.Accessibility;
    let started;
    try {
      // Keep the real visual owner and its unmodified OCR result. Hiding AX
      // prevents an unrelated native candidate from satisfying this scenario.
      globalThis.Accessibility = undefined;
      UI.tapText = async function (text, options) {
        evidence.ownerCalls.push({ text, timeout: options.timeout, signalMatches: options.signal === controller.signal });
        return originalTapText.apply(this, arguments);
      };
      mouse.clickPoint = async function () {
        evidence.inputCalls += 1;
        return originalClickPoint.apply(this, arguments);
      };
      Vision.runOCR = async function (options) {
        const observation = { timeoutMs: options.timeoutMs === undefined ? null : options.timeoutMs,
          startedAtMs: Date.now(), abortedBeforeObservation: controller.signal.aborted };
        evidence.ocrObservations.push(observation);
        const result = await originalOCR.apply(this, arguments);
        observation.elapsedMs = Date.now() - observation.startedAtMs;
        observation.result = result;
        assert(!controller.signal.aborted, 'signal was canceled before the real OCR returned');
        assert(result && Array.isArray(result.lines) && result.lines.some(line =>
          typeof line.text === 'string' && line.text.replace(/\s/g, '') === '下一步'),
        `real OCR did not observe the fixture button: ${JSON.stringify(result)}`);
        controller.abort();
        observation.abortedAfterObservation = controller.signal.aborted;
        return result;
      };
      started = Date.now();
      evidence.error = failureEvidence(await expectCode(() => locator.tap({ timeout: evidence.timeout, signal: controller.signal }), 'CANCELED'));
    } finally {
      Vision.runOCR = originalOCR;
      UI.tapText = originalTapText;
      mouse.clickPoint = originalClickPoint;
      globalThis.Accessibility = nativeAccessibility;
      evidence.elapsedMs = started === undefined ? null : Date.now() - started;
      // Independently read AppKit's state after allowing any submitted input
      // to reach its event loop; the error code alone cannot prove zero clicks.
      await sleep(300);
      evidence.fixtureState = await fixture.readState(session);
    }
    assert(evidence.ownerCalls.length === 1 && evidence.ownerCalls[0].signalMatches &&
      evidence.ownerCalls[0].timeout > 0 && evidence.ownerCalls[0].timeout <= evidence.timeout, JSON.stringify(evidence));
    assert(evidence.ocrObservations.length === 1 && evidence.ocrObservations[0].abortedBeforeObservation === false &&
      evidence.ocrObservations[0].abortedAfterObservation === true && evidence.inputCalls === 0, JSON.stringify(evidence));
    assert(evidence.fixtureState && Number(evidence.fixtureState.nextClicks) === 0 &&
      Number(evidence.fixtureState.confirmClicks) === 0, JSON.stringify(evidence));
    return evidence;
  }));

  await scenario('text-tap-total-deadline-after-real-window-refresh', async row => withSession(paths, 'deadline-after-window', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const locator = UI.within(win).locator({ text: '下一步' });
    const evidence = row.evidence = { timeout: 10000, windowObservations: [], ownerCalls: [], inputCalls: 0 };
    const originalCurrent = window.current;
    const originalTapText = UI.tapText;
    const originalClickPoint = mouse.clickPoint;
    let started;
    try {
      window.current = async function (target) {
        const observation = { requestedWindow: target, startedAtMs: Date.now() };
        evidence.windowObservations.push(observation);
        const current = await originalCurrent.apply(this, arguments);
        observation.elapsedMs = Date.now() - observation.startedAtMs;
        observation.result = current;
        assert(current.id === win.id && current.pid === win.pid && current.handle === win.handle,
          `real window refresh escaped fixture identity: ${JSON.stringify(current)}`);
        // Deliberately exhaust the original call's budget only after the real
        // observation. Do not impose a tight native timing bound on slow Macs.
        observation.controlledSleepMs = Math.max(0, started + evidence.timeout + 250 - Date.now());
        if (observation.controlledSleepMs > 0) await sleep(observation.controlledSleepMs);
        observation.returnedAfterMs = Date.now() - started;
        return current;
      };
      UI.tapText = async function (text, options) {
        evidence.ownerCalls.push({ text, timeout: options.timeout });
        return originalTapText.apply(this, arguments);
      };
      mouse.clickPoint = async function () {
        evidence.inputCalls += 1;
        return originalClickPoint.apply(this, arguments);
      };
      started = Date.now();
      evidence.error = failureEvidence(await expectCode(() => locator.tap({ timeout: evidence.timeout }), 'TIMEOUT'));
    } finally {
      window.current = originalCurrent;
      UI.tapText = originalTapText;
      mouse.clickPoint = originalClickPoint;
      evidence.elapsedMs = started === undefined ? null : Date.now() - started;
      await sleep(300);
      evidence.fixtureState = await fixture.readState(session);
    }
    assert(evidence.windowObservations.length === 1 && evidence.windowObservations[0].result &&
      evidence.windowObservations[0].returnedAfterMs >= evidence.timeout && evidence.elapsedMs >= evidence.timeout,
    JSON.stringify(evidence));
    assert(evidence.error.actionState === 'not_started' && evidence.ownerCalls.length === 0 && evidence.inputCalls === 0,
      `expired scope budget reached the text owner: ${JSON.stringify(evidence)}`);
    assert(evidence.fixtureState && Number(evidence.fixtureState.nextClicks) === 0 &&
      Number(evidence.fixtureState.confirmClicks) === 0, JSON.stringify(evidence));
    return evidence;
  }));

  await scenario('image-tap-signal-rejected-before-observation', async row => withSession(paths, 'image-signal', 'flow', 500, async session => {
    const win = await exactWindow(session);
    // Reuse the real screenshot template captured by image-find-wait-tap.
    const template = File.join(evidenceRoot, 'image-next-template.png');
    assert(File.isFile(template), 'real fixture image template is missing');
    const locator = UI.within(win).locator({ image: template });
    const controller = new AbortController();
    const evidence = row.evidence = { timeout: 10000, template, windowObservations: [], ownerCalls: [], inputCalls: 0 };
    const originalCurrent = window.current;
    const originalTapImage = UI.tapImage;
    const originalClickPoint = mouse.clickPoint;
    let started;
    try {
      window.current = async function (target) {
        evidence.windowObservations.push({ requestedWindow: target });
        return originalCurrent.apply(this, arguments);
      };
      UI.tapImage = async function (image, options) {
        evidence.ownerCalls.push({ image, timeout: options.timeout, signalMatches: options.signal === controller.signal });
        return originalTapImage.apply(this, arguments);
      };
      mouse.clickPoint = async function () {
        evidence.inputCalls += 1;
        return originalClickPoint.apply(this, arguments);
      };
      assert(!controller.signal.aborted, 'image signal must be live to exercise NOT_SUPPORTED');
      started = Date.now();
      evidence.error = failureEvidence(await expectCode(() => locator.tap({ timeout: evidence.timeout, signal: controller.signal }), 'NOT_SUPPORTED'));
    } finally {
      window.current = originalCurrent;
      UI.tapImage = originalTapImage;
      mouse.clickPoint = originalClickPoint;
      evidence.elapsedMs = started === undefined ? null : Date.now() - started;
      await sleep(300);
      evidence.fixtureState = await fixture.readState(session);
    }
    assert(evidence.error.phase === 'capability' && evidence.error.actionState === 'not_started' &&
      evidence.windowObservations.length === 0 && evidence.ownerCalls.length === 0 && evidence.inputCalls === 0,
    JSON.stringify(evidence));
    assert(evidence.fixtureState && Number(evidence.fixtureState.nextClicks) === 0 &&
      Number(evidence.fixtureState.confirmClicks) === 0, JSON.stringify(evidence));
    return evidence;
  }));

  await scenario('stale-same-title-does-not-rebind', async () => {
    let oldSession = null;
    let replacement = null;
    try {
      oldSession = await fixture.launch(paths, 'stale-old', 'flow', 500);
      const oldWin = await exactWindow(oldSession);
      const oldLocator = UI.within(oldWin).locator({ text: '下一步' });
      await fixture.stop(paths, oldSession);
      oldSession = null;
      replacement = await fixture.launch(paths, 'stale-replacement', 'flow', 500);
      const newWin = await exactWindow(replacement);
      assert(newWin.title === oldWin.title && newWin.id !== oldWin.id, `fixture replacement did not create a same-title new identity: ${JSON.stringify({ oldWin, newWin })}`);
      const stale = await expectCode(() => oldLocator.find(), 'STALE_TARGET');
      const rebound = UI.within(newWin).locator({ text: '下一步' });
      const fresh = await rebound.find();
      assert(fresh && fresh.window.id === newWin.id, `new Scope did not use replacement identity: ${JSON.stringify(fresh)}`);
      return { oldId: oldWin.id, newId: newWin.id, staleOperation: stale.operation || null, freshSource: fresh.source };
    } finally {
      await fixture.stop(paths, replacement);
      await fixture.stop(paths, oldSession);
    }
  });

  report.status = 'passed';
  report.finishedAt = new Date().toISOString();
  await File.writeJSON(resultPath, report, { spaces: 2 });
  console.log('[UI-SCOPE-LOCATOR-NATIVE-MACOS PASS] ' + JSON.stringify({ resultPath, scenarios: report.scenarios.map(row => row.name) }));
} catch (error) {
  report.status = 'failed';
  report.finishedAt = new Date().toISOString();
  report.error = failureEvidence(error);
  await File.writeJSON(resultPath, report, { spaces: 2 });
  throw error;
}
