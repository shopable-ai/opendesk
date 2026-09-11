'use strict';

// Host-side tests for the release-owned Official Shell helper. These tests
// exercise injected Runtime seams; they do not claim native UI or App Shell
// lifecycle verification.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..');
const shellFile = path.join(repo, 'apps', 'opendesk', 'official-shell.js');
const runnerFile = path.join(repo, 'apps', 'opendesk', 'script-runner', 'controller.js');
vm.runInThisContext(fs.readFileSync(shellFile, 'utf8'), {filename: shellFile});
vm.runInThisContext(fs.readFileSync(runnerFile, 'utf8'), {filename: runnerFile});
const Shell = globalThis.OpenDeskOfficialShell;
const Runner = globalThis.OpenDeskScriptRunnerSimple;
const asset = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'assets', 'official-shell.odcfg'), 'utf8');
const OBFUSCATION_KEY = 'OpenDeskOfficialShell/v1';

function checksum16(text) {
  let sum = 0;
  for (let index = 0; index < text.length; index++) sum = (sum + text.charCodeAt(index)) & 0xffff;
  return sum.toString(16).padStart(4, '0');
}

function encodeConfig(value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  let hex = '';
  for (let index = 0; index < payload.length; index++) {
    const byte = payload.charCodeAt(index) ^ OBFUSCATION_KEY.charCodeAt(index % OBFUSCATION_KEY.length);
    hex += byte.toString(16).padStart(2, '0');
  }
  return `ODCFG1:${checksum16(payload)}\n${hex}\n`;
}

function config(overrides = {}) {
  return {
    schemaVersion: 1,
    actions: {
      help: {visible: true, url: ''},
      customize: {visible: true, url: ''},
      marketplace: {visible: false, url: ''},
      upgrade: {visible: false, url: ''},
      ...overrides,
    },
  };
}

