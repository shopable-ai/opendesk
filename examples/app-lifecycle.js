const target = { path: '/System/Applications/Calculator.app' };
const evidenceDirectory = '.runtime/tests/platform-primitives/task-007-app-lifecycle';
const evidencePath = `${evidenceDirectory}/example.json`;

if (!File.exists(target.path)) {
  throw new Error(`Calculator fixture is unavailable at ${target.path}`);
}
if (App.isRunning(target)) {
  throw new Error('Calculator is already running; refusing to modify the existing operator instance');
}

let current = null;
try {
  const launched = await App.launch(target, { waitUntilReady: 'window', timeout: 15000 });
  current = launched;
  const restarted = await App.restart({ pid: launched.pids[0] }, { waitUntilReady: 'window', timeout: 15000 });
  current = restarted;
  await App.terminate(target, { timeout: 15000 });
  await App.waitForExit(target, { timeout: 15000 });
  File.ensureDir(evidenceDirectory);
  File.write(evidencePath, JSON.stringify({
    schemaVersion: 1,
    platform: App.getCapabilities().platform,
    target: { kind: 'path', value: target.path },
    launch: { pidCount: launched.pids.length },
    restart: { pidChanged: launched.pids[0] !== restarted.pids[0] },
    postcondition: { running: App.isRunning(target) },
  }, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: evidencePath }));
} finally {
  if (current && App.isRunning(target)) {
    await App.terminate(target, { force: true, timeout: 5000 });
  }
}
