'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { EVIDENCE_ROOT, post, sha256 } = require('./tools/isolated-producer.cjs');

fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(EVIDENCE_ROOT, 'wire-tests-'));
const AUTH_SENTINEL = 'SYNTHETIC_HEADER_SECRET_DO_NOT_PERSIST';

async function fixture(context, handler) {
  const root = fs.mkdtempSync(path.join(runRoot, 'case-'));
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    request.resume();
    response.on('error', () => {});
    handler(request, response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { root, server, endpoint: new URL(`http://127.0.0.1:${server.address().port}/v1/responses`), count: () => requests };
}

function captured(current, timeoutMs = 1000, streaming = true, authenticate) {
  return post(current.endpoint, '{"synthetic":true}', streaming, authenticate, timeoutMs, undefined, { wireCaptureRoot: current.root });
}

async function rejected(promise, code) {
  try { await promise; assert.fail('Expected rejection'); }
  catch (error) { assert.equal(error.code, code); return error; }
}

function verifyDiagnostic(result) {
  const diagnostic = result.diagnostic;
  const bytes = fs.readFileSync(path.join(diagnostic.captureDirectory, 'response.wire'));
  const stored = JSON.parse(fs.readFileSync(path.join(diagnostic.captureDirectory, 'response.diagnostic.json')));
  assert.deepEqual(stored, diagnostic);
  assert.equal(bytes.length, diagnostic.capturedBytes);
  assert.equal(sha256(bytes), diagnostic.wireSha256);
  assert.equal(fs.statSync(path.join(diagnostic.captureDirectory, 'response.wire')).mode & 0o777, 0o600);
  for (const filename of fs.readdirSync(diagnostic.captureDirectory)) {
    assert(!fs.readFileSync(path.join(diagnostic.captureDirectory, filename)).includes(Buffer.from(AUTH_SENTINEL)));
  }
  return bytes;
}

test('timeout preserves incrementally written split UTF8/CRLF SSE, HTTP status, boundaries and tail', async context => {
  const frame = Buffer.from('event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"合成"}\r\n\r\n');
  const partial = Buffer.from('data: {"type":"response.output_text.delta","delta":"unfinished');
  const expected = Buffer.concat([frame, partial]);
  let writeFinished;
  const sent = new Promise(resolve => { writeFinished = resolve; });
  const current = await fixture(context, (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${AUTH_SENTINEL}`);
    response.writeHead(200, { 'content-type': 'text/event-stream', 'x-synthetic-secret': AUTH_SENTINEL });
    const split = frame.indexOf(Buffer.from('合成')) + 1;
    response.write(frame.subarray(0, split));
    setImmediate(() => {
      response.write(frame.subarray(split, frame.length - 1));
      setImmediate(() => { response.write(Buffer.concat([frame.subarray(-1), partial])); writeFinished(); });
    });
  });
  const pending = rejected(captured(current, 1000, true, setHeader => { setHeader('authorization', `Bearer ${AUTH_SENTINEL}`); }), 'transport_timeout');
  await sent;
  const directory = path.join(current.root, fs.readdirSync(current.root)[0]);
  const deadline = Date.now() + 500;
  while (fs.statSync(path.join(directory, 'response.wire')).size !== expected.length && Date.now() < deadline) await delay(5);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'response.wire')), expected);
  assert(!fs.existsSync(path.join(directory, 'response.diagnostic.json')));
  const error = await pending;
  assert.deepEqual(verifyDiagnostic(error), expected);
  assert.equal(error.diagnostic.httpStatus, 200);
  assert.equal(error.diagnostic.termination, 'absolute_timeout');
  assert.equal(error.diagnostic.responseEnded, false);
  assert.equal(error.diagnostic.hashScope, 'received_prefix_only');
  assert.equal(error.diagnostic.capturedAllObservedBytes, true);
  assert.equal(error.diagnostic.sse.completeFrames, 1);
  assert.equal(error.diagnostic.sse.frames[0].eventType, 'response.output_text.delta');
  assert.equal(error.diagnostic.sse.frames[0].endByteExclusive, frame.length);
  assert.equal(error.diagnostic.sse.trailingBytes, partial.length);
  assert.equal(error.diagnostic.sse.trailingStartByte, frame.length);
  assert(error.diagnostic.firstByteAtMs !== null);
  assert.equal(current.count(), 1);
});

test('timeout before headers captures zero bytes and null HTTP status', async context => {
  const current = await fixture(context, () => {});
  const error = await rejected(captured(current, 100), 'transport_timeout');
  assert.equal(verifyDiagnostic(error).length, 0);
  assert.equal(error.diagnostic.httpStatus, null);
  assert.equal(error.diagnostic.phase, 'awaiting_response_headers');
  assert.equal(error.diagnostic.headersAtMs, null);
  assert.equal(error.diagnostic.firstByteAtMs, null);
  assert.equal(error.diagnostic.sse.completeFrames, 0);
  assert.equal(current.count(), 1);
});

test('headers-only timeout retains actual status rather than inventing model failure', async context => {
  const current = await fixture(context, (request, response) => { response.writeHead(202); response.flushHeaders(); });
  const error = await rejected(captured(current, 100), 'transport_timeout');
  assert.equal(verifyDiagnostic(error).length, 0);
  assert.equal(error.diagnostic.httpStatus, 202);
  assert.equal(error.diagnostic.phase, 'receiving_response_body');
  assert.equal(error.diagnostic.firstByteAtMs, null);
});

test('socket abort retains partial body and cannot later settle as success', async context => {
  const expected = Buffer.from('data: {"type":"response.created"}\n\ndata: partial');
  const current = await fixture(context, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(expected);
    setTimeout(() => response.destroy(), 30);
  });
  const error = await rejected(captured(current), 'transport_error');
  assert.deepEqual(verifyDiagnostic(error), expected);
  assert.equal(error.diagnostic.httpStatus, 200);
  assert.equal(error.diagnostic.responseEnded, false);
  assert.equal(error.diagnostic.httpMessageComplete, false);
  assert(['response_aborted', 'response_error', 'response_closed_before_end', 'request_closed_before_end'].includes(error.diagnostic.termination));
  await delay(10);
  assert.deepEqual(verifyDiagnostic(error), expected);
  assert.equal(current.count(), 1);
});

test('successful capture is exact bytes including raw CR framing and DONE sentinel', async context => {
  const expected = Buffer.from('data: {"type":"response.created"}\r\rdata: [DONE]\r\r');
  const current = await fixture(context, (request, response) => response.end(expected));
  const result = await captured(current, 300000);
  assert.deepEqual(result.bytes, expected);
  assert.deepEqual(verifyDiagnostic(result), expected);
  assert.equal(result.diagnostic.timeoutMs, 300000);
  assert.equal(result.diagnostic.responseEnded, true);
  assert.equal(result.diagnostic.hashScope, 'complete_response_body');
  assert.equal(result.diagnostic.sse.completeFrames, 2);
  assert.equal(result.diagnostic.sse.frames[1].doneSentinel, true);
  assert.equal(result.diagnostic.sse.trailingBytes, 0);
});

test('invalid JSON and incomplete UTF8 remain raw bytes, not parser errors', async context => {
  const expected = Buffer.concat([Buffer.from('data: not-json\n\ndata: '), Buffer.from([0xe5, 0x90])]);
  const current = await fixture(context, (request, response) => response.end(expected));
  const result = await captured(current);
  assert.deepEqual(verifyDiagnostic(result), expected);
  assert.equal(result.diagnostic.sse.frames[0].validJson, false);
  assert.equal(result.diagnostic.sse.trailingBytes, Buffer.byteLength('data: ') + 2);
  assert.equal(result.diagnostic.sse.framingOnlyNotSemanticValidation, true);
});

test('capture and event metadata have bounded size', async context => {
  const expected = Buffer.from(': heartbeat\n\n'.repeat(1030));
  const current = await fixture(context, (request, response) => response.end(expected));
  const result = await captured(current);
  assert.deepEqual(verifyDiagnostic(result), expected);
  assert.equal(result.diagnostic.sse.completeFrames, 1030);
  assert.equal(result.diagnostic.sse.frames.length, 1024);
  assert.equal(result.diagnostic.sse.omittedFrames, 6);
  assert.equal(result.diagnostic.sse.lastCompleteFrameEnd, expected.length);
});

test('oversized response preserves only the bounded prefix with an explicitly partial hash', async context => {
  const limit = 4 * 1024 * 1024;
  const current = await fixture(context, (request, response) => response.end(Buffer.alloc(limit + 1024, 120)));
  const error = await rejected(captured(current, 5000, false), 'response_too_large');
  assert.equal(verifyDiagnostic(error).length, limit);
  assert.equal(error.diagnostic.captureLimitBytes, limit);
  assert(error.diagnostic.receivedBytes > limit);
  assert.equal(error.diagnostic.truncated, true);
  assert.equal(error.diagnostic.capturedAllObservedBytes, false);
  assert.equal(error.diagnostic.hashScope, 'received_prefix_only');
  assert.equal(error.diagnostic.sse, null);
});

test('default API preserves success shape and creates no capture artifacts', async context => {
  const current = await fixture(context, (request, response) => { response.writeHead(201); response.end('SYNTHETIC'); });
  const result = await post(current.endpoint, '{}', false, undefined, 1000);
  assert.deepEqual(Object.keys(result).sort(), ['bytes', 'status']);
  assert.equal(result.status, 201);
  assert.deepEqual(result.bytes, Buffer.from('SYNTHETIC'));
  assert.deepEqual(fs.readdirSync(current.root), []);
});

test('default timeout retains old error code and no diagnostic or artifacts', async context => {
  const current = await fixture(context, (request, response) => response.write('SYNTHETIC'));
  const error = await rejected(post(current.endpoint, '{}', false, undefined, 100), 'transport_timeout');
  assert.equal(Object.hasOwn(error, 'diagnostic'), false);
  assert.deepEqual(fs.readdirSync(current.root), []);
});

test('capture remains passive for HTTP errors and does not retry or follow redirects', async context => {
  const expected = Buffer.from('{"error":{"code":"synthetic_redirect"}}');
  const current = await fixture(context, (request, response) => {
    response.writeHead(302, { location: '/do-not-follow', 'x-private': AUTH_SENTINEL });
    response.end(expected);
  });
  const result = await captured(current, 1000, false);
  assert.equal(result.status, 302);
  assert.deepEqual(verifyDiagnostic(result), expected);
  assert.equal(result.diagnostic.sse, null);
  assert.equal(current.count(), 1);
});

test('authentication callback failure records only safe codes and no credential/header text', async context => {
  const current = await fixture(context, (request, response) => response.end('UNREACHABLE'));
  const error = await rejected(captured(current, 1000, true, () => { throw new Error(AUTH_SENTINEL); }), 'authentication_callback_failed');
  assert.equal(verifyDiagnostic(error).length, 0);
  assert.equal(error.diagnostic.httpStatus, null);
  assert.equal(error.diagnostic.termination, 'authentication_callback_error');
  assert(!JSON.stringify(error).includes(AUTH_SENTINEL));
  assert.equal(current.count(), 0);
});

test('capture paths and undeclared options reject before authentication or HTTP', async context => {
  const current = await fixture(context, (request, response) => response.end('UNREACHABLE'));
  let authentications = 0;
  const authenticate = () => { authentications += 1; };
  await rejected(post(current.endpoint, '{}', true, authenticate, 1000, undefined, { wireCaptureRoot: '/outside-approved-probe' }), 'evidence_out_of_scope');
  const link = path.join(current.root, 'linked');
  const target = path.join(current.root, 'actual');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link);
  await rejected(post(current.endpoint, '{}', true, authenticate, 1000, undefined, { wireCaptureRoot: link }), 'unsafe_evidence_directory');
  await rejected(post(current.endpoint, '{}', true, authenticate, 1000, undefined, { wireCaptureRoot: current.root, headers: {} }), 'undeclared_or_missing_field');
  assert.equal(authentications, 0);
  assert.equal(current.count(), 0);
});

test('capture write failure closes transport and preserves original safe failure plus partial file', async context => {
  const current = await fixture(context, (request, response) => response.end('SYNTHETIC'));
  const originalWrite = fs.writeSync;
  let injected = false;
  context.mock.method(fs, 'writeSync', function (descriptor, buffer, ...remaining) {
    if (!injected && Buffer.isBuffer(buffer) && buffer.toString() === 'SYNTHETIC') {
      injected = true;
      throw new Error(AUTH_SENTINEL);
    }
    return originalWrite.call(fs, descriptor, buffer, ...remaining);
  });
  const error = await rejected(captured(current), 'wire_capture_write_failed');
  assert.equal(verifyDiagnostic(error).length, 0);
  assert.equal(error.diagnostic.receivedBytes, Buffer.byteLength('SYNTHETIC'));
  assert.equal(error.diagnostic.truncated, true);
  assert.equal(error.diagnostic.termination, 'capture_write_error');
  assert.equal(current.count(), 1);
});

test('absolute timeout is not extended by ongoing SSE heartbeats', async context => {
  let interval;
  const current = await fixture(context, (request, response) => {
    response.writeHead(200);
    response.write(': heartbeat\n\n');
    interval = setInterval(() => response.write(': heartbeat\n\n'), 20);
    response.on('close', () => clearInterval(interval));
  });
  context.after(() => clearInterval(interval));
  const error = await rejected(captured(current, 200), 'transport_timeout');
  verifyDiagnostic(error);
  assert(error.diagnostic.chunksReceived > 1);
  assert.equal(error.diagnostic.timeoutMs, 200);
  assert(error.diagnostic.elapsedMs >= 190 && error.diagnostic.elapsedMs < 1000);
  assert.equal(current.count(), 1);
});

console.log(`Local HTTP wire-capture evidence only: ${runRoot}`);
