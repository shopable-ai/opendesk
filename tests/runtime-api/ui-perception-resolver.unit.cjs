'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../../polyfills/013-ui-perception.js'), 'utf8');
const WIN = Object.freeze({
  id: 'fixture:17:99', pid: 17, processId: 17, handle: 99, title: 'Fixture', exeName: 'Fixture',
  x: 100, y: 200, width: 400, height: 300,
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function structured(code, message, extra) {
  const value = Object.assign(new Error(message || code), {code});
  if (extra) Object.assign(value, extra);
  return value;
}
function ocr(text, x, y) {
  return {source: 'ocr', text, confidence: 0.99, provider: 'fixture', imageBounds: {x: 0, y: 0, width: 10, height: 10},
    bounds: {x, y, width: 40, height: 20, coordinateSpace: 'screen'}, center: {x: x + 20, y: y + 10}};
}
function element(text, box, extra) {
  return Object.assign({text, bbox_norm: box, confidence: 0.99, actionable: true}, extra || {});
}
function perception(elements) {
  return {image: {hash: 'fixture-image'}, window: {bounds_screen: [100, 200, 500, 500]}, elements};
}

function harness(settings = {}) {
  const calls = {ocr: 0, ax: 0, vlm: 0, screenshot: 0, mouse: 0, nativeInput: 0};
  const state = {window: clone(WIN)};
  const UI = {
    getCapabilities: () => ({text: {backend: 'Vision.runOCR'}}),
    findTexts: async (_query, options) => {
      calls.ocr += 1;
      if (settings.moveDuringOCR && calls.ocr === 1) state.window.x += 200;
      if (settings.ocrError) throw settings.ocrError;
      return clone(typeof settings.ocr === 'function' ? await settings.ocr(calls, state, options) : settings.ocr || []);
    },
    findText: async () => null,
    hasText: async () => false,
    tapText: async () => { throw new Error('resolver must own ordinary text input'); },
    tapTexts: async () => { throw new Error('resolver must own ordinary text sequence'); },
    waitText: async () => null,
    waitTextGone: async () => true,
    findTextMatches: async () => [],
    tapTargets: async (_targets, options) => {
      calls.nativeInput += 1;
      calls.nativeOptions = options;
      if (settings.nativeInputError) throw settings.nativeInputError;
      if (settings.nativeInput) return settings.nativeInput(options);
      return {ok: true, action: 'tapTargets', completed: [{action: 'invoke', actionState: 'acknowledged'}]};
    },
  };
  const sandbox = {
    UI,
    window: {getActiveWindow: async () => settings.activeWindow ? settings.activeWindow(state) : clone(state.window)},
    mouse: {clickPoint: async () => { calls.mouse += 1; if (settings.mouseError) throw settings.mouseError; }},
    page: {
      screenshot: async () => { calls.screenshot += 1; if (settings.screenshot) await settings.screenshot(); return 'ZmFrZQ=='; },
      waitForTimeout: async milliseconds => { if (settings.wait) await settings.wait(milliseconds); },
    },
    setTimeout,
    Date: settings.Date || Date,
    Promise,
    RegExp,
    Object,
    Array,
    Number,
    String,
    Error,
    console,
  };
  if (settings.ax !== false) {
    sandbox.Accessibility = {
      getCapabilities: () => ({available: true}),
      snapshot: async options => {
        calls.ax += 1;
        if (settings.axError) throw settings.axError;
        return clone(typeof settings.snapshot === 'function' ? await settings.snapshot(options) :
          settings.snapshot || {complete: true, truncated: false, backend: 'fixture-ax', root: null});
      },
    };
  }
  if (settings.vlm) {
    sandbox.DesktopVision = {
      getCapabilities: () => Object.assign({policyAllowed: true, configured: true, sharedMultimodal: true}, settings.vlmCapabilities || {}),
      observe: async options => {
        calls.vlm += 1;
        if (settings.observeVLM) await settings.observeVLM(options);
        if (settings.moveDuringVLM) state.window.width += 1;
        if (settings.vlmError) throw settings.vlmError;
        return {transport: 'fixture-vlm', perception: settings.vlm};
      },
    };
  }
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {filename: '013-ui-perception.js'});
  return {UI, calls, state};
}
async function rejects(run, code) {
  let caught = null;
  try { await run(); } catch (value) { caught = value; }
  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code, caught.stack || String(caught));
  return caught;
}

