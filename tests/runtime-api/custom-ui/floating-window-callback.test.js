(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

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
    const toolbar = new FloatingWindow({ x: 180, y: 120, theme: 'dark', alwaysOnTop: true });
    const calls = { startPause: 0, stop: 0, settings: 0, send: 0, timer: 0 };
    const branches = [];
    const callbackLog = [];
    let pendingRoute = 'unknown';
    let running = false;
    let releaseStart;
    const startGate = new Promise(resolve => { releaseStart = resolve; });
    toolbar.addButton('startPause', '开始', 'play.fill', async event => {
      calls.startPause += 1;
      if (!running) {
        branches.push('start');
        callbackLog.push({ targetId: event.targetId, label: '开始', branch: 'start', count: calls.startPause, route: pendingRoute });
        await startGate;
        const info = await System.getSystemInfo();
        assert(info && typeof info === 'object');
        helper.evidence.callbacks.runtimeAPI = { method: 'System.getSystemInfo', returnedObject: true };
        running = true;
        await toolbar.updateButton('startPause', { icon: 'pause.fill', label: '暂停', active: true });
      } else {
        branches.push('pause');
        callbackLog.push({ targetId: event.targetId, label: '暂停', branch: 'pause', count: calls.startPause, route: pendingRoute });
        running = false;
        await toolbar.updateButton('startPause', { icon: 'play.fill', label: '开始', active: false });
      }
    });
    toolbar.addButton('stop', '停止', 'stop.fill', async event => {
      calls.stop += 1; callbackLog.push({ targetId: event.targetId, label: '停止', branch: 'stop', count: calls.stop, route: pendingRoute });
      running = false;
      await toolbar.updateButton('startPause', { icon: 'play.fill', label: '开始', active: false });
    });
    toolbar.addButton('settings', '设置', 'gearshape.fill', event => {
      calls.settings += 1; callbackLog.push({ targetId: event.targetId, label: '设置', branch: 'settings', count: calls.settings, route: pendingRoute });
    });
    toolbar.addButton('send', '发信', 'paperplane.fill', async event => {
      await Promise.resolve(); calls.send += 1;
      callbackLog.push({ targetId: event.targetId, label: '发信', branch: 'send', count: calls.send, route: pendingRoute });
    });
    toolbar.addButton('timer', '定时', 'timer', event => {
      calls.timer += 1; callbackLog.push({ targetId: event.targetId, label: '定时', branch: 'timer', count: calls.timer, route: pendingRoute });
    });
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
    for (const [id, name] of [['startPause', '开始'], ['stop', '停止'], ['settings', '设置'], ['send', '发信'], ['timer', '定时']]) {
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
    await helper.waitFor(() => calls.settings === 1, 'settings AXPress callback did not run');
    const focusAfterAXPress = await window.getActiveWindow();
    equal(focusPID(focusAfterAXPress), focusPID(focusBefore), 'AXPress activated the nonactivating panel');
    assert(focusPID(focusAfterAXPress) !== shown.hostPid, 'AXPress focused the toolbar host');
    pendingRoute = 'pointer';
    await helper.pointer(toolbar, 'send');
    await helper.waitFor(() => calls.send === 1, 'send pointer callback did not run');
    pendingRoute = 'axpress';
    await helper.axPress(toolbar, shown, 'timer');
    await helper.waitFor(() => calls.timer === 1, 'timer AXPress callback did not run');
    equal(calls.startPause, 1, 'same-button click was not single-flight');
    equal(calls.settings, 1, 'other AX button was blocked by busy button');
    equal(calls.send, 1, 'send callback count changed');
    equal(calls.timer, 1, 'timer callback count changed');
    equal(calls.stop, 0, 'stop callback was unexpectedly invoked while start was busy');
    releaseStart();
    await helper.waitFor(async () => !(await toolbar.getButtonState('startPause')).busy, 'start callback did not settle');
    const active = await helper.screenshot('active', shown.bounds);
    pendingRoute = 'axpress';
    await helper.axPress(toolbar, shown, 'startPause');
    await helper.waitFor(() => calls.startPause === 2, 'pause branch did not run');
    equal(branches.join(','), 'start,pause');
    pendingRoute = 'pointer';
    await helper.pointer(toolbar, 'stop');
    await helper.waitFor(() => calls.stop === 1, 'stop pointer callback did not run');
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
    equal(calls.timer, 1, 'disabled native button emitted an action');
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
    const callbackEvidence = { calls, branches, callbackLog, stopReset: {
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
