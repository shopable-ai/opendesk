// Deterministic input for the basic protected-package equivalence lane.
// Run the complete plain -> package -> P1 -> protected -> compare workflow with:
// ./dist/opendesk -script tests/protected-packages/runtime-equivalence.js -console-mode script
'use strict';

const values = [7, 11, 13, 17];
const weightedTotal = values.reduce((total, value, index) => total + value * (index + 1), 0);
const result = {
  schemaVersion: 1,
  contract: 'protected-package-basic-v1',
  values,
  weightedTotal,
  label: `basic-${weightedTotal}`,
};

File.write(
  File.join(Execution.artifactDir, 'business-result.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log('protected-package-basic:business-result-written');
