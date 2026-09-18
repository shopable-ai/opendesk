(function installOpenDeskSettings(global) {
  'use strict';

  const WINDOW_SIZE = Object.freeze({width: 700, height: 480});
  const PRIVACY_SIZE = Object.freeze({width: 520, height: 360});

  function create(options) {
    const settings = options || {};
    const runtimeUI = settings.ui || global.ui;
    const client = settings.client || global.OpenDeskProductAnalytics;
    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') {
      throw new Error('OpenDesk Settings requires ui.createWindow()');
    }
    if (!client || typeof client.status !== 'function' || typeof client.setEnabled !== 'function') {
      throw new Error('OpenDesk Settings requires the product privacy preference client');
    }

    let window = null;
    let opening = null;
    let privacyWindow = null;
    let privacyOpening = null;
    let sequence = 0;
    let current = null;

    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong>设置</strong><p>管理 OpenDesk 的产品偏好。</p></div><button id="close">关闭</button></header>
      <div class="layout">
        <nav><button class="nav-item selected" disabled>隐私与数据</button></nav>
        <section class="content">
          <div class="section-title"><strong>隐私与数据</strong><p>控制 OpenDesk 是否可以发送基础使用数据。</p></div>
          <article class="card">
            <div class="card-head"><div><strong>帮助改进 OpenDesk</strong><p>开启后，OpenDesk 会发送应用启动、功能使用和自动化运行结果等基础使用信息，用于改进产品。</p></div><button id="improveToggle" role="switch" disabled>正在读取…</button></div>
            <p id="statusDetail" class="status">正在读取设置状态…</p>
            <div class="privacy-summary">不会发送脚本或 Flow 源码、截图、剪贴板、OCR 内容、AI 对话、Prompt、用户输入、本地完整路径或原始错误文本。</div>
            <button id="privacyDetails" class="link-button">查看隐私说明</button>
          </article>
        </section>
      </div>
    </main></body></html>`;

    const css = `html,body{height:100%;margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100%;padding:20px;display:flex;flex-direction:column;gap:18px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}header strong{font-size:22px}header p,.section-title p,.card p{margin:6px 0 0;color:#aaa;line-height:1.5}button{border:1px solid #505050;border-radius:8px;background:#303030;color:#f4f4f4;padding:7px 12px;font:inherit}button:hover:not(:disabled){background:#3b3b3b;cursor:pointer}button:disabled{opacity:.65}.layout{display:grid;grid-template-columns:150px 1fr;gap:18px;min-height:0;flex:1}nav{border-right:1px solid #333;padding-right:14px}.nav-item{width:100%;text-align:left;background:#292929;border-color:#3c3c3c}.content{min-width:0}.section-title strong{font-size:17px}.card{margin-top:15px;border:1px solid #343434;border-radius:10px;background:#1d1d1d;padding:16px}.card-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.card-head>div{min-width:0}.card-head>div>strong{font-size:15px}.card-head #improveToggle{min-width:92px}.status{padding:10px 0 0}.privacy-summary{margin-top:14px;padding-top:13px;border-top:1px solid #333;color:#aaa;line-height:1.5}.link-button{margin-top:10px;background:transparent;border-color:#404040}`;

    const privacyHTML = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><strong>隐私说明</strong><button id="close">关闭</button></header>
      <section><p>启用“帮助改进 OpenDesk”后，只会发送受控的基础使用信息，用于了解产品功能是否被使用以及自动化运行是否正常。</p>
      <p>OpenDesk 不发送脚本或 Flow 源码、截图、剪贴板、OCR 内容、AI 对话、Prompt、用户输入、本地完整路径、Secret、Token 或原始错误文本。</p>
      <p>启用后会生成随机安装标识，用于区分重复使用和会话；不会使用机器序列号、MAC、硬盘或 CPU 标识、License ID 或账号 ID。关闭后停止接受新的基础使用数据，并撤销本地统计标识。</p></section>
    </main></body></html>`;
    const privacyCSS = `html,body{height:100%;margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100%;padding:20px;display:flex;flex-direction:column;gap:18px}header{display:flex;justify-content:space-between;align-items:center}header strong{font-size:20px}button{border:1px solid #505050;border-radius:8px;background:#303030;color:#f4f4f4;padding:7px 12px;font:inherit}section{border:1px solid #343434;border-radius:10px;background:#1d1d1d;padding:14px 16px}section p{margin:0 0 12px;color:#bbb;line-height:1.58}section p:last-child{margin-bottom:0}`;

    async function updateControl(id, patch) {
      if (!window) return;
      try { await window.control(id).update(patch); } catch (_) {}
    }

    async function render(status) {
      current = status || {};
      const granted = current.consent === 'granted';
      await updateControl('improveToggle', {text: granted ? '已开启' : '已关闭', disabled: false});
      await updateControl('statusDetail', {
        text: granted
          ? '已开启。你的选择已保存；服务可用时会发送上述基础使用数据。'
          : '已关闭。OpenDesk 不会发送基础使用数据。',
      });
      return current;
    }

    async function refresh() {
      await updateControl('improveToggle', {disabled: true, text: '正在读取…'});
      try {
        return await render(await client.status());
      } catch (error) {
        current = null;
        await updateControl('improveToggle', {disabled: true, text: '不可用'});
        await updateControl('statusDetail', {text: '暂时无法读取此设置。请稍后重试。'});
        return null;
      }
    }

    async function toggle() {
      const enable = !(current && current.consent === 'granted');
      await updateControl('improveToggle', {disabled: true});
      try {
        await render(await client.setEnabled(enable));
      } catch (_) {
        await updateControl('statusDetail', {text: '无法更新此设置。原有选择保持不变。'});
        await updateControl('improveToggle', {disabled: false});
      }
    }

    async function openPrivacyInternal() {
      if (privacyWindow) {
        try { await privacyWindow.show(); return state(); } catch (_) { privacyWindow = null; }
      }
      const next = await runtimeUI.createWindow({
        id: `privacyDetails${++sequence}`, kind: 'normal', title: '隐私说明',
        position: {mode:'anchor',size:PRIVACY_SIZE,horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme:'dark',alwaysOnTop:false,draggable:true,content:{html:privacyHTML,css:privacyCSS},
      });
      privacyWindow = next;
      next.control('close').on('click', () => next.close());
      next.on('close', () => { if (privacyWindow === next) privacyWindow = null; });
      await next.show();
      return state();
    }

    function openPrivacy() {
      if (privacyOpening) return privacyOpening;
      privacyOpening = openPrivacyInternal().finally(() => { privacyOpening = null; });
      return privacyOpening;
    }

    async function bind(win) {
      win.control('close').on('click', () => win.close());
      win.control('improveToggle').on('click', () => toggle());
      win.control('privacyDetails').on('click', () => openPrivacy());
      win.on('close', () => { if (window === win) window = null; });
    }

    async function openInternal() {
      if (window) {
        try { await window.show(); await refresh(); return state(); } catch (_) { window = null; }
      }
      const next = await runtimeUI.createWindow({
        id: `openDeskSettings${++sequence}`, kind:'normal', title:'设置',
        position:{mode:'anchor',size:WINDOW_SIZE,horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme:'dark',alwaysOnTop:false,draggable:true,content:{html,css},
      });
      window = next;
      await bind(next);
      await next.show();
      await refresh();
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
        privacyOpen: !!privacyWindow,
        consent: current && current.consent || 'unknown',
      });
    }

    return Object.freeze({open, openPrivacy, refresh, state});
  }

  global.OpenDeskSettings = Object.freeze({create});
})(globalThis);
