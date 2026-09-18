// Shared synthetic contract matrix. No real desktop, network or clipboard access.
// Loaded by the Node host test and the OpenDesk Runtime synthetic gate.
function qianniuRecipeCases(source, Geometry) {
  function assert(value, message) { if (!value) throw new Error(message || 'assertion failed'); }
  function equal(actual, expected, message) { assert(actual === expected, (message || '') + ': ' + actual + ' !== ' + expected); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fault(code, actionState) { const e = new Error('PRIVATE BACKEND PAYLOAD'); e.code = code; if (actionState) e.actionState = actionState; return e; }
  function config() {
    return {
      version: 1, mode: 'draft',
      windows: { notificationTitle: 'Fixture-消息通知', receptionTitle: 'Fixture-接待中心' },
      task: { allowDraft: true, allowProductQuery: true },
      api: { endpoint: 'https://fixture.invalid/product?tenant=test', contentPostfix: '仅供人工审阅' },
      layout: {
        qualified: true, evidence: 'SYNTHETIC ONLY; not Qianniu qualification', exclusiveInteraction: true,
        notification: { minWidth: 350, maxWidth: 500, minHeight: 180, maxHeight: 250,
          recipient: { left: 0, top: 0, width: 50, height: 20 },
          status: { left: 0, top: 20, width: 100, height: 30 },
          contact: { left: 0, top: 50, width: 100, height: 50 } },
        reception: { minWidth: 900, maxWidth: 1100, minHeight: 750, maxHeight: 900,
          recipient: { left: 0, top: 0, width: 50, height: 10 },
          orders: { left: 60, top: 10, width: 40, height: 85 } },
        orderCard: { aboveStatusPercent: 10, heightPercent: 50,
          title: { left: 0, top: 15, width: 80, height: 20 } },
      },
      draftLocator: { role: 'textField', identifier: 'fixture-draft' },
    };
  }
  async function boot(options) {
    const opts = options || {};
    const input = opts.config === undefined ? config() : opts.config;
    const fixture = config();
    const calls = { get: 0, activate: 0, contact: 0, copy: 0, query: 0, set: 0, sleep: 0, sent: 0, shipped: 0 };
    const windows = {
      notification: { id: 'windows:42:native:11', pid: 42, handle: 11, exeName: 'AliWorkbench.exe',
        title: fixture.windows.notificationTitle, x: 10, y: 20, width: 400, height: 200 },
      reception: { id: 'windows:42:native:22', pid: 42, handle: 22, exeName: 'AliWorkbench.exe',
        title: fixture.windows.receptionTitle, x: 100, y: 100, width: 1000, height: 800 },
    };
    let active = input && input.mode === 'inspect' ? 'reception' : (opts.activation ? 'other' : 'notification');
    let recipient = 'FIXTURE_BUYER';
    let title = 'FIXTURE 商品 = A & B';
    const originalTitle = title;
    let clipboardText = opts.sameClipboard ? title : 'PREEXISTING CLIPBOARD';
    let draft = opts.existingDraft || '';
    let geometryMoved = false;
    const logs = [];
    function snapshot(name) {
      const win = clone(windows[name]);
      win.isForeground = active === name;
      win.hasFocus = active === name;
      if (opts.wrongExe) win.exeName = 'Other.exe';
      if (opts.oversize && name === 'notification') win.width = 9999;
      return win;
    }
    function nameOf(win) { return win.handle === 11 ? 'notification' : 'reception'; }
    function target(text, bounds) { return { text: text, bounds: bounds, source: 'ocr' }; }
    function geometry(win) {
      if (nameOf(win) === 'notification') return {
        state: Geometry.regionOffset(win, { left: 20, top: 50, width: 48, height: 20 }),
        button: Geometry.regionOffset(win, { left: 150, top: 120, width: 90, height: 20 }),
      };
      const panel = Geometry.regionPercent(win, fixture.layout.reception.orders);
      return {
        panel: panel,
        state: Geometry.regionOffset(panel, { left: 20, top: opts.outsideCard ? 1 : 180, width: 48, height: 20 }),
        button: Geometry.regionOffset(panel, { left: 280, top: 400, width: 70, height: 20 }),
      };
    }
    const window = {
      async get(selector) {
        calls.get++;
        assert(selector.exeName === 'AliWorkbench.exe', 'exact application selector');
        if (opts.missingWindow || (opts.missingCount && calls.get <= opts.missingCount)) throw fault('NOT_FOUND');
        if (opts.ambiguousWindow) throw fault('AMBIGUOUS_TARGET');
        const name = selector.title === fixture.windows.notificationTitle ? 'notification' : 'reception';
        equal(selector.title, fixture.windows[name === 'notification' ? 'notificationTitle' : 'receptionTitle']);
        return snapshot(name);
      },
      async current(pin) {
        const win = snapshot(nameOf(pin));
        if (opts.staleWindow) win.id = 'windows:42:native:recreated';
        return win;
      },
      async activate(pin, options) { calls.activate++; equal(pin.handle, 11); assert(options.timeout > 0); active = 'notification'; return snapshot('notification'); },
      async wait(selector, options) {
        equal(selector.pid, 42); equal(selector.title, fixture.windows.receptionTitle); assert(options.timeout > 0);
        if (opts.waitFailure) throw fault('TIMEOUT', 'not_started');
        return snapshot('reception');
      },
    };
    const UI = {
      async readText(options) {
        const name = nameOf(options.within);
        assert(options.region.coordinateSpace === 'screen');
        if (name === 'notification') return 'FIXTURE_BUYER';
        const header = Geometry.regionPercent(options.within, fixture.layout.reception.recipient);
        if (options.region.y === header.y) return recipient;
        if (opts.moveDuringTitle && !geometryMoved) { windows.reception.x += 17; geometryMoved = true; }
        if (opts.unreadableTitle) throw fault('AMBIGUOUS_TARGET');
        return title;
      },
      async findTextMatches(queries, options) {
        equal(queries.length, 5); equal(options.match, 'exact');
        assert(options.timeout === undefined, 'batch contract does not accept timeout');
        const name = nameOf(options.within), g = geometry(options.within);
        const groups = queries.map((_, i) => ({ queryIndex: i, matches: [] }));
        const stateIndex = opts.pendingPayment && name === 'notification' ? 1 : 0;
        if (!(opts.noOrder && name === 'reception') && !opts.onlyColor) groups[stateIndex].matches.push(target(queries[stateIndex], g.state));
        if (!(opts.noOrder && name === 'reception')) groups[4].matches.push(target(queries[4], g.button));
        if (opts.ambiguousContact && name === 'notification') groups[4].matches.push(target(queries[4], g.button));
        if (opts.multipleOrders && name === 'reception') groups[4].matches.push(target(queries[4], g.button));
        return groups;
      },
      async tapText(text, options) {
        assert(text === '和我联系' || text === '点我复制', 'only contact/copy permitted; no send or ship');
        equal(options.match, 'exact');
        const fresh = snapshot(nameOf(options.within));
        const scope = options.region(fresh), g = geometry(fresh);
        assert(Geometry.contains(scope, Geometry.center(g.button)), 'button must remain in fresh region');
        if (text === '和我联系') {
          calls.contact++;
          if (opts.contactNotStarted) throw fault('TARGET_NOT_FOUND', 'not_started');
          active = 'reception';
          if (opts.wrongRecipient) recipient = 'OTHER_BUYER';
        } else {
          calls.copy++;
          equal(options.relativeTo.text, '待发货');
          const card = options.relativeTo.region(target('待发货', g.state));
          assert(Geometry.contains(card, Geometry.center(g.button)), 'same-frame card constraint');
          if (!opts.clipboardUnchanged) clipboardText = opts.wrongClipboard ? 'UNRELATED TITLE' : title;
        }
        return { ok: true, actionState: 'acknowledged' };
      },
      async getValue(selector, options) {
        equal(selector.identifier, 'fixture-draft'); equal(options.within.handle, 22);
        if (opts.unreadableDraft) throw fault('NOT_SUPPORTED', 'not_started');
        if (calls.set && opts.postReadNotStarted) throw fault('BACKEND_FAILED', 'not_started');
        if (calls.set && opts.wrongReadback) return 'DIFFERENT TEXT';
        return draft;
      },
      async setValue(selector, value, options) {
        equal(selector.role, 'textField'); equal(options.within.handle, 22); calls.set++;
        if (opts.setterNotStarted) throw fault('PERMISSION_DENIED', 'not_started');
        draft = value;
        if (opts.setterThrowsUnknown) throw fault('BACKEND_FAILED', 'unknown');
        if (opts.postWriteRecipientChange) recipient = 'OTHER_BUYER';
        if (opts.postWriteFocusLoss) active = 'other';
        return { actionState: opts.setterUnknown ? 'unknown' : 'acknowledged',
          verified: !opts.noVerifiedReceipt, requestId: 'synthetic-action' };
      },
    };
    const clipboard = { paste() { return clipboardText; } };
    const axios = { async get(endpoint, options) {
      calls.query++; equal(endpoint, fixture.api.endpoint); equal(options.params.title, originalTitle);
      equal(options.timeout, 10000);
      if (opts.queryError) throw fault('NETWORK_FAILED');
      if (opts.changeTitleAfterQuery) title = 'DIFFERENT PRODUCT';
      if (opts.changeRecipientAfterQuery) recipient = 'OTHER_BUYER';
      if (opts.badResponse) return { status: 200, data: { code: 500, message: 'ERROR MUST NOT BE A DRAFT' } };
      if (opts.htmlResponse) return { status: 200, data: '<html>ERROR</html>' };
      if (opts.emptyProduct) return { status: 200, data: { code: 1000, data: { title: originalTitle, content: '' } } };
      return { status: 200, data: { code: 1000, data: {
        title: opts.wrongProduct ? 'WRONG PRODUCT' : originalTitle, content: 'FIXTURE BODY\n第二行',
      } } };
    } };
    const File = { async readJSON(path, options) {
      equal(path, '.runtime/recipes/qianniu/config.json'); equal(options.maxBytes, 65536);
      assert(!Object.prototype.hasOwnProperty.call(options, 'defaultValue'));
      if (opts.fileError) throw fault('JSON_PARSE_FAILED');
      return input;
    } };
    const load = new Function('File', 'window', 'UI', 'Geometry', 'clipboard', 'axios', 'sleep', 'console',
      'return (async function () {\n' + source + '\nreturn {runOnce:runOnce,supervise:supervise};\n})();');
    const api = await load(File, window, UI, Geometry, clipboard, axios,
      async ms => { assert(ms > 0 && ms <= 5000); calls.sleep++; },
      { log(line) { logs.push(line); } });
    equal(logs.length, 1, 'explicit main returns exactly one result');
    const outcome = JSON.parse(logs[0].slice('QIANNIU_RECIPE_RESULT '.length));
    assert(!logs[0].includes('FIXTURE_BUYER') && !logs[0].includes(originalTitle) && !logs[0].includes('PRIVATE BACKEND'), 'redacted log');
    equal(outcome.effects.sendAttempts, 0); equal(outcome.effects.shipmentAttempts, 0);
    equal(outcome.identity.orderId, null); equal(outcome.identity.conversationId, null);
    return { outcome: outcome, calls: calls, api: api, getDraft: () => draft };
  }
  function zeroInput(run) { ['activate', 'contact', 'copy', 'query', 'set'].forEach(k => equal(run.calls[k], 0, k)); }
  const cases = [];
  function test(name, run) { cases.push({ name: name, run: run }); }
  test('explicit main: verified draft only, actual clipboard -> API -> exact text', async () => {
    const r = await boot(); equal(r.outcome.status, 'success'); equal(r.outcome.code, 'DRAFT_VERIFIED');
    ['contact', 'copy', 'query', 'set'].forEach(k => equal(r.calls[k], 1, k)); equal(r.calls.sleep, 0);
    assert(r.getDraft().includes('FIXTURE BODY\n第二行'));
    equal(r.outcome.next, 'review_draft_manually');
  });
  test('missing or corrupt config: no desktop/network effects', async () => { const r = await boot({ fileError: true }); equal(r.outcome.code, 'CONFIG_READ_FAILED'); zeroInput(r); });
  [null, {}, { version: 99 }].forEach((bad, index) => test('invalid schema ' + index + ' stops', async () => { const r = await boot({ config: bad }); equal(r.outcome.status, 'blocked'); zeroInput(r); }));
  ['allowDraft', 'allowProductQuery'].forEach(key => test(key + ' is independent authority', async () => { const c = config(); c.task[key] = false; const r = await boot({ config: c }); equal(r.outcome.code, 'NOT_AUTHORIZED'); zeroInput(r); }));
  ['qualified', 'exclusiveInteraction'].forEach(key => test(key + ' is required before input', async () => { const c = config(); c.layout[key] = false; const r = await boot({ config: c }); equal(r.outcome.code, 'QUALIFICATION_REQUIRED'); zeroInput(r); }));
  test('send/ship flags are rejected, not silently accepted', async () => { const c = config(); c.send = true; c.ship = true; const r = await boot({ config: c }); equal(r.outcome.code, 'INVALID_CONFIG'); zeroInput(r); });
  test('inspect mode remains read-only even with task flags true', async () => { const c = config(); c.mode = 'inspect'; c.layout.qualified = false; const r = await boot({ config: c }); equal(r.outcome.code, 'INSPECTION_ONLY'); zeroInput(r); });
  test('no notification: safe idle, no fallback window', async () => { const r = await boot({ missingWindow: true }); equal(r.outcome.code, 'NO_NOTIFICATION'); zeroInput(r); });
  test('ambiguous window: no first or highest-index selection', async () => { const r = await boot({ ambiguousWindow: true }); equal(r.outcome.status, 'failed'); zeroInput(r); });
  test('wrong process despite matching title', async () => { const r = await boot({ wrongExe: true }); equal(r.outcome.code, 'WINDOW_IDENTITY_MISMATCH'); zeroInput(r); });
  test('stale window identity is not rebound', async () => { const r = await boot({ staleWindow: true }); equal(r.outcome.code, 'STALE_TARGET'); zeroInput(r); });
  test('out-of-profile geometry stops instead of resize', async () => { const r = await boot({ oversize: true }); equal(r.outcome.code, 'LAYOUT_OUTSIDE_QUALIFICATION'); zeroInput(r); });
  test('exact activation is bounded and occurs once', async () => { const r = await boot({ activation: true }); equal(r.calls.activate, 1); equal(r.outcome.code, 'DRAFT_VERIFIED'); });
  test('pending payment never turns into paid by sleep', async () => { const r = await boot({ pendingPayment: true }); equal(r.outcome.code, 'ORDER_NOT_PENDING_SHIPMENT'); zeroInput(r); equal(r.calls.sleep, 0); });
  test('color without state text gives no business eligibility', async () => { const r = await boot({ onlyColor: true }); equal(r.outcome.code, 'STATE_NOT_UNIQUE'); zeroInput(r); });
  test('ambiguous contact fails before action', async () => { const r = await boot({ ambiguousContact: true }); equal(r.outcome.code, 'CONTACT_NOT_UNIQUE'); zeroInput(r); });
  test('known-not-started contact is blocked, not retried', async () => { const r = await boot({ contactNotStarted: true }); equal(r.outcome.status, 'failed'); equal(r.calls.contact, 1); equal(r.calls.copy, 0); });
  test('post-contact timeout not_started cannot erase preceding input', async () => { const r = await boot({ waitFailure: true }); equal(r.outcome.status, 'uncertain'); equal(r.calls.contact, 1); equal(r.calls.copy, 0); });
  test('wrong reception recipient stops after contact', async () => { const r = await boot({ wrongRecipient: true }); equal(r.outcome.status, 'uncertain'); equal(r.calls.copy, 0); equal(r.calls.query, 0); });
  test('no order: never click fixed rectangle fallback', async () => { const r = await boot({ noOrder: true }); equal(r.outcome.code, 'STATE_NOT_UNIQUE'); equal(r.calls.copy, 0); equal(r.calls.query, 0); });
  test('multiple orders: no first/last row choice', async () => { const r = await boot({ multipleOrders: true }); equal(r.outcome.code, 'ORDER_NOT_UNIQUE'); equal(r.calls.copy, 0); });
  test('out-of-bounds inferred card stops', async () => { const r = await boot({ outsideCard: true }); equal(r.outcome.code, 'ORDER_CARD_OUT_OF_BOUNDS'); equal(r.calls.copy, 0); });
  test('window motion during observation invalidates geometry', async () => { const r = await boot({ moveDuringTitle: true }); equal(r.outcome.code, 'OBSERVATION_CHANGED'); equal(r.calls.copy, 0); });
  test('already-identical clipboard is not fresh-copy proof', async () => { const r = await boot({ sameClipboard: true }); equal(r.outcome.code, 'COPY_FRESHNESS_UNPROVEN'); equal(r.calls.copy, 0); });
  ['clipboardUnchanged', 'wrongClipboard'].forEach(key => test(key + ': stop after one copy, never query', async () => { const o = {}; o[key] = true; const r = await boot(o); equal(r.outcome.status, 'uncertain'); equal(r.calls.copy, 1); equal(r.calls.query, 0); equal(r.calls.set, 0); assert(r.calls.sleep <= 25); }));
  ['queryError', 'badResponse', 'htmlResponse', 'emptyProduct', 'wrongProduct'].forEach(key => test(key + ': error payload cannot become a draft', async () => { const o = {}; o[key] = true; const r = await boot(o); assert(r.outcome.status !== 'success'); equal(r.calls.query, 1); equal(r.calls.set, 0); equal(r.getDraft(), ''); }));
  test('existing user draft is preserved', async () => { const r = await boot({ existingDraft: 'USER OWNED DRAFT' }); equal(r.outcome.code, 'EXISTING_DRAFT'); equal(r.calls.set, 0); equal(r.getDraft(), 'USER OWNED DRAFT'); });
  ['changeTitleAfterQuery', 'changeRecipientAfterQuery'].forEach(key => test(key + ': recheck object after network wait', async () => { const o = {}; o[key] = true; const r = await boot(o); equal(r.outcome.status, 'blocked'); equal(r.calls.set, 0); }));
  test('unsupported native draft read never falls back to keyboard paste', async () => { const r = await boot({ unreadableDraft: true }); equal(r.outcome.status, 'failed'); equal(r.calls.set, 0); });
  test('known-not-started setValue is not retried', async () => { const r = await boot({ setterNotStarted: true }); equal(r.outcome.status, 'failed'); equal(r.calls.set, 1); equal(r.getDraft(), ''); });
  ['setterUnknown', 'setterThrowsUnknown', 'noVerifiedReceipt', 'postReadNotStarted', 'wrongReadback', 'postWriteRecipientChange', 'postWriteFocusLoss'].forEach(key => test(key + ': uncertain effect, at most one setValue', async () => { const o = {}; o[key] = true; const r = await boot(o); equal(r.outcome.status, 'uncertain'); equal(r.calls.set, 1); equal(r.outcome.next, 'verify_actual_effect_then_stop'); }));
  test('supervisor retries only empty idle observations, with bound', async () => { const r = await boot({ fileError: true, missingWindow: true }); const result = await r.api.supervise(config(), 3); equal(result.code, 'NO_NOTIFICATION'); equal(r.calls.get, 3); equal(r.calls.sleep, 2); zeroInput(r); });
  test('supervisor stops on draft success rather than process it twice', async () => { const r = await boot({ fileError: true }); equal((await r.api.supervise(config(), 3)).code, 'DRAFT_VERIFIED'); equal(r.calls.set, 1); equal(r.calls.sleep, 0); });
  test('supervisor stops on uncertain write without retry', async () => { const r = await boot({ fileError: true, setterUnknown: true }); equal((await r.api.supervise(config(), 3)).status, 'uncertain'); equal(r.calls.set, 1); equal(r.calls.get, 1); equal(r.calls.sleep, 0); });
  test('supervisor does not hide backend failures as idle', async () => { const r = await boot({ fileError: true, ambiguousWindow: true }); equal((await r.api.supervise(config(), 3)).status, 'failed'); equal(r.calls.get, 1); equal(r.calls.sleep, 0); });
  test('Geometry rule follows translated windows, including negative desktop coordinates', async () => {
    const rule = config().layout.reception.orders;
    const a = { id: 'fixture', title: 'fixture', pid: 42, x: 100, y: 200, width: 1000, height: 800 };
    const b = Object.assign({}, a, { x: -1200, y: -500 });
    const ar = Geometry.regionPercent(a, rule), br = Geometry.regionPercent(b, rule);
    equal(br.x - ar.x, -1300); equal(br.y - ar.y, -700); equal(br.width, ar.width); equal(br.height, ar.height);
  });
  return cases;
}
