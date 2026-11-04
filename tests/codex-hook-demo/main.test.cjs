'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'examples/workflows/codex-hook-demo/main.js'), 'utf8');
const ID = '12345678123412341234123456781234';
const SOURCE = 'codex-hook-demo';
const FILES = {
  state: './.runtime/tests/codex-hook-demo/state.json',
  endpoint: './.runtime/tests/codex-hook-demo/endpoint.json',
  profile: './.runtime/tests/codex-hook-demo/profile.json',
};
const profile = { confirmed: true, app: { bundleId: 'com.openai.codex' },
  composer: { role: 'textField', identifier: 'verified-input' },
  newThreadIndicator: { role: 'staticText', name: 'verified-empty-new-thread-title' },
  submit: { role: 'button', name: 'verified-send' } };

async function start(opts = {}) {
  const files = new Map();
  files.set(FILES.profile, structuredClone(opts.profile || profile));
  const timers = [];
  const calls = { newThread: 0, setValue: 0, click: 0, close: 0, chmod: [], listeners: 0 };
  let submitted = '';
  let newThreadCreated = false;
  let listener;
  const foreground = opts.foreground !== false;
  const activeWin = { id: 'w', pid: 12, title: 'Codex', isForeground: true };
  const scope = {
    locator(target) {
      if (target.role === 'staticText') return {
        find: async () => (opts.markerAlreadyPresent || newThreadCreated && !opts.markerMissing) ? { source: 'accessibility' } : null,
        waitFor: async () => { if (!(opts.markerAlreadyPresent || newThreadCreated && !opts.markerMissing)) throw Error('wait timeout'); },
      };
      if (target.role === 'textField') return {
        getValue: async () => opts.oldDraft || submitted,
        setValue: async text => { calls.setValue++; submitted = text; return { verified: true }; },
      };
      return { find: async () => (opts.missingSubmit ? null : { source: 'accessibility' }),
        tap: async () => { calls.click++; if (opts.onTap) await opts.onTap(); if (opts.clickThrows) throw Error('unknown'); } };
    },
  };
  const ctx = {
    File: {
      exists: key => files.has(key), ensureDir: () => {},
      readJSON: async (key, options) => files.has(key) ? structuredClone(files.get(key)) : options.defaultValue,
      writeJSON: async (key, value) => { files.set(key, structuredClone(value)); },
    },
    Command: { run: async (p, args) => {
      if (p === '/usr/bin/uuidgen') return { stdout: '12345678-1234-1234-1234-123456781234\n' };
      if (p === '/bin/chmod') { calls.chmod.push(args); return { stdout: '' }; }
      throw Error('unexpected command');
    } },
    App: { isRunning: () => opts.running !== false },
    window: {
      get: async () => activeWin,
      getActiveWindow: async () => foreground ? activeWin : { id: 'foreign', pid: 999 },
      current: async () => activeWin,
    },
    UI: { within: () => scope },
    keyboard: { combination: async (a,b) => { assert.equal(a,'Meta'); assert.equal(b,'N'); calls.newThread++; if(!opts.shortcutNoEffect)newThreadCreated=true; } },
    Webhook: { listen: (name, fn) => { calls.listeners++; listener = { fn, close: () => { calls.close++; },
      url: 'http://127.0.0.1:12345/v1/webhook/abc', requestHeaders: () => ({ Authorization: 'Bearer secret', 'Content-Type':'application/json' }) }; return listener; } },
    setTimeout: fn => { timers.push(fn); },
    Date, console: { log: () => {} },
  };
  await vm.runInNewContext(`(async () => {\n${SCRIPT}\n})()`, ctx, { timeout: 2000 });
  return {
    calls, files, state: () => files.get(FILES.state), timers,
    post: async (event, source = SOURCE) => (await listener.fn({ body: event, source })).body,
    drain: async () => { for(const fn of timers.splice(0)) fn(); for(let i=0;i<20;i++) await new Promise(resolve => setImmediate(resolve)); },
  };
}
function event(role, kind, more = {}) {
  return { protocol: 'od.codex-hook-demo.v1', runId: ID, role, kind,
    sessionId: role.toLowerCase()+'-session', turnId: role.toLowerCase()+'-turn',
    ...(kind === 'stop' ? { completed: true, stopHookActive: false } : {}), ...more };
}

 test('A -> B desktop submit -> B stop; no C or duplicate submission', async () => {
  const h = await start();
  assert.equal((await h.post(event('A', 'prompt'))).code, 'A_BOUND');
  assert.equal((await h.post(event('A', 'stop'))).code, 'B_QUEUED');
  assert.equal((await h.post(event('A', 'stop'))).code, 'DUPLICATE_A_STOP');
  assert.equal(h.timers.length, 1);
  await h.drain();
  assert.equal(h.state().phase, 'B_SUBMIT_UNKNOWN');
  assert.deepEqual([h.calls.newThread,h.calls.setValue,h.calls.click],[1,1,1]);
  assert.equal((await h.post(event('B', 'prompt'))).code, 'B_BOUND');
  assert.equal((await h.post(event('B', 'stop'))).code, 'RUN_DONE');
  assert.equal(h.state().phase, 'DONE');
  assert.equal(h.state().events.filter(x=>x.code==='B_STOP_ACCEPTED').length,1);
  assert.equal(h.calls.close,1);
  assert.equal((await h.post(event('A', 'stop'))).code, 'DUPLICATE_A_STOP');
  assert.deepEqual([h.calls.newThread,h.calls.click,h.timers.length],[1,1,0]);
 });

 test('unbound, unrelated, altered identity, premature or continued stops fail closed', async () => {
  const h=await start();
  assert.equal((await h.post(event('B','stop'))).code,'B_IDENTITY_OR_ORDER_MISMATCH');
  assert.equal((await h.post(event('A','prompt',{runId:'f'.repeat(32)}))).code,'OUT_OF_SCOPE');
  assert.equal((await h.post(event('A','prompt'),'another-source')).code,'OUT_OF_SCOPE');
  await h.post(event('A','prompt'));
  assert.equal((await h.post(event('A','stop',{turnId:'other'}))).code,'A_IDENTITY_OR_ORDER_MISMATCH');
  assert.equal((await h.post(event('A','stop',{stopHookActive:true}))).code,'NOT_FINAL_STOP');
  assert.equal((await h.post(event('A','stop',{completed:false}))).code,'NOT_FINAL_STOP');
  assert.equal(h.state().phase,'WAIT_A_STOP');
  assert.equal(h.timers.length,0);
 });

 test('target not foreground -> blocked before any desktop action', async () => {
  const h=await start({foreground:false});
  await h.post(event('A','prompt')); await h.post(event('A','stop')); await h.drain();
  assert.equal(h.state().phase,'BLOCKED');
  assert.equal(h.state().failure.actionPossible,false);
  assert.equal(h.state().failure.detail,'CODEX_NOT_FOREGROUND');
  assert.equal(h.calls.newThread,0); assert.equal(h.calls.click,0);
 });

 test('existing draft -> block before opening new thread or overwriting input', async () => {
  const h=await start({oldDraft:'personal draft'});
  await h.post(event('A','prompt')); await h.post(event('A','stop')); await h.drain();
  assert.equal(h.state().phase,'BLOCKED');
  assert.equal(h.state().failure.detail,'PREVIOUS_COMPOSER_NOT_EMPTY');
  assert.equal(h.calls.setValue,0); assert.equal(h.calls.click,0);
  assert.equal((await h.post(event('A','stop'))).code,'DUPLICATE_A_STOP');
  assert.equal(h.calls.newThread,0);
 });

 test('submit control missing -> no click; unknown status keeps no retry', async () => {
  const h=await start({missingSubmit:true});
  await h.post(event('A','prompt')); await h.post(event('A','stop')); await h.drain();
  assert.equal(h.calls.click,0); assert.equal(h.state().phase,'PAUSED_UNKNOWN');
 });

 test('profile not confirmed -> safely block before desktop action', async () => {
  const h=await start({profile:{...profile,confirmed:false}});
  await h.post(event('A','prompt')); await h.post(event('A','stop')); await h.drain();
  assert.equal(h.calls.newThread,0); assert.equal(h.state().phase,'BLOCKED');
 });


