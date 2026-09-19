// Run from the repository root:
// ./dist/opendesk -script examples/runtime/csv.js -console-mode script

function assert(condition, message) {
  if (!condition) throw new Error('CSV example failed: ' + message);
}

assert(globalThis.CSV && CSV.VERSION === '5.7.0', 'expected bundled CSV 5.7.0');

const source = [
  'name,count',
  'alpha,2',
  'beta,3',
].join('\n');

const parsed = CSV.parse(source, {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
});

assert(Array.isArray(parsed.errors) && parsed.errors.length === 0, 'parse returned errors');
assert(parsed.data.length === 2, 'unexpected row count');
assert(parsed.data[0].name === 'alpha' && parsed.data[0].count === 2, 'first row changed');
assert(parsed.data[1].name === 'beta' && parsed.data[1].count === 3, 'second row changed');

const serialized = CSV.stringify(parsed.data);
const roundTrip = CSV.parse(serialized, {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
});

assert(roundTrip.errors.length === 0, 'round-trip parse returned errors');
assert(roundTrip.data.length === 2, 'round-trip row count changed');
assert(roundTrip.data[1].name === 'beta' && roundTrip.data[1].count === 3, 'round-trip data changed');

console.log('CSV_EXAMPLE_OK ' + JSON.stringify({
  version: CSV.VERSION,
  rows: roundTrip.data.length,
  total: roundTrip.data.reduce((sum, row) => sum + row.count, 0),
}));
