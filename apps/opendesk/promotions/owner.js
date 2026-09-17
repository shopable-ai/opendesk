(function installOpenDeskPromotionsOwner(root) {
  'use strict';

  const core = root.OpenDeskPromotionsCore || (typeof require === 'function' ? require('./core.js') : null);
  const controllerAPI = root.OpenDeskPromotionsController || (typeof require === 'function' ? require('./controller.js') : null);
  if (!core || !controllerAPI) throw new Error('Promotion owner requires core and controller');

  const DEFAULT_SHOW_DELAY_MS = 1200;
  const DEFAULT_STATE_REFRESH_MS = 1500;
  const SCHEDULER_START_GUARD_MS = 60 * 1000;
  const NATIVE_START_GUARD_MS = 3000;
  const PREFERENCE_MAX_BYTES = 64 * 1024;
  const RESTORE_MENU_ID = 'restore-promotions';
  const PLACEMENT_MODES = Object.freeze(['runner-above', 'screen-bottom-right']);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function validSurface(value) {
    return !!value
      && value.visible === true
      && value.onScreen !== false
      && core.validBounds(value.bounds);
  }

  function mediaFailure(result) {
    if (!result || result.reason !== 'surface-error') return false;
    const message = String(result.error || '').toLowerCase();
    return message.includes('promotion image decode') || message.includes('promotion image readiness');
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
    const stateRefreshMs = Number.isFinite(o.stateRefreshMs)
      ? Math.max(500, o.stateRefreshMs)
      : DEFAULT_STATE_REFRESH_MS;
    const placementMode = o.placementMode == null ? 'runner-above' : String(o.placementMode);

    if (!file || typeof file.join !== 'function' || typeof file.readJSON !== 'function' || typeof file.writeJSON !== 'function') {
      throw new Error('Promotion owner requires File.join/readJSON/writeJSON');
    }
    if (!ui || typeof ui.createWindow !== 'function') throw new Error('Promotion owner requires ui.createWindow');
    if (!o.appDataRoot) throw new Error('Promotion owner requires appDataRoot');
    if (!PLACEMENT_MODES.includes(placementMode)) throw new Error('Promotion owner received an unknown placementMode');

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
    let ownerEngaged = false;
    let surfaceUnavailable = false;
    let creativeUnavailable = false;
    let schedulerKnown = schedulerClient == null;
    let schedulerRunning = false;
    let schedulerManualUntil = 0;
    let nativeStartGuardUntil = 0;
    let nativeActivityKnown = schedulerClient == null || typeof schedulerClient.productActivity !== 'function';
    let nativeActivityActive = false;
    let nativeActivityKinds = [];
    let refreshTimer = null;
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

    function providerBoolean(provider, fallback) {
      if (typeof provider !== 'function') return fallback;
      try {
        const value = provider();
        return value === true ? true : value === false ? false : null;
      } catch (_) {
        return null;
      }
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
      const foregroundOverride = providerBoolean(o.getForegroundIdle, true);
      const fullscreen = providerBoolean(o.getFullscreen, false);
      const presentationMode = providerBoolean(o.getPresentationMode, false);
      const nativeKinds = new Set(nativeActivityKinds);
      const recorderOverride = providerBoolean(o.getRecorderIdle, true);
      const measurementOverride = providerBoolean(o.getMeasurementIdle, true);
      const schedulerIdle = schedulerKnown
        && !schedulerRunning
        && clock() >= schedulerManualUntil;
      return {
        ready: initialized && schedulerKnown && nativeActivityKnown && !surfaceUnavailable && !creativeUnavailable,
        ownerVisible: validSurface(runnerSurface) && ownerEngaged && foregroundOverride === true,
        automationIdle: activities.size === 0
          && !runnerBusy(currentRunner)
          && schedulerIdle
          && clock() >= nativeStartGuardUntil
          && !nativeActivityActive,
        recorderIdle: nativeActivityKnown && !nativeKinds.has('recorder') && recorderOverride === true,
        measurementIdle: nativeActivityKnown && !nativeKinds.has('measurement') && measurementOverride === true,
        listOpen: runnerListOpen(currentRunner),
        fullscreen: fullscreen === null ? true : fullscreen,
        presentationMode: presentationMode === null ? true : presentationMode,
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
          preferenceLoadFailed = true;
          preferences = core.freshPreferences();
          preferences.enabled = false;
          lastError = String(error && error.message || error);
          log('warn', 'PREFERENCE_LOAD_ERROR', {message: lastError});
        }
        try {
          if (typeof ui.getCapabilities === 'function') {
            const capabilities = ui.getCapabilities();
            if (capabilities && capabilities.available === false) surfaceUnavailable = true;
          }
        } catch (_) {
          surfaceUnavailable = true;
        }
        controller = controllerFactory({
          ui,
          preferences,
          getContext: context,
          savePreferences,
          activate,
          reducedMotion: o.reducedMotion,
          interactionGroup: 'scriptRunnerPlayer',
          onInteractionOutside: async () => {
            ownerEngaged = false;
            if (showTimer !== null) cancel(showTimer);
            showTimer = null;
          },
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
      if (!controller) return true;
      try {
        const hidden = await controller.waitUntilHidden();
        if (hidden !== true || (controller.state && controller.state().visible === true)) {
          throw new Error('promotion surface disappearance was not confirmed');
        }
        return true;
      } catch (error) {
        lastError = String(error && error.message || error);
        log('warn', 'SAFETY_CLOSE_ERROR', {reason, message: lastError});
        throw error;
      }
    }

    function scheduleShow(trigger) {
      if (!started || disposed || surfaceUnavailable || creativeUnavailable || !controller || showTimer !== null) return;
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
      if (!started || disposed || surfaceUnavailable || creativeUnavailable) {
        return {
          status: 'suppressed',
          reason: disposed ? 'disposed' : surfaceUnavailable ? 'surface-unavailable' : creativeUnavailable ? 'creative-unavailable' : 'not-started',
        };
      }
      const currentContext = context();
      const reason = core.contextReason(currentContext);
      if (reason) {
        lastResult = {status: 'suppressed', reason};
        return lastResult;
      }
      lastTrigger = trigger || 'idle';
      lastResult = await controller.show(creative, {mode: placementMode, anchor: runnerSurface.bounds});
      if (mediaFailure(lastResult)) {
        creativeUnavailable = true;
        log('warn', 'CREATIVE_DISABLED', {error: lastResult.error || 'media decode failed'});
      } else if (lastResult && lastResult.reason === 'surface-error') {
        surfaceUnavailable = true;
        log('warn', 'SURFACE_DISABLED', {error: lastResult.error || 'native surface unavailable'});
      }
      return lastResult;
    }

    async function refreshSchedulerGuard() {
      if (!schedulerClient || typeof schedulerClient.listJobs !== 'function') {
        schedulerKnown = true;
        schedulerRunning = false;
        if (controller) await controller.refreshContext();
        return {known: true, running: false};
      }
      try {
        const jobs = await schedulerClient.listJobs();
        schedulerKnown = true;
        schedulerRunning = Array.isArray(jobs) && jobs.some(job => {
          const last = job && job.lastRun;
          return last && (last.status === 'queued' || last.status === 'running');
        });
        if (controller) await controller.refreshContext();
        return {known: true, running: schedulerRunning};
      } catch (error) {
        schedulerKnown = false;
        schedulerRunning = true;
        lastError = String(error && error.message || error);
        if (controller) await controller.refreshContext();
        log('warn', 'SCHEDULER_STATE_ERROR', {message: lastError});
        return {known: false, running: true};
      }
    }

    async function refreshNativeActivity() {
      if (!schedulerClient || typeof schedulerClient.productActivity !== 'function') {
        nativeActivityKnown = true;
        nativeActivityActive = false;
        nativeActivityKinds = [];
        return {known: true, active: false, activeKinds: []};
      }
      try {
        const value = await schedulerClient.productActivity();
        if (!value || value.available !== true || typeof value.active !== 'boolean' || !Array.isArray(value.activeKinds)) {
          throw new Error('product activity response is incomplete');
        }
        nativeActivityKnown = true;
        nativeActivityActive = value.active === true;
        nativeActivityKinds = value.activeKinds.filter(kind => typeof kind === 'string');
        if (controller) await controller.refreshContext();
        return {known: true, active: nativeActivityActive, activeKinds: nativeActivityKinds.slice()};
      } catch (error) {
        nativeActivityKnown = false;
        nativeActivityActive = true;
        nativeActivityKinds = [];
        lastError = String(error && error.message || error);
        if (controller) await controller.refreshContext();
        log('warn', 'ACTIVITY_STATE_ERROR', {message: lastError});
        return {known: false, active: true, activeKinds: []};
      }
    }

    async function refreshGuards() {
      await Promise.all([refreshSchedulerGuard(), refreshNativeActivity()]);
      if (!core.contextReason(context())) scheduleShow('state-safe');
      return state();
    }

    function armRefresh() {
      if (!started || disposed || refreshTimer !== null) return;
      refreshTimer = later(() => {
        refreshTimer = null;
        void refreshGuards().finally(() => armRefresh());
      }, stateRefreshMs);
    }

    async function setRunnerSurface(surface) {
      runnerSurface = surface && core.validBounds(surface.bounds) ? clone(surface) : null;
      ownerEngaged = validSurface(runnerSurface);
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

    async function noteOwnerInteraction(source) {
      if (validSurface(runnerSurface)) ownerEngaged = true;
      if (controller) await controller.refreshContext();
      if (!core.contextReason(context())) scheduleShow(source || 'runner-interaction');
      return state();
    }

    async function beforeInteraction(reason) {
      await initialize();
      await closeForSafety(reason || 'interaction');
      return state();
    }

    async function prepareDesktopActivity(source) {
      await initialize();
      nativeStartGuardUntil = Math.max(nativeStartGuardUntil, clock() + NATIVE_START_GUARD_MS);
      if (controller) await controller.refreshContext();
      await closeForSafety(source || 'native-desktop-activity');
      return state();
    }

    async function beginAutomation(source) {
      await initialize();
      const token = `activity-${++nextActivityID}`;
      activities.add(token);
      try {
        if (controller) await controller.refreshContext();
        await closeForSafety(source || token);
        return token;
      } catch (error) {
        activities.delete(token);
        if (controller) await controller.refreshContext();
        throw error;
      }
    }

    async function endAutomation(token) {
      if (token) activities.delete(token);
      if (controller) await controller.refreshContext();
      if (!activities.size) scheduleShow('automation-idle');
      return state();
    }

    function wrapSchedulerClient(client) {
      if (!client || typeof client !== 'object') return client;
      const wrapped = {};
      for (const name of ['getCapabilities', 'status', 'listJobs', 'listRuns', 'productActivity', 'acknowledgeProductActivity']) {
        if (typeof client[name] === 'function') wrapped[name] = client[name].bind(client);
      }
      wrapped.createJob = async input => {
        await beforeInteraction('scheduler-create');
        const result = await client.createJob(input);
        await refreshSchedulerGuard();
        return result;
      };
      wrapped.resume = async id => {
        await beforeInteraction('scheduler-resume');
        const result = await client.resume(id);
        await refreshSchedulerGuard();
        return result;
      };
      wrapped.runNow = async id => {
        await prepareDesktopActivity('scheduler-run-now');
        schedulerManualUntil = Math.max(schedulerManualUntil, clock() + SCHEDULER_START_GUARD_MS);
        if (controller) await controller.refreshContext();
        return client.runNow(id);
      };
      wrapped.pause = async id => {
        const result = await client.pause(id);
        await refreshSchedulerGuard();
        return result;
      };
      wrapped.delete = async id => {
        const result = await client.delete(id);
        await refreshSchedulerGuard();
        return result;
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
      await refreshGuards();
      armRefresh();
      scheduleShow('startup');
      return state();
    }

    async function dispose() {
      disposed = true;
      started = false;
      if (showTimer !== null) cancel(showTimer);
      if (refreshTimer !== null) cancel(refreshTimer);
      showTimer = refreshTimer = null;
      if (controller) await controller.dispose();
      return state();
    }

    function state() {
      return Object.freeze({
        initialized,
        started,
        disposed,
        placementMode,
        preferencePath,
        preferenceLoadFailed,
        surfaceUnavailable,
        creativeUnavailable,
        ownerEngaged,
        preferences: clone(controller ? controller.state().preferences : preferences),
        context: context(),
        runnerSurface: clone(runnerSurface),
        activeActivities: activities.size,
        schedulerKnown,
        schedulerRunning,
        schedulerManualUntil,
        nativeStartGuardUntil,
        nativeActivityKnown,
        nativeActivityActive,
        nativeActivityKinds: nativeActivityKinds.slice(),
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
      noteOwnerInteraction,
      beforeInteraction,
      prepareDesktopActivity,
      beginAutomation,
      endAutomation,
      refreshSchedulerGuard,
      refreshNativeActivity,
      refreshGuards,
      wrapSchedulerClient,
      restore,
    });
  }

  const api = Object.freeze({
    create,
    constants: Object.freeze({
      restoreMenuId: RESTORE_MENU_ID,
      schedulerStartGuardMs: SCHEDULER_START_GUARD_MS,
      nativeStartGuardMs: NATIVE_START_GUARD_MS,
      placementModes: PLACEMENT_MODES,
    }),
  });
  root.OpenDeskPromotionsOwner = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
