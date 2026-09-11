'use strict';

const fs = require('fs');
const path = require('path');

// Reviewed migrations. `from` paths are retired and must stay absent; `to` is the
// single canonical implementation. This list is also the cleanup/audit contract.
const migrations = [
  ['examples/api-quickstart.js', 'examples/runtime/api-quickstart.js', 'example'],
  ['examples/environment.js', 'examples/runtime/environment.js', 'example'],
  ['examples/path.js', 'examples/runtime/path.js', 'example'],
  ['examples/file-json.js', 'examples/runtime/file-json.js', 'example'],
  ['examples/sqlite/smoke-cases.js', 'tests/runtime-api/support/sqlite-smoke-cases.js', 'test-support'],
  ['examples/sqlite/smoke.test.js', 'tests/runtime-api/sqlite-smoke.js', 'test-entry'],
  ['examples/analyze_progressive_tests.js', 'tests/automation/tools/image-layout-lab/analyze-progressive.js', 'diagnostic-tool'],
  ['examples/file.js', 'examples/runtime/file.js', 'example'],
  ['examples/command.js', 'examples/runtime/command.js', 'example'],
  ['examples/http.js', 'examples/runtime/http.js', 'example'],
  ['examples/clipboard.js', 'examples/clipboard/text.js', 'example'],
  ['examples/keyboard.js', 'examples/desktop/keyboard.js', 'example'],
  ['examples/window.js', 'examples/desktop/window-inspect.js', 'example'],
  ['examples/window-more.js', 'examples/desktop/window-controls.js', 'example'],
  ['examples/clipboard.test.js', 'tests/runtime-api/clipboard-stress.js', 'test-entry'],
].map(([from, to, role]) => ({ from, to, role }));

const protectedPaths = [
  'examples/native-extensions/macos-vision/main.swift',
  'examples/native-extensions/macos-vision/extension.json',
  'examples/native-extensions/macos-vision/types/index.d.ts',
  'tests/runtime-api/framework.js',
  'tests/runtime-api/manifest.js',
  'tests/runtime-api/unit.js',
  'examples/desktop/support/target-window.js',
  'examples/app/qianniu-window.js',
];

function auditExampleTestLayout(root) {
  const errors = [];
  function read(relative) {
    const absolute = path.join(root, relative);
    try {
      if (!fs.statSync(absolute).isFile()) throw new Error('not a file');
      return fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
    } catch (error) {
      errors.push(`layout required file unavailable: ${relative}: ${error.message}`);
      return null;
    }
  }

  for (const entry of migrations) {
    const canonical = read(entry.to);
    if (canonical !== null && canonical.trim().length === 0) {
      errors.push(`layout empty implementation: ${entry.to}`);
    }
    const retired = path.join(root, entry.from);
    if (fs.existsSync(retired)) {
      errors.push(`layout retired path must not exist: ${entry.from}`);
    }
  }

  for (const relative of protectedPaths) read(relative);

  const helper = 'tests/runtime-api/support/sqlite-smoke-cases.js';
  for (const relative of ['tests/runtime-api/unit/sqlite.test.js', 'tests/runtime-api/sqlite-smoke.js']) {
    const source = read(relative);
    if (source !== null && (!source.includes("'" + helper + "'")
      || source.includes("'examples/sqlite/smoke-cases.js'"))) {
      errors.push(`layout SQLite consumer must load canonical shared assertions: ${relative}`);
    }
  }

  const singleEntries = require('./runtime-api-entrypoints').auditRuntimeSingleEntries(root);
  errors.push(...singleEntries.errors);
  return {
    scope: 'reviewed-example-migrations-with-retired-legacy-paths',
    errors,
    migrations,
    protectedPaths,
    singleEntries,
  };
}

const historicalCounts = Object.freeze({
  KEEP_PACKAGE: 90, MOVE_GO_BLACKBOX: 29, SPLIT_JS_CONTRACT: 15,
  MOVE_TOOL: 3, OPT_IN_LIVE: 2, VENDOR_ONLY: 4, ARCHIVE_ONLY: 8,
});

// New reviewed rows go under a final "## 增量登记" section in the existing ledger.
// The historic 151-row migration remains checked; current totals grow from reviewed rows.
function validateGoCounts(classifications, currentCount, incrementalFiles = new Set()) {
  const errors = [];
  const dispositionCounts = Object.fromEntries(Object.keys(historicalCounts).map(label => [label, 0]));
  const baselineCounts = { ...dispositionCounts };
  for (const [file, { disposition }] of classifications) {
    if (!Object.prototype.hasOwnProperty.call(dispositionCounts, disposition)) {
      errors.push(`unknown Go disposition: ${file}: ${disposition}`);
      continue;
    }
    dispositionCounts[disposition] += 1;
    if (!incrementalFiles.has(file)) baselineCounts[disposition] += 1;
  }
  for (const file of incrementalFiles) {
    if (!classifications.has(file)) errors.push(`incremental Go row is not classified: ${file}`);
  }
  for (const [label, expected] of Object.entries(historicalCounts)) {
    if (baselineCounts[label] !== expected) {
      errors.push(`historical ${label} count=${baselineCounts[label]}, expected=${expected}`);
    }
  }
  const migrationBaseline = Object.values(baselineCounts).reduce((sum, count) => sum + count, 0);
  if (migrationBaseline !== 151) errors.push(`historical classification total=${migrationBaseline}, expected=151`);
  const expectedCurrent = classifications.size - dispositionCounts.MOVE_TOOL;
  if (currentCount !== expectedCurrent) errors.push(`current _test.go total=${currentCount}, expected=${expectedCurrent} from reviewed rows`);
  return {
    errors, migrationBaseline, classifiedTotal: classifications.size,
    incremental: incrementalFiles.size, expectedCurrent, dispositionCounts, baselineCounts,
  };
}

module.exports = { migrations, protectedPaths, auditExampleTestLayout, historicalCounts, validateGoCounts };
