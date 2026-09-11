'use strict';

// Repository layout guard. This test does not run OpenDesk or any Example.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const examplesRoot = path.join(root, 'examples');

const allowedRootFiles = new Set(['README.md', 'catalog.json']);

test('examples root contains only navigation files and domain directories', () => {
  const unexpected = [];
  for (const name of fs.readdirSync(examplesRoot).sort()) {
    const absolute = path.join(examplesRoot, name);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) continue;
    if (!allowedRootFiles.has(name)) unexpected.push(name);
  }
  assert.deepEqual(unexpected, [], 'move public examples into examples/<domain>/, tests/tools into tests/, and delete temporary root files');
});
