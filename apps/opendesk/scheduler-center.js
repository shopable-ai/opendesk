(function installOpenDeskSchedulerCenter(global) {
  'use strict';

  const scheduler = global.OpenDeskSchedulerClient;
  const runtimeUI = global.ui;
  const logger = global.console;
  const MAX_ROWS = 48;

  if (!scheduler || typeof scheduler.listJobs !== 'function') {
    throw new Error('OpenDesk Scheduler client is unavailable');
  }
  if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') {
    throw new Error('OpenDesk Scheduler Center requires ui.createWindow()');
  }

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

  function rowHTML(index) {
    return [
      `<p id="name${index}" class="name is-hidden"></p>`,
      `<p id="schedule${index}" class="schedule is-hidden"></p>`,
      `<p id="next${index}" class="next is-hidden"></p>`,
      `<p id="last${index}" class="last is-hidden"></p>`,
      `<button id="run${index}" class="row-button is-hidden">运行</button>`,
      `<button id="toggle${index}" class="row-button is-hidden">暂停</button>`,
      `<button id="history${index}" class="row-button is-hidden">历史</button>`,
      `<button id="delete${index}" class="row-button danger is-hidden">删除</button>`,
    ].join('');
  }

  function buildHTML() {
    const rows = [];
    for (let index = 0; index < MAX_ROWS; index++) rows.push(rowHTML(index));
    return `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
      <header><div><strong>计划</strong><p id="runtimeState" class="subtle">正在连接 Scheduler…</p></div><button id="refresh">刷新</button></header>
      <p id="status" class="status">正在加载计划…</p>
      <section class="create-card">
        <div class="section-title"><strong>新建计划</strong><span>调度 Script Runner recipes 目录中的 JavaScript。</span></div>
        <div class="form-grid">
          <label>名称<input id="createName" placeholder="例如：每日数据整理"></label>
          <label>脚本<input id="createScript" placeholder="例如：daily-report.js"></label>
          <label>类型<select id="createType"><option value="every">间隔</option><option value="cron">Cron</option><option value="at">单次</option></select></label>
          <label>表达式<input id="createExpression" value="1h" placeholder="30m / 0 9 * * * / RFC3339"></label>
          <label>时区<input id="createTimezone" value="Local" placeholder="Local 或 Asia/Shanghai"></label>
          <label>错过执行<select id="createMisfire"><option value="run_once">补跑一次</option><option value="skip">跳过</option></select></label>
        </div>
        <div class="form-actions"><button id="createJob" class="primary">创建计划</button><span>间隔示例：10m、1h、24h</span></div>
      </section>
      <section class="list-card">
        <div class="section-title"><strong>计划列表</strong><span id="jobCount">0 个计划</span></div>
        <div id="emptyState" class="empty">暂无计划。填写上方信息即可创建第一个计划。</div>
        <div class="grid">
          <p id="headName" class="head is-hidden">计划</p><p id="headSchedule" class="head is-hidden">周期</p><p id="headNext" class="head is-hidden">下次</p><p id="headLast" class="head is-hidden">最近</p>
          <p id="headRun" class="head is-hidden">运行</p><p id="headToggle" class="head is-hidden">状态</p><p id="headHistory" class="head is-hidden">记录</p><p id="headDelete" class="head is-hidden"></p>
          ${rows.join('')}
        </div>
      </section>
    </main></body></html>`;
  }

  const CSS = `
    html,body{margin:0;padding:0;background:#171717;color:#f4f4f4;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}
    main{height:100vh;padding:18px;display:flex;flex-direction:column;gap:12px;overflow:hidden}header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}header strong{font-size:22px}.subtle{margin:5px 0 0;color:#999;font-size:12px}
    button,input,select{font:inherit}button{border:1px solid #505050;border-radius:7px;background:#303030;color:#f4f4f4;padding:7px 11px}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#3c3c3c}button:disabled{opacity:.4}.primary{background:#245fbe;border-color:#3474d6}.danger{color:#ffb1b1}.status{margin:0;padding:9px 10px;border:1px solid #393939;border-radius:7px;background:#202020;color:#d7d7d7;font-size:12px}
    .create-card,.list-card{border:1px solid #343434;border-radius:10px;background:#1d1d1d;padding:14px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px}.section-title span{font-size:12px;color:#999}.form-grid{display:grid;grid-template-columns:1.2fr 1.4fr .7fr 1.35fr 1fr .8fr;gap:9px}.form-grid label{font-size:11px;color:#aaa;display:flex;flex-direction:column;gap:5px}.form-grid input,.form-grid select{width:100%;min-width:0;border:1px solid #454545;border-radius:7px;background:#242424;color:#f2f2f2;padding:8px}.form-actions{display:flex;align-items:center;gap:10px;margin-top:10px}.form-actions span{color:#8f8f8f;font-size:11px}
    .list-card{flex:1;min-height:0;display:flex;flex-direction:column}.grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(170px,1.4fr) minmax(125px,1fr) minmax(125px,1fr) 62px 64px 64px 64px;gap:0 8px;align-content:start;align-items:center}.head{margin:0;padding:0 0 7px;color:#888;font-size:11px;border-bottom:1px solid #383838}.name,.schedule,.next,.last{margin:0;min-height:48px;display:flex;align-items:center;border-bottom:1px solid #303030;overflow:hidden;text-overflow:ellipsis}.name{font-weight:650}.schedule,.next,.last{font-size:12px;color:#bbb}.row-button{margin:7px 0;padding:6px 8px}.empty{margin:auto;text-align:center;color:#999;padding:50px 20px}.is-hidden{display:none!important}
  `;

  function createCenter() {
    let window = null;
    let sequence = 0;
    let jobs = [];
    let runtimeState = null;
    let loading = false;
    let lastError = '';
    let notice = '';
    let armedDeleteID = '';
    let updates = Promise.resolve();

    function queue(task) {
      updates = updates.catch(() => {}).then(task);
      return updates;
    }

    async function safeUpdate(id, patch) {
      if (!window) return;
      try { await window.control(id).update(patch); } catch (_) {}
    }

    function statusText() {
      if (loading) return '正在刷新计划…';
      if (lastError) return `操作失败：${lastError}`;
      if (notice) return notice;
      if (jobs.length > MAX_ROWS) return `共 ${jobs.length} 个计划；当前窗口显示前 ${MAX_ROWS} 个。`;
      return jobs.length ? `已加载 ${jobs.length} 个计划。` : '暂无计划。';
    }

    function runtimeText() {
      if (!runtimeState) return 'Scheduler 状态未知';
      const owner = runtimeState.runnerState === 'active'
        ? 'Active · 当前 OpenDesk 负责执行计划'
        : 'Standby · 执行权由其他 OpenDesk Runtime 持有';
      return `${owner} · 脚本目录：${runtimeState.scriptRoot || '未知'}`;
    }

    function classes(base, visible) {
      return visible ? [base] : [base, 'is-hidden'];
    }

    function render() {
      return queue(async () => {
        if (!window) return;
        const count = Math.min(jobs.length, MAX_ROWS);
        const hasRows = count > 0;
        await safeUpdate('runtimeState', {text: runtimeText()});
        await safeUpdate('status', {text: statusText()});
        await safeUpdate('jobCount', {text: `${jobs.length} 个计划`});
        await safeUpdate('emptyState', {visible: !hasRows, classes: classes('empty', !hasRows)});
        await safeUpdate('refresh', {disabled: loading});
        await safeUpdate('createJob', {disabled: loading});
        for (const id of ['headName','headSchedule','headNext','headLast','headRun','headToggle','headHistory','headDelete']) {
          await safeUpdate(id, {visible: hasRows, classes: classes('head', hasRows)});
        }
        for (let index = 0; index < MAX_ROWS; index++) {
          const job = jobs[index] || null;
          const visible = !!job;
          await safeUpdate(`name${index}`, {visible, text: job ? job.name : '', classes: classes('name', visible)});
          await safeUpdate(`schedule${index}`, {visible, text: job ? scheduleLabel(job) : '', classes: classes('schedule', visible)});
          await safeUpdate(`next${index}`, {visible, text: job ? formatTime(job.nextRunAt) : '', classes: classes('next', visible)});
          await safeUpdate(`last${index}`, {visible, text: job ? runLabel(job.lastRun) : '', classes: classes('last', visible)});
          await safeUpdate(`run${index}`, {visible, disabled: loading || !job || !runtimeState || runtimeState.runnerState !== 'active', classes: classes('row-button', visible)});
          await safeUpdate(`toggle${index}`, {visible, disabled: loading || !job, text: job && job.enabled ? '暂停' : '恢复', classes: classes('row-button', visible)});
          await safeUpdate(`history${index}`, {visible, disabled: loading || !job, classes: classes('row-button', visible)});
          await safeUpdate(`delete${index}`, {visible, disabled: loading || !job, text: job && armedDeleteID === job.id ? '确认' : '删除', classes: visible ? ['row-button','danger'] : ['row-button','danger','is-hidden']});
        }
      });
    }

    async function refresh(message) {
      if (loading) return;
      loading = true;
      lastError = '';
      notice = message || '';
      await render();
      try {
        const values = await Promise.all([scheduler.status(), scheduler.listJobs()]);
        runtimeState = values[0] || null;
        jobs = Array.isArray(values[1]) ? values[1] : [];
        armedDeleteID = '';
      } catch (error) {
        lastError = error && error.message ? String(error.message) : String(error || 'Scheduler refresh failed');
        if (logger && typeof logger.error === 'function') logger.error('SCHEDULER_CENTER_REFRESH_ERROR=' + lastError);
      } finally {
        loading = false;
        await render();
      }
    }

    async function readValue(id) {
      const state = await window.control(id).getState();
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
        const created = await scheduler.createJob(Object.assign({taskType:'script', sourceType:'file'}, input));
        loading = false;
        await refresh(`已创建计划：${created.name}`);
        return created;
      } catch (error) {
        loading = false;
        lastError = error && error.message ? String(error.message) : String(error || 'Create plan failed');
        await render();
        return null;
      }
    }

    async function mutate(index, operation, successText) {
      const job = jobs[index];
      if (!job || loading) return null;
      loading = true;
      lastError = '';
      notice = '';
      await render();
      try {
        const result = await operation(job);
        loading = false;
        await refresh(typeof successText === 'function' ? successText(job, result) : successText || '计划已更新。');
        return result;
      } catch (error) {
        loading = false;
        lastError = error && error.message ? String(error.message) : String(error || 'Scheduler action failed');
        await render();
        return null;
      }
    }

    async function openHistory(job) {
      const runs = await scheduler.listRuns(job.id, 20);
      const rows = (Array.isArray(runs) ? runs : []).map(run => `<tr><td>${escapeHTML(run.status)}</td><td>${escapeHTML(formatTime(run.scheduledAt))}</td><td>${escapeHTML(formatTime(run.finishedAt || run.startedAt))}</td><td>${escapeHTML(run.error || '')}</td></tr>`).join('');
      const history = await runtimeUI.createWindow({
        id: `schedulerHistory${++sequence}`, kind: 'floating', title: `计划历史 · ${job.name}`,
        position: {mode:'anchor',size:{width:760,height:420},horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme:'dark', alwaysOnTop:true, draggable:true,
        content: {
          html:`<!doctype html><html><body><main><h2>${escapeHTML(job.name)}</h2><table><thead><tr><th>状态</th><th>计划时间</th><th>完成时间</th><th>错误</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂无运行记录</td></tr>'}</tbody></table><button id="close">关闭</button></main></body></html>`,
          css:'html,body{margin:0;background:#171717;color:#f4f4f4;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{padding:18px}h2{margin-top:0}table{width:100%;border-collapse:collapse;margin:12px 0 18px}th,td{text-align:left;padding:8px;border-bottom:1px solid #333;vertical-align:top}th{color:#999}button{border:1px solid #555;border-radius:7px;background:#303030;color:#fff;padding:7px 12px}'
        },
      });
      history.control('close').on('click', () => history.close());
      await history.show();
      return history;
    }

    async function bind(win) {
      win.control('refresh').on('click', () => refresh('计划列表已刷新。'));
      win.control('createJob').on('click', createJob);
      for (let index = 0; index < MAX_ROWS; index++) {
        win.control(`run${index}`).on('click', () => mutate(index, job => scheduler.runNow(job.id), job => `已提交立即运行：${job.name}`));
        win.control(`toggle${index}`).on('click', () => mutate(index, job => job.enabled ? scheduler.pause(job.id) : scheduler.resume(job.id), job => `${job.name} 已${job.enabled ? '暂停' : '恢复'}。`));
        win.control(`history${index}`).on('click', async () => {
          const job = jobs[index];
          if (!job) return;
          try { await openHistory(job); } catch (error) {
            lastError = error && error.message ? String(error.message) : String(error || 'Load history failed');
            notice = '';
            await render();
          }
        });
        win.control(`delete${index}`).on('click', async () => {
          const job = jobs[index];
          if (!job || loading) return;
          if (armedDeleteID !== job.id) {
            armedDeleteID = job.id;
            notice = `再次点击“确认”删除计划：${job.name}`;
            await render();
            return;
          }
          armedDeleteID = '';
          await mutate(index, current => scheduler.delete(current.id), current => `已删除计划：${current.name}`);
        });
      }
      win.on('close', () => { if (window === win) window = null; });
    }

    async function open(source) {
      if (window) {
        try {
          await window.show();
          await refresh(source ? `计划中心已打开 · ${source}` : '');
          return state();
        } catch (_) {
          window = null;
        }
      }
      const next = await runtimeUI.createWindow({
        id: `schedulerCenter${++sequence}`, kind: 'floating', title: 'OpenDesk · 计划',
        position: {mode:'anchor',size:{width:1180,height:720},horizontal:'center',vertical:'center',margin:0,display:'active'},
        theme:'dark', alwaysOnTop:false, draggable:true, content:{html:buildHTML(),css:CSS},
      });
      window = next;
      await bind(next);
      await next.show();
      await refresh(source ? `计划中心已打开 · ${source}` : '');
      return state();
    }

    async function openCreate(source) {
      const result = await open(source || 'scheduler.new');
      notice = '填写“新建计划”后点击“创建计划”。';
      await render();
      return result;
    }

    function state() {
      return Object.freeze({open:!!window, loading, count:jobs.length, runnerState:runtimeState ? runtimeState.runnerState : '', lastError});
    }

    return Object.freeze({open, openCreate, refresh, state});
  }

  global.OpenDeskSchedulerCenter = Object.freeze({create:createCenter});
})(globalThis);
