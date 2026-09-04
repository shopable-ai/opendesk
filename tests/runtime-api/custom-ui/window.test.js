(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'ui.createWindow retains the restricted WKWebView Custom UI path',
    tier: 'custom-ui',
    covers: ['ui.getCapabilities', 'ui.createWindow', 'WindowHandle.setPlacement', 'ui.on', 'ui.closeAll'],
  }, async () => {
    const capabilities = ui.getCapabilities();
    equal(capabilities.enabled, true);
    equal(capabilities.available, true, capabilities.reason);
    equal(capabilities.activationSource, 'cli');
    equal(capabilities.window.placement, true, 'framework placement capability is unavailable');
    let closeEvents = 0;
    const offClose = ui.on('close', event => { if (event.windowId === 'runtimeAPIPanel') closeEvents += 1; });
    const panel = await ui.createWindow({
      id: 'runtimeAPIPanel', kind: 'floating', title: 'Runtime API Custom UI',
      position: {
        mode: 'anchor', size: { width: 460, height: 180 },
        horizontal: 'left', vertical: 'top', margin: 24, display: 'primary',
      },
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
    const primary = Screen.getPrimaryDisplay();
    assert(shown.bounds.x - primary.x >= 24 && shown.bounds.y - primary.y >= 24,
      'initial generic window placement crossed the primary display margin');
    const placed = await panel.setPlacement({ horizontal: 'right', vertical: 'bottom', margin: 24, display: 'primary' });
    assert(primary.x + primary.width - (placed.bounds.x + placed.bounds.width) >= 24,
      'dynamic generic window right placement crossed the primary display margin');
    assert(primary.y + primary.height - (placed.bounds.y + placed.bounds.height) >= 24,
      'dynamic generic window bottom placement crossed the primary display margin');
    equal((await panel.close()).status, 'closed');
    equal((await panel.waitUntilClosed()).onScreen, false);
    equal(closeEvents, 1);
    offClose();
    await ui.closeAll();
  });

  test({
    name: 'ui.createWindow requires one unambiguous initial positioning mode',
    tier: 'custom-ui',
    covers: ['ui.createWindow'],
  }, async () => {
    const content = { html: '<!doctype html><html><body><span id="status">Position</span></body></html>' };
    const bounds = { x: 100, y: 100, width: 320, height: 120 };
    const size = { width: 320, height: 120 };
    const placement = { horizontal: 'right', vertical: 'center', margin: 16, display: 'primary' };
    let sequence = 0;
    const expectPositioningError = async positioning => {
      sequence += 1;
      let error = null;
      try {
        await ui.createWindow({ id: 'invalidPositioning' + sequence, content, ...positioning });
      } catch (caught) {
        error = caught;
      }
      assert(error, 'ambiguous or incomplete positioning declaration was accepted');
      equal(error.code, 'INVALID_SPEC');
      equal(error.operation, 'createWindow');
    };

    await expectPositioningError({ bounds, position: { mode: 'absolute', bounds } });
    await expectPositioningError({ position: { mode: 'absolute', bounds, margin: 0 } });
    await expectPositioningError({ position: { mode: 'absolute', size } });
    await expectPositioningError({ position: { mode: 'anchor', ...placement } });
    await expectPositioningError({ position: { mode: 'anchor', size, ...placement, bounds } });
    await expectPositioningError({ position: { mode: 'anchor', size, ...placement, display: 'current' } });
    await expectPositioningError({ size, placement });
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
    name: 'ui.createWindow close invalidates a workbench handle and requires a fresh window id',
    tier: 'custom-ui',
    covers: ['ui.createWindow', 'WindowHandle.close', 'WindowHandle.waitUntilClosed', 'WindowHandle.control', 'WindowHandle.on'],
  }, async () => {
    const recordingController = File.read(File.join(File.cwd(), 'examples', 'custom-ui', 'recording-console.js'));
    for (const fragment of [
      'let settings = null;',
      'let settingsGeneration = 0;',
      'async function withSettings(update)',
      'panel.on("close"',
      'async function createSettingsWindow()'
    ]) {
      assert(recordingController.includes(fragment), 'recording console lost lifecycle protection: ' + fragment);
    }
    assert(!/settings\.control\s*\(/.test(recordingController), 'recording console directly accesses a replaceable workbench handle');

    const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<header id="drag" data-clawdesk-drag>Lifecycle</header><button id="action">Action</button><span id="status">Ready</span>'
      + '</body></html>';
    const css = 'html,body{height:100%;margin:0}body{background:#172033;color:#f8fafc;font:14px -apple-system,sans-serif}'
      + 'header{height:42px;display:flex;align-items:center;padding:0 14px;background:#1f2a40}button{margin:16px;padding:8px 12px}';
    const spec = id => ({
      id, kind: 'floating', title: 'Lifecycle',
      bounds: { x: 220, y: 170, width: 380, height: 170 }, alwaysOnTop: true, draggable: true,
      content: { html, css },
    });

    const tray = await ui.createWindow(spec('runtimeAPILifecycleTray'));
    let activeWorkbench = null;
    let closeEvents = 0;
    const first = await ui.createWindow(spec('runtimeAPIWorkbenchFirst'));
    activeWorkbench = first;
    first.on('close', async () => {
      if (activeWorkbench === first) activeWorkbench = null;
      closeEvents += 1;
    });

    const trayShown = await tray.show();
    const firstShown = await first.show();
    assert(trayShown.onScreen && firstShown.onScreen);
    equal((await first.close()).status, 'closed');
    equal((await first.waitUntilClosed()).status, 'closed');
    equal(closeEvents, 1);
    equal(activeWorkbench, null);

    let staleError = null;
    try {
      await first.control('status').update({ text: 'must not update a closed window' });
    } catch (error) {
      staleError = error;
    }
    assert(staleError, 'a closed workbench handle unexpectedly accepted a control update');
    assert(['NOT_FOUND', 'INVALID_STATE'].includes(staleError.code), 'unexpected stale-handle error: ' + staleError.code);

    // The still-visible tray represents the first controller surface. Its
    // update must remain independent of the workbench terminal handle.
    await tray.control('status').update({ text: '区域' });
    equal((await tray.control('status').getState()).text, '区域');

    let duplicateError = null;
    try {
      await ui.createWindow(spec('runtimeAPIWorkbenchFirst'));
    } catch (error) {
      duplicateError = error;
    }
    assert(duplicateError, 'a closed window id unexpectedly became reusable');
    equal(duplicateError.code, 'DUPLICATE_ID');

    const second = await ui.createWindow(spec('runtimeAPIWorkbenchSecond'));
    activeWorkbench = second;
    const secondShown = await second.show();
    assert(secondShown.onScreen && secondShown.alpha > 0);
    await second.control('status').update({ text: '重新创建成功' });
    equal((await second.control('status').getState()).text, '重新创建成功');
    const evidenceDir = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'window-close-reopen');
    const screenshotPath = File.join(evidenceDir, 'reopened-workbench.png');
    await File.ensureDir(evidenceDir);
    const capture = await Screen.screenshot({ clip: secondShown.bounds, path: screenshotPath, returnType: 'object' });
    assert(capture.sizeBytes > 100 && await File.exists(screenshotPath), 'reopened workbench screenshot was not written');

    equal((await second.close()).status, 'closed');
    equal((await second.waitUntilClosed()).status, 'closed');
    equal((await tray.close()).status, 'closed');
    equal((await tray.waitUntilClosed()).status, 'closed');
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
      id: 'recordingTrayFixture', kind: 'floating', title: 'OpenDesk 录屏',
      // Native titlebar is part of the reviewed window frame.
      bounds: { x: 260, y: 130, width: 895, height: 272 }, alwaysOnTop: true, draggable: true, theme: 'dark',
      content: { html: 'recording-console/tray.html', cssFile: 'recording-console/tray.css' },
    });
    const trayIDs = tray.controls().map(control => control.id);
    for (const id of [
      'trayShell', 'trayDrag', 'trayState', 'trayMode', 'trayRegion', 'trayAudio', 'trayCamera', 'trayCapture',
      'trayStart', 'trayPause', 'trayStop', 'trayExpand', 'trayWorkspace', 'trayExpanded', 'trayClose',
      'trayTimer', 'trayRunningTarget', 'trayRunningCamera', 'trayRunningDraw', 'trayRunningWindow',
      'traySourceFull', 'traySourceRegion', 'traySourceWindow', 'trayOptionSystemAudio',
      'trayOptionMicrophone', 'trayOptionCamera', 'trayOptionMousePointer', 'trayQuickSchedule',
      'trayFrameRate', 'trayQuality'
    ]) {
      assert(trayIDs.includes(id), 'recording tray control is missing: ' + id);
    }
    const trayShown = await tray.show();
    assert(trayShown.onScreen && trayShown.alpha > 0 && trayShown.hostPid > 0 && trayShown.nativeWindowId > 0);
    equal(trayShown.bounds.width, 895);
    equal(trayShown.bounds.height, 272);
    const evidenceDir = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'recording-console');
    await File.ensureDir(evidenceDir);
    const trayCapture = await Screen.screenshot({ clip: trayShown.bounds, path: File.join(evidenceDir, 'tray.png'), returnType: 'object' });
    assert(trayCapture.sizeBytes > 100 && await File.exists(File.join(evidenceDir, 'tray.png')), 'recording tray screenshot was not written');
    // Verify the same public control mutations used by the controller without
    // routing a physical click to a Recorder-adjacent surface.
    await tray.control('trayState').update({ text: '录制中', classes: ['tray-state', 'is-recording'] });
    await tray.control('trayStart').update({ disabled: true });
    await tray.control('trayPause').update({ disabled: false });
    await tray.control('trayStop').update({ disabled: false });
    equal((await tray.control('trayState').getState()).text, '录制中');
    assert((await tray.control('trayStart').getState()).disabled);
    assert(!(await tray.control('trayPause').getState()).disabled);
    assert(!(await tray.control('trayStop').getState()).disabled);
    await tray.setBounds({ ...trayShown.bounds, height: 426 });
    await tray.control('trayExpanded').update({ visible: true });
    const expanded = await tray.getState();
    assert(expanded.onScreen && expanded.alpha > 0);
    equal(expanded.bounds.height, 426);
    const expandedPath = File.join(evidenceDir, 'tray-expanded.png');
    const expandedCapture = await Screen.screenshot({ clip: expanded.bounds, path: expandedPath, returnType: 'object' });
    assert(expandedCapture.sizeBytes > 100 && await File.exists(expandedPath), 'expanded recording tray screenshot was not written');

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
