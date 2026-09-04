// Shared helper for the horizontal actions example in this directory.
// It only maps JavaScript data to the documented FloatingWindow API; the
// native host never reads these configuration objects directly.
(() => {
  function validateConfig(config) {
    if (!config || config.schemaVersion !== 1 || !config.toolbar || !Array.isArray(config.buttons)) {
      throw new Error('toolbar config must contain schemaVersion: 1, toolbar, and buttons');
    }
    const orientation = config.toolbar.orientation || 'horizontal';
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new Error('toolbar.orientation must be "horizontal" or "vertical"');
    }
    if (orientation === 'vertical' && config.buttons.length > 5) {
      throw new Error('vertical toolbars support at most five buttons');
    }
  }

  async function run({ config, logPrefix, onButtonClick, onShown, onClosed }) {
    validateConfig(config);
    if (typeof onButtonClick !== 'function') {
      throw new Error('toolbar example requires an onButtonClick callback');
    }

    const toolbar = new FloatingWindow(config.toolbar);
    for (const button of config.buttons) {
      toolbar.addButton(button.id, button.label, button.icon, () => onButtonClick(button, toolbar));
    }

    toolbar.onError(error => {
      console.error(logPrefix + '_ERROR=' + JSON.stringify({
        code: error.code,
        operation: error.operation,
        targetId: error.targetId,
        message: error.message,
      }));
    });

    const shown = await toolbar.show();
    if (onShown) await onShown(toolbar, shown);
    console.log(logPrefix + '_READY=' + JSON.stringify({
      orientation: config.toolbar.orientation || 'horizontal',
      position: config.toolbar.position || null,
      bounds: shown.bounds,
      buttonIds: config.buttons.map(button => button.id),
    }));

    const closed = await toolbar.waitUntilClosed();
    if (onClosed) await onClosed(toolbar, closed);
    return { toolbar, shown, closed };
  }

  globalThis.ToolbarExample = Object.freeze({ run, validateConfig });
})();
