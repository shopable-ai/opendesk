// Compatibility entry only; canonical example: examples/runtime/global-this.js.
await (0, eval)('(async () => {\n' + File.read('examples/runtime/global-this.js') + '\n})()\n//# sourceURL=examples/runtime/global-this.js');