function fileAPI() {
  return {
    join: path.join,
    read: file => fs.readFileSync(file, 'utf8'),
    stat(file) {
      try {
        const info = fs.statSync(file);
        return {type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other'};
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

function createFixture(configText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-official-shell-'));
  fs.mkdirSync(path.join(root, 'assets'));
  if (configText !== undefined) fs.writeFileSync(path.join(root, 'assets', 'official-shell.odcfg'), configText);
  const calls = [];
  const warnings = [];
  const shell = Shell.create({
    file: fileAPI(),
    command: {run: async (...args) => { calls.push(args); return {exitCode: 0, stdout: '', stderr: ''}; }},
    system: {getPlatformInfo: () => ({os: 'darwin'})},
    execution: {workdir: root},
    packageRoot: root,
    logger: {warn: message => warnings.push(message)},
  });
  return {root, shell, calls, warnings};
}

test('the bundled Official Shell config parses to the frozen P0 defaults', () => {
  assert.deepEqual(Shell.parseConfig(asset), config());
});

for (const [name, mutate, expected] of [
  ['invalid header', value => value.replace('ODCFG1:', 'ODCFG0:'), /header is invalid/],
  ['invalid checksum', value => value.replace(/^ODCFG1:[0-9a-f]+/i, 'ODCFG1:ffff'), /checksum mismatch/],
  ['invalid hex', value => value.replace(/\n[0-9a-f]+\n$/i, '\nnot-hex\n'), /not valid hex/],
  ['invalid JSON', () => encodeConfig('not-json'), /Unexpected token|JSON/],
  ['invalid schemaVersion', () => {
    const value = config();
    value.schemaVersion = 99;
    return encodeConfig(value);
  }, /schemaVersion is unsupported/],
]) {
  test(`parseConfig rejects ${name}`, () => assert.throws(() => Shell.parseConfig(mutate(asset)), expected));
}

test('validateConfig rejects non-HTTPS URLs and hidden core actions', () => {
  assert.throws(() => Shell.validateConfig(config({help: {visible: true, url: 'javascript:alert(1)'}})), /only accepts https/);
  assert.throws(() => Shell.validateConfig(config({help: {visible: true, url: 'https://'}})), /only accepts https/);
  assert.throws(() => Shell.validateConfig(config({help: {visible: true, url: 'https://example.com/\n--not-a-url'}})), /only accepts https/);
  assert.throws(() => Shell.validateConfig(config({customize: {visible: false, url: ''}})), /core action cannot be hidden/);
  assert.deepEqual(Shell.validateConfig(config()), config());
});

test('missing and corrupt config fail safe to visible pending core actions', async () => {
  const invalidSchema = config();
  invalidSchema.schemaVersion = 99;
  for (const configText of [
    undefined,
    asset.replace(/^ODCFG1:/, 'ODCFG0:'),
    encodeConfig(invalidSchema),
    encodeConfig(config({help: {visible: false, url: ''}})),
  ]) {
    const fixture = createFixture(configText);
    try {
      assert.equal(fixture.shell.state().configSource, 'fallback');
      assert.ok(fixture.warnings.length > 0);
      assert.equal(fixture.shell.getAction('opendesk.help').visible, true);
      assert.equal(fixture.shell.getAction('opendesk.customize').visible, true);
      assert.equal(fixture.shell.getAction('opendesk.marketplace').visible, false);
      assert.equal(fixture.shell.getAction('opendesk.upgrade').visible, false);
      assert.deepEqual(await fixture.shell.activate('opendesk.help'), {
        status: 'pending', actionId: 'opendesk.help', message: '帮助中心待开放。',
      });
      assert.deepEqual(await fixture.shell.activate('opendesk.customize'), {
        status: 'pending', actionId: 'opendesk.customize', message: '定制自动化服务待开放。',
      });
      assert.equal(fixture.calls.length, 0);
    } finally {
      fs.rmSync(fixture.root, {recursive: true, force: true});
    }
  }
});

test('future actions remain hidden and hidden activation is unavailable', async () => {
  const fixture = createFixture(encodeConfig(config()));
  try {
    assert.equal(fixture.shell.state().configSource, 'bundle');
    assert.deepEqual(await fixture.shell.activate('opendesk.marketplace'), {
      status: 'unavailable', actionId: 'opendesk.marketplace', message: '自动化市场暂未开放。',
    });
    assert.deepEqual(await fixture.shell.activate('opendesk.upgrade'), {
      status: 'unavailable', actionId: 'opendesk.upgrade', message: '升级专业版暂未开放。',
    });
    assert.equal(fixture.calls.length, 0);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('HTTPS activation uses platform executable and an argument array', async () => {
  const target = 'https://example.com/help?next=%3Becho%20injected';
  for (const [osName, executable] of [
    ['darwin', '/usr/bin/open'],
    ['windows', 'explorer.exe'],
    ['linux', 'xdg-open'],
  ]) {
    const fixture = createFixture(encodeConfig(config({help: {visible: true, url: target}})));
    const shell = Shell.create({
      file: fileAPI(),
      command: {run: async (...args) => { fixture.calls.push(args); return {exitCode: 0, stdout: '', stderr: ''}; }},
      system: {getPlatformInfo: () => ({os: osName})},
      execution: {workdir: fixture.root},
      packageRoot: fixture.root,
      logger: {warn: message => fixture.warnings.push(message)},
    });
    try {
      assert.deepEqual(await shell.activate('opendesk.help'), {
        status: 'opened', actionId: 'opendesk.help', message: '已打开帮助与支持。',
      });
      assert.equal(fixture.calls.length, 1);
      assert.equal(fixture.calls[0][0], executable);
      assert.deepEqual(fixture.calls[0][1], [target]);
      assert.equal(typeof fixture.calls[0][1], 'object');
      assert.equal(fixture.warnings.length, 0);
    } finally {
      fs.rmSync(fixture.root, {recursive: true, force: true});
    }
  }
});

test('invalid URL config falls back without invoking an external handler', async () => {
  const fixture = createFixture(encodeConfig(config({help: {visible: true, url: 'file:///tmp/fake'}})));
  try {
    assert.equal(fixture.shell.state().configSource, 'fallback');
    assert.match(fixture.shell.state().configError, /only accepts https/);
    assert.deepEqual(await fixture.shell.activate('opendesk.help'), {
      status: 'pending', actionId: 'opendesk.help', message: '帮助中心待开放。',
    });
    assert.equal(fixture.calls.length, 0);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('product Script Runner emits only supported Custom UI HTML elements', () => {
  const html = Runner.buildListHTML([{name: 'example.js'}], {
    configValid: true,
    configError: '',
    loadError: null,
    loading: false,
    running: false,
    rowCapacity: 32,
    selectedNames: new Set(),
    scriptRoot: '/tmp/recipes',
    statusMessage: '',
  });
  const supported = new Set(['html', 'head', 'body', 'meta', 'title', 'style', 'div', 'section', 'main', 'header', 'footer', 'button', 'span', 'p', 'label', 'strong', 'em', 'img', 'input', 'select', 'option']);
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)) {
    assert.equal(supported.has(match[1].toLowerCase()), true, `unsupported Custom UI element <${match[1]}>`);
  }
  assert.match(html, /class="title">Script Runner/);
});

test('product main owns the P0 buttons and keeps future actions out of the UI', () => {
  const main = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'main.js'), 'utf8');
  assert.match(main, /opendesk\.help/);
  assert.match(main, /opendesk\.customize/);
  assert.match(main, /打开 Script Runner/);
  assert.match(main, /退出 OpenDesk/);
  assert.match(main, /OpenDesk 服务/);
  assert.doesNotMatch(main, /opendesk\.marketplace|opendesk\.upgrade/);
});
