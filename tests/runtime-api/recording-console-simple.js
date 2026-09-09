// Native-only recording toolbar composition test. This uses JavaScript fakes
// for capture and process launch, so it never installs a native input listener.
// Run from the repository root:
// ./dist/opendesk -script tests/runtime-api/recording-console-simple.js -console-mode script
'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

class FakeFloatingWindow {
  constructor(options) {
    this.id = 'recording-console-simple-fixture';
    this.options = options;
    this.items = [];
    this.buttons = new Map();
    this.updates = [];
    this.lifecycle = new Map();
    FakeFloatingWindow.instance = this;
  }

  addButton(id, label, icon, callback) {
    const state = {id, label, icon, active: false, disabled: false, busy: false, error: ''};
    this.items.push({kind: 'Button', id});
    this.buttons.set(id, {state, callback});
  }

  addSeparator(id) {
    this.items.push({kind: 'Separator', id});
  }

  async updateButton(id, patch) {
    const button = this.buttons.get(id);
    assert(button, `unknown fake button ${id}`);
    Object.assign(button.state, patch);
    this.updates.push({id, patch: JSON.parse(JSON.stringify(patch))});
    return JSON.parse(JSON.stringify(button.state));
  }

  onError(callback) {
    this.onErrorCallback = callback;
  }

  on(type, callback) {
    this.lifecycle.set(type, callback);
    return () => this.lifecycle.delete(type);
  }

  async show() {
    return {status: 'shown', visible: true, bounds: {x: 100, y: 100, width: 348, height: 68}};
  }

  async getState() {
    return {status: 'shown', visible: true, bounds: {x: 100, y: 100, width: 348, height: 68}};
  }

  async close() {
    const listener = this.lifecycle.get('close');
    if (listener) await listener({type: 'close', reason: 'script'});
    return {status: 'closed', visible: false, bounds: {x: 100, y: 100, width: 348, height: 68}};
  }

  waitUntilClosed() {
    return new Promise(() => {});
  }
}

const fixtureRoot = File.join(
  Execution.workdir, '.runtime', 'tests', 'runtime-api', 'recording-console-simple', String(Date.now()),
);
File.ensureDir(fixtureRoot);
const generatedScript = File.join(fixtureRoot, 'basic.recipe.js');
const generatedSource = "'use strict';\nconsole.log('recording-console-simple fixture');\n";
File.write(generatedScript, generatedSource);

const calls = {start: 0, exclude: 0, pause: 0, resume: 0, stop: 0, build: 0, generate: 0, replay: 0, finder: 0, dialog: 0};
const startHandoffTimeline = [];
let captureState = 'recording';
const counts = {observed: 4, accepted: 4, persisted: 4, filtered: 0, paused: 0, dropped: 0, late: 0};

function makeSession() {
  captureState = 'recording';
  return {
    status() {
      return {
        captureState, storageState: 'open', recordingId: 'simple-fixture',
        recordingDir: fixtureRoot, counts, cutoffSequence: null, maxDurationMs: 900000,
        startedAt: '2026-09-09T00:00:00Z', pausedAt: null,
        elapsedDurationMs: 1000, activeDurationMs: 1000, pausedDurationMs: 0, pauseCount: 0, issues: [],
      };
    },
    async pause() {
      calls.pause += 1;
      captureState = 'paused';
      return {changed: true, captureState, transitionSequence: '5', transitionedAt: '2026-09-09T00:00:01Z'};
    },
    async resume() {
      calls.resume += 1;
      captureState = 'recording';
      return {changed: true, captureState, transitionSequence: '6', transitionedAt: '2026-09-09T00:00:02Z'};
    },
    async excludeControlClick(event) {
      calls.exclude += 1;
      equal(event.windowId, 'recording-console-simple-fixture', 'control boundary window id');
      assert(event.targetId === 'pause' || event.targetId === 'stop', 'unexpected control boundary target');
      return {changed: true, transitionSequence: String(6 + calls.exclude), eventIds: ['e000000000001']};
    },
    async stop() {
      calls.stop += 1;
      captureState = 'stopped';
      return {
        recordingId: 'simple-fixture', recordingDir: fixtureRoot,
        rawFile: File.join(fixtureRoot, 'raw', 'events.ndjson'),
        manifestFile: File.join(fixtureRoot, 'manifest.json'),
        captureState: 'stopped', storageState: 'saved', counts, issues: [],
      };
    },
  };
}

