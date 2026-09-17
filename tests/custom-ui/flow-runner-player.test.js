'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const playerFile = path.join(repo, 'apps', 'opendesk', 'flow-runner', 'player-controller.js');
vm.runInThisContext(fs.readFileSync(playerFile, 'utf8'), {filename: playerFile});
const Player = globalThis.OpenDeskFlowRunnerPlayerController;

function deferred() {
  let resolve;
  const promise = new Promise(value => { resolve = value; });
  return {promise, resolve};
}

function FakeUI(options = {}) {
  const windows = [];
  const creation = options.creation || null;
  return {
    windows,
    async createWindow(spec) {
      if (creation) await creation.promise;
      const controls = new Map();
      const listeners = new Map();
      const window = {
        spec, shown: false, hidden: false, closed: false, position: null, relative: null,
        control(id) {
          if (!controls.has(id)) {
            const handlers = {};
            const state = {};
            controls.set(id, {
              handlers, state,
              on(type, callback) { handlers[type] = callback; },
              async update(patch) { Object.assign(state, patch); return {id, ...state}; },
              async getState() { return {id, ...state}; },
            });
          }
          return controls.get(id);
        },
        on(type, callback) { listeners.set(type, callback); },
        async show() { this.shown = true; this.hidden = false; return {bounds: {x: 0, y: 0, width: 320, height: 300}}; },
        async hide() { this.hidden = true; this.shown = false; return {status: 'hidden'}; },
        async close() {
          if (this.closed) return;
          this.closed = true;
          const callback = listeners.get('close');
          if (callback) callback({type: 'close'});
        },
        async getState() { return {bounds: {x: 0, y: 0, width: 320, height: 300}}; },
        async setPosition(x, y) { this.position = {x, y}; return {bounds: {x, y, width: 320, height: 300}}; },
        async setRelativeTo(anchor, options) { this.relative = {anchor, options}; return {bounds: {x: 720, y: 380, width: 320, height: 300}}; },
        emit(type, event = {}) { const callback = listeners.get(type); return callback && callback({type, ...event}); },
      };
      windows.push(window);
      return window;
    },
  };
}

function ToolbarCapture() {
  let current;
  class Toolbar {
    constructor(spec) {
      current = this;
      this.spec = spec;
      this.id = 'flow-runner-test-toolbar';
      this.buttons = new Map();
      this.labels = new Map();
      this.handlers = new Map();
      this.closedPromise = new Promise(resolve => { this.resolveClosed = resolve; });
    }
    addButton(id, label, icon, callback) { this.buttons.set(id, {id, label, icon, callback, disabled: false}); }
    addLabel(id, text, options) { this.labels.set(id, {id, text, ...(options || {})}); }
    addSeparator() {}
    async updateButton(id, patch) { Object.assign(this.buttons.get(id), patch); }
    async updateLabel(id, patch) { Object.assign(this.labels.get(id), patch); }
    on(type, callback) { this.handlers.set(type, callback); }
    onError() {}
    async show() { return {bounds: {x: 700, y: 700, width: 400, height: 40}}; }
    waitUntilClosed() { return this.closedPromise; }
    async close() { const callback = this.handlers.get('close'); if (callback) callback({type: 'close'}); this.resolveClosed(); }
    async getButtonState() { return {screenBounds: {x: 1000, y: 700, width: 40, height: 40}}; }
    async getState() { return {bounds: {x: 700, y: 700, width: 400, height: 40}}; }
    move(bounds) { const callback = this.handlers.get('move'); if (callback) callback({type: 'move', bounds}); }
  }
  return {Toolbar, current: () => current};
}