test('missing Codex target blocks before opening a new thread', async () => {
  const h = await start({ running: false });
  await h.post(event('A', 'prompt')); await h.post(event('A', 'stop')); await h.drain();
  assert.equal(h.state().phase, 'BLOCKED');
  assert.deepEqual([h.calls.newThread, h.calls.setValue, h.calls.click], [0, 0, 0]);
});

test('Cmd+N without new-thread UI proof pauses; never sends prompt', async () => {
  const h = await start({ shortcutNoEffect: true });
  await h.post(event('A', 'prompt')); await h.post(event('A', 'stop')); await h.drain();
  assert.equal(h.state().phase, 'PAUSED_UNKNOWN');
  assert.deepEqual([h.calls.newThread, h.calls.setValue, h.calls.click], [1, 0, 0]);
});

test('new-thread marker already visible blocks before any keyboard action', async () => {
  const h = await start({ markerAlreadyPresent: true });
  await h.post(event('A', 'prompt')); await h.post(event('A', 'stop')); await h.drain();
  assert.equal(h.state().phase, 'BLOCKED');
  assert.equal(h.calls.newThread, 0);
});

test('unverified example selectors cannot authorize desktop writes', async () => {
  const bad = structuredClone(profile);
  bad.composer.identifier = 'REPLACE_WITH_VERIFIED_CODEX_AX_IDENTIFIER';
  const h = await start({ profile: bad });
  await h.post(event('A', 'prompt')); await h.post(event('A', 'stop')); await h.drain();
  assert.equal(h.state().phase, 'BLOCKED');
  assert.equal(h.calls.newThread, 0);
});

