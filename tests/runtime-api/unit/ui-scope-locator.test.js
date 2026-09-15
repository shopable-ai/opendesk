// Runtime-owned contract coverage for the lightweight Scope/Locator facade.
// The fake owners make the action boundary observable; no desktop input occurs
// in this unit tier. Native fixture evidence is covered separately.
(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const source = File.read(File.join(File.cwd(), 'polyfills', '012-ui-scope-locator.js'));
  const WIN = Object.freeze({
    id: 'darwin:42:native:99', title: 'Target', pid: 42, handle: 99,
    x: 10, y: 20, width: 600, height: 400, isForeground: true, hasFocus: true,
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function failure(code, extra) {
    return Object.assign(new Error(code), { code: code }, extra || {});
  }

  function fixture(overrides) {
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
      setValue: async (target, value, options) => {
        calls.push(['setValue', target, value, options]);
        return { ok: true, actionState: 'acknowledged', verified: true };
      },
    };
    const windowFacade = {
      current: async expected => { calls.push(['window.current', expected]); return clone(refreshed); },
    };
    const Accessibility = {
      find: async (selector, options) => { calls.push(['Accessibility.find', selector, options]); return null; },
      read: async (ref, options) => { calls.push(['Accessibility.read', ref, options]); return { properties: {} }; },
      release: async ref => { calls.push(['Accessibility.release', ref]); return true; },
    };
    const input = overrides || {};
    Object.assign(UI, input.UI || {});
    Object.assign(windowFacade, input.window || {});
    Object.assign(Accessibility, input.Accessibility || {});
    const host = {
      UI: UI,
      window: windowFacade,
      Accessibility: input.noAccessibility ? undefined : Accessibility,
      page: { waitForTimeout: async () => {} },
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    };
    host.globalThis = host;
    new Function('globalThis', source)(host);
    return { UI: UI, calls: calls, refreshed: refreshed, Accessibility: Accessibility };
  }

  async function expectCode(run, code) {
    let caught = null;
    try { await run(); } catch (error) { caught = error; }
    assert(caught, 'expected rejection ' + code);
    equal(caught.code, code, String(caught && caught.stack || caught));
    return caught;
  }

  test({
    name: 'UI.within is exposed by the actual Runtime public UI object',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    assert(UI && typeof UI.within === 'function', 'missing Runtime UI.within');
  });

  test({
    name: 'Scope and Locator construction have no desktop-side effects and snapshot caller data',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    const h = fixture();
    const windowInput = clone(WIN);
    const scope = h.UI.within(windowInput);
    const target = { role: 'button', name: 'Save' };
    const locator = scope.locator(target);
    windowInput.id = 'darwin:99:native:1';
    target.name = 'Mutated';
    assert(typeof scope.locator === 'function' && typeof locator.find === 'function');
    equal(h.calls.length, 0, 'construction must not observe, allocate a ref, or send input');
    await scope.findText('Save');
    const refresh = h.calls.find(call => call[0] === 'window.current');
    equal(refresh[1].id, WIN.id);
    equal(refresh[1].handle, WIN.handle);
  });

  test({
    name: 'Scope wrappers refresh same-window geometry and delegate every existing function API',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    const h = fixture();
    const scope = h.UI.within(clone(WIN));
    await scope.findTexts('Save');
    await scope.findTextMatches(['Save']);
    await scope.findText('Save');
    await scope.hasText('Save');
    await scope.tapText('Save');
    await scope.tapTexts(['Save']);
    await scope.tapTargets([{ role: 'button', name: 'Save' }]);
    await scope.findImages('./save.png');
    await scope.findImage('./save.png');
    await scope.tapImage('./save.png');
    const expected = ['findTexts', 'findTextMatches', 'findText', 'hasText', 'tapText', 'tapTexts', 'tapTargets', 'findImages', 'findImage', 'tapImage'];
    for (const name of expected) {
      const call = h.calls.find(row => row[0] === name);
      assert(call, 'missing delegated ' + name);
      const options = call[call.length - 1];
      equal(options.within.id, WIN.id, name + ' identity');
      equal(options.within.x, 30, name + ' refreshed geometry');
    }
    await expectCode(() => scope.findText('Save', { within: clone(WIN) }), 'INVALID_ARGUMENT');
  });

  test({
    name: 'Locator find keeps semantic zero, ambiguity and incomplete observations distinct',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    let h = fixture();
    equal(await h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find(), null);
    h = fixture({ Accessibility: { find: async () => { throw failure('AMBIGUOUS_TARGET'); } } });
    await expectCode(() => h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find(), 'AMBIGUOUS_TARGET');
    h = fixture({ Accessibility: { find: async () => { throw failure('SEARCH_INCOMPLETE'); } } });
    await expectCode(() => h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find(), 'SEARCH_INCOMPLETE');
  });

  test({
    name: 'Locator semantic find returns plain current observation and releases its temporary ref',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    const h = fixture({ Accessibility: {
      find: async (selector, options) => { h.calls.push(['Accessibility.find', selector, options]); return { kind: 'AccessibilityElementRef', id: 'r1' }; },
      read: async (ref, options) => {
        h.calls.push(['Accessibility.read', ref, options]);
        return { properties: { role: 'button', name: 'Save', identifier: 'save', enabled: true,
          bounds: { x: 40, y: 50, width: 80, height: 30, coordinateSpace: 'screen' } } };
      },
    } });
    const match = await h.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).find();
    equal(match.source, 'accessibility');
    equal(match.window.id, WIN.id);
    equal(match.window.bounds.x, 30);
    equal(match.enabled, true);
    assert(!Object.prototype.hasOwnProperty.call(match, 'visible'), 'bounds do not prove native visibility');
    assert(h.calls.some(call => call[0] === 'Accessibility.release'), 'temporary ref was not released');
  });

  test({
    name: 'Visual text and image Locators continue without an Accessibility tree',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    let h = fixture({ noAccessibility: true, UI: {
      findText: async (text, options) => ({ source: 'ocr', text: text, provider: 'fixture', confidence: 0.9,
        bounds: { x: 1, y: 2, width: 30, height: 10, coordinateSpace: 'screen' } }),
    } });
    const text = await h.UI.within(clone(WIN)).locator({ text: 'Save' }).find();
    equal(text.source, 'ocr');
    equal(text.visible, true);
    h = fixture({ noAccessibility: true, UI: {
      findImage: async (image, options) => ({ source: 'image', template: image, confidence: 0.9,
        bounds: { x: 1, y: 2, width: 30, height: 10, coordinateSpace: 'screen' } }),
    } });
    const image = await h.UI.within(clone(WIN)).locator({ image: './save.png' }).find();
    equal(image.source, 'image');
    equal(image.visible, true);
    const imageCall = h.calls.find(call => call[0] === 'findImage');
    equal(imageCall[2].threshold, 0.95, 'Locator image observation must require high-confidence evidence');
  });

  test({
    name: 'Locator waitFor uses one readonly retry loop, proves visual visibility, and honors cancellation',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    let observations = 0;
    const h = fixture({ noAccessibility: true, UI: {
      findText: async text => {
        observations += 1;
        return observations === 1 ? null : { source: 'ocr', text: text, bounds: { x: 1, y: 1, width: 2, height: 2, coordinateSpace: 'screen' } };
      },
    } });
    await h.UI.within(clone(WIN)).locator({ text: 'Save' }).waitFor({ state: 'visible', timeout: 50 });
    equal(observations, 2);
    const canceled = { aborted: true, addEventListener() {}, removeEventListener() {} };
    await expectCode(() => h.UI.within(clone(WIN)).locator({ text: 'Never' }).waitFor({ signal: canceled }), 'CANCELED');
    const semantic = fixture({ Accessibility: {
      find: async () => ({ kind: 'AccessibilityElementRef', id: 'r1' }),
      read: async () => ({ properties: { role: 'button', name: 'Save' } }),
    } });
    await expectCode(() => semantic.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).waitFor({ state: 'visible', timeout: 20 }), 'NOT_SUPPORTED');
  });

  test({
    name: 'Locator tap reuses exactly one existing owner and never repeats an unknown semantic action',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    const h = fixture();
    const scope = h.UI.within(clone(WIN));
    await scope.locator({ role: 'button', name: 'Save' }).tap();
    await scope.locator({ text: 'Save' }).tap();
    await scope.locator({ image: './save.png' }).tap();
    equal(h.calls.filter(call => call[0] === 'tapTargets').length, 1);
    equal(h.calls.filter(call => call[0] === 'tapText').length, 1);
    equal(h.calls.filter(call => call[0] === 'tapImage').length, 1);
    equal(h.calls.find(call => call[0] === 'tapImage')[2].threshold, 0.95);
    const unknown = fixture({ UI: {
      tapTargets: async (targets, options) => {
        unknown.calls.push(['tapTargets', targets, options]);
        throw failure('STATE_UNKNOWN', { actionState: 'unknown' });
      },
    } });
    const error = await expectCode(() => unknown.UI.within(clone(WIN)).locator({ role: 'button', name: 'Save' }).tap(), 'STATE_UNKNOWN');
    equal(error.actionState, 'unknown');
    equal(unknown.calls.filter(call => call[0] === 'tapTargets').length, 1);
    equal(unknown.calls.filter(call => call[0] === 'tapText' || call[0] === 'tapImage').length, 0);
  });

  test({
    name: 'Locator value methods stay on the strict native owner and reject visual OCR values',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    const h = fixture();
    const scope = h.UI.within(clone(WIN));
    const field = scope.locator({ role: 'textField', identifier: 'messageInput' });
    equal(await field.getValue(), 'native-value');
    equal((await field.setValue('你好')).verified, true);
    const get = h.calls.find(call => call[0] === 'getValue');
    equal(JSON.stringify(get[1]), JSON.stringify({ role: 'textField', identifier: 'messageInput' }));
    equal(get[2].within.id, WIN.id);
    await expectCode(() => scope.locator({ text: '123' }).getValue(), 'NOT_SUPPORTED');
    await expectCode(() => scope.locator({ image: './field.png' }).setValue('x'), 'NOT_SUPPORTED');
    equal(h.calls.filter(call => call[0] === 'tapText' || call[0] === 'tapTargets' || call[0] === 'tapImage').length, 0);
  });

  test({
    name: 'A stale Scope fails before observation and cannot rebind a same-title replacement',
    tier: 'unit', covers: ['UI.within'],
  }, async () => {
    const h = fixture({ window: {
      current: async () => { h.calls.push(['window.current']); throw failure('STALE_TARGET'); },
    } });
    await expectCode(() => h.UI.within(clone(WIN)).locator({ text: 'Save' }).find(), 'STALE_TARGET');
    assert(!h.calls.some(call => call[0] === 'findText'), 'stale identity reached visual observation');
  });
})();
