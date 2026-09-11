// Windows hosted live contract for the repository-owned Window Manager fixture.
// The PowerShell harness supplies two controlled fixture processes: a normal
// top-level window with a focused EDIT child, and a deliberately hung WM_CLOSE
// window used to prove bounded close delivery.
(async () => {
  const title = System.getEnv('OPENDESK_WINDOW_FIXTURE_TITLE');
  const pid = Number(System.getEnv('OPENDESK_WINDOW_FIXTURE_PID'));
  const hungTitle = System.getEnv('OPENDESK_WINDOW_HUNG_TITLE');
  const hungPID = Number(System.getEnv('OPENDESK_WINDOW_HUNG_PID'));
  const checks = [];

  function assert(condition, message, details) {
    if (!condition) {
      const error = new Error(message);
      error.details = details;
      throw error;
    }
  }

  function pass(name, details) {
    const check = { name, status: 'passed', ...(details || {}) };
    checks.push(check);
    console.log('WINDOW_MANAGER_CHECK ' + JSON.stringify(check));
  }

  async function expectCode(name, expected, action) {
    try {
      await action();
    } catch (error) {
      const actual = error && error.code || '';
      console.log('WINDOW_MANAGER_EXPECTED_ERROR ' + JSON.stringify({
        name,
        expected,
        actual,
        message: String(error && error.message || error),
      }));
      assert(actual === expected,
        `${name}: expected ${expected}, got ${actual}`,
        { message: String(error && error.message || error) });
      pass(name, { code: actual });
      return error;
    }
    throw new Error(`${name}: expected ${expected}, operation succeeded`);
  }

  function evidence(status, error) {
    return {
      schemaVersion: 1,
      suite: 'windows-window-manager-live',
      status,
      platform: System.getPlatformInfo(),
      fixture: { title, pid, hungTitle, hungPID },
      checks,
      error: error ? {
        message: String(error.message || error),
        code: error.code || '',
        details: error.details || null,
      } : null,
      recordedAt: new Date().toISOString(),
    };
  }

  try {
    assert(title && Number.isInteger(pid) && pid > 0, 'normal fixture environment is invalid');
    assert(hungTitle && Number.isInteger(hungPID) && hungPID > 0, 'hung fixture environment is invalid');

    const initial = await window.wait({ title, pid }, { timeout: 8000, polling: 50 });
    assert(initial.title === title && initial.pid === pid, 'window.wait returned the wrong fixture', initial);
    assert(initial.width > 0 && initial.height > 0, 'fixture bounds are invalid', initial);
    pass('wait unique fixture', { id: initial.id, bounds: { x: initial.x, y: initial.y, width: initial.width, height: initial.height } });

    const rows = window.list({ title, pid });
    assert(rows.length === 1, 'window.list did not return exactly one controlled fixture', { count: rows.length });
    assert(rows[0].pid === pid && rows[0].title === title, 'window.list identity mismatch', rows[0]);
    pass('enumeration identity', {
      pid: rows[0].pid,
      title: rows[0].title,
      hasExecutableMetadata: Boolean(rows[0].exeName || rows[0].exePath),
    });

    const byTarget = await window.get({ title, pid });
    assert(byTarget.id === initial.id, 'window.get did not preserve current HWND identity', { initial: initial.id, current: byTarget.id });
    pass('window.get unique target', { id: byTarget.id });

    const missingTitle = `${title}__missing__`;
    await expectCode('window.get not found', 'NOT_FOUND', () => window.get({ title: missingTitle }));
    await expectCode('window.wait missing timeout', 'TIMEOUT', () => window.wait({ title: missingTitle }, { timeout: 120, polling: 20 }));

    await window.focus(title);
    const active = await window.getActiveWindow();
    assert(active.pid === pid && active.title === title, 'getActiveWindow did not return fixture top-level window', active);
    pass('active top-level', { handle: active.handle, pid: active.pid });

    const focused = window.getFocusWindow();
    assert(focused && focused.pid === pid, 'getFocusWindow returned a different process', focused);
    assert(focused.hasFocus === true, 'focused child does not report hasFocus', focused);
    assert(focused.handle !== active.handle, 'focused child should have a distinct HWND from the top-level fixture', { active: active.handle, focus: focused.handle });
    pass('focused child', { handle: focused.handle, title: focused.title });

    await window.setWindowBounds(title, 210, 160, 700, 460);
    let observed = await window.get({ title, pid });
    assert(observed.x === 210 && observed.y === 160 && observed.width === 700 && observed.height === 460,
      'setWindowBounds post-condition mismatch', observed);
    pass('set bounds readback', { x: observed.x, y: observed.y, width: observed.width, height: observed.height });

    await window.setWindowBounds(title, -30, 110, 680, 440);
    observed = await window.get({ title, pid });
    assert(observed.x === -30 && observed.y === 110, 'negative coordinate contract was not preserved', observed);
    pass('negative coordinates', { x: observed.x, y: observed.y });

    await window.setWidth(title, 720);
    observed = await window.get({ title, pid });
    assert(observed.width === 720, 'setWidth post-condition mismatch', observed);
    await window.setHeight(title, 480);
    observed = await window.get({ title, pid });
    assert(observed.height === 480, 'setHeight post-condition mismatch', observed);
    pass('move and resize', { width: observed.width, height: observed.height });

    await window.minimize(title);
    await window.restore(title);
    await window.maximize(title);
    await window.restore(title);
    pass('minimize maximize restore post-conditions');

    await window.setAlwaysOnTop(title, true);
    await window.unsetTopMost(title);
    pass('topmost on off post-conditions');

    await window.bringToTop(title, pid);
    const brought = await window.getActiveWindow();
    assert(brought.pid === pid && brought.title === title, 'bringToTop did not become foreground', brought);
    pass('bringToTop foreground readback');

    const closeStarted = Date.now();
    const closeError = await expectCode('hung close bounded timeout', 'TIMEOUT', () => window.closeWindow(hungTitle));
    const closeElapsedMS = Date.now() - closeStarted;
    assert(closeElapsedMS < 4000, 'hung close exceeded bounded timeout budget', { closeElapsedMS, closeError: closeError.message });
    pass('hung close runtime remains responsive', { elapsedMS: closeElapsedMS });

    const staleID = initial.id;
    await window.closeWindow(title);
    await expectCode('closed identity unavailable', 'NOT_FOUND', () => window.get({ id: staleID }));
    await expectCode('already closed title unavailable', 'NOT_FOUND', () => window.closeWindow(title));
    pass('normal close verified');

    console.log('WINDOW_MANAGER_EVIDENCE ' + JSON.stringify(evidence('passed')));
    console.log('WINDOW_MANAGER_LIVE_PASS');
  } catch (error) {
    const payload = evidence('failed', error);
    console.log('WINDOW_MANAGER_EVIDENCE ' + JSON.stringify(payload));
    const code = error && error.code || '';
    const message = String(error && error.message || error);
    throw new Error(`WINDOW_MANAGER_LIVE_FAIL code=${code} message=${message}`);
  }
})();
