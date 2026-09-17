(function installOpenDeskScriptRunnerSimple(global) {
  'use strict';

  const CONFIG_FILE = '.opendesk-runner.json';
  const CONFIG_SCHEMA_VERSION = 1;
  const RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'script-runner-simple', 'runs'];
  const MAX_OUTPUT_BYTES = 1024 * 1024;
  const MIN_LIST_ROW_CAPACITY = 32;
  const COMPACT_VISIBLE_SCRIPT_COUNT = 5;
  const BUTTON_ICONS = Object.freeze({
    run: 'play.fill',
    stop: 'stop.fill',
    openDirectory: 'folder.fill',
    refresh: 'arrow.clockwise',
    restoreOrder: 'arrow.counterclockwise',
    close: 'xmark',
    moveUp: 'square.and.arrow.up',
    moveDown: 'square.and.arrow.down',
    delete: 'trash',
  });

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

  function normalizeError(error, operation) {
    return {
      code: error && error.code ? String(error.code) : 'SCRIPT_RUNNER_FAILED',
      operation: error && error.operation ? String(error.operation) : String(operation || ''),
      message: error && error.message ? String(error.message) : String(error || 'Unknown failure'),
      exitCode: error && Number.isInteger(error.exitCode) ? error.exitCode : null,
      stdout: error && typeof error.stdout === 'string' ? error.stdout : '',
      stderr: error && typeof error.stderr === 'string' ? error.stderr : '',
    };
  }

  function safeSlug(value) {
    const text = String(value || 'script')
      .replace(/\.js$/i, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return text || 'script';
  }

  function isDirectJavaScriptName(name) {
    const value = String(name || '');
    return value.length > 3
      && !value.startsWith('.')
      && (value.toLowerCase().endsWith('.js') || value.toLowerCase().endsWith('.mjs'))
      && !value.includes('/')
      && !value.includes('\\');
  }

  function isDirectScriptName(name) {
    const value = String(name || '');
    return isDirectJavaScriptName(value)
      || (value.length > 5 && !value.startsWith('.')
        && value.toLowerCase().endsWith('.odpkg')
        && !value.includes('/') && !value.includes('\\'));
  }

  function isFlowEntryName(name) {
    return /^flow:[a-z0-9-]{6,}$/.test(String(name || ''));
  }

  function scriptDisplayName(script) {
    if (!script) return '';
    if (typeof script === 'string') return script;
    return script.displayName || script.name || '';
  }

  function validateOrderConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('排序配置必须是 JSON 对象');
    }
    if (value.schemaVersion !== CONFIG_SCHEMA_VERSION || !Array.isArray(value.order)) {
      throw new Error('排序配置 schemaVersion/order 无效');
    }
    const seen = new Set();
    const order = [];
    for (const entry of value.order) {
      if (typeof entry !== 'string' || (!isDirectScriptName(entry) && !isFlowEntryName(entry)) || seen.has(entry)) {
        throw new Error('排序配置包含非法或重复脚本名');
      }
      seen.add(entry);
      order.push(entry);
    }
    return order;
  }

  function reconcileOrder(discovered, configured) {
    const existing = new Set(discovered);
    const configuredExisting = configured.filter(name => existing.has(name));
    const configuredSet = new Set(configuredExisting);
    const appended = discovered.filter(name => !configuredSet.has(name));
    return configuredExisting.concat(appended);
  }

  function resolveSelectedScriptName(scripts, selectedName) {
    const names = (scripts || [])
      .map(script => typeof script === 'string' ? script : script && script.name)
      .filter(Boolean);
    if (!names.length) return null;
    return selectedName && names.includes(selectedName) ? selectedName : names[0];
  }

  // A successful rescan may change the collection, but it must preserve the
  // user's navigation relationship rather than silently choosing an unrelated
  // first entry when the current script disappears.
  function reconcileCurrentAfterRefresh(oldOrder, newOrder, currentName) {
    const before = Array.isArray(oldOrder) ? oldOrder.slice() : [];
    const after = Array.isArray(newOrder) ? newOrder.slice() : [];
    if (!after.length) return null;
    if (currentName && after.includes(currentName)) return currentName;
    const oldIndex = currentName ? before.indexOf(currentName) : -1;
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

  function deriveViewState(state, scriptCount) {
    if (state.loading) return 'loading';
    if (state.loadError || !state.configValid) return 'error';
    if (state.running) return 'running';
    if (scriptCount === 0) return 'empty';
    return 'ready';
  }

  function buildCompactSelectorHTML(scripts, selectedScriptName) {
    const items = scripts || [];
    const selectedName = resolveSelectedScriptName(items, selectedScriptName);
    const hasOverflow = items.length > COMPACT_VISIBLE_SCRIPT_COUNT;
    const rows = items.map((script, index) => {
    const selected = script.name === selectedName;
      const displayName = scriptDisplayName(script);
      return `<button id="compactScript${index}" class="compact-script${selected ? ' selected' : ''}" title="选择 ${escapeHTML(displayName)}" aria-label="选择 ${escapeHTML(displayName)}" aria-pressed="${selected ? 'true' : 'false'}"><span class="check">${selected ? '✓' : ''}</span><span class="script-name">${escapeHTML(displayName)}</span></button>`;
    });
    if (!rows.length) rows.push('<p class="compact-empty">暂无可运行脚本</p>');
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main>
        <p class="compact-title"><span>当前脚本</span><strong>${escapeHTML(selectedName || '暂无')}</strong><span class="compact-count">共 ${items.length} 个${hasOverflow ? ' · 可滚动查看' : ''}</span></p>
        <div class="compact-list${hasOverflow ? ' has-overflow' : ''}">${rows.join('\n')}</div>
        <footer><button id="compactManage" class="manage">管理脚本…</button></footer>
      </main>
    </body></html>`;
  }

  const COMPACT_SELECTOR_CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box} main{height:100vh;padding:10px;display:flex;flex-direction:column;gap:8px;overflow:hidden}
    .compact-title{margin:0 4px 2px;display:flex;align-items:baseline;gap:6px;font-size:12px;color:#b9b9b9;white-space:nowrap}.compact-title strong{min-width:0;max-width:116px;overflow:hidden;text-overflow:ellipsis;color:#f4f4f4;font-size:13px}.compact-count{margin-left:auto;color:#8ea7bf;font-size:11px;font-weight:600}
    .compact-list{flex:1;min-height:0;overflow-y:auto;border:1px solid #333;border-radius:8px;background:#1d1d1d}.compact-list.has-overflow{box-shadow:inset 0 -14px 18px -18px #8db7ff}
    .compact-script{width:100%;height:36px;border:0;border-bottom:1px solid #303030;border-radius:0;background:transparent;color:#f4f4f4;padding:0 10px;display:flex;align-items:center;gap:8px;text-align:left;font:inherit}
    .compact-script:last-child{border-bottom:0}.compact-script:not(:disabled){cursor:pointer}.compact-script:hover{background:#292929}.compact-script.selected{background:#252d3a}
    .check{width:16px;flex:0 0 16px;text-align:center;color:#8db7ff;font-weight:700}.script-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .compact-empty{margin:0;padding:18px 12px;text-align:center;color:#999}
    footer{padding-top:8px;border-top:1px solid #343434}.manage{width:100%;height:34px;border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;font:inherit}.manage:hover{background:#3b3b3b;border-color:#666;cursor:pointer}
  `;

  function buildListHTML(scripts, state) {
    const rowCapacity = Math.max(
      Number.isInteger(state.rowCapacity) ? state.rowCapacity : 0,
      scripts.length,
      MIN_LIST_ROW_CAPACITY,
    );
    const viewState = state.viewState || deriveViewState(state, scripts.length);
    const listVisible = viewState === 'ready' || viewState === 'running' || (!state.loadError && scripts.length > 0);
    const emptyVisible = viewState === 'empty';
    const errorVisible = viewState === 'error';
    const loadingVisible = viewState === 'loading';
    const rowParts = [];

    for (let index = 0; index < rowCapacity; index++) {
      const script = scripts[index] || null;
      const visible = !!script && listVisible;
      const hiddenClass = visible ? '' : ' is-hidden';
      const selected = script && state.selectedNames && state.selectedNames.has(script.name) ? ' checked' : '';
      const upDisabled = !script || index === 0 ? ' disabled' : '';
      const downDisabled = !script || index === scripts.length - 1 ? ' disabled' : '';
      const deleteDisabled = !script || state.running || state.pendingDeleteName ? ' disabled' : '';
      const name = script ? scriptDisplayName(script) : '';
      rowParts.push(
        `<input id="select${index}" class="select${hiddenClass}" type="checkbox" aria-label="选择第 ${index + 1} 个脚本"${selected}>`,
        `<p id="index${index}" class="index${hiddenClass}">${script ? index + 1 : ''}</p>`,
        `<p id="name${index}" class="name${hiddenClass}" data-icon="doc.text.fill" title="${escapeHTML(name)}">${escapeHTML(name)}</p>`,
        `<button id="run${index}" class="run icon-button${hiddenClass}" data-icon="${BUTTON_ICONS.run}" title="运行 ${escapeHTML(name)}" aria-label="运行第 ${index + 1} 个自动化"${script ? '' : ' disabled'}>运行</button>`,
        `<button id="up${index}" class="order icon-button${hiddenClass}" data-icon="${BUTTON_ICONS.moveUp}" title="上移 ${escapeHTML(name)}" aria-label="上移第 ${index + 1} 个自动化"${upDisabled}>上移</button>`,
        `<button id="down${index}" class="order icon-button${hiddenClass}" data-icon="${BUTTON_ICONS.moveDown}" title="下移 ${escapeHTML(name)}" aria-label="下移第 ${index + 1} 个自动化"${downDisabled}>下移</button>`,
        `<button id="delete${index}" class="delete icon-button${hiddenClass}" data-icon="${BUTTON_ICONS.delete}" title="删除 ${escapeHTML(name)}" aria-label="删除第 ${index + 1} 个自动化"${deleteDisabled}>删除</button>`,
      );
    }

    const configText = state.loadError
      ? `脚本目录不可用：${state.loadError.message || state.loadError}`
      : state.configValid
        ? `脚本目录：${state.scriptRoot}`
        : `排序配置无效：${state.configError || '请恢复默认排序后再运行'}`;
    const defaultStatus = loadingVisible
      ? '正在读取脚本目录…'
      : errorVisible
        ? (state.loadError ? `无法读取脚本目录：${state.loadError.message || state.loadError}` : `排序配置无效：${state.configError || '请恢复默认排序'}`)
        : emptyVisible
          ? '当前没有可运行脚本。'
          : `主工具条当前脚本：${state.selectedScriptName || '暂无脚本'}`;

    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main>
        <header>
          <div>
            <strong class="title">Script Runner</strong>
            <p id="rootStatus" class="subtle">${escapeHTML(configText)}</p>
          </div>
          <p id="scriptCount" class="count">${scripts.length} 个脚本</p>
        </header>
        <p id="runnerStatus" class="status">${escapeHTML(state.statusMessage || defaultStatus)}</p>

        <p id="loadingTitle" class="state-title${loadingVisible ? '' : ' is-hidden'}">正在加载脚本…</p>
        <p id="loadingHelp" class="state-help${loadingVisible ? '' : ' is-hidden'}">正在读取脚本目录，请稍候。</p>

        <p id="emptyTitle" class="state-title${emptyVisible ? '' : ' is-hidden'}">暂无可运行脚本</p>
        <p id="emptyHelp" class="state-help${emptyVisible ? '' : ' is-hidden'}">将 JavaScript Recipe 添加到脚本目录后，可以在这里直接运行。</p>
        <button id="emptyOpenDirectory" class="state-action icon-button${emptyVisible ? '' : ' is-hidden'}" data-icon="${BUTTON_ICONS.openDirectory}" title="打开自动化目录" aria-label="打开自动化目录">打开自动化目录</button>
        <button id="emptyRefresh" class="state-action icon-button${emptyVisible ? '' : ' is-hidden'}" data-icon="${BUTTON_ICONS.refresh}" title="刷新自动化列表" aria-label="空列表时刷新自动化列表">刷新自动化列表</button>

        <p id="errorTitle" class="state-title error-title${errorVisible ? '' : ' is-hidden'}">脚本列表加载失败</p>
        <p id="errorMessage" class="state-help error-message${errorVisible ? '' : ' is-hidden'}">${escapeHTML(state.loadError ? (state.loadError.message || state.loadError) : state.configError || '未知错误')}</p>
        <button id="errorRefresh" class="state-action icon-button${errorVisible ? '' : ' is-hidden'}" data-icon="${BUTTON_ICONS.refresh}" title="重新扫描自动化目录" aria-label="加载失败后重新扫描自动化目录">重新扫描自动化目录</button>

        <div class="list-grid">
          <p id="colSelect" class="column-head${listVisible ? '' : ' is-hidden'}"></p>
          <p id="colIndex" class="column-head${listVisible ? '' : ' is-hidden'}">#</p>
          <p id="colName" class="column-head${listVisible ? '' : ' is-hidden'}">脚本</p>
          <p id="colRun" class="column-head${listVisible ? '' : ' is-hidden'}">操作</p>
          <p id="colUp" class="column-head${listVisible ? '' : ' is-hidden'}">排序</p>
          <p id="colDown" class="column-head${listVisible ? '' : ' is-hidden'}"></p>
          <p id="colDelete" class="column-head${listVisible ? '' : ' is-hidden'}">删除</p>
          ${rowParts.join('\n')}
        </div>

        <footer>
          <button id="runSelected" class="icon-button primary" data-icon="${BUTTON_ICONS.run}" title="运行选中的自动化" aria-label="运行选中的自动化">运行选中的自动化</button>
          <button id="stopRun" class="icon-button" data-icon="${BUTTON_ICONS.stop}" title="停止运行" aria-label="停止运行"${state.running ? '' : ' disabled'}>停止运行</button>
          <button id="openDirectory" class="icon-button" data-icon="${BUTTON_ICONS.openDirectory}" title="打开自动化目录" aria-label="打开自动化目录">打开自动化目录</button>
          <button id="refresh" class="icon-button" data-icon="${BUTTON_ICONS.refresh}" title="刷新自动化列表" aria-label="刷新自动化列表">刷新自动化列表</button>
          <button id="restoreOrder" class="icon-button${state.configValid ? ' is-hidden' : ''}" data-icon="${BUTTON_ICONS.restoreOrder}" title="恢复默认排序" aria-label="恢复默认排序">恢复默认排序</button>
          <button id="closeList" class="icon-button" data-icon="${BUTTON_ICONS.close}" title="关闭自动化列表" aria-label="关闭自动化列表">关闭自动化列表</button>
        </footer>
      </main>
    </body></html>`;
  }

  const LIST_CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    [hidden]{display:none!important}
    *{box-sizing:border-box} main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px} .title{display:block;font-size:20px;margin:0 0 5px}.subtle{margin:0;color:#a8a8a8;font-size:12px;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{margin:0;color:#b9b9b9;white-space:nowrap}
    .status{margin:0;padding:9px 10px;border:1px solid #3a3a3a;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px;min-height:36px}
    .state-title{margin:54px 0 0;text-align:center;font-size:18px;font-weight:700}.state-help{margin:0 auto;text-align:center;color:#aaa;max-width:520px;line-height:1.5}.state-action{align-self:center}.error-title{color:#ffb7b7}.error-message{color:#d9a2a2}
    .list-grid{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:34px 36px minmax(0,1fr) 40px 34px 34px 34px;gap:0 8px;align-content:start;align-items:center}.column-head{margin:0;padding:0 0 6px;color:#8e8e8e;font-size:11px;border-bottom:1px solid #373737}.select{width:16px;height:16px;margin:16px 0 16px 8px}.index,.name{margin:0;min-height:48px;display:flex;align-items:center;border-bottom:1px solid #303030}.index{color:#aaa}.name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name[data-icon="doc.text.fill"]::before{content:"";flex:0 0 auto;width:14px;height:17px;margin-right:8px;border:1.5px solid #aab2bd;border-radius:2px;background:linear-gradient(#aab2bd,#aab2bd) 3px 5px/7px 1px no-repeat,linear-gradient(#aab2bd,#aab2bd) 3px 9px/7px 1px no-repeat,linear-gradient(#aab2bd,#aab2bd) 3px 13px/5px 1px no-repeat}.run,.order,.delete{margin:7px 0}.order,.delete{width:34px;padding:0}.delete:hover:not(:disabled){background:#482a2a;border-color:#815050;color:#ffd7d7}
    button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 10px;font:inherit}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3b3b3b;border-color:#666}button:disabled{opacity:.38}.icon-button{position:relative;box-sizing:border-box;width:34px;height:34px;min-width:34px;min-height:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px;line-height:1}.icon-button[data-icon="play.fill"]::before{content:"▶";transform:translateX(1px)}.icon-button[data-icon="stop.fill"]::before{content:"■";font-size:14px}.icon-button[data-icon="arrow.clockwise"]::before{content:"↻"}.icon-button[data-icon="arrow.counterclockwise"]::before{content:"↺"}.icon-button[data-icon="xmark"]::before{content:"×";font-size:20px}.icon-button[data-icon="square.and.arrow.up"]::before{content:"↑"}.icon-button[data-icon="square.and.arrow.down"]::before{content:"↓"}.icon-button[data-icon="folder.fill"]::before{content:"";width:18px;height:13px;border-radius:2px;background:currentColor;clip-path:polygon(0 18%,34% 18%,43% 0,100% 0,100% 100%,0 100%)}.icon-button[data-icon="trash"]::before{content:"";width:11px;height:12px;margin-top:3px;border:1.5px solid currentColor;border-top:0;border-radius:0 0 2px 2px}.icon-button[data-icon="trash"]::after{content:"";position:absolute;left:10px;top:9px;width:14px;height:5px;background:linear-gradient(currentColor,currentColor) center top/6px 1.5px no-repeat,linear-gradient(currentColor,currentColor) center 3px/14px 1.5px no-repeat}.primary{background:#245fbe;border-color:#3474d6}.is-hidden{display:none!important}
    footer{display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid #343434}footer button{min-height:34px}
  `;

  function createApp(options) {
    const settings = options || {};
    const file = settings.file || global.File;
    const command = settings.command || global.Command;
    const execution = settings.execution || global.Execution;
    const system = settings.system || global.System;
    const ui = settings.ui || global.ui;
    const dialog = settings.dialog || global.Dialog;
    const Floating = settings.FloatingWindow || global.FloatingWindow;
    const Abort = settings.AbortController || global.AbortController;
    const logger = settings.logger || global.console;
    const scriptRoot = settings.scriptRoot;
    const managedScriptRoot = settings.managedScriptRoot !== false;
    const flowCatalogEnabled = settings.flowCatalog === true;
    const openListOnStart = settings.openListOnStart !== false;
    const hideListOnClose = settings.hideListOnClose === true;
    const closeListOnRunnerExit = settings.closeListOnRunnerExit === true;

    if (!file || typeof file.join !== 'function' || typeof file.path !== 'function'
      || typeof file.stat !== 'function' || typeof file.listDir !== 'function'
      || typeof file.read !== 'function' || typeof file.write !== 'function'
      || typeof file.ensureDir !== 'function' || typeof file.remove !== 'function') {
      throw new Error('script runner requires File path/join/stat/listDir/read/write/ensureDir/remove');
    }
    if (!command || typeof command.run !== 'function') throw new Error('script runner requires Command.run()');
    if (!execution || !execution.workdir) throw new Error('script runner requires Execution.workdir');
    if (!system || typeof system.getExecutablePath !== 'function' || typeof system.getPlatformInfo !== 'function') {
      throw new Error('script runner requires System.getExecutablePath()/getPlatformInfo()');
    }
    if (!ui || typeof ui.createWindow !== 'function') throw new Error('script runner requires ui.createWindow()');
    if (typeof Floating !== 'function') throw new Error('script runner requires FloatingWindow');
    if (typeof Abort !== 'function') throw new Error('script runner requires AbortController');
    if (!scriptRoot || typeof scriptRoot !== 'string') throw new Error('script runner requires scriptRoot');

    const root = file.path(scriptRoot);
    const configFile = file.join(root, CONFIG_FILE);
    const executable = system.getExecutablePath();
    const platform = system.getPlatformInfo().os;
    const selectedNames = new Set();
    let selectedScriptName = null;
    let scripts = [];
    let configValid = true;
    let configError = '';
    let loadError = null;
    let flowCatalogError = null;
    let loading = false;
    let lastOutcome = null;
    let listWindow = null;
    let listCreating = null;
    let listVisible = false;
    let listSequence = 0;
    let listRowCapacity = MIN_LIST_ROW_CAPACITY;
    let selectorWindow = null;
    let selectorCreating = null;
    let selectorVisible = false;
    let selectorSequence = 0;
    let statusMessage = '';
    let pendingDeleteName = null;
    let runPromise = null;
    let activeRun = null;
    let closed = false;
    let configWrite = Promise.resolve();
    let uiUpdates = Promise.resolve();

    const toolbar = new Floating({
      position: {mode: 'anchor', horizontal: 'right', vertical: 'bottom', margin: 16, display: 'active'},
      title: 'OpenDesk Script Runner',
      theme: 'dark',
      alwaysOnTop: true,
      draggable: true,
      orientation: 'horizontal',
      toolbar: {maxWidth: 360},
    });

    function logRecord(kind, data) {
      const payload = Object.assign({at: new Date().toISOString()}, data || {});
      const line = `${kind}=${JSON.stringify(payload)}`;
      if (logger && typeof logger.log === 'function') logger.log(line);
    }

    function logError(error, operation, extra) {
      const normalized = normalizeError(error, operation);
      const payload = Object.assign({at: new Date().toISOString()}, extra || {}, {error: normalized});
      if (logger && typeof logger.error === 'function') {
        logger.error('SCRIPT_RUNNER_ERROR=' + JSON.stringify(payload));
      }
      return normalized;
    }

    function createRootError(message, code) {
      const error = new Error(message);
      error.code = code || 'SCRIPT_ROOT_UNAVAILABLE';
      return error;
    }

    function ensureManagedRoot() {
      const info = file.stat(root);
      if (info === null) {
        if (!managedScriptRoot) {
          throw createRootError(`配置的脚本目录不存在：${root}`, 'SCRIPT_ROOT_NOT_FOUND');
        }
        file.ensureDir(root);
        return;
      }
      if (info.type !== 'directory') {
        throw createRootError(`脚本根路径不是目录：${root}`, 'SCRIPT_ROOT_NOT_DIRECTORY');
      }
    }

    function discoverNames() {
      ensureManagedRoot();
      const names = [];
      for (const name of file.listDir(root)) {
        if (!isDirectScriptName(name)) continue;
        const path = file.join(root, name);
        const entry = file.stat(path);
        if (entry && entry.type === 'file') names.push(name);
      }
      names.sort((left, right) => left.localeCompare(right));
      return names;
    }

    function directScriptEntry(name) {
      const extension = String(name).toLowerCase().endsWith('.odpkg') ? '.odpkg' : '';
      return {
        name,
        key: name,
        path: file.join(root, name),
        kind: extension ? 'protected-package' : 'script',
        displayName: extension ? name.slice(0, -extension.length) : name,
      };
    }

    function discoverEntries() {
      return discoverNames().map(directScriptEntry);
    }

    function readOrder() {
      const info = file.stat(configFile);
      if (info === null) return {exists: false, order: []};
      if (info.type !== 'file') throw new Error(`${CONFIG_FILE} 不是普通文件`);
      return {exists: true, order: validateOrderConfig(JSON.parse(String(file.read(configFile))))};
    }

    function setScriptsFromNames(names) {
      setScriptsFromEntries(names.map(directScriptEntry));
    }

    function setScriptsFromEntries(entries) {
      scripts = entries.map(entry => Object.assign({}, entry, {
        name: entry.key || entry.name,
      }));
      const available = new Set(scripts.map(script => script.name));
      for (const selected of Array.from(selectedNames)) {
        if (!available.has(selected)) selectedNames.delete(selected);
      }
      selectedScriptName = resolveSelectedScriptName(scripts, selectedScriptName);
    }

    function decodeCommandJSON(result, operation) {
      const output = result && typeof result.stdout === 'string' ? result.stdout.trim() : '';
      if (!output) throw new Error(`${operation} 没有返回 JSON 结果`);
      let envelope;
      try {
        envelope = JSON.parse(output);
      } catch (error) {
        const failure = new Error(`${operation} 返回了无效 JSON`);
        failure.cause = error;
        throw failure;
      }
      if (!envelope || envelope.ok !== true || !envelope.result) {
        const error = new Error(envelope && envelope.error && envelope.error.message
          ? String(envelope.error.message) : `${operation} 失败`);
        error.code = envelope && envelope.error && envelope.error.code
          ? String(envelope.error.code) : 'FLOW_CATALOG_FAILED';
        throw error;
      }
      return envelope.result;
    }

    async function inspectProtectedDisplayName(entry) {
      try {
        const result = await command.run(executable, ['package', 'inspect', entry.path], {
          cwd: execution.workdir,
          timeout: 30000,
          maxOutputBytes: MAX_OUTPUT_BYTES,
          hideWindow: true,
        });
        const payload = decodeCommandJSON(result, 'package inspect');
        const manifest = payload.manifest || {};
        // Protected v1 has no display-name field. Package ID is authenticated
        // public metadata and is the only safe friendly name available here.
        if (typeof manifest.packageId === 'string' && manifest.packageId.trim()) {
          entry.displayName = manifest.packageId.trim();
        }
      } catch (_) {
        // A malformed or unauthorized package remains visible by its safe file
        // stem and will fail at the existing protected execution boundary.
      }
      return entry;
    }

    async function discoverFlowEntries() {
      const result = await command.run(executable, ['flow', 'list'], {
        cwd: execution.workdir,
        timeout: 30000,
        maxOutputBytes: MAX_OUTPUT_BYTES,
        hideWindow: true,
      });
      const payload = decodeCommandJSON(result, 'flow list');
      if (!Array.isArray(payload.flows)) throw new Error('flow list 返回的 flows 不是数组');
      return payload.flows.map(record => {
        const installId = record && typeof record.installId === 'string' ? record.installId : '';
        const name = record && typeof record.name === 'string' ? record.name.trim() : '';
        if (!/^(?:flow|local)-[a-f0-9]{32}$/.test(installId) || !name) return null;
        return {
          name: `flow:${installId}`,
          key: `flow:${installId}`,
          path: `flow:${installId}`,
          kind: 'flow',
          installId,
          state: record.state || 'blocked',
          displayName: name,
          record,
        };
      }).filter(Boolean);
    }

    async function discoverAllEntries() {
      const direct = discoverEntries();
      const protectedEntries = direct.filter(entry => entry.kind === 'protected-package');
      await Promise.all(protectedEntries.map(inspectProtectedDisplayName));
      if (!flowCatalogEnabled) return direct;
      const flows = await discoverFlowEntries();
      return direct.concat(flows);
    }

    function selectedScript() {
      if (!selectedScriptName) return null;
      return scripts.find(script => script.name === selectedScriptName) || null;
    }

    function applyDiscoveredEntries(discovered) {
      const discoveredKeys = discovered.map(entry => entry.key || entry.name);
      const byKey = new Map(discovered.map(entry => [entry.key || entry.name, entry]));
      const config = readOrder();
      const orderedKeys = config.exists ? reconcileOrder(discoveredKeys, config.order) : discoveredKeys;
      setScriptsFromEntries(orderedKeys.map(key => byKey.get(key)).filter(Boolean));
      configValid = true;
      configError = '';
    }

    function loadScripts() {
      loadError = null;
      let discovered;
      try {
        discovered = discoverEntries();
      } catch (error) {
        // A directory-read failure is neither an empty list nor permission to
        // replace the current target. Keep the last known collection inert and
        // make the explicit loadError gate every execution path.
        configValid = true;
        configError = '';
        loadError = logError(error, 'ScriptRunner.scan', {scriptRoot: root});
        return scripts;
      }

      try {
        applyDiscoveredEntries(discovered);
      } catch (error) {
        setScriptsFromEntries(discovered);
        configValid = false;
        configError = normalizeError(error, 'ScriptRunner.loadOrder').message;
        logError(error, 'ScriptRunner.loadOrder', {configFile});
      }
      return scripts;
    }

    async function loadAllScripts() {
      loadError = null;
      flowCatalogError = null;
      let discovered;
      try {
        discovered = await discoverAllEntries();
      } catch (error) {
        configValid = true;
        configError = '';
        flowCatalogError = normalizeError(error, 'ScriptRunner.flowCatalog');
        logError(error, 'ScriptRunner.flowCatalog', {scriptRoot: root});
        // Keep legacy recipes available when the catalog command is not
        // reachable. A product build still exposes the failure in status so
        // an installed Flow is never silently presented as absent.
        try {
          discovered = discoverEntries();
        } catch (directoryError) {
          loadError = logError(directoryError, 'ScriptRunner.scan', {scriptRoot: root});
          return scripts;
        }
      }

      try {
        applyDiscoveredEntries(discovered);
      } catch (error) {
        setScriptsFromEntries(discovered);
        configValid = false;
        configError = normalizeError(error, 'ScriptRunner.loadOrder').message;
        logError(error, 'ScriptRunner.loadOrder', {configFile});
      }
      return scripts;
    }

    function queueConfigWrite(order) {
      const payload = JSON.stringify({schemaVersion: CONFIG_SCHEMA_VERSION, order}, null, 2) + '\n';
      configWrite = configWrite.catch(() => {}).then(() => {
        ensureManagedRoot();
        file.write(configFile, payload);
      });
      return configWrite;
    }

    async function saveCurrentOrder() {
      const order = scripts.map(script => script.name);
      await queueConfigWrite(order);
      configValid = true;
      configError = '';
      loadError = null;
      logRecord('SCRIPT_RUNNER_ORDER_CHANGED', {order});
    }

    function idleLabel() {
      if (loadError) return '目录错误';
      const current = selectedScript();
      return current ? scriptDisplayName(current) : '暂无脚本';
    }

    function currentLabel() {
      if (!activeRun || !activeRun.current) return idleLabel();
      if (activeRun.total > 1) return `${activeRun.index + 1}/${activeRun.total} · ${scriptDisplayName(activeRun.current)}`;
      return scriptDisplayName(activeRun.current);
    }

    function viewState() {
      return deriveViewState({
        loading,
        loadError,
        configValid,
        running: !!runPromise,
      }, scripts.length);
    }

    function listState() {
      return {
        selectedNames,
        selectedScriptName,
        configValid,
        configError,
        loadError,
        loading,
        running: !!runPromise,
        viewState: viewState(),
        scriptRoot: root,
        statusMessage,
        pendingDeleteName,
        rowCapacity: listRowCapacity,
      };
    }

    function defaultStatusMessage() {
      if (loading) return '正在读取脚本目录…';
      if (loadError) return `无法读取脚本目录：${loadError.message}`;
      if (flowCatalogError) return `Flow Catalog 不可用：${flowCatalogError.message}`;
      if (!configValid) return `排序配置无效：${configError || '请恢复默认排序'}`;
      if (!scripts.length) return '当前没有可运行脚本。';
      if (runPromise && activeRun && activeRun.current) return `正在运行：${scriptDisplayName(activeRun.current)}`;
      const current = selectedScript();
      return `当前脚本：${current ? scriptDisplayName(current) : '暂无脚本'}`;
    }

    async function safeControlUpdate(id, patch) {
      if (!listWindow) return null;
      try { return await listWindow.control(id).update(patch); } catch (_) { return null; }
    }

    function queueUIUpdate(update) {
      uiUpdates = uiUpdates.catch(() => {}).then(update);
      return uiUpdates;
    }

    function safeToolbarUpdate() {
      return queueUIUpdate(updateToolbar);
    }

    async function updateToolbar() {
      const busy = !!activeRun || !!pendingDeleteName;
      const current = selectedScript();
      const runnable = !loadError && configValid && !!current
        && (current.kind !== 'flow' || current.state === 'ready');
      try {
        await toolbar.updateButton('run', {disabled: busy || !runnable, active: busy});
      } catch (_) {}
      try {
        await toolbar.updateButton('stop', {disabled: !busy, active: false});
      } catch (_) {}
      try {
        await toolbar.updateButton('list', {disabled: busy, active: selectorVisible});
      } catch (_) {}
      try {
        await toolbar.updateLabel('script', {
          text: currentLabel(),
          tone: loadError || !configValid ? 'error' : (busy ? 'warning' : 'secondary'),
        });
      } catch (_) {}
    }

    function setListStatus(message) {
      statusMessage = String(message || '');
      return queueUIUpdate(async () => {
        if (!listWindow) return;
        await safeControlUpdate('runnerStatus', {text: statusMessage || defaultStatusMessage()});
      });
    }

    function syncListControls() {
      return queueUIUpdate(updateListControls);
    }

    async function updateListControls() {
      if (!listWindow) return;
      const busy = !!activeRun || !!pendingDeleteName;
      const currentView = viewState();
      const listVisible = currentView === 'ready' || currentView === 'running' || (!loadError && scripts.length > 0 && currentView === 'error');
      const emptyVisible = currentView === 'empty';
      const errorVisible = currentView === 'error';
      const loadingVisible = currentView === 'loading';
      const rootText = loadError
        ? `脚本目录不可用：${loadError.message}`
        : flowCatalogError
          ? `Flow Catalog 不可用：${flowCatalogError.message}`
        : configValid
          ? `脚本目录：${root}`
          : `排序配置无效：${configError || '请恢复默认排序后再运行'}`;

      await safeControlUpdate('rootStatus', {text: rootText});
      await safeControlUpdate('scriptCount', {text: `${scripts.length} 个脚本`});
      await safeControlUpdate('runnerStatus', {text: statusMessage || defaultStatusMessage()});

      await safeControlUpdate('loadingTitle', {visible: loadingVisible, classes: ['state-title']});
      await safeControlUpdate('loadingHelp', {visible: loadingVisible, classes: ['state-help']});
      await safeControlUpdate('emptyTitle', {visible: emptyVisible, classes: ['state-title']});
      await safeControlUpdate('emptyHelp', {visible: emptyVisible, classes: ['state-help']});
      await safeControlUpdate('emptyOpenDirectory', {visible: emptyVisible, classes: ['state-action', 'icon-button']});
      await safeControlUpdate('emptyRefresh', {visible: emptyVisible, classes: ['state-action', 'icon-button']});
      await safeControlUpdate('errorTitle', {visible: errorVisible, classes: ['state-title', 'error-title']});
      await safeControlUpdate('errorMessage', {visible: errorVisible, classes: ['state-help', 'error-message']});
      await safeControlUpdate('errorRefresh', {visible: errorVisible, classes: ['state-action', 'icon-button']});
      if (errorVisible) {
        const message = loadError ? loadError.message : configError || '未知错误';
        await safeControlUpdate('errorMessage', {text: message});
      }
      for (const id of ['colSelect', 'colIndex', 'colName', 'colRun', 'colUp', 'colDown', 'colDelete']) {
        await safeControlUpdate(id, {visible: listVisible, classes: ['column-head']});
      }

      for (let index = 0; index < listRowCapacity; index++) {
        const script = scripts[index] || null;
        const visible = !!script && listVisible;
        const basePatches = {visible};
        await safeControlUpdate(`select${index}`, Object.assign({}, basePatches, {
          checked: !!(script && selectedNames.has(script.name)),
          disabled: busy || !script || !!loadError,
          classes: ['select'],
        }));
        await safeControlUpdate(`index${index}`, {visible, text: script ? String(index + 1) : '', classes: ['index']});
        const displayName = script ? scriptDisplayName(script) : '';
        await safeControlUpdate(`name${index}`, {visible, text: displayName, classes: ['name']});
        await safeControlUpdate(`run${index}`, {
          visible,
          disabled: busy || !script || !configValid || !!loadError
            || (script.kind === 'flow' && script.state !== 'ready'),
          icon: BUTTON_ICONS.run,
          text: script ? `运行 ${displayName}` : '运行自动化',
          classes: ['run', 'icon-button'],
        });
        await safeControlUpdate(`up${index}`, {
          visible,
          disabled: busy || !script || index === 0 || !!loadError,
          icon: BUTTON_ICONS.moveUp,
          text: script ? `上移 ${displayName}` : '上移自动化',
          classes: ['order', 'icon-button'],
        });
        await safeControlUpdate(`down${index}`, {
          visible,
          disabled: busy || !script || index === scripts.length - 1 || !!loadError,
          icon: BUTTON_ICONS.moveDown,
          text: script ? `下移 ${displayName}` : '下移自动化',
          classes: ['order', 'icon-button'],
        });
        await safeControlUpdate(`delete${index}`, {
          visible,
          disabled: busy || !script || !!loadError,
          icon: BUTTON_ICONS.delete,
          text: script ? `删除 ${displayName}` : '删除自动化',
          classes: ['delete', 'icon-button'],
        });
      }

      await safeControlUpdate('runSelected', {
        disabled: busy || !!loadError || !configValid || scripts.length === 0 || selectedNames.size === 0
          || scripts.some(script => selectedNames.has(script.name)
            && script.kind === 'flow' && script.state !== 'ready'),
      });
      await safeControlUpdate('stopRun', {disabled: !busy});
      await safeControlUpdate('refresh', {disabled: busy});
      await safeControlUpdate('openDirectory', {disabled: busy});
      await safeControlUpdate('emptyRefresh', {disabled: busy});
      await safeControlUpdate('emptyOpenDirectory', {disabled: busy});
      await safeControlUpdate('errorRefresh', {disabled: busy});
      await safeControlUpdate('restoreOrder', {disabled: busy || configValid || !!loadError, visible: !configValid && !loadError, classes: ['icon-button']});
    }

    async function syncUI() {
      await safeToolbarUpdate();
      await syncListControls();
    }

    async function captureSelection(window) {
      if (!window) return;
      const available = new Set(scripts.map(script => script.name));
      for (const selected of Array.from(selectedNames)) {
        if (!available.has(selected)) selectedNames.delete(selected);
      }
      for (let index = 0; index < Math.min(scripts.length, listRowCapacity); index++) {
        try {
          const state = await window.control(`select${index}`).getState();
          if (state.checked) selectedNames.add(scripts[index].name);
          else selectedNames.delete(scripts[index].name);
        } catch (_) {}
      }
    }

    function nextRunLogDir(scriptName) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const parts = [execution.workdir].concat(RUN_LOG_ROOT, [`${stamp}-${safeSlug(scriptName)}`]);
      return file.join.apply(file, parts);
    }

    async function executeQueue(queue, source) {
      const controller = new Abort();
      const run = activeRun = {
        controller,
        source,
        queue: queue.slice(),
        total: queue.length,
        index: -1,
        current: null,
        canceled: false,
      };
      await closeSelector();
      await syncUI();
      let outcome = {status: 'succeeded', completed: 0, total: queue.length};

      try {
        for (let index = 0; index < queue.length; index++) {
          if (run.canceled || controller.signal.aborted) {
            outcome = {status: 'canceled', completed: index, total: queue.length};
            break;
          }
          const script = queue[index];
          if (script.kind === 'flow') {
            if (script.state !== 'ready') {
              const error = new Error(`Flow 当前不可运行：${scriptDisplayName(script)}（${script.state || 'blocked'}）`);
              error.code = script.state === 'needs-activation' ? 'needs_activation' : 'flow_blocked';
              throw error;
            }
          } else {
            const info = file.stat(script.path);
            if (!info || info.type !== 'file') {
              const error = new Error(`脚本已不存在：${scriptDisplayName(script)}`);
              error.code = 'FILE_NOT_FOUND';
              throw error;
            }
          }
          run.index = index;
          run.current = script;
          const logDir = nextRunLogDir(scriptDisplayName(script));
          file.ensureDir(logDir);
          await setListStatus(`正在运行 ${index + 1}/${queue.length}：${scriptDisplayName(script)}`);
          await syncUI();
          logRecord('SCRIPT_RUNNER_RUN_START', {
            source,
            index: index + 1,
            total: queue.length,
            script: scriptDisplayName(script),
            scriptKey: script.name,
            scriptPath: script.path,
            logDir,
          });

          try {
            const args = script.kind === 'flow'
              ? ['flow', 'run', script.installId, '-log-dir', logDir]
              : ['-script', script.path, '-console-mode', 'script', '-log-dir', logDir];
            const result = await command.run(executable, args, {
              cwd: execution.workdir,
              timeout: 0,
              maxOutputBytes: MAX_OUTPUT_BYTES,
              hideWindow: true,
              signal: controller.signal,
            });
            outcome.completed = index + 1;
            logRecord('SCRIPT_RUNNER_RUN_FINISH', {
              source,
              index: index + 1,
              total: queue.length,
              script: scriptDisplayName(script),
              scriptKey: script.name,
              status: 'succeeded',
              exitCode: result.exitCode,
              logDir,
            });
          } catch (error) {
            const normalized = normalizeError(error, 'Command.run');
            if (normalized.code === 'CANCELED' || controller.signal.aborted || run.canceled) {
              run.canceled = true;
              outcome = {status: 'canceled', completed: index, total: queue.length};
              logRecord('SCRIPT_RUNNER_RUN_CANCELED', {
                source,
                index: index + 1,
                total: queue.length,
                script: scriptDisplayName(script),
                scriptKey: script.name,
                logDir,
              });
              break;
            }
            outcome = {
              status: 'failed', completed: index, total: queue.length,
              failedScript: scriptDisplayName(script), error: normalized,
            };
            logError(error, 'Command.run', {
              source,
              index: index + 1,
              total: queue.length,
              script: scriptDisplayName(script),
              scriptKey: script.name,
              logDir,
            });
            break;
          }
        }

        lastOutcome = clone(outcome);
        if (outcome.status === 'succeeded') {
          await setListStatus(`运行完成：${outcome.completed}/${outcome.total} 个脚本成功。`);
        } else if (outcome.status === 'canceled') {
          await setListStatus(`已停止；剩余脚本不会继续执行。已完成 ${outcome.completed}/${outcome.total}。`);
        } else {
          await setListStatus(`运行失败：${outcome.failedScript}。队列已停止。${outcome.error ? ' ' + outcome.error.message : ''}`);
        }
        return clone(outcome);
      } finally {
        if (activeRun === run) activeRun = null;
      }
    }

    function requestRun(queue, source) {
      if (runPromise) return runPromise;
      if (pendingDeleteName) {
        setListStatus('正在确认删除自动化，请先完成或取消该操作。');
        return Promise.resolve({status: 'blocked', completed: 0, total: 0, reason: 'delete-pending'});
      }
      if (loadError) {
        setListStatus(`脚本目录不可用：${loadError.message}`);
        return Promise.resolve({status: 'blocked', completed: 0, total: 0, reason: 'script-root-error'});
      }
      if (!configValid) {
        const error = new Error('排序配置无效；请先在脚本列表中恢复默认排序或重新排序');
        error.code = 'INVALID_CONFIG';
        setListStatus(error.message);
        return Promise.reject(error);
      }
      const normalizedQueue = Array.isArray(queue) ? queue.filter(Boolean) : [];
      if (!normalizedQueue.length) {
        setListStatus('没有可运行的脚本。');
        lastOutcome = {status: 'empty', completed: 0, total: 0};
        return Promise.resolve(clone(lastOutcome));
      }
      const pending = executeQueue(normalizedQueue, source)
        .catch(error => {
          const normalized = logError(error, 'ScriptRunner.executeQueue', {source});
          const outcome = {status: 'failed', completed: 0, total: normalizedQueue.length, error: normalized};
          lastOutcome = clone(outcome);
          return setListStatus(`运行失败：${normalized.message}`).then(() => outcome);
        })
        .finally(async () => {
          try {
            await syncUI();
          } finally {
            if (runPromise === pending) runPromise = null;
          }
        });
      runPromise = pending;
      void syncUI();
      return runPromise;
    }

    async function stopRun() {
      if (!activeRun) return false;
      activeRun.canceled = true;
      activeRun.controller.abort('script runner stopped by user');
      await setListStatus('正在停止当前脚本；剩余队列已取消…');
      await safeToolbarUpdate();
      return true;
    }

    async function moveScript(index, delta) {
      if (runPromise || pendingDeleteName || loadError) return false;
      const target = index + delta;
      if (index < 0 || index >= scripts.length || target < 0 || target >= scripts.length) return false;
      if (listWindow) await captureSelection(listWindow);
      const next = scripts.slice();
      const item = next.splice(index, 1)[0];
      next.splice(target, 0, item);
      scripts = next;
      await saveCurrentOrder();
      statusMessage = `已调整顺序；第一项 = ${scripts[0] ? scriptDisplayName(scripts[0]) : '暂无脚本'}`;
      await syncUI();
      return true;
    }

    async function restoreDefaultOrder() {
      if (runPromise || pendingDeleteName) return false;
      const oldOrder = scripts.map(script => script.name);
      const oldCurrent = selectedScriptName;
      loading = true;
      await loadAllScripts();
      loading = false;
      const names = scripts.map(script => script.name);
      selectedScriptName = reconcileCurrentAfterRefresh(oldOrder, names, oldCurrent);
      await saveCurrentOrder();
      const current = selectedScript();
      statusMessage = scripts.length ? `已恢复默认排序；当前脚本 = ${current ? scriptDisplayName(current) : '暂无脚本'}` : '已恢复默认排序；当前没有脚本。';
      await ensureListCapacity();
      await syncUI();
      return true;
    }

    async function ensureListCapacity() {
      if (!listWindow || scripts.length <= listRowCapacity) return false;
      listRowCapacity = Math.max(scripts.length, listRowCapacity * 2);
      const previous = listWindow;
      listWindow = null;
      try { await previous.close(); } catch (_) {}
      await openList(statusMessage);
      return true;
    }

    async function rescan() {
      if (runPromise || pendingDeleteName) return false;
      if (listWindow) await captureSelection(listWindow);
      const oldOrder = scripts.map(script => script.name);
      const oldCurrent = selectedScriptName;
      loading = true;
      loadError = null;
      statusMessage = '正在重新扫描脚本目录…';
      await syncUI();
      if (flowCatalogEnabled) await loadAllScripts();
      else loadScripts();
      loading = false;
      if (!loadError) {
        selectedScriptName = reconcileCurrentAfterRefresh(oldOrder, scripts.map(script => script.name), oldCurrent);
      }
      statusMessage = loadError
        ? `重新扫描失败：${loadError.message}`
        : flowCatalogError
          ? `已扫描脚本，但 Flow Catalog 不可用：${flowCatalogError.message}`
        : !configValid
          ? `重新扫描完成，但 ${CONFIG_FILE} 仍无效。`
        : scripts.length
            ? `已重新扫描；当前脚本 = ${scriptDisplayName(selectedScript())}`
            : '已重新扫描；当前没有脚本。';
      const rebuilt = await ensureListCapacity();
      if (!rebuilt) await syncUI();
      return !loadError;
    }

    async function openScriptDirectory() {
      if (runPromise || pendingDeleteName) return null;
      ensureManagedRoot();
      if (platform === 'windows') {
        return command.run('explorer.exe', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: MAX_OUTPUT_BYTES, hideWindow: true});
      }
      if (platform === 'darwin') {
        return command.run('/usr/bin/open', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: MAX_OUTPUT_BYTES, hideWindow: true});
      }
      return command.run('xdg-open', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: MAX_OUTPUT_BYTES, hideWindow: true});
    }

    async function removeAutomation(index) {
      if (runPromise || activeRun || pendingDeleteName || loadError) return false;
      const script = scripts[index];
      if (!script) return false;
      if (!dialog || typeof dialog.confirm !== 'function') {
        throw new Error('删除自动化需要 Dialog.confirm()');
      }

      const scriptKey = script.name;
      const displayName = scriptDisplayName(script);
      const oldOrder = scripts.map(item => item.name);
      const oldCurrent = selectedScriptName;
      pendingDeleteName = scriptKey;
      await syncUI();
      try {
        const isFlow = script.kind === 'flow';
        const accepted = await dialog.confirm({
          title: isFlow ? '卸载自动化' : '删除自动化',
          message: isFlow
            ? `将从 Script Runner 卸载“${displayName}”。\n\n该 Flow 的独立业务数据将保留；此操作不会运行自动化。`
            : `将永久删除自动化“${displayName}”及其文件：\n${script.path}\n\n此操作不能撤销。`,
          level: 'warning',
          confirmText: isFlow ? '卸载' : '永久删除',
          cancelText: '取消',
          defaultAction: 'cancel',
        });
        if (!accepted) return false;
        if (runPromise || activeRun) return false;

        const latest = scripts.find(item => item.name === scriptKey);
        if (!latest || latest.kind !== script.kind || latest.path !== script.path) {
          throw new Error('自动化列表已变化，请刷新后重试');
        }

        if (isFlow) {
          const result = await command.run(executable, ['flow', 'uninstall', latest.installId], {
            cwd: execution.workdir,
            timeout: 30000,
            maxOutputBytes: MAX_OUTPUT_BYTES,
            hideWindow: true,
          });
          decodeCommandJSON(result, 'flow uninstall');
        } else {
          const info = file.stat(latest.path);
          if (!info || info.type !== 'file') throw new Error(`自动化文件已不存在：${latest.path}`);
          file.remove(latest.path);
          if (file.stat(latest.path) !== null) throw new Error(`删除后自动化文件仍然存在：${latest.path}`);
        }

        scripts = scripts.filter(item => item.name !== scriptKey);
        selectedNames.delete(scriptKey);
        selectedScriptName = reconcileCurrentAfterRefresh(oldOrder, scripts.map(item => item.name), oldCurrent);
        await saveCurrentOrder();
        statusMessage = isFlow
          ? `已卸载自动化：${displayName}（已保留独立业务数据）`
          : `已删除自动化：${displayName}`;
        logRecord(isFlow ? 'SCRIPT_RUNNER_FLOW_UNINSTALLED' : 'SCRIPT_RUNNER_SCRIPT_DELETED', {
          script: displayName,
          scriptKey,
          scriptPath: script.path,
        });
        return true;
      } finally {
        if (pendingDeleteName === scriptKey) pendingDeleteName = null;
        await syncUI();
      }
    }

    function bind(window, controlId, action) {
      window.control(controlId).on('click', async () => {
        try {
          return await action();
        } catch (error) {
          const normalized = logError(error, `ScriptRunner.${controlId}`);
          await setListStatus(`${controlId} 失败：${normalized.message}`);
          return null;
        }
      });
    }

    async function closeSelector() {
      const previous = selectorWindow;
      selectorVisible = false;
      selectorWindow = null;
      if (previous) {
        try { await previous.close(); } catch (_) {}
      }
      await safeToolbarUpdate();
    }

    async function selectScriptByName(name) {
      if (runPromise || activeRun) return false;
      const script = scripts.find(item => item.name === name);
      if (!script) return false;
      selectedScriptName = script.name;
      statusMessage = `当前脚本：${scriptDisplayName(script)}`;
      await closeSelector();
      await safeToolbarUpdate();
      return true;
    }

    async function bindSelectorWindow(window) {
      const names = scripts.map(script => script.name);
      for (let index = 0; index < names.length; index++) {
        bind(window, `compactScript${index}`, () => selectScriptByName(names[index]));
      }
      bind(window, 'compactManage', async () => {
        await closeSelector();
        return openList();
      });
      window.on('close', () => {
        if (selectorWindow === window) {
          selectorWindow = null;
          selectorVisible = false;
        }
        void safeToolbarUpdate();
      });
    }

    async function prepareSelector() {
      if (closed || runPromise || activeRun) return null;
      if (selectorWindow) return selectorWindow;
      if (selectorCreating) return selectorCreating;
      const task = (async () => {
        const window = await ui.createWindow({
          id: `scriptRunnerSelector${++selectorSequence}`,
          kind: 'normal',
          title: '选择脚本',
          position: {
            mode: 'anchor',
            size: {width: 310, height: 308},
            horizontal: 'right',
            vertical: 'bottom',
            margin: 72,
            display: 'active',
          },
          alwaysOnTop: true,
          draggable: false,
          theme: 'dark',
          content: {html: buildCompactSelectorHTML(scripts, selectedScriptName), css: COMPACT_SELECTOR_CSS},
        });
        if (closed || runPromise || activeRun) {
          try { await window.close(); } catch (_) {}
          return null;
        }
        selectorWindow = window;
        await bindSelectorWindow(window);
        return window;
      })();
      selectorCreating = task;
      try {
        return await task;
      } finally {
        if (selectorCreating === task) selectorCreating = null;
      }
    }

    async function openSelector() {
      const window = await prepareSelector();
      if (!window) return null;
      try {
        await window.show();
        selectorVisible = true;
        await safeToolbarUpdate();
        return window;
      } catch (error) {
        selectorVisible = false;
        throw error;
      }
    }

    async function toggleSelector() {
      if (runPromise || activeRun) return null;
      if (selectorVisible || selectorWindow) {
        await closeSelector();
        return null;
      }
      return openSelector();
    }

    async function bindListWindow(window) {
      bind(window, 'runSelected', async () => {
        await captureSelection(window);
        const queue = scripts.filter(script => selectedNames.has(script.name));
        if (!queue.length) {
          await setListStatus(scripts.length ? '请先勾选至少一个脚本。' : '没有可运行的脚本。');
          await syncListControls();
          return requestRun([], 'selected');
        }
        return requestRun(queue, 'selected');
      });
      bind(window, 'stopRun', stopRun);
      bind(window, 'openDirectory', openScriptDirectory);
      bind(window, 'emptyOpenDirectory', openScriptDirectory);
      bind(window, 'refresh', rescan);
      bind(window, 'emptyRefresh', rescan);
      bind(window, 'errorRefresh', rescan);
      bind(window, 'restoreOrder', restoreDefaultOrder);
      bind(window, 'closeList', closeList);

      for (let index = 0; index < listRowCapacity; index++) {
        bind(window, `run${index}`, () => {
          const script = scripts[index];
          return script ? requestRun([script], 'row') : requestRun([], 'row');
        });
        bind(window, `up${index}`, () => moveScript(index, -1));
        bind(window, `down${index}`, () => moveScript(index, 1));
        bind(window, `delete${index}`, () => removeAutomation(index));
        window.control(`select${index}`).on('change', async () => {
          try {
            const script = scripts[index];
            if (!script) return;
            const state = await window.control(`select${index}`).getState();
            if (state.checked) selectedNames.add(script.name);
            else selectedNames.delete(script.name);
            await syncListControls();
          } catch (_) {}
        });
      }

      window.on('close', () => {
        if (listWindow === window) listVisible = false;
        if (!hideListOnClose && listWindow === window) listWindow = null;
        void safeToolbarUpdate();
      });
    }

    async function prepareList(message) {
      if (closed) return null;
      if (message) statusMessage = String(message);
      if (listWindow) return listWindow;
      if (listCreating) return listCreating;

      listRowCapacity = Math.max(listRowCapacity, scripts.length, MIN_LIST_ROW_CAPACITY);
      const task = (async () => {
        const window = await ui.createWindow({
          id: `scriptRunnerList${++listSequence}`,
          kind: 'normal',
          title: 'OpenDesk Script Runner',
          position: {
            mode: 'anchor',
            size: {width: 840, height: 520},
            horizontal: 'center',
            vertical: 'center',
            margin: 0,
            display: 'active',
          },
          alwaysOnTop: false,
          draggable: true,
          theme: 'dark',
          content: {html: buildListHTML(scripts, listState()), css: LIST_CSS},
        });
        if (closed) {
          try { await window.close(); } catch (_) {}
          return null;
        }
        listWindow = window;
        await bindListWindow(window);
        await syncUI();
        return window;
      })();
      listCreating = task;
      try {
        return await task;
      } finally {
        if (listCreating === task) listCreating = null;
      }
    }

    async function openList(message) {
      await closeSelector();
      const window = await prepareList(message);
      if (!window) return null;
      try {
        await window.show();
        listVisible = true;
        await syncUI();
        return window;
      } catch (error) {
        listVisible = false;
        throw error;
      }
    }

    async function closeList() {
      const previous = listWindow;
      listVisible = false;
      if (previous) {
        try {
          if (hideListOnClose) await previous.hide();
          else await previous.close();
        } catch (_) {}
      }
      if (!hideListOnClose) {
        listWindow = null;
      }
      await safeToolbarUpdate();
    }

    toolbar.addButton('run', '运行', 'play.fill', () => {
      const script = selectedScript();
      return requestRun(script ? [script] : [], 'toolbar');
    });
    toolbar.addButton('stop', '停止', 'stop.fill', stopRun);
    toolbar.addLabel('script', '暂无脚本', {
      width: 168,
      alignment: 'center',
      verticalAlignment: 'center',
      tone: 'secondary',
    });
    toolbar.addButton('list', '脚本列表', 'list.bullet', toggleSelector);

    toolbar.on('close', () => {
      closed = true;
      if (activeRun) {
        activeRun.canceled = true;
        activeRun.controller.abort('script runner window closed');
      }
      void closeSelector();
      void closeList();
    });
    toolbar.onError(error => logError(error, 'FloatingWindow'));

    async function run() {
      loading = true;
      if (flowCatalogEnabled) await loadAllScripts();
      else loadScripts();
      loading = false;
      const shown = await toolbar.show();
      if (openListOnStart) await openList();
      statusMessage = loadError
        ? `无法读取脚本目录：${loadError.message}`
        : flowCatalogError
          ? `已加载脚本，但 Flow Catalog 不可用：${flowCatalogError.message}`
        : !configValid
          ? `排序配置无效：${configError || '请恢复默认排序'}`
        : scripts.length
            ? `已加载 ${scripts.length} 个脚本；当前脚本 = ${scriptDisplayName(selectedScript())}`
            : '暂无可运行脚本。将 JavaScript Recipe 添加到脚本目录后点击“刷新”。';
      const rebuilt = await ensureListCapacity();
      if (!rebuilt) await syncUI();
      logRecord('SCRIPT_RUNNER_READY', {
        windowId: toolbar.id,
        bounds: shown && shown.bounds ? shown.bounds : null,
        scriptRoot: root,
        configFile,
        scriptCount: scripts.length,
        defaultScript: scripts.length ? scripts[0].name : null,
        selectedScript: selectedScriptName,
        configValid,
        viewState: viewState(),
        loadError,
      });
      await toolbar.waitUntilClosed();
      closed = true;
      if (activeRun) {
        activeRun.canceled = true;
        activeRun.controller.abort('script runner closed');
      }
      await closeSelector();
      if (closeListOnRunnerExit && listWindow) {
        const previous = listWindow;
        listWindow = null;
        listVisible = false;
        try { await previous.close(); } catch (_) {}
      } else {
        await closeList();
      }
      if (runPromise) {
        try { await runPromise; } catch (_) {}
      }
    }

    return Object.freeze({
      run,
      prepareList,
      openList,
      openSelector,
      closeSelector,
      toggleSelector,
      selectScript: selectScriptByName,
      rescan,
      stopRun,
      restoreDefaultOrder,
      removeAutomation,
      requestRun,
      scripts: () => clone(scripts),
      state: () => ({
        scriptRoot: root,
        configFile,
        managedScriptRoot,
        configValid,
        configError,
        loading,
        loadError: clone(loadError),
        flowCatalogError: clone(flowCatalogError),
        viewState: viewState(),
        scriptCount: scripts.length,
        selectedScriptName,
        selectedNames: Array.from(selectedNames),
        pendingDeleteName,
        selectorPrepared: !!selectorWindow,
        selectorVisible,
        listPrepared: !!listWindow,
        listVisible,
        running: !!runPromise,
        lastOutcome: clone(lastOutcome),
        activeRun: activeRun ? {
          source: activeRun.source,
          total: activeRun.total,
          index: activeRun.index,
          current: activeRun.current ? activeRun.current.name : null,
          currentDisplayName: activeRun.current ? scriptDisplayName(activeRun.current) : null,
          canceled: activeRun.canceled,
        } : null,
      }),
    });
  }

  global.OpenDeskScriptRunnerSimple = Object.freeze({
    createApp,
    validateOrderConfig,
    reconcileOrder,
    resolveSelectedScriptName,
    reconcileCurrentAfterRefresh,
    isDirectJavaScriptName,
    deriveViewState,
    buildCompactSelectorHTML,
    buildListHTML,
  });
})(globalThis);