function BaseController(names, holder) {
  return {createApp(options) {
    let entries = names.map(name => ({name, path: `/recipes/${name}`, kind: 'javascript'}));
    let selected = entries[0] && entries[0].name || null;
    let activeRun = null;
    let running = false;
    let loadError = null;
    let listOpened = 0;
    holder.selectCalls = [];
    holder.runRequests = 0;
    const headless = new options.FloatingWindow({});
    headless.addButton('run', '运行', 'play.fill', () => {});
    headless.addButton('stop', '停止', 'stop.fill', () => {});
    headless.addLabel('entry', '', {});
    headless.addButton('list', '列表', 'list.bullet', () => {});
    const base = {
      async run() { await headless.show(); await headless.waitUntilClosed(); },
      async prepareList() { return {prepared: true}; },
      async openList() { listOpened++; return {opened: true}; },
      async selectEntry(name) {
        if (running || !entries.some(entry => entry.name === name)) return false;
        holder.selectCalls.push(name);
        selected = name;
        await headless.updateLabel('entry', {text: name});
        return true;
      },
      async stopRun() { running = false; activeRun = null; await headless.updateButton('run', {}); return true; },
      requestRun(queue) {
        if (running) return Promise.resolve({status: 'busy'});
        holder.runRequests++;
        running = true;
        activeRun = {current: queue[0] && queue[0].name || null, total: queue.length, index: 0};
        void headless.updateLabel('entry', {text: activeRun.current});
        if (holder.runDeferred) return holder.runDeferred.promise.then(async () => {
          running = false; activeRun = null; await headless.updateLabel('entry', {text: selected}); return {status: 'succeeded', completed: queue.length, total: queue.length};
        });
        return Promise.resolve().then(async () => {
          running = false; activeRun = null; await headless.updateLabel('entry', {text: selected}); return {status: 'succeeded', completed: queue.length, total: queue.length};
        });
      },
      async rescan() {
        if (holder.rescan) return holder.rescan(base);
        return !loadError;
      },
      async restoreDefaultOrder() { return !running; },
      entries() { return entries.map(entry => ({...entry})); },
      state() { return {selectedEntryKey: selected, loadError, configValid: true, running, activeRun, listOpened}; },
      setEntries(next) { entries = next.map(name => ({name, path: `/recipes/${name}`, kind: 'javascript'})); },
      setLoadError(error) { loadError = error; },
    };
    holder.base = base;
    return base;
  }};
}

function harness(names = ['a.js', 'b.js', 'c.js'], options = {}) {
  const holder = options.holder || {};
  const ui = FakeUI(options);
  const capture = ToolbarCapture();
  const app = Player.createApp({
    BaseController: BaseController(names, holder), playerUI: ui, ui, FloatingWindow: capture.Toolbar,
    file: {}, command: {async run() { return {exitCode: 0}; }}, execution: {workdir: '/tmp'},
    system: {getPlatformInfo: () => ({os: 'darwin'})}, runnableRoot: '/recipes', AbortController,
    Screen: {getDisplays: () => [{x: -1200, y: 0, width: 1200, height: 900}, {x: 0, y: 0, width: 1440, height: 900}]},
  });
  return {app, ui, toolbar: capture.current(), holder};
}

async function tick() { await new Promise(resolve => setImmediate(resolve)); }
async function start(f) {
  const completion = f.app.run();
  await tick();
  // Returning a promise from an async helper would await the runner's close
  // lifecycle here. Keep that lifecycle explicit so tests can interact first.
  return {completion};
}
async function finish(f, run) { await f.toolbar.close(); await run.completion; }

test('display name strips only trailing js extension', () => {
  assert.equal(Player.displayEntryName('daily-report.js'), 'daily-report');
  assert.equal(Player.displayEntryName('report.v2.js'), 'report.v2');
  assert.equal(Player.displayEntryName('report.jsx'), 'report.jsx');
  assert.equal(Player.displayEntryName('foo.js.backup'), 'foo.js.backup');
});

test('refresh replacement follows old-order next then previous rule', () => {
  assert.equal(Player.reconcileCurrentAfterRefresh(['a.js', 'b.js', 'c.js'], ['a.js', 'c.js'], 'b.js'), 'c.js');
  assert.equal(Player.reconcileCurrentAfterRefresh(['a.js', 'b.js'], ['a.js'], 'b.js'), 'a.js');
  assert.equal(Player.reconcileCurrentAfterRefresh(['a.js'], [], 'a.js'), null);
});

