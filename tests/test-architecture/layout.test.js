'use strict';

// Host-side migration/tool tests. These mocks do NOT validate OpenDesk Runtime APIs.
// Run from the repository root: node --test tests/test-architecture/layout.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  migrations, protectedPaths, auditExampleTestLayout,
  historicalCounts, validateGoCounts,
} = require('../../scripts/lib/test-architecture-layout');
const { entrySource, documentationTable, guide } = require('../../scripts/lib/runtime-api-entrypoints');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.runtime/tests/test-architecture/layout-unit');
fs.mkdirSync(output, { recursive: true });

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(output, 'case-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  function write(file, content) {
    const absolute = path.join(directory, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  for (const item of migrations) write(item.to, '// canonical implementation\n');
  for (const file of protectedPaths) write(file, '// protected fixture\n');
  for (const file of ['tests/runtime-api/unit/sqlite.test.js', 'tests/runtime-api/sqlite-smoke.js']) {
    write(file, "load('tests/runtime-api/support/sqlite-smoke-cases.js');\n");
  }
  const files = ['tests/runtime-api/unit/sqlite.test.js'];
  write('tests/runtime-api/manifest.js', 'globalThis.RuntimeAPITestFiles = ' + JSON.stringify({ unit: files }) + ';');
  write('tests/runtime-api/single/sqlite.js', entrySource('sqlite'));
  write('tests/runtime-api/support/run-selected.js', '// fixture shared runner');
  write('tests/runtime-api/support/unit-selection.js', '// fixture selector');
  write(guide, documentationTable(files));
  write('docs/api/examples/README.md', '[single scripts](single-tests.md)');
  return { directory, write };
}

for (const [name, mutate, expected] of [
  ['complete layout', () => {}, null],
  ['missing canonical file', f => fs.unlinkSync(path.join(f.directory, migrations[0].to)), /required file unavailable/],
  ['empty canonical file', f => f.write(migrations[0].to, ''), /empty implementation/],
  ['retired legacy path reappears', f => f.write(migrations[0].from, '// old wrapper'), /retired path must not exist/],
  ['lost build asset', f => fs.unlinkSync(path.join(f.directory, protectedPaths[0])), /required file unavailable/],
  ['formal SQLite gate loads examples', f => f.write('tests/runtime-api/unit/sqlite.test.js', "load('examples/sqlite/smoke-cases.js');"), /canonical shared assertions/],
]) {
  test('layout guard: ' + name, t => {
    const f = fixture(t);
    mutate(f);
    const result = auditExampleTestLayout(f.directory);
    if (expected) assert.match(result.errors.join('\n'), expected);
    else assert.deepEqual(result.errors, []);
  });
}

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function evaluate(source, context) {
  return vm.runInNewContext('(async () => {\n' + source + '\n})()', context);
}

test('all reviewed legacy paths are retired in the committed repository', () => {
  for (const item of migrations) {
    assert.equal(fs.existsSync(path.join(root, item.from)), false, item.from + ' must stay deleted');
    assert.equal(fs.existsSync(path.join(root, item.to)), true, item.to + ' canonical target must exist');
  }
});

test('path canonical entry preserves its real source metadata', async () => {
  const entry = 'examples/runtime/path.js';
  const scriptPath = path.join(root, entry);
  let report;
  await evaluate(read(entry), {
    path,
    Execution: { workdir: root, scriptPath, scriptDir: path.dirname(scriptPath), artifactDir: output },
    File: { cwd: () => root, write: (_file, text) => { report = JSON.parse(text); } },
    console: { log() {} },
  });
  assert.equal(report.scriptPath, scriptPath);
  assert.equal(report.scriptDir, path.dirname(scriptPath));
  assert.equal(report.sourceFile, 'path.js');
});

test('SQLite standalone entry records and throws failures supplied by the shared suite', async () => {
  const reports = [];
  const helper = 'globalThis.SQLiteSmokeCases = { makeRoot: () => "fixture", runBehaviorSuite: async () => ({ status: "failed", total: 1, passed: 0, failed: 1, skipped: 0 }) };';
  const context = {
    File: { path: file => file, read: () => helper, join: path.join, write: (_file, text) => reports.push(JSON.parse(text)) },
    console: { log() {} },
  };
  await assert.rejects(evaluate(read('tests/runtime-api/sqlite-smoke.js'), context), /SQLite smoke failed: 1\/1/);
  assert.equal(reports[0].failed, 1);
});

function diagnosticContext({ missing = false, broken = false, partial = false, empty = false } = {}) {
  let report;
  let loads = 0;
  const context = {
    Execution: { artifactDir: output },
    File: {
      exists: () => !missing, join: path.join,
      write: (_file, text) => { report = JSON.parse(text); },
    },
    ImageColor: {
      loadBase64: () => {
        loads += 1;
        if (partial && loads === 1) throw new Error('one corrupt image');
        return 'synthetic-image';
      },
      analyzeLayout: () => ({ separators: { vertical: empty ? [] : [{ confidence: broken ? NaN : 0.5 }], horizontal: [] } }),
    },
    console: { log() {} },
  };
  return { context, report: () => report };
}

for (const [name, options, failed, analyzed] of [
  ['missing all inputs', { missing: true }, 7, 0],
  ['partly corrupt inputs', { partial: true }, 1, 6],
  ['non-finite confidence', { broken: true }, 7, 0],
  ['valid outputs', {}, 0, 7],
  ['valid empty separator arrays', { empty: true }, 0, 7],
]) {
  test('diagnostic control flow: ' + name, async () => {
    const f = diagnosticContext(options);
    const run = evaluate(read('tests/automation/tools/image-layout-lab/analyze-progressive.js'), f.context);
    if (failed) await assert.rejects(run, /Progressive analysis failed/);
    else await run;
    const report = f.report();
    assert.equal(report.failed, failed);
    assert.equal(report.analyzed, analyzed);
    assert.equal(report.accuracyVerified, false);
    assert.equal(report.status, failed ? 'failed' : 'completed');
    if (!analyzed) assert.equal(report.averageSeparators, null);
  });
}

function baseline() {
  const rows = new Map();
  for (const [disposition, count] of Object.entries(historicalCounts)) {
    for (let index = 0; index < count; index += 1) rows.set(`${disposition}/${index}_test.go`, { disposition });
  }
  return rows;
}

test('Go counts keep the original 151/148 baseline', () => {
  const result = validateGoCounts(baseline(), 148);
  assert.deepEqual(result.errors, []);
  assert.equal(result.migrationBaseline, 151);
});

test('Go counts allow a reviewed incremental test without changing historical counts', () => {
  const rows = baseline();
  rows.set('pkg/new_test.go', { disposition: 'KEEP_PACKAGE' });
  const result = validateGoCounts(rows, 149, new Set(['pkg/new_test.go']));
  assert.deepEqual(result.errors, []);
  assert.equal(result.migrationBaseline, 151);
  assert.equal(result.classifiedTotal, 152);
  assert.equal(result.incremental, 1);
});

test('Go counts reject missing current files and historical deletions', () => {
  assert.match(validateGoCounts(baseline(), 147).errors.join('\n'), /expected=148/);
  const rows = baseline();
  rows.delete('KEEP_PACKAGE/0_test.go');
  assert.match(validateGoCounts(rows, 147).errors.join('\n'), /historical KEEP_PACKAGE/);
});
