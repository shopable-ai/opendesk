({
  requiredEnv(name) {
    const value = System.getEnv(name);
    if (typeof value !== 'string' || value.length === 0) throw new Error(name + ' is required');
    return value;
  },

  positivePID(raw, name) {
    if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(name + ' must be a positive integer');
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid > 2147483647) throw new Error(name + ' is out of range');
    return pid;
  },

  paths() {
    const root = String(Execution.workdir || File.cwd());
    const output = File.join(root, '.runtime', 'tests', 'accessibility', 'macos');
    const app = File.join(output, 'OpenDeskAccessibilityFixture.app');
    return {
      receipt: File.join(output, 'launch.json'),
      state: File.join(output, 'state.json'),
      pidFile: File.join(output, 'fixture.pid'),
      app,
      executable: File.join(app, 'Contents', 'MacOS', 'OpenDeskAccessibilityFixture'),
    };
  },

  hasExplicitTarget() {
    const rawPID = System.getEnv('OPENDESK_ACCESSIBILITY_TARGET_PID');
    const id = System.getEnv('OPENDESK_ACCESSIBILITY_WINDOW_ID');
    const hasPID = typeof rawPID === 'string' && rawPID.length > 0;
    const hasID = typeof id === 'string' && id.length > 0;
    if (hasPID !== hasID) throw new Error('OPENDESK_ACCESSIBILITY_TARGET_PID and OPENDESK_ACCESSIBILITY_WINDOW_ID must be supplied together');
    return hasPID;
  },

  async runFixtureScript(script, logDirectory) {
    const capabilities = Command.getCapabilities();
    if (!capabilities || !capabilities.enabled || !capabilities.supported) {
      throw new Error('automatic repository-owned fixture setup requires local Command.run capability');
    }
    const root = String(Execution.workdir || File.cwd());
    const binary = File.join(root, 'dist', 'opendesk');
    if (!File.exists(binary)) throw new Error(`automatic repository-owned fixture setup cannot find ${binary}`);
    await Command.run(binary, [
      '-script', File.join('tests', 'accessibility', 'fixtures', 'macos', script),
      '-console-mode', 'script', '-log-dir', logDirectory,
    ], { cwd: root, timeout: 180000, maxOutputBytes: 4 * 1024 * 1024 });
  },

  async launchFixture() {
    await this.runFixtureScript('launch.js', '.runtime/tests/accessibility/fixture-auto-launch');
  },

  async stopFixture() {
    await this.runFixtureScript('stop.js', '.runtime/tests/accessibility/fixture-auto-stop');
  },

  async receiptTarget() {
    const paths = this.paths();
    if (!File.exists(paths.receipt) || !File.exists(paths.pidFile)) {
      throw new Error('no explicit target was supplied and the repository-owned fixture is not running; run tests/accessibility/fixtures/macos/launch.js first');
    }
    let receipt;
    let state;
    let lease;
    try {
      receipt = await File.readJSON(paths.receipt);
      state = await File.readJSON(paths.state);
      lease = String(File.read(paths.pidFile) || '').trim();
    } catch (_) {
      throw new Error('the repository-owned fixture receipt is unreadable; launch a fresh fixture before retrying');
    }
    if (!receipt || receipt.status !== 'ready' || receipt.app !== paths.app || receipt.executable !== paths.executable ||
        receipt.state !== paths.state || !state || typeof state !== 'object') {
      throw new Error('the repository-owned fixture receipt does not match this checkout');
    }
    const pid = this.positivePID(String(receipt.pid), 'fixture receipt pid');
    const windowNumber = Number(receipt.windowNumber);
    if (lease !== String(pid) || !Number.isInteger(windowNumber) || windowNumber <= 0 || Number(state.pid) !== pid || Number(state.windowNumber) !== windowNumber ||
        receipt.windowId !== `darwin:${pid}:native:${windowNumber}`) {
      throw new Error('the repository-owned fixture receipt is stale or inconsistent');
    }
    return { pid, id: receipt.windowId, fixtureExecutable: paths.executable };
  },

  async resolve() {
    const rawPID = System.getEnv('OPENDESK_ACCESSIBILITY_TARGET_PID');
    const id = System.getEnv('OPENDESK_ACCESSIBILITY_WINDOW_ID');
    if (this.hasExplicitTarget()) return { pid: this.positivePID(rawPID, 'OPENDESK_ACCESSIBILITY_TARGET_PID'), id };
    return this.receiptTarget();
  },

  checkedWindowInfo(row, target) {
    if (!row || row.id !== target.id || Number(row.pid) !== target.pid) return null;
    if (target.fixtureExecutable && row.exePath !== target.fixtureExecutable) {
      throw new Error('the fixture receipt resolved to a window with an unexpected executable identity');
    }
    if (/:unresolved$/.test(target.id) || !Number.isInteger(Number(row.handle)) || Number(row.handle) <= 0 || Number(row.handle) > 9007199254740991) {
      throw new Error('The requested window does not have a stable native identity');
    }
    const numeric = ['x', 'y', 'width', 'height', 'index'];
    for (const field of numeric) {
      if (!Number.isInteger(Number(row[field]))) throw new Error('The requested window has invalid identity data');
    }
    if (Number(row.width) <= 0 || Number(row.height) <= 0 || Number(row.index) < 0 ||
        typeof row.title !== 'string' || typeof row.exeName !== 'string' || typeof row.exePath !== 'string' ||
        typeof row.isForeground !== 'boolean' || typeof row.hasFocus !== 'boolean' || typeof row.isPopup !== 'boolean') {
      throw new Error('The requested window is not a complete OpenDeskWindowInfo');
    }
    return {
      id: row.id,
      title: row.title,
      pid: target.pid,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      exeName: row.exeName,
      exePath: row.exePath,
      isForeground: row.isForeground,
      hasFocus: row.hasFocus,
      handle: Number(row.handle),
      isPopup: row.isPopup,
      index: Number(row.index),
    };
  },

  async window(options = {}) {
    const autoLaunch = options.autoLaunch === true;
    let startedByExample = false;
    let target;
    try {
      target = await this.resolve();
    } catch (error) {
      if (!autoLaunch || this.hasExplicitTarget()) throw error;
      await this.launchFixture();
      startedByExample = true;
      target = await this.resolve();
    }
    const matches = (await window.list()).map(row => this.checkedWindowInfo(row, target)).filter(Boolean);
    if (matches.length !== 1) {
      if (target.fixtureExecutable) {
        throw new Error('the repository-owned fixture receipt is stale or its window was recreated; run tests/accessibility/fixtures/macos/launch.js before retrying');
      }
      throw new Error('The explicit PID/window id did not resolve to exactly one current window');
    }
    return { window: matches[0], startedByExample };
  },
})
