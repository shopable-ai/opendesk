const evidenceDir = Execution.env.OPENDESK_APP_SHELL_EVIDENCE_DIR;
if (!evidenceDir) throw new Error('OPENDESK_APP_SHELL_EVIDENCE_DIR is required');
File.ensureDir(evidenceDir);

const startsPath = File.join(evidenceDir, 'main-executions.txt');
const starts = File.exists(startsPath) ? Number(File.read(startsPath).trim() || '0') + 1 : 1;
File.write(startsPath, String(starts));
if (starts !== 1) throw new Error('main.js executed more than once: ' + starts);

const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available || capabilities.mainWindowId !== 'main') {
  throw new Error('unexpected App Shell capabilities: ' + JSON.stringify(capabilities));
}
if (typeof App !== 'object' || typeof App.list !== 'function') {
  throw new Error('the existing external-application App global was replaced');
}

const panel = await ui.createWindow({
  id: 'main',
  title: 'OpenDesk App Shell Runtime Evidence',
  position: {
    mode: 'anchor',
    size: { width: 520, height: 280 },
    horizontal: 'center',
    vertical: 'center',
    display: 'primary',
  },
  content: {
    html: '<!doctype html><html><head><meta charset="utf-8"></head><body><main>'
      + '<div class="eyebrow">OPENDESK · SAME EXECUTION</div>'
      + '<strong class="title">App Shell P0</strong><p id="runtime">Execution ' + Execution.id + '</p>'
      + '<p id="status">Ready for tray and activation evidence.</p>'
      + '</main></body></html>',
    css: 'html,body{height:100%;margin:0}body{display:grid;place-items:center;background:linear-gradient(145deg,#07111f,#102a43);color:#f8fafc;font:14px -apple-system,sans-serif}'
      + 'main{width:420px;padding:26px;border:1px solid rgba(148,163,184,.25);border-radius:18px;background:rgba(15,23,42,.78);box-shadow:0 20px 55px rgba(0,0,0,.35)}'
      + '.eyebrow{color:#38bdf8;font-size:11px;font-weight:800;letter-spacing:.14em}.title{display:block;margin:8px 0 6px;font-size:30px}p{margin:7px 0;color:#cbd5e1}#status{color:#7dd3fc}',
  },
});

const eventsPath = File.join(evidenceDir, 'actions.ndjson');
function record(event, extra = {}) {
  File.append(eventsPath, JSON.stringify({ ...event, executionId: Execution.id, starts, ...extra }) + '\n');
}

automation.app.onAction(async event => {
  record(event);
  if (event.id === 'opendesk.open') {
    const reopened = await panel.show();
    File.append(File.join(evidenceDir, 'activation-states.ndjson'), JSON.stringify({
      id: event.id,
      source: event.source,
      executionId: Execution.id,
      starts,
      hostPid: reopened.hostPid,
      nativeWindowId: reopened.nativeWindowId,
      visible: reopened.visible,
      onScreen: reopened.onScreen,
    }) + '\n');
    await panel.control('status').update({ text: 'Open handled in this same Execution (' + event.source + ').' });
  } else if (event.id === 'test.dynamic') {
    await automation.app.updateMenuItem('test.dynamic', { label: 'Action running…', enabled: false });
    await automation.app.updateMenuItem('test.status', { label: 'Status: same Runtime ' + Execution.id.slice(-6) });
    await panel.control('status').update({ text: 'Tray action entered this same Runtime.' });
    await sleep(1500);
    await automation.app.updateMenuItem('test.dynamic', { label: 'Run same-runtime action', enabled: true });
  } else if (event.id === 'test.visibility') {
    await automation.app.updateMenuItem('test.dynamic', { visible: false });
    await panel.control('status').update({ text: 'Action item hidden for visual evidence…' });
    await sleep(1500);
    await automation.app.updateMenuItem('test.dynamic', { visible: true });
    await panel.control('status').update({ text: 'Action item shown again.' });
  } else if (event.id === 'test.close') {
    const closed = await panel.close();
    File.write(File.join(evidenceDir, 'programmatic-close.json'), JSON.stringify({ closed, executionId: Execution.id }, null, 2));
    await automation.app.quit();
  }
});

const shown = await panel.show();
const screenshotPath = File.join(evidenceDir, 'main-window-visible.png');
const screenshot = await Screen.screenshot({ clip: shown.bounds, path: screenshotPath, returnType: 'object' });
File.write(File.join(evidenceDir, 'ready.json'), JSON.stringify({
  executionId: Execution.id,
  starts,
  capabilities,
  shown,
  screenshot: { path: screenshotPath, sizeBytes: screenshot.sizeBytes },
}, null, 2));
console.log('APP_SHELL_RUNTIME_READY=' + JSON.stringify({ executionId: Execution.id, evidenceDir }));
