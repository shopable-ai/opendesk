'use strict';
// Repository root: node --test tests/prototypes/marketplace-local.test.cjs
// Page contract only; it never launches a browser or the desktop app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../../apps/opendesk/prototypes/marketplace');
const html = fs.readFileSync(path.join(root, 'local-deep-link-smoke.html'), 'utf8');
const script = html.match(/<script id="local-dispatch">([\s\S]*?)<\/script>/)[1];
const links = [...html.matchAll(/data-dispatch="(valid|invalid)" href="([^"]+)"/g)]
  .map(([, kind, href]) => ({kind, href: href.replaceAll('&amp;', '&')}));

function page({statuses = []} = {}) {
  const result = {textContent: '尚未请求安装。', dataset: {state: 'idle'}};
  const requested = [];
  const fetched = [];
  const timers = [];
  const targets = links.map(link => ({
    ...link,
    dataset: {dispatch: link.kind},
    addEventListener(type, handler) {
      assert.equal(type, 'click');
      this.click = handler;
    },
  }));
  vm.runInNewContext(script, {
    document: {
      querySelector(selector) { assert.equal(selector, '#result'); return result; },
      querySelectorAll(selector) { assert.equal(selector, '[data-dispatch]'); return targets; },
    },
    fetch: async (url, options) => {
      fetched.push({url, options});
      const next = statuses.length ? statuses.shift() : {state: 'pending', message: 'waiting'};
      if (next instanceof Error) throw next;
      return {ok: true, async json() { return next; }};
    },
    setTimeout(callback, delay) { timers.push({callback, delay}); return timers.length; },
  }, {timeout: 1000});
  return {result, requested, fetched, timers, targets};
}

function clickTarget(p, index) {
  let prevented = false;
  p.targets[index].click({preventDefault() { prevented = true; }});
  if (!prevented) p.requested.push(p.targets[index].href);
  return {prevented};
}

async function runNextTimer(p) {
  const timer = p.timers.shift();
  assert.ok(timer, 'expected a scheduled status check');
  timer.callback();
  await new Promise(resolve => setImmediate(resolve));
  return timer;
}

test('the local page dispatches the signed Notify Demo intent and one bounded negative case', () => {
  assert.deepEqual(links.map(link => link.kind), ['valid', 'invalid']);
  const valid = new URL(links[0].href);
  assert.equal(valid.href, 'opendesk://install/flow/com.example.opendesk.notify-demo?release=local-notify-demo-1&intent=local-notify-demo-intent-1');
  const invalid = new URL(links[1].href);
  assert.equal(invalid.searchParams.get('unsupported'), '1');
  invalid.searchParams.delete('unsupported');
  assert.equal(invalid.href, valid.href);
});

test('page load never dispatches and restores a verified installed state from Catalog', async () => {
  const p = page({statuses: [{state: 'installed', message: '安装成功，尚未运行。'}]});
  assert.deepEqual(p.requested, []);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.fetched.length, 1);
  assert.equal(p.result.dataset.state, 'installed');
  assert.match(p.result.textContent, /安装成功，尚未运行/);
});

test('a valid click dispatches once before checking Catalog status', async () => {
  const p = page({statuses: [{state: 'pending'}, {state: 'installed', message: '安装成功，尚未运行。'}]});
  await new Promise(resolve => setImmediate(resolve));
  const click = clickTarget(p, 0);
  assert.equal(click.prevented, false);
  assert.deepEqual(p.requested, [links[0].href]);
  assert.equal(p.result.dataset.state, 'pending');
  assert.equal(p.timers.length, 1);
  assert.equal((await runNextTimer(p)).delay, 250);
  assert.equal(p.fetched.length, 2);
  assert.equal(p.fetched[1].url, '/local-smoke/status');
  assert.equal(p.result.dataset.state, 'installed');
  assert.match(p.result.textContent, /安装成功，尚未运行/);
  assert.match(p.result.textContent, /明确点击运行/);
  assert.equal(p.timers.length, 0);
});

test('a receiver-side verification failure is visible and never reported as installed', async () => {
  const p = page({statuses: [{state: 'pending', receiver: {state: 'failed', message: 'OpenDesk 已收到请求，但验证或安装被拒绝；请查看本次 opendesk.log。'}}]});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.result.dataset.state, 'install-failed');
  assert.match(p.result.textContent, /验证或安装被拒绝/);
  assert.doesNotMatch(p.result.textContent, /安装成功/);
});

test('a valid click preserves the browser default navigation instead of script-dispatching the protocol', () => {
  const p = page();
  const click = clickTarget(p, 0);
  assert.equal(click.prevented, false);
  assert.deepEqual(p.requested, [links[0].href]);
  assert.equal(p.timers.length, 1);
  assert.equal(p.result.dataset.state, 'pending');
  assert.doesNotMatch(script, /preventDefault|location\.assign/);
});

test('the invalid parameter check dispatches once without starting success polling', () => {
  const p = page();
  const click = clickTarget(p, 1);
  assert.equal(click.prevented, false);
  assert.deepEqual(p.requested, [links[1].href]);
  assert.equal(p.result.dataset.state, 'invalid-requested');
  assert.equal(p.timers.length, 0);
  assert.equal(p.fetched.length, 1);
});

test('both local pages have a bounded same-origin Catalog oracle and no execution bridge', () => {
  const prototype = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bridge = prototype.match(/<script id="local-marketplace-bridge">([\s\S]*?)<\/script>/)[1];
  assert.match(prototype, /href="local-deep-link-smoke.html"/);
  assert.match(prototype, /connect-src 'self'/);
  assert.match(bridge, /opendesk:\/\/install\/flow\/com\.example\.opendesk\.notify-demo\?release=local-notify-demo-1&intent=local-notify-demo-intent-1/);
  assert.match(bridge, /fetch\(statusPath/);
  assert.match(bridge, /button\.replaceWith\(link\)/);
  assert.match(bridge, /data-local-marketplace-install/);
  assert.match(bridge, /const maxStatusChecks = 180/);
  assert.match(bridge, /waiting-external-protocol/);
  assert.match(bridge, /安装成功，尚未运行/);
  assert.doesNotMatch(bridge, /preventDefault|location\.assign|flow\.run|runFlow|Execution|localStorage/);
  assert.match(html, /connect-src 'self'/);
  assert.match(script, /fetch\('\/local-smoke\/status'/);
  assert.match(script, /const maxStatusChecks = 180/);
  assert.match(script, /waiting-external-protocol/);
  assert.match(script, /install-failed/);
  assert.doesNotMatch(script, /flow\s+run|runFlow|Execution|localStorage|\.search\b|\.hash\b/);
  assert.match(html, /安装不会运行 Flow/);
});
