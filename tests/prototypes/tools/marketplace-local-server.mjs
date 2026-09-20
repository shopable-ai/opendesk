#!/usr/bin/env node
import {createHash, generateKeyPairSync, randomUUID, sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {appendFile, lstat, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../../..');
const WEB_ROOT = path.join(ROOT, 'apps/opendesk/prototypes/marketplace');
const PACKAGE_ROOT = path.join(ROOT, 'examples/flow-distribution/notify-demo');
const PACKAGE = path.join(PACKAGE_ROOT, 'notify-demo.odflow');
const MANIFEST = path.join(PACKAGE_ROOT, 'flow.json');
const ROOT_KEY_ID = 'local-static-root';
const MARKETPLACE_ID = 'opendesk-local-static';
const RELEASE_ID = 'local-notify-demo-1';
const INTENT_ID = 'local-notify-demo-intent-1';
const BINDING_MARKER = '<!-- OPENDESK_LOCAL_RELEASE_BINDING -->';

function parseArgs(argv) {
  const result = {host: '127.0.0.1', port: 0, siteRoot: '', configOutput: '', appDataRoot: '', opendeskLog: '', requestLog: ''};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value || !['--host', '--port', '--site-root', '--config-output', '--app-data-root', '--opendesk-log', '--request-log'].includes(key)) {
      throw new Error('usage: marketplace-local-server.mjs --host 127.0.0.1 --port 0 --site-root <absolute-dir> --config-output <new-file> --app-data-root <absolute-dir> [--opendesk-log <absolute-file>] [--request-log <absolute-file>]');
    }
    if (key === '--host') result.host = value;
    if (key === '--port') result.port = Number(value);
    if (key === '--site-root') result.siteRoot = value;
    if (key === '--config-output') result.configOutput = value;
    if (key === '--app-data-root') result.appDataRoot = value;
    if (key === '--opendesk-log') result.opendeskLog = value;
    if (key === '--request-log') result.requestLog = value;
  }
  if (!['127.0.0.1', '::1'].includes(result.host) || !Number.isInteger(result.port) || result.port < 0 || result.port > 65535) {
    throw new Error('the local Marketplace static server accepts only a loopback host and a valid port');
  }
  for (const [name, value] of [['site-root', result.siteRoot], ['config-output', result.configOutput], ['app-data-root', result.appDataRoot]]) {
    if (!value || !path.isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  }
  if (result.opendeskLog && !path.isAbsolute(result.opendeskLog)) throw new Error('--opendesk-log must be an absolute path');
  if (result.requestLog && !path.isAbsolute(result.requestLog)) throw new Error('--request-log must be an absolute path');
  return result;
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function canonicalUTC(date) {
  return date.toISOString().replace('.000Z', 'Z');
}

function platformLabel(value) {
  if (value === 'darwin') return 'macOS';
  if (value === 'windows') return 'Windows';
  return value;
}

export function verifyCanonicalPackage(artifact, manifest) {
  const readme = readFileSync(path.join(PACKAGE_ROOT, 'README.md'), 'utf8');
  const documented = /archive SHA-256:\s*`([0-9a-f]{64})`/.exec(readme)?.[1];
  const documentedManifest = /manifest SHA-256:\s*`([0-9a-f]{64})`/.exec(readme)?.[1];
  const digest = sha256(artifact);
  if (!documented || documented !== digest) {
    throw new Error('Notify Demo checked-in package does not match its documented archive digest; rebuild and re-verify the canonical example before publishing it');
  }
  const manifestDigest = sha256(Buffer.from(JSON.stringify(manifest)));
  if (!documentedManifest || documentedManifest !== manifestDigest) {
    throw new Error('Notify Demo flow.json does not match its documented generated manifest digest; rebuild and re-verify the canonical example before publishing it');
  }
  // flow.json also lists package-generated entries such as trust/publisher.pub.
  // Only author-maintained source files are expected beside the checked-in package;
  // the canonical .odflow verifier owns generated inventory/signature validation.
  for (const relative of ['main.js', 'clawdesk.runtime.json']) {
    const declared = manifest.files?.find(file => file.path === relative);
    const source = readFileSync(path.join(PACKAGE_ROOT, relative));
    if (!declared || declared.sha256 !== sha256(source) || declared.size !== source.length) {
      throw new Error(`Notify Demo source ${relative} does not match flow.json; rebuild the canonical .odflow before publishing it`);
    }
  }
  return digest;
}

export function releaseAttestationMessage(release, attestation) {
  const claims = {
    schemaVersion: attestation.schemaVersion,
    rootKeyId: attestation.rootKeyId,
    usage: attestation.usage,
    marketplaceId: release.marketplaceId,
    flowId: release.flowId,
    flowName: release.flowName,
    releaseId: release.releaseId,
    metadataRevision: release.metadataRevision,
    version: release.version,
    publisherId: release.publisherId,
    publisherSigningKeyId: release.publisherSigningKeyId,
    publisherSigningKeyFingerprint: release.publisherSigningKeyFingerprint,
    artifactDigest: release.artifactDigest,
    artifactSize: release.artifactSize,
    artifactLocation: release.artifactLocation,
    minimumOpenDeskVersion: release.minimumOpenDeskVersion,
    publishedAt: release.publishedAt,
    releaseStatus: release.releaseStatus,
    entitlementPolicy: release.entitlementPolicy,
    ...(release.updateChannel ? {updateChannel: release.updateChannel} : {}),
    ...(release.verifiedPublisher ? {verifiedPublisher: true} : {}),
    expiresAt: attestation.expiresAt,
  };
  return Buffer.concat([
    Buffer.from('OpenDeskMarketplaceReleaseAttestation/v2\0'),
    Buffer.from(JSON.stringify(claims)),
  ]);
}

function fixture() {
  const artifact = readFileSync(PACKAGE);
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const artifactDigest = verifyCanonicalPackage(artifact, manifest);
  const sessionId = randomUUID().replace(/-/g, '');
  const publishedAt = canonicalUTC(new Date(Math.floor(Date.now() / 1000) * 1000));
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  expiresAt.setMilliseconds(0);
  const artifactLocation = `flows/${manifest.flowId}/${RELEASE_ID}/notify-demo.odflow`;
  const release = {
    schemaVersion: 2,
    marketplaceId: MARKETPLACE_ID,
    flowId: manifest.flowId,
    flowName: manifest.name,
    releaseId: RELEASE_ID,
    metadataRevision: 1,
    version: manifest.version,
    publisherId: manifest.publisherId,
    publisherSigningKeyId: manifest.publisherKeyId,
    publisherSigningKeyFingerprint: manifest.publisherFingerprint,
    artifactDigest,
    artifactSize: artifact.length,
    artifactLocation,
    minimumOpenDeskVersion: manifest.minimumRuntimeVersion,
    publishedAt,
    releaseStatus: 'published',
    entitlementPolicy: 'free',
    updateChannel: 'local-static',
    verifiedPublisher: false,
  };
  const {publicKey, privateKey} = generateKeyPairSync('ed25519');
  const attestation = {
    schemaVersion: 2,
    rootKeyId: ROOT_KEY_ID,
    usage: 'flow-marketplace-release',
    expiresAt: canonicalUTC(expiresAt),
  };
  attestation.signature = sign(null, releaseAttestationMessage(release, attestation), privateKey).toString('hex');
  const spki = publicKey.export({type: 'spki', format: 'der'});
  const rootPublicKey = spki.subarray(spki.length - 32).toString('hex');
  const deepLink = `opendesk://install/flow/${manifest.flowId}?release=${RELEASE_ID}&intent=${INTENT_ID}`;
  const relativeReleaseURL = `/flows/${manifest.flowId}/${RELEASE_ID}/release.json`;
  const relativeArtifactURL = '/' + artifactLocation;
  const sizeKB = Math.max(1, Math.ceil(artifact.length / 1024));
  const catalogItem = {
    id: 'notify-demo',
    name: manifest.name,
    category: '桌面工具',
    icon: 'bell',
    tone: 'orange',
    publisherId: manifest.publisherId,
    signingKeyId: manifest.publisherKeyId,
    publisher: manifest.publisherId,
    verified: false,
    version: manifest.version,
    release: RELEASE_ID,
    date: publishedAt.slice(0, 10),
    platforms: (manifest.platforms || []).map(platformLabel),
    policy: 'free',
    price: '免费',
    desc: '真实本地开发 Flow：安装只注册到 Flow Runner；只有用户明确点击运行后才显示 Toast 并写入固定日志。',
    permissions: ['运行时显示 OpenDesk Toast；安装阶段不执行业务 JavaScript'],
    steps: ['安装并验证真实 .odflow', '确认安装完成但尚未运行', '在真实 Flow Runner 中明确点击运行'],
    inputs: '无',
    output: '显式运行后显示 Toast，并写入 Notify Demo 固定 console 日志',
    size: `${sizeKB} KB`,
  };
  return {artifact, manifest, release, attestation, sessionId, rootPublicKey, deepLink, relativeReleaseURL, relativeArtifactURL, catalogItem};
}

function renderBinding(state) {
  const binding = {
    schemaVersion: 1,
    catalogId: state.catalogItem.id,
    flowId: state.release.flowId,
    releaseId: state.release.releaseId,
    intentId: INTENT_ID,
    deepLink: state.deepLink,
    releaseUrl: state.relativeReleaseURL,
    artifactUrl: state.relativeArtifactURL,
    catalogItem: state.catalogItem,
  };
  return '<script type="application/json" id="opendesk-marketplace-release">'
    + JSON.stringify(binding).replace(/</g, '\\u003c')
    + '</script>';
}

function prepareHTML(source, state) {
  const occurrences = source.split(BINDING_MARKER).length - 1;
  if (occurrences !== 1) throw new Error('Marketplace HTML must contain exactly one local release binding marker');
  return source.replace(BINDING_MARKER, renderBinding(state));
}

async function ensureEmptyRealDirectory(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Marketplace site root must be a real directory');
    }
    const entries = await readdir(directory);
    if (entries.length !== 0) {
      throw new Error('Marketplace site root must be empty before preparation');
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
    await mkdir(directory, {recursive: true, mode: 0o700});
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Marketplace site root must be a real directory');
    }
  }
}

