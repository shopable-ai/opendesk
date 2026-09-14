// Lightweight target spelling adapter. The core UI owner performs every
// observation, resolution, input, cancellation and cleanup operation.
// This file deliberately contains no OCR/Accessibility fallback implementation.
(function (global) {
  'use strict';
  const UI = global.UI;
  if (!UI || typeof UI.tapTargets !== 'function') return;
  const activate = UI.tapTargets.bind(UI);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  function invalid(message) {
    const error = new Error(message);
    Object.assign(error, { code: 'INVALID_ARGUMENT', operation: 'UI.tapTargets',
      phase: 'arguments', actionState: 'not_started', completed: [] });
    throw error;
  }
  function normalize(target) {
    if (typeof target === 'string') return target;
    if (!target || typeof target !== 'object' || Array.isArray(target)) invalid('target must be a string or semantic object');
    if (Object.getOwnPropertySymbols(target).length) invalid('target must not contain symbol fields');
    const keys = Object.keys(target);
    if (keys.some(key => !['text', 'role', 'name', 'identifier'].includes(key))) invalid('target fields describe identity, not Runtime resolver policy');
    const copy = {};
    for (const key of keys) {
      if (typeof target[key] !== 'string' || target[key].length === 0) invalid('target.' + key + ' must be a non-empty string');
      copy[key] = target[key];
    }
    if (!keys.length) invalid('semantic target must not be empty');
    if (keys.length === 1 && own(copy, 'text')) return copy.text;
    if (own(copy, 'text')) {
      // Explicit accessible name remains authoritative; text is the concise
      // name spelling only when the caller has not supplied a separate name.
      if (!own(copy, 'name')) copy.name = copy.text;
      delete copy.text;
    }
    return copy;
  }
  UI.tapTargets = async function (targets, options) {
    const legacy = target => target && typeof target === 'object' && own(target, 'locator');
    if (Array.isArray(targets) && targets.length && Array.from(targets).every(legacy)) return activate(targets, options);
    if (!Array.isArray(targets) || !targets.length || targets.length > 256) invalid('targets must contain 1..256 steps');
    if (targets.some(legacy)) invalid('legacy locator steps cannot be mixed with semantic targets');
    // Copy the full sequence synchronously, before handing control to Runtime.
    const sequence = Array.from(targets, normalize);
    return activate(sequence, options);
  };
})(globalThis);
