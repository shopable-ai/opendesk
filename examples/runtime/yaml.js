// Run from the repository root:
// ./dist/opendesk -script examples/runtime/yaml.js -console-mode script

function assert(condition, message) {
  if (!condition) throw new Error('YAML example failed: ' + message);
}

assert(globalThis.YAML && YAML.VERSION === '5.4.1', 'expected bundled YAML 5.4.1');

const source = [
  'name: OpenDesk',
  'enabled: true',
  'tags:',
  '  - agent',
  '  - recipe',
  '',
].join('\n');

const parsed = YAML.parse(source);
assert(parsed.name === 'OpenDesk', 'name was not parsed');
assert(parsed.enabled === true, 'boolean was not parsed');
assert(Array.isArray(parsed.tags) && parsed.tags.join(',') === 'agent,recipe', 'sequence was not parsed');

const serialized = YAML.stringify({
  name: parsed.name,
  tagCount: parsed.tags.length,
});
const roundTrip = YAML.parse(serialized);
assert(roundTrip.name === 'OpenDesk', 'round-trip name changed');
assert(roundTrip.tagCount === 2, 'round-trip count changed');

console.log('YAML_EXAMPLE_OK ' + JSON.stringify({
  version: YAML.VERSION,
  name: roundTrip.name,
  tagCount: roundTrip.tagCount,
}));
