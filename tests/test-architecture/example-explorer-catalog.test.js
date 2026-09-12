'use strict';

// Host-side structure tests only. These do not run OpenDesk or desktop examples.
// From the repository root:
// node --test tests/test-architecture/example-explorer-catalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'apps/example-explorer/catalog.js'), 'utf8');
const launchSource = fs.readFileSync(path.join(root, 'apps/example-explorer/launch.js'), 'utf8');

function loadCatalogApi() {
  const context = {};
  vm.runInNewContext(source, context, {filename: 'apps/example-explorer/catalog.js'});
  return context.OpenDeskExampleCatalog;
}

function loadLaunchApi() {
  const context = {};
  vm.runInNewContext(launchSource, context, {filename: 'apps/example-explorer/launch.js'});
  return context.OpenDeskExampleLaunchSpec;
}

function metadata(overrides = {}) {
  return {
    title: 'Example',
    description: 'A catalog fixture.',
    category: 'Runtime',
    level: 'beginner',
    runPolicy: 'safe',
    legacyNames: [],
    docs: '',
    platforms: ['darwin', 'linux', 'windows'],
    prerequisites: [],
    requiredEnv: [],
    expected: 'The fixture completes.',
    tags: [],
    launch: {kind: 'script', ui: false, consoleMode: 'script'},
    ...overrides,
  };
}

