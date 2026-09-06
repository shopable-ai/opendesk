// Reuse the single coverage implementation with an exact Page-wait scope.
// This must run after contract and page-wait-unit.js in the same Runtime API
// run context so only current-run evidence can satisfy the required tiers.

globalThis.RuntimeAPICoverageScope = {
  name: 'page-wait',
  ids: [
    'page.waitFor',
    'page.waitForTimeout',
    'page.waitForFunction',
    'page.waitForAll',
  ],
};
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/coverage.js')));
