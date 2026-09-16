(function installOpenDeskAbout(global) {
  'use strict';

  const WINDOW_SIZE = Object.freeze({width: 420, height: 300});

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readProductInfo(file, packageRoot) {
    const manifestPath = file.join(packageRoot, 'opendesk.app.json');
    const manifest = JSON.parse(String(file.read(manifestPath)));
    const version = String(manifest.version || '').trim();
    if (!version) throw new Error('OpenDesk product version is missing from opendesk.app.json');
    return Object.freeze({
      name: String(manifest.name || 'OpenDesk').trim() || 'OpenDesk',
      version,
    });
  }

  function buildHTML(info) {
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <div class="mark" aria-hidden="true">OD</div>
      <h1>${escapeHTML(info.name)}</h1>
      <p class="version">Version ${escapeHTML(info.version)}</p>
      <p class="description">Agent-driven desktop automation</p>
      <p class="copyright">© 2026 OpenDesk</p>
      <div class="actions"><button id="website">OpenDesk 官网</button><button id="close">关闭</button></div>
    </main></body></html>`;
  }

  const CSS = `
    html,body{height:100%;margin:0;overflow:hidden;background:#1b1b1b;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center}.mark{width:58px;height:58px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:#2d2d2d;border:1px solid #484848;font-weight:700;font-size:18px;letter-spacing:.5px;margin-bottom:14px}h1{font-size:22px;line-height:1.2;margin:0}.version{margin:8px 0 0;color:#d2d2d2;font-size:13px}.description{margin:8px 0 0;color:#979797}.copyright{margin:18px 0 0;color:#737373;font-size:11px}.actions{display:flex;gap:8px;margin-top:22px}button{min-width:92px;border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 12px;font:inherit}button:hover{background:#3b3b3b;cursor:pointer}`;

  function create(options) {
    const settings = options || {};
    const runtimeUI = settings.ui || global.ui;
    const file = settings.file || global.File;
    const packageRoot = settings.packageRoot || (global.Execution && global.Execution.scriptDir);
    const officialShell = settings.officialShell;

    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') {
      throw new Error('OpenDesk About requires ui.createWindow()');
    }
    if (!file || typeof file.join !== 'function' || typeof file.read !== 'function') {
      throw new Error('OpenDesk About requires File.join/read');
    }
    if (!packageRoot) throw new Error('OpenDesk About requires packageRoot');

    const productInfo = readProductInfo(file, packageRoot);
    let window = null;
    let opening = null;
    let sequence = 0;

    async function bind(win) {
      win.control('close').on('click', () => win.close());
      win.control('website').on('click', async () => {
        if (officialShell && typeof officialShell.activate === 'function') {
          await officialShell.activate('opendesk.home');
        }
      });
      win.on('close', () => {
        if (window === win) window = null;
      });
    }

    async function openInternal() {
      if (window) {
        try {
          await window.show();
          return state();
        } catch (_) {
          window = null;
        }
      }

      const next = await runtimeUI.createWindow({
        id: `aboutOpenDesk${++sequence}`,
        kind: 'normal',
        title: '关于 OpenDesk',
        position: {mode:'anchor',size:WINDOW_SIZE,horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme: 'dark',
        alwaysOnTop: false,
        draggable: true,
        content: {html: buildHTML(productInfo), css: CSS},
      });
      window = next;
      await bind(next);
      await next.show();
      return state();
    }

    function open() {
      if (opening) return opening;
      opening = openInternal().finally(() => { opening = null; });
      return opening;
    }

    function state() {
      return Object.freeze({
        open: !!window,
        opening: !!opening,
        version: productInfo.version,
      });
    }

    return Object.freeze({open, state, productInfo: () => productInfo});
  }

  global.OpenDeskAbout = Object.freeze({create, readProductInfo, buildHTML});
})(globalThis);
