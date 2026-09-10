'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const historyPath = path.join(repoRoot, 'examples', 'custom-ui', 'recording-console-simple', 'recording-history.js');
const controllerPath = path.join(repoRoot, 'examples', 'custom-ui', 'recording-console-simple', 'controller.js');
const historySource = fs.readFileSync(historyPath, 'utf8');
vm.runInThisContext(historySource, {filename: 'recording-history.js'});
const History = globalThis.OpenDeskRecordingHistory;

function makeFile() {
  return {
    join: path.join,
    stat(value) {
      try {
        const info = fs.statSync(value);
        return {
          type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other',
          size: info.isFile() ? info.size : null,
          modifiedAt: info.mtime.toISOString(),
        };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    listDir: value => fs.readdirSync(value),
    read: value => fs.readFileSync(value, 'utf8'),
    write(value, text) { fs.writeFileSync(value, text); },
    removeDir(value) { fs.rmSync(value, {recursive: true, force: true}); },
    ensureDir(value) { fs.mkdirSync(value, {recursive: true}); },
  };
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function createRecording(root, id, options = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'generated'), {recursive: true});
  writeJSON(path.join(dir, 'manifest.json'), {
    formatVersion: 'opendesk.recorder.recording/v2',
    recordingId: options.manifestId || id,
    state: options.state || 'stopped',
    startedAt: options.startedAt || '2026-09-10T10:00:00.000Z',
    within: {processId: 7, title: options.title || 'Calculator'},
    storage: {state: 'saved'},
    issues: options.issues || [],
  });
  if (options.displayName) {
    writeJSON(path.join(dir, 'ui-metadata.json'), {schemaVersion: 1, recordingId: id, displayName: options.displayName});
  }
  if (options.canonical !== false) fs.writeFileSync(path.join(dir, 'generated', 'basic.recipe.js'), '// basic\n');
  for (const name of options.extraScripts || []) fs.writeFileSync(path.join(dir, 'generated', name), '// extra\n');
  return dir;
}

function makeToolbar() {
  const buttons = new Map();
  const controls = new Map([['pointerMotion', {value: true, disabled: false}]]);
  const toolbar = {
    id: 'toolbar-test',
    options: null,
    addButton(id, label, icon, callback) { buttons.set(id, {id, label, icon, callback, active: false, disabled: false, error: null, badge: null}); },
    addSeparator() {},
    addSwitch(id, label, options, callback) { controls.set(id, {id, label, value: !!options.value, disabled: false, callback}); },
    updateButton: async (id, patch) => Object.assign(buttons.get(id), patch),
    getButtonState: async id => ({...buttons.get(id)}),
    updateControl: async (id, patch) => {
      const current = controls.get(id);
      if ('checked' in patch) current.value = patch.checked;
      if ('disabled' in patch) current.disabled = patch.disabled;
      return {...current};
    },
    getControlState: async id => ({...controls.get(id)}),
    onError() {}, on() {}, show: async () => ({bounds: {}}), hide: async () => null,
    close: async () => null, getState: async () => ({}), waitUntilClosed: async () => ({}),
  };
  toolbar.buttons = buttons;
  toolbar.controls = controls;
  return toolbar;
}

function makeUI() {
  const ids = [];
  const windows = [];
  return {
    ids,
    windows,
    async createWindow(spec) {
      ids.push(spec.id);
      const listeners = {};
      const controls = new Map();
      const control = id => {
        if (!controls.has(id)) {
          controls.set(id, {
            id,
            listeners: {},
            on(type, callback) { this.listeners[type] = callback; return () => {}; },
            async update(patch) { this.patch = {...(this.patch || {}), ...patch}; return this.patch; },
          });
        }
        return controls.get(id);
      };
      const handle = {
        spec, controls, visible: false, closed: false,
        control,
        on(type, callback) { listeners[type] = callback; return () => {}; },
        async show() { this.visible = true; return {visible: true}; },
        async close() { this.closed = true; this.visible = false; if (listeners.close) listeners.close({type: 'close'}); return {visible: false}; },
      };
      windows.push(handle);
      return handle;
    },
  };
}

async function main() {
  let passed = 0;
  async function test(name, fn) {
    await fn();
    passed++;
    console.log('PASS', name);
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-history-'));
  const root = path.join(temp, '.runtime', 'recordings');
  fs.mkdirSync(root, {recursive: true});
  const File = makeFile();

  await test('scan uses File.stat().type, sorts newest first, and reads local display metadata', async () => {
    createRecording(root, 'rec-old', {startedAt: '2026-09-09T10:00:00Z', displayName: '旧任务'});
    createRecording(root, 'rec-new', {startedAt: '2026-09-10T11:00:00Z', title: 'TextEdit'});
    fs.mkdirSync(path.join(root, 'not-a-recording'), {recursive: true});
    const rows = History.scanRecordings(File, root);
    assert.deepStrictEqual(rows.map(row => row.recordingId), ['rec-new', 'rec-old']);
    assert.strictEqual(rows[1].displayName, '旧任务');
    assert.strictEqual(path.basename(rows[0].scriptFile), 'basic.recipe.js');
  });

  await test('script resolution prefers canonical basic.recipe.js and has deterministic recipe fallback', async () => {
    const canonical = path.join(root, 'rec-old');
    assert.strictEqual(path.basename(History.resolveGeneratedScript(File, canonical)), 'basic.recipe.js');
    const fallback = createRecording(root, 'rec-fallback', {canonical: false, extraScripts: ['z.recipe.js', 'a.recipe.js']});
    const same = new Date('2026-09-10T12:00:00Z');
    fs.utimesSync(path.join(fallback, 'generated', 'z.recipe.js'), same, same);
    fs.utimesSync(path.join(fallback, 'generated', 'a.recipe.js'), same, same);
    assert.strictEqual(path.basename(History.resolveGeneratedScript(File, fallback)), 'a.recipe.js');
  });

  await test('manifest identity mismatch is not accepted as a recording row', async () => {
    createRecording(root, 'rec-mismatch', {manifestId: 'rec-other'});
    const rows = History.scanRecordings(File, root);
    assert.ok(!rows.some(row => row.recordingId === 'rec-mismatch'));
  });

  await test('rename writes ui-metadata.json without renaming the immutable recording directory', async () => {
    const toolbar = makeToolbar();
    const ui = makeUI();
    const dialog = {alert: async () => {}, confirm: async () => false, prompt: async () => '  新名称  '};
    const manager = History.createManager({
      file: File, ui, dialog, command: {run: async () => ({exitCode: 0})},
      execution: {workdir: temp}, system: {getPlatformInfo: () => ({os: 'darwin'})},
      toolbar, app: {state: () => ({phase: 'ready'})}, recordingsRoot: root, runCountdownStepMs: 0,
    });
    await manager.rename('rec-old');
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'rec-old', 'ui-metadata.json'), 'utf8'));
    assert.strictEqual(metadata.displayName, '新名称');
    assert.ok(fs.existsSync(path.join(root, 'rec-old')));
  });

  await test('delete requires confirmation and removes only the validated recording directory', async () => {
    const target = createRecording(root, 'rec-delete');
    const sibling = createRecording(root, 'rec-keep');
    let confirmed = false;
    const manager = History.createManager({
      file: File, ui: makeUI(), dialog: {alert: async () => {}, prompt: async () => null, confirm: async () => confirmed},
      command: {run: async () => ({exitCode: 0})}, execution: {workdir: temp},
      system: {getPlatformInfo: () => ({os: 'darwin'})}, toolbar: makeToolbar(),
      app: {state: () => ({phase: 'ready'})}, recordingsRoot: root, runCountdownStepMs: 0,
    });
    await manager.remove('rec-delete');
    assert.ok(fs.existsSync(target));
    confirmed = true;
    await manager.remove('rec-delete');
    assert.ok(!fs.existsSync(target));
    assert.ok(fs.existsSync(sibling));
    await assert.rejects(() => manager.remove('../outside'));
  });

  await test('history windows use a new id after close and Windows opens directories with explorer.exe', async () => {
    const ui = makeUI();
    const calls = [];
    const manager = History.createManager({
      file: File, ui, dialog: {alert: async () => {}, prompt: async () => null, confirm: async () => false},
      command: {run: async (...args) => { calls.push(args); return {exitCode: 0}; }}, execution: {workdir: temp},
      system: {getPlatformInfo: () => ({os: 'windows'})}, toolbar: makeToolbar(),
      app: {state: () => ({phase: 'ready'})}, recordingsRoot: root, platform: 'windows', runCountdownStepMs: 0,
    });
    const first = await manager.open();
    await first.close();
    await manager.open();
    assert.deepStrictEqual(ui.ids.slice(-2), ['recordingHistory1', 'recordingHistory2']);
    await manager.openDirectory('rec-old');
    assert.strictEqual(calls.at(-1)[0], 'explorer.exe');
    assert.strictEqual(calls.at(-1)[1][0], path.join(root, 'rec-old'));
  });

  await test('history run is explicit, cancellable, and the wrapper Stop callback cancels it instead of core Stop', async () => {
    const wrapperSource = fs.readFileSync(controllerPath, 'utf8');
    const ui = makeUI();
    const innerToolbar = makeToolbar();
    let constructedOptions = null;
    function BaseFloatingWindow(options) {
      constructedOptions = options;
      return innerToolbar;
    }
    const fakeCoreSource = `
      (function (global) {
        global.OpenDeskSimpleRecordingConsole = Object.freeze({
          buildAgentRefinementPrompt() { return 'core'; },
          createApp(options) {
            const toolbar = new options.FloatingWindow({toolbar:{maxColumns:7,maxRows:1}});
            toolbar.addButton('capture','capture','play.fill',()=>{});
            toolbar.addButton('stop','stop','stop.fill',()=>{ global.__coreStopCalls++; });
            toolbar.addButton('replay','replay','repeat',()=>{});
            toolbar.addSwitch('pointerMotion','pointer',{value:true},()=>{});
            toolbar.addButton('agentPrompt','agent','ai.assistant',()=>{});
            toolbar.addButton('details','details','info.circle',()=>{});
            toolbar.addButton('finder','finder','folder.fill',()=>{});
            return Object.freeze({
              run: async()=>({}), show: async()=>({}), close: async()=>({}), stop: async()=>{ global.__coreStopCalls++; },
              state:()=>({phase:'ready'}), toolbar:()=>toolbar,
            });
          }
        });
      })(globalThis);`;
    const fakeFile = {...File, read(value) {
      if (String(value).endsWith('controller-core.js')) return fakeCoreSource;
      if (String(value).endsWith('recording-history.js')) return historySource;
      return File.read(value);
    }};
    const pendingCommands = [];
    const command = {run(executable, args, options) {
      if (executable === 'explorer.exe' || executable === '/usr/bin/open' || executable === 'xdg-open') return Promise.resolve({exitCode: 0});
      return new Promise((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('canceled'), {code: 'CANCELED'}));
        options.signal.addEventListener('abort', abort, {once: true});
        pendingCommands.push({resolve, reject, executable, args, options});
      });
    }};
    const context = {
      console,
      File: fakeFile,
      Execution: {workdir: temp, scriptDir: path.join(temp, 'examples', 'custom-ui')},
      FloatingWindow: BaseFloatingWindow,
      ui,
      Dialog: {alert: async () => {}, prompt: async () => null, confirm: async () => false},
      Command: command,
      System: {getPlatformInfo: () => ({os: 'darwin'})},
      AbortController,
      setTimeout,
      clearTimeout,
      __coreStopCalls: 0,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(wrapperSource, context, {filename: 'controller.js'});
    const app = context.OpenDeskSimpleRecordingConsole.createApp({historyCountdownStepMs: 0});
    assert.strictEqual(constructedOptions.toolbar.maxColumns, 8);
    assert.ok(innerToolbar.buttons.has('history'));
    const runPromise = app.history().runRecording('rec-old');
    for (let i = 0; i < 20 && pendingCommands.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.strictEqual(pendingCommands.length, 1);
    await innerToolbar.buttons.get('stop').callback({type: 'click'});
    const result = await runPromise;
    assert.strictEqual(result.status, 'canceled');
    assert.strictEqual(context.__coreStopCalls, 0);
  });

  console.log(`recording-history tests: ${passed}/7 passed`);
  fs.rmSync(temp, {recursive: true, force: true});
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
