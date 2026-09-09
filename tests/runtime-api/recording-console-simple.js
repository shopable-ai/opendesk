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

async function waitFor(predicate, message) {
  for (let index = 0; index < 200; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error(message);
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
  Execution.workdir, '.runtime', 'recordings', `rec-recording-console-simple-test-${Date.now()}`,
);
File.ensureDir(fixtureRoot);
const generatedDir = File.join(fixtureRoot, 'generated');
File.ensureDir(generatedDir);
const generatedScript = File.join(generatedDir, 'basic.recipe.js');
const generatedCandidate = File.join(generatedDir, 'basic.candidate.json');
const actionsFile = File.join(fixtureRoot, 'actions.json');
const generatedSource = "'use strict';\nconsole.log('recording-console-simple fixture');\n";
File.write(generatedScript, generatedSource);
File.write(actionsFile, JSON.stringify({
  formatVersion: 'opendesk.recorder.actions/v2',
  revision: 1,
  readiness: 'ready',
  issues: [{code: 'semantic-unavailable', message: 'DO_NOT_COPY_ISSUE_TEXT'}],
  raw: {file: 'raw/events.ndjson', content: 'DO_NOT_COPY_RAW_CONTENT'},
  actions: [
    {
      id: 'a0001', kind: 'click', text: 'DO_NOT_COPY_ACTION_TEXT',
      target: {semanticStatus: 'verified', element: {name: 'DO_NOT_COPY_AX_NAME', AXValue: 'DO_NOT_COPY_AX_VALUE'}},
    },
    {
      id: 'a0002', kind: 'click',
      target: {semanticStatus: 'unavailable', semanticReason: 'DO_NOT_COPY_SEMANTIC_REASON'},
    },
    {
      id: 'a0003', kind: 'key', args: {text: 'DO_NOT_COPY_KEYBOARD_TEXT'},
      target: {semanticStatus: 'not-requested'},
    },
  ],
}));

const calls = {start: 0, exclude: 0, pause: 0, resume: 0, stop: 0, build: 0, generate: 0, replay: 0, finder: 0, dialog: 0, copy: 0};
const copiedPrompts = [];
let copyShouldFail = false;
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
      assert(event.targetId === 'capture' || event.targetId === 'stop', 'unexpected control boundary target');
      assert(event.bounds && event.bounds.width > 0 && event.bounds.height > 0, 'control boundary screen bounds');
      return {changed: true, transitionSequence: String(6 + calls.exclude), eventIds: ['e000000000001'], matchStatus: 'matched'};
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
      actionsFile,
      revision: 1, actionCount: 3, readiness: 'ready', issues: [],
    };
  },
  async generateScript(actionsFile, options) {
    calls.generate += 1;
    equal(actionsFile, File.join(fixtureRoot, 'actions.json'), 'generation actions file');
    equal(options.mode, 'basic', 'generation mode');
    assert(FakeFloatingWindow.instance.buttons.get('agentPrompt').state.disabled,
      'Agent prompt must remain disabled until the generated script exists');
    return {
      scriptFile: generatedScript,
      candidateFile: generatedCandidate,
      actionsSha256: 'a'.repeat(64), scriptSha256: 'script-fixture',
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
    assert(binary.endsWith('/dist/opendesk'), 'replay must use dist/opendesk');
    equal(args[0], '-script', 'replay script flag');
    equal(args[1], generatedScript, 'replay generated script');
    assert(!args.includes('-allow-recorder-capture'), 'replay must not authorize another recorder listener');
    assert(options.signal && typeof options.signal.addEventListener === 'function', 'replay must be cancelable');
    if (replayAttempt === 1) return {exitCode: 0, stdout: 'fixture stdout', stderr: ''};
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('fixture replay canceled');
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
const deterministicPromptInput = {
  execution: Execution,
  generated: {scriptFile: generatedScript},
};
const deterministicPrompt = OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt(deterministicPromptInput);
equal(
  deterministicPrompt,
  OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt(deterministicPromptInput),
  'Agent prompt builder must be deterministic for the same input',
);
const relocatedWorkdir = '/different-computer/workspace/clawdesk';
const relocatedScriptFile = relocatedWorkdir
  + generatedScript.replace(/\\/g, '/').slice(String(Execution.workdir).replace(/\\/g, '/').length);
equal(
  deterministicPrompt,
  OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt({
    execution: {workdir: relocatedWorkdir}, generated: {scriptFile: relocatedScriptFile},
  }),
  'Agent prompt must be invariant when the repository is relocated',
);
const windowsWorkdir = 'D:\\workspace\\clawdesk';
const windowsScriptFile = windowsWorkdir
  + generatedScript.replace(/\\/g, '/').slice(String(Execution.workdir).replace(/\\/g, '/').length)
    .replace(/\//g, '\\');
equal(
  deterministicPrompt,
  OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt({
    execution: {workdir: windowsWorkdir}, generated: {scriptFile: windowsScriptFile},
  }),
  'Agent prompt must be invariant when the repository moves to Windows',
);

const app = OpenDeskSimpleRecordingConsole.createApp({
  recorder,
  getActiveWindow: async () => {
    startHandoffTimeline.push('window.getActiveWindow');
    return {pid: 4242, title: 'Recorder Fixture'};
  },
  FloatingWindow: FakeFloatingWindow,
  dialog,
  command,
  copyText: async text => {
    calls.copy += 1;
    if (copyShouldFail) throw new Error('synthetic clipboard failure');
    copiedPrompts.push(text);
  },
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
equal(toolbar.buttons.get('capture').state.icon, 'play.fill', 'initial capture icon');
equal(toolbar.buttons.get('capture').state.label, '开始录制', 'initial capture tooltip');
assert(!toolbar.buttons.has('pause'), 'play and pause must not occupy separate buttons');
equal(toolbar.buttons.get('stop').state.icon, 'stop.fill', 'stop registry icon');
equal(toolbar.buttons.get('replay').state.icon, 'repeat', 'replay registry icon');
equal(toolbar.buttons.get('replay').state.label, '重放', 'replay tooltip terminology');
equal(toolbar.buttons.get('agentPrompt').state.icon, 'ai.assistant', 'Agent prompt registry icon');
equal(toolbar.buttons.get('agentPrompt').state.label, '复制 Agent 优化脚本', 'Agent prompt tooltip');
assert(toolbar.buttons.get('agentPrompt').state.disabled, 'Agent prompt must be disabled before a script exists');
equal(toolbar.buttons.get('details').state.icon, 'info.circle', 'details registry icon');
equal(toolbar.buttons.get('finder').state.icon, 'folder.fill', 'Finder registry icon');
assert(!toolbar.buttons.has('generate'), 'generation must not require a permanent toolbar button');

equal(toolbar.buttons.get('capture').callback(controlEvent('capture', 0)), undefined, 'start click must not enter callback busy state');
await waitFor(
  () => app.state().phase === 'recording' && !toolbar.buttons.get('capture').state.disabled,
  'combined capture button did not finish starting recording',
);
equal(app.state().phase, 'recording', 'capture phase after countdown');
equal(calls.start, 1, 'Recorder.start call count');
equal(
  startHandoffTimeline.join(' -> '),
  'window.getActiveWindow -> Recorder.start',
  'target handoff must not await native toolbar updates between foreground read and Recorder.start',
);
const countdownPaths = toolbar.updates
  .filter(update => update.id === 'capture' && update.patch.icon && typeof update.patch.icon === 'object')
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
    bounds: {x: 180, y: 120, width: 36, height: 36},
  };
}

equal(toolbar.buttons.get('capture').state.icon, 'pause.fill', 'recording capture icon');
equal(toolbar.buttons.get('capture').state.label, '暂停录制', 'recording capture tooltip');
assert(toolbar.buttons.get('capture').state.active, 'capture button must show an active session');
await toolbar.buttons.get('capture').callback(controlEvent('capture', 1));
equal(app.state().phase, 'paused', 'pause phase');
equal(calls.pause, 1, 'pause call count');
equal(toolbar.buttons.get('capture').state.icon, 'play.fill', 'resume icon');
equal(toolbar.buttons.get('capture').state.label, '继续录制', 'resume tooltip');
assert(toolbar.buttons.get('capture').state.active, 'paused session must remain visually active');
await toolbar.buttons.get('capture').callback(controlEvent('capture', 2));
equal(app.state().phase, 'recording', 'resume phase');
equal(calls.resume, 1, 'resume call count');
equal(toolbar.buttons.get('capture').state.icon, 'pause.fill', 'resumed capture icon');

await toolbar.buttons.get('stop').callback(controlEvent('stop', 3));
equal(app.state().phase, 'generated', 'stop must finish with a generated script');
equal(calls.stop, 1, 'stop call count');
equal(calls.build, 1, 'buildActions call count');
equal(calls.generate, 1, 'stop must automatically generate once from ready actions');
equal(calls.exclude, 3, 'capture controls must establish exclusion boundaries');
equal(toolbar.buttons.get('capture').state.label, '重新录制', 're-record tooltip');
equal(toolbar.buttons.get('capture').state.icon, 'play.fill', 're-record icon');
assert(!toolbar.buttons.get('capture').state.active, 'completed capture must not remain active');
equal(app.state().generated.source, generatedSource, 'loaded generated source');
equal(app.state().generated.verification, 'not-run', 'generation must remain not-run');
equal(calls.replay, 0, 'generation must not automatically replay');
assert(!toolbar.buttons.get('replay').state.disabled, 'replay must enable after automatic generation');
assert(!toolbar.buttons.get('agentPrompt').state.disabled, 'Agent prompt must stay enabled after generation');

const callsBeforePromptCopy = JSON.parse(JSON.stringify(calls));
const commandCountBeforePromptCopy = commandCalls.length;
await toolbar.buttons.get('agentPrompt').callback();
equal(calls.copy, 1, 'Agent prompt copy adapter call count');
equal(copiedPrompts.length, 1, 'Agent prompt copy payload count');
equal(app.state().phase, 'generated', 'copying the Agent prompt must preserve phase');
const copiedPrompt = copiedPrompts[0];
const portableScriptFile = './' + generatedScript.replace(/\\/g, '/')
  .slice(String(Execution.workdir).replace(/\\/g, '/').length).replace(/^\/+/, '');
equal(
  copiedPrompt,
  `优化 Recorder 已生成脚本：\`${portableScriptFile}\`。`,
  'Agent prompt must remain the exact one-sentence script handoff',
);
assert(!copiedPrompt.includes(String(Execution.workdir)), 'prompt leaked the machine-specific repository root');
assert(!copiedPrompt.includes(String(generatedCandidate)), 'prompt should let the Skill discover the candidate');
for (const forbidden of [
  'actionsFile', '$human-to-recipe', 'recorder-script-refiner', 'SKILL.md',
  '业务目标', '成功条件', '约束', '授权',
  'revision', 'readiness', 'semantic coverage', 'application-engineer',
]) {
  assert(!copiedPrompt.includes(forbidden), `prompt duplicated Skill-owned input: ${forbidden}`);
}
for (const forbidden of [
  'DO_NOT_COPY_ISSUE_TEXT', 'DO_NOT_COPY_RAW_CONTENT', 'DO_NOT_COPY_ACTION_TEXT',
  'DO_NOT_COPY_AX_NAME', 'DO_NOT_COPY_AX_VALUE', 'DO_NOT_COPY_SEMANTIC_REASON',
  'DO_NOT_COPY_KEYBOARD_TEXT',
]) {
  assert(!copiedPrompt.includes(forbidden), `prompt leaked recorded content: ${forbidden}`);
}
for (const name of ['start', 'exclude', 'pause', 'resume', 'stop', 'build', 'generate', 'replay', 'finder', 'dialog']) {
  equal(calls[name], callsBeforePromptCopy[name], `Agent prompt copy unexpectedly called ${name}`);
}
equal(commandCalls.length, commandCountBeforePromptCopy, 'Agent prompt copy must not call Command.run');

for (const invalidScriptFile of [
  String(Execution.workdir) + '/.runtime/recordings/rec-fixture/generated/../../secret.js',
  File.join(Execution.workdir, '.runtime', 'recordings-other', 'rec-fixture', 'generated', 'basic.recipe.js'),
  File.join(Execution.workdir, '.runtime', 'recordings', 'rec-fixture', 'generated', 'bad`name.js'),
  File.join(Execution.workdir, '.runtime', 'recordings', 'rec-fixture', 'generated', 'bad\nname.js'),
]) {
  let rejected = null;
  try {
    OpenDeskSimpleRecordingConsole.buildAgentRefinementPrompt({
      execution: Execution, generated: {scriptFile: invalidScriptFile},
    });
  } catch (error) {
    rejected = error;
  }
  assert(rejected && rejected.code === 'INVALID_ARGUMENT', 'unsafe script path must be rejected');
}

copyShouldFail = true;
await toolbar.buttons.get('agentPrompt').callback();
equal(calls.copy, 2, 'clipboard failure attempt count');
equal(app.state().phase, 'generated', 'clipboard failure must preserve generated phase');
equal(app.state().promptCopyStatus, 'failed', 'clipboard failure status');
equal(app.state().errorButton, 'agentPrompt', 'clipboard failure must stay on the copy button');
assert(!toolbar.buttons.get('agentPrompt').state.disabled, 'clipboard failure must remain retryable');
copyShouldFail = false;
await toolbar.buttons.get('agentPrompt').callback();
equal(calls.copy, 3, 'clipboard retry attempt count');
equal(app.state().promptCopyStatus, 'copied', 'clipboard retry status');
equal(app.state().error, null, 'successful clipboard retry must clear the prior copy error');
equal(copiedPrompts.length, 2, 'clipboard retry payload count');

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
equal(calls.replay, 1, 'explicit replay count');
equal(app.state().phase, 'run-succeeded', 'replay phase');
equal(app.state().run.stdout, 'fixture stdout', 'replay stdout');
assert(!toolbar.buttons.get('agentPrompt').state.disabled, 'completed replay must re-enable script handoff');

const pendingReplay = app.runGenerated();
await Promise.resolve();
equal(app.state().phase, 'run-countdown', 'second replay must allow time to restore the starting desktop');
await waitFor(
  () => toolbar.buttons.get('replay').state.label.startsWith('重放将在 '),
  'replay countdown terminology',
);
await waitFor(
  () => toolbar.buttons.get('agentPrompt').state.disabled,
  'run countdown must disable script handoff',
);
for (let index = 0; index < 200 && app.state().phase !== 'running'; index += 1) await Promise.resolve();
equal(app.state().phase, 'running', 'second replay phase');
assert(toolbar.buttons.get('agentPrompt').state.disabled, 'running test must keep script handoff disabled');
await app.close();
await pendingReplay;
equal(app.state().phase, 'closed', 'close phase');
equal(calls.stop, 1, 'close must not stop an already stopped session twice');
equal(calls.replay, 2, 'close test must start a second managed replay');

const retryCalls = {stop: 0, build: 0, generate: 0, replay: 0, copy: 0};
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
  copyText: async () => {
    retryCalls.copy += 1;
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
assert(retryToolbar.buttons.get('agentPrompt').state.disabled,
  'generation-error must keep Agent prompt disabled because no script exists');
await retryToolbar.buttons.get('agentPrompt').callback();
equal(retryCalls.copy, 0, 'generation-error must not copy a prompt without a script');
equal(retryCalls.generate, 1, 'generation-error prompt copy must not retry generation');
equal(retryCalls.replay, 0, 'generation-error prompt copy must not replay');
equal(retryApp.state().error.code, 'RECORDER_GENERATION_FAILED',
  'generation-error prompt copy must preserve the generation failure');
await retryToolbar.buttons.get('replay').callback();
equal(retryApp.state().phase, 'generated', 'generation retry phase');
equal(retryCalls.generate, 2, 'generation retry count');
equal(retryCalls.replay, 0, 'generation retry must not replay');
assert(!retryToolbar.buttons.get('agentPrompt').state.disabled,
  'successful generation retry must enable Agent prompt');
await retryApp.close();

const failedCalls = {stop: 0, build: 0, generate: 0, finder: 0, dialog: 0, copy: 0};
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
File.ensureDir(failedSaved.recordingDir);
const failedActionsFile = File.join(failedSaved.recordingDir, 'actions.json');
File.write(failedActionsFile, JSON.stringify({
  formatVersion: 'opendesk.recorder.actions/v2',
  revision: 7,
  readiness: 'blocked',
  issues: [captureIssue, {code: 'semantic-unavailable', message: 'DO_NOT_COPY_BLOCKED_MESSAGE'}],
  actions: [{
    id: 'a0001', kind: 'click', args: {text: 'DO_NOT_COPY_BLOCKED_TEXT'},
    target: {semanticStatus: 'unavailable', semanticReason: 'DO_NOT_COPY_BLOCKED_REASON'},
  }],
}));
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
      actionsFile: failedActionsFile, revision: 7,
      actionCount: 1, readiness: 'blocked', issues: [captureIssue],
    };
  },
  async generateScript() {
    failedCalls.generate += 1;
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
  copyText: async () => {
    failedCalls.copy += 1;
  },
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
const failedToolbar = FakeFloatingWindow.instance;
assert(failedToolbar.buttons.get('agentPrompt').state.disabled,
  'actions-blocked must keep Agent prompt disabled because no script exists');
const failedCallsBeforeCopy = JSON.parse(JSON.stringify(failedCalls));
await failedToolbar.buttons.get('agentPrompt').callback();
equal(failedCalls.copy, 0, 'blocked actions must not copy a prompt without a script');
equal(failedCalls.generate, 0, 'blocked Agent prompt copy must not generate');
equal(failedCalls.stop, failedCallsBeforeCopy.stop, 'blocked Agent prompt copy must not stop again');
equal(failedCalls.build, failedCallsBeforeCopy.build, 'blocked Agent prompt copy must not rebuild actions');
await failedApp.reveal();
equal(failedCalls.finder, 1, 'failed artifact reveal count');
equal(failedApp.state().error.code, 'RECORDER_CAPTURE_UNAVAILABLE', 'Finder reveal erased the root capture error');
await failedApp.showDetails();
equal(failedCalls.dialog, 1, 'failed details dialog count');
await failedApp.close();
File.removeDir(fixtureRoot);

console.log('RECORDING_CONSOLE_SIMPLE_TEST=' + JSON.stringify({
  passed: true,
  buttons: 6,
  separators: 2,
  countdownIcons: 3,
  captureCalls: calls,
  generationRetryCalls: retryCalls,
  failedCaptureCalls: failedCalls,
}));
