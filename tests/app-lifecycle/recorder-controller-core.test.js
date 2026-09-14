'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const controllerFile = path.join(repo, 'apps', 'opendesk', 'recorder', 'controller-core.js');
vm.runInThisContext(fs.readFileSync(controllerFile, 'utf8'), {filename: controllerFile});
const RecordingConsole = globalThis.OpenDeskSimpleRecordingConsole;

function capability(available, permission = available ? 'authorized' : 'denied', hostAuthorized = true) {
  return {
    capture: {
      available,
      supported: true,
      hostAuthorized,
      permission,
      limitations: available ? [] : ['fixture capture is unavailable'],
    },
    actions: {available: true},
    basicGeneration: {available: true},
  };
}

class FakeFloatingWindow {
  constructor(options) {
    this.options = options;
    this.buttons = new Map();
    this.controls = new Map();
    this.handlers = new Map();
    this.shown = false;
    this.closed = false;
    this.id = options.id;
  }

  addButton(id, label, icon, handler) {
    this.buttons.set(id, {label, icon, handler, patch: null});
  }

  addSeparator() {}

  addSwitch(id, label, options, handler) {
    this.controls.set(id, {label, options, handler, patch: null});
  }

  on(event, handler) { this.handlers.set(event, handler); }
  onError() {}

  async updateButton(id, patch) {
    const button = this.buttons.get(id);
    assert.ok(button, `unknown button ${id}`);
    button.patch = {...(button.patch || {}), ...patch};
  }

  async updateControl(id, patch) {
    const control = this.controls.get(id);
    assert.ok(control, `unknown control ${id}`);
    control.patch = {...(control.patch || {}), ...patch};
  }

  async show() {
    this.shown = true;
    return {bounds: {x: 0, y: 0, width: 800, height: 80}};
  }

  async getState() { return {status: this.closed ? 'closed' : this.shown ? 'visible' : 'hidden'}; }
  async waitUntilClosed() { return {status: 'closed'}; }
  async close() {
    this.closed = true;
    const handler = this.handlers.get('close');
    if (handler) handler();
  }
}

function fixture(initialCapability = capability(true)) {
  let nextCapability = initialCapability;
  const calls = {capabilities: 0, start: 0, activeWindow: 0, stop: 0, pause: 0, resume: 0, exclude: 0, measurement: 0, build: 0, generate: 0, command: 0};
  const alerts = [];
  const saved = {
    recordingDir: '/repo/.runtime/recordings/rec-permission-recovery',
    rawFile: '/repo/.runtime/recordings/rec-permission-recovery/raw/events.ndjson',
    manifestFile: '/repo/.runtime/recordings/rec-permission-recovery/manifest.json',
    counts: {observed: 3, persisted: 3},
    issues: [],
  };
  const actions = {
    actionsFile: '/repo/.runtime/recordings/rec-permission-recovery/actions.json',
    readiness: 'ready',
    issues: [],
  };
  const generated = {
    scriptFile: '/repo/.runtime/recordings/rec-permission-recovery/generated/basic.recipe.js',
    candidateFile: '/repo/.runtime/recordings/rec-permission-recovery/generated/basic.candidate.json',
    timing: {speedMultiplier: 1, minimumDelayMs: 10, maximumDelayMs: 100},
  };
  let toolbar = null;
  const recorder = {
    getCapabilities() {
      calls.capabilities++;
      if (nextCapability instanceof Error) throw nextCapability;
      return nextCapability;
    },
    async start() {
      calls.start++;
	  let captureState = 'recording';
      return {
		status() { return {captureState, counts: {observed: 0}}; },
        async stop() { calls.stop++; return saved; },
		async pause() { calls.pause++; captureState = 'paused'; },
		async resume() { calls.resume++; captureState = 'recording'; },
		async excludeControlClick() { calls.exclude++; },
      };
    },
    async buildActions(recordingDir) {
      calls.build++;
      assert.equal(recordingDir, saved.recordingDir);
      return actions;
    },
    async generateScript(actionsFile) {
      calls.generate++;
      assert.equal(actionsFile, actions.actionsFile);
      return generated;
    },
  };
  const app = RecordingConsole.createApp({
    recorder,
    FloatingWindow: class extends FakeFloatingWindow {
      constructor(options) {
        super(options);
        toolbar = this;
      }
    },
    getActiveWindow: async () => {
      calls.activeWindow++;
      return {pid: 912, title: 'Recorder Test Target'};
    },
    dialog: {async alert(input) { alerts.push(input); }},
    command: {async run() {
      calls.command++;
      return {exitCode: 0, stdout: 'fixture run', stderr: ''};
    }},
    file: {
      join: path.posix.join,
      ensureDir() {},
      read(filename) {
        assert.equal(filename, generated.scriptFile);
        return '// generated fixture';
      },
    },
    execution: {workdir: '/repo', scriptDir: '/repo/apps/opendesk/recorder'},
    system: {product: {website: 'https://opendesk.example'}},
    sleep: async () => {},
    countdownStepMs: 0,
    logger: {log() {}, error() {}},
	openMeasurement: async () => { calls.measurement++; },
  });
  return {
    app,
    calls,
    alerts,
    saved,
    actions,
    generated,
    toolbar: () => toolbar,
    setCapability(value) { nextCapability = value; },
  };
}

