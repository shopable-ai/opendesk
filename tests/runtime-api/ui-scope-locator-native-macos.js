// Explicit macOS smoke for UI.within + lightweight Locator. It owns every
// target AppKit process through the existing repository fixture and keeps all
// evidence under .runtime/tests/ui-scope-locator-macos/.
'use strict';

const fixture = (0, eval)(File.read(File.join(
  Execution.workdir, 'tests', 'runtime-api', 'fixtures', 'ui-taptexts-macos', 'fixture-lib.js',
)));
fixture.assertEnvironment();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectCode(run, code) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert(caught, `expected ${code}`);
  assert(caught.code === code, `expected ${code}, received ${caught.code}: ${String(caught.message || caught)}`);
  return caught;
}

async function exactWindow(session) {
  const win = await window.wait({ id: session.win.id }, { timeout: 10000, polling: 100 });
  assert(win.id === session.win.id && win.pid === session.win.pid && win.handle === session.win.handle,
    `window.wait did not preserve fixture identity: ${JSON.stringify(win)}`);
  return win;
}

async function captureWindow(win, output) {
  const fresh = await window.current(win);
  return page.screenshot({
    target: 'screen',
    clip: { x: fresh.x, y: fresh.y, width: fresh.width, height: fresh.height },
    path: output,
    returnType: 'path',
  });
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
    row.evidence = await body();
    row.status = 'passed';
  } catch (error) {
    row.status = 'failed';
    row.error = { code: error && error.code || null, message: String(error && error.message || error) };
    throw error;
  } finally {
    row.finishedAt = new Date().toISOString();
    await File.writeJSON(resultPath, report, { spaces: 2 });
  }
}

try {
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
    const screenshotDir = File.join(evidenceRoot, 'screenshots');
    File.ensureDir(screenshotDir);
    const beforeScreenshot = File.join(screenshotDir, 'visual-before.png');
    const afterScreenshot = File.join(screenshotDir, 'visual-after.png');
    await captureWindow(win, beforeScreenshot);
    const app = UI.within(win);
    assert(typeof app.locator === 'function', 'scope.locator is missing');
    const next = app.locator({ text: '下一步' });
    const observed = await next.find();
    assert(observed && observed.source === 'ocr' && observed.bounds, `text find did not return OCR evidence: ${JSON.stringify(observed)}`);
    await next.waitFor({ state: 'visible', timeout: 10000 });

    // The Locator checks visual capability dynamically. Hiding the native
    // object for this observation proves UI tree absence cannot disable OCR.
    const nativeAccessibility = globalThis.Accessibility;
    try {
      globalThis.Accessibility = undefined;
      const noTree = await app.locator({ text: '下一步' }).find();
      assert(noTree && noTree.source === 'ocr', `text locator depended on UI tree: ${JSON.stringify(noTree)}`);
    } finally {
      globalThis.Accessibility = nativeAccessibility;
    }

    await fixture.waitForActive(await window.current(win));
    const tap = await next.tap();
    assert(tap && tap.ok === true && tap.action === 'tapText', `text tap was not delegated: ${JSON.stringify(tap)}`);
    const waiting = await fixture.waitForState(session, state => Number(state.nextClicks) === 1 && Number(state.movedAtMs) > 0);
    const moved = await window.current(win);
    assert(moved.id === win.id && (moved.x !== win.x || moved.y !== win.y) && moved.width !== win.width,
      `same window geometry did not refresh after move/resize: ${JSON.stringify({ before: win, moved })}`);
    const confirm = app.locator({ text: '确认' });
    await confirm.waitFor({ state: 'visible', timeout: 10000 });
    const confirmObserved = await confirm.find();
    assert(confirmObserved && confirmObserved.window && confirmObserved.window.bounds.width === moved.width,
      `old Scope did not refresh moved/resized geometry: ${JSON.stringify({ confirmObserved, moved })}`);
    await fixture.waitForActive(await window.current(moved));
    await confirm.tap();
    const done = await fixture.waitForState(session, state => state.phase === 'complete');
    await captureWindow(moved, afterScreenshot);
    assert(Number(done.nextClicks) === 1 && Number(done.confirmClicks) === 1, JSON.stringify(done));
    return { initialWindow: { id: win.id, x: win.x, y: win.y, width: win.width },
      movedWindow: { x: moved.x, y: moved.y, width: moved.width },
      observed, screenshots: { beforeScreenshot, afterScreenshot },
      state: { nextClicks: Number(done.nextClicks), confirmClicks: Number(done.confirmClicks) } };
  }));

  await scenario('image-find-wait-tap', async () => withSession(paths, 'image', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const app = UI.within(win);
    const text = app.locator({ text: '下一步' });
    const observed = await text.find();
    assert(observed && observed.bounds, `cannot create repository-owned image template without text bounds: ${JSON.stringify(observed)}`);
    // The OCR word box alone can also occur in surrounding copy. Include the
    // full button chrome while preserving a center point inside that button.
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
    return { template, crop, imageMatch, nextClicks: Number(state.nextClicks) };
  }));

  await scenario('semantic-native-and-value-roundtrip', async () => withSession(paths, 'semantic', 'flow', 500, async session => {
    const win = await exactWindow(session);
    const app = UI.within(win);
    const button = app.locator({ role: 'button', identifier: 'fixture.next' });
    await button.waitFor({ state: 'exists', timeout: 10000 });
    const observed = await button.find();
    assert(observed && observed.source === 'accessibility' && observed.identifier === 'fixture.next',
      `semantic find did not return native evidence: ${JSON.stringify(observed)}`);
    await fixture.waitForActive(await window.current(win));
    const tap = await button.tap();
    assert(tap && tap.ok === true && tap.action === 'tapTargets', `semantic tap was not delegated: ${JSON.stringify(tap)}`);
    const clicked = await fixture.waitForState(session, state => Number(state.nextClicks) === 1);

    const input = app.locator({ role: 'textField', identifier: 'fixture.messageInput' });
    await input.waitFor({ state: 'exists', timeout: 10000 });
    const before = await input.getValue();
    assert(typeof before === 'string', `native text field did not expose a string value: ${JSON.stringify(before)}`);
    const marker = '你好，Locator 原生回读';
    const receipt = await input.setValue(marker);
    assert(receipt && receipt.verified === true && receipt.actionState === 'acknowledged', JSON.stringify(receipt));
    const after = await input.getValue();
    assert(after === marker, `locator native value mismatch: ${JSON.stringify({ marker, after })}`);
    const state = await fixture.waitForState(session, value => value.messageInput === marker);

    let ref = null;
    try {
      ref = await Accessibility.find({ role: 'textField', identifier: 'fixture.messageInput' }, { within: await window.current(win) });
      assert(ref, 'independent Accessibility value check could not locate fixture input');
      const direct = await Accessibility.read(ref, { properties: ['role', 'value'] });
      assert(direct && direct.properties && direct.properties.role === 'textField' && direct.properties.value === marker,
        `independent native readback mismatch: ${JSON.stringify(direct)}`);
    } finally {
      if (ref) assert(await Accessibility.release(ref) === true, 'independent native ref was not released');
    }
    return { semantic: observed, tap, nextClicks: Number(clicked.nextClicks), before, marker, stateValue: state.messageInput };
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
  report.error = { code: error && error.code || null, message: String(error && error.message || error) };
  await File.writeJSON(resultPath, report, { spaces: 2 });
  throw error;
}
