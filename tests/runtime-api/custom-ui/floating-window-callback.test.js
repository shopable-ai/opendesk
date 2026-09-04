(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  const FIVE_BUTTON_FIXTURE_BUTTONS = Object.freeze([
    Object.freeze({ id: 'startPause', label: '开始', icon: 'play.fill' }),
    Object.freeze({ id: 'stop', label: '停止', icon: 'stop.fill' }),
    Object.freeze({ id: 'settings', label: '设置', icon: 'gearshape.fill' }),
    Object.freeze({ id: 'send', label: '发送', icon: 'paperplane.fill' }),
    Object.freeze({ id: 'timer', label: '定时', icon: 'timer' }),
  ]);

  function createFiveButtonFixture({ onAction, beforeAction, afterAction }) {
    const toolbar = new FloatingWindow({ x: 180, y: 120, theme: 'dark', alwaysOnTop: true });
    const calls = Object.fromEntries(FIVE_BUTTON_FIXTURE_BUTTONS.map(button => [button.id, 0]));
    const records = [];
    let running = false;

    function report(button, event, action) {
      calls[button.id] += 1;
      const record = {
        id: button.id,
        targetId: event.targetId,
        label: action === 'pause' ? '暂停' : button.label,
        action,
        count: calls[button.id],
      };
      records.push(record);
      onAction(record);
      return record;
    }

    const button = Object.fromEntries(FIVE_BUTTON_FIXTURE_BUTTONS.map(item => [item.id, item]));
    toolbar.addButton(button.startPause.id, button.startPause.label, button.startPause.icon, async event => {
      const action = running ? 'pause' : 'start';
      const record = report(button.startPause, event, action);
      await beforeAction(record);
      const nextRunning = action === 'start';
      await toolbar.updateButton('startPause', {
        icon: nextRunning ? 'pause.fill' : 'play.fill',
        label: nextRunning ? '暂停' : '开始',
        active: nextRunning,
      });
      running = nextRunning;
      await afterAction(record);
    });
    toolbar.addButton(button.stop.id, button.stop.label, button.stop.icon, async event => {
      const record = report(button.stop, event, 'stop');
      await toolbar.updateButton('startPause', { icon: 'play.fill', label: '开始', active: false });
      running = false;
      await afterAction(record);
    });
    toolbar.addButton(button.settings.id, button.settings.label, button.settings.icon, event => {
      report(button.settings, event, 'settings');
    });
    toolbar.addButton(button.send.id, button.send.label, button.send.icon, async event => {
      await Promise.resolve();
      report(button.send, event, 'send');
    });
    toolbar.addButton(button.timer.id, button.timer.label, button.timer.icon, event => {
      report(button.timer, event, 'timer');
    });

    return {
      toolbar,
      snapshot: () => ({
        running,
        calls: { ...calls },
        records: records.map(record => ({ ...record })),
      }),
    };
  }

  test({
    name: 'FloatingWindow pointer and AXPress share native action, callback single-flight and recoverable state',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.addButton', 'FloatingWindow.updateButton', 'FloatingWindow.getButtonState',
      'FloatingWindow.onButtonClick', 'FloatingWindow.onError', 'FloatingWindow.show', 'FloatingWindow.close',
      'mouse.click', 'mouse.clickForPID', 'mouse.move', 'mouse.down', 'mouse.up', 'System.getSystemInfo',
      'window.getActiveWindow', 'Screen.screenshot',
    ],
  }, async () => {
    equal(
      FIVE_BUTTON_FIXTURE_BUTTONS.map(button => button.id).join(','),
      'startPause,stop,settings,send,timer',
      'five-button test fixture order changed',
    );
    const callbackLog = [];
    let pendingRoute = 'unknown';
    let releaseStart;
    const startGate = new Promise(resolve => { releaseStart = resolve; });
    const fixture = createFiveButtonFixture({
      onAction(record) {
        callbackLog.push({ ...record, branch: record.action, route: pendingRoute });
      },
      async beforeAction(record) {
        if (record.action === 'start') await startGate;
      },
      async afterAction(record) {
        if (record.action !== 'start') return;
        const info = await System.getSystemInfo();
        assert(info && typeof info === 'object');
        helper.evidence.callbacks.runtimeAPI = { method: 'System.getSystemInfo', returnedObject: true };
      },
    });
    const toolbar = fixture.toolbar;
    const callCount = id => fixture.snapshot().calls[id];
    const focusPID = value => value && (value.pid ?? value.processID);
    const focusBefore = await window.getActiveWindow();
    const shown = await toolbar.show();
    const focusAfterShow = await window.getActiveWindow();
    assert(Number.isInteger(focusPID(focusBefore)) && focusPID(focusBefore) > 0, 'active window PID is unavailable');
    equal(focusPID(focusAfterShow), focusPID(focusBefore), 'FloatingWindow.show() stole keyboard focus');
    assert(focusPID(focusAfterShow) !== shown.hostPid, 'FloatingWindow.show() focused the toolbar host');
    const start = await helper.state(toolbar, 'startPause');
    const timerInitial = await helper.state(toolbar, 'timer');
    const semanticFive = [];
    for (const { id, label: name } of FIVE_BUTTON_FIXTURE_BUTTONS) {
      const value = await helper.state(toolbar, id);
      equal(value.accessibilityName, name, id + ' Accessibility name changed');
      semanticFive.push({ id, name: value.accessibilityName, localBounds: value.localBounds, screenBounds: value.screenBounds });
    }
    helper.evidence.accessibility.semanticFiveButtons = semanticFive;
    await File.write(File.join(helper.root, 'accessibility.json'), JSON.stringify(helper.evidence.accessibility, null, 2));
    const normal = await helper.screenshot('normal', shown.bounds);
    const point = { x: start.screenBounds.x + 20, y: start.screenBounds.y + 20 };
    await mouse.move(point.x, point.y);
    await new Promise(resolve => setTimeout(resolve, 80));
    const hover = await helper.screenshot('hover', shown.bounds);
    pendingRoute = 'pointer';
    const pointerPress = (async () => {
      await mouse.down({ button: 'left' });
      await new Promise(resolve => setTimeout(resolve, 400));
      await mouse.up({ button: 'left' });
    })();
    await new Promise(resolve => setTimeout(resolve, 100));
    const pressed = await helper.screenshot('pressed', shown.bounds);
    await pointerPress;
    await helper.waitFor(async () => (await toolbar.getButtonState('startPause')).busy, 'startPause never entered busy');
    const busyState = await helper.state(toolbar, 'startPause');
    for (const key of ['x', 'y', 'width', 'height']) equal(busyState.localBounds[key], start.localBounds[key], 'busy changed ' + key);
    const busy = await helper.screenshot('busy', shown.bounds);
    await helper.pointer(toolbar, 'startPause');
    const focusAfterPointer = await window.getActiveWindow();
    equal(focusPID(focusAfterPointer), focusPID(focusBefore), 'Pointer click activated the nonactivating panel');
    assert(focusPID(focusAfterPointer) !== shown.hostPid, 'Pointer click focused the toolbar host');
    pendingRoute = 'axpress';
    await helper.axPress(toolbar, shown, 'settings');
    await helper.waitFor(() => callCount('settings') === 1, 'settings AXPress callback did not run');
    const focusAfterAXPress = await window.getActiveWindow();
    equal(focusPID(focusAfterAXPress), focusPID(focusBefore), 'AXPress activated the nonactivating panel');
    assert(focusPID(focusAfterAXPress) !== shown.hostPid, 'AXPress focused the toolbar host');
    pendingRoute = 'pointer';
    await helper.pointer(toolbar, 'send');
    await helper.waitFor(() => callCount('send') === 1, 'send pointer callback did not run');
    pendingRoute = 'axpress';
    await helper.axPress(toolbar, shown, 'timer');
    await helper.waitFor(() => callCount('timer') === 1, 'timer AXPress callback did not run');
    equal(callCount('startPause'), 1, 'same-button click was not single-flight');
    equal(callCount('settings'), 1, 'other AX button was blocked by busy button');
    equal(callCount('send'), 1, 'send callback count changed');
    equal(callCount('timer'), 1, 'timer callback count changed');
    equal(callCount('stop'), 0, 'stop callback was unexpectedly invoked while start was busy');
    releaseStart();
    await helper.waitFor(async () => !(await toolbar.getButtonState('startPause')).busy, 'start callback did not settle');
    const active = await helper.screenshot('active', shown.bounds);
    pendingRoute = 'axpress';
    await helper.axPress(toolbar, shown, 'startPause');
    await helper.waitFor(() => callCount('startPause') === 2, 'pause branch did not run');
    equal(fixture.snapshot().records.filter(record => record.id === 'startPause').map(record => record.action).join(','), 'start,pause');
    pendingRoute = 'pointer';
    await helper.pointer(toolbar, 'stop');
    await helper.waitFor(() => callCount('stop') === 1, 'stop pointer callback did not run');
    const reset = await helper.state(toolbar, 'startPause');
    equal(reset.icon, 'play.fill', 'stop did not reset the startPause icon');
    equal(reset.label, '开始', 'stop did not reset the startPause label');
    equal(reset.active, false, 'stop did not reset the startPause active state');
    const resetScreenshot = await helper.screenshot('reset', shown.bounds);
    await toolbar.updateButton('timer', { disabled: true });
    const disabledState = await helper.state(toolbar, 'timer');
    for (const key of ['x', 'y', 'width', 'height']) equal(disabledState.localBounds[key], timerInitial.localBounds[key], 'disabled changed ' + key);
    const disabled = await helper.screenshot('disabled', shown.bounds);
    pendingRoute = 'pointer';
    await helper.pointer(toolbar, 'timer');
    let disabledAXRejected = false;
    try { pendingRoute = 'axpress'; await helper.axPress(toolbar, shown, 'timer'); } catch (_) { disabledAXRejected = true; }
    await new Promise(resolve => setTimeout(resolve, 100));
    equal(callCount('timer'), 1, 'disabled native button emitted an action');
    const fixtureState = fixture.snapshot();
    const calls = fixtureState.calls;
    const branches = fixtureState.records.filter(record => record.id === 'startPause').map(record => record.action);
    equal(JSON.stringify(calls), JSON.stringify({ startPause: 2, stop: 1, settings: 1, send: 1, timer: 1 }));
    await toolbar.close();

    const failing = new FloatingWindow({ x: 520, y: 120, theme: 'dark' });
    let callbackError = null;
    let recovered = 0;
    failing.addButton('failure', 'Failure', 'paperplane.fill', async () => { throw new Error('intentional callback failure'); });
    failing.onError(error => { callbackError = error; });
    const failingShown = await failing.show();
    await helper.pointer(failing, 'failure');
    await helper.waitFor(async () => (await failing.getButtonState('failure')).error.includes('UI_CALLBACK_FAILED'), 'error state was not applied');
    assert(callbackError && callbackError.code === 'UI_CALLBACK_FAILED');
    equal(callbackError.operation, 'FloatingWindow.callback');
    equal(callbackError.windowId, failing.id);
    equal(callbackError.targetId, 'failure');
    equal(callbackError.capability, 'callback');
    equal((await failing.getButtonState('failure')).busy, false);
    const failureState = await helper.state(failing, 'failure');
    equal(failureState.localBounds.width, 40); equal(failureState.localBounds.height, 40);
    const error = await helper.screenshot('error', failingShown.bounds);
    await failing.updateButton('failure', { error: null });
    failing.onButtonClick('failure', () => { recovered += 1; });
    await helper.axPress(failing, failingShown, 'failure');
    await helper.waitFor(() => recovered === 1, 'callback did not recover after error');
    equal((await failing.getButtonState('failure')).error, '');
    await failing.close();
    const callbackEvidence = { fixtureScope: 'test-only', calls, branches, callbackLog, stopReset: {
      id: reset.id, icon: reset.icon, label: reset.label, active: reset.active, revision: reset.revision,
    }, callbackError: {
      code: callbackError.code, operation: callbackError.operation, windowId: callbackError.windowId,
      targetId: callbackError.targetId, capability: callbackError.capability,
    }, disabled: { pointerEmitted: false, axPressEmitted: false, axAPIRejected: disabledAXRejected }, visuals: { normal, hover, pressed, busy, active, reset: resetScreenshot, disabled, error } };
    helper.evidence.callbacks = { ...helper.evidence.callbacks, ...callbackEvidence };
    helper.evidence.routes = {
      staticRouteEvidence: {
        kind: 'source-contract',
        source: 'pkg/customui/machost/floating_toolbar_darwin.m',
        contract: 'accessibilityPerformPress delegates to performClick and shares the NSButton target/action used by Pointer input',
      },
      matchingObservedCallbackRoute: true,
      pointer: callbackLog.filter(item => item.route === 'pointer'),
      axPress: callbackLog.filter(item => item.route === 'axpress'),
    };
    helper.evidence.focus = {
      before: focusBefore, afterShow: focusAfterShow, afterPointer: focusAfterPointer, afterAXPress: focusAfterAXPress,
      nonactivating: true,
    };
    await File.write(File.join(helper.root, 'callback-evidence.json'), JSON.stringify(callbackEvidence, null, 2));
    helper.persist();
  });
})();
