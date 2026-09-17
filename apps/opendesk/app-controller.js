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
    const assistant = settings.assistant;
    const schedulerCenter = settings.schedulerCenter;
    const runtimeLog = settings.runtimeLog;
    const permissionsCenter = settings.permissionsCenter;
    const analyticsSettings = settings.analyticsSettings || null;
    const about = settings.about;
    const inspectorLauncher = settings.inspectorLauncher;
    const developerTools = settings.developerTools;
    const officialShell = settings.officialShell;
    const promotions = settings.promotions || null;
    const productActivityClient = settings.productActivityClient || null;
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
    if (!assistant || typeof assistant.open !== 'function') {
      throw new Error('OpenDesk product controller requires AI Assistant');
    }
    if (!schedulerCenter
      || typeof schedulerCenter.open !== 'function'
      || typeof schedulerCenter.openCreate !== 'function') {
      throw new Error('OpenDesk product controller requires Scheduler Center');
    }
    if (!about || typeof about.open !== 'function') {
      throw new Error('OpenDesk product controller requires About');
    }

    async function beforeProductSurface(reason) {
      if (promotions && typeof promotions.beforeInteraction === 'function') {
        await promotions.beforeInteraction(reason);
      }
    }

    async function acknowledgeNativeActivity() {
      if (productActivityClient && typeof productActivityClient.acknowledgeProductActivity === 'function') {
        await productActivityClient.acknowledgeProductActivity();
      }
    }

    async function dispatch(event) {
      if (!event || !event.id) return false;
      const source = event.source || event.id;
      switch (event.id) {
        case 'opendesk.activity.suspend':
          try {
            await beforeProductSurface(`native:${source}`);
          } finally {
            await acknowledgeNativeActivity();
          }
          return true;
        case 'promotions.restore':
          if (!promotions || typeof promotions.restore !== 'function') return false;
          await promotions.restore();
          return true;
        case 'opendesk.open':
        case 'runner.open':
          await runner.open(source);
          return true;
        case 'assistant.open':
        case 'opendesk.assistant.open':
          await beforeProductSurface('assistant-window');
          await assistant.open(source);
          return true;
        case 'scheduler.open':
        case 'scheduler.center':
          await beforeProductSurface('scheduler-window');
          await schedulerCenter.open(source);
          return true;
        case 'scheduler.new':
          await beforeProductSurface('scheduler-create-window');
          await schedulerCenter.openCreate(source);
          return true;
        case 'inspector.open':
          if (!inspectorLauncher || typeof inspectorLauncher.open !== 'function') return false;
          await beforeProductSurface('inspector-window');
          await inspectorLauncher.open(source);
          return true;
        case 'runtime.log':
          if (!runtimeLog || typeof runtimeLog.open !== 'function') return false;
          await beforeProductSurface('runtime-log-window');
          await runtimeLog.open(source);
          return true;
        case 'permissions.open':
          if (!permissionsCenter || typeof permissionsCenter.open !== 'function') return false;
          await beforeProductSurface('permissions-window');
          await permissionsCenter.open(source);
          return true;
        case 'analytics.open':
          if (!analyticsSettings || typeof analyticsSettings.open !== 'function') return false;
          await beforeProductSurface('analytics-settings-window');
          await analyticsSettings.open(source);
          return true;
        case 'opendesk.about':
          await beforeProductSurface('about-window');
          await about.open(source);
          return true;
        default:
          if (developerTools
            && typeof developerTools.activate === 'function'
            && [
              'opendesk.status',
              'opendesk.inspector.open',
              'opendesk.logs.open',
              'opendesk.debug.normal',
              'opendesk.debug.detailed',
            ].includes(event.id)) {
            await beforeProductSurface('developer-tool');
            await developerTools.activate(event.id, source);
            return true;
          }
          if (officialShell
            && typeof officialShell.activate === 'function'
            && [
              'opendesk.home',
              'opendesk.help',
              'opendesk.customize',
              'opendesk.examples',
              'opendesk.api-docs',
            ].includes(event.id)) {
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
          let prefix = '[APP_ACTION]';
          if (action === 'assistant.open' || action === 'opendesk.assistant.open') prefix = '[ASSISTANT]';
          if (action === 'scheduler.open' || action === 'scheduler.new') prefix = '[SCHEDULER_CENTER]';
          if (action === 'inspector.open' || action === 'opendesk.inspector.open') prefix = '[INSPECTOR]';
          if (action === 'analytics.open') prefix = '[ANALYTICS_SETTINGS]';
          if (action === 'opendesk.about') prefix = '[ABOUT]';
          if (action === 'opendesk.activity.suspend') prefix = '[PRODUCT_ACTIVITY]';
          if (action === 'promotions.restore') prefix = '[PROMOTIONS]';
          logger.error(`${prefix} action=${action} stage=dispatch message=${JSON.stringify(details.message)} stack=${JSON.stringify(details.stack)}`);
        }
        return false;
      }
    }

    function start() {
      if (started) return state();
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