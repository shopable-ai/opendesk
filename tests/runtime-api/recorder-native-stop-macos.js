// Explicit macOS native-listener + Custom UI lifecycle acceptance.
// It verifies both keyboard-disabled filtering and keyboard-enabled shutdown
// with one harmless ArrowLeft pair, then clicks its own stop control.
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

    const scenarios = [
      {name: 'keyboard-disabled', captureKeyboard: false},
      {name: 'keyboard-enabled', captureKeyboard: true},
    ];
    for (let index = 0; index < scenarios.length; index += 1) {
      const attempt = index + 1;
      const scenario = scenarios[index];
      const active = await window.getActiveWindow();
      const within = {
        processId: activePID(active),
        title: String(active && active.title || ''),
      };
      assert(Number.isInteger(within.processId) && within.processId > 0 && within.title,
        'active window identity is incomplete', active);

      session = await Recorder.start({
        within,
        captureKeyboard: scenario.captureKeyboard,
        ...(scenario.captureKeyboard ? {keyboardContent: 'non-sensitive-test'} : {}),
        evidence: 'none',
        maxDurationMs: 15000,
      });
      assert(session.status().captureState === 'recording',
        `attempt ${attempt} did not start recording`, session.status());

      const beforeKey = session.status();
      await keyboard.press('ArrowLeft');
      await page.waitForTimeout(150);
      const afterKey = session.status();
      assert(afterKey.captureState === 'recording',
        `attempt ${attempt} stopped while processing ${scenario.name} input`, {beforeKey, afterKey});
      if (scenario.captureKeyboard) {
        assert(afterKey.counts.accepted >= beforeKey.counts.accepted + 2,
          `attempt ${attempt} did not capture the enabled ArrowLeft press/release pair`, {beforeKey, afterKey});
      } else {
        assert(afterKey.counts.accepted === beforeKey.counts.accepted,
          `attempt ${attempt} leaked disabled keyboard input into raw`, {beforeKey, afterKey});
      }

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
      const keyEvents = events.filter(event => /^KEY_/.test(event.libraryEvent));
      if (scenario.captureKeyboard) {
        const keyPressed = keyEvents.filter(event => event.libraryEvent === 'KEY_PRESSED');
        const keyReleased = keyEvents.filter(event => event.libraryEvent === 'KEY_RELEASED');
        assert(keyPressed.length === 1 && keyReleased.length === 1
          && keyPressed[0].keycode === keyReleased[0].keycode
          && keyPressed[0].rawcode === keyReleased[0].rawcode,
        `attempt ${attempt} did not persist a complete enabled keyboard envelope`, keyEvents);
        assert(!result.saved.issues.some(issue => issue.code === 'key-still-pressed-at-stop'
          || issue.code === 'key-release-not-observed-at-stop'),
        `attempt ${attempt} reported an unresolved physical key at stop`, result.saved);
      } else {
        assert(keyEvents.length === 0,
          `attempt ${attempt} persisted keyboard input while disabled`, keyEvents);
      }
      const control = events.filter(event => event.libraryEvent === 'RECORDER_CONTROL_CLICK');
      assert(control.length === 1 && control[0].metadata.targetId === 'stop',
        `attempt ${attempt} did not persist one stop control boundary`, control);

      const built = await Recorder.buildActions(result.saved.recordingDir);
      if (scenario.captureKeyboard) {
        assert(built.readiness === 'ready' && built.actionCount === 1
          && built.issues.length === 0,
        `attempt ${attempt} did not build the expected ArrowLeft special-key action`, built);
      } else {
        assert(built.readiness === 'needs-review' && built.actionCount === 0
          && built.issues.length === 1 && built.issues[0].code === 'no-supported-actions',
        `attempt ${attempt} did not build the expected non-blocked control-only action set`, built);
      }
      stops.push({
        attempt,
        scenario,
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
