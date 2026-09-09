// Inert registration for the shared OpenDesk Runtime API runner. The facade is
// evaluated with an isolated Accessibility owner; no real window is inspected
// and no native action or desktop input is sent.
(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const uiSource = File.read(File.join(File.cwd(), 'polyfills/006-ui.js'));
  const unit = (name, fn, covers = ['UI.getValue', 'UI.setValue']) => test({ name, tier: 'unit', covers }, fn);

  function nativeError(code, operation, phase = 'fixture', actionState = 'not_started') {
    return Object.assign(new Error(code), {
      code, operation, phase, actionState, backend: 'fixture', requestId: 'fixture-error',
    });
  }

  function fixture(settings = {}) {
    const state = {
      now: 0,
      value: settings.value === undefined ? 'before' : settings.value,
      ref: Object.freeze({ kind: 'AccessibilityElementRef', id: 'fixture-ref', role: 'textField', nativeRole: 'edit' }),
      calls: { find: [], read: [], perform: [], release: [] },
    };
    const elapsed = (name, index) => {
      const configured = settings[name + 'Ms'];
      state.now += typeof configured === 'function' ? configured(index, state) : (configured || 0);
    };
    const host = {
      Accessibility: {
        getCapabilities: () => ({
          available: true,
          implementation: { available: true, status: 'available', menus: true, actions: { setValue: true }, coordinateMapping: false, notes: '' },
          hostAuthorization: { enabled: true }, permission: { state: 'authorized' }, backend: 'fixture',
        }),
        find: async (target, options) => {
          const index = state.calls.find.length;
          state.calls.find.push({ target, options });
          elapsed('find', index);
          if (settings.onFind) return await settings.onFind(target, options, index, state);
          return settings.found === false ? null : state.ref;
        },
        read: async (ref, options) => {
          const index = state.calls.read.length;
          state.calls.read.push({ ref, options });
          elapsed('read', index);
          if (settings.onRead) return await settings.onRead(ref, options, index, state);
          const properties = {};
          for (const property of options.properties) {
            if (property === 'role') properties.role = settings.role || 'textField';
            if (property === 'enabled') properties.enabled = settings.enabled === undefined ? true : settings.enabled;
            if (property === 'actions') properties.actions = settings.actions === undefined ? ['setValue'] : settings.actions;
            if (property === 'value') properties.value = state.value;
          }
          return { requestId: 'read-' + index, operation: 'Accessibility.read', backend: 'fixture', ref, properties };
        },
        perform: async (ref, action, options) => {
          const index = state.calls.perform.length;
          state.calls.perform.push({ ref, action, options });
          elapsed('perform', index);
          if (settings.onPerform) return await settings.onPerform(ref, action, options, index, state);
          if (!settings.keepOldValue) state.value = action.value;
          return {
            requestId: 'perform-' + index,
            operation: 'Accessibility.perform',
            backend: 'fixture',
            action: action.action,
            actionState: settings.actionState || 'acknowledged',
          };
        },
        release: async ref => {
          const index = state.calls.release.length;
          state.calls.release.push({ ref });
          if (settings.onRelease) return await settings.onRelease(ref, index, state);
          return true;
        },
      },
    };
    new Function('globalThis', 'Date', uiSource)(host, { now: () => state.now });
    state.host = host;
    return state;
  }

  async function rejects(fn, code, operation) {
    let error;
    try { await fn(); } catch (caught) { error = caught; }
    assert(error, 'expected ' + code);
    equal(error.code, code, String(error));
    if (operation) equal(error.operation, operation, String(error));
    return error;
  }

  unit('getValue returns native string values unchanged and releases the same ref', async () => {
    for (const expected of ['plain', '', '中文', 'first\nsecond', '123']) {
      const f = fixture({ value: expected });
      const within = { id: 'fixture-window' };
      const actual = await f.host.UI.getValue({ role: 'textField', identifier: 'editor' }, { within });
      equal(actual, expected);
      equal(typeof actual, 'string');
      equal(f.calls.find.length, 1);
      equal(f.calls.read.length, 1);
      equal(f.calls.release.length, 1);
      equal(f.calls.read[0].ref, f.ref);
      equal(f.calls.release[0].ref, f.ref);
    }
  }, ['UI.getValue']);

  unit('setValue accepts complete strings including empty, Chinese and multiline without conversion', async () => {
    for (const expected of ['', '中文', 'first\nsecond', '123']) {
      const f = fixture();
      const receipt = await f.host.UI.setValue(
        { role: 'textField', identifier: 'editor' },
        expected,
        { within: { id: 'fixture-window' } },
      );
      equal(f.calls.perform.length, 1);
      equal(f.calls.perform[0].action.value, expected);
      equal(f.calls.read.length, 2);
      assert(f.calls.read.every(call => call.ref === f.ref), 'pre-read and readback must keep the same ref');
      equal(f.calls.release.length, 1);
      equal(receipt.operation, 'UI.setValue');
      equal(receipt.actionState, 'acknowledged');
      equal(receipt.verified, true);
      assert(!Object.prototype.hasOwnProperty.call(receipt, 'value'), JSON.stringify(receipt));
      assert(!Object.prototype.hasOwnProperty.call(receipt, 'oldValue'), JSON.stringify(receipt));
      assert(!Object.prototype.hasOwnProperty.call(receipt, 'newValue'), JSON.stringify(receipt));
    }
  });

  unit('value facade requires explicit scope, rejects signal and never coerces non-string input', async () => {
    const target = { role: 'textField', identifier: 'editor' };
    const f = fixture();
    await rejects(() => f.host.UI.getValue(target), 'INVALID_ARGUMENT', 'UI.getValue');
    await rejects(() => f.host.UI.getValue(target, { within: {}, signal: {} }), 'INVALID_ARGUMENT', 'UI.getValue');
    for (const value of [0, 123, false, null, undefined, { toString: () => 'text' }]) {
      await rejects(() => f.host.UI.setValue(target, value, { within: {} }), 'INVALID_ARGUMENT', 'UI.setValue');
    }
    equal(f.calls.find.length, 0);
    equal(f.calls.perform.length, 0);
  });

  unit('value facade passes the existing selector and within authority through unchanged', async () => {
    const selector = { role: 'textField', name: 'Title', identifier: 'editor' };
    const within = Object.freeze({ kind: 'AccessibilityElementRef', id: 'container-ref' });
    const f = fixture({ value: 'same-contract' });
    equal(await f.host.UI.getValue(selector, { within, maxDepth: 12, maxNodes: 345 }), 'same-contract');
    equal(f.calls.find[0].target, selector);
    equal(f.calls.find[0].options.within, within);
    equal(f.calls.find[0].options.maxDepth, 12);
    equal(f.calls.find[0].options.maxNodes, 345);
  }, ['UI.getValue', 'Accessibility.find']);

  unit('value facade distinguishes no target, ambiguity and incomplete search', async () => {
    const target = { role: 'textField', identifier: 'editor' };
    const none = fixture({ found: false });
    await rejects(() => none.host.UI.getValue(target, { within: {} }), 'TARGET_NOT_FOUND', 'UI.getValue');
    equal(none.calls.release.length, 0);
    for (const code of ['AMBIGUOUS_TARGET', 'SEARCH_INCOMPLETE']) {
      const f = fixture({ onFind: () => { throw nativeError(code, 'Accessibility.find', 'search'); } });
      const error = await rejects(() => f.host.UI.getValue(target, { within: {} }), code, 'UI.getValue');
      equal(error.cause.operation, 'Accessibility.find');
      equal(f.calls.release.length, 0);
    }
  }, ['UI.getValue']);

  unit('getValue rejects stale refs, non-text roles and non-string values without fallback', async () => {
    const target = { role: 'textField', identifier: 'editor' };
    const stale = fixture({ onRead: () => { throw nativeError('STALE_TARGET', 'Accessibility.read', 'reference'); } });
    await rejects(() => stale.host.UI.getValue(target, { within: {} }), 'STALE_TARGET', 'UI.getValue');
    equal(stale.calls.release.length, 1);
    for (const settings of [{ role: 'checkbox', value: 'true' }, { role: 'textField', value: 123 }, { role: 'textField', value: false }]) {
      const f = fixture(settings);
      await rejects(() => f.host.UI.getValue(target, { within: {} }), 'NOT_SUPPORTED', 'UI.getValue');
      equal(f.calls.release.length, 1);
    }
  }, ['UI.getValue']);

  unit('setValue rejects disabled, unknown, readonly, unsupported and protected text before action', async () => {
    const target = { role: 'textField', identifier: 'editor' };
    const cases = [
      [{ enabled: false }, 'ELEMENT_DISABLED'],
      [{ enabled: null }, 'STATE_UNKNOWN'],
      [{ actions: [] }, 'ACTION_NOT_SUPPORTED'],
      [{ role: 'staticText' }, 'NOT_SUPPORTED'],
      [{ onRead: () => { throw nativeError('PERMISSION_DENIED', 'Accessibility.read', 'read'); } }, 'PERMISSION_DENIED'],
    ];
    for (const [settings, code] of cases) {
      const f = fixture(settings);
      await rejects(() => f.host.UI.setValue(target, 'new', { within: {} }), code, 'UI.setValue');
      equal(f.calls.perform.length, 0);
      equal(f.calls.release.length, 1);
    }
  }, ['UI.setValue']);

  unit('setValue applies one total deadline across locate, action and same-ref readback', async () => {
    const f = fixture({
      findMs: 1200,
      readMs: index => index === 0 ? 1000 : 400,
      performMs: 500,
    });
    const error = await rejects(
      () => f.host.UI.setValue({ role: 'textField' }, 'new', { within: {}, timeout: 3000 }),
      'TIMEOUT',
      'UI.setValue',
    );
    equal(error.actionState, 'acknowledged');
    equal(error.verified, false);
    equal(f.calls.find[0].options.timeout, 3000);
    equal(f.calls.read[0].options.timeout, 1800);
    equal(f.calls.perform[0].options.timeout, 800);
    equal(f.calls.read[1].options.timeout, 300);
    equal(f.calls.perform.length, 1);
    equal(f.calls.release.length, 1);
  }, ['UI.setValue']);

  unit('setValue never repeats a submitted action when readback fails or mismatches', async () => {
    const readFailure = fixture({
      onRead: (ref, options, index, state) => {
        if (index === 1) throw nativeError('STALE_TARGET', 'Accessibility.read', 'reference');
        return { properties: { role: 'textField', enabled: true, actions: ['setValue'], value: state.value } };
      },
    });
    const stale = await rejects(
      () => readFailure.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }),
      'STALE_TARGET',
      'UI.setValue',
    );
    equal(stale.actionState, 'acknowledged');
    equal(stale.verified, false);
    equal(readFailure.calls.perform.length, 1);
    equal(readFailure.calls.release.length, 1);

    const mismatch = fixture({ keepOldValue: true });
    const unknown = await rejects(
      () => mismatch.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }),
      'STATE_UNKNOWN',
      'UI.setValue',
    );
    equal(unknown.actionState, 'acknowledged');
    equal(unknown.verified, false);
    equal(mismatch.calls.perform.length, 1);
  }, ['UI.setValue']);

  unit('setValue keeps action and verification state when cleanup fails', async () => {
    const cleanupFailure = () => { throw nativeError('BACKEND_FAILED', 'Accessibility.release', 'reference'); };
    const success = fixture({ onRelease: cleanupFailure });
    const cleanup = await rejects(
      () => success.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }),
      'BACKEND_FAILED',
      'UI.setValue',
    );
    equal(cleanup.actionState, 'acknowledged');
    equal(cleanup.verified, true);
    equal(success.calls.perform.length, 1);

    const primary = fixture({ keepOldValue: true, onRelease: cleanupFailure });
    const mismatch = await rejects(
      () => primary.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }),
      'STATE_UNKNOWN',
      'UI.setValue',
    );
    equal(mismatch.actionState, 'acknowledged');
    equal(mismatch.verified, false);
    equal(mismatch.cleanupError.code, 'BACKEND_FAILED');
    equal(primary.calls.perform.length, 1);
  }, ['UI.setValue', 'Accessibility.release']);

  unit('Recorder text patch keeps its stricter precondition, patch, action, postcondition and release chain', async () => {
    const source = File.read(File.join(File.cwd(), 'automation/recorder_actions.go'));
    const start = source.indexOf('async function __recorderApplyTextEdit');
    const end = source.indexOf('\n}\n`', start);
    assert(start >= 0 && end > start, 'Recorder text edit helper must remain present');
    const helper = source.slice(start, end);
    const ordered = [
      'Accessibility.find(selector',
      'edit.before.utf16Units',
      '__recorderUTF16SHA256(current)',
      'patch.start + patch.deleteCount > current.length',
      'edit.after.utf16Units',
      'Accessibility.perform(ref, { action: "setValue", value: next })',
      'performed.actionState !== "acknowledged"',
      'Accessibility.read(ref, { properties: ["value"] })',
      'text edit postcondition mismatch',
      'finally',
      'Accessibility.release(ref)',
    ];
    let cursor = -1;
    for (const fragment of ordered) {
      const next = helper.indexOf(fragment, cursor + 1);
      assert(next > cursor, 'missing or reordered Recorder text-edit contract: ' + fragment);
      cursor = next;
    }
    assert(helper.indexOf('UI.setValue') < 0, 'Recorder text patch must not collapse to simple UI.setValue');
  }, ['UI.setValue', 'Accessibility.find', 'Accessibility.read', 'Accessibility.perform', 'Accessibility.release']);
})();
