'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { BrokerError, EVIDENCE_ROOT, compilePacket, resolveOutbound, parseResponse, post, sha256 } = require('./isolated-producer.cjs');
const { startTemporaryHeadroom, stopChild } = require('./isolated-producer-headroom-precheck.cjs');
const { BACKEND, createCodexOAuthAuthenticator, createBackendTunnelAgent, readAliasObservation } = require('./isolated-producer-live-transport.cjs');

function requireProof(condition, code) {
  if (!condition) throw new BrokerError(code);
}

function save(root, name, value) {
  fs.writeFileSync(path.join(root, name), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}

function createNarrowBridge({ root, compiled, route, forward }) {
  const expectedBytes = compiled.bodyText;
  const frozenRoute = JSON.parse(JSON.stringify(route));
  const state = { requests: 0, forwards: 0, rejected: 0 };
  const server = http.createServer((request, response) => {
    state.requests += 1;
    const chunks = [];
    let length = 0;
    request.on('error', () => { state.requestError = 'bridge_request_error'; });
    request.on('data', chunk => {
      length += chunk.length;
      if (length > 512 * 1024) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', async () => {
      try {
        requireProof(request.method === 'POST' && request.url === '/v1/responses', 'bridge_endpoint_rejected');
        requireProof(state.forwards === 0, 'bridge_duplicate_request_rejected');
        const captured = Buffer.concat(chunks);
        state.capturedBodySha256 = sha256(captured);
        requireProof(captured.equals(Buffer.from(expectedBytes)), 'headroom_body_injection_or_change');
        save(root, 'headroom-egress.body.json', captured);
        const outbound = resolveOutbound({ ...compiled, bodyText: captured.toString('utf8') }, frozenRoute);
        save(root, 'backend-request.body.json', outbound.bodyText);
        save(root, 'body-proof.json', { selectorBodySha256: compiled.bodySha256, headroomEgressBodySha256: state.capturedBodySha256,
          rawBytesIdentical: true, backendBodySha256: outbound.bodySha256, allowedBodyChanges: ['model'],
          requestedSelector: frozenRoute.model, backendModel: outbound.backendModel,
          aliasEvidenceSha256: outbound.aliasEvidenceSha256, aliasMappingSha256: outbound.aliasMappingSha256 });
        state.forwards += 1;
        const received = await forward(outbound);
        state.backendStatus = received.status;
        state.backendResponseWireSha256 = sha256(received.bytes);
        save(root, 'backend-response.transport.json', { httpStatus: received.status, wireSha256: state.backendResponseWireSha256 });
        requireProof(received.status === 200, 'backend_http_status_rejected');
        save(root, 'backend-response.wire.sse', received.bytes);
        response.writeHead(received.status, { 'content-type': 'text/event-stream' });
        response.end(received.bytes);
      } catch (error) {
        state.rejected += 1;
        state.failure = error instanceof BrokerError ? error.code : 'bridge_failed';
        response.writeHead(502, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: state.failure } }));
      }
    });
  });
  server.requestTimeout = 120000;
  return { server, state };
}

