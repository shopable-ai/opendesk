import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, webcrypto } from 'node:crypto';
import { Broker } from '../../lab/browser-automation-core/broker.mjs';
import { Client, untilConnected } from '../../lab/browser-automation-core/client.mjs';
import { NativeDecoder, LineDecoder, writeLine } from '../../lab/browser-automation-core/protocol.mjs';
import { ROOT, SOURCE, ORIGIN, EXTENSION_ID, LIMITS, STATE } from '../../lab/browser-automation-core/config.mjs';

// This is a component integration harness, explicitly NOT a real browser/Extension.
// It runs the unchanged worker source under a minimal Chrome API adapter and the real Native Host process.
test('integration: real Broker/Native Host + worker component under simulated Chrome API', async t => {
  fs.mkdirSync(STATE, {recursive: true, mode: 0o700});
  const stateDirectory = fs.mkdtempSync(path.join(STATE, 't-'));
  fs.chmodSync(stateDirectory, 0o700);
  const socketPath = path.join(stateDirectory, 'b.sock');
  const install = {clientCredential: randomBytes(32).toString('hex'), hostCredential: randomBytes(32).toString('hex'), testMode: true};
  fs.writeFileSync(path.join(stateDirectory, 'install.json'), JSON.stringify(install), {mode: 0o600});
  const broker = await new Broker(install, {socketPath, stateDirectory}).start();
  const connectClient = () => new Client().connect(install.clientCredential, socketPath);
  const timers = new Set(), hosts = new Set();
  let client, stopping = false;
  t.after(async () => {
    stopping = true; client?.close();
    for (const timer of timers) clearTimeout(timer);
    for (const child of hosts) child.kill();
    await broker.stop();
    fs.unlinkSync(path.join(stateDirectory, 'install.json')); fs.rmdirSync(stateDirectory);
  });
  await t.test('authenticated Host without an Extension hello expires and releases the connection', async () => {
    const silent = net.createConnection(socketPath), decoder = new LineDecoder();
    const events = [];
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => { silent.destroy(); reject(new Error('HANDSHAKE_DID_NOT_EXPIRE')); }, LIMITS.handshakeTimeoutMs + 1500);
      silent.on('connect', () => writeLine(silent, {v: 1, kind: 'auth', role: 'host', origin: ORIGIN, credential: install.hostCredential}));
      silent.on('data', bytes => {
        events.push(...decoder.push(bytes));
        assert.equal(broker.status().connectionStage, 'AWAITING_EXTENSION_HANDSHAKE');
      });
      silent.on('close', () => { clearTimeout(deadline); resolve(); });
      silent.on('error', reject);
    });
    assert.equal(events[0].kind, 'authenticated');
    assert.equal(broker.status().connectionStage, 'DISCONNECTED');
    assert.equal(broker.status().connected, false);
    assert.ok(broker.events.some(event => event.reason === 'HANDSHAKE_TIMEOUT'));
  });
  const nativeListeners = () => { const callbacks = []; return {addListener: fn => callbacks.push(fn), emit: value => {
    if (!stopping) callbacks.forEach(fn => fn(value));
  }}; };
  const storage = {};
  const adapter = {
    runtime: {
      id: EXTENSION_ID, getURL: file => file, getManifest: () => ({version: '0.1.0'}), onInstalled: nativeListeners(), onStartup: nativeListeners(),
      connectNative: () => {
        const child = spawn(process.execPath, [`${ROOT}/tests/browser-automation-core/tools/native-host-peer/main.mjs`, ORIGIN, stateDirectory], {stdio: ['pipe', 'pipe', 'pipe']});
        hosts.add(child); const decoder = new NativeDecoder();
        const port = {onMessage: nativeListeners(), onDisconnect: nativeListeners(),
          postMessage: message => {
            // Chrome's Native Messaging input allows more than the Demo's 64 KiB limit.
            const body = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4);
            header.writeUInt32LE(body.length); child.stdin.write(Buffer.concat([header, body]));
          }, disconnect: () => child.kill()};
        child.stdout.on('data', bytes => { for (const message of decoder.push(bytes)) port.onMessage.emit(message); });
        child.on('close', () => { hosts.delete(child); port.onDisconnect.emit(); });
        child.stdin.on('error', () => {}); return port;
      },
    },
    alarms: {create: () => {}, onAlarm: nativeListeners()},
    storage: {session: {get: async key => ({[key]: storage[key]}), set: async item => Object.assign(storage, item)}},
  };
  const context = vm.createContext({chrome: adapter, crypto: webcrypto, TextEncoder, fetch: async file => ({text: async () => fs.readFileSync(`${SOURCE}/extension/${file}`, 'utf8')}), navigator: {userAgent: 'INTEGRATION_SIMULATED_BROWSER'},
    setTimeout: (fn, delay) => {
      if (stopping) return null;
      const timer = setTimeout(() => { timers.delete(timer); if (!stopping) fn(); }, delay);
      timers.add(timer); return timer;
    }, clearTimeout});
  vm.runInContext(fs.readFileSync(`${SOURCE}/extension/worker.js`, 'utf8'), context);
  client = await connectClient();
  const status = await untilConnected(client);
  assert.equal(status.browser.userAgent, 'INTEGRATION_SIMULATED_BROWSER');
  await t.test('out-of-order concurrency is correlated by requestId', async () => {
    const requests = Array.from({length: 10}, (_, i) => ({nonce: randomUUID(), delayMs: 100 - i * 10}));
    const results = await Promise.all(requests.map(params => client.request('fault.delay', params)));
    results.forEach((response, i) => assert.equal(response.result.nonce, requests[i].nonce));
  });
  await t.test('native worker event reaches authenticated Client', async () => {
    await client.request('emitEvent');
    const events = await client.request('events'); assert.ok(events.result.some(event => event.eventType === 'requested' && event.eventId));
  });
  await t.test('timeout retires request and late ACK cannot match another request', async () => {
    const delayed = await client.request('fault.delay', {nonce: 'late', delayMs: 150}, {timeoutMs: 30});
    assert.equal(delayed.error.code, 'TIMEOUT');
    assert.equal((await client.request('echo', {nonce: 'current'})).result.nonce, 'current');
    await new Promise(resolve => setTimeout(resolve, 170));
    assert.ok((await client.request('events')).result.some(event => event.type === 'late-response'));
    assert.equal((await client.request('status')).result.pendingCount, 0);
  });
  await t.test('broker bounds concurrent queue and rejects overflow', async () => {
    const second = await connectClient();
    try {
      const pending = Array.from({length: LIMITS.maxPending}, () => client.request('fault.delay', {nonce: 'load', delayMs: 200}));
      const extra = await second.request('echo', {nonce: 'overflow'});
      assert.equal(extra.error.code, 'QUEUE_FULL'); await Promise.all(pending);
    } finally { second.close(); }
  });
  await t.test('unauthorized local session is rejected', async () => {
    await assert.rejects(new Client().connect('bad', socketPath), {code: 'UNAUTHORIZED'});
  });
  await t.test('unknown operations are rejected before dispatch and recorded in trace', async () => {
    const response = await client.request('eval', {source: 'not executed'});
    assert.equal(response.error.code, 'UNSUPPORTED_OPERATION');
    const trace = fs.readFileSync(broker.trace.file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const record = trace.find(record => record.requestId === response.requestId);
    assert.equal(record.outcome, 'NOT_DISPATCHED'); assert.equal(record.dispatchedAt, null);
  });
  await t.test('retired requestId cannot be replayed after its response', async () => {
    const requestId = randomUUID();
    assert.equal((await client.request('echo', {nonce: 'original'}, {requestId})).result.nonce, 'original');
    const duplicate = await client.request('echo', {nonce: 'replay'}, {requestId});
    assert.equal(duplicate.error.code, 'DUPLICATE_REQUEST_ID');
  });
  await t.test('native host rejects unpinned Chrome extension origin', async () => {
    const child = spawn(process.execPath, [`${ROOT}/tests/browser-automation-core/tools/native-host-peer/main.mjs`, 'chrome-extension://not-allowed/', stateDirectory]);
    const code = await new Promise(resolve => child.on('exit', resolve)); assert.equal(code, 2);
  });
  await t.test('credentials and IPC are protected by filesystem permissions', () => {
    assert.equal(fs.statSync(stateDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(stateDirectory, 'install.json')).mode & 0o777, 0o600);
    const credentials = install;
    const trace = fs.readFileSync(broker.trace.file, 'utf8');
    assert.ok(!trace.includes(credentials.clientCredential)); assert.ok(!trace.includes(credentials.hostCredential));
  });
  await t.test('extension disconnect terminates in-flight and reconnect changes epoch', async () => {
    const pending = client.request('fault.delay', {nonce: 'interrupted', delayMs: 500});
    const response = await client.request('fault.disconnect');
    assert.equal(response.error.code, 'DISCONNECTED'); assert.equal((await pending).error.code, 'DISCONNECTED');
    const next = await untilConnected(client, state => state.connectionEpoch !== status.connectionEpoch);
    assert.notEqual(next.connectionEpoch, status.connectionEpoch);
  });
  for (const [operation, expected] of [['fault.protocol', 'PROTOCOL_MISMATCH'], ['fault.malformed', 'MALFORMED_MESSAGE'],
    ['fault.oversized', 'MESSAGE_TOO_LARGE'], ['fault.hostExit', 'DISCONNECTED']]) {
    await t.test(`${operation} is explicit and worker reconnects without pending replay`, async () => {
      const before = (await client.request('status')).result;
      const response = await client.request(operation); assert.equal(response.error.code, expected);
      const next = await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch);
      assert.equal(next.pendingCount, 0);
      assert.equal((await client.request('echo', {nonce: 'healthy'})).result.nonce, 'healthy');
    });
  }
  for (const mode of ['error-string', 'both', 'missing', 'bad-outcome']) {
    await t.test(`malformed ${mode} produces a correlated explicit failure, with no orphaned pending`, async () => {
      const before = (await client.request('status')).result;
      const waiting = client.request('fault.delay', {delayMs: 1000}, {timeoutMs: 1500});
      const response = await client.request('fault.malformed', {mode}, {timeoutMs: 1500});
      assert.equal(response.error.code, 'MALFORMED_MESSAGE');
      assert.equal((await waiting).error.code, 'MALFORMED_MESSAGE');
      const after = await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch);
      assert.equal(after.pendingCount, 0);
      assert.equal((await client.request('echo', {nonce: mode})).result.nonce, mode);
    });
  }
});
