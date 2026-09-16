(function installOpenDeskScriptRunnerPlayer(global) {
  'use strict';

  const PANEL_WIDTH = 320;
  const PANEL_MIN_HEIGHT = 184;
  const PANEL_MAX_HEIGHT = 420;
  const PANEL_ROW_HEIGHT = 38;
  const PANEL_GAP = 8;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function displayScriptName(name) {
    const value = String(name || '');
    const parts = value.split(/[\\/]/);
    const base = parts[parts.length - 1] || value;
    return base.toLowerCase().endsWith('.js') ? base.slice(0, -3) : base;
  }

  function scriptNames(scripts) {
    return (scripts || []).map(script => typeof script === 'string' ? script : script && script.name).filter(Boolean);
  }

  function reconcileCurrentAfterRefresh(oldOrder, newOrder, currentKey) {
    const before = Array.isArray(oldOrder) ? oldOrder.slice() : [];
    const after = Array.isArray(newOrder) ? newOrder.slice() : [];
    if (!after.length) return null;
    if (currentKey && after.includes(currentKey)) return currentKey;
    const oldIndex = currentKey ? before.indexOf(currentKey) : -1;
    const available = new Set(after);
    if (oldIndex >= 0) {
      for (let index = oldIndex + 1; index < before.length; index++) {
        if (available.has(before[index])) return before[index];
      }
      for (let index = oldIndex - 1; index >= 0; index--) {
        if (available.has(before[index])) return before[index];
      }
    }
    return after[0];
  }

  function panelHeight(count) {
    const rows = Math.max(1, Math.min(Number(count) || 0, 7));
    return Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, 102 + rows * PANEL_ROW_HEIGHT));
  }

  function buildPanelHTML(scripts, state) {
    const input = state || {};
    const currentKey = input.currentKey || null;
    const highlightKey = input.highlightKey || currentKey;
    const running = !!input.running;
    const loadError = input.loadError || null;
    const all = scripts || [];
    const options = all.map(script => {
      const current = script.name === currentKey;
      const selected = script.name === highlightKey;
      const label = `${current ? '✓ ' : ''}${displayScriptName(script.name)}`;
      return `<option value="${escapeHTML(script.name)}" title="${escapeHTML(script.path || script.name)}"${selected ? ' selected' : ''}>${escapeHTML(label)}</option>`;
    });
    const list = all.length
      ? `<select id="panelSelection" class="script-list" size="${Math.max(1, Math.min(all.length, 8))}" aria-label="脚本列表"${running || loadError ? ' disabled' : ''}>${options.join('\n')}</select>`
      : `<p id="panelEmpty" class="empty">${loadError ? '脚本目录读取失败' : '暂无可运行脚本'}</p>`;
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main>
        <header><strong>脚本</strong><span id="panelMode" class="mode">${running ? '运行中 · 仅查看' : '选择脚本'}</span></header>
        <div class="list">${list}</div>
        <p id="panelStatus" class="status">${escapeHTML(loadError ? (loadError.message || String(loadError)) : running ? '运行期间不会改变当前脚本。' : '单击只选择，不会运行；方向键只移动高亮。')}</p>
        <footer>
          <button id="panelRefresh" title="刷新脚本列表" aria-label="刷新脚本列表"${running ? ' disabled' : ''}>↻</button>
          <button id="panelOpenDirectory">打开目录</button>
          <button id="panelManage">管理脚本…</button>
        </footer>
        <button id="panelKeyEnter" class="bridge-sink" data-opendesk-dialog-default aria-hidden="true">key-enter</button>
        <button id="panelKeyEscape" class="bridge-sink" data-opendesk-dialog-cancel aria-hidden="true">key-escape</button>
        <button id="panelBlur" class="bridge-sink" aria-hidden="true">blur</button>
      </main>
    </body></html>`;
  }

  const PANEL_CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box} main{height:100vh;padding:10px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 4px}.mode{font-size:11px;color:#9d9d9d;white-space:nowrap}
    .list{flex:1;min-height:0;overflow:auto;border:1px solid #333;border-radius:9px;background:#1d1d1d}
    .script-list{width:100%;height:100%;min-height:0;border:0;outline:none;background:#1d1d1d;color:#f4f4f4;padding:4px;font:inherit}.script-list option{padding:8px 9px;border-radius:6px}.script-list option:checked{background:#2d3b52;color:#fff}.script-list:disabled{opacity:.68}.empty{margin:0;padding:24px 12px;text-align:center;color:#999}
    .status{margin:0;color:#9d9d9d;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    footer{display:flex;gap:7px;padding-top:8px;border-top:1px solid #343434}footer button{height:32px;border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:0 10px;font:inherit}footer button:not(:disabled){cursor:pointer}footer button:hover:not(:disabled){background:#3b3b3b}footer button:disabled{opacity:.4}#panelRefresh{width:34px;padding:0}.bridge-sink{position:absolute!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
  `;

  function createLifecycleToolbar(onUpdate, holder) {
    let closed = false;
    let closeResolve;
    const closePromise = new Promise(resolve => { closeResolve = resolve; });
    const handlers = new Map();
    return class HeadlessFloatingWindow {
      constructor() { this.id = 'script-runner-headless'; if (holder) holder.instance = this; }
      addButton() {}
      addLabel() {}
      addSeparator() {}
      async updateButton() { if (onUpdate) onUpdate(); return {}; }
      async updateLabel() { if (onUpdate) onUpdate(); return {}; }
      on(type, callback) { handlers.set(type, callback); }
      onError() {}
      async show() { return {bounds: null}; }
      waitUntilClosed() { return closePromise; }
      async hide() { return null; }
      async close() {
        if (closed) return null;
        closed = true;
        const callback = handlers.get('close');
        if (callback) callback({type: 'close'});
        closeResolve();
        return null;
      }
    };
  }

  function createApp(options) {
    const settings = options || {};
    const BaseController = settings.BaseController;
    const ui = settings.playerUI || settings.ui;
    const Floating = settings.FloatingWindow;
    const command = settings.command;
    const execution = settings.execution;
    const system = settings.system;
    if (!BaseController || typeof BaseController.createApp !== 'function') throw new Error('script runner player requires BaseController');
    if (!ui || typeof ui.createWindow !== 'function') throw new Error('script runner player requires playerUI.createWindow()');
    if (typeof Floating !== 'function') throw new Error('script runner player requires FloatingWindow');

    let base = null;
    let closed = false;
    let toolbarVisible = false;
    let toolbarState = null;
    let lastToolbarBounds = null;
    let panel = null;
    let panelCreating = null;
    let panelLifecycle = 'uncreated';
    let panelDesiredVisible = false;
    let panelIntent = 0;
    let panelSequence = 0;
    let panelHighlightKey = null;
    let lastKnownCurrentKey = null;
    let panelSignature = '';
    let syncQueued = false;
    const lifecycleHolder = {instance: null};

    const Headless = createLifecycleToolbar(() => queueSync(), lifecycleHolder);
    const baseOptions = Object.assign({}, settings, {FloatingWindow: Headless});
    delete baseOptions.BaseController;
    delete baseOptions.playerUI;
    delete baseOptions.previousIcon;
    delete baseOptions.nextIcon;
    base = BaseController.createApp(baseOptions);

    const toolbar = new Floating({
      position: {mode: 'anchor', horizontal: 'right', vertical: 'bottom', margin: 16, display: 'active'},
      title: 'OpenDesk Script Runner',
      theme: 'dark',
      alwaysOnTop: true,
      draggable: true,
      orientation: 'horizontal',
      toolbar: {maxWidth: 520, maxRows: 1},
    });

    function baseState() { return base.state(); }
    function scripts() { return base.scripts(); }
    function orderedNames() { return scriptNames(scripts()); }
    function currentKey() {
      const state = baseState();
      return state && state.selectedScriptName || lastKnownCurrentKey || null;
    }
    function isRunning() {
      const state = baseState();
      return !!(state && (state.running || state.activeRun));
    }
    function currentDisplayKey() {
      const state = baseState();
      if (state && state.activeRun && state.activeRun.current) return state.activeRun.current;
      return state && state.selectedScriptName || lastKnownCurrentKey || null;
    }

    async function safeToolbar(method, ...args) {
      try {
        if (typeof toolbar[method] === 'function') return await toolbar[method](...args);
      } catch (_) {}
      return null;
    }

    async function syncToolbar() {
      if (closed) return;
      const state = baseState();
      const names = orderedNames();
      const selected = state.selectedScriptName || null;
      if (selected) lastKnownCurrentKey = selected;
      const index = names.indexOf(selected);
      const running = !!(state.running || state.activeRun);
      const readable = !state.loadError && state.configValid !== false;
      const runnable = readable && !!selected && names.includes(selected);
      const displayKey = currentDisplayKey();
      const label = displayKey ? displayScriptName(displayKey) : state.loadError ? '目录错误' : '暂无脚本';
      await safeToolbar('updateButton', 'run', {disabled: running || !runnable, active: running});
      await safeToolbar('updateButton', 'stop', {disabled: !running, active: false});
      await safeToolbar('updateButton', 'previous', {disabled: running || !readable || index <= 0});
      await safeToolbar('updateButton', 'next', {disabled: running || !readable || index < 0 || index >= names.length - 1});
      await safeToolbar('updateButton', 'list', {disabled: false, active: panelLifecycle === 'visible'});
      await safeToolbar('updateLabel', 'script', {text: label, tone: state.loadError || state.configValid === false ? 'error' : running ? 'warning' : 'secondary'});
      toolbarState = {running, readable, runnable, label, index, count: names.length};
      await syncPanelControls();
    }

    function queueSync() {
      if (syncQueued || closed) return;
      syncQueued = true;
      Promise.resolve().then(async () => {
        syncQueued = false;
        await syncToolbar();
      }).catch(() => { syncQueued = false; });
    }

    async function selectScript(name) {
      if (isRunning()) return false;
      if (!orderedNames().includes(name)) return false;
      const changed = await base.selectScript(name);
      if (changed !== false) {
        lastKnownCurrentKey = name;
        panelHighlightKey = name;
      }
      await syncToolbar();
      return changed !== false;
    }

    async function shiftCurrent(delta) {
      if (isRunning()) return false;
      const names = orderedNames();
      const index = names.indexOf(currentKey());
      const target = index + delta;
      if (index < 0 || target < 0 || target >= names.length) return false;
      return selectScript(names[target]);
    }

    async function runCurrent() {
      const state = baseState();
      const key = state.selectedScriptName;
      const script = key ? scripts().find(item => item.name === key) : null;
      if (!script) {
        const error = new Error(key ? `当前脚本已不存在：${key}` : '没有可运行的脚本');
        error.code = key ? 'FILE_NOT_FOUND' : 'NO_CURRENT_SCRIPT';
        return Promise.reject(error);
      }
      const pending = base.requestRun([script], 'toolbar-player');
      await Promise.resolve();
      await syncToolbar();
      try { return await pending; } finally { await syncToolbar(); }
    }

    function panelSpec() {
      const state = baseState();
      const all = scripts();
      const highlight = panelHighlightKey && all.some(item => item.name === panelHighlightKey)
        ? panelHighlightKey : state.selectedScriptName || (all[0] && all[0].name) || null;
      panelHighlightKey = highlight;
      panelSignature = all.map(item => item.name).join('\u0000');
      return {
        id: `scriptRunnerPanel${++panelSequence}`,
        kind: 'normal',
        title: '脚本',
        position: {mode: 'anchor', size: {width: PANEL_WIDTH, height: panelHeight(all.length)}, horizontal: 'right', vertical: 'bottom', margin: 64, display: 'active'},
        alwaysOnTop: true,
        draggable: false,
        theme: 'dark',
        content: {html: buildPanelHTML(all, {currentKey: state.selectedScriptName, highlightKey: highlight, running: isRunning(), loadError: state.loadError}), css: PANEL_CSS},
      };
    }

    function bindPanel(window, snapshot) {
      const names = snapshot.map(script => script.name);
      if (names.length) {
        window.control('panelSelection').on('change', async event => {
          const value = event && typeof event.value === 'string' ? event.value : null;
          if (value && names.includes(value)) panelHighlightKey = value;
        });
        window.control('panelSelection').on('click', async event => {
          if (isRunning()) return;
          const value = event && typeof event.value === 'string' ? event.value : panelHighlightKey;
          if (!value || !names.includes(value)) return;
          panelHighlightKey = value;
          await selectScript(value);
        });
      }
      window.control('panelRefresh').on('click', async () => { if (!isRunning()) await refreshScripts(); });
      window.control('panelOpenDirectory').on('click', async () => { await hidePanel(); await openScriptDirectory(); });
      window.control('panelManage').on('click', async () => { await hidePanel(); await base.openList('player-manage'); });
      window.control('panelKeyEnter').on('click', () => panelKey('Enter'));
      window.control('panelKeyEscape').on('click', () => panelKey('Escape'));
      window.control('panelBlur').on('click', () => hidePanel());
      window.on('close', () => {
        if (panel === window) {
          panel = null;
          panelLifecycle = 'destroyed';
          panelDesiredVisible = false;
          queueSync();
        }
      });
    }

    async function ensurePanel() {
      if (closed) return null;
      if (panel) return panel;
      if (panelCreating) return panelCreating;
      const intentAtCreate = panelIntent;
      panelLifecycle = 'creating';
      const snapshot = scripts();
      const task = (async () => {
        const window = await ui.createWindow(panelSpec());
        if (closed) {
          try { await window.close(); } catch (_) {}
          return null;
        }
        panel = window;
        panelLifecycle = 'hidden';
        bindPanel(window, snapshot);
        if (panelIntent !== intentAtCreate && !panelDesiredVisible) return window;
        return window;
      })();
      panelCreating = task;
      try { return await task; }
      finally { if (panelCreating === task) panelCreating = null; }
    }

    async function safePanelControl(id, patch) {
      if (!panel) return null;
      try { return await panel.control(id).update(patch); } catch (_) { return null; }
    }

    async function syncPanelControls() {
      if (!panel) return;
      const state = baseState();
      const all = scripts();
      const signature = all.map(item => item.name).join('\u0000');
      if (signature !== panelSignature) {
        const wasVisible = panelLifecycle === 'visible' && panelDesiredVisible;
        const old = panel;
        panel = null;
        panelLifecycle = 'destroyed';
        try { await old.close(); } catch (_) {}
        if (wasVisible) await showPanel();
        return;
      }
      const running = isRunning();
      const current = state.selectedScriptName || null;
      if (!panelHighlightKey || !all.some(item => item.name === panelHighlightKey)) panelHighlightKey = current || (all[0] && all[0].name) || null;
      await safePanelControl('panelMode', {text: running ? '运行中 · 仅查看' : '选择脚本'});
      await safePanelControl('panelStatus', {text: state.loadError ? (state.loadError.message || String(state.loadError)) : running ? '运行期间不会改变当前脚本。' : '单击只选择，不会运行；方向键只移动高亮。'});
      await safePanelControl('panelRefresh', {disabled: running});
      if (all.length) {
        await safePanelControl('panelSelection', {
          disabled: running || !!state.loadError,
          value: panelHighlightKey || '',
          options: all.map(script => ({
            value: script.name,
            label: `${script.name === current ? '✓ ' : ''}${displayScriptName(script.name)}`,
          })),
        });
      }
    }

    async function anchorPanel(explicitBounds) {
      if (!panel) return;
      let anchor = explicitBounds || lastToolbarBounds || null;
      if (!anchor) {
        try {
          if (typeof toolbar.getButtonState === 'function') {
            const button = await toolbar.getButtonState('list');
            anchor = button && button.screenBounds;
          }
        } catch (_) {}
      }
      if (!anchor) {
        try {
          const state = typeof toolbar.getState === 'function' ? await toolbar.getState() : null;
          anchor = state && state.bounds;
        } catch (_) {}
      }
      if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return;
      let panelState = null;
      try { panelState = await panel.getState(); } catch (_) {}
      const width = panelState && panelState.bounds && panelState.bounds.width || PANEL_WIDTH;
      const height = panelState && panelState.bounds && panelState.bounds.height || panelHeight(scripts().length);
      const x = anchor.x + anchor.width - width;
      const above = anchor.y - height - PANEL_GAP;
      const below = anchor.y + anchor.height + PANEL_GAP;
      const y = above >= 0 ? above : below;
      try { await panel.setPosition(x, y); } catch (_) {}
    }

    async function showPanel() {
      if (closed) return null;
      panelDesiredVisible = true;
      const intent = ++panelIntent;
      const window = await ensurePanel();
      if (!window || closed || !panelDesiredVisible || intent !== panelIntent) return null;
      await syncPanelControls();
      await anchorPanel();
      await window.show();
      if (closed || !panelDesiredVisible || intent !== panelIntent) {
        try { await window.hide(); } catch (_) {}
        panelLifecycle = 'hidden';
        await syncToolbar();
        return null;
      }
      panelLifecycle = 'visible';
      await syncToolbar();
      return window;
    }

    async function hidePanel() {
      panelDesiredVisible = false;
      ++panelIntent;
      if (panel) {
        try { await panel.hide(); } catch (_) {
          panel = null;
          panelLifecycle = 'destroyed';
          await syncToolbar();
          return;
        }
      }
      if (panelLifecycle !== 'uncreated' && panelLifecycle !== 'destroyed') panelLifecycle = 'hidden';
      await syncToolbar();
    }

    async function togglePanel() {
      if (panelDesiredVisible || panelLifecycle === 'visible') { await hidePanel(); return null; }
      return showPanel();
    }

    async function panelKey(key) {
      if (key === 'Escape') { await hidePanel(); return true; }
      const all = orderedNames();
      if (!all.length) return false;
      let index = all.indexOf(panelHighlightKey);
      if (index < 0) index = Math.max(0, all.indexOf(currentKey()));
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const delta = key === 'ArrowUp' ? -1 : 1;
        const target = Math.max(0, Math.min(all.length - 1, index + delta));
        panelHighlightKey = all[target];
        await syncPanelControls();
        return target !== index;
      }
      if (key === 'Enter') {
        if (isRunning()) return false;
        const target = panelHighlightKey || all[0];
        if (!target) return false;
        await selectScript(target);
        return true;
      }
      return false;
    }

    async function refreshScripts() {
      if (isRunning()) return false;
      const oldOrder = orderedNames();
      const oldCurrent = baseState().selectedScriptName || lastKnownCurrentKey;
      const ok = await base.rescan();
      if (!ok) {
        lastKnownCurrentKey = oldCurrent || lastKnownCurrentKey;
        await syncToolbar();
        return false;
      }
      const newOrder = orderedNames();
      const replacement = reconcileCurrentAfterRefresh(oldOrder, newOrder, oldCurrent);
      if (replacement && baseState().selectedScriptName !== replacement) await base.selectScript(replacement);
      lastKnownCurrentKey = replacement;
      panelHighlightKey = replacement;
      await syncToolbar();
      return true;
    }

    async function openScriptDirectory() {
      const root = settings.scriptRoot;
      if (!root || !command || !system || !execution) return null;
      const platform = system.getPlatformInfo().os;
      if (platform === 'windows') return command.run('explorer.exe', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024, hideWindow: true});
      if (platform === 'darwin') return command.run('/usr/bin/open', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024, hideWindow: true});
      return command.run('xdg-open', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024, hideWindow: true});
    }

    toolbar.addButton('run', '运行', 'play.fill', runCurrent);
    toolbar.addButton('stop', '停止', 'stop.fill', async () => { const stopped = await base.stopRun(); await syncToolbar(); return stopped; });
    toolbar.addButton('previous', '上一个脚本', settings.previousIcon || 'backward.fill', () => shiftCurrent(-1));
    toolbar.addLabel('script', '暂无脚本', {width: 168, alignment: 'center', verticalAlignment: 'center', tone: 'secondary'});
    toolbar.addButton('next', '下一个脚本', settings.nextIcon || 'forward.fill', () => shiftCurrent(1));
    toolbar.addButton('list', '脚本列表', 'list.bullet', togglePanel);
    toolbar.on('move', event => {
      if (event && event.bounds) lastToolbarBounds = event.bounds;
      if (panelLifecycle === 'visible') void anchorPanel(event && event.bounds);
    });
    toolbar.on('close', () => {
      if (closed) return;
      closed = true;
      panelDesiredVisible = false;
      ++panelIntent;
      if (panel) { const current = panel; panel = null; panelLifecycle = 'destroyed'; void current.close().catch(() => {}); }
      if (lifecycleHolder.instance && typeof lifecycleHolder.instance.close === 'function') void lifecycleHolder.instance.close();
    });
    toolbar.onError(() => {});

    async function run() {
      const baseRun = base.run();
      await Promise.resolve();
      const shown = await toolbar.show();
      lastToolbarBounds = shown && shown.bounds ? shown.bounds : lastToolbarBounds;
      toolbarVisible = true;
      await syncToolbar();
      await toolbar.waitUntilClosed();
      closed = true;
      panelDesiredVisible = false;
      if (panel) {
        const current = panel;
        panel = null;
        panelLifecycle = 'destroyed';
        try { await current.close(); } catch (_) {}
      }
      if (lifecycleHolder.instance && typeof lifecycleHolder.instance.close === 'function') {
        try { await lifecycleHolder.instance.close(); } catch (_) {}
      }
      try { await baseRun; } catch (_) {}
      return shown;
    }

    async function prepareList(message) { return base.prepareList(message); }
    async function openList(message) { await hidePanel(); return base.openList(message); }
    async function stopRun() { const value = await base.stopRun(); await syncToolbar(); return value; }
    async function restoreDefaultOrder() { if (isRunning()) return false; const value = await base.restoreDefaultOrder(); await syncToolbar(); return value; }
    async function requestRun(queue, source) {
      const pending = base.requestRun(queue, source);
      await Promise.resolve();
      await syncToolbar();
      try { return await pending; } finally { await syncToolbar(); }
    }

    function state() {
      return Object.assign({}, clone(base.state()), {
        player: {
          toolbarVisible,
          toolbarState: clone(toolbarState),
          panelLifecycle,
          panelDesiredVisible,
          panelHighlightKey,
          lastKnownCurrentKey,
        },
      });
    }

    return Object.freeze({
      run,
      prepareList,
      openList,
      openPanel: showPanel,
      closePanel: hidePanel,
      togglePanel,
      panelKey,
      selectScript,
      previous: () => shiftCurrent(-1),
      next: () => shiftCurrent(1),
      rescan: refreshScripts,
      stopRun,
      restoreDefaultOrder,
      requestRun,
      scripts: () => clone(scripts()),
      state,
    });
  }

  function wrapController(BaseController, defaults) {
    if (!BaseController || typeof BaseController.createApp !== 'function') throw new Error('script runner player requires a base controller');
    const wrapper = Object.assign({}, BaseController);
    wrapper.createApp = options => createApp(Object.assign({}, options || {}, defaults || {}, {BaseController}));
    return Object.freeze(wrapper);
  }

  global.OpenDeskScriptRunnerPlayer = Object.freeze({
    createApp,
    wrapController,
    displayScriptName,
    reconcileCurrentAfterRefresh,
    buildPanelHTML,
  });
})(globalThis);
