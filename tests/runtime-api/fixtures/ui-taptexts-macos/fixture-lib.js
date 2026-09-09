({
  root(evidenceRoot) {
    const repoRoot = String(Execution.workdir || File.cwd());
    const fixtureDir = File.join(repoRoot, 'tests', 'runtime-api', 'fixtures', 'ui-taptexts-macos');
    const outputRoot = evidenceRoot || File.join(repoRoot, '.runtime', 'tests', 'ui-taptexts-macos', Execution.id);
    const app = File.join(outputRoot, 'OpenDeskUITapTextsFixture.app');
    const executable = File.join(app, 'Contents', 'MacOS', 'OpenDeskUITapTextsFixture');
    return { repoRoot, fixtureDir, outputRoot, app, executable, buildLog: File.join(outputRoot, 'fixture-build.log') };
  },

  assertEnvironment() {
    const platform = System.getPlatformInfo();
    if (!platform || platform.os !== 'darwin') throw new Error('UI.tapTexts native fixture requires macOS');
    const command = Command.getCapabilities();
    if (!command || command.enabled !== true || command.supported !== true) {
      throw new Error('UI.tapTexts native fixture requires local Command.run capability');
    }
  },

  async build(paths) {
    const source = File.join(paths.fixtureDir, 'main.m');
    const info = File.join(paths.fixtureDir, 'Info.plist');
    if (!File.exists(source) || !File.exists(info)) throw new Error('UI.tapTexts fixture source is missing');
    File.ensureDir(File.join(paths.app, 'Contents', 'MacOS'));
    await File.copy(info, File.join(paths.app, 'Contents', 'Info.plist'));
    try {
      const compiled = await Command.run('/usr/bin/xcrun', [
        'clang', '-fobjc-arc', '-Wall', '-Wextra', '-Werror', '-framework', 'AppKit', source,
        '-o', paths.executable,
      ], { cwd: paths.repoRoot, timeout: 120000, maxOutputBytes: 4 * 1024 * 1024 });
      const signed = await Command.run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', paths.app], {
        cwd: paths.repoRoot, timeout: 30000, maxOutputBytes: 1024 * 1024,
      });
      await File.write(paths.buildLog, [
        '[fixture build]', compiled.stdout || '', compiled.stderr || '',
        '[fixture codesign]', signed.stdout || '', signed.stderr || '',
      ].join('\n'));
    } catch (error) {
      await File.write(paths.buildLog, [
        '[fixture build failed]', String(error && error.message || error),
        String(error && error.stdout || ''), String(error && error.stderr || ''),
      ].join('\n'));
      throw error;
    }
  },

  async isAlive(pid) {
    try {
      await Command.run('/bin/kill', ['-0', String(pid)], { timeout: 1000, maxOutputBytes: 4096 });
      return true;
    } catch (_) {
      return false;
    }
  },

  async processCommand(pid) {
    try {
      const result = await Command.run('/bin/ps', ['-ww', '-p', String(pid), '-o', 'command='], {
        timeout: 1000, maxOutputBytes: 16 * 1024,
      });
      return String(result.stdout || '').trim();
    } catch (_) {
      return '';
    }
  },

  expectedCommand(paths, session) {
    return `${paths.executable} --state ${session.statePath} --stop ${session.stopPath} --mode ${session.mode} --delay-ms ${session.delayMs}`;
  },

  async ownedPid(paths, session, pid) {
    if (!Number.isInteger(pid) || pid <= 0 || !(await this.isAlive(pid))) return false;
    return (await this.processCommand(pid)) === this.expectedCommand(paths, session);
  },

  async readState(session) {
    try {
      return await File.readJSON(session.statePath);
    } catch (_) {
      return null;
    }
  },

  async waitForState(session, predicate, timeoutMs = 10000) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
      last = await this.readState(session);
      if (last && predicate(last)) return last;
      await sleep(50);
    }
    throw new Error(`fixture state condition timed out for ${session.name}: ${JSON.stringify(last)}`);
  },

  async waitForWindow(paths, session, ready) {
    const expectedID = `darwin:${ready.pid}:native:${ready.windowNumber}`;
    let stable = 0;
    let observed = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const matches = window.list().filter(row => row && row.id === expectedID &&
        Number(row.pid) === ready.pid && Number(row.handle) === ready.windowNumber &&
        row.exePath === paths.executable && Number(row.width) > 0 && Number(row.height) > 0);
      if (matches.length === 1) {
        observed = matches[0];
        stable += 1;
        if (stable >= 2) return observed;
      } else {
        stable = 0;
      }
      await sleep(100);
    }
    throw new Error(`fixture window identity was not stably visible for ${session.name}`);
  },

  async waitForActive(win) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const active = await window.getActiveWindow();
        if (active && active.id === win.id && Number(active.pid) === Number(win.pid) &&
            Number(active.handle) === Number(win.handle) && active.exePath === win.exePath) return active;
      } catch (_) {
        // Activation can lag the first visible WindowServer observation.
      }
      await sleep(100);
    }
    throw new Error(`fixture window did not become active: ${win.id}`);
  },

  async launch(paths, name, mode, delayMs) {
    const scenarioRoot = File.join(paths.outputRoot, 'scenarios', name);
    File.ensureDir(scenarioRoot);
    const session = {
      name, mode, delayMs,
      statePath: File.join(scenarioRoot, 'state.json'),
      stopPath: File.join(scenarioRoot, 'stop'),
      launchLog: File.join(scenarioRoot, 'launch.log'),
    };
    if (File.exists(session.statePath)) await File.remove(session.statePath);
    if (File.exists(session.stopPath)) await File.remove(session.stopPath);
    const opened = await Command.run('/usr/bin/open', [
      '-n', paths.app, '--args', '--state', session.statePath, '--stop', session.stopPath,
      '--mode', mode, '--delay-ms', String(delayMs),
    ], { cwd: paths.repoRoot, timeout: 10000, maxOutputBytes: 1024 * 1024 });
    await File.write(session.launchLog, `${opened.stdout || ''}\n${opened.stderr || ''}`);
    const ready = await this.waitForState(session, state => Number(state.pid) > 0 && Number(state.windowNumber) > 0);
    if (!(await this.ownedPid(paths, session, Number(ready.pid)))) {
      throw new Error(`fixture pid identity mismatch for ${name}: ${ready.pid}`);
    }
    const win = await this.waitForWindow(paths, session, ready);
    const active = await this.waitForActive(win);
    return { ...session, pid: Number(ready.pid), win: active };
  },

  async stop(paths, session) {
    if (!session || !Number.isInteger(session.pid) || session.pid <= 0) return;
    if (!(await this.isAlive(session.pid))) return;
    if (!(await this.ownedPid(paths, session, session.pid))) {
      throw new Error(`refusing to stop non-owned pid ${session.pid}`);
    }
    await File.write(session.stopPath, 'stop\n');
    for (let attempt = 0; attempt < 60 && await this.isAlive(session.pid); attempt += 1) await sleep(50);
    if (await this.isAlive(session.pid)) {
      if (!(await this.ownedPid(paths, session, session.pid))) {
        throw new Error(`fixture pid identity changed before fallback termination: ${session.pid}`);
      }
      await Command.run('/bin/kill', ['-TERM', String(session.pid)], { timeout: 1000, maxOutputBytes: 4096 });
      for (let attempt = 0; attempt < 40 && await this.isAlive(session.pid); attempt += 1) await sleep(50);
    }
    if (await this.isAlive(session.pid)) throw new Error(`owned fixture pid did not stop: ${session.pid}`);
  },
})
