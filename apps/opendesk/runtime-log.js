(function installOpenDeskRuntimeLog(global) {
  'use strict';

  const file = global.File;
  const command = global.Command;
  const system = global.System;
  const runtimeUI = global.ui;
  const logger = global.console;
  const productPaths = global.OpenDeskProductPaths;
  const RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'script-runner-simple', 'runs'];
  const MAX_TAIL_CHARS = 128 * 1024;
  const MAX_DIRECT_READ_BYTES = 512 * 1024;

  if (!file || typeof file.join !== 'function' || typeof file.stat !== 'function'
    || typeof file.listDir !== 'function' || typeof file.read !== 'function') {
    throw new Error('OpenDesk Runtime Log requires File join/stat/listDir/read');
  }
  if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') {
    throw new Error('OpenDesk Runtime Log requires ui.createWindow()');
  }
  if (!productPaths || !productPaths.appDataRoot) {
    throw new Error('OpenDesk Runtime Log requires OpenDeskProductPaths.appDataRoot');
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function basename(path) {
    const parts = String(path || '').split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function safeJSON(path) {
    const info = file.stat(path);
    if (!info || info.type !== 'file') return null;
    try { return JSON.parse(String(file.read(path))); } catch (_) { return null; }
  }

  function compactJSON(value) {
    if (!value) return '';
    try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
  }

  function runRoot() {
    return file.join.apply(file, [productPaths.appDataRoot].concat(RUN_LOG_ROOT));
  }

  function latestRunDirectory() {
    const root = runRoot();
    const rootInfo = file.stat(root);
    if (!rootInfo || rootInfo.type !== 'directory') return '';
    const names = file.listDir(root)
      .filter(name => {
        const info = file.stat(file.join(root, name));
        return info && info.type === 'directory';
      })
      .sort((left, right) => right.localeCompare(left));
    return names.length ? file.join(root, names[0]) : '';
  }

  async function readTail(path) {
    const info = file.stat(path);
    if (!info || info.type !== 'file') return '';
    const size = Number(info.size || 0);
    if (!size || size <= MAX_DIRECT_READ_BYTES || !command || typeof command.run !== 'function') {
      return String(file.read(path)).slice(-MAX_TAIL_CHARS);
    }

    const platform = system && typeof system.getPlatformInfo === 'function'
      ? system.getPlatformInfo().os
      : '';
    try {
      let result;
      if (platform === 'windows') {
        const quoted = String(path).replace(/'/g, "''");
        result = await command.run('powershell.exe', [
          '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
          `Get-Content -LiteralPath '${quoted}' -Tail 4000 | Out-String -Width 4096`,
        ], {timeout: 10000, maxOutputBytes: MAX_TAIL_CHARS * 2, hideWindow: true});
      } else {
        result = await command.run('/usr/bin/tail', ['-c', String(MAX_TAIL_CHARS), path], {
          timeout: 10000,
          maxOutputBytes: MAX_TAIL_CHARS * 2,
          hideWindow: true,
        });
      }
      return String(result && result.stdout ? result.stdout : '').slice(-MAX_TAIL_CHARS);
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('RUNTIME_LOG_TAIL_FALLBACK=' + JSON.stringify({
          path,
          error: error && error.message ? String(error.message) : String(error || 'tail failed'),
        }));
      }
      return '日志文件较大，尾部读取失败。请使用“打开日志目录”查看完整日志。';
    }
  }

  function buildHTML() {
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong>运行日志</strong><p id="location" class="subtle">正在定位最近一次自动化…</p></div><div class="actions"><button id="refresh">刷新</button><button id="autoScroll">自动滚动：开</button><button id="openDirectory">打开日志目录</button><button id="close">关闭</button></div></header>
      <section class="facts"><div><span>自动化</span><strong id="automation">—</strong></div><div><span>Execution ID</span><strong id="executionId">—</strong></div><div><span>状态</span><strong id="runStatus">—</strong></div><div><span>开始</span><strong id="startedAt">—</strong></div><div><span>结束 / 结果</span><strong id="finishedAt">—</strong></div></section>
      <p id="notice" class="notice">尚未加载运行日志。</p>
      <section class="logs"><article><h2>Script output</h2><pre id="stdout"></pre></article><article><h2>Errors</h2><pre id="stderr"></pre></article><article><h2>Summary</h2><pre id="summary"></pre></article></section>
    </main></body></html>`;
  }

  const CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:12px;overflow:hidden}header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}header strong{font-size:22px}.subtle{margin:5px 0 0;color:#999;font-size:12px;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 10px;font:inherit}button:hover{background:#3b3b3b;cursor:pointer}.facts{display:grid;grid-template-columns:1.25fr 1fr .65fr 1fr 1.15fr;gap:8px}.facts div{min-width:0;border:1px solid #343434;border-radius:8px;background:#202020;padding:8px 10px}.facts span{display:block;color:#888;font-size:10px;margin-bottom:4px;text-transform:uppercase}.facts strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.notice{margin:0;padding:8px 10px;border:1px solid #393939;border-radius:7px;background:#202020;color:#cfcfcf}.logs{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.logs article{min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid #343434;border-radius:9px;background:#1d1d1d;overflow:hidden}.logs h2{font-size:12px;margin:0;padding:9px 10px;border-bottom:1px solid #333;color:#aaa}.logs pre{flex:1;min-height:0;overflow:auto;margin:0;padding:10px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.45}
  `;

  function createRuntimeLog(options) {
    const settings = options || {};
    const runner = settings.runner || null;
    let window = null;
    let sequence = 0;
    let selectedDirectory = '';
    let autoScroll = true;
    let loading = false;
    let lastError = '';

    async function safeUpdate(id, patch) {
      if (!window) return;
      try { await window.control(id).update(patch); } catch (_) {}
    }

    async function scrollToLatest(id) {
      if (!window || !autoScroll) return;
      try { await window.control(id).update({scrollTop: 2147483647}); } catch (_) {}
    }

    function runnerState() {
      try { return runner && typeof runner.state === 'function' ? runner.state() : null; } catch (_) { return null; }
    }

    async function refresh(source) {
      if (loading) return state();
      loading = true;
      lastError = '';
      await safeUpdate('refresh', {disabled: true});
      await safeUpdate('notice', {text: '正在读取最近一次自动化日志…'});
      try {
        selectedDirectory = latestRunDirectory();
        if (!selectedDirectory) {
          await safeUpdate('location', {text: `日志根目录：${runRoot()}`});
          await safeUpdate('automation', {text: '—'});
          await safeUpdate('executionId', {text: '—'});
          await safeUpdate('runStatus', {text: '尚未运行'});
          await safeUpdate('startedAt', {text: '—'});
          await safeUpdate('finishedAt', {text: '—'});
          await safeUpdate('stdout', {text: ''});
          await safeUpdate('stderr', {text: ''});
          await safeUpdate('summary', {text: ''});
          await safeUpdate('notice', {text: '尚无自动化运行 artifacts。运行一个 Recipe 后再刷新。'});
          return state();
        }

        const meta = safeJSON(file.join(selectedDirectory, 'meta.json')) || {};
        const executionState = safeJSON(file.join(selectedDirectory, 'execution_state.json')) || {};
        const summary = safeJSON(file.join(selectedDirectory, 'summary.json'));
        const agentSummary = safeJSON(file.join(selectedDirectory, 'agent_summary.json'));
        const output = await readTail(file.join(selectedDirectory, 'stdout.log'));
        const errors = await readTail(file.join(selectedDirectory, 'stderr.log'));
        const currentRunner = runnerState();
        const automationName = meta.scriptName || meta.name || meta.script || basename(selectedDirectory).replace(/^\d{4}-\d{2}-\d{2}T[^-]+-/, '') || '自动化';
        const executionId = meta.executionId || meta.id || executionState.executionId || executionState.id || '—';
        const status = executionState.status || meta.status || (currentRunner && currentRunner.runner && currentRunner.runner.running ? 'running' : 'unknown');
        const startedAt = executionState.startedAt || meta.startedAt || meta.createdAt || '—';
        const finishedAt = executionState.finishedAt || meta.finishedAt || executionState.updatedAt || '—';
        const summaryText = [
          summary ? compactJSON(summary) : '',
          agentSummary ? `Agent summary\n${compactJSON(agentSummary)}` : '',
        ].filter(Boolean).join('\n\n');

        await safeUpdate('location', {text: selectedDirectory});
        await safeUpdate('automation', {text: String(automationName)});
        await safeUpdate('executionId', {text: String(executionId)});
        await safeUpdate('runStatus', {text: String(status)});
        await safeUpdate('startedAt', {text: String(startedAt)});
        await safeUpdate('finishedAt', {text: String(finishedAt)});
        await safeUpdate('stdout', {text: output || '（无 stdout）'});
        await safeUpdate('stderr', {text: errors || '（无 stderr）'});
        await safeUpdate('summary', {text: summaryText || '（暂无 summary）'});
        await safeUpdate('notice', {text: source ? `已刷新 · ${source}` : '已刷新最近一次自动化。'});
        await scrollToLatest('stdout');
        await scrollToLatest('stderr');
        await scrollToLatest('summary');
      } catch (error) {
        lastError = error && error.message ? String(error.message) : String(error || 'Runtime Log refresh failed');
        await safeUpdate('notice', {text: `运行日志读取失败：${lastError}`});
        if (logger && typeof logger.error === 'function') logger.error('RUNTIME_LOG_REFRESH_ERROR=' + lastError);
      } finally {
        loading = false;
        await safeUpdate('refresh', {disabled: false});
      }
      return state();
    }

    async function openDirectory() {
      const target = selectedDirectory || runRoot();
      const platform = system && typeof system.getPlatformInfo === 'function' ? system.getPlatformInfo().os : '';
      if (!command || typeof command.run !== 'function') return null;
      if (platform === 'windows') return command.run('explorer.exe', [target], {timeout: 10000, hideWindow: true});
      if (platform === 'darwin') return command.run('/usr/bin/open', [target], {timeout: 10000, hideWindow: true});
      return command.run('xdg-open', [target], {timeout: 10000, hideWindow: true});
    }

    async function bind(win) {
      win.control('refresh').on('click', () => refresh('手动刷新'));
      win.control('openDirectory').on('click', openDirectory);
      win.control('autoScroll').on('click', async () => {
        autoScroll = !autoScroll;
        await safeUpdate('autoScroll', {text: `自动滚动：${autoScroll ? '开' : '关'}`});
        if (autoScroll) {
          await scrollToLatest('stdout');
          await scrollToLatest('stderr');
          await scrollToLatest('summary');
        }
      });
      win.control('close').on('click', () => win.close());
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
        id: `runtimeLog${++sequence}`,
        kind: 'floating',
        title: '运行日志',
        position: {mode:'anchor',size:{width:1180,height:700},horizontal:'center',vertical:'center',margin:0,display:'active'},
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

    function state() {
      return Object.freeze({
        open: !!window,
        loading,
        autoScroll,
        selectedDirectory,
        runRoot: runRoot(),
        lastError,
      });
    }

    return Object.freeze({open, refresh, state});
  }

  global.OpenDeskRuntimeLog = Object.freeze({create: createRuntimeLog});
})(globalThis);
