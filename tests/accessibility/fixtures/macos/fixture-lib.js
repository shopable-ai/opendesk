({
  root() {
    const repoRoot = String(Execution.workdir || File.cwd());
    const fixtureDir = File.join(repoRoot, 'tests', 'accessibility', 'fixtures', 'macos');
    const outputRoot = File.join(repoRoot, '.runtime', 'tests', 'accessibility', 'macos');
    const app = File.join(outputRoot, 'OpenDeskAccessibilityFixture.app');
    const executable = File.join(app, 'Contents', 'MacOS', 'OpenDeskAccessibilityFixture');
    return {
      repoRoot,
      fixtureDir,
      outputRoot,
      app,
      executable,
      state: File.join(outputRoot, 'state.json'),
      log: File.join(outputRoot, 'fixture.log'),
      pidFile: File.join(outputRoot, 'fixture.pid'),
      launchReceipt: File.join(outputRoot, 'launch.json'),
    };
  },

  assertDarwin() {
    const platform = System.getPlatformInfo();
    if (!platform || platform.os !== 'darwin') throw new Error('macOS Accessibility fixture requires darwin');
  },

  assertCommand() {
    const capabilities = Command.getCapabilities();
    if (!capabilities || !capabilities.enabled || !capabilities.supported) {
      throw new Error('macOS Accessibility fixture requires local Command.run capability');
    }
  },

  async removeIfPresent(file) {
    if (File.exists(file)) await File.remove(file);
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
        timeout: 1000,
        maxOutputBytes: 16 * 1024,
      });
      return String(result.stdout || '').trim();
    } catch (_) {
      return '';
    }
  },

  expectedCommand(paths) {
    return `${paths.executable} --state ${paths.state}`;
  },

  async ownedPid(paths, pid) {
    if (!Number.isInteger(pid) || pid <= 0 || !(await this.isAlive(pid))) return false;
    return (await this.processCommand(pid)) === this.expectedCommand(paths);
  },

  async findOwnedPid(paths) {
    let result;
    try {
      result = await Command.run('/bin/ps', ['-ww', '-axo', 'pid=,command='], {
        timeout: 1000,
        maxOutputBytes: 1024 * 1024,
      });
    } catch (_) {
      return null;
    }
    const expected = this.expectedCommand(paths);
    for (const line of String(result.stdout || '').split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (match && match[2] === expected) return Number(match[1]);
    }
    return null;
  },

  async build(paths) {
    const source = File.join(paths.fixtureDir, 'main.m');
    const info = File.join(paths.fixtureDir, 'Info.plist');
    if (!File.exists(source) || !File.exists(info)) throw new Error('macOS fixture source is missing from the repository');
    File.ensureDir(File.join(paths.app, 'Contents', 'MacOS'));
    await File.copy(info, File.join(paths.app, 'Contents', 'Info.plist'));
    let buildResult;
    try {
      buildResult = await Command.run('/usr/bin/xcrun', [
        'clang', '-fobjc-arc', '-Wall', '-Wextra', '-Werror', '-framework', 'AppKit', source,
        '-o', paths.executable,
      ], { cwd: paths.repoRoot, timeout: 120000, maxOutputBytes: 4 * 1024 * 1024 });
      const signResult = await Command.run('/usr/bin/codesign', ['--force', '--sign', '-', paths.app], {
        cwd: paths.repoRoot, timeout: 30000, maxOutputBytes: 1024 * 1024,
      });
      await File.write(paths.log, [
        '[fixture build]', buildResult.stdout || '', buildResult.stderr || '',
        '[fixture codesign]', signResult.stdout || '', signResult.stderr || '',
      ].join('\n'));
    } catch (error) {
      await File.write(paths.log, [
        '[fixture build failed]', String(error.message || error), String(error.stdout || ''), String(error.stderr || ''),
      ].join('\n'));
      throw error;
    }
    return paths.app;
  },

  parseState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const pid = Number(value.pid);
    const windowNumber = Number(value.windowNumber);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(windowNumber) || windowNumber <= 0) return null;
    return { pid, windowNumber };
  },

  async waitForReady(paths) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let state = null;
      try {
        state = this.parseState(await File.readJSON(paths.state));
      } catch (_) {
        // The fixture writes state after its AppKit window has been created.
      }
      if (state && await this.ownedPid(paths, state.pid)) return state;
      await sleep(100);
    }
    throw new Error(`fixture did not publish a matching ready state; see ${paths.log}`);
  },

  async waitForVisibleWindow(paths, ready) {
    const expectedID = `darwin:${ready.pid}:native:${ready.windowNumber}`;
    let stableObservations = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const matches = (await window.list()).filter((row) => row &&
        row.id === expectedID && Number(row.pid) === ready.pid &&
        Number(row.handle) === ready.windowNumber && row.exePath === paths.executable &&
        Number(row.width) > 0 && Number(row.height) > 0);
      if (matches.length === 1) {
        stableObservations += 1;
        if (stableObservations >= 2) return matches[0];
      } else {
        stableObservations = 0;
      }
      await sleep(100);
    }
    throw new Error(`fixture window did not become stably visible; see ${paths.log}`);
  },

  async confirmStillOwned(paths, pid) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!(await this.ownedPid(paths, pid))) throw new Error(`fixture exited after readiness; see ${paths.log}`);
      await sleep(100);
    }
  },
})
