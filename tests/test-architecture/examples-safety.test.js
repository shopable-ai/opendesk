// Host-side example safety/control-flow checks, NOT OpenDesk Runtime or live desktop evidence.
// Run from the repository root: node --test tests/test-architecture/examples-safety.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { migrations, compatibilitySource } = require('../../scripts/lib/test-architecture-layout');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const script = async (file, env = {}, extra = {}) => {
  const messages = [];
  const context = { Execution: Object.freeze({ env: Object.freeze(env), artifactDir: '/artifacts', id: 'host-test' }),
    File: { cwd: () => root, join: path.join, read: file => read(path.isAbsolute(file) ? path.relative(root, file) : file) },
    console: { log: (...args) => messages.push(args.join(' ')) },
    page: { waitForTimeout: async () => {} }, URL, URLSearchParams, ...extra };
  await vm.runInNewContext('(async()=>{\n' + read(file) + '\n})()', context, { timeout: 1000, filename: file });
  return { context, messages };
};
const target = { id: 'windows:42:native:99', title: 'Disposable', pid: 42, exeName: 'AliWorkbench.exe', x: 10, y: 20, width: 300, height: 200 };
const targetEnv = { OPENDESK_EXAMPLE_WINDOW_TITLE: 'Disposable', OPENDESK_EXAMPLE_WINDOW_PID: '42' };
function desktop(options = {}) {
  let info = { ...target };
  const actions = [];
  let lists = 0;
  const window = {
    getCapabilities: () => ({ platform: 'windows', capabilities: Object.fromEntries(['window.list', 'window.active', 'window.focus', 'window.setBounds', 'window.getBounds', 'window.alwaysOnTop']
      .map(key => [key, { supported: key !== options.unsupported, status: key === options.unsupported ? 'Unsupported' : 'Stable' }])) }),
    list: async () => {
      lists += 1;
      if (options.stale && lists > 1) return [{ ...info, id: 'windows:42:native:100' }];
      if (options.unresolved) return [{ ...info, id: 'windows:42:unresolved' }];
      if (options.duplicate) return [info, { ...info, pid: 43, id: 'windows:43:native:100' }];
      if (options.exeName) return [{ ...info, exeName: options.exeName }];
      return [info];
    },
    getActiveWindow: async () => options.wrongFocus ? { ...info, pid: 98 } : info,
    focus: async title => { actions.push(['focus', title]); },
    setWindowBounds: async (title, x, y, width, height) => {
      actions.push(['bounds', title, x, y, width, height]);
      if (options.noMove) return;
      info = { ...info, x, y, width, height };
      if (options.partial) info.x += 13;
      if (options.throwFirst && actions.filter(a => a[0] === 'bounds').length === 1) throw new Error('backend changed then threw');
      if (options.throwRestore && actions.filter(a => a[0] === 'bounds').length === 2) throw new Error('restore error');
    },
    setAlwaysOnTop: async (title, enabled) => { actions.push(['topmost', title, enabled]); },
  };
  return { window, actions, info: () => info };
}

for (const name of ['examples/runtime/file.js', 'examples/file.js']) {
  test('File roundtrip uses only its own files: ' + name, async t => {
    const parent = path.join(root, '.runtime/tests/test-architecture/example-unit');
    fs.mkdirSync(parent, { recursive: true });
    const dir = fs.mkdtempSync(path.join(parent, 'file-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const accesses = [];
    const checked = file => {
      assert(path.resolve(file).startsWith(dir + path.sep), 'I/O must stay in the per-run directory');
      accesses.push(file); return file;
    };
    const File = { cwd: () => root, join: path.join, exists: p => fs.existsSync(checked(p)),
      ensureDir: p => fs.mkdirSync(checked(p), { recursive: true }), create: p => fs.writeFileSync(checked(p), ''),
      write: (p, s) => fs.writeFileSync(checked(p), s),
      read: p => p.startsWith('examples/') ? read(p) : fs.readFileSync(checked(p), 'utf8'),
      isDir: p => fs.statSync(checked(p)).isDirectory(), isFile: p => fs.statSync(checked(p)).isFile(),
      copy: (a, b) => fs.copyFileSync(checked(a), checked(b)), move: (a, b) => fs.renameSync(checked(a), checked(b)),
      listDir: p => fs.readdirSync(checked(p)),
    };
    await script(name, {}, { File, Execution: { env: {}, artifactDir: dir } });
    assert.deepEqual(fs.readdirSync(dir), ['file-demo']);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'file-demo')).sort(), ['demo.json', 'input.txt', 'moved.txt']);
    await assert.rejects(script(name, {}, { File, Execution: { env: {}, artifactDir: dir } }), /already exists/);
    assert(accesses.length > 0);
  });
}
for (const broken of ['read', 'copy', 'move', 'listing']) {
  test('File rejects incorrect ' + broken + ' result', async () => {
    const storage = new Map();
    const File = { join: path.posix.join, exists: p => storage.has(p), ensureDir: p => storage.set(p, 'dir'),
      create: p => storage.set(p, ''), write: (p, text) => storage.set(p, text),
      read: p => broken === 'read' ? 'corrupt' : storage.get(p), isDir: p => storage.get(p) === 'dir', isFile: p => storage.has(p),
      copy: (a, b) => storage.set(b, broken === 'copy' ? 'corrupt' : storage.get(a)),
      move: (a, b) => { storage.set(b, storage.get(a)); if (broken !== 'move') storage.delete(a); },
      listDir: () => broken === 'listing' ? [] : ['input.txt', 'moved.txt', 'demo.json'],
    };
    await assert.rejects(script('examples/runtime/file.js', {}, { File }), /verification failed/);
  });
}