export async function prepareLocalMarketplaceSite(siteRoot, state = fixture()) {
  const resolvedRoot = path.resolve(siteRoot);
  await ensureEmptyRealDirectory(resolvedRoot);
  const releaseDir = path.join(resolvedRoot, 'flows', state.release.flowId, state.release.releaseId);
  await mkdir(releaseDir, {recursive: true, mode: 0o700});
  const mainSource = await readFile(path.join(WEB_ROOT, 'index.html'), 'utf8');
  const smokeSource = await readFile(path.join(WEB_ROOT, 'local-deep-link-smoke.html'), 'utf8');
  await writeFile(path.join(resolvedRoot, 'index.html'), prepareHTML(mainSource, state), {mode: 0o600});
  await writeFile(path.join(resolvedRoot, 'local-deep-link-smoke.html'), prepareHTML(smokeSource, state), {mode: 0o600});
  await writeFile(path.join(releaseDir, 'release.json'), JSON.stringify({schemaVersion: 1, release: state.release, attestation: state.attestation}, null, 2) + '\n', {mode: 0o600});
  await writeFile(path.join(releaseDir, 'notify-demo.odflow'), state.artifact, {mode: 0o600});
  const copied = await readFile(path.join(releaseDir, 'notify-demo.odflow'));
  if (sha256(copied) !== state.release.artifactDigest || copied.length !== state.release.artifactSize) {
    throw new Error('prepared Notify Demo artifact does not match the signed Release');
  }
  return {siteRoot: resolvedRoot, releaseDir, state};
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.odflow')) return 'application/vnd.opendesk.flow';
  return 'application/octet-stream';
}

