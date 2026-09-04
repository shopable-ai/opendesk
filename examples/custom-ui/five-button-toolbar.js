// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/five-button-toolbar.js -console-mode script -log-dir .runtime/examples/custom-ui/five-button-toolbar

const toolbar = new FloatingWindow({
  position: { mode: 'absolute', x: 100, y: 100 },
  title: '五按钮工具栏',
  theme: 'dark',
  alwaysOnTop: true,
});
let running = false;

function logAction(id, action) {
  console.log('FIVE_BUTTON_TOOLBAR_ACTION=' + JSON.stringify({ id, action }));
}

toolbar.addButton('startPause', '开始', 'play.fill', async () => {
  const nextRunning = !running;
  logAction('startPause', nextRunning ? 'start' : 'pause');
  await toolbar.updateButton('startPause', {
    icon: nextRunning ? 'pause.fill' : 'play.fill',
    label: nextRunning ? '暂停' : '开始',
    active: nextRunning,
  });
  running = nextRunning;
});

toolbar.addButton('stop', '停止', 'stop.fill', async () => {
  logAction('stop', 'stop');
  await toolbar.updateButton('startPause', {
    icon: 'play.fill',
    label: '开始',
    active: false,
  });
  running = false;
});

toolbar.addButton('settings', '设置', 'gearshape.fill', () => logAction('settings', 'settings'));
toolbar.addButton('send', '发送', 'paperplane.fill', () => logAction('send', 'send'));
toolbar.addButton('timer', '定时', 'timer', () => logAction('timer', 'timer'));

toolbar.onError(error => console.error('FIVE_BUTTON_TOOLBAR_ERROR=' + JSON.stringify({
  code: error.code,
  operation: error.operation,
  windowId: error.windowId,
  targetId: error.targetId,
  capability: error.capability,
  message: error.message,
})));

const shown = await toolbar.show();
console.log('FIVE_BUTTON_TOOLBAR_READY=' + JSON.stringify({
  windowId: toolbar.id,
  bounds: shown.bounds,
}));
await toolbar.waitUntilClosed();
