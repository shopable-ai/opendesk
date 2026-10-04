import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { Broker } from '../../lab/browser-automation-core/broker.mjs';
import { Client } from '../../lab/browser-automation-core/client.mjs';
import { LineDecoder, NativeDecoder, encoded, nativeFrame, writeLine } from '../../lab/browser-automation-core/protocol.mjs';
import { Trace } from '../../lab/browser-automation-core/trace.mjs';
import { LIMITS, EVIDENCE, STATE, ORIGIN, EXTENSION_ID } from '../../lab/browser-automation-core/config.mjs';

test('resource byte boundaries N-1/N/N+1 and send-buffer capacity', () => {
  for (const bytes of [LIMITS.maxMessageBytes - 1, LIMITS.maxMessageBytes, LIMITS.maxMessageBytes + 1]) {
    const message = {padding: 'x'.repeat(bytes - Buffer.byteLength(JSON.stringify({padding: ''})))};
    if (bytes <= LIMITS.maxMessageBytes) {
      assert.equal(encoded(message).length, bytes);
      assert.equal(new LineDecoder().push(Buffer.from(JSON.stringify(message) + '\n')).length, 1);
      assert.equal(new NativeDecoder().push(nativeFrame(message)).length, 1);
    } else {
      assert.throws(() => encoded(message), {code: 'MESSAGE_TOO_LARGE'});
      assert.throws(() => new LineDecoder().push(Buffer.from(JSON.stringify(message) + '\n')), {code: 'MESSAGE_TOO_LARGE'});
      const prefix = Buffer.alloc(4); prefix.writeUInt32LE(bytes); assert.throws(() => new NativeDecoder().push(prefix), {code: 'MESSAGE_TOO_LARGE'});
    }
  }
  const message = {ok: true}, size = encoded(message).length + 1, capacity = LIMITS.maxMessageBytes * LIMITS.maxQueue;
  for (const total of [capacity - 1, capacity, capacity + 1]) {
    let writes = 0; const socket = {destroyed: false, writableLength: total - size, write: () => writes++};
    if (total <= capacity) {writeLine(socket, message); assert.equal(writes, 1);}
    else {assert.throws(() => writeLine(socket, message), {code: 'BACKPRESSURE'}); assert.equal(writes, 0);}
  }
});

test('Trace capacity rejects before overflow and reserve protects dispatched completions', () => {
  for (const total of [LIMITS.maxTraceBytes - 1, LIMITS.maxTraceBytes, LIMITS.maxTraceBytes + 1]) {
    const directory = fs.mkdtempSync(path.join(EVIDENCE, 'resource-trace-'));
    const trace = new Trace(directory);
    try {
      const record = {padding: 'x'.repeat(total - 1 - Buffer.byteLength(JSON.stringify({padding: ''})))};
      if (total <= LIMITS.maxTraceBytes) {trace.append(record); assert.equal(fs.statSync(trace.file).size, total); assert.throws(() => trace.reserve(), {code: 'TRACE_LIMIT'});}
      else {assert.throws(() => trace.append(record), {code: 'TRACE_LIMIT'}); assert.equal(trace.bytes, 0);}
    } finally {trace.close();}
  }
});

test('actual Broker IPC capacities, eviction, auth deadline and fresh-session recovery (simulated browser peer)', async t => {
  fs.mkdirSync(STATE, {recursive: true, mode: 0o700});
  const stateDirectory = fs.mkdtempSync(path.join(STATE, 'limits-')), socketPath = path.join(stateDirectory, 'b.sock');
  const install = {testMode: true, clientCredential: crypto.randomBytes(32).toString('hex'), hostCredential: crypto.randomBytes(32).toString('hex')};
  let broker = await new Broker(install, {stateDirectory, socketPath}).start();
  const clients = [], unauthenticated = [];
  t.after(async () => {for (const client of clients) client.close(); for (const socket of unauthenticated) socket.destroy(); await broker.stop(); fs.rmdirSync(stateDirectory);});
  let client = await new Client().connect(install.clientCredential, socketPath); clients.push(client);
  await t.test('connection N-1/N/N+1; authentication timer releases silent connections', async () => {
    for (let i = 1; i < LIMITS.maxConnections; i++) {
      const socket = net.createConnection(socketPath); unauthenticated.push(socket); await new Promise((resolve, reject) => {socket.once('connect', resolve); socket.once('error', reject);});
      assert.ok(broker.sockets.size <= LIMITS.maxConnections);
    }
    assert.equal(broker.sockets.size, LIMITS.maxConnections);
    const overflow = net.createConnection(socketPath); const started = Date.now();
    await new Promise(resolve => {overflow.once('close', resolve); overflow.on('error', () => {});});
    assert.equal(broker.sockets.size, LIMITS.maxConnections);
    await new Promise(resolve => unauthenticated[0].once('close', resolve));
    assert.ok(Date.now() - started <= LIMITS.authTimeoutMs + LIMITS.deadlineToleranceMs);
    for (const socket of unauthenticated) socket.destroy();
  });
  await t.test('event N-1/N/N+1 retains bounded ring and expired cursor is rejected', async () => {
    for (let i = 0; i < LIMITS.maxEvents + 1; i++) {broker.event('capacity'); assert.equal(broker.events.length, Math.min(i + 1, LIMITS.maxEvents));}
    broker.event('capacity'); const expired = await client.request('events', {after: 1}); assert.equal(expired.error.code, 'EVENTS_EXPIRED');
    const healthy = await client.request('status'); assert.ok(healthy.result); assert.equal(broker.pending.size, 0);
  });
  await t.test('request memory N-1/N/N+1 seals old session without unbounded growth', async () => {
    while (broker.seenRequests.size < LIMITS.maxRequestsPerSession) assert.ok((await client.request('status')).result);
    assert.equal(broker.seenRequests.size, LIMITS.maxRequestsPerSession);
    const extra = await client.request('status'); assert.equal(extra.error.code, 'SESSION_REQUEST_LIMIT'); assert.equal(broker.seenRequests.size, LIMITS.maxRequestsPerSession);
    client.close(); await broker.stop(); broker = await new Broker(install, {stateDirectory, socketPath}).start();
    client = await new Client().connect(install.clientCredential, socketPath); clients.push(client);
    assert.equal((await client.request('status')).result.pendingCount, 0);
  });
});
