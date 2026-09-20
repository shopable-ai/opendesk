import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {prepareLocalMarketplaceSite, releaseAttestationMessage, startLocalMarketplaceServer, verifyCanonicalPackage} from './tools/marketplace-local-server.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function startGenericStaticServer(siteRoot) {
  const server = createServer(async (request, response) => {
    const relative = request.url === '/' ? 'index.html' : request.url.replace(/^\/+/, '');
    if (!relative || relative.includes('..') || relative.includes('\\')) { response.writeHead(404); response.end(); return; }
    try {
      const body = await readFile(path.join(siteRoot, relative));
      response.writeHead(200, {'Content-Length': body.length});
      response.end(body);
    } catch (_) {
      response.writeHead(404); response.end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {server, baseURL: `http://127.0.0.1:${server.address().port}`};
}

test('local Marketplace prepares one same-site static page, signed release and real package', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-static-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const siteRoot = path.join(root, 'site');
  const configOutput = path.join(root, 'marketplace-development.json');
  const appDataRoot = path.join(root, 'app-data');
  const requestLog = path.join(root, 'http-requests.log');
  const running = await startLocalMarketplaceServer({host: '127.0.0.1', port: 0, siteRoot, configOutput, appDataRoot, requestLog});
  t.after(() => new Promise(resolve => running.server.close(resolve)));

  const page = await (await fetch(running.baseURL + '/index.html')).text();
  assert.match(page, /id="opendesk-marketplace-release"/);
  assert.match(page, /Notify Demo/);
  assert.doesNotMatch(page, /\/local-smoke\/status/);

  const bindingMatch = /<script type="application\/json" id="opendesk-marketplace-release">([^<]+)<\/script>/.exec(page);
  assert.ok(bindingMatch, 'prepared Marketplace page must contain the generated release binding');
  const binding = JSON.parse(bindingMatch[1]);

  const document = await (await fetch(running.releaseURL)).json();
  assert.equal(binding.flowId, document.release.flowId);
  assert.equal(binding.releaseId, document.release.releaseId);
  assert.equal(binding.catalogItem.name, document.release.flowName);
  assert.equal(binding.catalogItem.version, document.release.version);
  assert.equal(binding.catalogItem.publisherId, document.release.publisherId);
  assert.equal(binding.catalogItem.signingKeyId, document.release.publisherSigningKeyId);
  assert.equal(binding.catalogItem.minimumOpenDeskVersion, document.release.minimumOpenDeskVersion);
  const canonicalManifest = JSON.parse(await readFile(path.join(repoRoot, 'examples', 'flow-distribution', 'notify-demo', 'flow.json'), 'utf8'));
  assert.deepEqual(binding.catalogItem.platforms, canonicalManifest.platforms.map(value => value === 'darwin' ? 'macOS' : value === 'windows' ? 'Windows' : value));
  const deepLink = new URL(binding.deepLink);
  assert.equal(deepLink.protocol, 'opendesk:');
  assert.equal(deepLink.hostname, 'install');
  assert.equal(deepLink.pathname, '/flow/' + document.release.flowId);
  assert.equal(deepLink.searchParams.get('release'), document.release.releaseId);
  assert.equal(deepLink.searchParams.get('intent'), binding.intentId);

  assert.equal(document.schemaVersion, 1);
  assert.equal(document.release.schemaVersion, 2);
  assert.equal(document.release.flowId, 'com.example.opendesk.notify-demo');
  assert.equal(document.release.metadataRevision, 1);
  assert.equal(document.release.artifactLocation, 'flows/com.example.opendesk.notify-demo/local-notify-demo-1/notify-demo.odflow');
  assert.equal(document.attestation.schemaVersion, 2);

  const artifact = Buffer.from(await (await fetch(running.artifactURL)).arrayBuffer());
  assert.equal(sha256(artifact), document.release.artifactDigest);
  assert.equal(artifact.length, document.release.artifactSize);

  const requestEvents = (await readFile(requestLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(requestEvents.some(event => event.status === 200 && event.path === running.state.relativeReleaseURL));
  assert.ok(requestEvents.some(event => event.status === 200 && event.path === running.state.relativeArtifactURL && event.bytes === artifact.length));
  assert.equal(path.dirname(requestLog), root);

  for (const obsolete of ['/v1/install-intents/local-notify-demo-intent-1', '/v1/releases/local-notify-demo-1/artifact', '/local-smoke/status']) {
    assert.equal((await fetch(running.baseURL + obsolete)).status, 404, obsolete);
  }

  const config = JSON.parse(await readFile(configOutput, 'utf8'));
  assert.deepEqual({schemaVersion: config.schemaVersion, resolver: config.resolver, metadataBaseUrl: config.metadataBaseUrl, artifactBaseUrl: config.artifactBaseUrl}, {
    schemaVersion: 3, resolver: 'static', metadataBaseUrl: running.baseURL + '/', artifactBaseUrl: '',
  });
  assert.match(config.sessionId, /^[0-9a-f]{32}$/);
  assert.equal(config.expiresAt, document.attestation.expiresAt);
  assert.equal(config.appDataRoot, appDataRoot);

  assert.deepEqual((await readdir(siteRoot)).sort(), ['flows', 'index.html', 'local-deep-link-smoke.html']);
  assert.deepEqual((await readdir(path.join(siteRoot, 'flows', document.release.flowId, document.release.releaseId))).sort(),
    ['notify-demo.odflow', 'release.json']);

  const generic = await startGenericStaticServer(siteRoot);
  t.after(() => new Promise(resolve => generic.server.close(resolve)));
  const genericRelease = await (await fetch(generic.baseURL + running.state.relativeReleaseURL)).json();
  const genericArtifact = Buffer.from(await (await fetch(generic.baseURL + running.state.relativeArtifactURL)).arrayBuffer());
  assert.equal(genericRelease.release.artifactDigest, sha256(genericArtifact));
  assert.equal((await fetch(generic.baseURL + '/v1/install-intents/local-notify-demo-intent-1')).status, 404);
  assert.equal((await fetch(generic.baseURL + '/local-smoke/status')).status, 404);
});

test('local Marketplace static server refuses an intermediate symlink escape', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-static-symlink-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const siteRoot = path.join(root, 'site');
  const running = await startLocalMarketplaceServer({
    host: '127.0.0.1',
    port: 0,
    siteRoot,
    configOutput: path.join(root, 'marketplace-development.json'),
    appDataRoot: path.join(root, 'app-data'),
  });
  t.after(() => new Promise(resolve => running.server.close(resolve)));

  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.txt'), 'private');
  await symlink(outside, path.join(siteRoot, 'leak'), 'dir');

  const response = await fetch(running.baseURL + '/leak/secret.txt');
  assert.equal(response.status, 404);
});

test('local Marketplace private-output containment resolves symlinked parents', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-output-symlink-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const siteRoot = path.join(root, 'site');
  await mkdir(siteRoot);
  const alias = path.join(root, 'private-alias');
  await symlink(siteRoot, alias, 'dir');

  const appDataRoot = path.join(alias, 'app-data');
  await assert.rejects(() => startLocalMarketplaceServer({
    host: '127.0.0.1',
    port: 0,
    siteRoot,
    configOutput: path.join(root, 'marketplace-development.json'),
    appDataRoot,
  }), /app data must remain outside/);
  await assert.rejects(() => lstat(appDataRoot), error => error && error.code === 'ENOENT',
    'rejected private output must not be created inside the public site');
});

test('local publisher rejects generated flow.json drift before preparing a Release', async () => {
  const packageRoot = path.join(repoRoot, 'examples', 'flow-distribution', 'notify-demo');
  const artifact = await readFile(path.join(packageRoot, 'notify-demo.odflow'));
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'flow.json'), 'utf8'));
  assert.doesNotThrow(() => verifyCanonicalPackage(artifact, manifest));
  manifest.version = '9.9.9';
  assert.throws(() => verifyCanonicalPackage(artifact, manifest), /generated manifest digest/);
});

