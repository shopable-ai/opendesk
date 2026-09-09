// Shared controller for the Runtime example and its formal synthetic tests.
// It coordinates the public Recorder and Custom UI APIs; it does not own an
// input listener, raw writer, action builder, generator, or replay engine.
(function installOpenDeskRecordingConsole(global) {
  'use strict';

  const activePhases = new Set(['preparing', 'stop-requested', 'recording', 'pausing', 'paused', 'resuming', 'stopping']);
  const terminalSessionStates = new Set(['stopped', 'failed']);
  const terminalCapturePhases = new Set([
    'saved', 'partial-saved', 'building-actions', 'actions-ready', 'actions-blocked',
    'generating', 'generated', 'generation-error', 'run-preparing', 'running', 'run-canceling',
    'run-succeeded', 'run-failed', 'run-canceled', 'canceled', 'closed',
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeError(error) {
    return {
      code: error && error.code ? String(error.code) : 'RECORDER_UI_FAILED',
      operation: error && error.operation ? String(error.operation) : '',
      message: error && error.message ? String(error.message) : String(error || 'Unknown Recorder failure'),
      partial: error && error.partial ? clone(error.partial) : null,
      exitCode: error && Number.isInteger(error.exitCode) ? error.exitCode : null,
      stdout: error && typeof error.stdout === 'string' ? error.stdout : '',
      stderr: error && typeof error.stderr === 'string' ? error.stderr : '',
      logDir: error && typeof error.logDir === 'string' ? error.logDir : '',
    };
  }

  function createFlow(options) {
    const recorder = options && options.recorder;
    const getActiveWindow = options && options.getActiveWindow;
    const onState = options && typeof options.onState === 'function' ? options.onState : async () => {};
    const readGeneratedScript = options && typeof options.readGeneratedScript === 'function'
      ? options.readGeneratedScript : null;
    const executeGeneratedScript = options && typeof options.executeGeneratedScript === 'function'
      ? options.executeGeneratedScript : null;
    const copyText = options && typeof options.copyText === 'function' ? options.copyText : null;
    const createAbortController = options && typeof options.createAbortController === 'function'
      ? options.createAbortController
      : () => new global.AbortController();
    if (!recorder || typeof recorder.getCapabilities !== 'function' || typeof recorder.start !== 'function'
      || typeof recorder.buildActions !== 'function' || typeof recorder.generateScript !== 'function') {
      throw new Error('recording console requires the public Recorder Runtime object');
    }
    if (typeof getActiveWindow !== 'function') {
      throw new Error('recording console requires window.getActiveWindow');
    }

    const requestedTargetSelectionDelay = options && options.targetSelectionDelayMs;
    const targetSelectionDelayMs = Number.isFinite(requestedTargetSelectionDelay)
      ? Math.max(0, Math.min(10000, Math.trunc(requestedTargetSelectionDelay))) : 0;
    const targetSelectionSeconds = Math.max(1, Math.ceil(targetSelectionDelayMs / 1000));
    const requestedRunPreparationDelay = options && options.runPreparationDelayMs;
    const runPreparationDelayMs = Number.isFinite(requestedRunPreparationDelay)
      ? Math.max(0, Math.min(10000, Math.trunc(requestedRunPreparationDelay))) : 0;
    const readyDetail = targetSelectionDelayMs > 0
      ? `点击“开始录制”后，请在 ${targetSelectionSeconds} 秒内聚焦起始窗口；用于聚焦的点击不会被记录，之后可切换窗口和应用。`
      : '点击“开始录制”后，将记录当时的前台窗口作为起始上下文；录制过程可跨窗口和应用。';
    const capabilities = recorder.getCapabilities();
    const state = {
      phase: capabilities.capture.available ? 'ready' : 'unavailable',
      operation: null,
      detail: capabilities.capture.available
        ? readyDetail
        : '当前 execution 未获准或系统监听不可用；仍可查看界面，但不能开始采集。',
      capabilities: clone(capabilities),
      targetSelectionDelayMs,
      runPreparationDelayMs,
      captureKeyboard: !!(options && options.captureKeyboard),
      target: null,
      nativeStatus: null,
      saved: null,
      actions: null,
      generated: null,
      run: null,
      copyStatus: 'idle',
      error: null,
      stopRequested: false,
      closeRequested: false,
    };

    let session = null;
    let operationName = '';
    let operationPromise = null;
    let buildAfterStartStop = true;
    let cancelAfterStartStop = false;
    let runAbortController = null;
    let runCancelRequested = false;
    let controlBoundaryFailure = null;

    function snapshot() {
      return clone(state);
    }

    async function emit() {
      await onState(snapshot());
    }

    async function transition(phase, detail, patch) {
      state.phase = phase;
      if (detail !== undefined) state.detail = detail;
      if (patch) Object.assign(state, patch);
      await emit();
    }

    function runExclusive(name, work) {
      if (operationPromise) return operationPromise;
      operationName = name;
      state.operation = name;
      operationPromise = (async () => {
        await emit();
        try {
          return await work();
        } finally {
          operationName = '';
          state.operation = null;
          operationPromise = null;
          await emit();
        }
      })();
      return operationPromise;
    }

    async function setFailure(error, phase, fallback) {
      const normalized = normalizeError(error);
      await transition(phase, fallback + '：' + normalized.message, {error: normalized});
      return snapshot();
    }

    async function excludeControlClick(event) {
      if (!session || !event || event.type !== 'click') return null;
      let native;
      try {
        native = session.status();
      } catch (error) {
        controlBoundaryFailure = normalizeError(error);
        return null;
      }
      if (native.captureState !== 'recording' && native.captureState !== 'paused') return null;
      if (typeof session.excludeControlClick !== 'function') {
        controlBoundaryFailure = normalizeError(Object.assign(
          new Error('RecorderSession.excludeControlClick is unavailable'),
          {code: 'RECORDER_INVALID_STATE', operation: 'RecorderSession.excludeControlClick'},
        ));
        return null;
      }
      try {
        return await session.excludeControlClick(event);
      } catch (error) {
        // Control actions must still be allowed to pause or stop capture. The
        // failure is retained and later prevents actions generation, because
        // silently replaying a UI control click would be unsafe.
        controlBoundaryFailure = normalizeError(error);
        return null;
      }
    }

    async function buildActions(recordingDir, preserveError) {
      await transition('building-actions', '录制事实已保存，正在从固定 raw 文件制作 actions…', {
        error: preserveError || null,
      });
      try {
        const actions = await recorder.buildActions(recordingDir);
        const ready = actions.readiness === 'ready';
        const partialPrefix = preserveError ? '本次为部分保存；' : '';
        await transition(
          ready ? 'actions-ready' : 'actions-blocked',
          ready
            ? partialPrefix + `actions 已就绪（${actions.actionCount} 个动作）。请检查后再点“生成脚本”。`
            : partialPrefix + `actions 为 ${actions.readiness}：${formatActionIssues(actions.issues, 2)}；当前不能生成。`,
          {actions: clone(actions), error: preserveError || null},
        );
      } catch (error) {
        await setFailure(error, 'actions-blocked', 'actions 制作失败');
      }
      return snapshot();
    }

    async function stopSession({build, canceled, reason}) {
      if (!session) {
        if (canceled) await transition('canceled', '已取消；当前没有活动监听。');
        return snapshot();
      }
      await transition('stopping', reason === 'close'
        ? '窗口正在关闭；先停止 native listener 并排空已接收事件…'
        : '正在固定截止、停止 native listener 并排空已接收事件…');

      let saved = null;
      let stopFailure = null;
      try {
        saved = await session.stop();
      } catch (error) {
        stopFailure = normalizeError(error);
        saved = stopFailure.partial;
      }
      session = null;
      state.nativeStatus = saved ? clone(saved) : state.nativeStatus;
      state.saved = saved ? clone(saved) : null;

      if (!saved) {
        return setFailure(stopFailure, canceled ? 'canceled' : 'partial-saved', '停止失败且没有可确认的保存摘要');
      }

      const fullySaved = saved.storageState === 'saved' && saved.captureState === 'stopped' && !stopFailure;
      await transition(
        fullySaved ? 'saved' : 'partial-saved',
        fullySaved
          ? '监听已停止，raw 与 manifest 已保存。'
          : '监听已结束，但只得到部分保存结果；路径和错误已保留供检查。',
        {error: stopFailure},
      );

      if (canceled || reason === 'close') {
        await transition(canceled ? 'canceled' : state.phase,
          canceled ? '已按用户的取消请求停止录制；录制事实保留，不制作 actions，也不生成或重放。' : state.detail);
        return snapshot();
      }
      if (build && controlBoundaryFailure) {
        await transition('actions-blocked', '录制已保存，但 Custom UI 控制点击没有建立可审计排除边界；为避免把控制按钮生成成目标动作，本次不制作 actions。', {
          actions: null, error: controlBoundaryFailure,
        });
        return snapshot();
      }
      if (build && saved.recordingDir) {
        return buildActions(saved.recordingDir, stopFailure);
      }
      return snapshot();
    }

    function start() {
      if (state.phase === 'closed') return Promise.resolve(snapshot());
      if (operationPromise) return operationPromise;
      let previousStatus = null;
      let retiringTerminalSession = false;
      if (session) {
        try {
          previousStatus = session.status();
          state.nativeStatus = clone(previousStatus);
        } catch (error) {
          return setFailure(error, 'error', '无法检查上一录制状态');
        }
        if (!terminalSessionStates.has(previousStatus.captureState)) return Promise.resolve(snapshot());
        retiringTerminalSession = true;
      }
      if (activePhases.has(state.phase) && !retiringTerminalSession) return Promise.resolve(snapshot());
      if (!capabilities.capture.available) {
        return setFailure({
          code: capabilities.capture.hostAuthorized ? 'RECORDER_CAPTURE_UNAVAILABLE' : 'RECORDER_CAPTURE_DENIED',
          operation: 'Recorder.start',
          message: capabilities.capture.limitations.join('; ') || 'Recorder capture is unavailable',
        }, 'unavailable', '不能开始录制');
      }
      return runExclusive('start', async () => {
        if (session) {
          const terminalSession = session;
          await transition('preparing', '正在收尾上一段失败的录制并准备重新开始…');
          try {
            await terminalSession.stop();
          } catch (_) {
            // A failed session rejects stop() with its finalized summary in
            // error.partial. Awaiting it still synchronizes native cleanup;
            // the new explicit start may proceed after that cleanup finishes.
          }
          if (session === terminalSession) session = null;
        }
        state.stopRequested = false;
        controlBoundaryFailure = null;
        buildAfterStartStop = true;
        cancelAfterStartStop = false;
        await transition('preparing', targetSelectionDelayMs > 0
          ? `开始已授权。请在 ${targetSelectionSeconds} 秒内聚焦录制的起始窗口…`
          : '正在读取当前前台窗口作为录制起始上下文…', {
          target: null, nativeStatus: null, saved: null, actions: null, generated: null,
          run: null, copyStatus: 'idle', error: null,
        });
        if (targetSelectionDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, targetSelectionDelayMs));
        }
        if (state.stopRequested || state.closeRequested) {
          if (!state.closeRequested) {
            await transition(cancelAfterStartStop ? 'canceled' : 'ready', cancelAfterStartStop
              ? '已取消目标选择；尚未启动监听。'
              : '已停止目标选择；尚未启动监听。');
          }
          return snapshot();
        }
        try {
          const active = await getActiveWindow();
          const processId = Number(active && active.pid);
          const title = String(active && active.title || '');
          if (!Number.isInteger(processId) || processId <= 0 || !title) {
            throw Object.assign(new Error('无法识别有效的当前前台窗口；请先聚焦隔离测试目标'), {
              code: 'INVALID_ARGUMENT', operation: 'Recorder.start',
            });
          }
          state.target = {processId, title};
          await transition('preparing', `记录起始上下文“${title}”（PID ${processId}）并准备桌面录制…`);
          session = await recorder.start({
            within: {processId, title},
            captureKeyboard: state.captureKeyboard,
            ...(state.captureKeyboard ? {keyboardContent: 'non-sensitive-test'} : {}),
            evidence: 'target-semantics',
            ...(options && Number.isFinite(options.maxDurationMs) ? {maxDurationMs: options.maxDurationMs} : {}),
            controlKeycodes: options && Array.isArray(options.controlKeycodes) ? options.controlKeycodes.slice() : [],
          });
          state.nativeStatus = clone(session.status());
          await transition('recording', 'Native listener 已就绪。可切换窗口和应用；敏感操作或长期离开请暂停或停止录制。');
          if (state.stopRequested || state.closeRequested) {
            return stopSession({
              build: buildAfterStartStop,
              canceled: cancelAfterStartStop,
              reason: state.closeRequested ? 'close' : 'user',
            });
          }
        } catch (error) {
          session = null;
          return setFailure(error, 'error', '开始录制失败');
        }
        return snapshot();
      });
    }

    function stop() {
      if (operationPromise) {
        if (operationName === 'start') {
          state.stopRequested = true;
          buildAfterStartStop = true;
          cancelAfterStartStop = false;
          void transition('stop-requested', '已请求停止；等待 Recorder.start() 完成受控回滚后保存。');
        }
        return operationPromise;
      }
      if (!session) return Promise.resolve(snapshot());
      return runExclusive('stop', () => stopSession({build: true, canceled: false, reason: 'user'}));
    }

    function pauseOrResume() {
      if (operationPromise) return operationPromise;
      if (!session) return Promise.resolve(snapshot());
      return runExclusive('pause-resume', async () => {
        const native = session.status();
        state.nativeStatus = clone(native);
        if (native.captureState === 'recording') {
          await transition('pausing', '正在关闭输入接受门并写入暂停边界…', {error: null});
          try {
            await session.pause();
            state.nativeStatus = clone(session.status());
            await transition('paused', '已暂停保存输入内容；native listener 仍被占用，可在任意窗口继续。');
          } catch (error) {
            state.nativeStatus = clone(session.status());
            const phase = state.nativeStatus.captureState === 'paused' ? 'paused'
              : state.nativeStatus.captureState === 'recording' ? 'recording' : 'error';
            await setFailure(error, phase, '暂停录制失败');
          }
          return snapshot();
        }
        if (native.captureState === 'paused') {
          await transition('resuming', '正在重新打开桌面输入接受门…', {error: null});
          try {
            await session.resume();
            state.nativeStatus = clone(session.status());
            await transition('recording', '已继续录制；可切换窗口和应用。');
          } catch (error) {
            state.nativeStatus = clone(session.status());
            await setFailure(error, state.nativeStatus.captureState === 'paused' ? 'paused' : 'error', '继续录制失败');
          }
          return snapshot();
        }
        return setFailure({
          code: 'RECORDER_INVALID_STATE', operation: 'RecorderSession.pause/resume',
          message: `当前 captureState=${native.captureState}，不能暂停或继续`,
        }, 'error', '暂停／继续失败');
      });
    }

    function cancel() {
      if (state.phase === 'closed') return Promise.resolve(snapshot());
      if (operationPromise) {
        if (operationName === 'run') return cancelRun();
        if (operationName === 'start') {
          state.stopRequested = true;
          buildAfterStartStop = false;
          cancelAfterStartStop = true;
          void transition('stop-requested', '已请求取消；等待启动完成后停止录制并保留事实。');
        }
        return operationPromise;
      }
      if (!session) return transition('canceled', '已取消；没有活动监听，未生成或重放任何脚本。').then(snapshot);
      return runExclusive('cancel', () => stopSession({build: false, canceled: true, reason: 'cancel'}));
    }

    function generate() {
      if (state.phase === 'closed') return Promise.resolve(snapshot());
      if (operationPromise) return operationPromise;
      if (!state.actions || state.actions.readiness !== 'ready') {
        return setFailure({
          code: 'GENERATION_BLOCKED', operation: 'Recorder.generateScript',
          message: 'actions 尚未 ready',
        }, state.actions ? 'actions-blocked' : 'error', '不能生成脚本');
      }
      return runExclusive('generate', async () => {
        await transition('generating', '正在从固定 actions 文件生成普通 OpenDesk JavaScript…', {
          generated: null, run: null, copyStatus: 'idle', error: null,
        });
        try {
          const generated = await recorder.generateScript(state.actions.actionsFile, {mode: 'basic'});
          state.generated = clone(generated);
          if (!readGeneratedScript) {
            throw Object.assign(new Error('当前 controller 没有可用的 File.read 适配器'), {
              code: 'SCRIPT_READ_UNAVAILABLE', operation: 'File.read',
            });
          }
          const source = String(await readGeneratedScript(generated.scriptFile));
          await transition('generated', '脚本已生成且可检查。只有点击“重放”才会启动新的受管 execution。', {
            generated: {...clone(generated), source}, run: null, copyStatus: 'idle', error: null,
          });
        } catch (error) {
          await setFailure(error, 'generation-error', '脚本生成或读取失败');
        }
        return snapshot();
      });
    }

    function runGenerated() {
      if (state.phase === 'closed') return Promise.resolve(snapshot());
      if (operationPromise) return operationPromise;
      if (!state.generated || typeof state.generated.source !== 'string') {
        return setFailure({
          code: 'RUN_BLOCKED', operation: 'Command.run', message: '没有已加载的生成脚本',
        }, state.generated ? 'generation-error' : 'error', '不能重放脚本');
      }
      if (!executeGeneratedScript) {
        return setFailure({
          code: 'COMMAND_DISABLED', operation: 'Command.run', message: '当前 execution 没有正式脚本执行适配器',
        }, 'run-failed', '不能重放脚本');
      }
      return runExclusive('run', async () => {
        runAbortController = createAbortController();
        runCancelRequested = false;
        const startedAt = new Date().toISOString();
        await transition('run-preparing', runPreparationDelayMs > 0
          ? `请在 ${Math.max(1, Math.ceil(runPreparationDelayMs / 1000))} 秒内恢复预期的起始桌面和窗口；不会校验 PID 或标题。`
          : '正在准备新的 OpenDesk execution；不会校验录制时的 PID 或标题。', {
          run: {status: 'preparing', startedAt, finishedAt: null, exitCode: null, stdout: '', stderr: '', logDir: ''},
          error: null,
        });
        try {
          if (runPreparationDelayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, runPreparationDelayMs));
          }
          if (runAbortController.signal.aborted) {
            throw Object.assign(new Error('generated-script run canceled during preparation'), {
              code: 'CANCELED', operation: 'Command.run',
            });
          }
          await transition('running', '正在新的 OpenDesk execution 中重放。关闭或“取消重放”会终止受管子进程。', {
            run: {status: 'running', startedAt, finishedAt: null, exitCode: null, stdout: '', stderr: '', logDir: ''},
          });
          const result = await executeGeneratedScript(clone(state.generated), {signal: runAbortController.signal});
          await transition('run-succeeded', '重放已以 exit code 0 完成；这不等于目标应用的业务结果已验证。', {
            run: {
              status: 'succeeded', startedAt, finishedAt: new Date().toISOString(),
              exitCode: Number.isInteger(result && result.exitCode) ? result.exitCode : 0,
              stdout: result && typeof result.stdout === 'string' ? result.stdout : '',
              stderr: result && typeof result.stderr === 'string' ? result.stderr : '',
              logDir: result && typeof result.logDir === 'string' ? result.logDir : '',
              command: result && typeof result.command === 'string' ? result.command : '',
            },
            error: null,
          });
        } catch (error) {
          const normalized = normalizeError(error);
          const canceled = normalized.code === 'CANCELED' && runCancelRequested;
          await transition(canceled ? 'run-canceled' : 'run-failed', canceled
            ? '重放已取消；生成脚本仍保留，可再次重放、重置或重新录制。'
            : `重放失败：${normalized.message}`, {
            run: {
              status: canceled ? 'canceled' : 'failed', startedAt, finishedAt: new Date().toISOString(),
              exitCode: normalized.exitCode, stdout: normalized.stdout, stderr: normalized.stderr,
              logDir: normalized.logDir || state.run && state.run.logDir || '',
            },
            error: canceled ? null : normalized,
          });
        } finally {
          runAbortController = null;
          runCancelRequested = false;
        }
        return snapshot();
      });
    }

    async function cancelRun() {
      if (!operationPromise || operationName !== 'run' || !runAbortController) return snapshot();
      if (!runCancelRequested) {
        runCancelRequested = true;
        await transition('run-canceling', '正在取消受管重放；等待子进程和输出管道清理…');
        runAbortController.abort('recording console run canceled');
      }
      return operationPromise;
    }

    function copyGenerated() {
      if (state.phase === 'closed') return Promise.resolve(snapshot());
      if (operationPromise) return operationPromise;
      if (!state.generated || typeof state.generated.source !== 'string' || !copyText) {
        return setFailure({
          code: 'COPY_UNAVAILABLE', operation: 'clipboard.copy', message: '没有可复制的已加载脚本',
        }, state.generated ? state.phase : 'error', '不能复制脚本');
      }
      return runExclusive('copy', async () => {
        try {
          await copyText(state.generated.source);
          state.copyStatus = 'copied';
          state.detail = '生成脚本已复制到系统剪贴板；重放仍需单独点击。';
          state.error = null;
          await emit();
        } catch (error) {
          state.copyStatus = 'failed';
          await setFailure(error, state.phase, '复制脚本失败');
        }
        return snapshot();
      });
    }

    async function reset() {
      if (state.phase === 'closed' || operationPromise || session || activePhases.has(state.phase)) return snapshot();
      const nextPhase = capabilities.capture.available ? 'ready' : 'unavailable';
      await transition(nextPhase, capabilities.capture.available
        ? '界面状态已重置；磁盘录制与生成文件未删除，可按原路径独立检查。'
        : '界面状态已重置，但当前 execution 仍不能开始采集。', {
        target: null, nativeStatus: null, saved: null, actions: null, generated: null,
        run: null, copyStatus: 'idle', error: null, stopRequested: false, closeRequested: false,
      });
      return snapshot();
    }

    async function refreshStatus() {
      if (session) {
        state.nativeStatus = clone(session.status());
        await emit();
      }
      return snapshot();
    }

    async function setCaptureKeyboard(enabled) {
      if (state.phase === 'closed' || operationPromise || session || activePhases.has(state.phase)) return false;
      state.captureKeyboard = !!enabled;
      state.detail = state.captureKeyboard
        ? `键盘采集已启用：只可用于非敏感测试；开始后请在 ${targetSelectionSeconds} 秒内聚焦目标。`
        : `键盘采集关闭；开始后请在 ${targetSelectionSeconds} 秒内聚焦目标，只记录支持的鼠标输入。`;
      await emit();
      return true;
    }

    async function close() {
      if (state.phase === 'closed') return snapshot();
      state.closeRequested = true;
      if (operationPromise) {
        if (operationName === 'run') {
          await cancelRun();
        } else if (operationName === 'start') {
          state.stopRequested = true;
          buildAfterStartStop = false;
          cancelAfterStartStop = false;
          await emit();
          await operationPromise;
        } else {
          await emit();
          await operationPromise;
        }
      }
      if (session) {
        await runExclusive('close-stop', () => stopSession({build: false, canceled: false, reason: 'close'}));
      }
      await transition('closed', '录制控制台已关闭；不会自动生成或重放。');
      return snapshot();
    }

    return Object.freeze({
      start, pauseOrResume, stop, cancel, generate, runGenerated, cancelRun, copyGenerated,
      reset, close, refreshStatus, setCaptureKeyboard,
      excludeControlClick,
      state: snapshot,
      capabilities: () => clone(capabilities),
    });
  }

  const phaseLabels = {
    unavailable: '不可用', ready: '准备就绪', preparing: '正在准备', 'stop-requested': '等待停止',
    recording: '录制中', pausing: '正在暂停', paused: '已暂停', resuming: '正在继续', stopping: '正在停止', saved: '已保存', 'partial-saved': '部分保存',
    'building-actions': '制作 actions', 'actions-ready': 'actions 就绪', 'actions-blocked': 'actions 需处理',
    generating: '正在生成', generated: '已生成 · 未重放', 'generation-error': '生成失败',
    'run-preparing': '准备重放', running: '重放中', 'run-canceling': '正在取消重放', 'run-succeeded': '重放完成',
    'run-failed': '重放失败', 'run-canceled': '重放已取消',
    canceled: '已取消', error: '发生错误', closed: '已关闭',
  };

  function phaseStages(state) {
    const phase = state.phase;
    const captureDone = terminalCapturePhases.has(phase);
    return {
      prepare: phase === 'preparing' || phase === 'stop-requested' ? 'active'
        : (['recording', 'pausing', 'paused', 'resuming'].includes(phase) || captureDone ? 'done' : phase === 'error' ? 'error' : 'pending'),
      capture: ['recording', 'pausing', 'paused', 'resuming'].includes(phase) ? 'active' : (captureDone ? 'done' : 'pending'),
      save: phase === 'stopping' ? 'active'
        : (phase === 'partial-saved' ? 'warning' : (captureDone && state.saved ? 'done' : 'pending')),
      actions: phase === 'building-actions' ? 'active'
        : (state.actions && state.actions.readiness === 'ready' ? 'done'
          : phase === 'actions-blocked' ? 'warning' : 'pending'),
      generate: phase === 'generating' ? 'active'
        : (state.generated && typeof state.generated.source === 'string' ? 'done'
          : phase === 'generation-error' ? 'error' : 'pending'),
      run: phase === 'run-preparing' || phase === 'running' || phase === 'run-canceling' ? 'active'
        : (phase === 'run-succeeded' ? 'done' : phase === 'run-failed' ? 'error'
          : phase === 'run-canceled' ? 'warning' : 'pending'),
    };
  }

  function stageText(label, status) {
    const marks = {pending: '○', active: '◉', done: '✓', warning: '!', error: '×'};
    return `${marks[status] || '○'} ${label}`;
  }

  function artifactText(state) {
    if (state.generated) return `脚本：${state.generated.scriptFile}（${state.generated.verification}）`;
    if (state.actions) return `Actions：${state.actions.actionsFile}（${state.actions.readiness}）`;
    if (state.saved) return `录制包：${state.saved.recordingDir}（${state.saved.storageState}）`;
    return '尚无录制产物。';
  }

  function formatActionIssues(issues, limit) {
    if (!Array.isArray(issues) || issues.length === 0) return '无结构化问题';
    const maximum = Number.isInteger(limit) && limit > 0 ? limit : issues.length;
    const shown = issues.slice(0, maximum).map(issue => {
      const code = issue && issue.code ? String(issue.code) : 'unknown-issue';
      const eventId = issue && issue.eventId ? ` [${issue.eventId}]` : '';
      const message = issue && issue.message ? ` — ${issue.message}` : '';
      return `${code}${eventId}${message}`;
    });
    if (issues.length > shown.length) shown.push(`…另有 ${issues.length - shown.length} 个问题`);
    return shown.join('\n');
  }

  function countText(state) {
    const source = state.saved && state.saved.counts ? state.saved : state.nativeStatus;
    const counts = source && source.counts;
    if (!counts) return 'accepted 0 · persisted 0 · paused 0 · dropped 0';
    return `accepted ${counts.accepted} · persisted ${counts.persisted} · paused ${counts.paused || 0} · dropped ${counts.dropped}`;
  }

  function runSummaryText(state) {
    if (!state.run) return '尚未重放。生成不会自动触发重放。';
    if (state.run.status === 'preparing') return '准备中 · 请恢复起始桌面和窗口';
    if (state.run.status === 'running') return '重放中 · 新的 OpenDesk execution';
    if (state.run.status === 'canceled') return '已取消 · 生成脚本仍保留';
    if (state.run.status === 'succeeded') return `已完成 · exit code ${state.run.exitCode}`;
    return `重放失败${state.run.exitCode === null ? '' : ` · exit code ${state.run.exitCode}`}`;
  }

  function runOutputText(state) {
    if (!state.run) return 'stdout / stderr 将显示在这里。';
    const sections = [];
    if (state.run.logDir) sections.push(`log: ${state.run.logDir}`);
    if (state.run.stdout) sections.push(`stdout:\n${state.run.stdout}`);
    if (state.run.stderr) sections.push(`stderr:\n${state.run.stderr}`);
    if (!sections.length) sections.push(state.run.status === 'preparing' ? '等待用户恢复起始环境…'
      : state.run.status === 'running' ? '等待子 execution 完成…' : '本次重放没有 stdout / stderr。');
    const output = sections.join('\n\n');
    return output.length > 12000 ? output.slice(0, 12000) + '\n…（UI 仅显示前 12000 字符；完整输出见 log 目录）' : output;
  }

  async function createApp(options) {
    const uiAPI = options && options.ui ? options.ui : global.ui;
    const recorder = options && options.recorder ? options.recorder : global.Recorder;
    const getActiveWindow = options && options.getActiveWindow
      ? options.getActiveWindow
      : () => global.window.getActiveWindow();
    const logger = options && options.logger ? options.logger : global.console;
    const targetSelectionDelayMs = options && Number.isFinite(options.targetSelectionDelayMs)
      ? options.targetSelectionDelayMs : 3000;
    const runPreparationDelayMs = options && Number.isFinite(options.runPreparationDelayMs)
      ? options.runPreparationDelayMs : 3000;
    const fileAPI = options && options.file ? options.file : global.File;
    const commandAPI = options && options.command ? options.command : global.Command;
    const clipboardAPI = options && options.clipboard ? options.clipboard : global.clipboard;
    const execution = options && options.execution ? options.execution : global.Execution;
    const readGeneratedScript = options && typeof options.readGeneratedScript === 'function'
      ? options.readGeneratedScript
      : scriptFile => fileAPI.read(scriptFile);
    const copyText = options && typeof options.copyText === 'function'
      ? options.copyText
      : text => clipboardAPI.copy(text);
    let runSequence = 0;
    const executeGeneratedScript = options && typeof options.executeGeneratedScript === 'function'
      ? options.executeGeneratedScript
      : async (generated, runOptions) => {
        const commandCapabilities = commandAPI.getCapabilities();
        if (!commandCapabilities.enabled || !commandCapabilities.supported) {
          throw Object.assign(new Error('Command.run is unavailable from this execution'), {
            code: 'COMMAND_DISABLED', operation: 'Command.run',
          });
        }
        runSequence += 1;
        const binary = options && options.opendeskBinary
          ? options.opendeskBinary
          : fileAPI.join(execution.workdir, 'dist', 'opendesk');
        const logDir = fileAPI.join(
          execution.artifactDir,
          'generated-script-runs',
          `${Date.now()}-${runSequence}`,
        );
        await fileAPI.ensureDir(logDir);
        try {
          const result = await commandAPI.run(binary, [
            '-script', generated.scriptFile,
            '-console-mode', 'script',
            '-log-dir', logDir,
          ], {
            cwd: execution.workdir,
            timeout: options && Number.isFinite(options.generatedRunTimeoutMs)
              ? options.generatedRunTimeoutMs : 1800000,
            maxOutputBytes: 1024 * 1024,
            signal: runOptions && runOptions.signal,
          });
          return {...result, command: binary, logDir};
        } catch (error) {
          error.logDir = logDir;
          throw error;
        }
      };
    if (!uiAPI || typeof uiAPI.createWindow !== 'function') throw new Error('Custom UI is unavailable');

    const tray = await uiAPI.createWindow({
      id: options && options.trayId || 'scriptRecorderTray',
      kind: 'floating', title: '',
      position: {
        mode: 'anchor', size: {width: 780, height: 304},
        horizontal: 'center', vertical: 'bottom', margin: 24, display: 'active',
      },
      alwaysOnTop: true, draggable: true, theme: 'dark',
      content: {file: './recording-console/tray.html', cssFile: './recording-console/tray.css'},
    });

    let details = null;
    let detailsVisible = false;
    let detailsGeneration = 0;
    let appClosing = false;
    let closePromise = null;
    let lastState = null;

    function isClosedWindowError(error) {
      const code = error && error.code ? String(error.code) : '';
      return code === 'NOT_FOUND' || code === 'INVALID_STATE';
    }

    async function withDetails(update) {
      const panel = details;
      if (!panel) return false;
      try {
        await update(panel);
        return true;
      } catch (error) {
        if (!isClosedWindowError(error)) throw error;
        if (details === panel) {
          details = null;
          detailsVisible = false;
        }
        return false;
      }
    }

    async function update(control, patch) {
      try {
        return await control.update(patch);
      } catch (error) {
        if (appClosing && isClosedWindowError(error)) return null;
        throw error;
      }
    }

    async function updateBoth(trayID, detailsID, patch) {
      const tasks = [update(tray.control(trayID), patch)];
      if (detailsID) tasks.push(withDetails(panel => update(panel.control(detailsID), patch)));
      await Promise.all(tasks);
    }

    async function render(state) {
      lastState = state;
      const stages = phaseStages(state);
      const busy = !!state.operation;
      const nativeCaptureState = state.nativeStatus && state.nativeStatus.captureState;
      const canRestartSession = !nativeCaptureState || terminalSessionStates.has(nativeCaptureState);
      const canStart = state.capabilities.capture.available && !busy && canRestartSession
        && (!activePhases.has(state.phase) || terminalSessionStates.has(nativeCaptureState))
        && state.phase !== 'closed';
      const canStop = (state.phase === 'recording' || state.phase === 'paused' || state.phase === 'preparing' || state.phase === 'stop-requested')
        && state.operation !== 'stop' && state.operation !== 'cancel';
      const canPause = !busy && (state.phase === 'recording' || state.phase === 'paused');
      const canGenerate = !busy && state.actions && state.actions.readiness === 'ready' && state.phase !== 'closed';
      const runActive = state.operation === 'run';
      const canRun = !busy && state.generated && typeof state.generated.source === 'string' && state.phase !== 'closed';
      const canReset = !busy && !activePhases.has(state.phase) && state.phase !== 'closed'
        && !!(state.target || state.saved || state.actions || state.generated || state.run || state.error || state.phase === 'canceled');
      const canCancel = runActive
        ? state.phase !== 'run-canceling'
        : (state.phase === 'recording' || state.phase === 'paused' || state.phase === 'preparing' || state.phase === 'stop-requested')
          && state.operation !== 'stop' && state.operation !== 'cancel';
      const target = state.target
        ? `${state.target.title} · PID ${state.target.processId}`
        : state.targetSelectionDelayMs > 0
          ? `点击开始后 ${Math.ceil(state.targetSelectionDelayMs / 1000)} 秒读取起始窗口`
          : '点击开始时读取当前前台窗口';
      const errorText = state.error ? `${state.error.code}${state.error.operation ? ' · ' + state.error.operation : ''}` : '';
      const stateClass = (state.error && state.phase !== 'paused') || ['generation-error', 'run-failed'].includes(state.phase)
        ? 'is-error' : state.phase === 'recording' ? 'is-recording' : state.phase === 'paused' ? 'is-paused'
          : ['preparing', 'stopping', 'building-actions', 'generating', 'stop-requested', 'run-preparing', 'running', 'run-canceling'].includes(state.phase) ? 'is-busy'
            : ['saved', 'actions-ready', 'generated', 'run-succeeded'].includes(state.phase) ? 'is-success'
              : state.phase === 'actions-blocked' ? 'is-warning' : '';
      const scriptSource = state.generated && typeof state.generated.source === 'string'
        ? state.generated.source : '生成后可在这里滚动查看并选择文本。';
      const scriptPath = state.generated ? state.generated.scriptFile : '尚未生成脚本。';
      const actionIssues = state.actions && state.actions.readiness !== 'ready'
        ? formatActionIssues(state.actions.issues, 8) : '';

      await Promise.all([
        updateBoth('trayState', 'recordingState', {text: phaseLabels[state.phase] || state.phase, classes: ['status-pill', stateClass]}),
        updateBoth('trayDetail', 'recordingDetail', {text: state.detail, classes: ['detail-text', ...(state.error ? ['is-error'] : [])]}),
        updateBoth('trayTarget', 'captureTarget', {text: target}),
        updateBoth('trayCounts', 'recordingCounts', {text: countText(state)}),
        updateBoth('trayArtifact', 'artifactPath', {text: artifactText(state)}),
        update(tray.control('trayError'), {
          text: errorText, visible: true,
          classes: ['error-banner', ...(errorText ? [] : ['is-empty'])],
        }),
        withDetails(panel => update(panel.control('recordingError'), {text: errorText, visible: !!errorText})),
        withDetails(panel => update(panel.control('actionIssues'), {text: actionIssues, visible: !!actionIssues})),
        updateBoth('trayPrepareStage', 'stagePrepare', {text: stageText('准备', stages.prepare), classes: ['stage-chip', 'is-' + stages.prepare]}),
        updateBoth('trayCaptureStage', 'stageCapture', {text: stageText('录制', stages.capture), classes: ['stage-chip', 'is-' + stages.capture]}),
        updateBoth('traySaveStage', 'stageSave', {text: stageText('保存', stages.save), classes: ['stage-chip', 'is-' + stages.save]}),
        updateBoth('trayActionsStage', 'stageActions', {text: stageText('Actions', stages.actions), classes: ['stage-chip', 'is-' + stages.actions]}),
        updateBoth('trayGenerateStage', 'stageGenerate', {text: stageText('生成', stages.generate), classes: ['stage-chip', 'is-' + stages.generate]}),
        updateBoth('trayRunStage', 'stageRun', {text: stageText('重放', stages.run), classes: ['stage-chip', 'is-' + stages.run]}),
        update(tray.control('trayDetails'), {text: state.generated ? '查看脚本' : '查看详情'}),
        updateBoth('trayStart', 'start', {text: state.saved || state.actions || state.generated ? '重新录制' : '开始录制', disabled: !canStart, busy: state.operation === 'start', error: state.phase === 'error' ? errorText : ''}),
        updateBoth('trayPause', 'pause', {text: state.phase === 'paused' ? '继续录制' : '暂停录制', disabled: !canPause, busy: state.operation === 'pause-resume', error: state.phase === 'paused' && state.error ? errorText : ''}),
        updateBoth('trayStop', 'stop', {disabled: !canStop, busy: state.operation === 'stop'}),
        updateBoth('trayGenerate', 'generate', {text: state.generated ? '重新生成' : '生成脚本', disabled: !canGenerate, busy: state.operation === 'generate', error: state.phase === 'generation-error' ? errorText : ''}),
        updateBoth('trayRun', 'runScript', {text: runActive ? '重放中' : '重放', disabled: !canRun, busy: runActive, error: state.phase === 'run-failed' ? errorText : ''}),
        updateBoth('trayReset', 'reset', {disabled: !canReset}),
        updateBoth('trayCancel', 'cancel', {text: runActive ? '取消重放' : '取消并保存', disabled: !canCancel, busy: state.phase === 'run-canceling' || state.operation === 'cancel'}),
        withDetails(panel => update(panel.control('copyScript'), {text: state.copyStatus === 'copied' ? '已复制' : '复制脚本', disabled: !state.generated || busy})),
        withDetails(panel => update(panel.control('scriptPath'), {text: scriptPath})),
        withDetails(panel => update(panel.control('scriptPreview'), {text: scriptSource, classes: ['script-preview', ...(state.generated ? ['has-source'] : [])]})),
        withDetails(panel => update(panel.control('runSummary'), {text: runSummaryText(state), classes: ['run-summary', ...(state.run ? ['has-run'] : [])]})),
        withDetails(panel => update(panel.control('runOutput'), {text: runOutputText(state)})),
        withDetails(panel => panel.control('keyboardCapture').update({checked: state.captureKeyboard, disabled: busy || activePhases.has(state.phase)})),
      ]);
      logger.log('RECORDER_UI_STATE=' + JSON.stringify({
        phase: state.phase, operation: state.operation, target: state.target,
        storageState: state.saved && state.saved.storageState,
        actionsReadiness: state.actions && state.actions.readiness,
        verification: state.generated && state.generated.verification,
        runStatus: state.run && state.run.status,
        actionIssues: state.actions && state.actions.issues,
        error: state.error && {code: state.error.code, operation: state.error.operation},
      }));
    }

    const flow = createFlow({
      recorder, getActiveWindow,
      captureKeyboard: !!(options && options.captureKeyboard),
      controlKeycodes: options && options.controlKeycodes || [],
      maxDurationMs: options && options.maxDurationMs,
      targetSelectionDelayMs,
      runPreparationDelayMs,
      readGeneratedScript,
      executeGeneratedScript,
      copyText,
      createAbortController: options && options.createAbortController,
      onState: render,
    });

    async function invoke(name, action) {
      try {
        const result = await action();
        logger.log('RECORDER_UI_ACTION=' + JSON.stringify({action: name, phase: result && result.phase}));
        return result;
      } catch (error) {
        logger.error('RECORDER_UI_ACTION_FAILED=' + JSON.stringify({
          action: name, code: error && error.code || '', message: error && error.message || String(error),
        }));
        throw error;
      }
    }

    function bindClick(panel, id, name, action) {
      panel.control(id).on('click', event => invoke(name, async () => {
        await flow.excludeControlClick(event);
        return action(event);
      }));
    }

    async function createDetailsWindow() {
      detailsGeneration += 1;
      const panel = await uiAPI.createWindow({
        id: (options && options.detailsId || 'scriptRecorderDetails') + (detailsGeneration === 1 ? '' : '-' + detailsGeneration),
        kind: 'floating', title: '',
        position: {
          mode: 'anchor', size: {width: 900, height: 700},
          horizontal: 'center', vertical: 'center', margin: 0, display: 'active',
        },
        alwaysOnTop: true, draggable: true, theme: 'dark',
        content: {file: './recording-console/recorder.html', cssFile: './recording-console/recorder.css'},
      });
      panel.on('close', () => {
        if (details === panel) {
          details = null;
          detailsVisible = false;
        }
        if (!appClosing) {
          return tray.show().then(() => render(flow.state())).catch(error => {
            if (!isClosedWindowError(error)) throw error;
          });
        }
      });
      bindClick(panel, 'collapse', 'hide-details', () => hideDetails());
      bindClick(panel, 'close', 'hide-details', () => hideDetails());
      bindClick(panel, 'start', 'start', () => flow.start());
      bindClick(panel, 'pause', 'pause-resume', () => flow.pauseOrResume());
      bindClick(panel, 'stop', 'stop', () => flow.stop());
      bindClick(panel, 'generate', 'generate', () => flow.generate());
      bindClick(panel, 'runScript', 'run-generated', () => flow.runGenerated());
      bindClick(panel, 'reset', 'reset', () => flow.reset());
      bindClick(panel, 'copyScript', 'copy-generated', () => flow.copyGenerated());
      bindClick(panel, 'cancel', 'cancel', () => flow.cancel());
      bindClick(panel, 'refresh', 'refresh-status', () => flow.refreshStatus());
      panel.control('keyboardCapture').on('change', event => invoke('keyboard-capture', () => flow.setCaptureKeyboard(!!event.checked)));
      details = panel;
      await render(flow.state());
      return panel;
    }

    async function showDetails() {
      if (!details) await createDetailsWindow();
      await tray.hide();
      try {
        const shown = await withDetails(panel => panel.show());
        if (!shown) {
          await tray.show();
          return showDetails();
        }
        detailsVisible = true;
        await render(flow.state());
        return details;
      } catch (error) {
        if (!appClosing) await tray.show();
        throw error;
      }
    }

    async function hideDetails() {
      if (details && detailsVisible) await withDetails(panel => panel.hide());
      detailsVisible = false;
      if (!appClosing) {
        await tray.show();
        await render(flow.state());
      }
    }

    async function close(reason, trayAlreadyClosed) {
      if (closePromise) return closePromise;
      appClosing = true;
      closePromise = (async () => {
        logger.log('RECORDER_UI_CLOSE=' + JSON.stringify({reason: reason || 'script'}));
        await flow.close();
        await withDetails(panel => panel.close());
        if (!trayAlreadyClosed) {
          try { await tray.close(); } catch (error) { if (!isClosedWindowError(error)) throw error; }
        }
        try { await uiAPI.closeAll(); } catch (error) { if (!isClosedWindowError(error)) throw error; }
        return flow.state();
      })();
      return closePromise;
    }

    bindClick(tray, 'trayStart', 'start', () => flow.start());
    bindClick(tray, 'trayPause', 'pause-resume', () => flow.pauseOrResume());
    bindClick(tray, 'trayStop', 'stop', () => flow.stop());
    bindClick(tray, 'trayGenerate', 'generate', () => flow.generate());
    bindClick(tray, 'trayRun', 'run-generated', () => flow.runGenerated());
    bindClick(tray, 'trayReset', 'reset', () => flow.reset());
    bindClick(tray, 'trayCancel', 'cancel', () => flow.cancel());
    bindClick(tray, 'trayDetails', 'show-details', () => showDetails());
    bindClick(tray, 'trayClose', 'close', () => close('button', false));
    tray.on('close', () => close('window-close', true));

    async function show() {
      await render(flow.state());
      const shown = await tray.show();
      await render(flow.state());
      return shown;
    }

    async function run() {
      try {
        await show();
        await tray.waitUntilClosed();
        await close('window-close', true);
      } finally {
        if (!closePromise) await close('script-finally', false);
        else await closePromise;
      }
    }

    return Object.freeze({
      run, show, showDetails, hideDetails, close,
      start: () => invoke('start', () => flow.start()),
      pauseOrResume: () => invoke('pause-resume', () => flow.pauseOrResume()),
      stop: () => invoke('stop', () => flow.stop()),
      generate: () => invoke('generate', () => flow.generate()),
      runGenerated: () => invoke('run-generated', () => flow.runGenerated()),
      cancelRun: () => invoke('cancel-run', () => flow.cancelRun()),
      copyGenerated: () => invoke('copy-generated', () => flow.copyGenerated()),
      reset: () => invoke('reset', () => flow.reset()),
      cancel: () => invoke('cancel', () => flow.cancel()),
      refreshStatus: () => invoke('refresh-status', () => flow.refreshStatus()),
      setCaptureKeyboard: enabled => invoke('keyboard-capture', () => flow.setCaptureKeyboard(enabled)),
      state: () => flow.state(),
      tray: () => tray,
      details: () => details,
      lastRenderedState: () => lastState && clone(lastState),
    });
  }

  global.OpenDeskRecordingConsole = Object.freeze({createFlow, createApp});
})(globalThis);
