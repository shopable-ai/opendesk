'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const productRoot = path.join(root, 'apps', 'opendesk');
const helperFile = path.join(productRoot, 'localization.js');

function catalog(locale) {
  return JSON.parse(fs.readFileSync(path.join(productRoot, 'locales', `${locale}.json`), 'utf8'));
}

test('official product page catalogs stay symmetric and cover the adapter registry', () => {
  const zh = catalog('zh-CN');
  const en = catalog('en-US');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());

  const context = {globalThis: {}, System: {product: {}}};
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(helperFile, 'utf8'), context, {filename: helperFile});
  for (const key of context.OpenDeskProductI18n.keys()) {
    assert.equal(typeof zh[key], 'string', `zh-CN lacks ${key}`);
    assert.equal(typeof en[key], 'string', `en-US lacks ${key}`);
    assert.notEqual(en[key].trim(), '', `en-US has an empty ${key}`);
  }
  for (const prefix of ['assistant.', 'scheduler.', 'permissions.', 'runtimeLog.', 'developer.', 'product.', 'flowRunner.', 'recorder.', 'official.', 'inspector.']) {
    assert.ok(context.OpenDeskProductI18n.keys().some(key => key.startsWith(prefix)), `missing page family ${prefix}`);
  }
});

test('official locale adapter resolves Custom UI, dialogs, and all Recorder control kinds through Locale Core', async () => {
  const en = catalog('en-US');
  const created = [];
  const buttons = [];
  const dialogs = [];
  const switches = [];
  const selects = [];
  const notices = [];
  const context = {
    System: {product: {locale: {
      preference: 'en-US', resolved: 'en-US',
      translate(key, fallback) { return en[key] || fallback; },
    }}},
    ui: {
      async createWindow(spec) {
        created.push(spec);
        return {control() { return {async update(patch) { created.push({patch}); }}; }};
      },
    },
    FloatingWindow: function FloatingWindow() {
      return {
        addButton(id, label) { buttons.push({id, label}); },
        addLabel() {},
        addSwitch(id, label) { switches.push({id, label}); },
        addSelect(id, label, options) { selects.push({id, label, options}); },
        updateControl(_id, patch) { created.push({patch}); },
      };
    },
    automation: {ui: {notify(spec) { notices.push(spec); }}},
    Dialog: {prompt(spec) { dialogs.push(spec); return Promise.resolve(null); }},
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(helperFile, 'utf8'), context, {filename: helperFile});
  assert.equal(context.OpenDeskProductI18n.install(), true);
  await context.ui.createWindow({title: 'AI 助手', content: {html: '<button>发送消息</button>'}});
  const toolbar = new context.FloatingWindow({title: 'OpenDesk — 自动化'});
  toolbar.addButton('run', '运行');
  toolbar.addSwitch('pointerMotion', '兼容物理回放（开：录制坐标；关：语义生成）');
  toolbar.addSelect('scheduleType', '调度类型', {items: [{id: 'once', label: '单次执行'}]});
  await context.Dialog.prompt({title: '重命名录制', confirmText: '保存', cancelText: '取消'});
  context.automation.ui.notify({message: 'Inspector 打开失败，请查看运行日志。'});
  assert.equal(created[0].title, 'AI Assistant');
  assert.match(created[0].content.html, /Send message/);
  assert.deepEqual(buttons, [{id: 'run', label: 'Run'}]);
  assert.deepEqual(switches, [{id: 'pointerMotion', label: 'Compatible physical replay (on: recorded coordinates; off: semantic generation)'}]);
  assert.equal(JSON.stringify(selects), JSON.stringify([{id: 'scheduleType', label: 'Schedule type', options: {items: [{id: 'once', label: 'One time'}]}}]));
  assert.equal(JSON.stringify(dialogs), JSON.stringify([{title: 'Rename recording', confirmText: 'Save', cancelText: 'Cancel'}]));
  assert.equal(JSON.stringify(notices), JSON.stringify([{message: 'Could not open Inspector. See the runtime log.'}]));
});

test('the product composition loads localization before every reachable UI module and stages it for release', () => {
  const main = fs.readFileSync(path.join(productRoot, 'main.js'), 'utf8');
  const helperAt = main.indexOf("'localization.js'");
  for (const module of [
    "'player-controller.js'", 'flow-runner.js', 'assistantEntries', "'scheduler-center.js'", "'runtime-log.js'",
    "'permissions-center.js'", "'inspector-launcher.js'", "'developer-tools.js'", "'app-controller.js'",
  ]) {
    assert.ok(helperAt >= 0 && helperAt < main.indexOf(module), `localization must load before ${module}`);
  }
  const allowlist = fs.readFileSync(path.join(productRoot, '.release', 'app-mode-runtime-files.txt'), 'utf8');
  for (const name of [
    'localization.js', 'locales/zh-CN.json', 'locales/en-US.json',
    'recorder/controller.js', 'recorder/controller-core.js', 'recorder/recording-history.js',
    'flow-runner/player-controller.js',
    'assets/flow-previous.png', 'assets/flow-next.png',
  ]) {
    assert.match(allowlist, new RegExp(`^${name.replace('.', '\\.')}$`, 'm'));
  }
});

test('the L1 page/action matrix retains machine action IDs while registering visible page families', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(productRoot, 'opendesk.app.json'), 'utf8'));
  const actions = new Map(manifest.tray.menu.filter(item => item.action).map(item => [item.id, item.action]));
  assert.deepEqual(Object.fromEntries(actions), {
    'open-ai-assistant': 'assistant.open',
    'open-scheduler-center': 'scheduler.center',
    'new-schedule': 'scheduler.new',
    'open-permissions': 'permissions.open',
    'open-runtime-log': 'runtime.log',
    'restore-promotions': 'promotions.restore',
    'open-examples': 'opendesk.examples',
    'open-api-docs': 'opendesk.api-docs',
  });
  for (const file of [
    'flow-runner.js', 'assistant/controller.js', 'scheduler-center.js', 'permissions-center.js',
    'runtime-log.js', 'developer-tools.js', 'inspector-launcher.js', 'official-shell.js',
    'recorder/controller-core.js', 'recorder/recording-history.js',
  ]) {
    assert.ok(fs.existsSync(path.join(productRoot, file)), `missing reachable product surface ${file}`);
  }
  for (const key of [
    'flowRunner.runSelected', 'assistant.openConversation', 'scheduler.confirmDelete', 'permissions.granted',
    'runtimeLog.readFailed', 'developer.mainUI', 'inspector.openFailed', 'official.helpPending',
    'recorder.deleteTitle', 'recorder.pointerMode',
  ]) {
    assert.equal(typeof catalog('en-US')[key], 'string', `missing matrix key ${key}`);
  }
});

test('locale projection remains product presentation only and never enters Assistant model prompts', () => {
  const bridge = fs.readFileSync(path.join(root, 'automation', 'utils.go'), 'utf8');
  const polyfill = fs.readFileSync(path.join(root, 'polyfills', '000-systemBase.js'), 'utf8');
  const modelChannel = fs.readFileSync(path.join(productRoot, 'assistant', 'model-channel.js'), 'utf8');
  assert.match(bridge, /opts\.AppShell != nil && appshell\.IsOpenDeskProduct/);
  assert.match(polyfill, /official product App Mode/);
  assert.doesNotMatch(modelChannel, /System\.product\.locale|localePreference|resolvedLocale/);
});
