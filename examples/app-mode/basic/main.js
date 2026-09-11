const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('App Mode is unavailable: ' + JSON.stringify(capabilities));
}

const panel = await ui.createWindow({
  id: 'main',
  title: 'OpenDesk App Mode',
  position: {
    mode: 'anchor',
    size: { width: 440, height: 250 },
    horizontal: 'center',
    vertical: 'center',
    display: 'primary',
  },
  content: {
    html: '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<main><div class="mark">OD</div><strong class="title">App Mode is running</strong>'
      + '<p id="status">This window and the native menu share one Execution.</p>'
      + '<button id="quit">Quit app</button></main></body></html>',
    css: 'html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#0f172a;color:#f8fafc;font:14px -apple-system,sans-serif}'
      + 'main{text-align:center;padding:24px}.mark{display:grid;place-items:center;width:42px;height:42px;margin:0 auto 14px;border-radius:12px;background:#38bdf8;color:#082f49;font-weight:800}'
      + '.title{display:block;margin:0 0 8px;font-size:24px}p{margin:0 0 20px;color:#cbd5e1}button{border:0;border-radius:8px;padding:9px 14px;background:#e2e8f0;color:#0f172a;font-weight:700}',
  },
});

panel.control('quit').on('click', () => automation.app.quit());
automation.app.onAction(async event => {
  if (event.id !== 'sample.run') return;
  await Promise.all([
    panel.control('status').update({ text: 'Action received by ' + Execution.id }),
    automation.app.updateMenuItem('sample.status', { label: 'Status: action received' }),
  ]);
});

await panel.show();
console.log('APP_MODE_READY=' + JSON.stringify({ executionId: Execution.id, packageId: capabilities.packageId }));
