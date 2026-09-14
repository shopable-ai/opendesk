// Deterministic input for the basic protected-package equivalence lane.
// Run the fast plain -> package -> P1 -> protected -> compare workflow with:
// ./dist/opendesk -script tests/protected-packages/basic-runtime-smoke.js -console-mode script
// Run the full qualification workflow with:
// ./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
'use strict';

// This marker intentionally exists only in source code. Tests scan the generated
// .odpkg and protected execution artifacts to ensure this exact string is not
// disclosed as plaintext. Do not log it or write it into business-result.json.
const sourceOnlySentinel = 'OPENDESK_PROTECTED_SOURCE_SENTINEL_7A4F19C2D86E31B5';
if (!sourceOnlySentinel.startsWith('OPENDESK_PROTECTED_SOURCE_SENTINEL_')) {
  throw new Error('protected-package source sentinel is invalid');
}

// A deterministic, random-looking probe makes it easy to recognize the same
// business payload before and after packaging without making the equivalence
// result nondeterministic.
const verificationToken = 'ODPKG-BASIC-VERIFY-4C91A7E2';
const values = [7, 11, 13, 17];
const weightedTotal = values.reduce((total, value, index) => total + value * (index + 1), 0);
const result = {
  schemaVersion: 1,
  contract: 'protected-package-basic-v1',
  verificationToken,
  values,
  weightedTotal,
  label: `basic-${weightedTotal}`,
};

File.write(
  File.join(Execution.artifactDir, 'business-result.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(`protected-package-basic:business-result-written token=${verificationToken} total=${weightedTotal}`);
