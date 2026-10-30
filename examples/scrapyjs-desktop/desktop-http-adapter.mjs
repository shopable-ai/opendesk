// ScrapyJS Desktop HTTP transport adapter. Not a copy of the Browser R2.2 schema.
// Only trusted local OpenDesk file executions can use http.download().
const HEADER_NAMES = Object.freeze(['accept', 'accept-language', 'user-agent']);
const LIMITS = Object.freeze({pages: 3, requests: 3, bytes: 512 * 1024, timeoutMs: 20000});

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keysOnly(value, keys, code) {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key))) fail(code);
}
function positiveInt(value, limit) { return Number.isSafeInteger(value) && value >= 1 && value <= limit; }
function strictURL(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\/[^/?#]+/i.test(value) || /[\\\s#]/.test(value)) fail('E_URL');
  const authority = /^https?:\/\/([^/?#]+)/i.exec(value)[1];
  if (authority.includes('@')) fail('E_URL_CREDENTIALS');
  let url;
  try { url = new URL(value); } catch (_) { fail('E_URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) fail('E_URL');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.startsWith('[')) fail('E_PRIVATE_HOST');
  // Native download validates TLS and redirect origin. DNS rebinding protection is NOT exposed to JS.
  if (/^\d+(?:\.\d+){3}$/.test(host) && host !== '127.0.0.1') fail('E_IP_LITERAL');
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..') || host.startsWith('.') || host.endsWith('.')) fail('E_HOST');
  if (url.protocol === 'http:' && host !== '127.0.0.1') fail('E_HTTPS_REQUIRED');
  return url;
}

export function validateDesktopHttpProjection(input) {
  keysOnly(input, ['executionPlan', 'headerProfile'], 'E_INPUT_SHAPE');
  const p = input.executionPlan;
  keysOnly(p, ['executor', 'method', 'targetOrigins', 'urls', 'limits'], 'E_PLAN_SHAPE');
  if (p.executor !== 'desktop-http' || p.method !== 'GET' || !Array.isArray(p.targetOrigins) || !Array.isArray(p.urls) ||
      !p.urls.length || p.urls.length > LIMITS.pages || p.targetOrigins.length < 1 || p.targetOrigins.length > LIMITS.pages) fail('E_PLAN_SCOPE');
  const limits = p.limits;
  keysOnly(limits, ['maxPages', 'maxRequests', 'maxBytesPerPage', 'timeoutMs'], 'E_LIMITS');
  if (!positiveInt(limits.maxPages, LIMITS.pages) || !positiveInt(limits.maxRequests, LIMITS.requests) ||
      !positiveInt(limits.maxBytesPerPage, LIMITS.bytes) || !positiveInt(limits.timeoutMs, LIMITS.timeoutMs) ||
      p.urls.length > limits.maxPages || p.urls.length > limits.maxRequests ||
      p.urls.length * limits.timeoutMs > 60000) fail('E_LIMITS');
  const origins = p.targetOrigins.map(origin => {
    const url = strictURL(origin);
    if (url.origin !== origin || url.pathname !== '/' || url.search) fail('E_ORIGIN');
    return origin;
  });
  if (new Set(origins).size !== origins.length) fail('E_ORIGIN_DUPLICATE');
  const urls = p.urls.map(value => {
    const url = strictURL(value);
    if (!origins.includes(url.origin)) fail('E_ORIGIN_DENIED');
    return url.href;
  });
  if (new Set(urls).size !== urls.length) fail('E_URL_DUPLICATE');
  const h = input.headerProfile;
  keysOnly(h, ['headers'], 'E_HEADERS');
  if (!record(h.headers)) fail('E_HEADERS');
  const headers = {};
  for (const [name, value] of Object.entries(h.headers)) {
    const lowered = name.toLowerCase();
    if (!HEADER_NAMES.includes(lowered) || Object.keys(headers).some(k => k.toLowerCase() === lowered)) fail('E_HEADER_DENIED');
    if (typeof value !== 'string' || !value.length || value.length > 256 || !/^[\x20-\x7e]+$/.test(value)) fail('E_HEADER_VALUE');
    const canonical = {'accept': 'Accept', 'accept-language': 'Accept-Language', 'user-agent': 'User-Agent'}[lowered];
    headers[canonical] = value;
  }
  return Object.freeze({urls, origins, headers, limits: {...limits}});
}

function inspectBody(text) {
  if (typeof text !== 'string' || text.includes('\u0000') || text.includes('\ufffd')) fail('E_RESPONSE_ENCODING');
  const trimmed = text.replace(/^\ufeff/, '').trimStart();
  try {
    const value = JSON.parse(trimmed);
    const count = Array.isArray(value) ? value.length : 0;
    const claimed = record(value) && value.fixture === 'scrapyjs-headers-v1' && record(value.headers) ? value.headers : null;
    return {kind: 'json', recordCount: count, fixtureClaimedHeaders: claimed};
  } catch (_) { /* It may be HTML. */ }
  if (/^<!doctype\s+html\b/i.test(trimmed) || /^<html(?:\s|>)/i.test(trimmed) || /^<body(?:\s|>)/i.test(trimmed)) {
    return {kind: 'html', recordCount: 0, fixtureClaimedHeaders: null};
  }
  fail('E_RESPONSE_TYPE');
}

function safeErrorCode(error) {
  const raw = error && typeof error.code === 'string' ? error.code : '';
  return ['DOWNLOAD_DISABLED', 'INVALID_ARGUMENT', 'INVALID_URL', 'HTTP_STATUS', 'REDIRECT_DENIED',
    'MAX_BYTES_EXCEEDED', 'SHA256_MISMATCH', 'TARGET_EXISTS', 'CANCELED', 'TIMEOUT', 'IO_FAILED',
    'E_RESPONSE_ENCODING', 'E_RESPONSE_TYPE', 'E_DOWNLOAD_RESULT'].includes(raw) ? raw : 'E_DOWNLOAD_FAILED';
}

export async function runDesktopHttp(input, runtime, opts = {}) {
  const config = validateDesktopHttpProjection(input); // reject before any I/O
  const {http, File, Execution} = runtime || {};
  if (!http || typeof http.download !== 'function' || !File || !Execution ||
      !Execution.scriptPath || typeof Execution.artifactDir !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(Execution.id || '') || opts.localOperatorApproved !== true) fail('E_TRUSTED_LOCAL_ONLY');
  const dir = File.join(Execution.artifactDir, 'scrapyjs-desktop', Execution.id);
  File.ensureDir(dir);
  const pages = [];
  let requested = 0;
  let status = 'completed';
  let errorCode = null;
  for (let index = 0; index < config.urls.length; index++) {
    const url = config.urls[index];
    const output = File.join(dir, 'page-' + (index + 1) + '.body'); // inert extension; never execute downloaded HTML
    requested++;
    try {
      const result = await http.download(url, {
        path: output, headers: {...config.headers}, timeout: config.limits.timeoutMs,
        maxBytes: config.limits.maxBytesPerPage, overwrite: false,
        createDirs: false, allowCrossOriginRedirects: false, signal: opts.signal,
      });
      if (!result || result.committed !== true || result.status !== 200 ||
          !positiveInt(result.bytesWritten, config.limits.maxBytesPerPage) ||
          !/^[0-9a-f]{64}$/i.test(result.sha256 || '') ||
          !File.stat || File.stat(output)?.type !== 'file' || File.stat(output)?.size !== result.bytesWritten) fail('E_DOWNLOAD_RESULT');
      const info = inspectBody(File.read(output));
      pages.push({index: index + 1, origin: new URL(url).origin, statusCode: result.status,
        path: output, bytes: result.bytesWritten, sha256: result.sha256, kind: info.kind,
        recordCount: info.recordCount,
        // Only a controlled echo fixture may supply this claim, not a Runtime wire observation.
        fixtureClaimedHeaders: new URL(url).hostname === '127.0.0.1' ? info.fixtureClaimedHeaders : null});
    } catch (error) {
      errorCode = safeErrorCode(error);
      status = errorCode === 'CANCELED' ? 'stopped' : 'failed';
      break; // no retries, no second origin, no silent fallback
    }
  }
  const receipt = {
    format: 'scrapyjs.desktop-http.local-receipt.v1', // NOT the unpublished Browser RunReceipt
    executor: 'desktop-http', executionId: Execution.id, status, errorCode,
    requestedCount: requested, completedCount: pages.length,
    origins: config.origins, submittedHeaderValues: config.headers,
    actualWireHeaders: 'NOT_OBSERVABLE_FROM_DESKTOP_API',
    pages,
  };
  // Never emit URLs, bodies or header values to the console. The receipt stays in the execution artifact directory.
  const receiptPath = File.join(dir, 'receipt.json');
  File.writeNew(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  return {receiptPath, ...receipt};
}
