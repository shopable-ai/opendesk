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
    waitText: async () => null,
    waitTextGone: async () => true,
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
    page: Object.assign({ waitForTimeout: async () => {} }, overrides.page || {}),
    mouse: overrides.mouse,
    setTimeout, clearTimeout, Date: overrides.Date || Date, Promise, AbortController,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(polyfill, sandbox, { filename: '012-ui-scope-locator.js' });
  if (overrides.perception) vm.runInContext(fs.readFileSync(path.join(__dirname,
    '../../polyfills/013-ui-perception.js'), 'utf8'), sandbox, { filename: '013-ui-perception.js' });
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

  await test('conflicting native name/text constraints are rejected before any action', async () => {
    const h = harness();
    const scope = h.UI.within(clone(WIN));
    assert.throws(() => scope.locator({ role: 'button', name: 'Save', text: 'Delete' }), { code: 'INVALID_ARGUMENT' });
    const compatible = scope.locator({ role: 'button', name: 'Save', text: 'Save' });
    assert.strictEqual(typeof compatible.tap, 'function');
    assert.deepStrictEqual(h.calls, []);
  });

  await test('semantic read rejects identity drift and still releases the ref', async () => {
    const h = harness({ Accessibility: {
      find: async () => ({kind: 'AccessibilityElementRef', id: 'changed'}),
      read: async () => ({properties: {role: 'button', name: 'Delete'}}),
    }});
    await expectCode(h.UI.within(clone(WIN)).locator({role: 'button', name: 'Save'}).find(), 'STALE_TARGET');
    assert.strictEqual(h.calls.some(c => c[0] === 'Accessibility.release'), true);
    const missing = harness({ Accessibility: {
      find: async () => ({kind: 'AccessibilityElementRef', id: 'incomplete'}),
      read: async () => ({properties: {role: 'button'}}),
    }});
    await expectCode(missing.UI.within(clone(WIN)).locator({role: 'button', name: 'Save'}).find(), 'SEARCH_INCOMPLETE');
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

  await test('text locator preserves Resolver native identity without inferring visibility', async () => {
    const h = harness({ UI: {
      findText: async text => ({ source: 'accessibility', text, role: 'button', name: text,
        identifier: 'fixture.next', bounds: { x: 50, y: 60, width: 80, height: 30, coordinateSpace: 'screen' } }),
    }});
    const locator = h.UI.within(clone(WIN)).locator({ text: '下一步' });
    const match = await locator.find();
    assert.strictEqual(match.source, 'accessibility');
    assert.strictEqual(match.role, 'button');
    assert.strictEqual(match.name, '下一步');
    assert.strictEqual(match.identifier, 'fixture.next');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(match, 'visible'), false);
    await locator.waitFor({ state: 'exists', timeout: 100 });
    assert.strictEqual(h.calls.some(c => c[0] === 'Accessibility.find'), false);
  });

  await test('native smoke assertions retain source truth, exact scope and unique candidates', async () => {
    // Evaluate only the formal smoke's pure assertion/read-only helpers.
    // Its fixture launch, build, permission checks and input are never run.
    const source = fs.readFileSync(path.join(__dirname, 'ui-scope-locator-native-macos.js'), 'utf8');
    const start = source.indexOf('function assert(');
    const end = source.indexOf('async function expectCode(');
    assert(start >= 0 && end > start);
    const native = { source: 'accessibility', text: '下一步', name: '下一步', role: 'button',
      identifier: 'fixture.next', window: clone(WIN),
      bounds: { x: 50, y: 60, width: 80, height: 30, coordinateSpace: 'screen' } };
    const ocr = { source: 'ocr', text: '下一步', provider: 'fixture-ocr', window: clone(WIN), bounds: clone(native.bounds) };
    let candidates;
    const context = vm.createContext({ UI: { findTexts: async (text, options) => {
      assert.strictEqual(text, '下一步');
      assert.strictEqual(options.within.id, WIN.id);
      return candidates;
    } } });
    vm.runInContext(source.slice(start, end), context);
    const check = (match, requiredSource) => context.assertButtonMatch(match, WIN, '下一步', 'fixture.next', requiredSource);
    const observe = (match, requiredSource) => context.findButtonEvidence(
      { find: async () => match }, WIN, '下一步', 'fixture.next', requiredSource);
    for (const match of [native, ocr]) {
      candidates = [match];
      assert.strictEqual((await observe(match)).observed, match);
    }
    assert.throws(() => check(native, 'ocr'), /unexpected button source/);
    assert.throws(() => check({ ...ocr, source: 'image' }), /unexpected button source/);
    assert.throws(() => check({ ...ocr, provider: undefined }), /OCR evidence/);
    assert.throws(() => check({ ...ocr, identifier: 'fixture.next' }), /OCR evidence/);
    for (const patch of [{ role: 'staticText' }, { name: '确认' }, { identifier: 'fixture.other' }]) {
      assert.throws(() => check({ ...native, ...patch }), /native button identity mismatch/);
    }
    for (const key of ['id', 'pid', 'handle']) {
      assert.throws(() => check({ ...native, window: { ...WIN, [key]: 'other' } }), /fixture identity/);
    }
    assert.throws(() => check({ ...ocr, text: '确认' }), /button text mismatch/);
    assert.throws(() => check({ ...ocr, bounds: { ...ocr.bounds, x: WIN.x - 1 } }), /button bounds/);
    assert.throws(() => check({ ...ocr, bounds: undefined }), /button bounds/);
    const semantic = {
      source: 'accessibility', role: 'button', name: '下一步', identifier: 'fixture.next', enabled: true,
      window: { id: WIN.id, pid: WIN.pid, handle: WIN.handle,
        bounds: { x: WIN.x, y: WIN.y, width: WIN.width, height: WIN.height, coordinateSpace: 'screen' } },
    };
    const semanticCheck = match => context.assertSemanticButtonMatch(match, WIN, '下一步', 'fixture.next');
    semanticCheck(semantic);
    semanticCheck({ ...semantic, bounds: clone(native.bounds) });
    for (const patch of [{ source: 'ocr' }, { role: 'staticText' }, { name: '确认' },
      { identifier: 'fixture.other' }, { enabled: false }, { enabled: undefined }]) {
      assert.throws(() => semanticCheck({ ...semantic, ...patch }), /identity\/state mismatch/);
    }
    for (const key of ['id', 'pid', 'handle']) {
      assert.throws(() => semanticCheck({ ...semantic, window: { ...semantic.window, [key]: 'foreign' } }),
        /escaped fixture window/);
    }
    assert.throws(() => semanticCheck({ ...semantic, window: { ...semantic.window,
      bounds: { ...semantic.window.bounds, width: WIN.width + 1 } } }), /escaped fixture window/);
    assert.throws(() => semanticCheck({ ...semantic, bounds: { ...native.bounds, x: WIN.x - 1 } }), /button bounds/);
    for (const rows of [[], [native, native]]) {
      candidates = rows;
      await assert.rejects(observe(native), /not unique/);
    }
    candidates = [native];
    await assert.rejects(observe(ocr, 'ocr'), /unexpected button source/);
    candidates = [ocr];
    const evidence = await observe(ocr, 'ocr');
    assert.strictEqual(evidence.observed.source, 'ocr');
    assert.strictEqual(evidence.candidates[0].source, 'ocr');

    const nativeOwner = {};
    context.Accessibility = nativeOwner;
    let visualWaits = 0;
    context.UI.within = win => {
      assert.strictEqual(win, WIN);
      assert.strictEqual(context.Accessibility, undefined);
      return { locator: target => {
        assert.strictEqual(target.text, '下一步');
        return {
          find: async () => ocr,
          waitFor: async options => {
            assert.strictEqual(options.state, 'visible');
            assert.strictEqual(context.Accessibility, undefined);
            visualWaits += 1;
          },
        };
      } };
    };
    const templateEvidence = await context.findOCRButtonEvidence(WIN, '下一步', 'fixture.next');
    assert.strictEqual(templateEvidence.observed, ocr);
    assert.strictEqual(context.Accessibility, nativeOwner);
    assert.strictEqual(visualWaits, 1);
    for (const rows of [[], [ocr, ocr]]) {
      candidates = rows;
      await assert.rejects(context.findOCRButtonEvidence(WIN, '下一步', 'fixture.next'), /not unique/);
      assert.strictEqual(context.Accessibility, nativeOwner);
    }
    candidates = [native];
    await assert.rejects(context.findOCRButtonEvidence(WIN, '下一步', 'fixture.next'), /unexpected button source/);
    assert.strictEqual(context.Accessibility, nativeOwner);

    const backendFailure = structured('OCR_FAILED', 'Apple Vision helper unavailable', {
      operation: 'UI.findText', cause: { message: 'root_unavailable' },
    });
    await assert.rejects(context.findButtonEvidence(
      { find: async () => { throw backendFailure; } }, WIN, '下一步', 'fixture.next', 'ocr'),
    error => error === backendFailure);
    candidates = [ocr];
    context.UI.findTexts = async () => { throw backendFailure; };
    await assert.rejects(observe(ocr, 'ocr'), error => error === backendFailure);
    await assert.rejects(context.findOCRButtonEvidence(WIN, '下一步', 'fixture.next'), error => error === backendFailure);
    assert.strictEqual(context.Accessibility, nativeOwner);
  });

  await test('native smoke refuses unavailable OCR and preserves backend failure evidence', async () => {
    const source = fs.readFileSync(path.join(__dirname, 'ui-scope-locator-native-macos.js'), 'utf8');
    const start = source.indexOf('function assert(');
    const end = source.indexOf('async function expectCode(');
    assert(start >= 0 && end > start);
    const context = vm.createContext({});
    vm.runInContext(source.slice(start, end), context);
    const apple = { provider: 'apple', implemented: true, available: true };
    const capabilities = { defaultProvider: 'apple', providers: [apple] };
    context.assertOCRCapabilities(capabilities);
    for (const caps of [null, {}, { ...capabilities, providers: [] },
      { ...capabilities, defaultProvider: 'missing' },
      { ...capabilities, providers: [apple, apple] },
      ...[{ available: false }, { available: undefined }, { implemented: false }].map(patch =>
        ({ ...capabilities, providers: [{ ...apple, ...patch }] })),
    ]) {
      assert.throws(() => context.assertOCRCapabilities(caps), /requires an available default OCR provider/);
    }
    const failure = structured('OCR_FAILED', 'OCR failed while searching the target scope', {
      operation: 'UI.findText', actionState: 'unknown',
      cause: structured('NOT_SUPPORTED', 'Apple Vision helper unavailable', { cause: { message: 'root_unavailable' } }),
    });
    const evidence = JSON.parse(JSON.stringify(context.failureEvidence(failure)));
    assert.deepStrictEqual(evidence, {
      code: 'OCR_FAILED', message: failure.message, operation: 'UI.findText', actionState: 'unknown',
      cause: { code: 'NOT_SUPPORTED', message: failure.cause.message,
        cause: { code: null, message: 'root_unavailable' } },
    });
    assert.strictEqual(Object.hasOwn(context.failureEvidence(new Error('unknown state')), 'actionState'), false);
    const ambiguous = structured('AMBIGUOUS_TARGET', 'multiple visible targets match', {
      candidateCount: 2, candidates: [{ source: 'image', confidence: 1 }, { source: 'image', confidence: 0.96 }],
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(context.failureEvidence(ambiguous))), {
      code: ambiguous.code, message: ambiguous.message, candidateCount: 2, candidates: ambiguous.candidates,
    });
    const circular = new Error('circular cause');
    circular.cause = circular;
    assert.doesNotThrow(() => JSON.stringify(context.failureEvidence(circular)));
    const preflight = source.indexOf('assertOCRCapabilities(report.ocrCapabilities)');
    assert(preflight > source.indexOf('report.ocrCapabilities = await Vision.getCapabilities()'));
    assert(preflight < source.indexOf('await fixture.build(paths)'));
  });

  await test('native smoke activates only its owned exact identity before visual preflight', async () => {
    const source = fs.readFileSync(path.join(__dirname, 'ui-scope-locator-native-macos.js'), 'utf8');
    const start = source.indexOf('async function exactWindow(');
    const end = source.indexOf('async function waitForMovedWindow(');
    assert(start >= 0 && end > start);
    let observed = clone(WIN);
    let activated = { ...WIN, x: 30 };
    const calls = [];
    const context = vm.createContext({
      assert,
      window: {
        wait: async target => { assert.strictEqual(target.id, WIN.id); return observed; },
        activate: async target => { calls.push(['activate', target]); return activated; },
      },
      fixture: { waitForActive: async target => { calls.push(['active', target]); } },
    });
    vm.runInContext(source.slice(start, end), context);
    assert.strictEqual(await context.exactWindow({ win: clone(WIN) }), activated);
    assert.strictEqual(calls[0][1], observed);
    assert.strictEqual(calls[1][1], activated);
    for (const key of ['id', 'pid', 'handle']) {
      calls.length = 0;
      observed = { ...WIN, [key]: 'foreign' };
      await assert.rejects(context.exactWindow({ win: clone(WIN) }), /window.wait did not preserve/);
      assert.strictEqual(calls.length, 0);
      observed = clone(WIN);
      activated = { ...WIN, [key]: 'foreign' };
      await assert.rejects(context.exactWindow({ win: clone(WIN) }), /window.activate did not preserve/);
      assert.strictEqual(calls.length, 1);
    }
  });

  await test('native smoke waits for observed move and resize without accepting identity drift', async () => {
    const source = fs.readFileSync(path.join(__dirname, 'ui-scope-locator-native-macos.js'), 'utf8');
    const start = source.indexOf('async function waitForMovedWindow(');
    const end = source.indexOf('async function captureWindow(');
    assert(start >= 0 && end > start);
    let now = 0;
    let reads = 0;
    let observation = () => reads < 3 ? { ...WIN, x: 30 } : { ...WIN, x: 30, width: 620 };
    const context = vm.createContext({
      assert, Date: { now: () => now },
      sleep: async ms => { now += ms; },
      window: { current: async target => { assert.strictEqual(target, WIN); reads += 1; return observation(); } },
    });
    vm.runInContext(source.slice(start, end), context);
    assert.strictEqual((await context.waitForMovedWindow(WIN, 500)).width, 620);
    assert.strictEqual(reads, 3);
    for (const key of ['id', 'pid', 'handle']) {
      reads = 0;
      observation = () => ({ ...WIN, x: 30, width: 620, [key]: 'foreign' });
      await assert.rejects(context.waitForMovedWindow(WIN, 500), /fixture identity changed/);
      assert.strictEqual(reads, 1);
    }
    observation = () => clone(WIN);
    await assert.rejects(context.waitForMovedWindow(WIN, 200), /geometry did not refresh/);
    const failure = structured('STALE_TARGET');
    observation = () => { throw failure; };
    await assert.rejects(context.waitForMovedWindow(WIN, 500), error => error === failure);
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

  await test('Runtime-shaped AbortSignal retains prototype identity through scoped options', async () => {
    class RuntimeSignal {
      constructor() { this.stopped = false; }
      get aborted() { return this.stopped; }
      addEventListener() {}
      removeEventListener() {}
    }
    const signal = new RuntimeSignal();
    assert.strictEqual(Object.prototype.toString.call(signal), '[object Object]');
    let observed = 0, clicks = 0;
    const h = harness({ noAccessibility: true, perception: true, UI: {
      findTexts: async () => { observed += 1; signal.stopped = true; return [{text:'Save', bounds:{x:80,y:90,width:40,height:20}}]; },
    }, window:{getActiveWindow:async()=>clone(h.refreshed)}, mouse:{clickPoint:async()=>{clicks+=1;}} });
    await expectCode(h.UI.within(clone(WIN)).locator({text:'Save'}).tap({signal}), 'CANCELED');
    assert.strictEqual(observed, 1);
    assert.strictEqual(clicks, 0);
    signal.stopped = false;
    const direct = harness({UI:{tapText:async (_text, options)=>{assert.strictEqual(options.signal, signal);return {ok:true};}}});
    await direct.UI.within(clone(WIN)).tapText('Save', {signal});
  });
  await test('text locator cancellation during actual Resolver OCR prevents mouse input', async () => {
    const controller = new AbortController();
    let clicks = 0;
    const h = harness({ noAccessibility: true, perception: true, UI: {
      findTexts: async () => {
        controller.abort();
        return [{ source: 'ocr', text: 'Save', provider: 'fixture',
          bounds: { x: 80, y: 90, width: 40, height: 20 } }];
      },
    }, window: { getActiveWindow: async () => clone(h.refreshed) },
    mouse: { clickPoint: async () => { clicks += 1; } } });
    await expectCode(h.UI.within(clone(WIN)).locator({ text: 'Save' }).tap({ signal: controller.signal }), 'CANCELED');
    assert.strictEqual(clicks, 0);
  });

  await test('visual find and wait reject late matches and charge window refresh to the same deadline', async () => {
    for (const kind of ['text', 'image']) {
      for (const method of ['find', 'waitFor']) {
        let now = 0;
        const timeouts = [];
        const observe = async (_target, options) => {
          timeouts.push(options.timeout);
          now += 7;
          return { source: kind === 'text' ? 'ocr' : 'image', text: 'Save',
            bounds: { x: 80, y: 90, width: 40, height: 20 } };
        };
        const h = harness({ Date: { now: () => now }, UI: { findText: observe, findImage: observe },
          window: { current: async () => { now += 4; return clone(WIN); } } });
        const target = kind === 'text' ? { text: 'Save' } : { image: './save.png' };
        const caught = await expectCode(h.UI.within(clone(WIN)).locator(target)[method]({ timeout: 10 }), 'TIMEOUT');
        assert.strictEqual(caught.actionState, 'not_started');
        assert.deepStrictEqual(timeouts, [6]);
      }
    }
  });

  await test('wait does not start another observation after its polling delay exhausts the deadline', async () => {
    let now = 0, observations = 0;
    const h = harness({ Date: { now: () => now }, UI: {
      findText: async () => { observations += 1; now += 3; return null; },
    }, page: { waitForTimeout: async milliseconds => { now += milliseconds; } } });
    await expectCode(h.UI.within(clone(WIN)).locator({ text: 'Save' }).waitFor({ timeout: 10 }), 'TIMEOUT');
    assert.strictEqual(observations, 1);
    assert.strictEqual(now, 10);
  });

  await test('image tap rejects an unsupported cancellation signal before observation or input', async () => {
    const h = harness(), controller = new AbortController();
    const locator = h.UI.within(clone(WIN)).locator({ image: './save.png' });
    const caught = await expectCode(locator.tap({ signal: controller.signal }), 'NOT_SUPPORTED');
    assert.strictEqual(caught.phase, 'capability');
    assert.strictEqual(caught.actionState, 'not_started');
    assert.strictEqual(h.calls.length, 0);
    controller.abort();
    await expectCode(locator.tap({ signal: controller.signal }), 'CANCELED');
    assert.strictEqual(h.calls.length, 0);
    await locator.tap({ signal: null });
    assert.strictEqual(h.calls.filter(call => call[0] === 'tapImage').length, 1);
  });

  await test('zero-timeout text wait gives the actual Resolver one bounded OCR observation', async () => {
    for (const found of [true, false]) for (const elapsed of [7, 3001]) {
      let now = 0, observations = 0, waits = 0;
      const budgets = [];
      const h = harness({ perception: true, noAccessibility: true, Date: { now: () => now }, UI: {
        findText: async () => { assert.fail('must run the Resolver instead of the legacy findText stub'); },
        findTexts: async (text, options) => {
          observations += 1;
          assert.strictEqual(text, 'Save');
          budgets.push(options.timeout);
          now += elapsed;
          return found ? [{ source: 'ocr', text, provider: 'fixture',
            bounds: { x: 80, y: 90, width: 40, height: 20 } }] : [];
        },
      }, window: { current: async () => { now += 4; return clone(WIN); } },
      page: { waitForTimeout: async () => { waits += 1; } } });
      const result = h.UI.within(clone(WIN)).locator({ text: 'Save' }).waitFor({ state: 'visible', timeout: 0 });
      if (elapsed > 3000) {
        const failure = await expectCode(result, 'TIMEOUT');
        assert.strictEqual(failure.phase, 'observation', 'single probe must retain the owner deadline');
      } else if (found) await result;
      else {
        const failure = await expectCode(result, 'TIMEOUT');
        assert.strictEqual(failure.phase, 'wait', 'empty observation must finish before the wait rejects');
      }
      assert.strictEqual(observations, 1);
      assert.deepStrictEqual(budgets, [3000]);
      assert.strictEqual(waits, 0);
      assert.strictEqual(now, 4 + elapsed);
    }
  });

  await test('positive-timeout text wait still rejects late actual Resolver OCR', async () => {
    let now = 0, observations = 0, waits = 0;
    const h = harness({ perception: true, noAccessibility: true, Date: { now: () => now }, UI: {
      findText: async () => { assert.fail('must run the Resolver instead of the legacy findText stub'); },
      findTexts: async (text, options) => {
        observations += 1;
        assert.strictEqual(options.timeout, 6);
        now += 7;
        return [{ source: 'ocr', text, provider: 'fixture',
          bounds: { x: 80, y: 90, width: 40, height: 20 } }];
      },
    }, window: { current: async () => { now += 4; return clone(WIN); } },
    page: { waitForTimeout: async () => { waits += 1; } } });
    await expectCode(h.UI.within(clone(WIN)).locator({ text: 'Save' }).waitFor({ timeout: 10 }), 'TIMEOUT');
    assert.strictEqual(observations, 1);
    assert.strictEqual(waits, 0);
  });

  await test('zero-timeout semantic wait shares a bounded find/read budget and keeps visibility semantics', async () => {
    for (const found of [true, false]) for (const state of ['exists', 'visible']) {
      let now = 0, observations = 0, reads = 0, releases = 0, waits = 0;
      const h = harness({ perception: true, Date: { now: () => now }, Accessibility: {
        find: async (_selector, options) => {
          observations += 1;
          assert.strictEqual(options.timeout, 3000);
          now += 7;
          return found ? { kind: 'AccessibilityElementRef', id: 'save' } : null;
        },
        read: async (_ref, options) => {
          reads += 1;
          assert.strictEqual(options.timeout, 2993);
          now += 7;
          return { properties: { role: 'button', name: 'Save' } };
        },
        release: async () => { releases += 1; return true; },
      }, window: { current: async () => { now += 4; return clone(WIN); } },
      page: { waitForTimeout: async () => { waits += 1; } } });
      const result = h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).waitFor({ state, timeout: 0 });
      if (found && state === 'exists') await result;
      else await expectCode(result, found ? 'NOT_SUPPORTED' : 'TIMEOUT');
      assert.strictEqual(observations, 1);
      assert.strictEqual(reads, found ? 1 : 0);
      assert.strictEqual(releases, found ? 1 : 0);
      assert.strictEqual(waits, 0);
    }
  });

  await test('zero-timeout wait keeps one immediate visual probe without polling', async () => {
    for (const kind of ['text', 'image']) {
      for (const found of [false, true]) {
        let now = 0, observations = 0, waits = 0;
        const observe = async (_target, options) => {
          observations += 1;
          assert.strictEqual(options.timeout, 3000);
          now += 7;
          return found ? { source: kind === 'text' ? 'ocr' : 'image', bounds: { x: 80, y: 90, width: 40, height: 20 } } : null;
        };
        const h = harness({ perception: kind === 'image', Date: { now: () => now }, UI: { findText: observe, findImage: observe },
          window: { current: async () => { now += 4; return clone(WIN); } },
          page: { waitForTimeout: async () => { waits += 1; } } });
        const target = kind === 'text' ? { text: 'Save' } : { image: './save.png' };
        const result = h.UI.within(clone(WIN)).locator(target).waitFor({ timeout: 0 });
        if (found) await result;
        else await expectCode(result, 'TIMEOUT');
        assert.strictEqual(observations, 1);
        assert.strictEqual(waits, 0);
      }
    }
  });

  console.log(`PASS ${count} UI Scope/Locator contract tests`);
})().catch(err => {
  console.error(err && err.stack || err);
  process.exitCode = 1;
});