for (const platform of ['windows', 'darwin', 'linux']) {
  test('Command checks platform-specific fixed echo: ' + platform, async () => {
    const calls = [];
    const result = await script('examples/runtime/command.js', {}, {
      System: { getPlatformInfo: () => ({ os: platform }) },
      Command: { getCapabilities: () => ({ enabled: true, supported: true }), run: async (...args) => {
        calls.push(args); return { exitCode: 0, stdout: 'OpenDesk command\r\n', stderr: '' };
      } },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], platform === 'windows' ? 'cmd.exe' : '/bin/echo');
    assert.equal(calls[0][2].timeout, 5000);
    assert.equal(calls[0][2].maxOutputBytes, 4096);
    assert(result.messages.some(m => m.includes('[COMMAND-EXAMPLE] passed')));
  });
}
for (const result of [{ exitCode: 1, stdout: '', stderr: '' }, { exitCode: 0, stdout: 'wrong', stderr: '' }, { exitCode: 0, stdout: 'OpenDesk command', stderr: 'warning' }]) {
  test('Command rejects invalid result ' + JSON.stringify(result), async () => {
    await assert.rejects(script('examples/runtime/command.js', {}, { System: { getPlatformInfo: () => ({ os: 'linux' }) },
      Command: { getCapabilities: () => ({ enabled: true, supported: true }), run: async () => result } }), /unexpected echo/);
  });
}
test('Command disabled capability fails before execution', async () => {
  await assert.rejects(script('examples/runtime/command.js', {}, { Command: { getCapabilities: () => ({ enabled: false }), run: () => assert.fail() } }), /requires local/);
});

test('HTTP missing/invalid URL and denied writes make no requests', async () => {
  for (const env of [{}, { OPENDESK_EXAMPLE_HTTP_URL: 'bad url' }, { OPENDESK_EXAMPLE_HTTP_URL: 'file:///private/file' },
    { OPENDESK_EXAMPLE_HTTP_URL: 'https://user:secret@example.test/a' },
    { OPENDESK_EXAMPLE_HTTP_URL: 'https://example.test/a#part' },
    ...['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE'].map(method => ({ OPENDESK_EXAMPLE_HTTP_URL: 'http://127.0.0.1/echo', OPENDESK_EXAMPLE_HTTP_METHOD: method }))]) {
    let calls = 0;
    await assert.rejects(script('examples/runtime/http.js', env, { axios: { request: () => { calls++; } } }));
    assert.equal(calls, 0);
  }
});
for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
  test('HTTP sends exactly one explicit ' + method + ' request without exposing response data', async () => {
    const calls = [];
    const env = { OPENDESK_EXAMPLE_HTTP_URL: 'http://127.0.0.1/echo?secret=not-for-log', OPENDESK_EXAMPLE_HTTP_METHOD: method, OPENDESK_EXAMPLE_ALLOW_WRITE: '1' };
    const result = await script('examples/runtime/http.js', env, { axios: { request: async config => { calls.push(config); return { status: 200, data: 'PRIVATE_BODY' }; } } });
    assert.equal(calls.length, 1); assert.equal(calls[0].method, method); assert.equal(calls[0].timeout, 5000);
    assert(!result.messages.join('').includes('PRIVATE_BODY')); assert(!result.messages.join('').includes('secret='));
    assert(result.messages.join('').includes('"persistenceVerified":false'));
  });
}
test('HTTP form POST keeps the existing form demonstration', async () => {
  let config;
  await script('examples/runtime/http.js', { OPENDESK_EXAMPLE_HTTP_URL: 'http://127.0.0.1/echo', OPENDESK_EXAMPLE_HTTP_METHOD: 'POST', OPENDESK_EXAMPLE_ALLOW_WRITE: '1', OPENDESK_EXAMPLE_HTTP_FORM: '1' },
    { axios: { request: async c => { config = c; return { status: 204 }; } } });
  assert.equal(config.data.toString(), 'name=opendesk-example&value=123');
});
test('HTTP rejects a bad status or request failure without echoing URL/body', async () => {
  const env = { OPENDESK_EXAMPLE_HTTP_URL: 'http://127.0.0.1/echo' };
  await assert.rejects(script('examples/runtime/http.js', env, { axios: { request: async () => ({ status: 500 }) } }), /2xx/);
  await assert.rejects(script('examples/runtime/http.js', env, { axios: { request: async () => { throw new Error('PRIVATE_TOKEN'); } } }), error => !error.message.includes('PRIVATE_TOKEN'));
});

