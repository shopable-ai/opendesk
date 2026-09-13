'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'app-controller.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});
const ProductAppController = globalThis.OpenDeskProductAppController;

function harness(options = {}) {
  let listener = null;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const runnerCalls = [];
  const schedulerOpenCalls = [];
  const schedulerNewCalls = [];
  const inspectorCalls = [];
  const permissionCalls = [];
  const errors = [];
  const runtimeLogCalls = [];
  const developerCalls = [];
  const appRuntime = {
    onAction(callback) {
      subscriptions++;
      listener = callback;
      return () => { unsubscriptions++; listener = null; };
    },
  };
  const runner = {
    async open(source) {
      runnerCalls.push(source);
      if (options.rejectRunnerSource === source) throw new Error('runner action rejected');
    },
  };
  const schedulerCenter = {
    async open(source) { schedulerOpenCalls.push(source); },
    async openCreate(source) { schedulerNewCalls.push(source); },
  };
  const inspectorLauncher = {
    async open(source) {
      inspectorCalls.push(source);
      if (options.rejectInspectorSource === source) throw new Error('inspector action rejected');
    },
  };
  const permissionsCenter = {
    async open(source) { permissionCalls.push(source); },
  };
  const controller = ProductAppController.create({
    appRuntime,
    runner,
    schedulerCenter,
    inspectorLauncher,
    permissionsCenter,
    runtimeLog: {async open(source) { runtimeLogCalls.push(source); }},
    developerTools: {async activate(id) { developerCalls.push(id); }},
    logger: {error(message) { errors.push(String(message)); }},
  });
  return {
    controller,
    dispatch(event) {
      assert.equal(typeof listener, 'function', 'App action listener must remain registered');
      listener(event);
    },
    runnerCalls,
    schedulerOpenCalls,
    schedulerNewCalls,
    inspectorCalls,
    permissionCalls,
    runtimeLogCalls,
    developerCalls,
    errors,
    get subscriptions() { return subscriptions; },
    get unsubscriptions() { return unsubscriptions; },
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('routes Scheduler Center, Inspector and Permissions Center actions through one durable controller', async () => {
  const f = harness();
  f.controller.start();
  f.dispatch({id: 'scheduler.open', source: 'tray-menu'});
  f.dispatch({id: 'scheduler.new', source: 'tray-menu'});
  f.dispatch({id: 'inspector.open', source: 'tray-menu'});
  f.dispatch({id: 'permissions.open', source: 'tray-menu'});
  await settle();
  assert.deepEqual(f.schedulerOpenCalls, ['tray-menu']);
  assert.deepEqual(f.schedulerNewCalls, ['tray-menu']);
  assert.deepEqual(f.inspectorCalls, ['tray-menu']);
  assert.deepEqual(f.permissionCalls, ['tray-menu']);
  assert.equal(f.subscriptions, 1);
  assert.equal(f.unsubscriptions, 0);
});

test('routes Runtime Log and nested developer actions through the same App Shell listener', async () => {
  const f = harness();
  f.controller.start();
  f.dispatch({id: 'runtime.log', source: 'tray-menu'});
  f.dispatch({id: 'opendesk.status', source: 'tray-menu'});
  f.dispatch({id: 'opendesk.inspector.open', source: 'tray-menu'});
  f.dispatch({id: 'opendesk.debug.detailed', source: 'tray-menu'});
  await settle();
  assert.deepEqual(f.runtimeLogCalls, ['tray-menu']);
  assert.deepEqual(f.developerCalls, [
    'opendesk.status', 'opendesk.inspector.open', 'opendesk.debug.detailed',
  ]);
  assert.equal(f.subscriptions, 1);
});

test('Runner hide or close does not unsubscribe the product action dispatcher', async () => {
  const f = harness();
  f.controller.start();
  f.controller.start();

  // Runner window lifecycle is deliberately outside this controller. These
  // state transitions therefore cannot dispose the App Shell listener.
  const runnerWindow = {hidden: false, closed: false};
  runnerWindow.hidden = true;
  f.dispatch({id: 'scheduler.open', source: 'runner-hidden'});
  runnerWindow.closed = true;
  f.dispatch({id: 'scheduler.open', source: 'runner-closed'});
  await settle();

  assert.deepEqual(f.schedulerOpenCalls, ['runner-hidden', 'runner-closed']);
  assert.equal(f.subscriptions, 1, 'start is idempotent');
  assert.equal(f.unsubscriptions, 0, 'only unified Runtime teardown owns listener cleanup');
});

test('one rejected action is logged and the next action still runs', async () => {
  const f = harness({rejectRunnerSource: 'reject-me'});
  f.controller.start();
  f.dispatch({id: 'runner.open', source: 'reject-me'});
  await settle();
  f.dispatch({id: 'scheduler.open', source: 'after-rejection'});
  await settle();

  assert.deepEqual(f.runnerCalls, ['reject-me']);
  assert.deepEqual(f.schedulerOpenCalls, ['after-rejection']);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /\[APP_ACTION\] action=runner\.open stage=dispatch/);
  assert.match(f.errors[0], /runner action rejected/);
  assert.deepEqual(f.controller.state(), {started: true, handledActions: 1, failedActions: 1});
});

test('Inspector launch failures are isolated and use the Inspector log prefix', async () => {
  const f = harness({rejectInspectorSource: 'reject-inspector'});
  f.controller.start();
  f.dispatch({id: 'inspector.open', source: 'reject-inspector'});
  await settle();
  f.dispatch({id: 'scheduler.open', source: 'after-inspector-rejection'});
  await settle();

  assert.deepEqual(f.inspectorCalls, ['reject-inspector']);
  assert.deepEqual(f.schedulerOpenCalls, ['after-inspector-rejection']);
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0], /\[INSPECTOR\] action=inspector\.open stage=dispatch/);
  assert.match(f.errors[0], /inspector action rejected/);
  assert.deepEqual(f.controller.state(), {started: true, handledActions: 1, failedActions: 1});
});

