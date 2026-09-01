(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'ui.createWindow retains the restricted WKWebView Custom UI path',
    tier: 'custom-ui',
    covers: ['ui.getCapabilities', 'ui.createWindow', 'ui.on', 'ui.closeAll'],
  }, async () => {
    const capabilities = ui.getCapabilities();
    equal(capabilities.enabled, true);
    equal(capabilities.available, true, capabilities.reason);
    equal(capabilities.activationSource, 'cli');
    let closeEvents = 0;
    const offClose = ui.on('close', event => { if (event.windowId === 'runtimeAPIPanel') closeEvents += 1; });
    const panel = await ui.createWindow({
      id: 'runtimeAPIPanel', kind: 'floating', title: 'Runtime API Custom UI',
      bounds: { x: 140, y: 140, width: 460, height: 180 }, alwaysOnTop: true, draggable: true,
      content: {
        html: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="drag" data-clawdesk-drag>Runtime API</div><button id="save">Save</button><span id="status">Idle</span></body></html>',
        css: 'body{margin:0;background:#111827;color:white;font:14px -apple-system,sans-serif}#drag{padding:18px}button{margin:12px;padding:8px}',
      },
    });
    equal(panel.controls().map(control => control.id).join(','), 'drag,save,status');
    await panel.control('status').update({ text: 'Ready' });
    equal((await panel.control('status').getState()).text, 'Ready');
    const shown = await panel.show();
    assert(shown.onScreen && shown.alpha > 0 && shown.hostPid > 0 && shown.nativeWindowId > 0);
    equal((await panel.close()).status, 'closed');
    equal((await panel.waitUntilClosed()).onScreen, false);
    equal(closeEvents, 1);
    offClose();
    await ui.closeAll();
  });

  test({
    name: 'ui.createWindow loads a script-relative HTML file through content.html',
    tier: 'custom-ui',
    covers: ['ui.createWindow'],
  }, async () => {
    // The formal runner executes its generated script from this directory, so
    // this fixture proves the same script-relative lookup users receive.
    const fixtureDir = File.join(RuntimeAPITest.context.runDir, 'generated', 'relative-html-content');
    await File.ensureDir(fixtureDir);
    await File.write(File.join(fixtureDir, 'panel.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<header id="fileDrag" data-clawdesk-drag>File panel</header>'
      + '<main><button id="fileSave">Save</button><span id="fileStatus">Ready</span></main>'
      + '</body></html>');

    const panel = await ui.createWindow({
      id: 'relativeHTMLPanel', kind: 'floating', title: 'Relative HTML',
      bounds: { x: 160, y: 160, width: 360, height: 160 }, draggable: true,
      content: {
        html: 'relative-html-content/panel.html',
        css: 'html,body{height:100%;margin:0}body{background:#111827;color:#f8fafc;font:14px -apple-system,sans-serif}'
          + 'header{height:44px;padding:0 16px;display:flex;align-items:center;background:#1e293b;user-select:none}'
          + 'main{height:116px;box-sizing:border-box;padding:20px 16px;display:flex;align-items:center;gap:12px}'
          + 'button{padding:8px 14px;border:0;border-radius:6px;background:#2563eb;color:white}',
      },
    });
    equal(panel.controls().map(control => control.id).join(','), 'fileDrag,fileSave,fileStatus');
    const shown = await panel.show();
    assert(shown.onScreen && shown.alpha > 0 && shown.hostPid > 0 && shown.nativeWindowId > 0);
    const evidenceDir = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'relative-html-content');
    const screenshotPath = File.join(evidenceDir, 'visible.png');
    await File.ensureDir(evidenceDir);
    const capture = await Screen.screenshot({ clip: shown.bounds, path: screenshotPath, returnType: 'object' });
    assert(capture.sizeBytes > 100 && await File.exists(screenshotPath), 'relative HTML window screenshot was not written');
    equal((await panel.close()).status, 'closed');
    equal((await panel.waitUntilClosed()).onScreen, false);
    await ui.closeAll();
  });

  test({
    name: 'ui.createWindow renders the compact file-backed recording tray and expandable settings page',
    tier: 'custom-ui',
    covers: ['ui.createWindow'],
  }, async () => {
    const exampleRoot = File.join(File.cwd(), 'examples', 'custom-ui', 'recording-console');
    const fixtureDir = File.join(RuntimeAPITest.context.runDir, 'generated', 'recording-console');
    await File.ensureDir(fixtureDir);
    const fixtureIconDir = File.join(fixtureDir, 'icons');
    await File.ensureDir(fixtureIconDir);
    await File.write(File.join(fixtureDir, 'recorder.html'), File.read(File.join(exampleRoot, 'recorder.html')));
    await File.write(File.join(fixtureDir, 'recorder.css'), File.read(File.join(exampleRoot, 'recorder.css')));
    await File.write(File.join(fixtureDir, 'tray.html'), File.read(File.join(exampleRoot, 'tray.html')));
    await File.write(File.join(fixtureDir, 'tray.css'), File.read(File.join(exampleRoot, 'tray.css')));
    for (const icon of [
      'screen.png', 'region.png', 'audio.png', 'camera.png', 'window.png', 'microphone.png',
      'pointer.png', 'pause.png', 'stop.png', 'timer.png', 'snapshot.png', 'tools.png', 'library.png'
    ]) {
      await File.copy(File.join(exampleRoot, 'icons', icon), File.join(fixtureIconDir, icon));
    }

    const tray = await ui.createWindow({
      id: 'recordingTrayFixture', kind: 'floating', title: '',
      bounds: { x: 260, y: 130, width: 600, height: 135 }, alwaysOnTop: true, draggable: true, theme: 'dark',
      content: { html: 'recording-console/tray.html', cssFile: 'recording-console/tray.css' },
    });
    const trayIDs = tray.controls().map(control => control.id);
    for (const id of ['trayDrag', 'trayState', 'trayMode', 'trayAudio', 'trayCapture', 'trayStart', 'trayPause', 'trayStop', 'trayExpand', 'trayClose']) {
      assert(trayIDs.includes(id), 'recording tray control is missing: ' + id);
    }
    let trayStartCount = 0;
    tray.control('trayStart').on('click', async () => {
      trayStartCount += 1;
      await tray.control('trayState').update({ text: '录制中', classes: ['tray-state', 'is-recording'] });
      await tray.control('trayStart').update({ disabled: true });
      await tray.control('trayPause').update({ disabled: false });
      await tray.control('trayStop').update({ disabled: false });
    });
    const trayShown = await tray.show();
    assert(trayShown.onScreen && trayShown.alpha > 0 && trayShown.hostPid > 0 && trayShown.nativeWindowId > 0);
    const evidenceDir = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'recording-console');
    await File.ensureDir(evidenceDir);
    const trayCapture = await Screen.screenshot({ clip: trayShown.bounds, path: File.join(evidenceDir, 'tray.png'), returnType: 'object' });
    assert(trayCapture.sizeBytes > 100 && await File.exists(File.join(evidenceDir, 'tray.png')), 'recording tray screenshot was not written');
    // The center is derived from the reviewed 600x135 tray geometry.  AXPress
    // is fail-closed to this host PID, so this cannot fall through to a global
    // desktop click or trigger a Recorder session.
    await mouse.clickForPID(trayShown.hostPid, trayShown.bounds.x + 440, trayShown.bounds.y + 102);
    const startDeadline = Date.now() + 3000;
    while (trayStartCount === 0 && Date.now() < startDeadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    equal(trayStartCount, 1, 'the compact tray start control was not invoked exactly once');
    equal((await tray.control('trayState').getState()).text, '录制中');
    assert((await tray.control('trayStart').getState()).disabled);
    assert(!(await tray.control('trayPause').getState()).disabled);
    assert(!(await tray.control('trayStop').getState()).disabled);

    const panel = await ui.createWindow({
      id: 'recordingSettingsFixture', kind: 'floating', title: '',
      bounds: { x: 180, y: 120, width: 860, height: 610 }, alwaysOnTop: true, draggable: true, theme: 'dark',
      content: { html: 'recording-console/recorder.html', cssFile: 'recording-console/recorder.css' },
    });
    const ids = panel.controls().map(control => control.id);
    for (const id of ['dragbar', 'collapse', 'modeFull', 'modeRegion', 'modeWindow', 'systemAudio', 'microphone', 'camera', 'mousePointer', 'frameRate', 'quality', 'start', 'pause', 'capture', 'stop', 'recordingState', 'recordingDetail']) {
      assert(ids.includes(id), 'recording console control is missing: ' + id);
    }
    await panel.control('recordingDetail').update({ text: 'Native file-backed preview ready.' });
    const shown = await panel.show();
    assert(shown.onScreen && shown.alpha > 0 && shown.hostPid > 0 && shown.nativeWindowId > 0);
    const screenshotPath = File.join(evidenceDir, 'visible.png');
    await File.ensureDir(evidenceDir);
    const capture = await Screen.screenshot({ clip: shown.bounds, path: screenshotPath, returnType: 'object' });
    assert(capture.sizeBytes > 100 && await File.exists(screenshotPath), 'recording console screenshot was not written');
    equal((await panel.close()).status, 'closed');
    equal((await panel.waitUntilClosed()).onScreen, false);
    equal((await tray.close()).status, 'closed');
    equal((await tray.waitUntilClosed()).onScreen, false);
    await ui.closeAll();
  });
})();