test('Clipboard text denies writes by default and never clears/restores original data', async () => {
  let value = 'PRIVATE'; const writes = [];
  const clipboard = { copy: text => { writes.push(text); value = text; }, paste: () => value, clear: () => assert.fail('must not clear') };
  await assert.rejects(script('examples/clipboard/text.js', {}, { clipboard }), /overwrites/);
  assert.equal(writes.length, 0);
  const result = await script('examples/clipboard/text.js', { OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE: '1' }, { clipboard });
  assert.deepEqual(writes, ['OpenDesk clipboard example']); assert.equal(value, writes[0]);
  assert(!result.messages.join('').includes('PRIVATE'));
});
test('Clipboard mismatch is a failure and never logs actual text', async () => {
  await assert.rejects(script('examples/clipboard/text.js', { OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE: '1' },
    { clipboard: { copy() {}, paste: () => 'PRIVATE' } }), error => /mismatch/.test(error.message) && !error.message.includes('PRIVATE'));
});

for (const file of ['examples/desktop/keyboard.js', 'examples/desktop/window-controls.js']) {
  test('desktop side effects are opt-in: ' + file, async () => {
    const d = desktop(); await assert.rejects(script(file, {}, { window: d.window })); assert.equal(d.actions.length, 0);
  });
  for (const bad of ['duplicate', 'unresolved', 'stale']) {
    test(file + ' refuses ' + bad + ' identity before any action', async () => {
      const d = desktop({ [bad]: true });
      await assert.rejects(script(file, { ...targetEnv, OPENDESK_EXAMPLE_ALLOW_INPUT: '1', OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE: '1' }, { window: d.window }));
      assert.equal(d.actions.length, 0);
    });
  }
}
test('keyboard focuses a checked target then dispatches one line, never Enter or shortcuts', async () => {
  const d = desktop();
  const result = await script('examples/desktop/keyboard.js', { ...targetEnv, OPENDESK_EXAMPLE_ALLOW_INPUT: '1' },
    { window: d.window, keyboard: { type: async text => d.actions.push(['type', text]), press: () => assert.fail(), combination: () => assert.fail() } });
  assert.deepEqual(d.actions, [['focus', target.title], ['type', 'Hello from OpenDesk']]);
  assert(result.messages.join('').includes('not programmatically verified'));
});
test('keyboard will not type after failed focus or unsupported focus capability', async () => {
  for (const options of [{ wrongFocus: true }, { unsupported: 'window.focus' }]) {
    const d = desktop(options);
    await assert.rejects(script('examples/desktop/keyboard.js', { ...targetEnv, OPENDESK_EXAMPLE_ALLOW_INPUT: '1' },
      { window: d.window, keyboard: { type: () => assert.fail('unsafe input') } }));
  }
});
test('window control verifies requested bounds and restores exactly the original bounds', async () => {
  const d = desktop();
  await script('examples/desktop/window-controls.js', { ...targetEnv, OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE: '1' }, { window: d.window });
  assert.deepEqual(d.actions, [['bounds', 'Disposable', 30, 20, 300, 200], ['bounds', 'Disposable', 10, 20, 300, 200]]);
  assert.equal(d.info().x, 10);
});
for (const option of ['throwFirst', 'throwRestore', 'partial', 'noMove']) {
  test('window control preserves failure for ' + option, async () => {
    const d = desktop({ [option]: true });
    await assert.rejects(script('examples/desktop/window-controls.js', { ...targetEnv, OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE: '1' }, { window: d.window }), /Window example failed/);
    if (option === 'throwFirst') assert.equal(d.info().x, 10);
    if (option === 'partial') assert.equal(d.actions.length, 1, 'refuse to overwrite externally changed bounds');
  });
}
test('window inventory never reads content or changes any window; titles opt-in', async () => {
  const d = desktop();
  const result = await script('examples/desktop/window-inspect.js', {}, { window: d.window });
  assert.equal(d.actions.length, 0); assert(!result.messages.join('').includes('Disposable')); assert(!result.messages.join('').includes('AliWorkbench.exe'));
  const full = await script('examples/desktop/window-inspect.js', { OPENDESK_EXAMPLE_SHOW_TITLES: '1' }, { window: d.window });
  assert(full.messages.join('').includes('Disposable'));
});
test('Qianniu inventory is read-only; topmost requires explicit target/action and executable match', async () => {
  const d = desktop(); const System = { getPlatformInfo: () => ({ os: 'windows' }) };
  await script('examples/app/qianniu-window.js', {}, { window: d.window, System }); assert.equal(d.actions.length, 0);
  const env = { ...targetEnv, OPENDESK_EXAMPLE_QIANNIU_TOPMOST: 'on', OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE: '1' };
  await script('examples/app/qianniu-window.js', env, { window: d.window, System });
  assert.deepEqual(d.actions, [['topmost', 'Disposable', true]]);
  const other = desktop({ exeName: 'Notepad.exe' });
  await assert.rejects(script('examples/app/qianniu-window.js', env, { window: other.window, System }), /not AliWorkbench/); assert.equal(other.actions.length, 0);
});

