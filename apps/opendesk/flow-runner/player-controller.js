(function installOpenDeskFlowRunnerPlayerController(global) {
  'use strict';

  const PANEL_WIDTH = 320;
  const PANEL_MIN_HEIGHT = 88;
  const PANEL_MAX_HEIGHT = 360;
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

  function displayEntryName(name) {
    const value = String(name || '');
    const parts = value.split(/[\\/]/);
    const base = parts[parts.length - 1] || value;
    return /\.(?:m?js|odpkg)$/i.test(base) ? base.replace(/\.(?:m?js|odpkg)$/i, '') : base;
  }

  function displayEntry(entry) {
    if (entry && typeof entry === 'object') {
      return entry.displayName || displayEntryName(entry.name);
    }
    return displayEntryName(entry);
  }

  function entryNames(entries) {
    return (entries || []).map(entry => typeof entry === 'string' ? entry : entry && entry.name).filter(Boolean);
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
    // position.size is the outer native frame. Keep enough vertical allowance
    // for the normal-window chrome in addition to the compact HTML row area.
    return Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, 40 + rows * PANEL_ROW_HEIGHT));
  }

  function finiteBounds(value) {
    return !!value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]))
      && value.width > 0 && value.height > 0;
  }

  function displayForBounds(displays, bounds) {
    if (!finiteBounds(bounds)) return null;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    return (displays || []).find(display => finiteBounds(display)
      && centerX >= display.x && centerX < display.x + display.width
      && centerY >= display.y && centerY < display.y + display.height) || null;
  }

  // Compatibility only for an older host that has not yet gained
  // WindowHandle.setRelativeTo(). Production hosts resolve the selected
  // display's native work area themselves; this fallback deliberately stays in
  // logical coordinates and handles negative-origin displays for test adapters.
  function fallbackPanelPosition(anchor, size, displays) {
    if (!finiteBounds(anchor) || !finiteBounds(size)) return null;
    const workArea = displayForBounds(displays, anchor);
    const candidates = [
      {x: anchor.x + anchor.width - size.width, y: anchor.y - size.height - PANEL_GAP},
      {x: anchor.x + anchor.width - size.width, y: anchor.y + anchor.height + PANEL_GAP},
      {x: anchor.x - size.width - PANEL_GAP, y: anchor.y},
      {x: anchor.x + anchor.width + PANEL_GAP, y: anchor.y},
    ];
    const candidate = candidates.find(item => !workArea || (
      item.x >= workArea.x && item.y >= workArea.y
      && item.x + size.width <= workArea.x + workArea.width
      && item.y + size.height <= workArea.y + workArea.height
    )) || candidates[0];
    if (!workArea) return candidate;
    return {
      x: Math.max(workArea.x, Math.min(candidate.x, workArea.x + workArea.width - size.width)),
      y: Math.max(workArea.y, Math.min(candidate.y, workArea.y + workArea.height - size.height)),
    };
  }

  function buildPanelHTML(entries, state) {
    const input = state || {};
    const currentKey = input.currentKey || null;
    const highlightKey = input.highlightKey || currentKey;
    const running = !!input.running;
    const loadError = input.loadError || null;
    const all = entries || [];
    const rows = all.map((entry, index) => {
      const current = entry.name === currentKey;
      const highlighted = entry.name === highlightKey;
      const classes = ['entry-row'];
      if (current) classes.push('current');
      if (highlighted) classes.push('highlight');
      const displayName = displayEntry(entry);
      return `<button id="panelEntry${index}" class="${classes.join(' ')}" title="${escapeHTML(entry.path || displayName)}" aria-label="选择 ${escapeHTML(displayName)}"${running || loadError ? ' disabled' : ''}><span class="marker" aria-hidden="true"></span><span class="entry-name">${escapeHTML(displayName)}</span></button>`;
    });
    const list = all.length
      ? `<div id="panelEntryList" class="entry-list" aria-label="流程列表">${rows.join('\n')}</div>`
      : `<p id="panelEmpty" class="empty">${loadError ? '自动化目录读取失败' : '暂无可运行的流程'}</p>`;
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main>
        <div class="list">${list}</div>
        <button id="panelManage" class="manage-button" title="管理流程" aria-label="管理流程">⚙</button>
      </main>
    </body></html>`;
  }

  const PANEL_CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box} main{position:relative;height:100vh;padding:8px;overflow:hidden}
    .list{height:100%;min-height:0;overflow:hidden;border:1px solid #333;border-radius:9px;background:#1d1d1d}
    .entry-list{width:100%;height:100%;min-height:0;overflow:auto;padding:4px 42px 4px 4px}.entry-row{width:100%;min-height:34px;border:0;border-radius:6px;background:transparent;color:#f4f4f4;padding:7px 8px;display:flex;align-items:center;gap:7px;text-align:left;font:inherit}.entry-row:not(:disabled){cursor:pointer}.entry-row:hover:not(:disabled){background:#292929}.entry-row.highlight{background:#2d3b52;color:#fff}.entry-row.current .marker{color:#8db7ff}.entry-row.current .marker::before{content:'✓'}.entry-row:disabled{opacity:.68}.marker{flex:0 0 15px;width:15px;text-align:center;color:transparent}.entry-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{margin:0;padding:24px 12px;text-align:center;color:#999}
    .manage-button{position:absolute;top:12px;right:12px;width:30px;height:30px;padding:0;border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1}.manage-button:not(:disabled){cursor:pointer}.manage-button:hover:not(:disabled){background:#3b3b3b}
  `;

  function buildPanelContent(entries, state) {
    return {html: buildPanelHTML(entries, state), css: PANEL_CSS};
  }

  function createLifecycleToolbar(onUpdate, holder) {
    let closed = false;
    let closeResolve;
    const closePromise = new Promise(resolve => { closeResolve = resolve; });
    const handlers = new Map();
    return class HeadlessFloatingWindow {
      constructor() { this.id = 'flow-runner-headless'; if (holder) holder.instance = this; }
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
    if (!BaseController || typeof BaseController.createApp !== 'function') throw new Error('flow runner player requires BaseController');
    if (!ui || typeof ui.createWindow !== 'function') throw new Error('flow runner player requires playerUI.createWindow()');
    if (typeof Floating !== 'function') throw new Error('flow runner player requires FloatingWindow');

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
    let panelCommitPending = false;
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
      title: 'OpenDesk — 自动化',
      theme: 'dark',
      alwaysOnTop: true,
      draggable: true,
      interactionGroup: 'flowRunnerPlayer',
      orientation: 'horizontal',
      toolbar: {maxWidth: 520, maxRows: 1},
    });

    function baseState() { return base.state(); }
    function selectedEntryKey(state) {
      return state && state.selectedEntryKey || null;
    }
    function entries() {
      return typeof base.entries === 'function' ? base.entries() : [];
    }
    async function selectBaseEntry(key) {
      return typeof base.selectEntry === 'function' ? base.selectEntry(key) : false;
    }
    function orderedNames() { return entryNames(entries()); }
    function currentKey() {
      const state = baseState();
      return selectedEntryKey(state) || lastKnownCurrentKey || null;
    }
    function isRunning() {
      const state = baseState();
      return !!(state && (state.running || state.activeRun));
    }
    function currentDisplayKey() {
      const state = baseState();
      if (state && state.activeRun && state.activeRun.current) return state.activeRun.current;
      return selectedEntryKey(state) || lastKnownCurrentKey || null;
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
      const selected = selectedEntryKey(state);
      if (selected) lastKnownCurrentKey = selected;
      const index = names.indexOf(selected);
      const running = !!(state.running || state.activeRun);
      const readable = !state.loadError && state.configValid !== false;
      const selectedEntry = entries().find(item => item.name === selected);
      const runnable = readable && !!selectedEntry && (selectedEntry.kind !== 'flow' || selectedEntry.state === 'ready');
      const displayKey = currentDisplayKey();
      const displayEntryValue = entries().find(item => item.name === displayKey);
      const label = displayKey ? displayEntry(displayEntryValue || displayKey) : state.loadError ? '目录错误' : '暂无流程';
      await safeToolbar('updateButton', 'run', {disabled: running || !runnable, active: running});
      await safeToolbar('updateButton', 'stop', {disabled: !running, active: false});
      await safeToolbar('updateButton', 'previous', {disabled: running || !readable || index <= 0});
      await safeToolbar('updateButton', 'next', {disabled: running || !readable || index < 0 || index >= names.length - 1});
      await safeToolbar('updateButton', 'list', {disabled: false, active: panelLifecycle === 'visible'});
      await safeToolbar('updateLabel', 'entry', {text: label});
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

    async function selectEntry(key) {
      if (isRunning()) return false;
      if (!orderedNames().includes(key)) return false;
      const changed = await selectBaseEntry(key);
      if (changed !== false) {
        lastKnownCurrentKey = key;
        panelHighlightKey = key;
      }
      await syncToolbar();
      return changed !== false;
    }

    async function confirmPanelSelection(name) {
      if (panelCommitPending || !panelDesiredVisible || isRunning()) return false;
      if (!orderedNames().includes(name)) return false;
      // Native HTML buttons can emit a synthetic click after Enter, while a
      // double-click arrives as two click events. Claim the confirmation before
      // the first await so every event sequence has one selection side effect.
      panelCommitPending = true;
      try {
        const selected = await selectEntry(name);
        if (!selected) return false;
        await hidePanel();
        return true;
      } finally {
        panelCommitPending = false;
      }
    }

    async function shiftCurrent(delta) {
      if (isRunning()) return false;
      const names = orderedNames();
      const index = names.indexOf(currentKey());
      const target = index + delta;
      if (index < 0 || target < 0 || target >= names.length) return false;
      return selectEntry(names[target]);
    }

    async function runCurrent() {
      const state = baseState();
      const key = selectedEntryKey(state);
      const entry = key ? entries().find(item => item.name === key) : null;
      if (!entry) {
        const error = new Error(key ? `当前流程已不存在：${key}` : '暂无可运行的流程');
        error.code = key ? 'FILE_NOT_FOUND' : 'NO_CURRENT_FLOW';
        return Promise.reject(error);
      }
      const pending = base.requestRun([entry], 'toolbar-player');
      await Promise.resolve();
      await syncToolbar();
      try { return await pending; } finally { await syncToolbar(); }
    }

    function panelSpec() {
      const state = baseState();
      const all = entries();
      const highlight = panelHighlightKey && all.some(item => item.name === panelHighlightKey)
        ? panelHighlightKey : selectedEntryKey(state) || (all[0] && all[0].name) || null;
      panelHighlightKey = highlight;
      panelSignature = all.map(item => item.name).join('\u0000');
      return {
        id: `flowRunnerPanel${++panelSequence}`,
        kind: 'normal',
        title: '',
        position: {mode: 'anchor', size: {width: PANEL_WIDTH, height: panelHeight(all.length)}, horizontal: 'right', vertical: 'bottom', margin: 64, display: 'active'},
        alwaysOnTop: true,
        draggable: false,
        theme: 'dark',
        keyEvents: true,
        interactionGroup: 'flowRunnerPlayer',
        content: buildPanelContent(all, {currentKey: selectedEntryKey(state), highlightKey: highlight, running: isRunning(), loadError: state.loadError}),
      };
    }

    function bindPanel(window, snapshot) {
      const names = snapshot.map(entry => entry.name);
      for (let index = 0; index < names.length; index++) {
        const name = names[index];
        window.control(`panelEntry${index}`).on('click', async () => {
          return confirmPanelSelection(name);
        });
      }
      window.control('panelManage').on('click', async () => {
        // Enter owns keyboard confirmation even if the browser also targets a
        // focused button with a synthetic click.
        if (panelCommitPending) return false;
        await hidePanel();
        return base.openList('player-manage');
      });
      window.on('key', event => panelKey(event && event.fields && event.fields.key));
      window.on('interactionOutside', () => hidePanel());
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
      const snapshot = entries();
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
      const all = entries();
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
      const current = selectedEntryKey(state);
      if (!panelHighlightKey || !all.some(item => item.name === panelHighlightKey)) panelHighlightKey = current || (all[0] && all[0].name) || null;
      for (let index = 0; index < all.length; index++) {
        const entry = all[index];
        const classes = ['entry-row'];
        if (entry.name === current) classes.push('current');
        if (entry.name === panelHighlightKey) classes.push('highlight');
        await safePanelControl(`panelEntry${index}`, {
          classes,
          disabled: running || !!state.loadError,
        });
      }
    }

    async function anchorPanel(explicitBounds) {
      if (!panel) return;
      let anchor = null;
      try {
        if (typeof toolbar.getButtonState === 'function') {
          const button = await toolbar.getButtonState('list');
          anchor = button && button.screenBounds;
        }
      } catch (_) {}
      if (!anchor) anchor = explicitBounds || lastToolbarBounds || null;
      if (!anchor) {
        try {
          const state = typeof toolbar.getState === 'function' ? await toolbar.getState() : null;
          anchor = state && state.bounds;
        } catch (_) {}
      }
      if (!finiteBounds(anchor)) return;
      if (typeof panel.setRelativeTo === 'function') {
        try {
          await panel.setRelativeTo(anchor, {
            preferredSides: ['above', 'below', 'left', 'right'],
            align: 'end',
            gap: PANEL_GAP,
          });
          return;
        } catch (_) {}
      }
      let panelState = null;
      try { panelState = await panel.getState(); } catch (_) {}
      const width = panelState && panelState.bounds && panelState.bounds.width || PANEL_WIDTH;
      const height = panelState && panelState.bounds && panelState.bounds.height || panelHeight(entries().length);
      const Screen = settings.Screen || global.Screen;
      let displays = [];
      try { displays = Screen && typeof Screen.getDisplays === 'function' ? Screen.getDisplays() : []; } catch (_) {}
      const position = fallbackPanelPosition(anchor, {x: 0, y: 0, width, height}, displays);
      if (!position) return;
      try { await panel.setPosition(position.x, position.y); } catch (_) {}
    }

    async function showPanel() {
      if (closed) return null;
      const all = orderedNames();
      const selected = currentKey();
      panelHighlightKey = selected && all.includes(selected) ? selected : all[0] || null;
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
      const all = orderedNames();
      const selected = currentKey();
      panelHighlightKey = selected && all.includes(selected) ? selected : all[0] || null;
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
      if (isRunning()) return false;
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
        const target = panelHighlightKey || all[0];
        if (!target) return false;
        return confirmPanelSelection(target);
      }
      return false;
    }

    async function refreshEntries() {
      if (isRunning()) return false;
      const oldOrder = orderedNames();
      const oldCurrent = selectedEntryKey(baseState()) || lastKnownCurrentKey;
      const ok = await base.rescan();
      if (!ok) {
        lastKnownCurrentKey = oldCurrent || lastKnownCurrentKey;
        await syncToolbar();
        return false;
      }
      const newOrder = orderedNames();
      const replacement = reconcileCurrentAfterRefresh(oldOrder, newOrder, oldCurrent);
      if (replacement && selectedEntryKey(baseState()) !== replacement) await selectBaseEntry(replacement);
      lastKnownCurrentKey = replacement;
      panelHighlightKey = replacement;
      await syncToolbar();
      return true;
    }

    toolbar.addButton('run', '运行', 'play.fill', runCurrent);
    toolbar.addButton('stop', '停止', 'stop.fill', async () => { const stopped = await base.stopRun('toolbar-player'); await syncToolbar(); return stopped; });
    toolbar.addButton('previous', '上一个流程', settings.previousIcon || 'backward.fill', () => shiftCurrent(-1));
    toolbar.addLabel('entry', '暂无流程', {width: 168, alignment: 'center', verticalAlignment: 'center', tone: 'secondary'});
    toolbar.addButton('next', '下一个流程', settings.nextIcon || 'forward.fill', () => shiftCurrent(1));
    toolbar.addButton('list', '流程列表', 'list.bullet', togglePanel);
    toolbar.on('move', event => {
      if (event && event.bounds) lastToolbarBounds = event.bounds;
      if (panelLifecycle === 'visible') void anchorPanel();
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
    async function stopRun(source) { const value = await base.stopRun(source); await syncToolbar(); return value; }
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
      selectEntry,
      previous: () => shiftCurrent(-1),
      next: () => shiftCurrent(1),
      rescan: refreshEntries,
      stopRun,
      restoreDefaultOrder,
      requestRun,
      entries: () => clone(entries()),
      state,
    });
  }

  function wrapController(BaseController, defaults) {
    if (!BaseController || typeof BaseController.createApp !== 'function') throw new Error('flow runner player requires a base controller');
    const wrapper = Object.assign({}, BaseController);
    wrapper.createApp = options => createApp(Object.assign({}, options || {}, defaults || {}, {BaseController}));
    return Object.freeze(wrapper);
  }

  global.OpenDeskFlowRunnerPlayerController = Object.freeze({
    createApp,
    wrapController,
    displayEntryName,
    reconcileCurrentAfterRefresh,
    buildPanelHTML,
    buildPanelContent,
    fallbackPanelPosition,
  });
})(globalThis);
