/** R2.4-A: independent, read-only upstream probe. Never loaded by the desktop Go app. */
import { mkdir, readFile, rename, unlink, writeFile, open } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE = 'https://codex-reset.com/';
export const ENDPOINTS = Object.freeze(['forecast', 'timeline', 'feed', 'status-history']);
export const INTERVAL_MS = 60_000;
export const MAX_AGE_MS = 30 * 60_000; // probe policy; NOT an upstream SLA
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'OpenDesk-Reset-Clock-Probe/0.1 (+https://github.com/shopable-ai/opendesk)';

function isObject(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function validTime(x) { return typeof x === 'string' && Number.isFinite(Date.parse(x)) && /^\d{4}-\d\d-\d\dT/.test(x); }
function httpsURL(x) { try { const u = new URL(x); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.hash ? u.href : null; } catch { return null; } }
function oneLine(x, limit = 200) { return typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, limit) : ''; }
function safeTime(x) { return validTime(x) ? new Date(x).toISOString() : null; }
function newerThan(input, now, maxAgeMs = MAX_AGE_MS) {
  const t = safeTime(input);
  return t !== null && Date.parse(t) <= now + 5 * 60_000 && now - Date.parse(t) <= maxAgeMs;
}
function retryDelay(header, now) {
  if (typeof header !== 'string' || !header.trim()) return INTERVAL_MS;
  const n = Number(header.trim());
  const delay = Number.isFinite(n) && n >= 0 ? n * 1000 : (validTime(header) || !Number.isNaN(Date.parse(header)) ? Date.parse(header) - now : INTERVAL_MS);
  return Math.min(60 * 60_000, Math.max(INTERVAL_MS, Number.isFinite(delay) ? delay : INTERVAL_MS));
}
function fail(kind, details = {}) { const e = new Error(kind); e.kind = kind; Object.assign(e, details); return e; }
function cacheDelay(headers, nowMs) {
  const control = headers.get('cache-control') ?? '';
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(control)?.[1];
  const maxAgeMs = maxAge ? Math.min(60 * 60_000, Number(maxAge) * 1000) : 0;
  const expires = headers.get('x-published-expires-at');
  const expiresDelay = expires && validTime(expires) ? Math.min(60 * 60_000, Math.max(0, Date.parse(expires) - nowMs)) : 0;
  return Math.max(INTERVAL_MS, maxAgeMs, expiresDelay);
}

/** Only four hardcoded HTTPS GET paths; no cookies, auth, crawler or redirect. */
export async function requestEndpoint(name, {
  fetchImpl = globalThis.fetch, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)),
  state = {}, saveState = async () => {}, timeoutMs = 8_000, maxAttempts = 2
} = {}) {
  if (!ENDPOINTS.includes(name)) throw fail('unapproved_endpoint');
  const url = new URL(`/api/${name}`, SOURCE).href;
  const info = { url, status: 'unavailable', attempts: 0 };
  const start = now();
  if ((state[name]?.next_allowed_at ?? 0) > start) {
    return { ...info, status: 'rate_limited', retry_at: new Date(state[name].next_allowed_at).toISOString(), error: 'local_minimum_interval' };
  }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const started = now();
    // Persist BEFORE each request; never make a second request within the 60s minimum.
    state[name] = { next_allowed_at: started + INTERVAL_MS };
    await saveState(state);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      info.attempts++;
      info.http_status = res.status;
      info.headers = {
        cache_control: res.headers.get('cache-control'), etag: res.headers.get('etag'),
        last_modified: res.headers.get('last-modified'), retry_after: res.headers.get('retry-after'),
        published_checked_at: res.headers.get('x-published-checked-at'),
        published_expires_at: res.headers.get('x-published-expires-at')
      };
      if (res.status === 200) {
        state[name].next_allowed_at = Math.max(state[name].next_allowed_at, now() + cacheDelay(res.headers, now()));
        await saveState(state);
      }
      if (res.status === 429) {
        const waitMs = retryDelay(res.headers.get('retry-after'), now());
        state[name].next_allowed_at = now() + waitMs;
        await saveState(state);
        return { ...info, status: 'rate_limited', retry_at: new Date(state[name].next_allowed_at).toISOString(), error: 'upstream_429' };
      }
      if (res.status === 304) return { ...info, error: '304_without_verified_cache' };
      if (res.status >= 500 && res.status <= 599 && attempt + 1 < maxAttempts) {
        await sleep(INTERVAL_MS); // even failed requests never bypass the minimum interval
        continue;
      }
      if (res.status !== 200) return { ...info, error: `http_${res.status}` };
      if (!res.headers.get('content-type')?.toLowerCase().includes('json')) return { ...info, error: 'unexpected_content_type' };
      const declared = Number(res.headers.get('content-length'));
      if (declared > MAX_BODY_BYTES) return { ...info, error: 'oversized_json' };
      let count = 0;
      const chunks = [];
      if (!res.body) return { ...info, error: 'empty_body' };
      for await (const chunk of res.body) {
        count += chunk.byteLength;
        if (count > MAX_BODY_BYTES) return { ...info, error: 'oversized_json' };
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { return { ...info, error: 'invalid_json' }; }
      if (!isObject(data)) return { ...info, error: 'json_not_object' };
      return { ...info, status: 'received', duration_ms: Math.max(0, now() - started), data };
    } catch (err) {
      info.attempts++;
      const aborted = abort.signal.aborted || err?.name === 'AbortError';
      info.error = aborted ? 'timeout' : 'network_failure';
      if (attempt + 1 < maxAttempts) { await sleep(INTERVAL_MS); continue; }
      return { ...info };
    } finally { clearTimeout(timer); }
  }
  return info;
}

