// Run from the OpenDesk repository root:
//   ./opendesk -script examples/ui-relative-target.js
//
// Before running, focus a disposable test window containing two separate rows:
//   OpenDesk 测试行 A    编辑
//   OpenDesk 测试行 B    编辑
// This example intentionally performs exactly one click. Do not run it against
// a window containing real business, contact, order, or payment data.

const targetWindow = await window.getActiveWindow();

if (!targetWindow || String(targetWindow.id || '').endsWith(':unresolved')) {
  throw new Error('The focused test window does not have a stable identity');
}

const result = await UI.tapText('编辑', {
  within: targetWindow,
  region: currentWin => Geometry.inset(currentWin, 12),
  relativeTo: {
    text: 'OpenDesk 测试行 A',
    direction: 'right',
    maxGap: 240,
  },
});

console.log(JSON.stringify({
  ok: result.ok,
  action: result.action,
  target: result.target.text,
}));
