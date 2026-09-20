import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {prepareLocalMarketplaceSite, releaseAttestationMessage, startLocalMarketplaceServer} from './tools/marketplace-local-server.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');

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
  const requestLog = path.join(root, 'http-requests.log');
  const running = await startLocalMarketplaceServer({host: '127.0.0.1', port: 0, siteRoot, configOutput, requestLog});
  t.after(() => new Promise(resolve => running.server.close(resolve)));

  const page = await (await fetch(running.baseURL + '/index.html')).text();
  assert.match(page, /id="opendesk-marketplace-release"/);
  assert.match(page, /Notify Demo/);
  assert.doesNotMatch(page, /\/local-smoke\/status/);

  const document = await (await fetch(running.releaseURL)).json();
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

  assert.deepEqual((await readdir(siteRoot)).sort(), ['flows', 'index.html', 'local-deep-link-smoke.html']);

  const generic = await startGenericStaticServer(siteRoot);
  t.after(() => new Promise(resolve => generic.server.close(resolve)));
  const genericRelease = await (await fetch(generic.baseURL + running.state.relativeReleaseURL)).json();
  const genericArtifact = Buffer.from(await (await fetch(generic.baseURL + running.state.relativeArtifactURL)).arrayBuffer());
  assert.equal(genericRelease.release.artifactDigest, sha256(genericArtifact));
  assert.equal((await fetch(generic.baseURL + '/v1/install-intents/local-notify-demo-intent-1')).status, 404);
  assert.equal((await fetch(generic.baseURL + '/local-smoke/status')).status, 404);
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


test('local Marketplace server refuses private config and request logs inside public site', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opendesk-marketplace-private-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const siteRoot = path.join(root, 'site');
  await assert.rejects(
    () => startLocalMarketplaceServer({
      host: '127.0.0.1', port: 0, siteRoot,
      configOutput: path.join(siteRoot, 'marketplace-development.json'),
    }),
    /config must remain outside/,
  );
});
