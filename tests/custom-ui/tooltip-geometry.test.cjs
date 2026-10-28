'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

// Pure Cocoa geometry only: no NSApplication, windows, or live desktop access.
test('production tooltip geometry: orders, boundaries, fallback and property grid', {
  skip: process.platform !== 'darwin' && 'Cocoa geometry requires macOS'
}, () => {
  const root = path.resolve(__dirname, '../..');
  const output = path.join(root, '.runtime/tests/floating-tooltip/geometry');
  fs.mkdirSync(output, { recursive: true });
  const binary = path.join(output, 'tooltip-geometry');
  const compile = spawnSync('clang', [
    '-fobjc-arc', '-Wall', '-Wextra', '-Werror', '-framework', 'Cocoa', '-framework', 'CoreText',
    '-I', root, path.join(__dirname, 'tools/tooltip-geometry/main.m'), '-o', binary
  ], { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.ifError(compile.error);
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const run = spawnSync(binary, [], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /PASS tooltip geometry: \d+ assertions, \d+ placements/);
  console.log(run.stdout.trim());
});
