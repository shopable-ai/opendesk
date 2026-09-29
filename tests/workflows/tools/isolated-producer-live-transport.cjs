'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const { execFile } = require('node:child_process');
const { BrokerError, EVIDENCE_ROOT, compilePacket, resolveOutbound, createBroker, sha256 } = require('./isolated-producer.cjs');

const BACKEND = 'https://chatgpt.com/backend-api/codex/responses';
const OAUTH_PATH = '/Users/mac/.codex/auth.json';
const PROXY = 'http://127.0.0.1:7897';

function ensure(condition, code) {
  if (!condition) throw new BrokerError(code);
}

function createCodexOAuthAuthenticator({ endpoint = BACKEND, authPath = OAUTH_PATH, now = Date.now() } = {}) {
  ensure(endpoint === BACKEND, 'oauth_backend_not_approved');
  let descriptor;
  let buffer;
  try {
    ensure(path.isAbsolute(authPath), 'oauth_path_not_absolute');
    let current = path.parse(authPath).root;
    for (const component of authPath.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      ensure(!fs.lstatSync(current).isSymbolicLink(), 'oauth_symlink_rejected');
    }
    const before = fs.lstatSync(authPath);
    ensure(before.isFile() && before.nlink === 1 && before.size <= 256 * 1024 && (before.mode & 0o077) === 0, 'oauth_file_unsafe');
    ensure(typeof process.getuid !== 'function' || before.uid === process.getuid(), 'oauth_owner_mismatch');
    descriptor = fs.openSync(authPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor);
    ensure(opened.ino === before.ino && opened.dev === before.dev, 'oauth_file_changed');
    buffer = Buffer.alloc(256 * 1024 + 1);
    const count = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    ensure(count === before.size, 'oauth_file_changed');
    const stored = JSON.parse(buffer.subarray(0, count).toString('utf8'));
    const token = stored.tokens?.access_token;
    ensure(typeof token === 'string' && token.length > 0 && !/[\r\n]/.test(token), 'oauth_access_token_missing');
    let claims;
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch {}
    ensure(claims && Number.isFinite(claims.exp), 'oauth_expiry_unverifiable');
    ensure(claims.exp * 1000 > now + 60000, 'oauth_access_token_expired');
    const account = stored.tokens?.account_id ?? claims['https://api.openai.com/auth']?.chatgpt_account_id;
    ensure(typeof account === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(account), 'oauth_account_missing');
    let used = false;
    return (setHeader, target) => {
      ensure(target?.endpoint === endpoint, 'oauth_forward_target_mismatch');
      ensure(!used, 'oauth_forward_already_used');
      used = true;
      setHeader('authorization', `Bearer ${token}`);
      setHeader('chatgpt-account-id', account);
    };
  } catch (error) {
    if (error instanceof BrokerError) throw error;
    throw new BrokerError('oauth_local_read_failed');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (buffer) buffer.fill(0);
  }
}

function createBackendTunnelAgent() {
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
  agent.createConnection = (options, callback) => {
    if (options.host !== 'chatgpt.com' || Number(options.port) !== 443) {
      callback(new BrokerError('tunnel_backend_not_approved'));
      return;
    }
    let settled = false;
    const finish = (error, socket) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(error, socket);
    };
    const connect = http.request({ hostname: '127.0.0.1', port: 7897, method: 'CONNECT', path: 'chatgpt.com:443', agent: false });
    const timer = setTimeout(() => connect.destroy(new BrokerError('tunnel_timeout')), 10000);
    connect.once('error', () => finish(new BrokerError('tunnel_connection_failed')));
    connect.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        finish(new BrokerError('tunnel_status_rejected'));
        return;
      }
      if (head.length) socket.unshift(head);
      const secure = tls.connect({ socket, servername: 'chatgpt.com', rejectUnauthorized: true });
      secure.once('secureConnect', () => finish(null, secure));
      secure.once('error', () => { secure.destroy(); finish(new BrokerError('backend_tls_failed')); });
    });
    connect.end();
  };
  return agent;
}