(async () => {
  let count = 0;
  async function test(name, fn) {
    await fn();
    count += 1;
    console.log(`ok ${count} - ${name}`);
  }

  await test('A native OCR unique target does not invoke VLM', async () => {
    const h = harness({ocr: [ocr('Save', 150, 250)], vlm: perception([element('Save', [0.1, 0.1, 0.2, 0.2])])});
    const result = await h.UI.tapText('Save', {within: clone(WIN)});
    assert.strictEqual(result.target.source, 'ocr');
    assert.strictEqual(h.calls.vlm, 0);
    assert.strictEqual(h.calls.mouse, 1);
    assert.strictEqual(result.requestId, undefined, 'OCR pointer input must not invent a native request id');
  });

  await test('B Apple/OCR provider failure is not converted to target-not-found', async () => {
    const h = harness({ocrError: structured('OCR_FAILED', 'Apple helper unavailable'), ax: false});
    await rejects(() => h.UI.findText('Save', {within: clone(WIN)}), 'OCR_FAILED');
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('C OCR miss uses unique Accessibility target without VLM', async () => {
    const h = harness({ocr: [], vlm: perception([element('Save', [0.1, 0.1, 0.2, 0.2])]),
      nativeInput: () => ({ok: true, completed: [{action: 'invoke', actionState: 'acknowledged', requestId: 'native-request-C'}]}), snapshot: {
      complete: true, truncated: false, backend: 'fixture-ax', root: {
        role: 'button', name: 'Save', identifier: 'save', enabled: true, actions: ['invoke'],
        // macOS global display points are the documented native coordinate
        // space that safely maps to current WindowInfo screen coordinates.
        bounds: null,
        nativeBounds: {x: 150, y: 250, width: 60, height: 30, coordinateSpace: 'macos-global-display-points-top-left'}, children: [],
      },
    }});
    const result = await h.UI.tapText('Save', {within: clone(WIN)});
    assert.strictEqual(result.backend, 'accessibility');
    assert.strictEqual(result.requestId, 'native-request-C');
    assert.strictEqual(h.calls.nativeInput, 1);
    assert(h.calls.nativeOptions.timeout > 0 && h.calls.nativeOptions.timeout <= 10000);
    assert.strictEqual(h.calls.nativeOptions.polling, 200);
    assert.strictEqual(h.calls.vlm, 0);
    const sequence = await h.UI.tapTexts(['Save'], {within: clone(WIN)});
    assert.strictEqual(sequence.completed[0].requestId, 'native-request-C');
  });

  await test('C1 only a two-point macOS native frame edge drift is clipped into the current scope', async () => {
    const h = harness({ocr: [], snapshot: {
      complete: true, truncated: false, backend: 'fixture-ax', root: {
        role: 'button', name: 'Edge', identifier: 'edge', enabled: true, actions: ['invoke'], bounds: null,
        nativeBounds: {x: 100, y: 470, width: 80, height: 31, coordinateSpace: 'macos-global-display-points-top-left'}, children: [],
      },
    }});
    const result = await h.UI.findText('Edge', {within: clone(WIN)});
    assert(result && result.source === 'accessibility');
    assert.strictEqual(result.bounds.y + result.bounds.height, 500);
  });

  await test('D local unresolved accepts one valid fresh VLM candidate and submits one input', async () => {
    const h = harness({ocr: [], vlm: perception([element('Save', [0.2, 0.2, 0.4, 0.4])])});
    const result = await h.UI.tapText('Save', {within: clone(WIN)});
    assert.strictEqual(result.target.source, 'vlm');
    assert.strictEqual(h.calls.vlm, 1);
    assert.strictEqual(h.calls.mouse, 1);
  });

  await test('E multiple VLM candidates fail closed as ambiguous', async () => {
    const h = harness({ocr: [], vlm: perception([
      element('Save', [0.1, 0.1, 0.2, 0.2]), element('Save', [0.6, 0.6, 0.8, 0.8]),
    ])});
    await rejects(() => h.UI.tapText('Save', {within: clone(WIN)}), 'AMBIGUOUS_TARGET');
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('F invalid VLM normalized boxes are all rejected before input', async () => {
    const invalid = [[-0.1, 0, 0.2, 0.2], [0, 0, 1.1, 0.2], [0.2, 0.2, 0.2, 0.4], [0.4, 0.4, 0.2, 0.6]];
    for (const box of invalid) {
      const h = harness({ocr: [], vlm: perception([element('Save', box)])});
      await rejects(() => h.UI.tapText('Save', {within: clone(WIN)}), 'VLM_INVALID_RESPONSE');
      assert.strictEqual(h.calls.mouse, 0);
    }
  });

  await test('G window movement while VLM observes makes its coordinates stale', async () => {
    const h = harness({ocr: [], moveDuringVLM: true, vlm: perception([element('Save', [0.2, 0.2, 0.4, 0.4])])});
    await rejects(() => h.UI.tapText('Save', {within: clone(WIN)}), 'STALE_TARGET');
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('H cloud VLM remains local-only unless policy is explicitly approved', async () => {
    const h = harness({ocr: [], vlm: perception([element('Save', [0.2, 0.2, 0.4, 0.4])]),
      vlmCapabilities: {policyAllowed: false, configured: false}});
    assert.strictEqual(await h.UI.findText('Save', {within: clone(WIN)}), null);
    assert.strictEqual(h.calls.vlm, 0);
    assert.strictEqual(h.calls.screenshot, 0);
  });

  await test('I VLM timeout is terminal, bounded, and sends no input', async () => {
    const h = harness({ocr: [], vlm: perception([]), vlmError: structured('TIMEOUT', 'provider timeout')});
    await rejects(() => h.UI.tapText('Save', {within: clone(WIN), timeout: 50}), 'TIMEOUT');
    assert.strictEqual(h.calls.mouse, 0);
    assert.strictEqual(h.calls.nativeInput, 0);
  });

  await test('J unknown native input completion never falls through to another provider or click', async () => {
    const h = harness({ocr: [], vlm: perception([element('Save', [0.2, 0.2, 0.4, 0.4])]), nativeInputError:
      structured('STATE_UNKNOWN', 'native input completion unknown', {actionState: 'unknown'}), snapshot: {
        complete: true, truncated: false, backend: 'fixture-ax', root: {
          role: 'button', name: 'Save', identifier: 'save', enabled: true, actions: ['invoke'],
          bounds: {x: 150, y: 250, width: 60, height: 30}, children: [],
        },
      }});
    const caught = await rejects(() => h.UI.tapText('Save', {within: clone(WIN)}), 'STATE_UNKNOWN');
    assert.strictEqual(caught.actionState, 'unknown');
    assert.strictEqual(h.calls.nativeInput, 1);
    assert.strictEqual(h.calls.vlm, 0);
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('K readText returns the actual unique native value, never caller expectation', async () => {
    const h = harness({snapshot: {
      complete: true, truncated: false, backend: 'fixture-ax', root: {
        role: 'staticText', name: 'Display', value: '110',
        bounds: {x: 150, y: 220, width: 200, height: 30}, children: [],
      },
    }});
    assert.strictEqual(await h.UI.readText({within: clone(WIN)}), '110');
    assert.strictEqual(h.calls.ocr, 0);
  });

  await test('K1 readText accepts the documented macOS native display bounds', async () => {
    const h = harness({snapshot: {
      complete: true, truncated: false, backend: 'fixture-ax', root: {
        role: 'staticText', name: 'Primary display', value: '660', bounds: null,
        nativeBounds: {x: 150, y: 220, width: 200, height: 30,
          coordinateSpace: 'macos-global-display-points-top-left'}, children: [],
      },
    }});
    assert.strictEqual(await h.UI.readText({within: clone(WIN)}), '660');
    assert.strictEqual(h.calls.ocr, 0);
  });

  await test('waiting sequence rejects a foreground switch during observation in locate before input', async () => {
    const h = harness({ax: false, ocr: (_calls, state) => {
      state.window.id = 'replacement'; state.window.handle = 100;
      return [ocr('Save', 150, 250)];
    }});
    const caught = await rejects(() => h.UI.tapTexts(['Save'], {within: clone(WIN)}), 'STALE_TARGET');
    assert.strictEqual(caught.failedPhase, 'locate');
    assert.strictEqual(caught.failedIndex, 0);
    assert.strictEqual(caught.completed.length, 0);
    assert.strictEqual(h.calls.mouse, 0);
    assert.strictEqual(h.calls.nativeInput, 0);
  });
  await test('local source disagreement is ambiguous rather than first-result-wins', async () => {
    const h = harness({ocr: [ocr('Save', 150, 250)], snapshot: {
      complete: true, truncated: false, backend: 'fixture-ax', root: {
        role: 'button', name: 'Save', enabled: true, actions: ['invoke'],
        bounds: {x: 380, y: 420, width: 50, height: 30}, children: [],
      },
    }});
    await rejects(() => h.UI.tapText('Save', {within: clone(WIN)}), 'AMBIGUOUS_TARGET');
    assert.strictEqual(h.calls.mouse, 0);
    assert.strictEqual(h.calls.nativeInput, 0);
  });

  await test('read-only unknown options retain established OCR facade behavior', async () => {
    const h = harness({ax: true, ocr: [ocr('Save', 150, 250)]});
    // Old read-only calls tolerated unknown fields. No extra AX identity may
    // be fabricated for an OCR-only legacy request.
    assert.strictEqual(await h.UI.findText('Save', {within: clone(WIN), preexistingUnknownOption: true}), null);
    assert.strictEqual(h.calls.ocr, 0);
    assert.strictEqual(h.calls.ax, 0);
  });

  await test('string matchers reject invalid options before any observation', async () => {
    const h = harness({ocr: [ocr('Save', 150, 250)]});
    const caught = await rejects(() => h.UI.findText('Save', {within: clone(WIN), match: 'prefix'}), 'INVALID_ARGUMENT');
    assert.strictEqual(caught.operation, 'UI.findText');
    assert.strictEqual(h.calls.ocr, 0);
    assert.strictEqual(h.calls.ax, 0);
  });

  await test('OCR terminal scope errors cannot silently fall through to Accessibility', async () => {
    const h = harness({ocrError: structured('TARGET_SCOPE_NOT_VISIBLE', 'offscreen fixture', {operation: 'UI.findTexts'})});
    const caught = await rejects(() => h.UI.findText('Save', {within: clone(WIN)}), 'TARGET_SCOPE_NOT_VISIBLE');
    assert.strictEqual(caught.operation, 'UI.findText');
    assert.strictEqual(caught.cause.operation, 'UI.findTexts');
    assert.strictEqual(h.calls.ocr, 1);
    assert.strictEqual(h.calls.ax, 0);
  });

  await test('moved unbound OCR window triggers one new observation and one click', async () => {
    const h = harness({
      ax: false,
      moveDuringOCR: true,
      ocr: (_, state) => [ocr('Save', state.window.x + 40, 250)],
    });
    const result = await h.UI.tapText('Save');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.target.bounds.x, 340);
    assert.strictEqual(h.calls.ocr, 2);
    assert.strictEqual(h.calls.mouse, 1);
  });

  await test('caller-pinned OCR window never retargets itself after movement', async () => {
    const h = harness({
      ax: false,
      moveDuringOCR: true,
      ocr: (_, state) => [ocr('Save', state.window.x + 40, 250)],
    });
    const caught = await rejects(() => h.UI.tapText('Save', {within: clone(WIN)}), 'STALE_TARGET');
    assert.strictEqual(caught.actionState, 'not_started');
    assert.strictEqual(h.calls.ocr, 1);
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('unknown mouse completion never replays a non-idempotent click', async () => {
    const h = harness({
      ax: false, ocr: [ocr('Save', 150, 250)],
      mouseError: structured('BACKEND_FAILED', 'mouse input outcome is unknown', { actionState: 'unknown' }),
    });
    const caught = await rejects(() => h.UI.tapText('Save', { within: clone(WIN) }), 'BACKEND_FAILED');
    assert.strictEqual(caught.actionState, 'unknown');
    assert.strictEqual(h.calls.ocr, 1);
    assert.strictEqual(h.calls.mouse, 1);
  });

  await test('waitText and waitTextGone reject observations that finish after the total deadline', async () => {
    for (const method of ['waitText', 'waitTextGone']) {
      let now = 0;
      const h = harness({ ax: false, Date: { now: () => now }, ocr: () => {
        now += 11;
        return method === 'waitText' ? [ocr('Save', 150, 250)] : [];
      } });
      const caught = await rejects(() => h.UI[method]('Save', { within: clone(WIN), timeout: 10 }), 'TIMEOUT');
      assert.strictEqual(caught.actionState, 'not_started');
      assert.strictEqual(h.calls.ocr, 1);
    }
  });

  await test('polling observations receive the remaining total budget rather than a renewed timeout', async () => {
    let now = 0;
    const budgets = [];
    const h = harness({ ax: false, Date: { now: () => now },
      wait: milliseconds => { now += milliseconds; },
      ocr: (calls, _state, options) => {
        budgets.push(options.timeout);
        now += calls.ocr === 1 ? 30 : 5;
        return calls.ocr === 1 ? [] : [ocr('Save', 150, 250)];
      },
    });
    assert.strictEqual((await h.UI.waitText('Save', { within: clone(WIN), timeout: 100, polling: 10 })).text, 'Save');
    assert.deepStrictEqual(budgets, [100, 60]);
  });

  await test('OCR, AX and native input share one budget and preserve the original cancellation signal', async () => {
    let now = 0;
    const controller = new AbortController();
    const h = harness({ Date: { now: () => now },
      ocr: () => { now += 35; return []; },
      snapshot: options => {
        assert.strictEqual(options.timeout, 65);
        now += 20;
        return { complete: true, truncated: false, root: { role: 'button', name: 'Save', enabled: true,
          actions: ['invoke'], bounds: { x: 150, y: 250, width: 40, height: 20 } } };
      },
      nativeInput: options => {
        assert.strictEqual(options.timeout, 45);
        assert.strictEqual(options.signal, controller.signal);
        return { ok: true, completed: [{ actionState: 'acknowledged' }] };
      },
    });
    const result = await h.UI.tapText('Save', { within: clone(WIN), timeout: 100, signal: controller.signal });
    assert.strictEqual(result.actionState, 'acknowledged');
    assert.strictEqual(h.calls.nativeInput, 1);
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('cancellation or deadline expiry after AX observation prevents all input', async () => {
    for (const failure of ['cancel', 'timeout']) {
      let now = 0;
      const controller = new AbortController();
      const h = harness({ Date: { now: () => now }, snapshot: () => {
        if (failure === 'cancel') controller.abort(); else now += 11;
        return { complete: true, truncated: false, root: { role: 'button', name: 'Save', enabled: true,
          actions: ['invoke'], bounds: { x: 150, y: 250, width: 40, height: 20 } } };
      } });
      await rejects(() => h.UI.tapText('Save', { within: clone(WIN), timeout: 10, signal: controller.signal }),
        failure === 'cancel' ? 'CANCELED' : 'TIMEOUT');
      assert.strictEqual(h.calls.nativeInput, 0);
      assert.strictEqual(h.calls.mouse, 0);
    }
  });

  await test('per-step timeout stops a late sequence before input, retaining its acknowledged prefix', async () => {
    let now = 0;
    const budgets = [];
    const h = harness({ ax: false, Date: { now: () => now }, wait: milliseconds => { now += milliseconds; },
      ocr: (calls, _state, options) => {
        budgets.push(options.timeout);
        now += calls.ocr === 1 ? 1 : 11;
        return [ocr(calls.ocr === 1 ? 'Save' : 'Next', 150, 250)];
      },
    });
    const caught = await rejects(() => h.UI.tapTexts(['Save', 'Next'], {
      within: clone(WIN), timeout: 10, intervalMs: 5,
    }), 'TIMEOUT');
    assert.strictEqual(caught.failedIndex, 1);
    assert.strictEqual(caught.actionState, 'not_started');
    assert.strictEqual(caught.completed.length, 1);
    assert.strictEqual(h.calls.mouse, 1);
    assert.deepStrictEqual(budgets, [10, 10]);
  });

  await test('cancellation observed after acknowledged native input never changes that receipt or replays it', async () => {
    const controller = new AbortController();
    const h = harness({ snapshot: { complete: true, truncated: false, root: {
      role: 'button', name: 'Save', enabled: true, actions: ['invoke'],
      bounds: { x: 150, y: 250, width: 40, height: 20 },
    } }, nativeInput: () => {
      controller.abort();
      return { ok: true, completed: [{ actionState: 'acknowledged' }] };
    } });
    const result = await h.UI.tapText('Save', { within: clone(WIN), signal: controller.signal });
    assert.strictEqual(result.actionState, 'acknowledged');
    assert.strictEqual(h.calls.nativeInput, 1);
    assert.strictEqual(h.calls.mouse, 0);
  });

  await test('safe pre-input OCR reacquisition keeps the original deadline', async () => {
    let now = 0;
    const budgets = [];
    const h = harness({ ax: false, Date: { now: () => now }, moveDuringOCR: true,
      ocr: (calls, state, options) => {
        budgets.push(options.timeout);
        now += calls.ocr === 1 ? 6 : 5;
        return [ocr('Save', state.window.x + 40, 250)];
      } });
    const caught = await rejects(() => h.UI.tapText('Save', { timeout: 10 }), 'TIMEOUT');
    assert.strictEqual(caught.actionState, 'not_started');
    assert.deepStrictEqual(budgets, [10, 4]);
    assert.strictEqual(h.calls.mouse, 0);
    assert.strictEqual(h.calls.nativeInput, 0);
  });

  await test('window revalidation cannot submit input after cancellation or deadline expiry', async () => {
    for (const cancel of [true, false]) {
      let now = 0, reads = 0;
      const controller = new AbortController();
      const h = harness({ ax: false, Date: { now: () => now }, ocr: [ocr('Save', 150, 250)],
        activeWindow: state => {
          reads += 1;
          if (reads === 2) { if (cancel) controller.abort(); else now = 11; }
          return clone(state.window);
        } });
      const caught = await rejects(() => h.UI.tapText('Save', { timeout: 10, signal: controller.signal }), cancel ? 'CANCELED' : 'TIMEOUT');
      assert.strictEqual(caught.actionState, 'not_started');
      assert.strictEqual(h.calls.mouse, 0);
      assert.strictEqual(h.calls.nativeInput, 0);
    }
  });

  await test('VLM capture and provider share the deadline and recheck cancellation before dispatch', async () => {
    for (const cancel of [true, false]) {
      let now = 0;
      const controller = new AbortController();
      const h = harness({ ax: false, Date: { now: () => now }, vlm: perception([element('Save', [0.1, 0.1, 0.2, 0.2])]),
        ocr: () => { now += 3; return []; },
        screenshot: () => { now += 2; if (cancel) controller.abort(); },
        observeVLM: options => { assert.strictEqual(options.timeoutMs, 5); now += 6; } });
      const caught = await rejects(() => h.UI.tapText('Save', { within: clone(WIN), timeout: 10, signal: controller.signal }), cancel ? 'CANCELED' : 'TIMEOUT');
      assert.strictEqual(caught.actionState, 'not_started');
      assert.strictEqual(h.calls.vlm, cancel ? 0 : 1);
      assert.strictEqual(h.calls.mouse, 0);
      assert.strictEqual(h.calls.nativeInput, 0);
    }
  });

  await test('text sequences preserve legacy ambiguity diagnostics without submitting input', async () => {
    const h = harness({ax: false, ocr: [ocr('Save', 120, 230), ocr('Save', 320, 430)]});
    const caught = await rejects(() => h.UI.tapTexts(['Save'], {within: clone(WIN)}), 'AMBIGUOUS_TARGET');
    assert.strictEqual(caught.candidateCount, 2);
    assert.strictEqual(caught.candidateCount, caught.cause.candidateCount);
    assert.strictEqual(caught.candidates, caught.cause.candidates);
    assert.strictEqual(caught.failedIndex, 0);
    assert.strictEqual(caught.failedPhase, 'locate');
    assert.strictEqual(caught.actionState, 'not_started');
    assert.strictEqual(caught.completed.length, 0);
    assert.strictEqual(h.calls.mouse, 0);
    assert.strictEqual(h.calls.nativeInput, 0);
  });

  console.log(`PASS ${count} UI Perception Resolver deterministic tests`);
})().catch((caught) => {
  console.error(caught && caught.stack || caught);
  process.exitCode = 1;
});