const recorder = {
  getCapabilities() {
    return {
      capture: {
        available: true, supported: true, hostAuthorized: true, permission: 'not-required',
        platform: 'fixture', backend: 'fixture',
        library: {name: 'libuiohook', version: '1.2.2', commit: 'fixture', linkage: 'source-static'},
        coordinateSpace: 'screen-logical', keyboardDefault: false, limitations: [],
      },
      actions: {available: true, version: 'v1', actionSubset: ['click']},
      basicGeneration: {available: true, mode: 'basic', version: 'v1'},
    };
  },
  async start(options) {
    startHandoffTimeline.push('Recorder.start');
    calls.start += 1;
    equal(options.within.processId, 4242, 'start target pid');
    equal(options.within.title, 'Recorder Fixture', 'start target title');
    equal(options.evidence, 'target-semantics', 'capture evidence policy');
    return makeSession();
  },
  async buildActions(recordingDir) {
    calls.build += 1;
    equal(recordingDir, fixtureRoot, 'actions recording directory');
    return {
      actionsFile: File.join(fixtureRoot, 'actions.json'),
      revision: 1, actionCount: 1, readiness: 'ready', issues: [],
    };
  },
  async generateScript(actionsFile, options) {
    calls.generate += 1;
    equal(actionsFile, File.join(fixtureRoot, 'actions.json'), 'generation actions file');
    equal(options.mode, 'basic', 'generation mode');
    return {
      scriptFile: generatedScript,
      candidateFile: File.join(fixtureRoot, 'basic.candidate.json'),
      actionsSha256: 'actions-fixture', scriptSha256: 'script-fixture',
      constraints: ['fixture'], verification: 'not-run',
      timing: {minimumDelayMs: 500, maximumDelayMs: 30000, speedMultiplier: 1},
    };
  },
};

const dialogCalls = [];
const dialog = {
  async alert(options) {
    calls.dialog += 1;
    dialogCalls.push(options);
  },
};

const commandCalls = [];
let replayAttempt = 0;
const command = {
  async run(binary, args, options) {
    commandCalls.push({binary, args: args.slice(), options});
    if (binary === '/usr/bin/open') {
      calls.finder += 1;
      return {exitCode: 0, stdout: '', stderr: ''};
    }
    calls.replay += 1;
    replayAttempt += 1;
    assert(binary.endsWith('/dist/opendesk'), 'test-run must use dist/opendesk');
    equal(args[0], '-script', 'test-run script flag');
    equal(args[1], generatedScript, 'test-run generated script');
    assert(!args.includes('-allow-recorder-capture'), 'test-run must not authorize another recorder listener');
    assert(options.signal && typeof options.signal.addEventListener === 'function', 'test-run must be cancelable');
    if (replayAttempt === 1) return {exitCode: 0, stdout: 'fixture stdout', stderr: ''};
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('fixture test-run canceled');
        error.code = 'CANCELED';
        error.operation = 'Command.run';
        reject(error);
      });
    });
  },
};

const controllerPath = File.join(
  Execution.workdir, 'examples', 'custom-ui', 'recording-console-simple', 'controller.js',
);
(0, eval)(File.read(controllerPath) + '\n//# sourceURL=' + controllerPath);
assert(globalThis.OpenDeskSimpleRecordingConsole, 'simple controller did not install its namespace');

const app = OpenDeskSimpleRecordingConsole.createApp({
  recorder,
  getActiveWindow: async () => {
    startHandoffTimeline.push('window.getActiveWindow');
    return {pid: 4242, title: 'Recorder Fixture'};
  },
  FloatingWindow: FakeFloatingWindow,
  dialog,
  command,
  file: File,
  execution: Execution,
  sleep: async () => {},
  countdownStepMs: 0,
  iconRoot: File.join(Execution.workdir, 'examples', 'custom-ui', 'recording-console-simple', 'icons'),
  logger: {log() {}, error(message) { throw new Error(message); }},
});

