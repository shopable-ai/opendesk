import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify, inspect, requestEndpoint, scrubResults, ENDPOINTS, INTERVAL_MS } from './probe.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/public-response-minimal.json', import.meta.url)));
const sampleAt = Date.parse(fixture.captured_at);
const responses = () => Object.fromEntries(ENDPOINTS.map(name => [name, { status: 'received', data: structuredClone(fixture[name]), attempts: 1, http_status: 200 }]));
const response = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers }
});

test('real sampled fixture: all four documented response shapes map to healthy evidence', () => {
  const report = scrubResults(responses(), sampleAt);
  assert.equal(report.all_healthy, true);
  assert.deepEqual(Object.values(report.health).map(h => h.status), ['ok', 'ok', 'ok', 'ok']);
  assert.equal(report.latest_provider_reset_at, '2026-10-13T05:03:51.000Z');
  assert.deepEqual(report.probabilities, { p24: 19, p48: 34, confidence: 'low', caveat: 'Experimental probability, not an exact reset time' });
  assert.equal(report.exact_next_reset_at, null);
  assert.equal(report.can_publish_feed, false);
});

test('confirmed reset, banked grant, ordinary post, outage, and missing source stay separate', () => {
  const report = classify(responses(), { nowMs: sampleAt });
  assert.deepEqual(report.counts, {
    confirmed_reset: 1, banked_reset: 1, ordinary_post: 2, service_incident: 1, advance_notice: 0, needs_review: 1
  });
  assert.equal(report.events.find(e => e.id === 'post:2109812360596865224').type, 'confirmed_reset');
  assert.equal(report.events.find(e => e.id === 'post:2107913674593644711').type, 'banked_reset');
  assert.equal(report.events.find(e => e.id === 'post:2107975486798164736').type, 'needs_review');
  assert.equal(report.events.find(e => e.id === 'incident:01M4T4ZCM54D3ZPTQXRSWFG0XS').type, 'service_incident');
  for (const item of report.events) {
    assert.equal(item.actionable, false);
    assert.equal(item.exact_next_reset_at, null);
    assert.equal(item.provenance, 'third_party');
  }
});

test('same upstream post in timeline and tweet feed is one stable identity, timestamp disagreement retained', () => {
  const report = classify(responses(), { nowMs: sampleAt });
  assert.equal(report.events.filter(e => e.id === 'post:2109812360596865224').length, 1);
  assert.ok(report.warnings.includes('timestamp_disagreement:post:2109812360596865224'));
});

test('candidate with reset in text and non-announced state is never confirmed', () => {
  const inputs = responses();
  inputs.timeline.data.events = [{ id: 'candidate', group: 'reset', type: 'reset', announcement_state: 'none',
    announced_at: '2026-10-13T04:00:00Z', summary: 'RESET IS COMING', url: 'https://x.com/test/status/1' }];
  inputs.feed.data.tweets = [];
  const out = classify(inputs, { nowMs: sampleAt });
  assert.equal(out.counts.confirmed_reset, 0);
  assert.equal(out.events.find(e => e.id === 'post:candidate').type, 'ordinary_post');
});

test('official_signal becomes non-actionable advance notice; never a future countdown', () => {
  const inputs = responses();
  inputs.forecast.data.official_signal = { url: 'https://x.com/thsottiaux/status/1', at: '2026-10-13T05:00:00Z', effective_at: '2026-10-14T06:00:00Z' };
  const out = classify(inputs, { nowMs: sampleAt });
  assert.equal(out.counts.advance_notice, 1);
  assert.equal(out.exact_next_reset_at, null);
  assert.equal(out.events.find(e => e.id === 'signal:forecast').needs_review, true);
});

test('source link is required; null banked grant URL moves to review, never official', () => {
  const out = classify(responses(), { nowMs: sampleAt });
  const event = out.events.find(e => e.id === 'post:2107975486798164736');
  assert.equal(event.source_url, null);
  assert.equal(event.type, 'needs_review');
  assert.ok(out.warnings.includes('unverified_timeline:2107975486798164736'));
});

