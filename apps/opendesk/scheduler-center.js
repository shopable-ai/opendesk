(function installOpenDeskSchedulerCenter(global) {
  'use strict';

  const defaultScheduler = global.OpenDeskSchedulerClient;
  const defaultUI = global.ui;
  const defaultLogger = global.console;
  const file = global.File;
  const command = global.Command;
  const system = global.System;
  const execution = global.Execution;
  const productPaths = global.OpenDeskProductPaths || {};
  const MAX_ROWS = 48;
  const MAX_SCRIPT_CHOICES = 96;
  const MAX_COMMAND_OUTPUT = 2 << 20;

  const BUTTON_ICONS = Object.freeze({
    refresh: 'arrow.clockwise', create: 'plus', run: 'play.fill', pause: 'pause.fill',
    resume: 'power', history: 'list.bullet', delete: 'trash.fill', confirm: 'checkmark', close: 'xmark',
  });

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function triggerLabel(value) {
    if (value === 'scheduled') return '按计划';
    if (value === 'manual') return '手动';
    return '未知';
  }

  function statusLabel(value) {
    return ({
      queued: '排队中', running: '运行中', succeeded: '成功', failed: '失败',
      canceled: '已取消', skipped: '已跳过',
    })[value] || value || '未知';
  }

  function terminalRun(run) {
    return !!run && ['succeeded', 'failed', 'canceled', 'skipped'].includes(String(run.status || ''));
  }

  function latencyLabel(run) {
    if (!run || !run.scheduledAt || !run.startedAt) return '—';
    const planned = new Date(run.scheduledAt).getTime();
    const started = new Date(run.startedAt).getTime();
    if (!Number.isFinite(planned) || !Number.isFinite(started)) return '—';
    const ms = started - planned;
    return `${ms >= 0 ? '+' : ''}${ms} ms`;
  }

  function scheduleLabel(job) {
    if (!job) return '';
    const type = job.scheduleType === 'at' ? '单次' : job.scheduleType === 'cron' ? 'Cron' : '间隔';
    const source = job.sourceType === 'inline' ? '脚本文本' : '脚本文件';
    return `${source} · ${type} · ${job.scheduleExpression || '—'} · ${job.timezone || 'Local'}`;
  }

  function runLabel(run) {
    if (!run) return '尚未运行';
    return `${statusLabel(run.status)} · ${triggerLabel(run.triggerType)} · ${formatTime(run.startedAt || run.scheduledAt)}`;
  }

  function stateLabel(job) {
    if (!job) return '';
    if (job.scheduleType === 'at' && !job.enabled && terminalRun(job.lastRun)) {
      return `已结束 · ${statusLabel(job.lastRun.status)}`;
    }
    return job.enabled ? '已启用' : '已暂停';
  }

  function nextLabel(job) {
    if (!job) return '';
    if (!job.nextRunAt) {
      if (job.scheduleType === 'at' && !job.enabled && terminalRun(job.lastRun)) return '无后续排期';
      return '—';
    }
    const target = new Date(job.nextRunAt);
    if (Number.isNaN(target.getTime())) return String(job.nextRunAt);
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) return `${target.toLocaleString()} · 等待服务端领取`;
    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    return `${target.toLocaleString()} · ${seconds}s`;
  }

  function scheduleHelp(scheduleType) {
    if (scheduleType === 'cron') return 'Cron 示例：0 9 * * *（每天 09:00）';
    if (scheduleType === 'at') return '单次：填写 RFC3339 时间；测试计划默认使用未来 15 / 45 秒。';
    return '间隔示例：10m、1h、24h';
  }

  function errorDetails(error) {
    return {
      message: error && error.message ? String(error.message) : String(error || 'unknown error'),
      stack: error && error.stack ? String(error.stack) : '',
    };
  }

  function errorSummary(error) {
    const message = errorDetails(error).message.replace(/\s+/g, ' ').trim();
    return message.length > 240 ? message.slice(0, 237) + '…' : message;
  }

  function isAbsolutePath(value) {
    const input = String(value || '');
    return input.startsWith('/') || input.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(input);
  }

  function discoverSchedulableScripts() {
    if (!file || typeof file.listDir !== 'function' || typeof file.stat !== 'function' || !productPaths.scriptRoot) return [];
    const root = file.path(productPaths.scriptRoot);
    const found = [];
    function visit(relative, depth) {
      if (depth > 4 || found.length >= MAX_SCRIPT_CHOICES) return;
      const directory = relative ? file.join(root, relative) : root;
      let names;
      try { names = file.listDir(directory); } catch (_) { return; }
      names.sort((a, b) => String(a).localeCompare(String(b)));
      for (const name of names) {
        if (found.length >= MAX_SCRIPT_CHOICES) break;
        if (!name || String(name).startsWith('.')) continue;
        const childRelative = relative ? `${relative}/${name}` : String(name);
        const path = file.join(root, childRelative);
        let info = null;
        try { info = file.stat(path); } catch (_) {}
        if (!info) continue;
        if (info.type === 'file' && /\.js$/i.test(String(name))) found.push(childRelative.replace(/\\/g, '/'));
        else if (info.type === 'directory') visit(childRelative, depth + 1);
      }
    }
    visit('', 0);
    return Array.from(new Set(found)).sort((a, b) => a.localeCompare(b));
  }

  function validateScriptPathInput(value) {
    const input = String(value || '').trim();
    if (!input) return {ok: false, message: '请选择或填写 .js 脚本路径。'};
    if (/^flow:/i.test(input) || /\.(?:odflow|odpkg)$/i.test(input)) {
      return {ok: false, message: '已安装 Flow / .odpkg 不能通过内部文件路径绕过受控执行链；当前计划中心只调度普通 .js。'};
    }
    if (!/\.js$/i.test(input)) return {ok: false, message: '当前 Scheduler 只支持 .js 脚本。'};
    if (!file || typeof file.stat !== 'function' || !productPaths.scriptRoot) return {ok: true};
    const path = isAbsolutePath(input) ? file.path(input) : file.join(productPaths.scriptRoot, input);
    try {
      const info = file.stat(path);
      if (!info || info.type !== 'file') return {ok: false, message: `脚本文件不存在或不是普通文件：${input}`};
    } catch (error) {
      return {ok: false, message: `无法检查脚本文件：${errorSummary(error)}`};
    }
    return {ok: true};
  }

  function rowHTML(index) {
    return [
      `<p id="name${index}" class="name is-hidden"></p>`,
      `<p id="schedule${index}" class="schedule is-hidden"></p>`,
      `<p id="next${index}" class="next is-hidden"></p>`,
      `<p id="last${index}" class="last is-hidden"></p>`,
      `<p id="enabled${index}" class="enabled is-hidden"></p>`,
      `<button id="run${index}" class="row-button icon-button is-hidden" data-icon="play.fill" title="手动立即运行（不计入自动调度验证）" aria-label="手动立即运行（不计入自动调度验证）">手动立即运行</button>`,
      `<button id="toggle${index}" class="row-button icon-button is-hidden" data-icon="pause.fill" title="暂停计划" aria-label="暂停计划">暂停计划</button>`,
      `<button id="history${index}" class="row-button icon-button is-hidden" data-icon="list.bullet" title="查看运行历史" aria-label="查看运行历史">查看运行历史</button>`,
      `<button id="delete${index}" class="row-button icon-button danger is-hidden" data-icon="trash.fill" title="删除计划" aria-label="删除计划">删除计划</button>`,
    ].join('');
  }

  function buildHTML(scriptChoices) {
    const rows = [];
    for (let index = 0; index < MAX_ROWS; index++) rows.push(rowHTML(index));
    const options = ['<option value="">手动填写路径…</option>']
      .concat(scriptChoices.map(path => `<option value="${escapeHTML(path)}">${escapeHTML(path)}</option>`)).join('');
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header>
        <p id="runtimeState" class="runtime-context" role="status" aria-live="polite">正在连接计划服务…</p>
        <div class="header-actions">
          <button id="addTestBatch" class="test-button primary" title="创建两条真实的一次性计划；不会立即运行">添加两条测试计划</button>
          <button id="removeTestBatch" class="test-button" title="只按本轮保存的 jobId 清理">清理本轮测试</button>
          <button id="openCreate" class="icon-button create-entry primary" data-icon="plus" title="创建计划" aria-label="创建计划">创建计划</button>
          <button id="refresh" class="icon-button" data-icon="arrow.clockwise" title="刷新计划列表" aria-label="刷新计划列表">刷新计划列表</button>
        </div>
      </header>
      <p id="status" class="status">正在加载计划…</p>
      <section id="createCard" class="create-card is-hidden" hidden>
        <div class="create-heading"><div><strong>创建计划</strong><span>选择现有脚本、填写路径，或直接保存脚本文本。</span></div><button id="closeCreate" class="icon-button" data-icon="xmark" title="收起表单" aria-label="收起表单">收起表单</button></div>
        <div class="create-layout">
          <div class="form-panel">
            <div class="group-title"><span class="group-index">1</span><div><strong>执行内容</strong><span>Flow / .odpkg 不通过文件路径调度；当前只支持普通 .js。</span></div></div>
            <div class="target-grid">
              <label for="createName"><span class="field-label">计划名称 *</span><input id="createName" class="scheduler-field scheduler-input" data-opendesk-dialog-focus placeholder="例如：每日数据整理"></label>
              <label for="createSource"><span class="field-label">脚本来源 *</span><span class="select-shell"><select id="createSource" class="scheduler-field scheduler-select"><option value="file">脚本文件</option><option value="inline">脚本文本</option></select><span class="select-chevron"></span></span></label>
              <div id="fileSourceGroup" class="source-group">
                <label for="createScriptChoice"><span class="field-label">已有可调度脚本</span><span class="select-shell"><select id="createScriptChoice" class="scheduler-field scheduler-select">${options}</select><span class="select-chevron"></span></span></label>
                <div class="path-row"><label for="createScript"><span class="field-label">脚本路径 *</span><input id="createScript" class="scheduler-field scheduler-input" placeholder="相对脚本目录，例如：daily/report.js"></label><button id="browseScript" class="browse-button" type="button">浏览已有文件</button></div>
                <span id="scriptHint" class="inline-help">最终创建与实际执行前均由 Scheduler 重新校验文件。</span>
              </div>
              <div id="inlineSourceGroup" class="source-group is-hidden"><label for="createInlineScript"><span class="field-label">JavaScript 脚本文本 *</span></label><textarea id="createInlineScript" class="scheduler-field scheduler-textarea" maxlength="262144" spellcheck="false" placeholder="const notice = await ui.toast({message: '计划已运行'}); await notice.waitUntilClosed();"></textarea><span class="inline-help">最多 256 KiB；列表和 API 不回传正文。</span></div>
            </div>
          </div>
          <div class="form-panel">
            <div class="group-title"><span class="group-index">2</span><div><strong>执行规则</strong><span>真实时间由 Scheduler 保存和领取，不由界面倒计时触发。</span></div></div>
            <div class="schedule-grid">
              <label for="createType"><span class="field-label">调度类型 *</span><span class="select-shell"><select id="createType" class="scheduler-field scheduler-select"><option value="every">间隔执行</option><option value="cron">Cron 表达式</option><option value="at">单次执行</option></select><span class="select-chevron"></span></span></label>
              <label for="createExpression"><span class="field-label">执行表达式 *</span><input id="createExpression" class="scheduler-field scheduler-input" value="1h" placeholder="30m / 0 9 * * * / RFC3339"></label>
              <label for="createTimezone"><span class="field-label">时区</span><input id="createTimezone" class="scheduler-field scheduler-input" value="Local" placeholder="Local 或 Asia/Tokyo"></label>
              <label for="createMisfire"><span class="field-label">错过执行</span><span class="select-shell"><select id="createMisfire" class="scheduler-field scheduler-select"><option value="run_once">补跑一次</option><option value="skip">跳过错过执行</option></select><span class="select-chevron"></span></span></label>
            </div>
          </div>
        </div>
        <div class="form-actions"><span id="scheduleHint" class="schedule-hint">间隔示例：10m、1h、24h</span><button id="createJob" class="create-button primary">创建计划</button></div>
      </section>
      <section class="list-card">
        <div class="section-title"><strong>计划列表</strong><span id="jobCount">0 个计划</span></div>
        <div id="emptyState" class="empty">暂无计划。可创建普通计划，或添加两条真实测试计划。</div>
        <div class="grid">
          <p id="headName" class="head is-hidden">名称</p><p id="headSchedule" class="head is-hidden">计划</p><p id="headNext" class="head is-hidden">下次运行</p><p id="headLast" class="head is-hidden">最近运行</p><p id="headEnabled" class="head is-hidden">状态</p>
          <p id="headRun" class="head is-hidden">手动</p><p id="headToggle" class="head is-hidden">启停</p><p id="headHistory" class="head is-hidden">记录</p><p id="headDelete" class="head is-hidden"></p>
          ${rows.join('')}
        </div>
      </section>
    </main></body></html>`;
  }

  const CSS = `
    :root{color-scheme:dark;--bg:#171717;--surface:#1d1d1d;--field:#222933;--hover:#293440;--line:#465365;--text:#f4f6fa;--muted:#a6b0bf;--accent:#8ea7ff;--accent2:#3474d6;--danger:#ffb1b1}html,body{margin:0;background:var(--bg);color:var(--text);font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:11px;overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;gap:14px}.header-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.runtime-context{min-width:0;margin:0;color:#999;font-size:12px}.status{margin:0;padding:8px 10px;border:1px solid #393939;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px}button,.scheduler-field{font:inherit}button{border:1px solid #505050;border-radius:7px;background:#303030;color:var(--text);padding:7px 11px}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3c3c3c;border-color:#666}button:focus-visible,.scheduler-field:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button:disabled{opacity:.42}.primary{background:#245fbe;border-color:var(--accent2)}.primary:hover:not(:disabled){background:#2c6dcc}.test-button{height:32px;padding:0 11px;font-size:12px}.icon-button{width:32px;height:32px;min-width:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px}.icon-button[data-icon="arrow.clockwise"]::before{content:"↻"}.icon-button[data-icon="plus"]::before{content:"+"}.icon-button[data-icon="play.fill"]::before{content:"▶"}.icon-button[data-icon="pause.fill"]::before{content:"Ⅱ"}.icon-button[data-icon="power"]::before{content:"⏻"}.icon-button[data-icon="list.bullet"]::before{content:"☷"}.icon-button[data-icon="trash.fill"]::before{content:"⌫"}.icon-button[data-icon="checkmark"]::before{content:"✓"}.icon-button[data-icon="xmark"]::before{content:"×"}.danger{color:var(--danger)}.create-card,.list-card{border:1px solid #343434;border-radius:10px;background:var(--surface);padding:14px}.create-card.is-create-mode{border-color:var(--accent2)}.create-heading,.section-title{display:flex;align-items:center;justify-content:space-between;gap:14px}.create-heading{margin-bottom:11px}.create-heading>div{display:flex;flex-direction:column;gap:3px}.create-heading>div>span,.section-title span{font-size:12px;color:#999}.create-layout{display:grid;grid-template-columns:minmax(380px,1fr) minmax(460px,1.1fr);gap:12px}.form-panel{padding:11px;border:1px solid #35404e;border-radius:9px;background:#1b2129}.group-title{display:flex;gap:9px;align-items:flex-start;margin-bottom:9px}.group-index{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;background:rgba(52,116,214,.2);color:#b9c9ff;font-weight:700}.group-title>div{display:flex;flex-direction:column;gap:2px}.group-title strong{font-size:12px}.group-title span{font-size:11px;color:#8490a0}.target-grid,.schedule-grid{display:grid;gap:9px}.target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.schedule-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.source-group{grid-column:1/-1;display:grid;gap:8px}.source-group label,.target-grid>label,.schedule-grid label{display:flex;flex-direction:column;gap:5px;min-width:0;color:var(--muted);font-size:11px}.path-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.path-row label{min-width:0}.browse-button{height:36px;white-space:nowrap}.field-label{font-weight:600}.scheduler-field{width:100%;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--text)}.scheduler-input{padding:0 11px}.scheduler-textarea{height:92px;resize:vertical;padding:8px 10px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.scheduler-field:focus{border-color:var(--accent)}.select-shell{position:relative;display:block}.scheduler-select{appearance:none;-webkit-appearance:none;padding:0 34px 0 11px}.select-chevron{position:absolute;right:13px;top:50%;width:7px;height:7px;border-right:1.5px solid var(--accent);border-bottom:1.5px solid var(--accent);transform:translateY(-70%) rotate(45deg);pointer-events:none}.inline-help{font-size:11px;color:#8491a2}.form-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid #313943}.schedule-hint{font-size:11px;color:#9aa6b5}.create-button{height:36px;min-width:118px;font-weight:650}.list-card{flex:1;min-height:0;display:flex;flex-direction:column}.section-title{margin-bottom:8px}.grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(145px,1.05fr) minmax(190px,1.35fr) minmax(170px,1.15fr) minmax(155px,1.05fr) 92px repeat(4,38px);gap:0 7px;align-content:start;align-items:center}.head{margin:0;padding:0 0 7px;color:#888;font-size:11px;border-bottom:1px solid #383838}.name,.schedule,.next,.last,.enabled{margin:0;min-height:46px;display:flex;align-items:center;border-bottom:1px solid #303030;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name{font-weight:650}.schedule,.next,.last,.enabled{font-size:11px;color:#bbb}.enabled{font-weight:650}.state-active{color:#8dd6ad}.state-paused{color:#d0b27b}.state-ended{color:#aeb9c8}.row-button{margin:6px 0}.empty{margin:auto;max-width:440px;text-align:center;color:#9299a3;line-height:1.6;padding:50px 20px}.is-hidden{display:none!important}@media(max-width:980px){.create-layout{grid-template-columns:1fr}.grid{grid-template-columns:minmax(150px,1.2fr) minmax(180px,1.35fr) 88px repeat(4,36px)}.next,.last,#headNext,#headLast{display:none!important}}@media(max-width:720px){main{height:auto;min-height:100vh;overflow:auto}.target-grid,.schedule-grid{grid-template-columns:1fr}.path-row{grid-template-columns:1fr}.header-actions{justify-content:flex-end}.schedule,#headSchedule{display:none!important}.grid{grid-template-columns:minmax(130px,1fr) 84px repeat(4,34px)}}`;

  function createCenter(options) {
    const settings = options || {};
    const scheduler = settings.scheduler || defaultScheduler;
    const runtimeUI = settings.ui || defaultUI;
    const logger = settings.logger || defaultLogger;
    if (!scheduler || typeof scheduler.listJobs !== 'function') throw new Error('OpenDesk Scheduler client is unavailable');
    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') throw new Error('OpenDesk Scheduler Center requires ui.createWindow()');

    let windowRecord = null;
    let creatingPromise = null;
    let openingPromise = null;
    let windowGeneration = 0;
    let historySequence = 0;
    let browseSequence = 0;
    let jobs = [];
    let runtimeState = null;
    let loading = false;
    let lastError = '';
    let notice = '';
    let mode = 'list';
    let createSourceType = 'file';
    let createScheduleType = 'every';
    let armedDeleteID = '';
    let updates = Promise.resolve();
    let testActionRunning = false;
    let pendingTestRequestID = '';

    function logStage(action, stage, error, fields) {
      let line = `[SCHEDULER_CENTER] action=${String(action || 'scheduler.open')} stage=${stage}`;
      if (fields) for (const key of Object.keys(fields)) line += ` ${key}=${JSON.stringify(fields[key])}`;
      if (error) {
        const details = errorDetails(error);
        line += ` message=${JSON.stringify(details.message)} stack=${JSON.stringify(details.stack)}`;
      }
      const method = error ? 'error' : 'log';
      if (logger && typeof logger[method] === 'function') logger[method](line);
    }

    function expectedLifecycleCancellation(error) {
      return !!(error && (error.code === 'UI_CANCELED' || error.code === 'CANCELED'));
    }

    function classes(base, visible) { return visible ? [base] : [base, 'is-hidden']; }

    function statusText() {
      if (loading) return '正在刷新计划…';
      if (lastError) return `计划服务暂不可用：${lastError}`;
      if (notice) return notice;
      if (jobs.length > MAX_ROWS) return `共 ${jobs.length} 个计划；当前显示前 ${MAX_ROWS} 个。`;
      return jobs.length ? `已加载 ${jobs.length} 个计划。列表状态来自 Scheduler 真实记录。` : '暂无计划。';
    }

    function runtimeText() {
      if (!runtimeState) return lastError ? '计划服务连接失败' : '计划服务状态未知';
      const owner = runtimeState.runnerState === 'active' ? '本机负责执行计划' : '当前 App Scheduler 非活动 owner';
      return `${owner} · 脚本目录：${runtimeState.scriptRoot || productPaths.scriptRoot || '未知'}`;
    }

    function queueUpdate(task) {
      const queued = updates.catch(() => {}).then(task);
      updates = queued;
      return queued;
    }

    async function updateControl(record, id, patch) {
      if (!record || record !== windowRecord || record.disposed) return;
      const key = JSON.stringify(patch || {});
      if (record.renderCache[id] === key) return;
      await record.handle.control(id).update(patch);
      record.renderCache[id] = key;
    }

    function render() {
      const record = windowRecord;
      return queueUpdate(async () => {
        if (!record || record !== windowRecord || record.disposed) return;
        const count = Math.min(jobs.length, MAX_ROWS);
        const hasRows = count > 0;
        const createVisible = mode === 'create';
        const formDisabled = loading || !createVisible;
        await updateControl(record, 'runtimeState', {text: runtimeText()});
        await updateControl(record, 'status', {text: statusText()});
        await updateControl(record, 'jobCount', {text: `${jobs.length} 个计划`});
        await updateControl(record, 'emptyState', {visible: !hasRows, classes: classes('empty', !hasRows)});
        await updateControl(record, 'addTestBatch', {disabled: loading || testActionRunning, text: '添加两条测试计划'});
        await updateControl(record, 'removeTestBatch', {disabled: loading || testActionRunning, text: '清理本轮测试'});
        await updateControl(record, 'openCreate', {visible: !createVisible, disabled: loading || testActionRunning, icon: BUTTON_ICONS.create, text: '创建计划', classes: createVisible ? ['icon-button','create-entry','primary','is-hidden'] : ['icon-button','create-entry','primary']});
        await updateControl(record, 'refresh', {disabled: loading || testActionRunning, icon: BUTTON_ICONS.refresh, text: '刷新计划列表'});
        await updateControl(record, 'closeCreate', {visible: createVisible, disabled: loading, icon: BUTTON_ICONS.close, text: '收起表单', classes: createVisible ? ['icon-button'] : ['icon-button','is-hidden']});
        await updateControl(record, 'createCard', {visible: createVisible, classes: createVisible ? ['create-card','is-create-mode'] : ['create-card','is-hidden']});
        for (const id of ['createJob','createName','createExpression','createTimezone','createSource','createType','createMisfire','createScriptChoice','browseScript','createScript','createInlineScript']) {
          const sourceMismatch = (id === 'createScriptChoice' || id === 'browseScript' || id === 'createScript') && createSourceType !== 'file';
          const inlineMismatch = id === 'createInlineScript' && createSourceType !== 'inline';
          await updateControl(record, id, {disabled: formDisabled || sourceMismatch || inlineMismatch});
        }
        await updateControl(record, 'fileSourceGroup', {visible: createSourceType === 'file', classes: classes('source-group', createSourceType === 'file')});
        await updateControl(record, 'inlineSourceGroup', {visible: createSourceType === 'inline', classes: classes('source-group', createSourceType === 'inline')});
        for (const id of ['headName','headSchedule','headNext','headLast','headEnabled','headRun','headToggle','headHistory','headDelete']) await updateControl(record, id, {visible: hasRows, classes: classes('head', hasRows)});
        for (let index = 0; index < MAX_ROWS; index++) {
          const job = jobs[index] || null;
          const visible = !!job;
          const ended = !!job && job.scheduleType === 'at' && !job.enabled && terminalRun(job.lastRun);
          await updateControl(record, `name${index}`, {visible, text: job ? job.name : '', classes: classes('name', visible)});
          await updateControl(record, `schedule${index}`, {visible, text: job ? scheduleLabel(job) : '', classes: classes('schedule', visible)});
          await updateControl(record, `next${index}`, {visible, text: job ? nextLabel(job) : '', classes: classes('next', visible)});
          await updateControl(record, `last${index}`, {visible, text: job ? runLabel(job.lastRun) : '', classes: classes('last', visible)});
          await updateControl(record, `enabled${index}`, {visible, text: job ? stateLabel(job) : '', classes: visible ? ['enabled', ended ? 'state-ended' : job.enabled ? 'state-active' : 'state-paused'] : ['enabled','is-hidden']});
          await updateControl(record, `run${index}`, {visible, disabled: loading || !job || !runtimeState || runtimeState.runnerState !== 'active', icon: BUTTON_ICONS.run, text: '手动立即运行（不计入自动调度验证）', classes: visible ? ['row-button','icon-button'] : ['row-button','icon-button','is-hidden']});
          await updateControl(record, `toggle${index}`, {visible, disabled: loading || !job || ended, icon: job && job.enabled ? BUTTON_ICONS.pause : BUTTON_ICONS.resume, text: job && job.enabled ? '暂停计划' : ended ? '单次计划已结束' : '恢复计划', classes: visible ? ['row-button','icon-button'] : ['row-button','icon-button','is-hidden']});
          await updateControl(record, `history${index}`, {visible, disabled: loading || !job, icon: BUTTON_ICONS.history, text: '查看运行历史', classes: visible ? ['row-button','icon-button'] : ['row-button','icon-button','is-hidden']});
          const confirmingDelete = !!job && armedDeleteID === job.id;
          await updateControl(record, `delete${index}`, {visible, disabled: loading || !job, icon: confirmingDelete ? BUTTON_ICONS.confirm : BUTTON_ICONS.delete, text: confirmingDelete ? '确认删除' : '删除计划', classes: visible ? ['row-button','icon-button','danger'] : ['row-button','icon-button','danger','is-hidden']});
        }
      });
    }

    function disposeRecord(record) {
      if (!record || record.disposed) return;
      record.disposed = true;
      for (const unsubscribe of record.unsubscribers.splice(0)) { try { unsubscribe(); } catch (_) {} }
    }

    function clearWindow(record) {
      if (!record) return;
      disposeRecord(record);
      if (windowRecord === record) windowRecord = null;
    }

    function bindDetached(record, target, event, action, callback) {
      const unsubscribe = target.on(event, () => {
        void Promise.resolve().then(callback).catch(async error => {
          lastError = errorSummary(error); notice = '';
          logStage(action, 'ui-action', error);
          try { await render(); } catch (renderError) { logStage(action, 'render', renderError); }
        });
      });
      if (typeof unsubscribe === 'function') record.unsubscribers.push(unsubscribe);
    }

    async function fetchBackend() {
      const values = await Promise.all([scheduler.status(), scheduler.listJobs()]);
      runtimeState = values[0] || null;
      jobs = Array.isArray(values[1]) ? values[1] : [];
      return true;
    }

    async function loadBackend(action, message) {
      loading = true; lastError = ''; notice = message || '';
      await render();
      try {
        await fetchBackend();
        armedDeleteID = '';
        loading = false;
        await render();
        logStage(action, 'ready', null, {jobs: jobs.length, runnerState: runtimeState && runtimeState.runnerState || 'unknown'});
        return true;
      } catch (error) {
        loading = false; lastError = errorSummary(error); notice = '';
        logStage(action, 'refresh', error);
        await render();
        return false;
      }
    }

    async function quietRefresh(record) {
      if (!record || record !== windowRecord || record.disposed || loading || testActionRunning) {
        if (record === windowRecord && !record.disposed) await render();
        return;
      }
      try {
        await fetchBackend();
        lastError = '';
        await render();
      } catch (error) {
        logStage('scheduler.poll', 'refresh', error);
        await render();
      }
    }

    function startPolling(record) {
      const task = (async () => {
        while (record === windowRecord && !record.disposed) {
          await system.delay(1000);
          if (record !== windowRecord || record.disposed) break;
          await quietRefresh(record);
        }
      })();
      record.pollTask = task;
      void task.catch(error => { if (!expectedLifecycleCancellation(error)) logStage('scheduler.poll', 'loop', error); });
    }

    async function readValue(id, trim) {
      if (!windowRecord) throw new Error('计划中心窗口不可用');
      const state = await windowRecord.handle.control(id).getState();
      const value = String(state && state.value != null ? state.value : '');
      return trim === false ? value : value.trim();
    }

    async function createJob() {
      if (loading) return null;
      const sourceType = createSourceType;
      const input = {
        name: await readValue('createName'), sourceType, scheduleType: createScheduleType,
        scheduleExpression: await readValue('createExpression'), timezone: (await readValue('createTimezone')) || 'Local',
        misfirePolicy: (await readValue('createMisfire')) || 'run_once',
      };
      if (sourceType === 'inline') input.inlineScript = await readValue('createInlineScript', false);
      else input.scriptPath = await readValue('createScript');
      const missing = [];
      if (!input.name) missing.push('计划名称');
      if (!input.scheduleExpression) missing.push('执行表达式');
      if (sourceType === 'inline' ? !input.inlineScript.trim() : !input.scriptPath) missing.push(sourceType === 'inline' ? '脚本文本' : '脚本路径');
      if (missing.length) { lastError = `请填写：${missing.join('、')}`; notice = ''; await render(); return null; }
      if (sourceType === 'file') {
        const validation = validateScriptPathInput(input.scriptPath);
        if (!validation.ok) { lastError = validation.message; notice = ''; await render(); return null; }
      }
      loading = true; lastError = ''; notice = ''; await render();
      try {
        const created = await scheduler.createJob(Object.assign({taskType: 'script'}, input));
        loading = false; mode = 'list';
        await updateControl(windowRecord, 'createName', {value: ''});
        await loadBackend('scheduler.create', `已创建真实计划：${created.name}`);
        return created;
      } catch (error) {
        loading = false; lastError = errorSummary(error); logStage('scheduler.create', 'backend', error); await render(); return null;
      }
    }

    function decodeCLIResult(result, operation) {
      const stdout = result && typeof result.stdout === 'string' ? result.stdout.trim() : '';
      const stderr = result && typeof result.stderr === 'string' ? result.stderr.trim() : '';
      let envelope = null;
      for (const candidate of [stdout, stderr]) {
        if (!candidate) continue;
        try { envelope = JSON.parse(candidate); break; } catch (_) {}
      }
      if (!envelope) throw new Error(`${operation} 未返回有效 JSON`);
      if (envelope.ok !== true) {
        const error = new Error(envelope.error && envelope.error.message ? String(envelope.error.message) : `${operation} 失败`);
        error.code = envelope.error && envelope.error.code ? String(envelope.error.code) : 'SCHEDULER_CLI_FAILED';
        throw error;
      }
      return envelope.result;
    }

    async function runSchedulerCLI(args, operation) {
      if (!command || typeof command.run !== 'function' || !system || typeof system.getExecutablePath !== 'function') throw new Error('当前 Runtime 不支持 Scheduler CLI bridge');
      const result = await command.run(system.getExecutablePath(), ['scheduler'].concat(args), {
        cwd: execution && execution.workdir ? execution.workdir : productPaths.appDataRoot,
        timeout: 30000,
        maxOutputBytes: MAX_COMMAND_OUTPUT,
        hideWindow: true,
      });
      return decodeCLIResult(result, operation);
    }

    async function addTestBatch() {
      if (testActionRunning || loading) return null;
      testActionRunning = true; lastError = '';
      if (!pendingTestRequestID) pendingTestRequestID = `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      notice = '正在检查当前 App Scheduler、准备测试文件并提交两条未来计划…';
      await render();
      try {
        const batch = await runSchedulerCLI(['test','add','--request-id',pendingTestRequestID], '添加两条测试计划');
        const jobsCreated = Array.isArray(batch && batch.jobs) ? batch.jobs.filter(item => item && item.jobId).length : 0;
        if (jobsCreated === 2 && batch.status !== 'partial') pendingTestRequestID = '';
        notice = jobsCreated === 2
          ? `测试批次 ${batch.batchId} 已提交：文本 ${formatTime(batch.jobs[0].expectedScheduledAt)}；文件 ${formatTime(batch.jobs[1].expectedScheduledAt)}。无需点击“立即运行”。`
          : `测试批次 ${batch && batch.batchId || '未知'} 部分创建（${jobsCreated}/2）；可直接“清理本轮测试”。${batch && batch.lastError ? ' ' + batch.lastError : ''}`;
        await fetchBackend();
        return batch;
      } catch (error) {
        lastError = errorSummary(error); notice = ''; logStage('scheduler.test.add', 'cli', error); return null;
      } finally {
        testActionRunning = false; await render();
      }
    }

    async function removeTestBatch() {
      if (testActionRunning || loading) return null;
      testActionRunning = true; lastError = ''; notice = '正在按本轮保存的 jobId 清理；不会按名称删除用户任务。'; await render();
      try {
        const result = await runSchedulerCLI(['test','remove','--batch','latest'], '清理本轮测试');
        pendingTestRequestID = '';
        const running = Array.isArray(result.runningAtRemovalJobIds) ? result.runningAtRemovalJobIds.length : 0;
        notice = running
          ? `已移除本轮未来排期；有 ${running} 个 Execution 在清理时已经运行，未被误报为停止。`
          : `已清理测试批次 ${result.batchId}；只处理该批次保存的 jobId。`;
        await fetchBackend();
        return result;
      } catch (error) {
        lastError = errorSummary(error); notice = ''; logStage('scheduler.test.remove', 'cli', error); return null;
      } finally {
        testActionRunning = false; await render();
      }
    }

    async function openScriptBrowser() {
      const choices = discoverSchedulableScripts();
      if (!choices.length) { lastError = '脚本目录中没有可浏览的普通 .js。可继续手动填写路径或使用脚本文本。'; notice = ''; await render(); return null; }
      const options = choices.map(path => `<option value="${escapeHTML(path)}">${escapeHTML(path)}</option>`).join('');
      const browser = await runtimeUI.createWindow({
        id: `schedulerScriptBrowser${++browseSequence}`, kind: 'normal', title: '选择可调度脚本',
        position: {mode: 'anchor', size: {width: 620, height: 440}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
        theme: 'dark', alwaysOnTop: false, draggable: true,
        content: {
          html: `<!doctype html><html><head><meta charset="utf-8"></head><body><main><strong>脚本目录中的 .js</strong><p>选择后会回填相对路径；取消不会改变已有输入。</p><select id="choice" size="14">${options}</select><div><button id="choose">使用所选脚本</button><button id="cancel">取消</button></div></main></body></html>`,
          css: 'html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:10px}strong{font-size:18px}p{margin:0;color:#999}select{flex:1;min-height:0;background:#222933;color:#fff;border:1px solid #465365;border-radius:8px;padding:6px}div{display:flex;gap:8px}button{border:1px solid #555;border-radius:7px;background:#303030;color:#fff;padding:8px 12px}',
        },
      });
      browser.control('choose').on('click', () => { void (async () => {
        const state = await browser.control('choice').getState();
        const value = String(state && state.value || '').trim();
        if (value && windowRecord && !windowRecord.disposed) {
          const validation = validateScriptPathInput(value);
          if (validation.ok) {
            await updateControl(windowRecord, 'createScript', {value});
            await updateControl(windowRecord, 'createScriptChoice', {value});
            lastError = ''; notice = `已选择脚本：${value}`; await render();
          }
        }
        await browser.close();
      })().catch(error => logStage('scheduler.browse-script', 'choose', error)); });
      browser.control('cancel').on('click', () => { void Promise.resolve(browser.close()).catch(() => {}); });
      void Promise.resolve(browser.waitUntilClosed()).catch(error => { if (!expectedLifecycleCancellation(error)) logStage('scheduler.browse-script', 'lifecycle', error); });
      await browser.show();
      return browser;
    }

    async function mutate(index, action, operation, successText) {
      const job = jobs[index];
      if (!job || loading) return null;
      loading = true; lastError = ''; notice = ''; await render();
      try {
        const result = await operation(job); loading = false;
        await loadBackend(action, typeof successText === 'function' ? successText(job, result) : successText || '计划已更新。');
        return result;
      } catch (error) {
        loading = false; lastError = errorSummary(error); logStage(action, 'backend', error); await render(); return null;
      }
    }

    async function openHistory(job) {
      const runs = await scheduler.listRuns(job.id, 20);
      const rows = (Array.isArray(runs) ? runs : []).map(run => [
        '<div class="history-row">',
        `<span>${escapeHTML(statusLabel(run.status))}</span>`,
        `<span>${escapeHTML(formatTime(run.scheduledAt))}</span>`,
        `<span>${escapeHTML(formatTime(run.startedAt))}</span>`,
        `<span>${escapeHTML(latencyLabel(run))}</span>`,
        `<span>${escapeHTML(triggerLabel(run.triggerType))}</span>`,
        `<span>${escapeHTML(run.executionId || '—')}</span>`,
        `<span>${escapeHTML(run.error || statusLabel(run.status))}</span>`,
        '</div>',
      ].join('')).join('');
      const history = await runtimeUI.createWindow({
        id: `schedulerHistory${++historySequence}`, kind: 'normal', title: `计划历史 · ${job.name}`,
        position: {mode: 'anchor', size: {width: 1120, height: 440}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
        theme: 'dark', alwaysOnTop: false, draggable: true,
        content: {
          html: `<!doctype html><html><head><meta charset="utf-8"></head><body><main><strong>${escapeHTML(job.name)}</strong><div class="history-grid"><div class="history-head"><span>结果</span><span>计划时间</span><span>实际开始</span><span>启动延迟</span><span>触发方式</span><span>Execution ID</span><span>详情</span></div>${rows || '<p class="history-empty">暂无运行记录</p>'}</div><button id="close">关闭</button></main></body></html>`,
          css: 'html,body{margin:0;background:#171717;color:#f4f4f4;font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:12px}main>strong{font-size:18px}.history-grid{flex:1;min-height:0;overflow:auto;border:1px solid #333;border-radius:8px}.history-head,.history-row{display:grid;grid-template-columns:.7fr 1.2fr 1.2fr .8fr .75fr 1.35fr 1.5fr;gap:8px;padding:9px 10px;border-bottom:1px solid #333}.history-head{color:#999;background:#202020;font-size:11px}.history-row span{min-width:0;overflow-wrap:anywhere}.history-empty{padding:20px;color:#999}button{align-self:flex-start;border:1px solid #555;border-radius:7px;background:#303030;color:#fff;padding:7px 12px}',
        },
      });
      history.control('close').on('click', () => { void Promise.resolve(history.close()).catch(() => {}); });
      void Promise.resolve(history.waitUntilClosed()).catch(error => { if (!expectedLifecycleCancellation(error)) logStage('scheduler.history', 'lifecycle', error); });
      await history.show();
      return history;
    }

    function bindWindow(record) {
      const win = record.handle;
      bindDetached(record, win.control('addTestBatch'), 'click', 'scheduler.test.add', addTestBatch);
      bindDetached(record, win.control('removeTestBatch'), 'click', 'scheduler.test.remove', removeTestBatch);
      bindDetached(record, win.control('openCreate'), 'click', 'scheduler.show-create', async () => { mode = 'create'; armedDeleteID = ''; lastError = ''; notice = '创建表单已展开。'; await render(); });
      bindDetached(record, win.control('refresh'), 'click', 'scheduler.refresh', () => loadBackend('scheduler.refresh', '计划列表已刷新。'));
      bindDetached(record, win.control('closeCreate'), 'click', 'scheduler.hide-create', async () => { mode = 'list'; armedDeleteID = ''; lastError = ''; notice = '创建表单已收起；已填写内容保留。'; await render(); });
      bindDetached(record, win.control('createJob'), 'click', 'scheduler.create', createJob);
      bindDetached(record, win.control('browseScript'), 'click', 'scheduler.browse-script', openScriptBrowser);
      bindDetached(record, win.control('createScriptChoice'), 'change', 'scheduler.script-choice', async () => {
        const state = await win.control('createScriptChoice').getState();
        const value = String(state && state.value || '').trim();
        if (value) {
          const validation = validateScriptPathInput(value);
          if (!validation.ok) { lastError = validation.message; notice = ''; }
          else { await updateControl(record, 'createScript', {value}); lastError = ''; notice = `已选择脚本：${value}`; }
          await render();
        }
      });
      bindDetached(record, win.control('createSource'), 'change', 'scheduler.create-source', async () => {
        const state = await win.control('createSource').getState();
        createSourceType = String(state && state.value || 'file') === 'inline' ? 'inline' : 'file';
        lastError = ''; notice = createSourceType === 'inline' ? '将保存脚本文本；列表不会回传正文。' : '可从下拉选择，也可手动填写或浏览 .js。'; await render();
      });
      bindDetached(record, win.control('createType'), 'change', 'scheduler.create-type', async () => {
        const state = await win.control('createType').getState();
        const value = String(state && state.value || 'every');
        createScheduleType = value === 'cron' || value === 'at' ? value : 'every';
        await updateControl(record, 'scheduleHint', {text: scheduleHelp(createScheduleType)});
      });
      for (let index = 0; index < MAX_ROWS; index++) {
        bindDetached(record, win.control(`run${index}`), 'click', 'scheduler.run', () => mutate(index, 'scheduler.run', job => scheduler.runNow(job.id), job => `已提交手动立即运行：${job.name}。该运行不会计入自动调度测试通过。`));
        bindDetached(record, win.control(`toggle${index}`), 'click', 'scheduler.toggle', () => mutate(index, 'scheduler.toggle', job => job.enabled ? scheduler.pause(job.id) : scheduler.resume(job.id), job => `${job.name} 已${job.enabled ? '暂停' : '恢复'}。`));
        bindDetached(record, win.control(`history${index}`), 'click', 'scheduler.history', async () => { const job = jobs[index]; if (job) await openHistory(job); });
        bindDetached(record, win.control(`delete${index}`), 'click', 'scheduler.delete', async () => {
          const job = jobs[index]; if (!job || loading) return;
          if (armedDeleteID !== job.id) { armedDeleteID = job.id; notice = `再次点击确认删除：${job.name}`; await render(); return; }
          armedDeleteID = '';
          await mutate(index, 'scheduler.delete', current => scheduler.delete(current.id), current => `已删除计划：${current.name}`);
        });
      }
      const unsubscribe = win.on('close', () => clearWindow(record));
      if (typeof unsubscribe === 'function') record.unsubscribers.push(unsubscribe);
    }

    function ensureWindow(action) {
      if (windowRecord && !windowRecord.disposed) return Promise.resolve(windowRecord);
      if (creatingPromise) return creatingPromise;
      const generation = ++windowGeneration;
      const task = (async () => {
        const choices = discoverSchedulableScripts();
        let handle;
        try {
          handle = await runtimeUI.createWindow({
            id: `schedulerCenter${generation}`, kind: 'normal', title: 'OpenDesk · 计划中心',
            position: {mode: 'anchor', size: {width: 1220, height: 760}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
            theme: 'dark', alwaysOnTop: false, draggable: true, content: {html: buildHTML(choices), css: CSS},
          });
        } catch (error) { logStage(action, 'create-window', error); throw error; }
        const record = {handle, generation, unsubscribers: [], disposed: false, renderCache: Object.create(null), pollTask: null};
        windowRecord = record;
        try {
          bindWindow(record);
          void Promise.resolve(handle.waitUntilClosed()).catch(error => { if (!expectedLifecycleCancellation(error)) logStage(action, 'window-lifecycle', error); }).finally(() => clearWindow(record));
          startPolling(record);
          return record;
        } catch (error) {
          clearWindow(record); try { await handle.close(); } catch (_) {} logStage(action, 'bind-window', error); throw error;
        }
      })();
      creatingPromise = task;
      void task.finally(() => { if (creatingPromise === task) creatingPromise = null; }).catch(() => {});
      return task;
    }

    async function performOpen(action, source, requestedMode) {
      const record = await ensureWindow(action);
      await record.handle.show();
      mode = requestedMode;
      notice = requestedMode === 'create' ? '填写新计划后点击“创建计划”。' : source ? `计划中心已打开 · ${source}` : '';
      await loadBackend(action, notice);
      return state();
    }

    async function openAction(action, source, requestedMode) {
      if (openingPromise) {
        const result = await openingPromise;
        if (requestedMode === 'create' && windowRecord) { mode = 'create'; await windowRecord.handle.show(); await render(); }
        return result;
      }
      const task = performOpen(action, source, requestedMode);
      openingPromise = task;
      try { return await task; } finally { if (openingPromise === task) openingPromise = null; }
    }

    function open(source) { return openAction('scheduler.open', source || 'scheduler.open', 'list'); }
    function openCreate(source) { return openAction('scheduler.new', source || 'scheduler.new', 'create'); }
    function refresh(message) { return !windowRecord || loading ? Promise.resolve(state()) : loadBackend('scheduler.refresh', message || '计划列表已刷新。').then(() => state()); }
    function state() {
      return Object.freeze({open: !!windowRecord, loading, count: jobs.length, runnerState: runtimeState ? runtimeState.runnerState : '', lastError, mode, windowGeneration, creating: !!creatingPromise, testActionRunning});
    }

    return Object.freeze({open, openCreate, refresh, state});
  }

  global.OpenDeskSchedulerCenter = Object.freeze({create: createCenter});
})(globalThis);
