(function installOpenDeskRecorderRuntimeIcons(global) {
  'use strict';

  const BaseFloatingWindow = global.FloatingWindow;
  if (typeof BaseFloatingWindow !== 'function') {
    throw new Error('Recorder runtime icon adapter requires FloatingWindow');
  }

  const LEGACY_ICON_MAP = Object.freeze({
    'countdown-1.png': 'timer',
    'countdown-2.png': 'timer',
    'countdown-3.png': 'timer',
    'opendesk-logo.png': 'house.fill',
  });

  function basename(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || '';
  }

  function normalizeIcon(icon) {
    if (!icon || typeof icon !== 'object' || Array.isArray(icon) || typeof icon.path !== 'string') {
      return icon;
    }
    return LEGACY_ICON_MAP[basename(icon.path)] || icon;
  }

  function RuntimeIconFloatingWindow(options) {
    const inner = new BaseFloatingWindow(options);
    const wrapper = {};
    const forward = [
      'addSeparator', 'addSpacer', 'addLabel', 'addSwitch', 'addCheckbox', 'addInput', 'addSelect',
      'addSlider', 'addSegmentedControl', 'addProgress', 'removeButton', 'removeLabel', 'removeControl',
      'updateLabel', 'updateControl', 'getButtonState', 'getLabelState', 'getControlState',
      'onButtonClick', 'onControlChange', 'onError', 'on', 'show', 'hide', 'close', 'getState',
      'setPosition', 'setPlacement', 'setAlwaysOnTop', 'setDraggable', 'waitUntilClosed', 'run',
    ];
    for (const name of forward) {
      if (typeof inner[name] === 'function') wrapper[name] = inner[name].bind(inner);
    }

    wrapper.addButton = function addButton(id, label, icon, callback) {
      return inner.addButton(id, label, normalizeIcon(icon), callback);
    };

    wrapper.updateButton = function updateButton(id, patch) {
      const next = patch && typeof patch === 'object' ? {...patch} : patch;
      if (next && Object.prototype.hasOwnProperty.call(next, 'icon')) {
        next.icon = normalizeIcon(next.icon);
      }
      return inner.updateButton(id, next);
    };

    Object.defineProperty(wrapper, 'id', {
      enumerable: true,
      configurable: false,
      get() { return inner.id; },
    });
    return wrapper;
  }

  global.FloatingWindow = RuntimeIconFloatingWindow;
})(globalThis);
