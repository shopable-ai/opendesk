// Host-side orchestration checks only. No OpenDesk API or desktop behavior is mocked as passing.
// Run from the repository root: node --test tests/test-architecture/runtime-api-modules.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const gates = 'tests/runtime-api/gates/';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
function factory(file, globals = {}) {
  return vm.runInNewContext(read(file), globals, { filename: file, timeout: 1000 });
}
const registry = factory(gates + 'registry.js')();
const selector = factory('tests/runtime-api/support/unit-selection.js')();
const unitFixture = ['tests/runtime-api/unit/file.test.js', 'tests/runtime-api/unit/path.test.js', 'tests/runtime-api/geometry.js'];
const originalModes = {
  contract: 'contract', unit: 'unit', smoke: 'smokeSuite', live: 'liveSuite',
  'live-only': 'liveOnly', coverage: 'coverage', negative: 'negative',
  'sound-cancel': 'soundCancel', 'notify-icon-live': 'notifyIconLive',
  'custom-ui': 'customUI', 'custom-ui-config': 'customUIConfig', dialog: 'dialog',
  command: 'commandGate', environment: 'environment', 'file-json': 'fileJSON',
  path: 'pathContext', language: 'language', sqlite: 'sqlite',
};

test('all 18 existing modes retain their route; focused selection is additive', () => {
  assert.deepEqual(plain(registry.modes), { ...originalModes, 'unit-selected': 'unitSelected' });
});

test('all declared modules are inert factories with exact exports and no global registration', () => {
  for (const definition of Object.values(registry.modules)) {
    const globals = {};
    const suite = factory(gates + definition.file, globals)({});
    assert.deepEqual(Object.keys(suite).sort(), [...definition.exports].sort());
    assert(Object.isFrozen(suite));
    assert.deepEqual(Object.keys(globals), []);
    for (const name of definition.exports) assert.equal(typeof suite[name], 'function');
  }
});

