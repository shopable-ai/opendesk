// Repository root, embedded OpenDesk runtime only:
// ./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script
// Isolated composition cases: no real enumeration, launch, screenshot or input.
'use strict';
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));

(() => {
  const { test, assert, equal } = RuntimeAPITest;
  const source = File.read(File.join(File.cwd(), 'polyfills/003-window.js'));
  const row = (extra = {}) => ({ id: 'fixture:1:native:10', pid: 1, title: 'Document',
    exePath: '/fixture/editor', exeName: 'Editor', x: -100, y: 20, width: 800, height: 600, ...extra });
  function fixture(initial = [row()]) {
    let rows = initial, now = 0, sequence = 0;
    const timers = new Map();
    const calls = { list: 0, app: [] };
    const host = {
      window: {
        getCapabilities: () => ({ platform: 'fixture' }),
        list: () => { calls.list++; return typeof rows === 'function' ? rows() : rows; },
        getActiveWindow: () => ({ ID: 'active', ProcessID: 1 }),
        getWindowByTitle: () => ({ ID: 'title', ProcessID: 1 }),
        getFocusWindow: () => ({ ID: 'focus', ProcessID: 1 }),
      },
      App: { get: value => { calls.app.push(value); return { pids: [1] }; } },
      setTimeout: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, at: now + ms }); return id; },
      clearTimeout: id => timers.delete(id),
    };
    new Function('globalThis', 'window', 'Date', source)(host, host.window, { now: () => now });
    return { host, win: host.window, calls, timers, setRows: value => { rows = value; },
      advance(ms) {
        const end = now + ms;
        while (true) {
          const due = [...timers.entries()].filter(entry => entry[1].at <= end)
            .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
          if (!due) break;
          now = due[1].at; timers.delete(due[0]); due[1].fn();
        }
        now = end;
      },
    };
  }
  function signal() {
    const listeners = new Set();
    return { aborted: false, listeners,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
      abort() { this.aborted = true; [...listeners].forEach(fn => fn()); },
    };
  }
  async function rejects(fn, code, operation) {
    let caught;
    try { await fn(); } catch (error) { caught = error; }
    assert(caught, 'expected ' + code); equal(caught.code, code);
    if (operation) equal(caught.operation, operation);
    return caught;
  }
  function unit(name, fn, covers = ['window.list', 'window.get', 'window.wait']) {
    test({ name, tier: 'unit', covers }, fn);
  }

  test({ name: 'window target methods are exposed by the real runtime', tier: 'unit',
    verification: 'contract', covers: ['window.list', 'window.get', 'window.wait'] }, () => {
    for (const name of ['list', 'get', 'wait']) equal(typeof window[name], 'function', name);
  });
  unit('list stays synchronous and legacy snapshot adapters remain compatible', async () => {
    const f = fixture(); assert(Array.isArray(f.win.list()));
    equal((await f.win.getActiveWindow()).pid, 1);
    equal((await f.win.getWindowByTitle('x')).id, 'title');
    equal(f.win.getFocusWindow().id, 'focus');
  });
  unit('target fields use exact AND matching and allow negative coordinates', async () => {
    const f = fixture([row(), row({ id: 'fixture:2:native:20', pid: 2, title: 'Other' })]);
    for (const selector of [{ id: 'fixture:1:native:10' }, { pid: 1 }, { title: 'Document' },
      { exePath: '/fixture/editor', title: 'Document' }, { exeName: 'Editor', title: 'Document' }]) {
      equal((await f.win.get(selector)).x, -100);
    }
    equal(f.win.list({ pid: 1, title: 'Other' }).length, 0);
    equal(f.win.list({ exeName: 'editor' }).length, 0);
  });
  unit('App identities are delegated without duplicate alias interpretation', async () => {
    const f = fixture();
    for (const app of ['计算器', 'Calculator', { bundleId: 'com.apple.calculator' },
      { path: '/Applications/Example.app' }, { name: 'Example' }, { pid: 1 }, 1]) {
      await f.win.get({ app }); equal(JSON.stringify(f.calls.app.pop()), JSON.stringify(app));
    }
    f.host.App.get = () => ({ pids: [1, 2] });
    f.setRows([row(), row({ id: 'fixture:2:native:20', pid: 2 })]);
    equal(f.win.list({ app: 'Editor' }).length, 2);
    await rejects(() => f.win.get({ app: 'Editor' }), 'AMBIGUOUS_TARGET');
  });
  unit('missing and ambiguous targets have distinct errors and no implicit fallback', async () => {
    const f = fixture();
    const missing = await rejects(() => f.win.get({ exeName: 'Editor', title: 'old' }), 'NOT_FOUND', 'window.get');
    equal(missing.cause, undefined);
    f.setRows([row(), row({ id: 'fixture:1:native:11' })]);
    await rejects(() => f.win.get({ exeName: 'Editor' }), 'AMBIGUOUS_TARGET');
  });
  unit('invalid selectors fail before native enumeration', async () => {
    const f = fixture();
    for (const input of [undefined, null, '', 'Calculator', 1, [], {}, { name: 'Editor' },
      { pid: 0 }, { pid: 1.5 }, { pid: 4294967296 }, { title: '' }, { title: undefined },
      { id: 'fixture:1:unresolved' }, { app: {} }, { app: { name: 'x', path: '/x' } },
      { app: 'x', pid: 1 }, { exePath: '/x', exeName: 'x' }]) {
      await rejects(() => f.win.get(input), 'INVALID_ARGUMENT', 'window.get');
    }
    await rejects(() => f.win.list({ extra: true }), 'INVALID_ARGUMENT', 'window.list');
    equal(f.calls.list, 0); equal(f.calls.app.length, 0);
  });
  unit('invalid bounds and unresolved identities cannot make a valid unique target', async () => {
    const f = fixture();
    for (const extra of [{ width: 0 }, { height: -1 }, { x: NaN }, { y: Infinity }]) {
      f.setRows([row(extra)]); await rejects(() => f.win.get({ pid: 1 }), 'VERIFICATION_FAILED');
    }
    f.setRows([row({ id: 'fixture:1:unresolved' })]);
    await rejects(() => f.win.get({ pid: 1 }), 'STALE_TARGET');
    f.setRows([row(), row({ id: 'fixture:1:native:11', width: 0 })]);
    await rejects(() => f.win.get({ pid: 1 }), 'AMBIGUOUS_TARGET');
  });
  unit('backend NOT_FOUND is terminal rather than a successful empty observation', async () => {
    const original = Object.assign(new Error('backend failure'), { code: 'NOT_FOUND' });
    const f = fixture(() => { throw original; });
    const error = await rejects(() => f.win.wait({ pid: 1 }), 'NOT_FOUND', 'window.wait');
    equal(error.cause, original); equal(f.calls.list, 1); equal(f.timers.size, 0);
    f.host.App.get = () => null;
    await rejects(() => f.win.get({ app: 'Editor' }), 'NOT_FOUND');
    f.setRows(null); await rejects(() => f.win.get({ pid: 1 }), 'BACKEND_FAILED');
  });
  unit('wait freezes input, observes fresh rows and cleans timers on success', async () => {
    const f = fixture([]), selector = { app: { name: 'Editor' }, title: 'Document' };
    const pending = f.win.wait(selector, { timeout: 100, polling: 10 });
    selector.app.name = 'Changed'; selector.title = 'Changed';
    f.setRows([row()]); f.advance(10);
    equal((await pending).title, 'Document'); equal(f.calls.app[1].name, 'Editor');
    equal(f.calls.list, 2); equal(f.timers.size, 0);
  });
  unit('wait timeout and timeout zero bound observations and clean timers', async () => {
    const f = fixture([]);
    const pending = rejects(() => f.win.wait({ pid: 1 }, { timeout: 25, polling: 10 }), 'TIMEOUT');
    f.advance(25); await pending; equal(f.calls.list, 3); equal(f.timers.size, 0);
    await rejects(() => f.win.wait({ pid: 1 }, { timeout: 0 }), 'TIMEOUT');
    equal(f.calls.list, 4); equal(f.timers.size, 0);
    f.setRows([row()]); equal((await f.win.wait({ pid: 1 }, { timeout: 0 })).pid, 1);
  });
  unit('wait cancellation before and during polling removes all owned resources', async () => {
    const f = fixture([]), pre = signal(); pre.abort();
    await rejects(() => f.win.wait({ pid: 1 }, { signal: pre }), 'CANCELED');
    equal(f.calls.list, 0);
    const active = signal();
    const pending = rejects(() => f.win.wait({ pid: 1 }, { signal: active }), 'CANCELED');
    active.abort(); await pending; equal(active.listeners.size, 0); equal(f.timers.size, 0);
    f.advance(10000); equal(f.calls.list, 1);
  });
  unit('wait does not retry ambiguity, stale identity, geometry or permission failures', async () => {
    for (const [rows, code] of [[[row(), row()], 'AMBIGUOUS_TARGET'],
      [[row({ id: 'fixture:1:unresolved' })], 'STALE_TARGET'], [[row({ width: 0 })], 'VERIFICATION_FAILED'],
      [() => { throw Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }); }, 'PERMISSION_DENIED']]) {
      const f = fixture(rows);
      await rejects(() => f.win.wait({ pid: 1 }), code);
      equal(f.calls.list, 1); equal(f.timers.size, 0);
    }
  });
  unit('invalid wait options do not start enumeration or timers', async () => {
    const f = fixture();
    for (const options of [null, [], { extra: true }, { timeout: -1 }, { timeout: 300001 },
      { timeout: NaN }, { polling: 0 }, { polling: 10001 }, { signal: {} }]) {
      await rejects(() => f.win.wait({ pid: 1 }, options), 'INVALID_ARGUMENT');
    }
    equal(f.calls.list, 0); equal(f.timers.size, 0);
  });

  // Extract the helper actually emitted by the Go generator, rather than maintaining
  // a second resolver implementation as the test oracle.
  const generator = File.read(File.join(File.cwd(), 'automation/recorder_actions.go'));
  const start = generator.indexOf('write("async function __recorderResolveWindow(target)');
  const end = generator.indexOf('write("async function __recorderRequireActiveWindow(target)', start);
  assert(start >= 0 && end > start, 'Recorder resolver source was not found');
  const helper = [...generator.slice(start, end).matchAll(/write\(("(?:[^"\\]|\\.)*")\)/g)]
    .map(match => JSON.parse(match[1])).join('');
  unit('Recorder uses public get and only falls back for a missing exact title', async () => {
    const f = fixture();
    const resolve = new Function('window', helper + '\nreturn __recorderResolveWindow;')(f.win);
    const target = { application: { identityKind: 'executable-path', identityValue: '/fixture/editor' }, title: 'Old' };
    equal((await resolve(target)).id, 'fixture:1:native:10');
    equal(f.calls.list, 2);
    f.setRows([row(), row({ id: 'fixture:2:native:20' })]);
    await rejects(() => resolve(target), 'AMBIGUOUS_TARGET');
    const backend = Object.assign(new Error('backend'), { code: 'NOT_FOUND' });
    f.setRows(() => { throw backend; });
    const before = f.calls.list;
    const error = await rejects(() => resolve(target), 'NOT_FOUND');
    equal(error.cause, backend); equal(f.calls.list, before + 1);
    let unsupported;
    try { await resolve({ application: { identityKind: 'unknown', identityValue: 'x' }, title: 'x' }); }
    catch (error) { unsupported = error; }
    assert(unsupported && String(unsupported).includes('Unsupported Recorder'));
  }, ['Recorder.generateScript', 'window.get']);
})();

await RuntimeAPITest.run('RUNTIME-API-WINDOW-TARGET');
