(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'native UI component gallery uses real peers with state and accessibility readback',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.constructor', 'FloatingWindow.addLabel', 'FloatingWindow.addSwitch',
      'FloatingWindow.addCheckbox', 'FloatingWindow.addInput', 'FloatingWindow.addSelect',
      'FloatingWindow.addSegmentedControl', 'FloatingWindow.addSlider', 'FloatingWindow.addProgress',
      'FloatingWindow.addButton', 'FloatingWindow.updateButton', 'FloatingWindow.updateControl',
      'FloatingWindow.getButtonState', 'FloatingWindow.getControlState', 'FloatingWindow.show',
      'FloatingWindow.close', 'mouse.move', 'mouse.down', 'mouse.up', 'mouse.click', 'Screen.screenshot',
    ],
  }, async () => {
    const toolbar = new FloatingWindow({
      id: 'nativeUIComponentsRuntimeTest',
      position: { mode: 'anchor', horizontal: 'center', vertical: 'center', margin: 16, display: 'active' },
      title: 'Native UI component states',
      theme: 'dark',
      toolbar: { maxWidth: 580, maxColumns: 2, maxRows: 8 },
    });

    toolbar.addLabel('surface', 'NATIVE UI / REAL PEERS', { width: 220, tone: 'secondary' });
    toolbar.addLabel('status', 'Native peers · dark theme', { width: 220, tone: 'secondary' });
    toolbar.addSwitch('liveSync', 'Live sync', { value: true, width: 150 });
    toolbar.addCheckbox('includeMeta', 'Include metadata', { value: false, width: 180 });
    toolbar.addInput('query', 'Search', { value: 'demo', placeholder: 'Click to focus', maxLength: 64, width: 220 });
    toolbar.addSelect('density', 'Density', {
      value: 'comfortable',
      width: 220,
      options: [
        { value: 'compact', label: 'Compact' },
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'spacious', label: 'Spacious' },
      ],
    });
    toolbar.addSegmentedControl('scope', 'Scope', {
      value: 'page',
      width: 220,
      options: [{ value: 'page', label: 'Page' }, { value: 'app', label: 'App' }],
    });
    toolbar.addSlider('contrast', 'Contrast', { min: 0, max: 100, value: 75, step: 5, width: 220 });
    toolbar.addProgress('progress', 'Progress', { min: 0, max: 1, value: 0.68, width: 220 });
    toolbar.addButton('defaultButton', 'Default button', 'checkmark');
    toolbar.addButton('loadingButton', 'Loading button', 'arrow.clockwise');
    toolbar.addButton('successButton', 'Success convention', 'checkmark');
    toolbar.addButton('errorButton', 'Error button', 'exclamationmark.triangle');
    toolbar.addButton('disabledButton', 'Disabled button', 'stop.fill');
    toolbar.addButton('resetButton', 'Reset native states', 'arrow.counterclockwise');
    toolbar.addLabel('limits', 'Native: fixed · dark · typed', { width: 240, tone: 'warning' });

    let shown = null;
    try {
      shown = await toolbar.show();
      assert(shown.onScreen && shown.hostPid > 0 && shown.nativeWindowId > 0, 'native component toolbar did not become visible');

      await Promise.all([
        toolbar.updateButton('loadingButton', { busy: true, error: null }),
        toolbar.updateButton('successButton', { active: true, badge: 'OK', error: null }),
        toolbar.updateButton('errorButton', { error: 'Sample error' }),
        toolbar.updateButton('disabledButton', { disabled: true, error: null }),
        toolbar.updateControl('progress', { indeterminate: true }),
        toolbar.updateLabel('status', { text: 'States: loading · success · error', tone: 'secondary' }),
      ]);

      const query = await toolbar.getControlState('query');
      const density = await toolbar.getControlState('density');
      const progress = await toolbar.getControlState('progress');
      equal(query.type, 'input', 'native input type changed');
      equal(query.value, 'demo', 'native input value changed');
      equal(query.accessibilityRole, 'AXTextField', 'native input role is not read back');
      assert(!query.focused, 'show() must not steal keyboard focus');
      assert(query.screenBounds.width > 0 && query.screenBounds.height > 0, 'native input has no screen bounds');
      equal(density.value, 'comfortable', 'native select value changed');
      equal(density.accessibilityRole, 'AXPopUpButton', 'native select role is not read back');
      equal(progress.indeterminate, true, 'native progress did not enter indeterminate loading state');

      const loading = await toolbar.getButtonState('loadingButton');
      const defaultButton = await toolbar.getButtonState('defaultButton');
      const success = await toolbar.getButtonState('successButton');
      const error = await toolbar.getButtonState('errorButton');
      const disabled = await toolbar.getButtonState('disabledButton');
      equal(loading.busy, true, 'native busy state did not apply');
      equal(success.active, true, 'native active state did not apply');
      equal(success.badge, 'OK', 'native badge state did not apply');
      equal(error.error, 'Sample error', 'native error state did not apply');
      equal(disabled.disabled, true, 'native disabled state did not apply');
      assert(success.localBounds.width === 40 && success.localBounds.height === 40, 'native button geometry changed');
      assert(success.accessibilityName === 'Success convention', 'native button accessibility name is not stable');

      const evidenceDir = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'native-ui-components');
      await File.ensureDir(evidenceDir);
      const screenshotPath = File.join(evidenceDir, 'native-states.png');
      const capture = await Screen.screenshot({ clip: shown.bounds, path: screenshotPath, returnType: 'object' });
      assert(capture.sizeBytes > 100 && await File.exists(screenshotPath), 'native component screenshot was not written');
      await mouse.move(defaultButton.screenBounds.x + defaultButton.screenBounds.width / 2, defaultButton.screenBounds.y + defaultButton.screenBounds.height / 2);
      const hoverPath = File.join(evidenceDir, 'native-hover.png');
      const hoverCapture = await Screen.screenshot({ clip: shown.bounds, path: hoverPath, returnType: 'object' });
      assert(hoverCapture.sizeBytes > 100 && await File.exists(hoverPath), 'native hover screenshot was not written');
      await mouse.down({ button: 'left' });
      const pressedPath = File.join(evidenceDir, 'native-pressed.png');
      const pressedCapture = await Screen.screenshot({ clip: shown.bounds, path: pressedPath, returnType: 'object' });
      await mouse.up({ button: 'left' });
      assert(pressedCapture.sizeBytes > 100 && await File.exists(pressedPath), 'native pressed screenshot was not written');
      await mouse.click(query.screenBounds.x + query.screenBounds.width / 2, query.screenBounds.y + query.screenBounds.height / 2);
      const focusedQuery = await toolbar.getControlState('query');
      assert(focusedQuery.focused === true, 'native input did not receive keyboard focus after a real click');
      const focusPath = File.join(evidenceDir, 'native-input-focus.png');
      const focusCapture = await Screen.screenshot({ clip: shown.bounds, path: focusPath, returnType: 'object' });
      assert(focusCapture.sizeBytes > 100 && await File.exists(focusPath), 'native input focus screenshot was not written');
      await File.write(File.join(evidenceDir, 'native-states.json'), JSON.stringify({
        schemaVersion: 1,
        surface: 'native',
        bounds: shown.bounds,
        hostPid: shown.hostPid,
        nativeWindowId: shown.nativeWindowId,
        controls: { query, focusedQuery, density, progress },
        buttons: { defaultButton, loading, success, error, disabled },
        screenshots: { states: screenshotPath, hover: hoverPath, pressed: pressedPath, inputFocus: focusPath },
      }, null, 2));
    } finally {
      if (shown) await toolbar.close();
    }
  });
})();
