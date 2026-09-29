'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runHeadroomPrecheck, cleanEnvironment, interpreterMetadata, DISABLED } = require('./tools/isolated-producer-headroom-precheck.cjs');
const { sha256 } = require('./tools/isolated-producer.cjs');

const python = '/Users/mac/.local/share/headroom-ai-venv/bin/python';

test('clean proxy environment excludes ambient auth and system proxy inheritance', () => {
  const environment = cleanEnvironment('/synthetic/private-probe');
  assert.equal(environment.HOME, '/synthetic/private-probe/home');
  assert.equal(environment.NO_PROXY, '127.0.0.1,localhost,::1');
  assert.equal(environment.no_proxy, environment.NO_PROXY);
  assert.equal(environment.HEADROOM_TELEMETRY, 'off');
  assert.equal(environment.HEADROOM_REQUIRE_RUST_CORE, 'false');
  assert(!Object.keys(environment).some(key => /TOKEN|KEY|AUTH|PASSWORD/.test(key) && key !== 'TIKTOKEN_CACHE_DIR'));
  assert(!Object.hasOwn(environment, 'HTTP_PROXY'));
  assert(!Object.hasOwn(environment, 'HTTPS_PROXY'));
});

test('injection, optimization, retries and fallback are explicitly disabled', () => {
  for (const flag of ['memory_enabled', 'memory_inject_tools', 'memory_inject_context', 'optimize', 'ccr_inject_tool', 'cache_enabled', 'retry_enabled', 'fallback_enabled', 'discover_pipeline_extensions']) assert(DISABLED.includes(flag));
  assert(!DISABLED.includes('smart_routing'));
});

test('interpreter provenance records the actual link chain without reading auth', { skip: !fs.existsSync(python) }, () => {
  const metadata = interpreterMetadata(python);
  assert.equal(metadata.invokedPath, python);
  assert.equal(metadata.canonicalPath, fs.realpathSync(python));
  assert(Array.isArray(metadata.links));
});

test('actual installed Headroom preserves full outbound body without memory/history injection', {
  skip: process.platform !== 'darwin' || !fs.existsSync(python), timeout: 70000,
}, async () => {
  const proof = await runHeadroomPrecheck({ python });
  assert.equal(proof.pass, true);
  assert.equal(proof.osSandbox, false);
  assert.equal(proof.productionRequests, 0);
  assert.equal(proof.businessPromptRequests, 0);
  assert.equal(proof.upstreamRequests, 4);
  assert.equal(proof.childStopped.forced, false);
  assert.equal(proof.rustCoreStatus, 'disabled');
  for (const entry of proof.cases) {
    const bytes = fs.readFileSync(path.join(proof.evidenceRoot, `upstream-${entry.turn}.body.json`));
    const body = JSON.parse(bytes);
    assert.equal(sha256(bytes), entry.upstreamBodySha256);
    assert.equal(entry.brokerBodySha256, entry.upstreamBodySha256);
    assert.equal(entry.rawBytesIdentical, true);
    assert.equal(body.model, 'hr-6-astra');
    assert.deepEqual(body.tools, []);
    assert.equal(body.tool_choice, 'none');
    assert(!Object.hasOwn(body, 'previous_response_id'));
    assert(!Object.hasOwn(body, 'conversation'));
    const transport = JSON.parse(fs.readFileSync(path.join(entry.brokerEvidenceDirectory, 'transport.json')));
    assert.equal(entry.responseBodySha256, transport.responseBodySha256);
  }
  assert.equal(proof.cases[2].reportedModel, 'gpt-6-astra');
  assert.equal(proof.cases[3].httpStatus, 404);
  assert.equal(proof.cases[3].reportedModel, null);
  console.log(`Installed Headroom mock-only proof: ${proof.evidenceRoot}`);
});
