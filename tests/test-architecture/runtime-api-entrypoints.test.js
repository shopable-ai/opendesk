// Host-side control-flow and document guards. No Runtime API or platform pass is inferred.
// Run: node --test tests/test-architecture/runtime-api-entrypoints.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { directory, guide, entriesFor, entrySource, documentationTable, inspectEntries, auditRuntimeSingleEntries } = require('../../scripts/lib/runtime-api-entrypoints');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const fixedEntries = fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.js')).sort();
const files = ['tests/runtime-api/unit/file.test.js', 'tests/runtime-api/unit/path.test.js', 'tests/runtime-api/geometry.js'];

async function runEntry(file, options = {}) {
  const selectedID = path.posix.basename(file, '.js');
  const expected = ['geometry', 'geometry-layout', 'ui'].includes(selectedID)
    ? `tests/runtime-api/${selectedID}.js` : `tests/runtime-api/unit/${selectedID}.test.js`;
  const manifestFiles = options.files || [...new Set([...files, expected])];
  const records = [], loaded = [], reads = [];
  const env = Object.freeze(options.env || {});
  const execution = Object.freeze({ id: 'host-single-fixture', workdir: '/repo', env, scriptPath: '/repo/' + file });
  const runtime = {
    tests: [], assert: (ok, msg) => assert(ok, msg),
    writeGate: (name, value) => records.push([name, plain(value)]),
    load(source) {
      loaded.push(source);
      if (source.endsWith('/manifest.js')) return;
      if (options.missing) throw new Error('missing selected assertion file');
      if (!options.empty) runtime.tests.push({ name: source });
    },
    async run(label) {
      await Promise.resolve();
      if (options.failure) throw new Error('selected assertion failed');
      return { label, status: 'passed', passed: runtime.tests.length, failed: 0 };
    },
  };
  const sandbox = { Execution: execution, RuntimeAPITest: runtime, RuntimeAPITestFiles: { unit: manifestFiles }, File: {
    join: path.posix.join, cwd: () => '/repo',
    read(absolute) {
      const relative = path.posix.relative('/repo', absolute); reads.push(relative);
      if (relative.endsWith('/framework.js')) return '';
      if (relative.endsWith('/run-selected.js') && options.badFactory) return '({})';
      return read(relative);
    },
  } };
  let error = null;
  try { await vm.runInNewContext('(async()=>{\n' + read(file) + '\n})()', sandbox, { timeout: 1000 }); }
  catch (caught) { error = caught; }
  return { expected, records, loaded, reads, error, execution, sandbox };
}

test('at least one fixed entry is registered as a real source file', () => assert(fixedEntries.length > 0));
for (const name of fixedEntries) {
  test(`single ${name} delegates exactly once, preserves Execution and never claims full coverage`, async () => {
    const file = directory + '/' + name;
    assert.equal(read(file), entrySource(name.slice(0, -3)));
    const result = await runEntry(file);
    assert.equal(result.error, null);
    assert.deepEqual(result.loaded, ['tests/runtime-api/manifest.js', result.expected]);
    assert.equal(result.sandbox.Execution, result.execution);
    assert.deepEqual(result.execution.env, {});
    assert(result.records.some(([name]) => name === 'runtime-api-unit-selected'));
    assert(result.records.every(([name, value]) => !['unit', 'coverage', 'quality'].includes(name) && value.fullCatalog === false));
    const selection = result.records.at(-1)[1].selection;
    assert.deepEqual(selection.files, [result.expected]);
    assert.deepEqual(selection.ids, [name.slice(0, -3)]);
  });
}

test('fixed entry rejects even an empty or identical residual filter before loading tests', async () => {
  for (const filter of ['', 'file', 'path', 'file,path']) {
    const result = await runEntry(directory + '/file.js', { env: { OPENDESK_RUNTIME_API_UNIT_FILTER: filter } });
    assert.match(result.error.message, /fixed scope/);
    assert.deepEqual(result.loaded, []);
    assert.deepEqual(result.records, []);
  }
});

