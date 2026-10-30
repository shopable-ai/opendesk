// Trusted host code, not a sandbox. GET only; never import into the browser.
import { normalizePage, readBounded, rejectCredentialEcho, MAX_RESPONSE_BYTES,
  MAX_PAGE_RECORDS, REQUEST_TIMEOUT_MS } from './generic-page.mjs';

// Developer must review/edit exact HTTPS endpoints here before production use.
// No wildcard, env-provided allowlist, arbitrary path, query, or redirect support.
const APPROVED_HTTPS_ENDPOINTS = Object.freeze([]);
function approvedEndpoint() {
  const url = new URL(process.env.BUSINESS_HTTP_ENDPOINT);
  if (url.username || url.password || url.search || url.hash) throw new Error();
  const localTest = process.env.BUSINESS_HTTP_ALLOW_LOOPBACK === '1' && url.protocol === 'http:' &&
    ['127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/records';
  if (!localTest && !(url.protocol === 'https:' && APPROVED_HTTPS_ENDPOINTS.includes(url.href))) throw new Error();
  return url;
}
export default {
  id: 'generic-http',
  async pull(context) {
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = approvedEndpoint();
      const token = process.env.BUSINESS_HTTP_TOKEN;
      if (typeof token !== 'string' || !token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new Error();
      url.searchParams.set('store', context.storeId);
      url.searchParams.set('source', context.sourceId);
      url.searchParams.set('limit', String(MAX_PAGE_RECORDS));
      if (context.cursor !== null) url.searchParams.set('cursor', context.cursor);
      response = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { accept: 'application/json', authorization: 'Bearer ' + token } });
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error();
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new Error();
      const page = await readBounded(response.body);
      rejectCredentialEcho(page, token);
      const normalized = normalizePage(page, context);
      rejectCredentialEcho(normalized, token);
      return normalized;
    } catch { throw new Error('BUSINESS_ADAPTER_FAILED'); }
    finally {
      clearTimeout(timer);
      controller.abort(); // Also release unread redirect/error bodies.
    }
  },
};
