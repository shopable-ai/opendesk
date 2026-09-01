(() => {
  const { assert, equal, test } = RuntimeAPITest;

  test({
    name: 'ui.createWindow retains the restricted WKWebView Custom UI path',
    tier: 'custom-ui',
    covers: ['ui.getCapabilities', 'ui.createWindow', 'ui.on', 'ui.closeAll'],
  }, async () => {
    const capabilities = ui.getCapabilities();
    equal(capabilities.enabled, true);
    equal(capabilities.available, true, capabilities.reason);
    equal(capabilities.activationSource, 'cli');
    let closeEvents = 0;
    const offClose = ui.on('close', event => { if (event.windowId === 'runtimeAPIPanel') closeEvents += 1; });
    const panel = await ui.createWindow({
      id: 'runtimeAPIPanel', kind: 'floating', title: 'Runtime API Custom UI',
      bounds: { x: 140, y: 140, width: 460, height: 180 }, alwaysOnTop: true, draggable: true,
      content: {
        html: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="drag" data-clawdesk-drag>Runtime API</div><button id="save">Save</button><span id="status">Idle</span></body></html>',
        css: 'body{margin:0;background:#111827;color:white;font:14px -apple-system,sans-serif}#drag{padding:18px}button{margin:12px;padding:8px}',
      },
    });
    equal(panel.controls().map(control => control.id).join(','), 'drag,save,status');
    await panel.control('status').update({ text: 'Ready' });
    equal((await panel.control('status').getState()).text, 'Ready');
    const shown = await panel.show();
    assert(shown.onScreen && shown.alpha > 0 && shown.hostPid > 0 && shown.nativeWindowId > 0);
    equal((await panel.close()).status, 'closed');
    equal((await panel.waitUntilClosed()).onScreen, false);
    equal(closeEvents, 1);
    offClose();
    await ui.closeAll();
  });
})();
