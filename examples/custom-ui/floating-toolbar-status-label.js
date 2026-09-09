// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/floating-toolbar-status-label.js -console-mode script

const toolbar = new FloatingWindow({
  position: { mode: 'anchor', horizontal: 'center', vertical: 'top', margin: 20, display: 'active' },
  title: 'Status Label',
});

let completed = 0;
toolbar.addLabel('status', 'Ready', {
  width: 144,
  alignment: 'center',
  verticalAlignment: 'center',
  tone: 'secondary',
});
toolbar.addSeparator('actions-divider');
toolbar.addButton('run', '运行任务', 'automation.run', async () => {
  await toolbar.updateLabel('status', {
    text: 'Running…', alignment: 'leading', verticalAlignment: 'top', tone: 'warning',
  });
  await new Promise(resolve => setTimeout(resolve, 800));
  completed += 1;
  await toolbar.updateLabel('status', {
    text: `Completed ${completed}`, alignment: 'trailing', verticalAlignment: 'bottom', tone: 'success',
  });
  console.log('FLOATING_LABEL_ACTION=' + JSON.stringify({ action: 'run', completed }));
});
toolbar.addButton('reset', '重置状态', 'arrow.counterclockwise', async () => {
  completed = 0;
  await toolbar.updateLabel('status', {
    text: 'Ready', alignment: 'center', verticalAlignment: 'center', tone: 'secondary',
  });
  console.log('FLOATING_LABEL_ACTION=' + JSON.stringify({ action: 'reset', completed }));
});

await toolbar.show();
console.log('FLOATING_LABEL_READY=' + JSON.stringify(await toolbar.getLabelState('status')));
await toolbar.waitUntilClosed();
