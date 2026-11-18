// This seam uses the in-memory UI driver and an App Shell without a native host.
// It verifies the JS result contract without opening a real menu or window.
const menuUpdate = await automation.app.updateMenuItem('opendesk.quit', { label: 'Quit' });
if (menuUpdate !== undefined) throw new Error('updateMenuItem must resolve undefined');

const panel = await ui.createWindow({
  id: 'main',
  title: 'App Shell lifecycle seam',
  bounds: { x: 20, y: 20, width: 280, height: 140 },
  content: {
    html: '<!doctype html><html><body><p>App Shell lifecycle seam</p></body></html>',
    css: 'body { font: 14px sans-serif; }',
  },
});

automation.app.onAction(event => {
  __opendeskInspectorResult(JSON.stringify({
    kind: 'action',
    executionId: Execution.id,
    event,
  }));
  return automation.app.quit();
});

await panel.show();
__opendeskInspectorResult(JSON.stringify({ kind: 'ready', executionId: Execution.id }));
