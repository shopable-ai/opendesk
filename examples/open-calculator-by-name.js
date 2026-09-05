// Run from the repository root:
// ./dist/opendesk ai run examples/open-calculator-by-name.js
//
// This example only launches or activates Calculator, waits for its real
// window, and prints its observed identity. It never types, clears, restarts,
// terminates, or otherwise changes the existing Calculator instance.

const app = await App.launch('计算器', {
  waitUntilReady: 'window',
  timeout: 10000,
});

console.log(JSON.stringify({
  input: '计算器',
  identity: app.identity,
  name: app.name,
  bundleId: app.bundleId,
  path: app.path,
  pids: app.pids,
  instances: app.instances,
}, null, 2));
