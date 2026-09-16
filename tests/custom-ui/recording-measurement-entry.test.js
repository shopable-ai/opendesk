'use strict';

// Product-composition tests with a fake native toolbar. These do not qualify
// macOS/Windows UI rendering, global shortcut registration, or desktop capture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/opendesk/recorder/controller.js'), 'utf8');

function load(options = {}) {
  const controls = [];
  const buttons = new Map();
  const patches = [];
  const events = [];
  let toolbar;
  let nativeSpec;
  let coreOptions;
  let historyActive = false;
  let canceled = 0;
  let stopped = 0;
  const measure = event => { events.push(event); return 'same-core-measure'; };
  const history = {
    isRunActive: () => historyActive,
    async cancelRun() { canceled++; },
    async syncAvailability() {}, async close() {}, async open() {}, async refresh() {},
  };
  function NativeToolbar(spec) { nativeSpec = spec; this.spec = spec; this.id = spec.id; }
  NativeToolbar.prototype.addButton = function (id, label, icon, callback) {
    assert.equal(buttons.has(id), false, `duplicate native button: ${id}`);
    buttons.set(id, {label, icon, callback}); controls.push(id); return this;
  };
  NativeToolbar.prototype.addSeparator = function (id) { controls.push(id); return this; };
  NativeToolbar.prototype.addSwitch = function (id) { controls.push(id); return this; };
  NativeToolbar.prototype.updateButton = async function (id, patch) {
    assert.ok(buttons.has(id), `native button not created: ${id}`);
    patches.push({id, ...patch}); Object.assign(buttons.get(id), patch); return patch;
  };
  const core = {
    createApp(settings) {
      coreOptions = settings;
      toolbar = new settings.FloatingWindow({
        id: 'recording-console',
        position: {mode: 'anchor', horizontal: 'center', vertical: 'bottom', margin: 24, display: 'active'},
        toolbar: {maxColumns: 9, maxRows: 1},
      });
      // Core owns action semantics; the product adapter only changes placement,
      // product presentation, and shortcut hinting.
      toolbar.addButton('home', '官网', 'house.fill');
      toolbar.addSeparator('brand-capture-separator');
      toolbar.addButton('capture', '开始录制', 'play.fill');
      toolbar.addButton('stop', '停止录制', 'stop.fill', () => { stopped++; });
      // Deliberately keep a different core icon here: the product adapter must
      // normalize the native Measurement affordance to the product icon.
      toolbar.addButton('measurement', '测量', 'ruler', measure);
      toolbar.addSeparator('capture-output-separator');
      toolbar.addButton('replay', '重放', 'repeat');
      toolbar.addSwitch('pointerMotion');
      toolbar.addButton('agentPrompt', 'Agent', 'ai.assistant');
      toolbar.addSeparator('output-info-separator');
      toolbar.addButton('details', '详情', 'info.circle');
      toolbar.addButton('finder', '文件夹', 'folder.fill');
      return {
        toolbar: () => toolbar,
        async show() {}, async run() {}, async close() {}, async stop() {},
      };
    },
  };
  const sandbox = {
    console,
    __core: core,
    __historyAPI: {createManager(settings) {
      settings.toolbar.addButton('history', '历史', 'clock');
      return history;
    }},
    File: {
      join: (...parts) => parts.join('/'),
      read(file) {
        if (file.endsWith('/controller-core.js')) return 'globalThis.OpenDeskSimpleRecordingConsole = __core;';
        if (file.endsWith('/recording-history.js')) return 'globalThis.OpenDeskRecordingHistory = __historyAPI;';
        throw new Error(`unexpected file: ${file}`);
      },
    },
    Execution: {scriptDir: '/bundle', workdir: '/workspace'},
    FloatingWindow: NativeToolbar,
    Dialog: {async alert() {}, async confirm() { return false; }, async prompt() { return null; }},
    ui: {async createWindow() {}},
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {filename: 'controller.js'});
  sandbox.OpenDeskSimpleRecordingConsole.createApp(options);
  return {
    controls, buttons, patches, events, toolbar, coreOptions, measure, nativeSpec,
    setHistoryActive(value) { historyActive = value; },
    counts: () => ({canceled, stopped}),
  };
}

