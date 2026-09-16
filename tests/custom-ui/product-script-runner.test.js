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
    console: harness.console,
    OpenDeskScriptRunnerSimple: harness.RunnerController,
    OpenDeskProductScriptRunner: undefined,
    OpenDeskProductPaths: undefined,
    __opendeskRecipeExecution: harness.recipeExecution,
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

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

function createHarness(options = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-product-runner-'));
  const runError = options.runError || null;
  const windows = [];
  const notifications = [];
  const floatingWindows = [];
  const activations = [];
  const errors = [];
  const toastUpdates = [];
  const recipeRuns = [];
  let createAppCount = 0;
  let runnerOptions = null;

  const ui = {
    async createWindow(spec) {
      const window = {
        id: spec.id,
        spec,
        showCount: 0,
        hideCount: 0,
        async show() { this.showCount += 1; },
        async hide() { this.hideCount += 1; },
      };
      windows.push(window);
      if (options.createWindowGate) await options.createWindowGate;
      return window;
    },
    async notify(message) {
      notifications.push(String(message));
      return {status: 'shown'};
    },
    async toast(message) {
      notifications.push(String(message && typeof message === 'object' ? message.message : message));
      return {
        status: 'shown',
        async update(patch) { toastUpdates.push(patch); return {applied: true}; },
      };
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
      runnerOptions = options;
      const toolbar = new options.FloatingWindow({toolbar: {maxWidth: 360}});
      toolbar.addButton('run', '运行', 'play.fill', () => {});
      toolbar.addButton('stop', '停止', 'stop.fill', () => {});
      toolbar.addLabel('script', '暂无脚本', {width: 168});
      toolbar.addButton('list', '脚本列表', 'list.bullet', () => {});
      let listWindow = null;
      let listCreating = null;
      async function prepareList() {
        if (listWindow) return listWindow;
        if (listCreating) return listCreating;
        const task = options.ui.createWindow({
          id: 'scriptRunnerList1',
          kind: 'normal',
          title: 'OpenDesk Script Runner',
        });
        listCreating = task;
        try {
          listWindow = await task;
          return listWindow;
        } finally {
          if (listCreating === task) listCreating = null;
        }
      }
      return {
        async run() {
          await toolbar.show();
          if (runError) throw runError;
          await toolbar.waitUntilClosed();
        },
        prepareList,
        async openList(message) {
          const window = await prepareList();
          await window.show();
          return {message, window};
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
    errors,
    toastUpdates,
    recipeRuns,
    console: {
      log() {},
      warn() {},
      error(message) { errors.push(String(message)); },
    },
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
    automation: {app: {
      getCapabilities: () => ({packageId: 'com.opendesk.desktop'}),
      getPermissions: () => options.permissionReport || ({overall: 'READY', permissions: []}),
    }},
    recipeExecution: {
      async run(request) {
        recipeRuns.push(request);
        if (options.recipeRunError) throw options.recipeRunError;
        return {executionId: 'app-recipe-1', status: 'succeeded', logDir: request.logDir};
      },
    },
    Execution: {scriptDir: '/bundle/apps/opendesk', workdir: '/bundle/apps/opendesk'},
    Command: {run: async () => ({exitCode: 0})},
    get runnerOptions() { return runnerOptions; },
  };
}

test('product Open action keeps the toolbar visible without opening the prepared list window', async () => {
  const createWindowGate = deferred();
  const harness = createHarness({createWindowGate: createWindowGate.promise});
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});

  let launchSettled = false;
  const launch = runner.launch().then(state => {
    launchSettled = true;
    return state;
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(harness.windows.length, 1, 'startup must create window.mainId before entry completion');
  assert.equal(harness.windows[0].id, 'main');
  assert.equal(harness.windows[0].spec.kind, 'normal');
  assert.equal(harness.windows[0].spec.title, 'OpenDesk — Script Runner');
  assert.equal(harness.windows[0].showCount, 0, 'startup must not show list content');
  assert.equal(launchSettled, false, 'launch must await main window registration');

  createWindowGate.resolve();
  const state = await launch;
  assert.equal(state.mainWindowId, 'main');
  assert.equal(state.toolbarMaxWidth, 520);
  assert.equal(state.windowTitle, 'OpenDesk — Script Runner');
  assert.equal(harness.createAppCount, 1);
  assert.equal(harness.floatingWindows[0].spec.title, 'OpenDesk — Script Runner');

  await runner.open('test');
  assert.equal(harness.windows.length, 1);
  assert.equal(harness.windows[0].showCount, 0, 'OpenDesk menu action must not open list content');
  assert.equal(harness.createAppCount, 1);

  await runner.open('tray');
  assert.equal(harness.windows.length, 1, 'reopen must reuse the registered main window');
  assert.equal(harness.windows[0].showCount, 0, 'repeated OpenDesk menu actions must remain toolbar-only');
  assert.equal(harness.createAppCount, 1, 'reopen must reuse the same shared Runner app');
  assert.equal(harness.floatingWindows.length, 1, 'reopen must not create a second toolbar');

  await runner.openList('toolbar-list');
  assert.equal(harness.windows[0].showCount, 1, 'the dedicated list action must still open the list window');
});

test('product Script Runner injects one title into the main window and FloatingWindow', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({
    officialShell: harness.officialShell,
    title: 'Legacy Script Runner',
    windowTitle: '  Localized Script Runner  ',
  });

  await runner.launch();

  assert.equal(runner.state().windowTitle, 'Localized Script Runner');
  assert.equal(harness.windows[0].spec.title, 'Localized Script Runner');
  assert.equal(harness.floatingWindows[0].spec.title, 'Localized Script Runner');
});

test('product composition keeps the Compact Selector distinct from the main Script Manager window', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});

  await runner.launch();

  assert.equal(harness.windows[0].id, 'main');
  assert.equal(harness.windows[0].spec.title, 'OpenDesk — Script Runner');

  const selector = await harness.runnerOptions.ui.createWindow({
    id: 'scriptRunnerSelector1',
    kind: 'normal',
    title: '选择脚本',
    content: {html: '<main>selector</main>'},
  });

  assert.equal(selector.id, 'scriptRunnerSelector1');
  assert.equal(selector.spec.title, '选择脚本');
  assert.equal(selector.spec.content.html, '<main>selector</main>');
});