await app.show();
const toolbar = FakeFloatingWindow.instance;
equal(toolbar.options.orientation, 'horizontal', 'toolbar orientation');
equal(toolbar.options.toolbar.maxRows, 1, 'toolbar row count');
equal(toolbar.options.toolbar.maxColumns, 6, 'toolbar column count');
equal(toolbar.items.filter(item => item.kind === 'Button').length, 6, 'button count');
equal(toolbar.items.filter(item => item.kind === 'Separator').length, 2, 'separator count');
assert(!toolbar.items.some(item => item.kind === 'Label'), 'toolbar must not contain a visible Label');
equal(toolbar.buttons.get('start').state.icon, 'play.fill', 'start registry icon');
equal(toolbar.buttons.get('pause').state.icon, 'pause.fill', 'pause registry icon');
equal(toolbar.buttons.get('stop').state.icon, 'stop.fill', 'stop registry icon');
equal(toolbar.buttons.get('replay').state.icon, 'repeat', 'replay registry icon');
equal(toolbar.buttons.get('details').state.icon, 'info.circle', 'details registry icon');
equal(toolbar.buttons.get('finder').state.icon, 'folder.fill', 'Finder registry icon');
assert(!toolbar.buttons.has('generate'), 'generation must not require a permanent toolbar button');

await app.start();
equal(app.state().phase, 'recording', 'capture phase after countdown');
equal(calls.start, 1, 'Recorder.start call count');
equal(
  startHandoffTimeline.join(' -> '),
  'window.getActiveWindow -> Recorder.start',
  'target handoff must not await native toolbar updates between foreground read and Recorder.start',
);
const countdownPaths = toolbar.updates
  .filter(update => update.id === 'start' && update.patch.icon && typeof update.patch.icon === 'object')
  .map(update => update.patch.icon.path);
assert(countdownPaths.some(path => path.endsWith('countdown-3.png')), 'missing countdown 3 icon update');
assert(countdownPaths.some(path => path.endsWith('countdown-2.png')), 'missing countdown 2 icon update');
assert(countdownPaths.some(path => path.endsWith('countdown-1.png')), 'missing countdown 1 icon update');
assert(countdownPaths.every(path => File.isFile(path)), 'countdown icon update points outside maintained assets');

function controlEvent(targetId, sequence) {
  return {
    sessionId: 'recording-console-simple-fixture-session',
    windowId: 'recording-console-simple-fixture',
    targetId,
    type: 'click',
    sequence,
    timestamp: new Date().toISOString(),
  };
}

await toolbar.buttons.get('pause').callback(controlEvent('pause', 1));
equal(app.state().phase, 'paused', 'pause phase');
equal(calls.pause, 1, 'pause call count');
equal(toolbar.buttons.get('pause').state.icon, 'play.fill', 'resume icon');
await toolbar.buttons.get('pause').callback(controlEvent('pause', 2));
equal(app.state().phase, 'recording', 'resume phase');
equal(calls.resume, 1, 'resume call count');

await toolbar.buttons.get('stop').callback(controlEvent('stop', 3));
equal(app.state().phase, 'generated', 'stop must finish with a generated script');
equal(calls.stop, 1, 'stop call count');
equal(calls.build, 1, 'buildActions call count');
equal(calls.generate, 1, 'stop must automatically generate once from ready actions');
equal(calls.exclude, 3, 'capture controls must establish exclusion boundaries');
equal(toolbar.buttons.get('start').state.label, '重新录制', 're-record tooltip');
equal(app.state().generated.source, generatedSource, 'loaded generated source');
equal(app.state().generated.verification, 'not-run', 'generation must remain not-run');
equal(calls.replay, 0, 'generation must not automatically test-run');
assert(!toolbar.buttons.get('replay').state.disabled, 'replay must enable after automatic generation');

await app.showDetails();
equal(calls.dialog, 1, 'Dialog.alert call count');
equal(dialogCalls[0].title, '录制详情', 'details dialog title');
assert(dialogCalls[0].message.includes('Recorder Fixture'), 'details omit exact target');
assert(dialogCalls[0].message.includes(generatedSource.trim()), 'details omit generated source');
assert(dialogCalls[0].message.includes('生成节奏：录制间隔 ÷ 1×，限制 500..30000ms'), 'details omit generated timing');
assert(!dialogCalls[0].message.includes(Execution.workdir), 'details should compact repository-local paths');
assert(!dialogCalls[0].message.includes('\n\n录制目录'), 'details retained excessive section spacing');
assert(dialogCalls[0].message.length <= 4096, 'details exceed native Dialog limit');