const accessibilityExamples = Object.freeze({
  'inspect-window.js': {
    command: './dist/opendesk -script examples/accessibility/inspect-window.js -console-mode script -log-dir .runtime/tests/accessibility/public-inspect',
    runtimeTest: 'tests/runtime-api/accessibility-native-macos.js',
  },
  'invoke-control.js': {
    command: 'OPENDESK_ACCESSIBILITY_CONTROL_ROLE=button OPENDESK_ACCESSIBILITY_CONTROL_NAME=\'Invoke Once\' OPENDESK_ACCESSIBILITY_CONTROL_IDENTIFIER=\'fixture.invoke\' OPENDESK_ACCESSIBILITY_VERIFY_ROLE=staticText OPENDESK_ACCESSIBILITY_VERIFY_IDENTIFIER=\'fixture.status\' OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY=value OPENDESK_ACCESSIBILITY_EXPECTED_VALUE=\'invoke-button | invoke=1 checkbox=0 menu=0\' ./dist/opendesk -script examples/accessibility/invoke-control.js -console-mode script -log-dir .runtime/tests/accessibility/public-invoke',
    runtimeTest: 'tests/runtime-api/accessibility-native-macos.js',
  },
  'menu-command.js': {
    command: 'OPENDESK_ACCESSIBILITY_MENU_PATH_JSON=\'[{"identifier":"fixture.menu.root"},{"identifier":"fixture.menu.invoke"}]\' OPENDESK_ACCESSIBILITY_VERIFY_ROLE=staticText OPENDESK_ACCESSIBILITY_VERIFY_IDENTIFIER=\'fixture.status\' OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY=value OPENDESK_ACCESSIBILITY_EXPECTED_VALUE=\'menu-invoke | invoke=0 checkbox=0 menu=1\' ./dist/opendesk -script examples/accessibility/menu-command.js -console-mode script -log-dir .runtime/tests/accessibility/public-menu',
    runtimeTest: 'tests/runtime-api/accessibility-native-macos.js',
  },
});

const accessibilityWindow = Object.freeze({
  id: 'darwin:42:native:99', title: 'OpenDesk Accessibility Fixture', pid: 42,
  x: 10, y: 20, width: 520, height: 420, exeName: 'OpenDeskAccessibilityFixture',
  exePath: '/repo/.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app/Contents/MacOS/OpenDeskAccessibilityFixture',
  isForeground: true, hasFocus: true, handle: 99, isPopup: false, index: 0,
});

function accessibilityRuntime(overrides = {}) {
  const env = {
    OPENDESK_ACCESSIBILITY_TARGET_PID: '42',
    OPENDESK_ACCESSIBILITY_WINDOW_ID: 'darwin:42:native:99',
    OPENDESK_ACCESSIBILITY_CONTROL_ROLE: 'button',
    OPENDESK_ACCESSIBILITY_CONTROL_NAME: 'Invoke Once',
    OPENDESK_ACCESSIBILITY_CONTROL_IDENTIFIER: 'fixture.invoke',
    OPENDESK_ACCESSIBILITY_VERIFY_ROLE: 'staticText',
    OPENDESK_ACCESSIBILITY_VERIFY_IDENTIFIER: 'fixture.status',
    OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY: 'value',
    OPENDESK_ACCESSIBILITY_EXPECTED_VALUE: 'invoke-button | invoke=1 checkbox=0 menu=0',
    OPENDESK_ACCESSIBILITY_MENU_PATH_JSON: '[{"identifier":"fixture.menu.root"},{"identifier":"fixture.menu.invoke"}]',
    ...overrides.env,
  };
  const calls = [];
  const refs = [];
  const System = { getEnv: name => env[name] || '' };
  const windowObject = {
    list: async () => [overrides.window || accessibilityWindow],
  };
  const Accessibility = {
    getCapabilities: () => {
      calls.push(['Accessibility.getCapabilities']);
      return {
        hostAuthorization: { enabled: true },
        implementation: { available: true, menus: true },
        permission: { granted: true },
        available: true,
      };
    },
    snapshot: async options => {
      calls.push(['Accessibility.snapshot', options]);
      return {
        requestId: 'axreq-host-1', backend: 'macos-ax', complete: true,
        truncated: false, reason: null, stats: { nodes: 3, maxDepth: 2 },
        root: { role: 'window', nativeRole: 'AXWindow', children: [{ role: 'button', children: [] }] },
      };
    },
    find: async selector => {
      calls.push(['Accessibility.find', selector]);
      const ref = selector.identifier === 'fixture.invoke'
        ? { kind: 'AccessibilityElementRef', id: 'invoke', role: 'button', nativeRole: 'AXButton' }
        : { kind: 'AccessibilityElementRef', id: 'status', role: 'staticText', nativeRole: 'AXStaticText' };
      refs.push(ref);
      return ref;
    },
    perform: async (ref, action) => {
      calls.push(['Accessibility.perform', ref, action]);
      return { requestId: 'axreq-host-2', backend: 'macos-ax', action: action.action, actionState: 'acknowledged' };
    },
    read: async (_ref, options) => {
      calls.push(['Accessibility.read', options]);
      return { properties: { value: env.OPENDESK_ACCESSIBILITY_EXPECTED_VALUE } };
    },
    release: async ref => {
      calls.push(['Accessibility.release', ref]);
      return refs.includes(ref);
    },
  };
  const UI = {
    tapMenuItem: async (pathValue, options) => {
      calls.push(['UI.tapMenuItem', pathValue, options]);
      return {
        requestId: 'axreq-host-3', backend: 'macos-ax', action: 'invoke',
        actionState: 'acknowledged', completedLevels: pathValue.length, expansionOccurred: true,
      };
    },
  };
  return { env, calls, System, window: windowObject, Accessibility, UI };
}

