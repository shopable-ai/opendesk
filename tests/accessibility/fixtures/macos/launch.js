const fixture = (0, eval)(File.read(File.join(Execution.workdir, 'tests', 'accessibility', 'fixtures', 'macos', 'fixture-lib.js')));
fixture.assertDarwin();
fixture.assertCommand();
const paths = fixture.root();

let recordedPid = null;
if (File.exists(paths.pidFile)) {
  const raw = String(File.read(paths.pidFile) || '').trim();
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) throw new Error(`invalid fixture pid file: ${paths.pidFile}`);
  recordedPid = Number(raw);
  if (await fixture.ownedPid(paths, recordedPid)) {
    throw new Error(`fixture pid ${recordedPid} is already running; stop it before launching another instance`);
  }
}

const existingPid = await fixture.findOwnedPid(paths);
if (existingPid) throw new Error(`fixture executable is already running as pid ${existingPid}; refusing a parallel instance`);
await fixture.build(paths);
await fixture.removeIfPresent(paths.state);
await fixture.removeIfPresent(paths.pidFile);
await fixture.removeIfPresent(paths.launchReceipt);

let openResult;
try {
  openResult = await Command.run('/usr/bin/open', ['-n', paths.app, '--args', '--state', paths.state], {
    cwd: paths.repoRoot, timeout: 10000, maxOutputBytes: 1024 * 1024,
  });
  await File.write(paths.log, `${File.read(paths.log)}\n[fixture launch]\n${openResult.stdout || ''}\n${openResult.stderr || ''}\n`);
} catch (error) {
  await File.write(paths.log, `${File.read(paths.log)}\n[fixture launch failed]\n${String(error.message || error)}\n${String(error.stdout || '')}\n${String(error.stderr || '')}\n`);
  throw error;
}

const ready = await fixture.waitForReady(paths);
await fixture.confirmStillOwned(paths, ready.pid);
await fixture.waitForVisibleWindow(paths, ready);
await File.write(paths.pidFile, `${ready.pid}\n`);
const receipt = {
  schemaVersion: 1,
  status: 'ready',
  pid: ready.pid,
  windowNumber: ready.windowNumber,
  windowId: `darwin:${ready.pid}:native:${ready.windowNumber}`,
  app: paths.app,
  executable: paths.executable,
  state: paths.state,
  log: paths.log,
};
await File.writeJSON(paths.launchReceipt, receipt);
console.log(JSON.stringify(receipt));
