// Package adapter only. React/state.tsx remains the sole business state owner.
// The standalone package has no external chat provider and grants no authority.
(async function startSupportApp({ root, integrity, businessWorkdir }) {
  if (!integrity || !/^[a-f0-9]{64}$/.test(integrity.previewSha256)) {
    throw Error('Missing preview integrity; run npm run build before packaging');
  }
  const panel = await ui.createTrustedWindow({
    id: 'supportReactR23', kind: 'normal', title: 'OpenDesk · AI 客服助手（未连接）',
    position: { mode: 'absolute', bounds: { x: 160, y: 100, width: 380, height: 720 } },
    content: { file: 'preview/index.html', basePath: root, sha256: integrity.previewSha256 }
  });
  let closed = false;
  let businessFiles;
  const log = (type, data = {}) => console.log('SUPPORT_APP ' + JSON.stringify({ type, ...data }));
  const offAction = automation.app.onAction(event => log('action', { id: event.id, source: event.source }));
  const offMessage = panel.on('message', async event => {
    if (closed) return;
    let message = event.value;
    try { if (typeof message === 'string') message = JSON.parse(message); } catch { log('rejected-message'); return; }
    const record = message && typeof message === 'object' && !Array.isArray(message);
    const keys = record ? Object.keys(message) : [];
    if (record && message.type === 'support.businessFile') {
      let result;
      try {
        if (!businessFiles) {
          (0, eval)(File.read(File.join(root, 'desktop/business-files.js')));
          businessFiles = OpenDeskSupportBusinessFiles.createTransport(File, { workdir: businessWorkdir, validatorPath: File.join(root, 'desktop/business-validator.generated.js') });
        }
        result = await businessFiles.handle(message);
      } catch {
        result = { type: 'support.businessFileResult',
          requestId: typeof message.requestId === 'string' && /^[\x21-\x7e]{1,40}$/.test(message.requestId) ? message.requestId : '',
          status: 'error', code: 'FILE_UNAVAILABLE' };
      }
      await panel.postMessage(result);
      return;
    }
    if (record && message.type === 'support.ready' && keys.length === 1) {
      await panel.postMessage({ type: 'support.hostReady', protocol: 1, mode: 'disconnected' });
      log('host-ready');
    } else if (record && message.type === 'support.clientReady' && message.protocol === 1 && keys.length === 2) {
      log('bridge-confirmed', { mode: 'disconnected' });
    } else if (record && message.type === 'support.settings' && keys.length > 1 &&
      keys.every(key => ['type', 'permission', 'paused', 'follow'].includes(key)) &&
      (message.permission === undefined || message.permission === false) &&
      (message.paused === undefined || typeof message.paused === 'boolean') &&
      (message.follow === undefined || typeof message.follow === 'boolean')) {
      log('settings', { mode: 'disconnected' });
    } else {
      // In particular, a fill/observation/quit/eval envelope cannot gain authority.
      log('rejected-message');
    }
  });
  const offClose = panel.on('close', () => {
    if (closed) return;
    closed = true; offMessage(); offAction(); offClose(); log('closed');
  });
  try {
    await panel.show();
    log('startup', { root, execution: Execution.id, sha256: integrity.previewSha256, window: await panel.getState() });
    return { panel };
  } catch (error) {
    await panel.close();
    throw error;
  }
})
