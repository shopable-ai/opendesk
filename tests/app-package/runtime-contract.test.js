'use strict';

// Real Runtime App Package contract smoke. Run from the repository root:
// node --test tests/app-package/runtime-contract.test.js
const {after, test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const binary = path.resolve(process.env.OPENDESK_TEST_BINARY || path.join(repoRoot, 'dist', 'opendesk'));
const fixtureRoot = path.join(__dirname, 'fixtures');
const evidenceRoot = path.join(repoRoot, '.runtime', 'tests', 'app-package');
const runtimeVersion = fs.readFileSync(path.join(repoRoot, 'VERSION'), 'utf8').trim();
const results = [];

fs.mkdirSync(evidenceRoot, {recursive: true});

function runFixture(name, expected) {
  assert.equal(fs.existsSync(binary), true, `OpenDesk binary is missing: ${binary}; run make build first`);
  const logDirectory = path.join(evidenceRoot, 'runs', name);
  fs.mkdirSync(logDirectory, {recursive: true});
  const result = spawnSync(binary, [
    '-app', path.join(fixtureRoot, name),
    '-console-mode', 'script',
    '-log-dir', logDirectory,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      OPENDESK_APP_DATA_DIR: path.join(evidenceRoot, 'app-data', name),
    },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const record = {
    name,
    expected,
    passed: false,
    exitCode: result.status,
    signal: result.signal,
    timedOut: result.error && result.error.code === 'ETIMEDOUT',
    output,
  };
  results.push(record);
  assert.ifError(result.error);
  return {record, result, output};
}

after(() => {
  fs.writeFileSync(path.join(evidenceRoot, 'runtime-contract.json'), `${JSON.stringify({
    schemaVersion: 1,
    suite: 'app-package-runtime-contract',
    runtimeVersion,
    binary,
    status: results.length === 4 && results.every(result => result.passed) ? 'passed' : 'failed',
    cases: results,
  }, null, 2)}\n`);
});

test('schema v1 package loads and executes in the real Runtime', () => {
  const {record, result, output} = runFixture('valid-v1', 'entry executes and exits successfully');
  assert.equal(result.status, 0, output);
  assert.match(output, /APP_PACKAGE_V1_ENTRY_OK=/);
  assert.match(output, /\[SUMMARY\] status=succeeded/);
  record.passed = true;
});

test('legacy package without schemaVersion remains compatible', () => {
  const {record, result, output} = runFixture('valid-legacy', 'legacy entry executes and exits successfully');
  assert.equal(result.status, 0, output);
  assert.match(output, /APP_PACKAGE_LEGACY_ENTRY_OK=/);
  assert.match(output, /\[SUMMARY\] status=succeeded/);
  record.passed = true;
});

test('Runtime compatibility rejects the package before entry execution', () => {
  const {record, result, output} = runFixture('runtime-too-old', 'APP_RUNTIME_TOO_OLD before entry execution');
  assert.notEqual(result.status, 0, output);
  assert.match(output, /APP_RUNTIME_TOO_OLD/);
  assert.match(output, new RegExp(`actual=${runtimeVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.doesNotMatch(output, /APP_PACKAGE_ENTRY_EXECUTED_UNEXPECTEDLY/);
  record.passed = true;
});

test('unsupported schema rejects the package before entry execution', () => {
  const {record, result, output} = runFixture('schema-unsupported', 'APP_PACKAGE_SCHEMA_UNSUPPORTED before entry execution');
  assert.notEqual(result.status, 0, output);
  assert.match(output, /APP_PACKAGE_SCHEMA_UNSUPPORTED/);
  assert.doesNotMatch(output, /APP_PACKAGE_ENTRY_EXECUTED_UNEXPECTEDLY/);
  record.passed = true;
});