/** Strict enough for evidence-based classification, but not a substitute for upstream schema versioning. */
export function inspect(name, item, atMs, maxAgeMs = MAX_AGE_MS) {
  const raw = item?.data;
  const info = { name, status: 'unavailable', checked_at: null, error: item?.error ?? 'no_response' };
  if (item?.status !== 'received') return info;
  if (!isObject(raw)) return { ...info, status: 'invalid', error: 'invalid_json_root' };
  let checkedAt;
  let valid;
  let count = 0;
  switch (name) {
    case 'forecast':
      checkedAt = raw.updated_at ?? item.headers?.published_checked_at;
      valid = isObject(raw.probabilities) && Number.isFinite(raw.probabilities.rounded_24h)
        && Number.isFinite(raw.probabilities.rounded_48h) && typeof raw.confidence === 'string'
        && (raw.last_reset_at === null || validTime(raw.last_reset_at)) && 'official_signal' in raw;
      break;
    case 'timeline':
      checkedAt = raw.updated_at ?? item.headers?.published_checked_at;
      valid = Array.isArray(raw.events) && raw.events.every(e => isObject(e) && typeof e.id === 'string'
        && typeof e.group === 'string' && typeof e.announcement_state === 'string'
        && typeof e.type === 'string' && typeof e.summary === 'string' && validTime(e.announced_at));
      count = Array.isArray(raw.events) ? raw.events.length : 0;
      break;
    case 'feed':
      checkedAt = raw.fetched_at ?? item.headers?.published_checked_at;
      valid = Array.isArray(raw.tweets) && Array.isArray(raw.events) && 'signal' in raw
        && typeof raw.stale === 'boolean' && validTime(raw.fetched_at)
        && (raw.newest_post_at === null || validTime(raw.newest_post_at));
      count = Array.isArray(raw.tweets) ? raw.tweets.length : 0;
      break;
    case 'status-history':
      checkedAt = raw.checked_at ?? item.headers?.published_checked_at;
      valid = isObject(raw.current) && Array.isArray(raw.surfaces) && Array.isArray(raw.incidents)
        && 'compensation_links' in raw && 'stats' in raw && typeof raw.stale === 'boolean';
      count = Array.isArray(raw.incidents) ? raw.incidents.length : 0;
      break;
    default: throw fail('unapproved_endpoint');
  }
  const contentUpdatedAt = safeTime(checkedAt);
  // `updated_at` may describe the last content change, not the most recent published-copy check.
  // Use the documented publication check header when available; preserve both clocks.
  checkedAt = item.headers?.published_checked_at ?? checkedAt;
  const date = safeTime(checkedAt);
  const expires = item.headers?.published_expires_at;
  const expiredCopy = validTime(expires) && Date.parse(expires) < atMs;
  if (!valid) return { ...info, status: 'invalid', error: 'missing_documented_fields', checked_at: date, content_updated_at: contentUpdatedAt };
  if (raw.stale === true || expiredCopy || !newerThan(checkedAt, atMs, maxAgeMs)) {
    return { ...info, status: 'stale', checked_at: date, content_updated_at: contentUpdatedAt,
      error: raw.stale ? 'provider_stale' : expiredCopy ? 'published_copy_expired' : 'missing_or_expired_timestamp', count };
  }
  return { name, status: 'ok', checked_at: date, content_updated_at: contentUpdatedAt, error: null, count };
}