test('product Script Runner retains title as a compatibility input', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell, title: '  Existing title option  '});

  await runner.launch();

  assert.equal(runner.state().windowTitle, 'Existing title option');
  assert.equal(harness.windows[0].spec.title, 'Existing title option');
  assert.equal(harness.floatingWindows[0].spec.title, 'Existing title option');
});

test('product Recipe runs in the App-owned execution bridge with one visible lifecycle toast', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});
  await runner.launch();

  const result = await harness.runnerOptions.command.run('/opt/opendesk', [
    '-script', '/recipes/计算器.js',
    '-console-mode', 'script',
    '-log-dir', '/artifacts/calculator',
  ], {cwd: '/app-data', signal: new AbortController().signal, hideWindow: true});

  assert.equal(result.exitCode, 0);
  assert.equal(harness.recipeRuns.length, 1);
  assert.equal(harness.recipeRuns[0].scriptPath, '/recipes/计算器.js');
  assert.equal(harness.recipeRuns[0].workdir, '/app-data');
  assert.equal(harness.recipeRuns[0].logDir, '/artifacts/calculator');
  assert.equal(harness.notifications.length, 1, 'one toast must be reused for the full run');
  assert.match(harness.notifications[0], /正在运行.*计算器/);
  assert.equal(harness.toastUpdates.length, 1);
  assert.match(harness.toastUpdates[0].message, /运行完成/);
  assert.equal(harness.toastUpdates[0].level, 'success');
  assert.equal(runner.state().latestExecution.status, 'succeeded');
  assert.equal(runner.state().latestExecution.executionId, 'app-recipe-1');
});

