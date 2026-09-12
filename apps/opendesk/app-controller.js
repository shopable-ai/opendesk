(function installOpenDeskProductAppController(global) {
  'use strict';

  function errorDetails(error) {
    return {
      message: error && error.message ? String(error.message) : String(error || 'unknown error'),
      stack: error && error.stack ? String(error.stack) : '',
    };
  }

  function createController(options) {
    const settings = options || {};
    const appRuntime = settings.appRuntime || (global.automation && global.automation.app);
    const runner = settings.runner;
    const schedulerCenter = settings.schedulerCenter;
    const runtimeLog = settings.runtimeLog;
    const permissionsCenter = settings.permissionsCenter;
    const officialShell = settings.officialShell;
    const logger = settings.logger || global.console;
    let started = false;
    let handledActions = 0;
    let failedActions = 0;

    if (!appRuntime || typeof appRuntime.onAction !== 'function') {
      throw new Error('OpenDesk product controller requires automation.app.onAction()');
    }
    if (!runner || typeof runner.open !== 'function') {
      throw new Error('OpenDesk product controller requires Script Runner');
    }
    if (!schedulerCenter
      || typeof schedulerCenter.open !== 'function'
      || typeof schedulerCenter.openCreate !== 'function') {
      throw new Error('OpenDesk product controller requires Scheduler Center');
    }

    async function dispatch(event) {
      if (!event || !event.id) return false;
      const source = event.source || event.id;
      switch (event.id) {
        case 'opendesk.open':
        case 'runner.open':
          await runner.open(source);
          return true;
        case 'scheduler.open':
        case 'scheduler.center':
          await schedulerCenter.open(source);
          return true;
        case 'scheduler.new':
          await schedulerCenter.openCreate(source);
          return true;
        case 'runtime.log':
          if (!runtimeLog || typeof runtimeLog.open !== 'function') return false;
          await runtimeLog.open(source);
          return true;
        case 'permissions.open':
          if (!permissionsCenter || typeof permissionsCenter.open !== 'function') return false;
          await permissionsCenter.open(source);
          return true;
        default:
          if (officialShell
            && typeof officialShell.activate === 'function'
            && ['opendesk.home', 'opendesk.help', 'opendesk.customize'].includes(event.id)) {
            await officialShell.activate(event.id);
            return true;
          }
          return false;
      }
    }

    async function handle(event) {
      const action = event && event.id ? String(event.id) : 'unknown';
      try {
        const handled = await dispatch(event);
        if (handled) handledActions++;
        return handled;
      } catch (error) {
        failedActions++;
        const details = errorDetails(error);
        if (logger && typeof logger.error === 'function') {
          const prefix = action === 'scheduler.open' || action === 'scheduler.new'
            ? '[SCHEDULER_CENTER]'
            : '[APP_ACTION]';
          logger.error(`${prefix} action=${action} stage=dispatch message=${JSON.stringify(details.message)} stack=${JSON.stringify(details.stack)}`);
        }
        return false;
      }
    }

    function start() {
      if (started) return state();
      // The App Shell owns this listener. Window close/hide events never
      // unsubscribe it; Runtime teardown releases it during unified Quit.
      appRuntime.onAction(event => {
        void handle(event);
      });
      started = true;
      return state();
    }

    function state() {
      return Object.freeze({started, handledActions, failedActions});
    }

    return Object.freeze({start, dispatch, handle, state});
  }

  global.OpenDeskProductAppController = Object.freeze({create: createController});
})(globalThis);