/** Conservatively separate provider-confirmed events from posts, grants and outages. */
export function classify(input, { nowMs = Date.now(), maxAgeMs = MAX_AGE_MS } = {}) {
  const health = Object.fromEntries(ENDPOINTS.map(name => [name, inspect(name, input[name], nowMs, maxAgeMs)]));
  const output = new Map();
  const warnings = [];
  const add = (key, event) => { if (output.has(key)) { warnings.push(`duplicate:${key}`); return; } output.set(key, event); };
  const timelineOK = health.timeline.status === 'ok';
  if (timelineOK) for (const e of input.timeline.data.events) {
    const id = e.id.trim();
    if (!id) { warnings.push('timeline_empty_id'); continue; }
    const url = httpsURL(e.url);
    const kind = e.group === 'credits' ? 'banked_reset'
      : e.group === 'reset' && e.announcement_state === 'announced' ? 'confirmed_reset'
      : 'ordinary_post';
    const safe = Boolean(url) && Date.parse(e.announced_at) <= nowMs + 5 * 60_000;
    add(`post:${id}`, { id: `post:${id}`, type: safe ? kind : 'needs_review', claimed_type: kind,
      provider: 'codex-reset.com', provenance: 'third_party', source_url: url,
      announced_at: safeTime(e.announced_at), summary: oneLine(e.summary), actionable: false,
      exact_next_reset_at: null, evidence: 'provider_timeline', needs_review: !safe });
    if (!safe) warnings.push(`unverified_timeline:${id}`);
  }
  if (health.feed.status === 'ok') for (const t of input.feed.data.tweets) {
    if (!isObject(t) || typeof t.id !== 'string' || !validTime(t.at)) { warnings.push('malformed_feed_tweet'); continue; }
    const id = `post:${t.id.trim()}`;
    const url = httpsURL(t.url);
    if (output.has(id)) {
      // Important: provider's timeline announcement timestamp can differ from X's post time.
      if (output.get(id).announced_at !== safeTime(t.at)) warnings.push(`timestamp_disagreement:${id}`);
      continue;
    }
    if (!url) { warnings.push(`missing_tweet_url:${id}`); continue; }
    add(id, { id, type: 'ordinary_post', claimed_type: 'ordinary_post', provider: 'codex-reset.com',
      provenance: 'third_party', source_url: url, announced_at: safeTime(t.at),
      summary: oneLine(t.text), actionable: false, exact_next_reset_at: null, evidence: 'provider_feed', needs_review: false });
  }
  if (health['status-history'].status === 'ok') for (const incident of input['status-history'].data.incidents) {
    if (!isObject(incident) || typeof incident.id !== 'string') { warnings.push('malformed_incident'); continue; }
    const url = httpsURL(incident.source_url);
    if (!url) { warnings.push(`missing_incident_url:${incident.id}`); continue; }
    add(`incident:${incident.id}`, { id: `incident:${incident.id}`, type: 'service_incident',
      claimed_type: 'service_incident', provider: 'codex-reset.com', provenance: 'third_party',
      source_url: url, announced_at: safeTime(incident.started_at), summary: oneLine(incident.name),
      actionable: false, exact_next_reset_at: null, evidence: 'provider_status_history', needs_review: false });
  }
  // Documented official_signal can indicate an advance signal; never derive an execution instant from it.
  if (health.forecast.status === 'ok' && input.forecast.data.official_signal != null) {
    const signal = input.forecast.data.official_signal;
    const sourceURL = isObject(signal) ? httpsURL(signal.url) : null;
    if (!sourceURL) warnings.push('advance_signal_requires_independent_source_review');
    add('signal:forecast', { id: 'signal:forecast', type: 'advance_notice', claimed_type: 'advance_notice',
      provider: 'codex-reset.com', provenance: 'third_party', source_url: sourceURL,
      announced_at: isObject(signal) ? safeTime(signal.at) : null, summary: 'Provider reports an official signal; not an exact schedule',
      actionable: false, exact_next_reset_at: null, evidence: 'provider_forecast', needs_review: true });
  }
  const latest = health.forecast.status === 'ok' ? safeTime(input.forecast.data.last_reset_at) : null;
  const probabilities = health.forecast.status === 'ok' ? {
    p24: input.forecast.data.probabilities.rounded_24h, p48: input.forecast.data.probabilities.rounded_48h,
    confidence: input.forecast.data.confidence, caveat: 'Experimental probability, not an exact reset time'
  } : null;
  // If one upstream is stale, do not infer a fresh negative fact or publish actionable events.
  const allHealthy = ENDPOINTS.every(name => health[name].status === 'ok');
  const events = [...output.values()].sort((a, b) => (b.announced_at ?? '').localeCompare(a.announced_at ?? ''));
  const counts = Object.fromEntries(['confirmed_reset','banked_reset','ordinary_post','service_incident','advance_notice','needs_review'].map(type => [type, events.filter(e => e.type === type).length]));
  for (const name of ENDPOINTS) if (health[name].status !== 'ok') warnings.push(`source_unavailable:${name}:${health[name].status}`);
  return { schema: 'opendesk-reset-public-probe/v1', sampled_at: new Date(nowMs).toISOString(),
    source: SOURCE, attribution: 'Data: codex-reset.com', official_provider: false,
    health, counts, all_healthy: allHealthy, latest_provider_reset_at: latest,
    probabilities, exact_next_reset_at: null, can_publish_feed: false,
    // No feed_version, revision, verified_at or history coverage is fabricated here.
    events, warnings: [...new Set(warnings)].sort() };
}

