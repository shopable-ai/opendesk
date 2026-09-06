// Compatibility entry only; implementation lives at examples/runtime/file.js.
// Run from the repository root. See docs/quality/example-test-layout.md.
await (0, eval)('(async () => {\n' + File.read('examples/runtime/file.js') + '\n})()\n//# sourceURL=examples/runtime/file.js');
