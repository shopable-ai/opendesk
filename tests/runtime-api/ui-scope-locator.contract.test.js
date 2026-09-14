'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const polyfill = fs.readFileSync(path.join(__dirname, '../../polyfills/012-ui-scope-locator.js'), 'utf8');

const WIN = Object.freeze({
  id: 'window:42', title: 'Target', pid: 42, handle: 99,
  x: 10, y: 20, width: 600, height: 400,
  isForeground: true, hasFocus: true,
});

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function structured(code, message, extra) {
  const e = new Error(message || code); e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

function harness(overrides = {}) {
  const calls = [];
  const refreshed = Object.assign({}, WIN, { x: 30, y: 40, width: 620, height: 420 });
  const UI = {
    findText: async (text, options) => { calls.push(['findText', text, options]); return null; },
    findTexts: async (text, options) => { calls.push(['findTexts', text, options]); return []; },
    findTextMatches: async (queries, options) => { calls.push(['findTextMatches', queries, options]); return []; },
    hasText: async (text, options) => { calls.push(['hasText', text, options]); return false; },
    tapText: async (text, options) => { calls.push(['tapText', text, options]); return { ok: true, action: 'tapText' }; },
    tapTexts: async (texts, options) => { calls.push(['tapTexts', texts, options]); return { ok: true, action: 'tapTexts', completed: [] }; },
    tapTargets: async (targets, options) => { calls.push(['tapTargets', targets, options]); return { ok: true, action: 'tapTargets', completed: [] }; },
    findImage: async (image, options) => { calls.push(['findImage', image, options]); return null; },
    findImages: async (image, options) => { calls.push(['findImages', image, options]); return []; },
    tapImage: async (image, options) => { calls.push(['tapImage', image, options]); return { ok: true, action: 'tapImage' }; },
    getValue: async (target, options) => { calls.push(['getValue', target, options]); return 'native-value'; },
    setValue: async (target, value, options) => { calls.push(['setValue', target, value, options]); return { ok: true, actionState: 'acknowledged', verified: true }; },
  };
  const windowFacade = {
    current: async (expected) => { calls.push(['window.current', expected]); return clone(refreshed); },
  };
  const Accessibility = {
    find: async (selector, options) => { calls.push(['Accessibility.find', selector, options]); return null; },
    read: async (ref, options) => { calls.push(['Accessibility.read', ref, options]); return { properties: {} }; },
    release: async (ref) => { calls.push(['Accessibility.release', ref]); return true; },
  };
  Object.assign(UI, overrides.UI || {});
  Object.assign(windowFacade, overrides.window || {});
  Object.assign(Accessibility, overrides.Accessibility || {});
  const sandbox = {
    UI, window: windowFacade, Accessibility: overrides.noAccessibility ? undefined : Accessibility,
    page: { waitForTimeout: async () => {} },
    setTimeout, clearTimeout, Date, Promise, AbortController,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(polyfill, sandbox, { filename: '012-ui-scope-locator.js' });
  return { sandbox, UI, calls, refreshed, Accessibility };
}

async function expectCode(promise, code) {
  let caught = null;
  try { await promise; } catch (e) { caught = e; }
  assert(caught, `expected rejection ${code}`);
  assert.strictEqual(caught.code, code, caught.stack || String(caught));
  return caught;
}

(async () => {
  let count = 0;
  async function test(name, fn) {
    await fn();
    count += 1;
    console.log('ok', count, '-', name);
  }

  await test('UI.within is synchronous and side-effect free', async () => {
    const h = harness();
    const scope = h.UI.within(clone(WIN));
    assert(scope && typeof scope.locator === 'function');
    assert.deepStrictEqual(h.calls, []);
  });

  await test('scope snapshots caller WindowInfo and refreshes geometry for same identity', async () => {
    const h = harness({ UI: {
      findText: async (text, options) => { h.calls.push(['findText', text, options]); return null; },
    }});
    const input = clone(WIN);
    const scope = h.UI.within(input);
    input.id = 'mutated'; input.handle = 12345; input.x = 999;
    await scope.findText('Save');
    const refresh = h.calls.find(c => c[0] === 'window.current');
    assert.strictEqual(refresh[1].id, WIN.id);
    assert.strictEqual(refresh[1].handle, WIN.handle);
    const find = h.calls.find(c => c[0] === 'findText');
    assert.strictEqual(find[2].within.id, WIN.id);
    assert.strictEqual(find[2].within.x, 30);
  });

  await test('scope forbids caller within override', async () => {
    const h = harness();
    const scope = h.UI.within(clone(WIN));
    await expectCode(scope.findText('Save', { within: clone(WIN) }), 'INVALID_ARGUMENT');
    assert.deepStrictEqual(h.calls, []);
  });

  await test('locator construction copies target without observation', async () => {
    const h = harness();
    const scope = h.UI.within(clone(WIN));
    const target = { role: 'button', name: 'Save' };
    const locator = scope.locator(target);
    target.name = 'Mutated';
    assert(locator && typeof locator.find === 'function');
    assert.deepStrictEqual(h.calls, []);
  });

  await test('semantic locator find returns observation snapshot and releases native ref', async () => {
    const h = harness({ Accessibility: {
      find: async (selector, options) => { h.calls.push(['Accessibility.find', selector, options]); return { kind: 'AccessibilityElementRef', id: 'r1' }; },
      read: async (ref, options) => { h.calls.push(['Accessibility.read', ref, options]); return { properties: {
        role: 'button', name: 'Save', identifier: 'saveButton', enabled: true,
        bounds: { x: 40, y: 50, width: 80, height: 30, coordinateSpace: 'screen' },
      }}; },
    }});
    const match = await h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find();
    assert.strictEqual(match.source, 'accessibility');
    assert.strictEqual(match.role, 'button');
    assert.strictEqual(match.enabled, true);
    assert.strictEqual(match.window.id, WIN.id);
    assert.strictEqual(match.window.bounds.x, 30);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(match, 'visible'), false, 'must not infer native visibility from bounds');
    assert(h.calls.some(c => c[0] === 'Accessibility.release'));
  });

  await test('semantic zero, ambiguous and incomplete stay distinct', async () => {
    let h = harness();
    assert.strictEqual(await h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find(), null);
    h = harness({ Accessibility: { find: async () => { throw structured('AMBIGUOUS_TARGET'); } } });
    await expectCode(h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find(), 'AMBIGUOUS_TARGET');
    h = harness({ Accessibility: { find: async () => { throw structured('SEARCH_INCOMPLETE'); } } });
    await expectCode(h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find(), 'SEARCH_INCOMPLETE');
  });

  await test('text locator find uses visual path without Accessibility', async () => {
    const h = harness({ noAccessibility: true, UI: {
      findText: async (text, options) => ({ source: 'ocr', text, provider: 'mock', confidence: 0.99,
        bounds: { x: 50, y: 60, width: 40, height: 20, coordinateSpace: 'screen' } }),
    }});
    const match = await h.UI.within(clone(WIN)).locator({ text: 'Save' }).find();
    assert.strictEqual(match.source, 'ocr');
    assert.strictEqual(match.visible, true);
    assert.strictEqual(match.text, 'Save');
  });

  await test('image locator find uses visual path without Accessibility', async () => {
    const h = harness({ noAccessibility: true, UI: {
      findImage: async (image, options) => ({ source: 'image', template: image, confidence: 0.95,
        bounds: { x: 80, y: 90, width: 20, height: 20, coordinateSpace: 'screen' } }),
    }});
    const match = await h.UI.within(clone(WIN)).locator({ image: './save.png' }).find();
    assert.strictEqual(match.source, 'image');
    assert.strictEqual(match.visible, true);
  });

  await test('waitFor exists retries only successful zero observations', async () => {
    let observations = 0;
    const h = harness({ noAccessibility: true, UI: {
      findText: async (text, options) => {
        observations += 1;
        return observations < 2 ? null : { source: 'ocr', text, bounds: { x: 1, y: 1, width: 2, height: 2 } };
      },
    }});
    await h.UI.within(clone(WIN)).locator({ text: 'Save' }).waitFor({ state: 'exists', timeout: 50 });
    assert.strictEqual(observations, 2);
  });

  await test('waitFor visible succeeds for visual evidence and refuses unprovable semantic visibility', async () => {
    let h = harness({ noAccessibility: true, UI: {
      findImage: async (image, options) => ({ source: 'image', template: image, bounds: { x: 1, y: 1, width: 2, height: 2 } }),
    }});
    await h.UI.within(clone(WIN)).locator({ image: './save.png' }).waitFor({ state: 'visible', timeout: 20 });
    h = harness({ Accessibility: {
      find: async () => ({ kind: 'AccessibilityElementRef', id: 'r1' }),
      read: async () => ({ properties: { role: 'button', name: 'Save', bounds: { x: 1, y: 1, width: 2, height: 2 } } }),
    }});
    await expectCode(h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).waitFor({ state: 'visible', timeout: 20 }), 'NOT_SUPPORTED');
  });

  await test('waitFor timeout and cancellation are explicit', async () => {
    let h = harness({ noAccessibility: true });
    await expectCode(h.UI.within(clone(WIN)).locator({ text: 'Never' }).waitFor({ timeout: 0 }), 'TIMEOUT');
    h = harness({ noAccessibility: true });
    const controller = new AbortController(); controller.abort();
    await expectCode(h.UI.within(clone(WIN)).locator({ text: 'Never' }).waitFor({ timeout: 20, signal: controller.signal }), 'CANCELED');
  });

  await test('locator.tap delegates once to original target-specific action path', async () => {
    const h = harness();
    const scope = h.UI.within(clone(WIN));
    await scope.locator({ role: 'button', name: 'Save' }).tap();
    await scope.locator({ text: 'Save' }).tap();
    await scope.locator({ image: './save.png' }).tap();
    assert.strictEqual(h.calls.filter(c => c[0] === 'tapTargets').length, 1);
    assert.strictEqual(h.calls.filter(c => c[0] === 'tapText').length, 1);
    assert.strictEqual(h.calls.filter(c => c[0] === 'tapImage').length, 1);
  });

  await test('unknown semantic action is propagated and never falls back to another input', async () => {
    const h = harness({ UI: {
      tapTargets: async (targets, options) => { h.calls.push(['tapTargets', targets, options]); throw structured('STATE_UNKNOWN', 'unknown', { actionState: 'unknown' }); },
    }});
    const err = await expectCode(h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).tap(), 'STATE_UNKNOWN');
    assert.strictEqual(err.actionState, 'unknown');
    assert.strictEqual(h.calls.filter(c => c[0] === 'tapTargets').length, 1);
    assert.strictEqual(h.calls.filter(c => c[0] === 'tapText' || c[0] === 'tapImage').length, 0);
  });

  await test('native getValue/setValue are delegated exactly and visual values are rejected', async () => {
    const h = harness();
    const scope = h.UI.within(clone(WIN));
    const field = scope.locator({ role: 'textField', identifier: 'messageInput' });
    assert.strictEqual(await field.getValue(), 'native-value');
    const set = await field.setValue('hello');
    assert.strictEqual(set.verified, true);
    const getCall = h.calls.find(c => c[0] === 'getValue');
    assert.strictEqual(JSON.stringify(getCall[1]), JSON.stringify({ role: 'textField', identifier: 'messageInput' }));
    assert.strictEqual(getCall[2].within.id, WIN.id);
    await expectCode(scope.locator({ text: 'looks-like-a-value' }).getValue(), 'NOT_SUPPORTED');
    await expectCode(scope.locator({ image: './field.png' }).setValue('x'), 'NOT_SUPPORTED');
  });

  await test('stale exact window fails before target observation and does not rebind same-title windows', async () => {
    const h = harness({ window: {
      current: async () => { h.calls.push(['window.current']); throw structured('STALE_TARGET', 'exact identity disappeared'); },
    }});
    await expectCode(h.UI.within(clone(WIN)).locator({ text: 'Save' }).find(), 'STALE_TARGET');
    assert.strictEqual(h.calls.some(c => c[0] === 'findText'), false);
  });

  await test('original functional UI APIs remain callable and unchanged in routing', async () => {
    const h = harness();
    await h.UI.tapText('Direct', { within: clone(WIN) });
    assert.strictEqual(h.calls.filter(c => c[0] === 'window.current').length, 0, 'direct functional API is not wrapped by object layer');
    assert.strictEqual(h.calls.filter(c => c[0] === 'tapText').length, 1);
  });

  console.log(`PASS ${count} UI Scope/Locator contract tests`);
})().catch(err => {
  console.error(err && err.stack || err);
  process.exitCode = 1;
});
