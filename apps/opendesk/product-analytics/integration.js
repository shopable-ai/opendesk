(function installOpenDeskProductAnalyticsIntegration(global) {
  'use strict';

  const ACTION_BY_BUTTON = Object.freeze({
    run: 'flow.run',
    stop: 'flow.stop',
    previous: 'flow.previous',
    next: 'flow.next',
    list: 'flow.list',
  });

  function safelyTrack(client, actionId, inputMethod) {
    if (!client || typeof client.uiAction !== 'function' || !actionId) return;
    try {
      const pending = client.uiAction('flow_runner', actionId, inputMethod);
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch (_) {}
  }

  function safelyScreen(client) {
    if (!client || typeof client.screenViewed !== 'function') return;
    try {
      const pending = client.screenViewed('flow_runner');
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch (_) {}
  }

  function wrapFloatingWindow(NativeFloatingWindow, client) {
    if (typeof NativeFloatingWindow !== 'function') return NativeFloatingWindow;
    return function AnalyticsFloatingWindow(spec) {
      const inner = new NativeFloatingWindow(spec);
      return {
        get id() { return inner.id; },
        addButton(id, label, icon, callback) {
          const actionId = id === 'run' || id === 'stop' ? null : ACTION_BY_BUTTON[id];
          return inner.addButton(id, label, icon, actionId && typeof callback === 'function'
            ? (...args) => {
                safelyTrack(client, actionId, 'pointer');
                return callback(...args);
              }
            : callback);
        },
        addLabel(id, text, labelOptions) { return inner.addLabel(id, text, labelOptions); },
        addSeparator(id) { return inner.addSeparator(id); },
        updateButton(id, patch) { return inner.updateButton(id, patch); },
        updateLabel(id, patch) { return inner.updateLabel(id, patch); },
        getButtonState(id) { return inner.getButtonState(id); },
        getState() { return inner.getState(); },
        on(event, callback) { return inner.on(event, callback); },
        onError(callback) { return inner.onError(callback); },
        async show() {
          const result = await inner.show();
          safelyScreen(client);
          return result;
        },
        waitUntilClosed() { return inner.waitUntilClosed(); },
        hide() { return inner.hide(); },
        close() { return inner.close(); },
      };
    };
  }

  function wrapController(BaseController, defaults) {
    if (!BaseController || typeof BaseController.createApp !== 'function') {
      throw new Error('Product Analytics integration requires Script Runner controller');
    }
    const wrapper = Object.assign({}, BaseController);
    wrapper.createApp = options => {
      const settings = Object.assign({}, options || {});
      const injected = defaults || {};
      const client = injected.client || settings.productAnalytics || global.OpenDeskProductAnalytics || null;
      const previousLogicalAction = typeof settings.onLogicalAction === 'function'
        ? settings.onLogicalAction : null;
      settings.onLogicalAction = (action, source) => {
        if (previousLogicalAction) {
          try { previousLogicalAction(action, source); } catch (_) {}
        }
        const actionId = action === 'run' ? 'flow.run' : action === 'stop' ? 'flow.stop' : '';
        const inputMethod = source === 'shortcut-run' || source === 'shortcut-stop'
          ? 'keyboard'
          : ['toolbar', 'toolbar-player', 'row', 'selected', 'list'].includes(source)
            ? 'pointer' : '';
        if (actionId && inputMethod) safelyTrack(client, actionId, inputMethod);
      };
      settings.FloatingWindow = wrapFloatingWindow(settings.FloatingWindow, client);
      return BaseController.createApp(settings);
    };
    return Object.freeze(wrapper);
  }

  global.OpenDeskProductAnalyticsIntegration = Object.freeze({
    wrapController,
    wrapFloatingWindow,
    actions: ACTION_BY_BUTTON,
  });
})(globalThis);