test('product Recipe permission failure updates the same toast with remediation', async () => {
  const denied = Object.assign(new Error('PERMISSION_DENIED: macOS Accessibility permission is not granted'), {
    code: 'EXECUTION_FAILED',
    executionId: 'app-recipe-denied',
  });
  const harness = createHarness({
    recipeRunError: denied,
    permissionReport: {
      overall: 'BLOCKED',
      permissions: [{id: 'accessibility', status: 'denied', displayName: 'Accessibility'}],
    },
  });
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});
  await runner.launch();

  await assert.rejects(() => harness.runnerOptions.command.run('/opt/opendesk', [
    '-script', '/recipes/计算器.js', '-log-dir', '/artifacts/calculator',
  ], {cwd: '/app-data'}), /PERMISSION_DENIED/);

  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.toastUpdates.length, 1);
  assert.match(harness.toastUpdates[0].message, /缺少“辅助功能”权限/);
  assert.match(harness.toastUpdates[0].caption, /系统权限/);
  assert.equal(harness.toastUpdates[0].level, 'error');
  assert.equal(runner.state().latestExecution.status, 'failed');
});

test('product Recipe permission failure accepts native PascalCase permission reports', async () => {
  const denied = Object.assign(new Error('GoError: PERMISSION_DENIED: macOS Accessibility permission is not granted'), {
    code: 'EXECUTION_FAILED',
  });
  const harness = createHarness({
    recipeRunError: denied,
    permissionReport: {
      Overall: 'BLOCKED',
      Permissions: [{ID: 'accessibility', Status: 'denied', DisplayName: 'Accessibility'}],
    },
  });
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});
  await runner.launch();

  await assert.rejects(() => harness.runnerOptions.command.run('/opt/opendesk', [
    '-script', '/recipes/计算器.js', '-log-dir', '/artifacts/calculator',
  ], {cwd: '/app-data'}), /PERMISSION_DENIED/);
  assert.match(harness.toastUpdates[0].message, /缺少“辅助功能”权限/);
});

test('App Shell UI cancellation is a clean Product Runner shutdown', async () => {
  const error = Object.assign(new Error('waiting for floating window close: context canceled'), {
    code: 'UI_CANCELED',
  });
  const harness = createHarness({runError: error});
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});

  await runner.launch();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(runner.state().lastError, null);
  assert.deepEqual(harness.errors, []);
});

test('launch preserves an unexpected Runner lifecycle error', async () => {
  const harness = createHarness({runError: new Error('toolbar failed')});
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});

  await runner.launch();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(runner.state().lastError, 'toolbar failed');
  assert.equal(harness.errors.length, 1);
  assert.match(harness.errors[0], /toolbar failed/);
});

test('brand home is the first icon and official actions stay independent from run state', async () => {
  const harness = createHarness();
  const loaded = loadProductRunner(harness);
  const runner = loaded.api.create({officialShell: harness.officialShell});
  await runner.launch();

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
  assert.equal(help.icon, 'questionmark.circle');
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

test('App Mode composition has no Demo panel and leaves OpenDesk opening to the App Shell', () => {
  const mainFile = path.join(repo, 'apps', 'opendesk', 'main.js');
  const manifestFile = path.join(repo, 'apps', 'opendesk', 'opendesk.app.json');
  const mainSource = fs.readFileSync(mainFile, 'utf8');
  const appControllerSource = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'app-controller.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

  assert.doesNotMatch(mainSource, /ui\.createWindow\s*\(/, 'main.js must not create a Demo window');
  assert.doesNotMatch(mainSource, /打开 Script Runner|自动化运行中心已就绪|OpenDesk 服务/);
  assert.match(mainSource, /runner\.launch\(\)/);
  assert.match(mainSource, /OpenDeskProductAppController\.create\(/);
  assert.match(appControllerSource, /appRuntime\.onAction/);
  assert.match(fs.readFileSync(productEntry, 'utf8'), /hideListOnClose:\s*true/);
  assert.equal(manifest.window.mainId, 'main');
  assert.equal(manifest.window.closeBehavior, 'hide');
  assert.equal(manifest.tray.primaryAction, 'opendesk.open');
  assert.deepEqual(manifest.tray.menu.filter(item => item.action === 'runner.open'), []);
  const productMenuSource = fs.readFileSync(path.join(repo, 'pkg', 'appshell', 'product_menu.go'), 'utf8');
  assert.match(productMenuSource, /ActionOpen, Label: translatedProductLabel\("menu\.open", "显示主窗口"\)/);
  assert.match(productMenuSource, /translatedProductLabel\("menu\.developer", "开发者"\)/);
  assert.match(productMenuSource, /translatedProductLabel\("menu\.helpAndSupport", "帮助与服务"\)/);
});
