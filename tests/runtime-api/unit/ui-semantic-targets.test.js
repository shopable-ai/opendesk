// Inert contract tests for the high-level semantic UI.tapTargets facade.
// Resolver owners are local fixtures; no desktop observation or input occurs.
(() => {
  const { test, assert, equal } = RuntimeAPITest;
  const facadeSource = File.read(File.join(File.cwd(), 'polyfills/011-ui-targets.js'));
  const unit = (name, fn) => test({ name, tier: 'unit', covers: ['UI.tapTargets'] }, fn);

  function codedError(code, message = code, extra = {}) {
    return Object.assign(new Error(message), { code }, extra);
  }

  function fixture(settings = {}) {
    const state = {
      row: {
        id: 'fixture:42:native:7',
        pid: 42,
        processId: 42,
        title: 'Semantic Fixture',
        handle: 7,
        exePath: '/fixture/semantic',
        exeName: 'Semantic Fixture',
        x: 10,
        y: 20,
        width: 500,
        height: 400,
      },
      events: [],
      activeWindowCalls: 0,
      ocr: [],
      legacy: [],
      finds: [],
      reads: [],
      performs: [],
      releases: [],
      nextRef: 0,
    };

    const host = {
      window: {
        getActiveWindow: async () => {
          state.activeWindowCalls += 1;
          state.events.push('window:active');
          if (settings.activeWindowError) throw settings.activeWindowError;
          return { ...state.row };
        },
      },
      UI: {
        tapTargets: async (targets, options) => {
          state.legacy.push({ targets, options });
          state.events.push('legacy');
          return { ok: true, action: 'tapTargets', backend: 'accessibility', completed: [] };
        },
        tapText: async (text, options) => {
          const index = state.ocr.length;
          state.ocr.push({ text, options, index });
          state.events.push(`ocr:${text}`);
          if (settings.onTapText) {
            const overridden = await settings.onTapText(text, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          return {
            point: { x: 100 + index, y: 200 + index },
            target: { text, provider: 'fixture-ocr', confidence: 0.99 },
          };
        },
      },
      Accessibility: {
        find: async (selector, options) => {
          const index = state.finds.length;
          const snapshot = { ...selector };
          state.finds.push({ selector: snapshot, options, index });
          state.events.push(`find:${snapshot.name || snapshot.identifier || snapshot.role}`);
          if (settings.onFind) {
            const overridden = await settings.onFind(snapshot, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          const ref = { kind: 'AccessibilityElementRef', id: `semantic-ref-${++state.nextRef}` };
          Object.defineProperty(ref, '_selector', { value: snapshot });
          return ref;
        },
        read: async (ref, options) => {
          const index = state.reads.length;
          state.reads.push({ ref, options, index });
          state.events.push(`read:${ref._selector.name || ref._selector.identifier || ref._selector.role}`);
          if (settings.onRead) {
            const overridden = await settings.onRead(ref, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          return {
            requestId: `read-${index}`,
            backend: 'fixture-accessibility',
            properties: {
              role: ref._selector.role || 'button',
              name: ref._selector.name || null,
              identifier: ref._selector.identifier || null,
              enabled: true,
              actions: ['invoke'],
            },
          };
        },
        perform: async (ref, action, options) => {
          const index = state.performs.length;
          state.performs.push({ ref, action: { ...action }, options, index });
          state.events.push(`perform:${ref._selector.name || ref._selector.identifier || ref._selector.role}`);
          if (settings.onPerform) {
            const overridden = await settings.onPerform(ref, action, options, index, state);
            if (overridden !== undefined) return overridden;
          }
          return {
            requestId: `perform-${index}`,
            backend: 'fixture-accessibility',
            action: 'invoke',
            actionState: 'acknowledged',
          };
        },
        release: async ref => {
          const index = state.releases.length;
          state.releases.push({ ref, index });
          state.events.push(`release:${ref._selector.name || ref._selector.identifier || ref._selector.role}`);
          if (settings.onRelease) {
            const overridden = await settings.onRelease(ref, index, state);
            if (overridden !== undefined) return overridden;
          }
          return true;
        },
      },
    };

    new Function('globalThis', facadeSource)(host);
    state.host = host;
    return state;
  }

  async function rejects(run, code) {
    let error = null;
    try {
      await run();
    } catch (caught) {
      error = caught;
    }
    assert(error, `expected ${code}`);
    equal(error.code, code, String(error));
    equal(error.operation, 'UI.tapTargets');
    return error;
  }

  unit('semantic tapTargets keeps text-only calls simple and resolves the active window once', async () => {
    const f = fixture();
    const result = await f.host.UI.tapTargets([{ text: 'Save' }, { text: 'Done' }]);
    equal(result.ok, true);
    equal(result.completed.length, 2);
    equal(result.completed.map(item => item.resolver).join(','), 'ocr,ocr');
    equal(f.activeWindowCalls, 1);
    equal(f.ocr.length, 2);
    equal(f.finds.length, 0);
    equal(f.ocr[0].options.match, 'exact');
    equal(f.ocr[0].options.timeout, 3000);
    equal(f.ocr[0].options.within.id, f.row.id);
    equal(Object.prototype.hasOwnProperty.call(f.ocr[0].options, 'strategy'), false);
  });

  unit('semantic tapTargets falls through from OCR miss to exact Accessibility name', async () => {
    const f = fixture({
      onTapText: () => { throw codedError('TARGET_NOT_FOUND', 'OCR miss', { candidateCount: 0 }); },
    });
    const result = await f.host.UI.tapTargets([{ text: '×' }]);
    equal(result.completed.length, 1);
    equal(result.completed[0].resolver, 'accessibility');
    equal(f.ocr.length, 1);
    equal(f.finds.length, 1);
    equal(f.finds[0].selector.name, '×');
    equal(f.performs.length, 1);
    equal(f.releases.length, 1);
  });

  unit('semantic tapTargets falls through from OCR ambiguity to unique Accessibility target', async () => {
    const f = fixture({
      onTapText: () => {
        throw codedError('AMBIGUOUS_TARGET', 'two OCR candidates', {
          candidateCount: 2,
          candidates: [{ text: 'Confirm' }, { text: 'Confirm' }],
        });
      },
    });
    const result = await f.host.UI.tapTargets([{ text: 'Confirm' }]);
    equal(result.completed[0].resolver, 'accessibility');
    equal(f.finds[0].selector.name, 'Confirm');
    equal(f.performs.length, 1);
  });

  unit('semantic constraints are authoritative and use exact Accessibility selector fields', async () => {
    const f = fixture();
    const result = await f.host.UI.tapTargets([
      { text: 'Confirm', role: 'button' },
      { role: 'button', name: 'Save', identifier: 'save.primary' },
    ]);
    equal(result.completed.map(item => item.resolver).join(','), 'accessibility,accessibility');
    equal(f.ocr.length, 0, 'role/name constraints must not be discarded by an OCR-only click');
    equal(f.finds[0].selector.role, 'button');
    equal(f.finds[0].selector.name, 'Confirm');
    equal(f.finds[1].selector.role, 'button');
    equal(f.finds[1].selector.name, 'Save');
    equal(f.finds[1].selector.identifier, 'save.primary');
  });

  unit('semantic mixed target sequence executes strictly in order', async () => {
    const f = fixture({
      onTapText: text => {
        if (text === 'C') throw codedError('TARGET_NOT_FOUND', 'C is not visible to OCR');
        return undefined;
      },
    });
    const result = await f.host.UI.tapTargets([
      { text: 'A' },
      { role: 'button', name: 'B' },
      { text: 'C' },
    ], { within: { ...f.row }, timeout: 777 });
    equal(result.completed.map(item => item.resolver).join(','), 'ocr,accessibility,accessibility');
    equal(f.activeWindowCalls, 0);
    const relevant = f.events.filter(item => item.startsWith('ocr:') || item.startsWith('find:') || item.startsWith('perform:'));
    equal(relevant.join(','), 'ocr:A,find:B,perform:B,ocr:C,find:C,perform:C');
    equal(f.finds[0].options.timeout, 777);
  });

  unit('semantic middle failure stops later targets and reports the completed prefix', async () => {
    const f = fixture({
      onFind: selector => selector.name === 'Missing' ? null : undefined,
    });
    const error = await rejects(
      () => f.host.UI.tapTargets([
        { text: 'A' },
        { role: 'button', name: 'Missing' },
        { text: 'Never' },
      ]),
      'TARGET_NOT_FOUND',
    );
    equal(error.failedIndex, 1);
    equal(error.failedTarget.name, 'Missing');
    equal(error.completed.length, 1);
    equal(error.completed[0].index, 0);
    equal(error.attempts.length, 1);
    equal(error.attempts[0].resolver, 'accessibility');
    equal(f.ocr.map(item => item.text).join(','), 'A');
    equal(f.performs.length, 0);
  });

  unit('semantic tapTargets rejects caller-owned resolver strategy before observation', async () => {
    const targetFields = [
      { text: 'A', accessibility: { role: 'button' } },
      { text: 'A', fallback: 'accessibility' },
      { text: 'A', confidence: 0.9 },
      { text: 'A', coordinates: { x: 1, y: 2 } },
    ];
    for (const target of targetFields) {
      const f = fixture();
      await rejects(() => f.host.UI.tapTargets([target]), 'INVALID_ARGUMENT');
      equal(f.activeWindowCalls, 0);
      equal(f.ocr.length, 0);
      equal(f.finds.length, 0);
    }
    for (const options of [{ strategy: 'auto' }, { fallbackOrder: ['ocr', 'accessibility'] }, { provider: 'ocr' }]) {
      const f = fixture();
      await rejects(() => f.host.UI.tapTargets([{ text: 'A' }], options), 'INVALID_ARGUMENT');
      equal(f.activeWindowCalls, 0);
      equal(f.ocr.length, 0);
      equal(f.finds.length, 0);
    }
  });

  unit('semantic tapTargets preserves the legacy locator contract without normalization', async () => {
    const f = fixture();
    const targets = [{ locator: { role: 'button', name: 'Legacy' } }];
    const options = { within: { ...f.row }, maxDepth: 4, refocus: 'if-needed' };
    const result = await f.host.UI.tapTargets(targets, options);
    equal(result.backend, 'accessibility');
    equal(f.legacy.length, 1);
    equal(f.legacy[0].targets, targets);
    equal(f.legacy[0].options, options);
    equal(f.activeWindowCalls, 0);
    equal(f.ocr.length, 0);
    equal(f.finds.length, 0);
  });

  unit('semantic tapTargets never retries another resolver after uncertain native action state', async () => {
    const f = fixture({
      onTapText: () => { throw codedError('TARGET_NOT_FOUND', 'OCR miss'); },
      onPerform: () => ({
        requestId: 'uncertain',
        backend: 'fixture-accessibility',
        action: 'invoke',
        actionState: 'unknown',
      }),
    });
    const error = await rejects(() => f.host.UI.tapTargets([{ text: '×' }]), 'STATE_UNKNOWN');
    equal(error.failedIndex, 0);
    equal(error.failedPhase, 'action');
    equal(f.ocr.length, 1);
    equal(f.finds.length, 1);
    equal(f.performs.length, 1);
    equal(f.releases.length, 1);
    equal(error.attempts.map(item => item.resolver).join(','), 'ocr,accessibility');
    equal(error.attempts[1].phase, 'action');
  });

  unit('semantic tapTargets snapshots the sequence before the first await', async () => {
    const targets = [{ text: 'A' }, { text: 'B' }];
    const f = fixture({
      onTapText: (text, options, index) => {
        if (index === 0) targets[1].text = 'MUTATED';
        return undefined;
      },
    });
    await f.host.UI.tapTargets(targets);
    equal(f.ocr.map(item => item.text).join(','), 'A,B');
  });

  unit('semantic tapTargets preserves an acknowledged native completion when cleanup fails', async () => {
    const f = fixture({
      onRelease: () => { throw codedError('BACKEND_FAILED', 'release failed'); },
    });
    const error = await rejects(
      () => f.host.UI.tapTargets([
        { role: 'button', name: 'Submit' },
        { text: 'Never' },
      ]),
      'BACKEND_FAILED',
    );
    equal(error.failedIndex, 0);
    equal(error.failedPhase, 'cleanup');
    equal(error.completed.length, 1);
    equal(error.completed[0].index, 0);
    equal(error.completed[0].resolver, 'accessibility');
    equal(error.completed[0].actionState, 'acknowledged');
    equal(error.attempts[error.attempts.length - 1].phase, 'cleanup');
    equal(error.cleanupError.code, 'BACKEND_FAILED');
    equal(f.performs.length, 1);
    equal(f.ocr.length, 0, 'later targets must not run after native cleanup failure');
  });
})();
