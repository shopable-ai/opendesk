// Independent native-only controller for recording-console-simple.js.
// The toolbar is composed exclusively from FloatingWindow buttons and separators.
(function installOpenDeskSimpleRecordingConsole(global) {
  'use strict';

  const BUILT_IN_ICONS = Object.freeze({
    play: 'play.fill',
    pause: 'pause.fill',
    stop: 'stop.fill',
    generate: 'ai.generate',
    replay: 'repeat',
    agentPrompt: 'ai.assistant',
    details: 'info.circle',
    finder: 'folder.fill',
  });

  const ACTIVE_CAPTURE_PHASES = new Set([
    'countdown', 'starting', 'stop-requested', 'recording', 'pausing', 'paused', 'resuming', 'stopping',
  ]);
  const TERMINAL_PHASES = new Set([
    'actions-ready', 'actions-blocked', 'generated', 'generation-error',
    'run-succeeded', 'run-failed', 'run-canceled', 'error',
  ]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeError(error, operation) {
    return {
      code: error && error.code ? String(error.code) : 'RECORDING_TOOLBAR_FAILED',
      operation: error && error.operation ? String(error.operation) : operation || '',
      message: error && error.message ? String(error.message) : String(error || 'Unknown failure'),
      exitCode: error && Number.isInteger(error.exitCode) ? error.exitCode : null,
      stdout: error && typeof error.stdout === 'string' ? error.stdout : '',
      stderr: error && typeof error.stderr === 'string' ? error.stderr : '',
    };
  }

  function sleepWithTimer(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  function repositoryRelativePath(workdir, value) {
    const normalize = input => String(input || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const root = normalize(workdir).replace(/\/+$/, '');
    const path = normalize(value);
    if (!path || /[\x00-\x1f\x7f`]/.test(path)) return '';
    const pathSegments = path.replace(/^\.\//, '').split('/');
    if (pathSegments.includes('.') || pathSegments.includes('..')) return '';
    let relative = '';
    if (root && path.startsWith(root + '/')) relative = './' + path.slice(root.length + 1);
    const absolute = path.startsWith('/') || /^[A-Za-z]:\//.test(path);
    if (!relative && absolute) return '';
    if (!relative) relative = './' + pathSegments.join('/');
    return /^\.\/\.runtime\/recordings\/rec-[A-Za-z0-9][A-Za-z0-9._-]*\/generated\/[^/]+\.js$/.test(relative)
      ? relative : '';
  }

  function buildAgentRefinementPrompt(input) {
    const context = input || {};
    const execution = context.execution || {};
    const generated = context.generated || {};
    const workdir = String(execution.workdir || '');
    const scriptFile = repositoryRelativePath(workdir, generated.scriptFile);
    if (!scriptFile) {
      const error = new Error('无法生成可移植任务：scriptFile 必须是当前仓库内的 Recorder 生成脚本');
      error.code = 'INVALID_ARGUMENT';
      error.operation = 'buildAgentRefinementPrompt';
      throw error;
    }

    return `优化 Recorder 已生成脚本：\`${scriptFile}\`。`;
  }

  function createApp(options) {
    const settings = options || {};
    const recorder = settings.recorder || global.Recorder;
    const getActiveWindow = settings.getActiveWindow
      || (() => global.window.getActiveWindow());
    const FloatingWindowAPI = settings.FloatingWindow || global.FloatingWindow;
    const dialog = settings.dialog || global.Dialog;
    const command = settings.command || global.Command;
    const file = settings.file || global.File;
    const execution = settings.execution || global.Execution;
    const clipboardAPI = settings.clipboard || global.clipboard;
    const copyText = typeof settings.copyText === 'function'
      ? settings.copyText
      : clipboardAPI && typeof clipboardAPI.copy === 'function'
        ? text => clipboardAPI.copy(text)
        : null;
    const logger = settings.logger || global.console;
    const wait = settings.sleep || sleepWithTimer;
    const countdownStepMs = Number.isFinite(settings.countdownStepMs)
      ? Math.max(0, Math.trunc(settings.countdownStepMs)) : 1000;

    if (!recorder || typeof recorder.getCapabilities !== 'function'
      || typeof recorder.start !== 'function'
      || typeof recorder.buildActions !== 'function'
      || typeof recorder.generateScript !== 'function') {
      throw new Error('recording-console-simple requires the public Recorder Runtime object');
    }
    if (typeof getActiveWindow !== 'function') {
      throw new Error('recording-console-simple requires window.getActiveWindow()');
    }
    if (typeof FloatingWindowAPI !== 'function') {
      throw new Error('recording-console-simple requires FloatingWindow; run it with -ui on macOS');
    }
    if (!dialog || typeof dialog.alert !== 'function') {
      throw new Error('recording-console-simple requires Dialog.alert()');
    }
    if (!command || typeof command.run !== 'function') {
      throw new Error('recording-console-simple requires Command.run()');
    }
    if (!file || typeof file.join !== 'function' || typeof file.read !== 'function'
      || typeof file.ensureDir !== 'function') {
      throw new Error('recording-console-simple requires File.join/read/ensureDir');
    }
    if (!execution || !execution.workdir || !execution.scriptDir) {
      throw new Error('recording-console-simple requires Execution.workdir and Execution.scriptDir');
    }

    const capabilities = clone(recorder.getCapabilities());
    const iconRoot = settings.iconRoot
      || file.join(execution.scriptDir, 'recording-console-simple', 'icons');
    const openDeskBinary = settings.openDeskBinary
      || file.join(execution.workdir, 'dist', 'opendesk');
    const runTimeoutMs = Number.isFinite(settings.runTimeoutMs)
      ? Math.max(1000, Math.trunc(settings.runTimeoutMs)) : 15 * 60 * 1000;

    const state = {
      phase: capabilities.capture && capabilities.capture.available ? 'ready' : 'unavailable',
      countdown: null,
      target: null,
      nativeStatus: null,
      saved: null,
      actions: null,
      generated: null,
      run: null,
      runCountdown: null,
      promptCopyStatus: 'idle',
      error: null,
      errorButton: '',
      detail: capabilities.capture && capabilities.capture.available
        ? '点击开始后，在三秒倒计时内聚焦起始窗口；录制中可切换窗口和应用，请确保整个桌面过程不含敏感输入。'
        : '当前 execution 未获准或系统监听不可用。',
    };

    let session = null;
    let startPromise = null;
    let controlPromise = null;
    let stopPromise = null;
    let generatePromise = null;
    let copyPromptPromise = null;
    let runPromise = null;
    let runController = null;
    let cleanupPromise = null;
    let stopRequested = false;
    let closeRequested = false;
    let controlBoundaryFailure = null;
    let toolbarShown = false;
    let toolbarClosed = false;

    const toolbar = new FloatingWindowAPI({
      position: {
        mode: 'anchor', horizontal: 'center', vertical: 'bottom', margin: 24, display: 'active',
      },
      // Keep the native title bar visually blank; all semantic names live on
      // button tooltips and Accessibility names.
      title: '\u200B',
      theme: 'dark',
      alwaysOnTop: true,
      draggable: true,
      orientation: 'horizontal',
      toolbar: {maxColumns: 6, maxRows: 1},
    });

    function snapshot() {
      return clone(state);
    }

    function countdownIcon(value) {
      return {
        path: file.join(iconRoot, `countdown-${value}.png`),
        renderingMode: 'template',
      };
    }

    function artifact() {
      if (state.generated && state.generated.scriptFile) {
        return {path: state.generated.scriptFile, directory: false};
      }
      if (state.saved && state.saved.recordingDir) {
        return {path: state.saved.recordingDir, directory: true};
      }
      return null;
    }

    function buttonPresentation() {
      const phase = state.phase;
      const recording = phase === 'recording';
      const paused = phase === 'paused';
      const pausing = phase === 'pausing';
      const resuming = phase === 'resuming';
      const captureActive = recording || pausing || paused || resuming;
      const countingDown = phase === 'countdown' && state.countdown;
      const canStart = (phase === 'ready' || TERMINAL_PHASES.has(phase))
        && !generatePromise && !runPromise;
      const canControlCapture = (recording || paused)
        && !startPromise && !controlPromise && !stopPromise;
      const canRetryGeneration = phase === 'generation-error'
        && !!state.actions && state.actions.readiness === 'ready'
        && !state.generated && !generatePromise && !runPromise;
      const canReplay = !!state.generated && !runPromise && !ACTIVE_CAPTURE_PHASES.has(phase);
      const canCopyAgentPrompt = !!(state.generated && state.generated.scriptFile)
        && !!copyText && !copyPromptPromise && state.promptCopyStatus !== 'copying'
        && !runPromise && phase !== 'run-countdown' && phase !== 'running'
        && !ACTIVE_CAPTURE_PHASES.has(phase);
      const terminalArtifact = !!artifact();

      return {
        capture: {
          icon: countingDown ? countdownIcon(state.countdown)
            : (recording || pausing ? BUILT_IN_ICONS.pause : BUILT_IN_ICONS.play),
          label: countingDown ? `${state.countdown} 秒后开始录制`
            : phase === 'starting' ? '正在开始录制'
            : phase === 'stop-requested' ? '正在取消开始'
            : recording ? '暂停录制'
            : pausing ? '正在暂停录制'
            : paused ? '继续录制'
            : resuming ? '正在继续录制'
            : state.saved || state.actions || state.generated ? '重新录制'
            : '开始录制',
          active: captureActive,
          disabled: !(canStart || canControlCapture),
        },
        stop: {
          icon: BUILT_IN_ICONS.stop,
          label: runPromise ? '取消重放'
            : (phase === 'countdown' || phase === 'starting' || phase === 'stop-requested'
              ? '取消开始' : '停止录制'),
          active: false,
          disabled: !(phase === 'countdown' || phase === 'starting' || phase === 'stop-requested'
            || captureActive || !!runPromise),
        },
        replay: {
          icon: phase === 'generating' || canRetryGeneration ? BUILT_IN_ICONS.generate : BUILT_IN_ICONS.replay,
          label: phase === 'run-countdown' && state.runCountdown
            ? `重放将在 ${state.runCountdown} 秒后开始`
            : phase === 'generating' ? '正在自动生成脚本'
            : canRetryGeneration ? '自动生成失败，点击重试'
              : '重放',
          active: phase === 'run-countdown' || phase === 'running' || phase === 'generating',
          disabled: !(canReplay || canRetryGeneration),
        },
        agentPrompt: {
          icon: BUILT_IN_ICONS.agentPrompt,
          label: '复制 Agent 优化脚本',
          active: false,
          disabled: !canCopyAgentPrompt,
        },
        details: {
          icon: BUILT_IN_ICONS.details,
          label: '查看详情',
          active: false,
          disabled: ACTIVE_CAPTURE_PHASES.has(phase),
        },
        finder: {
          icon: BUILT_IN_ICONS.finder,
          label: terminalArtifact && artifact().directory ? '在 Finder 打开录制目录' : '在 Finder 显示生成脚本',
          active: false,
          disabled: !terminalArtifact,
        },
      };
    }

    async function syncButtons() {
      if (toolbarClosed) return;
      const presentation = buttonPresentation();
      for (const id of ['capture', 'stop', 'replay', 'agentPrompt', 'details', 'finder']) {
        const patch = presentation[id];
        patch.error = state.errorButton === id && state.error ? state.error.message : null;
        await toolbar.updateButton(id, patch);
      }
    }

    async function transition(phase, detail, patch) {
      state.phase = phase;
      if (detail !== undefined) state.detail = detail;
      if (patch) Object.assign(state, patch);
      await syncButtons();
      return snapshot();
    }

    async function fail(error, button, fallbackPhase, prefix) {
      const normalized = normalizeError(error, prefix);
      state.error = normalized;
      state.errorButton = button;
      return transition(fallbackPhase || 'error', `${prefix}：${normalized.message}`);
    }

    function validTarget(active) {
      const processId = Number(active && active.pid);
      const title = String(active && active.title || '');
      if (!Number.isInteger(processId) || processId <= 0 || !title) {
        const error = new Error('无法识别有效的当前前台窗口；请聚焦隔离测试目标后重试');
        error.code = 'INVALID_ARGUMENT';
        error.operation = 'window.getActiveWindow';
        throw error;
      }
      return {processId, title};
    }

    async function excludeControlClick(event) {
      if (!session || !event || event.type !== 'click') return null;
      let native;
      try {
        native = session.status();
      } catch (error) {
        controlBoundaryFailure = normalizeError(error, 'RecorderSession.status');
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
        // The requested pause/resume/stop still runs so the user never loses
        // control of the listener. Generation is blocked later because the UI
        // click could otherwise be replayed as a target action.
        controlBoundaryFailure = normalizeError(error, 'RecorderSession.excludeControlClick');
        return null;
      }
    }

    function issueSummary(issues) {
      if (!Array.isArray(issues) || issues.length === 0) return '无';
      return issues.map(issue => {
        const code = issue && issue.code ? String(issue.code) : 'unknown-issue';
        const eventId = issue && issue.eventId ? ` [${issue.eventId}]` : '';
        const message = issue && issue.message ? ` — ${issue.message}` : '';
        return `${code}${eventId}${message}`;
      }).join('\n');
    }

    function compactPath(value) {
      const path = String(value || '');
      if (!path) return '无';
      const root = String(execution.workdir || '').replace(/\/+$/, '');
      return root && path.startsWith(root + '/') ? '.' + path.slice(root.length) : path;
    }

    function artifactPath(value) {
      const path = String(value || '');
      const recordingDir = String(state.saved && state.saved.recordingDir || '').replace(/\/+$/, '');
      return path && recordingDir && path.startsWith(recordingDir + '/')
        ? path.slice(recordingDir.length + 1)
        : compactPath(path);
    }

    function previewText(value, limit) {
      const text = String(value || '');
      if (!text) return '无';
      return text.length <= limit ? text : text.slice(0, limit) + '\n…（完整内容见对应文件）';
    }

    function runDetails() {
      if (!state.run) return '无';
      return JSON.stringify({
        status: state.run.status,
        exitCode: state.run.exitCode,
        logDir: compactPath(state.run.logDir),
        stdout: previewText(state.run.stdout, 240),
        stderr: previewText(state.run.stderr, 240),
      }, null, 2);
    }

    async function stopSession(options) {
      if (!session) return snapshot();
      if (stopPromise) return stopPromise;
      const shouldBuild = !options || options.build !== false;
      const current = session;
      stopPromise = (async () => {
        await transition('stopping', '正在停止 native listener 并完整保存录制事实…', {
          countdown: null, error: null, errorButton: '',
        });
        let stopFailure = null;
        try {
          let saved;
          try {
            saved = await current.stop();
          } catch (error) {
            stopFailure = normalizeError(error, 'RecorderSession.stop');
            saved = error && error.partial ? clone(error.partial) : null;
            if (!saved) throw error;
          }
          if (session === current) session = null;
          state.saved = clone(saved);
          state.nativeStatus = null;
          state.error = stopFailure;
          state.errorButton = stopFailure ? 'stop' : '';
          if (!shouldBuild || closeRequested) {
            await transition(
              closeRequested ? 'closing' : (stopFailure ? 'actions-blocked' : 'saved'),
              stopFailure
                ? `录制因采集故障终结并保留了可用事实：${stopFailure.message}`
                : '录制事实已保存；未自动生成或重放。',
            );
            return snapshot();
          }

          if (controlBoundaryFailure) {
            state.error = clone(controlBoundaryFailure);
            state.errorButton = 'stop';
            await transition(
              'actions-blocked',
              '录制已保存，但工具条控制点击没有建立可审计排除边界；为避免把控制按钮写入脚本，本次不生成代码。',
            );
            return snapshot();
          }

          await transition('building-actions', '正在校验并整理已保存的录制动作…');
          const actions = await recorder.buildActions(saved.recordingDir);
          state.actions = clone(actions);
          if (actions.readiness === 'ready') {
            await transition('actions-ready', '录制已保存并完成内部动作整理，正在自动生成可重放脚本…');
            await generate();
          } else {
            await transition(
              'actions-blocked',
              `录制结果暂不可生成（${actions.readiness}）；请在详情中检查问题。`,
            );
          }
        } catch (error) {
          if (session === current) session = null;
          const partial = error && error.partial ? clone(error.partial) : null;
          if (partial) state.saved = partial;
          await fail(error, 'stop', partial ? 'actions-blocked' : 'error', '停止或整理录制失败');
        }
        return snapshot();
      })();
      try {
        return await stopPromise;
      } finally {
        stopPromise = null;
        await syncButtons();
      }
    }

    function start() {
      if (startPromise || stopPromise || generatePromise || runPromise || session || closeRequested) {
        return startPromise || Promise.resolve(snapshot());
      }
      if (!(state.phase === 'ready' || TERMINAL_PHASES.has(state.phase))) {
        return Promise.resolve(snapshot());
      }

      stopRequested = false;
      startPromise = (async () => {
        state.target = null;
        state.nativeStatus = null;
        state.saved = null;
        state.actions = null;
        state.generated = null;
        state.run = null;
        state.promptCopyStatus = 'idle';
        state.error = null;
        state.errorButton = '';
        controlBoundaryFailure = null;

        for (const value of [3, 2, 1]) {
          state.countdown = value;
          await transition('countdown', `请在 ${value} 秒内聚焦录制的起始窗口。`);
          await wait(countdownStepMs);
          if (stopRequested || closeRequested) {
            state.countdown = null;
            if (!closeRequested) {
              await transition('ready', '已取消开始；尚未启动 native listener。');
            }
            return snapshot();
          }
        }

        state.countdown = null;
        await transition('starting', '正在记录当前前台窗口作为起始上下文…');
        try {
          const target = validTarget(await getActiveWindow());
          state.target = target;
          // Keep this handoff synchronous so the recorded initial context is
          // as close as possible to native listener startup. A later title or
          // foreground change is observational and never stops capture.
          state.detail = `正在为“${target.title}”启动 native listener…`;
          const current = await recorder.start({
            within: target,
            captureKeyboard: !!settings.captureKeyboard,
            ...(settings.captureKeyboard ? {keyboardContent: 'non-sensitive-test'} : {}),
            evidence: 'target-semantics',
            ...(settings.outputDir ? {outputDir: settings.outputDir} : {}),
            ...(Number.isFinite(settings.maxDurationMs) ? {maxDurationMs: settings.maxDurationMs} : {}),
            controlKeycodes: Array.isArray(settings.controlKeycodes) ? settings.controlKeycodes.slice() : [],
          });
          session = current;
          state.nativeStatus = clone(current.status());
          await transition('recording', '录制中；可切换窗口或应用，也可暂停、停止或关闭工具条。');
          if (stopRequested || closeRequested) {
            return stopSession({build: !closeRequested});
          }
        } catch (error) {
          session = null;
          if (!closeRequested) await fail(error, 'capture', 'error', '开始录制失败');
        }
        return snapshot();
      })();

      return startPromise.finally(async () => {
        startPromise = null;
        await syncButtons();
      });
    }

    function pauseOrResume() {
      if (controlPromise || stopPromise || startPromise || !session || closeRequested) {
        return controlPromise || Promise.resolve(snapshot());
      }
      controlPromise = (async () => {
        const native = session.status();
        state.nativeStatus = clone(native);
        if (native.captureState === 'recording') {
          await transition('pausing', '正在暂停录制…', {error: null, errorButton: ''});
          try {
            await session.pause();
            state.nativeStatus = clone(session.status());
            await transition('paused', '已暂停；可在任意窗口继续录制。');
          } catch (error) {
            state.nativeStatus = clone(session.status());
            await fail(error, 'capture', state.nativeStatus.captureState === 'recording' ? 'recording' : 'error', '暂停失败');
          }
        } else if (native.captureState === 'paused') {
          await transition('resuming', '正在重新打开桌面输入接受门…', {error: null, errorButton: ''});
          try {
            await session.resume();
            state.nativeStatus = clone(session.status());
            await transition('recording', '已继续录制。');
          } catch (error) {
            state.nativeStatus = clone(session.status());
            await fail(error, 'capture', 'paused', '继续失败');
          }
        }
        return snapshot();
      })();
      return controlPromise.finally(async () => {
        controlPromise = null;
        await syncButtons();
        if (stopRequested && session && !stopPromise) await stopSession({build: !closeRequested});
      });
    }

    async function stop() {
      if (runPromise && runController) {
        runController.abort('recording-console-simple run canceled');
        return runPromise;
      }
      if (state.phase === 'countdown') {
        stopRequested = true;
        await transition('ready', '已取消开始；尚未启动 native listener。', {countdown: null});
        return startPromise || snapshot();
      }
      if (startPromise && !session) {
        stopRequested = true;
        await transition('stop-requested', '已请求停止；若 listener 已启动将立即完成终结和保存。', {countdown: null});
        return startPromise;
      }
      if (controlPromise) {
        stopRequested = true;
        await controlPromise;
      }
      if (session) return stopSession({build: true});
      return snapshot();
    }

    function generate() {
      if (generatePromise || runPromise || closeRequested || !state.actions
        || state.actions.readiness !== 'ready' || state.generated) {
        return generatePromise || Promise.resolve(snapshot());
      }
      generatePromise = (async () => {
        await transition('generating', '正在从固定 actions 生成普通 JavaScript…', {
          error: null, errorButton: '', run: null,
        });
        try {
          const generated = await recorder.generateScript(state.actions.actionsFile, {mode: 'basic'});
          const source = String(file.read(generated.scriptFile));
          state.generated = {...clone(generated), source};
          await transition('generated', '脚本已自动生成但尚未重放；重放需要单独点击。');
        } catch (error) {
          await fail(error, 'replay', 'generation-error', '自动生成脚本失败');
        }
        return snapshot();
      })();
      return generatePromise.finally(async () => {
        generatePromise = null;
        await syncButtons();
      });
    }

    function runGenerated() {
      if (runPromise || closeRequested || !state.generated || !state.generated.scriptFile) {
        return runPromise || Promise.resolve(snapshot());
      }
      runPromise = (async () => {
        runController = new global.AbortController();
        const startedAt = new Date().toISOString();
        const runLogDir = file.join(
          execution.workdir,
          '.runtime', 'examples', 'custom-ui', 'recording-console-simple',
          'generated-script-runs', startedAt.replace(/[:.]/g, '-'),
        );
        file.ensureDir(runLogDir);
        state.run = {status: 'preparing', startedAt, finishedAt: null, exitCode: null, stdout: '', stderr: '', logDir: runLogDir};
        for (const value of [3, 2, 1]) {
          await transition('run-countdown', `请在 ${value} 秒内恢复预期的起始桌面和窗口；不会校验 PID 或标题。`, {
            error: null, errorButton: '', runCountdown: value,
          });
          await wait(countdownStepMs);
          if (runController.signal.aborted) {
            state.run = {...state.run, status: 'canceled', finishedAt: new Date().toISOString()};
            await transition('run-canceled', '重放准备已取消；生成脚本仍保留。', {runCountdown: null});
            runController = null;
            return snapshot();
          }
        }
        await transition('running', '正在新的 OpenDesk execution 中重放生成脚本…', {
          error: null,
          errorButton: '',
          runCountdown: null,
          run: {status: 'running', startedAt, finishedAt: null, exitCode: null, stdout: '', stderr: '', logDir: runLogDir},
        });
        try {
          const result = await command.run(openDeskBinary, [
            '-script', state.generated.scriptFile,
            '-console-mode', 'script',
            '-log-dir', runLogDir,
          ], {
            cwd: execution.workdir,
            timeout: runTimeoutMs,
            maxOutputBytes: 1024 * 1024,
            signal: runController.signal,
          });
          state.run = {
            status: 'succeeded', startedAt, finishedAt: new Date().toISOString(),
            exitCode: result.exitCode, stdout: result.stdout || '', stderr: result.stderr || '', logDir: runLogDir,
          };
          await transition('run-succeeded', '重放已以 exit code 0 结束；业务结果仍需独立确认。');
        } catch (error) {
          const normalized = normalizeError(error, 'Command.run');
          const canceled = normalized.code === 'CANCELED';
          state.run = {
            status: canceled ? 'canceled' : 'failed', startedAt, finishedAt: new Date().toISOString(),
            exitCode: normalized.exitCode, stdout: normalized.stdout, stderr: normalized.stderr, logDir: runLogDir,
          };
          if (canceled) {
            state.error = null;
            state.errorButton = '';
            await transition('run-canceled', '重放已取消；生成脚本仍保留。', {runCountdown: null});
          } else {
            await fail(error, 'replay', 'run-failed', '重放失败');
          }
        } finally {
          state.runCountdown = null;
          runController = null;
        }
        return snapshot();
      })();
      return runPromise.finally(async () => {
        runPromise = null;
        await syncButtons();
      });
    }

    function replayOrRetryGeneration() {
      if (state.generated) return runGenerated();
      if (state.phase === 'generation-error' && state.actions && state.actions.readiness === 'ready') {
        return generate();
      }
      return Promise.resolve(snapshot());
    }

    function copyAgentPrompt() {
      if (copyPromptPromise || closeRequested || runPromise
        || !state.generated || !state.generated.scriptFile || !copyText) {
        return copyPromptPromise || Promise.resolve(snapshot());
      }
      copyPromptPromise = (async () => {
        try {
          state.promptCopyStatus = 'copying';
          await syncButtons();
          const prompt = buildAgentRefinementPrompt({
            execution,
            generated: state.generated,
          });
          await copyText(prompt);
          state.promptCopyStatus = 'copied';
          if (state.errorButton === 'agentPrompt') {
            state.error = null;
            state.errorButton = '';
          }
          state.detail = '已复制 Agent 脚本优化任务；粘贴到新对话即可。';
          await syncButtons();
        } catch (error) {
          state.promptCopyStatus = 'failed';
          await fail(error, 'agentPrompt', state.phase, '复制 Agent 脚本优化任务失败');
        }
        return snapshot();
      })();
      return copyPromptPromise.finally(async () => {
        copyPromptPromise = null;
        await syncButtons();
      });
    }

    function detailsText() {
      const counts = state.saved && state.saved.counts
        ? state.saved.counts : state.nativeStatus && state.nativeStatus.counts;
      const timing = state.generated && state.generated.timing;
      const timingText = timing
        ? `录制间隔 ÷ ${timing.speedMultiplier}×，限制 ${timing.minimumDelayMs}..${timing.maximumDelayMs}ms`
        : '尚未生成';
      const parts = [
        `状态：${state.phase}`,
        `说明：${state.detail}`,
        `起始上下文：${state.target ? `${state.target.title}（PID ${state.target.processId}）` : '尚未选择'}`,
        `录制目录：${compactPath(state.saved && state.saved.recordingDir)}`,
        `raw：${artifactPath(state.saved && state.saved.rawFile)}`,
        `manifest：${artifactPath(state.saved && state.saved.manifestFile)}`,
        `counts：${counts ? JSON.stringify(counts) : '无'}`,
        `录制问题：${issueSummary(state.saved && state.saved.issues)}`,
        `内部 Actions：${state.actions ? `${artifactPath(state.actions.actionsFile)}（${state.actions.readiness}）` : '无'}`,
        `内部归组问题：${issueSummary(state.actions && state.actions.issues)}`,
        `生成脚本：${artifactPath(state.generated && state.generated.scriptFile)}`,
        `candidate：${artifactPath(state.generated && state.generated.candidateFile)}`,
        `生成节奏：${timingText}`,
        `错误：${state.error ? `${state.error.code} · ${state.error.operation} · ${state.error.message}` : '无'}`,
        `生成源码预览：\n${previewText(state.generated && state.generated.source, 360)}`,
        `重放摘要：\n${runDetails()}`,
      ];
      const text = parts.join('\n');
      if (text.length <= 4000) return text;
      return text.slice(0, 3920) + '\n\n…详情超过原生 Dialog 的 4096 字符上限，完整内容请查看对应文件与日志目录。';
    }

    async function showDetails() {
      try {
        await dialog.alert({
          title: '录制详情',
          message: detailsText(),
          level: state.error ? 'error' : state.generated ? 'success' : 'info',
          okText: '关闭',
        });
      } catch (error) {
        await fail(error, 'details', state.phase, '打开详情失败');
      }
      return snapshot();
    }

    async function reveal() {
      const selected = artifact();
      if (!selected) return snapshot();
      try {
        await command.run('/usr/bin/open', selected.directory ? [selected.path] : ['-R', selected.path], {
          cwd: execution.workdir,
          timeout: 10000,
          maxOutputBytes: 1024 * 1024,
        });
        state.detail = selected.directory ? '已在 Finder 打开录制目录。' : '已在 Finder 显示生成文件。';
        await syncButtons();
      } catch (error) {
        await fail(error, 'finder', state.phase, 'Finder 打开失败');
      }
      return snapshot();
    }

    function cleanup() {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async () => {
        closeRequested = true;
        stopRequested = true;
        if (runController) runController.abort('recording-console-simple closed');
        if (runPromise) {
          try { await runPromise; } catch (_) { /* run state already records failure */ }
        }
        if (startPromise) {
          try { await startPromise; } catch (_) { /* start state already records failure */ }
        }
        if (controlPromise) {
          try { await controlPromise; } catch (_) { /* control state already records failure */ }
        }
        if (stopPromise) {
          try { await stopPromise; } catch (_) { /* stop state already records failure */ }
        }
        if (generatePromise) {
          try { await generatePromise; } catch (_) { /* generation state already records failure */ }
        }
        if (copyPromptPromise) {
          try { await copyPromptPromise; } catch (_) { /* copy state already records failure */ }
        }
        if (session) await stopSession({build: false});
        state.phase = 'closed';
        state.detail = '工具条已关闭；不会自动重放。';
      })();
      return cleanupPromise;
    }

    // Play and pause share one stable position. Starting returns synchronously
    // so callback busy presentation cannot replace the required 3/2/1 icons;
    // pause/resume still returns its Promise to preserve button single-flight.
    toolbar.addButton('capture', '开始录制', BUILT_IN_ICONS.play, event => {
      if (!session) {
        void start().catch(error => logger.error(
          'RECORDING_CONSOLE_SIMPLE_CAPTURE_ERROR=' + JSON.stringify(normalizeError(error, 'start')),
        ));
        return undefined;
      }
      return (async () => {
        await excludeControlClick(event);
        return pauseOrResume();
      })();
    });
    toolbar.addButton('stop', '停止录制', BUILT_IN_ICONS.stop, async event => {
      await excludeControlClick(event);
      return stop();
    });
    toolbar.addSeparator('capture-output-separator');
    toolbar.addButton('replay', '重放', BUILT_IN_ICONS.replay, replayOrRetryGeneration);
    toolbar.addButton('agentPrompt', '复制 Agent 优化脚本', BUILT_IN_ICONS.agentPrompt, copyAgentPrompt);
    toolbar.addSeparator('output-info-separator');
    toolbar.addButton('details', '查看详情', BUILT_IN_ICONS.details, showDetails);
    toolbar.addButton('finder', '在 Finder 显示生成脚本', BUILT_IN_ICONS.finder, reveal);
    toolbar.onError(error => {
      logger.error('RECORDING_CONSOLE_SIMPLE_UI_ERROR=' + JSON.stringify(normalizeError(error, 'FloatingWindow.callback')));
    });
    toolbar.on('close', () => {
      toolbarClosed = true;
      void cleanup();
    });

    async function show() {
      if (!toolbarShown) {
        await syncButtons();
        const shown = await toolbar.show();
        toolbarShown = true;
        logger.log('RECORDING_CONSOLE_SIMPLE_READY=' + JSON.stringify({
          windowId: toolbar.id,
          bounds: shown.bounds,
          icons: BUILT_IN_ICONS,
          countdownIcons: [3, 2, 1].map(value => countdownIcon(value).path),
        }));
        return shown;
      }
      return toolbar.getState();
    }

    async function run() {
      await show();
      const closed = await toolbar.waitUntilClosed();
      toolbarClosed = true;
      await cleanup();
      return closed;
    }

    async function close() {
      await cleanup();
      if (!toolbarClosed) await toolbar.close();
      toolbarClosed = true;
      return snapshot();
    }

    return Object.freeze({
      run, show, close, start, pauseOrResume, stop, generate, runGenerated, copyAgentPrompt, showDetails, reveal,
      state: snapshot,
      toolbar: () => toolbar,
      icons: () => clone(BUILT_IN_ICONS),
    });
  }

  global.OpenDeskSimpleRecordingConsole = Object.freeze({
    createApp,
    buildAgentRefinementPrompt,
  });
})(globalThis);