test('Node static publisher uses the exact Go Release v2 attestation bytes', () => {
  const release = {
    schemaVersion: 2, marketplaceId: 'market', flowId: 'flow.demo', flowName: 'Demo', releaseId: 'release-1',
    metadataRevision: 3, version: '1.2.3', publisherId: 'publisher', publisherSigningKeyId: 'publisher-key',
    publisherSigningKeyFingerprint: 'a'.repeat(64), artifactDigest: 'b'.repeat(64), artifactSize: 42,
    artifactLocation: 'flows/flow.demo/release-1/demo.odflow', minimumOpenDeskVersion: '2.0.1',
    publishedAt: '2026-09-20T00:00:00Z', releaseStatus: 'published', entitlementPolicy: 'free', updateChannel: 'stable',
    verifiedPublisher: false,
  };
  const attestation = {schemaVersion: 2, rootKeyId: 'root', usage: 'flow-marketplace-release', expiresAt: '2026-09-21T00:00:00Z'};
  const expected = 'OpenDeskMarketplaceReleaseAttestation/v2\0'
    + '{"schemaVersion":2,"rootKeyId":"root","usage":"flow-marketplace-release","marketplaceId":"market","flowId":"flow.demo","flowName":"Demo","releaseId":"release-1","metadataRevision":3,"version":"1.2.3","publisherId":"publisher","publisherSigningKeyId":"publisher-key","publisherSigningKeyFingerprint":"'
    + 'a'.repeat(64) + '","artifactDigest":"' + 'b'.repeat(64)
    + '","artifactSize":42,"artifactLocation":"flows/flow.demo/release-1/demo.odflow","minimumOpenDeskVersion":"2.0.1","publishedAt":"2026-09-20T00:00:00Z","releaseStatus":"published","entitlementPolicy":"free","updateChannel":"stable","expiresAt":"2026-09-21T00:00:00Z"}';
  assert.deepEqual(releaseAttestationMessage(release, attestation), Buffer.from(expected));
});