test('six-control player uses file-name-only labels with bounded previous and next', async () => {
  const f = harness(['daily-report.js', 'report.v2.js', '中文名称.js']);
  const run = await start(f);
  assert.deepEqual([...f.toolbar.buttons.keys()], ['run', 'stop', 'previous', 'next', 'list']);
  assert.equal(f.toolbar.labels.get('entry').text, 'daily-report');
  assert.equal(await f.app.previous(), false);
  assert.equal(await f.app.next(), true);
  assert.equal(f.app.state().selectedEntryKey, 'report.v2.js');
  assert.equal(f.toolbar.labels.get('entry').text, 'report.v2');
  assert.equal(f.toolbar.buttons.get('previous').disabled, false);
  await f.app.next();
  assert.equal(f.toolbar.buttons.get('next').disabled, true);
  await finish(f, run);
});

test('panel click confirms, hides without running or destroying, and reuses the handle', async () => {
  const f = harness(['a.js', 'b.js']);
  const run = await start(f);
  const panel = await f.app.openPanel();
  const row = panel.control('panelEntry1');
  assert.equal(typeof row.handlers.click, 'function');
  await row.handlers.click({type: 'click'});
  assert.equal(f.app.state().selectedEntryKey, 'b.js');
  assert.equal(f.app.state().player.panelHighlightKey, 'b.js');
  assert.equal(f.app.state().running, false);
  assert.equal(f.app.state().activeRun, null);
  assert.deepEqual(f.holder.selectCalls, ['b.js']);
  assert.equal(f.holder.runRequests, 0);
  assert.equal(f.app.state().player.panelLifecycle, 'hidden');
  assert.equal(panel.closed, false);
  assert.equal(panel.hidden, true);
  const reopened = await f.app.openPanel();
  assert.equal(reopened, panel);
  assert.equal(f.ui.windows.length, 1);
  assert.equal(f.app.state().player.panelHighlightKey, 'b.js');
  assert.equal(panel.control('panelEntry1').state.classes.includes('current'), true);
  await panel.control('panelEntry1').handlers.click({type: 'click'});
  assert.deepEqual(f.holder.selectCalls, ['b.js', 'b.js'], 'clicking the current row still confirms and hides');
  assert.equal(f.holder.runRequests, 0);
  assert.equal(panel.hidden, true);
  assert.equal(panel.closed, false);
  await finish(f, run);
});

test('Enter confirms like click, ignores a synthetic click, and never runs', async () => {
  const f = harness();
  const run = await start(f);
  const panel = await f.app.openPanel();
  await panel.emit('key', {fields: {key: 'ArrowDown'}});
  assert.equal(f.app.state().selectedEntryKey, 'a.js');
  assert.equal(f.app.state().player.panelHighlightKey, 'b.js');
  const enter = panel.emit('key', {fields: {key: 'Enter'}});
  const syntheticClick = panel.control('panelEntry0').handlers.click({type: 'click'});
  await Promise.all([enter, syntheticClick]);
  assert.equal(f.app.state().selectedEntryKey, 'b.js');
  assert.deepEqual(f.holder.selectCalls, ['b.js']);
  assert.equal(f.holder.runRequests, 0);
  assert.equal(f.app.state().player.panelLifecycle, 'hidden');
  assert.equal(panel.hidden, true);
  assert.equal(panel.closed, false);
  await finish(f, run);
});

