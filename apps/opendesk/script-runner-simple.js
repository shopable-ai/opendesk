(function installOpenDeskProductScriptRunner(global) {
  'use strict';

  const file = global.File;
  const system = global.System;
  const appRuntime = global.automation && global.automation.app;
  const execution = global.Execution;
  const command = global.Command;
  const runtimeUI = global.ui;
  const NativeFloatingWindow = global.FloatingWindow;
  const NativeAbortController = global.AbortController;
  const nativeRecipeExecution = global.__opendeskRecipeExecution;
  const logger = global.console;

  if (!global.OpenDeskScriptRunnerSimple
    || typeof global.OpenDeskScriptRunnerSimple.createApp !== 'function') {
    const controllerFile = file.join(execution.scriptDir, 'script-runner', 'controller.js');
    (0, eval)(file.read(controllerFile) + '\n//# sourceURL=' + controllerFile);
  }

  const RunnerController = global.OpenDeskScriptRunnerSimple;
  if (!RunnerController || typeof RunnerController.createApp !== 'function') {
    throw new Error('OpenDesk Script Runner controller did not load');
  }

  function readEnv(name) {
    const value = system.getEnv(name);
    return value && value.trim() ? value.trim() : '';
  }

  function resolveAppDataRoot() {
    const configured = readEnv('OPENDESK_APP_DATA_DIR');
    if (configured) return file.path(configured);

    const home = readEnv('HOME') || readEnv('USERPROFILE');
    const appCapabilities = appRuntime.getCapabilities();
    const packageID = appCapabilities.packageId || 'com.opendesk.desktop';
    if (home) return file.join(home, '.opendesk', 'apps', packageID);
    throw new Error('无法确定 OpenDesk 可写数据目录；请设置 OPENDESK_APP_DATA_DIR');
  }

  const appDataRoot = resolveAppDataRoot();
  file.ensureDir(appDataRoot);

  const configuredRoot = readEnv('OPENDESK_SCRIPT_RUNNER_DIR');
  const hasConfiguredRoot = !!configuredRoot;
  const scriptRoot = hasConfiguredRoot
    ? file.path(configuredRoot)
    : file.join(appDataRoot, 'recipes');
  const runnerExecution = Object.freeze({workdir: appDataRoot});

  const DEFAULT_WINDOW_TITLE = 'OpenDesk — Script Runner';
  const PRODUCT_MAIN_WINDOW_ID = 'main';
  // The product shell adds the brand, Customize and Help controls around the
  // player controls (Run/Stop/Previous/Current/Next/List). Their one-row
  // native layout needs 590pt including the toolbar chrome; 520pt makes the
  // host plan a second row and reject the maxRows: 1 declaration at show().
  const PRODUCT_TOOLBAR_MAX_WIDTH = 590;
  const PRODUCT_HOMEPAGE_ACTION = Object.freeze({
    actionId: 'opendesk.home',
    controlId: 'officialHome',
    icon: Object.freeze({
      path: file.join(execution.scriptDir, 'assets', 'opendesk-logo.png'),
      renderingMode: 'original',
    }),
  });
  const OFFICIAL_TOOLBAR_ACTIONS = Object.freeze([
    Object.freeze({
      actionId: 'opendesk.customize',
      controlId: 'officialCustomize',
      label: '定制自动化',
      icon: 'bag.fill',
    }),
    Object.freeze({
      actionId: 'opendesk.help',
      controlId: 'officialHelp',
      icon: Object.freeze({
        path: file.join(execution.scriptDir, 'assets', 'help-questionmark.png'),
        renderingMode: 'template',
      }),
    }),
  ]);

  function resolveWindowTitle(settings) {
    const input = settings || {};
    if (typeof input.windowTitle === 'string' && input.windowTitle.trim()) {
      return input.windowTitle.trim();
    }
    // title predates the product-level seam. Keep it as a compatibility input
    // while locale-aware callers move to windowTitle.
    if (typeof input.title === 'string' && input.title.trim()) {
      return input.title.trim();
    }
    return DEFAULT_WINDOW_TITLE;
  }

  function productizeMainWindowSpec(spec, mainWindowId, windowTitle) {
    const source = spec || {};
    let content = source.content;
    if (content && typeof content === 'object' && typeof content.html === 'string') {
      content = Object.assign({}, content, {
        html: content.html.replace(/>Script Runner</g, '>自动化<'),
      });
    }
    return Object.assign({}, source, {
      id: mainWindowId,
      title: windowTitle,
      content,
    });
  }

  function isScriptManagerWindowSpec(spec) {
    return !!spec && typeof spec.id === 'string' && spec.id.startsWith('scriptRunnerList');
  }

  function createRunnerUI(mainWindowId, windowTitle) {
    return Object.freeze({
      createWindow(spec) {
        const source = spec || {};
        return runtimeUI.createWindow(
          isScriptManagerWindowSpec(source)
            ? productizeMainWindowSpec(source, mainWindowId, windowTitle)
            : source,
        );
      },
    });
  }

  function formatScriptLabelText(value) {
    return typeof value === 'string'
      ? value.replace(/\.js(?=$|\s*·)/i, '')
      : value;
  }

  function createProductFloatingWindow(homeAction, secondaryActions, maxWidth, windowTitle) {
    function ProductFloatingWindow(spec) {
      const source = spec || {};
      const toolbarSpec = Object.assign({}, source.toolbar || {}, {maxWidth, maxRows: 1});
      const inner = new NativeFloatingWindow(Object.assign({}, source, {
        title: windowTitle,
        toolbar: toolbarSpec,
      }));
      let secondaryInstalled = false;

      if (homeAction) {
        inner.addButton(homeAction.controlId, homeAction.label, homeAction.icon, homeAction.onClick);
        inner.addSeparator('officialBrandSeparator');
      }

      function installSecondaryActions() {
        if (secondaryInstalled || !secondaryActions.length) return;
        secondaryInstalled = true;
        inner.addSeparator('officialActionsSeparator');
        for (const action of secondaryActions) {
          inner.addButton(action.controlId, action.label, action.icon, action.onClick);
        }
      }

      return {
        get id() { return inner.id; },
        addButton(id, label, icon, callback) { return inner.addButton(id, label, icon, callback); },
        addLabel(id, text, options) {
          return inner.addLabel(id, id === 'script' ? formatScriptLabelText(text) : text, options);
        },
        addSeparator(id) { return inner.addSeparator(id); },
        updateButton(id, patch) { return inner.updateButton(id, patch); },
        updateLabel(id, patch) {
          const nextPatch = id === 'script' && patch && typeof patch.text === 'string'
            ? Object.assign({}, patch, {text: formatScriptLabelText(patch.text)})
            : patch;
          return inner.updateLabel(id, nextPatch);
        },
        // The player positions its transient list from the actual native List
        // button bounds. Keep that geometry API intact through the product
        // toolbar decorator instead of falling back to the whole toolbar.
        getButtonState(id) { return inner.getButtonState(id); },
        getState() { return inner.getState(); },
        on(event, callback) { return inner.on(event, callback); },
        onError(callback) { return inner.onError(callback); },
        async show() {
          installSecondaryActions();
          return inner.show();
        },
        waitUntilClosed() { return inner.waitUntilClosed(); },
        hide() { return inner.hide(); },
        close() { return inner.close(); },
      };
    }

    return ProductFloatingWindow;
  }

  function argValue(args, name) {
    if (!Array.isArray(args)) return '';
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? String(args[index + 1]) : '';
  }

  function createProductRunner(options) {
    const settings = options || {};
    const windowTitle = resolveWindowTitle(settings);
    const officialShell = settings.officialShell;
    if (!officialShell
      || typeof officialShell.getAction !== 'function'
      || typeof officialShell.activate !== 'function') {
      throw new Error('OpenDesk product Script Runner requires Official Shell');
    }

    const mainWindowId = settings.mainWindowId || PRODUCT_MAIN_WINDOW_ID;
    const toolbarMaxWidth = Number.isFinite(settings.toolbarMaxWidth)
      ? settings.toolbarMaxWidth
      : PRODUCT_TOOLBAR_MAX_WIDTH;
    let app = null;
    let runTask = null;
    let opening = null;
    let lastError = null;
    let latestExecution = null;

    function recipeDisplayName(scriptPath) {
      const parts = String(scriptPath || '').split(/[\\/]/);
      return formatScriptLabelText(parts[parts.length - 1] || '自动化');
    }

    async function beginRecipeToast(base) {
      const show = runtimeUI && (typeof runtimeUI.toast === 'function'
        ? runtimeUI.toast.bind(runtimeUI)
        : typeof runtimeUI.notify === 'function' ? runtimeUI.notify.bind(runtimeUI) : null);
      if (!show) return null;
      try {
        return await show({
          message: `正在运行“${recipeDisplayName(base.scriptPath)}”…`,
          caption: 'OpenDesk 已开始执行，可随时点击停止。',
          level: 'info',
          timeoutMs: 0,
          closable: true,
          progress: {indeterminate: true},
        });
      } catch (error) {
        logRecipeToastError('start', error);
        return null;
      }
    }

    function permissionFailure(error) {
      const message = String(error && error.message || error || '');
      const normalized = message.toLowerCase();
      let expectedID = '';
      if (normalized.includes('accessibility') || normalized.includes('辅助功能')) expectedID = 'accessibility';
      else if (normalized.includes('screen capture') || normalized.includes('screen recording') || normalized.includes('屏幕录制')) expectedID = 'screen-capture';
      else if (normalized.includes('input monitoring') || normalized.includes('输入监控')) expectedID = 'input-monitoring';
      else if (normalized.includes('automation permission') || normalized.includes('自动化权限')) expectedID = 'automation';
      if (!expectedID && !normalized.includes('permission_denied') && !normalized.includes('permission is not granted')) {
        return null;
      }
      try {
        const report = appRuntime.getPermissions('desktop-automation');
        const rawPermissions = report && (report.permissions || report.Permissions);
        const permissions = Array.isArray(rawPermissions) ? rawPermissions : [];
        const blocked = permissions.find(permission => {
          const id = String(permission && (permission.id || permission.ID) || '').split(':', 1)[0];
          const status = String(permission && (permission.status || permission.Status) || 'unknown');
          return (!expectedID || id === expectedID) && status !== 'granted' && status !== 'not_required';
        });
        if (!blocked) return null;
        const id = String(blocked.id || blocked.ID || '').split(':', 1)[0];
        const labels = {
          accessibility: '辅助功能',
          'screen-capture': '屏幕录制',
          'input-monitoring': '输入监控',
          automation: '自动化',
        };
        return labels[id] || blocked.displayName || blocked.DisplayName || '所需系统';
      } catch (_) {
        return expectedID === 'accessibility' ? '辅助功能' : null;
      }
    }

    function recipeFailureMessage(base, error) {
      const scriptName = recipeDisplayName(base.scriptPath);
      const permission = permissionFailure(error);
      if (permission) {
        return {
          message: `“${scriptName}”未运行：OpenDesk 缺少“${permission}”权限。`,
          caption: '请打开菜单“系统权限…”处理后重试。',
        };
      }
      const detail = error && error.message ? String(error.message) : String(error || '未知错误');
      return {
        message: `“${scriptName}”运行失败。`,
        caption: detail.length > 180 ? detail.slice(0, 177) + '…' : detail,
      };
    }

    function logRecipeToastError(stage, error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('SCRIPT_RUNNER_TOAST_ERROR=' + JSON.stringify({
          stage,
          message: error && error.message ? String(error.message) : String(error || 'toast failed'),
        }));
      }
    }

    async function finishRecipeToast(toastTask, patch) {
      let toast = null;
      try {
        toast = await toastTask;
        if (toast && typeof toast.update === 'function') {
          await toast.update(Object.assign({progress: null}, patch));
        }
      } catch (error) {
        logRecipeToastError('finish', error);
      }
    }

    const productCommand = Object.freeze({
      run(executablePath, args, options) {
        const childScript = executablePath === system.getExecutablePath()
          && Array.isArray(args)
          && args.includes('-script')
          && args.includes('-log-dir');
        if (!childScript) return command.run(executablePath, args, options);

        const startedAt = new Date().toISOString();
        const base = {
          scriptPath: argValue(args, '-script'),
          logDir: argValue(args, '-log-dir'),
          status: 'running',
          startedAt,
          finishedAt: '',
          exitCode: null,
        };
        latestExecution = Object.assign({}, base);
        const toastTask = beginRecipeToast(base);
        let pending;
        try {
          if (!nativeRecipeExecution || typeof nativeRecipeExecution.run !== 'function') {
            const unavailable = new Error('App-owned Recipe execution is unavailable');
            unavailable.code = 'APP_RECIPE_RUNNER_UNAVAILABLE';
            throw unavailable;
          }
          pending = nativeRecipeExecution.run({
            scriptPath: base.scriptPath,
            workdir: options && options.cwd ? String(options.cwd) : runnerExecution.workdir,
            logDir: base.logDir,
            signal: options && options.signal,
          });
        } catch (error) {
          latestExecution = Object.assign({}, base, {
            status: error && error.code === 'CANCELED' ? 'canceled' : 'failed',
            finishedAt: new Date().toISOString(),
          });
          const failure = recipeFailureMessage(base, error);
          void finishRecipeToast(toastTask, Object.assign({level: 'error', timeoutMs: 7000, closable: true}, failure));
          throw error;
        }
        return Promise.resolve(pending).then(async result => {
          latestExecution = Object.assign({}, base, {
            status: 'succeeded',
            finishedAt: new Date().toISOString(),
            exitCode: 0,
            executionId: result && result.executionId ? String(result.executionId) : '',
          });
          await finishRecipeToast(toastTask, {
            message: `“${recipeDisplayName(base.scriptPath)}”运行完成。`,
            caption: '执行日志已保存。',
            level: 'success',
            timeoutMs: 2200,
            closable: false,
          });
          return {exitCode: 0, stdout: '', stderr: ''};
        }, async error => {
          latestExecution = Object.assign({}, base, {
            status: error && error.code === 'CANCELED' ? 'canceled' : 'failed',
            finishedAt: new Date().toISOString(),
            exitCode: null,
            executionId: error && error.executionId ? String(error.executionId) : '',
          });
          if (error && error.code === 'CANCELED') {
            await finishRecipeToast(toastTask, {
              message: `已停止“${recipeDisplayName(base.scriptPath)}”。`,
              caption: '剩余脚本不会继续执行。',
              level: 'warning',
              timeoutMs: 2600,
              closable: false,
            });
          } else {
            const failure = recipeFailureMessage(base, error);
            await finishRecipeToast(toastTask, Object.assign({level: 'error', timeoutMs: 7000, closable: true}, failure));
          }
          throw error;
        });
      },
    });

    function isExpectedLifecycleCancellation(error) {
      return !!(error && error.code === 'UI_CANCELED');
    }

    async function presentOfficialMessage(message) {
      const text = String(message || '');
      if (runtimeUI && typeof runtimeUI.toast === 'function') {
        try {
          await runtimeUI.toast(text);
          return 'notify';
        } catch (error) {
          if (logger && typeof logger.warn === 'function') {
            logger.warn('OPENDESK_OFFICIAL_NOTIFY_FALLBACK=' + JSON.stringify({
              message: text,
              error: error && error.message ? String(error.message) : String(error || 'notify failed'),
            }));
          }
        }
      }
      if (app && typeof app.openList === 'function') {
        await app.openList(text);
        return 'runner-status';
      }
      return 'log-only';
    }

    async function activateOfficialAction(actionId) {
      const action = officialShell.getAction(actionId);
      if (!action || !action.visible) return null;
      try {
        const result = await officialShell.activate(actionId);
        const presentation = result.status === 'opened' && actionId === 'opendesk.home'
          ? 'external'
          : await presentOfficialMessage(result.message);
        if (logger && typeof logger.log === 'function') {
          logger.log('OPENDESK_OFFICIAL_ACTION=' + JSON.stringify({
            actionId,
            status: result.status,
            presentation,
          }));
        }
        return result;
      } catch (error) {
        const message = error && error.message ? String(error.message) : String(error || 'unknown error');
        await presentOfficialMessage(`${action.title}打开失败：${message}`);
        if (logger && typeof logger.error === 'function') {
          logger.error('OPENDESK_OFFICIAL_ACTION_ERROR=' + JSON.stringify({actionId, message}));
        }
        return null;
      }
    }

    function resolveToolbarAction(metadata) {
      const action = officialShell.getAction(metadata.actionId);
      if (!action || !action.visible) return null;
      return Object.freeze({
        controlId: metadata.controlId,
        label: metadata.label || action.label,
        icon: metadata.icon,
        onClick: () => activateOfficialAction(action.id),
      });
    }

    function homeAction() {
      return resolveToolbarAction(PRODUCT_HOMEPAGE_ACTION);
    }

    function secondaryActions() {
      const actions = [];
      for (const metadata of OFFICIAL_TOOLBAR_ACTIONS) {
        const action = resolveToolbarAction(metadata);
        if (action) actions.push(action);
      }
      return actions;
    }

    function start() {
      if (app && runTask) return app;
      const current = RunnerController.createApp({
        scriptRoot,
        managedScriptRoot: !hasConfiguredRoot,
        file,
        command: productCommand,
        execution: runnerExecution,
        system,
        ui: createRunnerUI(mainWindowId, windowTitle),
        FloatingWindow: createProductFloatingWindow(homeAction(), secondaryActions(), toolbarMaxWidth, windowTitle),
        AbortController: NativeAbortController,
        openListOnStart: false,
        hideListOnClose: true,
        closeListOnRunnerExit: true,
      });
      app = current;
      const task = current.run()
        .catch(error => {
          if (isExpectedLifecycleCancellation(error)) {
            lastError = null;
            return;
          }
          lastError = error && error.message ? String(error.message) : String(error || 'Script Runner failed');
          if (logger && typeof logger.error === 'function') {
            logger.error('SCRIPT_RUNNER_LIFECYCLE_ERROR=' + JSON.stringify({message: lastError}));
          }
        })
        .finally(() => {
          if (runTask === task) runTask = null;
          if (app === current) app = null;
        });
      runTask = task;
      return current;
    }

    async function launch() {
      lastError = null;
      const current = start();
      await current.prepareList();
      return state();
    }

    async function open(source) {
      if (opening) return opening;
      lastError = null;
      const task = (async () => {
        start();
        await Promise.resolve();
        return state();
      })();
      opening = task;
      try {
        return await task;
      } finally {
        if (opening === task) opening = null;
      }
    }

    async function openList(source) {
      const current = start();
      await current.openList(source ? `打开来源：${source}` : '');
      lastError = null;
      return state();
    }

    async function waitUntilClosed() {
      const currentTask = runTask;
      if (currentTask) await currentTask;
    }

    async function stopRun() {
      return app ? app.stopRun() : false;
    }

    function state() {
      return {
        active: !!app,
        opening: !!opening,
        lastError,
        mainWindowId,
        toolbarMaxWidth,
        windowTitle,
        latestExecution: latestExecution ? Object.assign({}, latestExecution) : null,
        runner: app ? app.state() : null,
      };
    }

    return Object.freeze({
      launch,
      open,
      openList,
      stopRun,
      state,
      waitUntilClosed,
    });
  }

  global.OpenDeskProductScriptRunner = Object.freeze({
    create: createProductRunner,
    constants: Object.freeze({
      defaultWindowTitle: DEFAULT_WINDOW_TITLE,
      mainWindowId: PRODUCT_MAIN_WINDOW_ID,
      toolbarMaxWidth: PRODUCT_TOOLBAR_MAX_WIDTH,
    }),
  });

  global.OpenDeskProductPaths = Object.freeze({
    appDataRoot,
    scriptRoot,
    packageRoot: execution.workdir,
    executable: system.getExecutablePath(),
  });
})(globalThis);