/** Document response/header metadata; never persist raw tweets or secrets in tracked source. */
export function scrubResults(results, nowMs = Date.now()) {
  const report = classify(results, { nowMs });
  report.http = Object.fromEntries(ENDPOINTS.map(name => [name, {
    http_status: results[name]?.http_status ?? null, attempts: results[name]?.attempts ?? 0,
    duration_ms: results[name]?.duration_ms ?? null, headers: results[name]?.headers ?? {},
    status: results[name]?.status ?? 'unavailable', retry_at: results[name]?.retry_at ?? null,
    error: results[name]?.error ?? report.health[name].error
  }]));
  return report;
}

function defaultRuntimeDir() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../../.runtime/tests/desktop-reset-clock/r24');
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  if (argv.length !== 1 || !['--live', '--fixture'].includes(argv[0])) {
    throw fail('usage: node tests/desktop-reset-clock/tools/public-source-probe/probe.mjs --fixture|--live');
  }
  const runtimeDir = deps.runtimeDir ?? defaultRuntimeDir();
  const at = deps.now?.() ?? Date.now();
  let results;
  if (argv[0] === '--fixture') {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'public-response-minimal.json');
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    results = Object.fromEntries(ENDPOINTS.map(name => [name, { status: 'received', data: fixture[name], attempts: 0, http_status: 200 }]));
    // Captured data ages naturally. A fixture from 2026 must be evaluated at its capture time.
    results = { ...results, __sample_at: fixture.captured_at };
  } else {
    await mkdir(runtimeDir, { recursive: true });
    const lockPath = join(runtimeDir, '.probe.lock');
    let lock;
    try { lock = await open(lockPath, 'wx'); } catch { throw fail('another_probe_is_running'); }
    try {
      const statePath = join(runtimeDir, 'request-state.json');
      let state = {};
      try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const saveState = async data => { const tmp = statePath + '.tmp'; await writeFile(tmp, JSON.stringify(data)); await rename(tmp, statePath); };
      results = {};
      for (const name of ENDPOINTS) results[name] = await requestEndpoint(name, { ...deps, state, saveState });
    } finally { await lock?.close(); await unlink(lockPath); }
  }
  const report = scrubResults(results, argv[0] === '--fixture' ? Date.parse(results.__sample_at) : at);
  report.mode = argv[0] === '--live' ? 'live' : 'recorded_minimal_fixture';
  await mkdir(runtimeDir, { recursive: true });
  const out = join(runtimeDir, argv[0] === '--live' ? 'live-report.json' : 'fixture-report.json');
  const tmp = out + '.tmp';
  await writeFile(tmp, JSON.stringify(report, null, 2) + '\n');
  await rename(tmp, out);
  console.log(JSON.stringify({ mode: report.mode, output: out, counts: report.counts,
    health: report.health, exact_next_reset_at: report.exact_next_reset_at,
    warnings: report.warnings }, null, 2));
  if (argv[0] === '--live' && !report.all_healthy) process.exitCode = 2;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('Probe failed:', err?.message); process.exitCode = 1; });
}
