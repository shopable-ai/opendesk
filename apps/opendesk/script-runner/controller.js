(function installOpenDeskScriptRunnerSimple(global) {
  'use strict';

  const CONFIG_FILE = '.opendesk-runner.json';
  const CONFIG_SCHEMA_VERSION = 1;
  const RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'script-runner-simple', 'runs'];
  const MAX_OUTPUT_BYTES = 1024 * 1024;
  const MIN_LIST_ROW_CAPACITY = 32;

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
      && value.toLowerCase().endsWith('.js')
      && !value.includes('/')
      && !value.includes('\\');
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
      if (typeof entry !== 'string' || !isDirectJavaScriptName(entry) || seen.has(entry)) {
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

  function deriveViewState(state, scriptCount) {
    if (state.loading) return 'loading';
    if (state.loadError || !state.configValid) return 'error';
    if (state.running) return 'running';
    if (scriptCount === 0) return 'empty';
    return 'ready';
  }

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
      const name = script ? script.name : '';
      rowParts.push(
        `<input id="select${index}" class="select${hiddenClass}" type="checkbox" aria-label="选择第 ${index + 1} 个脚本"${selected}>`,
        `<p id="index${index}" class="index${hiddenClass}">${script ? index + 1 : ''}</p>`,
        `<p id="name${index}" class="name${hiddenClass}" title="${escapeHTML(name)}">${escapeHTML(name)}</p>`,
        `<button id="run${index}" class="run${hiddenClass}"${script ? '' : ' disabled'}>运行</button>`,
        `<button id="up${index}" class="order${hiddenClass}" aria-label="上移第 ${index + 1} 个脚本"${upDisabled}>↑</button>`,
        `<button id="down${index}" class="order${hiddenClass}" aria-label="下移第 ${index + 1} 个脚本"${downDisabled}>↓</button>`,
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
          : '#1 是主工具条默认脚本。';

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
        <button id="emptyOpenDirectory" class="state-action${emptyVisible ? '' : ' is-hidden'}">打开脚本目录</button>
        <button id="emptyRefresh" class="state-action${emptyVisible ? '' : ' is-hidden'}">刷新</button>

        <p id="errorTitle" class="state-title error-title${errorVisible ? '' : ' is-hidden'}">脚本列表加载失败</p>
        <p id="errorMessage" class="state-help error-message${errorVisible ? '' : ' is-hidden'}">${escapeHTML(state.loadError ? (state.loadError.message || state.loadError) : state.configError || '未知错误')}</p>
        <button id="errorRefresh" class="state-action${errorVisible ? '' : ' is-hidden'}">重新扫描</button>

        <div class="list-grid">
          <p id="colSelect" class="column-head${listVisible ? '' : ' is-hidden'}"></p>
          <p id="colIndex" class="column-head${listVisible ? '' : ' is-hidden'}">#</p>
          <p id="colName" class="column-head${listVisible ? '' : ' is-hidden'}">脚本</p>
          <p id="colRun" class="column-head${listVisible ? '' : ' is-hidden'}">操作</p>
          <p id="colUp" class="column-head${listVisible ? '' : ' is-hidden'}">排序</p>
          <p id="colDown" class="column-head${listVisible ? '' : ' is-hidden'}"></p>
          ${rowParts.join('\n')}
        </div>

        <footer>
          <button id="runSelected">运行选中</button>
          <button id="stopRun"${state.running ? '' : ' disabled'}>停止</button>
          <button id="openDirectory">打开脚本目录</button>
          <button id="refresh">刷新</button>
          <button id="restoreOrder"${state.configValid ? ' class="is-hidden"' : ''}>恢复默认排序</button>
          <button id="closeList">关闭</button>
        </footer>
      </main>
    </body></html>`;
  }

  const LIST_CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box} main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px} .title{display:block;font-size:20px;margin:0 0 5px}.subtle{margin:0;color:#a8a8a8;font-size:12px;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{margin:0;color:#b9b9b9;white-space:nowrap}
    .status{margin:0;padding:9px 10px;border:1px solid #3a3a3a;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px;min-height:36px}
    .state-title{margin:54px 0 0;text-align:center;font-size:18px;font-weight:700}.state-help{margin:0 auto;text-align:center;color:#aaa;max-width:520px;line-height:1.5}.state-action{align-self:center;min-width:140px}.error-title{color:#ffb7b7}.error-message{color:#d9a2a2}
    .list-grid{flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:34px 36px minmax(0,1fr) 72px 34px 34px;gap:0 8px;align-content:start;align-items:center}.column-head{margin:0;padding:0 0 6px;color:#8e8e8e;font-size:11px;border-bottom:1px solid #373737}.select{width:16px;height:16px;margin:16px 0 16px 8px}.index,.name{margin:0;min-height:48px;display:flex;align-items:center;border-bottom:1px solid #303030}.index{color:#aaa}.name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.run,.order{margin:7px 0}.order{width:34px;padding:6px 0}
    button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 10px;font:inherit}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3b3b3b;border-color:#666}button:disabled{opacity:.38}.is-hidden{display:none!important}
    footer{display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid #343434}footer button{min-height:34px}
  `;

  function createApp(options) {
    const settings = options || {};
    const file = settings.file || global.File;
    const command = settings.command || global.Command;
    const execution = settings.execution || global.Execution;
    const system = settings.system || global.System;
    const ui = settings.ui || global.ui;
    const Floating = settings.FloatingWindow || global.FloatingWindow;
    const Abort = settings.AbortController || global.AbortController;
    const logger = settings.logger || global.console;
    const scriptRoot = settings.scriptRoot;
    const managedScriptRoot = settings.managedScriptRoot !== false;
    const openListOnStart = settings.openListOnStart !== false;
    const hideListOnClose = settings.hideListOnClose === true;

    if (!file || typeof file.join !== 'function' || typeof file.path !== 'function'
      || typeof file.stat !== 'function' || typeof file.listDir !== 'function'
      || typeof file.read !== 'function' || typeof file.write !== 'function'
      || typeof file.ensureDir !== 'function') {
      throw new Error('script runner requires File path/join/stat/listDir/read/write/ensureDir');
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
    let scripts = [];
    let configValid = true;
    let configError = '';
    let loadError = null;
    let loading = false;
    let lastOutcome = null;
    let listWindow = null;
    let listSequence = 0;
    let listRowCapacity = MIN_LIST_ROW_CAPACITY;
    let statusMessage = '';
    let runPromise = null;
    let activeRun = null;
    let closed = false;
    let configWrite = Promise.resolve();
    let uiUpdates = Promise.resolve();

    const toolbar = new Floating({
      position: {mode: 'anchor', horizontal: 'right', vertical: 'center', margin: 16, display: 'active'},
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
        if (!isDirectJavaScriptName(name)) continue;
        const path = file.join(root, name);
        const entry = file.stat(path);
        if (entry && entry.type === 'file') names.push(name);
      }
      names.sort((left, right) => left.localeCompare(right));
      return names;
    }

    function readOrder() {
      const info = file.stat(configFile);
      if (info === null) return {exists: false, order: []};
      if (info.type !== 'file') throw new Error(`${CONFIG_FILE} 不是普通文件`);
      return {exists: true, order: validateOrderConfig(JSON.parse(String(file.read(configFile))))};
    }

    function setScriptsFromNames(names) {
      scripts = names.map(name => ({name, path: file.join(root, name)}));
      const available = new Set(names);
      for (const selected of Array.from(selectedNames)) {
        if (!available.has(selected)) selectedNames.delete(selected);
      }
    }

    function loadScripts() {
      loadError = null;
      let discovered;
      try {
        discovered = discoverNames();
      } catch (error) {
        setScriptsFromNames([]);
        configValid = true;
        configError = '';
        loadError = logError(error, 'ScriptRunner.scan', {scriptRoot: root});
        return scripts;
      }

      try {
        const config = readOrder();
        const ordered = config.exists ? reconcileOrder(discovered, config.order) : discovered;
        setScriptsFromNames(ordered);
        configValid = true;
        configError = '';
      } catch (error) {
        setScriptsFromNames(discovered);
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
      return scripts.length ? `#1 ${scripts[0].name}` : '暂无脚本';
    }

    function currentLabel() {
      if (!activeRun || !activeRun.current) return idleLabel();
      if (activeRun.total > 1) return `${activeRun.index + 1}/${activeRun.total} · ${activeRun.current.name}`;
      return activeRun.current.name;
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
        configValid,
        configError,
        loadError,
        loading,
        running: !!runPromise,
        viewState: viewState(),
        scriptRoot: root,
        statusMessage,
        rowCapacity: listRowCapacity,
      };
    }

    function defaultStatusMessage() {
      if (loading) return '正在读取脚本目录…';
      if (loadError) return `无法读取脚本目录：${loadError.message}`;
      if (!configValid) return `排序配置无效：${configError || '请恢复默认排序'}`;
      if (!scripts.length) return '当前没有可运行脚本。';
      if (runPromise && activeRun && activeRun.current) return `正在运行：${activeRun.current.name}`;
      return `当前 #1 = ${scripts[0].name}`;
    }

    async function safeControlUpdate(id, patch) {
      if (!listWindow) return null;
      try { return await listWindow.control(id).update(patch); } catch (_) { return null; }
    }

    function queueUIUpdate(update) {
      // Serialize host writes so a delayed update from an older run cannot
      // overwrite the next run's presentation.
      uiUpdates = uiUpdates.catch(() => {}).then(update);
      return uiUpdates;
    }

    function safeToolbarUpdate() {
      return queueUIUpdate(updateToolbar);
    }

    async function updateToolbar() {
      const busy = !!activeRun;
      const runnable = !loadError && configValid && scripts.length > 0;
      try {
        await toolbar.updateButton('run', {disabled: busy || !runnable, active: busy});
      } catch (_) {}
      try {
        await toolbar.updateButton('stop', {disabled: !busy, active: false});
      } catch (_) {}
      try {
        await toolbar.updateButton('list', {disabled: false, active: !!listWindow});
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
      const busy = !!activeRun;
      const currentView = viewState();
      const listVisible = currentView === 'ready' || currentView === 'running' || (!loadError && scripts.length > 0 && currentView === 'error');
      const emptyVisible = currentView === 'empty';
      const errorVisible = currentView === 'error';
      const loadingVisible = currentView === 'loading';
      const rootText = loadError
        ? `脚本目录不可用：${loadError.message}`
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
      await safeControlUpdate('emptyOpenDirectory', {visible: emptyVisible, classes: ['state-action']});
      await safeControlUpdate('emptyRefresh', {visible: emptyVisible, classes: ['state-action']});
      await safeControlUpdate('errorTitle', {visible: errorVisible, classes: ['state-title', 'error-title']});
      await safeControlUpdate('errorMessage', {visible: errorVisible, classes: ['state-help', 'error-message']});
      await safeControlUpdate('errorRefresh', {visible: errorVisible, classes: ['state-action']});
      if (errorVisible) {
        const message = loadError ? loadError.message : configError || '未知错误';
        await safeControlUpdate('errorMessage', {text: message});
      }
      for (const id of ['colSelect', 'colIndex', 'colName', 'colRun', 'colUp', 'colDown']) {
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
        await safeControlUpdate(`name${index}`, {visible, text: script ? script.name : '', classes: ['name']});
        await safeControlUpdate(`run${index}`, {visible, disabled: busy || !script || !configValid || !!loadError, classes: ['run']});
        await safeControlUpdate(`up${index}`, {visible, disabled: busy || !script || index === 0 || !!loadError, classes: ['order']});
        await safeControlUpdate(`down${index}`, {visible, disabled: busy || !script || index === scripts.length - 1 || !!loadError, classes: ['order']});
      }

      await safeControlUpdate('runSelected', {
        disabled: busy || !!loadError || !configValid || scripts.length === 0 || selectedNames.size === 0,
      });
      await safeControlUpdate('stopRun', {disabled: !busy});
      await safeControlUpdate('refresh', {disabled: busy});
      await safeControlUpdate('openDirectory', {disabled: busy});
      await safeControlUpdate('emptyRefresh', {disabled: busy});
      await safeControlUpdate('emptyOpenDirectory', {disabled: busy});
      await safeControlUpdate('errorRefresh', {disabled: busy});
      await safeControlUpdate('restoreOrder', {disabled: busy || configValid || !!loadError, visible: !configValid && !loadError, classes: []});
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
      await syncUI();
      let outcome = {status: 'succeeded', completed: 0, total: queue.length};

      try {
        for (let index = 0; index < queue.length; index++) {
          if (run.canceled || controller.signal.aborted) {
            outcome = {status: 'canceled', completed: index, total: queue.length};
            break;
          }
          const script = queue[index];
          const info = file.stat(script.path);
          if (!info || info.type !== 'file') {
            const error = new Error(`脚本已不存在：${script.name}`);
            error.code = 'FILE_NOT_FOUND';
            throw error;
          }
          run.index = index;
          run.current = script;
          const logDir = nextRunLogDir(script.name);
          file.ensureDir(logDir);
          await setListStatus(`正在运行 ${index + 1}/${queue.length}：${script.name}`);
          await syncUI();
          logRecord('SCRIPT_RUNNER_RUN_START', {
            source,
            index: index + 1,
            total: queue.length,
            script: script.name,
            scriptPath: script.path,
            logDir,
          });

          try {
            const result = await command.run(executable, [
              '-script', script.path,
              '-console-mode', 'script',
              '-log-dir', logDir,
            ], {
              cwd: execution.workdir,
              timeout: 0,
              maxOutputBytes: MAX_OUTPUT_BYTES,
              signal: controller.signal,
            });
            outcome.completed = index + 1;
            logRecord('SCRIPT_RUNNER_RUN_FINISH', {
              source,
              index: index + 1,
              total: queue.length,
              script: script.name,
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
                script: script.name,
                logDir,
              });
              break;
            }
            outcome = {
              status: 'failed', completed: index, total: queue.length,
              failedScript: script.name, error: normalized,
            };
            logError(error, 'Command.run', {
              source,
              index: index + 1,
              total: queue.length,
              script: script.name,
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
      // executeQueue establishes activeRun synchronously before Run returns.
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
      if (runPromise || loadError) return false;
      const target = index + delta;
      if (index < 0 || index >= scripts.length || target < 0 || target >= scripts.length) return false;
      if (listWindow) await captureSelection(listWindow);
      const next = scripts.slice();
      const item = next.splice(index, 1)[0];
      next.splice(target, 0, item);
      scripts = next;
      await saveCurrentOrder();
      statusMessage = `已调整顺序；#1 = ${scripts[0].name}`;
      await syncUI();
      return true;
    }

    async function restoreDefaultOrder() {
      if (runPromise) return false;
      let names;
      try {
        names = discoverNames();
      } catch (error) {
        loadError = logError(error, 'ScriptRunner.restoreDefaultOrder', {scriptRoot: root});
        statusMessage = `无法恢复默认排序：${loadError.message}`;
        await syncUI();
        return false;
      }
      setScriptsFromNames(names);
      await saveCurrentOrder();
      statusMessage = scripts.length ? `已恢复默认文件名排序；#1 = ${scripts[0].name}` : '已恢复默认排序；当前没有脚本。';
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
      if (runPromise) return false;
      if (listWindow) await captureSelection(listWindow);
      loading = true;
      loadError = null;
      statusMessage = '正在重新扫描脚本目录…';
      await syncUI();
      loadScripts();
      loading = false;
      statusMessage = loadError
        ? `重新扫描失败：${loadError.message}`
        : !configValid
          ? `重新扫描完成，但 ${CONFIG_FILE} 仍无效。`
          : scripts.length
            ? `已重新扫描；当前 #1 = ${scripts[0].name}`
            : '已重新扫描；当前没有脚本。';
      const rebuilt = await ensureListCapacity();
      if (!rebuilt) await syncUI();
      return !loadError;
    }

    async function openScriptDirectory() {
      if (runPromise) return null;
      ensureManagedRoot();
      if (platform === 'windows') {
        return command.run('explorer.exe', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: MAX_OUTPUT_BYTES});
      }
      if (platform === 'darwin') {
        return command.run('/usr/bin/open', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: MAX_OUTPUT_BYTES});
      }
      return command.run('xdg-open', [root], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: MAX_OUTPUT_BYTES});
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
        if (!hideListOnClose && listWindow === window) listWindow = null;
        void safeToolbarUpdate();
      });
    }

    async function openList(message) {
      if (closed) return null;
      if (listWindow) {
        try {
          await listWindow.show();
          if (message) statusMessage = String(message);
          await syncUI();
          return listWindow;
        } catch (_) {
          listWindow = null;
        }
      }
      if (message) statusMessage = String(message);
      listRowCapacity = Math.max(listRowCapacity, scripts.length, MIN_LIST_ROW_CAPACITY);
      const window = await ui.createWindow({
        id: `scriptRunnerList${++listSequence}`,
        kind: 'floating',
        title: 'OpenDesk Script Runner',
        position: {
          mode: 'anchor',
          size: {width: 840, height: 520},
          horizontal: 'center',
          vertical: 'center',
          margin: 0,
          display: 'active',
        },
        alwaysOnTop: true,
        draggable: true,
        theme: 'dark',
        content: {html: buildListHTML(scripts, listState()), css: LIST_CSS},
      });
      listWindow = window;
      await bindListWindow(window);
      await syncUI();
      await window.show();
      return window;
    }

    async function closeList() {
      const previous = listWindow;
      if (previous) {
        try {
          if (hideListOnClose) await previous.hide();
          else await previous.close();
        } catch (_) {}
      }
      if (!hideListOnClose) {
        listWindow = null;
      }
    }

    toolbar.addButton('run', '运行', 'play.fill', () => requestRun(scripts.length ? [scripts[0]] : [], 'toolbar'));
    toolbar.addButton('stop', '停止', 'stop.fill', stopRun);
    toolbar.addLabel('script', '暂无脚本', {
      width: 168,
      alignment: 'center',
      verticalAlignment: 'center',
      tone: 'secondary',
    });
    toolbar.addButton('list', '脚本列表', 'list.bullet', () => openList());

    toolbar.on('close', () => {
      closed = true;
      if (activeRun) {
        activeRun.canceled = true;
        activeRun.controller.abort('script runner window closed');
      }
      void closeList();
    });
    toolbar.onError(error => logError(error, 'FloatingWindow'));

    async function run() {
      loading = true;
      loadScripts();
      loading = false;
      const shown = await toolbar.show();
      if (openListOnStart) await openList();
      statusMessage = loadError
        ? `无法读取脚本目录：${loadError.message}`
        : !configValid
          ? `排序配置无效：${configError || '请恢复默认排序'}`
          : scripts.length
            ? `已加载 ${scripts.length} 个脚本；当前 #1 = ${scripts[0].name}`
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
      await closeList();
      if (runPromise) {
        try { await runPromise; } catch (_) {}
      }
    }

    return Object.freeze({
      run,
      openList,
      rescan,
      stopRun,
      restoreDefaultOrder,
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
        viewState: viewState(),
        scriptCount: scripts.length,
        selectedNames: Array.from(selectedNames),
        running: !!runPromise,
        lastOutcome: clone(lastOutcome),
        activeRun: activeRun ? {
          source: activeRun.source,
          total: activeRun.total,
          index: activeRun.index,
          current: activeRun.current ? activeRun.current.name : null,
          canceled: activeRun.canceled,
        } : null,
      }),
    });
  }

  global.OpenDeskScriptRunnerSimple = Object.freeze({
    createApp,
    validateOrderConfig,
    reconcileOrder,
    isDirectJavaScriptName,
    deriveViewState,
    buildListHTML,
  });
})(globalThis);