test('local Marketplace preparation refuses symlinked or pre-populated public roots', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-root-'));
  t.after(() => rm(root, {recursive: true, force: true}));

  const privateRoot = path.join(root, 'private');
  await mkdir(privateRoot);
  await writeFile(path.join(privateRoot, 'secret.txt'), 'not public');
  const linkedSite = path.join(root, 'linked-site');
  await symlink(privateRoot, linkedSite, 'dir');
  await assert.rejects(() => prepareLocalMarketplaceSite(linkedSite), /real directory/);

  const populatedSite = path.join(root, 'populated-site');
  await mkdir(populatedSite);
  await writeFile(path.join(populatedSite, 'unexpected.txt'), 'stale');
  await assert.rejects(() => prepareLocalMarketplaceSite(populatedSite), /must be empty/);
});


test('local Marketplace server refuses every private development output inside the public site', async t => {
  const cases = [
    {
      name: 'config',
      mutate: ({siteRoot, configOutput, appDataRoot}) => ({siteRoot, configOutput: path.join(siteRoot, 'marketplace-development.json'), appDataRoot}),
      error: /config must remain outside/,
    },
    {
      name: 'app data',
      mutate: ({siteRoot, configOutput}) => ({siteRoot, configOutput, appDataRoot: path.join(siteRoot, 'app-data')}),
      error: /app data must remain outside/,
    },
    {
      name: 'receiver log',
      mutate: base => ({...base, opendeskLog: path.join(base.siteRoot, 'receiver.log')}),
      error: /receiver log must remain outside/,
    },
    {
      name: 'request log',
      mutate: base => ({...base, requestLog: path.join(base.siteRoot, 'http-requests.log')}),
      error: /request log must remain outside/,
    },
  ];

  for (const item of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), `opendesk-marketplace-private-${item.name.replace(/\s+/g, '-')}-`));
    t.after(() => rm(root, {recursive: true, force: true}));
    const base = {
      host: '127.0.0.1',
      port: 0,
      siteRoot: path.join(root, 'site'),
      configOutput: path.join(root, 'marketplace-development.json'),
      appDataRoot: path.join(root, 'app-data'),
    };
    await assert.rejects(() => startLocalMarketplaceServer(item.mutate(base)), item.error, item.name);
  }
});