test('provider stale=true disables feed news; staleness does not erase previous confirmed evidence', () => {
  const input = responses();
  input.feed.data.stale = true;
  const out = classify(input, { nowMs: sampleAt });
  assert.equal(out.health.feed.status, 'stale');
  assert.equal(out.all_healthy, false);
  assert.equal(out.can_publish_feed, false);
  assert.equal(out.events.some(e => e.id === 'post:2109892247580000595'), false);
  assert.ok(out.warnings.some(w => w.startsWith('source_unavailable:feed:')));
});

test('expired timestamp or future clock-skew beyond 5m fails closed', () => {
  const old = classify(responses(), { nowMs: sampleAt + 45 * 60_000 });
  assert.ok(Object.values(old.health).some(s => s.status === 'stale'));
  const input = responses();
  input.timeline.data.updated_at = '2026-10-14T00:00:00Z';
  assert.equal(classify(input, { nowMs: sampleAt }).health.timeline.status, 'stale');
});

test('missing mandatory API fields rejected (rather than interpreting as no resets)', () => {
  for (const endpoint of ENDPOINTS) {
    const input = responses();
    if (endpoint === 'forecast') delete input[endpoint].data.probabilities;
    if (endpoint === 'timeline') delete input[endpoint].data.events;
    if (endpoint === 'feed') delete input[endpoint].data.stale;
    if (endpoint === 'status-history') delete input[endpoint].data.incidents;
    assert.equal(classify(input, { nowMs: sampleAt }).health[endpoint].status, 'invalid', endpoint);
  }
});

test('timeline truncation cannot be presented as full historical zero-count coverage', () => {
  const input = responses();
  input.timeline.data.events = [];
  const out = classify(input, { nowMs: sampleAt });
  assert.equal(out.counts.confirmed_reset, 0);
  assert.equal(out.can_publish_feed, false);
  assert.equal('history_coverage_complete' in out, false);
});

test('withdrawal is not invented when event disappears from sampled list', () => {
  const input = responses();
  input.timeline.data.events = [];
  const out = classify(input, { nowMs: sampleAt });
  assert.equal(out.events.some(e => e.type === 'withdrawn'), false);
});

test('duplicate timeline identities do not produce duplicate alerts or counted events', () => {
  const input = responses();
  input.timeline.data.events.push(structuredClone(input.timeline.data.events[0]));
  const out = classify(input, { nowMs: sampleAt });
  assert.equal(out.counts.confirmed_reset, 1);
  assert.ok(out.warnings.includes('duplicate:post:2109812360596865224'));
});

test('inspect separates transport error from content staleness', () => {
  assert.equal(inspect('forecast', { status: 'unavailable', error: 'http_404' }, sampleAt).status, 'unavailable');
  assert.equal(inspect('forecast', { status: 'received', data: fixture.forecast }, sampleAt).status, 'ok');
});

test('only allow four fixed GET URLs; identifiable UA; no Cookie or credentials', async () => {
  let request;
  const state = {};
  const out = await requestEndpoint('forecast', { state, now: () => sampleAt, maxAttempts: 1,
    fetchImpl: async (url, init) => { request = { url, init }; return response(fixture.forecast); } });
  assert.equal(out.status, 'received');
  assert.equal(request.url, 'https://codex-reset.com/api/forecast');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  assert.match(request.init.headers['User-Agent'], /OpenDesk-Reset-Clock-Probe/);
  assert.equal('Cookie' in request.init.headers, false);
  await assert.rejects(() => requestEndpoint('not-public', { state }), /unapproved_endpoint/);
});

test('local persistent cooldown avoids repeated same-endpoint requests within a minute', async () => {
  const state = {};
  let calls = 0;
  const opts = { state, now: () => 1_000_000, maxAttempts: 1, fetchImpl: async () => { calls++; return response(fixture.forecast); } };
  assert.equal((await requestEndpoint('forecast', opts)).status, 'received');
  const skipped = await requestEndpoint('forecast', opts);
  assert.equal(skipped.status, 'rate_limited');
  assert.equal(skipped.error, 'local_minimum_interval');
  assert.equal(calls, 1);
});

test('Cache-Control and published expiry may extend the 60s cooldown', async () => {
  const state = {};
  await requestEndpoint('forecast', { state, now: () => 1_000_000, maxAttempts: 1,
    fetchImpl: async () => response(fixture.forecast, 200, { 'Cache-Control': 'public, max-age=120' }) });
  assert.equal(state.forecast.next_allowed_at, 1_120_000);
});

