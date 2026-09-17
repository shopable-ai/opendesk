(function installOpenDeskAnalyticsSettings(global) {
  'use strict';

  const WINDOW_SIZE = Object.freeze({width: 560, height: 360});

  function create(options) {
    const settings = options || {};
    const runtimeUI = settings.ui || global.ui;
    const client = settings.client || global.OpenDeskProductAnalytics;
    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') throw new Error('OpenDesk Analytics Settings requires ui.createWindow()');
    if (!client || typeof client.status !== 'function' || typeof client.setEnabled !== 'function') throw new Error('OpenDesk Analytics Settings requires Product Analytics client');

    let window = null;
    let opening = null;
    let sequence = 0;
    let current = null;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong>基础使用统计</strong><p>帮助了解 OpenDesk 功能的使用情况并改进产品。</p></div><button id="close">关闭</button></header>
      <section class="privacy"><p>不会上传脚本源码、Flow 源码、截图、剪贴板、OCR 内容、AI 对话、用户输入、Prompt、本地完整路径或原始错误文本。</p><p>只发送受控的产品事件和枚举字段；可以随时关闭。</p></section>
      <section class="status-card"><strong id="statusTitle">正在读取状态…</strong><p id="statusDetail">—</p><button id="toggle" disabled>请稍候</button></section>
    </main></body></html>`;
    const css = `html,body{height:100%;margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100%;padding:20px;display:flex;flex-direction:column;gap:14px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}header strong{font-size:22px}header p{margin:6px 0 0;color:#aaa;line-height:1.45}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 12px;font:inherit}button:hover:not(:disabled){background:#3b3b3b;cursor:pointer}button:disabled{opacity:.45}.privacy,.status-card{border:1px solid #343434;border-radius:9px;background:#1d1d1d;padding:13px 14px}.privacy p{margin:0 0 7px;color:#bbb;line-height:1.5}.privacy p:last-child{margin-bottom:0}.status-card{margin-top:auto}.status-card strong{font-size:14px}.status-card p{margin:6px 0 12px;color:#999;line-height:1.45}`;

    async function updateControl(id, patch) { if (window) { try { await window.control(id).update(patch); } catch (_) {} } }
    async function render(status) {
      current = status || {};
      const granted = current.consent === 'granted';
      const configured = current.configured === true;
      const captureEnabled = current.captureEnabled === true;
      let title = '基础使用统计未开启';
      let detail = '你可以选择启用；启用前不会创建 Analytics install_id。';
      if (granted) {
        title = captureEnabled ? '基础使用统计已开启' : '基础使用统计已允许';
        detail = configured ? '受控产品事件会发送到已配置的统计服务。' : '当前构建未配置云端接收端；你的偏好已保存，但不会发送统计事件。';
      } else if (current.consent === 'denied') {
        detail = '基础使用统计已关闭，不会继续接受或发送新的统计事件。';
      }
      await updateControl('statusTitle', {text: title});
      await updateControl('statusDetail', {text: detail});
      await updateControl('toggle', {text: granted ? '关闭基础使用统计' : '启用基础使用统计', disabled: false});
      return current;
    }
    async function refresh() {
      await updateControl('toggle', {disabled: true});
      try { return render(await client.status()); }
      catch (error) {
        await updateControl('statusTitle', {text: '无法读取基础使用统计状态'});
        await updateControl('statusDetail', {text: error && error.message ? String(error.message) : 'Product Analytics unavailable'});
        await updateControl('toggle', {disabled: true});
        return null;
      }
    }
    async function toggle() {
      const enable = !(current && current.consent === 'granted');
      await updateControl('toggle', {disabled: true});
      try { await render(await client.setEnabled(enable)); }
      catch (error) {
        await updateControl('statusDetail', {text: `更新失败：${error && error.message ? error.message : error}`});
        await updateControl('toggle', {disabled: false});
      }
    }
    async function bind(win) {
      win.control('close').on('click', () => win.close());
      win.control('toggle').on('click', () => toggle());
      win.on('close', () => { if (window === win) window = null; });
    }
    async function openInternal() {
      if (window) {
        try {
          await window.show();
          await refresh();
          await client.uiAction('analytics_settings', 'analytics.open', 'menu');
          await client.screenViewed('analytics_settings');
          return state();
        } catch (_) { window = null; }
      }
      const next = await runtimeUI.createWindow({
        id: `analyticsSettings${++sequence}`, kind: 'normal', title: '基础使用统计',
        position: {mode:'anchor',size:WINDOW_SIZE,horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme: 'dark', alwaysOnTop: false, draggable: true, content: {html, css},
      });
      window = next;
      await bind(next);
      await next.show();
      await refresh();
      await client.uiAction('analytics_settings', 'analytics.open', 'menu');
      await client.screenViewed('analytics_settings');
      return state();
    }
    function open() {
      if (opening) return opening;
      opening = openInternal().finally(() => { opening = null; });
      return opening;
    }
    function state() { return Object.freeze({open: !!window, consent: current && current.consent || 'unknown'}); }
    return Object.freeze({open, refresh, state});
  }

  global.OpenDeskAnalyticsSettings = Object.freeze({create});
})(globalThis);
