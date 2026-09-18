import assert from 'node:assert/strict';
import test from 'node:test';

await import('../../apps/opendesk/assistant/store.js');
await import('../../apps/opendesk/assistant/task-contract.js');
await import('../../apps/opendesk/assistant/model-channel.js');
await import('../../apps/opendesk/assistant/task-runtime.js');
await import('../../apps/opendesk/assistant/session.js');
await import('../../apps/opendesk/assistant/controller.js');

const Controller = globalThis.OpenDeskAssistantController;

const CONTROL_IDS = new Set([
  'newConversation', 'recentCount', 'archivedCount', 'recentMore', 'recentOverflow',
  'archivedMore', 'archivedOverflow', 'archivedEmpty', 'currentTitle', 'conversationState',
  'titleInput', 'renameConversation', 'archiveConversation', 'deleteConversation', 'modelState', 'globalStatus',
  'modelHelp', 'refreshModel', 'toggleHelp', 'messageEmpty', 'messageTranscript', 'messageOverflow', 'composer',
  'taskIntent', 'assetKind', 'importRunnerAsset', 'assetRef', 'assetEntry', 'businessCwd',
  'allowSourceRead', 'allowModelShare', 'taskInput',
  'send', 'stop', 'taskStatus', 'taskPreview', 'confirmTask', 'cancelTask', 'composerHint',
  'candidateSaveRow', 'candidateSavePath', 'saveCandidate',
]);
for (let index = 0; index < 64; index += 1) {
  CONTROL_IDS.add(`recentItem${index}`);
  CONTROL_IDS.add(`recent${index}`);
  CONTROL_IDS.add(`recentDelete${index}`);
  CONTROL_IDS.add(`archivedItem${index}`);
  CONTROL_IDS.add(`archived${index}`);
  CONTROL_IDS.add(`archivedDelete${index}`);
}
for (let index = 0; index < 120; index += 1) CONTROL_IDS.add(`messageRow${index}`);

