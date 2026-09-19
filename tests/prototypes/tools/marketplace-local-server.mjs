#!/usr/bin/env node
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {open, readFile, stat} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../../..');
const WEB_ROOT = path.join(ROOT, 'apps/opendesk/prototypes/marketplace');
const PACKAGE = path.join(ROOT, 'examples/flow-distribution/notify-demo/notify-demo.odflow');
const MANIFEST = path.join(ROOT, 'examples/flow-distribution/notify-demo/flow.json');
const ROOT_KEY_ID = 'local-smoke-root';
const MARKETPLACE_ID = 'opendesk-local-smoke';
const RELEASE_ID = 'local-notify-demo-1';
const INTENT_ID = 'local-notify-demo-intent-1';

function parseArgs(argv) {
  const result = {host: '127.0.0.1', port: 51807, appData: '', configOutput: '', opendeskLog: ''};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || !['--host', '--port', '--app-data', '--config-output', '--opendesk-log'].includes(key)) {
      throw new Error('usage: marketplace-local-server.mjs --host 127.0.0.1 --port 51807 --app-data <absolute-dir> --config-output <new-file> [--opendesk-log <absolute-file>]');
    }
    if (key === '--host') result.host = value;
    if (key === '--port') result.port = Number(value);
    if (key === '--app-data') result.appData = value;
    if (key === '--config-output') result.configOutput = value;
    if (key === '--opendesk-log') result.opendeskLog = value;
  }
  if (!['127.0.0.1', '::1'].includes(result.host) || !Number.isInteger(result.port) || result.port < 0 || result.port > 65535) {
    throw new Error('the local Marketplace server accepts only a loopback host and a valid port');
  }
  for (const [name, value] of [['app-data', result.appData], ['config-output', result.configOutput]]) {
    if (!value || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  }
  if (result.opendeskLog && !path.isAbsolute(result.opendeskLog)) throw new Error('--opendesk-log must be an absolute path');
  return result;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function installID(fingerprint, flowID) {
  return 'flow-' + createHash('sha256')
    .update('OpenDeskFlowInstallID/v1\0' + fingerprint + '\0' + flowID)
    .digest('hex').slice(0, 32);
}

function fixture() {
  const artifact = readFileSync(PACKAGE);
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const publishedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  expiresAt.setMilliseconds(0);
  const release = {
    schemaVersion: 1,
    marketplaceId: MARKETPLACE_ID,
    flowId: manifest.flowId,
    flowName: manifest.name,
    releaseId: RELEASE_ID,
    version: manifest.version,
    publisherId: manifest.publisherId,
    publisherSigningKeyId: manifest.publisherKeyId,
    publisherSigningKeyFingerprint: manifest.publisherFingerprint,
    artifactDigest: sha256(artifact),
    artifactSize: artifact.length,
    minimumOpenDeskVersion: manifest.minimumRuntimeVersion,
    publishedAt,
    releaseStatus: 'published',
    entitlementPolicy: 'free',
    updateChannel: 'local-smoke',
    verifiedPublisher: false,
  };
  const {publicKey, privateKey} = generateKeyPairSync('ed25519');
  const attestation = {
    schemaVersion: 1,
    rootKeyId: ROOT_KEY_ID,
    usage: 'flow-marketplace-release',
    expiresAt: expiresAt.toISOString().replace('.000Z', 'Z'),
  };
  const claims = {
    schemaVersion: attestation.schemaVersion,
    rootKeyId: attestation.rootKeyId,
    usage: attestation.usage,
    marketplaceId: release.marketplaceId,
    flowId: release.flowId,
    releaseId: release.releaseId,
    version: release.version,
    publisherId: release.publisherId,
    publisherSigningKeyId: release.publisherSigningKeyId,
    publisherSigningKeyFingerprint: release.publisherSigningKeyFingerprint,
    artifactDigest: release.artifactDigest,
    artifactSize: release.artifactSize,
    minimumOpenDeskVersion: release.minimumOpenDeskVersion,
    publishedAt: release.publishedAt,
    releaseStatus: release.releaseStatus,
    entitlementPolicy: release.entitlementPolicy,
    updateChannel: release.updateChannel,
    expiresAt: attestation.expiresAt,
  };
  const message = Buffer.concat([
    Buffer.from('OpenDeskMarketplaceReleaseAttestation/v1\0'),
    Buffer.from(JSON.stringify(claims)),
  ]);
  attestation.signature = sign(null, message, privateKey).toString('hex');
  const spki = publicKey.export({type: 'spki', format: 'der'});
  const rootPublicKey = spki.subarray(spki.length - 32).toString('hex');
  return {artifact, manifest, release, attestation, rootPublicKey, installId: installID(manifest.publisherFingerprint, manifest.flowId)};
}

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

async function readLogTail(logPath) {
  if (!logPath) return '';
  try {
    const info = await stat(logPath);
    if (!info.isFile()) return '';
    const length = Math.min(info.size, 64 * 1024);
    const handle = await open(logPath, 'r');
    try {
      const data = Buffer.alloc(length);
      await handle.read(data, 0, length, Math.max(0, info.size - length));
      return data.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    return '';
  }
}

async function receiverStatus(logPath) {
  if (!logPath) return undefined;
  const log = await readLogTail(logPath);
  if (!log) return {state: 'starting', message: '等待本次 OpenDesk 接收端写入启动日志。'};
  const events = [
    ['[MARKETPLACE_INSTALL] installed', 'installed', 'OpenDesk 已完成安装，正在等待 Catalog 复核。'],
    ['[MARKETPLACE_INSTALL] blocked', 'failed', 'OpenDesk 已收到请求，但验证或安装被拒绝；请查看本次 opendesk.log。'],
    ['[MARKETPLACE_INSTALL] received', 'received', 'OpenDesk 已收到本地 intent；请依次确认 Release 与 Flow 信任窗口。'],
    ['[MARKETPLACE_INSTALL] loopback development client enabled', 'ready', 'OpenDesk 开发接收端已启用，等待浏览器交接。'],
  ];
  let latest;
  for (const [marker, state, message] of events) {
    const index = log.lastIndexOf(marker);
    if (index >= 0 && (!latest || index > latest.index)) latest = {index, state, message};
  }
  return latest ? {state: latest.state, message: latest.message} : {state: 'starting', message: 'OpenDesk 尚未报告本地接收端就绪。'};
}

async function installedStatus(state, appData, opendeskLog) {
  const receiver = await receiverStatus(opendeskLog);
  const withReceiver = value => receiver ? {...value, receiver} : value;
  const recordPath = path.join(appData, 'flow-state', 'records', state.installId + '.json');
  const flowRoot = path.join(appData, 'flows', state.installId);
  try {
    const [recordData, flowInfo] = await Promise.all([readFile(recordPath, 'utf8'), stat(flowRoot)]);
    const record = JSON.parse(recordData);
    const verified = flowInfo.isDirectory()
      && record.installId === state.installId
      && record.flowId === state.release.flowId
      && record.archiveDigest === state.release.artifactDigest
      && record.state === 'ready'
      && record.origin === 'marketplace'
      && record.marketplaceId === MARKETPLACE_ID
      && record.releaseId === RELEASE_ID;
    if (!verified) return withReceiver({state: 'invalid', message: 'Catalog 记录与本地测试 Release 不一致。'});
    return withReceiver({state: 'installed', message: '安装成功，尚未运行。', record});
  } catch (error) {
    if (error && error.code === 'ENOENT') return withReceiver({state: 'pending', message: '等待 OpenDesk 完成确认和安装。'});
    return withReceiver({state: 'error', message: '读取隔离 Catalog 失败。'});
  }
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

async function serveStatic(requestPath, response) {
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  if (!['index.html', 'local-deep-link-smoke.html', 'README.md', 'ORACLE.md'].includes(relative)) {
    response.writeHead(404); response.end('not found'); return;
  }
  const file = path.join(WEB_ROOT, relative);
  const body = await readFile(file);
  response.writeHead(200, {'Content-Type': contentType(file), 'Content-Length': body.length, 'Cache-Control': 'no-store'});
  response.end(body);
}

export async function startLocalMarketplaceServer(options) {
  const state = fixture();
  mkdirSync(path.dirname(options.configOutput), {recursive: true, mode: 0o700});
  const server = http.createServer(async (request, response) => {
    try {
      const requestURL = new URL(request.url, `http://${options.host}`);
      if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
      if (requestURL.pathname === `/v1/install-intents/${INTENT_ID}`) {
        json(response, 200, {schemaVersion: 1, installIntentId: INTENT_ID, flowId: state.release.flowId, releaseId: RELEASE_ID, release: state.release, attestation: state.attestation});
        return;
      }
      if (requestURL.pathname === `/v1/releases/${RELEASE_ID}/artifact`) {
        response.writeHead(200, {'Content-Type': 'application/vnd.opendesk.flow', 'Content-Length': state.artifact.length, 'Cache-Control': 'no-store'});
        response.end(state.artifact); return;
      }
      if (requestURL.pathname === '/local-smoke/status') {
        json(response, 200, await installedStatus(state, options.appData, options.opendeskLog)); return;
      }
      await serveStatic(requestURL.pathname, response);
    } catch (error) {
      json(response, 500, {state: 'error', message: String(error)});
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  const address = server.address();
  const baseURL = `http://${options.host.includes(':') ? `[${options.host}]` : options.host}:${address.port}`;
  const config = {schemaVersion: 1, baseUrl: baseURL, rootKeyId: ROOT_KEY_ID, rootPublicKey: state.rootPublicKey};
  if (options.opendeskLog) config.logFile = options.opendeskLog;
  writeFileSync(options.configOutput, JSON.stringify(config, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {server, baseURL, state};
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const running = await startLocalMarketplaceServer(options);
  process.stdout.write(JSON.stringify({ready: true, baseURL: running.baseURL, config: options.configOutput, appData: options.appData, opendeskLog: options.opendeskLog || undefined, installId: running.state.installId, deepLink: `opendesk://install/flow/${running.state.release.flowId}?release=${RELEASE_ID}&intent=${INTENT_ID}`}) + '\n');
  const stop = () => running.server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