test('Developer tools keep Inspector, LAN, debug, logs, and status in the product process', async () => {
  const originalDeveloperTools = globalThis.OpenDeskDeveloperTools;
  const menuUpdates = [];
  const commandCalls = [];
  const copied = [];
  const detailModes = [];
  const controls = new Map();
  let statusWindowCreates = 0;
  let lanEnabled = false;
  try {
    const developerToolsFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'developer-tools.js');
    vm.runInThisContext(fs.readFileSync(developerToolsFile, 'utf8'), {filename: developerToolsFile});
    const appRuntime = {
      getCapabilities() { return {packageId: 'com.opendesk.desktop'}; },
      async updateMenuItem(id, patch) { menuUpdates.push({id, patch}); },
    };
    const runtimeLog = {
      state() { return {detailMode: detailModes.at(-1) || 'normal', runRoot: '/data/runs'}; },
      async setDetailMode(mode) { detailModes.push(mode); },
      async openDirectory() { return '/data/runs'; },
    };
    const tools = globalThis.OpenDeskDeveloperTools.create({
      appRuntime,
      runner: {state() { return {active: true, runner: {listVisible: true}}; }},
      schedulerClient: {getCapabilities() { return {available: true, endpoint: 'app-loopback'}; }},
      runtimeLog,
      execution: {id: 'app-001', env: {
        OPENDESK_APP_INSPECTOR_ENDPOINT: 'http://127.0.0.1:54321',
        OPENDESK_APP_INSPECTOR_CONTROL_TOKEN: 'control-token',
      }},
      system: {getPlatformInfo() { return {os: 'darwin'}; }},
      command: {async run(command, args, options) {
        commandCalls.push({command, args, options}); return {exitCode: 0, stdout: '', stderr: ''};
      }},
      http: {
        async get(_url, options) {
          assert.equal(options.headers['X-OpenDesk-Inspector-Control'], 'control-token');
          return {data: {code: 0, data: {allowLAN: lanEnabled, lanUrl: lanEnabled ? 'http://192.0.2.10:54321' : ''}}};
        },
        async post(_url, body, options) {
          assert.equal(options.headers['X-OpenDesk-Inspector-Control'], 'control-token');
          lanEnabled = body.allow;
          return {data: {code: 0, data: {allowLAN: lanEnabled, lanUrl: lanEnabled ? 'http://192.0.2.10:54321' : ''}}};
        },
      },
      clipboard: {copy(value) { copied.push(value); }},
      productPaths: {appDataRoot: '/data'},
      ui: {
        async notify() {},
        async createWindow() {
          statusWindowCreates++;
          const closeHandlers = [];
          return {
            control(id) {
              if (!controls.has(id)) controls.set(id, []);
              return {
                async update(patch) { controls.get(id).push(patch); },
                on() {},
              };
            },
            on(event, handler) { if (event === 'close') closeHandlers.push(handler); },
            async show() {},
            async close() { for (const handler of closeHandlers) handler(); },
          };
        },
      },
    });

    await tools.initialize();
    assert.equal(tools.state().allowLAN, false);
    await tools.activate('opendesk.inspector.lan.toggle');
    assert.equal(tools.state().allowLAN, true);
    await tools.activate('opendesk.inspector.lan.copy');
    assert.deepEqual(copied, ['http://192.0.2.10:54321']);
    await tools.activate('opendesk.debug.detailed');
    assert.deepEqual(detailModes, ['detailed']);
    await tools.activate('opendesk.inspector.open');
    assert.deepEqual(commandCalls.at(-1), {
      command: '/usr/bin/open',
      args: ['http://127.0.0.1:54321/accessibility-workbench/'],
      options: {timeout: 10000, maxOutputBytes: 256 * 1024, hideWindow: true},
    });
    await Promise.all([
      tools.activate('opendesk.status'),
      tools.activate('opendesk.status'),
    ]);
    assert.equal(statusWindowCreates, 1);
    assert.equal(tools.state().statusOpen, true);
    assert.equal(controls.get('executionId').at(-1).text, 'app-001');
    assert.equal(controls.get('runner').at(-1).text, '已显示');
    assert.ok(menuUpdates.some(update => update.id === 'opendesk.inspector.lan.copy' && update.patch.enabled === true));
    assert.ok(menuUpdates.some(update => update.id === 'opendesk.debug.detailed' && update.patch.label === '✓ 详细'));
  } finally {
    if (originalDeveloperTools === undefined) delete globalThis.OpenDeskDeveloperTools;
    else globalThis.OpenDeskDeveloperTools = originalDeveloperTools;
  }
});

