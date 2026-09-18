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
    const taskRuntime = settings.taskRuntime || null;
    const sessionId = String(settings.sessionId || '');
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
    if (taskRuntime && (typeof taskRuntime.startTask !== 'function'
      || typeof taskRuntime.latestForConversation !== 'function'
      || typeof taskRuntime.prepareUse !== 'function'
      || typeof taskRuntime.confirmUse !== 'function'
      || typeof taskRuntime.generateCandidate !== 'function'
      || typeof taskRuntime.saveCandidateAs !== 'function'
      || typeof taskRuntime.explain !== 'function')) {
      throw new AssistantSessionError('INVALID_SESSION', 'assistant task runtime is invalid');
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
    let taskWorkspace = null;

    function assertReady() {
      if (!initialized) throw new AssistantSessionError('SESSION_NOT_READY', 'assistant session is not initialized');
      if (disposed) throw new AssistantSessionError('SESSION_CLOSED', 'assistant session is closed');
    }

    async function refreshTaskWorkspace(conversationId) {
      if (!taskRuntime || !conversationId) {
        taskWorkspace = null;
        return null;
      }
      taskWorkspace = await taskRuntime.latestForConversation(conversationId);
      return taskWorkspace;
    }

    function snapshot() {
      const stored = store.snapshot();
      return Object.freeze({
        ...stored,
        taskWorkspace: taskWorkspace && taskWorkspace.task
          && taskWorkspace.task.conversationId === stored.selectedConversationId ? taskWorkspace : null,
        modelStatus: channel.statusText(),
        modelHelp: channel.helpText(),
        activeRequest: active ? Object.freeze({
          conversationId: active.conversationId,
          requestId: active.requestId,
          userMessageId: active.userMessageId,
          assistantMessageId: active.assistantMessageId,
          stopping: active.stopRequested === true,
          task: publicTaskState(active.taskState),
          executionId: active.executionId || '',
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
      await refreshTaskWorkspace(store.snapshot().selectedConversationId);
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
        await refreshTaskWorkspace(conversation.id);
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
        await refreshTaskWorkspace(conversation.id);
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
        await refreshTaskWorkspace(result.selectedConversationId);
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
        await refreshTaskWorkspace(conversation.id);
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

    async function deleteConversation(id) {
      assertReady();
      try {
        const result = await store.deleteConversation(id);
        await refreshTaskWorkspace(result.selectedConversationId);
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

      entry.taskState.phase = 'starting';
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

    async function performAssetTaskRequest(entry, text, taskOptions) {
      if (!taskRuntime) throw new AssistantSessionError('TASK_RUNTIME_UNAVAILABLE', '任务与资产运行时不可用。');
      entry.taskState = {
        taskId: entry.requestId,
        phase: 'preparing',
        preview: '',
        envelope: null,
        progress: Object.freeze({phase: 'preparing'}),
        result: null,
        error: null,
      };
      await publish();

      let task = await taskRuntime.startTask({
        taskId: entry.requestId,
        conversationId: entry.conversationId,
        sessionId,
        requestId: entry.requestId,
        userGoal: text,
        intent: taskOptions.intent,
        asset: taskOptions.asset || {kind: 'none'},
        authorizations: taskOptions.authorizations || {},
        businessCwd: taskOptions.businessCwd || '',
        projectId: taskOptions.projectId || '',
        projectRecordRef: taskOptions.projectRecordRef || '',
      });
      await refreshTaskWorkspace(entry.conversationId);
      if (entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '任务已停止；没有恢复旧确认或自动执行。'});
        return;
      }

      if (task.intent === 'explain') {
        entry.taskState.phase = 'explaining';
        entry.taskState.progress = Object.freeze({phase: 'explaining'});
        await publish();
        const explained = await taskRuntime.explain(task.taskId, {signal: entry.controller.signal});
        task = explained.task;
        await refreshTaskWorkspace(entry.conversationId);
        entry.taskState.phase = 'completed';
        entry.taskState.progress = Object.freeze({phase: 'completed'});
        entry.taskState.result = Object.freeze({taskId: task.taskId, status: task.status});
        await publish();
        await finishRequest(entry, {status: 'completed', text: explained.text});
        return;
      }

      if (task.intent === 'make' || task.intent === 'improve') {
        entry.taskState.phase = 'drafting';
        entry.taskState.progress = Object.freeze({phase: 'drafting'});
        await publish();
        const generated = await taskRuntime.generateCandidate(task.taskId, {signal: entry.controller.signal});
        await refreshTaskWorkspace(entry.conversationId);
        entry.taskState.phase = 'candidateReview';
        entry.taskState.preview = generated.candidate.content;
        entry.taskState.progress = null;
        entry.taskState.result = Object.freeze({
          candidateId: generated.candidate.candidateId,
          status: generated.candidate.status,
          independentlyVerified: generated.candidate.independentlyVerified === true,
        });
        await publish();
        await finishRequest(entry, {
          status: 'completed',
          text: '已生成可审阅候选；尚未保存、安装、运行或独立验证。请在任务面板中确认内容后另存。',
        });
        return;
      }

      if (task.intent !== 'use') {
        throw new AssistantSessionError('INVALID_TASK_INTENT', '当前任务意图不受支持。');
      }

      const prepared = await taskRuntime.prepareUse(task.taskId, taskOptions.input || {}, {signal: entry.controller.signal});
      await refreshTaskWorkspace(entry.conversationId);
      if (prepared.kind === 'clarify') {
        entry.taskState.phase = 'clarify';
        entry.taskState.preview = '';
        entry.taskState.progress = null;
        await publish();
        await finishRequest(entry, {status: 'completed', text: prepared.message});
        return;
      }

      entry.preparedUse = prepared;
      entry.taskState.phase = 'awaitingConfirmation';
      entry.taskState.preview = prepared.preview;
      entry.taskState.envelope = Object.freeze({
        kind: 'asset-use',
        taskId: prepared.task.taskId,
        taskRevision: prepared.task.revision,
        asset: prepared.task.asset,
      });
      entry.taskState.progress = null;
      entry.decision = deferred();
      await publish();

      const confirmed = await entry.decision.promise;
      if (!confirmed || entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '任务已取消；没有启动新的业务 Execution。'});
        return;
      }

      entry.taskState.phase = 'running';
      entry.taskState.progress = Object.freeze({phase: 'starting'});
      await publish();
      const outcome = await taskRuntime.confirmUse(
        prepared.task.taskId,
        prepared.prepared,
        prepared.prepared.confirmationToken,
        {
          signal: entry.controller.signal,
          onReserved: async executionId => {
            if (active !== entry || entry.stopRequested || entry.controller.signal.aborted) return;
            entry.executionId = String(executionId || '');
            entry.taskState.progress = Object.freeze({phase: 'reserved', executionId: entry.executionId});
            await refreshTaskWorkspace(entry.conversationId);
            await publish();
          },
        },
      );
      await refreshTaskWorkspace(entry.conversationId);
      if (entry.stopRequested || entry.controller.signal.aborted) {
        await finishRequest(entry, {status: 'stopped', text: '停止请求已提交；迟到结果不会覆盖停止状态。'});
        return;
      }
      entry.executionId = outcome.run.executionId;
      entry.taskState.phase = 'completed';
      entry.taskState.progress = Object.freeze({phase: 'completed', executionId: outcome.run.executionId});
      entry.taskState.result = outcome.run;
      await publish();
      const terminal = outcome.run.businessVerified === true
        ? 'Execution 已结束，且已有独立业务验证证据。'
        : 'Execution 已结束；当前只有 Runtime 终态，没有独立业务成功证明。';
      await finishRequest(entry, {
        status: 'completed',
        text: '实际 Execution：' + outcome.run.executionId + '\nRuntime 状态：' + outcome.run.status + '\n' + terminal,
      });
    }

    async function performRequest(entry, messages, text) {
      try {
        if (entry.taskOptions && entry.taskOptions.intent && entry.taskOptions.intent !== 'chat') {
          await performAssetTaskRequest(entry, text, entry.taskOptions);
        } else if (taskService && taskService.shouldHandle(text)) {
          await performTaskRequest(entry, text);
        } else {
          await performChatRequest(entry, messages);
        }
      } catch (error) {
        if (entry.taskState && taskRuntime) {
          try { await refreshTaskWorkspace(entry.conversationId); } catch (_) {}
        }
        const workspaceTask = taskWorkspace && taskWorkspace.task
          && taskWorkspace.task.conversationId === entry.conversationId ? taskWorkspace.task : null;
        const hostCanceled = !!(workspaceTask && workspaceTask.status === 'canceled');
        const effectUnknown = !!(workspaceTask && workspaceTask.status === 'execution-effect-unknown');

        if (effectUnknown && entry.executionId) {
          const details = publicError(error);
          entry.taskState.phase = 'unknown';
          entry.taskState.error = Object.freeze(details);
          entry.taskState.progress = Object.freeze({
            phase: 'unknown',
            executionId: entry.executionId,
            effect: 'unknown',
          });
          await publish();
          await finishRequest(entry, {
            status: 'interrupted',
            text: '停止请求后无法证明实际 Execution 已安全终止。Execution：'
              + entry.executionId + '。业务效果保持未知，不会自动重试。',
            error: {code: 'EXECUTION_EFFECT_UNKNOWN', message: details.message},
          });
        } else if (entry.stopRequested || entry.controller.signal.aborted || isCanceled(error)) {
          if (!entry.executionId || hostCanceled || !entry.taskState) {
            await finishRequest(entry, {
              status: 'stopped',
              text: entry.taskState ? '自动化任务已停止；没有把迟到结果当作成功。' : '请求已停止。',
            });
          } else {
            const details = publicError(error);
            entry.taskState.phase = 'unknown';
            entry.taskState.error = Object.freeze(details);
            entry.taskState.progress = Object.freeze({
              phase: 'unknown',
              executionId: entry.executionId,
              effect: 'unknown',
            });
            await publish();
            await finishRequest(entry, {
              status: 'interrupted',
              text: '已请求停止 Execution ' + entry.executionId
                + '，但当前没有宿主终态证明。业务效果保持未知，不会自动重试。',
              error: {code: 'EXECUTION_TERMINAL_UNVERIFIED', message: details.message},
            });
          }
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
            text: (entry.taskState ? '任务失败' : '请求失败') + '：' + details.code + ': ' + details.message,
            error: details,
          });
        }
      } finally {
        if (active === entry) active = null;
        await publish();
      }
    }

    async function submit(text, taskOptions) {
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
          taskOptions: taskOptions && typeof taskOptions === 'object' ? Object.freeze({...taskOptions}) : null,
          executionId: '',
          preparedUse: null,
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
      entry.controller.abort('user-stop');
      if (entry.decision) entry.decision.resolve(false);
      if (entry.taskState) {
        entry.taskState.phase = 'stopping';
        entry.taskState.progress = Object.freeze({
          phase: 'stopping',
          executionId: entry.executionId || '',
          effect: entry.executionId ? 'unknown-until-execution-settles' : 'no-new-execution-confirmed',
        });
      }
      try {
        await store.markStopping(entry.conversationId, entry.requestId);
        persistenceError = null;
      } catch (error) {
        recordPersistenceError(error);
      }
      await publish();
      return true;
    }

    async function saveCandidate(taskId, candidateId, destination) {
      assertReady();
      if (!taskRuntime) throw new AssistantSessionError('TASK_RUNTIME_UNAVAILABLE', '任务运行时不可用。');
      const result = await taskRuntime.saveCandidateAs(taskId, candidateId, destination);
      await refreshTaskWorkspace(result.task.conversationId);
      await publish();
      return result;
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
      deleteConversation,
      submit,
      confirmTask,
      cancelTask,
      stop,
      saveCandidate,
      close,
    });
  }

  global.OpenDeskAssistantSession = Object.freeze({create: createSession, AssistantSessionError});
})(globalThis);
