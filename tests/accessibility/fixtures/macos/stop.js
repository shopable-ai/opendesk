const fixture = (0, eval)(File.read(File.join(Execution.workdir, 'tests', 'accessibility', 'fixtures', 'macos', 'fixture-lib.js')));
fixture.assertDarwin();
fixture.assertCommand();
const paths = fixture.root();
if (!File.exists(paths.pidFile)) {
  await fixture.removeIfPresent(paths.launchReceipt);
  console.log(JSON.stringify({ status: 'not-running' }));
} else {
  const raw = String(File.read(paths.pidFile) || '').trim();
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) throw new Error(`invalid fixture pid file: ${paths.pidFile}`);
  const pid = Number(raw);
  if (!(await fixture.isAlive(pid))) {
    await fixture.removeIfPresent(paths.pidFile);
    await fixture.removeIfPresent(paths.launchReceipt);
    console.log(JSON.stringify({ status: 'already-stopped', pid }));
  } else {
    const command = await fixture.processCommand(pid);
    if (command !== fixture.expectedCommand(paths)) {
      throw new Error(`refusing to terminate pid ${pid}: command identity is not the helper-owned fixture`);
    }
    await Command.run('/bin/kill', ['-TERM', String(pid)], { timeout: 1000, maxOutputBytes: 4096 });
    for (let attempt = 0; attempt < 20 && await fixture.isAlive(pid); attempt += 1) await sleep(100);
    if (await fixture.isAlive(pid)) throw new Error(`fixture pid ${pid} did not terminate after SIGTERM`);
    await fixture.removeIfPresent(paths.pidFile);
    await fixture.removeIfPresent(paths.launchReceipt);
    console.log(JSON.stringify({ status: 'stopped', pid }));
  }
}