test('uncertain submit never retries, but a late genuine B hook can finish', async () => {
  const h = await start({ clickThrows: true });
  await h.post(event('A', 'prompt')); await h.post(event('A', 'stop')); await h.drain();
  assert.equal(h.state().phase, 'PAUSED_UNKNOWN');
  assert.equal(h.state().bSubmitAttempted, true);
  assert.equal(h.calls.click, 1);
  assert.equal((await h.post(event('B', 'prompt'))).code, 'B_BOUND');
  assert.equal((await h.post(event('B', 'stop'))).code, 'RUN_DONE');
  assert.equal(h.state().phase, 'DONE');
  assert.equal(h.calls.click, 1);
});

test('B hook arriving during submit and native tap failure does not demote DONE', async () => {
  let h;
  h = await start({ clickThrows: true, onTap: async () => {
    assert.equal((await h.post(event('B', 'prompt'))).code, 'B_BOUND');
    assert.equal((await h.post(event('B', 'stop'))).code, 'RUN_DONE');
  } });
  await h.post(event('A', 'prompt')); await h.post(event('A', 'stop')); await h.drain();
  assert.equal(h.state().phase, 'DONE');
  assert.ok(h.state().events.some(x => x.code === 'B_DESKTOP_RECEIPT_UNCERTAIN'));
  assert.equal(h.calls.click, 1);
});

test('incorrect B turn identity cannot finish the run', async () => {
  const h = await start();
  await h.post(event('A','prompt')); await h.post(event('A','stop')); await h.drain();
  await h.post(event('B','prompt'));
  assert.equal((await h.post(event('B','stop',{turnId:'unrelated'}))).code, 'B_IDENTITY_OR_ORDER_MISMATCH');
  assert.equal(h.state().phase, 'WAIT_B_STOP');
  assert.equal(h.calls.close, 0);
});


test('B must be a different Codex session (not another message in A)', async () => {
  const h = await start();
  await h.post(event('A','prompt')); await h.post(event('A','stop')); await h.drain();
  assert.equal((await h.post(event('B','prompt',{sessionId:'a-session'}))).code, 'B_NOT_NEW_CODEX_SESSION');
  assert.equal(h.state().phase, 'B_SUBMIT_UNKNOWN');
  assert.equal((await h.post(event('B','prompt'))).code, 'B_BOUND');
});
