(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow label drives the native tooltip and Accessibility name before and after update',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.addButton', 'FloatingWindow.updateButton', 'FloatingWindow.getButtonState',
      'FloatingWindow.show', 'FloatingWindow.hide', 'FloatingWindow.close',
      'mouse.move', 'window.getActiveWindow', 'Screen.screenshot',
    ],
  }, async () => {
    const initialLabel = '保存当前任务';
    const updatedLabel = '已保存，可继续编辑';
    const toolbar = new FloatingWindow({ x: 340, y: 300, theme: 'dark', alwaysOnTop: true });
    toolbar.addButton('save', initialLabel, 'tray.and.arrow.down.fill', () => {});

    const focusPID = value => value && (value.pid ?? value.processID);
    const focusBefore = await window.getActiveWindow();

    const declared = await toolbar.getButtonState('save');
    equal(declared.label, initialLabel, 'pre-show label changed');
    equal(declared.tooltip, initialLabel, 'pre-show tooltip did not fall back to label');
    equal(declared.accessibilityName, initialLabel, 'pre-show Accessibility name did not fall back to label');

    const shown = await toolbar.show();
    const initial = await helper.state(toolbar, 'save');
    equal(initial.tooltip, initialLabel, 'native tooltip did not use label');
    equal(initial.accessibilityName, initialLabel, 'native Accessibility name did not use label');

    const visualBounds = {
      x: Math.max(0, shown.bounds.x - 100),
      y: Math.max(0, shown.bounds.y - 100),
      width: 700,
      height: 400,
    };
    await mouse.move(shown.bounds.x + 400, shown.bounds.y + 250);
    await new Promise(resolve => setTimeout(resolve, 150));
    await mouse.move(initial.screenBounds.x + 20, initial.screenBounds.y + 20);
    await helper.waitFor(async () => (await toolbar.getButtonState('save')).tooltipVisible, 'initial native tooltip did not become visible');
    const initialVisible = await helper.state(toolbar, 'save');
    equal(initialVisible.tooltipVisible, true, 'initial native tooltip visibility readback changed');
    const initialVisual = await helper.screenshot('tooltip-initial', visualBounds);
    const focusAfterInitialTooltip = await window.getActiveWindow();
    assert(Number.isInteger(focusPID(focusAfterInitialTooltip)), 'foreground PID is unavailable after tooltip');
    assert(focusPID(focusAfterInitialTooltip) !== shown.hostPid, 'tooltip focused the nonactivating UI host');

    const updated = await toolbar.updateButton('save', { label: updatedLabel });
    equal(updated.label, updatedLabel, 'updated label changed');
    equal(updated.tooltip, updatedLabel, 'native tooltip did not update with label');
    equal(updated.accessibilityName, updatedLabel, 'native Accessibility name did not update with label');

    await mouse.move(shown.bounds.x + shown.bounds.width + 80, shown.bounds.y + shown.bounds.height + 40);
    await new Promise(resolve => setTimeout(resolve, 150));
    await mouse.move(updated.screenBounds.x + 20, updated.screenBounds.y + 20);
    await helper.waitFor(async () => (await toolbar.getButtonState('save')).tooltipVisible, 'updated native tooltip did not become visible');
    const updatedVisual = await helper.screenshot('tooltip-updated', visualBounds);
    const focusAfterUpdatedTooltip = await window.getActiveWindow();
    assert(Number.isInteger(focusPID(focusAfterUpdatedTooltip)), 'foreground PID is unavailable after updated tooltip');
    assert(focusPID(focusAfterUpdatedTooltip) !== shown.hostPid, 'updated tooltip focused the nonactivating UI host');

    const finalState = await helper.state(toolbar, 'save');
    equal(finalState.tooltip, updatedLabel, 'tooltip readback regressed after hover');
    equal(finalState.tooltipVisible, true, 'updated native tooltip visibility readback changed');
    equal(finalState.accessibilityName, updatedLabel, 'Accessibility name regressed after hover');
    const hidden = await toolbar.hide();
    equal(hidden.visible, false, 'toolbar did not hide');
    await new Promise(resolve => setTimeout(resolve, 150));
    const hiddenState = await toolbar.getButtonState('save');
    equal(hiddenState.tooltipVisible, false, 'tooltip remained visible after toolbar.hide()');
    const hiddenVisual = await helper.screenshot('tooltip-hidden', visualBounds);
    await toolbar.close();

    const evidence = {
      labelIsSingleSource: true,
      initial: { label: initialVisible.label, tooltip: initialVisible.tooltip, tooltipVisible: initialVisible.tooltipVisible, accessibilityName: initialVisible.accessibilityName },
      updated: { label: finalState.label, tooltip: finalState.tooltip, tooltipVisible: finalState.tooltipVisible, accessibilityName: finalState.accessibilityName },
      focus: { before: focusBefore, afterInitial: focusAfterInitialTooltip, afterUpdated: focusAfterUpdatedTooltip },
      hidden: { visible: hidden.visible, onScreen: hidden.onScreen, tooltipVisible: hiddenState.tooltipVisible },
      visuals: { initial: initialVisual, updated: updatedVisual, hidden: hiddenVisual },
    };
    helper.evidence.tooltip = evidence;
    await File.write(File.join(helper.root, 'tooltip-evidence.json'), JSON.stringify(evidence, null, 2));
    helper.persist();
  });
})();
