(function installOpenDeskDeveloperTools(global) {
  'use strict';

  const DEBUG_NORMAL_ID = 'opendesk.debug.normal';
  const DEBUG_DETAILED_ID = 'opendesk.debug.detailed';
  const ANALYTICS_DIAGNOSTICS_ID = 'opendesk.analytics.diagnostics';

  function create(options) {
    const settings = options || {};
    const appRuntime = settings.appRuntime || (global.automation && global.automation.app);
    const runtimeLog = settings.runtimeLog;
    const runner = settings.runner;
    const schedulerClient = settings.schedulerClient || global.OpenDeskSchedulerClient;
    const inspectorLauncher = settings.inspectorLauncher;
    const analyticsClient = settings.analyticsClient || global.OpenDeskProductAnalytics;
    const system = settings.system || global.System;
    const execution = settings.execution || global.Execution;
    const runtimeUI = settings.ui || global.ui;
    const logger = settings.logger || global.console;
    const productPaths = settings.productPaths || global.OpenDeskProductPaths;

    let statusWindow = null;
    let statusOpening = null;
    let statusSequence = 0;
    let analyticsWindow = null;
    let analyticsOpening = null;
    let analyticsSequence = 0;
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

    function analyticsDiagnosticsEnabled() {
      if (!system || typeof system.getEnv !== 'function') return false;
      const value = String(system.getEnv('OPENDESK_ANALYTICS_DEBUG') || '').trim().toLowerCase();
      return value === '1' || value === 'true' || value === 'yes' || value === 'on';
    }

    async function updateMenu() {
      if (!appRuntime || typeof appRuntime.updateMenuItem !== 'function') return;
      const detailed = runtimeLog && runtimeLog.state().detailMode === 'detailed';
      await Promise.all([
        appRuntime.updateMenuItem(DEBUG_NORMAL_ID, {label: detailed ? '普通' : '✓ 普通'}),
        appRuntime.updateMenuItem(DEBUG_DETAILED_ID, {label: detailed ? '✓ 详细' : '详细'}),
        appRuntime.updateMenuItem(ANALYTICS_DIAGNOSTICS_ID, {visible: analyticsDiagnosticsEnabled()}),
      ]);
    }

    function statusHTML() {
      return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
        <header><div><strong>OpenDesk 运行状态</strong><p>同一 Runtime 内的产品能力状态</p></div><div><button id="refresh">刷新</button><button id="close">关闭</button></div></header>
        <section><div><span>App Execution ID</span><strong id="executionId">—</strong></div><div><span>Package ID</span><strong id="packageId">—</strong></div><div><span>OpenDesk 主界面</span><strong id="runner">—</strong></div><div><span>计划服务</span><strong id="scheduler">—</strong></div><div><span>录制能力</span><strong id="recorder">—</strong></div><div><span>Inspector</span><strong id="inspector">—</strong></div><div><span>Inspector 网络范围</span><strong id="inspectorScope">—</strong></div><div><span>日志目录</span><strong id="logs">—</strong></div></section>
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
      const inspector = inspectorCapabilities();
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

    function analyticsHTML() {
      return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
        <header><div><strong>产品统计诊断</strong><p>仅用于开发与诊断；这里不是业务 Dashboard。</p></div><div><button id="refresh">刷新</button><button id="close">关闭</button></div></header>
        <section class="grid">
          <div><span>Consent</span><strong id="analyticsConsent">—</strong></div>
          <div><span>Provider</span><strong id="analyticsProvider">—</strong></div>
          <div><span>初始化状态</span><strong id="analyticsInitialization">—</strong></div>
          <div><span>Queue 状态</span><strong id="analyticsQueue">—</strong></div>
          <div><span>最近发送结果</span><strong id="analyticsLastSend">—</strong></div>
          <div><span>丢弃 / 最近错误</span><strong id="analyticsErrors">—</strong></div>
        </section>
        <section class="events"><span>最近事件</span><pre id="analyticsRecentEvents">—</pre></section>
        <p class="notice">“已进入 Provider 队列”只表示本地 Provider 接受了事件，不代表云端已经接收或写入 Dashboard。</p>
      </main></body></html>`;
    }

    const ANALYTICS_CSS = `html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{padding:20px;height:100vh;display:flex;flex-direction:column;gap:15px}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}header strong{font-size:22px}header p{margin:5px 0;color:#999}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 11px;margin-left:7px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.grid div,.events{min-width:0;border:1px solid #343434;border-radius:8px;background:#202020;padding:10px}span{display:block;color:#888;font-size:10px;text-transform:uppercase;margin-bottom:5px}.grid strong{display:block;overflow-wrap:anywhere}.events{min-height:150px}.events pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#ccc;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.5}.notice{margin:0;color:#999;line-height:1.45}`;

    function analyticsSendLabel(value) {
      switch (String(value || '')) {
        case 'queued_to_provider': return '已进入 Provider 队列（非云端确认）';
        case 'stored_local_debug': return '已写入本地 Debug Ring';
        case 'provider_unavailable': return 'Provider 不可用';
        case 'enqueue_failed': return 'Provider 入队失败';
        default: return '尚无发送结果';
      }
    }

    async function refreshAnalyticsDiagnostics() {
      if (!analyticsWindow) return;
      if (!analyticsClient || typeof analyticsClient.diagnostics !== 'function') {
        throw new Error('Product Analytics diagnostics client is unavailable');
      }
      const diagnostics = await analyticsClient.diagnostics();
      const recent = Array.isArray(diagnostics.recentEvents) ? diagnostics.recentEvents : [];
      const queue = diagnostics.queueDepthKnown
        ? `${diagnostics.queueMode || 'unknown'} · ${Number(diagnostics.queueDepth || 0)}/${Number(diagnostics.queueCapacity || 0)}`
        : `${diagnostics.queueMode || 'unknown'} · 最大 ${Number(diagnostics.queueCapacity || 0)} · 当前深度不可观测`;
      const values = {
        analyticsConsent: diagnostics.consent || 'unknown',
        analyticsProvider: `${diagnostics.provider || 'unknown'} · ${diagnostics.configured ? 'configured' : 'not configured'} · ${diagnostics.providerInitialized ? 'initialized' : 'not initialized'}`,
        analyticsInitialization: diagnostics.closed ? 'closed' : (diagnostics.initialized ? (diagnostics.captureEnabled ? 'initialized / capture enabled' : 'initialized / capture disabled') : 'not initialized'),
        analyticsQueue: queue,
        analyticsLastSend: analyticsSendLabel(diagnostics.lastSendResult),
        analyticsErrors: `dropped=${Number(diagnostics.droppedEvents || 0)} · last=${diagnostics.lastErrorCode || 'none'}`,
        analyticsRecentEvents: recent.length ? recent.map(event => {
          const at = event && event.occurredAt ? String(event.occurredAt) : 'unknown-time';
          const name = event && event.event ? String(event.event) : 'unknown-event';
          const result = event && event.result ? String(event.result) : 'unknown-result';
          const code = event && event.errorCode ? ` · ${String(event.errorCode)}` : '';
          return `[${at}] ${name} · ${result}${code}`;
        }).join('\n') : '尚无经过隐私与 Schema 校验的诊断事件。',
      };
      for (const id of Object.keys(values)) {
        try { await analyticsWindow.control(id).update({text: String(values[id])}); } catch (_) {}
      }
    }

    async function openAnalyticsDiagnostics() {
      if (!analyticsDiagnosticsEnabled()) throw new Error('Product Analytics diagnostics are disabled');
      if (analyticsWindow) {
        try { await analyticsWindow.show(); await refreshAnalyticsDiagnostics(); return state(); } catch (_) { analyticsWindow = null; }
      }
      if (analyticsOpening) return analyticsOpening;
      const task = (async () => {
        const current = await runtimeUI.createWindow({
          id: `openDeskAnalyticsDiagnostics${++analyticsSequence}`,
          kind: 'normal', title: '产品统计诊断',
          position: {mode:'anchor',size:{width:780,height:560},horizontal:'center',vertical:'center',margin:0,display:'active'},
          theme: 'dark', alwaysOnTop: false, draggable: true,
          content: {html: analyticsHTML(), css: ANALYTICS_CSS},
        });
        analyticsWindow = current;
        current.control('refresh').on('click', async () => {
          try { await refreshAnalyticsDiagnostics(); } catch (error) { lastError = String(error && error.message || error); }
        });
        current.control('close').on('click', () => current.close());
        current.on('close', () => { if (analyticsWindow === current) analyticsWindow = null; });
        await current.show();
        await refreshAnalyticsDiagnostics();
        return state();
      })();
      analyticsOpening = task;
      try {
        return await task;
      } finally {
        if (analyticsOpening === task) analyticsOpening = null;
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
        case ANALYTICS_DIAGNOSTICS_ID: return openAnalyticsDiagnostics();
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
        analyticsDiagnosticsEnabled: analyticsDiagnosticsEnabled(),
        analyticsDiagnosticsOpen: !!analyticsWindow,
        lastError,
      });
    }

    return Object.freeze({activate, initialize, openStatus, openAnalyticsDiagnostics, state});
  }

  global.OpenDeskDeveloperTools = Object.freeze({create});
})(globalThis);
