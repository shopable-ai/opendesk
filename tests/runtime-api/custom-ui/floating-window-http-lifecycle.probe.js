const probe = String(globalThis.RUNTIME_API_EXTRA && RUNTIME_API_EXTRA.lifecycleProbe || 'http-lifecycle');
const toolbar = new FloatingWindow({ x: 80, y: 420, title: probe, alwaysOnTop: true });

toolbar.addButton('pending', '等待取消', 'timer', async () => {
  await new Promise(() => {});
});

const shown = await toolbar.show();
const button = await toolbar.getButtonState('pending');
await mouse.click(button.screenBounds.x + 20, button.screenBounds.y + 20);

const deadline = Date.now() + 5000;
while (!(await toolbar.getButtonState('pending')).busy) {
  if (Date.now() >= deadline) throw new Error('HTTP lifecycle callback never entered busy');
  await new Promise(resolve => setTimeout(resolve, 10));
}

console.log('[FLOATING-HTTP-READY] ' + JSON.stringify({ probe, windowId: toolbar.id, hostPid: shown.hostPid }));
await toolbar.waitUntilClosed();
