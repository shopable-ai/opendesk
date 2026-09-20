import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {startLocalMarketplaceServer} from './tools/marketplace-local-server.mjs';

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
  const running = await startLocalMarketplaceServer({host: '127.0.0.1', port: 0, siteRoot, configOutput});
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

  for (const obsolete of ['/v1/install-intents/local-notify-demo-intent-1', '/v1/releases/local-notify-demo-1/artifact', '/local-smoke/status']) {
    assert.equal((await fetch(running.baseURL + obsolete)).status, 404, obsolete);
  }

  const config = JSON.parse(await readFile(configOutput, 'utf8'));
  assert.deepEqual({schemaVersion: config.schemaVersion, resolver: config.resolver, metadataBaseUrl: config.metadataBaseUrl, artifactBaseUrl: config.artifactBaseUrl}, {
    schemaVersion: 2, resolver: 'static', metadataBaseUrl: running.baseURL + '/', artifactBaseUrl: '',
  });
  assert.deepEqual((await readdir(siteRoot)).sort(), ['flows', 'index.html', 'local-deep-link-smoke.html']);

  const generic = await startGenericStaticServer(siteRoot);
  t.after(() => new Promise(resolve => generic.server.close(resolve)));
  const genericRelease = await (await fetch(generic.baseURL + running.state.relativeReleaseURL)).json();
  const genericArtifact = Buffer.from(await (await fetch(generic.baseURL + running.state.relativeArtifactURL)).arrayBuffer());
  assert.equal(genericRelease.release.artifactDigest, sha256(genericArtifact));
  assert.equal((await fetch(generic.baseURL + '/v1/install-intents/local-notify-demo-intent-1')).status, 404);
  assert.equal((await fetch(generic.baseURL + '/local-smoke/status')).status, 404);
});