test('fixed entry propagates missing, empty and failing test cases as scoped failures', async () => {
  for (const option of [{ missing: true }, { empty: true }, { failure: true }, { files: ['tests/runtime-api/unit/path.test.js'] }]) {
    const result = await runEntry(directory + '/file.js', option);
    assert(result.error);
    assert.equal(result.records.at(-1)[0], 'unit-selection');
    assert.equal(result.records.at(-1)[1].status, 'failed');
    assert.equal(result.records.at(-1)[1].fullCatalog, false);
  }
});

test('broken shared factory fails, rather than silently omitting selected tests', async () => {
  const result = await runEntry(directory + '/file.js', { badFactory: true });
  assert.match(result.error.message, /must be a function/);
  assert.deepEqual(result.loaded, []);
});

test('entry mapping rejects unsafe, unknown-shape, duplicate and empty manifests', () => {
  for (const value of [[], null, ['../file.js'], [null], [files[0], files[0]], [files[0], 'tests/runtime-api/file.js']]) {
    assert.throws(() => entriesFor(value));
  }
  assert.throws(() => entrySource('../file'));
});

function virtualFixture() {
  const data = new Map();
  for (const { id, source, entry } of entriesFor(files)) { data.set(source, '// test fixture'); data.set(entry, entrySource(id)); }
  data.set('tests/runtime-api/support/run-selected.js', '// shared fixture');
  data.set('tests/runtime-api/support/unit-selection.js', '// selector fixture');
  data.set(guide, documentationTable(files));
  const readFixture = file => { if (!data.has(file)) throw new Error('not found'); return data.get(file); };
  const listFixture = () => [...data.keys()].filter(file => file.startsWith(directory + '/')).map(file => path.posix.basename(file));
  return { data, inspect: () => inspectEntries(files, readFixture, listFixture) };
}

for (const [name, mutate, expected] of [
  ['valid mapping', () => {}, null],
  ['missing entry', data => data.delete(directory + '/file.js'), /required file unavailable/],
  ['wrong fixed ID', data => data.set(directory + '/file.js', entrySource('path')), /fixed ID/],
  ['empty assertion source', data => data.set(files[0], ''), /required file unavailable/],
  ['missing helper', data => data.delete('tests/runtime-api/support/run-selected.js'), /required file unavailable/],
  ['unregistered extra entry', data => data.set(directory + '/typo.js', 'execute();'), /not registered/],
  ['doc omission', data => data.set(guide, documentationTable(files.slice(1))), /differs/],
  ['wrong doc command', data => data.set(guide, documentationTable(files).replace('single/file.js', 'single/path.js')), /differs/],
  ['duplicate doc block', data => data.set(guide, documentationTable(files) + '\n' + documentationTable(files)), /differs/],
  ['CRLF accepted', data => data.set(guide, documentationTable(files).replace(/\n/g, '\r\n')), null],
]) {
  test('manifest/entry/document guard: ' + name, () => {
    const fixture = virtualFixture(); mutate(fixture.data);
    const result = fixture.inspect();
    if (expected) assert.match(result.errors.join('\n'), expected);
    else assert.deepEqual(result.errors, []);
  });
}

test('registration growth requires both a new entry and documentation, without fixed counts', () => {
  const fixture = virtualFixture();
  const expanded = [...files, 'tests/runtime-api/unit/new-family.test.js'];
  const reader = file => { if (!fixture.data.has(file)) throw new Error('not found'); return fixture.data.get(file); };
  const list = () => ['file.js', 'path.js', 'geometry.js'];
  assert(inspectEntries(expanded, reader, list).errors.length > 0);
  fixture.data.set(expanded.at(-1), '// new test fixture');
  fixture.data.set(directory + '/new-family.js', entrySource('new-family'));
  fixture.data.set(guide, documentationTable(expanded));
  assert.deepEqual(inspectEntries(expanded, reader, list).errors, []);
});