function readAliasObservation() {
  return new Promise((resolve, reject) => {
    execFile('opencodex', ['alias', 'list', '--json'], { timeout: 5000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (failure, stdout) => {
      if (failure) { reject(new BrokerError('alias_metadata_cli_failed')); return; }
        try {
          const data = JSON.parse(stdout);
          const mappings = [];
          for (const [provider, entries] of Object.entries(data.models ?? {})) {
            for (const [backendModel, value] of Object.entries(entries)) {
              if (value.alias === 'hr-6-astra') mappings.push({ requestedSelector: value.alias, provider, backendModel });
            }
          }
          ensure(mappings.length === 1 && mappings[0].provider === 'openai' && mappings[0].backendModel === 'gpt-6-astra', 'live_alias_mapping_changed');
          resolve({ version: 1, source: 'http://127.0.0.1:10100/api/aliases', observedAt: new Date().toISOString(), mappings });
        } catch (error) { reject(error instanceof BrokerError ? error : new BrokerError('alias_metadata_invalid')); }
    });
  });
}

async function backendReachability() {
  const agent = createBackendTunnelAgent();
  try {
    return await new Promise((resolve, reject) => {
      const request = https.request(BACKEND, { method: 'HEAD', agent }, response => {
        response.resume();
        response.on('end', () => resolve({ endpoint: BACKEND, method: 'HEAD', authenticated: false, httpStatus: response.statusCode, networkProxy: PROXY }));
      });
      const timer = setTimeout(() => request.destroy(new BrokerError('backend_preflight_timeout')), 15000);
      request.on('close', () => clearTimeout(timer));
      request.on('error', error => reject(error instanceof BrokerError ? error : new BrokerError('backend_preflight_failed')));
      request.end();
    });
  } finally { agent.destroy(); }
}

function writeJson(root, name, value) {
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}

async function runMinimalLiveProbe() {
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(EVIDENCE_ROOT, 'minimal-live-'));
  let reserved = false;
  let agent;
  try {
    const alias = await readAliasObservation();
    const evidencePath = path.join(root, 'alias-evidence.json');
    writeJson(root, 'alias-evidence.json', alias);
    const evidenceSha256 = sha256(fs.readFileSync(evidencePath));
    const preflight = await backendReachability();
    writeJson(root, 'reachability.json', preflight);
    const authenticate = createCodexOAuthAuthenticator();
    const text = 'This is a transport-only probe with no business task. Reply with exactly: ISOLATED_ROUTE_OK';
    fs.writeFileSync(path.join(root, 'probe.txt'), text, { flag: 'wx', mode: 0o600 });
    const packet = { version: 1, taskId: 'minimal-live-route-probe', stage: 0, turn: 0,
      files: [{ id: 'fixed-nonbusiness-probe', role: 'requirement', path: 'probe.txt', sha256: sha256(text) }] };
    const route = { version: 2, mode: 'live', endpoint: BACKEND, model: 'hr-6-astra', expectedResponseModel: 'gpt-6-astra', stream: true,
      aliasMapping: { ...alias.mappings[0], evidencePath, evidenceSha256 } };
    const compiled = compilePacket({ packetRoot: root, packet, route });
    const outbound = resolveOutbound(compiled, route);
    writeJson(root, 'plan.json', { requestedSelector: route.model, backendModel: route.aliasMapping.backendModel,
      endpoint: BACKEND, authentication: 'existing-local-codex-oauth-memory-only', networkProxy: PROXY,
      aliasEvidenceSha256: evidenceSha256, aliasMappingSha256: outbound.aliasMappingSha256,
      allowedBodyChanges: ['model'], finalBodySha256: outbound.bodySha256,
      headroomInLiveChain: false, retries: 0, fallback: false,
      reasonNotUsingSharedForward: 'shared OpenCodex dispatch includes additional routing/retry behavior; use user-authorized same-backend OAuth narrow forward instead',
      trustedComponents: ['maintainer-approved alias evidence', 'Node broker and TLS stack', 'local existing OAuth credential file', 'HTTPS backend; CONNECT proxy cannot modify authenticated TLS body'] });
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'minimal-live-attempt.json'), JSON.stringify({ evidenceRoot: root, requestedSelector: route.model, backendModel: outbound.backendModel, bodySha256: outbound.bodySha256, reservedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    reserved = true;
    agent = createBackendTunnelAgent();
    const result = await createBroker({ packetRoot: root, evidenceRoot: root, authenticate, httpsAgent: agent, timeoutMs: 90000 }).send({ packet, route, allowLive: true });
    const replyMatches = result.response.outputText.trim() === 'ISOLATED_ROUTE_OK';
    const receipt = { pass: replyMatches, code: replyMatches ? 'probe_passed' : 'unexpected_probe_reply', evidenceRoot: root, requestedSelector: route.model, backendModel: result.backendModel,
      actualResponseModel: result.response.model, responseId: result.response.id, responseText: result.response.outputText,
      httpStatus: result.status, requestBodySha256: result.requestBodySha256, responseBodySha256: result.responseBodySha256,
      aliasEvidenceSha256: result.aliasEvidenceSha256, aliasMappingSha256: result.aliasMappingSha256,
      modelRequestsDispatched: 1, businessPromptsDispatched: 0, retries: 0, fallback: false, brokerEvidenceDirectory: result.evidenceDirectory };
    writeJson(root, 'receipt.json', receipt);
    return receipt;
  } catch (error) {
    const code = error instanceof BrokerError ? error.code : (error.code === 'EEXIST' ? 'real_attempt_already_reserved' : 'minimal_live_probe_failed');
    const receipt = { pass: false, evidenceRoot: root, code, modelRequestReserved: reserved, businessPromptsDispatched: 0, retries: 0, fallback: false };
    writeJson(root, 'receipt.json', receipt);
    return receipt;
  } finally { if (agent) agent.destroy(); }
}

module.exports = { BACKEND, PROXY, createCodexOAuthAuthenticator, createBackendTunnelAgent, readAliasObservation, backendReachability, runMinimalLiveProbe };
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--run-once') {
    runMinimalLiveProbe().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); process.exitCode = result.pass ? 0 : 1; }).catch(() => { process.stderr.write('minimal_live_probe_failed\n'); process.exitCode = 1; });
  } else if (process.argv.length === 3 && process.argv[2] === '--preflight') {
    backendReachability().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error instanceof BrokerError ? error.code : 'backend_preflight_failed'}\n`); process.exitCode = 1; });
  } else {
    process.stdout.write('From repository root: node tests/workflows/tools/isolated-producer-live-transport.cjs --run-once\nUser-authorized fixed nonbusiness probe only. Declared hr-6-astra alias mapping, same-backend existing OAuth held only in memory, no retries/fallback/refresh/redirect. Writes a one-attempt reservation under .runtime/tests/agent-to-recipe/revision-20260929/isolation-probe/. Never sends S1. --preflight performs an unauthenticated HEAD only.\n');
  }
}
