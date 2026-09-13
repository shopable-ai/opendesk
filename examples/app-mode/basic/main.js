const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('App Mode is unavailable: ' + JSON.stringify(capabilities));
}

function pngDataURL(path) {
  const bytes = new Uint8Array(File.readBytes(path));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 3) << 4) | ((second === undefined ? 0 : second) >> 4)];
    encoded += second === undefined ? '=' : alphabet[((second & 15) << 2) | ((third === undefined ? 0 : third) >> 6)];
    encoded += third === undefined ? '=' : alphabet[third & 63];
  }
  return 'data:image/png;base64,' + encoded;
}

const recorderLogo = pngDataURL(File.join(Execution.scriptDir, 'assets', 'recorder-logo.png'));

const panel = await ui.createWindow({
  id: 'main',
  title: 'OpenDesk App Mode',
  position: {
    mode: 'anchor',
    size: { width: 540, height: 330 },
    horizontal: 'center',
    vertical: 'center',
    display: 'primary',
  },
  content: {
    html: '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<main><div class="logo-region"><div class="logo-ring"><img class="recorder-logo" src="' + recorderLogo + '" alt="OpenDesk Recorder logo"></div></div>'
      + '<section class="copy"><div class="eyebrow">OPENDESK · APP MODE</div><strong class="title">App Mode is running</strong>'
      + '<p id="status">This window and the native menu share one Execution.</p>'
      + '<button id="quit">Quit app</button></section></main></body></html>',
    css: 'html,body{height:100%;margin:0}body{display:grid;place-items:center;background:radial-gradient(circle at 12% 8%,#123b5f 0,#0f172a 44%,#07111f 100%);color:#f8fafc;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}'
      + 'main{display:grid;grid-template-columns:126px minmax(0,1fr);align-items:center;gap:24px;width:448px;padding:30px;border:1px solid rgba(125,211,252,.2);border-radius:22px;background:rgba(15,23,42,.76);box-shadow:0 24px 64px rgba(0,0,0,.34)}'
      + '.logo-region{display:grid;place-items:center;width:124px;height:124px;border-radius:28px;background:linear-gradient(145deg,rgba(56,189,248,.22),rgba(14,116,144,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 14px 30px rgba(2,132,199,.16)}'
      + '.logo-ring{display:grid;place-items:center;width:104px;height:104px;border:1px solid rgba(125,211,252,.32);border-radius:24px;background:#07192e}.recorder-logo{display:block;width:96px;height:96px;border-radius:20px}'
      + '.eyebrow{margin:0 0 8px;color:#7dd3fc;font-size:11px;font-weight:800;letter-spacing:.13em}.title{display:block;margin:0 0 9px;font-size:27px;letter-spacing:-.02em;line-height:1.12}p{max-width:280px;margin:0 0 21px;color:#cbd5e1;line-height:1.5}button{border:1px solid rgba(125,211,252,.22);border-radius:9px;padding:9px 14px;background:#e0f2fe;color:#082f49;font-weight:750;box-shadow:0 5px 14px rgba(14,165,233,.16)}',
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