await app.reveal();
equal(calls.finder, 1, 'Finder call count');
const finderCall = commandCalls.find(call => call.binary === '/usr/bin/open');
equal(finderCall.args[0], '-R', 'Finder must reveal a generated file');
equal(finderCall.args[1], generatedScript, 'Finder generated file');

await app.runGenerated();
equal(calls.replay, 1, 'explicit test-run count');
equal(app.state().phase, 'run-succeeded', 'test-run phase');
equal(app.state().run.stdout, 'fixture stdout', 'test-run stdout');

const pendingReplay = app.runGenerated();
await Promise.resolve();
equal(app.state().phase, 'run-countdown', 'second test-run must allow time to restore the starting desktop');
for (let index = 0; index < 200 && app.state().phase !== 'running'; index += 1) await Promise.resolve();
equal(app.state().phase, 'running', 'second test-run phase');
await app.close();
await pendingReplay;
equal(app.state().phase, 'closed', 'close phase');
equal(calls.stop, 1, 'close must not stop an already stopped session twice');
equal(calls.replay, 2, 'close test must start a second managed test-run');

const retryCalls = {stop: 0, build: 0, generate: 0, replay: 0};
const retryRecorder = {
  getCapabilities: recorder.getCapabilities,
  async start() {
    return {
      status: () => ({
        captureState: 'recording', storageState: 'open', recordingId: 'generation-retry-fixture',
        recordingDir: fixtureRoot, counts, issues: [],
      }),
      async stop() {
        retryCalls.stop += 1;
        return {
          recordingId: 'generation-retry-fixture', recordingDir: fixtureRoot,
          rawFile: File.join(fixtureRoot, 'raw', 'events.ndjson'),
          manifestFile: File.join(fixtureRoot, 'manifest.json'),
          captureState: 'stopped', storageState: 'saved', counts, issues: [],
        };
      },
    };
  },
  async buildActions() {
    retryCalls.build += 1;
    return {
      actionsFile: File.join(fixtureRoot, 'actions.json'),
      revision: 1, actionCount: 1, readiness: 'ready', issues: [],
    };
  },
  async generateScript() {
    retryCalls.generate += 1;
    if (retryCalls.generate === 1) {
      const error = new Error('synthetic first generation failure');
      error.code = 'RECORDER_GENERATION_FAILED';
      error.operation = 'Recorder.generateScript';
      throw error;
    }
    return {
      scriptFile: generatedScript,
      candidateFile: File.join(fixtureRoot, 'basic.candidate.json'),
      actionsSha256: 'retry-actions', scriptSha256: 'retry-script',
      constraints: ['fixture'], verification: 'not-run',
    };
  },
};
const retryApp = OpenDeskSimpleRecordingConsole.createApp({
  recorder: retryRecorder,
  getActiveWindow: async () => ({pid: 6262, title: 'Generation Retry Fixture'}),
  FloatingWindow: FakeFloatingWindow,
  dialog,
  command: {
    async run() {
      retryCalls.replay += 1;
      return {exitCode: 0, stdout: '', stderr: ''};
    },
  },
  file: File,
  execution: Execution,
  sleep: async () => {},
  countdownStepMs: 0,
  logger: {log() {}, error(message) { throw new Error(message); }},
});
await retryApp.show();
await retryApp.start();
await retryApp.stop();
equal(retryApp.state().phase, 'generation-error', 'automatic generation failure phase');
equal(retryCalls.generate, 1, 'automatic generation attempt count');
const retryToolbar = FakeFloatingWindow.instance;
equal(retryToolbar.buttons.get('replay').state.icon, 'ai.generate', 'retry must reuse the output button');
equal(retryToolbar.buttons.get('replay').state.label, '自动生成失败，点击重试', 'retry tooltip');
assert(!retryToolbar.buttons.get('replay').state.disabled, 'generation retry must be available');
await retryToolbar.buttons.get('replay').callback();
equal(retryApp.state().phase, 'generated', 'generation retry phase');
equal(retryCalls.generate, 2, 'generation retry count');
equal(retryCalls.replay, 0, 'generation retry must not replay');
await retryApp.close();

