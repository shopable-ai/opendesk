import assert from 'node:assert/strict';
import test from 'node:test';

await import('../../apps/opendesk/assistant/store.js');
await import('../../apps/opendesk/assistant/model-channel.js');
await import('../../apps/opendesk/assistant/session.js');
await import('../../apps/opendesk/assistant/controller.js');

const Controller = globalThis.OpenDeskAssistantController;

const CONTROL_IDS = new Set([
  'newConversation', 'recentCount', 'archivedCount', 'recentMore', 'recentOverflow',
  'archivedMore', 'archivedOverflow', 'archivedEmpty', 'currentTitle', 'conversationState',
  'titleInput', 'renameConversation', 'archiveConversation', 'modelState', 'globalStatus',
  'modelHelp', 'refreshModel', 'toggleHelp', 'messageEmpty', 'messageTranscript', 'messageOverflow', 'composer',
  'send', 'stop', 'taskStatus', 'taskPreview', 'confirmTask', 'cancelTask', 'composerHint',
]);
for (let index = 0; index < 64; index += 1) {
  CONTROL_IDS.add(`recent${index}`);
  CONTROL_IDS.add(`archived${index}`);
}
for (let index = 0; index < 120; index += 1) CONTROL_IDS.add(`messageRow${index}`);

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
    ensureDir(dir) { dirs.add(normalize(dir)); },
    exists(target) { return files.has(normalize(target)) || dirs.has(normalize(target)); },
    listDir(dir) {
      const root = normalize(dir).replace(/\/$/, '') + '/';
      return [...files.keys()].filter(key => key.startsWith(root)).map(key => key.slice(root.length)).filter(name => !name.includes('/'));
    },
    async readJSON(target) { return clone(files.get(normalize(target))); },
    async writeJSON(target, value) {
      const key = normalize(target);
      if (files.has(key)) throw Object.assign(new Error('immutable write'), {code: 'ATOMIC_REPLACE_UNSUPPORTED'});
      files.set(key, clone(value));
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
  assert.match(ui.controls.get('taskStatus').state.text, /确认前不会产生/);
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

test('a real-time Custom UI control update failure is surfaced in the assistant window, not only logged', async () => {
  const ui = createFakeUI({failOnceFor: 'messageRow1'});
  const logs = [];
  const controller = Controller.create({
    ui,
    file: memoryFile(),
    appDataRoot: '/data',
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
