(function installOpenDeskPermissionsCenter(global) {
  'use strict';

  const MENU_ITEM_ID = 'open-permissions';

  function field(value, camel, pascal) {
    if (!value || typeof value !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(value, camel)) return value[camel];
    return value[pascal];
  }

  function permissionsFromReport(value) {
    const permissions = field(value, 'permissions', 'Permissions');
    return Array.isArray(permissions) ? permissions : [];
  }

  function basePermissionID(permission) {
    return String(field(permission, 'id', 'ID') || '').split(':', 1)[0];
  }

  function controlKey(id) {
    return String(id || '').replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function permissionTitle(permission) {
    const id = basePermissionID(permission);
    const labels = {
      accessibility: '辅助功能',
      'screen-capture': '屏幕录制',
      'input-monitoring': '输入监控',
      automation: '自动化',
    };
    return labels[id] || String(field(permission, 'displayName', 'DisplayName') || id || '系统权限');
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

  function overallLabel(overall) {
    switch (String(overall || 'UNKNOWN')) {
      case 'READY': return '可用';
      case 'LIMITED': return '部分功能受限';
      case 'BLOCKED': return '需要处理';
      default: return '需要确认';
    }
  }

  function requirementLabel(requirement) {
    switch (String(requirement || 'on-demand')) {
      case 'required': return '当前桌面自动化必需';
      case 'optional': return '可选能力';
      default: return '按需使用';
    }
  }

  function permissionMessage(id, status) {
    const messages = {
      accessibility: '用于识别和操作桌面窗口、控件。缺失时，依赖辅助功能的桌面自动化不可用。',
      'screen-capture': '用于截图、视觉定位以及图像/OCR 自动化。缺失时，相关视觉能力不可用。',
      'input-monitoring': '仅特定 Recorder 全局键盘/输入监听能力需要；普通脚本运行不要求此权限。',
      automation: '仅在需要通过 Apple Events 控制具体外部应用时按目标应用请求，不会在启动时统一授权。',
    };
    const base = messages[id] || '此系统能力仅在相关功能真正使用时检查。';
    switch (String(status || 'unknown')) {
      case 'not_required': return `${base} 当前平台无需额外系统授权。`;
      case 'restricted': return `${base} 当前受到系统策略限制。`;
      case 'unknown': return `${base} 当前系统接口无法可靠区分“尚未授权”和“尚未决定”，可打开系统设置确认。`;
      case 'denied': return `${base} 当前未授权，可打开系统设置处理。`;
      default: return base;
    }
  }

  function menuLabel(overall) {
    switch (String(overall || 'UNKNOWN')) {
      case 'READY': return '权限管理…';
      case 'LIMITED': return '权限管理（部分功能受限）…';
      default: return '权限管理（需要处理）…';
    }
  }

  function rowsFromReport(report) {
    return permissionsFromReport(report).map(permission => {
      const id = basePermissionID(permission);
      return {id, key: controlKey(id), title: permissionTitle(permission)};
    }).filter(row => row.id);
  }

  function buildHTML(report) {
    const rows = rowsFromReport(report).map(row => `
      <div class="permission-row">
        <div class="permission-main">
          <div class="permission-title"><strong>${row.title}</strong><span id="status-${row.key}" class="status">正在检查…</span></div>
          <p id="requirement-${row.key}" class="requirement">—</p>
          <p id="description-${row.key}" class="description">—</p>
        </div>
        <div class="permission-actions">
          <button id="request-${row.key}">请求授权</button>
          <button id="settings-${row.key}">打开系统设置</button>
        </div>
      </div>`).join('');

    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong class="page-title">权限管理</strong><p class="subtitle">OpenDesk 只在真正需要时请求系统权限。启动、刷新、聚焦窗口只检查状态，不会自动触发授权。</p></div><div class="header-actions"><button id="refresh">刷新</button><button id="close">关闭</button></div></header>
      <section class="summary"><div><span>整体状态</span><strong id="overall">正在检查…</strong></div><div><span>当前运行身份</span><strong id="identity">—</strong></div></section>
      <p id="notice" class="notice">正在静默检查权限，不会自动弹出系统授权窗口。</p>
      <section class="permissions">${rows || '<p class="notice">当前 Runtime 未返回可管理的系统权限。</p>'}</section>
      <p class="footnote">“自动化”按目标应用单独授权。Windows 没有与 macOS TCC 对称的授权项，但普通权限 OpenDesk 仍可能无法控制管理员权限目标程序。</p>
    </main></body></html>`;
  }

  const CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{min-height:100vh;padding:20px;display:flex;flex-direction:column;gap:12px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.page-title{font-size:22px}.subtitle{margin:6px 0 0;color:#9d9d9d;line-height:1.5;max-width:680px}.header-actions,.permission-actions{display:flex;gap:8px;flex-wrap:wrap}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 10px;font:inherit}button:hover:not(:disabled){background:#3b3b3b;cursor:pointer}button:disabled{opacity:.45}.summary{display:grid;grid-template-columns:180px 1fr;gap:8px}.summary div{border:1px solid #343434;border-radius:8px;background:#202020;padding:9px 11px}.summary span{display:block;color:#888;font-size:10px;margin-bottom:4px}.summary strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notice{margin:0;padding:9px 11px;border:1px solid #393939;border-radius:8px;background:#202020;color:#cfcfcf}.permissions{display:flex;flex-direction:column;gap:8px}.permission-row{display:flex;justify-content:space-between;align-items:center;gap:18px;border:1px solid #343434;border-radius:9px;background:#1d1d1d;padding:12px}.permission-main{min-width:0;flex:1}.permission-title{display:flex;align-items:center;gap:12px}.permission-title strong{font-size:14px}.status{color:#cfcfcf}.requirement{margin:5px 0 0;color:#aaa;font-size:11px}.description{margin:5px 0 0;color:#898989;line-height:1.45}.permission-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;min-width:220px}.footnote{margin:0;color:#777;font-size:11px;line-height:1.45}
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
    let opening = null;
    let sequence = 0;
    let report = null;
    let viewRows = [];
    let refreshing = false;
    let lastError = '';
    const attemptedRequests = new Set();
    const requesting = new Set();

    async function safeUpdate(id, patch) {
      if (!window) return;
      try { await window.control(id).update(patch); } catch (_) {}
    }

    function identityText(value) {
      const identity = field(value, 'identity', 'Identity') || {};
      const launchKind = String(field(identity, 'launchKind', 'LaunchKind') || 'process');
      if (launchKind === 'app-bundle') return 'OpenDesk 应用';
      if (launchKind === 'windows-process') return 'OpenDesk Windows 应用';
      if (launchKind === 'cli-or-child') return 'OpenDesk 独立进程';
      return 'OpenDesk 当前进程';
    }

    function permissionByID(value, id) {
      return permissionsFromReport(value).find(permission => basePermissionID(permission) === id) || null;
    }

    function ensureReport() {
      if (!report) report = app.getPermissions('desktop-automation');
      return report;
    }

    async function render(value, source) {
      const overall = String(field(value, 'overall', 'Overall') || 'UNKNOWN');
      await safeUpdate('overall', {text: overallLabel(overall)});
      await safeUpdate('identity', {text: identityText(value)});
      await safeUpdate('notice', {text: source ? `权限状态已刷新 · ${source}` : '权限状态已刷新。'});

      for (const row of viewRows) {
        const permission = permissionByID(value, row.id);
        const status = String(field(permission, 'status', 'Status') || 'unknown');
        const requirement = String(field(permission, 'requirement', 'Requirement') || 'on-demand');
        const canRequest = field(permission, 'canRequest', 'CanRequest') === true;
        const canOpenSettings = field(permission, 'canOpenSettings', 'CanOpenSettings') === true;
        const ready = status === 'granted' || status === 'not_required';
        const pending = requesting.has(row.id);
        await safeUpdate(`status-${row.key}`, {text: statusLabel(status)});
        await safeUpdate(`requirement-${row.key}`, {text: requirementLabel(requirement)});
        await safeUpdate(`description-${row.key}`, {text: permissionMessage(row.id, status)});
        await safeUpdate(`request-${row.key}`, {
          disabled: !canRequest || ready || pending,
          text: ready ? '已就绪' : (canRequest ? (attemptedRequests.has(row.id) ? '重新尝试' : '请求授权') : (row.id === 'automation' ? '按目标应用请求' : '无需请求')),
        });
        await safeUpdate(`settings-${row.key}`, {disabled: !canOpenSettings, text: canOpenSettings ? '打开系统设置' : '无需系统设置'});
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
      if (requesting.has(id)) return state();
      const row = viewRows.find(item => item.id === id);
      const key = row ? row.key : controlKey(id);
      const force = attemptedRequests.has(id);
      requesting.add(id);
      await safeUpdate(`request-${key}`, {disabled: true, text: force ? '正在重新尝试…' : '正在请求…'});
      await safeUpdate('notice', {text: force ? '正在按你的操作重新尝试授权；系统可能显示一次授权提示。' : '正在请求所选权限；系统可能显示一次授权提示。'});
      try {
        await app.requestPermission(id, {force});
      } catch (error) {
        await safeUpdate('notice', {text: `请求授权失败：${error && error.message ? error.message : error}`});
      } finally {
        attemptedRequests.add(id);
        requesting.delete(id);
      }
      return refresh(force ? '重新尝试授权后' : '请求授权后');
    }

    async function openSettings(id) {
      await safeUpdate('notice', {text: '正在打开对应的系统设置…'});
      try {
        const result = await app.openPermissionSettings(id);
        const fallback = field(result, 'fallback', 'Fallback') === true;
        const guidance = String(field(result, 'guidance', 'Guidance') || '');
        if (fallback) {
          await safeUpdate('notice', {text: guidance ? `已打开“隐私与安全”。请手动前往：${guidance}` : '已打开“隐私与安全”，请手动选择对应权限项。'});
        } else {
          await safeUpdate('notice', {text: '已打开对应的系统设置。返回 OpenDesk 后可点击“刷新”重新检查状态。'});
        }
      } catch (error) {
        await safeUpdate('notice', {text: `打开系统设置失败：${error && error.message ? error.message : error}`});
      }
      return state();
    }

    async function bind(win) {
      win.control('refresh').on('click', () => refresh('手动刷新'));
      win.control('close').on('click', () => win.close());
      for (const row of viewRows) {
        win.control(`request-${row.key}`).on('click', () => request(row.id));
        win.control(`settings-${row.key}`).on('click', () => openSettings(row.id));
      }
      win.on('close', () => { if (window === win) window = null; });
    }

    async function openInternal(source) {
      if (window) {
        try {
          await window.show();
          await refresh(source || '重新打开');
          return state();
        } catch (_) {
          window = null;
        }
      }

      const initialReport = ensureReport();
      viewRows = rowsFromReport(initialReport);
      const next = await runtimeUI.createWindow({
        id: `permissionsCenter${++sequence}`,
        kind: 'floating',
        title: '权限管理',
        position: {mode:'anchor',size:{width:860,height:650},horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme: 'dark',
        alwaysOnTop: false,
        draggable: true,
        content: {html: buildHTML(initialReport), css: CSS},
      });
      window = next;
      await bind(next);
      await next.show();
      await refresh(source || '打开');
      return state();
    }

    function open(source) {
      if (opening) return opening;
      opening = openInternal(source).finally(() => { opening = null; });
      return opening;
    }

    async function preflight() {
      lastError = '';
      try {
        report = app.getPermissions('desktop-automation');
        await updateTray(report);
      } catch (error) {
        lastError = error && error.message ? String(error.message) : String(error || 'permission preflight failed');
        if (logger && typeof logger.warn === 'function') logger.warn('PERMISSIONS_PREFLIGHT_FAILED=' + lastError);
      }
      return state();
    }

    function state() {
      return Object.freeze({
        open: !!window,
        opening: !!opening,
        refreshing,
        overall: report ? String(field(report, 'overall', 'Overall') || 'UNKNOWN') : 'UNKNOWN',
        lastError,
      });
    }

    return Object.freeze({open, refresh, preflight, state});
  }

  global.OpenDeskPermissionsCenter = Object.freeze({
    create,
    buildHTML,
    menuLabel,
    overallLabel,
    permissionMessage,
    requirementLabel,
    statusLabel,
  });
})(globalThis);