test('Escape discards keyboard highlight without submitting or destroying', async () => {
  const f = harness();
  const run = await start(f);
  const panel = await f.app.openPanel();
  await panel.emit('key', {fields: {key: 'ArrowDown'}});
  assert.equal(f.app.state().player.panelHighlightKey, 'b.js');
  await panel.emit('key', {fields: {key: 'Escape'}});
  assert.equal(f.app.state().selectedEntryKey, 'a.js');
  assert.deepEqual(f.holder.selectCalls, []);
  assert.equal(f.holder.runRequests, 0);
  assert.equal(panel.hidden, true);
  assert.equal(panel.closed, false);
  assert.equal(f.app.state().player.panelLifecycle, 'hidden');
  assert.equal(f.app.state().player.panelHighlightKey, 'a.js');
  assert.equal(await f.app.openPanel(), panel);
  assert.equal(f.app.state().player.panelHighlightKey, 'a.js');
  await finish(f, run);
});

test('running keeps the panel browseable while every current mutation is locked', async () => {
  const holder = {runDeferred: deferred()};
  const f = harness(['a.js', 'b.js'], {holder});
  const run = await start(f);
  const pending = f.toolbar.buttons.get('run').callback();
  await tick();
  const panel = await f.app.openPanel();
  assert.equal(f.toolbar.buttons.get('run').disabled, true);
  assert.equal(f.toolbar.buttons.get('stop').disabled, false);
  assert.equal(f.toolbar.buttons.get('previous').disabled, true);
  assert.equal(f.toolbar.buttons.get('next').disabled, true);
  assert.equal(f.toolbar.buttons.get('list').disabled, false);
  assert.equal(panel.control('panelEntry1').state.disabled, true);
  assert.equal(await panel.control('panelEntry1').handlers.click({type: 'click'}), false);
  assert.equal(await panel.emit('key', {fields: {key: 'Enter'}}), false);
  assert.equal(await f.app.selectEntry('b.js'), false);
  await panel.emit('key', {fields: {key: 'ArrowDown'}});
  assert.equal(f.app.state().selectedEntryKey, 'a.js');
  assert.equal(f.app.state().player.panelHighlightKey, 'a.js');
  assert.deepEqual(f.holder.selectCalls, []);
  assert.equal(f.holder.runRequests, 1);
  await panel.emit('key', {fields: {key: 'Escape'}});
  assert.equal(panel.hidden, true);
  await f.app.openPanel();
  await panel.control('panelManage').handlers.click({type: 'click'});
  assert.equal(panel.hidden, true);
  assert.equal(f.holder.base.state().listOpened, 1);
  holder.runDeferred.resolve();
  assert.equal((await pending).status, 'succeeded');
  await finish(f, run);
});

test('relative placement uses actual List button logical bounds and follows runner move', async () => {
  const f = harness();
  const run = await start(f);
  const panel = await f.app.openPanel();
  assert.equal(panel.spec.keyEvents, true);
  assert.equal(panel.spec.interactionGroup, 'flowRunnerPlayer');
  assert.equal(f.toolbar.spec.interactionGroup, 'flowRunnerPlayer');
  assert.equal(panel.spec.position.size.height, 154, 'outer frame reserves native chrome above three compact rows');
  assert.deepEqual(panel.relative.anchor, {x: 1000, y: 700, width: 40, height: 40});
  assert.deepEqual(panel.relative.options.preferredSides, ['above', 'below', 'left', 'right']);
  f.toolbar.move({x: -500, y: 820, width: 400, height: 40});
  await tick();
  assert.deepEqual(panel.relative.anchor, {x: 1000, y: 700, width: 40, height: 40}, 'move re-reads the List button rather than using toolbar-frame offsets');
  assert.deepEqual(Player.fallbackPanelPosition({x: -1100, y: 860, width: 40, height: 40}, {x: 0, y: 0, width: 320, height: 260}, [{x: -1200, y: 0, width: 1200, height: 900}]), {x: -1200, y: 592});
  await finish(f, run);
});

test('interaction-outside hides without selection and reuses the handle', async () => {
  const f = harness();
  const run = await start(f);
  const panel = await f.app.openPanel();
  assert.equal(f.app.state().player.panelLifecycle, 'visible');
  await panel.emit('interactionOutside');
  assert.equal(panel.hidden, true);
  assert.equal(panel.closed, false);
  assert.deepEqual(f.holder.selectCalls, []);
  await f.app.openPanel();
  assert.equal(f.app.state().player.panelLifecycle, 'visible');
  await finish(f, run);
});

