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
        return {type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', modifiedAt: info.mtime.toISOString()};
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

function createRecording(root, id, minute, recipe = true) {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, 'generated'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    recordingId: id,
    state: 'stopped',
    startedAt: new Date(Date.UTC(2026, 8, 11, 0, minute, 0)).toISOString(),
    within: {processId: 1, title: id},
    storage: {state: 'saved'},
    issues: [],
  }));
  if (recipe) fs.writeFileSync(path.join(dir, 'generated', 'basic.recipe.js'), '// recipe\n');
}

function makeToolbar() {
  const buttons = new Map([
    ['capture', {disabled: false}],
    ['stop', {disabled: true}],
    ['replay', {disabled: false}],
    ['agentPrompt', {disabled: false}],
  ]);
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
      const window = {
        spec,
        controls,
        control(id) {
          if (!controls.has(id)) {
            controls.set(id, {
              listeners: {},
              patch: {},
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
      windows.push(window);
      return window;
    },
  };
}

function click(window, id) {
  const control = window.controls.get(id);
  assert.ok(control && control.listeners.click, `${id} click listener`);
  return control.listeners.click({type: 'click'});
}

function fixture(count) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-history-page-'));
  const root = path.join(temp, '.runtime', 'recordings');
  fs.mkdirSync(root, {recursive: true});
  for (let index = 0; index < count; index++) createRecording(root, `rec-${String(index).padStart(2, '0')}`, index);
  const ui = makeUI();
  const manager = History.createManager({
    file: makeFile(),
    ui,
    dialog: {alert: async () => {}, prompt: async () => null, confirm: async () => true},
    command: {run: async () => ({exitCode: 0})},
    execution: {workdir: temp},
    system: {getPlatformInfo: () => ({os: 'darwin'})},
    toolbar: makeToolbar(),
    app: {state: () => ({phase: 'ready'})},
    recordingsRoot: root,
    runCountdownStepMs: 0,
  });
  return {temp, root, ui, manager};
}

test('paginateRows clamps 0/1/10/11/25 histories', () => {
  for (const [count, pageCount] of [[0, 1], [1, 1], [10, 1], [11, 2], [25, 3]]) {
    const rows = Array.from({length: count}, (_, index) => ({recordingId: `rec-${index}`}));
    const page = History.paginateRows(rows, 999, 10);
    assert.equal(page.pageCount, pageCount);
    assert.equal(page.pageIndex, pageCount - 1);
    assert.equal(page.rows.length, count === 0 ? 0 : (count % 10 || 10));
  }
  assert.equal(History.pageSize(), 10);
});

test('page navigation reuses one window and slot actions resolve the current page', async () => {
  const f = fixture(25);
  try {
    await f.manager.open();
    const window = f.ui.windows[0];
    assert.equal(f.ui.windows.length, 1);
    assert.deepEqual(f.manager.pageState().recordingIds.slice(0, 2), ['rec-24', 'rec-23']);
    assert.equal(window.controls.get('recordingName0').patch.text, 'rec-24');

    await click(window, 'lastHistory');
    assert.equal(f.manager.pageState().pageNumber, 3);
    assert.equal(window.controls.get('recordingName0').patch.text, 'rec-04');
    assert.equal(window.controls.get('lastHistory').patch.disabled, true);

    await click(window, 'firstHistory');
    assert.equal(f.manager.pageState().pageNumber, 1);
    assert.equal(window.controls.get('recordingName0').patch.text, 'rec-24');
    assert.equal(window.controls.get('firstHistory').patch.disabled, true);

    await click(window, 'nextHistory');
    assert.equal(f.ui.windows.length, 1, 'page turn must not recreate the History window');
    assert.equal(f.manager.pageState().pageNumber, 2);
    assert.equal(window.controls.get('recordingName0').patch.text, 'rec-14');

    await click(window, 'delete0');
    assert.ok(!fs.existsSync(path.join(f.root, 'rec-14')), 'slot 0 must target page 2 row after the page turn');
    assert.equal(f.ui.windows.length, 1);
    assert.equal(f.manager.pageState().pageNumber, 2);
    assert.equal(window.controls.get('recordingName0').patch.text, 'rec-13');
  } finally {
    fs.rmSync(f.temp, {recursive: true, force: true});
  }
});

test('deleting the only row on the final page clamps to the preceding page', async () => {
  const f = fixture(21);
  try {
    await f.manager.open();
    await f.manager.setPage(2);
    assert.equal(f.manager.pageState().pageNumber, 3);
    assert.equal(f.manager.pageState().recordingIds[0], 'rec-00');
    await click(f.ui.windows[0], 'delete0');
    assert.equal(f.manager.pageState().pageCount, 2);
    assert.equal(f.manager.pageState().pageNumber, 2);
    assert.equal(f.ui.windows.length, 1);
  } finally {
    fs.rmSync(f.temp, {recursive: true, force: true});
  }
});

test('HTML and action controls are bounded to ten reusable slots', () => {
  const rows = Array.from({length: 100}, (_, index) => ({
    recordingId: `rec-${index}`,
    startedAt: '2026-09-11T00:00:00Z',
    scriptFile: '/tmp/basic.recipe.js',
  }));
  const html = History.buildWindowHTML(rows);
  assert.match(html, /id="firstHistory"[^>]*title="首页"[^>]*aria-label="首页"/);
  assert.match(html, /id="prevHistory"/);
  assert.match(html, /id="nextHistory"/);
  assert.match(html, /id="lastHistory"[^>]*title="尾页"[^>]*aria-label="尾页"/);
  assert.match(html, /第 1 \/ 10 页 · 共 100 条/);
  assert.match(html, /id="run9"/);
  assert.doesNotMatch(html, /id="run10"/);
});
