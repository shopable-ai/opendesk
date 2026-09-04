// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/floating-toolbar-primitives.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-primitives

const toolbar = new FloatingWindow({
  x: 180,
  y: 180,
  title: 'Toolbar primitives',
  alwaysOnTop: true,
  draggable: true,
});

toolbar.addButton('copy', '复制', 'doc.on.doc', () => console.log('TOOLBAR_ACTION=copy'));
toolbar.addButton('reply', '回复', 'pause.fill', () => console.log('TOOLBAR_ACTION=reply'));
toolbar.addSeparator('reply-order-divider');
toolbar.addButton('order', '订单', 'doc.text.fill', () => console.log('TOOLBAR_ACTION=order'));
toolbar.addSpacer('order-help-space');
toolbar.addButton('help', '帮助', 'gearshape.fill', () => console.log('TOOLBAR_ACTION=help'));

toolbar.on('move', event => {
  console.log('TOOLBAR_MOVE=' + JSON.stringify({ bounds: event.bounds, sequence: event.sequence }));
});
toolbar.on('close', event => {
  console.log('TOOLBAR_CLOSE=' + JSON.stringify({ reason: event.reason, sequence: event.sequence }));
});
toolbar.onError(error => console.error('TOOLBAR_ERROR=' + JSON.stringify({
  code: error.code,
  operation: error.operation,
  targetId: error.targetId,
  message: error.message,
})));

const declared = await toolbar.getState();
console.log('TOOLBAR_DECLARED_STATE=' + JSON.stringify(declared));
const shown = await toolbar.show();
console.log('TOOLBAR_SHOWN_STATE=' + JSON.stringify(shown));

await toolbar.waitUntilClosed();
