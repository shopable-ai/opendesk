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
const runnerFile = path.join(repo, 'apps', 'opendesk', 'flow-runner', 'controller.js');
vm.runInThisContext(fs.readFileSync(shellFile, 'utf8'), {filename: shellFile});
vm.runInThisContext(fs.readFileSync(runnerFile, 'utf8'), {filename: runnerFile});
const Shell = globalThis.OpenDeskOfficialShell;
const Runner = globalThis.OpenDeskFlowRunner;
const asset = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'assets', 'product.odcfg'), 'utf8');
const sourceConfig = JSON.parse(fs.readFileSync(path.join(repo, 'configs', 'product.json'), 'utf8'));
const OBFUSCATION_KEY = 'OpenDeskOfficialShell/v1';
const OPENDESK_HOMEPAGE_URL = sourceConfig.actions.home.url;
const OPENDESK_EXAMPLES_URL = sourceConfig.actions.examples.url;
const OPENDESK_API_DOCS_URL = sourceConfig.actions.apiDocs.url;

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
      home: {visible: true, url: OPENDESK_HOMEPAGE_URL},
      help: {visible: true, url: ''},
      examples: {visible: true, url: OPENDESK_EXAMPLES_URL},
      apiDocs: {visible: true, url: OPENDESK_API_DOCS_URL},
      customize: {visible: true, url: ''},
      marketplace: {visible: false, url: ''},
      upgrade: {visible: false, url: ''},
      ...overrides,
    },
  };
}

function officialActionID(name) {
  return name === 'apiDocs' ? 'opendesk.api-docs' : `opendesk.${name}`;
}

function fileAPI() {
  return {
    join: path.join,
    read: file => fs.readFileSync(file, 'utf8'),
    exists: file => fs.existsSync(file),
  };
}

function createFixture(configText, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opendesk-official-shell-'));
  fs.mkdirSync(path.join(root, 'assets'));
  if (configText !== undefined) fs.writeFileSync(path.join(root, 'assets', 'product.odcfg'), configText);
  if (options.plaintextText !== undefined) {
    fs.writeFileSync(path.join(root, 'assets', 'product.json'), options.plaintextText);
  }
  if (options.legacyConfigText !== undefined) {
    fs.writeFileSync(path.join(root, 'assets', 'official-shell.odcfg'), options.legacyConfigText);
  }
  const calls = [];
  const warnings = [];
  const shell = Shell.create({
    file: fileAPI(),
    command: {run: async (...args) => { calls.push(args); return {exitCode: 0, stdout: '', stderr: ''}; }},
    system: {
      product: {website: options.productWebsite || OPENDESK_HOMEPAGE_URL},
      getPlatformInfo: () => ({os: options.os || 'darwin'}),
    },
    execution: {workdir: root},
    packageRoot: root,
    logger: {warn: message => warnings.push(message)},
  });
  return {root, shell, calls, warnings};
}

test('the bundled Official Shell config matches the maintained plaintext source', () => {
  assert.deepEqual(Shell.parseConfig(asset), sourceConfig);
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
  assert.throws(() => Shell.validateConfig(config({home: {visible: true, url: 'javascript:alert(1)'}})), /only accepts https/);
  assert.throws(() => Shell.validateConfig(config({home: {visible: true, url: ''}})), /requires an https URL/);
  assert.throws(() => Shell.validateConfig(config({home: {visible: false, url: OPENDESK_HOMEPAGE_URL}})), /core action cannot be hidden/);
  assert.throws(() => Shell.validateConfig(config({help: {visible: false, url: ''}})), /core action cannot be hidden/);
  assert.throws(() => Shell.validateConfig(config({customize: {visible: false, url: ''}})), /core action cannot be hidden/);
  assert.throws(() => Shell.validateConfig(config({examples: {visible: false, url: ''}})), /core action cannot be hidden/);
  assert.throws(() => Shell.validateConfig(config({apiDocs: {visible: false, url: ''}})), /core action cannot be hidden/);
  assert.deepEqual(Shell.validateConfig(config()), config());
});

test('validateConfig rejects missing actions, unknown actions and unknown fields', () => {
  const missing = config();
  delete missing.actions.upgrade;
  assert.throws(() => Shell.validateConfig(missing), /missing action: upgrade/);
  assert.throws(() => Shell.validateConfig(config({unknown: {visible: true, url: 'https://example.com'}})), /unknown action: unknown/);
  assert.throws(() => Shell.validateConfig({...config(), unexpected: true}), /unknown field: unexpected/);
  assert.throws(() => Shell.validateConfig(config({help: {visible: true, url: '', extra: true}})), /unknown field: help\.extra/);

  const backwardCompatible = config();
  delete backwardCompatible.actions.examples;
  delete backwardCompatible.actions.apiDocs;
  assert.deepEqual(Shell.validateConfig(backwardCompatible), backwardCompatible);
});

