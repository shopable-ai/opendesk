(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow vertical toolbar keeps five native buttons ordered, actionable and bounded',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.constructor', 'FloatingWindow.addButton', 'FloatingWindow.getButtonState',
      'FloatingWindow.updateButton', 'FloatingWindow.show', 'FloatingWindow.setPosition', 'FloatingWindow.setPlacement',
      'FloatingWindow.close', 'ui.closeAll', 'mouse.click', 'mouse.clickForPID',
      'clipboard.copy', 'clipboard.paste', 'Screen.getPrimaryDisplay', 'Screen.screenshot',
    ],
  }, async () => {
    const configPath = File.join(File.cwd(), 'examples/custom-ui/toolbar-vertical-quick-replies.json');
    const quickReplyConfig = JSON.parse(File.read(configPath));
    equal(quickReplyConfig.schemaVersion, 1, 'quick-reply config schema changed');
    equal(quickReplyConfig.toolbar.orientation, 'vertical', 'quick-reply layout intent is not JS/JSON controlled');
    assert(!Object.prototype.hasOwnProperty.call(quickReplyConfig.toolbar, 'x')
      && !Object.prototype.hasOwnProperty.call(quickReplyConfig.toolbar, 'y'),
    'quick-reply anchor mode must not also declare x/y');
    equal(JSON.stringify(quickReplyConfig.toolbar.position), JSON.stringify({
      mode: 'anchor', horizontal: 'right', vertical: 'center', margin: 16, display: 'active',
    }), 'quick-reply example stopped using the discriminated right-center anchor position');
    equal(quickReplyConfig.buttons.length, 5, 'quick-reply config no longer has five buttons');
    const buttonsByID = Object.fromEntries(quickReplyConfig.buttons.map(button => [button.id, button]));
    const ids = quickReplyConfig.buttons.map(button => button.id);
    equal(ids.join(','), 'welcome,order,checking,pleaseWait,resolved', 'quick-reply declaration order changed');
    const labels = Object.fromEntries(quickReplyConfig.buttons.map(button => [button.id, button.label]));
    const icons = Object.fromEntries(quickReplyConfig.buttons.map(button => [button.id, button.icon]));
    const replies = Object.fromEntries(quickReplyConfig.buttons.map(button => [button.id, button.reply]));
    equal(JSON.stringify(icons), JSON.stringify({
      welcome: 'message.fill', order: 'doc.text.fill', checking: 'magnifyingglass',
      pleaseWait: 'clock.fill', resolved: 'checkmark',
    }), 'quick replies no longer use their semantic default icons');
    const contents = Object.values(replies);
    equal(new Set(contents).size, 5, 'quick replies must be different');

    const toolbar = new FloatingWindow({
      ...quickReplyConfig.toolbar,
      position: { ...quickReplyConfig.toolbar.position, display: 'primary' },
      alwaysOnTop: true,
    });
    const calls = Object.fromEntries(ids.map(id => [id, 0]));
    const routes = [];
    let releaseBusy;
    const busyGate = new Promise(resolve => { releaseBusy = resolve; });

    toolbar.addButton(buttonsByID.welcome.id, buttonsByID.welcome.label, buttonsByID.welcome.icon, async event => {
      calls.welcome += 1; routes.push({ id: 'welcome', route: 'pointer', targetId: event.targetId });
      await clipboard.copy(replies.welcome);
    });
    toolbar.addButton(buttonsByID.order.id, buttonsByID.order.label, buttonsByID.order.icon, async event => {
      calls.order += 1; routes.push({ id: 'order', route: 'axpress', targetId: event.targetId });
      await clipboard.copy(replies.order);
    });
    toolbar.addButton(buttonsByID.checking.id, buttonsByID.checking.label, buttonsByID.checking.icon, async event => {
      calls.checking += 1; routes.push({ id: 'checking', route: 'pointer', targetId: event.targetId });
      await clipboard.copy(replies.checking);
      await busyGate;
    });
    toolbar.addButton(buttonsByID.pleaseWait.id, buttonsByID.pleaseWait.label, buttonsByID.pleaseWait.icon, async () => {
      calls.pleaseWait += 1;
      await clipboard.copy(replies.pleaseWait);
    });
    toolbar.addButton(buttonsByID.resolved.id, buttonsByID.resolved.label, buttonsByID.resolved.icon, async () => {
      calls.resolved += 1;
      await clipboard.copy(replies.resolved);
    });

    let shown = await toolbar.show();
    equal(shown.bounds.width, 60, 'vertical five-button width changed');
    equal(shown.bounds.height, 273, 'vertical five-button height changed');
    assert(shown.visible && shown.onScreen && shown.alpha > 0 && shown.hostPid > 0, 'vertical toolbar is not visibly native');

    const primary = Screen.getPrimaryDisplay();
    assert(primary && primary.width > shown.bounds.width && primary.height > shown.bounds.height, 'primary display metadata is unavailable');
    const placements = {};
    for (const horizontal of ['left', 'center', 'right']) {
      for (const vertical of ['top', 'center', 'bottom']) {
        placements[horizontal + '-' + vertical] = await toolbar.setPlacement({
          horizontal, vertical, margin: 16, display: 'primary',
        });
      }
    }
    equal(placements['right-top'].bounds.x, placements['right-center'].bounds.x, 'right placements do not share an edge');
    equal(placements['right-center'].bounds.x, placements['right-bottom'].bounds.x, 'right placements drift horizontally');
    assert(placements['right-top'].bounds.y < placements['right-center'].bounds.y
      && placements['right-center'].bounds.y < placements['right-bottom'].bounds.y,
    'right top/center/bottom order is incorrect');
    assert(placements['left-center'].bounds.x < placements['center-center'].bounds.x
      && placements['center-center'].bounds.x < placements['right-center'].bounds.x,
    'left/center/right order is incorrect');
    assert(placements['left-center'].bounds.x - primary.x >= 16,
      'left placement crossed the primary display margin');
    assert(primary.x + primary.width - (placements['right-center'].bounds.x + shown.bounds.width) >= 16,
      'right placement crossed the primary display margin');
    assert(placements['right-top'].bounds.y - primary.y >= 16,
      'top placement crossed the primary display margin');
    assert(primary.y + primary.height - (placements['right-bottom'].bounds.y + shown.bounds.height) >= 16,
      'bottom placement crossed the primary display margin');
    const currentDisplayPlacement = await toolbar.setPlacement({
      horizontal: 'right', vertical: 'center', margin: 16, display: 'current',
    });
    equal(currentDisplayPlacement.bounds.x, placements['right-center'].bounds.x,
      'runtime current-display placement changed the selected display');
    const absolutePosition = await toolbar.setPosition(640, 120);
    equal(absolutePosition.bounds.x, 640, 'setPosition did not switch to absolute positioning');
    equal(absolutePosition.bounds.y, 120, 'setPosition did not switch to absolute positioning');
    shown = await toolbar.setPlacement({ horizontal: 'right', vertical: 'center', margin: 16, display: 'primary' });

    const states = [];
    for (let index = 0; index < ids.length; index += 1) {
      const state = await helper.state(toolbar, ids[index]);
      equal(state.id, ids[index], 'declaration order changed');
      equal(state.icon, icons[ids[index]], 'quick-reply icon changed');
      equal(state.tooltip, labels[ids[index]], 'native tooltip changed');
      equal(state.accessibilityName, labels[ids[index]], 'Accessibility name changed');
      equal(state.localBounds.x, 10, 'vertical button x padding changed');
      equal(state.localBounds.y, 8 + index * 48, 'vertical button order or gap changed');
      equal(state.localBounds.width, 40, 'vertical button width changed');
      equal(state.localBounds.height, 40, 'vertical button height changed');
      equal(state.screenBounds.width, 40, 'vertical screen button width changed');
      equal(state.screenBounds.height, 40, 'vertical screen button height changed');
      states.push(state);
    }
    for (let index = 1; index < states.length; index += 1) {
      equal(states[index].localBounds.x, states[index - 1].localBounds.x, 'vertical buttons do not share x');
      equal(states[index].localBounds.y - states[index - 1].localBounds.y, 48, 'vertical gap is not 8pt');
      equal(states[index].screenBounds.x, states[index - 1].screenBounds.x, 'screen x changed between buttons');
      equal(states[index].screenBounds.y - states[index - 1].screenBounds.y, 48, 'screen vertical gap is not 8pt');
    }
    equal(new Set(states.map(state => JSON.stringify(state.screenBounds))).size, 5, 'native bounds are not unique');
    helper.evidence.layout.vertical = {
      shown,
      states,
      config: {
        path: configPath, schemaVersion: quickReplyConfig.schemaVersion,
        orientation: quickReplyConfig.toolbar.orientation, position: quickReplyConfig.toolbar.position, ids,
      },
      placements,
      geometry: { buttonSize: 40, gap: 8, paddingX: 10, paddingY: 8, maxButtons: 5 },
    };
    helper.evidence.accessibility.verticalFiveButtons = states.map(state => ({
      id: state.id, name: state.accessibilityName, localBounds: state.localBounds, screenBounds: state.screenBounds,
    }));
    await File.ensureDir(helper.root);
    await File.write(File.join(helper.root, 'accessibility.json'), JSON.stringify(helper.evidence.accessibility, null, 2));
    const normal = await helper.screenshot('vertical-normal', shown.bounds);

    await helper.pointer(toolbar, 'welcome');
    await helper.waitFor(() => calls.welcome === 1, 'Pointer callback did not run');
    equal(await clipboard.paste(), replies.welcome, 'Pointer copied the wrong quick reply');
    routes[0].clipboard = await clipboard.paste();
    await helper.waitFor(async () => {
      const welcome = await toolbar.getButtonState('welcome');
      return !welcome.active && !welcome.busy;
    }, 'ordinary quick-reply button retained active or busy state');
    const welcomeAfterClick = await helper.state(toolbar, 'welcome');
    const statesAfterWelcome = await Promise.all(ids.map(id => toolbar.getButtonState(id)));
    assert(statesAfterWelcome.every(state => !state.active), 'quick-reply click left a persistent active state');
    const afterClick = await helper.screenshot('vertical-after-click', shown.bounds);

    await helper.axPress(toolbar, shown, 'order');
    await helper.waitFor(() => calls.order === 1, 'PID AXPress callback did not run');
    equal(await clipboard.paste(), replies.order, 'PID AXPress copied the wrong quick reply');
    routes[1].clipboard = await clipboard.paste();
    assert(routes[0].route !== routes[1].route && routes[0].clipboard !== routes[1].clipboard, 'Pointer and AXPress did not reach different callbacks');
    await helper.waitFor(async () => {
      const order = await toolbar.getButtonState('order');
      return !order.active && !order.busy;
    }, 'AXPress quick reply retained active or busy state');
    const orderAfterClick = await helper.state(toolbar, 'order');
    assert((await Promise.all(ids.map(id => toolbar.getButtonState(id)))).every(state => !state.active), 'AXPress quick reply left a persistent active state');

    await helper.pointer(toolbar, 'checking');
    await helper.waitFor(async () => (await toolbar.getButtonState('checking')).busy, 'vertical busy state was not applied');
    const busyState = await helper.state(toolbar, 'checking');
    assert(!busyState.active, 'ordinary quick-reply button became active while busy');
    equal(busyState.localBounds.y, states[2].localBounds.y, 'busy changed vertical geometry');
    const busy = await helper.screenshot('vertical-busy', shown.bounds);
    await helper.pointer(toolbar, 'checking');
    try { await helper.axPress(toolbar, shown, 'checking'); } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 120));
    equal(calls.checking, 1, 'busy button launched a duplicate callback');
    equal(await clipboard.paste(), replies.checking, 'busy duplicate changed the clipboard');
    releaseBusy();
    await helper.waitFor(async () => !(await toolbar.getButtonState('checking')).busy, 'vertical busy state did not settle');
    assert(!(await toolbar.getButtonState('checking')).active, 'ordinary quick-reply button stayed active after busy settled');

    await toolbar.updateButton('resolved', { disabled: true });
    const disabledState = await helper.state(toolbar, 'resolved');
    assert(disabledState.disabled, 'disabled state did not reach the native button');
    const disabled = await helper.screenshot('vertical-disabled', shown.bounds);
    await clipboard.copy('disabled-sentinel');
    await helper.pointer(toolbar, 'resolved');
    try { await helper.axPress(toolbar, shown, 'resolved'); } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 120));
    equal(calls.resolved, 0, 'disabled button emitted a callback');
    equal(await clipboard.paste(), 'disabled-sentinel', 'disabled button changed the clipboard');

    const closed = await toolbar.close();
    equal(closed.status, 'closed', 'vertical toolbar did not close');
    equal(closed.onScreen, false, 'vertical toolbar stayed on screen after close');
    helper.evidence.callbacks.vertical = {
      calls, routes, pointerClipboard: replies.welcome, axPressClipboard: replies.order,
      busySingleFlight: calls.checking === 1, disabledNoCopy: calls.resolved === 0,
      ordinaryButtonFeedback: {
        pointer: { id: welcomeAfterClick.id, active: welcomeAfterClick.active, busy: welcomeAfterClick.busy },
        axPress: { id: orderAfterClick.id, active: orderAfterClick.active, busy: orderAfterClick.busy },
        screenshot: afterClick,
      },
    };
    helper.evidence.lifecycle.vertical = { status: 'passed', closed: true, state: closed };
    await File.write(File.join(helper.root, 'resources.json'), JSON.stringify({
      schemaVersion: 1,
      vertical: { toolbarStatus: closed.status, onScreen: closed.onScreen, awaitingRuntimeCleanup: true },
    }, null, 2));
    helper.persist();
    await ui.closeAll();
  });
})();
