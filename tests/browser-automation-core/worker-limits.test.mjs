import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { LIMITS, SOURCE, EXTENSION_ID } from '../../lab/browser-automation-core/config.mjs';

test('Worker capacities use the shared configuration (simulated Chrome inventory, no Live substitution)', async () => {
  const listeners = () => {const callbacks = []; return {addListener: fn => callbacks.push(fn), emit: message => callbacks.forEach(fn => fn(message)), callbacks};};
  const responses = [], storage = {}, native = {onMessage: listeners(), onDisconnect: listeners(), postMessage: message => responses.push(message)};
  let tabCount = 1, frameCount = 1, heldFrames = null, actions = 0, receiverCurrent = false, selectedUrl = 'http://127.0.0.1:111/', removed = 0;
  const chrome = {
    runtime: {id: EXTENSION_ID, getURL: file => file, getManifest: () => ({version: 'SIMULATED'}), onMessage: listeners(), onInstalled: listeners(), onStartup: listeners(), connectNative: () => native},
    tabs: {query: async () => Array.from({length: tabCount}, (_, tab) => ({id: tab, title: 't'.repeat(LIMITS.maxTextChars + 1), url: 'u'.repeat(LIMITS.maxUrlChars + 1)})), onRemoved: listeners(), create: async params => {tabCount++; return {id: 10000, url: params.url};}, get: async () => ({url: selectedUrl}), remove: async () => {removed++;}, sendMessage: async (_tab, message) => {if (message.operation === 'provenance') return {loadedResources: receiverCurrent ? responses.find(x=>x.kind==='hello').loadedResources : {contentCodeSha256: 'old', locatorCodeSha256:'old'}}; actions++; return {trace:{action:{type:'fill'}}};}},
    webNavigation: {getAllFrames: async () => heldFrames ? new Promise(resolve => heldFrames.push(resolve)) : Array.from({length: frameCount}, (_, frameId) => ({frameId, documentId: `document-${frameId}`, url: 'http://127.0.0.1/'})), onCommitted: listeners(), onHistoryStateUpdated: listeners()},
    storage: {session: {get: async key => ({[key]: storage[key]}), set: async item => Object.assign(storage, item)}}, alarms: {create: () => {}, onAlarm: listeners()},
  };
  const context = vm.createContext({chrome, crypto: webcrypto, TextEncoder, URL, navigator: {userAgent: 'SIMULATED'}, setTimeout, clearTimeout, fetch: async file => ({text: async () => fs.readFileSync(`${SOURCE}/extension/${file}`, 'utf8')})});
  vm.runInContext(fs.readFileSync(`${SOURCE}/extension/worker.js`, 'utf8'), context);
  const wait = async fn => {const deadline = Date.now() + 2000; while (!fn()) {assert.ok(Date.now() < deadline); await new Promise(r => setTimeout(r, 1));}};
  await wait(() => native.onMessage.callbacks.length > 0);
  native.onMessage.emit({kind: 'authenticated'}); await wait(() => responses.some(x => x.kind === 'hello'));
  const hello = responses.find(x => x.kind === 'hello'), identity = {brokerSession: 'broker', browserSession: hello.browserSession, connectionEpoch: 'epoch'};
  native.onMessage.emit({kind: 'welcome', ...identity, testMode: true, limits: LIMITS});
  let index = 0;
  const send = async (operation, params = {}) => {
    const requestId = `request-${index++}`; native.onMessage.emit({v: 1, kind: 'request', ...identity, requestId, operation, params});
    await wait(() => responses.some(x => x.kind === 'response' && x.requestId === requestId)); return responses.find(x => x.kind === 'response' && x.requestId === requestId);
  };
  for (const n of [LIMITS.maxTrackedTabs - 1, LIMITS.maxTrackedTabs, LIMITS.maxTrackedTabs + 1]) {
    tabCount = n; const response = await send('tabs');
    if (n <= LIMITS.maxTrackedTabs) {assert.equal(response.result.tabs.length, n); assert.equal(response.result.tabs[0].title.length, LIMITS.maxTextChars); assert.equal(response.result.tabs[0].url.length, LIMITS.maxUrlChars);}
    else assert.equal(response.error.code, 'TAB_LIMIT');
  }
  tabCount = LIMITS.maxTrackedTabs - 1; assert.ok((await send('test.openTab', {url:'http://127.0.0.1/'})).result);
  assert.equal(tabCount,LIMITS.maxTrackedTabs); assert.equal((await send('test.openTab', {url:'http://127.0.0.1/'})).error.code,'TAB_LIMIT');
  assert.equal((await send('test.closeTab',{tab:10000,expectedOrigin:'http://127.0.0.1:222'})).error.code,'TAB_OWNER_CHANGED'); assert.equal(removed,0);
  tabCount = 1; assert.equal((await send('tabs')).result.tabs.length, 1);
  for (const n of [LIMITS.maxFramesPerTab - 1, LIMITS.maxFramesPerTab, LIMITS.maxFramesPerTab + 1]) {
    frameCount = n; const response = await send('frames', {tab: 1});
    if (n <= LIMITS.maxFramesPerTab) assert.equal(response.result.frames.length, n); else assert.equal(response.error.code, 'FRAME_LIMIT');
  }
  frameCount = 1; assert.equal((await send('frames', {tab: 1})).result.frames.length, 1);
  const scope = {tab:1,frame:0,document:'document-0'};
  const mismatch = await send('fill',{target:scope,value:'probe'}); assert.equal(mismatch.error.code,'RUNTIME_RESOURCE_MISMATCH'); assert.equal(actions,0);
  receiverCurrent = true; assert.ok((await send('fill',{target:scope,value:'probe'})).result); assert.equal(actions,1);
  heldFrames = [];
  const pending = Array.from({length: LIMITS.maxPending}, () => send('frames', {tab: 1}));
  await wait(() => heldFrames.length === LIMITS.maxPending);
  assert.equal((await send('frames', {tab: 1})).error.code, 'QUEUE_FULL');
  const resolvers = heldFrames; heldFrames = null; for (const resolve of resolvers) resolve([{frameId: 0, documentId: 'document', url: 'http://127.0.0.1/'}]);
  (await Promise.all(pending)).forEach(reply => assert.ok(reply.result));
  assert.ok((await send('frames', {tab: 1})).result);
});
