(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'ui component gallery keeps HTML state updates and native host readback aligned',
    tier: 'custom-ui',
    covers: [
      'ui.createWindow', 'WindowHandle.controls', 'WindowHandle.show', 'WindowHandle.close',
      'ControlHandle.getState', 'ControlHandle.update', 'mouse.click', 'keyboard.press', 'Screen.screenshot',
    ],
  }, async () => {
    const sourceDir = File.join(File.cwd(), 'examples', 'custom-ui', 'ui-components');
    const componentDir = File.join(Execution.scriptDir, '.ui-components-fixture-' + RuntimeAPITest.context.runId);
    await File.ensureDir(componentDir);
    await File.write(File.join(componentDir, 'panel.html'), File.read(File.join(sourceDir, 'panel.html')));
    await File.write(File.join(componentDir, 'panel.css'), File.read(File.join(sourceDir, 'panel.css')));
    let panel = null;
    try {
      panel = await ui.createWindow({
        id: 'uiComponentsRuntimeTest',
        kind: 'normal',
        title: 'Custom UI component states',
        position: {
          mode: 'anchor',
          size: { width: 760, height: 780 },
          horizontal: 'center',
          vertical: 'center',
          display: 'active',
        },
        draggable: true,
        theme: 'dark',
        content: {
          file: File.join(componentDir, 'panel.html'),
          cssFile: File.join(componentDir, 'panel.css'),
        },
      });

      const ids = panel.controls().map(control => control.id);
      for (const id of [
        'dragbar', 'mode', 'modeDefault', 'modeHover', 'modeFocus', 'modeDisabled', 'modeInvalid',
        'query', 'queryEmpty', 'queryHover', 'queryFocus', 'queryDisabled', 'queryInvalid',
        'saveButton', 'buttonDefault', 'buttonHover', 'buttonFocus', 'buttonActive',
        'buttonDisabled', 'buttonLoading', 'buttonSuccess', 'buttonError',
        'simulateError', 'toggleSelect', 'reset', 'close',
      ]) {
        assert(ids.includes(id), 'component gallery is missing stable control ' + id);
      }

      const shown = await panel.show();
      assert(shown.onScreen && shown.alpha > 0 && shown.nativeWindowId > 0, 'component gallery did not become visible');
      const ready = {
        select: await panel.control('mode').getState(),
        input: await panel.control('query').getState(),
        save: await panel.control('saveButton').getState(),
        disabled: await panel.control('buttonDisabled').getState(),
      };
      equal(ready.select.value, 'ready', 'select initial value changed');
      equal(ready.select.disabled, false, 'select unexpectedly disabled');
      equal(ready.input.value, '', 'input initial value changed');
      equal(ready.save.text, 'Save changes', 'button initial text changed');
      equal(ready.save.busy, false, 'button unexpectedly busy');
      equal(ready.disabled.disabled, true, 'disabled button lost disabled state');

      const screenshotPath = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'ui-components', 'ready.png');
      await File.ensureDir(File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'ui-components'));
      const capture = await Screen.screenshot({ clip: shown.bounds, path: screenshotPath, returnType: 'object' });
      assert(capture.sizeBytes > 100 && await File.exists(screenshotPath), 'component gallery screenshot was not written');
      await mouse.click(ready.input.screenBounds.x + ready.input.screenBounds.width / 2, ready.input.screenBounds.y + ready.input.screenBounds.height / 2);
      await keyboard.press('Tab');
      const tabFocusPath = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'ui-components', 'tab-focus.png');
      const tabFocusCapture = await Screen.screenshot({ clip: shown.bounds, path: tabFocusPath, returnType: 'object' });
      assert(tabFocusCapture.sizeBytes > 100 && await File.exists(tabFocusPath), 'HTML Tab focus screenshot was not written');

      const select = await panel.control('mode').update({ value: 'review', disabled: true, classes: ['component-control', 'cd-select', 'is-disabled'] });
      equal(select.value, 'review', 'select value update did not apply');
      equal(select.disabled, true, 'select disabled update did not apply');
      const input = await panel.control('query').update({ value: 'demo', classes: ['component-control', 'cd-input'] });
      equal(input.value, 'demo', 'input value update did not apply');
      const busy = await panel.control('saveButton').update({
        text: 'Saving…', busy: true, disabled: true,
        classes: ['cd-button', 'cd-button-primary', 'is-busy'],
      });
      equal(busy.text, 'Saving…', 'busy button text did not apply');
      equal(busy.busy, true, 'busy button state did not apply');
      equal(busy.disabled, true, 'busy button did not become disabled');
      const error = await panel.control('saveButton').update({
        text: 'Try again', busy: false, disabled: false, error: 'The sample request failed.',
        classes: ['cd-button', 'cd-button-primary', 'is-error'],
      });
      equal(error.text, 'Try again', 'error button text did not apply');
      equal(error.busy, false, 'error button remained busy');
      equal(error.disabled, false, 'error button remained disabled');
      equal(error.error, 'The sample request failed.', 'error readback did not apply');
      assert(error.classes.includes('is-error'), 'error class did not round-trip');
      const errorScreenshotPath = File.join(RuntimeAPITest.context.runDir, 'runtime-logs', 'custom-ui', 'ui-components', 'error.png');
      const errorCapture = await Screen.screenshot({ clip: shown.bounds, path: errorScreenshotPath, returnType: 'object' });
      assert(errorCapture.sizeBytes > 100 && await File.exists(errorScreenshotPath), 'component gallery error screenshot was not written');
    } finally {
      if (panel) await panel.close();
      await ui.closeAll();
      if (File.exists(componentDir)) await File.removeDir(componentDir);
    }
  });
})();
