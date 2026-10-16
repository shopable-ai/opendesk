// Run from the repository root after scripts/build_macos_app.sh:
// ./dist/opendesk -ui -script tests/runtime-api/floating-window-padding-macos.js -console-mode script
'use strict';

function assert(condition, message, details) {
  if (!condition) throw new Error(message + ': ' + JSON.stringify(details));
}

if (System.getPlatformInfo().os !== 'darwin') {
  console.log('[SKIP] FloatingWindow padding qualification requires macOS.');
} else {
  const evidenceDir = File.join(Execution.workdir, '.runtime', 'tests', 'runtime-api',
    'floating-window-padding-macos', String(Date.now()) + '-' + Execution.id);
  File.ensureDir(evidenceDir);
  const results = [];
  async function verifyToolbar(name, toolbar, ids) {
    await toolbar.show();
    // Allow WindowServer to publish the first AppKit layout before readback.
    await System.delay(150);
    const states = [];
    for (const id of ids) states.push(await toolbar.getButtonState(id));
    const shown = await toolbar.getState();
    const topPadding = Math.min(...states.map(state => state.localBounds.y));
    const bottomPadding = shown.bounds.y + shown.bounds.height
      - Math.max(...states.map(state => state.screenBounds.y + state.screenBounds.height));
    const screenshot = await Screen.screenshot({clip: shown.bounds,
      path: File.join(evidenceDir, name + '.png'), returnType: 'object'});
    const result = {name, shown, states, topPadding, bottomPadding, screenshot};
    results.push(result);
    File.write(File.join(evidenceDir, 'result.json'), JSON.stringify({
      executable: System.getExecutablePath(), results,
    }, null, 2) + '\n');
    assert(Math.abs(topPadding - 8) < 0.01, 'toolbar top padding must be 8pt', result);
    assert(Math.abs(bottomPadding - 8) < 0.01, 'toolbar bottom padding must be 8pt', result);
    assert(states.every(state => state.localBounds.width === 40 && state.localBounds.height === 40),
      'button hit targets must remain 40pt', states);
    assert(screenshot.sizeBytes > 100, 'native toolbar screenshot missing', screenshot);
  }
  const cases = [
    {name: 'single', count: 1},
    {name: 'horizontal', count: 5},
    {name: 'wrapped', count: 5, toolbar: {maxColumns: 2}},
    {name: 'vertical', count: 3, orientation: 'vertical'},
  ];
  for (const item of cases) {
    const toolbar = new FloatingWindow({
      title: 'OpenDesk — padding ' + item.name,
      position: {mode: 'anchor', horizontal: 'center', vertical: 'center', display: 'primary'},
      ...(item.toolbar ? {toolbar: item.toolbar} : {}),
      ...(item.orientation ? {orientation: item.orientation} : {}),
    });
    for (let index = 0; index < item.count; index++) {
      toolbar.addButton('button' + index, 'Button ' + index, 'play.fill', () => {});
    }
    try {
      await verifyToolbar(item.name, toolbar,
        Array.from({length: item.count}, (_, index) => 'button' + index));
    } finally {
      await toolbar.close();
    }
  }

  // Show the canonical Recorder controller without starting a recording.
  const productRoot = File.join(Execution.workdir, 'apps', 'opendesk');
  const recorderRoot = File.join(productRoot, 'recorder');
  globalThis.__OPENDESK_RECORDER_UI_ROOT = recorderRoot;
  try {
    (0, eval)(File.read(File.join(recorderRoot, 'controller.js')));
  } finally {
    delete globalThis.__OPENDESK_RECORDER_UI_ROOT;
  }
  const recorder = OpenDeskSimpleRecordingConsole.createApp({
    recordingsRoot: File.join(evidenceDir, 'recordings'),
  });
  try {
    await recorder.show();
    await verifyToolbar('recorder', recorder.toolbar(),
      ['home', 'capture', 'stop', 'replay', 'agentPrompt', 'task', 'details', 'finder', 'measurement']);
  } finally {
    await recorder.close();
  }
  console.log('FLOATING_WINDOW_PADDING_MACOS_OK=' + JSON.stringify({evidenceDir,
    cases: results.map(item => ({name: item.name, topPadding: item.topPadding, bottomPadding: item.bottomPadding}))}));
}
