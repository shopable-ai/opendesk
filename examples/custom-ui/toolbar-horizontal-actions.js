// Run from the repository root with:
// ./dist/opendesk -ui -script examples/custom-ui/toolbar-horizontal-actions.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-horizontal-actions
// Change this JavaScript object when callbacks need to use Runtime APIs.
const toolbarConfig = {
  schemaVersion: 1,
  toolbar: {
    x: 100,
    y: 100,
    title: '操作工具栏',
    orientation: 'horizontal',
  },
  buttons: [
    { id: 'startPause', label: '开始', icon: 'play.fill', action: 'startPause' },
    { id: 'stop', label: '停止', icon: 'stop.fill', action: 'stop' },
    { id: 'settings', label: '设置', icon: 'gearshape.fill', action: 'settings' },
    { id: 'send', label: '发送', icon: 'paperplane.fill', action: 'send' },
    { id: 'timer', label: '定时', icon: 'timer', action: 'timer' },
  ],
};

const helperPath = File.join(File.cwd(), 'examples/custom-ui/toolbar-example.js');
(0, eval)(File.read(helperPath) + '\n//# sourceURL=' + helperPath);

let running = false;
const actionHandlers = {
  async startPause(toolbar) {
    running = !running;
    const label = running ? '暂停' : '开始';
    console.log('HORIZONTAL_TOOLBAR_ACTION=' + JSON.stringify({
      id: 'startPause', action: running ? 'start' : 'pause',
    }));
    await toolbar.updateButton('startPause', {
      icon: running ? 'pause.fill' : 'play.fill',
      label,
      active: running,
    });
  },
  async stop(toolbar) {
    running = false;
    console.log('HORIZONTAL_TOOLBAR_ACTION=' + JSON.stringify({ id: 'stop', action: 'stop' }));
    await toolbar.updateButton('startPause', { icon: 'play.fill', label: '开始', active: false });
  },
  settings() {
    console.log('HORIZONTAL_TOOLBAR_ACTION=' + JSON.stringify({ id: 'settings', action: 'settings' }));
  },
  send() {
    console.log('HORIZONTAL_TOOLBAR_ACTION=' + JSON.stringify({ id: 'send', action: 'send' }));
  },
  timer() {
    console.log('HORIZONTAL_TOOLBAR_ACTION=' + JSON.stringify({ id: 'timer', action: 'timer' }));
  },
};

await ToolbarExample.run({
  config: toolbarConfig,
  logPrefix: 'HORIZONTAL_TOOLBAR',
  onButtonClick(button, toolbar) {
    const handler = actionHandlers[button.action];
    if (!handler) throw new Error('unknown toolbar action: ' + button.action);
    return handler(toolbar);
  },
});