test('Runtime Log reads canonical artifacts, tails detailed events, and rebuilds after close', async () => {
  const originals = Object.fromEntries(['File', 'Command', 'System', 'ui', 'OpenDeskProductPaths']
    .map(key => [key, globalThis[key]]));
  const root = '/data/.runtime/examples/custom-ui/script-runner-simple/runs';
  const run = `${root}/run-001`;
  const schedulerRun = `${root}/scheduler-20260912-110100-000000`;
  const contents = new Map([
    [`${run}/summary.json`, JSON.stringify({
      execution_id: 'exec-001', source: '/recipes/daily.js', status: 'failed', error: 'summary failure',
      started_at: '2026-09-12T10:00:00Z', finished_at: '2026-09-12T10:00:01Z',
    })],
    [`${run}/agent_summary.json`, JSON.stringify({executionId: 'exec-001', status: 'failed', errors: [{message: 'agent failure'}]})],
    [`${run}/stdout.log`, 'x'.repeat(600 * 1024)],
    [`${run}/stderr.log`, 'hello stderr'],
    [`${run}/events.ndjson`, '{"kind":"execution.started"}\n{"kind":"execution.failed"}\n'],
  ]);
  const directories = new Set([root, run]);
  const commandCalls = [];
  const windows = [];
  const windowSpecs = [];
  const controls = new Map();
  try {
    globalThis.File = {
      join: (...parts) => path.posix.join(...parts),
      stat(filename) {
        if (directories.has(filename)) return {type: 'directory'};
        if (contents.has(filename)) return {type: 'file', size: contents.get(filename).length};
        return null;
      },
      listDir(filename) {
        return filename === root
          ? Array.from(directories).filter(directory => directory !== root).map(directory => path.posix.basename(directory))
          : [];
      },
      read(filename) { return contents.get(filename); },
    };
    globalThis.Command = {async run(command, args, options) {
      commandCalls.push({command, args, options});
      return {exitCode: 0, stdout: args.includes(`${run}/stdout.log`) ? 'tailed stdout' : '', stderr: ''};
    }};
    globalThis.System = {getPlatformInfo() { return {os: 'darwin'}; }};
    globalThis.OpenDeskProductPaths = {appDataRoot: '/data'};
    globalThis.ui = {async createWindow(spec) {
      const closeHandlers = [];
      const win = {
        control(id) {
          if (!controls.has(id)) controls.set(id, {updates: [], handlers: {}});
          const record = controls.get(id);
          return {
            async update(patch) { record.updates.push(patch); },
            on(event, handler) { record.handlers[event] = handler; },
          };
        },
        on(event, handler) { if (event === 'close') closeHandlers.push(handler); },
        async show() {},
        async close() { for (const handler of closeHandlers) handler(); },
      };
      windowSpecs.push(spec);
      windows.push(win);
      return win;
    }};
    const runtimeLogFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'runtime-log.js');
    vm.runInThisContext(fs.readFileSync(runtimeLogFile, 'utf8'), {filename: runtimeLogFile});
    const runtimeLog = globalThis.OpenDeskRuntimeLog.create({
      runner: {state() { return {latestExecution: {scriptPath: '/recipes/daily.js', logDir: run, status: 'failed'}}; }},
    });
    await Promise.all([
      runtimeLog.open('test'),
      runtimeLog.open('test'),
    ]);
    assert.equal(windows.length, 1);
    assert.doesNotMatch(windowSpecs[0].content.html, /<pre\b/i,
      'Runtime Log content must stay within the Custom UI v1 element allowlist');
    assert.match(windowSpecs[0].content.html, /<p id="stdout" class="log-output"><\/p>/);
    assert.match(windowSpecs[0].content.html, /<p id="stderr" class="log-output"><\/p>/);
    assert.match(windowSpecs[0].content.html, /<p id="summary" class="log-output"><\/p>/);
    assert.equal(controls.get('automation').updates.at(-1).text, 'daily.js');
    assert.equal(controls.get('executionId').updates.at(-1).text, 'exec-001');
    assert.equal(controls.get('runStatus').updates.at(-1).text, 'failed');
    assert.equal(controls.get('stdout').updates.filter(update => update.text !== undefined).at(-1).text, 'tailed stdout');
    assert.deepEqual(commandCalls[0], {
      command: '/usr/bin/tail',
      args: ['-c', String(128 * 1024), `${run}/stdout.log`],
      options: {timeout: 10000, maxOutputBytes: 256 * 1024, hideWindow: true},
    });
    assert.equal(controls.get('stderr').updates.filter(update => update.text !== undefined).at(-1).text, 'hello stderr');
    directories.add(schedulerRun);
    contents.set(`${schedulerRun}/summary.json`, JSON.stringify({
      execution_id: 'scheduler-001', source: 'scheduler:file:scheduled.js',
      script_snapshot_path: `${schedulerRun}/scheduled.js`, status: 'succeeded',
      started_at: '2026-09-12T11:01:00Z', finished_at: '2026-09-12T11:01:01Z',
    }));
    contents.set(`${schedulerRun}/stdout.log`, 'scheduler stdout');
    contents.set(`${schedulerRun}/stderr.log`, '');
    contents.set(`${schedulerRun}/events.ndjson`, '{"kind":"scheduler.completed"}\n');
    await runtimeLog.refresh('scheduler completed');
    assert.equal(runtimeLog.state().selectedDirectory, schedulerRun);
    assert.equal(controls.get('automation').updates.at(-1).text, 'scheduled.js');
    assert.equal(controls.get('executionId').updates.at(-1).text, 'scheduler-001');
    await runtimeLog.setDetailMode('detailed');
    await runtimeLog.refresh('detailed');
    assert.match(controls.get('summary').updates.filter(update => update.text !== undefined).at(-1).text, /Events tail/);
    await runtimeLog.openDirectory();
    assert.equal(commandCalls.at(-1).options.hideWindow, true);
    await windows[0].close();
    await runtimeLog.open('reopen');
    assert.equal(windows.length, 2);
    assert.equal(runtimeLog.state().detailMode, 'detailed');
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
