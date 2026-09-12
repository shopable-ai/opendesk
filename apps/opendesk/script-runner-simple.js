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

  const PRODUCT_MAIN_WINDOW_ID = 'main';
  const PRODUCT_TOOLBAR_MAX_WIDTH = 520;
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
      icon: 'ai.assistant',
    }),
    Object.freeze({
      actionId: 'opendesk.help',
      controlId: 'officialHelp',
      icon: 'questionmark.circle.fill',
    }),
  ]);

  function createRunnerUI(mainWindowId) {
    return Object.freeze({
      createWindow(spec) {
        const next = Object.assign({}, spec || {}, {id: mainWindowId});
        return runtimeUI.createWindow(next);
      },
    });
  }

  function createProductFloatingWindow(homeAction, secondaryActions, maxWidth) {
    function ProductFloatingWindow(spec) {
      const source = spec || {};
      const toolbarSpec = Object.assign({}, source.toolbar || {}, {maxWidth, maxRows: 1});
      const inner = new NativeFloatingWindow(Object.assign({}, source, {toolbar: toolbarSpec}));
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
        addLabel(id, text, options) { return inner.addLabel(id, text, options); },
        addSeparator(id) { return inner.addSeparator(id); },
        updateButton(id, patch) { return inner.updateButton(id, patch); },
        updateLabel(id, patch) { return inner.updateLabel(id, patch); },
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

  function createProductRunner(options) {
    const settings = options || {};
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

    async function presentOfficialMessage(message) {
      const text = String(message || '');
      if (runtimeUI && typeof runtimeUI.notify === 'function') {
        try {
          await runtimeUI.notify(text);
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
        label: action.label,
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
        command,
        execution: runnerExecution,
        system,
        ui: createRunnerUI(mainWindowId),
        FloatingWindow: createProductFloatingWindow(homeAction(), secondaryActions(), toolbarMaxWidth),
        AbortController: NativeAbortController,
        openListOnStart: false,
      });
      app = current;
      const task = current.run()
        .catch(error => {
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

    async function open(source) {
      if (opening) return opening;
      const task = (async () => {
        const current = start();
        await Promise.resolve();
        await current.openList(source ? `打开来源：${source}` : '');
        lastError = null;
        return state();
      })();
      opening = task;
      try {
        return await task;
      } finally {
        if (opening === task) opening = null;
      }
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
        runner: app ? app.state() : null,
      };
    }

    return Object.freeze({
      open,
      openList: open,
      stopRun,
      state,
      waitUntilClosed,
    });
  }

  global.OpenDeskProductScriptRunner = Object.freeze({
    create: createProductRunner,
    constants: Object.freeze({
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
