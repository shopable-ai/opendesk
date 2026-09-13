(function installOpenDeskDeveloperTools(global) {
  'use strict';

  const LAN_TOGGLE_ID = 'opendesk.inspector.lan.toggle';
  const LAN_COPY_ID = 'opendesk.inspector.lan.copy';
  const DEBUG_NORMAL_ID = 'opendesk.debug.normal';
  const DEBUG_DETAILED_ID = 'opendesk.debug.detailed';

  function create(options) {
    const settings = options || {};
    const appRuntime = settings.appRuntime || (global.automation && global.automation.app);
    const runtimeLog = settings.runtimeLog;
    const runner = settings.runner;
    const schedulerClient = settings.schedulerClient || global.OpenDeskSchedulerClient;
    const command = settings.command || global.Command;
    const system = settings.system || global.System;
    const execution = settings.execution || global.Execution;
    const runtimeUI = settings.ui || global.ui;
    const http = settings.http || global.axios;
    const clipboard = settings.clipboard || global.clipboard;
    const logger = settings.logger || global.console;
    const productPaths = settings.productPaths || global.OpenDeskProductPaths;
    const environment = execution && execution.env ? execution.env : {};
    const inspectorEndpoint = String(settings.inspectorEndpoint
      || environment.OPENDESK_APP_INSPECTOR_ENDPOINT || '').replace(/\/$/, '');
    const inspectorToken = String(settings.inspectorToken
      || environment.OPENDESK_APP_INSPECTOR_CONTROL_TOKEN || '');

    let statusWindow = null;
    let statusOpening = null;
    let statusSequence = 0;
    let lanStatus = {allowLAN: false, lanUrl: '', mode: inspectorEndpoint ? 'loopback' : 'unavailable'};
    let lastError = '';
    let initialized = false;

    function unwrap(response) {
      const body = response && response.data !== undefined ? response.data : response;
      if (body && body.code !== undefined && Number(body.code) !== 0) {
        throw new Error(body.message || `Inspector control failed (${body.code})`);
      }
      return body && body.data !== undefined ? body.data : body;
    }

    async function openExternal(target) {
      const platform = system.getPlatformInfo().os;
      const options = {timeout: 10000, maxOutputBytes: 256 * 1024, hideWindow: true};
      if (platform === 'windows') return command.run('explorer.exe', [target], options);
      if (platform === 'darwin') return command.run('/usr/bin/open', [target], options);
      return command.run('xdg-open', [target], options);
    }

    async function notify(message) {
      if (runtimeUI && typeof runtimeUI.notify === 'function') {
        try { await runtimeUI.notify(String(message)); return; } catch (_) {}
      }
      if (logger && typeof logger.log === 'function') logger.log('OPENDESK_DEVELOPER_NOTICE=' + message);
    }

    async function updateMenu() {
      if (!appRuntime || typeof appRuntime.updateMenuItem !== 'function') return;
      const detailed = runtimeLog && runtimeLog.state().detailMode === 'detailed';
      await Promise.all([
        appRuntime.updateMenuItem(LAN_TOGGLE_ID, {
          label: `${lanStatus.allowLAN ? '✓ ' : ''}允许 Inspector 从局域网访问`,
        }),
        appRuntime.updateMenuItem(LAN_COPY_ID, {enabled: !!lanStatus.lanUrl}),
        appRuntime.updateMenuItem(DEBUG_NORMAL_ID, {label: detailed ? '普通' : '✓ 普通'}),
        appRuntime.updateMenuItem(DEBUG_DETAILED_ID, {label: detailed ? '✓ 详细' : '详细'}),
      ]);
    }

    async function queryLAN() {
      if (!inspectorEndpoint || !inspectorToken || !http || typeof http.get !== 'function') {
        lanStatus = {allowLAN: false, lanUrl: '', mode: 'unavailable'};
        await updateMenu();
        return lanStatus;
      }
      const response = await http.get(`${inspectorEndpoint}/api/accessibility-workbench/v1/internal/lan`, {
        headers: {'X-OpenDesk-Inspector-Control': inspectorToken},
      });
      lanStatus = Object.assign({allowLAN: false, lanUrl: ''}, unwrap(response) || {});
      await updateMenu();
      return lanStatus;
    }

    function statusHTML() {
      return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
        <header><div><strong>OpenDesk 运行状态</strong><p>同一 Runtime 内的产品能力状态</p></div><div><button id="refresh">刷新</button><button id="close">关闭</button></div></header>
        <section><div><span>App Execution ID</span><strong id="executionId">—</strong></div><div><span>Package ID</span><strong id="packageId">—</strong></div><div><span>OpenDesk 主界面</span><strong id="runner">—</strong></div><div><span>计划服务</span><strong id="scheduler">—</strong></div><div><span>录制能力</span><strong id="recorder">—</strong></div><div><span>Inspector</span><strong id="inspector">—</strong></div><div><span>Inspector LAN</span><strong id="lan">—</strong></div><div><span>日志目录</span><strong id="logs">—</strong></div></section>
        <p id="notice">运行状态来自当前 OpenDesk App Execution。</p>
      </main></body></html>`;
    }

    const STATUS_CSS = `html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{padding:20px;height:100vh;display:flex;flex-direction:column;gap:16px}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}header strong{font-size:22px}header p{margin:5px 0;color:#999}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 11px;margin-left:7px}section{display:grid;grid-template-columns:1fr 1fr;gap:9px}section div{min-width:0;border:1px solid #343434;border-radius:8px;background:#202020;padding:10px}span{display:block;color:#888;font-size:10px;text-transform:uppercase;margin-bottom:5px}section strong{display:block;overflow-wrap:anywhere}#notice{margin:0;padding:10px;border:1px solid #343434;border-radius:8px;color:#bbb}`;

    async function refreshStatus() {
      if (!statusWindow) return;
      const appCapabilities = appRuntime && typeof appRuntime.getCapabilities === 'function'
        ? appRuntime.getCapabilities() : {};
      const runnerState = runner && typeof runner.state === 'function' ? runner.state() : {};
      const scheduler = schedulerClient && typeof schedulerClient.getCapabilities === 'function'
        ? schedulerClient.getCapabilities() : {};
      let recorder = {};
      try {
        recorder = global.Recorder && typeof global.Recorder.getCapabilities === 'function'
          ? global.Recorder.getCapabilities() : {};
      } catch (_) {}
      const values = {
        executionId: execution && execution.id ? execution.id : '—',
        packageId: appCapabilities.packageId || '—',
        runner: runnerState.active ? (runnerState.runner && runnerState.runner.listVisible ? '已显示' : '运行中 / 已隐藏') : '未启动',
        scheduler: scheduler.available === false ? '不可用' : (scheduler.endpoint || '可用'),
        recorder: recorder.available === false ? '权限或平台不可用' : 'Framework-owned / 可用',
        inspector: inspectorEndpoint || '不可用',
        lan: lanStatus.allowLAN ? (lanStatus.lanUrl || '已允许') : '关闭',
        logs: runtimeLog && runtimeLog.state ? runtimeLog.state().runRoot : (productPaths && productPaths.appDataRoot) || '—',
      };
      for (const id of Object.keys(values)) {
        try { await statusWindow.control(id).update({text: String(values[id])}); } catch (_) {}
      }
      try { await statusWindow.control('notice').update({text: lastError || '运行状态来自当前 OpenDesk App Execution。'}); } catch (_) {}
    }

    async function openStatus() {
      if (statusWindow) {
        try { await statusWindow.show(); await refreshStatus(); return state(); } catch (_) { statusWindow = null; }
      }
      if (statusOpening) return statusOpening;
      const task = (async () => {
        const current = await runtimeUI.createWindow({
          id: `openDeskStatus${++statusSequence}`,
          kind: 'floating', title: 'OpenDesk 运行状态',
          position: {mode:'anchor',size:{width:760,height:510},horizontal:'center',vertical:'center',margin:0,display:'active'},
          theme: 'dark', alwaysOnTop: false, draggable: true,
          content: {html: statusHTML(), css: STATUS_CSS},
        });
        statusWindow = current;
        current.control('refresh').on('click', async () => {
          try { await queryLAN(); lastError = ''; } catch (error) { lastError = String(error && error.message || error); }
          await refreshStatus();
        });
        current.control('close').on('click', () => current.close());
        current.on('close', () => { if (statusWindow === current) statusWindow = null; });
        await current.show();
        await refreshStatus();
        return state();
      })();
      statusOpening = task;
      try {
        return await task;
      } finally {
        if (statusOpening === task) statusOpening = null;
      }
    }

    async function setLAN() {
      if (!inspectorEndpoint || !inspectorToken || !http || typeof http.post !== 'function') {
        throw new Error('Inspector control is unavailable');
      }
      const response = await http.post(`${inspectorEndpoint}/api/accessibility-workbench/v1/internal/lan`, {
        allow: !lanStatus.allowLAN,
      }, {headers: {'X-OpenDesk-Inspector-Control': inspectorToken}});
      lanStatus = Object.assign({allowLAN: false, lanUrl: ''}, unwrap(response) || {});
      await updateMenu();
      await refreshStatus();
      if (lanStatus.warning) await notify(lanStatus.warning);
      return lanStatus;
    }

    async function activate(actionId) {
      switch (actionId) {
        case 'opendesk.status': return openStatus();
        case 'opendesk.inspector.open':
          if (!inspectorEndpoint) throw new Error('Inspector is unavailable');
          return openExternal(`${inspectorEndpoint}/accessibility-workbench/`);
        case LAN_TOGGLE_ID: return setLAN();
        case LAN_COPY_ID:
          if (!lanStatus.lanUrl) throw new Error('请先允许 Inspector 从局域网访问');
          clipboard.copy(lanStatus.lanUrl);
          await notify('Inspector LAN 地址已复制。');
          return lanStatus.lanUrl;
        case 'opendesk.logs.open': return runtimeLog.openDirectory();
        case DEBUG_NORMAL_ID:
          await runtimeLog.setDetailMode('normal'); await updateMenu(); return runtimeLog.state();
        case DEBUG_DETAILED_ID:
          await runtimeLog.setDetailMode('detailed'); await updateMenu(); return runtimeLog.state();
        default: return null;
      }
    }

    async function initialize() {
      if (initialized) return state();
      initialized = true;
      try { await queryLAN(); } catch (error) {
        lastError = String(error && error.message || error);
        if (logger && typeof logger.warn === 'function') logger.warn('OPENDESK_INSPECTOR_STATE_ERROR=' + lastError);
      }
      return state();
    }

    function state() {
      return Object.freeze({initialized, statusOpen: !!statusWindow, statusOpening: !!statusOpening, inspectorEndpoint,
        allowLAN: !!lanStatus.allowLAN, lanUrl: lanStatus.lanUrl || '', lastError});
    }

    return Object.freeze({activate, initialize, openStatus, queryLAN, state});
  }

  global.OpenDeskDeveloperTools = Object.freeze({create});
})(globalThis);
