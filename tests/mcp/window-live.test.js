'use strict';

// The coordinating task owns the UI lock and fixture lifecycle. Run only under
// that lock; this file never launches/stops the fixture or sends click/type input.
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MCPStdioClient, EvidenceRecorder } = require('./tools/macos-smoke/main.js');

const root = path.resolve(__dirname, '../..');
const title = 'OpenDesk Accessibility Fixture';
const binaryInput = process.env.OPENDESK_MCP_BINARY;
const receiptInput = process.env.OPENDESK_WINDOW_FIXTURE_RECEIPT;

function existingAbsoluteFile(value) {
  try { return typeof value === 'string' && path.isAbsolute(value) && fs.statSync(value).isFile(); }
  catch { return false; }
}

const skip = process.platform !== 'darwin' ? 'requires macOS and the coordinating task UI lock' :
  !existingAbsoluteFile(binaryInput) || !existingAbsoluteFile(receiptInput) ?
    'set OPENDESK_MCP_BINARY and OPENDESK_WINDOW_FIXTURE_RECEIPT to existing absolute files' : false;

// Avoid assert's actual/expected rendering: an invalid response may contain a
// protected value, a foreign window title, or an image. Fail with fixed messages.
function check(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.name = 'WindowLiveCheckError';
    throw error;
  }
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function sameKeys(value, keys) {
  return object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function noImageData(value) {
  if (Array.isArray(value)) { value.forEach(noImageData); return; }
  if (object(value)) {
    for (const [key, item] of Object.entries(value)) {
      check(['imageWidth', 'imageHeight'].includes(key) || !/raw|image|base64|dataurl|png|bytes|buffer/i.test(key),
        'window result contains a forbidden raw/image field');
      noImageData(item);
    }
  } else if (typeof value === 'string') {
    check(!/data:image\/|iVBORw0KGgo|\/9j\/4AAQ/i.test(value), 'window result contains encoded image data');
  }
}
function fixtureWindow(value, receipt, foreground = false) {
  check(object(value), 'fixture window must be an object');
  check(value.id === receipt.windowId, 'fixture exact window identity mismatch');
  check(value.pid === receipt.pid && value.title === title, 'fixture PID/title mismatch');
  check(Number(value.handle) === receipt.windowNumber, 'fixture native handle mismatch');
  for (const key of ['x', 'y', 'width', 'height']) check(Number.isInteger(value[key]), 'window geometry must use integers');
  check(value.width > 0 && value.height > 0, 'fixture dimensions must be positive');
  if (foreground) check(value.isForeground === true, 'fixture is no longer foreground; stop without reactivation');
  return Object.fromEntries(['id', 'pid', 'title', 'handle', 'x', 'y', 'width', 'height', 'isForeground']
    .map(key => [key, value[key]]));
}
function verifySchema(tool) {
  check(object(tool) && tool.name === 'tm_window', 'fresh discovery must contain tm_window');
  const schema = tool.inputSchema;
  check(object(schema) && schema.type === 'object' && schema.additionalProperties === false,
    'tm_window must publish a strict object schema');
  check(JSON.stringify(schema.required) === JSON.stringify(['windowId', 'operation']), 'window required fields changed');
  check(sameKeys(schema.properties, ['windowId', 'operation', 'region']), 'window schema property set changed');
  check(schema.properties.windowId.type === 'string', 'windowId schema must be string');
  check(schema.properties.operation.type === 'string' &&
    JSON.stringify(schema.properties.operation.enum) === JSON.stringify(['activate', 'read', 'ocr']), 'window operations changed');
  const region = schema.properties.region;
  check(region.type === 'object' && region.additionalProperties === false, 'region schema must be strict');
  const coordinates = ['x', 'y', 'width', 'height'];
  check(JSON.stringify(region.required) === JSON.stringify(coordinates) && sameKeys(region.properties, coordinates),
    'region must require exactly four coordinates');
  for (const key of coordinates) check(region.properties[key].type === 'integer', 'region coordinate schema must be integer');
}

// One ordered live scenario intentionally stops on the first failure. Splitting
// into independent live tests would permit OCR/input replay after a failed step.
test('real MCP window observes only the receipt fixture and activates it once', { skip, timeout: 90_000 }, async t => {
  const binary = fs.realpathSync(binaryInput);
  fs.accessSync(binary, fs.constants.X_OK);
  const receipt = JSON.parse(fs.readFileSync(receiptInput, 'utf8'));
  check(receipt.schemaVersion === 1 && receipt.status === 'ready', 'fixture receipt is not ready');
  check(Number.isSafeInteger(receipt.pid) && receipt.pid > 0, 'fixture receipt has invalid PID');
  check(Number.isSafeInteger(receipt.windowNumber) && receipt.windowNumber > 0, 'fixture receipt has invalid native handle');
  check(receipt.windowId === `darwin:${receipt.pid}:native:${receipt.windowNumber}`, 'fixture receipt identity is inconsistent');

  const base = path.join(root, '.runtime/tests/mcp-window');
  fs.mkdirSync(base, { recursive: true });
  const evidence = fs.mkdtempSync(path.join(base, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-`));
  t.diagnostic(`evidence: ${evidence}`);
  const recorder = new EvidenceRecorder(evidence, 'window-live');
  const summary = { status: 'FAIL', binary, binarySha256: crypto.createHash('sha256')
    .update(fs.readFileSync(binary)).digest('hex'), receiptPath: receiptInput,
  fixture: { pid: receipt.pid, windowId: receipt.windowId, windowNumber: receipt.windowNumber },
  startedAt: new Date().toISOString(), activationCalls: 0, stage: 'start', exit: null };
  let forcedShutdown = false;
  let frameCount = 0;
  // Never forward the client's private response/message/stderr fields. Both raw
  // stream sinks are /dev/null: even a failing server cannot persist base64 or
  // unrelated window titles through the reusable client's automatic logging.
  const privateRecorder = {
    append(event) {
      if (['shutdown_timeout', 'process_terminate'].includes(event.event)) forcedShutdown = true;
      if (event.event === 'response') frameCount++;
      recorder.append({ event: event.event, run: 'window-live',
        ...(Number.isInteger(event.pid) ? { pid: event.pid } : {}),
        ...(event.event === 'process_exit' ? { code: event.code, signal: event.signal } : {}) });
    },
  };
  const client = new MCPStdioClient({ binary, args: [], cwd: root, timeoutMs: 15_000,
    runName: 'window-live', recorder: privateRecorder, stdoutPath: '/dev/null', stderrPath: '/dev/null' });

  async function call(name, args = {}) {
    const response = await client.request('tools/call', { name, arguments: args });
    check(object(response) && response.isError !== true, 'MCP tool returned an error; no retry');
    check(Array.isArray(response.content) && response.content.length === 1 &&
      response.content[0].type === 'text' && typeof response.content[0].text === 'string',
    'window tool must return one JSON text block without image content');
    let payload;
    try { payload = JSON.parse(response.content[0].text); }
    catch { throw new Error('MCP tool text must be JSON'); }
    check(object(payload), 'MCP tool payload must be an object');
    noImageData(payload);
    return payload;
  }
  async function listedFixture(foreground = false) {
    const payload = await call('tm_list_windows');
    check(Array.isArray(payload.windows), 'window list must be an array');
    const matches = payload.windows.filter(row => object(row) && row.id === receipt.windowId);
    check(matches.length === 1, 'receipt window is absent or ambiguous; no fallback');
    return fixtureWindow(matches[0], receipt, foreground);
  }
  async function foregroundFixture() {
    const active = await call('tm_get_active_window');
    // This metadata tool currently has no id field. Verify its native PID/handle
    // against the receipt AND an exact-id foreground row from a fresh list.
    check(active.pid === receipt.pid && active.title === title &&
      Number(active.handle) === receipt.windowNumber && active.isForeground === true,
    'active window is not the receipt fixture; stop without reactivation');
    if (Object.hasOwn(active, 'id')) check(active.id === receipt.windowId, 'active window ID mismatch');
    const selected = await listedFixture(true);
    for (const key of ['x', 'y', 'width', 'height']) check(active[key] === selected[key], 'active/list geometry changed');
    return selected;
  }

  let failure;
  try {
    await client.start();
    summary.stage = 'initialize';
    const initialized = await client.request('initialize', { protocolVersion: '2025-11-25', capabilities: {},
      clientInfo: { name: 'opendesk-window-live-test', version: '1.0.0' } });
    check(initialized.protocolVersion === '2025-11-25', 'MCP protocol negotiation mismatch');
    await client.notify('notifications/initialized');

    summary.stage = 'permissions';
    const permissions = await call('tm_permissions');
    check(permissions.ok === true && permissions.accessibility === true && permissions.screenCapture === true,
      'screen capture and Accessibility permissions must all be true');
    recorder.writeJSON('permissions.json', { ok: true, accessibility: true, screenCapture: true });

    summary.stage = 'schema';
    const discovery = await client.request('tools/list');
    check(Array.isArray(discovery.tools), 'tool discovery must return an array');
    const tools = discovery.tools.filter(tool => object(tool) && tool.name === 'tm_window');
    check(tools.length === 1, 'tm_window registration is absent or duplicated');
    verifySchema(tools[0]);
    recorder.writeJSON('window-schema.json', { name: tools[0].name, inputSchema: tools[0].inputSchema });

    summary.stage = 'fixture';
    const selected = await listedFixture();
    recorder.writeJSON('fixture-window.json', selected);

    summary.stage = 'read';
    const read = await call('tm_window', { windowId: receipt.windowId, operation: 'read' });
    check(read.ok === true && read.operation === 'read' && read.source === 'window.getContent', 'native read source mismatch');
    const readWindow = fixtureWindow(read.window, receipt);
    check(typeof read.text === 'string' && read.text.includes('initial value') && read.text.includes('read only'),
      'native read must contain fixture editable and read-only values');
    check(!/fixture secret/i.test(JSON.stringify(read)), 'native read leaked the protected fixture value');
    check(!read.text.includes('This repository-owned window deliberately takes focus'),
      'native read leaked sibling-window content');
    // The static label "Protected value" is allowed; only its secret is forbidden.
    recorder.writeJSON('read.json', { ok: true, source: read.source, window: readWindow,
      text: read.text, capturedAt: read.capturedAt });

    summary.stage = 'activate';
    summary.activationCalls++;
    const activated = await call('tm_window', { windowId: receipt.windowId, operation: 'activate' });
    check(activated.ok === true && activated.verified === true && activated.operation === 'activate',
      'activation postcondition failed; stop without replay');
    fixtureWindow(activated.window, receipt, true);
    const before = await foregroundFixture();
    recorder.writeJSON('activated-window.json', before);

    summary.stage = 'ocr';
    // Fixture main.m places the heading at the top, before status/buttons and
    // every input row. Observe only that header, excluding protected inputs.
    const region = { x: 0, y: 0, width: Math.min(before.width, 720), height: Math.min(before.height, 80) };
    check(region.width * region.height <= 2_000_000, 'OCR region exceeds logical pixel budget');
    const observed = await call('tm_window', { windowId: receipt.windowId, operation: 'ocr', region });
    check(observed.ok === true && observed.operation === 'ocr' && observed.source === 'local-ocr', 'OCR source mismatch');
    fixtureWindow(observed.window, receipt, true);
    const { ocr, capture } = observed;
    check(object(ocr) && ocr.provider === 'local' && ocr.lang === 'eng', 'OCR must use local/eng provider');
    check(typeof ocr.text === 'string' && ocr.text.trim().length > 0, 'local OCR returned empty text');
    check(Array.isArray(ocr.lines) && ocr.lines.length > 0 && ocr.lineCount === ocr.lines.length, 'OCR lines/count mismatch');
    check(object(capture) && object(capture.screenBounds), 'OCR measured capture metadata missing');
    for (const key of ['imageWidth', 'imageHeight']) check(Number.isSafeInteger(capture[key]) && capture[key] > 0,
      'OCR PNG dimensions must be measured positive integers');
    check(capture.imageWidth * capture.imageHeight <= 32_000_000, 'OCR PNG pixel budget exceeded');
    const expected = { x: before.x, y: before.y, width: region.width, height: region.height };
    recorder.writeJSON('capture-mapping.json', { expected, actual: capture.screenBounds,
      imageWidth: capture.imageWidth, imageHeight: capture.imageHeight });
    check(sameKeys(capture.screenBounds, Object.keys(expected)), 'capture bounds shape mismatch');
    for (const [key, value] of Object.entries(expected)) check(capture.screenBounds[key] === value, 'window-local capture mapping mismatch');
    check(typeof capture.coordinates === 'string' && capture.coordinates.includes('imageX*screenBounds.width/imageWidth') &&
      capture.coordinates.includes('likewise y'), 'OCR image-to-screen formula missing');
    check(typeof capture.capturedAt === 'string' && Number.isFinite(Date.parse(capture.capturedAt)), 'capture timestamp missing');
    const mappedLines = ocr.lines.map(line => {
      check(object(line) && typeof line.text === 'string' && object(line.bbox), 'OCR line/bbox missing');
      const box = line.bbox;
      for (const key of ['x', 'y', 'width', 'height']) check(Number.isInteger(box[key]) && box[key] >= 0, 'invalid OCR pixel bbox');
      check(box.width > 0 && box.height > 0 && box.x + box.width <= capture.imageWidth &&
        box.y + box.height <= capture.imageHeight, 'OCR bbox lies outside measured PNG');
      check(Number.isFinite(line.confidence) && line.confidence >= 0 && line.confidence <= 1, 'OCR confidence out of range');
      const scaleX = expected.width / capture.imageWidth;
      const scaleY = expected.height / capture.imageHeight;
      return { text: line.text, confidence: line.confidence,
        bbox: { x: box.x, y: box.y, width: box.width, height: box.height },
        screenBounds: { x: expected.x + box.x * scaleX, y: expected.y + box.y * scaleY,
          width: box.width * scaleX, height: box.height * scaleY } };
    });
    check(mappedLines.some(line => line.text.trim().length > 0), 'OCR lines contain no recognized text');
    const after = await foregroundFixture();
    for (const key of ['x', 'y', 'width', 'height']) {
      check(after[key] === before[key] && observed.window[key] === before[key], 'fixture changed during OCR; discard');
    }
    recorder.writeJSON('ocr.json', { source: 'local-ocr', window: after, provider: ocr.provider, lang: ocr.lang,
      text: ocr.text, lines: mappedLines, capture: { screenBounds: expected, imageWidth: capture.imageWidth,
        imageHeight: capture.imageHeight, coordinates: capture.coordinates, capturedAt: capture.capturedAt } });
    summary.stage = 'close';
  } catch (error) {
    // No response-derived message, error data, or assertion value reaches logs.
    failure = new Error(`window live verification failed at ${summary.stage}; no retry or fallback`);
    failure.name = 'WindowLiveVerificationError';
    if (error.name === 'WindowLiveCheckError') {
      summary.failureReason = error.message;
      failure.message += `: ${error.message}`;
    }
  } finally {
    try {
      summary.exit = await client.close(); // EOF only to this test's MCP child.
      check(summary.exit && summary.exit.code === 0 && summary.exit.signal === null, 'MCP child did not close cleanly');
      check(!forcedShutdown, 'EOF close required forced termination');
      check(frameCount > 0 && client.protocolViolations.length === 0 && client.stdoutBuffer === '',
        'stdout must contain only valid JSON-RPC frames through EOF');
      check(client.pending.size === 0, 'MCP requests remain pending after close');
      summary.stdoutJSONOnly = true;
    } catch {
      summary.stdoutJSONOnly = false;
      failure = failure || new Error('window live verification failed during EOF/stdout verification');
    }
    summary.finishedAt = new Date().toISOString();
    summary.protocolViolationCount = client.protocolViolations.length;
    summary.status = failure ? 'FAIL' : 'PASS';
    recorder.writeJSON('summary.json', summary);
  }
  if (failure) throw failure;
});
