(function installOpenDeskPermissionsCenter(global) {
  'use strict';

  const PERMISSION_IDS = Object.freeze(['accessibility', 'screen-capture', 'input-monitoring', 'automation']);
  const MENU_ITEM_ID = 'open-permissions';

  function field(value, camel, pascal) {
    if (!value || typeof value !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(value, camel)) return value[camel];
    return value[pascal];
  }

  function statusLabel(status) {
    switch (String(status || 'unknown')) {
      case 'granted': return '✓ 已授权';
      case 'not_required': return '✓ 无需系统授权';
      case 'denied': return '⚠ 未授权';
      case 'not_determined': return '○ 尚未决定';
      case 'restricted': return '⚠ 受系统限制';
      case 'unsupported': return '— 当前平台不适用';
      case 'unavailable': return '⚠ 当前不可用';
      default: return '? 需要确认';
    }
  }

  function requirementLabel(requirement) {
    switch (String(requirement || 'on-demand')) {
      case 'required': return '当前桌面自动化必需';
      case 'optional': return '可选能力';
      default: return '按需使用';
    }
  }

  function menuLabel(overall) {
    switch (String(overall || 'UNKNOWN')) {
      case 'READY': return '权限管理…';
      case 'LIMITED': return '权限管理（部分功能受限）…';
      default: return '权限管理（需要处理）…';
    }
  }

  function buildHTML() {
    const rows = [
      ['accessibility', '辅助功能'],
      ['screen-capture', '屏幕录制'],
      ['input-monitoring', '输入监控'],
      ['automation', '自动化'],
    ].map(([id, label]) => `
      <div class="permission-row">
        <div class="permission-main">
          <div class="permission-title"><strong>${label}</strong><span id="status-${id}" class="status">正在检查…</span></div>
          <p id="requirement-${id}" class="requirement">—</p>
          <p id="description-${id}" class="description">—</p>
        </div>
        <div class="permission-actions">
          <button id="request-${id}">请求授权</button>
          <button id="settings-${id}">打开系统设置</button>
        </div>
      </div>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong class="page-title">权限管理</strong><p class="subtitle">OpenDesk 只在真正需要时请求系统权限。这里显示的是当前 OpenDesk 进程身份的实际状态。</p></div><div class="header-actions"><button id="refresh">刷新</button><button id="close">关闭</button></div></header>
      <section class="summary"><div><span>整体状态</span><strong id="overall">正在检查…</strong></div><div><span>当前身份</span><strong id="identity">—</strong></div></section>
      <p id="notice" class="notice">正在静默检查权限，不会自动弹出系统授权窗口。</p>
      <section class="permissions">${rows}</section>
      <p class="footnote">“自动化”按目标应用单独授权，不会在 OpenDesk 启动时统一请求。Windows 不存在与 macOS TCC 对称的授权项，但管理员权限目标程序仍受完整性级别限制。</p>
    </main></body></html>`;
  }

  const CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{min-height:100vh;padding:20px;display:flex;flex-direction:column;gap:12px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.page-title{font-size:22px}.subtitle{margin:6px 0 0;color:#9d9d9d;line-height:1.5;max-width:680px}.header-actions,.permission-actions{display:flex;gap:8px;flex-wrap:wrap}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 10px;font:inherit}button:hover:not(:disabled){background:#3b3b3b;cursor:pointer}button:disabled{opacity:.45}.summary{display:grid;grid-template-columns:180px 1fr;gap:8px}.summary div{border:1px solid #343434;border-radius:8px;background:#202020;padding:9px 11px}.summary span{display:block;color:#888;font-size:10px;margin-bottom:4px}.summary strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notice{margin:0;padding:9px 11px;border:1px solid #393939;border-radius:8px;background:#202020;color:#cfcfcf}.permissions{display:flex;flex-direction:column;gap:8px}.permission-row{display:flex;justify-content:space-between;align-items:center;gap:18px;border:1px solid #343434;border-radius:9px;background:#1d1d1d;padding:12px}.permission-main{min-width:0;flex:1}.permission-title{display:flex;align-items:center;gap:12px}.permission-title strong{font-size:14px}.status{color:#cfcfcf}.requirement{margin:5px 0 0;color:#aaa;font-size:11px}.description{margin:5px 0 0;color:#898989;line-height:1.45}.permission-actions{justify-content:flex-end;min-width:220px}.footnote{margin:0;color:#777;font-size:11px;line-height:1.45}
  `;

  function create(options) {
    const settings = options || {};
    const runtimeUI = settings.ui || global.ui;
    const app = settings.app || (global.automation && global.automation.app);
    const logger = settings.logger || global.console;
    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') {
      throw new Error('OpenDesk Permissions Center requires ui.createWindow()');
    }
    if (!app || typeof app.getPermissions !== 'function'
      || typeof app.openPermissionSettings !== 'function'
      || typeof app.requestPermission !== 'function') {
      throw new Error('OpenDesk Permissions Center requires automation.app permission bridge');
    }

    let window = null;
    let sequence = 0;
    let report = null;
    let refreshing = false;
    let lastError = '';

    async function safeUpdate(id, patch) {
      if (!window) return;
      try { await window.control(id).update(patch); } catch (_) {}
    }

    function permissionsFromReport(value) {
      const permissions = field(value, 'permissions', 'Permissions');
      return Array.isArray(permissions) ? permissions : [];
    }

    function identityText(value) {
      const identity = field(value, 'identity', 'Identity') || {};
      const launchKind = field(identity, 'launchKind', 'LaunchKind') || 'process';
      const executable = field(identity, 'executable', 'Executable') || '';
      return executable ? `${launchKind} · ${executable}` : String(launchKind);
    }

    function permissionByID(value, id) {
      return permissionsFromReport(value).find(permission => {
        const permissionID = String(field(permission, 'id', 'ID') || '');
        return permissionID === id || permissionID.indexOf(id + ':') === 0;
      }) || null;
    }

    async function render(value, source) {
      const overall = String(field(value, 'overall', 'Overall') || 'UNKNOWN');
      await safeUpdate('overall', {text: overall});
      await safeUpdate('identity', {text: identityText(value)});
      await safeUpdate('notice', {text: source ? `权限状态已刷新 · ${source}` : '权限状态已刷新。'});

      for (const id of PERMISSION_IDS) {
        const permission = permissionByID(value, id);
        const status = String(field(permission, 'status', 'Status') || 'unknown');
        const requirement = String(field(permission, 'requirement', 'Requirement') || 'on-demand');
        const description = String(field(permission, 'description', 'Description') || '');
        const remediation = String(field(permission, 'remediation', 'Remediation') || '');
        const canRequest = field(permission, 'canRequest', 'CanRequest') === true;
        const canOpenSettings = field(permission, 'canOpenSettings', 'CanOpenSettings') === true;
        await safeUpdate(`status-${id}`, {text: statusLabel(status)});
        await safeUpdate(`requirement-${id}`, {text: requirementLabel(requirement)});
        await safeUpdate(`description-${id}`, {text: remediation || description || '—'});
        await safeUpdate(`request-${id}`, {disabled: !canRequest, text: canRequest ? '请求授权' : (id === 'automation' ? '按目标应用请求' : '无需请求')});
        await safeUpdate(`settings-${id}`, {disabled: !canOpenSettings, text: canOpenSettings ? '打开系统设置' : '无需系统设置'});
      }
      return value;
    }

    async function updateTray(value) {
      if (typeof app.updateMenuItem !== 'function') return;
      const overall = String(field(value, 'overall', 'Overall') || 'UNKNOWN');
      try {
        await app.updateMenuItem(MENU_ITEM_ID, {label: menuLabel(overall)});
      } catch (error) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn('PERMISSIONS_MENU_UPDATE_FAILED=' + String(error && error.message ? error.message : error));
        }
      }
    }

    async function refresh(source) {
      if (refreshing) return state();
      refreshing = true;
      lastError = '';
      await safeUpdate('refresh', {disabled: true});
      await safeUpdate('notice', {text: '正在静默检查当前进程权限…'});
      try {
        report = app.getPermissions('desktop-automation');
        await render(report, source || '刷新');
        await updateTray(report);
      } catch (error) {
        lastError = error && error.message ? String(error.message) : String(error || 'permission refresh failed');
        await safeUpdate('notice', {text: `权限检查失败：${lastError}`});
        if (logger && typeof logger.error === 'function') logger.error('PERMISSIONS_REFRESH_FAILED=' + lastError);
      } finally {
        refreshing = false;
        await safeUpdate('refresh', {disabled: false});
      }
      return state();
    }

    async function request(id) {
      await safeUpdate('notice', {text: `正在请求 ${id}；系统可能显示一次授权提示。`});
      try {
        await app.requestPermission(id);
      } catch (error) {
        await safeUpdate('notice', {text: `请求授权失败：${error && error.message ? error.message : error}`});
      }
      return refresh(`请求 ${id} 后`);
    }

    async function openSettings(id) {
      await safeUpdate('notice', {text: `正在打开 ${id} 对应的系统设置…`});
      try {
        await app.openPermissionSettings(id);
      } catch (error) {
        await safeUpdate('notice', {text: `打开系统设置失败：${error && error.message ? error.message : error}`});
        return state();
      }
      return state();
    }

    async function bind(win) {
      win.control('refresh').on('click', () => refresh('手动刷新'));
      win.control('close').on('click', () => win.close());
      for (const id of PERMISSION_IDS) {
        win.control(`request-${id}`).on('click', () => request(id));
        win.control(`settings-${id}`).on('click', () => openSettings(id));
      }
      win.on('close', () => { if (window === win) window = null; });
    }

    async function open(source) {
      if (window) {
        try {
          await window.show();
          await refresh(source || '重新打开');
          return state();
        } catch (_) {
          window = null;
        }
      }
      const next = await runtimeUI.createWindow({
        id: `permissionsCenter${++sequence}`,
        kind: 'floating',
        title: '权限管理',
        position: {mode:'anchor',size:{width:860,height:650},horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme: 'dark',
        alwaysOnTop: false,
        draggable: true,
        content: {html: buildHTML(), css: CSS},
      });
      window = next;
      await bind(next);
      await next.show();
      await refresh(source || '打开');
      return state();
    }

    async function preflight(source) {
      lastError = '';
      try {
        report = app.getPermissions('desktop-automation');
        await updateTray(report);
      } catch (error) {
        lastError = error && error.message ? String(error.message) : String(error || 'permission preflight failed');
        if (logger && typeof logger.warn === 'function') logger.warn('PERMISSIONS_PREFLIGHT_FAILED=' + lastError);
      }
      return state(source);
    }

    function state() {
      return Object.freeze({
        open: !!window,
        refreshing,
        overall: report ? String(field(report, 'overall', 'Overall') || 'UNKNOWN') : 'UNKNOWN',
        lastError,
      });
    }

    return Object.freeze({open, refresh, preflight, state});
  }

  global.OpenDeskPermissionsCenter = Object.freeze({create, buildHTML, menuLabel, statusLabel, requirementLabel});
})(globalThis);
