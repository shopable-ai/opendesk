RuntimeAPITest.contractObject('Recorder');

(() => {
  const { assert, equal, test } = RuntimeAPITest;

  function rawEvent(sequence, libraryEvent, fields = {}) {
    return {
      formatVersion: 'opendesk.recorder.raw-event/v2',
      eventId: `e${String(sequence).padStart(12, '0')}`,
      sequence: String(sequence),
      libraryEvent,
      nativeTime: String(1000 + sequence * 10),
      nativeClock: 'fixture-monotonic',
      nativeUnit: 'milliseconds',
      receivedAt: new Date(1700000000000 + sequence * 10).toISOString(),
      modifierMask: 0,
      modifiers: [],
      source: 'unknown',
      scopeRef: 'within:fixture',
      ...fields,
    };
  }

  function writeFixture(recordingDir, recordingId, customEvents) {
    const raw = customEvents || [
      rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      rawEvent(4, 'KEY_PRESSED', {keycode: 30, rawcode: 65, keychar: 65535}),
      rawEvent(5, 'KEY_TYPED', {keycode: 0, rawcode: 65, keychar: 97, gaps: ['key-typed-is-not-an-ime-commit']}),
      rawEvent(6, 'KEY_RELEASED', {keycode: 30, rawcode: 65, keychar: 65535}),
    ];
    const rawPayload = raw.map((event) => JSON.stringify(event)).join('\n') + '\n';
    const platform = System.getPlatformInfo().os;
    const stoppedAt = '2024-01-01T00:00:01Z';
    const manifest = {
      formatVersion: 'opendesk.recorder.recording/v2',
      recordingId,
      executionId: Execution.id,
      state: 'stopped',
      within: {processId: 4242, title: 'Recorder Fixture'},
      initialWindow: {
        id: 'fixture-window', title: 'Recorder Fixture', handle: 4242, index: 0, isPopup: false,
        application: {
          processId: 4242, executableName: 'RecorderFixture', executablePath: '/fixture/recorder',
          identityKind: 'executable-path', identityValue: '/fixture/recorder',
        },
        bounds: {x: 0, y: 0, width: 800, height: 600}, observedAt: '2024-01-01T00:00:00Z',
      },
      capture: {
        library: 'libuiohook', libraryVersion: '1.2.2',
        libraryCommit: '23acecfe207f8a8b5161bec97a8a6fd6ad0aea88',
        platform, backend: 'synthetic-fixture', permission: 'not-required',
        captureKeyboard: true, keyboardContent: 'non-sensitive-test', evidence: 'target-semantics',
        coordinateSpace: 'screen-logical', pointerMotionPolicy: 'button-held-only', limitations: [],
      },
      queue: {capacity: 4096, contextCapacity: 128},
      startedAt: '2024-01-01T00:00:00Z',
      stoppedAt,
      cutoff: {sequence: String(raw.length), time: stoppedAt},
      counts: {observed: raw.length, accepted: raw.length, persisted: raw.length, filtered: 0, paused: 0, dropped: 0, late: 0},
      storage: {state: 'saved', rawFile: 'raw/events.ndjson', manifestFile: 'manifest.json', rawBytes: rawPayload.length},
      displays: [{index: 1, id: 'fixture-display', hardwareId: 'fixture', isPrimary: true, isBuiltin: false, vendor: 0, model: 0, serial: 0, unit: 0, x: 0, y: 0, width: 800, height: 600, pixelWidth: 800, pixelHeight: 600, scale: 1}],
      inputContexts: raw.filter(event => event.libraryEvent === 'MOUSE_RELEASED' || event.libraryEvent === 'KEY_TYPED').map(event => ({
        eventId: event.eventId,
        kind: event.libraryEvent === 'MOUSE_RELEASED' ? 'pointer' : 'keyboard',
        status: 'verified', resolutionDelayMs: 1,
		semanticStatus: event.libraryEvent === 'MOUSE_RELEASED' ? 'unavailable' : 'not-applicable',
		...(event.libraryEvent === 'MOUSE_RELEASED' ? {semanticReason: 'synthetic fixture has no accessibility target'} : {}),
        window: {
          id: 'fixture-window', title: 'Recorder Fixture', handle: 4242, index: 0, isPopup: false,
          application: {
            processId: 4242, executableName: 'RecorderFixture', executablePath: '/fixture/recorder',
            identityKind: 'executable-path', identityValue: '/fixture/recorder',
          },
          bounds: {x: 0, y: 0, width: 800, height: 600}, observedAt: event.receivedAt,
        },
      })),
      issues: [],
    };
    File.ensureDir(File.join(recordingDir, 'raw'));
    File.write(File.join(recordingDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    File.write(File.join(recordingDir, 'raw', 'events.ndjson'), rawPayload);
  }

  test({
    name: 'Recorder capability query and denied start have no capture or storage side effects',
    tier: 'unit',
    covers: ['Recorder.getCapabilities', 'Recorder.start'],
  }, async () => {
    const capabilities = Recorder.getCapabilities();
    equal(capabilities.capture.hostAuthorized, false, 'ordinary local invocation must not authorize capture');
    equal(capabilities.capture.available, false, 'capture availability includes host authorization');
    equal(capabilities.capture.evidenceModes.join(','), 'none,target-semantics', 'Recorder evidence modes');
    equal(capabilities.actions.available, true, 'saved-file actions remain available');
    equal(capabilities.basicGeneration.available, true, 'saved-file generation remains available');
    assert(Object.isFrozen(Recorder), 'JS facade must preserve and freeze the one native Recorder object');

    const deniedOutput = File.join('.runtime', 'recordings', `denied-${Date.now()}`);
    let denied = null;
    try {
      await Recorder.start({within: {processId: 1, title: 'must-not-be-probed'}, outputDir: deniedOutput});
    } catch (error) {
      denied = error;
    }
    assert(denied && denied.code === 'RECORDER_CAPTURE_DENIED', String(denied));
    assert(!File.exists(deniedOutput), 'denied start created storage');

    for (const invalid of [
      {within: {processId: '1', title: 'must-not-be-probed'}},
      {within: {processId: 1, title: 'must-not-be-probed'}, captureKeyboard: 'false'},
      {within: {processId: 1, title: 'must-not-be-probed'}, controlKeycodes: ['67']},
    ]) {
      let invalidError = null;
      try { await Recorder.start(invalid); } catch (error) { invalidError = error; }
      assert(invalidError && invalidError.code === 'INVALID_ARGUMENT', String(invalidError));
    }
  });

  test({
    name: 'Recorder normalizes input and generates adjustable recorded timing between actions',
    tier: 'unit',
    covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
    const root = File.join(Execution.workdir, '.runtime', 'recordings');
    const jitterId = `rec-jitter-${Date.now()}`;
    const controlId = `rec-control-${Date.now()}`;
    const timingId = `rec-timing-${Date.now()}`;
    const recordingDirs = [jitterId, controlId, timingId].map(id => File.join(root, id));
    try {
      writeFixture(recordingDirs[0], jitterId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_DRAGGED', {button: 'none', x: 21, y: 30, modifierMask: 1 << 8, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 21, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const jitter = await Recorder.buildActions(recordingDirs[0]);
      equal(jitter.readiness, 'ready', JSON.stringify(jitter.issues));
      const jitterActions = JSON.parse(File.read(jitter.actionsFile));
      equal(jitterActions.actions.length, 1, 'bounded production drag shape should become one click');
      equal(jitterActions.actions[0].source.basis, 'libuiohook press/release with bounded drag jitter and no CLICKED event', 'auditable jitter basis');
      equal(jitterActions.actions[0].position.x, 21, 'release position is authoritative');

      const receivedAt = '2024-01-01T00:00:00.070Z';
      writeFixture(recordingDirs[1], controlId, [
        rawEvent(1, 'MOUSE_PRESSED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_PRESSED', {receivedAt: '2024-01-01T00:00:00.040Z', button: 'left', clicks: 1, x: 300, y: 400, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(5, 'MOUSE_RELEASED', {receivedAt: '2024-01-01T00:00:00.050Z', button: 'left', clicks: 1, x: 300, y: 400, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(6, 'MOUSE_CLICKED', {receivedAt: '2024-01-01T00:00:00.060Z', button: 'left', clicks: 1, x: 300, y: 400, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(7, 'RECORDER_CONTROL_CLICK', {
          source: 'recorder', receivedAt,
          metadata: {
            windowId: 'scriptRecorderTray', targetId: 'trayStop',
            uiTimestamp: '2024-01-01T00:00:00.069Z',
            triggerEventIds: '["e000000000004","e000000000005","e000000000006"]',
          },
        }),
      ]);
      const control = await Recorder.buildActions(recordingDirs[1]);
      equal(control.readiness, 'ready', JSON.stringify(control.issues));
      const controlActions = JSON.parse(File.read(control.actionsFile));
      equal(controlActions.actions.length, 1, 'the explicit control click must not become a target action');
      assert(controlActions.eventDisposition.slice(3).every(item => item.disposition === 'excluded'), JSON.stringify(controlActions.eventDisposition));

      writeFixture(recordingDirs[2], timingId, [
        rawEvent(1, 'MOUSE_PRESSED', {nativeTime: '1000', button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(2, 'MOUSE_RELEASED', {nativeTime: '1010', button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(3, 'MOUSE_CLICKED', {nativeTime: '1010', button: 'left', clicks: 1, x: 20, y: 30, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(4, 'MOUSE_PRESSED', {nativeTime: '1400', button: 'left', clicks: 1, x: 40, y: 50, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(5, 'MOUSE_RELEASED', {nativeTime: '1410', button: 'left', clicks: 1, x: 40, y: 50, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(6, 'MOUSE_CLICKED', {nativeTime: '1410', button: 'left', clicks: 1, x: 40, y: 50, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(7, 'MOUSE_PRESSED', {nativeTime: '5000', button: 'left', clicks: 1, x: 60, y: 70, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(8, 'MOUSE_RELEASED', {nativeTime: '5010', button: 'left', clicks: 1, x: 60, y: 70, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
        rawEvent(9, 'MOUSE_CLICKED', {nativeTime: '5010', button: 'left', clicks: 1, x: 60, y: 70, coordinateSpace: 'screen-logical', coordinateVerified: true, displayRef: 'fixture-display'}),
      ]);
      const timing = await Recorder.buildActions(recordingDirs[2]);
      equal(timing.readiness, 'ready', JSON.stringify(timing.issues));
      const generated = await Recorder.generateScript(timing.actionsFile);
      const source = File.read(generated.scriptFile);
      assert(source.includes('await sleep(500); // recorded gap: 390ms'), source);
      assert(source.includes('await sleep(3590); // recorded gap: 3590ms'), source);
      equal(generated.timing.minimumDelayMs, 500, 'default timing floor');
      equal(generated.timing.maximumDelayMs, 30000, 'default timing ceiling');
      equal(generated.timing.speedMultiplier, 1, 'default timing speed');
      const candidate = JSON.parse(File.read(generated.candidateFile));
      equal(candidate.formatVersion, 'opendesk.recorder.basic-candidate/v3', 'window-relative candidate version');
      equal(candidate.timing.minimumDelayMs, 500, 'candidate records resolved timing');
      assert(candidate.mappings.every(item => Number.isInteger(item.line) && item.line > 20), JSON.stringify(candidate.mappings));
      assert(source.includes('await window.list()') && source.includes('__recorderRelativePoint'), source);
      assert(!source.includes('target.id') && !source.includes('target.handle') && !source.includes('target.index'), source);
      assert(!source.includes('target.application.processId') && !source.includes('"processId":4242') && !source.includes('"handle":4242'), source);
      assert(source.includes('titleMatches.length === 1 ? titleMatches : (identityMatches.length === 1 ? identityMatches : [])'), source);
      assert(generated.constraints.some(item => item.includes('resolves exactly one current window')), JSON.stringify(generated.constraints));
      assert(generated.constraints.some(item => item.includes('clamped to 500..30000 milliseconds')), JSON.stringify(generated.constraints));

      const adjusted = await Recorder.generateScript(timing.actionsFile, {
        mode: 'basic', outputFile: 'adjusted.recipe.js',
        timing: {minimumDelayMs: 250, maximumDelayMs: 1000, speedMultiplier: 2},
      });
      const adjustedSource = File.read(adjusted.scriptFile);
      assert(adjustedSource.includes('await sleep(250); // recorded gap: 390ms'), adjustedSource);
      assert(adjustedSource.includes('await sleep(1000); // recorded gap: 3590ms'), adjustedSource);
      equal(adjusted.timing.speedMultiplier, 2, 'custom timing speed');

      let invalidTiming = null;
      try {
        await Recorder.generateScript(timing.actionsFile, {
          outputFile: 'invalid.recipe.js',
          timing: {minimumDelayMs: 501, maximumDelayMs: 500},
        });
      } catch (error) {
        invalidTiming = error;
      }
      assert(invalidTiming && invalidTiming.code === 'INVALID_ARGUMENT', String(invalidTiming));
    } finally {
      for (const recordingDir of recordingDirs) File.removeDir(recordingDir);
    }
  });

  test({
    name: 'Recorder builds fixed actions, rereads bytes, revisions manual edits, and generates non-overwriting basic JS',
    tier: 'unit',
    covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
    const recordingId = `rec-fixture-${Date.now()}`;
    const recordingDir = File.join(Execution.workdir, '.runtime', 'recordings', recordingId);
    try {
      writeFixture(recordingDir, recordingId);
      const first = await Recorder.buildActions(recordingDir);
      equal(first.revision, 1, 'first revision');
      equal(first.actionCount, 2, 'one click plus one text action');
      equal(first.readiness, 'ready', JSON.stringify(first.issues));

      const original = JSON.parse(File.read(first.actionsFile));
      assert(Array.isArray(original.issues), 'actions issues must be a stable JSON array');
      equal(original.revisionReason, 'initial deterministic build from fixed raw bytes', 'initial revision reason');
      equal(original.revisionBasis, 'Recorder.buildActions/opendesk.recorder.actions-v2', 'revision basis');
      equal(original.actions[0].kind, 'click', 'click action order');
      equal(original.actions[0].target.window.application.identityValue, '/fixture/recorder', 'stable application identity');
      equal(original.actions[0].target.semanticStatus, 'unavailable', 'semantic target availability is explicit');
      equal(original.actions[0].target.semanticReason, 'synthetic fixture has no accessibility target', 'semantic target failure reason');
      equal(original.actions[0].position.window.offsetX, 20, 'window-relative x');
      equal(original.actions[0].position.window.offsetY, 30, 'window-relative y');
      equal(original.actions[1].kind, 'text', 'text action order');
      equal(original.actions[1].target.semanticStatus, 'not-applicable', 'keyboard target semantics are explicit');
      equal(original.actions[1].args.text, 'a', 'typed text');
      assert(original.eventDisposition.every((item) => ['consumed', 'evidence', 'excluded'].includes(item.disposition)), JSON.stringify(original.eventDisposition));

      // The next invocation must reread the actual bytes. An execution-affecting
      // unknown field is rejected instead of using an in-memory prior value.
      const edited = {...original, extraParameters: {button: 'right'}};
      File.write(first.actionsFile, JSON.stringify(edited, null, 2) + '\n');
      let editedError = null;
      try { await Recorder.generateScript(first.actionsFile); } catch (error) { editedError = error; }
      assert(editedError && editedError.code === 'INVALID_RECORDING', String(editedError));

      const rebuilt = await Recorder.buildActions(recordingDir);
      equal(rebuilt.revision, 2, 'manual actions file must not be overwritten');
      assert(rebuilt.actionsFile.endsWith('actions.r002.json'), rebuilt.actionsFile);
      const rebuiltActions = JSON.parse(File.read(rebuilt.actionsFile));
      equal(rebuiltActions.revisionReason, 'prior actions revision had different bytes; rebuilt from fixed raw without overwriting it', 'rebuild revision reason');
      const generated = await Recorder.generateScript(rebuilt.actionsFile);
      equal(generated.verification, 'not-run', 'generation is not replay verification');
      assert(File.isFile(generated.scriptFile) && File.isFile(generated.candidateFile), JSON.stringify(generated));
      const source = File.read(generated.scriptFile);
      assert(source.includes('__recorderRelativePoint') && source.includes('await mouse.click(__recorderPoint1.x, __recorderPoint1.y'), source);
      assert(source.includes('await keyboard.type("a");'), source);
      assert(!source.includes('actions.json') && !source.includes('for ('), source);
      const candidate = JSON.parse(File.read(generated.candidateFile));
      equal(candidate.actions.revision, 2, 'candidate pinned revision');
      equal(candidate.verification, 'not-run', 'candidate qualification');

      let overwrite = null;
      try { await Recorder.generateScript(rebuilt.actionsFile); } catch (error) { overwrite = error; }
      assert(overwrite && overwrite.code === 'WOULD_OVERWRITE', String(overwrite));
    } finally {
      File.removeDir(recordingDir);
    }
  });

  test({
    name: 'Recorder recovers only a validated prefix from an unterminated package and blocks generation',
    tier: 'unit',
    covers: ['Recorder.buildActions', 'Recorder.generateScript'],
  }, async () => {
    const recordingId = `rec-recovery-${Date.now()}`;
    const recordingDir = File.join(Execution.workdir, '.runtime', 'recordings', recordingId);
    try {
      writeFixture(recordingDir, recordingId);
      const manifestFile = File.join(recordingDir, 'manifest.json');
      const manifest = JSON.parse(File.read(manifestFile));
      manifest.state = 'recording';
      delete manifest.stoppedAt;
      manifest.storage.state = 'open';
      File.write(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
      File.append(File.join(recordingDir, 'raw', 'events.ndjson'), '{"formatVersion":');

      const recovered = await Recorder.buildActions(recordingDir);
      equal(recovered.readiness, 'blocked', JSON.stringify(recovered));
      equal(recovered.actionCount, 2, 'validated prefix should remain inspectable');
      assert(recovered.issues.some((issue) => issue.code === 'terminal-manifest-missing'), JSON.stringify(recovered.issues));
      assert(recovered.issues.some((issue) => issue.code === 'raw-tail-damaged'), JSON.stringify(recovered.issues));
      let blocked = null;
      try { await Recorder.generateScript(recovered.actionsFile); } catch (error) { blocked = error; }
      assert(blocked && blocked.code === 'GENERATION_BLOCKED', String(blocked));
    } finally {
      File.removeDir(recordingDir);
    }
  });
})();