const failedCalls = {stop: 0, build: 0, finder: 0, dialog: 0};
const captureIssue = {
  code: 'backend-interrupted', severity: 'error',
  message: 'native input backend exited before an explicit stop',
};
const failedSaved = {
  recordingId: 'simple-failed-fixture', recordingDir: File.join(fixtureRoot, 'failed-recording'),
  rawFile: File.join(fixtureRoot, 'failed-recording', 'raw', 'events.ndjson'),
  manifestFile: File.join(fixtureRoot, 'failed-recording', 'manifest.json'),
  captureState: 'failed', storageState: 'saved', counts, issues: [captureIssue],
};
const failedRecorder = {
  getCapabilities: recorder.getCapabilities,
  async start() {
    return {
      status: () => ({...failedSaved, captureState: 'recording', storageState: 'open'}),
      async stop() {
        failedCalls.stop += 1;
        const error = new Error('native backend was interrupted');
        error.code = 'RECORDER_CAPTURE_UNAVAILABLE';
        error.operation = 'RecorderSession.stop';
        error.partial = failedSaved;
        throw error;
      },
    };
  },
  async buildActions(recordingDir) {
    failedCalls.build += 1;
    equal(recordingDir, failedSaved.recordingDir, 'partial build recording directory');
    return {
      actionsFile: File.join(recordingDir, 'actions.json'), revision: 1,
      actionCount: 1, readiness: 'blocked', issues: [captureIssue],
    };
  },
  async generateScript() {
    throw new Error('blocked actions must not reach generation');
  },
};
const failedDialog = {
  async alert(options) {
    failedCalls.dialog += 1;
    assert(options.message.includes('backend-interrupted'), 'details omit backend issue');
    assert(options.message.includes('RECORDER_CAPTURE_UNAVAILABLE'), 'details omit retained stop error');
  },
};
const failedCommand = {
  async run(binary, args) {
    equal(binary, '/usr/bin/open', 'failed artifact reveal command');
    equal(args[0], failedSaved.recordingDir, 'blocked result must open the recording directory');
    equal(args.length, 1, 'blocked result must not expose actions as the primary artifact');
    failedCalls.finder += 1;
    return {exitCode: 0, stdout: '', stderr: ''};
  },
};
const failedApp = OpenDeskSimpleRecordingConsole.createApp({
  recorder: failedRecorder,
  getActiveWindow: async () => ({pid: 5252, title: 'Scope Fixture'}),
  FloatingWindow: FakeFloatingWindow,
  dialog: failedDialog,
  command: failedCommand,
  file: File,
  execution: Execution,
  sleep: async () => {},
  countdownStepMs: 0,
  logger: {log() {}, error(message) { throw new Error(message); }},
});
await failedApp.show();
await failedApp.start();
await failedApp.stop();
equal(failedApp.state().phase, 'actions-blocked', 'failed capture must retain blocked actions');
equal(failedApp.state().actions.readiness, 'blocked', 'failed capture action readiness');
equal(failedApp.state().error.code, 'RECORDER_CAPTURE_UNAVAILABLE', 'failed capture error was lost');
assert(!failedApp.state().detail.includes('已安全停止'), 'non-user capture failure must not be presented as a user stop');
equal(failedCalls.stop, 1, 'failed session stop count');
equal(failedCalls.build, 1, 'recoverable failed package was not built for inspection');
await failedApp.reveal();
equal(failedCalls.finder, 1, 'failed artifact reveal count');
equal(failedApp.state().error.code, 'RECORDER_CAPTURE_UNAVAILABLE', 'Finder reveal erased the root capture error');
await failedApp.showDetails();
equal(failedCalls.dialog, 1, 'failed details dialog count');
await failedApp.close();

console.log('RECORDING_CONSOLE_SIMPLE_TEST=' + JSON.stringify({
  passed: true,
  buttons: 6,
  separators: 2,
  countdownIcons: 3,
  captureCalls: calls,
  generationRetryCalls: retryCalls,
  failedCaptureCalls: failedCalls,
}));
