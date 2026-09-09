'use strict';

// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/floating-toolbar-controls.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-controls
const toolbar = new FloatingWindow({
  position: { mode: 'anchor', horizontal: 'right', vertical: 'top', margin: 16 },
  title: 'Native settings controls',
  toolbar: { maxColumns: 2 },
});

toolbar.addSwitch('liveSync', '实时同步', { value: true }, event => {
  console.log('FLOATING_CONTROL_CHANGE=' + JSON.stringify({ id: event.targetId, value: event.checked }));
});
toolbar.addCheckbox('includeLogs', '包含日志', { value: true }, event => {
  console.log('FLOATING_CONTROL_CHANGE=' + JSON.stringify({ id: event.targetId, value: event.checked }));
});
toolbar.addInput('query', '搜索', { placeholder: '输入关键词', maxLength: 64, width: 200 }, event => {
  console.log('FLOATING_CONTROL_INPUT=' + JSON.stringify({ id: event.targetId, value: event.value }));
});
toolbar.addSelect('quality', '质量', {
  value: 'best',
  options: [{ value: 'fast', label: '快速' }, { value: 'best', label: '最佳' }],
}, event => console.log('FLOATING_CONTROL_CHANGE=' + JSON.stringify({ id: event.targetId, value: event.value })));
toolbar.addSlider('volume', '音量', { min: 0, max: 10, value: 4, step: 1 }, event => {
  console.log('FLOATING_CONTROL_CHANGE=' + JSON.stringify({ id: event.targetId, value: event.value }));
});
toolbar.addSegmentedControl('scope', '范围', {
  value: 'page',
  options: [{ value: 'page', label: '页面' }, { value: 'app', label: '应用' }],
}, event => console.log('FLOATING_CONTROL_CHANGE=' + JSON.stringify({ id: event.targetId, value: event.value })));
toolbar.addProgress('progress', '处理进度', { value: 0.25 });
toolbar.addSeparator('actionDivider');
toolbar.addButton('advance', '推进进度', 'arrow.clockwise', async () => {
  const state = await toolbar.getControlState('progress');
  const value = state.indeterminate ? 0 : Math.min(1, state.value + 0.25);
  await toolbar.updateControl('progress', { value, indeterminate: false });
  await toolbar.updateButton('advance', { badge: Math.round(value * 100) });
});
await toolbar.updateButton('advance', { badge: 25 });

toolbar.onError(error => console.error('FLOATING_CONTROL_ERROR=' + JSON.stringify({
  code: error.code, operation: error.operation, targetId: error.targetId, message: error.message,
})));

const shown = await toolbar.show();
const controlIDs = ['liveSync', 'includeLogs', 'query', 'quality', 'volume', 'scope', 'progress'];
const states = [];
for (const id of controlIDs) states.push(await toolbar.getControlState(id));
console.log('FLOATING_CONTROLS_READY=' + JSON.stringify({ shown, states }));
await toolbar.waitUntilClosed();
