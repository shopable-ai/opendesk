(function installOpenDeskAssistantController(global) {
  'use strict';

  const RECENT_BATCH_SIZE = 8;
  const RECENT_ROW_CAPACITY = 64;
  const ARCHIVED_BATCH_SIZE = 4;
  const ARCHIVED_ROW_CAPACITY = 64;
  const MESSAGE_ROW_CAPACITY = 120;
  const DRAFT_SAVE_DELAY_MS = 500;
  const BUTTON_ICONS = Object.freeze({
    newConversation: 'plus',
    rename: 'pencil',
    archive: 'archivebox',
    restore: 'arrow.counterclockwise',
    send: 'arrow.up.circle.fill',
    stop: 'stop.fill',
    refresh: 'arrow.clockwise',
    help: 'questionmark.circle',
  });

  function errorDetails(error) {
    return {
      code: String(error && (error.code || error.name) || 'ERROR').slice(0, 120),
      message: String(error && error.message || error || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 1000),
    };
  }

  function classes(base, visible, extra) {
    const result = [base];
    if (extra) result.push(...extra);
    if (!visible) result.push('is-hidden');
    return result;
  }

  function requestStatusLabel(status) {
    return ({
      pending: '处理中',
      stopping: '正在停止',
      stopped: '已停止',
      failed: '失败',
      interrupted: '已中断',
      completed: '',
    })[status] || String(status || '');
  }

  function messageDisplayText(message) {
    const role = message && message.role === 'user' ? '你' : 'AI 助手';
    const status = requestStatusLabel(message && message.status);
    const body = message ? (message.text || (message.status === 'pending' ? '正在生成回复…' : '')) : '';
    return `${role}\n${body}${status ? `\n[${status}]` : ''}`;
  }

  function buildMessageOverflow(messages) {
    return (messages || []).map(messageDisplayText).join('\n\n────────\n\n');
  }

  function buildConversationRows(prefix, count, archived) {
    const output = [];
    for (let index = 0; index < count; index++) {
      output.push(
        `<button id="${prefix}${index}" class="conversation-row is-hidden" title="${archived ? '恢复并打开对话' : '打开对话'}">${archived ? '恢复对话' : '对话'}</button>`,
      );
    }
    return output.join('');
  }

  function buildMessageRows() {
    const output = [];
    for (let index = 0; index < MESSAGE_ROW_CAPACITY; index++) {
      output.push(`
        <div id="messageRow${index}" class="message-row is-hidden">
          <p id="messageMeta${index}" class="message-meta"></p>
          <p id="messageBody${index}" class="message-body"></p>
          <p id="messageState${index}" class="message-state is-hidden"></p>
        </div>`);
    }
    return output.join('');
  }

  function buildHTML() {
    return `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main class="shell">
        <div class="sidebar">
          <div class="sidebar-head">
            <strong>AI 助手</strong>
            <button id="newConversation" class="icon-button primary" data-icon="plus" title="新建对话" aria-label="新建对话">新建对话</button>
          </div>
          <section class="thread-section recent-section">
            <div class="section-head"><span>最近对话</span><span id="recentCount">0</span></div>
            <div id="recentList" class="conversation-list recent-list">${buildConversationRows('recent', RECENT_ROW_CAPACITY, false)}</div>
            <button id="recentMore" class="load-more is-hidden" title="查看更多最近对话">查看更多</button>
            <select id="recentOverflow" class="list-overflow is-hidden" aria-label="更早的最近对话"><option value="">更早的对话…</option></select>
          </section>
          <section class="thread-section archived-section">
            <div class="section-head"><span>已归档</span><span id="archivedCount">0</span></div>
            <p id="archivedEmpty" class="empty-note">暂无已归档对话</p>
            <div id="archivedList" class="conversation-list archived-list">${buildConversationRows('archived', ARCHIVED_ROW_CAPACITY, true)}</div>
            <button id="archivedMore" class="load-more is-hidden" title="查看更多已归档对话">查看更多</button>
            <select id="archivedOverflow" class="list-overflow is-hidden" aria-label="更早的已归档对话"><option value="">更早的归档…</option></select>
          </section>
        </div>

        <section class="workspace">
          <header class="conversation-head">
            <div class="title-block"><strong id="currentTitle">新对话</strong><span id="conversationState" class="subtle">本地会话</span></div>
            <div class="title-actions">
              <input id="titleInput" maxlength="120" placeholder="对话标题" aria-label="对话标题">
              <button id="renameConversation" class="icon-button" data-icon="pencil" title="保存标题" aria-label="保存标题">保存标题</button>
              <button id="archiveConversation" class="icon-button" data-icon="archivebox" title="归档当前对话" aria-label="归档当前对话">归档</button>
            </div>
          </header>

          <section class="connection-card">
            <div><p id="modelState" class="model-state">正在读取模型配置…</p><p id="globalStatus" class="global-status">会话历史保存在本地。</p></div>
            <div class="connection-actions"><button id="refreshModel" class="icon-button" data-icon="arrow.clockwise" title="刷新模型配置状态" aria-label="刷新模型配置状态">刷新</button><button id="toggleHelp" class="icon-button" data-icon="questionmark.circle" title="查看连接说明" aria-label="查看连接说明">连接说明</button></div>
            <p id="modelHelp" class="model-help is-hidden"></p>
          </section>

          <section class="messages-card">
            <div id="messageEmpty" class="message-empty">这是一个新对话。输入消息后才会调用模型；打开历史不会自动重发。</div>
            <div id="messageList" class="message-list" role="log" aria-live="polite" aria-label="聊天记录">
              ${buildMessageRows()}
              <p id="messageOverflow" class="message-overflow is-hidden"></p>
            </div>
          </section>

          <section class="composer-card">
            <textarea id="composer" maxlength="20000" rows="4" spellcheck="true" aria-label="聊天消息" placeholder="输入消息。发送只由按钮触发，输入法确认不会自动发送。"></textarea>
            <div class="composer-footer">
              <span id="composerHint" class="subtle">普通聊天不会运行脚本、命令或桌面动作。</span>
              <div class="composer-actions"><button id="stop" class="icon-button danger" data-icon="stop.fill" title="停止当前请求" aria-label="停止当前请求">停止</button><button id="send" class="icon-button primary" data-icon="arrow.up.circle.fill" title="发送消息" aria-label="发送消息">发送</button></div>
            </div>
          </section>
        </section>
      </main>
    </body></html>`;
  }

  const CSS = `
    :root{color-scheme:dark;--bg:#151515;--surface:#1d1d1f;--surface2:#252529;--line:#3a3a40;--text:#f4f4f5;--muted:#a4a4ad;--accent:#3977dc;--danger:#a74747;--user:#24456e;--assistant:#27272b;--warning:#d9ad68}
    html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}.shell{height:100vh;display:grid;grid-template-columns:270px minmax(0,1fr);overflow:hidden}.sidebar{min-width:0;border-right:1px solid var(--line);background:#191919;padding:14px 12px;display:flex;flex-direction:column;gap:14px;overflow:hidden}.sidebar-head,.section-head,.conversation-head,.composer-footer,.connection-card,.connection-actions,.title-actions{display:flex;align-items:center}.sidebar-head{justify-content:space-between;gap:10px}.sidebar-head strong{font-size:18px}.thread-section{min-height:0;display:flex;flex-direction:column;gap:8px}.recent-section{flex:1}.archived-section{flex:0 0 auto;max-height:42%}.section-head{justify-content:space-between;color:var(--muted);font-size:12px}.conversation-list{display:flex;flex-direction:column;gap:5px;min-height:0;overflow:hidden}.recent-list,.archived-list{overflow-y:auto;overscroll-behavior:contain;padding-right:2px}.conversation-row{width:100%;min-height:36px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid transparent;background:transparent;color:#d6d6da;padding:8px 10px;border-radius:7px}.conversation-row:hover:not(:disabled){background:#27272a}.conversation-row.is-selected{background:#30343c;border-color:#4a586c;color:white}.conversation-row.is-active::after{content:"  •";color:#8fb5ff}.conversation-row.archived{color:#b0b0b8}.empty-note{margin:0;padding:8px 4px;color:#777;font-size:12px}.load-more{width:100%;flex:0 0 auto;border-color:transparent;background:transparent;color:#9ea6b4;font-size:12px;padding:7px 8px}.load-more:hover:not(:disabled){background:#27272a;color:#f0f0f2}.list-overflow{width:100%;flex:0 0 auto;border:1px solid #3d3d43;border-radius:7px;background:#232327;color:#c6c6cc;padding:7px 8px;font:inherit;font-size:12px}.workspace{min-width:0;height:100%;padding:16px 18px;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:11px;overflow:hidden}.conversation-head{justify-content:space-between;gap:12px}.title-block{min-width:0;display:flex;flex-direction:column;gap:3px}.title-block strong{font-size:18px;max-width:440px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.subtle{color:var(--muted);font-size:12px}.title-actions{gap:6px}.title-actions input{width:210px}.connection-card{position:relative;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:10px 12px}.model-state,.global-status,.model-help{margin:0}.model-state{font-size:12px;color:#d7d7da}.global-status{font-size:11px;color:var(--muted);margin-top:3px}.connection-actions{gap:6px}.model-help{position:absolute;z-index:2;top:calc(100% + 6px);left:0;right:0;border:1px solid #45454d;background:#222227;border-radius:8px;padding:11px;white-space:pre-wrap;line-height:1.5;color:#c8c8cf;box-shadow:0 10px 30px rgba(0,0,0,.35)}.messages-card{position:relative;min-height:0;border:1px solid var(--line);border-radius:11px;background:var(--surface);padding:12px;overflow:hidden}.message-list{height:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column-reverse;gap:9px;align-items:stretch}.message-empty{position:absolute;z-index:1;inset:12px;display:flex;align-items:center;justify-content:center;color:#80808a;text-align:center;line-height:1.6;pointer-events:none}.message-row{max-width:82%;border:1px solid #3a3a40;border-radius:10px;background:var(--assistant);padding:9px 11px;align-self:flex-start}.message-row.role-user{align-self:flex-end;background:var(--user);border-color:#315a8d}.message-row.state-failed,.message-row.state-interrupted{border-color:#805151}.message-row.state-stopped{border-color:#6b6262}.message-meta,.message-body,.message-state{margin:0}.message-meta{font-size:10px;color:#aeb2bc;margin-bottom:4px}.message-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.message-state{font-size:10px;color:var(--warning);margin-top:5px}.message-overflow{width:100%;margin:0;border:1px solid #34343a;border-radius:9px;background:#202024;color:#b8b8c0;padding:10px 11px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;align-self:stretch}.composer-card{border:1px solid var(--line);border-radius:11px;background:var(--surface);padding:10px}.composer-card textarea,input{border:1px solid #47474f;border-radius:8px;background:#202024;color:var(--text);font:inherit}.composer-card textarea{width:100%;min-height:78px;max-height:190px;resize:vertical;padding:10px 11px;line-height:1.5}.title-actions input{padding:7px 8px}.composer-footer{justify-content:space-between;gap:12px;margin-top:8px}.composer-actions{display:flex;gap:7px}button{border:1px solid #4a4a52;border-radius:7px;background:#2e2e33;color:var(--text);font:inherit;padding:7px 10px}button:not(:disabled){cursor:pointer}button:hover:not(:disabled){background:#393940}button:disabled{opacity:.36}.icon-button{width:34px;height:34px;min-width:34px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:0}.icon-button::before{font-size:16px;line-height:1}.icon-button[data-icon="plus"]::before{content:"+";font-size:20px}.icon-button[data-icon="pencil"]::before{content:"✎"}.icon-button[data-icon="archivebox"]::before{content:"▣"}.icon-button[data-icon="arrow.up.circle.fill"]::before{content:"↑";font-size:19px}.icon-button[data-icon="stop.fill"]::before{content:"■";font-size:13px}.icon-button[data-icon="arrow.clockwise"]::before{content:"↻"}.icon-button[data-icon="questionmark.circle"]::before{content:"?"}.primary{background:#245fbf;border-color:var(--accent)}.danger{background:#3d2828;border-color:#724343}.is-hidden{display:none!important}
    @media(max-width:760px){.shell{grid-template-columns:210px minmax(0,1fr)}.title-actions input{width:140px}.message-row{max-width:94%}}
  `;

  function createController(options) {
    const settings = options || {};
    const runtimeUI = settings.ui || global.ui;
    const file = settings.file || global.File;
    const appDataRoot = settings.appDataRoot;
    const Store = settings.Store || global.OpenDeskAssistantStore;
    const ModelChannel = settings.ModelChannel || global.OpenDeskAssistantModelChannel;
    const Session = settings.Session || global.OpenDeskAssistantSession;
    const llm = settings.llm || global.LLM;
    const agent = settings.agent || global.Agent;
    const AbortControllerImpl = settings.AbortController || global.AbortController;
    const logger = settings.logger || global.console;
    const setTimer = settings.setTimeout || global.setTimeout;
    const clearTimer = settings.clearTimeout || global.clearTimeout;

    if (!runtimeUI || typeof runtimeUI.createWindow !== 'function') throw new Error('AI assistant requires ui.createWindow()');
    if (!file || typeof file.join !== 'function') throw new Error('AI assistant requires File.join()');
    if (!appDataRoot) throw new Error('AI assistant requires appDataRoot');
    if (!Store || !ModelChannel || !Session) throw new Error('AI assistant modules are not loaded');
    if (typeof setTimer !== 'function' || typeof clearTimer !== 'function') throw new Error('AI assistant requires timers');

    const assistantRoot = file.join(appDataRoot, 'assistant');
    let windowRecord = null;
    let windowGeneration = 0;
    let creatingPromise = null;
    let openingPromise = null;
    let lastError = null;

    function logError(stage, error) {
      const details = errorDetails(error);
      lastError = details;
      if (logger && typeof logger.error === 'function') {
        logger.error('OPENDESK_ASSISTANT_ERROR=' + JSON.stringify({stage, code: details.code, message: details.message}));
      }
    }

    async function update(record, id, patch) {
      if (!record || record.disposed) return null;
      try {
        return await record.handle.control(id).update(patch);
      } catch (error) {
        if (!record.disposed) logError(`render:${id}`, error);
        return null;
      }
    }

    function selectedDraft(record, state) {
      const id = state.selectedConversationId;
      if (!id) return '';
      if (record.draftShadow.has(id)) return record.draftShadow.get(id);
      return state.selectedConversation ? state.selectedConversation.draft || '' : '';
    }

    async function renderRequestControls(record, state) {
      const selected = state.selectedConversation;
      const active = state.activeRequest;
      const busy = !!active || state.submitting;
      await update(record, 'composer', {value: selectedDraft(record, state), disabled: !selected});
      await update(record, 'send', {disabled: !selected || busy, busy: state.submitting, text: '发送消息'});
      await update(record, 'stop', {disabled: !active, busy: !!(active && active.stopping), text: '停止当前请求'});
      await update(record, 'composerHint', {
        text: busy
          ? '当前仅允许一个在途模型请求；仍可切换会话并编辑、保存其他草稿。'
          : '普通聊天不会运行脚本、命令或桌面动作。',
      });
    }

    async function render(record, suppliedState) {
      if (!record || record.disposed || record.rendering) {
        if (record && !record.disposed && suppliedState) {
          record.pendingState = suppliedState;
          void renderRequestControls(record, suppliedState);
        }
        return;
      }
      record.rendering = true;
      try {
        let state = suppliedState || record.session.snapshot();
        do {
          record.pendingState = null;
          const selected = state.selectedConversation;
          const active = state.activeRequest;
          const recentItems = state.recent || [];
          const selectedRecentIndex = recentItems.findIndex(item => item.id === state.selectedConversationId);
          const selectedVisibleCount = selectedRecentIndex >= 0 && selectedRecentIndex < RECENT_ROW_CAPACITY
            ? Math.ceil((selectedRecentIndex + 1) / RECENT_BATCH_SIZE) * RECENT_BATCH_SIZE
            : RECENT_BATCH_SIZE;
          record.recentVisibleCount = Math.min(
            RECENT_ROW_CAPACITY,
            Math.max(RECENT_BATCH_SIZE, record.recentVisibleCount || RECENT_BATCH_SIZE, selectedVisibleCount),
          );
          const recentVisibleItems = recentItems.slice(0, record.recentVisibleCount);
          const inlineRecentCount = Math.min(recentItems.length, RECENT_ROW_CAPACITY);
          const hasMoreRecent = recentVisibleItems.length < inlineRecentCount;
          const recentOverflowItems = recentItems.slice(RECENT_ROW_CAPACITY);
          const recentOverflowOptions = [{value: '', label: '更早的对话…'}]
            .concat(recentOverflowItems.map(item => ({value: item.id, label: item.title})));
          const recentOverflowValue = selectedRecentIndex >= RECENT_ROW_CAPACITY ? state.selectedConversationId : '';

          const archivedItems = state.archived || [];
          record.archivedVisibleCount = Math.min(
            ARCHIVED_ROW_CAPACITY,
            Math.max(ARCHIVED_BATCH_SIZE, record.archivedVisibleCount || ARCHIVED_BATCH_SIZE),
          );
          const archivedVisibleItems = archivedItems.slice(0, record.archivedVisibleCount);
          const inlineArchivedCount = Math.min(archivedItems.length, ARCHIVED_ROW_CAPACITY);
          const hasMoreArchived = archivedVisibleItems.length < inlineArchivedCount;
          const archivedOverflowItems = archivedItems.slice(ARCHIVED_ROW_CAPACITY);
          const archivedOverflowOptions = [{value: '', label: '更早的归档…'}]
            .concat(archivedOverflowItems.map(item => ({value: item.id, label: item.title})));

          await renderRequestControls(record, state);

          await update(record, 'recentCount', {text: String(recentItems.length)});
          await update(record, 'archivedCount', {text: String(archivedItems.length)});
          await update(record, 'recentMore', {
            visible: hasMoreRecent,
            disabled: !hasMoreRecent,
            text: '查看更多',
            classes: classes('load-more', hasMoreRecent),
          });
          await update(record, 'recentOverflow', {
            visible: recentOverflowItems.length > 0,
            disabled: recentOverflowItems.length === 0,
            value: recentOverflowValue,
            options: recentOverflowOptions,
            classes: classes('list-overflow', recentOverflowItems.length > 0),
          });
          await update(record, 'archivedMore', {
            visible: hasMoreArchived,
            disabled: !hasMoreArchived,
            text: '查看更多',
            classes: classes('load-more', hasMoreArchived),
          });
          await update(record, 'archivedOverflow', {
            visible: archivedOverflowItems.length > 0,
            disabled: archivedOverflowItems.length === 0,
            value: '',
            options: archivedOverflowOptions,
            classes: classes('list-overflow', archivedOverflowItems.length > 0),
          });
          await update(record, 'archivedEmpty', {visible: archivedItems.length === 0, classes: classes('empty-note', archivedItems.length === 0)});

          for (let index = 0; index < RECENT_ROW_CAPACITY; index++) {
            const conversation = recentVisibleItems[index] || null;
            const visible = !!conversation;
            const isSelected = !!conversation && conversation.id === state.selectedConversationId;
            const isActive = !!conversation && active && conversation.id === active.conversationId;
            const rowClasses = ['conversation-row'];
            if (isSelected) rowClasses.push('is-selected');
            if (isActive) rowClasses.push('is-active');
            if (!visible) rowClasses.push('is-hidden');
            await update(record, `recent${index}`, {
              visible,
              disabled: !conversation,
              text: conversation ? conversation.title : '',
              classes: rowClasses,
            });
          }

          const archivedRowsToUpdate = Math.max(record.archivedRenderedCount || 0, archivedVisibleItems.length);
          for (let index = 0; index < archivedRowsToUpdate; index++) {
            const conversation = archivedVisibleItems[index] || null;
            const visible = !!conversation;
            await update(record, `archived${index}`, {
              visible,
              disabled: !conversation,
              text: conversation ? `↺ ${conversation.title}` : '',
              classes: visible ? ['conversation-row','archived'] : ['conversation-row','archived','is-hidden'],
            });
          }
          record.archivedRenderedCount = archivedVisibleItems.length;

          const title = selected ? selected.title : '新对话';
          await update(record, 'currentTitle', {text: title});
          await update(record, 'conversationState', {
            text: active && selected && active.conversationId === selected.id
              ? (active.stopping ? '正在停止此对话的请求' : '此对话正在获取回复')
              : '本地会话',
          });
          if (!record.titleEditing) await update(record, 'titleInput', {value: title, disabled: !selected});
          await update(record, 'renameConversation', {disabled: !selected, text: '保存标题'});
          await update(record, 'archiveConversation', {
            disabled: !selected || (!!active && active.conversationId === selected.id),
            text: '归档当前对话',
          });

          await update(record, 'modelState', {text: state.modelStatus || '模型状态未知'});
          const statusParts = [];
          if (state.persistenceError) statusParts.push(`保存失败：${state.persistenceError.message}`);
          else if (state.lastError) statusParts.push(state.lastError.message || state.lastError.code);
          else statusParts.push('会话历史保存在本地；查看历史不会自动重新发送。');
          if (active && (!selected || active.conversationId !== selected.id)) {
            const activeConversation = recentItems.find(item => item.id === active.conversationId);
            statusParts.push(`“${activeConversation ? activeConversation.title : '其他对话'}”仍有请求处理中。`);
          }
          await update(record, 'globalStatus', {text: statusParts.join(' ')});
          await update(record, 'modelHelp', {
            visible: record.helpVisible,
            text: state.modelHelp || '',
            classes: classes('model-help', record.helpVisible),
          });
          await update(record, 'refreshModel', {text: '刷新模型配置状态'});
          await update(record, 'toggleHelp', {text: record.helpVisible ? '隐藏连接说明' : '查看连接说明'});

          const messages = selected ? selected.messages || [] : [];
          const overflowCount = Math.max(0, messages.length - MESSAGE_ROW_CAPACITY);
          const overflowMessages = overflowCount > 0 ? messages.slice(0, overflowCount) : [];
          const bubbleMessages = messages.slice(overflowCount).reverse();
          await update(record, 'messageEmpty', {visible: messages.length === 0, classes: classes('message-empty', messages.length === 0)});
          await update(record, 'messageOverflow', {
            visible: overflowMessages.length > 0,
            text: overflowMessages.length > 0 ? buildMessageOverflow(overflowMessages) : '',
            classes: classes('message-overflow', overflowMessages.length > 0),
          });
          const messageRowsToUpdate = Math.max(record.messageRenderedCount || 0, bubbleMessages.length);
          for (let index = 0; index < messageRowsToUpdate; index++) {
            const message = bubbleMessages[index] || null;
            const visible = !!message;
            const role = message ? message.role : '';
            const status = message ? requestStatusLabel(message.status) : '';
            const rowClasses = ['message-row'];
            if (role === 'user') rowClasses.push('role-user');
            if (message && message.status && message.status !== 'completed' && message.status !== 'pending') rowClasses.push(`state-${message.status}`);
            if (!visible) rowClasses.push('is-hidden');
            await update(record, `messageRow${index}`, {visible, classes: rowClasses});
            await update(record, `messageMeta${index}`, {text: message ? (role === 'user' ? '你' : 'AI 助手') : ''});
            await update(record, `messageBody${index}`, {
              text: message ? (message.text || (message.status === 'pending' ? '正在生成回复…' : '')) : '',
            });
            await update(record, `messageState${index}`, {
              visible: !!status,
              text: status,
              classes: classes('message-state', !!status),
            });
          }
          record.messageRenderedCount = bubbleMessages.length;

          state = record.pendingState;
        } while (state && !record.disposed);
      } finally {
        record.rendering = false;
      }
    }

    function clearDraftTimer(record) {
      if (record && record.draftTimer != null) {
        clearTimer(record.draftTimer);
        record.draftTimer = null;
      }
    }

    async function persistDraft(record, conversationId, value) {
      if (!record || record.disposed || !conversationId) return;
      try {
        await record.session.updateDraft(conversationId, value);
        record.draftShadow.delete(conversationId);
      } catch (error) {
        logError('draft-save', error);
      }
    }

    function scheduleDraftSave(record, conversationId, value) {
      clearDraftTimer(record);
      record.draftTimer = setTimer(() => {
        record.draftTimer = null;
        void persistDraft(record, conversationId, value);
      }, DRAFT_SAVE_DELAY_MS);
    }

    async function flushDraft(record) {
      if (!record || record.disposed) return;
      clearDraftTimer(record);
      const state = record.session.snapshot();
      const id = state.selectedConversationId;
      if (!id) return;
      const controlState = await record.handle.control('composer').getState();
      const value = String(controlState && controlState.value || '');
      record.draftShadow.set(id, value);
      await persistDraft(record, id, value);
    }

    async function runAction(record, stage, action) {
      try {
        await action();
      } catch (error) {
        logError(stage, error);
        await render(record);
      }
    }

    function bind(record, control, event, stage, handler) {
      const off = control.on(event, (...args) => runAction(record, stage, () => handler(...args)));
      if (typeof off === 'function') record.unsubscribers.push(off);
    }

    async function switchConversation(record, conversationId) {
      if (!conversationId) return;
      await flushDraft(record);
      record.titleEditing = false;
      await record.session.switchConversation(conversationId);
    }

    async function restoreConversation(record, conversationId) {
      if (!conversationId) return;
      await flushDraft(record);
      record.titleEditing = false;
      await record.session.restoreConversation(conversationId);
    }

    function bindWindow(record) {
      bind(record, record.handle.control('newConversation'), 'click', 'new-conversation', async () => {
        await flushDraft(record);
        record.titleEditing = false;
        const conversation = await record.session.createConversation();
        record.draftShadow.delete(conversation.id);
      });

      for (let index = 0; index < RECENT_ROW_CAPACITY; index++) {
        bind(record, record.handle.control(`recent${index}`), 'click', 'switch-conversation', async () => {
          const state = record.session.snapshot();
          const conversation = (state.recent || [])[index];
          if (!conversation || index >= record.recentVisibleCount) return;
          await switchConversation(record, conversation.id);
        });
      }
      bind(record, record.handle.control('recentOverflow'), 'change', 'switch-older-conversation', async () => {
        const input = await record.handle.control('recentOverflow').getState();
        const conversationId = String(input && input.value || '');
        if (!conversationId) return;
        await switchConversation(record, conversationId);
      });

      for (let index = 0; index < ARCHIVED_ROW_CAPACITY; index++) {
        bind(record, record.handle.control(`archived${index}`), 'click', 'restore-conversation', async () => {
          const state = record.session.snapshot();
          const conversation = (state.archived || [])[index];
          if (!conversation || index >= record.archivedVisibleCount) return;
          await restoreConversation(record, conversation.id);
        });
      }
      bind(record, record.handle.control('archivedOverflow'), 'change', 'restore-older-conversation', async () => {
        const input = await record.handle.control('archivedOverflow').getState();
        const conversationId = String(input && input.value || '');
        if (!conversationId) return;
        await restoreConversation(record, conversationId);
      });

      bind(record, record.handle.control('recentMore'), 'click', 'recent-more', async () => {
        record.recentVisibleCount = Math.min(RECENT_ROW_CAPACITY, record.recentVisibleCount + RECENT_BATCH_SIZE);
        await render(record);
      });
      bind(record, record.handle.control('archivedMore'), 'click', 'archived-more', async () => {
        record.archivedVisibleCount = Math.min(ARCHIVED_ROW_CAPACITY, record.archivedVisibleCount + ARCHIVED_BATCH_SIZE);
        await render(record);
      });

      bind(record, record.handle.control('titleInput'), 'input', 'title-input', async () => { record.titleEditing = true; });
      bind(record, record.handle.control('renameConversation'), 'click', 'rename-conversation', async () => {
        const state = record.session.snapshot();
        if (!state.selectedConversationId) return;
        const titleState = await record.handle.control('titleInput').getState();
        await record.session.renameConversation(state.selectedConversationId, String(titleState && titleState.value || ''));
        record.titleEditing = false;
      });
      bind(record, record.handle.control('archiveConversation'), 'click', 'archive-conversation', async () => {
        await flushDraft(record);
        record.titleEditing = false;
        const state = record.session.snapshot();
        if (state.selectedConversationId) await record.session.archiveConversation(state.selectedConversationId);
      });

      bind(record, record.handle.control('toggleHelp'), 'click', 'toggle-help', async () => { record.helpVisible = !record.helpVisible; await render(record); });
      bind(record, record.handle.control('refreshModel'), 'click', 'refresh-model', async () => { await render(record); });

      // There is intentionally no keydown/Enter-to-send binding. The Custom UI
      // public event surface does not need one for P0.1, so IME composition and
      // confirmation cannot accidentally submit a message.
      bind(record, record.handle.control('composer'), 'input', 'draft-input', async () => {
        const state = record.session.snapshot();
        const id = state.selectedConversationId;
        if (!id) return;
        const controlState = await record.handle.control('composer').getState();
        const value = String(controlState && controlState.value || '');
        record.draftShadow.set(id, value);
        scheduleDraftSave(record, id, value);
      });
      bind(record, record.handle.control('composer'), 'change', 'draft-change', async () => { await flushDraft(record); });
      bind(record, record.handle.control('send'), 'click', 'send', async () => {
        const state = record.session.snapshot();
        const id = state.selectedConversationId;
        if (!id) return;
        clearDraftTimer(record);
        const input = await record.handle.control('composer').getState();
        const text = String(input && input.value || '').trim();
        if (!text) return;
        record.draftShadow.set(id, '');
        try {
          await record.session.submit(text);
        } catch (error) {
          record.draftShadow.set(id, String(input && input.value || ''));
          await update(record, 'composer', {value: String(input && input.value || '')});
          throw error;
        }
      });
      bind(record, record.handle.control('stop'), 'click', 'stop', async () => { await record.session.stop(); });

      const offClose = record.handle.on('close', async () => {
        if (record.disposed) return;
        try { await record.session.stop(); } catch (_) {}
        try { await flushDraft(record); } catch (_) {}
        try { await record.session.close(); } catch (_) {}
        clearWindow(record);
      });
      if (typeof offClose === 'function') record.unsubscribers.push(offClose);
    }

    function clearWindow(record) {
      if (!record || record.disposed) return;
      record.disposed = true;
      clearDraftTimer(record);
      for (const off of record.unsubscribers.splice(0)) {
        try { off(); } catch (_) {}
      }
      if (windowRecord === record) windowRecord = null;
    }

    function observeWindowLifecycle(record) {
      record.lifecycle = record.handle.waitUntilClosed()
        .catch(error => { if (!record.disposed) logError('window-lifecycle', error); })
        .finally(async () => {
          if (!record.disposed) {
            try { await record.session.close(); } catch (_) {}
            clearWindow(record);
          }
        });
      void record.lifecycle.catch(() => {});
    }

    function ensureWindow() {
      if (windowRecord && !windowRecord.disposed) return Promise.resolve(windowRecord);
      if (creatingPromise) return creatingPromise;
      const generation = ++windowGeneration;
      const task = (async () => {
        const handle = await runtimeUI.createWindow({
          id: `opendeskAssistant${generation}`,
          kind: 'normal',
          title: 'OpenDesk · AI 助手',
          position: {mode: 'anchor', size: {width: 1040, height: 720}, horizontal: 'center', vertical: 'center', margin: 0, display: 'active'},
          theme: 'dark',
          alwaysOnTop: false,
          draggable: true,
          content: {html: buildHTML(), css: CSS},
        });
        const store = Store.create({file, rootDir: assistantRoot, logger});
        const channel = ModelChannel.create({llm, agent});
        const record = {
          generation,
          handle,
          store,
          channel,
          session: null,
          unsubscribers: [],
          disposed: false,
          rendering: false,
          pendingState: null,
          recentVisibleCount: RECENT_BATCH_SIZE,
          archivedVisibleCount: ARCHIVED_BATCH_SIZE,
          archivedRenderedCount: 0,
          messageRenderedCount: 0,
          draftShadow: new Map(),
          draftTimer: null,
          helpVisible: false,
          titleEditing: false,
          lifecycle: null,
        };
        const session = Session.create({
          store,
          channel,
          AbortController: AbortControllerImpl,
          logger,
          onChange: state => render(record, state),
        });
        record.session = session;
        windowRecord = record;
        try {
          bindWindow(record);
          observeWindowLifecycle(record);
          await session.initialize();
          return record;
        } catch (error) {
          clearWindow(record);
          try { await handle.close(); } catch (_) {}
          throw error;
        }
      })();
      creatingPromise = task;
      void task.finally(() => { if (creatingPromise === task) creatingPromise = null; }).catch(() => {});
      return task;
    }

    async function performOpen(source) {
      let record = await ensureWindow();
      try {
        await record.handle.show();
      } catch (error) {
        clearWindow(record);
        try { await record.session.close(); } catch (_) {}
        record = await ensureWindow();
        await record.handle.show();
      }
      lastError = null;
      await render(record);
      if (logger && typeof logger.log === 'function') {
        logger.log('OPENDESK_ASSISTANT_OPEN=' + JSON.stringify({source: source || 'assistant.open', generation: record.generation}));
      }
      return state();
    }

    function open(source) {
      if (openingPromise) return openingPromise;
      const task = performOpen(source || 'assistant.open');
      openingPromise = task;
      return task.finally(() => { if (openingPromise === task) openingPromise = null; });
    }

    async function close() {
      const record = windowRecord;
      if (!record || record.disposed) return state();
      try { await record.session.stop(); } catch (_) {}
      try { await flushDraft(record); } catch (_) {}
      await record.session.close();
      try { await record.handle.close(); } finally { clearWindow(record); }
      return state();
    }

    function state() {
      const sessionState = windowRecord && !windowRecord.disposed && windowRecord.session
        ? windowRecord.session.snapshot()
        : null;
      return Object.freeze({
        open: !!(windowRecord && !windowRecord.disposed),
        windowGeneration,
        creating: !!creatingPromise,
        opening: !!openingPromise,
        selectedConversationId: sessionState ? sessionState.selectedConversationId : null,
        activeRequest: sessionState ? sessionState.activeRequest : null,
        lastError,
        assistantRoot,
      });
    }

    return Object.freeze({open, close, state});
  }

  global.OpenDeskAssistantController = Object.freeze({create: createController});
})(globalThis);
