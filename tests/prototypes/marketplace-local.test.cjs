'use strict';
// Repository root: node --test tests/prototypes/marketplace-local.test.cjs
// Page dispatch contract only; never launches a browser or the desktop app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../../apps/opendesk/prototypes/marketplace');
const html = fs.readFileSync(path.join(root, 'local-deep-link-smoke.html'), 'utf8');
const script = html.match(/<script id="local-dispatch">([\s\S]*?)<\/script>/)[1];
const links = [...html.matchAll(/data-dispatch="(valid|invalid)" href="([^"]+)"/g)]
  .map(([, kind, href]) => ({ kind, href: href.replaceAll('&amp;', '&') }));

function page(fail = false) {
  const result = { textContent: '尚未请求打开客户端。' };
  const requested = [];
  const targets = links.map(link => ({ ...link, addEventListener(type, handler) {
    assert.equal(type, 'click'); this.click = handler;
  } }));
  vm.runInNewContext(script, {
    document: {
      querySelector(selector) { assert.equal(selector, '#result'); return result; },
      querySelectorAll(selector) { assert.equal(selector, '[data-dispatch]'); return targets; },
    },
    window: { location: { assign(url) { requested.push(url); if (fail) throw Error('blocked'); } } },
  }, { timeout: 1000 });
  return { result, requested, targets };
}

test('the local page has one canonical ID-only intent and one bounded negative case', () => {
  assert.deepEqual(links.map(link => link.kind), ['valid', 'invalid']);
  const valid = new URL(links[0].href);
  assert.equal(valid.href, 'opendesk://install/flow/local-smoke?release=local-release-1&intent=local-intent-1');
  const invalid = new URL(links[1].href);
  assert.equal(invalid.searchParams.get('unsupported'), '1');
  invalid.searchParams.delete('unsupported');
  assert.equal(invalid.href, valid.href);
});

test('page load does not dispatch, and each explicit click requests only its fixed URI', () => {
  const p = page();
  assert.deepEqual(p.requested, []);
  assert.equal(p.result.textContent, '尚未请求打开客户端。');
  for (const target of p.targets) {
    let prevented = false;
    target.click({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.match(p.result.textContent, /交付与安装结果尚未确认/);
  }
  assert.deepEqual(p.requested, links.map(link => link.href));
});

test('a blocked dispatch remains unknown and never retries or reports success', () => {
  const p = page(true);
  p.targets[0].click({ preventDefault() {} });
  assert.equal(p.requested.length, 1);
  assert.match(p.result.textContent, /客户端是否收到请求未知/);
  assert.match(p.result.textContent, /不会自动重试/);
  assert.doesNotMatch(p.result.textContent, /安装成功|已交付/);
});

test('local smoke and simulated prototype remain separate, with no network or execution bridge', () => {
  const prototype = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(prototype, /href="local-deep-link-smoke.html"/);
  assert.doesNotMatch(prototype, /href="opendesk:|location\.assign\s*\(/);
  assert.match(html, /href="index.html"/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(script, /fetch\s*\(|XMLHttpRequest|WebSocket|setTimeout|setInterval|localStorage|\.search\b|\.hash\b/);
  assert.match(html, /安装确认窗口之前停止/);
});
