'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceFile = path.resolve(__dirname, '..', '..', 'apps', 'opendesk', 'scheduler-center.js');
vm.runInThisContext(fs.readFileSync(sourceFile, 'utf8'), {filename: sourceFile});
const SchedulerCenter = globalThis.OpenDeskSchedulerCenter;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return {promise, resolve, reject};
}

function createHarness(options = {}) {
  const windows = [];
  const logs = [];
  const errors = [];
  const createdInputs = [];
  const createGate = options.createGate || null;
  let createWindowCalls = 0;
  let statusCalls = 0;
  let listCalls = 0;

  const ui = {
    async createWindow(spec) {
      createWindowCalls++;
      if (createGate) await createGate.promise;
      const controls = new Map();
      const listeners = new Map();
      const closed = deferred();
      const initialValues = {
        createName: '', createSource: 'file', createScript: '', createInlineScript: '',
        createType: 'every', createExpression: '1h',
        createTimezone: 'Local', createMisfire: 'run_once',
      };
      const window = {
        id: spec.id,
        spec,
        controls,
        showCount: 0,
        closed: false,
        control(id) {
          if (!controls.has(id)) {
            const state = {value: Object.prototype.hasOwnProperty.call(initialValues, id) ? initialValues[id] : ''};
            const handlers = new Map();
            controls.set(id, {
              id,
              state,
              handlers,
              updates: [],
              on(type, callback) {
                handlers.set(type, callback);
                return () => handlers.delete(type);
              },
              async update(patch) { this.updates.push({...patch}); Object.assign(state, patch); return {id, ...state}; },
              async getState() { return {id, ...state}; },
            });
          }
          return controls.get(id);
        },
        on(type, callback) {
          listeners.set(type, callback);
          return () => listeners.delete(type);
        },
        async show() {
          if (this.closed) throw Object.assign(new Error('window is closed'), {code: 'INVALID_STATE'});
          this.showCount++;
          return {status: 'visible', visible: true};
        },
        async close() {
          if (this.closed) return {status: 'closed'};
          this.closed = true;
          const callback = listeners.get('close');
          if (callback) callback({type: 'close', reason: 'user'});
          closed.resolve({status: 'closed'});
          return {status: 'closed'};
        },
        waitUntilClosed() { return closed.promise; },
      };
      windows.push(window);
      return window;
    },
  };

  const scheduler = {
    async status() {
      statusCalls++;
      if (options.statusError) throw options.statusError;
      return {available: true, runnerState: options.runnerState || 'active', scriptRoot: '/tmp/recipes'};
    },
    async listJobs() {
      listCalls++;
      return options.jobs || [];
    },
    async createJob(input) { createdInputs.push({...input}); return {id: 'created', ...input}; },
    async pause(id) { return {id, enabled: false}; },
    async resume(id) { return {id, enabled: true}; },
    async runNow(id) { return {id: 'run', jobId: id, status: 'queued'}; },
    async delete(id) { return {id, deleted: true}; },
    async listRuns() { return options.runs || []; },
  };

  const center = SchedulerCenter.create({
    scheduler,
    ui,
    logger: {
      log(message) { logs.push(String(message)); },
      error(message) { errors.push(String(message)); },
    },
  });
  return {
    center,
    windows,
    logs,
    errors,
    createdInputs,
    get createWindowCalls() { return createWindowCalls; },
    get statusCalls() { return statusCalls; },
    get listCalls() { return listCalls; },
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('open reuses and refocuses the same normal Scheduler Center window', async () => {
  const f = createHarness();
  await f.center.open('first');
  await f.center.open('second');
  assert.equal(f.createWindowCalls, 1);
  assert.equal(f.windows[0].spec.kind, 'normal');
  assert.equal(f.windows[0].showCount, 2);
  assert.equal(f.center.state().windowGeneration, 1);
  assert.equal(f.center.state().lifecycleActive, true);
  assert.match(f.logs.join('\n'), /action=scheduler\.open stage=window-visible/);
  assert.match(f.logs.join('\n'), /action=scheduler\.open stage=ready/);
});

test('uses the native title bar and keeps concise runtime context in the content', async () => {
  const f = createHarness();
  await f.center.open('title-and-runtime-context');
  const window = f.windows[0];

  assert.equal(window.spec.title, 'OpenDesk · 计划中心');
  assert.doesNotMatch(window.spec.content.html, /<strong>计划中心<\/strong>/);
  assert.match(window.spec.content.html, /id="runtimeState" class="runtime-context" role="status" aria-live="polite"/);
  assert.equal(window.control('runtimeState').state.text, '本机负责执行计划 · 脚本目录：/tmp/recipes');
  assert.doesNotMatch(window.control('runtimeState').state.text, /Active|当前 OpenDesk/);
});

test('close clears the stale handle and the next open creates generation two', async () => {
  const f = createHarness();
  await f.center.open('first');
  const first = f.windows[0];
  await first.close();
  await settle();
  assert.equal(f.center.state().open, false);
  assert.equal(f.center.state().lifecycleActive, false);

  await f.center.open('after-close');
  assert.equal(f.createWindowCalls, 2);
  assert.equal(f.windows[1].spec.id, 'schedulerCenter2');
  assert.equal(f.windows[1].showCount, 1);
});

test('concurrent open calls share one createWindow and one opening flow', async () => {
  const gate = deferred();
  const f = createHarness({createGate: gate});
  const first = f.center.open('first');
  const second = f.center.open('second');
  await settle();
  assert.equal(f.createWindowCalls, 1);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(f.createWindowCalls, 1);
  assert.equal(f.windows[0].showCount, 1);
  assert.equal(f.statusCalls, 1);
  assert.equal(f.listCalls, 1);
});

test('backend failure still creates and shows a retryable error window', async () => {
  const f = createHarness({statusError: new Error('bridge unavailable')});
  const state = await f.center.open('backend-failure');
  assert.equal(f.createWindowCalls, 1);
  assert.equal(f.windows[0].showCount, 1);
  assert.equal(state.open, true);
  assert.equal(state.lastError, 'bridge unavailable');
  assert.match(f.windows[0].control('status').state.text, /计划服务暂不可用：bridge unavailable/);
  assert.equal(f.windows[0].control('refresh').state.text, '重试连接并刷新计划列表');
  assert.match(f.errors.join('\n'), /action=scheduler\.open stage=refresh/);
  assert.match(f.errors.join('\n'), /message="bridge unavailable"/);
});

test('scheduler.new reuses the same window and enters create mode', async () => {
  const f = createHarness();
  await f.center.open('list');
  await f.center.openCreate('tray-menu');
  assert.equal(f.createWindowCalls, 1);
  assert.equal(f.windows[0].showCount, 2);
  assert.equal(f.center.state().mode, 'create');
  assert.equal(f.windows[0].control('createCard').state.visible, true);
  assert.deepEqual(f.windows[0].control('createCard').state.classes, ['create-card', 'is-create-mode']);
  assert.equal(f.windows[0].control('openCreate').state.visible, false);
  assert.equal(f.windows[0].control('closeCreate').state.visible, true);
  assert.match(f.windows[0].control('status').state.text, /填写“新建计划”/);
});

test('list mode starts collapsed and the create entry expands and preserves a canceled draft', async () => {
  const f = createHarness();
  await f.center.open('collapsed-default');
  const window = f.windows[0];

  assert.equal(f.center.state().mode, 'list');
  assert.equal(window.control('createCard').state.visible, false);
  assert.deepEqual(window.control('createCard').state.classes, ['create-card', 'is-hidden']);
  assert.equal(window.control('openCreate').state.visible, true);
  assert.equal(window.control('openCreate').state.icon, 'plus');
  assert.equal(window.control('openCreate').state.text, '创建计划，展开表单');
  assert.equal(window.control('closeCreate').state.visible, false);
  assert.equal(window.control('createName').state.disabled, true);

  window.control('openCreate').handlers.get('click')();
  await settle();
  assert.equal(f.center.state().mode, 'create');
  assert.equal(window.control('createCard').state.visible, true);
  assert.equal(window.control('openCreate').state.visible, false);
  assert.equal(window.control('closeCreate').state.visible, true);
  assert.equal(window.control('closeCreate').state.icon, 'xmark');
  assert.equal(window.control('createName').state.disabled, false);
  assert.match(window.control('status').state.text, /创建表单已展开/);

  window.control('createName').state.value = '保留的草稿';
  window.control('closeCreate').handlers.get('click')();
  await settle();
  assert.equal(f.center.state().mode, 'list');
  assert.equal(window.control('createCard').state.visible, false);
  assert.equal(window.control('openCreate').state.visible, true);
  assert.equal(window.control('createName').state.value, '保留的草稿');
  assert.match(window.control('status').state.text, /已填写内容仍会保留/);
});

test('standby state disables Run Now instead of reporting false success', async () => {
  const f = createHarness({
    runnerState: 'standby',
    jobs: [{
      id: 'job-1', name: 'Fixture', enabled: true, scheduleType: 'every',
      scheduleExpression: '1h', timezone: 'Local', nextRunAt: null, lastRun: null,
    }],
  });
  await f.center.open('standby');
  assert.equal(f.windows[0].control('run0').state.disabled, true);
  assert.match(f.windows[0].control('runtimeState').state.text, /由其他 OpenDesk Runtime 执行计划/);
  assert.equal(f.windows[0].control('enabled0').state.text, '已启用');
});

test('Scheduler Center presents actions with icons and accessible labels', async () => {
  const f = createHarness({
    jobs: [{
      id: 'job-1', name: 'Fixture', enabled: true, scheduleType: 'every',
      scheduleExpression: '1h', timezone: 'Local', nextRunAt: null, lastRun: null,
    }, {
      id: 'job-2', name: 'Paused fixture', enabled: false, scheduleType: 'every',
      scheduleExpression: '2h', timezone: 'Local', nextRunAt: null, lastRun: null,
    }],
  });
  await f.center.open('icons');
  const window = f.windows[0];

  for (const [id, icon, label] of [
    ['openCreate', 'plus', '创建计划，展开表单'],
    ['refresh', 'arrow.clockwise', '刷新计划列表'],
    ['closeCreate', 'xmark', '取消创建并收起表单'],
    ['fillFileExample', 'doc.fill', '填入通知文件示例'],
    ['fillInlineExample', 'doc.text.fill', '填入 ui.toast 文本示例'],
    ['createJob', 'plus', '创建计划'],
    ['run0', 'play.fill', '立即运行'],
    ['toggle0', 'pause.fill', '暂停计划'],
    ['history0', 'list.bullet', '查看运行历史'],
    ['delete0', 'trash.fill', '删除计划'],
  ]) {
    assert.equal(window.control(id).state.icon, icon, `${id} icon`);
    assert.equal(window.control(id).state.text, label, `${id} accessible label`);
  }

  for (const [id, label] of [
    ['openCreate', '创建计划，展开表单'],
    ['refresh', '刷新计划列表'],
    ['closeCreate', '取消创建并收起表单'],
    ['fillFileExample', '填入通知文件示例'],
    ['fillInlineExample', '填入 ui.toast 文本示例'],
    ['run0', '立即运行'],
    ['toggle0', '暂停计划'],
    ['history0', '查看运行历史'],
    ['delete0', '删除计划'],
  ]) {
    assert.match(window.spec.content.html, new RegExp(`id="${id}"[^>]*title="${label}"[^>]*aria-label="${label}"`));
  }
  assert.match(window.spec.content.css, /width:32px;height:32px/);
  assert.match(window.spec.content.css, /button:focus-visible,.scheduler-field:focus-visible/);
  assert.match(window.spec.content.css, /data-icon="play\.fill"/);
  assert.match(window.spec.content.css, /data-icon="power"/);
  assert.match(window.spec.content.css, /data-icon="doc\.text\.fill"/);
  assert.equal(window.control('toggle1').state.icon, 'power');
  assert.equal(window.control('toggle1').state.text, '恢复计划');
  assert.notEqual(window.control('toggle1').state.icon, window.control('run1').state.icon);

  window.control('delete0').handlers.get('click')();
  await settle();
  assert.equal(window.control('delete0').state.icon, 'checkmark');
  assert.equal(window.control('delete0').state.text, '确认删除');
});

test('create plan form groups required content and scheduling fields around a clear primary action', async () => {
  const f = createHarness();
  await f.center.open('create-layout');
  const {html, css} = f.windows[0].spec.content;

  assert.match(html, /class="create-heading"/);
  assert.match(html, /id="createCard" class="create-card is-hidden" hidden/);
  assert.match(html, /<strong>创建计划<\/strong>/);
  assert.match(html, /class="create-layout"/);
  assert.match(html, /class="group-index">1<\/span><div><strong>执行内容<\/strong>/);
  assert.match(html, /class="group-index">2<\/span><div><strong>执行规则<\/strong>/);
  assert.match(html, /id="createName"[^>]*aria-required="true"/);
  assert.match(html, /id="createScript"[^>]*aria-required="true"/);
  assert.match(html, /id="createType"[^>]*aria-required="true"/);
  assert.match(html, /id="createExpression"[^>]*aria-required="true"/);
  assert.match(html, /id="createJob" class="create-button primary"/);
  const supportedElements = new Set(['html', 'head', 'body', 'meta', 'title', 'style', 'div', 'section', 'main', 'header', 'footer', 'button', 'span', 'p', 'label', 'strong', 'em', 'img', 'input', 'textarea', 'select', 'option']);
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)) {
    assert.equal(supportedElements.has(match[1].toLowerCase()), true, `unsupported Custom UI element <${match[1]}>`);
  }
  assert.match(css, /\.create-layout\{display:grid;grid-template-columns:minmax\(330px,\.82fr\) minmax\(480px,1\.18fr\)/);
  assert.match(css, /\.schedule-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(css, /\.create-button\{min-width:118px;height:36px;/);
  assert.match(css, /@media\(max-width:960px\)[^\n]*\.next,.last,#headNext,#headLast\{display:none!important\}/);
  assert.match(css, /@media\(max-width:920px\)\{\.create-layout\{grid-template-columns:1fr\}\}/);
  assert.match(css, /@media\(max-width:780px\)\{main\{height:auto;min-height:100vh;overflow:auto;padding:14px\}/);
});

test('schedule selectors use accessible dark-theme fields and update expression guidance', async () => {
  const f = createHarness();
  await f.center.openCreate('select-theme');
  const window = f.windows[0];
  const html = window.spec.content.html;
  const css = window.spec.content.css;

  assert.match(html, /<label for="createType">/);
  assert.match(html, /id="createType" class="scheduler-field scheduler-select" aria-describedby="createTypeHint"/);
  assert.match(html, /id="createMisfire" class="scheduler-field scheduler-select" aria-describedby="createMisfireHint"/);
  assert.match(html, /class="select-chevron" aria-hidden="true"/);
  assert.match(html, /id="scheduleHint" class="schedule-hint" role="status" aria-live="polite"/);
  assert.match(html, /<option value="every">间隔执行<\/option><option value="cron">Cron 表达式<\/option><option value="at">单次执行<\/option>/);
  assert.match(html, /<option value="run_once">补跑一次<\/option><option value="skip">跳过错过执行<\/option>/);

  assert.match(css, /:root\{color-scheme:dark;/);
  assert.match(css, /\.scheduler-field\{[^}]*height:36px;[^}]*background:var\(--ui-field\)/);
  assert.match(css, /\.scheduler-field:hover:not\(:disabled\)\{[^}]*border-color:var\(--ui-line-strong\)/);
  assert.match(css, /\.scheduler-field:focus-visible\{outline:2px solid var\(--ui-accent\);outline-offset:2px\}/);
  assert.match(css, /\.scheduler-field:disabled\{cursor:not-allowed;opacity:\.54;/);
  assert.match(css, /\.scheduler-select\{appearance:none;-webkit-appearance:none;cursor:pointer;padding:0 38px 0 11px\}/);
  assert.match(css, /\.scheduler-select option\{background:var\(--ui-surface-raised\);color:var\(--ui-text\)\}/);
  assert.match(css, /\.scheduler-select:disabled\+\.select-chevron\{opacity:\.38\}/);

  for (const id of ['createType', 'createMisfire']) {
    const control = window.control(id);
    assert.deepEqual(control.state.classes, ['scheduler-field', 'scheduler-select']);
    assert.equal(control.state.disabled, false);
    assert.deepEqual(control.updates.map(update => update.disabled), [true, false]);
  }

  const type = window.control('createType');
  type.state.value = 'cron';
  type.handlers.get('change')();
  await settle();
  assert.equal(window.control('scheduleHint').state.text, 'Cron 示例：0 9 * * *（每天 09:00）');
  type.state.value = 'at';
  type.handlers.get('change')();
  await settle();
  assert.equal(window.control('scheduleHint').state.text, '单次示例：2026-09-12T18:30:00+08:00');
});

test('Scheduler Center creates inline script jobs from a multiline editor and built-in toast example', async () => {
  const f = createHarness();
  await f.center.openCreate('inline-job');
  const window = f.windows[0];

  assert.match(window.spec.content.html, /id="createSource"/);
  assert.match(window.spec.content.html, /<option value="file">脚本文件<\/option><option value="inline">脚本文本<\/option>/);
  assert.match(window.spec.content.html, /<textarea id="createInlineScript"[^>]*maxlength="262144"/);
  assert.deepEqual(window.control('fileSourceGroup').state.classes, ['source-group']);
  assert.deepEqual(window.control('inlineSourceGroup').state.classes, ['source-group', 'is-hidden']);

  window.control('fillInlineExample').handlers.get('click')();
  await settle();
  assert.equal(window.control('createSource').state.value, 'inline');
  assert.deepEqual(window.control('fileSourceGroup').state.classes, ['source-group', 'is-hidden']);
  assert.deepEqual(window.control('inlineSourceGroup').state.classes, ['source-group']);
  assert.equal(window.control('createInlineScript').state.disabled, false);
  assert.equal(window.control('createScript').state.disabled, true);

  const script = window.control('createInlineScript').state.value;
  assert.match(script, /await ui\.toast\(/);
  assert.match(script, /\[SCHEDULER_NOTIFY\] stage=complete/);
  assert.equal(window.control('createName').state.value, 'UI 脚本文本通知计划');

  window.control('createName').state.value = 'Inline notify fixture';
  window.control('createExpression').state.value = '10m';
  window.control('createJob').handlers.get('click')();
  await settle();
  await settle();

  assert.equal(f.createdInputs.length, 1);
  assert.equal(f.createdInputs[0].sourceType, 'inline');
  assert.equal(f.createdInputs[0].inlineScript, script);
  assert.equal(Object.prototype.hasOwnProperty.call(f.createdInputs[0], 'scriptPath'), false);
  assert.equal(f.createdInputs[0].taskType, 'script');
  assert.equal(window.control('createName').state.value, '');
  assert.match(window.control('status').state.text, /已创建脚本文本计划：Inline notify fixture/);
});

test('Scheduler Center can fill and create the repository notify file example', async () => {
  const f = createHarness();
  await f.center.openCreate('file-job');
  const window = f.windows[0];

  window.control('fillFileExample').handlers.get('click')();
  await settle();

  assert.equal(window.control('createSource').state.value, 'file');
  assert.equal(window.control('createScript').state.value, 'notify-and-log.js');
  assert.equal(window.control('createName').state.value, 'UI 文件通知计划');
  assert.deepEqual(window.control('fileSourceGroup').state.classes, ['source-group']);
  assert.deepEqual(window.control('inlineSourceGroup').state.classes, ['source-group', 'is-hidden']);

  window.control('createJob').handlers.get('click')();
  await settle();
  await settle();

  assert.equal(f.createdInputs.length, 1);
  assert.equal(f.createdInputs[0].sourceType, 'file');
  assert.equal(f.createdInputs[0].scriptPath, 'notify-and-log.js');
  assert.equal(Object.prototype.hasOwnProperty.call(f.createdInputs[0], 'inlineScript'), false);
  assert.match(window.control('status').state.text, /已创建脚本文件计划：UI 文件通知计划/);
});

test('history opens with only Custom UI v1 supported elements', async () => {
  const job = {
    id: 'job-1', name: 'Fixture', enabled: true, scheduleType: 'every',
    scheduleExpression: '1h', timezone: 'Local', nextRunAt: null, lastRun: null,
  };
  const f = createHarness({
    jobs: [job],
    runs: [{status: 'succeeded', scheduledAt: '2026-09-12T10:00:00Z', finishedAt: '2026-09-12T10:00:01Z'}],
  });
  await f.center.open('history');
  const historyClick = f.windows[0].control('history0').handlers.get('click');
  assert.equal(typeof historyClick, 'function');
  historyClick();
  await settle();

  assert.equal(f.createWindowCalls, 2);
  const history = f.windows[1];
  assert.equal(history.showCount, 1);
  assert.match(history.spec.content.html, /class="history-row"/);
  assert.match(history.spec.content.html, /id="close"[^>]*title="关闭"[^>]*aria-label="关闭"/);
  assert.equal(history.control('close').state.icon, 'xmark');
  assert.equal(history.control('close').state.text, '关闭');
  assert.doesNotMatch(history.spec.content.html, /<(?:h[1-6]|table|thead|tbody|tr|th|td)\b/i);
});
