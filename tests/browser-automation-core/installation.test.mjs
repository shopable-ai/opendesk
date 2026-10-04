import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID, webcrypto } from 'node:crypto';
import { SOURCE, STATE, EXTENSION_ID, LIMITS } from '../../lab/browser-automation-core/config.mjs';
import { inspectExtension } from '../../lab/browser-automation-core/extension-installation.mjs';
import { nativeDiagnostic } from '../../lab/browser-automation-core/native-diagnostic.mjs';

function scratch(t) {
  fs.mkdirSync(STATE, {recursive: true, mode: 0o700});
  const directory = fs.mkdtempSync(path.join(STATE, 'installation-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true})); // Only this test's owned scratch directory.
  return directory;
}
test('installation preflight rejects a truncated delivery and an unpinned identity', t => {
  const directory = scratch(t);
  for (const name of ['manifest.json', 'worker.js', 'status.js', 'locator.js', 'content.js']) {
    fs.copyFileSync(path.join(SOURCE, 'extension', name), path.join(directory, name));
  }
  assert.throws(() => inspectExtension(directory), {code: 'ENOENT'}); // Missing declared popup.
  fs.copyFileSync(path.join(SOURCE, 'extension/status.html'), path.join(directory, 'status.html'));
  assert.equal(inspectExtension(directory).extensionId, EXTENSION_ID);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  manifest.key = Buffer.from('different public key').toString('base64');
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => inspectExtension(directory), {code: 'EXTENSION_ID_MISMATCH'});
});
test('native diagnostics stay bounded and omit unsafe error data', t => {
  const file = path.join(scratch(t), 'status.json');
  const record = nativeDiagnostic(file, {hostPid: 123, parentPid: 1, originAllowed: true});
  for (let i = 0; i <= LIMITS.maxNativeDiagnostics; i++) {record('BROKER_CONNECTING', 'unsafe credential payload'); assert.equal(JSON.parse(fs.readFileSync(file)).events.length, Math.min(i + 1, LIMITS.maxNativeDiagnostics));}
  record('HOST_EXIT', 'ECONNREFUSED');
  const bytes = fs.readFileSync(file, 'utf8'), report = JSON.parse(bytes);
  assert.equal(report.events.length, LIMITS.maxNativeDiagnostics);
  assert.equal(report.events.at(-1).errorCode, 'ECONNREFUSED');
  assert.ok(!bytes.includes('credential payload'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
test('worker connection diagnostics distinguish Chrome disconnect from real READY; no actions', async () => {
  // Deterministic component adapter, not live Chrome evidence.
  let messageListener, disconnectListener, nativeListener, status, connectCount = 0;
  const port = {postMessage() {}, onMessage: {addListener(fn) { nativeListener = fn; }},
    onDisconnect: {addListener(fn) { disconnectListener = fn; }}};
  const runtime = {id: EXTENSION_ID, getManifest: () => ({version: '0.2.1'}),
    getURL: file => `chrome-extension://${EXTENSION_ID}/${file}`, connectNative: () => { connectCount++; return port; },
    onMessage: {addListener(fn) { messageListener = fn; }},
    onInstalled: {addListener() {}}, onStartup: {addListener() {}},
    lastError: {message: 'Specified native messaging host not found.'}};
  const chrome = {runtime, alarms: {create() {}, onAlarm: {addListener() {}}},
    storage: {session: {async get() { return {browserSession: 'session'}; }, async set() {}}}};
  vm.runInNewContext(fs.readFileSync(path.join(SOURCE, 'extension/worker.js'), 'utf8'), {
    chrome, crypto: webcrypto, TextEncoder, fetch: async url => ({text: async () => fs.readFileSync(path.join(SOURCE, 'extension', url.split('/').at(-1)), 'utf8')}), navigator: {userAgent: 'DIAGNOSTIC_SIMULATION'}, setTimeout() {},
  });
  await new Promise(resolve => setImmediate(resolve));
  const query = () => messageListener({kind: 'installationStatus'}, {id: EXTENSION_ID}, value => { status = value; });
  query(); assert.equal(status.phase, 'CONNECTING');
  disconnectListener(); query();
  assert.equal(status.phase, 'CONNECTING'); assert.equal(status.lastNativeError, runtime.lastError.message);
  assert.equal(status.browserSession, null); assert.equal(status.connectionEpoch, null);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(connectCount, 2);
  nativeListener({kind: 'welcome', brokerSession: 'new-broker', connectionEpoch: 'new-epoch', limits: LIMITS, testMode: true}); query();
  assert.equal(status.phase, 'READY'); assert.equal(status.lastNativeError, null); assert.equal(status.connectionEpoch, 'new-epoch');
  status = null;
  messageListener({kind: 'installationStatus'}, {id: 'other-extension'}, value => { status = value; });
  assert.equal(status, null);
  // A fresh worker is covered by integration tests; disconnected status must not assert a READY link.
  assert.equal(typeof nativeListener, 'function');
});
