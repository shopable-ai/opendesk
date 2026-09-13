function abortError() {
  const error = new Error('Task canceled');
  error.name = 'AbortError';
  error.code = 'CANCELED';
  return error;
}

function isCanceled(error) {
  return Boolean(error && (error.name === 'AbortError' || error.code === 'CANCELED'));
}

function publicError(error) {
  if (!error) return {code: 'UNKNOWN', message: 'Unknown error'};
  return {
    code: String(error.code || error.name || 'ERROR'),
    message: String(error.message || error),
  };
}

function activePhase(phase) {
  return ['planning', 'awaitingConfirmation', 'running', 'stopping'].includes(phase);
}

export class TaskSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaskSessionError';
    this.code = code;
  }
}

export function createTaskSession(options) {
  const plan = options.plan;
  const execute = options.execute;
  const preview = options.preview;
  const freeze = options.freeze;
  const onState = typeof options.onState === 'function' ? options.onState : async () => {};
  if (typeof plan !== 'function' || typeof execute !== 'function' || typeof preview !== 'function' || typeof freeze !== 'function') {
    throw new TaskSessionError('INVALID_SESSION', 'plan/execute/preview/freeze functions are required');
  }

  let sequence = 0;
  let disposed = false;
  let current = null;

  function snapshot() {
    if (!current) return Object.freeze({taskId: null, phase: 'idle'});
    return Object.freeze({
      taskId: current.taskId,
      phase: current.phase,
      request: current.request,
      envelope: current.envelope || null,
      preview: current.preview || '',
      progress: current.progress || null,
      result: current.result || null,
      error: current.error || null,
    });
  }

  async function publish() {
    await onState(snapshot());
  }

  async function setPhase(task, phase, patch = {}) {
    if (disposed || current !== task) return false;
    Object.assign(task, patch, {phase});
    await publish();
    return true;
  }

  function assertUsable() {
    if (disposed) throw new TaskSessionError('SESSION_CLOSED', 'chat task session is closed');
  }

  async function submit(request) {
    assertUsable();
    if (current && ['planning', 'running', 'stopping'].includes(current.phase)) {
      throw new TaskSessionError('TASK_BUSY', 'another task is still active');
    }
    if (current && current.phase === 'awaitingConfirmation') {
      current.controller.abort('replanned');
      await setPhase(current, 'stopped', {error: {code: 'CONFIRMATION_INVALIDATED', message: '旧执行预览已失效。'}});
    }

    const task = {
      taskId: `chat-${Date.now()}-${++sequence}`,
      request,
      phase: 'planning',
      controller: new AbortController(),
      envelope: null,
      preview: '',
      progress: null,
      result: null,
      error: null,
      executionStarted: false,
    };
    current = task;
    await publish();

    try {
      const envelope = await plan(request, {signal: task.controller.signal, taskId: task.taskId});
      if (disposed || current !== task || task.controller.signal.aborted) throw abortError();
      if (envelope.kind !== 'task') {
        await setPhase(task, envelope.kind, {
          envelope,
          preview: '',
          error: null,
        });
        return snapshot();
      }
      const frozen = freeze(envelope);
      await setPhase(task, 'awaitingConfirmation', {
        envelope: frozen,
        preview: preview(frozen),
        error: null,
      });
      return snapshot();
    } catch (error) {
      if (disposed || current !== task) return snapshot();
      if (isCanceled(error) || task.controller.signal.aborted) {
        await setPhase(task, 'stopped', {error: null});
        return snapshot();
      }
      await setPhase(task, 'error', {error: publicError(error)});
      return snapshot();
    }
  }

  async function invalidateConfirmation(reason = '输入已修改，旧执行预览失效。') {
    assertUsable();
    if (!current || current.phase !== 'awaitingConfirmation') return false;
    current.controller.abort('confirmation-invalidated');
    await setPhase(current, 'stopped', {
      envelope: null,
      preview: '',
      error: {code: 'CONFIRMATION_INVALIDATED', message: reason},
    });
    return true;
  }

  async function confirm(taskId) {
    assertUsable();
    const task = current;
    if (!task || task.taskId !== taskId || task.phase !== 'awaitingConfirmation') {
      throw new TaskSessionError('STALE_CONFIRMATION', 'execution preview is stale or no longer confirmable');
    }
    if (task.executionStarted) throw new TaskSessionError('DUPLICATE_EXECUTION', 'task execution already started');
    task.executionStarted = true;
    await setPhase(task, 'running', {progress: {phase: 'starting'}});

    try {
      if (task.controller.signal.aborted) throw abortError();
      const result = await execute(task.envelope, {
        signal: task.controller.signal,
        taskId: task.taskId,
        onProgress: async (progress) => {
          if (disposed || current !== task || task.controller.signal.aborted) return;
          task.progress = progress;
          await publish();
        },
      });
      if (disposed || current !== task || task.controller.signal.aborted) throw abortError();
      await setPhase(task, 'completed', {result, progress: {phase: 'completed'}, error: null});
      return snapshot();
    } catch (error) {
      if (disposed || current !== task) return snapshot();
      if (isCanceled(error) || task.controller.signal.aborted) {
        await setPhase(task, 'stopped', {progress: {phase: 'stopped'}, error: null});
        return snapshot();
      }
      await setPhase(task, 'error', {error: publicError(error)});
      return snapshot();
    }
  }

  async function cancel() {
    assertUsable();
    const task = current;
    if (!task || !activePhase(task.phase)) return false;
    if (task.phase === 'awaitingConfirmation') {
      task.controller.abort('user-cancel');
      await setPhase(task, 'stopped', {progress: {phase: 'stopped'}, error: null});
      return true;
    }
    if (task.phase !== 'stopping') {
      // Mark stopping synchronously and abort before awaiting UI work so no later
      // desktop step can be submitted merely because rendering is slow.
      task.phase = 'stopping';
      task.progress = {phase: 'stopping'};
      task.controller.abort('user-cancel');
      await publish();
    }
    return true;
  }

  async function close() {
    if (disposed) return;
    const task = current;
    if (task && activePhase(task.phase)) task.controller.abort('window-close');
    disposed = true;
  }

  return Object.freeze({submit, confirm, cancel, invalidateConfirmation, close, snapshot});
}
