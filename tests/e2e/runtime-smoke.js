// Deterministic child Runtime smoke used by tests/e2e/smoke.js.
// From the repository root:
// ./dist/opendesk -script tests/e2e/runtime-smoke.js -console-mode script

console.log('script-smoke-start');
await page.waitFor(100);
console.log('script-smoke-end');
