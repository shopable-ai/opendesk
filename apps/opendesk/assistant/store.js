(function installOpenDeskAssistantStore(global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const DEFAULT_TITLE = '新对话';
  const EVENT_FILE_PATTERN = /^(\d{12})\.json$/;
  const TERMINAL_REQUEST_STATUSES = new Set(['completed', 'stopped', 'failed', 'interrupted']);
  const ACTIVE_REQUEST_STATUSES = new Set(['pending', 'stopping']);

  class AssistantStoreError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'AssistantStoreError';
      this.code = code;
      if (details && typeof details === 'object') Object.assign(this, details);
    }
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function nowISO(clock) {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new AssistantStoreError('INVALID_CLOCK', 'assistant clock returned an invalid date');
    }
    return date.toISOString();
  }

  function cleanText(value, maxLength, field) {
    const text = String(value == null ? '' : value).replace(/\u0000/g, '');
    if (text.length > maxLength) {
      throw new AssistantStoreError('TEXT_TOO_LONG', `${field || 'text'} exceeds ${maxLength} characters`);
    }
    return text;
  }

  function requiredText(value, maxLength, field) {
    const text = cleanText(value, maxLength, field).trim();
    if (!text) throw new AssistantStoreError('INVALID_ARGUMENT', `${field || 'text'} is required`);
    return text;
  }

  function titleFromMessage(text) {
    const compact = requiredText(text, 20000, 'message').replace(/\s+/g, ' ').trim();
    return compact.length <= 36 ? compact : compact.slice(0, 35) + '…';
  }

  function initialState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      selectedConversationId: null,
      conversations: Object.create(null),
    };
  }

  function assertConversation(state, conversationId) {
    const id = String(conversationId || '');
    const conversation = state.conversations[id];
    if (!conversation) throw new AssistantStoreError('CONVERSATION_NOT_FOUND', `conversation not found: ${id}`);
    return conversation;
  }

  function assertRequest(conversation, requestId) {
    const request = conversation.requests.find(item => item.id === requestId);
    if (!request) throw new AssistantStoreError('REQUEST_NOT_FOUND', `request not found: ${requestId}`);
    return request;
  }

  function assertMessage(conversation, messageId) {
    const message = conversation.messages.find(item => item.id === messageId);
    if (!message) throw new AssistantStoreError('MESSAGE_NOT_FOUND', `message not found: ${messageId}`);
    return message;
  }

  function hasAnyActiveRequest(state) {
    return Object.values(state.conversations).some(conversation =>
      conversation.requests.some(request => ACTIVE_REQUEST_STATUSES.has(request.status)));
  }

  function activeRequestForConversation(conversation) {
    return conversation.requests.find(request => ACTIVE_REQUEST_STATUSES.has(request.status)) || null;
  }

  function applyEvent(state, event) {
    if (!event || event.schemaVersion !== SCHEMA_VERSION || !Number.isInteger(event.seq) || event.seq < 1) {
      throw new AssistantStoreError('STORE_CORRUPT', 'assistant event header is invalid');
    }
    if (event.seq !== state.revision + 1) {
      throw new AssistantStoreError('STORE_CORRUPT', `assistant event sequence gap at ${event.seq}`);
    }
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const at = requiredText(event.at, 64, 'event.at');

    switch (event.type) {
      case 'conversation.create': {
        const id = requiredText(payload.id, 160, 'conversation.id');
        if (state.conversations[id]) throw new AssistantStoreError('STORE_CORRUPT', `duplicate conversation id: ${id}`);
        state.conversations[id] = {
          id,
          title: DEFAULT_TITLE,
          titleSource: 'default',
          archived: false,
          createdAt: at,
          updatedAt: at,
          lastActivityAt: at,
          draft: '',
          messages: [],
          requests: [],
        };
        if (payload.select !== false) state.selectedConversationId = id;
        break;
      }
      case 'conversation.select': {
        const conversation = assertConversation(state, payload.id);
        if (conversation.archived) throw new AssistantStoreError('STORE_CORRUPT', 'archived conversation cannot be selected');
        state.selectedConversationId = conversation.id;
        break;
      }
      case 'conversation.rename': {
        const conversation = assertConversation(state, payload.id);
        conversation.title = requiredText(payload.title, 120, 'title');
        conversation.titleSource = 'manual';
        conversation.updatedAt = at;
        break;
      }
      case 'conversation.draft': {
        const conversation = assertConversation(state, payload.id);
        conversation.draft = cleanText(payload.draft, 20000, 'draft');
        conversation.updatedAt = at;
        break;
      }
      case 'conversation.archive': {
        const conversation = assertConversation(state, payload.id);
        if (activeRequestForConversation(conversation)) {
          throw new AssistantStoreError('CONVERSATION_BUSY', 'cannot archive a conversation with an active request');
        }
        conversation.archived = true;
        conversation.updatedAt = at;
        if (state.selectedConversationId === conversation.id) state.selectedConversationId = null;
        break;
      }
      case 'conversation.restore': {
        const conversation = assertConversation(state, payload.id);
        conversation.archived = false;
        conversation.updatedAt = at;
        conversation.lastActivityAt = at;
        if (payload.select !== false) state.selectedConversationId = conversation.id;
        break;
      }
      case 'conversation.delete': {
        const conversation = assertConversation(state, payload.id);
        if (activeRequestForConversation(conversation)) {
          throw new AssistantStoreError('CONVERSATION_BUSY', 'cannot delete a conversation with an active request');
        }
        delete state.conversations[conversation.id];
        if (state.selectedConversationId === conversation.id) state.selectedConversationId = null;
        break;
      }
      case 'request.create': {
        const conversation = assertConversation(state, payload.conversationId);
        if (conversation.archived) throw new AssistantStoreError('CONVERSATION_ARCHIVED', 'cannot send in an archived conversation');
        if (hasAnyActiveRequest(state)) throw new AssistantStoreError('REQUEST_BUSY', 'another assistant request is active');
        const requestId = requiredText(payload.requestId, 160, 'requestId');
        const userMessageId = requiredText(payload.userMessageId, 160, 'userMessageId');
        const assistantMessageId = requiredText(payload.assistantMessageId, 160, 'assistantMessageId');
        const text = requiredText(payload.text, 20000, 'message');
        if (conversation.requests.some(item => item.id === requestId)) {
          throw new AssistantStoreError('STORE_CORRUPT', `duplicate request id: ${requestId}`);
        }
        if (conversation.messages.some(item => item.id === userMessageId || item.id === assistantMessageId)) {
          throw new AssistantStoreError('STORE_CORRUPT', 'duplicate message id');
        }
        conversation.requests.push({
          id: requestId,
          conversationId: conversation.id,
          userMessageId,
          assistantMessageId,
          status: 'pending',
          error: null,
          createdAt: at,
          updatedAt: at,
        });
        conversation.messages.push({
          id: userMessageId,
          conversationId: conversation.id,
          requestId,
          role: 'user',
          status: 'completed',
          text,
          error: null,
          createdAt: at,
          updatedAt: at,
        }, {
          id: assistantMessageId,
          conversationId: conversation.id,
          requestId,
          role: 'assistant',
          status: 'pending',
          text: '',
          error: null,
          createdAt: at,
          updatedAt: at,
        });
        conversation.draft = '';
        conversation.updatedAt = at;
        conversation.lastActivityAt = at;
        if (conversation.titleSource === 'default') {
          conversation.title = titleFromMessage(text);
          conversation.titleSource = 'generated';
        }
        break;
      }
      case 'request.stopping': {
        const conversation = assertConversation(state, payload.conversationId);
        const request = assertRequest(conversation, payload.requestId);
        if (!TERMINAL_REQUEST_STATUSES.has(request.status)) {
          request.status = 'stopping';
          request.updatedAt = at;
          const message = assertMessage(conversation, request.assistantMessageId);
          message.status = 'stopping';
          message.updatedAt = at;
          conversation.updatedAt = at;
        }
        break;
      }
      case 'request.transition': {
        const conversation = assertConversation(state, payload.conversationId);
        const request = assertRequest(conversation, payload.requestId);
        const status = String(payload.status || '');
        if (!TERMINAL_REQUEST_STATUSES.has(status)) {
          throw new AssistantStoreError('STORE_CORRUPT', `invalid terminal request status: ${status}`);
        }
        if (TERMINAL_REQUEST_STATUSES.has(request.status)) {
          if (request.status === status) break;
          throw new AssistantStoreError('STALE_REQUEST', `request already ended as ${request.status}`);
        }
        const message = assertMessage(conversation, request.assistantMessageId);
        request.status = status;
        request.updatedAt = at;
        request.error = payload.error && typeof payload.error === 'object' ? clone(payload.error) : null;
        message.status = status;
        message.text = cleanText(payload.text, 20000, 'assistant message');
        message.error = request.error;
        message.updatedAt = at;
        conversation.updatedAt = at;
        conversation.lastActivityAt = at;
        break;
      }
      default:
        throw new AssistantStoreError('STORE_CORRUPT', `unknown assistant event: ${event.type}`);
    }

    state.revision = event.seq;
    return state;
  }

  function sortRecent(a, b) {
    const activity = String(b.lastActivityAt).localeCompare(String(a.lastActivityAt));
    return activity || String(b.createdAt).localeCompare(String(a.createdAt));
  }

  function createStore(options) {
    const settings = options || {};
    const file = settings.file || global.File;
    const rootDir = settings.rootDir;
    const clock = settings.clock || (() => new Date());
    const logger = settings.logger || global.console;
    const randomUUID = settings.randomUUID || (global.crypto && typeof global.crypto.randomUUID === 'function' ? () => global.crypto.randomUUID() : null);
    if (!file || typeof file.join !== 'function' || typeof file.ensureDir !== 'function'
      || typeof file.exists !== 'function' || typeof file.listDir !== 'function'
      || typeof file.readJSON !== 'function' || typeof file.writeJSON !== 'function') {
      throw new AssistantStoreError('INVALID_STORE', 'assistant store requires File join/ensureDir/exists/listDir/readJSON/writeJSON');
    }
    if (!rootDir) throw new AssistantStoreError('INVALID_STORE', 'assistant store rootDir is required');

    const eventsDir = file.join(rootDir, 'events');
    let state = initialState();
    let loaded = false;
    let idCounter = 0;
    let writeChain = Promise.resolve();

    function allocateId(prefix) {
      const safePrefix = String(prefix || 'id').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'id';
      idCounter += 1;
      if (randomUUID) return `${safePrefix}-${randomUUID()}`;
      return `${safePrefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
    }

    function eventFileName(seq) {
      return `${String(seq).padStart(12, '0')}.json`;
    }

    async function load() {
      if (loaded) return snapshot();
      file.ensureDir(rootDir);
      file.ensureDir(eventsDir);
      const names = file.listDir(eventsDir)
        .map(name => String(name))
        .filter(name => EVENT_FILE_PATTERN.test(name))
        .sort();
      const next = initialState();
      for (const name of names) {
        const match = EVENT_FILE_PATTERN.exec(name);
        const seq = Number(match[1]);
        if (seq !== next.revision + 1) {
          throw new AssistantStoreError('STORE_CORRUPT', `assistant event file sequence gap at ${name}`);
        }
        let event;
        try {
          event = await file.readJSON(file.join(eventsDir, name), {maxBytes: 512 * 1024});
        } catch (error) {
          throw new AssistantStoreError('STORE_CORRUPT', `assistant event file cannot be read: ${name}`, {cause: error});
        }
        applyEvent(next, event);
      }
      state = next;
      loaded = true;
      if (!Object.keys(state.conversations).length) await createConversation();
      if (!state.selectedConversationId) {
        const first = Object.values(state.conversations).filter(item => !item.archived).sort(sortRecent)[0];
        if (first) await selectConversation(first.id);
      }
      return snapshot();
    }

    function appendEvent(type, payload) {
      if (!loaded) return Promise.reject(new AssistantStoreError('STORE_NOT_READY', 'assistant store is not loaded'));
      const task = writeChain.then(async () => {
        const event = {
          schemaVersion: SCHEMA_VERSION,
          seq: state.revision + 1,
          type,
          at: nowISO(clock),
          payload: clone(payload || {}),
        };
        const next = clone(state);
        applyEvent(next, event);
        const target = file.join(eventsDir, eventFileName(event.seq));
        if (file.exists(target)) {
          throw new AssistantStoreError('STORE_CORRUPT', `assistant event already exists: ${eventFileName(event.seq)}`);
        }
        try {
          // Events are immutable. writeJSON only creates a new target, so P0.1
          // never relies on the Windows "replace an existing file" path.
          await file.writeJSON(target, event, {spaces: 0, createDirs: true, maxBytes: 512 * 1024});
        } catch (error) {
          throw new AssistantStoreError('PERSIST_FAILED', '无法保存 AI 助手会话数据；本次更改未标记为已保存。', {cause: error});
        }
        state = next;
        return event;
      });
      writeChain = task.catch(() => {});
      return task;
    }

    async function recoverInterrupted() {
      if (!loaded) throw new AssistantStoreError('STORE_NOT_READY', 'assistant store is not loaded');
      const pending = [];
      for (const conversation of Object.values(state.conversations)) {
        for (const request of conversation.requests) {
          if (ACTIVE_REQUEST_STATUSES.has(request.status)) pending.push({conversationId: conversation.id, requestId: request.id});
        }
      }
      for (const item of pending) {
        await transitionRequest({
          conversationId: item.conversationId,
          requestId: item.requestId,
          status: 'interrupted',
          text: '上次请求因应用关闭或中断而结束，未自动重新发送。',
          error: {code: 'INTERRUPTED', message: 'request did not finish before the previous assistant session ended'},
        });
      }
      return pending.length;
    }

    function conversationCopy(conversation) {
      return conversation ? clone(conversation) : null;
    }

    function snapshot() {
      const recent = Object.values(state.conversations).filter(item => !item.archived).sort(sortRecent).map(conversationCopy);
      const archived = Object.values(state.conversations).filter(item => item.archived).sort(sortRecent).map(conversationCopy);
      const selected = state.selectedConversationId ? state.conversations[state.selectedConversationId] : null;
      return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        revision: state.revision,
        selectedConversationId: selected ? selected.id : null,
        selectedConversation: conversationCopy(selected),
        recent,
        archived,
        eventsDir,
      });
    }

    function getConversation(id) {
      return conversationCopy(assertConversation(state, id));
    }

    function getModelMessages(id) {
      const conversation = assertConversation(state, id);
      return conversation.messages
        .filter(message => message.role === 'user' || (message.role === 'assistant' && message.status === 'completed'))
        .map(message => ({role: message.role, content: message.text}));
    }

    async function createConversation() {
      const id = allocateId('conv');
      await appendEvent('conversation.create', {id, select: true});
      return getConversation(id);
    }

    async function selectConversation(id) {
      await appendEvent('conversation.select', {id});
      return getConversation(id);
    }

    async function renameConversation(id, title) {
      await appendEvent('conversation.rename', {id, title});
      return getConversation(id);
    }

    async function setDraft(id, draft) {
      const conversation = assertConversation(state, id);
      const nextDraft = cleanText(draft, 20000, 'draft');
      if (conversation.draft === nextDraft) return conversationCopy(conversation);
      await appendEvent('conversation.draft', {id, draft: nextDraft});
      return getConversation(id);
    }

    async function archiveConversation(id) {
      await appendEvent('conversation.archive', {id});
      if (!state.selectedConversationId) {
        const replacement = Object.values(state.conversations).filter(item => !item.archived).sort(sortRecent)[0];
        if (replacement) await selectConversation(replacement.id);
        else await createConversation();
      }
      return snapshot();
    }

    async function restoreConversation(id) {
      await appendEvent('conversation.restore', {id, select: true});
      return getConversation(id);
    }

    async function deleteConversation(id) {
      const conversation = assertConversation(state, id);
      const wasSelected = state.selectedConversationId === conversation.id;
      await appendEvent('conversation.delete', {id: conversation.id});
      if (wasSelected) await createConversation();
      return snapshot();
    }

    async function beginRequest(input) {
      const data = input || {};
      const conversationId = requiredText(data.conversationId, 160, 'conversationId');
      const requestId = requiredText(data.requestId, 160, 'requestId');
      const userMessageId = requiredText(data.userMessageId, 160, 'userMessageId');
      const assistantMessageId = requiredText(data.assistantMessageId, 160, 'assistantMessageId');
      const text = requiredText(data.text, 20000, 'message');
      await appendEvent('request.create', {conversationId, requestId, userMessageId, assistantMessageId, text});
      return Object.freeze({conversationId, requestId, userMessageId, assistantMessageId});
    }

    async function markStopping(conversationId, requestId) {
      await appendEvent('request.stopping', {conversationId, requestId});
      return requestStatus(conversationId, requestId);
    }

    async function transitionRequest(input) {
      const data = input || {};
      await appendEvent('request.transition', {
        conversationId: data.conversationId,
        requestId: data.requestId,
        status: data.status,
        text: data.text || '',
        error: data.error || null,
      });
      return requestStatus(data.conversationId, data.requestId);
    }

    function requestStatus(conversationId, requestId) {
      const conversation = assertConversation(state, conversationId);
      return assertRequest(conversation, requestId).status;
    }

    return Object.freeze({
      load,
      recoverInterrupted,
      snapshot,
      getConversation,
      getModelMessages,
      createConversation,
      selectConversation,
      renameConversation,
      setDraft,
      archiveConversation,
      restoreConversation,
      deleteConversation,
      allocateId,
      beginRequest,
      markStopping,
      transitionRequest,
      requestStatus,
      paths: Object.freeze({rootDir, eventsDir}),
    });
  }

  global.OpenDeskAssistantStore = Object.freeze({
    create: createStore,
    AssistantStoreError,
    constants: Object.freeze({schemaVersion: SCHEMA_VERSION, defaultTitle: DEFAULT_TITLE}),
    titleFromMessage,
  });
})(globalThis);
