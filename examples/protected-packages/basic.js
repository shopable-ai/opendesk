// Deterministic input for protected-package plain/protected equivalence.
// Fast validation:
// ./dist/opendesk -script tests/protected-packages/basic-runtime-smoke.js -console-mode script
'use strict';

// Source-only sentinel used by disclosure checks. It must never be logged or
// written to artifacts. A generated .odpkg must not expose this plaintext.
const sourceOnlySentinel = 'OPENDESK_PROTECTED_SOURCE_SENTINEL_7A4F19C2D86E31B5';
if (!sourceOnlySentinel.startsWith('OPENDESK_PROTECTED_SOURCE_SENTINEL_')) {
  throw new Error('protected-package source sentinel is invalid');
}

// Keep the business payload deterministic so plain and protected executions can
// be compared byte-for-byte after JSON parsing.
const verificationToken = 'ODPKG-BASIC-VERIFY-4C91A7E2';
const values = [7, 11, 13, 17];
const weightedTotal = values.reduce(
  (total, value, index) => total + value * (index + 1),
  0,
);

const businessResult = {
  schemaVersion: 1,
  contract: 'protected-package-basic-v1',
  verificationToken,
  values,
  weightedTotal,
  label: `basic-${weightedTotal}`,
};

// Keep per-run evidence separate from the deterministic business result. The
// Execution id proves that plain and protected lanes were two real executions
// without making their business payloads different.
const runEvidence = {
  schemaVersion: 1,
  kind: 'protected-package-basic-run',
  executionId: Execution.id,
  verificationToken,
  businessResultFile: 'business-result.json',
};

File.write(
  File.join(Execution.artifactDir, 'business-result.json'),
  JSON.stringify(businessResult, null, 2) + '\n',
);
File.write(
  File.join(Execution.artifactDir, 'run-evidence.json'),
  JSON.stringify(runEvidence, null, 2) + '\n',
);

console.log(
  `protected-package-basic:business-result-written execution=${Execution.id} ` +
  `token=${verificationToken} total=${weightedTotal}`,
);