const CONTROL_PATCH_FIELDS = new Set([
  'text', 'icon', 'active', 'busy', 'error', 'value', 'checked', 'disabled',
  'visible', 'classes', 'source', 'options',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function memoryFile() {
  const files = new Map();
  const dirs = new Set(['/data', '/data/assistant', '/data/assistant/events']);
  function normalize(...parts) {
    const joined = parts.join('/').replace(/\\/g, '/').replace(/\/+/, '/');
    return joined.startsWith('/') ? joined : '/' + joined;
  }
  return {
    join: normalize,
    realPath(target) {
      const key = normalize(target);
      if (!files.has(key) && !dirs.has(key)) throw Object.assign(new Error('not found'), {code: 'ENOENT'});
      return key;
    },
    ensureDir(dir) { dirs.add(normalize(dir)); },
    exists(target) { return files.has(normalize(target)) || dirs.has(normalize(target)); },
    listDir(dir) {
      const root = normalize(dir).replace(/\/$/, '') + '/';
      const names = new Set();
      for (const key of [...files.keys(), ...dirs]) {
        if (!key.startsWith(root)) continue;
        const rest = key.slice(root.length);
        if (rest && !rest.includes('/')) names.add(rest);
      }
      return [...names];
    },
    async readJSON(target) {
      const value = files.get(normalize(target));
      if (typeof value === 'string') return JSON.parse(value);
      return clone(value);
    },
    async writeJSON(target, value) {
      const key = normalize(target);
      if (files.has(key)) throw Object.assign(new Error('immutable write'), {code: 'ATOMIC_REPLACE_UNSUPPORTED'});
      files.set(key, clone(value));
    },
    writeNew(target, value) {
      const key = normalize(target);
      if (files.has(key)) throw Object.assign(new Error('file exists'), {code: 'EEXIST'});
      dirs.add(key.slice(0, key.lastIndexOf('/')) || '/');
      files.set(key, String(value));
    },
    read(target) {
      const key = normalize(target);
      if (!files.has(key)) throw Object.assign(new Error('not found'), {code:'ENOENT'});
      return String(files.get(key));
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return {promise, resolve};
}

function createFakeUI(options = {}) {
  const controls = new Map();
  const invalidPatches = [];
  const closed = deferred();
  let closeListener = null;

  function control(id) {
    if (!CONTROL_IDS.has(id)) throw Object.assign(new Error(`unsupported control: ${id}`), {code: 'NOT_FOUND'});
    if (controls.has(id)) return controls.get(id);
    const state = {id, value: '', text: '', visible: true, disabled: false, classes: []};
    const listeners = new Map();
    const handle = {
      state,
      updates: [],
      async getState() { return {...state}; },
      async update(patch) {
        const unknown = Object.keys(patch).filter(field => !CONTROL_PATCH_FIELDS.has(field));
        if (unknown.length > 0) {
          invalidPatches.push({id, fields: unknown, patch: clone(patch)});
          throw Object.assign(new Error(`unknown control patch fields: ${unknown.join(', ')}`), {code: 'INVALID_SPEC'});
        }
        if (options.failOnceFor === id && !handle.failed) {
          handle.failed = true;
          throw Object.assign(new Error(`driver rejected ${id}`), {code: 'UNSUPPORTED_CAPABILITY'});
        }
        Object.assign(state, clone(patch));
        handle.updates.push(clone(patch));
        return {...state};
      },
      on(event, listener) {
        const entries = listeners.get(event) || [];
        entries.push(listener);
        listeners.set(event, entries);
        return () => listeners.set(event, entries.filter(item => item !== listener));
      },
      async emit(event) {
        for (const listener of listeners.get(event) || []) await listener({type: event, targetId: id});
      },
    };
    controls.set(id, handle);
    return handle;
  }

  const handle = {
    control,
    async show() {},
    async close() {
      if (closeListener) await closeListener({type: 'close'});
      closed.resolve();
    },
    waitUntilClosed() { return closed.promise; },
    on(event, listener) {
      if (event === 'close') closeListener = listener;
      return () => { if (closeListener === listener) closeListener = null; };
    },
  };
  return {
    controls,
    invalidPatches,
    async createWindow(spec) {
      assert.match(spec.content.html, /id="messageRow0"/);
      assert.match(spec.content.html, /id="taskPreview"/);
      assert.match(spec.content.html, /id="confirmTask"/);
      return handle;
    },
  };
}

function envelope() {
  return {
    schemaVersion: 1,
    kind: 'task',
    task: 'calculator.pressAndRead',
    buttons: ['2', '5', '×', '4', '+', '1', '0', '='],
    multiplier: '',
    message: 'ignored by preview',
  };
}

function taskService(executions) {
  return {
    shouldHandle: text => /Calculator/.test(String(text)),
    async plan() { return envelope(); },
    freezeEnvelope(value) { return Object.freeze({...value, buttons: Object.freeze([...value.buttons])}); },
    preview(value) { return `可信预览：${value.buttons.join(' ')}`; },
    async execute(value, context) {
      executions.push({value, context});
      await context.onProgress({phase: 'click', stage: 'single', key: '2'});
      return {task: value.task, result: '110'};
    },
    resultText(result) { return `真实显示区结果：${result.result}`; },
  };
}

async function waitFor(predicate, iterations = 80) {
  for (let index = 0; index < iterations; index += 1) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('condition was not reached');
}

test('actual Controller render updates supported message rows immediately and exposes trusted preview/confirmation controls', async () => {
  const ui = createFakeUI();
  const executions = [];
  const controller = Controller.create({
    ui,
    file: memoryFile(),
    appDataRoot: '/data',
    execution: {id: 'app-test', workdir: '/data', scriptDir: '/bundle/opendesk'},
    taskService: taskService(executions),
    llm: {getCapabilities: () => ({supported: true, configured: true}), async generate() { return {data: '普通回复'}; }},
    agent: {getCapabilities: () => ({supported: false, configured: false})},
  });
  await controller.open('test');
  const composer = ui.controls.get('composer');
  composer.state.value = '打开 Calculator，计算 25 × 4 + 10';
  await ui.controls.get('send').emit('click');

  await waitFor(() => ui.controls.get('confirmTask').state.visible === true);
  assert.match(ui.controls.get('messageRow1').state.text, /打开 Calculator/);
  assert.match(ui.controls.get('messageRow0').state.text, /正在生成回复/);
  assert.match(ui.controls.get('messageTranscript').state.text, /打开 Calculator/);
  assert.match(ui.controls.get('taskStatus').state.text, /确认前不会启动新的业务 Execution/);
  assert.match(ui.controls.get('taskPreview').state.text, /可信预览/);
  assert.equal(executions.length, 0);

  await ui.controls.get('confirmTask').emit('click');
  await waitFor(() => executions.length === 1 && /真实显示区结果：110/.test(ui.controls.get('messageRow0').state.text));
  assert.match(ui.controls.get('messageTranscript').state.text, /真实显示区结果：110/);
  assert.doesNotMatch(ui.controls.get('messageTranscript').state.text, /\[completed\]/);
  assert.equal(Object.isFrozen(executions[0].value), true);
  assert.equal(ui.controls.get('taskPreview').state.visible, false);

  composer.state.value = '普通聊天问题';
  await ui.controls.get('send').emit('click');
  await waitFor(() => /普通回复/.test(ui.controls.get('messageRow0').state.text));
  assert.equal(executions.length, 1, 'ordinary chat must not reach the Calculator executor');
  await controller.close();
});

test('Runner asset handoff snapshots the selected asset once and later Runner changes do not retarget the persisted task', async () => {
  const ui = createFakeUI();
  let runnerAsset = {kind: 'js-file', ref: '/work/first.js', displayName: 'First'};
  const controller = Controller.create({
    ui,
    file: memoryFile(),
    appDataRoot: '/data',
    execution: {id: 'app-test', workdir: '/data', scriptDir: '/bundle/opendesk'},
    taskService: taskService([]),
    runnerAssetProvider: () => runnerAsset,
    llm: {getCapabilities: () => ({supported: true, configured: true}), async generate() { return {data: 'unused'}; }},
    agent: {getCapabilities: () => ({supported: false, configured: false})},
  });
  await controller.open('test');

  await ui.controls.get('importRunnerAsset').emit('click');
  assert.equal(ui.controls.get('taskIntent').state.value, 'use');
  assert.equal(ui.controls.get('assetKind').state.value, 'js-file');
  assert.equal(ui.controls.get('assetRef').state.value, '/work/first.js');

  runnerAsset = {kind: 'js-file', ref: '/work/second.js', displayName: 'Second'};
  ui.controls.get('composer').state.value = '运行刚才带入的自动化';
  await ui.controls.get('send').emit('click');

  await waitFor(() => controller.state().taskWorkspace?.task?.asset?.ref === '/work/first.js');
  assert.equal(controller.state().taskWorkspace.task.asset.ref, '/work/first.js');
  assert.notEqual(controller.state().taskWorkspace.task.asset.ref, runnerAsset.ref);
  await controller.close();
});

test('assistant rendering only sends fields supported by ControlHandle.update', async () => {
  const ui = createFakeUI();
  const controller = Controller.create({
    ui,
    file: memoryFile(),
    appDataRoot: '/data',
    execution: {id: 'app-test', workdir: '/data', scriptDir: '/bundle/opendesk'},
    taskService: taskService([]),
    llm: {getCapabilities: () => ({supported: true, configured: true}), async generate() { return {data: '回复'}; }},
    agent: {getCapabilities: () => ({supported: false, configured: false})},
  });
  await controller.open('test');
  assert.deepEqual(ui.invalidPatches, []);
  assert.equal(ui.controls.get('recentDelete0').state.text, '删除');
  assert.equal(ui.controls.get('deleteConversation').state.text, '删除当前对话');
  await controller.close();
});

test('a real-time Custom UI control update failure is surfaced in the assistant window, not only logged', async () => {
  const ui = createFakeUI({failOnceFor: 'messageRow1'});
  const logs = [];
  const controller = Controller.create({
    ui,
    file: memoryFile(),
    appDataRoot: '/data',
    execution: {id: 'app-test', workdir: '/data', scriptDir: '/bundle/opendesk'},
    taskService: taskService([]),
    logger: {error: value => logs.push(value), log() {}},
    llm: {getCapabilities: () => ({supported: true, configured: true}), async generate() { return {data: '回复'}; }},
    agent: {getCapabilities: () => ({supported: false, configured: false})},
  });
  await controller.open('test');
  ui.controls.get('composer').state.value = '普通聊天问题';
  await ui.controls.get('send').emit('click');
  await waitFor(() => ui.controls.get('globalStatus').updates.some(patch => /界面错误：render:messageRow1/.test(patch.text || '')));
  assert.ok(logs.some(value => /render:messageRow1/.test(value)));
  await controller.close();
});