test('fixed product basename prefers protected config and never reads sibling plaintext', () => {
  const protectedConfig = config({help: {visible: true, url: 'https://protected.example/help'}});
  const plaintextConfig = config({help: {visible: true, url: 'https://plaintext.example/help'}});
  const fixture = createFixture(encodeConfig(protectedConfig), {
    plaintextText: JSON.stringify(plaintextConfig),
  });
  try {
    assert.equal(fixture.shell.state().configSource, 'bundle');
    assert.equal(fixture.shell.state().configFormat, 'ODCFG1');
    assert.equal(fixture.shell.getAction('opendesk.help').url, 'https://protected.example/help');
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('corrupt protected config fails closed instead of downgrading to sibling plaintext', () => {
  const plaintextConfig = config({help: {visible: true, url: 'https://plaintext.example/help'}});
  const fixture = createFixture('ODCFG1:ffff\n00\n', {
    plaintextText: JSON.stringify(plaintextConfig),
  });
  try {
    assert.equal(fixture.shell.state().configSource, 'fallback');
    assert.equal(fixture.shell.state().configFormat, 'fallback');
    assert.match(fixture.shell.state().configError, /checksum mismatch/);
    assert.equal(fixture.shell.getAction('opendesk.help').url, '');
    assert.ok(fixture.warnings.length > 0);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('plaintext config is a development fallback only when protected config is absent', () => {
  const fixture = createFixture(undefined, {
    plaintextText: JSON.stringify(config({help: {visible: true, url: 'https://plaintext.example/help'}})),
  });
  try {
    assert.equal(fixture.shell.state().configSource, 'plaintext');
    assert.equal(fixture.shell.state().configFormat, 'json');
    assert.equal(fixture.shell.getAction('opendesk.help').url, 'https://plaintext.example/help');
    assert.equal(fixture.warnings.length, 0);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('legacy official-shell basename is not a second configuration source', () => {
  const fixture = createFixture(undefined, {legacyConfigText: asset});
  try {
    assert.equal(fixture.shell.state().configSource, 'fallback');
    assert.match(fixture.shell.state().configError, /file is missing/);
    assert.equal(fixture.shell.getAction('opendesk.help').url, '');
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
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
      assert.equal(fixture.shell.getAction('opendesk.home').visible, true);
      assert.equal(fixture.shell.getAction('opendesk.home').url, '');
      assert.equal(fixture.shell.getAction('opendesk.help').visible, true);
      assert.equal(fixture.shell.getAction('opendesk.customize').visible, true);
      assert.equal(fixture.shell.getAction('opendesk.examples').visible, true);
      assert.equal(fixture.shell.getAction('opendesk.api-docs').visible, true);
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

test('a bundled homepage that disagrees with System.product.website fails closed', () => {
  const fixture = createFixture(encodeConfig(config()), {
    productWebsite: 'https://github.com/shopable-ai/opendesk#different',
  });
  try {
    assert.equal(fixture.shell.state().configSource, 'fallback');
    assert.match(fixture.shell.state().configError, /does not match System\.product\.website/);
    assert.equal(fixture.shell.getAction('opendesk.home').url, '');
    assert.ok(fixture.warnings.length > 0);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('every visible bundled action opens its configured HTTPS target', async () => {
  const fixture = createFixture(asset);
  try {
    const visible = Object.entries(sourceConfig.actions).filter(([, action]) => action.visible);
    for (const [name, action] of visible) {
      assert.match(action.url, /^https:\/\//);
      const actionId = officialActionID(name);
      const result = await fixture.shell.activate(actionId);
      assert.equal(result.status, 'opened');
      assert.equal(result.actionId, actionId);
    }
    assert.equal(fixture.calls.length, visible.length);
    assert.deepEqual(fixture.calls.map(call => call[0]), visible.map(() => '/usr/bin/open'));
    assert.deepEqual(fixture.calls.map(call => call[1]), visible.map(([, action]) => [action.url]));
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
  }
});

test('unknown action activation rejects without invoking an external handler', async () => {
  const fixture = createFixture(asset);
  try {
    await assert.rejects(() => fixture.shell.activate('opendesk.unknown'), /unknown official action/);
    assert.equal(fixture.calls.length, 0);
  } finally {
    fs.rmSync(fixture.root, {recursive: true, force: true});
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
      system: {
        product: {website: OPENDESK_HOMEPAGE_URL},
        getPlatformInfo: () => ({os: osName}),
      },
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

test('product Flow Runner emits only supported Custom UI HTML elements', () => {
  const html = Runner.buildListHTML([{name: 'example.js'}], {
    configValid: true,
    configError: '',
    loadError: null,
    loading: false,
    running: false,
    rowCapacity: 32,
    selectedEntryKeys: new Set(),
    runnableRoot: '/tmp/recipes',
    statusMessage: '',
  });
  const supported = new Set(['html', 'head', 'body', 'meta', 'title', 'style', 'div', 'section', 'main', 'header', 'footer', 'button', 'span', 'p', 'label', 'strong', 'em', 'img', 'input', 'select', 'option']);
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)) {
    assert.equal(supported.has(match[1].toLowerCase()), true, `unsupported Custom UI element <${match[1]}>`);
  }
  assert.match(html, /class="title">自动化/);
});

test('product runner owns current official actions and keeps future actions out of the UI', () => {
  const main = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'main.js'), 'utf8');
  const productRunner = fs.readFileSync(path.join(repo, 'apps', 'opendesk', 'flow-runner.js'), 'utf8');
  assert.match(main, /OpenDeskProductFlowRunner\.create\(\{officialShell\}\)/);
  assert.match(productRunner, /opendesk\.home/);
  assert.match(productRunner, /opendesk\.help/);
  assert.match(productRunner, /opendesk\.customize/);
  assert.doesNotMatch(productRunner, /opendesk\.marketplace|opendesk\.upgrade/);
});