test('existing audit hook detects stale docs and an invalid manifest in real filesystem fixtures', t => {
  const parent = path.join(root, '.runtime/tests/test-architecture/single-entry-unit');
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, 'case-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const fixture = virtualFixture();
  fixture.data.set('tests/runtime-api/manifest.js', 'globalThis.RuntimeAPITestFiles = ' + JSON.stringify({ unit: files }) + ';');
  fixture.data.set('docs/api/examples/README.md', '[single scripts](single-tests.md)');
  for (const [file, content] of fixture.data) {
    const target = path.join(temporary, file);fs.mkdirSync(path.dirname(target), { recursive: true });fs.writeFileSync(target, content);
  }
  assert.deepEqual(auditRuntimeSingleEntries(temporary).errors, []);
  const index = path.join(temporary, 'docs/api/examples/README.md');
  for (const stale of ['examples/environment.js', '；检查：\n [file.test.js](../../../tests/runtime-api/unit/file.test.js)']) {
    fs.writeFileSync(index, '[single scripts](single-tests.md)\n' + stale);
    assert(auditRuntimeSingleEntries(temporary).errors.length > 0);
  }
  fs.writeFileSync(path.join(temporary, 'tests/runtime-api/manifest.js'), 'globalThis.RuntimeAPITestFiles = {unit: []};');
  assert.match(auditRuntimeSingleEntries(temporary).errors.join('\n'), /manifest is empty/);
});

test('canonical environment suite no longer launches the old compatibility path', () => {
  const text = read('tests/runtime-api/gates/suites/environment.js');
  assert(text.includes("File.join(ROOT_DIR, 'examples', 'runtime', 'environment.js')"));
  assert(!text.includes("File.join(ROOT_DIR, 'examples', 'environment.js')"));
});


test('user example page is an unordered list of runnable examples, not unit tests', () => {
  const document = read('docs/api/examples/single-tests.md');
  assert.match(document, /^# 单项示例运行$/m);
  assert.doesNotMatch(document, /^\s*\|/m);
  assert.doesNotMatch(document, /单文件入口|唯一断言来源|tests\/runtime-api|OPENDESK_RUNTIME_API_UNIT_FILTER/);
  const items = document.split('\n').filter(line => line.startsWith('- '));
  assert(items.length > 0);
  for (const line of items) {
    const link = /\]\(\.\.\/\.\.\/\.\.\/(examples\/[^)]+\.js)\)/.exec(line);
    const command = /(?:-script |ai run )(examples\/[^\s`]+\.js)(?=[\s`])/.exec(line);
    assert(link, 'example name must link to its source: ' + line);
    assert(command, 'example item must contain a run command: ' + line);
    assert.equal(command[1], link[1], 'example command must run the linked source');
    assert.doesNotMatch(command[1], /(?:^|\/)\.\.?(?:\/|$)/);
  }
});

test('public example navigation does not present developer gates as user commands', () => {
  const document = read('docs/api/examples/README.md');
  assert.match(document, /\[单项示例运行\]\(single-tests\.md\)/);
  assert.doesNotMatch(document, /-script\s+(?:tests|scripts)\//);
  assert.doesNotMatch(document, /单文件入口|唯一断言来源/);
});

test('developer command list stays with tests and contains no redundant source columns', () => {
  assert.equal(guide, 'tests/runtime-api/single/README.md');
  const rendered = documentationTable(files);
  assert.doesNotMatch(rendered, /^\s*\||单文件入口|唯一断言来源/m);
  assert.equal(rendered.split('\n').filter(line => line.startsWith('- ')).length, files.length);
  const document = read(guide);
  assert.match(document, /开发者/);
  assert.doesNotMatch(document, /^\s*\|/m);
});
