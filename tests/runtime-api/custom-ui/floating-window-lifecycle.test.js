(() => {
    const { assert, equal, test } = RuntimeAPITest;
    const helper = FloatingToolbarTest;

    test({
      name: 'FloatingWindow hide, position, topmost, run and user close reach terminal lifecycle',
      tier: 'custom-ui',
      covers: [
        'FloatingWindow.addButton', 'FloatingWindow.removeButton', 'FloatingWindow.getButtonState',
        'FloatingWindow.show', 'FloatingWindow.hide', 'FloatingWindow.close', 'FloatingWindow.setPosition',
        'FloatingWindow.setAlwaysOnTop', 'FloatingWindow.waitUntilClosed', 'FloatingWindow.run', 'ui.closeAll',
      ],
    }, async () => {
      const toolbar = new FloatingWindow({ x: 120, y: 180, theme: 'dark' });
      toolbar.addButton('keep', 'Keep', 'play.fill', () => {});
      toolbar.addButton('remove', 'Remove', 'stop.fill', () => {});
      toolbar.removeButton('remove');
      let shown = await toolbar.show();
      const originalSize = { width: shown.bounds.width, height: shown.bounds.height };
      equal((await toolbar.hide()).visible, false);
      shown = await toolbar.show();
      assert(shown.visible && shown.onScreen);
      const moved = await toolbar.setPosition(360, 240);
      equal(moved.bounds.x, 360); equal(moved.bounds.y, 240);
      equal(moved.bounds.width, originalSize.width); equal(moved.bounds.height, originalSize.height);
      equal((await toolbar.setAlwaysOnTop(false)).alwaysOnTop, false);
      equal((await toolbar.setAlwaysOnTop(true)).alwaysOnTop, true);
      const runPromise = toolbar.run();
      assert((await toolbar.getButtonState('keep')).revision > 0);
      await mouse.click(moved.bounds.x + 13, moved.bounds.y + 13);
      const closed = await runPromise;
      equal(closed.status, 'closed'); equal(closed.onScreen, false); equal(closed.alpha, 0);
      helper.evidence.lifecycle.userClose = { status: 'passed', state: closed };

      const scripted = new FloatingWindow({ x: 440, y: 240, theme: 'dark' });
      scripted.addButton('close', 'Close', 'stop.fill', () => {});
      await scripted.show();
      const waited = scripted.waitUntilClosed();
      await scripted.close();
      const controllerClosed = await waited;
      equal(controllerClosed.status, 'closed');
      helper.evidence.lifecycle.controllerClose = { status: 'passed', state: controllerClosed };
      await ui.closeAll();
      helper.persist();
    });
})();
