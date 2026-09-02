(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow vertical toolbar keeps five native buttons ordered, actionable and bounded',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.constructor', 'FloatingWindow.addButton', 'FloatingWindow.getButtonState',
      'FloatingWindow.updateButton', 'FloatingWindow.show', 'FloatingWindow.close', 'ui.closeAll',
      'mouse.click', 'mouse.clickForPID', 'clipboard.copy', 'clipboard.paste', 'Screen.screenshot',
    ],
  }, async () => {
    const configPath = File.join(File.cwd(), 'examples/custom-ui/toolbar-vertical-quick-replies.json');
    const quickReplyConfig = JSON.parse(File.read(configPath));
    equal(quickReplyConfig.schemaVersion, 1, 'quick-reply config schema changed');
    equal(quickReplyConfig.toolbar.orientation, 'vertical', 'quick-reply layout intent is not JS/JSON controlled');
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

    const toolbar = new FloatingWindow({ ...quickReplyConfig.toolbar, x: 640, y: 120, alwaysOnTop: true });
    const calls = Object.fromEntries(ids.map(id => [id, 0]));
    const routes = [];
    const selectReply = async selectedID => {
      await Promise.all(ids.map(id => toolbar.updateButton(id, { active: id === selectedID })));
    };
    let releaseBusy;
    const busyGate = new Promise(resolve => { releaseBusy = resolve; });

    toolbar.addButton(buttonsByID.welcome.id, buttonsByID.welcome.label, buttonsByID.welcome.icon, async event => {
      calls.welcome += 1; routes.push({ id: 'welcome', route: 'pointer', targetId: event.targetId });
      await clipboard.copy(replies.welcome);
      await selectReply('welcome');
    });
    toolbar.addButton(buttonsByID.order.id, buttonsByID.order.label, buttonsByID.order.icon, async event => {
      calls.order += 1; routes.push({ id: 'order', route: 'axpress', targetId: event.targetId });
      await clipboard.copy(replies.order);
      await selectReply('order');
    });
    toolbar.addButton(buttonsByID.checking.id, buttonsByID.checking.label, buttonsByID.checking.icon, async event => {
      calls.checking += 1; routes.push({ id: 'checking', route: 'pointer', targetId: event.targetId });
      await clipboard.copy(replies.checking);
      await selectReply('checking');
      await busyGate;
    });
    toolbar.addButton(buttonsByID.pleaseWait.id, buttonsByID.pleaseWait.label, buttonsByID.pleaseWait.icon, async () => {
      calls.pleaseWait += 1;
      await clipboard.copy(replies.pleaseWait);
      await selectReply('pleaseWait');
    });
    toolbar.addButton(buttonsByID.resolved.id, buttonsByID.resolved.label, buttonsByID.resolved.icon, async () => {
      calls.resolved += 1;
      await clipboard.copy(replies.resolved);
      await selectReply('resolved');
    });

    const shown = await toolbar.show();
    equal(shown.bounds.x, 640, 'vertical layout changed x');
    equal(shown.bounds.y, 120, 'vertical layout changed y');
    equal(shown.bounds.width, 60, 'vertical five-button width changed');
    equal(shown.bounds.height, 273, 'vertical five-button height changed');
    assert(shown.visible && shown.onScreen && shown.alpha > 0 && shown.hostPid > 0, 'vertical toolbar is not visibly native');

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
      config: { path: configPath, schemaVersion: quickReplyConfig.schemaVersion, orientation: quickReplyConfig.toolbar.orientation, ids },
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
      return welcome.active && !welcome.busy;
    }, 'selected quick reply did not settle as active');
    const welcomeActive = await helper.state(toolbar, 'welcome');
    const inactiveAfterWelcome = await Promise.all(ids.slice(1).map(id => toolbar.getButtonState(id)));
    assert(inactiveAfterWelcome.every(state => !state.active), 'quick-reply selection was not exclusive after pointer click');
    const active = await helper.screenshot('vertical-active', shown.bounds);

    await helper.axPress(toolbar, shown, 'order');
    await helper.waitFor(() => calls.order === 1, 'PID AXPress callback did not run');
    equal(await clipboard.paste(), replies.order, 'PID AXPress copied the wrong quick reply');
    routes[1].clipboard = await clipboard.paste();
    assert(routes[0].route !== routes[1].route && routes[0].clipboard !== routes[1].clipboard, 'Pointer and AXPress did not reach different callbacks');
    await helper.waitFor(async () => {
      const order = await toolbar.getButtonState('order');
      return order.active && !order.busy;
    }, 'AXPress quick reply did not become active');
    const orderActive = await helper.state(toolbar, 'order');
    assert(!(await toolbar.getButtonState('welcome')).active, 'previous quick-reply selection stayed active');

    await helper.pointer(toolbar, 'checking');
    await helper.waitFor(async () => (await toolbar.getButtonState('checking')).busy, 'vertical busy state was not applied');
    const busyState = await helper.state(toolbar, 'checking');
    equal(busyState.localBounds.y, states[2].localBounds.y, 'busy changed vertical geometry');
    const busy = await helper.screenshot('vertical-busy', shown.bounds);
    await helper.pointer(toolbar, 'checking');
    try { await helper.axPress(toolbar, shown, 'checking'); } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 120));
    equal(calls.checking, 1, 'busy button launched a duplicate callback');
    equal(await clipboard.paste(), replies.checking, 'busy duplicate changed the clipboard');
    releaseBusy();
    await helper.waitFor(async () => !(await toolbar.getButtonState('checking')).busy, 'vertical busy state did not settle');

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
      activeSelection: {
        pointer: { id: welcomeActive.id, active: welcomeActive.active, busy: welcomeActive.busy },
        axPress: { id: orderActive.id, active: orderActive.active, busy: orderActive.busy },
        screenshot: active,
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
