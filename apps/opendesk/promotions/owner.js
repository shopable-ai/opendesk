(function installOpenDeskPromotionsOwner(root) {
  'use strict';

  const core = root.OpenDeskPromotionsCore || (typeof require === 'function' ? require('./core.js') : null);
  const controllerAPI = root.OpenDeskPromotionsController || (typeof require === 'function' ? require('./controller.js') : null);
  if (!core || !controllerAPI) throw new Error('Promotion owner requires core and controller');

  const DEFAULT_SHOW_DELAY_MS = 1200;
  const DEFAULT_SCHEDULER_REFRESH_MS = 5000;
  const SCHEDULER_RUN_BLOCK_MS = 30 * 60 * 1000;
  const PREFERENCE_MAX_BYTES = 64 * 1024;
  const RESTORE_MENU_ID = 'restore-promotions';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function validSurface(value) {
    return !!value
      && value.visible === true
      && value.onScreen !== false
      && core.validBounds(value.bounds);
  }

  function create(options) {
    const o = options || {};
    const file = o.file || root.File;
    const ui = o.ui || root.ui;
    const appRuntime = o.appRuntime || (root.automation && root.automation.app);
    const officialShell = o.officialShell || null;
    const schedulerClient = o.schedulerClient || null;
    const controllerFactory = o.controllerFactory || controllerAPI.create;
    const clock = o.now || Date.now;
    const later = o.setTimeout || root.setTimeout;
    const cancel = o.clearTimeout || root.clearTimeout;
    const logger = o.logger || root.console;
    const showDelayMs = Number.isFinite(o.showDelayMs) ? Math.max(0, o.showDelayMs) : DEFAULT_SHOW_DELAY_MS;
    const schedulerRefreshMs = Number.isFinite(o.schedulerRefreshMs)
      ? Math.max(1000, o.schedulerRefreshMs)
      : DEFAULT_SCHEDULER_REFRESH_MS;

    if (!file || typeof file.join !== 'function' || typeof file.readJSON !== 'function' || typeof file.writeJSON !== 'function') {
      throw new Error('Promotion owner requires File.join/readJSON/writeJSON');
    }
    if (!ui || typeof ui.createWindow !== 'function') throw new Error('Promotion owner requires ui.createWindow');
    if (!o.appDataRoot) throw new Error('Promotion owner requires appDataRoot');

    const creative = core.validateCreative(o.creative);
    const preferencePath = o.preferencePath || file.join(o.appDataRoot, 'promotions', 'preferences.json');
    let preferences = core.freshPreferences();
    let controller = null;
    let initialized = false;
    let initPromise = null;
    let started = false;
    let disposed = false;
    let preferenceLoadFailed = false;
    let runnerSurface = null;
    let schedulerKnown = schedulerClient == null;
    let schedulerArmed = false;
    let schedulerManualUntil = 0;
    let schedulerRefreshTimer = null;
    let showTimer = null;
    let nextActivityID = 0;
    const activities = new Set();
    let lastResult = null;
    let lastError = '';
    let lastTrigger = '';

    function log(level, code, extra) {
      const target = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : null;
      if (!target) return;
      try { target(`OPENDESK_PROMOTION_${code}=` + JSON.stringify(extra || {})); } catch (_) {}
    }

    function providerTrue(provider) {
      if (typeof provider !== 'function') return false;
      try { return provider() === true; } catch (_) { return false; }
    }

    function providerFalse(provider) {
      if (typeof provider !== 'function') return false;
      try { return provider() === false; } catch (_) { return false; }
    }

    function runnerState() {
      if (typeof o.getRunnerState !== 'function') return null;
      try { return o.getRunnerState() || null; } catch (_) { return null; }
    }

    function runnerBusy(value) {
      const state = value && value.runner;
      if (!state) return true;
      return !!(state.running || state.activeRun || (value.latestExecution && value.latestExecution.status === 'running'));
    }

    function runnerListOpen(value) {
      const state = value && value.runner;
      if (!state) return true;
      const player = state.player || {};
      return state.selectorVisible === true
        || state.listVisible === true
        || player.panelLifecycle === 'visible'
        || player.panelDesiredVisible === true;
    }

    function context() {
      const currentRunner = runnerState();
      const schedulerIdle = schedulerKnown
        && !schedulerArmed
        && clock() >= schedulerManualUntil;
      const ownerVisible = validSurface(runnerSurface) && providerTrue(o.getForegroundIdle);
      return {
        ready: initialized && schedulerKnown,
        ownerVisible,
        automationIdle: activities.size === 0 && !runnerBusy(currentRunner) && schedulerIdle,
        recorderIdle: providerTrue(o.getRecorderIdle),
        measurementIdle: providerTrue(o.getMeasurementIdle),
        listOpen: runnerListOpen(currentRunner),
        fullscreen: providerFalse(o.getFullscreen),
        presentationMode: providerFalse(o.getPresentationMode),
      };
    }

    async function syncRestoreMenu() {
      if (!appRuntime || typeof appRuntime.updateMenuItem !== 'function') return;
      try {
        await appRuntime.updateMenuItem(RESTORE_MENU_ID, {visible: preferences.enabled === false});
      } catch (error) {
        log('warn', 'MENU_SYNC_ERROR', {message: String(error && error.message || error)});
      }
    }

    async function savePreferences(next) {
      preferences = core.readPreferences(next);
      await file.writeJSON(preferencePath, preferences, {
        createDirs: true,
        spaces: 2,
        maxBytes: PREFERENCE_MAX_BYTES,
      });
      await syncRestoreMenu();
    }

    async function activate(action) {
      if (typeof o.activate === 'function') return o.activate(action);
      if (action && action.kind === 'official' && officialShell && typeof officialShell.activate === 'function') {
        return officialShell.activate(action.id);
      }
      return null;
    }

    async function initialize() {
      if (initialized) return state();
      if (initPromise) return initPromise;
      initPromise = (async () => {
        try {
          const stored = await file.readJSON(preferencePath, {
            defaultValue: core.freshPreferences(),
            maxBytes: PREFERENCE_MAX_BYTES,
          });
          preferences = core.readPreferences(stored);
        } catch (error) {
          // Corrupt/unreadable preferences must never turn into a surprise ad.
          // Disable only the promotion subsystem for this session; the product
          // and automation paths continue normally and the tray restore action
          // can explicitly write a clean preference record.
          preferenceLoadFailed = true;
          preferences = core.freshPreferences();
          preferences.enabled = false;
          lastError = String(error && error.message || error);
          log('warn', 'PREFERENCE_LOAD_ERROR', {message: lastError});
        }
        controller = controllerFactory({
          ui,
          preferences,
          getContext: context,
          savePreferences,
          activate,
          reducedMotion: o.reducedMotion,
          now: clock,
          setTimeout: later,
          clearTimeout: cancel,
          logger,
        });
        initialized = true;
        await syncRestoreMenu();
        return state();
      })();
      try { return await initPromise; } finally { initPromise = null; }
    }

    async function closeForSafety(reason) {
      if (showTimer !== null) {
        cancel(showTimer);
        showTimer = null;
      }
      if (!controller) return;
      try {
        await controller.waitUntilHidden();
      } catch (error) {
        // Promotion teardown failure must not block Run/Stop/Agent/Scheduler.
        lastError = String(error && error.message || error);
        log('warn', 'SAFETY_CLOSE_ERROR', {reason, message: lastError});
      }
    }

    function scheduleShow(trigger) {
      if (!started || disposed || !controller || showTimer !== null) return;
      if (core.contextReason(context())) return;
      lastTrigger = trigger || 'idle';
      showTimer = later(() => {
        showTimer = null;
        void maybeShow(lastTrigger).catch(error => {
          lastError = String(error && error.message || error);
          log('warn', 'SHOW_ERROR', {message: lastError});
        });
      }, showDelayMs);
    }

    async function maybeShow(trigger) {
      await initialize();
      if (!started || disposed) return {status: 'suppressed', reason: disposed ? 'disposed' : 'not-started'};
      const currentContext = context();
      const reason = core.contextReason(currentContext);
      if (reason) {
        lastResult = {status: 'suppressed', reason};
        return lastResult;
      }
      lastTrigger = trigger || 'idle';
      lastResult = await controller.show(creative, {mode: 'runner-above', anchor: runnerSurface.bounds});
      return lastResult;
    }

    async function refreshSchedulerGuard() {
      if (!schedulerClient || typeof schedulerClient.listJobs !== 'function') {
        schedulerKnown = true;
        schedulerArmed = false;
        if (controller) await controller.refreshContext();
        return {known: true, armed: false};
      }
      try {
        const jobs = await schedulerClient.listJobs();
        schedulerKnown = true;
        schedulerArmed = Array.isArray(jobs) && jobs.some(job => job && job.enabled === true);
        if (controller) await controller.refreshContext();
        if (!schedulerArmed && activities.size === 0) scheduleShow('scheduler-safe');
        return {known: true, armed: schedulerArmed};
      } catch (error) {
        schedulerKnown = false;
        schedulerArmed = true;
        lastError = String(error && error.message || error);
        if (controller) await controller.refreshContext();
        log('warn', 'SCHEDULER_STATE_ERROR', {message: lastError});
        return {known: false, armed: true};
      }
    }

    function armSchedulerRefresh() {
      if (!started || disposed || schedulerRefreshTimer !== null) return;
      schedulerRefreshTimer = later(() => {
        schedulerRefreshTimer = null;
        void refreshSchedulerGuard().finally(() => armSchedulerRefresh());
      }, schedulerRefreshMs);
    }

    async function setRunnerSurface(surface) {
      runnerSurface = surface && core.validBounds(surface.bounds) ? clone(surface) : null;
      if (!controller) return state();
      if (!validSurface(runnerSurface)) {
        await controller.refreshContext();
        return state();
      }
      if (controller.state().visible) {
        try { await controller.reanchor(runnerSurface.bounds); } catch (error) {
          lastError = String(error && error.message || error);
          log('warn', 'REANCHOR_ERROR', {message: lastError});
        }
      } else {
        scheduleShow('runner-visible');
      }
      return state();
    }

    async function beforeInteraction(reason) {
      await initialize();
      await closeForSafety(reason || 'interaction');
      return state();
    }

    async function beginAutomation(source) {
      await initialize();
      const token = `activity-${++nextActivityID}`;
      activities.add(token);
      await closeForSafety(source || token);
      return token;
    }

    async function endAutomation(token) {
      if (token) activities.delete(token);
      if (controller) await controller.refreshContext();
      if (!activities.size) scheduleShow('automation-idle');
      return state();
    }

    function wrapSchedulerClient(client) {
      if (!client || typeof client !== 'object') return client;
      const wrapped = {
        getCapabilities: typeof client.getCapabilities === 'function' ? client.getCapabilities.bind(client) : undefined,
        status: typeof client.status === 'function' ? client.status.bind(client) : undefined,
        listJobs: typeof client.listJobs === 'function' ? client.listJobs.bind(client) : undefined,
        listRuns: typeof client.listRuns === 'function' ? client.listRuns.bind(client) : undefined,
        async createJob(input) {
          await beforeInteraction('scheduler-create');
          schedulerKnown = true;
          schedulerArmed = true;
          if (controller) await controller.refreshContext();
          try { return await client.createJob(input); }
          catch (error) { await refreshSchedulerGuard(); throw error; }
        },
        async resume(id) {
          await beforeInteraction('scheduler-resume');
          schedulerKnown = true;
          schedulerArmed = true;
          if (controller) await controller.refreshContext();
          try { return await client.resume(id); }
          catch (error) { await refreshSchedulerGuard(); throw error; }
        },
        async runNow(id) {
          await beforeInteraction('scheduler-run-now');
          schedulerKnown = true;
          schedulerManualUntil = Math.max(schedulerManualUntil, clock() + SCHEDULER_RUN_BLOCK_MS);
          if (controller) await controller.refreshContext();
          return client.runNow(id);
        },
        async pause(id) {
          const result = await client.pause(id);
          await refreshSchedulerGuard();
          return result;
        },
        async delete(id) {
          const result = await client.delete(id);
          await refreshSchedulerGuard();
          return result;
        },
      };
      return Object.freeze(wrapped);
    }

    async function restore() {
      await initialize();
      preferenceLoadFailed = false;
      const next = await controller.restore();
      preferences = core.readPreferences(next.preferences);
      await syncRestoreMenu();
      scheduleShow('restore');
      return state();
    }

    async function start() {
      await initialize();
      if (disposed) return state();
      started = true;
      await refreshSchedulerGuard();
      armSchedulerRefresh();
      scheduleShow('startup');
      return state();
    }

    async function dispose() {
      disposed = true;
      started = false;
      if (showTimer !== null) cancel(showTimer);
      if (schedulerRefreshTimer !== null) cancel(schedulerRefreshTimer);
      showTimer = schedulerRefreshTimer = null;
      if (controller) await controller.dispose();
      return state();
    }

    function state() {
      return Object.freeze({
        initialized,
        started,
        disposed,
        preferencePath,
        preferenceLoadFailed,
        preferences: clone(controller ? controller.state().preferences : preferences),
        context: context(),
        runnerSurface: clone(runnerSurface),
        activeActivities: activities.size,
        schedulerKnown,
        schedulerArmed,
        schedulerManualUntil,
        lastTrigger,
        lastResult: clone(lastResult),
        lastError,
        surface: controller ? controller.state() : null,
      });
    }

    return Object.freeze({
      start,
      dispose,
      state,
      maybeShow,
      setRunnerSurface,
      beforeInteraction,
      beginAutomation,
      endAutomation,
      refreshSchedulerGuard,
      wrapSchedulerClient,
      restore,
    });
  }

  const api = Object.freeze({
    create,
    constants: Object.freeze({
      restoreMenuId: RESTORE_MENU_ID,
      schedulerRunBlockMs: SCHEDULER_RUN_BLOCK_MS,
    }),
  });
  root.OpenDeskPromotionsOwner = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
