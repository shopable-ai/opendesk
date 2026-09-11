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
