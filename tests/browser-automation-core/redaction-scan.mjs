import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Explicit inventory is mandatory. Missing or empty inputs fail; values never enter the report.
export function scanOutputs(files, secrets) {
  assert.ok(files.length > 0, 'SCAN_INVENTORY_EMPTY');
  assert.ok(secrets.length > 0 && secrets.every(value => typeof value === 'string' && value.length > 0), 'SCAN_VALUES_EMPTY');
  const findings = [], inventory = [];
  for (const file of [...new Set(files)]) {
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 0, 'SCAN_FILE_EMPTY');
    inventory.push({file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
    if (secrets.some(value => bytes.includes(Buffer.from(value)))) findings.push({file, reason: 'PLAINTEXT_PRESENT'});
  }
  return {status: findings.length ? 'FAIL' : 'PASS', inventory, findings, valuesScanned: secrets.length};
}
