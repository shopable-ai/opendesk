'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const historyPath = path.resolve(__dirname, '../../examples/custom-ui/recording-console-simple/recording-history.js');
vm.runInThisContext(fs.readFileSync(historyPath, 'utf8'), {filename: historyPath});
const History = globalThis.OpenDeskRecordingHistory;

function makeFile() {
  return {
    join: path.join,
    stat(value) {
      try {
        const info = fs.statSync(value);
        return {type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', size: info.isFile() ? info.size : null, modifiedAt: info.mtime.toISOString()};
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    listDir: value => fs.readdirSync(value),
    read: value => fs.readFileSync(value, 'utf8'),
    write: (value, text) => fs.writeFileSync(value, text),
    removeDir: value => fs.rmSync(value, {recursive: true, force: true}),
    ensureDir: value => fs.mkdirSync(value, {recursive: true}),
  };
}

function makeToolbar() {
  const buttons = new Map();
  const controls = new Map([['pointerMotion', {value: true, disabled: false}]]);
  return {
    buttons,
    controls,
    addButton(id, label, icon, callback) { buttons.set(id, {id, label, icon, callback, disabled: false}); },
    updateButton: async (id, patch) => Object.assign(buttons.get(id), patch),
    getButtonState: async id => ({...buttons.get(id)}),
    updateControl: async (id, patch) => Object.assign(controls.get(id), patch),
    getControlState: async id => ({...controls.get(id)}),
  };
}

function makeUI() {
  const windows = [];
  return {
    windows,
    async createWindow(spec) {
      const controls = new Map();
      const listeners = {};
      const handle = {
        spec,
        controls,
        control(id) {
          if (!controls.has(id)) {
            controls.set(id, {
              patch: {},
              listeners: {},
              on(type, callback) { this.listeners[type] = callback; return () => {}; },
              async update(patch) { Object.assign(this.patch, patch); return {...this.patch}; },
            });
          }
          return controls.get(id);
        },
        on(type, callback) { listeners[type] = callback; return () => {}; },
        async show() { return {visible: true}; },
        async close() { if (listeners.close) listeners.close({type: 'close'}); return {visible: false}; },
      };
      windows.push(handle);
      return handle;
    },
  };
}

function createRecording(root, id) {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'generated'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    formatVersion: 'opendesk.recorder.recording/v2',
    recordingId: id,
    state: 'stopped',
    startedAt: '2026-09-10T10:20:30Z',
    within: {processId: 1, title: 'Calculator'},
    storage: {state: 'saved'},
    issues: [],
  }));
  fs.writeFileSync(path.join(dir, 'generated', 'basic.recipe.js'), '// recipe\n');
}

test('history presentation keeps one horizontal row shape and adds bounded paging controls', async () => {
  const html = History.buildWindowHTML([{
    recordingId: 'rec-demo', displayName: '计算器任务', targetTitle: 'Calculator',
    startedAt: '2026-09-10T10:20:30Z', scriptFile: '/tmp/basic.recipe.js',
  }], '1 条');
  assert.match(html, /<span id="recordingName0"/);
  assert.match(html, /<span id="recordingTime0"/);
  assert.match(html, /id="recordingActions0"/);
  assert.match(html, /id="firstHistory"/);
  assert.match(html, /id="prevHistory"/);
  assert.match(html, /id="pageIndicator"/);
  assert.match(html, /id="nextHistory"/);
  assert.match(html, /id="lastHistory"/);
  assert.doesNotMatch(html, /历史录制/);
  assert.doesNotMatch(html, /historyStatus/);
  assert.doesNotMatch(html, /id="recordingMeta0"/);
  assert.doesNotMatch(html, /id="recordingId0"/);
  assert.match(html, /id="run9"/);
  assert.doesNotMatch(html, /id="run10"/);
  assert.match(html, /id="recording1"[^>]* hidden/);
  assert.match(html, /id="run1"[^>]* hidden/);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-history-ui-'));
  const root = path.join(temp, '.runtime', 'recordings');
  fs.mkdirSync(root, {recursive: true});
  createRecording(root, 'rec-demo');

  const ui = makeUI();
  const toolbar = makeToolbar();
  const manager = History.createManager({
    file: makeFile(), ui, toolbar,
    dialog: {alert: async () => {}, prompt: async () => null, confirm: async () => false},
    command: {run: async () => ({exitCode: 0})},
    execution: {workdir: temp},
    system: {getPlatformInfo: () => ({os: 'darwin'})},
    app: {state: () => ({phase: 'ready'})},
    recordingsRoot: root,
    runCountdownStepMs: 0,
  });

  assert.equal(toolbar.buttons.get('history').icon, 'list.bullet');
  await manager.open();
  const window = ui.windows[0];
  assert.equal(window.spec.position.size.width, 860);
  assert.match(window.spec.content.css, /display: flex/);
  assert.match(window.spec.content.css, /flex: 1 1 auto/);
  assert.equal(window.controls.get('run0').patch.icon, 'play.fill');
  assert.equal(window.controls.get('run0').patch.text, '');
  assert.equal(window.controls.get('rename0').patch.icon, 'pencil');
  assert.equal(window.controls.get('open0').patch.icon, 'folder.fill');
  assert.equal(window.controls.get('delete0').patch.icon, 'trash.fill');
  assert.equal(window.controls.get('firstHistory').patch.icon, 'backward.end.fill');
  assert.equal(window.controls.get('firstHistory').patch.text, '');
  assert.equal(window.controls.get('prevHistory').patch.icon, 'backward.fill');
  assert.equal(window.controls.get('nextHistory').patch.icon, 'forward.fill');
  assert.equal(window.controls.get('lastHistory').patch.icon, 'forward.end.fill');
  assert.equal(window.controls.get('refreshHistory').patch.icon, 'arrow.clockwise');
  assert.equal(window.controls.get('prevHistory').patch.disabled, true);
  assert.equal(window.controls.get('nextHistory').patch.disabled, true);
  assert.equal(window.controls.get('pageIndicator').patch.text, '第 1 / 1 页 · 共 1 条');
  assert.equal(window.controls.get('recording0').patch.visible, true);
  assert.equal(window.controls.get('recording1').patch.visible, false);
  for (const id of ['run1', 'rename1', 'open1', 'delete1']) {
    assert.equal(window.controls.get(id).patch.visible, false, `${id} must be hidden for an empty slot`);
  }
  assert.deepEqual(History.actionIcons(), {run: 'play.fill', rename: 'pencil', open: 'folder.fill', delete: 'trash.fill'});
  assert.deepEqual(History.pagerIcons(), {
    first: 'backward.end.fill', previous: 'backward.fill', next: 'forward.fill',
    last: 'forward.end.fill', refresh: 'arrow.clockwise',
  });

  fs.rmSync(temp, {recursive: true, force: true});
});