test('Measurement opens independently and pauses Recorder without auto-resume', async () => {
  const f = fixture(capability(true));
  await f.app.show();
  const measurement = f.toolbar().buttons.get('measurement');
  assert.ok(measurement, 'Recorder must expose an independent Measurement button');

  await measurement.handler({type: 'click'});
  assert.equal(f.calls.measurement, 1);
  assert.equal(f.calls.start, 0, 'Measurement must not start recording');

  await f.app.start();
  assert.equal(f.app.state().phase, 'recording');
  await measurement.handler({type: 'click', bounds: {x: 10, y: 10, width: 20, height: 20}});

  assert.equal(f.calls.exclude, 1, 'toolbar click must be excluded before pausing');
  assert.equal(f.calls.pause, 1, 'recording must use the formal pause transition');
  assert.equal(f.calls.resume, 0, 'Measurement exit must never resume recording');
  assert.equal(f.calls.measurement, 2);
  assert.equal(f.app.state().phase, 'paused');
  assert.equal(f.app.state().nativeStatus.captureState, 'paused');
});

test('Recorder starts unavailable without entering ready or calling Recorder.start', async () => {
  const f = fixture(capability(false, 'denied'));
  await f.app.show();
  assert.equal(f.app.state().phase, 'unavailable');
  assert.equal(f.toolbar().buttons.get('capture').patch.disabled, true);
  assert.equal(f.toolbar().buttons.get('capture').patch.label, '录制需要授权（查看详情）');

  await f.app.start();
  assert.equal(f.app.state().phase, 'unavailable');
  assert.equal(f.calls.start, 0);
  assert.equal(f.calls.activeWindow, 0);
  assert.equal(f.calls.capabilities, 2, 'initialization and start preflight are silent reads');
});

test('Recorder keeps non-permission capture failures distinct from authorization failures', async () => {
  const f = fixture(capability(false, 'unsupported'));
  await f.app.show();
  assert.equal(f.toolbar().buttons.get('capture').patch.label, '暂不能录制，请查看详情');
  assert.equal(f.toolbar().buttons.get('capture').patch.disabled, true);
});

test('host authorization gate is diagnosed separately from system permission', async () => {
  const f = fixture(capability(false, 'denied', false));
  await f.app.show();

  assert.equal(f.toolbar().buttons.get('capture').patch.label, '暂不能录制，请查看详情');
  await f.app.showDetails();

  assert.equal(f.calls.start, 0);
  assert.match(f.alerts.at(-1).message, /入口授权：未允许；系统权限：denied/);
  assert.match(f.alerts.at(-1).message, /-allow-recorder-capture/);
});

test('view details silently refreshes Recorder capability and restores manual start without auto-starting', async () => {
  const f = fixture(capability(false, 'denied'));
  await f.app.show();
  f.setCapability(capability(true));

  await f.app.showDetails();

  assert.equal(f.calls.capabilities, 2, 'view details must read current capabilities again');
  assert.equal(f.app.state().phase, 'ready');
  assert.match(f.app.state().detail, /请手动点击“开始录制”/);
  assert.equal(f.toolbar().buttons.get('capture').patch.disabled, false);
  assert.equal(f.toolbar().buttons.get('capture').patch.label, '开始录制');
  assert.equal(f.calls.start, 0, 'capability recovery must not start native capture');
  assert.match(f.alerts.at(-1).message, /采集能力：可用/);
});

