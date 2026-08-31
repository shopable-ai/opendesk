(() => {
  const { assert, test } = RuntimeAPITest;
  test({ name: 'window.js_beautify remains callable through the documented bundled-library bridge', tier: 'unit', covers: ['window.js_beautify'] }, async () => {
    const formatted = window.js_beautify('function x(){return 1;}');
    assert(typeof formatted === 'string' && formatted.includes('function x'), 'js_beautify returned an invalid result');
  });
})();
