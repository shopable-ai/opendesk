(function installOpenDeskSchedulerCenter(global) {
  'use strict';

  const defaultScheduler = global.OpenDeskSchedulerClient;
  const defaultUI = global.ui;
  const defaultLogger = global.console;
  const MAX_ROWS = 48;
  const INLINE_TOAST_EXAMPLE = `'use strict';
const firedAt = new Date().toISOString();
console.log('[SCHEDULER_NOTIFY] stage=start firedAt=' + firedAt);
const notice = await ui.toast({
  message: '计划已运行 · ' + firedAt,
  caption: '这条提示由计划中心的脚本文本任务创建',
  level: 'success',
  timeoutMs: 2500,
  closable: true,
});
await notice.waitUntilClosed();
console.log('[SCHEDULER_NOTIFY] stage=complete firedAt=' + firedAt);
return {ok: true, firedAt};`;
  const BUTTON_ICONS = Object.freeze({
    refresh: 'arrow.clockwise',
    create: 'plus',
    fileExample: 'doc.fill',
    inlineExample: 'doc.text.fill',
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
    const source = job.sourceType === 'inline' ? '脚本文本' : '脚本文件';
    return `${source} · ${type} · ${job.scheduleExpression || '—'} · ${job.timezone || 'Local'}`;
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
      <header><p id="runtimeState" class="runtime-context" role="status" aria-live="polite">正在连接计划服务…</p><div class="header-actions"><button id="openCreate" class="icon-button create-entry primary" data-icon="plus" title="创建计划，展开表单" aria-label="创建计划，展开表单">创建计划，展开表单</button><button id="refresh" class="icon-button" data-icon="arrow.clockwise" title="刷新计划列表" aria-label="刷新计划列表">刷新计划列表</button></div></header>
      <p id="status" class="status">正在加载计划…</p>
      <section id="createCard" class="create-card is-hidden" hidden>
        <div class="create-heading">
          <div><strong>创建计划</strong><span>设置要运行的脚本与执行时间。</span></div>
          <div class="create-meta"><span class="required-note"><span class="required-dot" aria-hidden="true"></span>名称、脚本来源、类型和表达式为必填</span><button id="closeCreate" class="icon-button" data-icon="xmark" title="取消创建并收起表单" aria-label="取消创建并收起表单">取消创建并收起表单</button></div>
        </div>
        <div class="create-layout">
          <div class="form-panel">
            <div class="group-title-row"><div class="group-title"><span class="group-index">1</span><div><strong>执行内容</strong><span>可选择脚本目录中的文件，或直接保存脚本文本。</span></div></div>
            <div class="example-actions" aria-label="通知测试模板">
              <button id="fillFileExample" class="icon-button example-button" data-icon="doc.fill" title="填入通知文件示例" aria-label="填入通知文件示例">填入通知文件示例</button>
              <button id="fillInlineExample" class="icon-button example-button" data-icon="doc.text.fill" title="填入 ui.toast 文本示例" aria-label="填入 ui.toast 文本示例">填入 ui.toast 文本示例</button>
            </div>
            </div>
            <div class="target-grid">
              <label for="createName"><span class="field-label">计划名称 <span class="required-mark" aria-hidden="true">*</span></span><input id="createName" class="scheduler-field scheduler-input" data-opendesk-dialog-focus placeholder="例如：每日数据整理" aria-required="true"></label>
              <label for="createSource"><span class="field-label">脚本来源 <span class="required-mark" aria-hidden="true">*</span></span><span class="select-shell"><select id="createSource" class="scheduler-field scheduler-select" aria-describedby="createSourceHint" aria-required="true"><option value="file">脚本文件</option><option value="inline">脚本文本</option></select><span class="select-chevron" aria-hidden="true"></span></span><span id="createSourceHint" class="sr-only">选择脚本目录中的 JavaScript 文件，或直接填写脚本文本。</span></label>
              <div id="fileSourceGroup" class="source-group"><label for="createScript"><span class="field-label">脚本路径 <span class="required-mark" aria-hidden="true">*</span></span><input id="createScript" class="scheduler-field scheduler-input" placeholder="例如：notify-and-log.js" aria-required="true"></label></div>
              <div id="inlineSourceGroup" class="source-group is-hidden"><label for="createInlineScript"><span class="field-label">JavaScript 脚本文本 <span class="required-mark" aria-hidden="true">*</span></span></label><textarea id="createInlineScript" class="scheduler-field scheduler-textarea" maxlength="262144" spellcheck="false" aria-required="true" placeholder="console.log('计划开始'); await ui.toast({message: '计划已运行', timeoutMs: 2500});"></textarea><span class="inline-help">最多 256 KiB；列表与接口不会回传脚本文本正文。</span></div>
            </div>
          </div>
          <div class="form-panel">
            <div class="group-title"><span class="group-index">2</span><div><strong>执行规则</strong><span>定义触发方式、时区与错过执行策略。</span></div></div>
            <div class="schedule-grid">
              <label for="createType"><span class="field-label">调度类型 <span class="required-mark" aria-hidden="true">*</span></span><span class="select-shell"><select id="createType" class="scheduler-field scheduler-select" aria-describedby="createTypeHint" aria-required="true"><option value="every">间隔执行</option><option value="cron">Cron 表达式</option><option value="at">单次执行</option></select><span class="select-chevron" aria-hidden="true"></span></span><span id="createTypeHint" class="sr-only">选择间隔、Cron 或单次调度类型。</span></label>
              <label for="createExpression"><span class="field-label">执行表达式 <span class="required-mark" aria-hidden="true">*</span></span><input id="createExpression" class="scheduler-field scheduler-input" value="1h" placeholder="30m / 0 9 * * * / RFC3339" aria-describedby="scheduleHint" aria-required="true"></label>
              <label for="createTimezone"><span class="field-label">时区</span><input id="createTimezone" class="scheduler-field scheduler-input" value="Local" placeholder="Local 或 Asia/Shanghai"></label>
              <label for="createMisfire"><span class="field-label">错过执行</span><span class="select-shell"><select id="createMisfire" class="scheduler-field scheduler-select" aria-describedby="createMisfireHint"><option value="run_once">补跑一次</option><option value="skip">跳过错过执行</option></select><span class="select-chevron" aria-hidden="true"></span></span><span id="createMisfireHint" class="sr-only">选择错过计划时间后补跑一次，或跳过该次执行。</span></label>
            </div>
          </div>
        </div>
        <div class="form-actions"><span id="scheduleHint" class="schedule-hint" role="status" aria-live="polite">间隔示例：10m、1h、24h</span><button id="createJob" class="create-button primary" data-icon="plus" title="创建计划" aria-label="创建计划">创建计划</button></div>
      </section>
      <section class="list-card">
        <div class="section-title"><strong>计划列表</strong><span id="jobCount">0 个计划</span></div>
        <div id="emptyState" class="empty">暂无计划。使用右上角“创建计划”按钮添加第一个计划。</div>
        <div class="grid">
          <p id="headName" class="head is-hidden">名称</p><p id="headSchedule" class="head is-hidden">计划</p><p id="headNext" class="head is-hidden">下次运行</p><p id="headLast" class="head is-hidden">最近运行</p><p id="headEnabled" class="head is-hidden">状态</p>
          <p id="headRun" class="head is-hidden">运行</p><p id="headToggle" class="head is-hidden">启停</p><p id="headHistory" class="head is-hidden">记录</p><p id="headDelete" class="head is-hidden"></p>
          ${rows.join('')}
        </div>
      </section>
    </main></body></html>`;
  }

  const CSS = `
    :root{color-scheme:dark;--ui-bg:#171717;--ui-surface:#1d1d1d;--ui-surface-raised:#202832;--ui-field:#222933;--ui-field-hover:#293440;--ui-line:#465365;--ui-line-strong:#617187;--ui-text:#f4f6fa;--ui-muted:#a6b0bf;--ui-accent:#8ea7ff;--ui-accent-strong:#3474d6;--ui-danger:#ffb1b1}
    html,body{margin:0;padding:0;background:var(--ui-bg);color:var(--ui-text);font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}
    main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:11px;overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;gap:16px}.header-actions{display:flex;align-items:center;gap:7px}.runtime-context{min-width:0;margin:0;color:#999;font-size:12px;line-height:1.4}
    button,.scheduler-field{font:inherit}button{border:1px solid #505050;border-radius:7px;background:#303030;color:var(--ui-text);padding:7px 11px;transition:background .14s ease,border-color .14s ease,opacity .14s ease,transform .14s ease}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3c3c3c;border-color:#666}button:active:not(:disabled){transform:translateY(1px)}button:focus-visible,.scheduler-field:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}button:disabled{opacity:.4}.icon-button{box-sizing:border-box;width:32px;height:32px;min-width:32px;min-height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px;line-height:1}.icon-button[data-icon="arrow.clockwise"]::before{content:"↻"}.icon-button[data-icon="plus"]::before{content:"+"}.icon-button[data-icon="doc.fill"]::before{content:"▤";font-size:15px}.icon-button[data-icon="doc.text.fill"]::before{content:"{ }";font-size:11px;font-weight:750}.icon-button[data-icon="play.fill"]::before{content:"▶"}.icon-button[data-icon="pause.fill"]::before{content:"Ⅱ"}.icon-button[data-icon="power"]::before{content:"⏻"}.icon-button[data-icon="list.bullet"]::before{content:"☷"}.icon-button[data-icon="trash.fill"]::before{content:"🗑︎";font-size:15px}.icon-button[data-icon="checkmark"]::before{content:"✓"}.icon-button[data-icon="xmark"]::before{content:"×"}.primary{background:#245fbe;border-color:var(--ui-accent-strong)}.primary:hover:not(:disabled){background:#2c6dcc;border-color:#6495e2}.create-entry{box-shadow:0 4px 14px rgba(36,95,190,.22)}.danger{color:var(--ui-danger)}.status{margin:0;padding:8px 10px;border:1px solid #393939;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px}
    .create-card,.list-card{border:1px solid #343434;border-radius:10px;background:var(--ui-surface);padding:14px}.create-card{padding:14px 16px 15px}.create-card.is-create-mode{border-color:var(--ui-accent-strong);box-shadow:0 0 0 1px rgba(52,116,214,.25)}.section-title{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:8px}.section-title span{font-size:12px;color:#999}.create-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:11px}.create-heading>div:first-child{display:flex;flex-direction:column;gap:4px}.create-heading strong{font-size:16px}.create-heading>div:first-child>span{color:var(--ui-muted);font-size:12px}.create-meta{display:flex;align-items:center;gap:12px}.required-note{display:inline-flex;align-items:center;gap:7px;color:#8995a5;font-size:11px}.required-dot{width:6px;height:6px;border-radius:50%;background:var(--ui-accent);box-shadow:0 0 0 3px rgba(142,167,255,.12)}.create-layout{display:grid;grid-template-columns:minmax(330px,.82fr) minmax(480px,1.18fr);gap:12px}.form-panel{min-width:0;padding:11px;border:1px solid #35404e;border-radius:9px;background:#1b2129}.group-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:9px}.group-title{display:flex;align-items:flex-start;gap:9px}.group-index{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;min-width:24px;border-radius:7px;background:rgba(52,116,214,.2);color:#b9c9ff;font-size:12px;font-weight:700}.group-title>div{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px}.group-title strong{font-size:12px}.group-title div span{color:#8490a0;font-size:11px;line-height:1.35}.example-actions{display:flex;flex:none;gap:6px}.example-button{border-color:#465872;background:#242d39;color:#c8d4ff}.example-button:hover:not(:disabled){background:#2d3a49;border-color:#647a99}.target-grid,.schedule-grid{display:grid;gap:9px}.target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.target-grid .source-group{grid-column:1/-1}.schedule-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:2px}.target-grid label,.schedule-grid label,.source-group{min-width:0;font-size:11px;color:var(--ui-muted)}.target-grid label,.schedule-grid label,.source-group label{display:flex;flex-direction:column;gap:5px}.inline-help{display:block;margin-top:5px;color:#8491a2}.field-label{font-weight:600;letter-spacing:.01em}.required-mark{color:var(--ui-accent);font-size:12px}.scheduler-field{width:100%;min-width:0;height:36px;border:1px solid var(--ui-line);border-radius:8px;background:var(--ui-field);color:var(--ui-text);box-shadow:inset 0 1px 0 rgba(255,255,255,.025);transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,opacity .14s ease}.scheduler-input{padding:0 11px}.scheduler-textarea{height:92px;resize:vertical;padding:8px 10px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:2}.scheduler-input::placeholder,.scheduler-textarea::placeholder{color:#778495}.scheduler-field:hover:not(:disabled){background:var(--ui-field-hover);border-color:var(--ui-line-strong)}.scheduler-field:focus{border-color:var(--ui-accent);box-shadow:0 0 0 3px rgba(142,167,255,.14)}.scheduler-field:disabled{cursor:not-allowed;opacity:.54;color:var(--ui-muted)}.select-shell{position:relative;display:block;width:100%;min-width:0}.scheduler-select{appearance:none;-webkit-appearance:none;cursor:pointer;padding:0 38px 0 11px}.scheduler-select option{background:var(--ui-surface-raised);color:var(--ui-text)}.select-chevron{position:absolute;right:14px;top:50%;width:8px;height:8px;border-right:1.5px solid var(--ui-accent);border-bottom:1.5px solid var(--ui-accent);pointer-events:none;transform:translateY(-68%) rotate(45deg);transition:border-color .14s ease,opacity .14s ease}.scheduler-select:hover:not(:disabled)+.select-chevron,.scheduler-select:focus+.select-chevron{border-color:#cbd6ff}.scheduler-select:disabled+.select-chevron{opacity:.38}.form-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:10px;padding-top:10px;border-top:1px solid #313943}.schedule-hint{position:relative;color:#9aa6b5;font-size:11px;padding-left:18px}.schedule-hint::before{content:"i";position:absolute;left:0;top:-1px;width:13px;height:13px;border:1px solid #65758a;border-radius:50%;color:#aebbd0;font:700 9px/13px sans-serif;text-align:center}.create-button{min-width:118px;height:36px;padding:0 16px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:650}.create-button::before{content:"+";font-size:18px;font-weight:400;line-height:1}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    .list-card{flex:1;min-height:0;display:flex;flex-direction:column}.grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(145px,1.1fr) minmax(165px,1.3fr) minmax(125px,1fr) minmax(125px,1fr) 68px repeat(4,38px);gap:0 7px;align-content:start;align-items:center}.head{margin:0;padding:0 0 7px;color:#888;font-size:11px;border-bottom:1px solid #383838}.name,.schedule,.next,.last,.enabled{margin:0;min-height:44px;display:flex;align-items:center;border-bottom:1px solid #303030;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name{font-weight:650}.schedule,.next,.last,.enabled{font-size:12px;color:#bbb}.enabled{font-size:11px;font-weight:650}.enabled.state-active{color:#8dd6ad}.enabled.state-paused{color:#d0b27b}.row-button{margin:6px 0}.empty{margin:auto;max-width:420px;text-align:center;color:#9299a3;line-height:1.6;padding:50px 20px}.is-hidden{display:none!important}
    @media(max-width:960px){.grid{grid-template-columns:minmax(140px,1.15fr) minmax(160px,1.35fr) 66px repeat(4,36px);gap:0 6px}.next,.last,#headNext,#headLast{display:none!important}}
    @media(max-width:920px){.create-layout{grid-template-columns:1fr}}
    @media(max-width:780px){main{height:auto;min-height:100vh;overflow:auto;padding:14px}.target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.list-card{min-height:360px}.create-heading{align-items:center}.required-note{max-width:240px;line-height:1.35}}
    @media(max-width:640px){.create-heading{align-items:flex-start}.create-meta{width:100%;justify-content:space-between}.target-grid,.schedule-grid{grid-template-columns:1fr}.form-actions{align-items:stretch;flex-direction:column}.create-button{width:100%}}
    @media(max-width:560px){.schedule,#headSchedule{display:none!important}.grid{grid-template-columns:minmax(128px,1fr) 62px repeat(4,34px);gap:0 5px}.subtle{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
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
    let createSourceType = 'file';
    let createScheduleType = 'every';
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
        ? '本机负责执行计划'
        : '由其他 OpenDesk Runtime 执行计划';
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
        const createVisible = mode === 'create';
        const formDisabled = loading || !createVisible;
        await updateControl(record, 'runtimeState', {text: runtimeText()});
        await updateControl(record, 'status', {text: statusText()});
        await updateControl(record, 'jobCount', {text: `${jobs.length} 个计划`});
        await updateControl(record, 'emptyState', {visible: !hasRows, classes: classes('empty', !hasRows)});
        await updateControl(record, 'openCreate', {visible: !createVisible, disabled: loading, icon: BUTTON_ICONS.create, text: '创建计划，展开表单', classes: createVisible ? ['icon-button','create-entry','primary','is-hidden'] : ['icon-button','create-entry','primary']});
        await updateControl(record, 'refresh', {disabled: loading, icon: BUTTON_ICONS.refresh, text: lastError ? '重试连接并刷新计划列表' : '刷新计划列表'});
        await updateControl(record, 'closeCreate', {visible: createVisible, disabled: loading, icon: BUTTON_ICONS.close, text: '取消创建并收起表单', classes: createVisible ? ['icon-button'] : ['icon-button','is-hidden']});
        await updateControl(record, 'createJob', {disabled: formDisabled, icon: BUTTON_ICONS.create, text: '创建计划'});
        await updateControl(record, 'createName', {disabled: formDisabled});
        await updateControl(record, 'createExpression', {disabled: formDisabled});
        await updateControl(record, 'createTimezone', {disabled: formDisabled});
        await updateControl(record, 'createSource', {disabled: formDisabled, classes: formDisabled ? ['scheduler-field','scheduler-select','is-disabled'] : ['scheduler-field','scheduler-select']});
        await updateControl(record, 'createType', {disabled: formDisabled, classes: formDisabled ? ['scheduler-field','scheduler-select','is-disabled'] : ['scheduler-field','scheduler-select']});
        await updateControl(record, 'createMisfire', {disabled: formDisabled, classes: formDisabled ? ['scheduler-field','scheduler-select','is-disabled'] : ['scheduler-field','scheduler-select']});
        await updateControl(record, 'fillFileExample', {disabled: formDisabled, icon: BUTTON_ICONS.fileExample, text: '填入通知文件示例'});
        await updateControl(record, 'fileSourceGroup', {visible: createSourceType === 'file', classes: classes('source-group', createSourceType === 'file')});
        await updateControl(record, 'inlineSourceGroup', {visible: createSourceType === 'inline', classes: classes('source-group', createSourceType === 'inline')});
        await updateControl(record, 'createScript', {disabled: formDisabled || createSourceType !== 'file'});
        await updateControl(record, 'createInlineScript', {disabled: formDisabled || createSourceType !== 'inline'});
        await updateControl(record, 'fillInlineExample', {disabled: formDisabled, icon: BUTTON_ICONS.inlineExample, text: '填入 ui.toast 文本示例'});
        await updateControl(record, 'createCard', {visible: createVisible, classes: createVisible ? ['create-card','is-create-mode'] : ['create-card','is-hidden']});
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
          await updateControl(record, `enabled${index}`, {visible, text: job ? (job.enabled ? '已启用' : '已暂停') : '', classes: visible ? ['enabled', job.enabled ? 'state-active' : 'state-paused'] : ['enabled','is-hidden']});
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
        name: await readValue('createName'),
        sourceType,
        scheduleType: createScheduleType,
        scheduleExpression: await readValue('createExpression'),
        timezone: (await readValue('createTimezone')) || 'Local',
        misfirePolicy: (await readValue('createMisfire')) || 'run_once',
      };
      if (sourceType === 'inline') input.inlineScript = await readValue('createInlineScript', false);
      else input.scriptPath = await readValue('createScript');
      const hasSource = sourceType === 'inline' ? input.inlineScript.trim() : input.scriptPath;
      const missing = [];
      if (!input.name) missing.push('计划名称');
      if (!hasSource) missing.push(sourceType === 'inline' ? '脚本文本' : '脚本路径');
      if (!input.scheduleType) missing.push('调度类型');
      if (!input.scheduleExpression) missing.push('执行表达式');
      if (missing.length) {
        lastError = `请填写：${missing.join('、')}`;
        notice = '';
        await render();
        return null;
      }
      loading = true;
      lastError = '';
      notice = '';
      await render();
      try {
        const created = await scheduler.createJob(Object.assign({taskType: 'script'}, input));
        loading = false;
        mode = 'list';
        await updateControl(windowRecord, 'createName', {value: ''});
        await loadBackend('scheduler.create', `已创建${sourceType === 'inline' ? '脚本文本' : '脚本文件'}计划：${created.name}`);
        return created;
      } catch (error) {
        loading = false;
        lastError = errorSummary(error);
        logStage('scheduler.create', 'backend', error);
        await render();
        return null;
      }
    }

    async function fillFileExample() {
      if (loading) return;
      createSourceType = 'file';
      await updateControl(windowRecord, 'createSource', {value: 'file'});
      await updateControl(windowRecord, 'createScript', {value: 'notify-and-log.js'});
      if (!(await readValue('createName'))) {
        await updateControl(windowRecord, 'createName', {value: 'UI 文件通知计划'});
      }
      notice = '已填入 examples/scheduler/notify-and-log.js；脚本目录中存在该文件时可直接创建。';
      lastError = '';
      await render();
    }

    async function fillInlineExample() {
      if (loading) return;
      createSourceType = 'inline';
      await updateControl(windowRecord, 'createSource', {value: 'inline'});
      await updateControl(windowRecord, 'createInlineScript', {value: INLINE_TOAST_EXAMPLE});
      if (!(await readValue('createName'))) {
        await updateControl(windowRecord, 'createName', {value: 'UI 脚本文本通知计划'});
      }
      notice = '已填入 ui.toast 与 console.log 测试脚本，可直接设置计划并创建。';
      lastError = '';
      await render();
    }

    async function openCreateForm() {
      if (loading) return;
      mode = 'create';
      armedDeleteID = '';
      lastError = '';
      notice = '创建表单已展开。填写必填项后即可创建计划。';
      await render();
    }

    async function closeCreateForm() {
      if (loading) return;
      mode = 'list';
      armedDeleteID = '';
      lastError = '';
      notice = '创建表单已收起；已填写内容仍会保留。';
      await render();
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
        // History is a normal, focusable page. show() brings it forward once;
        // persistent topmost would prevent other OpenDesk and system windows
        // from covering it.
        theme: 'dark', alwaysOnTop: false, draggable: true,
        content: {
          html: `<!doctype html><html><head><meta charset="utf-8"></head><body><main><strong>${escapeHTML(job.name)}</strong><div class="history-grid"><div class="history-head"><span>状态</span><span>计划时间</span><span>完成时间</span><span>错误</span></div>${rows || '<p class="history-empty">暂无运行记录</p>'}</div><button id="close" class="icon-button" data-icon="xmark" title="关闭" aria-label="关闭">关闭</button></main></body></html>`,
          css: 'html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:12px;overflow:hidden}main>strong{font-size:20px}.history-grid{flex:1;min-height:0;overflow:auto;border:1px solid #333;border-radius:8px}.history-head,.history-row{display:grid;grid-template-columns:.7fr 1.2fr 1.2fr 1.6fr;gap:10px;padding:9px 10px;border-bottom:1px solid #333}.history-head{color:#999;background:#202020;font-size:11px}.history-row span{min-width:0;overflow-wrap:anywhere}.history-empty{margin:0;padding:20px;color:#999}button{align-self:flex-start;border:1px solid #555;border-radius:7px;background:#303030;color:#fff}button:hover:not(:disabled){background:#3c3c3c}button:focus-visible{outline:2px solid #8ea7ff;outline-offset:2px}.icon-button{box-sizing:border-box;width:32px;height:32px;min-width:32px;min-height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px;line-height:1}.icon-button[data-icon="xmark"]::before{content:"×"}',
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
      bindDetached(record, win.control('openCreate'), 'click', 'scheduler.show-create', openCreateForm);
      bindDetached(record, win.control('refresh'), 'click', 'scheduler.refresh', () => loadBackend('scheduler.refresh', '计划列表已刷新。'));
      bindDetached(record, win.control('closeCreate'), 'click', 'scheduler.hide-create', closeCreateForm);
      bindDetached(record, win.control('createJob'), 'click', 'scheduler.create', createJob);
      bindDetached(record, win.control('fillFileExample'), 'click', 'scheduler.fill-file-example', fillFileExample);
      bindDetached(record, win.control('createSource'), 'change', 'scheduler.create-source', async () => {
        const state = await win.control('createSource').getState();
        createSourceType = String(state && state.value || 'file') === 'inline' ? 'inline' : 'file';
        notice = createSourceType === 'inline'
          ? '可直接输入脚本文本，或点击“填入 ui.toast 示例”。'
          : '脚本路径相对于上方显示的脚本目录。';
        lastError = '';
        await render();
      });
      bindDetached(record, win.control('fillInlineExample'), 'click', 'scheduler.fill-inline-example', fillInlineExample);
      bindDetached(record, win.control('createType'), 'change', 'scheduler.create-type', async () => {
        const state = await win.control('createType').getState();
        const value = String(state && state.value || 'every');
        createScheduleType = value === 'cron' || value === 'at' ? value : 'every';
        await updateControl(record, 'scheduleHint', {text: scheduleHelp(createScheduleType)});
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