test('start preflight refreshes to unavailable before countdown, target lookup, or Recorder.start', async () => {
  const f = fixture(capability(true));
  await f.app.show();
  f.setCapability(capability(false, 'denied'));

  await f.app.start();

  assert.equal(f.calls.capabilities, 2);
  assert.equal(f.app.state().phase, 'unavailable');
  assert.match(f.app.state().detail, /输入监控/);
  assert.equal(f.calls.activeWindow, 0);
  assert.equal(f.calls.start, 0);
});

test('capability check errors block start and are reported as unreliable rather than ready', async () => {
  const f = fixture(capability(true));
  await f.app.show();
  f.setCapability(new Error('fixture capability probe failed'));

  await f.app.start();
  await f.app.showDetails();

  assert.equal(f.app.state().phase, 'unavailable');
  assert.match(f.app.state().detail, /无法可靠检查当前录制条件/);
  assert.equal(f.calls.start, 0);
  assert.equal(f.calls.activeWindow, 0);
  assert.match(f.alerts.at(-1).message, /无法可靠检查当前录制条件/);
});

test('manual start runs countdown, capture, pause, resume, stop, save, build, and generate in order', async () => {
  const f = fixture(capability(true));
  await f.app.show();

  await f.app.start();
  assert.equal(f.app.state().phase, 'recording');
  assert.equal(f.calls.capabilities, 2, 'manual start must perform a second capability read');
  assert.equal(f.calls.activeWindow, 1);
  assert.equal(f.calls.start, 1);

  await f.app.pauseOrResume();
  assert.equal(f.app.state().phase, 'paused');
  await f.app.pauseOrResume();
  assert.equal(f.app.state().phase, 'recording');

  await f.app.stop();
  const finished = f.app.state();
  assert.equal(f.calls.pause, 1);
  assert.equal(f.calls.resume, 1);
  assert.equal(f.calls.stop, 1);
  assert.equal(f.calls.build, 1);
  assert.equal(f.calls.generate, 1);
  assert.equal(f.calls.command, 0, 'generation must not automatically replay');
  assert.equal(finished.phase, 'generated');
  assert.deepEqual(finished.saved, f.saved);
  assert.deepEqual(finished.actions, f.actions);
  assert.equal(finished.generated.scriptFile, f.generated.scriptFile);
  assert.equal(finished.generated.candidateFile, f.generated.candidateFile);
});

for (const [name, invalidCapability] of [
  ['unavailable', capability(false, 'denied')],
  ['check-error', new Error('fixture capability probe failed')],
]) {
  test(`capability ${name} refresh and blocked restart preserve saved recording artifacts`, async () => {
    const f = fixture(capability(true));
    await f.app.start();
    await f.app.stop();
    await f.app.runGenerated();
    const before = f.app.state();
    assert.equal(before.phase, 'run-succeeded');
    assert.deepEqual(before.saved, f.saved);
    assert.deepEqual(before.actions, f.actions);
    assert.equal(before.generated.scriptFile, f.generated.scriptFile);
    assert.equal(before.generated.candidateFile, f.generated.candidateFile);
    assert.equal(before.run.status, 'succeeded');

    f.setCapability(invalidCapability);
    await f.app.showDetails();
    await f.app.start();
    const after = f.app.state();

    assert.equal(f.calls.start, 1, 'blocked restart must not create another native recorder session');
    assert.equal(f.calls.activeWindow, 1, 'blocked restart must return before target lookup or artifact cleanup');
    assert.deepEqual(after.saved, before.saved, 'saved recording/raw/manifest state must survive refresh');
    assert.deepEqual(after.actions, before.actions, 'built actions must survive refresh');
    assert.deepEqual(after.generated, before.generated, 'generated script and candidate must survive refresh');
    assert.deepEqual(after.run, before.run, 'previous generated run result must survive refresh');
    assert.match(after.detail, /已有录制\/生成结果已保留|无法可靠检查当前录制条件/);
  });
}