function mockWire() {
  const item = { id: 'msg_mock_bridge', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ISOLATED_ROUTE_OK' }] };
  const events = [
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: item.id, delta: 'ISOLATED_ROUTE_OK' },
    { type: 'response.output_text.done', output_index: 0, content_index: 0, item_id: item.id, text: 'ISOLATED_ROUTE_OK' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_mock_bridge', object: 'response', model: 'gpt-6-astra', status: 'completed', output: [] } },
  ];
  return Buffer.from(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n');
}

async function runHeadroomBridgeProbe({ live = false } = {}) {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(EVIDENCE_ROOT, live ? 'headroom-live-' : 'headroom-bridge-mock-'));
  let started;
  let bridge;
  let agent;
  let receipt;
  let modelAttempts = 0;
  try {
    if (live) {
      requireProof(fs.existsSync(path.join(EVIDENCE_ROOT, 'minimal-live-attempt.json')), 'prior_attempt_evidence_missing');
      requireProof(!fs.existsSync(path.join(EVIDENCE_ROOT, 'minimal-live-attempt-2.json')), 'second_attempt_already_reserved');
    }
    const alias = live ? await readAliasObservation() : { version: 1, source: 'http://127.0.0.1:10100/api/aliases', observedAt: new Date().toISOString(),
      mappings: [{ requestedSelector: 'hr-6-astra', provider: 'openai', backendModel: 'gpt-6-astra' }] };
    save(root, 'alias-evidence.json', alias);
    const evidencePath = path.join(root, 'alias-evidence.json');
    const text = 'This is a transport-only probe with no business task. Reply with exactly: ISOLATED_ROUTE_OK';
    save(root, 'probe.txt', text);
    const packet = { version: 1, taskId: 'headroom-fixed-route-probe', stage: 0, turn: 0,
      files: [{ id: 'fixed-nonbusiness-probe', role: 'requirement', path: 'probe.txt', sha256: sha256(text) }] };
    const route = { version: 2, mode: live ? 'live' : 'mock', endpoint: live ? BACKEND : 'http://127.0.0.1:1/v1/responses', model: 'hr-6-astra',
      expectedResponseModel: 'gpt-6-astra', stream: true, aliasMapping: { ...alias.mappings[0], evidencePath, evidenceSha256: sha256(fs.readFileSync(evidencePath)) } };
    const compiled = compilePacket({ packetRoot: root, packet, route });
    resolveOutbound(compiled, route);
    save(root, 'selector-request.body.json', compiled.bodyText);
    save(root, 'input-manifest.json', compiled.manifest);
    save(root, 'route.json', route);
    save(root, 'probe-plan.json', { live, mockOnly: !live, headroomInChain: true, fixedNonbusinessOnly: true, tools: [], toolChoice: 'none',
      retries: 0, fallback: false, aliasSource: live ? 'existing-authorized-opencodex-alias-list-cli' : 'synthetic-mock-fixture',
      bodyChangesAllowedAfterHeadroom: ['declared model mapping'], attemptNumber: live ? 2 : null,
      trustedComponents: ['maintainer and packet review', 'Node broker and narrow bridge', 'Python interpreter and native dependencies', 'installed Headroom and host filesystem',
        'same-backend OAuth file read in bridge process only', 'Node TLS with certificate verification and remote backend'], osSandbox: false });
    const forward = live ? async outbound => {
      const authenticate = createCodexOAuthAuthenticator();
      save(EVIDENCE_ROOT, 'minimal-live-attempt-2.json', { evidenceRoot: root, requestedSelector: route.model, backendModel: outbound.backendModel,
        bodySha256: outbound.bodySha256, reservedAt: new Date().toISOString() });
      agent = createBackendTunnelAgent();
      modelAttempts += 1;
      return post(new URL(BACKEND), outbound.bodyText, true, authenticate, 90000, agent);
    } : async () => ({ status: 200, bytes: mockWire() });
    bridge = createNarrowBridge({ root, compiled, route, forward });
    await new Promise(resolve => bridge.server.listen(0, '127.0.0.1', resolve));
    const headroomRoot = path.join(root, 'headroom');
    fs.mkdirSync(headroomRoot, { mode: 0o700 });
    started = await startTemporaryHeadroom({ root: headroomRoot, upstreamPort: bridge.server.address().port, requestTimeout: 110 });
    const endpoint = new URL(`http://127.0.0.1:${started.ready.port}/v1/responses`);
    const received = await post(endpoint, compiled.bodyText, true, undefined, 120000);
    save(root, 'headroom-response.transport.json', { httpStatus: received.status, wireSha256: sha256(received.bytes) });
    requireProof(received.status === 200, bridge.state.failure ?? 'headroom_http_status_rejected');
    save(root, 'headroom-response.wire.sse', received.bytes);
    const parsed = parseResponse(received.bytes, true);
    save(root, 'response.json', parsed);
    requireProof(parsed.model === route.expectedResponseModel, 'response_model_mismatch');
    requireProof(bridge.state.requests === 1 && bridge.state.forwards === 1, 'unexpected_bridge_request_count');
    const bodyProof = JSON.parse(fs.readFileSync(path.join(root, 'body-proof.json')));
    receipt = { pass: parsed.outputText.trim() === 'ISOLATED_ROUTE_OK', code: parsed.outputText.trim() === 'ISOLATED_ROUTE_OK' ? 'probe_passed' : 'unexpected_probe_reply',
      evidenceRoot: root, mockOnly: !live, requestedSelector: route.model, backendModel: route.aliasMapping.backendModel, actualResponseModel: parsed.model,
      responseId: parsed.id, responseText: parsed.outputText, backendHttpStatus: bridge.state.backendStatus, headroomHttpStatus: received.status,
      ...bodyProof, responseWireSha256: sha256(received.bytes), backendResponseWireSha256: bridge.state.backendResponseWireSha256,
      responseBytesIdentical: sha256(received.bytes) === bridge.state.backendResponseWireSha256,
      headroomVersion: started.ready.version, headroomPid: started.ready.pid, headroomPort: started.ready.port,
      sourceSha256: started.ready.sourceSha256, modelAttempts, totalModelAttempts: live ? 1 + modelAttempts : 0,
      businessPromptsDispatched: 0, retries: 0, fallback: false, headroomInLiveChain: live, osSandbox: false };
  } catch (error) {
    receipt = { pass: false, evidenceRoot: root, mockOnly: !live, code: error instanceof BrokerError ? error.code : 'headroom_bridge_probe_failed',
      modelAttempts, totalModelAttempts: live ? 1 + modelAttempts : 0, bridgeState: bridge?.state, businessPromptsDispatched: 0, retries: 0, fallback: false };
  } finally {
    if (started) receipt.childStopped = await stopChild(started.child, started.exited);
    if (bridge) {
      bridge.server.closeAllConnections();
      await new Promise(resolve => bridge.server.close(resolve));
      save(root, 'bridge-state.json', bridge.state);
    }
    if (agent) agent.destroy();
    save(root, 'receipt.json', receipt);
  }
  return receipt;
}

module.exports = { createNarrowBridge, runHeadroomBridgeProbe };
if (require.main === module) {
  const mode = process.argv[2];
  if (process.argv.length === 3 && ['--mock', '--run-second'].includes(mode)) {
    runHeadroomBridgeProbe({ live: mode === '--run-second' }).then(result => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.pass ? 0 : 1;
    }).catch(() => { process.stderr.write('headroom_bridge_probe_failed\n'); process.exitCode = 1; });
  } else process.stdout.write('From repository root: node tests/workflows/tools/isolated-producer-headroom-live.cjs --mock\nOr --run-second for the explicitly authorized second real fixed nonbusiness probe only. No S1, retry, refresh, fallback, global configuration change, or OS isolation claim. Both modes use a fresh temporary installed Headroom and a one-forward body-equality-checking bridge. Raw successful response bodies contain no HTTP headers; OAuth is held only in memory outside Headroom. Evidence: .runtime/tests/agent-to-recipe/revision-20260929/isolation-probe/.\n');
}
