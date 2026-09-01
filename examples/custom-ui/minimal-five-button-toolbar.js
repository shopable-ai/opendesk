const toolbar = new FloatingWindow({ x: 100, y: 100 });
let running = false;

toolbar.addButton('startPause', '开始', 'play.fill', async () => {
  console.log(running ? 'startPause:pause' : 'startPause:start');
  running = !running;
  await toolbar.updateButton('startPause', {
    icon: running ? 'pause.fill' : 'play.fill',
    label: running ? '暂停' : '开始',
    active: running,
  });
});
toolbar.addButton('stop', '停止', 'stop.fill', async () => {
  console.log('stop:stop');
  running = false;
  await toolbar.updateButton('startPause', { icon: 'play.fill', label: '开始', active: false });
});
toolbar.addButton('settings', '设置', 'gearshape.fill', () => console.log('settings:settings'));
toolbar.addButton('send', '发送', 'paperplane.fill', () => console.log('send:send'));
toolbar.addButton('timer', '定时', 'timer', () => console.log('timer:timer'));

toolbar.onError(error => console.error('toolbar:error=' + JSON.stringify({
  code: error.code,
  targetId: error.targetId,
  message: error.message,
})));

await toolbar.show();
await toolbar.waitUntilClosed();
