// Explicit macOS native-listener + Custom UI lifecycle acceptance.
// It injects only an otherwise unused F18 key and clicks its own stop control.
// Run from the repository root:
// ./dist/opendesk -ui -allow-recorder-capture -script tests/runtime-api/recorder-native-stop-macos.js -console-mode script
'use strict';

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details === undefined ? '' : `: ${JSON.stringify(details)}`;
  throw new Error(`${message}${suffix}`);
}

function parseRaw(file) {
  return String(File.read(file)).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`raw event line ${index + 1} is invalid: ${error.message}`);
    }
  });
}

if (System.getPlatformInfo().os !== 'darwin') {
  console.log('[SKIP] Recorder native stop acceptance requires macOS.');
} else {
  assert(typeof FloatingWindow === 'function',
    'FloatingWindow is unavailable; run this acceptance with -ui');
  const capabilities = Recorder.getCapabilities();
  assert(capabilities.capture && capabilities.capture.available === true,
    'Recorder native capture is unavailable', capabilities.capture);

  const evidenceDir = File.join(
    Execution.workdir, '.runtime', 'tests', 'runtime-api',
    'recorder-native-stop-macos', `${Date.now()}-${Execution.id}`,
  );
  await File.ensureDir(evidenceDir);

  let session = null;
  let pendingStop = null;
  const toolbar = new FloatingWindow({
    position: {
      mode: 'anchor', horizontal: 'center', vertical: 'top',
      margin: 24, display: 'primary',
    },
    title: 'Recorder native stop acceptance',
    alwaysOnTop: true,
    draggable: true,
  });
  toolbar.addButton('stop', '停止录制验收', 'stop.fill', async event => {
    const current = session;
    const pending = pendingStop;
    if (!current || !pending) return;
    try {
      const exclusion = await current.excludeControlClick(event);
      const startedAt = Date.now();
      const saved = await current.stop();
      const stopDurationMs = Date.now() - startedAt;
      session = null;
      pending.resolve({exclusion, saved, stopDurationMs});
    } catch (error) {
      pending.reject(error);
    }
  });

  const stops = [];
  try {
    const activeBeforeShow = await window.getActiveWindow();
    const shown = await toolbar.show();
    const activeAfterShow = await window.getActiveWindow();
    const activePID = value => Number(value && (value.pid || value.processID));
    assert(activePID(activeAfterShow) === activePID(activeBeforeShow)
      && activePID(activeAfterShow) !== Number(shown.hostPid),
    'nonactivating Recorder toolbar changed the foreground application', {
      activeBeforeShow, activeAfterShow, shown,
    });
    const visual = await Screen.screenshot({
      clip: shown.bounds,
      path: File.join(evidenceDir, 'recorder-stop-toolbar.png'),
      returnType: 'object',
    });
    assert(visual && visual.sizeBytes > 100,
      'Recorder stop toolbar screenshot was not saved', visual);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const active = await window.getActiveWindow();
      const within = {
        processId: activePID(active),
        title: String(active && active.title || ''),
      };
      assert(Number.isInteger(within.processId) && within.processId > 0 && within.title,
        'active window identity is incomplete', active);

      session = await Recorder.start({
        within,
        captureKeyboard: false,
        evidence: 'none',
        maxDurationMs: 15000,
      });
      assert(session.status().captureState === 'recording',
        `attempt ${attempt} did not start recording`, session.status());

      const beforeKey = session.status();
      await keyboard.press('F18');
      await page.waitForTimeout(100);
      const afterKey = session.status();
      assert(afterKey.captureState === 'recording'
        && afterKey.counts.accepted === beforeKey.counts.accepted,
      `attempt ${attempt} leaked disabled keyboard input into raw`, {beforeKey, afterKey});

      const completion = new Promise((resolve, reject) => { pendingStop = {resolve, reject}; });
      const button = await toolbar.getButtonState('stop');
      await mouse.click(
        button.screenBounds.x + button.screenBounds.width / 2,
        button.screenBounds.y + button.screenBounds.height / 2,
      );
      const result = await completion;
      pendingStop = null;
      assert(result.saved.captureState === 'stopped' && result.saved.storageState === 'saved',
        `attempt ${attempt} did not stop cleanly`, result);
      assert(result.exclusion.matchStatus === 'matched'
        && result.exclusion.eventIds.length >= 2,
      `attempt ${attempt} did not exclude its native stop click`, result.exclusion);
      assert(!result.saved.issues.some(issue => issue.code === 'backend-stop-failed'),
        `attempt ${attempt} retained a backend stop failure`, result.saved);
      assert(result.stopDurationMs < 4000,
        `attempt ${attempt} approached the native stop deadline`, result);

      const events = parseRaw(result.saved.rawFile);
      assert(!events.some(event => /^KEY_/.test(event.libraryEvent)),
        `attempt ${attempt} persisted keyboard input while disabled`, events);
      const control = events.filter(event => event.libraryEvent === 'RECORDER_CONTROL_CLICK');
      assert(control.length === 1 && control[0].metadata.targetId === 'stop',
        `attempt ${attempt} did not persist one stop control boundary`, control);

      const built = await Recorder.buildActions(result.saved.recordingDir);
      assert(built.readiness === 'needs-review' && built.actionCount === 0
        && built.issues.length === 1 && built.issues[0].code === 'no-supported-actions',
      `attempt ${attempt} did not build the expected non-blocked control-only action set`, built);
      stops.push({
        attempt,
        beforeKey,
        afterKey,
        exclusion: result.exclusion,
        stopDurationMs: result.stopDurationMs,
        saved: result.saved,
        built,
      });
    }
  } finally {
    pendingStop = null;
    if (session) {
      try { await session.stop(); } catch (_) { /* preserve the primary failure */ }
    }
    await toolbar.close();
  }

  const summary = {passed: true, evidenceDir, stops};
  await File.writeJSON(File.join(evidenceDir, 'summary.json'), summary);
  console.log('RECORDER_NATIVE_STOP_MACOS=' + JSON.stringify(summary));
}
