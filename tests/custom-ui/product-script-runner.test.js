'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const repo = process.env.OPENDESK_TEST_REPO || path.resolve(__dirname, '..', '..');
const productEntry = path.join(repo, 'apps', 'opendesk', 'script-runner-simple.js');

function loadProductRunner(harness) {
  const previous = new Map();
  const globals = {
    File: harness.File,
    System: harness.System,
    automation: harness.automation,
    Execution: harness.Execution,
    Command: harness.Command,
    ui: harness.ui,
    FloatingWindow: harness.FloatingWindow,
    AbortController,
    OpenDeskScriptRunnerSimple: harness.RunnerController,
    OpenDeskProductScriptRunner: undefined,
    OpenDeskProductPaths: undefined,
  };

  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, globalThis[name]);
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }

  try {
    vm.runInThisContext(fs.readFileSync(productEntry, 'utf8'), {filename: productEntry});
    return {
      api: globalThis.OpenDeskProductScriptRunner,
      paths: globalThis.OpenDeskProductPaths,
    };
  } finally {
    for (const [name, value] of previous.entries()) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
}

function createHarness() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-product-runner-'));
  const windows = [];
  const notifications = [];
  const floatingWindows = [];
  const activations = [];
  let createAppCount = 0;

  const ui = {
    async createWindow(spec) {
      windows.push(spec);
      return {id: spec.id};
    },
    async notify(message) {
      notifications.push(String(message));
      return {status: 'shown'};
    },
  };

  class FakeFloatingWindow {
    constructor(spec) {
      this.spec = spec;
      this.id = `toolbar-${floatingWindows.length + 1}`;
      this.controls = [];
      this.handlers = new Map();
      this.closed = new Promise(() => {});
      floatingWindows.push(this);
    }
    addButton(id, label, icon, callback) {
      this.controls.push({type: 'button', id, label, icon, callback});
    }
    addLabel(id, text, options) {
      this.controls.push({type: 'label', id, text, options});
    }
    addSeparator(id) {
      this.controls.push({type: 'separator', id});
    }
    updateButton() {}
    updateLabel() {}
    on(event, callback) { this.handlers.set(event, callback); }
    onError(callback) { this.errorHandler = callback; }
    async show() { return {id: this.id, bounds: {x: 1, y: 2, width: 400, height: 40}}; }
    waitUntilClosed() { return this.closed; }
    async hide() {}
    async close() {}
  }

  const RunnerController = {
    createApp(options) {
      createAppCount += 1;
      const toolbar = new options.FloatingWindow({toolbar: {maxWidth: 360}});
      toolbar.addButton('run', '运行', 'play.fill', () => {});
      toolbar.addButton('stop', '停止', 'stop.fill', () => {});
      toolbar.addLabel('script', '暂无脚本', {width: 168});
      toolbar.addButton('list', '脚本列表', 'list.bullet', () => {});
      let listWindow = null;
      return {
        async run() {
          await toolbar.show();
          await toolbar.waitUntilClosed();
        },
        async openList(message) {
          if (!listWindow) {
            listWindow = await options.ui.createWindow({
              id: 'scriptRunnerList1',
              title: 'OpenDesk Script Runner',
            });
          }
          return {message};
        },
        async stopRun() { return true; },
        state() { return {running: true, scriptCount: 1}; },
      };
    },
  };

  const actionMap = new Map([
    ['opendesk.home', {id: 'opendesk.home', label: '打开 OpenDesk 官网', title: 'OpenDesk 官网', visible: true}],
    ['opendesk.customize', {id: 'opendesk.customize', label: '定制', title: '定制自动化', visible: true}],
    ['opendesk.help', {id: 'opendesk.help', label: '帮助', title: '帮助与支持', visible: true}],
    ['opendesk.marketplace', {id: 'opendesk.marketplace', label: '商店', title: '自动化市场', visible: false}],
    ['opendesk.upgrade', {id: 'opendesk.upgrade', label: '专业版', title: '升级专业版', visible: false}],
  ]);
  const officialShell = {
    getAction(id) { return actionMap.get(id) || null; },
    async activate(id) {
      activations.push(id);
      const action = actionMap.get(id);
      if (id === 'opendesk.home') {
        return {status: 'opened', actionId: id, message: '已打开OpenDesk 官网。', action};
      }
      return {
        status: 'pending',
        actionId: id,
        message: id === 'opendesk.help' ? '帮助中心待开放。' : '定制自动化服务待开放。',
        action,
      };
    },
  };

  return {
    temp,
    ui,
    FloatingWindow: FakeFloatingWindow,
    RunnerController,
    officialShell,
    windows,
    notifications,
    floatingWindows,
    activations,
    get createAppCount() { return createAppCount; },
    File: {
      join: path.join,
      path: value => path.resolve(value),
      read() { throw new Error('controller should already be installed in this test'); },
      ensureDir: value => fs.mkdirSync(value, {recursive: true}),
    },
    System: {
      getEnv(name) {
        if (name === 'OPENDESK_APP_DATA_DIR') return temp;
        return '';
      },
      getExecutablePath() { return '/opt/opendesk'; },
    },
    automation: {app: {getCapabilities: () => ({packageId: 'com.opendesk.desktop'})}},
    Execution: {scriptDir: '/bundle/apps/opendesk', workdir: '/bundle/apps/opendesk'},
    Command: {run: async () => ({exitCode: 0})},
  };
}

