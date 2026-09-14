// Reuse the catalog coverage algorithm for the one new public method. This
// runs only after its contract and unit gates in the same formal run context.

globalThis.RuntimeAPICoverageScope = {
  name: 'ui-target-sequence',
  ids: ['window.current', 'window.activate', 'UI.tapTargets'],
};
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/coverage.js')));
