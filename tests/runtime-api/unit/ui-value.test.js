// Inert registration for the shared OpenDesk Runtime API runner. The facade is
// evaluated with an isolated Accessibility owner; no real window is inspected
// and no native action or desktop input is sent.
(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const uiSource = File.read(File.join(File.cwd(), 'polyfills/006-ui.js'));
  const unit = (name, fn, covers = []) => test({ name, tier: 'unit', covers }, fn);

  function nativeError(code, operation, phase = 'fixture', actionState = 'not_started') {
    return Object.assign(new Error('redacted native fixture failure'), {
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
            if (property === 'enabled' && settings.omitEnabled !== true) {
              properties.enabled = settings.enabled === undefined ? true : settings.enabled;
            }
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
    for (const method of settings.omitMethods || []) delete host.Accessibility[method];
    new Function('globalThis', 'Date', uiSource)(host, { now: () => state.now });
    state.host = host;
    return state;
  }

  async function rejects(fn, code, operation, phase) {
    let error;
    try { await fn(); } catch (caught) { error = caught; }
    assert(error, 'expected ' + code);
    equal(error.code, code, String(error));
    if (operation) equal(error.operation, operation, String(error));
    if (phase) equal(error.phase, phase, String(error));
    return error;
  }

  function assertNoMarker(value, marker, label, seen = []) {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
      assert(value.indexOf(marker) < 0, label + ' leaked protected value');
      return;
    }
    if (typeof value !== 'object' || seen.indexOf(value) >= 0) return;
    seen.push(value);
    if (value instanceof Error) {
      assertNoMarker(value.message, marker, label + '.message', seen);
      assertNoMarker(value.stack, marker, label + '.stack', seen);
    }
    for (const key of Object.keys(value)) assertNoMarker(value[key], marker, label + '.' + key, seen);
  }

  unit('getValue returns native strings byte-for-byte and releases the same ref', async () => {
    for (const expected of ['', '00123', '中文', 'first\nsecond', '  keep \n whitespace  ']) {
      const f = fixture({ value: expected });
      const actual = await f.host.UI.getValue(
        { role: 'textField', identifier: 'editor' },
        { within: { id: 'fixture-window' } },
      );
      equal(actual, expected);
      equal(typeof actual, 'string');
      equal(f.calls.find.length, 1);
      equal(f.calls.read.length, 1);
      equal(f.calls.release.length, 1);
      equal(f.calls.read[0].ref, f.ref);
      equal(f.calls.release[0].ref, f.ref);
    }
  }, ['UI.getValue']);

  unit('getValue permits a readable readonly field and does not require native perform', async () => {
    const f = fixture({ value: 'read only', enabled: false, actions: [], omitMethods: ['perform'] });
    equal(await f.host.UI.getValue({ role: 'textField' }, { within: {} }), 'read only');
    equal(f.calls.read.length, 1);
    equal(f.calls.release.length, 1);
  }, ['UI.getValue']);

  unit('setValue accepts only complete strings and preserves their exact payload', async () => {
    for (const expected of ['', '00123', '中文', 'first\nsecond', '  keep \n whitespace  ']) {
      const f = fixture();
      const receipt = await f.host.UI.setValue({ role: 'textField' }, expected, { within: {} });
      equal(f.calls.perform.length, 1);
      equal(f.calls.perform[0].action.value, expected);
      equal(f.calls.read.length, 2);
      assert(f.calls.read.every(call => call.ref === f.ref), 'both reads must keep the same ref');
      equal(f.calls.perform[0].ref, f.ref);
      equal(f.calls.release[0].ref, f.ref);
      equal(receipt.actionState, 'acknowledged');
      equal(receipt.verified, true);
      assert(!('value' in receipt) && !('oldValue' in receipt) && !('newValue' in receipt), JSON.stringify(receipt));
    }
  }, ['UI.setValue']);

  unit('argument and capability failures conform without native observation or input', async () => {
    const target = { role: 'textField' };
    const f = fixture();
    const missingScope = await rejects(() => f.host.UI.getValue(target), 'INVALID_ARGUMENT', 'UI.getValue', 'arguments');
    equal(missingScope.actionState, 'not_started');
    await rejects(() => f.host.UI.getValue(target, { within: undefined }), 'INVALID_ARGUMENT', 'UI.getValue', 'arguments');
    await rejects(() => f.host.UI.setValue(target, 'new', { within: null }), 'INVALID_ARGUMENT', 'UI.setValue', 'arguments');
    await rejects(() => f.host.UI.getValue(target, { within: {}, signal: {} }), 'INVALID_ARGUMENT', 'UI.getValue', 'arguments');
    for (const value of [0, 123, false, null, undefined, { toString: () => 'text' }]) {
      await rejects(() => f.host.UI.setValue(target, value, { within: {} }), 'INVALID_ARGUMENT', 'UI.setValue', 'arguments');
    }
    equal(f.calls.find.length, 0);
    equal(f.calls.perform.length, 0);

    for (const method of ['find', 'read', 'release', 'perform']) {
      const unavailable = fixture({ omitMethods: [method] });
      await rejects(() => unavailable.host.UI.setValue(target, 'new', { within: {} }), 'NOT_SUPPORTED', 'UI.setValue', 'capability');
      equal(unavailable.calls.find.length, 0);
      equal(unavailable.calls.perform.length, 0);
    }
  }, ['UI.getValue', 'UI.setValue']);

  unit('selectors and scope pass through unchanged with bounded traversal options', async () => {
    const selector = { role: 'textField', name: 'Title', identifier: 'editor' };
    const within = Object.freeze({ kind: 'AccessibilityElementRef', id: 'container-ref' });
    const f = fixture({ value: 'same-contract' });
    equal(await f.host.UI.getValue(selector, { within, maxDepth: 12, maxNodes: 345 }), 'same-contract');
    equal(f.calls.find[0].target, selector);
    equal(f.calls.find[0].options.within, within);
    equal(f.calls.find[0].options.maxDepth, 12);
    equal(f.calls.find[0].options.maxNodes, 345);
  }, ['UI.getValue']);

  unit('no target, ambiguity, incomplete search and stale ref retain locate/read phases', async () => {
    const target = { role: 'textField' };
    const none = fixture({ found: false });
    const missing = await rejects(() => none.host.UI.getValue(target, { within: {} }), 'TARGET_NOT_FOUND', 'UI.getValue', 'locate');
    equal(missing.actionState, 'not_started');
    equal(none.calls.release.length, 0);
    for (const code of ['AMBIGUOUS_TARGET', 'SEARCH_INCOMPLETE']) {
      const f = fixture({ onFind: () => { throw nativeError(code, 'Accessibility.find', 'search'); } });
      const error = await rejects(() => f.host.UI.getValue(target, { within: {} }), code, 'UI.getValue', 'locate');
      equal(error.nativePhase, 'search');
      equal(error.cause.operation, 'Accessibility.find');
      equal(error.backend, 'fixture');
      equal(error.requestId, 'fixture-error');
      equal(f.calls.release.length, 0);
    }
    const stale = fixture({ onRead: () => { throw nativeError('STALE_TARGET', 'Accessibility.read', 'reference'); } });
    const error = await rejects(() => stale.host.UI.getValue(target, { within: {} }), 'STALE_TARGET', 'UI.getValue', 'read');
    equal(error.nativePhase, 'reference');
    equal(stale.calls.release.length, 1);

    const samePhase = fixture({ onRead: () => { throw nativeError('PERMISSION_DENIED', 'Accessibility.read', 'read'); } });
    const protectedError = await rejects(() => samePhase.host.UI.getValue(target, { within: {} }), 'PERMISSION_DENIED', 'UI.getValue', 'read');
    equal(protectedError.nativePhase, 'read');
    equal(samePhase.calls.release.length, 1);
  }, ['UI.getValue']);

  unit('getValue rejects non-text and non-string native values without coercion or fallback', async () => {
    for (const settings of [
      { role: 'checkbox', value: 'true' },
      { role: 'textField', value: 123 },
      { role: 'textField', value: false },
      { role: 'textField', value: { toString: () => 'hidden conversion' } },
    ]) {
      const f = fixture(settings);
      const error = await rejects(() => f.host.UI.getValue({ role: 'textField' }, { within: {} }), 'NOT_SUPPORTED', 'UI.getValue', 'read');
      equal(error.backend, 'fixture');
      equal(error.requestId, 'read-0');
      equal(f.calls.release.length, 1);
    }
  }, ['UI.getValue']);

  unit('setValue accepts unavailable enabled only when the native action list proves writability', async () => {
    for (const settings of [{ enabled: null }, { omitEnabled: true }]) {
      const f = fixture(settings);
      const receipt = await f.host.UI.setValue({ role: 'textField' }, 'new', { within: {} });
      equal(receipt.actionState, 'acknowledged');
      equal(receipt.verified, true);
      equal(f.calls.perform.length, 1);
      equal(f.calls.release.length, 1);
    }
  }, ['UI.setValue']);

  unit('setValue fails disabled, readonly, unsupported and protected targets before action', async () => {
    const cases = [
      [{ enabled: false }, 'ELEMENT_DISABLED'],
      [{ actions: [] }, 'ACTION_NOT_SUPPORTED'],
      [{ role: 'staticText' }, 'NOT_SUPPORTED'],
      [{ onRead: () => { throw nativeError('PERMISSION_DENIED', 'Accessibility.read', 'protected'); } }, 'PERMISSION_DENIED'],
    ];
    for (const [settings, code] of cases) {
      const f = fixture(settings);
      const error = await rejects(() => f.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), code, 'UI.setValue', 'precondition');
      equal(error.actionState, 'not_started');
      if (!settings.onRead) {
        equal(error.backend, 'fixture');
        equal(error.requestId, 'read-0');
      }
      equal(f.calls.perform.length, 0);
      equal(f.calls.release.length, 1);
    }
  }, ['UI.setValue']);

  unit('default and explicit total budgets decrease across every native stage', async () => {
    const read = fixture({ value: 'budget', findMs: 1000, readMs: 500 });
    equal(await read.host.UI.getValue({ role: 'textField' }, { within: {} }), 'budget');
    equal(read.calls.find[0].options.timeout, 3000);
    equal(read.calls.read[0].options.timeout, 2000);

    const write = fixture({ findMs: 400, readMs: 300, performMs: 200 });
    await write.host.UI.setValue({ role: 'textField' }, 'new', { within: {}, timeout: 2500 });
    equal(write.calls.find[0].options.timeout, 2500);
    equal(write.calls.read[0].options.timeout, 2100);
    equal(write.calls.perform[0].options.timeout, 1800);
    equal(write.calls.read[1].options.timeout, 1600);
  }, ['UI.getValue', 'UI.setValue']);

  unit('expiry while preparing perform is not_started and invokes perform zero times', async () => {
    const f = fixture({
      findMs: 1500,
      readMs: 1499,
      onRead: (ref, options, index, state) => {
        const actions = ['setValue'];
        actions.indexOf = value => {
          state.now = 3000;
          return value === 'setValue' ? 0 : -1;
        };
        return { properties: { role: 'textField', enabled: true, actions, value: state.value } };
      },
    });
    const error = await rejects(() => f.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'TIMEOUT', 'UI.setValue', 'action');
    equal(error.actionState, 'not_started');
    assert(error.verified === undefined, 'unstarted action must not claim verification');
    equal(f.calls.perform.length, 0);
    equal(f.calls.release.length, 1);
  }, ['UI.setValue']);

  unit('perform result actionState is preserved independently from matching verification', async () => {
    for (const actionState of ['acknowledged', 'not_needed', 'unknown']) {
      const f = fixture({ actionState });
      const receipt = await f.host.UI.setValue({ role: 'textField' }, 'new', { within: {} });
      equal(receipt.actionState, actionState);
      equal(receipt.verified, true);
      equal(f.calls.perform.length, 1);
    }
    const notStarted = fixture({ actionState: 'not_started' });
    const error = await rejects(() => notStarted.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'BACKEND_FAILED', 'UI.setValue', 'action');
    equal(error.actionState, 'not_started');
    equal(notStarted.calls.perform.length, 1);
  }, ['UI.setValue']);

  unit('perform thrown actionState remains reliable and is never retried', async () => {
    for (const actionState of ['not_started', 'acknowledged', 'unknown']) {
      const f = fixture({ onPerform: () => { throw nativeError('BACKEND_FAILED', 'Accessibility.perform', 'invoke', actionState); } });
      const error = await rejects(() => f.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'BACKEND_FAILED', 'UI.setValue', 'action');
      equal(error.actionState, actionState);
      equal(error.nativePhase, 'invoke');
      equal(f.calls.perform.length, 1);
      equal(f.calls.read.length, 1);
      equal(f.calls.release.length, 1);
    }
  }, ['UI.setValue']);

  unit('post-action timeout, readback failure and mismatch perform at most once', async () => {
    const timeout = fixture({ performMs: 3000 });
    const timedOut = await rejects(() => timeout.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'TIMEOUT', 'UI.setValue', 'action');
    equal(timedOut.actionState, 'acknowledged');
    equal(timedOut.verified, false);
    equal(timedOut.backend, 'fixture');
    equal(timedOut.requestId, 'perform-0');

    const readFailure = fixture({
      onRead: (ref, options, index, state) => {
        if (index === 1) throw nativeError('STALE_TARGET', 'Accessibility.read', 'reference');
        return { properties: { role: 'textField', enabled: true, actions: ['setValue'], value: state.value } };
      },
    });
    const stale = await rejects(() => readFailure.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'STALE_TARGET', 'UI.setValue', 'verification');
    equal(stale.actionState, 'acknowledged');
    equal(stale.verified, false);

    const mismatch = fixture({ keepOldValue: true });
    const unknown = await rejects(() => mismatch.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'STATE_UNKNOWN', 'UI.setValue', 'verification');
    equal(unknown.actionState, 'acknowledged');
    equal(unknown.verified, false);
    for (const current of [timeout, readFailure, mismatch]) equal(current.calls.perform.length, 1);
  }, ['UI.setValue']);

  unit('cleanup failure cannot replace completed verification or a primary error', async () => {
    const cleanupFailure = () => { throw nativeError('BACKEND_FAILED', 'Accessibility.release', 'reference'); };
    const success = fixture({ onRelease: cleanupFailure });
    const cleanup = await rejects(() => success.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'BACKEND_FAILED', 'UI.setValue', 'cleanup');
    equal(cleanup.nativePhase, 'reference');
    equal(cleanup.actionState, 'acknowledged');
    equal(cleanup.verified, true);

    const primary = fixture({ keepOldValue: true, onRelease: cleanupFailure });
    const mismatch = await rejects(() => primary.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'STATE_UNKNOWN', 'UI.setValue', 'verification');
    equal(mismatch.actionState, 'acknowledged');
    equal(mismatch.verified, false);
    equal(mismatch.cleanupError.code, 'BACKEND_FAILED');
    equal(mismatch.cleanupError.phase, 'cleanup');
    equal(mismatch.cleanupError.nativePhase, 'reference');
    equal(primary.calls.perform.length, 1);
  }, ['UI.setValue']);

  unit('outer cancellation before action creates no later input and still releases acquired refs', async () => {
    const canceledLocate = fixture({ onFind: () => { throw nativeError('CANCELED', 'Accessibility.find', 'queue'); } });
    await rejects(() => canceledLocate.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'CANCELED', 'UI.setValue', 'locate');
    equal(canceledLocate.calls.perform.length, 0);
    equal(canceledLocate.calls.release.length, 0);

    const canceledRead = fixture({ onRead: () => { throw nativeError('CANCELED', 'Accessibility.read', 'queue'); } });
    await rejects(() => canceledRead.host.UI.setValue({ role: 'textField' }, 'new', { within: {} }), 'CANCELED', 'UI.setValue', 'precondition');
    equal(canceledRead.calls.perform.length, 0);
    equal(canceledRead.calls.release.length, 1);
  }, ['UI.setValue']);

  unit('value diagnostics and receipts do not echo the protected text payload', async () => {
    const marker = 'OPENDESK_UI_VALUE_PRIVACY_73f0c6a9';
    const read = fixture({ value: marker });
    equal(await read.host.UI.getValue({ role: 'textField' }, { within: {} }), marker);

    const written = fixture();
    const receipt = await written.host.UI.setValue({ role: 'textField' }, marker, { within: {} });
    assertNoMarker(receipt, marker, 'receipt');

    const failed = fixture({ enabled: false, value: marker });
    const error = await rejects(() => failed.host.UI.setValue({ role: 'textField' }, marker, { within: {} }), 'ELEMENT_DISABLED', 'UI.setValue', 'precondition');
    assertNoMarker(error, marker, 'error');

    const cleanup = fixture({ keepOldValue: true, value: marker, onRelease: () => { throw nativeError('BACKEND_FAILED', 'Accessibility.release', 'reference'); } });
    const mismatch = await rejects(() => cleanup.host.UI.setValue({ role: 'textField' }, marker + '-new', { within: {} }), 'STATE_UNKNOWN', 'UI.setValue', 'verification');
    assertNoMarker(mismatch, marker, 'primary-with-cleanup');
  }, ['UI.getValue', 'UI.setValue']);

})();