test('rapid intent, close during create, and destroyed handles keep one panel lifecycle', async () => {
  const creating = deferred();
  const f = harness(['a.js'], {creation: creating});
  const run = await start(f);
  const opening = f.app.openPanel();
  const closing = f.app.closePanel();
  creating.resolve();
  await Promise.all([opening, closing]);
  assert.equal(f.ui.windows.length, 1);
  assert.notEqual(f.app.state().player.panelLifecycle, 'visible');
  const first = f.ui.windows[0];
  await f.app.openPanel();
  assert.equal(f.ui.windows.length, 1, 'hide/reopen reuses a live native handle');
  await first.close();
  assert.equal(f.app.state().player.panelLifecycle, 'destroyed');
  await f.app.openPanel();
  assert.equal(f.ui.windows.length, 2, 'a destroyed native handle creates exactly one replacement');
  await finish(f, run);
});

test('panel markup preserves full identity in title only and never shows .js as the row name', () => {
  const html = Player.buildPanelHTML([
    {name: 'daily-report.js', path: '/recipes/daily-report.js'},
    {name: '中文超长自动化脚本名称.js', path: '/recipes/中文超长自动化脚本名称.js'},
    {name: 'report.v2.js', path: '/recipes/report.v2.js'},
  ], {currentKey: 'daily-report.js', highlightKey: 'daily-report.js', running: false});
  assert.match(html, /class="entry-row current highlight"/);
  assert.match(html, /class="marker" aria-hidden="true"><\/span><span class="entry-name">daily-report<\/span>/);
  assert.match(html, /entry-name">中文超长自动化脚本名称<\/span>/);
  assert.match(html, /entry-name">report\.v2<\/span>/);
  assert.doesNotMatch(html, /entry-name">(?:daily-report|report\.v2)\.js<\/span>/);
});

test('panel keeps only the script list and one icon-only manage action', () => {
  const html = Player.buildPanelHTML([{name: 'daily-report.js', path: '/recipes/daily-report.js'}], {
    currentKey: 'daily-report.js', highlightKey: 'daily-report.js', running: false,
  });
  assert.match(html, /<button id="panelManage" class="manage-button" title="管理流程" aria-label="管理流程">⚙<\/button>/);
  assert.doesNotMatch(html, /<header>|panelMode|panelStatus|panelRefresh|panelOpenDirectory|<footer>/);
  assert.doesNotMatch(html, /单击只高亮|Enter 提交高亮|选择流程/);
  assert.doesNotMatch(html, /data-opendesk-dialog-(?:default|cancel)/);
  const content = Player.buildPanelContent([{name: 'daily-report.js'}], {
    currentKey: 'daily-report.js', highlightKey: 'daily-report.js', running: false,
  });
  assert.match(content.html, /id="panelManage"/);
  assert.match(content.css, /\.manage-button\{/);
  assert.match(content.css, /\.entry-row\.current \.marker::before\{content:'✓'\}/);
});

test('the compact manage icon hides the panel and opens the full manager', async () => {
  const f = harness();
  const run = await start(f);
  const panel = await f.app.openPanel();
  await panel.control('panelManage').handlers.click({type: 'click'});
  assert.equal(panel.hidden, true);
  assert.equal(f.holder.base.state().listOpened, 1);
  await finish(f, run);
});

test('official OpenDesk main decorates the base controller before product runner capture', () => {
  const mainSource = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'main.js'), 'utf8');
  assert.match(mainSource, /flow-runner['"]\s*,\s*['"]controller\.js/);
  assert.match(mainSource, /flow-runner['"]\s*,\s*['"]player-controller\.js/);
  assert.match(mainSource, /OpenDeskFlowRunnerPlayerController\.wrapController/);
  assert.match(mainSource, /playerUI:\s*OpenDeskPromotionsIntegration\.createPlayerUI\(ui/);
});
