// From the repository root, with a test server you control:
// OPENDESK_EXAMPLE_HTTP_URL=http://127.0.0.1:8080/echo ./opendesk -script examples/runtime/http.js -console-mode script
// No built-in server address or credentials. GET by default; POST/PUT/PATCH/DELETE also require ALLOW_WRITE=1.
// Response bodies and URLs are not logged. A 2xx response proves request completion, not server persistence.
'use strict';
const configured = Execution.env.OPENDESK_EXAMPLE_HTTP_URL;
if (typeof configured !== 'string' || !configured.trim()) throw new Error('Set OPENDESK_EXAMPLE_HTTP_URL to your test endpoint');
// Runtime URL is intentionally smaller than browser WHATWG URL; inspect userinfo in the raw authority.
const authority = /^https?:\/\/([^/?#]+)/i.exec(configured);
if (!authority || /[@\\\s]/.test(authority[1])) throw new Error('HTTP example URL authority must not contain credentials, whitespace or backslashes');
let endpoint;
try { endpoint = new URL(configured); }
catch (_) { throw new Error('HTTP example requires a valid http/https URL'); }
if (!['http:', 'https:'].includes(endpoint.protocol) || !endpoint.hostname || endpoint.hash) {
  throw new Error('HTTP example requires http/https, no embedded credentials and no fragment');
}
const method = String(Execution.env.OPENDESK_EXAMPLE_HTTP_METHOD || 'GET').toUpperCase();
if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Unsupported HTTP example method');
if (method !== 'GET' && Execution.env.OPENDESK_EXAMPLE_ALLOW_WRITE !== '1') {
  throw new Error('Mutation requires OPENDESK_EXAMPLE_ALLOW_WRITE=1 and a disposable test endpoint');
}
const config = { url: endpoint.href, method, timeout: 5000 };
if (method === 'GET') config.params = { name: 'opendesk-example', value: 123 };
else if (method !== 'DELETE') config.data = { name: 'opendesk-example', value: 123 };
if (Execution.env.OPENDESK_EXAMPLE_HTTP_FORM === '1') {
  if (method !== 'POST') throw new Error('HTTP_FORM=1 is supported only with POST');
  const form = new URLSearchParams();
  form.append('name', 'opendesk-example');
  form.append('value', '123');
  config.data = form;
}
let response;
try { response = await axios.request(config); }
catch (_) { throw new Error('HTTP example request failed; check test-server availability/status and the 5000 ms timeout (URL/body omitted)'); }
if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
  throw new Error('HTTP example: expected a successful 2xx response');
}
console.log('[HTTP-EXAMPLE] ' + JSON.stringify({ status: 'request-completed', method, statusCode: response.status, persistenceVerified: false }));
