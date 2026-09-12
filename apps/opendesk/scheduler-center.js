(function installOpenDeskSchedulerCenter(global) {
  'use strict';

  const defaultScheduler = global.OpenDeskSchedulerClient;
  const defaultUI = global.ui;
  const defaultLogger = global.console;
  const MAX_ROWS = 48;
  const BUTTON_ICONS = Object.freeze({
    refresh: 'arrow.clockwise',
    create: 'plus',
    run: 'play.fill',
    pause: 'pause.fill',
    resume: 'power',
    history: 'list.bullet',
    delete: 'trash.fill',
    confirm: 'checkmark',
    close: 'xmark',
  });

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function scheduleLabel(job) {
    if (!job) return '';
    const type = job.scheduleType === 'at' ? '单次' : job.scheduleType === 'cron' ? 'Cron' : '间隔';
    return `${type} · ${job.scheduleExpression || '—'} · ${job.timezone || 'Local'}`;
  }

  function runLabel(run) {
    if (!run) return '尚未运行';
    const status = {
      queued: '排队中', running: '运行中', succeeded: '成功', failed: '失败',
      canceled: '已取消', skipped: '已跳过',
    }[run.status] || run.status || '未知';
    return `${status} · ${formatTime(run.finishedAt || run.startedAt || run.scheduledAt)}`;
  }

  function scheduleHelp(scheduleType) {
    if (scheduleType === 'cron') return 'Cron 示例：0 9 * * *（每天 09:00）';
    if (scheduleType === 'at') return '单次示例：2026-09-12T18:30:00+08:00';
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

  function rowHTML(index) {
    return [
      `<p id="name${index}" class="name is-hidden"></p>`,
      `<p id="schedule${index}" class="schedule is-hidden"></p>`,
      `<p id="next${index}" class="next is-hidden"></p>`,
      `<p id="last${index}" class="last is-hidden"></p>`,
      `<p id="enabled${index}" class="enabled is-hidden"></p>`,
      `<button id="run${index}" class="row-button icon-button is-hidden" data-icon="play.fill" title="立即运行" aria-label="立即运行">立即运行</button>`,
      `<button id="toggle${index}" class="row-button icon-button is-hidden" data-icon="pause.fill" title="暂停计划" aria-label="暂停计划">暂停计划</button>`,
      `<button id="history${index}" class="row-button icon-button is-hidden" data-icon="list.bullet" title="查看运行历史" aria-label="查看运行历史">查看运行历史</button>`,
      `<button id="delete${index}" class="row-button icon-button danger is-hidden" data-icon="trash.fill" title="删除计划" aria-label="删除计划">删除计划</button>`,
    ].join('');
  }

  function buildHTML() {
    const rows = [];
    for (let index = 0; index < MAX_ROWS; index++) rows.push(rowHTML(index));
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong>计划中心</strong><p id="runtimeState" class="subtle">正在连接计划服务…</p></div><button id="refresh" class="icon-button" data-icon="arrow.clockwise" title="刷新计划" aria-label="刷新计划">刷新计划</button></header>
      <p id="status" class="status">正在加载计划…</p>
      <section id="createCard" class="create-card">
        <div class="section-title"><strong>新建计划</strong><span>调度 OpenDesk 自动化目录中的 JavaScript。</span></div>
        <div class="form-grid">
          <label for="createName"><span class="field-label">名称</span><input id="createName" class="scheduler-field scheduler-input" data-opendesk-dialog-focus placeholder="例如：每日数据整理"></label>
          <label for="createScript"><span class="field-label">脚本</span><input id="createScript" class="scheduler-field scheduler-input" placeholder="例如：daily-report.js"></label>
          <label for="createType"><span class="field-label">类型</span><span class="select-shell"><select id="createType" class="scheduler-field scheduler-select" aria-describedby="createTypeHint"><option value="every">间隔执行</option><option value="cron">Cron 表达式</option><option value="at">单次执行</option></select><span class="select-chevron" aria-hidden="true"></span></span><span id="createTypeHint" class="sr-only">选择间隔、Cron 或单次调度类型。</span></label>
          <label for="createExpression"><span class="field-label">表达式</span><input id="createExpression" class="scheduler-field scheduler-input" value="1h" placeholder="30m / 0 9 * * * / RFC3339" aria-describedby="scheduleHint"></label>
          <label for="createTimezone"><span class="field-label">时区</span><input id="createTimezone" class="scheduler-field scheduler-input" value="Local" placeholder="Local 或 Asia/Shanghai"></label>
          <label for="createMisfire"><span class="field-label">错过执行</span><span class="select-shell"><select id="createMisfire" class="scheduler-field scheduler-select" aria-describedby="createMisfireHint"><option value="run_once">补跑一次</option><option value="skip">跳过错过执行</option></select><span class="select-chevron" aria-hidden="true"></span></span><span id="createMisfireHint" class="sr-only">选择错过计划时间后补跑一次，或跳过该次执行。</span></label>
        </div>
        <div class="form-actions"><button id="createJob" class="icon-button primary" data-icon="plus" title="创建计划" aria-label="创建计划">创建计划</button><span id="scheduleHint" role="status" aria-live="polite">间隔示例：10m、1h、24h</span></div>
      </section>
      <section class="list-card">
        <div class="section-title"><strong>计划列表</strong><span id="jobCount">0 个计划</span></div>
        <div id="emptyState" class="empty">暂无计划。填写上方信息即可创建第一个计划。</div>
        <div class="grid">
          <p id="headName" class="head is-hidden">名称</p><p id="headSchedule" class="head is-hidden">计划</p><p id="headNext" class="head is-hidden">下次运行</p><p id="headLast" class="head is-hidden">最近运行</p><p id="headEnabled" class="head is-hidden">状态</p>
          <p id="headRun" class="head is-hidden">运行</p><p id="headToggle" class="head is-hidden">启停</p><p id="headHistory" class="head is-hidden">记录</p><p id="headDelete" class="head is-hidden"></p>
          ${rows.join('')}
        </div>
      </section>
    </main></body></html>`;
  }

  const CSS = `
    :root{color-scheme:dark;--ui-bg:#171717;--ui-surface:#1d1d1d;--ui-surface-raised:#202832;--ui-field:#222933;--ui-field-hover:#293440;--ui-line:#465365;--ui-line-strong:#617187;--ui-text:#f4f6fa;--ui-muted:#a6b0bf;--ui-accent:#8ea7ff;--ui-danger:#ffb1b1}
    html,body{margin:0;padding:0;background:var(--ui-bg);color:var(--ui-text);font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}
    main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:12px;overflow:hidden}header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}header strong{font-size:22px}.subtle{margin:5px 0 0;color:#999;font-size:12px}
    button,.scheduler-field{font:inherit}button{border:1px solid #505050;border-radius:7px;background:#303030;color:var(--ui-text);padding:7px 11px}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3c3c3c}button:focus-visible,.scheduler-field:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}button:disabled{opacity:.4}.icon-button{box-sizing:border-box;width:32px;height:32px;min-width:32px;min-height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px;line-height:1}.icon-button[data-icon="arrow.clockwise"]::before{content:"↻"}.icon-button[data-icon="plus"]::before{content:"+"}.icon-button[data-icon="play.fill"]::before{content:"▶"}.icon-button[data-icon="pause.fill"]::before{content:"Ⅱ"}.icon-button[data-icon="power"]::before{content:"⏻"}.icon-button[data-icon="list.bullet"]::before{content:"☷"}.icon-button[data-icon="trash.fill"]::before{content:"🗑︎";font-size:15px}.icon-button[data-icon="checkmark"]::before{content:"✓"}.icon-button[data-icon="xmark"]::before{content:"×"}.primary{background:#245fbe;border-color:#3474d6}.danger{color:var(--ui-danger)}.status{margin:0;padding:9px 10px;border:1px solid #393939;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px}
    .create-card,.list-card{border:1px solid #343434;border-radius:10px;background:var(--ui-surface);padding:14px}.create-card.is-create-mode{border-color:#3474d6;box-shadow:0 0 0 1px rgba(52,116,214,.25)}.section-title{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px}.section-title span{font-size:12px;color:#999}.form-grid{display:grid;grid-template-columns:minmax(145px,1.1fr) minmax(175px,1.3fr) minmax(135px,.9fr) minmax(180px,1.35fr) minmax(145px,1fr) minmax(145px,1fr);gap:9px}.form-grid label{min-width:0;font-size:11px;color:var(--ui-muted);display:flex;flex-direction:column;gap:5px}.field-label{font-weight:600;letter-spacing:.01em}.scheduler-field{width:100%;min-width:0;height:38px;border:1px solid var(--ui-line);border-radius:8px;background:var(--ui-field);color:var(--ui-text);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,opacity .14s ease}.scheduler-input{padding:0 11px}.scheduler-input::placeholder{color:#778495}.scheduler-field:hover:not(:disabled){background:var(--ui-field-hover);border-color:var(--ui-line-strong)}.scheduler-field:focus{border-color:var(--ui-accent);box-shadow:0 0 0 3px rgba(142,167,255,.14)}.scheduler-field:disabled{cursor:not-allowed;opacity:.54;color:var(--ui-muted)}.select-shell{position:relative;display:block;width:100%;min-width:0}.scheduler-select{appearance:none;-webkit-appearance:none;cursor:pointer;padding:0 38px 0 11px}.scheduler-select option{background:var(--ui-surface-raised);color:var(--ui-text)}.select-chevron{position:absolute;right:14px;top:50%;width:8px;height:8px;border-right:1.5px solid var(--ui-accent);border-bottom:1.5px solid var(--ui-accent);pointer-events:none;transform:translateY(-68%) rotate(45deg);transition:border-color .14s ease,opacity .14s ease}.scheduler-select:hover:not(:disabled)+.select-chevron,.scheduler-select:focus+.select-chevron{border-color:#cbd6ff}.scheduler-select:disabled+.select-chevron{opacity:.38}.form-actions{display:flex;align-items:center;gap:10px;margin-top:10px}.form-actions span{color:#9aa6b5;font-size:11px}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    .list-card{flex:1;min-height:0;display:flex;flex-direction:column}.grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(145px,1.1fr) minmax(165px,1.3fr) minmax(125px,1fr) minmax(125px,1fr) 70px repeat(4,40px);gap:0 8px;align-content:start;align-items:center}.head{margin:0;padding:0 0 7px;color:#888;font-size:11px;border-bottom:1px solid #383838}.name,.schedule,.next,.last,.enabled{margin:0;min-height:48px;display:flex;align-items:center;border-bottom:1px solid #303030;overflow:hidden;text-overflow:ellipsis}.name{font-weight:650}.schedule,.next,.last,.enabled{font-size:12px;color:#bbb}.enabled{font-weight:600}.row-button{margin:7px 0}.empty{margin:auto;text-align:center;color:#999;padding:50px 20px}.is-hidden{display:none!important}
  `;

  function createCenter(options) {
    const settings = options || {};
    const scheduler = settings.scheduler || defaultScheduler;
    const runtimeUI = settings.ui || defaultUI;
    const logger = settings.logger || defaultLogger;

    if (!scheduler || typeof scheduler.listJobs !== 'function') {
      throw new Error('OpenDesk Scheduler client is unavailable');
    }
    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') {
      throw new Error('OpenDesk Scheduler Center requires ui.createWindow()');
    }

    let windowRecord = null;
    let windowTask = null;
    let creatingPromise = null;
    let openingPromise = null;
    let windowGeneration = 0;
    let historySequence = 0;
    let jobs = [];
    let runtimeState = null;
    let loading = false;
    let lastError = '';
    let notice = '';
    let mode = 'list';
    let armedDeleteID = '';
    let updates = Promise.resolve();

    function logStage(action, stage, error, fields) {
      const id = String(action || 'scheduler.open');
      let line = `[SCHEDULER_CENTER] action=${id} stage=${stage}`;
      if (fields && typeof fields === 'object') {
        for (const key of Object.keys(fields)) line += ` ${key}=${JSON.stringify(fields[key])}`;
      }
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

    function classes(base, visible) {
      return visible ? [base] : [base, 'is-hidden'];
    }

    function statusText() {
      if (loading) return '正在刷新计划…';
      if (lastError) return `计划服务暂不可用：${lastError}`;
      if (notice) return notice;
      if (jobs.length > MAX_ROWS) return `共 ${jobs.length} 个计划；当前窗口显示前 ${MAX_ROWS} 个。`;
      return jobs.length ? `已加载 ${jobs.length} 个计划。` : '暂无计划。';
    }

    function runtimeText() {
      if (!runtimeState) return lastError ? '计划服务连接失败' : '计划服务状态未知';
      const owner = runtimeState.runnerState === 'active'
        ? 'Active · 当前 OpenDesk 负责执行计划'
        : 'Standby · 执行权由其他 OpenDesk Runtime 持有';
      return `${owner} · 脚本目录：${runtimeState.scriptRoot || '未知'}`;
    }

    function queueUpdate(task) {
      const queued = updates.catch(() => {}).then(task);
      updates = queued;
      return queued;
    }

    async function updateControl(record, id, patch) {
      if (!record || record !== windowRecord || record.disposed) return;
      await record.handle.control(id).update(patch);
    }

    function render() {
      const record = windowRecord;
      return queueUpdate(async () => {
        if (!record || record !== windowRecord || record.disposed) return;
        const count = Math.min(jobs.length, MAX_ROWS);
        const hasRows = count > 0;
        await updateControl(record, 'runtimeState', {text: runtimeText()});
        await updateControl(record, 'status', {text: statusText()});
        await updateControl(record, 'jobCount', {text: `${jobs.length} 个计划`});
        await updateControl(record, 'emptyState', {visible: !hasRows, classes: classes('empty', !hasRows)});
        await updateControl(record, 'refresh', {disabled: loading, icon: BUTTON_ICONS.refresh, text: lastError ? '重试' : '刷新计划'});
        await updateControl(record, 'createJob', {disabled: loading, icon: BUTTON_ICONS.create, text: '创建计划'});
        await updateControl(record, 'createType', {disabled: loading, classes: loading ? ['scheduler-field','scheduler-select','is-disabled'] : ['scheduler-field','scheduler-select']});
        await updateControl(record, 'createMisfire', {disabled: loading, classes: loading ? ['scheduler-field','scheduler-select','is-disabled'] : ['scheduler-field','scheduler-select']});
        await updateControl(record, 'createCard', {classes: mode === 'create' ? ['create-card', 'is-create-mode'] : ['create-card']});
        for (const id of ['headName','headSchedule','headNext','headLast','headEnabled','headRun','headToggle','headHistory','headDelete']) {
          await updateControl(record, id, {visible: hasRows, classes: classes('head', hasRows)});
        }
        for (let index = 0; index < MAX_ROWS; index++) {
          const job = jobs[index] || null;
          const visible = !!job;
          await updateControl(record, `name${index}`, {visible, text: job ? job.name : '', classes: classes('name', visible)});
          await updateControl(record, `schedule${index}`, {visible, text: job ? scheduleLabel(job) : '', classes: classes('schedule', visible)});
          await updateControl(record, `next${index}`, {visible, text: job ? formatTime(job.nextRunAt) : '', classes: classes('next', visible)});
          await updateControl(record, `last${index}`, {visible, text: job ? runLabel(job.lastRun) : '', classes: classes('last', visible)});
          await updateControl(record, `enabled${index}`, {visible, text: job ? (job.enabled ? '已启用' : '已暂停') : '', classes: classes('enabled', visible)});
          await updateControl(record, `run${index}`, {visible, disabled: loading || !job || !runtimeState || runtimeState.runnerState !== 'active', icon: BUTTON_ICONS.run, text: '立即运行', classes: visible ? ['row-button','icon-button'] : ['row-button','icon-button','is-hidden']});
          await updateControl(record, `toggle${index}`, {visible, disabled: loading || !job, icon: job && job.enabled ? BUTTON_ICONS.pause : BUTTON_ICONS.resume, text: job && job.enabled ? '暂停计划' : '恢复计划', classes: visible ? ['row-button','icon-button'] : ['row-button','icon-button','is-hidden']});
          await updateControl(record, `history${index}`, {visible, disabled: loading || !job, icon: BUTTON_ICONS.history, text: '查看运行历史', classes: visible ? ['row-button','icon-button'] : ['row-button','icon-button','is-hidden']});
          const confirmingDelete = !!job && armedDeleteID === job.id;
          await updateControl(record, `delete${index}`, {visible, disabled: loading || !job, icon: confirmingDelete ? BUTTON_ICONS.confirm : BUTTON_ICONS.delete, text: confirmingDelete ? '确认删除' : '删除计划', classes: visible ? ['row-button','icon-button','danger'] : ['row-button','icon-button','danger','is-hidden']});
        }
      });
    }

    function disposeRecord(record) {
      if (!record || record.disposed) return;
      record.disposed = true;
      for (const unsubscribe of record.unsubscribers.splice(0)) {
        try { unsubscribe(); } catch (_) {}
      }
    }

    function clearWindow(record) {
      if (!record) return;
      disposeRecord(record);
      if (windowRecord === record) windowRecord = null;
      if (windowTask === record.lifecycle) windowTask = null;
    }

    function observeWindowLifecycle(record, action) {
      const lifecycle = Promise.resolve()
        .then(() => record.handle.waitUntilClosed())
        .catch(error => {
          if (!expectedLifecycleCancellation(error)) logStage(action, 'window-lifecycle', error);
        })
        .finally(() => clearWindow(record));
      record.lifecycle = lifecycle;
      windowTask = lifecycle;
    }

    function bindDetached(record, target, event, action, callback) {
      const unsubscribe = target.on(event, () => {
        void Promise.resolve()
          .then(callback)
          .catch(async error => {
            lastError = errorSummary(error);
            notice = '';
            logStage(action, 'ui-action', error);
            try { await render(); } catch (renderError) { logStage(action, 'render', renderError); }
          });
      });
      if (typeof unsubscribe === 'function') record.unsubscribers.push(unsubscribe);
    }

    async function loadBackend(action, message) {
      loading = true;
      lastError = '';
      notice = message || '';
      try {
        await render();
      } catch (error) {
        logStage(action, 'render', error);
        throw error;
      }
      logStage(action, 'refreshing');
      try {
        const values = await Promise.all([scheduler.status(), scheduler.listJobs()]);
        runtimeState = values[0] || null;
        jobs = Array.isArray(values[1]) ? values[1] : [];
        armedDeleteID = '';
        loading = false;
        await render();
        logStage(action, 'ready', null, {jobs: jobs.length, runnerState: runtimeState && runtimeState.runnerState || 'unknown'});
        return true;
      } catch (error) {
        loading = false;
        lastError = errorSummary(error);
        notice = '';
        logStage(action, 'refresh', error);
        try {
          await render();
        } catch (renderError) {
          logStage(action, 'render', renderError);
          throw renderError;
        }
        return false;
      }
    }

    async function readValue(id) {
      if (!windowRecord) throw new Error('计划中心窗口不可用');
      const state = await windowRecord.handle.control(id).getState();
      return String(state && state.value != null ? state.value : '').trim();
    }

    async function createJob() {
      if (loading) return null;
      const input = {
        name: await readValue('createName'),
        scriptPath: await readValue('createScript'),
        scheduleType: await readValue('createType'),
        scheduleExpression: await readValue('createExpression'),
        timezone: (await readValue('createTimezone')) || 'Local',
        misfirePolicy: (await readValue('createMisfire')) || 'run_once',
      };
      if (!input.name || !input.scriptPath || !input.scheduleType || !input.scheduleExpression) {
        lastError = '名称、脚本、类型和表达式不能为空';
        notice = '';
        await render();
        return null;
      }
      loading = true;
      lastError = '';
      notice = '';
      await render();
      try {
        const created = await scheduler.createJob(Object.assign({taskType: 'script', sourceType: 'file'}, input));
        loading = false;
        mode = 'list';
        await loadBackend('scheduler.create', `已创建计划：${created.name}`);
        return created;
      } catch (error) {
        loading = false;
        lastError = errorSummary(error);
        logStage('scheduler.create', 'backend', error);
        await render();
        return null;
      }
    }

    async function mutate(index, action, operation, successText) {
      const job = jobs[index];
      if (!job || loading) return null;
      loading = true;
      lastError = '';
      notice = '';
      await render();
      try {
        const result = await operation(job);
        loading = false;
        await loadBackend(action, typeof successText === 'function' ? successText(job, result) : successText || '计划已更新。');
        return result;
      } catch (error) {
        loading = false;
        lastError = errorSummary(error);
        logStage(action, 'backend', error);
        await render();
        return null;
      }
    }

    async function openHistory(job) {
      const runs = await scheduler.listRuns(job.id, 20);
      const rows = (Array.isArray(runs) ? runs : []).map(run => [
        '<div class="history-row">',
        `<span>${escapeHTML(run.status)}</span>`,
        `<span>${escapeHTML(formatTime(run.scheduledAt))}</span>`,
        `<span>${escapeHTML(formatTime(run.finishedAt || run.startedAt))}</span>`,
        `<span>${escapeHTML(run.error || '')}</span>`,
        '</div>',
      ].join('')).join('');
      const history = await runtimeUI.createWindow({
        id: `schedulerHistory${++historySequence}`, kind: 'normal', title: `计划历史 · ${job.name}`,
        position: {mode: 'anchor', size: {width: 760, height: 420}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
        theme: 'dark', alwaysOnTop: true, draggable: true,
        content: {
          html: `<!doctype html><html><head><meta charset="utf-8"></head><body><main><strong>${escapeHTML(job.name)}</strong><div class="history-grid"><div class="history-head"><span>状态</span><span>计划时间</span><span>完成时间</span><span>错误</span></div>${rows || '<p class="history-empty">暂无运行记录</p>'}</div><button id="close" class="icon-button" data-icon="xmark" title="关闭" aria-label="关闭">关闭</button></main></body></html>`,
          css: 'html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:12px;overflow:hidden}main>strong{font-size:20px}.history-grid{flex:1;min-height:0;overflow:auto;border:1px solid #333;border-radius:8px}.history-head,.history-row{display:grid;grid-template-columns:.7fr 1.2fr 1.2fr 1.6fr;gap:10px;padding:9px 10px;border-bottom:1px solid #333}.history-head{color:#999;background:#202020;font-size:11px}.history-row span{min-width:0;overflow-wrap:anywhere}.history-empty{margin:0;padding:20px;color:#999}button{align-self:flex-start;border:1px solid #555;border-radius:7px;background:#303030;color:#fff}.icon-button{box-sizing:border-box;width:32px;height:32px;min-width:32px;min-height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px;line-height:1}.icon-button[data-icon="xmark"]::before{content:"×"}',
        },
      });
      await history.control('close').update({icon: BUTTON_ICONS.close, text: '关闭'});
      history.control('close').on('click', () => {
        void Promise.resolve(history.close()).catch(error => logStage('scheduler.history', 'close', error));
      });
      void Promise.resolve(history.waitUntilClosed()).catch(error => {
        if (!expectedLifecycleCancellation(error)) logStage('scheduler.history', 'window-lifecycle', error);
      });
      await history.show();
      return history;
    }

    function bindWindow(record) {
      const win = record.handle;
      bindDetached(record, win.control('refresh'), 'click', 'scheduler.refresh', () => loadBackend('scheduler.refresh', '计划列表已刷新。'));
      bindDetached(record, win.control('createJob'), 'click', 'scheduler.create', createJob);
      bindDetached(record, win.control('createType'), 'change', 'scheduler.create-type', async () => {
        const state = await win.control('createType').getState();
        await updateControl(record, 'scheduleHint', {text: scheduleHelp(String(state && state.value || 'every'))});
      });
      for (let index = 0; index < MAX_ROWS; index++) {
        bindDetached(record, win.control(`run${index}`), 'click', 'scheduler.run', () => mutate(index, 'scheduler.run', job => scheduler.runNow(job.id), job => `已提交立即运行：${job.name}`));
        bindDetached(record, win.control(`toggle${index}`), 'click', 'scheduler.toggle', () => mutate(index, 'scheduler.toggle', job => job.enabled ? scheduler.pause(job.id) : scheduler.resume(job.id), job => `${job.name} 已${job.enabled ? '暂停' : '恢复'}。`));
        bindDetached(record, win.control(`history${index}`), 'click', 'scheduler.history', async () => {
          const job = jobs[index];
          if (job) await openHistory(job);
        });
        bindDetached(record, win.control(`delete${index}`), 'click', 'scheduler.delete', async () => {
          const job = jobs[index];
          if (!job || loading) return;
          if (armedDeleteID !== job.id) {
            armedDeleteID = job.id;
            notice = `再次点击“确认”删除计划：${job.name}`;
            await render();
            return;
          }
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
        let handle;
        try {
          handle = await runtimeUI.createWindow({
            id: `schedulerCenter${generation}`,
            kind: 'normal',
            title: 'OpenDesk · 计划中心',
            position: {mode: 'anchor', size: {width: 1180, height: 720}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
            theme: 'dark',
            alwaysOnTop: false,
            draggable: true,
            content: {html: buildHTML(), css: CSS},
          });
        } catch (error) {
          logStage(action, 'create-window', error);
          throw error;
        }
        const record = {handle, generation, lifecycle: null, unsubscribers: [], disposed: false};
        windowRecord = record;
        try {
          bindWindow(record);
          observeWindowLifecycle(record, action);
          return record;
        } catch (error) {
          clearWindow(record);
          try { await handle.close(); } catch (_) {}
          logStage(action, 'bind-window', error);
          throw error;
        }
      })();
      creatingPromise = task;
      void task.finally(() => {
        if (creatingPromise === task) creatingPromise = null;
      }).catch(() => {});
      return task;
    }

    async function showWindow(record, action) {
      try {
        await record.handle.show();
      } catch (error) {
        clearWindow(record);
        logStage(action, 'show', error);
        throw error;
      }
      logStage(action, 'window-visible', null, {generation: record.generation});
    }

    async function performOpen(action, source, requestedMode) {
      logStage(action, 'opening-window', null, {source: source || action});
      const existing = windowRecord;
      let record = await ensureWindow(action);
      try {
        await showWindow(record, action);
      } catch (error) {
        if (!existing || existing !== record) throw error;
        record = await ensureWindow(action);
        await showWindow(record, action);
      }
      mode = requestedMode;
      notice = requestedMode === 'create'
        ? '填写“新建计划”后点击“创建计划”。'
        : source ? `计划中心已打开 · ${source}` : '';
      await loadBackend(action, notice);
      return state();
    }

    async function openAction(action, source, requestedMode) {
      logStage(action, 'received', null, {source: source || action});
      if (openingPromise) {
        const result = await openingPromise;
        if (requestedMode === 'create' && windowRecord) {
          mode = 'create';
          notice = '填写“新建计划”后点击“创建计划”。';
          await windowRecord.handle.show();
          await render();
        }
        return result;
      }
      const task = performOpen(action, source, requestedMode);
      openingPromise = task;
      try {
        return await task;
      } finally {
        if (openingPromise === task) openingPromise = null;
      }
    }

    function open(source) {
      return openAction('scheduler.open', source || 'scheduler.open', 'list');
    }

    function openCreate(source) {
      return openAction('scheduler.new', source || 'scheduler.new', 'create');
    }

    function refresh(message) {
      if (!windowRecord || loading) return Promise.resolve(state());
      return loadBackend('scheduler.refresh', message || '计划列表已刷新。').then(() => state());
    }

    function state() {
      return Object.freeze({
        open: !!windowRecord,
        loading,
        count: jobs.length,
        runnerState: runtimeState ? runtimeState.runnerState : '',
        lastError,
        mode,
        windowGeneration,
        creating: !!creatingPromise,
        lifecycleActive: !!windowTask,
      });
    }

    return Object.freeze({open, openCreate, refresh, state});
  }

  global.OpenDeskSchedulerCenter = Object.freeze({create: createCenter});
})(globalThis);