test('measurement is a single right-hand viewfinder tool, separated from capture and output', () => {
  const fixture = load({measurementShortcut: '⌘⇧M'});
  assert.deepEqual(fixture.controls.slice(-5), [
    'details', 'finder', 'info-measurement-separator', 'measurement', 'history',
  ]);
  assert.equal(fixture.controls.filter(id => id === 'measurement').length, 1);
  assert.equal(fixture.controls[fixture.controls.indexOf('stop') + 1], 'capture-output-separator');
  assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
  assert.equal(fixture.nativeSpec.toolbar.maxRows, 1);
  assert.equal(fixture.nativeSpec.toolbar.maxColumns, 10);
  assert.equal(fixture.nativeSpec.position.mode, 'anchor');
  assert.equal(fixture.nativeSpec.position.horizontal, 'center');
  assert.equal(fixture.nativeSpec.position.vertical, 'bottom');
  assert.equal(fixture.nativeSpec.position.margin, 16);
});

test('measurement preserves the exact core callback and event payload', () => {
  const fixture = load();
  const event = {type: 'click', nativeSequence: 42};
  assert.equal(fixture.buttons.get('measurement').callback, fixture.measure);
  assert.equal(fixture.buttons.get('measurement').callback(event), 'same-core-measure');
  assert.equal(fixture.events[0], event);
});

for (const shortcut of ['⌘⇧M', 'Ctrl+Shift+M']) {
  test(`measurement hint survives state changes: ${shortcut}`, async () => {
    const fixture = load({measurementShortcut: shortcut});
    assert.equal(fixture.buttons.get('measurement').label, `测量 · ${shortcut}`);
    assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
    const patch = {label: '桌面测量中', icon: 'ruler', disabled: true, active: true, error: null};
    await fixture.toolbar.updateButton('measurement', patch);
    assert.equal(patch.label, '桌面测量中', 'must not mutate the core presentation');
    assert.equal(patch.icon, 'ruler', 'must not mutate the core icon patch');
    assert.equal(fixture.buttons.get('measurement').label, `桌面测量中 · ${shortcut}`);
    assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
    assert.equal(fixture.buttons.get('measurement').disabled, true);
    assert.equal(fixture.buttons.get('measurement').active, true);
    await fixture.toolbar.updateButton('measurement', {label: '测量', disabled: false, error: 'permission denied'});
    assert.equal(fixture.buttons.get('measurement').label, `测量 · ${shortcut}`);
    assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
    assert.equal(fixture.buttons.get('measurement').error, 'permission denied');
    await fixture.toolbar.updateButton('measurement', {active: false});
    assert.equal(fixture.buttons.get('measurement').label, `测量 · ${shortcut}`);
    assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
  });
}

test('without App shortcut metadata, do not advertise an unbound shortcut', async () => {
  const fixture = load();
  assert.equal(fixture.buttons.get('measurement').label, '测量');
  assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
  await fixture.toolbar.updateButton('measurement', {label: '桌面测量中'});
  assert.equal(fixture.buttons.get('measurement').label, '桌面测量中');
  assert.equal(fixture.buttons.get('measurement').icon, 'viewfinder');
});

test('stop/history cancellation and the script-local home image remain intact', async () => {
  const fixture = load();
  await fixture.buttons.get('stop').callback({type: 'click'});
  fixture.setHistoryActive(true);
  await fixture.buttons.get('stop').callback({type: 'click'});
  assert.deepEqual(fixture.counts(), {canceled: 1, stopped: 1});
  assert.equal(fixture.buttons.get('home').icon.path, '/bundle/assets/opendesk-logo.png');
});

test('embedded Recorder presentation is identical to the canonical source', () => {
  assert.equal(fs.readFileSync(path.join(root, 'internal/recorderbundle/assets/controller.js'), 'utf8'), source);
});

test('registration, menu, and bundled Recorder use one shortcut definition', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const shortcutSource = read('internal/measurementshortcut/shortcut.go');
  assert.match(shortcutSource, /const GlobalShortcutAccelerator = "CommandOrControl\+Shift\+M"/);
  assert.doesNotMatch(shortcutSource, /CommandOrControl\+Alt\+Shift\+M/);
  assert.match(read('cmd/opendesk/app_measurement_shortcut.go'),
    /const measurementGlobalShortcutAccelerator = measurementshortcut\.GlobalShortcutAccelerator/);
  assert.match(read('internal/recorderbundle/bundle.go'), /measurementShortcut: %q/);
  for (const file of ['internal/recorderbundle/bundle.go', 'pkg/appshell/product_menu.go']) {
    assert.match(read(file), /measurementshortcut\.GlobalShortcutLabel\(runtime\.GOOS\)/);
  }
  assert.match(read('pkg/appshell/product_menu.go'), /ID: ActionProductMeasurement, Label: measurementProductLabel\(\)/);
});