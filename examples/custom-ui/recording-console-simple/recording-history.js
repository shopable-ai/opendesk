// History surface for recording-console-simple.
// This module owns only history discovery, local display metadata, and explicit
// execution of an already-generated Recorder script. It does not rebuild or
// reinterpret Recorder facts.
(function installOpenDeskRecordingHistory(global) {
  'use strict';

  const RECORDING_ID = /^rec-[A-Za-z0-9][A-Za-z0-9._-]*$/;
  const RECIPE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.recipe\.js$/;
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

  function displayTimestamp(value) {
    const time = parseTimestamp(value);
    if (!time) return '时间未知';
    try {
      return new Date(time).toLocaleString();
    } catch (_) {
      return new Date(time).toISOString();
    }
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

  function inspectRecording(file, root, recordingId) {
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
      scriptFile: resolveGeneratedScript(file, recordingDir),
      manifestValid: !!manifest,
      modifiedAt: String(dirInfo.modifiedAt || ''),
    };
  }

  function scanRecordings(file, root) {
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
      const row = inspectRecording(file, root, name);
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

  function buildWindowHTML(rows, status) {
    const header = `
      <main id="historyMain">
        <div id="historyHeader" class="header">
          <div id="historyTitle" class="title">历史录制</div>
          <button id="refreshHistory">刷新</button>
        </div>
        <p id="historyStatus" class="status">${escapeHTML(status || `共 ${rows.length} 条录制`)}</p>`;
    if (!rows.length) {
      return header + '<p id="emptyHistory" class="empty">还没有可显示的 Recorder 录制。</p></main>';
    }
    const body = rows.map((row, index) => {
      const title = row.displayName || row.targetTitle || row.recordingId;
      const state = [row.state, row.storageState].filter(Boolean).join(' / ');
      const script = row.scriptFile ? '脚本可运行' : '尚无生成脚本';
      const invalid = row.manifestValid ? '' : ' · manifest 无法解析';
      const issues = row.issueCount ? ` · ${row.issueCount} 个问题` : '';
      return `
        <section id="recording${index}" class="recording">
          <div id="recordingName${index}" class="name">${escapeHTML(title)}</div>
          <div id="recordingMeta${index}" class="meta">${escapeHTML(displayTimestamp(row.startedAt))} · ${escapeHTML(state || '状态未知')} · ${escapeHTML(script)}${escapeHTML(issues + invalid)}</div>
          <div id="recordingId${index}" class="id">${escapeHTML(row.recordingId)}</div>
          <div id="recordingActions${index}" class="actions">
            <button id="run${index}"${row.scriptFile ? '' : ' disabled'}>运行</button>
            <button id="rename${index}">改名</button>
            <button id="open${index}">打开目录</button>
            <button id="delete${index}" class="danger">删除</button>
          </div>
        </section>`;
    }).join('');
    return header + '<div id="historyList" class="list">' + body + '</div></main>';
  }

  const HISTORY_CSS = `
    html, body { margin: 0; padding: 0; background: #171717; color: #f4f4f4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #historyMain { box-sizing: border-box; height: 100vh; padding: 18px; overflow: hidden; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .title { font-size: 20px; font-weight: 700; }
    .status { margin: 10px 0 12px; color: #b9b9b9; font-size: 13px; }
    .list { height: calc(100vh - 76px); overflow-y: auto; padding-right: 4px; }
    .recording { border: 1px solid #3b3b3b; border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #222; }
    .name { font-size: 15px; font-weight: 650; margin-bottom: 4px; }
    .meta { color: #c7c7c7; font-size: 12px; line-height: 1.45; }
    .id { color: #8f8f8f; font-size: 11px; margin-top: 4px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 1px solid #505050; border-radius: 7px; padding: 6px 11px; background: #303030; color: #f4f4f4; font-size: 13px; }
    button:disabled { opacity: 0.45; }
    .danger { border-color: #754545; }
    .empty { color: #a8a8a8; padding: 24px 0; }
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
    let windowSequence = 0;
    let activeRun = null;
    let lastRun = null;
    let closed = false;

    function coreBusy() {
      const state = app.state();
      return ACTIVE_CORE_PHASES.has(state.phase);
    }

    function isRunActive() {
      return !!activeRun;
    }

    async function setHistoryStatus(message) {
      if (!historyWindow) return;
      try {
        await historyWindow.control('historyStatus').update({text: String(message)});
      } catch (_) {
        // The window may have been closed while a run was settling.
      }
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
      if (isRunActive()) return;
      const row = assertMutableRecording(recordingId);
      const next = await dialog.prompt({
        title: '重命名录制',
        message: '只修改历史列表显示名称，不修改 recordingId、目录或 Recorder 原始事实。',
        defaultValue: row.displayName || row.targetTitle || '',
        placeholder: '例如：计算器 25×4+10',
        confirmText: '保存',
        cancelText: '取消',
        maxLength: 80,
      });
      if (next === null) return;
      const displayName = validateDisplayName(next);
      const latest = assertMutableRecording(recordingId);
      file.write(latest.metadataPath, JSON.stringify({
        schemaVersion: 1,
        recordingId,
        displayName,
        updatedAt: new Date().toISOString(),
      }, null, 2) + '\n');
      await refresh(`已将 ${recordingId} 显示为“${displayName}”`);
    }

    async function remove(recordingId) {
      if (isRunActive()) return;
      const row = assertMutableRecording(recordingId);
      const accepted = await dialog.confirm({
        title: '删除历史录制',
        message: `将永久删除录制目录：\n${row.recordingId}\n\n包括 raw、manifest、actions、generated 和本地显示元数据。此操作不能撤销。`,
        level: 'warning',
        confirmText: '永久删除',
        cancelText: '取消',
        defaultAction: 'cancel',
      });
      if (!accepted) return;
      const latest = assertMutableRecording(recordingId);
      file.removeDir(latest.recordingDir);
      if (file.stat(latest.recordingDir) !== null) {
        const error = new Error('删除后录制目录仍然存在');
        error.code = 'IO_FAILED';
        error.operation = 'RecordingHistory.delete';
        throw error;
      }
      await refresh(`已删除 ${recordingId}`);
    }

    async function openDirectory(recordingId) {
      if (isRunActive()) return;
      const row = assertMutableRecording(recordingId);
      if (os === 'windows') {
        await command.run('explorer.exe', [row.recordingDir], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024});
      } else if (os === 'darwin') {
        await command.run('/usr/bin/open', [row.recordingDir], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024});
      } else {
        await command.run('xdg-open', [row.recordingDir], {cwd: execution.workdir, timeout: 10000, maxOutputBytes: 1024 * 1024});
      }
      await setHistoryStatus(`已打开 ${recordingId} 的目录`);
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
      if (activeRun || coreBusy()) return lastRun;
      const row = assertMutableRecording(recordingId);
      const scriptFile = resolveGeneratedScript(file, row.recordingDir);
      if (!scriptFile) {
        await dialog.alert({title: '无法运行', message: '该录制还没有 generated/*.recipe.js。', level: 'warning', okText: '关闭'});
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
      const savedPresentation = await captureToolbarRunState();
      activeRun = {recordingId, scriptFile, controller, startedAt, runLogDir};
      await lockToolbarForHistoryRun(savedPresentation);

      try {
        for (const value of [3, 2, 1]) {
          await setHistoryStatus(`将在 ${value} 秒后运行“${row.displayName || row.targetTitle || recordingId}”；请恢复预期起始桌面。主工具条 Stop 可取消。`);
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
        await restoreToolbarAfterHistoryRun(savedPresentation);
      }
    }

    async function cancelRun() {
      if (!activeRun) return lastRun;
      activeRun.controller.abort('recording-console-simple history run canceled');
      await setHistoryStatus('正在取消历史重放…');
      return lastRun;
    }

    async function bindWindow(window, rows) {
      window.control('refreshHistory').on('click', () => refresh());
      rows.forEach((row, index) => {
        if (row.scriptFile) window.control(`run${index}`).on('click', () => runRecording(row.recordingId));
        window.control(`rename${index}`).on('click', () => rename(row.recordingId));
        window.control(`open${index}`).on('click', () => openDirectory(row.recordingId));
        window.control(`delete${index}`).on('click', () => remove(row.recordingId));
      });
      window.on('close', () => {
        if (historyWindow === window) historyWindow = null;
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
        }
      }
      const rows = scanRecordings(file, root);
      const id = `recordingHistory${++windowSequence}`;
      const window = await ui.createWindow({
        id,
        kind: 'floating',
        title: '历史录制',
        position: {
          mode: 'anchor',
          size: {width: 760, height: 560},
          horizontal: 'center',
          vertical: 'center',
          margin: 0,
          display: 'active',
        },
        alwaysOnTop: true,
        draggable: true,
        theme: 'dark',
        content: {
          html: buildWindowHTML(rows, message || `共 ${rows.length} 条录制；运行始终需要显式点击。`),
          css: HISTORY_CSS,
        },
      });
      historyWindow = window;
      await bindWindow(window, rows);
      await window.show();
      await syncAvailability();
      return window;
    }

    async function refresh(message) {
      const prior = historyWindow;
      historyWindow = null;
      if (prior) {
        try { await prior.close(); } catch (_) {}
      }
      return open(message);
    }

    async function close() {
      closed = true;
      if (activeRun) activeRun.controller.abort('recording history closed');
      const prior = historyWindow;
      historyWindow = null;
      if (prior) {
        try { await prior.close(); } catch (_) {}
      }
    }

    toolbar.addButton('history', '历史录制', 'clock.fill', () => open());

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
    buildWindowHTML,
  });
})(globalThis);