test('Accessibility public examples are documented one-line commands with matching Runtime evidence sources', () => {
  const readme = read('examples/accessibility/README.md');
  const singleTests = read('docs/api/examples/single-tests.md');
  const names = fs.readdirSync(path.join(root, 'examples/accessibility')).filter(name => name.endsWith('.js')).sort();
  assert.deepEqual(names, Object.keys(accessibilityExamples).sort());
  assert.match(singleTests, /三个示例各自所需的完整环境变量和可复制命令见/);
  assert.match(readme, /\.\/dist\/opendesk -script tests\/accessibility\/fixtures\/macos\/launch\.js -console-mode script -log-dir \.runtime\/tests\/accessibility\/fixture-launch/);
  assert.match(readme, /后续的默认公开命令无需 shell 变量/);
  assert.match(readme, /OPENDESK_ACCESSIBILITY_TARGET_PID` 与 `OPENDESK_ACCESSIBILITY_WINDOW_ID`/);
  for (const [name, expected] of Object.entries(accessibilityExamples)) {
    assert(readme.includes(expected.command), name + ' command is documented exactly once');
    assert.equal(readme.split(expected.command).length - 1, 1, name + ' command must not be duplicated');
    assert(fs.existsSync(path.join(root, expected.runtimeTest)), name + ' Runtime evidence source must exist');
  }
  const native = read('tests/runtime-api/accessibility-native-macos.js');
  for (const method of [
    'Accessibility.getCapabilities', 'Accessibility.snapshot', 'Accessibility.find',
    'Accessibility.read', 'Accessibility.perform', 'Accessibility.release',
    'UI.getMenuItems', 'UI.findMenuItem', 'UI.tapMenuItem',
  ]) {
    assert(native.includes(method), 'native fixture evidence must exercise ' + method);
  }
});

test('Accessibility examples resolve only an exact checked-out fixture receipt when target variables are absent', async () => {
  const absentTarget = { OPENDESK_ACCESSIBILITY_TARGET_PID: '', OPENDESK_ACCESSIBILITY_WINDOW_ID: '' };
  const runtime = accessibilityRuntime({ env: absentTarget });
  const fixtureExecutable = path.join(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app/Contents/MacOS/OpenDeskAccessibilityFixture');
  const fixtureWindow = { ...accessibilityWindow, exePath: fixtureExecutable };
  const receipt = {
    status: 'ready', pid: 42, windowNumber: 99, windowId: 'darwin:42:native:99',
    app: path.join(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app'),
    executable: fixtureExecutable,
    state: path.join(root, '.runtime/tests/accessibility/macos/state.json'),
  };
  const File = {
    cwd: () => root,
    join: path.join,
    exists: file => file.endsWith('/launch.json') || file.endsWith('/fixture.pid'),
    read: file => {
      if (file.endsWith('/fixture.pid')) return '42\n';
      return read(path.isAbsolute(file) ? path.relative(root, file) : file);
    },
    readJSON: async file => file.endsWith('/launch.json') ? receipt : { pid: 42, windowNumber: 99 },
  };
  const result = await script('examples/accessibility/inspect-window.js', {}, {
    ...runtime,
    window: { list: async () => [fixtureWindow] },
    File,
    Execution: { env: {}, artifactDir: '/artifacts', id: 'host-test', workdir: root },
  });
  assert.equal(runtime.calls[1][1].within.id, fixtureWindow.id);
  assert(result.messages.join('\n').includes('[ACCESSIBILITY-INSPECT]'));

  const wrongExecutable = accessibilityRuntime({ env: absentTarget });
  await assert.rejects(script('examples/accessibility/inspect-window.js', {}, {
    ...wrongExecutable,
    File,
    Execution: { env: {}, artifactDir: '/artifacts', id: 'host-test', workdir: root },
    window: { list: async () => [{ ...fixtureWindow, exePath: '/tmp/unrelated-app' }] },
  }), /unexpected executable identity/);
});

test('Accessibility inspect auto-launches and cleans up only the repository-owned fixture when no receipt exists', async () => {
  const absentTarget = { OPENDESK_ACCESSIBILITY_TARGET_PID: '', OPENDESK_ACCESSIBILITY_WINDOW_ID: '' };
  const runtime = accessibilityRuntime({ env: absentTarget });
  const fixtureExecutable = path.join(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app/Contents/MacOS/OpenDeskAccessibilityFixture');
  const fixtureWindow = { ...accessibilityWindow, exePath: fixtureExecutable };
  const receipt = {
    status: 'ready', pid: 42, windowNumber: 99, windowId: 'darwin:42:native:99',
    app: path.join(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app'),
    executable: fixtureExecutable,
    state: path.join(root, '.runtime/tests/accessibility/macos/state.json'),
  };
  let running = false;
  const commands = [];
  const File = {
    cwd: () => root,
    join: path.join,
    exists: file => file.endsWith('/dist/opendesk') || (running && (file.endsWith('/launch.json') || file.endsWith('/fixture.pid'))),
    read: file => {
      if (file.endsWith('/fixture.pid')) return '42\n';
      return read(path.isAbsolute(file) ? path.relative(root, file) : file);
    },
    readJSON: async file => file.endsWith('/launch.json') ? receipt : { pid: 42, windowNumber: 99 },
  };
  const Command = {
    getCapabilities: () => ({ enabled: true, supported: true }),
    run: async (binary, args, options) => {
      commands.push([binary, args, options]);
      if (args[1] === 'tests/accessibility/fixtures/macos/launch.js') running = true;
      if (args[1] === 'tests/accessibility/fixtures/macos/stop.js') running = false;
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  let windowListCalls = 0;
  let snapshotCalls = 0;
  const defaultSnapshot = runtime.Accessibility.snapshot;
  runtime.Accessibility.snapshot = async options => {
    snapshotCalls += 1;
    if (snapshotCalls === 1) {
      runtime.calls.push(['Accessibility.snapshot', options]);
      const error = new Error('fixture AX hierarchy is still starting');
      error.code = 'STALE_TARGET';
      throw error;
    }
    return defaultSnapshot(options);
  };
  const waits = [];
  const result = await script('examples/accessibility/inspect-window.js', {}, {
    ...runtime,
    window: { list: async () => { windowListCalls += 1; return [fixtureWindow]; } },
    File,
    Command,
    sleep: async milliseconds => { waits.push(milliseconds); },
    Execution: { env: {}, artifactDir: '/artifacts', id: 'host-test', workdir: root },
  });
  assert.deepEqual(commands.map(([, args]) => args[1]), [
    'tests/accessibility/fixtures/macos/launch.js',
    'tests/accessibility/fixtures/macos/stop.js',
  ]);
  assert.equal(running, false);
  assert.equal(snapshotCalls, 2);
  assert.equal(windowListCalls, 2);
  assert.deepEqual(waits, [100]);
  assert.equal(runtime.calls[1][1].within.id, fixtureWindow.id);
  assert(result.messages.join('\n').includes('[ACCESSIBILITY-INSPECT]'));
});

test('Accessibility inspect retries neither explicit targets nor a persistent fixture stale target', async () => {
  const stale = () => {
    const error = new Error('verified window is no longer present in the accessibility hierarchy');
    error.code = 'STALE_TARGET';
    return error;
  };

  const explicit = accessibilityRuntime();
  let explicitWindowLists = 0;
  explicit.Accessibility.snapshot = async options => {
    explicit.calls.push(['Accessibility.snapshot', options]);
    throw stale();
  };
  await assert.rejects(script('examples/accessibility/inspect-window.js', explicit.env, {
    ...explicit,
    window: { list: async () => { explicitWindowLists += 1; return [accessibilityWindow]; } },
  }), error => error && error.code === 'STALE_TARGET');
  assert.deepEqual(explicit.calls.map(call => call[0]), ['Accessibility.getCapabilities', 'Accessibility.snapshot']);
  assert.equal(explicitWindowLists, 1);

  const absentTarget = { OPENDESK_ACCESSIBILITY_TARGET_PID: '', OPENDESK_ACCESSIBILITY_WINDOW_ID: '' };
  const receiptRuntime = accessibilityRuntime({ env: absentTarget });
  const fixtureExecutable = path.join(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app/Contents/MacOS/OpenDeskAccessibilityFixture');
  const fixtureWindow = { ...accessibilityWindow, exePath: fixtureExecutable };
  const receipt = {
    status: 'ready', pid: 42, windowNumber: 99, windowId: 'darwin:42:native:99',
    app: path.join(root, '.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app'),
    executable: fixtureExecutable,
    state: path.join(root, '.runtime/tests/accessibility/macos/state.json'),
  };
  const File = {
    cwd: () => root,
    join: path.join,
    exists: file => file.endsWith('/launch.json') || file.endsWith('/fixture.pid'),
    read: file => file.endsWith('/fixture.pid') ? '42\n' : read(path.isAbsolute(file) ? path.relative(root, file) : file),
    readJSON: async file => file.endsWith('/launch.json') ? receipt : { pid: 42, windowNumber: 99 },
  };
  let receiptWindowLists = 0;
  receiptRuntime.Accessibility.snapshot = async options => {
    receiptRuntime.calls.push(['Accessibility.snapshot', options]);
    throw stale();
  };
  const waits = [];
  await assert.rejects(script('examples/accessibility/inspect-window.js', {}, {
    ...receiptRuntime,
    window: { list: async () => { receiptWindowLists += 1; return [fixtureWindow]; } },
    File,
    sleep: async milliseconds => { waits.push(milliseconds); },
    Execution: { env: {}, artifactDir: '/artifacts', id: 'host-test', workdir: root },
  }), error => error && error.code === 'STALE_TARGET');
  assert.deepEqual(receiptRuntime.calls.map(call => call[0]), [
    'Accessibility.getCapabilities', 'Accessibility.snapshot', 'Accessibility.snapshot',
  ]);
  assert.equal(receiptWindowLists, 2);
  assert.deepEqual(waits, [100]);
  assert(!receiptRuntime.calls.some(call => ['Accessibility.perform', 'UI.tapMenuItem'].includes(call[0])));
});

test('macOS Accessibility fixture lifecycle is JavaScript Runtime-owned', () => {
  const fixtureRoot = 'tests/accessibility/fixtures/macos';
  const launch = read(fixtureRoot + '/launch.js');
  const stop = read(fixtureRoot + '/stop.js');
  const build = read(fixtureRoot + '/build.js');
  const library = read(fixtureRoot + '/fixture-lib.js');
  for (const name of ['build.js', 'launch.js', 'stop.js', 'fixture-lib.js']) {
    assert(fs.existsSync(path.join(root, fixtureRoot, name)), name + ' fixture JavaScript source must exist');
  }
  for (const removed of ['build.sh', 'launch.sh', 'stop.sh']) {
    assert(!fs.existsSync(path.join(root, fixtureRoot, removed)), removed + ' must not remain as a second fixture implementation');
  }
  assert.match(build, /fixture\.build\(paths\)/);
  assert.match(launch, /Command\.run\('\/usr\/bin\/open', \['-n', paths\.app, '--args', '--state', paths\.state\]/);
  assert.match(launch, /fixture\.waitForReady\(paths\)/);
  assert.match(launch, /fixture\.confirmStillOwned\(paths, ready\.pid\)/);
  assert.match(launch, /fixture\.waitForVisibleWindow\(paths, ready\)/);
  assert.match(stop, /command !== fixture\.expectedCommand\(paths\)/);
  assert.match(stop, /Command\.run\('\/bin\/kill', \['-TERM', String\(pid\)\]/);
  assert.match(library, /File\.readJSON\(paths\.state\)/);
  assert.match(library, /await this\.ownedPid\(paths, state\.pid\)/);
  assert.match(library, /await this\.ownedPid\(paths, pid\)/);
  assert.match(library, /async waitForVisibleWindow\(paths, ready\)/);
  assert.match(library, /Command\.run\('\/usr\/bin\/xcrun'/);
  assert.match(library, /Command\.run\('\/usr\/bin\/codesign'/);
});

test('Accessibility inspect example observes only the reviewed window scope', async () => {
  const runtime = accessibilityRuntime();
  const result = await script('examples/accessibility/inspect-window.js', runtime.env, runtime);
  assert.deepEqual(runtime.calls.map(call => call[0]), ['Accessibility.getCapabilities', 'Accessibility.snapshot']);
  assert.equal(runtime.calls[1][1].within.id, accessibilityWindow.id);
  assert.equal(runtime.calls[1][1].maxDepth, 4);
  assert.equal(runtime.calls[1][1].maxNodes, 300);
  assert(result.messages.join('\n').includes('[ACCESSIBILITY-INSPECT]'));
  assert(!runtime.calls.some(call => ['Accessibility.perform', 'UI.tapMenuItem'].includes(call[0])));
});

test('Accessibility invoke example performs once, verifies readback, and releases refs', async () => {
  const runtime = accessibilityRuntime();
  const result = await script('examples/accessibility/invoke-control.js', runtime.env, runtime);
  assert.deepEqual(runtime.calls.map(call => call[0]), [
    'Accessibility.getCapabilities', 'Accessibility.find', 'Accessibility.perform',
    'Accessibility.find', 'Accessibility.read', 'Accessibility.release', 'Accessibility.release',
  ]);
  assert.deepEqual(plain(runtime.calls[2][2]), { action: 'invoke' });
  assert(result.messages.join('\n').includes('[ACCESSIBILITY-INVOKE]'));
  assert(!runtime.calls.some(call => call[0] === 'UI.tapMenuItem'));
});

test('Accessibility menu example requires the reviewed foreground window and verifies readback', async () => {
  const runtime = accessibilityRuntime({
    env: { OPENDESK_ACCESSIBILITY_EXPECTED_VALUE: 'menu-invoke | invoke=0 checkbox=0 menu=1' },
  });
  const result = await script('examples/accessibility/menu-command.js', runtime.env, runtime);
  assert.deepEqual(runtime.calls.map(call => call[0]), [
    'Accessibility.getCapabilities', 'UI.tapMenuItem',
    'Accessibility.find', 'Accessibility.read', 'Accessibility.release',
  ]);
  assert.deepEqual(plain(runtime.calls[1][1]), [{ identifier: 'fixture.menu.root' }, { identifier: 'fixture.menu.invoke' }]);
  assert.equal(runtime.calls[1][2].within.id, accessibilityWindow.id);
  assert(result.messages.join('\n').includes('[ACCESSIBILITY-MENU]'));

  const background = accessibilityRuntime({ window: { ...accessibilityWindow, isForeground: false } });
  await assert.rejects(script('examples/accessibility/menu-command.js', background.env, background), /must already be foreground/);
  assert.deepEqual(background.calls.map(call => call[0]), ['Accessibility.getCapabilities']);
});

async function stress(env = {}, options = {}) {
  const outputs = []; const writes = []; let value; let last;
  const File = { join: path.posix.join, exists: () => false, ensureDir() {}, write: (_file, text) => { last = JSON.parse(text); outputs.push(last); } };
  const clipboard = { copy: text => { writes.push(text); if (options.writeFailure) throw new Error('PRIVATE_ERROR'); value = text; }, paste: () => options.mismatch ? 'PRIVATE_CLIPBOARD' : value, clear: () => assert.fail('must not clear') };
  let error;
  try { await script('tests/runtime-api/clipboard-stress.js', env, { File, clipboard }); } catch (e) { error = e; }
  return { outputs, writes, report: last, error };
}
test('clipboard stress requires separate live opt-in and bounds iteration count', async () => {
  for (const env of [{}, { OPENDESK_LIVE_CLIPBOARD_STRESS: '1', OPENDESK_CLIPBOARD_STRESS_ITERATIONS: '1' }, { OPENDESK_LIVE_CLIPBOARD_STRESS: '1', OPENDESK_CLIPBOARD_STRESS_ITERATIONS: '1001' }]) {
    const result = await stress(env); assert(result.error); assert.equal(result.writes.length, 0);
  }
});
test('clipboard stress uses reproducible inputs and fails on mismatch or write failure', async () => {
  const env = { OPENDESK_LIVE_CLIPBOARD_STRESS: '1', OPENDESK_CLIPBOARD_STRESS_ITERATIONS: '20', OPENDESK_CLIPBOARD_STRESS_SEED: '7' };
  const a = await stress(env), b = await stress(env);
  assert.equal(a.error, undefined); assert.deepEqual(a.writes, b.writes); assert.equal(a.report.passed, 20); assert.equal(a.report.status, 'passed');
  assert(a.writes.includes('')); assert(a.writes.includes('😀🚀🌍🔥'));
  for (const option of [{ mismatch: true }, { writeFailure: true }]) {
    const failure = await stress(env, option); assert.match(failure.error.message, /stress failed/); assert.equal(failure.report.failed, 20);
    assert.equal(failure.report.status, 'failed'); assert.equal(failure.report.fullCatalog, false);
    assert(!JSON.stringify(failure.outputs).includes('PRIVATE'));
  }
});

test('documented legacy entries remain exact delegations to the reviewed canonical examples', () => {
  const targets = ['examples/runtime/file.js', 'examples/runtime/command.js', 'examples/runtime/http.js', 'examples/clipboard/text.js',
    'examples/desktop/window-inspect.js', 'examples/desktop/window-controls.js', 'examples/desktop/keyboard.js', 'tests/runtime-api/clipboard-stress.js'];
  for (const to of targets) {
    const entry = migrations.find(item => item.to === to); assert(entry, 'missing migration: ' + to);
    assert.equal(read(entry.from), compatibilitySource(entry.to, entry.mode));
    assert(read(to).trim().length > 0);
  }
});

test('example index uses canonical paths and explicit input/clipboard opt-ins', () => {
  const index = read('docs/api/examples/README.md');
  for (const old of ['examples/file.js', 'examples/command.js', 'examples/http.js', 'examples/clipboard.js', 'examples/keyboard.js', 'examples/window.js', 'examples/window-more.js']) assert(!index.includes(old), old);
  for (const name of ['OPENDESK_EXAMPLE_ALLOW_CLIPBOARD_WRITE=1', 'OPENDESK_EXAMPLE_ALLOW_INPUT=1', 'OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1']) assert(index.includes(name), name);
  for (const file of ['examples/runtime/README.md', 'examples/clipboard/README.md', 'examples/desktop/README.md', 'examples/app/README.md']) assert(read(file).includes('仓库根目录'));
});

test('HTTP userinfo rejection does not depend on unpromised browser URL properties', async () => {
  class MinimalRuntimeURL {
    constructor(value) {
      const parsed = new URL(value);
      this.protocol = parsed.protocol; this.hostname = parsed.hostname;
      this.href = parsed.href; this.hash = parsed.hash;
    }
  }
  let calls = 0;
  const extra = { URL: MinimalRuntimeURL, axios: { request: async () => { calls++; return { status: 200 }; } } };
  await script('examples/runtime/http.js', { OPENDESK_EXAMPLE_HTTP_URL: 'http://127.0.0.1/echo' }, extra);
  assert.equal(calls, 1);
  await assert.rejects(script('examples/runtime/http.js', { OPENDESK_EXAMPLE_HTTP_URL: 'http://user:password@127.0.0.1/echo' }, extra));
  assert.equal(calls, 1);
});
