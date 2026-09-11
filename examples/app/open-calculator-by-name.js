// macOS example: launch or activate Calculator by native application name.
// It does not type, clear, restart or terminate an existing Calculator instance.
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
