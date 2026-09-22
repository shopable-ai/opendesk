'use strict';
// Exercise the real Node qualification CLI, not Calculator or an OpenDesk API.
// Unsupported options must fail before old-candidate preparation or file access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const REPO = path.resolve(__dirname, '../..');
const CLI = 'tests/workflows/calculator/qualify.cjs';
const OUTPUT = path.join(REPO, '.runtime/tests/workflows/calculator');

function invoke(args) {
  return spawnSync(process.execPath, [CLI, ...args], {cwd: REPO, encoding: 'utf8', timeout: 5000});
}
function noAttempt(result) {
  assert.equal(result.error, undefined);
  const entries = fs.existsSync(OUTPUT) ? fs.readdirSync(OUTPUT) : [];
  assert.ok(!entries.some(name => name.endsWith('-' + result.pid)), 'invalid CLI created a qualification attempt');
  assert.ok(!result.stdout.includes('runRoot'));
}

for (const args of [
  ['--check', '--spec', '.runtime/new-scenario.json'],
  ['--check', '--input', '{"secondMultiplier":"7"}'],
  ['--check', '--candidate', '.runtime/new-candidate.json'],
  ['--check', '--live'], ['--check', '--check'], ['--unknown'],
]) {
  test('qualification rejects unsupported/extra arguments before touching the old candidate: ' + args.join(' '), () => {
    const result = invoke(args);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /CALCULATOR_QUALIFICATION_ARGUMENTS/);
    assert.match(result.stderr, /r003/);
    noAttempt(result);
  });
}

test('qualification help is read-only and states the fixed-candidate scope', () => {
  const result = invoke(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--live.*--check.*--preflight/);
  assert.match(result.stdout, /r003/);
  assert.match(result.stdout, /110.*660/);
  assert.match(result.stdout, /WORKFLOW.md/);
  noAttempt(result);
});

test('existing --check stays accepted and cannot turn a missing environment into qualification', () => {
  const result = invoke(['--check']); // never starts Runtime, even on macOS
  assert.notEqual(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.runRoot.startsWith(OUTPUT + path.sep));
  if (report.verdict === 'pass') assert.equal(report.desktop, 'not-run');
  else assert.equal(report.inputStarted, false);
});
