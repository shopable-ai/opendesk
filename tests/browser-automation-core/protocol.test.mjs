import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LineDecoder, NativeDecoder, nativeFrame, validate, validateResponse, browserResponse, encoded, failure, CoreError } from '../../lab/browser-automation-core/protocol.mjs';
import { LIMITS, SOURCE, EXTENSION_ID } from '../../lab/browser-automation-core/config.mjs';
import { extensionIdentity } from '../../lab/browser-automation-core/setup.mjs';
import { traceRecord, redact, mergeBrowserTrace } from '../../lab/browser-automation-core/trace.mjs';
import { Broker } from '../../lab/browser-automation-core/broker.mjs';

test('Native Messaging decoder handles fragmented UTF-8 frames and coalesced replies', () => {
  const first = {v: 1, kind: 'response', requestId: 'one', result: '金额'}, second = {...first, requestId: 'two'};
  const bytes = Buffer.concat([nativeFrame(first), nativeFrame(second)]), decoder = new NativeDecoder();
  const actual = [];
  for (const byte of bytes) actual.push(...decoder.push(Buffer.from([byte])));
  assert.deepEqual(actual, [first, second]); assert.equal(decoder.buffer.length, 0);
});
test('NDJSON bounded parser handles fragmented and combined messages', () => {
  const decoder = new LineDecoder();
  assert.deepEqual(decoder.push(Buffer.from('{"v":1')), []);
  assert.deepEqual(decoder.push(Buffer.from(',"kind":"event"}\n{"v":1,"kind":"event"}\n')), [{v: 1, kind: 'event'}, {v: 1, kind: 'event'}]);
});
test('framing rejects malformed JSON and oversize header before allocating body', () => {
  const header = Buffer.alloc(4); header.writeUInt32LE(LIMITS.maxMessageBytes + 1);
  assert.throws(() => new NativeDecoder().push(header), {code: 'MESSAGE_TOO_LARGE'});
  assert.throws(() => new LineDecoder().push(Buffer.from('{\n')), {code: 'MALFORMED_MESSAGE'});
  assert.throws(() => new LineDecoder().push(Buffer.alloc(LIMITS.maxMessageBytes + 1, 120)), {code: 'MESSAGE_TOO_LARGE'});
  assert.throws(() => encoded({kind: 'x', body: 'x'.repeat(LIMITS.maxMessageBytes)}), {code: 'MESSAGE_TOO_LARGE'});
});
test('protocol mismatch and malformed envelopes map to distinct errors', () => {
  assert.throws(() => validate({v: 999, kind: 'hello'}), {code: 'PROTOCOL_MISMATCH'});
  assert.throws(() => validate([]), {code: 'MALFORMED_MESSAGE'});
  assert.equal(failure(new CoreError('TIMEOUT'), 'OUTCOME_UNKNOWN').outcome, 'OUTCOME_UNKNOWN');
});
test('trace serialization preserves required fields and removes credentials recursively', () => {
  const record = traceRecord({executionId: 'e', requestId: 'r', operation: 'echo', params: {}});
  const requirements = JSON.parse(fs.readFileSync(new URL('../../docs/quality/browser-automation/core-demo-acceptance.json', import.meta.url))).trace.requiredFields;
  for (const field of requirements) assert.ok(Object.hasOwn(record, field), field);
  const cleaned = redact({...record, password: 'pw', nested: {authorization: 'cred', message: 'prefixSECRETtail'}}, ['SECRET']);
  assert.ok(!JSON.stringify(cleaned).includes('SECRET')); assert.equal(cleaned.password, '[REDACTED]');
});
test('manifest public key gives exactly the pinned native host extension identity', () => {
  const manifest = JSON.parse(fs.readFileSync(`${SOURCE}/extension/manifest.json`));
  assert.equal(extensionIdentity(manifest.key), EXTENSION_ID);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(!manifest.permissions.includes('debugger')); assert.ok(!manifest.content_scripts);
});
test('malformed response bodies are rejected before retiring a pending request', () => {
  const base = {v: 1, kind: 'response', requestId: 'r'};
  for (const body of [{}, {error: 'failed'}, {result: {}, error: {code: 'FAILED'}},
    {error: {code: 'FAILED', outcome: 'SUCCEEDED'}}, {error: {code: {unsafe: true}}}, {result: undefined}]) {
    assert.throws(() => validateResponse({...base, ...body}), {code: 'MALFORMED_MESSAGE'});
  }
  assert.equal(validateResponse({...base, result: null}).result, null);
});
test('browser errors use safe error codes and unknown side effect outcomes conservatively', () => {
  const reply = {v: 1, kind: 'response', requestId: 'r', error: {code: 'BROWSER_ERROR', message: 'sensitive input'}};
  const mapped = browserResponse(reply, 'click');
  assert.equal(mapped.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(mapped.response.error.message, 'BROWSER_ERROR');
  assert.ok(!JSON.stringify(mapped).includes('sensitive input'));
  assert.equal(browserResponse(reply, 'echo').outcome, 'FAILED_CONFIRMED');
});
test('browser observation cannot overwrite Broker trace identity, correlation or outcome', () => {
  const record = {...traceRecord({executionId: 'exec', requestId: 'req', operation: 'echo', params: {}},
    {browserSession: 'session', connectionEpoch: 'epoch'}), status: 'SUCCESS', outcome: 'SUCCEEDED', duration: 5};
  const original = {...record};
  mergeBrowserTrace(record, {executionId: 'spoof', requestId: 'spoof', browserSession: 'spoof', connectionEpoch: 'spoof',
    tab: 'spoof', frame: 'spoof', document: 'spoof', operation: 'click', status: 'ERROR', errorCode: 'SPOOFED',
    outcome: 'OUTCOME_UNKNOWN', duration: 0, dispatchedAt: 'spoof', afterObservation: {text: 'observed'}});
  for (const key of ['executionId', 'requestId', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document',
    'operation', 'status', 'errorCode', 'outcome', 'duration', 'dispatchedAt']) assert.equal(record[key], original[key], key);
  assert.deepEqual(record.afterObservation, {text: 'observed'});
});
test('rejected origin leaves no authenticated role and cannot send a subsequent hello', () => {
  const broker = Object.create(Broker.prototype);
  Object.assign(broker, {install: {hostCredential: 'a'.repeat(64)}, host: null, browser: null});
  const socket = {};
  assert.throws(() => broker.authenticate(socket, {v: 1, kind: 'auth', role: 'host',
    credential: 'a'.repeat(64), origin: 'chrome-extension://wrong/'}), {code: 'EXTENSION_NOT_ALLOWED'});
  assert.equal(socket.role, undefined);
  assert.throws(() => broker.fromHost(socket, {v: 1, kind: 'hello', extensionId: EXTENSION_ID,
    browserSession: 'session'}), {code: 'EXTENSION_NOT_ALLOWED'});
  assert.equal(broker.browser, null);
});
test('non-ASCII wrong credential maps to UNAUTHORIZED instead of timing comparison error', () => {
  const broker = Object.create(Broker.prototype);
  broker.install = {clientCredential: 'a'.repeat(64)};
  assert.throws(() => broker.authenticate({}, {v: 1, kind: 'auth', role: 'client', credential: 'é'.repeat(64)}), {code: 'UNAUTHORIZED'});
});
test('a second hello cannot rebind an established browser session on the same epoch', () => {
  const broker = Object.create(Broker.prototype), socket = {};
  Object.assign(broker, {host: socket, browser: {browserSession: 'original'}, epoch: 'epoch'});
  assert.throws(() => broker.fromHost(socket, {v: 1, kind: 'hello', extensionId: EXTENSION_ID,
    browserSession: 'replacement'}), {code: 'DUPLICATE_HANDSHAKE'});
  assert.equal(broker.browser.browserSession, 'original'); assert.equal(broker.epoch, 'epoch');
});
