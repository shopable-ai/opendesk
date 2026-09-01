const probe = new FloatingWindow({ x: 300, y: 180, theme: 'dark' });
probe.addButton('probe', 'Probe', 'timer', async () => new Promise(() => {}));
await probe.show();
if (RUNTIME_API_EXTRA.lifecycleProbe === 'script-exception') {
  throw new Error('intentional FloatingWindow lifecycle exception');
}
if (RUNTIME_API_EXTRA.lifecycleProbe === 'timeout') {
  const state = await probe.getButtonState('probe');
  await mouse.click(state.screenBounds.x + 20, state.screenBounds.y + 20);
  const deadline = Date.now() + 3000;
  while (!(await probe.getButtonState('probe')).busy && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!(await probe.getButtonState('probe')).busy) throw new Error('unresolved callback never entered busy');
  await probe.waitUntilClosed();
}
