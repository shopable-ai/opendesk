(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((accept, deny) => { resolve = accept; reject = deny; });
    return {promise, resolve, reject};
  }

  test({
    name: 'recording console drives capture, inspected generation, reset, and explicit cancelable Fresh Run',
    tier: 'custom-ui',
    covers: [
      'ui.createWindow', 'WindowHandle.show', 'WindowHandle.control', 'WindowHandle.close',
      'ControlHandle.on', 'ControlHandle.getState', 'ControlHandle.update', 'mouse.click', 'mouse.clickForPID', 'Screen.screenshot',
    ],
  }, async () => {
    const sourceRoot = File.join(File.cwd(), 'examples', 'custom-ui', 'recording-console');
    const fixtureRoot = File.join(RuntimeAPITest.context.runDir, 'generated', 'recording-console');
    await File.ensureDir(fixtureRoot);
    for (const file of ['tray.html', 'tray.css', 'recorder.html', 'recorder.css']) {
      await File.copy(File.join(sourceRoot, file), File.join(fixtureRoot, file));
    }
    const controllerPath = File.join(sourceRoot, 'controller.js');
    (0, eval)(File.read(controllerPath) + '\n//# sourceURL=' + controllerPath);
    assert(OpenDeskRecordingConsole && typeof OpenDeskRecordingConsole.createApp === 'function');

    const calls = {start: 0, status: 0, pause: 0, resume: 0, exclude: 0, stop: 0, build: 0, generate: 0, run: 0, abort: 0, copy: 0, replay: 0};
    const controlEvents = [];
    const generatedSource = "'use strict';\nconsole.log('synthetic recording console script');\n";
    const generatedScriptPath = File.join(fixtureRoot, 'basic.recipe.js');
    File.write(generatedScriptPath, generatedSource);
    const runAttempts = [];
    const commandCalls = [];
    const expectedBinary = File.join(Execution.workdir, 'dist', 'opendesk');
    let copiedSource = '';
    const starting = deferred();
    const stopping = deferred();
    const building = deferred();
    const generating = deferred();
    const counts = {observed: 3, accepted: 3, persisted: 3, filtered: 0, paused: 0, dropped: 0, late: 0};
    let captureState = 'recording';
    const session = {
      status() {
        calls.status += 1;
        return {
          captureState, storageState: 'open', recordingId: 'rec-ui-fixture',
          recordingDir: '.runtime/recordings/rec-ui-fixture', counts, cutoffSequence: null,
          maxDurationMs: 900000, startedAt: '2026-09-09T00:00:00Z', pausedAt: null,
          elapsedDurationMs: 1000, activeDurationMs: 1000, pausedDurationMs: 0, pauseCount: 0, issues: [],
        };
      },
      async pause() {
        calls.pause += 1;
        captureState = 'paused';
        return {changed: true, captureState, transitionSequence: '4', transitionedAt: '2026-09-09T00:00:01Z'};
      },
      async resume() {
        calls.resume += 1;
        captureState = 'recording';
        return {changed: true, captureState, transitionSequence: '5', transitionedAt: '2026-09-09T00:00:02Z'};
      },
      async excludeControlClick(event) {
        calls.exclude += 1;
        controlEvents.push({windowId: event.windowId, targetId: event.targetId, type: event.type, timestamp: event.timestamp, bounds: event.bounds});
        return {changed: captureState === 'recording', transitionSequence: String(5 + calls.exclude), eventIds: [], matchStatus: 'not-observed'};
      },
      stop() {
        calls.stop += 1;
        return stopping.promise;
      },
    };
    const recorder = {
      getCapabilities() {
        return {
          capture: {
            available: true, supported: true, hostAuthorized: true, permission: 'not-required',
            platform: 'fixture', backend: 'custom-ui-fixture',
            library: {name: 'libuiohook', version: '1.2.2', commit: 'fixture', linkage: 'source-static'},
            coordinateSpace: 'screen-logical', keyboardDefault: false, limitations: [],
          },
          actions: {available: true, version: 'v1', actionSubset: ['click']},
          basicGeneration: {available: true, mode: 'basic', version: 'v1'},
        };
      },
      start() { calls.start += 1; return starting.promise; },
      buildActions() { calls.build += 1; return building.promise; },
      generateScript() { calls.generate += 1; return generating.promise; },
      replay() { calls.replay += 1; },
    };
    const command = {
      getCapabilities: () => ({enabled: true, supported: true, executionScoped: true}),
      run(binary, args, options) {
        calls.run += 1;
        equal(binary, expectedBinary, 'Fresh Run did not use the repository OpenDesk binary');
        equal(args[0], '-script');
        equal(args[1], generatedScriptPath, 'Fresh Run did not use Recorder.generateScript scriptFile');
        equal(args[2], '-console-mode');
        equal(args[3], 'script');
        equal(args[4], '-log-dir');
        assert(typeof args[5] === 'string' && args[5].includes('generated-script-runs'), 'Fresh Run has no isolated log directory');
        assert(!args.includes('-allow-recorder-capture'), 'Fresh Run unexpectedly authorized another Recorder listener');
        equal(options.cwd, Execution.workdir);
        equal(options.timeout, 24680);
        equal(options.maxOutputBytes, 1024 * 1024);
        assert(options.signal && typeof options.signal.addEventListener === 'function', 'Fresh Run did not pass AbortSignal');
        const attempt = deferred();
        options.signal.addEventListener('abort', () => {
          calls.abort += 1;
          const error = new Error('synthetic run canceled');
          error.code = 'CANCELED';
          error.operation = 'Command.run';
          attempt.reject(error);
        });
        commandCalls.push({binary, args: args.slice(), cwd: options.cwd, timeout: options.timeout, maxOutputBytes: options.maxOutputBytes});
        runAttempts.push(attempt);
        return attempt.promise;
      },
    };
    const log = [];
    const app = await OpenDeskRecordingConsole.createApp({
      recorder, ui, command,
      trayId: 'recorderWorkflowTray', detailsId: 'recorderWorkflowDetails',
      targetSelectionDelayMs: 0,
      runPreparationDelayMs: 0,
      generatedRunTimeoutMs: 24680,
      getActiveWindow: async () => ({pid: 4242, title: 'Recorder Fixture'}),
      copyText: text => { calls.copy += 1; copiedSource = text; },
      logger: {log: value => log.push(String(value)), error: value => log.push(String(value))},
    });

    const shown = await app.show();
    assert(shown.onScreen && shown.alpha > 0 && shown.hostPid > 0 && shown.nativeWindowId > 0);
    const evidenceDir = File.join(helper.root, 'recording-console');
    await File.ensureDir(evidenceDir);
    const screenshots = {};
    async function screenshot(name, windowState = null) {
      const state = windowState || await app.tray().getState();
      const path = File.join(evidenceDir, name + '.png');
      const result = await Screen.screenshot({clip: state.bounds, path, returnType: 'object'});
      assert(result.sizeBytes > 100 && await File.exists(path), name + ' screenshot was not written');
      screenshots[name] = {path, sizeBytes: result.sizeBytes, bounds: state.bounds};
    }
    async function click(id) {
      const button = await app.tray().control(id).getState();
      assert(button.screenBounds.width > 0 && button.screenBounds.height > 0, id + ' has no native bounds');
      await mouse.click(button.screenBounds.x + button.screenBounds.width / 2, button.screenBounds.y + button.screenBounds.height / 2);
    }
    async function clickControl(panel, id) {
      const button = await panel.control(id).getState();
      assert(button.screenBounds.width > 0 && button.screenBounds.height > 0, id + ' has no native bounds');
      const panelState = await panel.getState();
      await mouse.clickForPID(panelState.hostPid, button.screenBounds.x + button.screenBounds.width / 2, button.screenBounds.y + button.screenBounds.height / 2);
    }

    await screenshot('ready');
    await click('trayStart');
    await helper.waitFor(() => app.state().phase === 'preparing', 'start button did not enter preparing');
    await helper.waitFor(() => calls.start === 1, 'start button did not reach the injected Recorder');
    equal(calls.start, 1, 'start button did not call the injected Recorder once');
    void app.start();
    equal(calls.start, 1, 'a repeated start entered Recorder.start twice');
    assert((await app.tray().control('trayStart').getState()).disabled, 'start stayed enabled while preparing');
    assert(!(await app.tray().control('trayStop').getState()).disabled, 'stop was unavailable while preparing');
    assert(!(await app.tray().control('trayCancel').getState()).disabled, 'cancel was unavailable while preparing');
    await screenshot('preparing');

    starting.resolve(session);
    await helper.waitFor(() => app.state().phase === 'recording' && !app.state().operation, 'Recorder readiness did not become recording');
    equal(calls.status, 1, 'session.status was not read after start');
    assert(!(await app.tray().control('trayStop').getState()).disabled, 'stop was unavailable while recording');
    assert(!(await app.tray().control('trayPause').getState()).disabled, 'pause was unavailable while recording');
    await screenshot('recording');

    await click('trayPause');
    await helper.waitFor(() => app.state().phase === 'paused' && !app.state().operation, 'pause button did not enter paused');
    equal(calls.pause, 1, 'pause button did not call session.pause once');
    equal((await app.tray().control('trayPause').getState()).text, '继续录制');
    assert(!(await app.tray().control('trayStop').getState()).disabled, 'stop was unavailable while paused');
    await screenshot('paused');

    await click('trayPause');
    await helper.waitFor(() => app.state().phase === 'recording' && calls.resume === 1 && !app.state().operation, 'continue button did not resume recording');
    equal((await app.tray().control('trayPause').getState()).text, '暂停录制');
    await screenshot('resumed');

    await click('trayStop');
    await helper.waitFor(() => app.state().phase === 'stopping', 'stop button did not enter stopping');
    await helper.waitFor(() => calls.stop === 1, 'stop button did not reach session.stop');
    equal(calls.stop, 1, 'stop button did not call session.stop once');
    equal(calls.exclude, 3, 'recording controls did not report every live Custom UI click');
    equal(controlEvents.map(event => event.targetId).join(','), 'trayPause,trayPause,trayStop', JSON.stringify(controlEvents));
    assert(controlEvents.every(event => event.type === 'click' && event.windowId === 'recorderWorkflowTray' && event.timestamp
      && event.bounds && event.bounds.width > 0 && event.bounds.height > 0), JSON.stringify(controlEvents));
    void app.stop();
    equal(calls.stop, 1, 'a repeated stop entered session.stop twice');
    await screenshot('stopping');
    stopping.resolve({
      recordingId: 'rec-ui-fixture', recordingDir: '.runtime/recordings/rec-ui-fixture',
      rawFile: '.runtime/recordings/rec-ui-fixture/raw/events.ndjson',
      manifestFile: '.runtime/recordings/rec-ui-fixture/manifest.json',
      captureState: 'stopped', storageState: 'saved', counts, issues: [],
    });
    await helper.waitFor(() => app.state().phase === 'building-actions' && calls.build === 1, 'saved result did not advance to actions build');
    equal(calls.build, 1, 'saved result did not call Recorder.buildActions once');
    await screenshot('saved-building-actions');
    building.resolve({
      actionsFile: '.runtime/recordings/rec-ui-fixture/actions.json', revision: 1,
      actionCount: 1, readiness: 'ready', issues: [],
    });
    await helper.waitFor(() => app.state().phase === 'actions-ready' && !app.state().operation, 'ready actions were not visible');
    assert(!(await app.tray().control('trayGenerate').getState()).disabled, 'generate was not enabled for ready actions');
    await screenshot('actions-ready');

    await click('trayGenerate');
    await helper.waitFor(() => app.state().phase === 'generating', 'generate button did not enter generating');
    await helper.waitFor(() => calls.generate === 1, 'generate button did not reach Recorder.generateScript');
    equal(calls.generate, 1, 'generate button did not call Recorder.generateScript once');
    void app.generate();
    equal(calls.generate, 1, 'a repeated generate entered Recorder.generateScript twice');
    await screenshot('generating');
    generating.resolve({
      scriptFile: generatedScriptPath,
      candidateFile: '.runtime/recordings/rec-ui-fixture/generated/basic.candidate.json',
      actionsSha256: 'actions-fixture', scriptSha256: 'script-fixture',
      constraints: ['fixture'], verification: 'not-run',
    });
    await helper.waitFor(() => app.state().phase === 'generated' && !app.state().operation, 'generated result was not visible');
    equal(app.state().generated.verification, 'not-run', 'UI upgraded generation into replay verification');
    equal(app.state().generated.source, generatedSource, 'generated source was not loaded for inspection');
    equal(calls.replay, 0, 'UI automatically replayed generated code');
    equal(calls.run, 0, 'generation automatically ran generated code');
    await screenshot('generated-not-run');

    const details = await app.showDetails();
    const detailsState = await details.getState();
    assert(detailsState.onScreen && detailsState.alpha > 0, 'details window did not become visible');
    equal((await app.tray().getState()).status, 'hidden', 'tray stayed visible behind the details window');
    equal((await details.control('recordingState').getState()).text, '已生成 · 未运行');
    equal((await details.control('scriptPreview').getState()).text, generatedSource, 'details did not show generated source');
    assert(!(await details.control('copyScript').getState()).disabled, 'copy stayed disabled after source load');
    await screenshot('details-generated-not-run', detailsState);

    await clickControl(details, 'copyScript');
    await helper.waitFor(() => calls.copy === 1 && !app.state().operation, 'copy button did not reach clipboard adapter');
    equal(copiedSource, generatedSource, 'copy did not use the visible generated source');

    await clickControl(details, 'runScript');
    await helper.waitFor(() => app.state().phase === 'running' && calls.run === 1, 'run button did not start a fresh synthetic execution');
    void app.runGenerated();
    equal(calls.run, 1, 'a repeated run bypassed the single-flight gate');
    assert(!(await details.control('cancel').getState()).disabled, 'cancel run was unavailable while running');
    await screenshot('run-in-progress', await details.getState());
    runAttempts[0].resolve({
      exitCode: 0, stdout: 'synthetic stdout', stderr: '',
    });
    await helper.waitFor(() => app.state().phase === 'run-succeeded' && !app.state().operation, 'successful run did not settle');
    equal(app.state().run.status, 'succeeded');
    equal(app.state().run.exitCode, 0);
    equal(app.state().run.command, expectedBinary);
    equal(app.state().run.logDir, commandCalls[0].args[5]);
    equal(app.state().generated.verification, 'not-run', 'process success rewrote candidate verification');
    await screenshot('details-run-succeeded', await details.getState());

    await clickControl(details, 'runScript');
    await helper.waitFor(() => app.state().phase === 'running' && calls.run === 2, 'second explicit run did not start');
    const runFailure = new Error('synthetic child exited 7');
    runFailure.code = 'EXIT_NONZERO';
    runFailure.operation = 'Command.run';
    runFailure.exitCode = 7;
    runFailure.stdout = 'before failure';
    runFailure.stderr = 'synthetic stderr';
    runFailure.logDir = '.runtime/tests/custom-ui/synthetic-run-failure';
    runAttempts[1].reject(runFailure);
    await helper.waitFor(() => app.state().phase === 'run-failed' && !app.state().operation, 'failed run did not settle');
    equal(app.state().run.status, 'failed');
    equal(app.state().run.exitCode, 7);
    assert((await details.control('runOutput').getState()).text.includes('synthetic stderr'), 'run stderr was not visible');
    await screenshot('details-run-failed', await details.getState());

    await clickControl(details, 'runScript');
    await helper.waitFor(() => app.state().phase === 'running' && calls.run === 3, 'cancel fixture did not start');
    await clickControl(details, 'cancel');
    await helper.waitFor(() => app.state().phase === 'run-canceled' && !app.state().operation, 'cancel did not settle the in-flight run');
    equal(calls.abort, 1, 'cancel did not abort the in-flight runner exactly once');
    equal(app.state().run.status, 'canceled');
    equal((await details.getState()).status, 'visible', 'cancel incorrectly closed the details window');
    assert(!(await details.control('runScript').getState()).disabled, 'run was not available again after cancellation');
    await screenshot('details-run-canceled', await details.getState());

    await clickControl(details, 'generate');
    await helper.waitFor(() => app.state().phase === 'generated' && calls.generate === 2, 'explicit regeneration did not settle');
    equal(app.state().run, null, 'regeneration retained the previous run result');
    equal(app.state().generated.verification, 'not-run', 'regeneration changed candidate verification');
    equal((await details.control('generate').getState()).text, '重新生成');
    equal((await details.control('scriptPreview').getState()).text, generatedSource, 'regeneration did not reload generated source');

    const stopCountBeforeReset = calls.stop;
    await clickControl(details, 'reset');
    await helper.waitFor(() => app.state().phase === 'ready' && !app.state().operation, 'reset did not return to ready');
    equal(app.state().saved, null, 'reset retained saved state');
    equal(app.state().actions, null, 'reset retained actions state');
    equal(app.state().generated, null, 'reset retained generated source or candidate');
    equal(app.state().run, null, 'reset retained run result');
    equal(calls.stop, stopCountBeforeReset, 'reset stopped an already finalized Recorder session again');
    equal((await details.control('scriptPreview').getState()).text, '生成后可在这里滚动查看并选择文本。');
    await screenshot('details-reset', await details.getState());

    assert(log.some(line => line.includes('"phase":"preparing"')));
    assert(log.some(line => line.includes('"phase":"paused"')));
    assert(log.some(line => line.includes('"phase":"generated"')));
    assert(log.some(line => line.includes('"runStatus":"succeeded"')));
    assert(log.some(line => line.includes('"runStatus":"failed"')));
    assert(log.some(line => line.includes('"runStatus":"canceled"')));
    await app.close('test', false);
    equal((await app.tray().getState()).status, 'closed');
    equal(calls.stop, 1, 'close attempted to stop an already stopped session again');
    const closedCalls = {...calls};
    await app.start();
    await app.generate();
    await app.runGenerated();
    await app.copyGenerated();
    await app.reset();
    await app.cancel();
    equal(app.state().phase, 'closed', 'an action reopened the closed recording console');
    equal(JSON.stringify(calls), JSON.stringify(closedCalls), 'a closed console accepted a side-effecting action');

    const partialCalls = {stop: 0, build: 0, generate: 0};
    const partialSaved = {
      recordingId: 'rec-ui-partial', recordingDir: '.runtime/recordings/rec-ui-partial',
      rawFile: '.runtime/recordings/rec-ui-partial/raw/events.ndjson',
      manifestFile: '.runtime/recordings/rec-ui-partial/manifest.json',
      captureState: 'stopped', storageState: 'failed', counts, issues: [{code: 'WRITE_FAILED'}],
    };
    const partialRecorder = {
      getCapabilities: recorder.getCapabilities,
      start: async () => ({
        status: () => ({...partialSaved, captureState: 'recording', storageState: 'open'}),
        stop: async () => {
          partialCalls.stop += 1;
          const error = new Error('fixture writer could not finish');
          error.code = 'RECORDER_STORAGE_FAILED';
          error.operation = 'RecorderSession.stop';
          error.partial = partialSaved;
          throw error;
        },
      }),
      buildActions: async recordingDir => {
        partialCalls.build += 1;
        equal(recordingDir, partialSaved.recordingDir);
        return {
          actionsFile: recordingDir + '/actions.json', revision: 1, actionCount: 0,
          readiness: 'blocked', issues: [{code: 'SOURCE_PARTIAL'}],
        };
      },
      generateScript: async () => { partialCalls.generate += 1; },
    };
    const partialApp = await OpenDeskRecordingConsole.createApp({
      getActiveWindow: async () => ({pid: 4343, title: 'Partial Fixture'}),
      recorder: partialRecorder, ui,
      trayId: 'recorderPartialTray', detailsId: 'recorderPartialDetails',
      targetSelectionDelayMs: 0,
      logger: {log: () => {}, error: () => {}},
    });
    await partialApp.show();
    await partialApp.start();
    await partialApp.stop();
    equal(partialApp.state().phase, 'actions-blocked', 'partial save did not remain visible as blocked actions');
    equal(partialApp.state().saved.storageState, 'failed');
    equal(partialApp.state().error.code, 'RECORDER_STORAGE_FAILED');
    equal(partialCalls.stop, 1);
    equal(partialCalls.build, 1, 'a recoverable partial recording was not offered to the existing builder');
    equal(partialCalls.generate, 0, 'blocked actions were sent to generation');
    equal((await partialApp.tray().control('trayState').getState()).text, 'actions 需处理');
    const partialErrorState = await partialApp.tray().control('trayError').getState();
    assert(partialErrorState.visible && partialErrorState.text.includes('RECORDER_STORAGE_FAILED'), 'partial error was not visible');
    assert((await partialApp.tray().control('trayDetail').getState()).text.includes('部分保存'), 'partial save detail was not visible');
    const partialShown = await partialApp.tray().getState();
    const partialScreenshotPath = File.join(evidenceDir, 'partial-actions-blocked.png');
    const partialScreenshot = await Screen.screenshot({clip: partialShown.bounds, path: partialScreenshotPath, returnType: 'object'});
    assert(partialScreenshot.sizeBytes > 100 && await File.exists(partialScreenshotPath), 'partial result screenshot was not written');
    screenshots['partial-actions-blocked'] = {path: partialScreenshotPath, sizeBytes: partialScreenshot.sizeBytes, bounds: partialShown.bounds};
    await partialApp.close('test-partial', false);

    const blockedCalls = {stop: 0, build: 0, generate: 0};
    const blockedSaved = {
      recordingId: 'rec-ui-blocked', recordingDir: '.runtime/recordings/rec-ui-blocked',
      rawFile: '.runtime/recordings/rec-ui-blocked/raw/events.ndjson',
      manifestFile: '.runtime/recordings/rec-ui-blocked/manifest.json',
      captureState: 'stopped', storageState: 'saved', counts, issues: [],
    };
    const blockedRecorder = {
      getCapabilities: recorder.getCapabilities,
      start: async () => ({
        status: () => ({...blockedSaved, captureState: 'recording', storageState: 'open'}),
        stop: async () => { blockedCalls.stop += 1; return blockedSaved; },
      }),
      buildActions: async recordingDir => {
        blockedCalls.build += 1;
        return {
          actionsFile: recordingDir + '/actions.json', revision: 1, actionCount: 1,
          readiness: 'blocked', issues: [{
            code: 'drag-unsupported', severity: 'error', eventId: 'e000000000371',
            message: 'drag path exceeded the bounded click-jitter envelope',
          }],
        };
      },
      generateScript: async () => { blockedCalls.generate += 1; },
    };
    const blockedApp = await OpenDeskRecordingConsole.createApp({
      getActiveWindow: async () => ({pid: 4440, title: 'Blocked Fixture'}),
      recorder: blockedRecorder, ui,
      trayId: 'recorderBlockedTray', detailsId: 'recorderBlockedDetails',
      targetSelectionDelayMs: 0,
      logger: {log: () => {}, error: () => {}},
    });
    await blockedApp.show();
    await blockedApp.start();
    await blockedApp.stop();
    equal(blockedApp.state().phase, 'actions-blocked', 'saved blocked actions were not retained');
    equal(blockedApp.state().error, null, 'actions readiness was incorrectly promoted to a Runtime error');
    assert(blockedApp.state().detail.includes('drag-unsupported [e000000000371]'), blockedApp.state().detail);
    assert((await blockedApp.tray().control('trayState').getState()).classes.includes('is-warning'), 'blocked readiness did not use warning styling');
    assert((await blockedApp.tray().control('trayDetail').getState()).text.includes('drag-unsupported'), 'tray omitted the structured action issue');
    const blockedDetails = await blockedApp.showDetails();
    const issueState = await blockedDetails.control('actionIssues').getState();
    assert(issueState.visible && issueState.text.includes('drag-unsupported [e000000000371]'), JSON.stringify(issueState));
    assert(issueState.text.includes('bounded click-jitter envelope'), issueState.text);
    assert((await blockedDetails.control('generate').getState()).disabled, 'blocked actions enabled generation');
    const blockedDetailsState = await blockedDetails.getState();
    await screenshot('details-saved-actions-blocked', blockedDetailsState);
    equal(blockedCalls.stop, 1);
    equal(blockedCalls.build, 1);
    equal(blockedCalls.generate, 0);
    await blockedApp.close('test-blocked', false);

    const recoveryCalls = {start: 0, failedStop: 0, nextStop: 0, build: 0, generate: 0};
    let recoveryCaptureState = 'recording';
    const failedSaved = {
      recordingId: 'rec-ui-failed', recordingDir: '.runtime/recordings/rec-ui-failed',
      rawFile: '.runtime/recordings/rec-ui-failed/raw/events.ndjson',
      manifestFile: '.runtime/recordings/rec-ui-failed/manifest.json',
      captureState: 'failed', storageState: 'saved', counts, issues: [{code: 'BACKEND_INTERRUPTED'}],
    };
    const recoveredSession = {
      status: () => ({...failedSaved, recordingId: 'rec-ui-recovered', captureState: 'recording', storageState: 'open', issues: []}),
      pause: async () => {}, resume: async () => {},
      stop: async () => { recoveryCalls.nextStop += 1; return {...failedSaved, recordingId: 'rec-ui-recovered', captureState: 'stopped', issues: []}; },
    };
    const recoveryFlow = OpenDeskRecordingConsole.createFlow({
      getActiveWindow: async () => ({pid: 4366, title: 'Recovery Fixture'}),
      recorder: {
        getCapabilities: recorder.getCapabilities,
        start: async () => {
          recoveryCalls.start += 1;
          if (recoveryCalls.start > 1) return recoveredSession;
          return {
            status: () => ({...failedSaved, captureState: recoveryCaptureState, storageState: recoveryCaptureState === 'failed' ? 'saved' : 'open'}),
            pause: async () => {}, resume: async () => {},
            stop: async () => {
              recoveryCalls.failedStop += 1;
              const error = new Error('fixture backend stopped unexpectedly');
              error.code = 'RECORDER_CAPTURE_UNAVAILABLE';
              error.operation = 'RecorderSession.stop';
              error.partial = failedSaved;
              throw error;
            },
          };
        },
        buildActions: async () => { recoveryCalls.build += 1; },
        generateScript: async () => { recoveryCalls.generate += 1; },
      },
    });
    await recoveryFlow.start();
    recoveryCaptureState = 'failed';
    await recoveryFlow.pauseOrResume();
    equal(recoveryFlow.state().phase, 'error', 'terminal native failure was not exposed by pause/resume');
    equal(recoveryFlow.state().nativeStatus.captureState, 'failed');
    await recoveryFlow.start();
    equal(recoveryCalls.failedStop, 1, 'retry did not synchronize cleanup of the failed session');
    equal(recoveryCalls.start, 2, 'retry did not call Recorder.start again');
    equal(recoveryFlow.state().phase, 'recording', 'retry did not enter a new recording session');
    equal(recoveryFlow.state().error, null, 'retry retained the previous session error');
    equal(recoveryCalls.build, 0, 'retry built actions from the failed session');
    equal(recoveryCalls.generate, 0, 'retry generated code from the failed session');
    await recoveryFlow.close();
    equal(recoveryCalls.nextStop, 1, 'recovered session was not cleaned up on close');

    let foreground = {pid: 37647, title: 'Recorder Launcher Terminal'};
    let selectedWithin = null;
    let selectionStopCalls = 0;
    const selectionFlow = OpenDeskRecordingConsole.createFlow({
      targetSelectionDelayMs: 30,
      getActiveWindow: async () => foreground,
      recorder: {
        getCapabilities: recorder.getCapabilities,
        start: async options => {
          selectedWithin = options.within;
          return {
            status: () => ({...partialSaved, captureState: 'recording', storageState: 'open'}),
            stop: async () => {
              selectionStopCalls += 1;
              return {...partialSaved, captureState: 'stopped', storageState: 'saved', issues: []};
            },
          };
        },
        buildActions: async () => {}, generateScript: async () => {},
      },
    });
    setTimeout(() => { foreground = {pid: 5151, title: 'Calculator'}; }, 5);
    await selectionFlow.start();
    equal(selectedWithin.processId, 5151, 'target selection froze the launcher instead of the window focused during arming');
    equal(selectedWithin.title, 'Calculator');
    equal(selectionFlow.state().targetSelectionDelayMs, 30);
    await selectionFlow.close();
    equal(selectionStopCalls, 1, 'target-selection session was not cleaned up');

    const cancelCalls = {stop: 0, build: 0, generate: 0};
    const cancelFlow = OpenDeskRecordingConsole.createFlow({
      getActiveWindow: async () => ({pid: 4399, title: 'Cancel Fixture'}),
      recorder: {
        getCapabilities: recorder.getCapabilities,
        start: async () => ({
          status: () => ({...partialSaved, captureState: 'recording', storageState: 'open'}),
          stop: async () => { cancelCalls.stop += 1; return {...partialSaved, storageState: 'saved', issues: []}; },
        }),
        buildActions: async () => { cancelCalls.build += 1; },
        generateScript: async () => { cancelCalls.generate += 1; },
      },
    });
    await cancelFlow.start();
    await cancelFlow.cancel();
    equal(cancelFlow.state().phase, 'canceled');
    equal(cancelCalls.stop, 1, 'cancel did not stop the active session exactly once');
    equal(cancelCalls.build, 0, 'cancel built actions');
    equal(cancelCalls.generate, 0, 'cancel generated code');
    await cancelFlow.close();

    const closingStart = deferred();
    const closeCalls = {stop: 0, build: 0, generate: 0};
    const closeFlow = OpenDeskRecordingConsole.createFlow({
      getActiveWindow: async () => ({pid: 4444, title: 'Closing Fixture'}),
      recorder: {
        getCapabilities: recorder.getCapabilities,
        start: () => closingStart.promise,
        buildActions: async () => { closeCalls.build += 1; },
        generateScript: async () => { closeCalls.generate += 1; },
      },
    });
    const startPromise = closeFlow.start();
    await helper.waitFor(() => closeFlow.state().phase === 'preparing', 'close fixture did not start preparing');
    const closePromise = closeFlow.close();
    closingStart.resolve({
      status: () => ({...partialSaved, captureState: 'recording', storageState: 'open'}),
      stop: async () => {
        closeCalls.stop += 1;
        return {...partialSaved, storageState: 'saved', issues: []};
      },
    });
    await Promise.all([startPromise, closePromise]);
    equal(closeFlow.state().phase, 'closed');
    equal(closeCalls.stop, 1, 'closing during Recorder.start did not stop the acquired session exactly once');
    equal(closeCalls.build, 0, 'close generated actions while cleaning up');
    equal(closeCalls.generate, 0, 'close generated or replayed code while cleaning up');

    const closeRunCalls = {stop: 0, build: 0, generate: 0, run: 0, abort: 0};
    const closeRunFlow = OpenDeskRecordingConsole.createFlow({
      getActiveWindow: async () => ({pid: 4555, title: 'Close Run Fixture'}),
      readGeneratedScript: () => generatedSource,
      executeGeneratedScript: (_generated, runOptions) => new Promise((_resolve, reject) => {
        closeRunCalls.run += 1;
        runOptions.signal.addEventListener('abort', () => {
          closeRunCalls.abort += 1;
          const error = new Error('close canceled the run');
          error.code = 'CANCELED';
          error.operation = 'Command.run';
          reject(error);
        });
      }),
      recorder: {
        getCapabilities: recorder.getCapabilities,
        start: async () => ({
          status: () => ({...partialSaved, captureState: 'recording', storageState: 'open'}),
          stop: async () => {
            closeRunCalls.stop += 1;
            return {...partialSaved, captureState: 'stopped', storageState: 'saved', issues: []};
          },
        }),
        buildActions: async recordingDir => {
          closeRunCalls.build += 1;
          return {actionsFile: recordingDir + '/actions.json', revision: 1, actionCount: 1, readiness: 'ready', issues: []};
        },
        generateScript: async () => {
          closeRunCalls.generate += 1;
          return {
            scriptFile: '.runtime/recordings/close-run/generated/basic.recipe.js',
            candidateFile: '.runtime/recordings/close-run/generated/basic.candidate.json',
            actionsSha256: 'close-actions', scriptSha256: 'close-script', constraints: [], verification: 'not-run',
          };
        },
      },
    });
    await closeRunFlow.start();
    await closeRunFlow.stop();
    await closeRunFlow.generate();
    const closeRunPromise = closeRunFlow.runGenerated();
    await helper.waitFor(() => closeRunFlow.state().phase === 'running', 'close-run fixture did not start running');
    const closeDuringRun = closeRunFlow.close();
    await Promise.all([closeRunPromise, closeDuringRun]);
    equal(closeRunFlow.state().phase, 'closed');
    equal(closeRunFlow.state().run.status, 'canceled', 'close did not retain the canceled run result');
    equal(closeRunCalls.abort, 1, 'close did not abort the in-flight run exactly once');
    equal(closeRunCalls.stop, 1, 'close stopped the finalized Recorder session again');
    equal(closeRunCalls.run, 1, 'close launched another generated run');

    const recordingEvidence = {
      status: 'passed', syntheticRecorder: true, syntheticRun: true,
      liveCapture: 'not-run', liveReplay: 'not-run',
      calls, commandCalls, partialCalls, blockedCalls, recoveryCalls, cancelCalls, closeCalls, closeRunCalls, screenshots,
    };
    helper.evidence.routes.recordingConsole = recordingEvidence;
    helper.persist();
    File.write(File.join(evidenceDir, 'result.json'), JSON.stringify(recordingEvidence, null, 2));
  });
})();
