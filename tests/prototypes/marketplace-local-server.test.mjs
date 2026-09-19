import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {startLocalMarketplaceServer} from './tools/marketplace-local-server.mjs';

test('local Marketplace server exposes a signed intent, the canonical package, and real Catalog status', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-server-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const appData = path.join(root, 'app-data');
  const configOutput = path.join(root, 'marketplace-development.json');
  const running = await startLocalMarketplaceServer({host: '127.0.0.1', port: 0, appData, configOutput});
  t.after(() => new Promise(resolve => running.server.close(resolve)));

  const intent = await (await fetch(running.baseURL + '/v1/install-intents/local-notify-demo-intent-1')).json();
  assert.equal(intent.flowId, 'com.example.opendesk.notify-demo');
  assert.equal(intent.release.origin, undefined);
  assert.equal(intent.release.artifactDigest, running.state.release.artifactDigest);
  assert.equal(intent.attestation.rootKeyId, 'local-smoke-root');

  const artifact = Buffer.from(await (await fetch(running.baseURL + '/v1/releases/local-notify-demo-1/artifact')).arrayBuffer());
  assert.deepEqual(artifact, running.state.artifact);
  assert.deepEqual(await (await fetch(running.baseURL + '/local-smoke/status')).json(), {state: 'pending', message: '等待 OpenDesk 完成确认和安装。'});

  await mkdir(path.join(appData, 'flow-state', 'records'), {recursive: true});
  await mkdir(path.join(appData, 'flows', running.state.installId), {recursive: true});
  const record = {installId: running.state.installId, flowId: running.state.release.flowId, archiveDigest: running.state.release.artifactDigest, state: 'ready', origin: 'marketplace', marketplaceId: 'opendesk-local-smoke', releaseId: 'local-notify-demo-1'};
  const {writeFile} = await import('node:fs/promises');
  await writeFile(path.join(appData, 'flow-state', 'records', running.state.installId + '.json'), JSON.stringify(record));
  const status = await (await fetch(running.baseURL + '/local-smoke/status')).json();
  assert.equal(status.state, 'installed');
  assert.equal(status.record.installId, running.state.installId);
});

test('local Marketplace status exposes only bounded receiver diagnostics from this run log', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-server-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const appData = path.join(root, 'app-data');
  const configOutput = path.join(root, 'marketplace-development.json');
  const opendeskLog = path.join(root, 'opendesk.log');
  const running = await startLocalMarketplaceServer({host: '127.0.0.1', port: 0, appData, configOutput, opendeskLog});
  t.after(() => new Promise(resolve => running.server.close(resolve)));

  await writeFile(opendeskLog, '[MARKETPLACE_INSTALL] loopback development client enabled\n[MARKETPLACE_INSTALL] received flowId=com.example.opendesk.notify-demo releaseId=local-notify-demo-1 installIntentId=local-notify-demo-intent-1\n');
  const received = await (await fetch(running.baseURL + '/local-smoke/status')).json();
  assert.deepEqual(received.receiver, {state: 'received', message: 'OpenDesk 已收到本地 intent；请依次确认 Release 与 Flow 信任窗口。'});

  await writeFile(opendeskLog, '[MARKETPLACE_INSTALL] blocked flowId=com.example.opendesk.notify-demo releaseId=local-notify-demo-1 installIntentId=local-notify-demo-intent-1 error=verification failed\n', {flag: 'a'});
  const failed = await (await fetch(running.baseURL + '/local-smoke/status')).json();
  assert.deepEqual(failed.receiver, {state: 'failed', message: 'OpenDesk 已收到请求，但验证或安装被拒绝；请查看本次 opendesk.log。'});
  assert.doesNotMatch(JSON.stringify(failed), /verification failed/);
});
