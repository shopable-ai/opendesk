(function installOpenDeskDeveloperTools(global) {
  'use strict';

  const DEBUG_NORMAL_ID = 'opendesk.debug.normal';
  const DEBUG_DETAILED_ID = 'opendesk.debug.detailed';

  function create(options) {
    const settings = options || {};
    const appRuntime = settings.appRuntime || (global.automation && global.automation.app);
    const runtimeLog = settings.runtimeLog;
    const flowRunner = settings.flowRunner;
    const schedulerClient = settings.schedulerClient || global.OpenDeskSchedulerClient;
    const inspectorLauncher = settings.inspectorLauncher;
    const execution = settings.execution || global.Execution;
    const runtimeUI = settings.ui || global.ui;
    const logger = settings.logger || global.console;
    const productPaths = settings.productPaths || global.OpenDeskProductPaths;

    let statusWindow = null;
    let statusOpening = null;
    let statusSequence = 0;
    let lastError = '';
    let initialized = false;

    function inspectorCapabilities() {
      if (!inspectorLauncher || typeof inspectorLauncher.getCapabilities !== 'function') {
        return {available: false, url: ''};
      }
      try {
        return inspectorLauncher.getCapabilities() || {available: false, url: ''};
      } catch (error) {
        lastError = String(error && error.message || error);
        return {available: false, url: ''};
      }
    }

    async function updateMenu() {
      if (!appRuntime || typeof appRuntime.updateMenuItem !== 'function') return;
      const detailed = runtimeLog && runtimeLog.state().detailMode === 'detailed';
      await Promise.all([
        appRuntime.updateMenuItem(DEBUG_NORMAL_ID, {label: detailed ? '普通' : '✓ 普通'}),
        appRuntime.updateMenuItem(DEBUG_DETAILED_ID, {label: detailed ? '✓ 详细' : '详细'}),
      ]);
    }

    function statusHTML() {
      return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
        <header><div><strong>OpenDesk 运行状态</strong><p>同一 Runtime 内的产品能力状态</p></div><div><button id="refresh">刷新</button><button id="close">关闭</button></div></header>
        <section><div><span>App Execution ID</span><strong id="executionId">—</strong></div><div><span>Package ID</span><strong id="packageId">—</strong></div><div><span>自动化</span><strong id="flowRunner">—</strong></div><div><span>计划服务</span><strong id="scheduler">—</strong></div><div><span>录制能力</span><strong id="recorder">—</strong></div><div><span>Inspector</span><strong id="inspector">—</strong></div><div><span>Inspector 网络范围</span><strong id="inspectorScope">—</strong></div><div><span>日志目录</span><strong id="logs">—</strong></div></section>
        <p id="notice">运行状态来自当前 OpenDesk App Execution。</p>
      </main></body></html>`;
    }

    const STATUS_CSS = `html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{padding:20px;height:100vh;display:flex;flex-direction:column;gap:16px}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}header strong{font-size:22px}header p{margin:5px 0;color:#999}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 11px;margin-left:7px}section{display:grid;grid-template-columns:1fr 1fr;gap:9px}section div{min-width:0;border:1px solid #343434;border-radius:8px;background:#202020;padding:10px}span{display:block;color:#888;font-size:10px;text-transform:uppercase;margin-bottom:5px}section strong{display:block;overflow-wrap:anywhere}#notice{margin:0;padding:10px;border:1px solid #343434;border-radius:8px;color:#bbb}`;

    async function refreshStatus() {
      if (!statusWindow) return;
      const appCapabilities = appRuntime && typeof appRuntime.getCapabilities === 'function'
        ? appRuntime.getCapabilities() : {};
      const flowRunnerState = flowRunner && typeof flowRunner.state === 'function' ? flowRunner.state() : {};
      const scheduler = schedulerClient && typeof schedulerClient.getCapabilities === 'function'
        ? schedulerClient.getCapabilities() : {};
      const inspector = inspectorCapabilities();
      let recorder = {};
      try {
        recorder = global.Recorder && typeof global.Recorder.getCapabilities === 'function'
          ? global.Recorder.getCapabilities() : {};
      } catch (_) {}
      const values = {
        executionId: execution && execution.id ? execution.id : '—',
        packageId: appCapabilities.packageId || '—',
        flowRunner: flowRunnerState.active ? (flowRunnerState.flowRunner && flowRunnerState.flowRunner.listVisible ? '已显示' : '运行中 / 已隐藏') : '未启动',
        scheduler: scheduler.available === false ? '不可用' : (scheduler.endpoint || '可用'),
        recorder: recorder.available === false ? '权限或平台不可用' : 'Framework-owned / 可用',
        inspector: inspector.url || '不可用',
        inspectorScope: inspector.available ? '仅本机 loopback' : '不可用',
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
          // Status is a regular product page, not a nonactivating tool panel.
          kind: 'normal', title: 'OpenDesk 运行状态',
          position: {mode:'anchor',size:{width:760,height:510},horizontal:'center',vertical:'center',margin:0,display:'active'},
          theme: 'dark', alwaysOnTop: false, draggable: true,
          content: {html: statusHTML(), css: STATUS_CSS},
        });
        statusWindow = current;
        current.control('refresh').on('click', async () => { lastError = ''; await refreshStatus(); });
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

    async function activate(actionId, source) {
      switch (actionId) {
        case 'opendesk.status': return openStatus();
        case 'opendesk.inspector.open':
          if (!inspectorLauncher || typeof inspectorLauncher.open !== 'function') {
            throw new Error('Inspector launcher is unavailable');
          }
          return inspectorLauncher.open(source || actionId);
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
      try { await updateMenu(); } catch (error) {
        lastError = String(error && error.message || error);
        if (logger && typeof logger.warn === 'function') logger.warn('OPENDESK_DEVELOPER_STATE_ERROR=' + lastError);
      }
      return state();
    }

    function state() {
      const inspector = inspectorCapabilities();
      return Object.freeze({
        initialized,
        statusOpen: !!statusWindow,
        statusOpening: !!statusOpening,
        inspectorAvailable: !!inspector.available,
        inspectorURL: inspector.url || '',
        inspectorScope: 'local-only',
        lastError,
      });
    }

    return Object.freeze({activate, initialize, openStatus, state});
  }

  global.OpenDeskDeveloperTools = Object.freeze({create});
})(globalThis);
