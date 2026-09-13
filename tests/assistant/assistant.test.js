import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

await import('../../apps/opendesk/assistant/store.js');
await import('../../apps/opendesk/assistant/model-channel.js');
await import('../../apps/opendesk/assistant/session.js');

const Store = globalThis.OpenDeskAssistantStore;
const ModelChannel = globalThis.OpenDeskAssistantModelChannel;
const Session = globalThis.OpenDeskAssistantSession;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function memoryFile() {
  const files = new Map();
  const dirs = new Set(['/data', '/data/assistant', '/data/assistant/events']);
  let failNextWrite = null;

  function normalize(...parts) {
    const joined = parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
    return joined.startsWith('/') ? joined : '/' + joined;
  }

  return {
    files,
    dirs,
    join: normalize,
    ensureDir(dir) { dirs.add(normalize(dir)); },
    exists(target) { return files.has(normalize(target)) || dirs.has(normalize(target)); },
    listDir(dir) {
      const root = normalize(dir).replace(/\/$/, '') + '/';
      const names = new Set();
      for (const key of files.keys()) {
        if (!key.startsWith(root)) continue;
        const rest = key.slice(root.length);
        if (rest && !rest.includes('/')) names.add(rest);
      }
      return [...names];
    },
    async readJSON(target) {
      const key = normalize(target);
      if (!files.has(key)) {
        const error = new Error('not found');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return clone(files.get(key));
    },
    async writeJSON(target, value) {
      const key = normalize(target);
      if (failNextWrite) {
        const error = failNextWrite;
        failNextWrite = null;
        throw error;
      }
      if (files.has(key)) {
        const error = new Error('immutable target exists');
        error.code = 'ATOMIC_REPLACE_UNSUPPORTED';
        throw error;
      }
      files.set(key, clone(value));
    },
    failWrite(error = Object.assign(new Error('disk full'), {code: 'IO_FAILED'})) { failNextWrite = error; },
  };
}

function deterministicUUID() {
  let value = 0;
  return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
}

function tickingClock() {
  let value = Date.parse('2026-09-14T00:00:00.000Z');
  return () => new Date(value += 1000);
}

function createStore(file) {
  return Store.create({
    file,
    rootDir: '/data/assistant',
    randomUUID: deterministicUUID(),
    clock: tickingClock(),
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {promise, resolve, reject};
}

function createChannelStub(handler) {
  let calls = 0;
  const captured = [];
  return {
    get calls() { return calls; },
    captured,
    statusText: () => '模型：测试适配器（仅测试）',
    helpText: () => 'test only',
    async send(input) {
      calls += 1;
      captured.push(clone({messages: input.messages, requestId: input.requestId}));
      return handler(input, calls);
    },
  };
}

async function createSession(file, channel) {
  const store = createStore(file);
  const session = Session.create({store, channel, AbortController});
  await session.initialize();
  return {store, session};
}

async function waitFor(predicate, iterations = 50) {
  for (let index = 0; index < iterations; index++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('condition was not reached');
}

test('A/B/C conversations keep independent titles, drafts, archive state, and durable history', async () => {
  const file = memoryFile();
  const store = createStore(file);
  await store.load();
  const a = store.snapshot().selectedConversation;
  await store.setDraft(a.id, 'A 草稿');
  const b = await store.createConversation();
  await store.setDraft(b.id, 'B 草稿');
  const c = await store.createConversation();
  await store.setDraft(c.id, 'C 草稿');
  await store.renameConversation(b.id, '手动 B 标题');
  await store.beginRequest({
    conversationId: a.id,
    requestId: store.allocateId('req'),
    userMessageId: store.allocateId('msg'),
    assistantMessageId: store.allocateId('msg'),
    text: '这是 A 的第一条消息，用于确定标题',
  });
  const activeA = store.getConversation(a.id).requests[0];
  await store.transitionRequest({conversationId: a.id, requestId: activeA.id, status: 'completed', text: 'A 回复'});
  await store.archiveConversation(c.id);

  const reloaded = createStore(file);
  await reloaded.load();
  const snapshot = reloaded.snapshot();
  assert.equal(reloaded.getConversation(a.id).draft, '');
  assert.match(reloaded.getConversation(a.id).title, /^这是 A 的第一条消息/);
  assert.equal(reloaded.getConversation(b.id).draft, 'B 草稿');
  assert.equal(reloaded.getConversation(b.id).title, '手动 B 标题');
  assert.equal(reloaded.getConversation(c.id).draft, 'C 草稿');
  assert.equal(reloaded.getConversation(c.id).archived, true);
  assert.equal(reloaded.getConversation(a.id).messages.length, 2);
  assert.ok(snapshot.recent.every(item => item.id !== c.id));
  assert.ok(snapshot.archived.some(item => item.id === c.id));
  await reloaded.restoreConversation(c.id);
  assert.equal(reloaded.snapshot().selectedConversationId, c.id);
});

test('A response remains owned by A after switching to B and model context never includes B', async () => {
  const file = memoryFile();
  const gate = deferred();
  const channel = createChannelStub(() => gate.promise);
  const {session} = await createSession(file, channel);
  const a = session.snapshot().selectedConversation;
  const ids = await session.submit('A 的问题');
  const b = await session.createConversation();
  await session.updateDraft(b.id, 'B 的独立草稿');
  await session.switchConversation(b.id);

  assert.equal(session.snapshot().selectedConversationId, b.id);
  assert.equal(channel.captured.length, 1);
  assert.deepEqual(channel.captured[0].messages, [{role: 'user', content: 'A 的问题'}]);
  gate.resolve({text: '只属于 A 的回复'});
  await waitFor(() => session.getConversation(a.id).messages.some(message => message.id === ids.assistantMessageId && message.status === 'completed'));

  const afterA = session.getConversation(a.id);
  const afterB = session.getConversation(b.id);
  assert.equal(afterA.messages.at(-1).text, '只属于 A 的回复');
  assert.equal(afterB.messages.length, 0);
  assert.equal(afterB.draft, 'B 的独立草稿');
});

test('duplicate submit is rejected, stop aborts the real request, and late reply cannot overwrite stopped state', async () => {
  const file = memoryFile();
  const gate = deferred();
  let observedSignal = null;
  const channel = createChannelStub(input => {
    observedSignal = input.signal;
    return gate.promise;
  });
  const {session} = await createSession(file, channel);
  const conversationId = session.snapshot().selectedConversationId;
  const ids = await session.submit('请回复');
  await assert.rejects(() => session.submit('重复发送'), {code: 'REQUEST_BUSY'});
  assert.equal(channel.calls, 1);
  await session.stop();
  assert.equal(observedSignal.aborted, true);
  assert.equal(session.getConversation(conversationId).requests[0].status, 'stopped');
  gate.resolve({text: '迟到但应丢弃的回复'});
  await waitFor(() => session.snapshot().activeRequest === null);
  const assistant = session.getConversation(conversationId).messages.find(message => message.id === ids.assistantMessageId);
  assert.equal(assistant.status, 'stopped');
  assert.notEqual(assistant.text, '迟到但应丢弃的回复');
});

test('restart marks an unfinished request interrupted without calling the model again', async () => {
  const file = memoryFile();
  const first = createStore(file);
  await first.load();
  const conversationId = first.snapshot().selectedConversationId;
  await first.beginRequest({
    conversationId,
    requestId: first.allocateId('req'),
    userMessageId: first.allocateId('msg'),
    assistantMessageId: first.allocateId('msg'),
    text: '崩溃前的问题',
  });

  const channel = createChannelStub(async () => ({text: '不应调用'}));
  const second = createStore(file);
  const session = Session.create({store: second, channel, AbortController});
  await session.initialize();
  const restored = session.getConversation(conversationId);
  assert.equal(restored.requests[0].status, 'interrupted');
  assert.equal(restored.messages.at(-1).status, 'interrupted');
  assert.match(restored.messages.at(-1).text, /未自动重新发送/);
  assert.equal(channel.calls, 0);
});

test('persistence failure before request creation prevents the model call and is surfaced', async () => {
  const file = memoryFile();
  const channel = createChannelStub(async () => ({text: '不应调用'}));
  const {session} = await createSession(file, channel);
  file.failWrite();
  await assert.rejects(() => session.submit('不能丢失身份'), {code: 'PERSIST_FAILED'});
  assert.equal(channel.calls, 0);
  assert.equal(session.snapshot().persistenceError.code, 'PERSIST_FAILED');
  assert.equal(session.snapshot().selectedConversation.messages.length, 0);
});

test('current conversation history is the only context used for follow-up messages', async () => {
  const file = memoryFile();
  const channel = createChannelStub(async (input) => ({text: `reply-${input.messages.length}`}));
  const {session} = await createSession(file, channel);
  const a = session.snapshot().selectedConversation;
  await session.submit('A1');
  await waitFor(() => session.snapshot().activeRequest === null);
  const b = await session.createConversation();
  await session.submit('B1');
  await waitFor(() => session.snapshot().activeRequest === null);
  await session.switchConversation(a.id);
  await session.submit('A2');
  await waitFor(() => session.snapshot().activeRequest === null);

  assert.deepEqual(channel.captured[2].messages, [
    {role: 'user', content: 'A1'},
    {role: 'assistant', content: 'reply-1'},
    {role: 'user', content: 'A2'},
  ]);
  assert.ok(channel.captured[2].messages.every(message => !message.content.includes('B1')));
  assert.equal(session.getConversation(b.id).messages[0].text, 'B1');
});

test('model channel prefers least-privilege LLM and does not fall through after a real LLM failure', async () => {
  let llmCalls = 0;
  let agentCalls = 0;
  const llm = {
    getCapabilities: () => ({supported: true, configured: true}),
    async generate(options) {
      llmCalls += 1;
      assert.equal(options.system.includes('do not have authority'), true);
      throw Object.assign(new Error('auth failed'), {code: 'HTTP_FAILED'});
    },
  };
  const agent = {
    getCapabilities: () => ({supported: true, configured: true, executableFound: true}),
    async run() { agentCalls += 1; return {data: 'agent reply'}; },
  };
  const channel = ModelChannel.create({llm, agent});
  assert.equal(channel.inspect().selected, 'llm');
  await assert.rejects(() => channel.send({messages: [{role: 'user', content: 'hello'}]}), {code: 'HTTP_FAILED'});
  assert.equal(llmCalls, 1);
  assert.equal(agentCalls, 0);
});

test('model channel uses controlled Agent only when LLM is not configured', async () => {
  let capturedPrompt = '';
  const channel = ModelChannel.create({
    llm: {getCapabilities: () => ({supported: true, configured: false})},
    agent: {
      getCapabilities: () => ({supported: true, configured: true, executableFound: true}),
      async run(options) { capturedPrompt = options.prompt; return {data: 'agent reply', meta: {backend: 'codex'}}; },
    },
  });
  const result = await channel.send({messages: [{role: 'user', content: 'hello'}]});
  assert.equal(result.text, 'agent reply');
  assert.match(capturedPrompt, /do not have authority to execute scripts/i);
  assert.match(capturedPrompt, /User:\nhello/);
});

test('assistant UI source has no Enter-to-send or task/script execution controls', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const controller = readFileSync(path.resolve(here, '../../apps/opendesk/assistant/controller.js'), 'utf8');
  assert.doesNotMatch(controller, /['"](?:keydown|keypress|keyup)['"]/);
  assert.doesNotMatch(controller, /task selector|script selector|execute script/i);
  assert.match(controller, /普通聊天不会运行脚本、命令或桌面动作/);
  assert.match(controller, /MESSAGE_PAGE_SIZE/);
  assert.match(controller, /RECENT_PAGE_SIZE/);
});

test('official App Shell routes exactly one assistant action and keeps Script Runner as default primary flow', async () => {
  await import('../../apps/opendesk/app-controller.js');
  const calls = [];
  const controller = globalThis.OpenDeskProductAppController.create({
    appRuntime: {onAction() {}},
    runner: {async open(source) { calls.push(['runner', source]); }},
    assistant: {async open(source) { calls.push(['assistant', source]); }},
    schedulerCenter: {async open() {}, async openCreate() {}},
  });
  assert.equal(await controller.dispatch({id: 'assistant.open', source: 'tray'}), true);
  assert.deepEqual(calls, [['assistant', 'tray']]);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(readFileSync(path.resolve(here, '../../apps/opendesk/opendesk.app.json'), 'utf8'));
  assert.equal(manifest.tray.primaryAction, 'opendesk.open');
  assert.equal(manifest.tray.menu.filter(item => item.action === 'assistant.open').length, 1);
  assert.ok(manifest.tray.menu.some(item => item.action === 'scheduler.center'));
  assert.ok(manifest.tray.menu.some(item => item.action === 'permissions.open'));
  assert.ok(manifest.tray.menu.some(item => item.action === 'runtime.log'));

  const main = readFileSync(path.resolve(here, '../../apps/opendesk/main.js'), 'utf8');
  assert.match(main, /OpenDeskAssistantController\.create/);
  assert.match(main, /await runner\.launch\(\)/);
  assert.doesNotMatch(main, /await assistant\.open\(/);
});