test('dispatcher stays small and suite files do not introduce a Node runner', () => {
  assert(read(gates + 'catalog-runner.js').split('\n').length <= 100);
  for (const definition of Object.values(registry.modules)) {
    const text = read(gates + definition.file);
    assert(text.split('\n').length <= 180, definition.file);
    assert(!/\brequire\s*\(|\bprocess\.env|^import\s/m.test(text), definition.file);
  }
});

async function dispatch(mode, options = {}) {
  const trace = [];
  const reads = [];
  const env = { OPENDESK_RUNTIME_API_MODE: mode };
  if (Object.prototype.hasOwnProperty.call(options, 'filter')) env.OPENDESK_RUNTIME_API_UNIT_FILTER = options.filter;
  const sandbox = {
    trace, Execution: { workdir: '/repo', env }, console: { log() {}, error() {} },
    File: {
      join: path.posix.join,
      isFile(file) { return !file.endsWith(options.missing || '<none>'); },
      read(file) {
        const relative = path.posix.relative('/repo', file);
        reads.push(relative);
        if (relative === gates + 'runtime-context.js') {
          return '(function(){return {RUN_DIR:"/evidence",initialize:async()=>{trace.push("initialize");}};})';
        }
        const definition = Object.values(registry.modules).find((item) => gates + item.file === relative);
        if (definition) {
          if (options.badExport) return '(function(){return {};})';
          if (options.empty) return ' ';
          if (options.notFactory) return '({})';
          return '(function(){return {' + definition.exports.map((name) =>
            JSON.stringify(name) + ':async()=>{trace.push(' + JSON.stringify(name) + ');' +
            (options.fail ? 'throw new Error("suite-failure");' : '') + '}'
          ).join(',') + '};})';
        }
        return read(relative);
      },
    },
  };
  let error = null;
  try {
    await vm.runInNewContext('(async()=>{\n' + read(gates + 'catalog-runner.js') + '\n})()', sandbox, { timeout: 1000 });
  } catch (caught) { error = caught; }
  return { trace, reads, error };
}

for (const [mode, entry] of Object.entries({ ...originalModes, 'unit-selected': 'unitSelected' })) {
  test(`dispatcher routes ${mode} exactly once and loads only its suite`, async () => {
    const result = await dispatch(mode, mode === 'unit-selected' ? { filter: 'file' } : {});
    assert.equal(result.error, null);
    assert.deepEqual(result.trace, ['initialize', entry]);
    const suiteReads = result.reads.filter((file) => file.startsWith(gates + 'suites/'));
    assert.deepEqual(suiteReads, [gates + registry.modules[registry.owners[entry]].file]);
  });
}

for (const mode of ['typo', '__proto__', 'constructor', 'toString']) {
  test(`reject unknown/prototype mode ${mode} before initialization`, async () => {
    const result = await dispatch(mode);
    assert.match(result.error.message, /unknown Runtime API mode/);
    assert.deepEqual(result.trace, []);
  });
}

test('selection filter cannot silently narrow an ordinary smoke or live gate', async () => {
  for (const mode of ['unit', 'smoke', 'live', 'sqlite']) {
    const result = await dispatch(mode, { filter: 'file' });
    assert.match(result.error.message, /requires mode=unit-selected/);
    assert.deepEqual(result.trace, []);
  }
});

test('selected mode rejects absent/unsafe filters before initialization', async () => {
  for (const filter of [undefined, '', ' ', 'file,', '../file', '*']) {
    const result = await dispatch('unit-selected', { filter });
    assert(result.error);
    assert.deepEqual(result.trace, []);
  }
});

test('missing suite fails before initialization', async () => {
  const result = await dispatch('contract', { missing: 'suites/core.js' });
  assert.match(result.error.message, /suite is missing/);
  assert.deepEqual(result.trace, []);
});

test('empty module, non-factory, missing export and suite rejection fail closed', async () => {
  for (const options of [{ empty: true }, { notFactory: true }, { badExport: true }, { fail: true }]) {
    const result = await dispatch('contract', options);
    assert(result.error);
  }
});

function suite(name, context, globals = {}) {
  return factory(gates + 'suites/' + name + '.js', { File: { join: path.posix.join }, ...globals })(context);
}

test('smoke composition retains its existing order', async () => {
  const calls = [];
  await suite('catalog', { invoke: async (entry) => calls.push(entry) }).smokeSuite();
  assert.deepEqual(calls, ['contract', 'language', 'unit', 'smokeCase', 'asyncStacks', 'failureExit', 'negative']);
});

test('live composition runs quality only after coverage and cleanup succeed', async () => {
  const calls = [];
  const context = { invoke: async (entry, ...args) => calls.push([entry, ...args]), noResidual: async () => calls.push(['noResidual']) };
  await suite('catalog', context).liveSuite();
  assert.deepEqual(calls, [
    ['contract'], ['language'], ['unit'], ['smokeCase'], ['failureExit'], ['negative'],
    ['asyncStacks'], ['runLiveSeam', 'live', 780], ['customUI'], ['customUIConfig'], ['coverage'],
    ['cleanup'], ['noResidual'], ['quality'],
  ]);
});

test('live failure still attempts cleanup and does not claim quality', async () => {
  const calls = [];
  const first = new Error('unit failed');
  const context = {
    invoke: async (entry) => { calls.push(entry); if (entry === 'unit') throw first; },
    noResidual: async () => calls.push('noResidual'),
  };
  await assert.rejects(suite('catalog', context).liveSuite(), (error) => error === first);
  assert.deepEqual(calls, ['contract', 'language', 'unit', 'cleanup', 'noResidual']);
});

test('SQLite preserves scoped phases and cleanup on failure; first error wins', async () => {
  const calls = [];
  const first = new Error('SQLite unit failed');
  const context = {
    ROOT_DIR: '/repo',
    runJS: async (gate, file, timeout, deadline) => { calls.push([gate, file, timeout, deadline]); if (gate === 'unit') throw first; },
    verifyZeroCleanup: async (gate) => calls.push(['zero', gate]),
    invoke: async (name) => { calls.push([name]); throw new Error('cleanup also failed'); },
    noResidual: async () => calls.push(['noResidual']),
  };
  await assert.rejects(suite('sqlite', context).sqlite(), (error) => error === first);
  assert.deepEqual(calls, [
    ['contract', '/repo/tests/runtime-api/sqlite-contract.js', 5, 180], ['zero', 'contract'],
    ['unit', '/repo/tests/runtime-api/sqlite-unit.js', 15, 240], ['cleanup'],
  ]);
});

test('full unit still prepares its extension and uses the unchanged unit entry', async () => {
  const calls = [];
  await suite('core', {
    ROOT_DIR: '/repo', invoke: async (name) => calls.push(name),
    runJS: async (...args) => calls.push(args), verifyZeroCleanup: async (name) => calls.push('zero:' + name),
  }).unit();
  assert.deepEqual(calls, ['prepareNativeExtension', ['unit', '/repo/tests/runtime-api/unit.js', 5, 180], 'zero:unit']);
});

test('selection uses manifest order, deduplicates IDs and accepts mixed case', () => {
  const result = selector.select(unitFixture, 'Path,FILE,file');
  assert.deepEqual(plain(result.files), unitFixture.slice(0, 2));
  assert.deepEqual(plain(result.ids), ['file', 'path']);
  assert.equal(result.fullCatalog, false);
  assert.equal(result.scope, 'selected-unit-files');
  assert(Object.isFrozen(result.files));
});

test('selection also supports registered root-level units such as geometry', () => {
  assert.deepEqual(plain(selector.select(unitFixture, 'geometry').files), [unitFixture[2]]);
});

test('selection rejects unknown IDs, malformed/duplicate manifests and arbitrary paths', () => {
  for (const value of ['missing', 'all', 'unit/file.test.js', 'file,,path', 'file,*', '__proto__']) {
    assert.throws(() => selector.select(unitFixture, value));
  }
  for (const files of [[], ['elsewhere/file.test.js'], [unitFixture[0], unitFixture[0]], [null], ['tests/runtime-api/unit/file.test.js', 'tests/runtime-api/file.js']]) {
    assert.throws(() => selector.select(files, 'file'));
  }
});

async function focused(options = {}) {
  const records = [];
  const loaded = [];
  const files = options.files || unitFixture;
  const runtime = {
    tests: [], assert: (value, message) => assert(value, message),
    writeGate: (name, payload) => records.push([name, plain(payload)]),
    load(file) {
      loaded.push(file);
      if (file.includes('manifest.js')) return;
      if (options.missing) throw new Error('missing test file');
      if (!options.empty) runtime.tests.push({ name: file });
    },
    async run(label) {
      if (options.failure) throw new Error('assertion failed');
      return { label, status: 'passed', passed: runtime.tests.length, failed: 0 };
    },
  };
  const sandbox = {
    RuntimeAPITest: runtime, RuntimeAPITestFiles: { unit: files },
    Execution: { id: 'host-fixture', env: { OPENDESK_RUNTIME_API_UNIT_FILTER: options.filter === undefined ? 'file' : options.filter } },
    File: { cwd: () => '/repo', join: path.posix.join, read(file) {
      return file.endsWith('/framework.js') ? '' : read(path.posix.relative('/repo', file));
    } },
  };
  let error = null;
  try {
    await vm.runInNewContext('(async()=>{\n' + read('tests/runtime-api/unit-selected.js') + '\n})()', sandbox, { timeout: 1000 });
  } catch (caught) { error = caught; }
  return { records, loaded, error };
}

test('focused entry loads only chosen files and never writes unit/coverage success', async () => {
  const result = await focused();
  assert.equal(result.error, null);
  assert.deepEqual(result.loaded, ['tests/runtime-api/manifest.js', unitFixture[0]]);
  assert(result.records.some(([name]) => name === 'runtime-api-unit-selected'));
  assert(result.records.every(([name, payload]) => !['unit', 'coverage', 'quality'].includes(name) && payload.fullCatalog === false));
});

test('focused entry fails on unknown, empty, missing and failing test files', async () => {
  for (const options of [{ filter: 'missing' }, { empty: true }, { missing: true }, { failure: true }]) {
    const result = await focused(options);
    assert(result.error);
    const last = result.records.at(-1);
    assert.equal(last[0], 'unit-selection');
    assert.equal(last[1].status, 'failed');
    assert.equal(last[1].fullCatalog, false);
  }
});

test('focused gate prepares native extensions only for their own selected unit', async () => {
  for (const [filter, needsExtension] of [['file,path', false], ['native-extension', true]]) {
    const calls = [];
    const context = {
      ROOT_DIR: '/repo', invoke: async (name) => calls.push(name),
      runJS: async (...args) => calls.push(args), verifyZeroCleanup: async (name) => calls.push('zero:' + name),
      noResidual: async () => calls.push('residual'),
    };
    await suite('unit-selected', context, {
      Execution: { env: { OPENDESK_RUNTIME_API_UNIT_FILTER: filter } },
      File: { join: path.posix.join, read: (file) => read(path.posix.relative('/repo', file)) },
    }).unitSelected();
    assert.equal(calls.includes('prepareNativeExtension'), needsExtension);
    const run = calls.find(Array.isArray);
    assert.deepEqual(plain(run), ['unit-selected', '/repo/tests/runtime-api/unit-selected.js', 15, 240, { env: { OPENDESK_RUNTIME_API_UNIT_FILTER: filter } }]);
    assert(calls.includes('zero:unit-selected'));
    assert(calls.includes('residual'));
  }
});

test('shared command plumbing preserves native failures and timeout status', async () => {
  for (const [error, exitCode] of [[{ code: 'TIMEOUT', stdout: 'partial' }, 124], [{ code: 'START_FAILED' }, null], [{ exitCode: 7, stderr: 'bad' }, 7]]) {
    const context = factory(gates + 'runtime-context.js', {
      Execution: { workdir: '/repo', env: {} }, File: { join: path.posix.join },
      Command: { run: async () => { throw error; } },
    })({ mode: 'unit' });
    const result = await context.runCommand('fixture');
    assert.equal(result.exitCode, exitCode);
    assert.equal(result.error, error);
    await assert.rejects(context.requireCommand('fixture'));
  }
});

test('direct full unit rejects a focused filter before loading any tests', async () => {
  const sandbox = { Execution: { env: { OPENDESK_RUNTIME_API_UNIT_FILTER: 'file' } } };
  await assert.rejects(vm.runInNewContext('(async()=>{\n' + read('tests/runtime-api/unit.js') + '\n})()', sandbox, { timeout: 1000 }), /unit-selected/);
});

test('reused run ID preserves evidence and fails before build or deletion', async () => {
  const writes = [];
  const context = factory(gates + 'runtime-context.js', {
    Execution: { workdir: '/repo', id: 'new-execution', env: { OPENDESK_RUNTIME_API_RUN_ID: 'existing-run' } },
    File: { join: path.posix.join, isFile: () => true, exists: () => true,
      removeDir: () => writes.push('delete'), ensureDir: () => writes.push('mkdir') },
    Command: { run: async () => writes.push('build') },
  })({ mode: 'unit' });
  await assert.rejects(context.initialize(), /evidence preserved/);
  assert.equal(context.RUN_DIR, '/repo/.runtime/tests/runtime-api/existing-run');
  assert.deepEqual(writes, []);
});
