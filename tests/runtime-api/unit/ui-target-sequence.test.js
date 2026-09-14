// Inert contract tests for UI.tapTargets. All Accessibility and window owners
// are local JavaScript fixtures; no desktop observation or input is performed.
(() => {
  const { test, assert, equal } = RuntimeAPITest;
  const uiSource = File.read(File.join(File.cwd(), 'polyfills/006-ui.js'));
  const unit = (name, fn, covers = ['UI.tapTargets']) => test({ name, tier: 'unit', covers }, fn);

  function nativeError(code, operation, phase, actionState = 'not_started') {
    return Object.assign(new Error(code), {
      code,
      operation,
      phase,
      actionState,
      backend: 'fixture-ax',
      requestId: 'fixture-error',
    });
  }

  function fixture(settings = {}) {
    const state = {
      row: {
        id: 'fixture:17:native:99',
        pid: 17,
        processId: 17,
        title: 'Target Fixture',
        handle: 99,
        exePath: '/fixture/target',
        exeName: 'Target Fixture',
        x: 100,
        y: 200,
        width: 420,
        height: 320,
      },
      events: [],
      windows: [],
      activations: [],
      finds: [],
      reads: [],
      performs: [],
      releases: [],
      activeRefs: new Set(),
      nextRef: 0,
    };
    const capabilities = {
      available: true,
      hostAuthorization: { enabled: true },
      implementation: { available: true, actions: { invoke: true } },
      permission: { granted: true },
    };
    const host = {
      window: {
        current: async query => {
          const index = state.windows.length;
          state.windows.push({ query: { ...query }, index });
          state.events.push(`window:${index}`);
          if (settings.onWindow) await settings.onWindow(index, state);
          if (settings.windowErrorAt === index) {
            throw Object.assign(new Error('window unavailable'), { code: settings.windowErrorCode || 'NOT_FOUND' });
          }
          return { ...state.row };
        },
        activate: async (query, options) => {
          const index = state.activations.length;
          state.activations.push({ query: { ...query }, options: { ...options }, index });
          state.events.push(`activate:${index}`);
          if (settings.onActivate) {
            const overridden = await settings.onActivate(index, state, options);
            if (overridden !== undefined) return overridden;
          }
          if (settings.activationErrorAt === index) {
            throw Object.assign(new Error('activation unavailable'), { code: 'VERIFICATION_FAILED' });
          }
          state.row.isForeground = true;
          state.row.hasFocus = true;
          return { ...state.row };
        },
      },
      Accessibility: {
        getCapabilities: () => settings.capabilities || capabilities,
        find: async (locator, options) => {
          const index = state.finds.length;
          const snapshot = { ...locator };
          state.finds.push({ locator: snapshot, options, index });
          state.events.push(`find:${snapshot.name || snapshot.identifier || snapshot.role}`);
          if (settings.onFind) {
            const overridden = await settings.onFind(snapshot, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          const ref = { kind: 'AccessibilityElementRef', id: `ref-${++state.nextRef}` };
          Object.defineProperty(ref, '_locator', { value: snapshot });
          state.activeRefs.add(ref);
          return ref;
        },
        read: async (ref, options) => {
          const index = state.reads.length;
          state.reads.push({ ref, options, index });
          state.events.push(`read:${ref._locator.name || ref._locator.identifier || ref._locator.role}`);
          if (settings.onRead) {
            const overridden = await settings.onRead(ref, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          return {
            requestId: `read-${index}`,
            backend: 'fixture-ax',
            properties: {
              role: ref._locator.role || 'button',
              name: Object.prototype.hasOwnProperty.call(ref._locator, 'name') ? ref._locator.name : null,
              identifier: Object.prototype.hasOwnProperty.call(ref._locator, 'identifier')
                ? ref._locator.identifier
                : null,
              enabled: true,
              actions: ['invoke'],
            },
          };
        },
        perform: async (ref, action, options) => {
          const index = state.performs.length;
          state.performs.push({ ref, action: { ...action }, options, index });
          state.events.push(`perform:${ref._locator.name || ref._locator.identifier || ref._locator.role}`);
          if (settings.onPerform) {
            const overridden = await settings.onPerform(ref, action, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          const actionState = Array.isArray(settings.actionStates)
            ? settings.actionStates[index]
            : (settings.actionState || 'acknowledged');
          return {
            requestId: `perform-${index}`,
            backend: 'fixture-ax',
            action: 'invoke',
            actionState,
          };
        },
        release: async ref => {
          const index = state.releases.length;
          state.releases.push({ ref, index });
          state.events.push(`release:${ref._locator.name || ref._locator.identifier || ref._locator.role}`);
          if (settings.onRelease) {
            const overridden = await settings.onRelease(ref, index, state);
            if (overridden !== undefined) return overridden;
          }
          state.activeRefs.delete(ref);
          return true;
        },
      },
    };
    new Function('globalThis', uiSource)(host);
    state.host = host;
    return state;
  }

  const step = name => ({ locator: { role: 'button', name } });

  async function rejects(run, code, index, phase, requiresPrefix = true) {
    let error = null;
    try {
      await run();
    } catch (caught) {
      error = caught;
    }
    assert(error, `expected ${code}`);
    equal(error.code, code, String(error));
    equal(error.operation, 'UI.tapTargets');
    if (index !== undefined) equal(error.failedIndex, index);
    if (phase !== undefined) equal(error.failedPhase, phase);
    if (requiresPrefix) assert(Array.isArray(error.completed), 'step error must include completed prefix');
    return error;
  }

  unit('tapTargets rejects malformed, sparse and unknown input before observation', async () => {
    const invalid = [
      [null, { within: {} }],
      [[], { within: {} }],
      [[{}], { within: {} }],
      [[{ locator: {} }], { within: {} }],
      [[{ locator: { role: 'not-a-role' } }], { within: {} }],
      [[{ locator: { role: 'button', alias: 'A' } }], { within: {} }],
      [[{ locator: { role: 'button' }, action: 'invoke' }], { within: {} }],
    ];
    for (const [targets, options] of invalid) {
      const f = fixture();
      await rejects(() => f.host.UI.tapTargets(targets, options), 'INVALID_ARGUMENT', undefined, undefined, false);
      equal(f.windows.length, 0);
      equal(f.finds.length, 0);
      equal(f.performs.length, 0);
    }
    const sparse = [step('A')];
    sparse.length = 2;
    const f = fixture();
    await rejects(() => f.host.UI.tapTargets(sparse, { within: { ...f.row } }), 'INVALID_ARGUMENT', undefined, undefined, false);
    equal(f.windows.length, 0);
    const g = fixture();
    await rejects(() => g.host.UI.tapTargets([step('A')], { within: { ...g.row }, fallback: 'vision' }), 'INVALID_ARGUMENT', undefined, undefined, false);
    equal(g.windows.length, 0);
    const refocusWithoutMode = fixture();
    await rejects(() => refocusWithoutMode.host.UI.tapTargets([step('A')], {
      within: { ...refocusWithoutMode.row }, refocusTimeout: 100,
    }), 'INVALID_ARGUMENT', undefined, undefined, false);
    equal(refocusWithoutMode.windows.length, 0);
    const h = fixture();
    const unresolved = { ...h.row, handle: 0 };
    await rejects(() => h.host.UI.tapTargets([step('A')], { within: unresolved }), 'INVALID_ARGUMENT', undefined, undefined, false);
    equal(h.windows.length, 0);
  });

  unit('tapTargets completes every distinct preflight before ordered invoke actions', async () => {
    const f = fixture();
    const result = await f.host.UI.tapTargets([step('A'), step('B'), step('A')], {
      within: { ...f.row }, timeout: 1234, maxDepth: 7, maxNodes: 321,
    });
    equal(result.ok, true);
    equal(result.action, 'tapTargets');
    equal(result.backend, 'accessibility');
    equal(f.finds.length, 2);
    equal(f.finds.map(item => item.locator.name).join(','), 'A,B');
    equal(f.finds[0].options.timeout, 1234);
    equal(f.finds[0].options.maxDepth, 7);
    equal(f.finds[0].options.maxNodes, 321);
    equal(f.performs.map(item => item.ref._locator.name).join(','), 'A,B,A');
    equal(result.completed.map(item => item.index).join(','), '0,1,2');
    equal(result.completed.map(item => item.actionState).join(','), 'acknowledged,acknowledged,acknowledged');
    equal(f.releases.length, 2);
    equal(f.activeRefs.size, 0);
    equal(f.activations.length, 0, 'default tapTargets unexpectedly activated a window');
    const firstPerform = f.events.findIndex(item => item.startsWith('perform:'));
    const lastFind = f.events.reduce((last, item, index) => item.startsWith('find:') ? index : last, -1);
    equal(firstPerform > lastFind, true, 'perform began before all distinct finds');

    const defaults = fixture();
    await defaults.host.UI.tapTargets([step('A')], { within: { ...defaults.row } });
    equal(defaults.finds[0].options.timeout, 3000);
    equal(defaults.finds[0].options.maxDepth, 8);
    equal(defaults.finds[0].options.maxNodes, 1000);
  });

  unit('tapTargets preflight failures perform zero actions and release every acquired ref', async () => {
    const cases = [
      {
        code: 'TARGET_NOT_FOUND',
        settings: { onFind: locator => locator.name === 'B' ? null : undefined },
      },
      {
        code: 'AMBIGUOUS_TARGET',
        settings: { onFind: locator => { if (locator.name === 'B') throw nativeError('AMBIGUOUS_TARGET', 'Accessibility.find', 'search'); } },
      },
      {
        code: 'SEARCH_INCOMPLETE',
        settings: { onFind: locator => { if (locator.name === 'B') throw nativeError('SEARCH_INCOMPLETE', 'Accessibility.find', 'search'); } },
      },
      {
        code: 'ELEMENT_DISABLED',
        settings: { onRead: ref => ref._locator.name === 'B' ? {
          backend: 'fixture-ax', requestId: 'disabled',
          properties: { role: 'button', name: 'B', identifier: null, enabled: false, actions: ['invoke'] },
        } : undefined },
      },
      {
        code: 'ACTION_NOT_SUPPORTED',
        settings: { onRead: ref => ref._locator.name === 'B' ? {
          backend: 'fixture-ax', requestId: 'no-invoke',
          properties: { role: 'button', name: 'B', identifier: null, enabled: true, actions: [] },
        } : undefined },
      },
    ];
    for (const item of cases) {
      const f = fixture(item.settings);
      const error = await rejects(
        () => f.host.UI.tapTargets([step('A'), step('B')], { within: { ...f.row } }),
        item.code,
        1,
        'preflight',
      );
      equal(error.actionState, 'not_started');
      equal(error.completed.length, 0);
      equal(f.performs.length, 0);
      equal(f.activeRefs.size, 0);
      equal(f.releases.length, item.code === 'TARGET_NOT_FOUND' || item.code === 'AMBIGUOUS_TARGET' || item.code === 'SEARCH_INCOMPLETE' ? 1 : 2);
    }
  });

  unit('tapTargets fails closed when fixed window identity or bounds changes', async () => {
    for (const mutation of [
      row => { row.id = 'fixture:17:native:100'; },
      row => { row.pid = 18; row.processId = 18; },
      row => { row.title = 'Other'; },
      row => { row.handle = 100; },
      row => { row.x += 1; },
    ]) {
      const f = fixture({ onWindow: (index, state) => { if (index === 3) mutation(state.row); } });
      const error = await rejects(
        () => f.host.UI.tapTargets([step('A'), step('B')], { within: { ...f.row } }),
        'STALE_TARGET',
        0,
        'preflight',
      );
      equal(error.completed.length, 0);
      equal(f.performs.length, 0);
      equal(f.releases.length, 2);
      equal(f.activeRefs.size, 0);
    }
    const closed = fixture({ windowErrorAt: 3 });
    await rejects(
      () => closed.host.UI.tapTargets([step('A'), step('B')], { within: { ...closed.row } }),
      'STALE_TARGET',
      0,
      'preflight',
    );
    equal(closed.performs.length, 0);
    equal(closed.activeRefs.size, 0);

    const backendFailed = fixture({ windowErrorAt: 3, windowErrorCode: 'BACKEND_FAILED' });
    const backendError = await rejects(
      () => backendFailed.host.UI.tapTargets([step('A'), step('B')], { within: { ...backendFailed.row } }),
      'BACKEND_FAILED',
      0,
      'preflight',
    );
    equal(backendError.cause.code, 'BACKEND_FAILED');
    equal(backendFailed.performs.length, 0);
    equal(backendFailed.activeRefs.size, 0);

    const changedAfterFirstAction = fixture({
      onWindow: (index, state) => { if (index === 5) state.row.handle += 1; },
    });
    const actionWindowError = await rejects(
      () => changedAfterFirstAction.host.UI.tapTargets([step('A'), step('B')], {
        within: { ...changedAfterFirstAction.row },
      }),
      'STALE_TARGET',
      1,
      'action',
    );
    equal(actionWindowError.completed.length, 1);
    equal(changedAfterFirstAction.performs.length, 1);
    equal(changedAfterFirstAction.activeRefs.size, 0);
  });

  unit('tapTargets preserves completion prefixes for acknowledged, unknown and not_started action states', async () => {
    const acknowledged = fixture({ actionStates: ['acknowledged', 'not_needed'] });
    const receipt = await acknowledged.host.UI.tapTargets([step('A'), step('B')], { within: { ...acknowledged.row } });
    equal(receipt.completed.length, 2);
    equal(receipt.completed[0].backend, 'fixture-ax');
    equal(receipt.completed[1].actionState, 'not_needed');

    const unknown = fixture({ actionStates: ['acknowledged', 'unknown', 'acknowledged'] });
    const unknownError = await rejects(
      () => unknown.host.UI.tapTargets([step('A'), step('B'), step('C')], { within: { ...unknown.row } }),
      'STATE_UNKNOWN',
      1,
      'action',
    );
    equal(unknownError.actionState, 'unknown');
    equal(unknownError.completed.length, 1);
    equal(unknown.performs.length, 2);
    equal(unknown.releases.length, 3);
    equal(unknown.activeRefs.size, 0);

    const notStarted = fixture({ actionStates: ['acknowledged', 'not_started', 'acknowledged'] });
    const notStartedError = await rejects(
      () => notStarted.host.UI.tapTargets([step('A'), step('B'), step('C')], { within: { ...notStarted.row } }),
      'BACKEND_FAILED',
      1,
      'action',
    );
    equal(notStartedError.actionState, 'not_started');
    equal(notStartedError.completed.length, 1);
    equal(notStarted.performs.length, 2);
    equal(notStarted.activeRefs.size, 0);
  });

  unit('tapTargets never retries or falls back after invoke submission', async () => {
    const f = fixture({
      onPerform: () => { throw nativeError('BACKEND_FAILED', 'Accessibility.perform', 'action', 'unknown'); },
    });
    const error = await rejects(
      () => f.host.UI.tapTargets([step('A'), step('B')], { within: { ...f.row } }),
      'BACKEND_FAILED',
      0,
      'action',
    );
    equal(error.actionState, 'unknown');
    equal(error.completed.length, 0);
    equal(f.performs.length, 1);
    equal(f.finds.length, 2);
    equal(f.releases.length, 2);
    equal(f.activeRefs.size, 0);
    assert(f.host.Vision === undefined && f.host.mouse === undefined, 'visual fallback dependency was installed');
  });

  unit('tapTargets can exactly refocus the frozen window immediately before each invoke', async () => {
    const f = fixture({
      onRead: (ref, options, index, state) => {
        if (index === 2 || index === 3) {
          state.row.isForeground = false;
          state.row.hasFocus = false;
        }
      },
      onPerform: (ref, action, options, index, state) => {
        state.row.isForeground = false;
        state.row.hasFocus = false;
      },
    });
    const receipt = await f.host.UI.tapTargets([step('A'), step('B')], {
      within: { ...f.row }, refocus: 'if-needed', refocusTimeout: 321,
    });
    equal(receipt.completed.length, 2);
    equal(f.activations.length, 2);
    equal(f.activations.every(item => item.options.timeout === 321), true);
    for (let index = 0; index < 2; index += 1) {
      const activation = f.events.indexOf(`activate:${index}`);
      const perform = f.events.indexOf(`perform:${index === 0 ? 'A' : 'B'}`);
      equal(activation >= 0 && activation < perform, true, 'exact refocus was not immediately before invoke');
    }
    equal(f.performs.length, 2);
    equal(f.activeRefs.size, 0);
  });

  unit('tapTargets refocus failure is fail-closed and never resumes after unknown action state', async () => {
    const failed = fixture({ activationErrorAt: 0 });
    const activationError = await rejects(() => failed.host.UI.tapTargets([step('A'), step('B')], {
      within: { ...failed.row }, refocus: 'if-needed',
    }), 'VERIFICATION_FAILED', 0, 'action');
    equal(activationError.actionState, 'not_started');
    equal(failed.activations.length, 1);
    equal(failed.performs.length, 0);
    equal(failed.activeRefs.size, 0);

    const unknown = fixture({
      onPerform: () => { throw nativeError('BACKEND_FAILED', 'Accessibility.perform', 'action', 'unknown'); },
    });
    const unknownError = await rejects(() => unknown.host.UI.tapTargets([step('A'), step('B')], {
      within: { ...unknown.row }, refocus: 'if-needed',
    }), 'BACKEND_FAILED', 0, 'action');
    equal(unknownError.actionState, 'unknown');
    equal(unknown.activations.length, 1);
    equal(unknown.performs.length, 1);
    equal(unknown.activeRefs.size, 0);
  });

  unit('tapTargets releases all refs on cancellation and target revalidation failure', async () => {
    const controller = new AbortController();
    const canceled = fixture({
      onWindow: index => { if (index === 4) controller.abort(); },
    });
    const canceledError = await rejects(
      () => canceled.host.UI.tapTargets([step('A'), step('B')], {
        within: { ...canceled.row }, signal: controller.signal,
      }),
      'CANCELED',
      0,
      'action',
    );
    equal(canceledError.completed.length, 0);
    equal(canceled.performs.length, 0);
    equal(canceled.releases.length, 2);
    equal(canceled.activeRefs.size, 0);

    const afterSubmitController = new AbortController();
    const canceledAfterSubmit = fixture({
      onPerform: (ref, action, options, index) => {
        if (index === 0) afterSubmitController.abort();
      },
    });
    const afterSubmitError = await rejects(
      () => canceledAfterSubmit.host.UI.tapTargets([step('A'), step('B')], {
        within: { ...canceledAfterSubmit.row }, signal: afterSubmitController.signal,
      }),
      'CANCELED',
      0,
      'action',
    );
    equal(afterSubmitError.actionState, 'acknowledged');
    equal(afterSubmitError.completed.length, 1);
    equal(canceledAfterSubmit.performs.length, 1);
    equal(canceledAfterSubmit.releases.length, 2);
    equal(canceledAfterSubmit.activeRefs.size, 0);

    const stale = fixture({
      onRead: (ref, options, index) => index === 2 ? {
        backend: 'fixture-ax', requestId: 'stale-read',
        properties: { role: 'button', name: 'changed', identifier: null, enabled: true, actions: ['invoke'] },
      } : undefined,
    });
    await rejects(
      () => stale.host.UI.tapTargets([step('A'), step('B')], { within: { ...stale.row } }),
      'STALE_TARGET',
      0,
      'action',
    );
    equal(stale.performs.length, 0);
    equal(stale.releases.length, 2);
    equal(stale.activeRefs.size, 0);
  });

  unit('tapTargets snapshots caller arrays, locators and WindowInfo before awaiting', async () => {
    const f = fixture();
    const targets = [step('A'), step('B')];
    const within = { ...f.row };
    const pending = f.host.UI.tapTargets(targets, { within });
    targets[0].locator.name = 'changed-A';
    targets[1] = step('changed-B');
    targets.push(step('C'));
    within.id = 'changed-window';
    within.x += 50;
    const result = await pending;
    equal(f.finds.map(item => item.locator.name).join(','), 'A,B');
    equal(f.performs.map(item => item.ref._locator.name).join(','), 'A,B');
    equal(result.completed.length, 2);
    equal(f.windows[0].query.id, 'fixture:17:native:99');
    equal(f.activeRefs.size, 0);
  });

  unit('tapTargets reports cleanup failure without losing a primary action failure', async () => {
    const f = fixture({
      onPerform: () => { throw nativeError('BACKEND_FAILED', 'Accessibility.perform', 'action', 'unknown'); },
      onRelease: (ref, index, state) => {
        state.activeRefs.delete(ref);
        if (index === 0) throw nativeError('BACKEND_FAILED', 'Accessibility.release', 'reference');
        return true;
      },
    });
    const error = await rejects(
      () => f.host.UI.tapTargets([step('A'), step('B')], { within: { ...f.row } }),
      'BACKEND_FAILED',
      0,
      'action',
    );
    equal(error.actionState, 'unknown');
    equal(error.cleanupErrors.length, 1);
    equal(f.releases.length, 2);
    equal(f.activeRefs.size, 0);
  });
})();
