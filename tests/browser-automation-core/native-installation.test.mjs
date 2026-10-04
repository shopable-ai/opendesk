import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { Broker } from '../../lab/browser-automation-core/broker.mjs';
import { Client } from '../../lab/browser-automation-core/client.mjs';
import { STATE, SOURCE, ORIGIN, EXTENSION_ID } from '../../lab/browser-automation-core/config.mjs';
import { buildNativeHost, verifyNativeBuild } from '../../lab/browser-automation-core/native-build.mjs';
import { NativeDecoder, nativeFrame } from '../../lab/browser-automation-core/protocol.mjs';

function fixture(t) {
  fs.mkdirSync(STATE, {recursive: true, mode: 0o700});
  const directory = fs.mkdtempSync(path.join(STATE, 'ni-'));
  const nativeDirectory = path.join(directory, "installed host's files");
  const build = buildNativeHost(nativeDirectory);
  const install = {sourceDirectory: SOURCE, clientCredential: randomBytes(32).toString('hex'),
    hostCredential: randomBytes(32).toString('hex'), testMode: false, socketPath: path.join(directory, 'b.sock'),
    diagnosticPath: path.join(directory, 'native-status.json')};
  fs.writeFileSync(path.join(nativeDirectory, 'install.json'), JSON.stringify(install), {mode: 0o600});
  t.after(() => fs.rmSync(directory, {recursive: true})); // Only this owned fixture; no Chrome registration.
  return {directory, nativeDirectory, install, build};
}
test('installed snapshot launches its real wrapper from another cwd and speaks real Native framing', async t => {
  // Component proof only: the browser peer below is simulated. Native parent is Node, not Chrome.
  const f = fixture(t), broker = await new Broker(f.install, {stateDirectory: f.directory, socketPath: f.install.socketPath}).start();
  const cwd = path.join(f.directory, 'unrelated cwd'); fs.mkdirSync(cwd);
  const child = spawn(path.join(f.nativeDirectory, 'native-host'), [ORIGIN], {cwd, stdio: ['pipe', 'pipe', 'pipe']});
  const decoder = new NativeDecoder(); let welcome;
  child.stdin.on('error', () => {});
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await exited; } await broker.stop(); });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('INSTALLED_NATIVE_HANDSHAKE_TIMEOUT')), 3000);
    child.on('error', reject);
    child.stdout.on('data', bytes => {
      try {
        for (const message of decoder.push(bytes)) {
          if (message.kind === 'authenticated') child.stdin.write(nativeFrame({v: 1, kind: 'hello', extensionId: EXTENSION_ID,
            extensionVersion: '0.1.2', browserSession: randomUUID(), userAgent: 'INSTALLATION_COMPONENT_SIMULATED_NO_BROWSER'}));
          if (message.kind === 'welcome') { welcome = message; clearTimeout(deadline); resolve(); }
          if (message.kind === 'request') child.stdin.write(nativeFrame({v: 1, kind: 'response',
            brokerSession: welcome.brokerSession, connectionEpoch: welcome.connectionEpoch, browserSession: welcome.browserSession,
            requestId: message.requestId, result: {nonce: message.params.nonce}}));
        }
      } catch (error) { clearTimeout(deadline); reject(error); }
    });
  });
  const client = await new Client().connect(f.install.clientCredential, f.install.socketPath);
  try {
    const nonce = randomUUID(), response = await client.request('echo', {nonce}); assert.equal(response.result.nonce, nonce);
    const status = (await client.request('status')).result;
    assert.equal(status.browser.nativeHost.hostPid, child.pid);
    assert.equal(status.browser.nativeHost.parentPid, process.pid);
    assert.equal(status.browser.nativeHost.build.sourceDirectory, SOURCE);
    assert.deepEqual(status.browser.nativeHost.build.files, f.build.files);
    assert.equal(verifyNativeBuild(f.nativeDirectory).status, 'PASS');
    assert.ok(!fs.readFileSync(path.join(f.nativeDirectory, 'native-host'), 'utf8').includes(`${SOURCE}/native-host.mjs`));
  } finally { client.close(); }
});
test('installed loader rejects tampered Native source before any Broker authentication', async t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.nativeDirectory, 'native-host.mjs'), '\n// altered installation\n');
  assert.throws(() => verifyNativeBuild(f.nativeDirectory), {code: 'NATIVE_BUILD_CHANGED'});
  const child = spawn(path.join(f.nativeDirectory, 'native-host'), [ORIGIN]);
  let stdout = ''; child.stdout.on('data', bytes => { stdout += bytes; });
  assert.equal(await new Promise(resolve => child.once('exit', resolve)), 1);
  assert.equal(stdout, ''); assert.ok(!fs.existsSync(f.install.diagnosticPath));
});
test('installed Native Host rejects a different origin without touching authenticated IPC', async t => {
  const f = fixture(t), child = spawn(path.join(f.nativeDirectory, 'native-host'), ['chrome-extension://wrong/']);
  assert.equal(await new Promise(resolve => child.once('exit', resolve)), 2);
  const status = JSON.parse(fs.readFileSync(f.install.diagnosticPath));
  assert.ok(status.events.some(event => event.stage === 'ORIGIN_REJECTED'));
  assert.ok(!status.events.some(event => event.stage === 'BROKER_CONNECTING'));
  assert.ok(!JSON.stringify(status).includes(f.install.hostCredential));
});
test('staging and build metadata contain no installation credentials', t => {
  const f = fixture(t);
  for (const item of [...f.build.files, {name: 'native-build.json'}]) {
    const bytes = fs.readFileSync(path.join(f.nativeDirectory, item.name), 'utf8');
    assert.ok(!bytes.includes(f.install.hostCredential)); assert.ok(!bytes.includes(f.install.clientCredential));
  }
  assert.equal(fs.statSync(f.nativeDirectory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(f.nativeDirectory, 'install.json')).mode & 0o777, 0o600);
});
