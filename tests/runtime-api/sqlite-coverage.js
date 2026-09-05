// Reuse the single coverage implementation with a narrow SQLite-only scope.
// This must be run after sqlite-contract.js and sqlite-unit.js under the same
// Runtime API run context.

globalThis.RuntimeAPICoverageScope = {
  name: 'sqlite',
  families: ['SQLite', 'SQLiteDatabase'],
};
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/coverage.js')));
