// History surface for recording-console-simple.
// This module owns only history discovery, local display metadata, and explicit
// execution of an already-generated Recorder script. It does not rebuild or
// reinterpret Recorder facts.
(function installOpenDeskRecordingHistory(global) {
  'use strict';

  const RECORDING_ID = /^rec-[A-Za-z0-9][A-Za-z0-9._-]*$/;
  const RECIPE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.recipe\.js$/;
  const PAGE_SIZE = 10;
  const ACTION_ICONS = Object.freeze({
    run: 'play.fill',
    rename: 'pencil',
    open: 'folder.fill',
    delete: 'trash.fill',
  });
  const ACTIVE_CORE_PHASES = new Set([
    'countdown', 'starting', 'stop-requested', 'recording', 'pausing', 'paused',
    'resuming', 'stopping', 'building-actions', 'generating', 'run-countdown', 'running', 'closing', 'closed',
  ]);

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
      code: error && error.code ? String(error.code) : 'RECORDING_HISTORY_FAILED',
      operation: error && error.operation ? String(error.operation) : operation || '',
      message: error && error.message ? String(error.message) : String(error || 'Unknown failure'),
      exitCode: error && Number.isInteger(error.exitCode) ? error.exitCode : null,
      stdout: error && typeof error.stdout === 'string' ? error.stdout : '',
      stderr: error && typeof error.stderr === 'string' ? error.stderr : '',
    };
  }

  function validRecordingID(value) {
    return RECORDING_ID.test(String(value || ''));
  }

  function validateDisplayName(value) {
    const name = String(value == null ? '' : value).trim();
    const count = Array.from(name).length;
    if (count < 1 || count > 80 || /[\x00-\x1f\x7f]/.test(name)) {
      const error = new Error('名称必须为 1–80 个可见字符');
      error.code = 'INVALID_ARGUMENT';
      error.operation = 'RecordingHistory.rename';
      throw error;
    }
    return name;
  }

  function parseTimestamp(value) {
    const time = Date.parse(String(value || ''));
    return Number.isFinite(time) ? time : 0;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function displayTimestamp(value) {
    const time = parseTimestamp(value);
    if (!time) return '时间未知';
    const date = new Date(time);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function displayTitle(row) {
    return row.displayName || row.targetTitle || row.recordingId;
  }

  function paginateRows(rows, requestedPageIndex, pageSize) {
    const source = Array.isArray(rows) ? rows : [];
    const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : PAGE_SIZE;
    const pageCount = Math.max(1, Math.ceil(source.length / size));
    const rawIndex = Number.isFinite(requestedPageIndex) ? Math.trunc(requestedPageIndex) : 0;
    const pageIndex = Math.min(Math.max(rawIndex, 0), pageCount - 1);
    const start = pageIndex * size;
    return {
      totalRows: source.length,
      pageSize: size,
      pageCount,
      pageIndex,
      rows: source.slice(start, start + size),
    };
  }

  function readJSON(file, path) {
    try {
      return JSON.parse(String(file.read(path)));
    } catch (_) {
      return null;
    }
  }

  function recordingPath(file, root, recordingId) {
    if (!validRecordingID(recordingId)) {
      const error = new Error('非法 recordingId');
      error.code = 'INVALID_ARGUMENT';
      error.operation = 'RecordingHistory.path';
      throw error;
    }
    return file.join(root, recordingId);
  }

  function statIs(file, path, type) {
    const info = file.stat(path);
    return !!info && info.type === type;
  }

  function resolveGeneratedScript(file, recordingDir) {
    const generatedDir = file.join(recordingDir, 'generated');
    if (!statIs(file, generatedDir, 'directory')) return null;

    const canonical = file.join(generatedDir, 'basic.recipe.js');
    if (statIs(file, canonical, 'file')) return canonical;

    const candidates = [];
    for (const name of file.listDir(generatedDir)) {
      if (!RECIPE_FILE.test(name)) continue;
      const path = file.join(generatedDir, name);
      const info = file.stat(path);
      if (!info || info.type !== 'file') continue;
      candidates.push({path, name, modifiedAt: parseTimestamp(info.modifiedAt)});
    }
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt || left.name.localeCompare(right.name));
    return candidates.length ? candidates[0].path : null;
  }

  function inspectRecording(file, root, recordingId, options) {
    if (!validRecordingID(recordingId)) return null;
    const recordingDir = recordingPath(file, root, recordingId);
    const dirInfo = file.stat(recordingDir);
    if (!dirInfo || dirInfo.type !== 'directory') return null;

    const manifestPath = file.join(recordingDir, 'manifest.json');
    const manifestInfo = file.stat(manifestPath);
    const manifest = manifestInfo && manifestInfo.type === 'file' ? readJSON(file, manifestPath) : null;
    if (manifest && manifest.recordingId && manifest.recordingId !== recordingId) return null;

    const metadataPath = file.join(recordingDir, 'ui-metadata.json');
    const metadataInfo = file.stat(metadataPath);
    const metadata = metadataInfo && metadataInfo.type === 'file' ? readJSON(file, metadataPath) : null;
    const displayName = metadata && typeof metadata.displayName === 'string' && metadata.displayName.trim()
      ? metadata.displayName.trim() : '';
    const startedAt = manifest && manifest.startedAt ? String(manifest.startedAt) : String(dirInfo.modifiedAt || '');
    const targetTitle = manifest && manifest.initialWindow && manifest.initialWindow.title
      ? String(manifest.initialWindow.title)
      : manifest && manifest.within && manifest.within.title ? String(manifest.within.title) : '';
    const storageState = manifest && manifest.storage && manifest.storage.state
      ? String(manifest.storage.state) : '';
    const state = manifest && manifest.state ? String(manifest.state) : (manifest ? 'unknown' : 'invalid');
    const issues = manifest && Array.isArray(manifest.issues) ? manifest.issues.length : 0;
    const resolveScript = !options || options.resolveScript !== false;

    return {
      recordingId,
      recordingDir,
      manifestPath,
      metadataPath,
      displayName,
      startedAt,
      targetTitle,
      state,
      storageState,
      issueCount: issues,
      scriptFile: resolveScript ? resolveGeneratedScript(file, recordingDir) : null,
      scriptResolved: resolveScript,
      manifestValid: !!manifest,
      modifiedAt: String(dirInfo.modifiedAt || ''),
    };
  }

  function scanRecordings(file, root, options) {
    const rootInfo = file.stat(root);
    if (!rootInfo) return [];
    if (rootInfo.type !== 'directory') {
      const error = new Error('Recorder 历史根路径不是目录');
      error.code = 'INVALID_STATE';
      error.operation = 'RecordingHistory.scan';
      throw error;
    }
    const rows = [];
    for (const name of file.listDir(root)) {
      if (!validRecordingID(name)) continue;
      const row = inspectRecording(file, root, name, options);
      if (row) rows.push(row);
    }
    rows.sort((left, right) => {
      const leftTime = parseTimestamp(left.startedAt) || parseTimestamp(left.modifiedAt);
      const rightTime = parseTimestamp(right.startedAt) || parseTimestamp(right.modifiedAt);
      return rightTime - leftTime || right.recordingId.localeCompare(left.recordingId);
    });
    return rows;
  }

  function platformName(system) {
    try {
      const info = system && typeof system.getPlatformInfo === 'function' ? system.getPlatformInfo() : null;
      return info && info.os ? String(info.os) : '';
    } catch (_) {
      return '';
    }
  }

  function buildWindowHTML(rows, status, options) {
    const settings = options || {};
    const page = paginateRows(rows, settings.pageIndex, settings.pageSize || PAGE_SIZE);
    const slots = [];
    for (let index = 0; index < page.pageSize; index++) {
      const row = page.rows[index] || null;
      const title = row ? displayTitle(row) : '';
      slots.push(`
        <section id="recording${index}" class="recording">
          <div id="recordingName${index}" class="name">${escapeHTML(title)}</div>
          <div id="recordingTime${index}" class="time">${row ? escapeHTML(displayTimestamp(row.startedAt)) : ''}</div>
          <div id="recordingActions${index}" class="actions">
            <button id="run${index}" class="icon-action" title="运行" aria-label="运行"${row && row.scriptFile ? '' : ' disabled'}>运行</button>
            <button id="rename${index}" class="icon-action" title="改名" aria-label="改名"${row ? '' : ' disabled'}>改名</button>
            <button id="open${index}" class="icon-action" title="打开目录" aria-label="打开目录"${row ? '' : ' disabled'}>打开目录</button>
            <button id="delete${index}" class="icon-action danger" title="删除" aria-label="删除"${row ? '' : ' disabled'}>删除</button>
          </div>
        </section>`);
    }

    return `
      <main id="historyMain">
        <div id="historyHeader" class="header">
          <div id="historyTitle" class="title">历史录制</div>
        </div>
        <p id="historyStatus" class="status">${escapeHTML(status || `共 ${page.totalRows} 条录制`)}</p>
        <div id="historyColumns" class="columns">
          <div id="historyNameColumn">名称</div>
          <div id="historyTimeColumn">时间</div>
          <div id="historyActionsColumn">操作</div>
        </div>
        <div id="historyList" class="list">${slots.join('')}</div>
        <p id="emptyHistory" class="empty">还没有可显示的 Recorder 录制。</p>
        <div id="historyPager" class="pager">
          <button id="prevHistory">上一页</button>
          <span id="pageIndicator">第 ${page.pageIndex + 1} / ${page.pageCount} 页 · 共 ${page.totalRows} 条</span>
          <button id="nextHistory">下一页</button>
          <button id="refreshHistory">刷新</button>
        </div>
      </main>`;
  }

  const HISTORY_CSS = `
    html, body { margin: 0; padding: 0; background: #171717; color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #historyMain { box-sizing: border-box; height: 100vh; padding: 18px; overflow: hidden; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-size: 20px; font-weight: 700; }
    .status { margin: 8px 0 12px; color: #b9b9b9; font-size: 13px; }
    .columns, .recording { display: grid; grid-template-columns: minmax(0, 1fr) 160px 156px; align-items: center; column-gap: 12px; }
    .columns { padding: 0 10px 7px; color: #8f8f8f; font-size: 11px; border-bottom: 1px solid #3b3b3b; }
    .list { height: calc(100vh - 162px); overflow-y: auto; padding-right: 4px; }
    .recording { min-height: 48px; padding: 0 10px; border-bottom: 1px solid #333; }
    .recording:hover { background: #202020; }
    .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
    .time { color: #b9b9b9; font-size: 12px; white-space: nowrap; }
    .actions { display: flex; flex-wrap: nowrap; align-items: center; justify-content: flex-start; gap: 6px; }
    .pager { min-height: 38px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 10px; border-top: 1px solid #333; }
    #pageIndicator { min-width: 170px; color: #b9b9b9; font-size: 12px; text-align: center; }
    button { min-height: 30px; padding: 0 10px; border: 1px solid #505050; border-radius: 7px; background: #303030; color: #f4f4f4; font-size: 13px; }
    button:not(:disabled) { cursor: pointer; }
    .icon-action { box-sizing: border-box; width: 32px; height: 32px; min-width: 32px; padding: 0; }
    .icon-action:hover:not(:disabled), .pager button:hover:not(:disabled) { background: #3a3a3a; border-color: #6a6a6a; }
    button:disabled { opacity: 0.38; cursor: default; }
    .danger { border-color: #754545; }
    .danger:hover:not(:disabled) { background: #4a2525; border-color: #a65a5a; }
    .empty { margin: 0; color: #a8a8a8; padding: 24px 0; }
  `;

  function createManager(options) {
    const settings = options || {};
    const file = settings.file || global.File;
    const ui = settings.ui || global.ui;
    const dialog = settings.dialog || global.Dialog;
    const command = settings.command || global.Command;
    const execution = settings.execution || global.Execution;
    const system = settings.system || global.System;
    const toolbar = settings.toolbar;
    const app = settings.app;
    const logger = settings.logger || global.console;
    const sleep = settings.sleep || (delay => new Promise(resolve => setTimeout(resolve, delay)));
    const runCountdownStepMs = Number.isFinite(settings.runCountdownStepMs)
      ? Math.max(0, Math.trunc(settings.runCountdownStepMs)) : 1000;
    const runTimeoutMs = Number.isFinite(settings.runTimeoutMs)
      ? Math.max(1000, Math.trunc(settings.runTimeoutMs)) : 15 * 60 * 1000;

    if (!file || typeof file.join !== 'function' || typeof file.stat !== 'function'
      || typeof file.listDir !== 'function' || typeof file.read !== 'function'
      || typeof file.write !== 'function' || typeof file.removeDir !== 'function') {
      throw new Error('recording history requires File.join/stat/listDir/read/write/removeDir');
    }
    if (!ui || typeof ui.createWindow !== 'function') throw new Error('recording history requires ui.createWindow()');
    if (!dialog || typeof dialog.confirm !== 'function' || typeof dialog.prompt !== 'function'
      || typeof dialog.alert !== 'function') throw new Error('recording history requires Dialog alert/confirm/prompt');
    if (!command || typeof command.run !== 'function') throw new Error('recording history requires Command.run()');
    if (!execution || !execution.workdir) throw new Error('recording history requires Execution.workdir');
    if (!toolbar || typeof toolbar.addButton !== 'function') throw new Error('recording history requires the simple toolbar');
    if (!app || typeof app.state !== 'function') throw new Error('recording history requires the simple console app state');

    const root = settings.recordingsRoot || file.join(execution.workdir, '.runtime', 'recordings');
    const os = settings.platform || platformName(system);
    const openDeskBinary = settings.openDeskBinary
      || file.join(execution.workdir, 'dist', os === 'windows' ? 'opendesk.exe' : 'opendesk');
    let historyWindow = null;
    let currentRows = [];
    let visibleRows = [];
    let pageIndex = 0;
    let windowSequence = 0;
    let activeRun = null;
    let lastRun = null;
    let closed = false;
    const pendingRows = new Set();

    function coreBusy() {
      const state = app.state();
      return ACTIVE_CORE_PHASES.has(state.phase);
    }

    function isRunActive() {
      return !!activeRun;
    }

    function loadHistoryRows() {
      return scanRecordings(file, root, {resolveScript: false});
    }

    function hydrateVisibleRows(rows) {
      for (const row of rows) {
        if (row.scriptResolved) continue;
        row.scriptFile = resolveGeneratedScript(file, row.recordingDir);
        row.scriptResolved = true;
      }
      return rows;
    }

    function pageState() {
      const page = paginateRows(currentRows, pageIndex, PAGE_SIZE);
      return {
        totalRows: page.totalRows,
        pageSize: page.pageSize,
        pageCount: page.pageCount,
        pageIndex: page.pageIndex,
        pageNumber: page.pageIndex + 1,
        recordingIds: page.rows.map(row => row.recordingId),
      };
    }

    function resolveSlot(index) {
      return Number.isInteger(index) && index >= 0 && index < visibleRows.length ? visibleRows[index] : null;
    }

    async function safeUpdate(window, id, patch) {
      if (!window) return null;
      try {
        return await window.control(id).update(patch);
      } catch (_) {
        return null;
      }
    }

    async function setHistoryStatus(message) {
      if (!historyWindow) return;
      await safeUpdate(historyWindow, 'historyStatus', {text: String(message)});
    }

    async function syncAvailability() {
      if (closed) return;
      const disabled = coreBusy() || isRunActive();
      try {
        await toolbar.updateButton('history', {disabled, active: !!historyWindow && !disabled});
      } catch (_) {
        // The toolbar may already be closing.
      }
    }

    async function renderPage(message) {
      const window = historyWindow;
      if (!window) return null;

      const page = paginateRows(currentRows, pageIndex, PAGE_SIZE);
      pageIndex = page.pageIndex;
      visibleRows = hydrateVisibleRows(page.rows);
      const locked = coreBusy() || isRunActive() || pendingRows.size > 0;
      const tasks = [
        safeUpdate(window, 'historyStatus', {text: String(message || `共 ${page.totalRows} 条录制；运行始终需要显式点击。`)}),
        safeUpdate(window, 'pageIndicator', {text: `第 ${page.pageIndex + 1} / ${page.pageCount} 页 · 共 ${page.totalRows} 条`}),
        safeUpdate(window, 'prevHistory', {disabled: locked || page.totalRows === 0 || page.pageIndex === 0}),
        safeUpdate(window, 'nextHistory', {disabled: locked || page.totalRows === 0 || page.pageIndex >= page.pageCount - 1}),
        safeUpdate(window, 'refreshHistory', {disabled: locked}),
        safeUpdate(window, 'emptyHistory', {visible: page.totalRows === 0}),
        safeUpdate(window, 'historyColumns', {visible: page.totalRows > 0}),
        safeUpdate(window, 'historyList', {visible: page.totalRows > 0}),
      ];

      for (let index = 0; index < PAGE_SIZE; index++) {
        const row = visibleRows[index] || null;
        tasks.push(safeUpdate(window, `recording${index}`, {visible: !!row}));
        tasks.push(safeUpdate(window, `recordingName${index}`, {text: row ? displayTitle(row) : ''}));
        tasks.push(safeUpdate(window, `recordingTime${index}`, {text: row ? displayTimestamp(row.startedAt) : ''}));
        tasks.push(safeUpdate(window, `run${index}`, {disabled: locked || !row || !row.scriptFile}));
        for (const action of ['rename', 'open', 'delete']) {
          tasks.push(safeUpdate(window, `${action}${index}`, {disabled: locked || !row}));
        }
      }
      await Promise.all(tasks);
      return pageState();
    }

    async function setHistoryActionsDisabled(disabled) {
      const window = historyWindow;
      if (!window) return;
      const page = paginateRows(currentRows, pageIndex, PAGE_SIZE);
      visibleRows = hydrateVisibleRows(page.rows);
      const locked = !!disabled || pendingRows.size > 0;
      const tasks = [
        safeUpdate(window, 'refreshHistory', {disabled: locked}),
        safeUpdate(window, 'prevHistory', {disabled: locked || page.totalRows === 0 || page.pageIndex === 0}),
        safeUpdate(window, 'nextHistory', {disabled: locked || page.totalRows === 0 || page.pageIndex >= page.pageCount - 1}),
      ];
      for (let index = 0; index < PAGE_SIZE; index++) {
        const row = visibleRows[index] || null;
        tasks.push(safeUpdate(window, `run${index}`, {disabled: locked || !row || !row.scriptFile}));
        for (const action of ['rename', 'open', 'delete']) {
          tasks.push(safeUpdate(window, `${action}${index}`, {disabled: locked || !row}));
        }
      }
      await Promise.all(tasks);
    }

    async function syncPageControls() {
      if (!historyWindow) return;
      const locked = coreBusy() || isRunActive() || pendingRows.size > 0;
      await setHistoryActionsDisabled(locked);
    }

    async function reportActionFailure(label, error) {
      const normalized = normalizeError(error, `RecordingHistory.${label}`);
      if (logger && typeof logger.error === 'function') {
        try { logger.error(`[recording-history] ${label}: ${normalized.message}`); } catch (_) {}
      }
      await setHistoryStatus(`${label}失败：${normalized.message}`);
      try {
        await dialog.alert({
          title: `${label}失败`,
          message: normalized.message,
          level: 'error',
          okText: '关闭',
        });
      } catch (_) {}
      return null;
    }

    function assertMutableRecording(recordingId) {
      const row = inspectRecording(file, root, recordingId);
      if (!row) {
        const error = new Error('录制不存在或不再是有效的历史目录');
        error.code = 'NOT_FOUND';
        error.operation = 'RecordingHistory.resolve';
        throw error;
      }
      return row;
    }

    async function rename(recordingId) {
      if (isRunActive() || pendingRows.has(recordingId)) return null;
      pendingRows.add(recordingId);
      await syncPageControls();
      try {
        const row = assertMutableRecording(recordingId);
        const next = await dialog.prompt({
          title: '重命名录制',
          message: '只修改历史列表显示名称，不修改 recordingId、目录或 Recorder 原始事实。',
          defaultValue: displayTitle(row),
          placeholder: '例如：计算器 25×4+10',
          confirmText: '保存',
          cancelText: '取消',
          maxLength: 80,
        });
        if (next === null) return null;
        const displayName = validateDisplayName(next);
        const latest = assertMutableRecording(recordingId);
        file.write(latest.metadataPath, JSON.stringify({
          schemaVersion: 1,
          recordingId,
          displayName,
          updatedAt: new Date().toISOString(),
        }, null, 2) + '\n');
        await refresh(`已将 ${recordingId} 显示为“${displayName}”`);
        return displayName;
      } finally {
        pendingRows.delete(recordingId);
        await syncPageControls();
      }
    }

    async function remove(recordingId) {
      if (isRunActive() || pendingRows.has(recordingId)) return false;
      pendingRows.add(recordingId);
      await syncPageControls();
      try {
        const row = assertMutableRecording(recordingId);
        const accepted = await dialog.confirm({
          title: '删除历史录制',
          message: `将永久删除整个 Recording package：\n名称：${displayTitle(row)}\nrecordingId：${row.recordingId}\n\n将删除 raw、manifest、actions、generated、evidence 和 ui-metadata。此操作不能撤销。`,
          level: 'warning',
          confirmText: '永久删除',
          cancelText: '取消',
          defaultAction: 'cancel',
        });
        if (!accepted) return false;
        const latest = assertMutableRecording(recordingId);
        file.removeDir(latest.recordingDir);
        if (file.stat(latest.recordingDir) !== null) {
          const error = new Error('删除后录制目录仍然存在');
          error.code = 'IO_FAILED';
          error.operation = 'RecordingHistory.delete';
          throw error;
        }
        await refresh(`已删除 ${recordingId}`);
        return true;
      } finally {
        pendingRows.delete(recordingId);
        await syncPageControls();
      }
    }

    async function openDirectory(recordingId) {
      if (isRunActive() || pendingRows.has(recordingId)) return null;
      pendingRows.add(recordingId);
      await syncPageControls();
      try {
        const row = assertMutableRecording(recordingId);
        let result;
        if (os === 'windows') {
          result = await command.run('explorer.exe', [row.recordingDir], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024});
        } else if (os === 'darwin') {
          result = await command.run('/usr/bin/open', [row.recordingDir], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024});
        } else {
          result = await command.run('xdg-open', [row.recordingDir], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024});
        }
        await setHistoryStatus(`已打开 ${recordingId} 的目录`);
        return result;
      } finally {
        pendingRows.delete(recordingId);
        await syncPageControls();
      }
    }

    async function captureToolbarRunState() {
      const buttonIds = ['capture', 'replay', 'agentPrompt'];
      const buttons = {};
      for (const id of buttonIds) {
        try {
          const value = await toolbar.getButtonState(id);
          buttons[id] = {
            icon: value.icon,
            label: value.label,
            active: !!value.active,
            disabled: !!value.disabled,
            error: value.error == null ? null : String(value.error),
            badge: value.badge == null ? null : value.badge,
          };
        } catch (_) {}
      }
      let pointerMotion = null;
      try {
        const value = await toolbar.getControlState('pointerMotion');
        pointerMotion = {checked: !!value.value, disabled: !!value.disabled};
      } catch (_) {}
      return {buttons, pointerMotion};
    }

    async function lockToolbarForHistoryRun(savedPresentation) {
      for (const id of ['capture', 'replay', 'agentPrompt']) {
        if (savedPresentation.buttons[id]) await toolbar.updateButton(id, {disabled: true});
      }
      if (savedPresentation.pointerMotion) await toolbar.updateControl('pointerMotion', {disabled: true});
      await toolbar.updateButton('stop', {label: '取消历史重放', disabled: false, active: false, error: null});
      await syncAvailability();
    }

    async function restoreToolbarAfterHistoryRun(savedPresentation) {
      for (const [id, patch] of Object.entries(savedPresentation.buttons)) {
        try { await toolbar.updateButton(id, patch); } catch (_) {}
      }
      if (savedPresentation.pointerMotion) {
        try { await toolbar.updateControl('pointerMotion', savedPresentation.pointerMotion); } catch (_) {}
      }
      try { await toolbar.updateButton('stop', {label: '停止录制', disabled: true, active: false, error: null}); } catch (_) {}
      await syncAvailability();
    }

    async function runRecording(recordingId) {
      if (activeRun || coreBusy() || pendingRows.size) return lastRun;
      const row = assertMutableRecording(recordingId);
      const scriptFile = resolveGeneratedScript(file, row.recordingDir);
      if (!scriptFile) {
        await dialog.alert({title: '无法运行', message: '该录制还没有 generated/*.recipe.js。', level: 'warning', okText: '关闭'});
        await refresh(`无法运行 ${recordingId}：generated recipe 已不存在。`);
        return null;
      }
      const scriptInfo = file.stat(scriptFile);
      if (!scriptInfo || scriptInfo.type !== 'file') throw new Error('历史脚本已不存在');

      const controller = new global.AbortController();
      const startedAt = new Date().toISOString();
      const runLogDir = file.join(
        execution.workdir,
        '.runtime', 'examples', 'custom-ui', 'recording-console-simple',
        'history-runs', recordingId, startedAt.replace(/[:.]/g, '-'),
      );
      file.ensureDir(runLogDir);
      activeRun = {recordingId, scriptFile, controller, startedAt, runLogDir};
      let savedPresentation = null;

      try {
        await setHistoryActionsDisabled(true);
        savedPresentation = await captureToolbarRunState();
        await lockToolbarForHistoryRun(savedPresentation);
        for (const value of [3, 2, 1]) {
          await setHistoryStatus(`将在 ${value} 秒后运行“${displayTitle(row)}”；请恢复预期起始桌面。主工具条 Stop 可取消。`);
          await sleep(runCountdownStepMs);
          if (controller.signal.aborted) {
            lastRun = {status: 'canceled', recordingId, scriptFile, startedAt, finishedAt: new Date().toISOString(), logDir: runLogDir};
            await setHistoryStatus('历史重放已取消；录制和生成脚本保持不变。');
            return clone(lastRun);
          }
        }
        await setHistoryStatus(`正在运行 ${recordingId} …`);
        const result = await command.run(openDeskBinary, [
          '-script', scriptFile,
          '-console-mode', 'script',
          '-log-dir', runLogDir,
        ], {
          cwd: execution.workdir,
          timeout: runTimeoutMs,
          maxOutputBytes: 1024 * 1024,
          signal: controller.signal,
        });
        lastRun = {
          status: 'succeeded', recordingId, scriptFile, startedAt, finishedAt: new Date().toISOString(),
          exitCode: result.exitCode, stdout: result.stdout || '', stderr: result.stderr || '', logDir: runLogDir,
        };
        await setHistoryStatus(`运行完成：${recordingId}，exit code ${result.exitCode}。业务结果仍需独立确认。`);
        return clone(lastRun);
      } catch (error) {
        const normalized = normalizeError(error, 'Command.run');
        const canceled = normalized.code === 'CANCELED' || controller.signal.aborted;
        lastRun = {
          status: canceled ? 'canceled' : 'failed', recordingId, scriptFile, startedAt, finishedAt: new Date().toISOString(),
          exitCode: normalized.exitCode, stdout: normalized.stdout, stderr: normalized.stderr, logDir: runLogDir,
          error: canceled ? null : normalized,
        };
        await setHistoryStatus(canceled
          ? '历史重放已取消；录制和生成脚本保持不变。'
          : `历史重放失败：${normalized.message}`);
        return clone(lastRun);
      } finally {
        activeRun = null;
        await setHistoryActionsDisabled(false);
        if (savedPresentation) await restoreToolbarAfterHistoryRun(savedPresentation);
        else await syncAvailability();
      }
    }

    async function cancelRun() {
      if (!activeRun) return lastRun;
      activeRun.controller.abort('recording-console-simple history run canceled');
      await setHistoryStatus('正在取消历史重放…');
      return lastRun;
    }

    async function applyActionIcons(window) {
      const tasks = [];
      for (let index = 0; index < PAGE_SIZE; index++) {
        tasks.push(safeUpdate(window, `run${index}`, {icon: ACTION_ICONS.run, text: ''}));
        tasks.push(safeUpdate(window, `rename${index}`, {icon: ACTION_ICONS.rename, text: ''}));
        tasks.push(safeUpdate(window, `open${index}`, {icon: ACTION_ICONS.open, text: ''}));
        tasks.push(safeUpdate(window, `delete${index}`, {icon: ACTION_ICONS.delete, text: ''}));
      }
      await Promise.all(tasks);
    }

    function bindAction(window, controlId, label, action) {
      window.control(controlId).on('click', async () => {
        try {
          return await action();
        } catch (error) {
          return reportActionFailure(label, error);
        }
      });
    }

    function bindSlotAction(window, controlId, label, index, action) {
      bindAction(window, controlId, label, async () => {
        const row = resolveSlot(index);
        if (!row) return null;
        return action(row.recordingId, row);
      });
    }

    async function setPage(nextPageIndex) {
      if (!historyWindow || coreBusy() || isRunActive() || pendingRows.size) return pageState();
      const next = paginateRows(currentRows, nextPageIndex, PAGE_SIZE);
      pageIndex = next.pageIndex;
      await renderPage();
      return pageState();
    }

    async function bindWindow(window) {
      bindAction(window, 'refreshHistory', '刷新', () => refresh());
      bindAction(window, 'prevHistory', '上一页', () => setPage(pageIndex - 1));
      bindAction(window, 'nextHistory', '下一页', () => setPage(pageIndex + 1));
      for (let index = 0; index < PAGE_SIZE; index++) {
        bindSlotAction(window, `run${index}`, '运行', index, recordingId => runRecording(recordingId));
        bindSlotAction(window, `rename${index}`, '改名', index, recordingId => rename(recordingId));
        bindSlotAction(window, `open${index}`, '打开目录', index, recordingId => openDirectory(recordingId));
        bindSlotAction(window, `delete${index}`, '删除', index, recordingId => remove(recordingId));
      }
      await applyActionIcons(window);
      window.on('close', () => {
        if (historyWindow === window) {
          historyWindow = null;
          currentRows = [];
          visibleRows = [];
          pageIndex = 0;
        }
        if (activeRun) activeRun.controller.abort('recording history window closed');
        void syncAvailability();
      });
    }

    async function open(message) {
      if (closed || coreBusy()) return null;
      if (historyWindow) {
        try {
          await historyWindow.show();
          if (message) await setHistoryStatus(message);
          await syncAvailability();
          return historyWindow;
        } catch (_) {
          historyWindow = null;
          currentRows = [];
          visibleRows = [];
          pageIndex = 0;
        }
      }

      currentRows = loadHistoryRows();
      pageIndex = 0;
      visibleRows = paginateRows(currentRows, pageIndex, PAGE_SIZE).rows;
      const id = `recordingHistory${++windowSequence}`;
      const window = await ui.createWindow({
        id,
        kind: 'floating',
        title: '历史录制',
        position: {
          mode: 'anchor',
          size: {width: 860, height: 620},
          horizontal: 'center',
          vertical: 'center',
          margin: 0,
          display: 'active',
        },
        alwaysOnTop: true,
        draggable: true,
        theme: 'dark',
        content: {
          html: buildWindowHTML(currentRows, message || `共 ${currentRows.length} 条录制；运行始终需要显式点击。`, {pageIndex, pageSize: PAGE_SIZE}),
          css: HISTORY_CSS,
        },
      });
      historyWindow = window;
      await bindWindow(window);
      await renderPage(message || `共 ${currentRows.length} 条录制；运行始终需要显式点击。`);
      if (activeRun) await setHistoryActionsDisabled(true);
      await window.show();
      await syncAvailability();
      return window;
    }

    async function refresh(message) {
      if (closed) return null;
      if (!historyWindow) return open(message);
      currentRows = loadHistoryRows();
      const next = paginateRows(currentRows, pageIndex, PAGE_SIZE);
      pageIndex = next.pageIndex;
      await renderPage(message);
      await syncAvailability();
      return historyWindow;
    }

    async function close() {
      closed = true;
      if (activeRun) activeRun.controller.abort('recording history closed');
      const prior = historyWindow;
      historyWindow = null;
      currentRows = [];
      visibleRows = [];
      pageIndex = 0;
      if (prior) {
        try { await prior.close(); } catch (_) {}
      }
    }

    toolbar.addButton('history', '历史录制', 'list.bullet', () => open());

    return Object.freeze({
      open,
      refresh,
      close,
      scan: () => scanRecordings(file, root),
      rename,
      remove,
      openDirectory,
      runRecording,
      cancelRun,
      setPage,
      pageState,
      syncAvailability,
      isRunActive,
      lastRun: () => clone(lastRun),
      root: () => root,
    });
  }

  global.OpenDeskRecordingHistory = Object.freeze({
    createManager,
    scanRecordings,
    inspectRecording,
    resolveGeneratedScript,
    validateDisplayName,
    paginateRows,
    buildWindowHTML,
    pageSize: () => PAGE_SIZE,
    actionIcons: () => clone(ACTION_ICONS),
  });
})(globalThis);