test('product runner makes the shared Runner list the stable App Mode main window', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});

  const state = await runner.open('test');
  assert.equal(state.mainWindowId, 'main');
  assert.equal(state.toolbarMaxWidth, 520);
  assert.equal(harness.windows.length, 1);
  assert.equal(harness.windows[0].id, 'main');
  assert.equal(harness.createAppCount, 1);

  await runner.open('tray');
  assert.equal(harness.createAppCount, 1, 'reopen must reuse the same shared Runner app');
  assert.equal(harness.floatingWindows.length, 1, 'reopen must not create a second toolbar');
});

test('brand home is the first icon and official actions stay independent from run state', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});
  await runner.open('test');

  const toolbar = harness.floatingWindows[0];
  assert.equal(toolbar.spec.toolbar.maxWidth, 520);
  assert.equal(toolbar.spec.toolbar.maxRows, 1);
  assert.deepEqual(
    toolbar.controls.map(control => control.id),
    [
      'officialHome', 'officialBrandSeparator',
      'run', 'stop', 'script', 'list',
      'officialActionsSeparator', 'officialCustomize', 'officialHelp',
    ],
  );

  const home = toolbar.controls.find(control => control.id === 'officialHome');
  const customize = toolbar.controls.find(control => control.id === 'officialCustomize');
  const help = toolbar.controls.find(control => control.id === 'officialHelp');
  assert.equal(home.label, '打开 OpenDesk 官网');
  assert.deepEqual(home.icon, {
    path: '/bundle/apps/opendesk/assets/opendesk-logo.png',
    renderingMode: 'original',
  });
  assert.equal(customize.icon, 'ai.assistant');
  assert.equal(help.icon, 'questionmark.circle.fill');
  assert.equal(toolbar.controls.some(control => control.id === 'opendesk.marketplace'), false);
  assert.equal(toolbar.controls.some(control => control.id === 'opendesk.upgrade'), false);

  await home.callback();
  await customize.callback();
  await help.callback();
  assert.deepEqual(harness.activations, ['opendesk.home', 'opendesk.customize', 'opendesk.help']);
  assert.deepEqual(harness.notifications, ['定制自动化服务待开放。', '帮助中心待开放。']);
});

test('product toolbar logo is a bounded packaged PNG derived for native icon use', () => {
  const logo = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'assets', 'opendesk-logo.png'));
  assert.ok(logo.length > 0 && logo.length <= 512 * 1024);
  assert.deepEqual(Array.from(logo.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);

  const macHost = fs.readFileSync(path.join(repo, 'pkg', 'customui', 'machost', 'floating_toolbar_darwin.m'), 'utf8');
  const windowsHost = fs.readFileSync(path.join(repo, 'pkg', 'customui', 'winhost', 'ToolbarSurface.cs'), 'utf8');
  assert.match(macHost, /CDToolbarOriginalImageSize\s*=\s*CDToolbarButtonSize/);
  assert.match(windowsHost, /OriginalIconSize\s*=\s*40/);
});

test('generic example remains independent of Official Shell product actions', () => {
  const exampleFile = path.join(repo, 'examples', 'custom-ui', 'script-runner-simple.js');
  const source = fs.readFileSync(exampleFile, 'utf8');
  assert.match(source, /controller\.js/);
  assert.doesNotMatch(source, /OpenDeskOfficialShell|opendesk\.help|opendesk\.customize/);
});

test('App Mode composition has no Demo panel and exposes one canonical Script Runner tray action', () => {
  const mainFile = path.join(repo, 'apps', 'opendesk', 'main.js');
  const manifestFile = path.join(repo, 'apps', 'opendesk', 'opendesk.app.json');
  const mainSource = fs.readFileSync(mainFile, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

  assert.doesNotMatch(mainSource, /ui\.createWindow\s*\(/, 'main.js must not create a Demo window');
  assert.doesNotMatch(mainSource, /打开 Script Runner|自动化运行中心已就绪|OpenDesk 服务/);
  assert.match(mainSource, /runner\.open\('startup'\)/);
  assert.match(mainSource, /automation\.app\.onAction/);
  assert.equal(manifest.window.mainId, 'main');
  assert.equal(manifest.window.closeBehavior, 'hide');
  assert.equal(manifest.tray.primaryAction, 'opendesk.open');
  assert.deepEqual(manifest.tray.menu.filter(item => item.action === 'runner.open'), [
    {id: 'runner.open', label: '打开 Script Runner', action: 'runner.open'},
  ]);
});
