// Run from the repository root with:
// opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-wrap-demo
//
// This is an interactive visual demo. It opens three native toolbars at once:
// maxWidth makes a 5 + 1 wrap, maxColumns makes a 2 + 2 + 1 wrap, and maxRows
// makes a compact 4 + 3 two-row layout. Click a button to toggle its active
// state, then close all three native windows to end the example.

const buttons = [
  { id: 'play', label: '播放', icon: 'play.fill' },
  { id: 'pause', label: '暂停', icon: 'pause.fill' },
  { id: 'stop', label: '停止', icon: 'stop.fill' },
  { id: 'settings', label: '设置', icon: 'gearshape.fill' },
  { id: 'send', label: '发送', icon: 'paperplane.fill' },
  { id: 'timer', label: '定时', icon: 'timer' },
  { id: 'done', label: '完成', icon: 'checkmark' },
];

const configPath = File.join(File.cwd(), 'examples/custom-ui/floating-toolbar-wrap-demo.json');
const demoConfig = JSON.parse(File.read(configPath));
if (demoConfig.schemaVersion !== 1 || !Array.isArray(demoConfig.layouts) || demoConfig.layouts.length !== 3) {
  throw new Error('invalid floating toolbar wrap demo configuration');
}
const demos = demoConfig.layouts;

function createDemo(definition) {
  const toolbar = new FloatingWindow({
    x: definition.x,
    y: definition.y,
    title: definition.title,
    alwaysOnTop: true,
    toolbar: definition.toolbar,
  });
  const visibleButtons = buttons.slice(0, definition.buttonCount);
  let selectedID = '';

  for (const button of visibleButtons) {
    toolbar.addButton(button.id, button.label, button.icon, async () => {
      selectedID = selectedID === button.id ? '' : button.id;
      for (const item of visibleButtons) {
        await toolbar.updateButton(item.id, { active: item.id === selectedID });
      }
      console.log('FLOATING_TOOLBAR_WRAP_DEMO=' + JSON.stringify({
        layout: definition.id,
        toolbar: definition.toolbar,
        selectedID,
      }));
    });
  }

  toolbar.onError(error => console.error('FLOATING_TOOLBAR_WRAP_DEMO_ERROR=' + JSON.stringify({
    layout: definition.id,
    code: error.code,
    targetId: error.targetId,
    message: error.message,
  })));
  return toolbar;
}

const toolbars = demos.map(createDemo);
for (const toolbar of toolbars) await toolbar.show();

console.log('FLOATING_TOOLBAR_WRAP_DEMO_READY=' + JSON.stringify({
  configPath,
  layouts: demos.map(({ id, title, toolbar, buttonCount }) => ({ id, title, toolbar, buttonCount })),
}));

await Promise.all(toolbars.map(toolbar => toolbar.waitUntilClosed()));
