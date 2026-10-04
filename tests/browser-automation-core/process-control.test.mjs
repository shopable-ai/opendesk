import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ROOT, STATE } from '../../lab/browser-automation-core/config.mjs';
import { Broker } from '../../lab/browser-automation-core/broker.mjs';
import { Client } from '../../lab/browser-automation-core/client.mjs';
import { recoverStaleBroker } from '../../lab/browser-automation-core/process-control.mjs';

function fixture(t) {
  fs.mkdirSync(STATE, {recursive: true, mode: 0o700});
  const stateDirectory = fs.mkdtempSync(path.join(STATE, 'pc-'));
  const socketPath = path.join(stateDirectory, 'b.sock');
  const install = {clientCredential: randomBytes(32).toString('hex'), hostCredential: randomBytes(32).toString('hex'), testMode: false};
  fs.writeFileSync(path.join(stateDirectory, 'install.json'), JSON.stringify(install), {mode: 0o600});
  t.after(() => fs.rmSync(stateDirectory, {recursive: true})); // Only this test's owned run directory.
  return {stateDirectory, socketPath, install};
}
test('recovery refuses a live Broker and leaves authenticated requests working', async t => {
  const f = fixture(t), broker = await new Broker(f.install, f).start();
  try {
    await assert.rejects(recoverStaleBroker(f), {code: 'BROKER_PROCESS_EXISTS'});
    const client = await new Client().connect(f.install.clientCredential, f.socketPath);
    try { assert.equal((await client.request('status')).result.brokerSession, broker.session); }
    finally { client.close(); }
  } finally { await broker.stop(); }
});
test('recovery proves a real crashed Broker is gone before removing only its stale state', async t => {
  const f = fixture(t);
  const log = fs.openSync(path.join(f.stateDirectory, 'broker.log'), 'ax', 0o600);
  const child = spawn(process.execPath, [`${ROOT}/tests/browser-automation-core/tools/broker-peer/main.mjs`, f.stateDirectory], {stdio: ['ignore', log, log]});
  fs.closeSync(log);
  let exited = false;
  const exit = new Promise(resolve => child.once('exit', () => { exited = true; resolve(); }));
  t.after(async () => { if (!exited) { child.kill('SIGTERM'); await exit; } });
  let client;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { client = await new Client().connect(f.install.clientCredential, f.socketPath); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(client, 'real child Broker must start');
  const status = (await client.request('status')).result; client.close();
  assert.equal(status.brokerPid, child.pid);
  fs.writeFileSync(path.join(f.stateDirectory, 'user-fixture.txt'), 'preserve');
  child.kill('SIGKILL'); await exit;
  assert.ok(fs.existsSync(f.socketPath));
  const result = await recoverStaleBroker(f);
  assert.equal(result.recovered, true); assert.equal(result.pidState, 'ABSENT');
  assert.equal(result.socketProbe, 'ECONNREFUSED');
  assert.ok(fs.existsSync(result.proof));
  assert.ok(!fs.existsSync(f.socketPath)); assert.ok(!fs.existsSync(path.join(f.stateDirectory, 'broker.json')));
  assert.equal(fs.readFileSync(path.join(f.stateDirectory, 'user-fixture.txt'), 'utf8'), 'preserve');
});
test('recovery refuses an unrelated regular file named like the socket', async t => {
  const f = fixture(t); fs.writeFileSync(f.socketPath, 'user data');
  await assert.rejects(recoverStaleBroker(f), {code: 'SOCKET_OWNER_UNVERIFIED'});
  assert.equal(fs.readFileSync(f.socketPath, 'utf8'), 'user data');
});
test('recovery refuses an unregistered socket without owner metadata', async t => {
  const f = fixture(t), server = net.createServer(socket => socket.destroy());
  await new Promise(resolve => server.listen(f.socketPath, resolve));
  try {
    await assert.rejects(recoverStaleBroker(f), {code: 'BROKER_OWNER_METADATA_MISSING'});
    assert.ok(fs.existsSync(f.socketPath));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
