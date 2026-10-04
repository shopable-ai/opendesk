// Native BrowserDOM bridge. This is a client adapter, not a second Browser Core.
// The existing Core Client owns authentication/correlation/timeout semantics;
// the Broker and Extension retain target, transport and side-effect ownership.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const fail = code => {throw Object.assign(new Error(code), {code, outcome: 'NOT_DISPATCHED'});};
const operations = new Set(['status', 'tabs', 'observe', 'locate', 'read', 'fill', 'click', 'wait', 'verify']);
let config, client, limits, tracePath, coreTracePath, redact;
const semantics = new Map(), seen = new Set();

async function initialize(input) {
  if (config) fail('ALREADY_CONFIGURED');
  if (!input || !path.isAbsolute(input.coreRoot || '') || !safeId(input.executionId) ||
      !['agent', 'recipe'].includes(input.source) || !Number.isInteger(input.tab) || input.tab < 0) fail('INVALID_ARGUMENT');
  const origin = new URL(input.origin);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.origin !== input.origin) fail('PERMISSION_DENIED');
  config = {...input, coreRoot: fs.realpathSync(input.coreRoot)};
  const module = name => pathToFileURL(path.join(config.coreRoot, 'lab/browser-automation-core', name)).href;
  const {Client} = await import(module('client.mjs'));
  ({LIMITS: limits} = await import(module('config.mjs')));
  ({redact} = await import(module('trace.mjs')));
  const {sourceSnapshot} = await import(module('candidate.mjs'));
  const current = sourceSnapshot();
  const directory = path.join(config.coreRoot, '.runtime/browser-executions', config.executionId);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  tracePath = path.join(directory, 'canonical-trace.ndjson');
  fs.closeSync(fs.openSync(tracePath, 'wx', 0o600));
  client = new Client();
  client.executionId = config.executionId;
  await client.connect();
  // A setup probe is protocol evidence, not a canonical Agent action.
  const status = await client.request('status');
  if (status.error) fail(status.error.code);
  coreTracePath = path.join(status.result.evidenceDirectory, 'trace.ndjson');
  fs.writeFileSync(path.join(directory, 'execution.json'), JSON.stringify({
    schemaVersion: 'opendesk-browser-execution/v1', executionId: config.executionId,
    source: config.source, surface: 'browser', coreCandidateId: current.candidateId,
    origin: config.origin, tab: config.tab, tracePath, coreTracePath,
    bridgeCodeSha256: config.bridgeCodeSha256,
  }, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return {configured: true, executionId: config.executionId, source: config.source,
    coreCandidateId: current.candidateId, tracePath, coreTracePath, origin: config.origin, tab: config.tab};
}

function terminal(requestId) {
  if (!coreTracePath || !fs.existsSync(coreTracePath)) return null;
  const lines = fs.readFileSync(coreTracePath, 'utf8').trimEnd().split('\n');
  const matches = lines.flatMap((line, index) => {
    const row = JSON.parse(line);
    return row.executionId === config.executionId && row.requestId === requestId &&
      ['SUCCESS', 'ERROR'].includes(row.status) ? [{row, line: index + 1, sha256: digest(line + '\n')}] : [];
  });
  if (matches.length > 1) fail('MULTIPLE_CORE_TERMINALS');
  return matches[0] || null;
}

function record(request, response, startedAt, policyDenied = false) {
  const fact = terminal(request.requestId), row = fact?.row || {};
  const result = response.result || {};
  const target = row.resolvedTarget || result.target || request.params.target || null;
  if (request.operation === 'locate' && result.target) {
    semantics.set(result.target.elementIdentity, request.params.query);
    if (semantics.size > limits.maxTargets) semantics.delete(semantics.keys().next().value);
  }
  const input = request.operation === 'fill' ? row.action?.value ?? null
    : request.operation === 'read' ? {field: request.params.field} : null;
  const evidenceDirectory = path.dirname(tracePath);
  const responsePath = path.join(evidenceDirectory, request.requestId + '.response.json');
  // Core has already redacted sensitive DOM fields. No raw caller value or
  // credential is persisted here, including errors before dispatch.
  const safeResponse = redact(response);
  fs.writeFileSync(responsePath, JSON.stringify(safeResponse, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  const action = {
    schemaVersion: 'opendesk-browser-action/v1', canonical: true,
    executionId: config.executionId, actionId: request.requestId, requestId: request.requestId,
    source: config.source, surface: 'browser', caller: request.caller,
    browserSession: row.browserSession ?? response.browserSession ?? null,
    brokerSession: row.brokerSession ?? response.brokerSession ?? null,
    connectionEpoch: row.connectionEpoch ?? response.connectionEpoch ?? null,
    tab: row.tab ?? target?.tab ?? request.params.scope?.tab ?? null,
    frame: row.frame ?? target?.frame ?? request.params.scope?.frame ?? null,
    document: row.document ?? target?.document ?? request.params.scope?.document ?? null,
    origin: config.origin, url: result.url ?? null, operation: request.operation,
    targetRequest: request.params.query ?? null, resolvedTarget: target,
    targetSemantics: request.params.query ?? semantics.get(target?.elementIdentity) ?? null,
    beforeObservation: row.beforeObservation ?? null, runtimeInput: input,
    runtimeOutput: request.operation === 'read' ? result.value ?? null : safeResponse.result ?? null,
    actualActionResult: row.action ?? null, afterObservation: row.afterObservation ?? null,
    verification: row.verification ?? null, status: response.error ? 'ERROR' : 'SUCCESS',
    errorClass: response.error?.code ?? null,
    outcome: response.outcome ?? response.error?.outcome ?? (policyDenied ? 'NOT_DISPATCHED' : 'OUTCOME_UNKNOWN'),
    sourceReadRequestId: row.sourceReadRequestId ?? request.params.sourceReadRequestId ?? null,
    timestamps: {startedAt, finishedAt: new Date().toISOString(), coreTimestamp: row.timestamp ?? null},
    evidenceReferences: {
      coreTerminal: fact ? {path: coreTracePath, line: fact.line, sha256: fact.sha256} : null,
      response: {path: responsePath, sha256: digest(fs.readFileSync(responsePath))},
      policy: policyDenied ? {origin: config.origin, boundTab: config.tab, rejectedBeforeCoreDispatch: true} : null,
    },
    unknownFields: ['beforeObservation', 'actualActionResult', 'afterObservation', 'verification']
      .filter(key => row[{actualActionResult: 'action'}[key] || key] == null),
  };
  fs.appendFileSync(tracePath, JSON.stringify(redact(action)) + '\n');
  return {...safeResponse, executionId: config.executionId, actionId: request.requestId,
    source: config.source, surface: 'browser', evidence: {tracePath, responsePath, coreTracePath}};
}

async function call(request) {
  if (!client) fail('BROWSER_NOT_CONFIGURED');
  if (!safeId(request.requestId) || seen.has(request.requestId)) fail('DUPLICATE_REQUEST_ID');
  if (seen.size >= limits.maxRequestsPerSession) fail('REQUEST_MEMORY_LIMIT');
  seen.add(request.requestId);
  const startedAt = new Date().toISOString();
  request.params ||= {};
  if (!operations.has(request.operation)) fail('UNSUPPORTED_OPERATION');
  let response, denied = false;
  if (!['status', 'tabs'].includes(request.operation)) {
    // This only narrows host-granted website/tab permission. Core still owns
    // all identity, freshness, matching, actionability and execution checks.
    const tab = request.params.target?.tab ?? request.params.scope?.tab;
    if (tab !== config.tab) {
      denied = true;
    } else {
      const inventory = await client.request('tabs');
      if (inventory.error) response = inventory;
      else {
        const selected = inventory.result.tabs.find(item => item.tab === config.tab);
        try { denied = !selected || new URL(selected.url).origin !== config.origin; }
        catch { denied = true; }
      }
    }
  }
  if (denied) response = {requestId: request.requestId, error: {code: 'PERMISSION_DENIED', outcome: 'NOT_DISPATCHED'}, outcome: 'NOT_DISPATCHED'};
  if (!response) response = await client.request(request.operation, request.params,
    {requestId: request.requestId, ...(request.timeoutMs === undefined ? {} : {timeoutMs: request.timeoutMs})});
  if (request.operation === 'tabs' && response.result?.tabs) {
    response.result.tabs = response.result.tabs.filter(item => {
      try { return new URL(item.url).origin === config.origin; } catch { return false; }
    });
  }
  response.requestId = request.requestId;
  return record(request, response, startedAt, denied);
}

const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
try {
  for await (const line of lines) {
    let message;
    try {
      if (Buffer.byteLength(line) > 65536) fail('MESSAGE_TOO_LARGE');
      message = JSON.parse(line);
      const response = message.configure ? await initialize(message.configure) : await call(message);
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      // Never serialize arbitrary exception text or the original request.
      const outcome = error.outcome || (['fill', 'click'].includes(message?.operation) ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED');
      process.stdout.write(JSON.stringify({requestId: message?.requestId ?? null,
        error: {code: /^[A-Z][A-Z0-9_]+$/.test(error.code || '') ? error.code : 'BROWSER_ADAPTER_ERROR', outcome},
        outcome}) + '\n');
    }
  }
} finally {client?.close();}
