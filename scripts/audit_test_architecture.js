#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const primaryClassification = path.resolve(root, 'docs/quality/go-test-file-classification.md');
const supplementalClassifications = [
  path.resolve(root, 'docs/quality/go-test-file-classification-measurement.md'),
];
const originalReadFileSync = fs.readFileSync.bind(fs);

for (const supplemental of supplementalClassifications) {
  if (!fs.existsSync(supplemental)) {
    throw new Error(`missing supplemental Go test classification: ${supplemental}`);
  }
}

function requestedEncoding(options) {
  if (typeof options === 'string') return options.toLowerCase();
  if (options && typeof options === 'object' && typeof options.encoding === 'string') {
    return options.encoding.toLowerCase();
  }
  return '';
}

// Keep the historical audit core unchanged. Only the UTF-8 read of the
// classification ledger is extended with reviewed domain supplements. Raw
// reads used for source hashing still observe the real individual files, so
// source closure and file-level provenance remain explicit.
fs.readFileSync = function readFileSyncWithClassificationSupplements(file, options) {
  const primary = originalReadFileSync(file, options);
  if (typeof file !== 'string' || path.resolve(file) !== primaryClassification || requestedEncoding(options) !== 'utf8') {
    return primary;
  }
  const texts = [String(primary).replace(/\r\n?/g, '\n')];
  for (const supplemental of supplementalClassifications) {
    texts.push(originalReadFileSync(supplemental, 'utf8').replace(/\r\n?/g, '\n'));
  }
  return `${texts.join('\n')}\n`;
};

try {
  require('./audit_test_architecture_core');
} finally {
  fs.readFileSync = originalReadFileSync;
}
