/* Native Messaging and fixed DOM operations for the local fixture; no eval. */
(function browserCoreWorker() {
const HOST = 'org.opendesk.browser_core_demo';
const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
// Function.toString fingerprints the executable closure already running, not merely a file fetched after reload.
const loadedResources = (async () => {
  const resources = {}, texts = {};
  for (const file of ['manifest.json', 'worker.js', 'locator.js', 'content.js']) { texts[file] = await (await fetch(chrome.runtime.getURL(file))).text(); resources[file] = await sha256(texts[file]); }
  const code = (text, name) => text.slice(text.indexOf(`function ${name}() {`), text.lastIndexOf('})();') + 1);
  return {workerCodeSha256: await sha256(browserCoreWorker.toString()),
    contentCodeSha256: await sha256(code(texts['content.js'], 'browserCoreContent')),
    locatorCodeSha256: await sha256(code(texts['locator.js'], 'browserCoreLocator')),
    resources, workerStartedAt: new Date().toISOString()};
})();
let port = null, context = null, retry = 0, connecting = false;
let nextHelloIdentity = null;
const pending = new Set();
const routes = new Map(), pageRevisions = new Map();
const cancelled = new Set();
let inventoryLimit = false;
const domOperations = new Set(['observe', 'locate', 'read', 'fill', 'click', 'wait', 'verify']);
const workerStartedAt = new Date().toISOString();
let phase = 'DISCONNECTED', lastNativeError = null;
chrome.runtime.onMessage?.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.kind === 'browser-core-boundary' && context && pending.has(message.requestId)) {
    const identity = routes.get(message.requestId);
    if (identity?.tab === sender.tab?.id && identity.document === sender.documentId) event('execution-held', {requestId: message.requestId, identity});
    return;
  }
  if (message?.kind !== 'installationStatus') return;
  respond({extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version,
    manifestUrl: chrome.runtime.getURL('manifest.json'), workerStartedAt, phase, lastNativeError,
    browserSession: context?.browserSession ?? null, brokerSession: context?.brokerSession ?? null,
    connectionEpoch: context?.connectionEpoch ?? null, pendingCount: pending.size});
});
function send(message) {
  if (!port) return;
  port.postMessage({v: 1, ...context, ...message});
}
function event(eventType, data = {}) { const eventId = crypto.randomUUID(); send({kind: 'event', eventType, eventId, data}); return eventId; }
function fail(code, outcome = 'FAILED_CONFIRMED') { throw Object.assign(new Error(code), {code, outcome}); }
function permittedUrl(value) {
  try { const url = new URL(value); return url.protocol === 'http:' && url.hostname === '127.0.0.1'; } catch { return false; }
}
async function frames(tab, selectedContext = context) {
  if ((await chrome.tabs.query({})).length > selectedContext.limits.maxTrackedTabs) fail('TAB_LIMIT');
  const value = await chrome.webNavigation.getAllFrames({tabId: tab});
  if (!value) fail('STALE_TARGET');
  if (value.length > selectedContext.limits.maxFramesPerTab) fail('FRAME_LIMIT');
  return value.filter(item => permittedUrl(item.url)).map(item => ({frame: item.frameId, document: item.documentId,
    parentFrame: item.parentFrameId, url: item.url, lifecycle: item.documentLifecycle ?? null}));
}
async function route(request, selectedContext) {
  if (inventoryLimit) fail('INVENTORY_LIMIT');
  const scope = request.params.target || request.params.scope;
  if (!scope || !Number.isInteger(scope.tab) || !Number.isInteger(scope.frame)) fail('INSUFFICIENT_TARGET_IDENTITY');
  const frame = (await frames(scope.tab, selectedContext)).find(item => item.frame === scope.frame);
  if (context !== selectedContext || !pending.has(request.requestId)) fail('STALE_CONNECTION');
  if (cancelled.has(request.requestId)) fail('CANCELLED');
  if (!frame?.document || (scope.document && scope.document !== frame.document)) fail('STALE_TARGET');
  const identity = {brokerSession: selectedContext.brokerSession, browserSession: selectedContext.browserSession, connectionEpoch: selectedContext.connectionEpoch,
    tab: scope.tab, frame: frame.frame, document: frame.document};
  const message = {kind: 'browser-core-dom', requestId: request.requestId, operation: request.operation,
    params: request.params, identity, pageRevision: pageRevisions.get(`${scope.tab}:${scope.frame}`) || 0,
    limits: selectedContext.limits, testMode: selectedContext.testMode, timeoutMs: request.timeoutMs || selectedContext.limits.defaultTimeoutMs};
  routes.set(request.requestId, identity);
  const options = {documentId: frame.document};
  // Prove the receiver's executable resource before any DOM action. Installing a missing fixed receiver is a no-input preflight.
  const probe = {...message, operation: 'provenance', params: {}};
  let receiver;
  try { receiver = await chrome.tabs.sendMessage(scope.tab, probe, options); }
  catch {
    if (context !== selectedContext || !pending.has(request.requestId)) fail('STALE_CONNECTION');
    await chrome.scripting.executeScript({target: {tabId: scope.tab, documentIds: [frame.document]}, files: ['locator.js', 'content.js']});
    receiver = await chrome.tabs.sendMessage(scope.tab, probe, options);
  }
  const expected = await loadedResources;
  if (receiver?.loadedResources?.contentCodeSha256 !== expected.contentCodeSha256 || receiver?.loadedResources?.locatorCodeSha256 !== expected.locatorCodeSha256) fail('RUNTIME_RESOURCE_MISMATCH');
  if (context !== selectedContext || !pending.has(request.requestId)) fail('STALE_CONNECTION');
  if (cancelled.has(request.requestId)) fail('CANCELLED');
  try { return await chrome.tabs.sendMessage(scope.tab, message, options); }
  catch { fail('DOM_CHANNEL_LOST', ['fill', 'click'].includes(request.operation) ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED'); }

}
chrome.webNavigation?.onCommitted?.addListener(details => {
  if (!context || !permittedUrl(details.url)) return;
  if (pageRevisions.size >= context.limits.maxTrackedTabs * context.limits.maxFramesPerTab && !pageRevisions.has(`${details.tabId}:${details.frameId}`)) { inventoryLimit = true; return; }
  pageRevisions.set(`${details.tabId}:${details.frameId}`, 0);
  event('document-changed', {tab: details.tabId, frame: details.frameId, document: details.documentId});
});
chrome.webNavigation?.onHistoryStateUpdated?.addListener(details => {
  if (!context || !permittedUrl(details.url)) return;
  const key = `${details.tabId}:${details.frameId}`;
  if (pageRevisions.size >= context.limits.maxTrackedTabs * context.limits.maxFramesPerTab && !pageRevisions.has(key)) { inventoryLimit = true; return; }
  pageRevisions.set(key, (pageRevisions.get(key) || 0) + 1);
  event('semantic-navigation', {tab: details.tabId, frame: details.frameId, document: details.documentId});
});
chrome.tabs?.onRemoved?.addListener(tab => { for (const key of pageRevisions.keys()) if (key.startsWith(`${tab}:`)) pageRevisions.delete(key); if (context) event('tab-closed', {tab}); });
async function execute(request) {
  const originalPort = port, originalContext = context;
  const respond = message => {
    if (port === originalPort && context === originalContext) send(message);
  };
  if (pending.size >= context.limits.maxPending) return send({kind: 'response', requestId: request.requestId,
    error: {code: 'QUEUE_FULL', outcome: 'FAILED_CONFIRMED'}});
  pending.add(request.requestId);
  try {
    if (request.v !== 1 || request.brokerSession !== context.brokerSession ||
        request.connectionEpoch !== context.connectionEpoch || request.browserSession !== context.browserSession) {
      throw {code: 'STALE_CONNECTION'};
    }
    let result;
    if (domOperations.has(request.operation)) {
      if ((request.params.dropAckAfterCompleted || request.params.testExecutionBarrier) && !context.testMode) fail('TEST_MODE_REQUIRED');
      result = await route(request, originalContext);
      if (result.error) {
        respond({kind: 'response', requestId: request.requestId, error: result.error, trace: result.trace, identity: result.identity}); return;
      }
      if (request.params.dropAckAfterCompleted) {
        if (!result.trace?.verification?.pass || result.trace.verification.actual !== 'Completed') fail('ACK_DROP_PRECONDITION_FAILED', 'OUTCOME_UNKNOWN');
        event('ack-dropped', {requestId: request.requestId, identity: result.identity, trace: result.trace,
          point: 'after real click and DOM Completed; Extension response deliberately omitted'}); return;
      }
      respond({kind: 'response', requestId: request.requestId, result}); return;
    }
    switch (request.operation) {
      case 'tabs': {
        const tabs = await chrome.tabs.query({});
        if (tabs.length > context.limits.maxTrackedTabs) fail('TAB_LIMIT');
        result = {tabs: tabs.map(tab => ({tab: tab.id, title: (tab.title || '').slice(0, context.limits.maxTextChars), url: (tab.url || '').slice(0, context.limits.maxUrlChars),
          browserSession: context.browserSession, connectionEpoch: context.connectionEpoch}))}; break;
      }
      case 'frames': result = {tab: request.params.tab, frames: await frames(request.params.tab)}; break;
      case 'test.openTab': {
        if (!context.testMode || !permittedUrl(request.params.url)) fail('TEST_MODE_REQUIRED');
        if ((await chrome.tabs.query({})).length >= context.limits.maxTrackedTabs) fail('TAB_LIMIT');
        const tab = await chrome.tabs.create({url: request.params.url, active: true}); result = {tab: tab.id, url: tab.url || request.params.url}; break;
      }
      case 'test.reloadTab': {
        if (!context.testMode) fail('TEST_MODE_REQUIRED');
        const selected = await chrome.tabs.get(request.params.tab), url = selected.pendingUrl || selected.url;
        if (!permittedUrl(url) || new URL(url).origin !== request.params.expectedOrigin) fail('TAB_OWNER_CHANGED');
        await chrome.tabs.reload(request.params.tab); result = {tab: request.params.tab, reloadRequested: true}; break;
      }
      case 'test.closeTab': {
        if (!context.testMode) fail('TEST_MODE_REQUIRED');
        const selected = await chrome.tabs.get(request.params.tab), url = selected.pendingUrl || selected.url;
        if (!permittedUrl(url) || new URL(url).origin !== request.params.expectedOrigin) fail('TAB_OWNER_CHANGED');
        await chrome.tabs.remove(request.params.tab); result = {tab: request.params.tab, closed: true}; break;
      }
      case 'test.adoptTab': {
        if (!context.testMode || !permittedUrl(request.params.expectedUrl)) fail('TEST_MODE_REQUIRED');
        const observed = (await frames(request.params.tab)).find(frame => frame.frame === 0);
        if (observed?.url !== request.params.expectedUrl) fail('STALE_TARGET');
        result = {tab: request.params.tab, revalidatedDocument: observed.document, url: observed.url}; break;
      }
      case 'test.releaseExecution': {
        if (!context.testMode) fail('TEST_MODE_REQUIRED');
        const identity = routes.get(request.params.requestId);
        if (!identity) fail('BARRIER_NOT_FOUND');
        result = await chrome.tabs.sendMessage(identity.tab, {kind: 'browser-core-dom', operation: 'releaseExecution', requestId: request.params.requestId}, {documentId: identity.document}); break;
      }
      case 'fault.duplicateAck': { const response = {kind: 'response', requestId: request.requestId, result: {nonce: request.params.nonce}}; send(response); send(response); return; }
      case 'echo': result = {nonce: request.params.nonce}; break;
      case 'browserInfo': {
        let fullVersionList = null;
        try { fullVersionList = (await navigator.userAgentData?.getHighEntropyValues(['fullVersionList']))?.fullVersionList || null; } catch {}
        result = {extensionId: chrome.runtime.id, extensionVersion: chrome.runtime.getManifest().version,
          userAgent: navigator.userAgent, fullVersionList, loadedResources: await loadedResources}; break;
      }
      case 'emitEvent': { const eventId = event('requested', {requestId: request.requestId}); result = {emitted: true, eventId}; break; }
      case 'fault.delay': {
        const delay = request.params.delayMs;
        if (!Number.isInteger(delay) || delay < 0 || delay > context.limits.maxTimeoutMs) throw {code: 'INVALID_DELAY'};
        await new Promise(resolve => setTimeout(resolve, delay));
        if (originalPort !== port || originalContext !== context) return;
        result = {nonce: request.params.nonce}; break;
      }
      case 'fault.disconnect': port.disconnect(); port = null; context = null; pending.clear(); reconnect(); return;
      case 'fault.hostExit': send({kind: 'host.exit'}); return;
      case 'fault.identity': nextHelloIdentity = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; port.disconnect(); port = null; context = null; pending.clear(); reconnect(); return;
      case 'fault.reload': chrome.runtime.reload(); return;
      case 'fault.protocol': send({v: 999, kind: 'response', requestId: request.requestId}); return;
      case 'fault.malformed': {
        const mode = request.params.mode;
        if (mode === 'error-string') send({kind: 'response', requestId: request.requestId, error: 'invalid error shape'});
        else if (mode === 'both') send({kind: 'response', requestId: request.requestId, result: {}, error: {code: 'INVALID'}});
        else if (mode === 'missing') send({kind: 'response', requestId: request.requestId});
        else if (mode === 'bad-outcome') send({kind: 'response', requestId: request.requestId, error: {code: 'INVALID', outcome: 'SUCCEEDED'}});
        else send({kind: 'response', requestId: 42});
        return;
      }
      case 'fault.oversized': send({kind: 'response', requestId: request.requestId, padding: 'x'.repeat(context.limits.maxMessageBytes + 1)}); return;
      default: throw {code: 'UNSUPPORTED_OPERATION'};
    }
    respond({kind: 'response', requestId: request.requestId, result});
  } catch (error) {
    respond({kind: 'response', requestId: request.requestId, error: {code: error.code || 'BROWSER_ERROR',
      outcome: error.outcome || (['fill', 'click'].includes(request.operation) ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED')}});
  } finally { pending.delete(request.requestId); routes.delete(request.requestId); cancelled.delete(request.requestId); }
}
function reconnect() {
  chrome.alarms.create('reconnect', {delayInMinutes: 0.5});
  // Begin the bounded attempt in this disconnect event, before the Worker can become idle.
  if (retry++ < 5) connect();
}
async function connect() {
  if (port || connecting) return;
  connecting = true;
  phase = 'CONNECTING';
  try {
  context = null;
  const session = await chrome.storage.session.get('browserSession');
  const browserSession = session.browserSession || crypto.randomUUID();
  await chrome.storage.session.set({browserSession});
  const current = chrome.runtime.connectNative(HOST); port = current; connecting = false;
  current.onMessage.addListener(async message => {
    if (message.kind === 'authenticated') {
      phase = 'NATIVE_HOST_AUTHENTICATED';
      const helloIdentity = nextHelloIdentity || chrome.runtime.id; nextHelloIdentity = null;
      current.postMessage({v: 1, kind: 'hello', extensionId: helloIdentity,
        extensionVersion: chrome.runtime.getManifest().version, browserSession, userAgent: navigator.userAgent, loadedResources: await loadedResources});
    } else if (message.kind === 'welcome') {
      pageRevisions.clear(); inventoryLimit = false;
      context = {brokerSession: message.brokerSession, connectionEpoch: message.connectionEpoch, browserSession,
        limits: message.limits, testMode: message.testMode};
      phase = 'READY'; lastNativeError = null;
      retry = 0; event('connected');
    } else if (message.kind === 'request' && context) execute(message);
    else if (message.kind === 'cancel' && context) {
      const identity = routes.get(message.requestId);
      if (pending.has(message.requestId)) cancelled.add(message.requestId);
      if (identity) chrome.tabs.sendMessage(identity.tab, {kind: 'browser-core-dom', operation: 'cancel', requestId: message.requestId}, {documentId: identity.document}).catch(() => {});
      else if (pending.has(message.requestId)) cancelled.add(message.requestId);
    }
  });
  current.onDisconnect.addListener(() => {
    const nativeError = chrome.runtime.lastError?.message;
    if (port === current) {
      phase = 'DISCONNECTED'; lastNativeError = nativeError ? nativeError.slice(0, 500) : null;
      for (const [requestId, identity] of routes) chrome.tabs.sendMessage(identity.tab, {kind: 'browser-core-dom', operation: 'cancel', requestId}, {documentId: identity.document}).catch(() => {});
      port = null; context = null; pending.clear(); routes.clear(); cancelled.clear(); reconnect();
    }
  });
  } catch {
    phase = 'CONNECT_FAILED'; lastNativeError = 'CONNECT_SETUP_FAILED';
    port = null; context = null; reconnect();
  } finally { connecting = false; }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'reconnect') { retry = 0; connect(); } });
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
connect();

})();
