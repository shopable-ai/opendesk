(() => {
  const { assert, test } = RuntimeAPITest;
  test({ name: 'window.js_beautify remains callable through the documented bundled-library bridge', tier: 'unit', covers: ['window.js_beautify'] }, async () => {
    const formatted = window.js_beautify('function x(){return 1;}');
    assert(typeof formatted === 'string' && formatted.includes('function x'), 'js_beautify returned an invalid result');
  });

  test({ name: 'bundled Lodash exposes the documented flatten family at the pinned version', tier: 'unit', covers: ['bundled-library.lodash'] }, async () => {
    assert(globalThis._ && _.VERSION === '4.17.21', 'unexpected Lodash version');
    assert(JSON.stringify(_.flatten([[1, 2], [3]])) === '[1,2,3]', '_.flatten failed');
    assert(JSON.stringify(_.flattenDeep([1, [2, [3]]])) === '[1,2,3]', '_.flattenDeep failed');
    assert(JSON.stringify(_.flattenDepth([1, [2, [3, [4]]]], 2)) === '[1,2,3,[4]]', '_.flattenDepth failed');
  });

  test({ name: 'bundled YAML parses and serializes through the stable library facade', tier: 'unit', covers: ['bundled-library.yaml'] }, async () => {
    assert(globalThis.YAML && YAML.VERSION === '5.4.1', 'unexpected YAML version');
    const value = YAML.parse('name: OpenDesk\nitems:\n  - one\n  - two\n');
    assert(value && value.name === 'OpenDesk' && value.items.join(',') === 'one,two', 'YAML.parse failed');
    const text = YAML.stringify({ name: 'OpenDesk', count: 2 });
    assert(/name:\s+OpenDesk/.test(text) && /count:\s+2/.test(text), 'YAML.stringify failed');
  });

  test({ name: 'bundled CSV delegates parse and stringify to pinned Papa Parse', tier: 'unit', covers: ['bundled-library.csv'] }, async () => {
    assert(globalThis.CSV && CSV.VERSION === '5.7.0', 'unexpected CSV version');
    assert(globalThis.Papa && typeof Papa.parse === 'function', 'Papa Parse upstream global is missing');
    const parsed = CSV.parse('name,count\nA,1\nB,2', { header: true, dynamicTyping: true });
    assert(parsed.errors.length === 0 && parsed.data.length === 2, 'CSV.parse returned errors');
    assert(parsed.data[0].name === 'A' && parsed.data[0].count === 1, 'CSV.parse returned unexpected data');
    const text = CSV.stringify([{ name: 'A', count: 1 }]);
    assert(text.includes('name,count') && text.includes('A,1'), 'CSV.stringify failed');
  });

})();
