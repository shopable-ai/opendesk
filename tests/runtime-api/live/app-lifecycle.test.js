const evidenceDirectory = '.runtime/tests/platform-primitives/task-007-app-lifecycle';
const bundlePath = `${File.cwd()}/${evidenceDirectory}/OpenDeskAppLifecycleFixture.app`;
const target = { bundleId: 'com.opendesk.runtime-api.app-lifecycle-fixture' };
const screenshotPath = `${evidenceDirectory}/window.png`;
const evidencePath = `${evidenceDirectory}/evidence.json`;

if (!File.isDir(bundlePath)) throw new Error(`fixture bundle not built: ${bundlePath}`);
if (App.isRunning(target)) await App.terminate(target, { force: true, timeout: 15000 });

const startedAt = Date.now();
let active = false;
try {
  console.log('[APP-LIFECYCLE] launch window-ready');
  const first = await App.launch({ path: bundlePath }, { waitUntilReady: 'window', timeout: 15000 });
  active = true;
  const firstPID = first.pids[0];
  const firstWindows = window.list().filter(item => item.pid === firstPID);
  if (!firstWindows.some(item => item.title === 'OpenDesk App Lifecycle Fixture')) {
    throw new Error(`fixture window was not linked to PID ${firstPID}`);
  }
  await page.screenshot({ target: 'activeWindow', path: screenshotPath });

  console.log('[APP-LIFECYCLE] second launch');
  const secondLaunch = await App.launch(target, { waitUntilReady: 'window', timeout: 15000 });
  if (!secondLaunch.pids.includes(firstPID)) throw new Error('second launch did not preserve the running app instance');

  console.log('[APP-LIFECYCLE] restart');
  const restarted = await App.restart({ pid: firstPID }, { waitUntilReady: 'window', timeout: 15000 });
  const restartPID = restarted.pids[0];
  if (restartPID === firstPID) throw new Error('restart did not replace the app PID');

  console.log('[APP-LIFECYCLE] graceful terminate');
  const graceful = await App.terminate(target, { timeout: 15000 });
  active = false;
  if (graceful.force || App.isRunning(target)) throw new Error('graceful termination postcondition failed');
  if (!(await App.waitForExit(target, { timeout: 1000 }))) throw new Error('waitForExit did not resolve true');

  console.log('[APP-LIFECYCLE] force terminate');
  const forceFixture = await App.launch(target, { waitUntilReady: 'process', timeout: 15000 });
  active = true;
  const forced = await App.terminate({ pid: forceFixture.pids[0] }, { force: true, timeout: 15000 });
  active = false;
  if (!forced.force || App.isRunning(target)) throw new Error('force termination postcondition failed');

  const capabilities = App.getCapabilities();
  File.write(evidencePath, JSON.stringify({
    schemaVersion: 1,
    platform: capabilities.platform,
    backend: capabilities.backend,
    os: System.getPlatformInfo(),
    target: { bundleId: target.bundleId },
    launch: { pid: firstPID, instanceCount: first.instances.length },
    secondLaunch: { samePID: secondLaunch.pids.includes(firstPID) },
    window: { title: 'OpenDesk App Lifecycle Fixture', pidMatched: true, screenshot: screenshotPath },
    restart: { oldPID: firstPID, newPID: restartPID, pidChanged: restartPID !== firstPID },
    graceful: { requestedForce: graceful.force, exited: true },
    force: { requestedForce: forced.force, exited: true },
    postcondition: { running: App.isRunning(target) },
    durationMs: Date.now() - startedAt,
  }, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: evidencePath, screenshot: screenshotPath }));
} finally {
  if (active || App.isRunning(target)) {
    await App.terminate(target, { force: true, timeout: 15000 });
  }
}
