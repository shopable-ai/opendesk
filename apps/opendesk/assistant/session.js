(function installOpenDeskAssistantSession(global) {
  'use strict';

  const TERMINAL = new Set(['completed', 'stopped', 'failed', 'interrupted']);

  class AssistantSessionError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'AssistantSessionError';
      this.code = code;
      if (details && typeof details === 'object') Object.assign(this, details);
    }
  }

  function publicError(error) {
    return {
      code: String(error && (error.code || error.name) || 'ERROR').slice(0, 120),
      message: String(error && error.message || error || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 1000),
    };
  }

  function isCanceled(error) {
    return !!(error && (error.code === 'CANCELED' || error.name === 'AbortError'));
  }

  function createSession(options) {
    const settings = options || {};
    const store = settings.store;
    const channel = settings.channel;
    const AbortControllerImpl = settings.AbortController || global.AbortController;
    const logger = settings.logger || global.console;
    const onChange = typeof settings.onChange === 'function' ? settings.onChange : async () => {};
    if (!store || typeof store.load !== 'function' || typeof store.beginRequest !== 'function') {
      throw new AssistantSessionError('INVALID_SESSION', 'assistant session requires a store');
    }
    if (!channel || typeof channel.send !== 'function' || typeof channel.statusText !== 'function') {
      throw new AssistantSessionError('INVALID_SESSION', 'assistant session requires a model channel');
    }
    if (typeof AbortControllerImpl !== 'function') {
      throw new AssistantSessionError('INVALID_SESSION', 'AbortController is unavailable');
    }

    let initialized = false;
    let disposed = false;
    let submitting = false;
    let active = null;
    let lastError = null;
    let persistenceError = null;

    function assertReady() {
      if (!initialized) throw new AssistantSessionError('SESSION_NOT_READY', 'assistant session is not initialized');
      if (disposed) throw new AssistantSessionError('SESSION_CLOSED', 'assistant session is closed');
    }

    function snapshot() {
      const stored = store.snapshot();
      return Object.freeze({
        ...stored,
        modelStatus: channel.statusText(),
        modelHelp: channel.helpText(),
        activeRequest: active ? Object.freeze({
          conversationId: active.conversationId,
          requestId: active.requestId,
          userMessageId: active.userMessageId,
          assistantMessageId: active.assistantMessageId,
          stopping: active.stopRequested === true,
        }) : null,
        submitting,
        lastError,
        persistenceError,
      });
    }

    async function publish() {
      try {
        await onChange(snapshot());
      } catch (error) {
        if (logger && typeof logger.error === 'function') logger.error('[ASSISTANT] render failed:', error);
      }
    }

    function recordPersistenceError(error) {
      const details = publicError(error);
      persistenceError = Object.freeze(details);
      lastError = Object.freeze({code: 'PERSIST_FAILED', message: details.message});
    }

    async function initialize() {
      if (initialized) return snapshot();
      await store.load();
      initialized = true;
      try {
        const recovered = await store.recoverInterrupted();
        if (recovered > 0) {
          lastError = Object.freeze({
            code: 'INTERRUPTED_REQUEST_RECOVERED',
            message: `已将 ${recovered} 个上次未完成请求标记为中断；没有自动重发。`,
          });
        }
      } catch (error) {
        recordPersistenceError(error);
      }
      await publish();
      return snapshot();
    }

    function getConversation(id) {
      return store.getConversation(id);
    }

    async function createConversation() {
      assertReady();
      try {
        const conversation = await store.createConversation();
        lastError = null;
        await publish();
        return conversation;
      } catch (error) {
        recordPersistenceError(error);
        await publish();
        throw error;
      }
    }

    async function switchConversation(id) {
      assertReady();
      try {
        const conversation = await store.selectConversation(id);
        lastError = null;
        await publish();
        return conversation;
      } catch (error) {
        lastError = publicError(error);
        if (error && error.code === 'PERSIST_FAILED') recordPersistenceError(error);
        await publish();
        throw error;
      }
    }

    async function renameConversation(id, title) {
      assertReady();
      try {
        const conversation = await store.renameConversation(id, title);
        lastError = null;
        await publish();
        return conversation;
      } catch (error) {
        if (error && error.code === 'PERSIST_FAILED') recordPersistenceError(error);
        else lastError = publicError(error);
        await publish();
        throw error;
      }
    }

    async function updateDraft(id, draft) {
      assertReady();
      try {
        const conversation = await store.setDraft(id, draft);
        persistenceError = null;
        return conversation;
      } catch (error) {
        recordPersistenceError(error);
        await publish();
        throw error;
      }
    }

    async function archiveConversation(id) {
      assertReady();
      try {
        const result = await store.archiveConversation(id);
        lastError = null;
        await publish();
        return result;
      } catch (error) {
        lastError = publicError(error);
        if (error && error.code === 'PERSIST_FAILED') recordPersistenceError(error);
        await publish();
        throw error;
      }
    }

    async function restoreConversation(id) {
      assertReady();
      try {
        const conversation = await store.restoreConversation(id);
        lastError = null;
        await publish();
        return conversation;
      } catch (error) {
        lastError = publicError(error);
        if (error && error.code === 'PERSIST_FAILED') recordPersistenceError(error);
        await publish();
        throw error;
      }
    }

    async function finishRequest(entry, outcome) {
      if (!entry) return;
      try {
        const currentStatus = store.requestStatus(entry.conversationId, entry.requestId);
        if (TERMINAL.has(currentStatus)) return;
        await store.transitionRequest({
          conversationId: entry.conversationId,
          requestId: entry.requestId,
          status: outcome.status,
          text: outcome.text || '',
          error: outcome.error || null,
        });
        persistenceError = null;
      } catch (error) {
        recordPersistenceError(error);
      }
      await publish();
    }

    async function performRequest(entry, messages) {
      try {
        const result = await channel.send({messages, signal: entry.controller.signal, requestId: entry.requestId});
        if (entry.stopRequested || entry.controller.signal.aborted) {
          await finishRequest(entry, {status: 'stopped', text: '请求已停止；迟到回复已丢弃。'});
          return;
        }
        await finishRequest(entry, {status: 'completed', text: result.text});
      } catch (error) {
        if (entry.stopRequested || entry.controller.signal.aborted || isCanceled(error)) {
          await finishRequest(entry, {status: 'stopped', text: '请求已停止。'});
        } else {
          const details = publicError(error);
          lastError = details;
          await finishRequest(entry, {
            status: 'failed',
            text: `请求失败：${details.code}: ${details.message}`,
            error: details,
          });
        }
      } finally {
        if (active === entry) active = null;
        await publish();
      }
    }

    async function submit(text) {
      assertReady();
      if (submitting || active) {
        throw new AssistantSessionError('REQUEST_BUSY', '已有请求正在处理；可以切换会话或编辑其他草稿，但不能创建隐形队列。');
      }
      const current = store.snapshot().selectedConversation;
      if (!current) throw new AssistantSessionError('CONVERSATION_NOT_FOUND', '没有可发送的当前会话');
      submitting = true;
      lastError = null;
      await publish();
      try {
        const ids = {
          conversationId: current.id,
          requestId: store.allocateId('req'),
          userMessageId: store.allocateId('msg'),
          assistantMessageId: store.allocateId('msg'),
        };
        // Freeze and persist identities before the real model call. A failed
        // persistence step therefore cannot produce an untracked model request.
        await store.beginRequest({...ids, text});
        const entry = {
          ...ids,
          controller: new AbortControllerImpl(),
          stopRequested: false,
          task: null,
        };
        active = entry;
        submitting = false;
        persistenceError = null;
        const messages = store.getModelMessages(current.id);
        await publish();
        const task = performRequest(entry, messages);
        entry.task = task;
        void task.catch(error => {
          if (logger && typeof logger.error === 'function') logger.error('[ASSISTANT] request lifecycle failed:', error);
        });
        return Object.freeze(ids);
      } catch (error) {
        submitting = false;
        if (error && error.code === 'PERSIST_FAILED') recordPersistenceError(error);
        else lastError = publicError(error);
        await publish();
        throw error;
      }
    }

    async function stop() {
      assertReady();
      const entry = active;
      if (!entry) return false;
      if (entry.stopRequested) return true;
      entry.stopRequested = true;
      // Abort first: rendering or persistence latency must not leave the real
      // request running after the user asked to stop it.
      entry.controller.abort('user-stop');
      try {
        await store.markStopping(entry.conversationId, entry.requestId);
        await store.transitionRequest({
          conversationId: entry.conversationId,
          requestId: entry.requestId,
          status: 'stopped',
          text: '请求已停止。',
          error: null,
        });
        persistenceError = null;
      } catch (error) {
        recordPersistenceError(error);
      }
      await publish();
      return true;
    }

    async function close() {
      if (disposed) return;
      if (initialized && active) {
        try { await stop(); } catch (_) {}
      }
      disposed = true;
    }

    return Object.freeze({
      initialize,
      snapshot,
      getConversation,
      createConversation,
      switchConversation,
      renameConversation,
      updateDraft,
      archiveConversation,
      restoreConversation,
      submit,
      stop,
      close,
    });
  }

  global.OpenDeskAssistantSession = Object.freeze({create: createSession, AssistantSessionError});
})(globalThis);