async function staticFile(siteRoot, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); } catch (_) { return undefined; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (!relative || relative.includes('\0') || relative.includes('\\') || relative.split('/').some(part => part === '..')) return undefined;
  const root = path.resolve(siteRoot);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(root + path.sep)) return undefined;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) return undefined;
    return {file, body: await readFile(file)};
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function isInsideDirectory(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function recordStaticRequest(logPath, event) {
  if (!logPath) return;
  await mkdir(path.dirname(logPath), {recursive: true, mode: 0o700});
  await appendFile(logPath, JSON.stringify(event) + '\n', {encoding: 'utf8', mode: 0o600});
}

export async function startLocalMarketplaceServer(options) {
  const prepared = await prepareLocalMarketplaceSite(options.siteRoot);
  await ensureEmptyRealDirectory(options.appDataRoot);
  if (isInsideDirectory(prepared.siteRoot, options.configOutput)) throw new Error('Marketplace development config must remain outside the public site root');
  if (isInsideDirectory(prepared.siteRoot, options.appDataRoot)) throw new Error('Marketplace app data must remain outside the public site root');
  if (options.opendeskLog && isInsideDirectory(prepared.siteRoot, options.opendeskLog)) throw new Error('OpenDesk receiver log must remain outside the public site root');
  if (options.requestLog && isInsideDirectory(prepared.siteRoot, options.requestLog)) throw new Error('Marketplace request log must remain outside the public site root');
  const server = http.createServer(async (request, response) => {
    try {
      const requestURL = new URL(request.url, `http://${options.host}`);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        await recordStaticRequest(options.requestLog, {at: new Date().toISOString(), method: request.method, path: requestURL.pathname, status: 405, bytes: 0});
        response.writeHead(405); response.end(); return;
      }
      const found = await staticFile(prepared.siteRoot, requestURL.pathname);
      if (!found) {
        await recordStaticRequest(options.requestLog, {at: new Date().toISOString(), method: request.method, path: requestURL.pathname, status: 404, bytes: 0});
        response.writeHead(404); response.end('not found'); return;
      }
      await recordStaticRequest(options.requestLog, {at: new Date().toISOString(), method: request.method, path: requestURL.pathname, status: 200, bytes: found.body.length});
      response.writeHead(200, {'Content-Type': contentType(found.file), 'Content-Length': found.body.length, 'Cache-Control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : found.body);
    } catch (error) {
      response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
      response.end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  const address = server.address();
  const host = options.host.includes(':') ? `[${options.host}]` : options.host;
  const baseURL = `http://${host}:${address.port}`;
  const config = {
    schemaVersion: 3,
    sessionId: prepared.state.sessionId,
    expiresAt: prepared.state.attestation.expiresAt,
    appDataRoot: path.resolve(options.appDataRoot),
    resolver: 'static',
    metadataBaseUrl: baseURL + '/',
    artifactBaseUrl: '',
    rootKeyId: ROOT_KEY_ID,
    rootPublicKey: prepared.state.rootPublicKey,
  };
  if (options.opendeskLog) config.logFile = options.opendeskLog;
  await mkdir(path.dirname(options.configOutput), {recursive: true, mode: 0o700});
  await writeFile(options.configOutput, JSON.stringify(config, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {
    server,
    baseURL,
    siteRoot: prepared.siteRoot,
    state: prepared.state,
    releaseURL: baseURL + prepared.state.relativeReleaseURL,
    artifactURL: baseURL + prepared.state.relativeArtifactURL,
    deepLink: prepared.state.deepLink,
  };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const running = await startLocalMarketplaceServer(options);
  process.stdout.write(JSON.stringify({
    ready: true,
    baseURL: running.baseURL,
    siteRoot: running.siteRoot,
    config: options.configOutput,
    opendeskLog: options.opendeskLog || undefined,
    requestLog: options.requestLog || undefined,
    releaseURL: running.releaseURL,
    artifactURL: running.artifactURL,
    flowId: running.state.release.flowId,
    releaseId: running.state.release.releaseId,
    sessionId: running.state.sessionId,
    expiresAt: running.state.attestation.expiresAt,
    deepLink: running.deepLink,
  }) + '\n');
  const stop = () => running.server.close(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