test('HTTP 429 honours Retry-After and does not retry immediately', async () => {
  const state = {};
  let calls = 0;
  const out = await requestEndpoint('feed', { state, now: () => 1_000_000,
    fetchImpl: async () => { calls++; return response('{}', 429, { 'Retry-After': '180' }); } });
  assert.equal(out.status, 'rate_limited');
  assert.equal(out.error, 'upstream_429');
  assert.equal(state.feed.next_allowed_at, 1_180_000);
  assert.equal(calls, 1);
});

test('500 automatically retries only AFTER full poll interval', async () => {
  const state = {};
  let tick = 1_000_000;
  let calls = 0;
  const intervals = [];
  const out = await requestEndpoint('forecast', { state, now: () => tick, sleep: async ms => { intervals.push(ms); tick += ms; },
    fetchImpl: async () => { calls++; return calls === 1 ? response('{}', 503) : response(fixture.forecast); } });
  assert.equal(calls, 2);
  assert.deepEqual(intervals, [INTERVAL_MS]);
  assert.equal(out.status, 'received');
  assert.equal(out.attempts, 2);
});

test('network/timeout retries follow the cooldown and surface explicit failure status', async () => {
  let tick = 2_000_000;
  let calls = 0;
  const opts = { now: () => tick, sleep: async ms => { tick += ms; }, fetchImpl: async () => {
    calls++; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } };
  const out = await requestEndpoint('timeline', opts);
  assert.equal(calls, 2);
  assert.equal(out.status, 'unavailable');
  assert.equal(out.error, 'timeout');
});

test('404 and untrusted redirect are rejected; never scrape a login page', async () => {
  let calls = 0;
  const out = await requestEndpoint('feed', { maxAttempts: 2, fetchImpl: async () => { calls++; return response('{}', 404); } });
  assert.equal(out.error, 'http_404');
  assert.equal(calls, 1);
  const redirected = await requestEndpoint('feed', { maxAttempts: 1, fetchImpl: async (_url, init) => {
    assert.equal(init.redirect, 'error'); return response('{}', 302, { Location: 'https://example.com' });
  } });
  assert.equal(redirected.error, 'http_302');
});

test('200 with HTML, invalid JSON, missing body, and too-large response is rejected', async () => {
  const cases = [
    [response('<html>login</html>', 200, { 'Content-Type': 'text/html' }), 'unexpected_content_type'],
    [response('{bad json', 200), 'invalid_json'],
    [new Response(null, { status: 200, headers: { 'Content-Type': 'application/json' } }), 'empty_body'],
    [response('{}', 200, { 'Content-Length': '99999999' }), 'oversized_json']
  ];
  for (const [res, expected] of cases) {
    const out = await requestEndpoint('forecast', { maxAttempts: 1, fetchImpl: async () => res });
    assert.equal(out.error, expected);
  }
});

test('304 without verified cache is refused, not falsely marked successful', async () => {
  const out = await requestEndpoint('status-history', { maxAttempts: 1,
    fetchImpl: async () => new Response(null, { status: 304 }) });
  assert.equal(out.error, '304_without_verified_cache');
});

test('bad HTTP evidence links cannot be accepted as a valid confirmed reset', () => {
  const input = responses();
  input.timeline.data.events[0].url = 'http://x.com/thsottiaux/status/2109812360596865224';
  const out = classify(input, { nowMs: sampleAt });
  assert.equal(out.counts.confirmed_reset, 0);
  assert.equal(out.events.find(e => e.id === 'post:2109812360596865224').type, 'needs_review');
});

test('published copy check time is independent of last content update, but expired copy is rejected', () => {
  const input = responses();
  input.timeline.headers = { published_checked_at: '2026-10-13T11:28:00Z', published_expires_at: '2026-10-13T11:32:00Z' };
  input.timeline.data.updated_at = '2026-10-01T00:00:00Z';
  let out = classify(input, { nowMs: sampleAt });
  assert.equal(out.health.timeline.status, 'ok');
  assert.equal(out.health.timeline.content_updated_at, '2026-10-01T00:00:00.000Z');
  out = classify(input, { nowMs: Date.parse('2026-10-13T11:33:00Z') });
  assert.equal(out.health.timeline.status, 'stale');
  assert.equal(out.health.timeline.error, 'published_copy_expired');
});
