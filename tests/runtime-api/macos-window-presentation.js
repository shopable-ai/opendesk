// From the repository root:
// ./dist/opendesk -ui -script tests/runtime-api/macos-window-presentation.js -console-mode script
// Creates only execution-owned test windows; never runs a flow or recording.
'use strict';

function assert(value, message, details) {
  if (!value) throw new Error(message + (details === undefined ? '' : ': ' + JSON.stringify(details)));
}

function flatten(node) {
  return node ? [node].concat(...(node.children || []).map(flatten)) : [];
}

async function waitFor(read, expected, message) {
  const deadline = Date.now() + 5000;
  let actual;
  do {
    actual = await read();
    if (actual === expected) return actual;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert(false, message, {expected, actual});
}

// The native ID comes from this execution's own handle, never a title search.
async function scope(state, title) {
  return window.current({id: `darwin:${state.hostPid}:native:${state.nativeWindowId}`,
    pid: state.hostPid, handle: state.nativeWindowId, title, ...state.bounds});
}

async function tree(state, title) {
  return Accessibility.snapshot({within: await scope(state, title), maxDepth: 6, maxNodes: 200,
    properties: ['role', 'nativeSubrole', 'name', 'identifier', 'enabled', 'actions']});
}

async function minimize(handle, title) {
  console.log("MINIMIZE_BEGIN=" + title);
  let button;
  const deadline = Date.now() + 3000;
  do {
    try {
      const shown = await handle.getState();
      button = await Accessibility.find({identifier: 'opendesk.window.minimize'},
        {within: await scope(shown, title), maxDepth: 32, maxNodes: 1000});
      break;
    } catch (error) {
      // Observation only: AppKit/CG geometry may settle after hide/show.
      // The native action below is submitted exactly once.
      if (!['STALE_TARGET', 'SEARCH_INCOMPLETE'].includes(error.code) || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  } while (true);
  console.log("MINIMIZE_FOUND=" + title);
  assert(button, 'exact window has no native minimize action', {title});
  try {
    const action = await Accessibility.perform(button, {action: 'invoke'});
    console.log('MINIMIZE_ACTION=' + JSON.stringify({title,action}));
    assert(action.actionState === 'acknowledged', 'minimize was not acknowledged', action);
  } finally { await Accessibility.release(button); }
  await waitFor(async () => (await handle.getState()).onScreen, false, 'minimized window remains on screen');
}

if (System.getPlatformInfo().os !== 'darwin') {
  console.log('[SKIP] macOS window presentation requires macOS.');
} else {
  const evidenceDir = File.join(Execution.workdir, '.runtime/tests/window-presentation', String(Date.now()));
  File.ensureDir(evidenceDir);
  const toolbar = new FloatingWindow({title: 'OpenDesk Window Test', toolbar: {maxRows: 1}});
  const second = new FloatingWindow({title: 'Recorder Window Test', toolbar: {maxRows: 1}});
  const vertical = new FloatingWindow({title: 'Vertical Window Test', orientation: 'vertical'});
  for (const [id, label] of [['one', '第一个'], ['two', '第二个'], ['three', '第三个'], ['four', '第四个']]) {
    toolbar.addButton(id, label, {text: label});
    second.addButton(id, label, {text: label});
  }
  vertical.addButton('one', '竖向工具', {text: '竖向'});
  const checks = [];
  let page;
  let otherPage;
  try {
    const shown = await toolbar.show();
    assert(shown.visible && shown.onScreen && shown.hostPid > 0, 'test toolbar must be native and on screen', shown);
    const snapshot = await tree(shown, 'OpenDesk Window Test');
    File.write(File.join(evidenceDir, 'toolbar-ax.json'), JSON.stringify(snapshot, null, 2));
    const nodes = flatten(snapshot.root);
    const minimizeButtons = nodes.filter(node => node.nativeSubrole === 'AXMinimizeButton');
    assert(minimizeButtons.length === 1 && minimizeButtons[0].enabled === true,
      'horizontal native toolbar must expose one enabled minimize button', minimizeButtons);
    assert(!nodes.some(node => node.nativeSubrole === 'AXZoomButton'),
      'fixed native toolbar must hide its inapplicable zoom button');
    const screenshot = await Screen.screenshot({clip: shown.bounds, path: File.join(evidenceDir, 'toolbar.png'), returnType: 'object'});
    assert(screenshot.sizeBytes > 100, 'toolbar screenshot is required', screenshot);
    const host = () => App.list().find(item => item.pid === shown.hostPid);
    // NSRunningApplication metadata is cached outside an AppKit run loop.
    // A fresh, read-only JS execution observes each policy transition.
    const policy = async () => {
      const output = await Command.run(System.getExecutablePath(),
        ['-script', File.join(Execution.workdir, 'tests/runtime-api/fixtures/window-policy-observer.js'), '-console-mode', 'script'],
        {env: {OPENDESK_PRESENTATION_OBSERVER_PID: String(shown.hostPid)}, timeout: 10000, emitOutput: false});
      const line = output.stdout.split('\n').find(value => value.includes('WINDOW_POLICY='));
      assert(line, 'fresh host observation missing', output);
      const app = JSON.parse(line.split('WINDOW_POLICY=')[1]);
      assert(app && app.pid === shown.hostPid, 'native host disappeared', app);
      return app.activationPolicy;
    };
    await waitFor(policy, 1, 'visible tools alone must remain accessory');
    assert(host().name === 'OpenDesk' && host().executablePath.endsWith('/OpenDesk UI.app/Contents/MacOS/opendesk-ui-host'),
      'Dock owner must have a real product bundle identity', host());
    checks.push('horizontal-chrome-and-product-identity');

    await minimize(toolbar, 'OpenDesk Window Test');
    await waitFor(policy, 0, 'minimized tool must retain a Dock owner');
    const restored = await toolbar.show();
    assert(restored.nativeWindowId === shown.nativeWindowId && restored.alwaysOnTop === shown.alwaysOnTop,
      'show must restore the same tool and its window level', {shown, restored});
    await waitFor(policy, 1, 'restoring the only minimized tool must clear its temporary Dock owner');
    await minimize(toolbar, 'OpenDesk Window Test');
    await toolbar.hide();
    await waitFor(policy, 1, 'explicitly hiding a minimized tool must remove its Dock ownership');
    await toolbar.show();
    checks.push('minimize-show-restores-same-tool');

    await second.show();
    await minimize(toolbar, 'OpenDesk Window Test');
    await minimize(second, 'Recorder Window Test');
    await toolbar.show();
    assert(await policy() === 0, 'another minimized tool must keep Dock alive');
    await toolbar.hide();
    assert(await policy() === 0, 'hiding a sibling must not orphan a minimized tool');
    await second.show();
    await waitFor(policy, 1, 'last minimized tool restored must clear Dock');
    checks.push('two-minimized-tools');

    const makePage = (id, title) => ui.createWindow({id, kind: 'normal', title,
      position: {mode: 'anchor', size: {width: 560, height: 280}, horizontal: 'center', vertical: 'center'},
      alwaysOnTop: false, content: {html: '<main><strong>原生窗口验收</strong><p>最小化后可恢复原窗口。</p></main>', css: 'main{padding:24px}'}});
    page = await makePage('presentationPage', 'Presentation Page Test');
    otherPage = await makePage('presentationOther', 'Presentation Other Test');
    const pageShown = await page.show();
    await waitFor(policy, 0, 'ordinary page must provide Dock');
    const pageSnapshot = await tree(pageShown, 'Presentation Page Test');
    File.write(File.join(evidenceDir, 'page-ax.json'), JSON.stringify(pageSnapshot, null, 2));
    const pageNodes = flatten(pageSnapshot.root);
    assert(pageNodes.some(node => node.identifier === 'opendesk.window.zoom' && node.enabled), 'ordinary page must retain zoom');
    await Screen.screenshot({clip: pageShown.bounds, path: File.join(evidenceDir, 'page.png'), returnType: 'object'});
    await page.hide();
    await waitFor(policy, 1, 'hidden pages must not keep a stale Dock tile');
    await page.show();
    await minimize(page, 'Presentation Page Test');
    assert(await policy() === 0, 'minimized ordinary page must retain Dock');
    await page.show();
    await otherPage.show();
    await page.close(); page = null;
    assert(await policy() === 0, 'closing one page must preserve the other page Dock');
    await otherPage.close(); otherPage = null;
    await waitFor(policy, 1, 'closing the last page must clear Dock');
    checks.push('ordinary-pages-hide-minimize-and-close');

    const narrow = await vertical.show();
    const verticalNodes = flatten((await tree(narrow, 'Vertical Window Test')).root);
    assert(!verticalNodes.some(node => ['AXMinimizeButton', 'AXZoomButton'].includes(node.nativeSubrole)),
      '60pt vertical toolbar must keep compact native chrome', verticalNodes);
    assert(narrow.bounds.width === 60, 'vertical toolbar geometry changed', narrow);
    await Screen.screenshot({clip: narrow.bounds, path: File.join(evidenceDir, 'vertical.png'), returnType: 'object'});
    checks.push('compact-vertical-chrome');
    const result = {shown, screenshot, evidenceDir, checks, host: host()};
    File.write(File.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log('MACOS_WINDOW_PRESENTATION_OK=' + JSON.stringify(result));
  } finally {
    if (page) await page.close();
    if (otherPage) await otherPage.close();
    await vertical.close();
    await second.close();
    await toolbar.close();
  }
}
