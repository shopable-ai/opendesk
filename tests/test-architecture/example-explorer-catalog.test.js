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

function loadCatalogApi() {
  const context = {};
  vm.runInNewContext(source, context, {filename: 'apps/example-explorer/catalog.js'});
  return context.OpenDeskExampleCatalog;
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

test('committed catalog resolves canonical entries and hides aliases from unregistered results', () => {
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

  const visible = new Set(result.entries.map(entry => entry.relativePath));
  assert.equal(visible.has('console.js'), false);
  assert.equal(visible.has('open-calculator-by-name.js'), false);

  const unregistered = new Set(result.unregistered.map(entry => entry.relativePath));
  assert.equal(unregistered.has('console.js'), false, 'compatibility alias must not be reported as an internal script');
  assert.equal(unregistered.has('open-calculator-by-name.js'), false, 'application compatibility alias must stay hidden');
});

test('catalog accepts a canonical entry and excludes its compatibility alias', t => {
  const f = fixture(t, {
    schemaVersion: 1,
    entries: {
      'runtime/example.js': {
        title: 'Example',
        category: 'Runtime',
        runPolicy: 'safe',
        aliases: ['legacy.js'],
      },
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
      catalog: {schemaVersion: 1, entries: {'runtime/example.js': {runPolicy: 'auto'}}},
      expected: /runPolicy must be "safe" or "manual"/,
    },
    {
      name: 'parent traversal',
      catalog: {schemaVersion: 1, entries: {'../outside.js': {runPolicy: 'manual'}}},
      expected: /invalid path segment/,
    },
    {
      name: 'alias conflicts with canonical path',
      catalog: {
        schemaVersion: 1,
        entries: {
          'runtime/example.js': {runPolicy: 'manual', aliases: ['runtime/other.js']},
          'runtime/other.js': {runPolicy: 'manual'},
        },
      },
      expected: /conflicts with a canonical path/,
    },
    {
      name: 'duplicate alias ownership',
      catalog: {
        schemaVersion: 1,
        entries: {
          'runtime/example.js': {runPolicy: 'manual', aliases: ['legacy.js']},
          'runtime/other.js': {runPolicy: 'manual', aliases: ['legacy.js']},
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
