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

  function deferred() {
    let resolve;
    const promise = new Promise(res => { resolve = res; });
    return {promise, resolve};
  }

  function publicTaskState(task) {
    if (!task) return null;
    return Object.freeze({
      taskId: task.taskId,
      phase: task.phase,
      preview: task.preview || '',
      envelope: task.envelope || null,
      progress: task.progress || null,
      result: task.result || null,
      error: task.error || null,
    });
  }

  function createSession(options) {
    const settings = options || {};
    const store = settings.store;
    const channel = settings.channel;
    const taskService = settings.taskService || null;
    const AbortControllerImpl = settings.AbortController || global.AbortController;
    const logger = settings.logger || global.console;
    const onChange = typeof settings.onChange === 'function' ? settings.onChange : async () => {};
    if (!store || typeof store.load !== 'function' || typeof store.beginRequest !== 'function') {
      throw new AssistantSessionError('INVALID_SESSION', 'assistant session requires a store');
    }
    if (!channel || typeof channel.send !== 'function' || typeof channel.statusText !== 'function') {
      throw new AssistantSessionError('INVALID_SESSION', 'assistant session requires a model channel');
    }
    if (taskService && (typeof taskService.shouldHandle !== 'function'
      || typeof taskService.plan !== 'function'
      || typeof taskService.execute !== 'function'
      || typeof taskService.preview !== 'function'
      || typeof taskService.freezeEnvelope !== 'function')) {
      throw new AssistantSessionError('INVALID_SESSION', 'assistant task service is invalid');
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
          task: publicTaskState(active.taskState),
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
            message: `已将 ${recovered} 个上次未完成请求标记为中断；没有自动重发或自动执行。`,
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

    async function performChatRequest(entry, messages) {
      const result = await channel.send({messages, signal: entry.controller.signal, requestId: entry.requestId});
      if (entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '请求已停止；迟到回复已丢弃。'});
        return;
      }
      await finishRequest(entry, {status: 'completed', text: result.text});
    }

    async function performTaskRequest(entry, text) {
      entry.taskState = {
        taskId: entry.requestId,
        phase: 'planning',
        preview: '',
        envelope: null,
        progress: Object.freeze({phase: 'planning'}),
        result: null,
        error: null,
      };
      await publish();

      const plannedEnvelope = await taskService.plan(text, {signal: entry.controller.signal, requestId: entry.requestId});
      if (entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '任务已停止。'});
        return;
      }

      // Planning data is untrusted until this second host-owned validation and
      // copy.  The preview and later execution both consume this exact frozen
      // envelope; planner prose or a mutable caller object cannot alter it.
      const envelope = taskService.freezeEnvelope(plannedEnvelope);

      if (envelope.kind !== 'task') {
        entry.taskState.phase = envelope.kind;
        entry.taskState.envelope = envelope;
        entry.taskState.progress = null;
        await publish();
        await finishRequest(entry, {status: 'completed', text: envelope.message});
        return;
      }

      entry.taskState.phase = 'awaitingConfirmation';
      entry.taskState.envelope = envelope;
      entry.taskState.preview = taskService.preview(envelope);
      entry.taskState.progress = null;
      entry.decision = deferred();
      await publish();

      const confirmed = await entry.decision.promise;
      if (!confirmed || entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '任务已取消；没有继续提交新的桌面动作。'});
        return;
      }

      entry.taskState.phase = 'running';
      entry.taskState.progress = Object.freeze({phase: 'starting'});
      await publish();
      const result = await taskService.execute(envelope, {
        signal: entry.controller.signal,
        requestId: entry.requestId,
        onProgress: async progress => {
          if (disposed || active !== entry || entry.stopRequested || entry.controller.signal.aborted) return;
          entry.taskState.progress = progress && typeof progress === 'object' ? Object.freeze({...progress}) : null;
          await publish();
        },
      });
      if (entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '自动化任务已停止；迟到结果已丢弃。'});
        return;
      }
      entry.taskState.phase = 'completed';
      entry.taskState.progress = Object.freeze({phase: 'completed'});
      entry.taskState.result = result;
      await publish();
      await finishRequest(entry, {status: 'completed', text: taskService.resultText(result, envelope)});
    }

    async function performRequest(entry, messages, text) {
      try {
        if (taskService && taskService.shouldHandle(text)) {
          await performTaskRequest(entry, text);
        } else {
          await performChatRequest(entry, messages);
        }
      } catch (error) {
        if (entry.stopRequested || entry.controller.signal.aborted || isCanceled(error)) {
          await finishRequest(entry, {status: 'stopped', text: entry.taskState ? '自动化任务已停止。' : '请求已停止。'});
        } else {
          const details = publicError(error);
          lastError = details;
          if (entry.taskState) {
            entry.taskState.phase = 'failed';
            entry.taskState.error = Object.freeze(details);
            entry.taskState.progress = null;
            await publish();
          }
          await finishRequest(entry, {
            status: 'failed',
            text: `${entry.taskState ? '任务失败' : '请求失败'}：${details.code}: ${details.message}`,
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
      if (submitting) {
        throw new AssistantSessionError('REQUEST_BUSY', '已有请求或自动化任务正在处理；可以切换会话或编辑其他草稿，但不能创建隐形队列。');
      }
      if (active) {
        // A new natural-language task is the only supported way to revise a
        // preview.  Cancel the old frozen envelope first, wait for its
        // lifecycle to settle, then create a brand-new request/confirmation.
        // This makes an old confirmation unambiguously stale and never queues
        // a second desktop-capable task behind it.
        if (active.taskState && active.taskState.phase === 'awaitingConfirmation') {
          const previous = active;
          await cancelTask(previous.taskState.taskId, '任务已修改；旧执行预览已失效，确认前没有执行桌面动作。');
          if (previous.lifecycle) await previous.lifecycle;
        } else {
          throw new AssistantSessionError('REQUEST_BUSY', '已有请求或自动化任务正在处理；可以切换会话或编辑其他草稿，但不能创建隐形队列。');
        }
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
        // Freeze and persist identities before any real model/planner call. A
        // failed persistence step therefore cannot produce an untracked request.
        await store.beginRequest({...ids, text});
        const entry = {
          ...ids,
          controller: new AbortControllerImpl(),
          stopRequested: false,
          taskState: null,
          decision: null,
          lifecycle: null,
        };
        active = entry;
        submitting = false;
        persistenceError = null;
        const messages = store.getModelMessages(current.id);
        await publish();
        const lifecycle = performRequest(entry, messages, text);
        entry.lifecycle = lifecycle;
        void lifecycle.catch(error => {
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

    async function confirmTask(taskId) {
      assertReady();
      const entry = active;
      if (!entry || !entry.taskState || entry.taskState.taskId !== taskId
          || entry.taskState.phase !== 'awaitingConfirmation' || !entry.decision) {
        throw new AssistantSessionError('STALE_CONFIRMATION', '当前没有可确认的自动化任务，或执行预览已经失效。');
      }
      if (entry.executionStarted) {
        throw new AssistantSessionError('DUPLICATE_EXECUTION', '该自动化任务已经开始执行。');
      }
      entry.executionStarted = true;
      entry.taskState.phase = 'starting';
      entry.taskState.progress = Object.freeze({phase: 'starting'});
      await publish();
      entry.decision.resolve(true);
      return true;
    }

    async function cancelTask(taskId, stoppedText) {
      assertReady();
      const entry = active;
      if (!entry || !entry.taskState || entry.taskState.taskId !== taskId
          || entry.taskState.phase !== 'awaitingConfirmation') return false;
      entry.stopRequested = true;
      entry.controller.abort('task-cancel');
      if (entry.decision) entry.decision.resolve(false);
      try {
        await store.markStopping(entry.conversationId, entry.requestId);
        await store.transitionRequest({
          conversationId: entry.conversationId,
          requestId: entry.requestId,
          status: 'stopped',
          text: stoppedText || '任务已取消；确认前没有执行桌面动作。',
          error: null,
        });
        persistenceError = null;
      } catch (error) {
        recordPersistenceError(error);
      }
      await publish();
      return true;
    }

    async function stop() {
      assertReady();
      const entry = active;
      if (!entry) return false;
      if (entry.stopRequested) return true;
      entry.stopRequested = true;
      // Abort first: rendering or persistence latency must not leave a real
      // planner/model/desktop request running after the user asked to stop it.
      entry.controller.abort('user-stop');
      if (entry.decision) entry.decision.resolve(false);
      try {
        await store.markStopping(entry.conversationId, entry.requestId);
        await store.transitionRequest({
          conversationId: entry.conversationId,
          requestId: entry.requestId,
          status: 'stopped',
          text: entry.taskState ? '自动化任务已停止。' : '请求已停止。',
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
      confirmTask,
      cancelTask,
      stop,
      close,
    });
  }

  global.OpenDeskAssistantSession = Object.freeze({create: createSession, AssistantSessionError});
})(globalThis);
