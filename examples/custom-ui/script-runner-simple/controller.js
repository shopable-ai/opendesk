(function installOpenDeskScriptRunnerSimple(global) {
  'use strict';

  const CONFIG_FILE = '.opendesk-runner.json';
  const CONFIG_SCHEMA_VERSION = 1;
  const RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'script-runner-simple', 'runs'];
  const MAX_OUTPUT_BYTES = 1024 * 1024;

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

  function buildListHTML(scripts, state) {
    const rows = scripts.map((script, index) => {
      const selected = state.selectedNames.has(script.name) ? ' checked' : '';
      const upDisabled = index === 0 ? ' disabled' : '';
      const downDisabled = index === scripts.length - 1 ? ' disabled' : '';
      return `
        <section class="row" id="row${index}">
          <input id="select${index}" class="select" type="checkbox" aria-label="选择 ${escapeHTML(script.name)}"${selected}>
          <div class="index">${index + 1}</div>
          <div class="name" title="${escapeHTML(script.name)}">${escapeHTML(script.name)}</div>
          <button id="run${index}" class="run">运行</button>
          <div class="order-actions">
            <button id="up${index}" class="order" aria-label="上移 ${escapeHTML(script.name)}"${upDisabled}>↑</button>
            <button id="down${index}" class="order" aria-label="下移 ${escapeHTML(script.name)}"${downDisabled}>↓</button>
          </div>
        </section>`;
    }).join('');

    const configText = state.configValid
      ? `脚本目录：${state.scriptRoot}`
      : `排序配置无效：${state.configError || '请恢复默认排序后再运行'}`;

    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main>
        <header>
          <div>
            <h1>脚本列表</h1>
            <p id="rootStatus" class="subtle">${escapeHTML(configText)}</p>
          </div>
          <div id="scriptCount" class="count">${scripts.length} 个脚本</div>
        </header>
        <p id="runnerStatus" class="status">${escapeHTML(state.statusMessage || (scripts.length ? '#1 是主工具条默认脚本。' : '当前目录没有可运行的 .js。'))}</p>
        <div class="columns"><span></span><span>#</span><span>脚本</span><span>操作</span><span>排序</span></div>
        <div class="list">${rows || '<p class="empty">暂无脚本。把生产 .js 放入脚本目录后点击“重新扫描”。</p>'}</div>
        <footer>
          <button id="runSelected">运行选中</button>
          <button id="openDirectory">打开脚本目录</button>
          <button id="refresh">重新扫描</button>
          <button id="restoreOrder"${state.configValid ? ' disabled' : ''}>恢复默认排序</button>
          <button id="closeList">关闭</button>
        </footer>
      </main>
    </body></html>`;
  }

  const LIST_CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box} main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px} h1{font-size:20px;margin:0 0 5px}.subtle{margin:0;color:#a8a8a8;font-size:12px;max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{color:#b9b9b9;white-space:nowrap}
    .status{margin:0;padding:9px 10px;border:1px solid #3a3a3a;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px;min-height:36px}
    .columns,.row{display:grid;grid-template-columns:34px 36px minmax(0,1fr) 72px 82px;gap:8px;align-items:center}.columns{padding:0 8px 6px;color:#8e8e8e;font-size:11px;border-bottom:1px solid #373737}
    .list{flex:1;overflow-y:auto;min-height:0}.row{min-height:48px;padding:0 8px;border-bottom:1px solid #303030}.row:hover{background:#202020}.select{width:16px;height:16px}.index{color:#aaa}.name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 10px;font:inherit}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3b3b3b;border-color:#666}button:disabled{opacity:.38}.order-actions{display:flex;gap:5px}.order{width:34px;padding:6px 0}.empty{padding:24px 8px;color:#999}
    footer{display:flex;gap:8px;flex-wrap:wrap;padding-top:2px;border-top:1px solid #343434}footer button{min-height:34px}
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
    let listWindow = null;
    let listSequence = 0;
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

    function discoverNames() {
      const info = file.stat(root);
      if (info === null) return [];
      if (info.type !== 'directory') throw new Error(`脚本根路径不是目录：${root}`);
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
      const discovered = discoverNames();
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
        file.ensureDir(root);
        file.write(configFile, payload);
      });
      return configWrite;
    }

    async function saveCurrentOrder() {
      const order = scripts.map(script => script.name);
      await queueConfigWrite(order);
      configValid = true;
      configError = '';
      logRecord('SCRIPT_RUNNER_ORDER_CHANGED', {order});
    }

    function idleLabel() {
      return scripts.length ? `#1 ${scripts[0].name}` : '暂无脚本';
    }

    function currentLabel() {
      if (!activeRun || !activeRun.current) return idleLabel();
      if (activeRun.total > 1) return `${activeRun.index + 1}/${activeRun.total} · ${activeRun.current.name}`;
      return activeRun.current.name;
    }

    function listState() {
      return {
        selectedNames,
        configValid,
        configError,
        scriptRoot: root,
        statusMessage,
      };
    }

    function queueUIUpdate(update) {
      // Serialize host writes and read state when each update starts. An older
      // run's delayed presentation must never overwrite the next run's UI.
      uiUpdates = uiUpdates.catch(() => {}).then(update);
      return uiUpdates;
    }

    function safeToolbarUpdate() {
      return queueUIUpdate(updateToolbar);
    }

    async function updateToolbar() {
      const busy = !!activeRun;
      try {
        await toolbar.updateButton('run', {disabled: busy || !configValid || scripts.length === 0, active: busy});
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
          tone: configValid ? (busy ? 'warning' : 'secondary') : 'error',
        });
      } catch (_) {}
    }

    function setListStatus(message) {
      statusMessage = String(message || '');
      return queueUIUpdate(async () => {
        if (!listWindow) return;
        try { await listWindow.control('runnerStatus').update({text: statusMessage}); } catch (_) {}
      });
    }

    function syncListControls() {
      return queueUIUpdate(updateListControls);
    }

    async function updateListControls() {
      if (!listWindow) return;
      const busy = !!activeRun;
      for (let index = 0; index < scripts.length; index++) {
        const row = scripts[index];
        try { await listWindow.control(`select${index}`).update({disabled: busy}); } catch (_) {}
        try { await listWindow.control(`run${index}`).update({disabled: busy || !configValid}); } catch (_) {}
        try { await listWindow.control(`up${index}`).update({disabled: busy || index === 0}); } catch (_) {}
        try { await listWindow.control(`down${index}`).update({disabled: busy || index === scripts.length - 1}); } catch (_) {}
        if (busy && selectedNames.has(row.name)) {
          try { await listWindow.control(`select${index}`).update({checked: true}); } catch (_) {}
        }
      }
      for (const id of ['runSelected', 'refresh', 'restoreOrder', 'openDirectory']) {
        try {
          let disabled = busy;
          if (id === 'runSelected') disabled = busy || !configValid || scripts.length === 0;
          if (id === 'restoreOrder') disabled = busy || configValid;
          await listWindow.control(id).update({disabled});
        } catch (_) {}
      }
    }

    async function syncUI() {
      await safeToolbarUpdate();
      await syncListControls();
    }

    async function captureSelection(window) {
      if (!window) return;
      for (let index = 0; index < scripts.length; index++) {
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
      let outcome = {status: 'succeeded', completed: 0, total: queue.length};

      try {
        await syncUI();
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
      if (!configValid) {
        const error = new Error('排序配置无效；请先在脚本列表中恢复默认排序或重新排序');
        error.code = 'INVALID_CONFIG';
        setListStatus(error.message);
        return Promise.reject(error);
      }
      if (!queue.length) {
        setListStatus('没有可运行的脚本。');
        return Promise.resolve({status: 'empty', completed: 0, total: 0});
      }
      // executeQueue establishes activeRun synchronously, before Run returns.
      const pending = executeQueue(queue, source)
        .catch(error => {
          const normalized = logError(error, 'ScriptRunner.executeQueue', {source});
          return setListStatus(`运行失败：${normalized.message}`).then(() => ({status: 'failed', completed: 0, total: queue.length, error: normalized}));
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
      if (runPromise) return false;
      const target = index + delta;
      if (index < 0 || index >= scripts.length || target < 0 || target >= scripts.length) return false;
      if (listWindow) await captureSelection(listWindow);
      const next = scripts.slice();
      const item = next.splice(index, 1)[0];
      next.splice(target, 0, item);
      scripts = next;
      await saveCurrentOrder();
      await rebuildList(`已调整顺序；#1 = ${scripts[0].name}`);
      await safeToolbarUpdate();
      return true;
    }

    async function restoreDefaultOrder() {
      if (runPromise) return false;
      setScriptsFromNames(discoverNames());
      await saveCurrentOrder();
      await rebuildList(scripts.length ? `已恢复默认文件名排序；#1 = ${scripts[0].name}` : '已恢复默认排序；当前没有脚本。');
      await safeToolbarUpdate();
      return true;
    }

    async function rescan() {
      if (runPromise) return false;
      if (listWindow) await captureSelection(listWindow);
      loadScripts();
      await rebuildList(configValid
        ? (scripts.length ? `已重新扫描；当前 #1 = ${scripts[0].name}` : '已重新扫描；当前没有脚本。')
        : `重新扫描完成，但 ${CONFIG_FILE} 仍无效。`);
      await safeToolbarUpdate();
      return true;
    }

    async function openScriptDirectory() {
      if (runPromise) return null;
      file.ensureDir(root);
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
          await setListStatus('请先勾选至少一个脚本。');
          return null;
        }
        return requestRun(queue, 'selected');
      });
      bind(window, 'openDirectory', openScriptDirectory);
      bind(window, 'refresh', rescan);
      bind(window, 'restoreOrder', restoreDefaultOrder);
      bind(window, 'closeList', () => window.close());

      scripts.forEach((script, index) => {
        bind(window, `run${index}`, () => requestRun([script], 'row'));
        bind(window, `up${index}`, () => moveScript(index, -1));
        bind(window, `down${index}`, () => moveScript(index, 1));
        window.control(`select${index}`).on('change', async () => {
          try {
            const state = await window.control(`select${index}`).getState();
            if (state.checked) selectedNames.add(script.name);
            else selectedNames.delete(script.name);
          } catch (_) {}
        });
      });

      window.on('close', () => {
        if (listWindow === window) listWindow = null;
        void safeToolbarUpdate();
      });
    }

    async function openList(message) {
      if (closed) return null;
      if (listWindow) {
        try {
          await listWindow.show();
          if (message) await setListStatus(message);
          await safeToolbarUpdate();
          return listWindow;
        } catch (_) {
          listWindow = null;
        }
      }
      if (message) statusMessage = String(message);
      const window = await ui.createWindow({
        id: `scriptRunnerList${++listSequence}`,
        kind: 'floating',
        title: 'OpenDesk 脚本列表',
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
      await window.show();
      await syncUI();
      return window;
    }

    async function rebuildList(message) {
      const previous = listWindow;
      listWindow = null;
      if (previous) {
        try { await previous.close(); } catch (_) {}
      }
      return openList(message);
    }

    async function closeList() {
      const previous = listWindow;
      listWindow = null;
      if (previous) {
        try { await previous.close(); } catch (_) {}
      }
    }

    toolbar.addButton('run', '运行', 'play.fill', () => {
      if (!scripts.length) return null;
      return requestRun([scripts[0]], 'toolbar');
    });
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
      loadScripts();
      const shown = await toolbar.show();
      await syncUI();
      logRecord('SCRIPT_RUNNER_READY', {
        windowId: toolbar.id,
        bounds: shown && shown.bounds ? shown.bounds : null,
        scriptRoot: root,
        configFile,
        scriptCount: scripts.length,
        defaultScript: scripts.length ? scripts[0].name : null,
        configValid,
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
      scripts: () => clone(scripts),
      state: () => ({
        scriptRoot: root,
        configFile,
        configValid,
        configError,
        running: !!runPromise,
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
    buildListHTML,
  });
})(globalThis);