function fileApi() {
  return {
    join: path.join,
    read(file) {
      return fs.readFileSync(file, 'utf8');
    },
    listDir(dir) {
      return fs.readdirSync(dir);
    },
    stat(file) {
      try {
        const value = fs.statSync(file);
        return {
          type: value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other',
          size: value.isFile() ? value.size : null,
          modifiedAt: value.mtime.toISOString(),
        };
      } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}

const outputRoot = path.join(root, '.runtime/tests/test-architecture/example-explorer-catalog');
fs.mkdirSync(outputRoot, {recursive: true});

function fixture(t, catalog) {
  const directory = fs.mkdtempSync(path.join(outputRoot, 'case-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const examplesRoot = path.join(directory, 'examples');
  fs.mkdirSync(path.join(examplesRoot, 'runtime'), {recursive: true});
  fs.writeFileSync(path.join(examplesRoot, 'runtime/example.js'), "console.log('example');\n");
  fs.writeFileSync(path.join(examplesRoot, 'legacy.js'), "console.log('legacy');\n");
  fs.writeFileSync(path.join(examplesRoot, 'internal.js'), "console.log('internal');\n");
  fs.writeFileSync(path.join(examplesRoot, 'catalog.json'), JSON.stringify(catalog, null, 2));
  return {
    examplesRoot,
    catalogPath: path.join(examplesRoot, 'catalog.json'),
  };
}

test('committed catalog resolves canonical entries and hides legacy names from unregistered results', () => {
  const api = loadCatalogApi();
  const examplesRoot = path.join(root, 'examples');
  const result = api.scan({
    file: fileApi(),
    examplesRoot,
    catalogPath: path.join(examplesRoot, 'catalog.json'),
  });

  assert.deepEqual(Array.from(result.missing), []);
  assert.ok(result.entries.length >= 40, 'expected curated catalog to contain the organized examples');
  assert.ok(result.entries.every(entry => entry.relativePath.includes('/')), 'canonical examples must live under a domain directory');
  assert.ok(result.entries.some(entry => entry.relativePath === 'runtime/console.js' && entry.runnable));
  assert.ok(result.entries.some(entry => entry.relativePath === 'app/lifecycle-calculator.js' && !entry.runnable));
  assert.ok(result.entries.every(entry => ['script', 'ai-run'].includes(entry.launch.kind)));
  assert.ok(result.entries.every(entry => entry.platforms.length > 0 && ['safe', 'manual'].includes(entry.runPolicy)));
  assert.equal(result.entries.some(entry => entry.relativePath.endsWith('.test.js')), false);
  assert.equal(result.entries.some(entry => /smoke/i.test(entry.relativePath)), false);
  assert.equal(result.entries.some(entry => /(^|\/)support\//.test(entry.relativePath)), false);
  assert.equal(result.entries.some(entry => /(^|\/)tools\//.test(entry.relativePath)), false);
  assert.equal(result.entries.find(entry => entry.relativePath === 'app/open-calculator-by-name.js').launch.kind, 'ai-run');
  assert.equal(result.entries.find(entry => entry.relativePath === 'custom-ui/panel.js').launch.ui, true);

  const visible = new Set(result.entries.map(entry => entry.relativePath));
  assert.equal(visible.has('console.js'), false);
  assert.equal(visible.has('open-calculator-by-name.js'), false);

  const unregistered = new Set(result.unregistered.map(entry => entry.relativePath));
  assert.equal(unregistered.has('console.js'), false, 'legacy name must not be reported as an internal script');
  assert.equal(unregistered.has('open-calculator-by-name.js'), false, 'application legacy name must stay hidden');
});

test('recursive scan and launch contract preserve nested multi-file main.js examples', () => {
  const api = loadCatalogApi();
  const examplesRoot = path.join(root, 'examples');
  const file = fileApi();
  const result = api.scan({
    file,
    examplesRoot,
    catalogPath: path.join(examplesRoot, 'catalog.json'),
    currentPlatform: 'darwin',
  });
  const launch = loadLaunchApi();

  for (const item of [
    {relativePath: 'custom-ui/icon-browser/main.js', companion: 'custom-ui/icon-browser/panel.html'},
    {relativePath: 'custom-ui/toolbar-wrap/main.js', companion: 'custom-ui/toolbar-wrap/config.json'},
  ]) {
    const entry = result.entries.find(candidate => candidate.relativePath === item.relativePath);
    assert.ok(entry, `${item.relativePath} should be found recursively`);
    assert.equal(entry.absolutePath, path.join(examplesRoot, item.relativePath));
    assert.match(String(file.read(entry.absolutePath)), /ui\.createWindow|new FloatingWindow/);
    assert.equal(fs.existsSync(path.join(examplesRoot, item.companion)), true, `${item.relativePath} companion asset`);

    const spec = launch.create(entry, {platform: 'darwin', workdir: root, pathApi: path});
    assert.deepEqual(Array.from(spec.buildArgs()), ['-ui', '-script', entry.absolutePath, '-console-mode', 'script']);
    assert.match(spec.buildDisplayCommand(), new RegExp(`^\\./dist/opendesk -ui -script examples/${item.relativePath.replaceAll('/', '\\/')} -console-mode script$`));
  }

  const signature = api.signature(file, examplesRoot);
  assert.match(signature, /custom-ui\/icon-browser\/main\.js\|/);
  assert.match(signature, /custom-ui\/toolbar-wrap\/main\.js\|/);
});

test('catalog and public example docs use only canonical paths', () => {
  const examplesRoot = path.join(root, 'examples');
  const catalog = JSON.parse(fs.readFileSync(path.join(examplesRoot, 'catalog.json'), 'utf8'));
  const paths = Object.keys(catalog.entries);
  for (const [relativePath, entry] of Object.entries(catalog.entries)) {
    if (entry.docs) assert.equal(fs.existsSync(path.join(root, entry.docs)), true, `${relativePath} docs`);
  }
  assert.equal(paths.some(relativePath => /(^|\/)(support|fixtures|tools)\//.test(relativePath)), false);
  assert.equal(paths.some(relativePath => /\.test\.js$|smoke/i.test(relativePath)), false);
  assert.equal(fs.existsSync(path.join(examplesRoot, 'runtime/page-wait.test.js')), false);

  const publicDocs = [
    'docs/api/examples/README.md',
    'docs/api/examples/single-tests.md',
    'examples/README.md',
    'examples/audio/README.md',
    'examples/custom-ui/README.md',
  ].map(relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')).join('\n');
  for (const retired of [
    'examples/runtime/page-wait.test.js',
    'examples/custom-ui/icon-list.js',
    'examples/custom-ui/floating-toolbar-wrap-demo.js',
    'examples/human-to-recipe/record.js',
    'examples/audio/control-smoke.js',
  ]) assert.equal(publicDocs.includes(retired), false, retired);
});

test('catalog accepts a canonical entry and excludes its legacy name', t => {
  const f = fixture(t, {
    schemaVersion: 2,
    entries: {
      'runtime/example.js': metadata({legacyNames: ['legacy.js']}),
    },
  });
  const result = loadCatalogApi().scan({file: fileApi(), ...f});
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].relativePath, 'runtime/example.js');
  assert.equal(result.entries[0].runnable, true);
  assert.deepEqual(Array.from(result.missing), []);
  assert.deepEqual(Array.from(result.unregistered, entry => entry.relativePath), ['internal.js']);
});

test('catalog rejects unsafe schema ambiguity', t => {
  const cases = [
    {
      name: 'unsupported run policy',
      catalog: {schemaVersion: 2, entries: {'runtime/example.js': metadata({runPolicy: 'auto'})}},
      expected: /runPolicy must be "safe" or "manual"/,
    },
    {
      name: 'parent traversal',
      catalog: {schemaVersion: 2, entries: {'../outside.js': metadata({runPolicy: 'manual'})}},
      expected: /invalid path segment/,
    },
    {
      name: 'legacy name conflicts with canonical path',
      catalog: {
        schemaVersion: 2,
        entries: {
          'runtime/example.js': metadata({runPolicy: 'manual', legacyNames: ['runtime/other.js']}),
          'runtime/other.js': metadata({runPolicy: 'manual'}),
        },
      },
      expected: /conflicts with a canonical path/,
    },
    {
      name: 'duplicate legacy name ownership',
      catalog: {
        schemaVersion: 2,
        entries: {
          'runtime/example.js': metadata({runPolicy: 'manual', legacyNames: ['legacy.js']}),
          'runtime/other.js': metadata({runPolicy: 'manual', legacyNames: ['legacy.js']}),
        },
      },
      expected: /owned by both/,
    },
  ];

  for (const item of cases) {
    const f = fixture(t, item.catalog);
    assert.throws(() => loadCatalogApi().scan({file: fileApi(), ...f}), item.expected, item.name);
  }
});

test('launch metadata builds the same script argv and display command semantics', () => {
  const launch = loadLaunchApi();
  const entry = {
    ...metadata({
      platforms: ['darwin'],
      launch: {kind: 'script', ui: true, consoleMode: 'script'},
    }),
    relativePath: 'custom-ui/panel.js',
    absolutePath: path.join(root, 'examples/custom-ui/panel.js'),
  };
  const spec = launch.create(entry, {
    platform: 'darwin',
    workdir: root,
    pathApi: path,
  });
  assert.equal(spec.availability, 'direct');
  assert.equal(spec.availabilityLabel, 'Direct run available');
  assert.deepEqual(Array.from(spec.buildArgs()), ['-ui', '-script', entry.absolutePath, '-console-mode', 'script']);
  assert.match(spec.buildDisplayCommand(), /^\.\/dist\/opendesk -ui -script examples\/custom-ui\/panel\.js -console-mode script$/);

  const aiEntry = {
    ...entry,
    relativePath: 'ai-cli/macos-calculator-recipe.js',
    absolutePath: path.join(root, 'examples/ai-cli/macos-calculator-recipe.js'),
    platforms: ['darwin'],
    launch: {kind: 'ai-run', ui: false, input: 'required'},
  };
  const aiSpec = launch.create(aiEntry, {platform: 'darwin', workdir: root, pathApi: path});
  assert.throws(() => aiSpec.buildArgs(), /requires an input file/);
  assert.deepEqual(Array.from(aiSpec.buildArgs({inputFile: '/tmp/input.json'})), ['ai', 'run', aiEntry.absolutePath, '--input-file', '/tmp/input.json']);
  assert.match(aiSpec.buildDisplayCommand(), /ai run examples\/ai-cli\/macos-calculator-recipe\.js --input-file <path-to-input\.json>$/);
});

test('platform policy disables one-click execution without hiding the copy command', () => {
  const api = loadCatalogApi();
  const examplesRoot = path.join(root, 'examples');
  const result = api.scan({
    file: fileApi(),
    examplesRoot,
    catalogPath: path.join(examplesRoot, 'catalog.json'),
    currentPlatform: 'windows',
  });
  const macOnly = result.entries.find(entry => entry.relativePath === 'app/open-calculator-by-name.js');
  assert.equal(macOnly.platformSupported, false);
  assert.equal(macOnly.runnable, false);
  const spec = loadLaunchApi().create(macOnly, {platform: 'windows', workdir: root, pathApi: path});
  assert.equal(spec.availability, 'unsupported');
  assert.equal(spec.availabilityLabel, 'Unsupported on this platform');
  const command = spec.buildDisplayCommand();
  assert.match(command, /^\.\\dist\\opendesk\.exe ai run examples\\app\\open-calculator-by-name\.js$/);
});

test('runner consumes LaunchSpec args and rejects unsupported platforms before spawning', async () => {
  const launch = loadLaunchApi();
  const runnerSource = fs.readFileSync(path.join(root, 'apps/example-explorer/runner.js'), 'utf8');
  const context = {globalThis: {}, OpenDeskExampleLaunchSpec: launch};
  vm.runInNewContext(runnerSource, context, {filename: 'apps/example-explorer/runner.js'});
  const calls = [];
  const runner = context.globalThis.OpenDeskExampleRunner.createRunner({
    command: {run: async (...args) => { calls.push(args); return {exitCode: 0, stdout: 'ok', stderr: ''}; }},
    execution: {workdir: root},
    system: {getExecutablePath: () => '/repo/dist/opendesk', getPlatformInfo: () => ({os: 'darwin'})},
    AbortController,
    launchApi: launch,
    path,
    logger: {log() {}, error() {}},
  });
  const safeEntry = {
    ...metadata({platforms: ['darwin'], launch: {kind: 'script', ui: true, consoleMode: 'script'}}),
    relativePath: 'custom-ui/panel.js',
    absolutePath: path.join(root, 'examples/custom-ui/panel.js'),
  };
  await runner.run(safeEntry);
  assert.deepEqual(Array.from(calls[0][1]), Array.from(launch.create(safeEntry, {platform: 'darwin', workdir: root, pathApi: path}).buildArgs()));

  const unsupported = {...safeEntry, platforms: ['windows']};
  await assert.rejects(() => runner.run(unsupported), error => error.code === 'EXAMPLE_UNSUPPORTED_PLATFORM');
  assert.equal(calls.length, 1);
});

test('runner Stop aborts the LaunchSpec process and releases active state', async () => {
  const launch = loadLaunchApi();
  const runnerSource = fs.readFileSync(path.join(root, 'apps/example-explorer/runner.js'), 'utf8');
  const context = {globalThis: {}, OpenDeskExampleLaunchSpec: launch};
  vm.runInNewContext(runnerSource, context, {filename: 'apps/example-explorer/runner.js'});
  let aborted = false;
  const runner = context.globalThis.OpenDeskExampleRunner.createRunner({
    command: {run: async (_binary, _args, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        const error = new Error('canceled');
        error.code = 'CANCELED';
        reject(error);
      });
    })},
    execution: {workdir: root},
    system: {getExecutablePath: () => '/repo/dist/opendesk', getPlatformInfo: () => ({os: 'darwin'})},
    AbortController,
    launchApi: launch,
    logger: {log() {}, error() {}},
  });
  const entry = {
    ...metadata(),
    relativePath: 'runtime/example.js',
    absolutePath: path.join(root, 'examples/runtime/console.js'),
  };
  const pending = runner.run(entry);
  assert.equal(runner.stop(), true);
  const outcome = await pending;
  assert.equal(aborted, true);
  assert.equal(outcome.status, 'canceled');
  assert.equal(runner.isRunning(), false);
  assert.equal(runner.stop(), false);
});
