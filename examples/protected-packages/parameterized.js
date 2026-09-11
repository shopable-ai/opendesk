// File-input example for the parameterized protected-package equivalence lane.
// The canonical test executes this source and its authorized package with the
// same examples/protected-packages/parameterized-input.json via ai run --input-file.
'use strict';

function requireInteger(value, name, minimum) {
  // Some compiled Runtime builds preserve JSON integers as host numeric
  // wrappers. Normalize that JSON numeric value before business validation so
  // this example tests input equivalence rather than a host representation.
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || Math.floor(normalized) !== normalized || normalized < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return normalized;
}

const input = Execution.input;
if (!input || typeof input !== 'object' || Array.isArray(input)) {
  throw new Error('Execution.input must be an object');
}
if (typeof input.orderId !== 'string' || !/^[A-Z0-9-]{3,40}$/.test(input.orderId)) {
  throw new Error('orderId must use 3-40 uppercase letters, digits, or hyphens');
}

const unitPriceCents = requireInteger(input.unitPriceCents, 'unitPriceCents', 0);
const quantity = requireInteger(input.quantity, 'quantity', 1);
const discountBps = requireInteger(input.discountBps, 'discountBps', 0);
if (discountBps > 10000) throw new Error('discountBps must be <= 10000');

const subtotalCents = unitPriceCents * quantity;
const discountCents = Math.floor(subtotalCents * discountBps / 10000);
const totalCents = subtotalCents - discountCents;
if (Number(input.expectedTotalCents) !== totalCents) {
  throw new Error(`expectedTotalCents mismatch: expected ${input.expectedTotalCents}, computed ${totalCents}`);
}

const result = {
  schemaVersion: 1,
  contract: 'protected-package-parameterized-v1',
  orderId: input.orderId,
  currency: 'USD',
  unitPriceCents,
  quantity,
  discountBps,
  subtotalCents,
  discountCents,
  totalCents,
};

File.write(
  File.join(Execution.artifactDir, 'business-result.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log('protected-package-parameterized:business-result-written');
