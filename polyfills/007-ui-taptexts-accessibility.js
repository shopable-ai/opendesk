// Explicit, opt-in Accessibility fallback for UI.tapTexts structured steps.
//
// Compatibility rule: a legacy all-string sequence delegates to the original
// UI.tapTexts implementation without touching Accessibility. A structured
// step may fall back to an exact caller-supplied Accessibility locator only
// after a successful visual observation returns zero candidates and before
// any input has been submitted for that step.
(function (global) {
  'use strict';

  if (!global.UI || typeof global.UI.tapTexts !== 'function') return;

  const originalTapTexts = global.UI.tapTexts.bind(global.UI);
  const originalTapText = typeof global.UI.tapText === 'function'
    ? global.UI.tapText.bind(global.UI)
    : null;
  const originalFindTexts = typeof global.UI.findTexts === 'function'
    ? global.UI.findTexts.bind(global.UI)
    : null;
  const MAX_STEPS = 256;
  const AX_ROLES = Object.freeze({
    application: true, window: true, button: true, checkbox: true,
    radioButton: true, textField: true, staticText: true, menuBar: true,
    menu: true, menuItem: true, group: true, list: true, listItem: true,
    table: true, row: true, cell: true, unknown: true,
  });

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function makeError(code, message, phase, actionState, details) {
    const error = new Error(message);
    error.code = code;
    error.operation = 'UI.tapTexts';
    error.phase = phase || 'arguments';
    error.actionState = actionState || 'not_started';
    if (details && typeof details === 'object') {
      Object.keys(details).forEach(function (key) { error[key] = details[key]; });
    }
    return error;
  }

  function rejectUnknown(value, allowed, name) {
    Object.keys(value).forEach(function (key) {
      if (allowed.indexOf(key) < 0) {
        throw makeError('INVALID_ARGUMENT', name + ' contains unknown field: ' + key);
      }
    });
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw makeError('INVALID_ARGUMENT', name + ' must not contain symbol fields');
    }
  }

  function cloneQuery(query, name) {
    if (typeof query === 'string') {
      if (query.length === 0) throw makeError('INVALID_ARGUMENT', name + '.text must not be empty');
      return query;
    }
    if (query instanceof RegExp) return new RegExp(query.source, query.flags);
    throw makeError('INVALID_ARGUMENT', name + '.text must be a string or RegExp');
  }

  function cloneLocator(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw makeError('INVALID_ARGUMENT', name + '.locator must be an object');
    }
    rejectUnknown(value, ['role', 'name', 'identifier'], name + '.locator');
    const locator = {};
    if (own(value, 'role')) {
      if (typeof value.role !== 'string' || !AX_ROLES[value.role]) {
        throw makeError('INVALID_ARGUMENT', name + '.locator.role is not a normalized Accessibility role');
      }
      locator.role = value.role;
    }
    ['name', 'identifier'].forEach(function (key) {
      if (!own(value, key)) return;
      if (typeof value[key] !== 'string' || value[key].trim().length === 0) {
        throw makeError('INVALID_ARGUMENT', name + '.locator.' + key + ' must be a non-empty string');
      }
      locator[key] = value[key];
    });
    if (Object.keys(locator).length === 0) {
      throw makeError('INVALID_ARGUMENT', name + '.locator must contain role, name, or identifier');
    }
    return Object.freeze(locator);
  }

  function normalizeSequence(values) {
    const sequence = Array.isArray(values) ? Array.from(values) : null;
    if (!sequence || sequence.length === 0 || sequence.length > MAX_STEPS) {
      throw makeError('INVALID_ARGUMENT', 'texts must be a non-empty array with at most ' + MAX_STEPS + ' items');
    }
    let structured = false;
    const normalized = sequence.map(function (value, index) {
      if (typeof value === 'string') return Object.freeze({ text: value, locator: null, legacy: true });
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw makeError('INVALID_ARGUMENT', 'texts[' + index + '] must be a string or structured step');
      }
      structured = true;
      rejectUnknown(value, ['text', 'locator'], 'texts[' + index + ']');
      if (!own(value, 'text') || !own(value, 'locator')) {
        throw makeError('INVALID_ARGUMENT', 'texts[' + index + '] requires text and locator');
      }
      return Object.freeze({
        text: cloneQuery(value.text, 'texts[' + index + ']'),
        locator: cloneLocator(value.locator, 'texts[' + index + ']'),
        legacy: false,
      });
    });
    return { sequence: Object.freeze(normalized), structured: structured };
  }

  function number(value, fallback, min, max, name) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < min || value > max) {
      throw makeError('INVALID_ARGUMENT', name + ' must be an integer from ' + min + ' to ' + max);
    }
    return value;
  }

  function snapshotOptions(raw) {
    const value = raw === undefined ? {} : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw makeError('INVALID_ARGUMENT', 'options must be an object');
    }
    rejectUnknown(value, [
      'within', 'timeout', 'polling', 'intervalMs', 'match', 'caseSensitive',
      'normalizeWhitespace', 'minConfidence', 'provider', 'providerChain',
      'lang', 'waitForEach', 'signal', 'maxDepth', 'maxNodes', 'refocus',
      'refocusTimeout',
    ], 'options');
    if (!value.within || typeof value.within !== 'object' || Array.isArray(value.within)) {
      throw makeError('INVALID_ARGUMENT', 'structured UI.tapTexts requires options.within as a resolved WindowInfo');
    }
    const within = Object.freeze(Object.assign({}, value.within));
    const pid = Number.isInteger(within.pid) ? within.pid : within.processId;
    if (typeof within.id !== 'string' || within.id.length === 0 ||
        !Number.isInteger(pid) || pid <= 0 || within.handle === undefined || within.handle === null ||
        !Number.isFinite(within.x) || !Number.isFinite(within.y) ||
        !Number.isFinite(within.width) || !Number.isFinite(within.height)) {
      throw makeError('INVALID_ARGUMENT', 'options.within must include stable id, pid, handle, and bounds');
    }
    const signal = value.signal == null ? undefined : value.signal;
    if (signal !== undefined && (typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      throw makeError('INVALID_ARGUMENT', 'options.signal must be an AbortSignal');
    }
    if (value.refocus !== undefined && value.refocus !== 'if-needed') {
      throw makeError('INVALID_ARGUMENT', 'options.refocus must be "if-needed"');
    }
    if (value.refocusTimeout !== undefined && value.refocus === undefined) {
      throw makeError('INVALID_ARGUMENT', 'options.refocusTimeout requires options.refocus');
    }
    return Object.freeze({
      within: within,
      identity: Object.freeze({
        id: within.id, pid: pid, handle: within.handle,
        title: typeof within.title === 'string' ? within.title : '',
        x: within.x, y: within.y, width: within.width, height: within.height,
      }),
      timeout: number(value.timeout, 10000, 1, 300000, 'options.timeout'),
      polling: number(value.polling, 200, 1, 10000, 'options.polling'),
      intervalMs: number(value.intervalMs, 300, 0, 86400000, 'options.intervalMs'),
      maxDepth: number(value.maxDepth, 8, 1, 32, 'options.maxDepth'),
      maxNodes: number(value.maxNodes, 1000, 1, 5000, 'options.maxNodes'),
      refocus: value.refocus,
      refocusTimeout: number(value.refocusTimeout, 1000, 1, 10000, 'options.refocusTimeout'),
      signal: signal,
      visual: Object.freeze({
        within: within,
        match: value.match,
        caseSensitive: value.caseSensitive,
        normalizeWhitespace: value.normalizeWhitespace,
        minConfidence: value.minConfidence,
        provider: value.provider,
        providerChain: Array.isArray(value.providerChain) ? value.providerChain.slice() : value.providerChain,
        lang: value.lang,
      }),
    });
  }

  function compactVisual(options, timeout) {
    const result = { within: options.within, timeout: timeout };
    Object.keys(options.visual).forEach(function (key) {
      const value = options.visual[key];
      if (key !== 'within' && value !== undefined) result[key] = value;
    });
    return result;
  }

  function canceled(options, phase, actionState) {
    if (options.signal && options.signal.aborted) {
      throw makeError('CANCELED', 'text sequence was canceled', phase, actionState);
    }
  }

  function remaining(deadline, options, phase, actionState) {
    canceled(options, phase, actionState);
    const value = Math.ceil(deadline - Date.now());
    if (value <= 0) throw makeError('TIMEOUT', 'timed out waiting for the next text target', phase, actionState);
    return Math.min(value, 300000);
  }

  function sameWindow(expected, actual) {
    if (!actual || typeof actual !== 'object') return false;
    const pid = Number.isInteger(actual.pid) ? actual.pid : actual.processId;
    return actual.id === expected.id && pid === expected.pid &&
      actual.handle === expected.handle &&
      (typeof actual.title !== 'string' ? '' : actual.title) === expected.title &&
      actual.x === expected.x && actual.y === expected.y &&
      actual.width === expected.width && actual.height === expected.height;
  }

  async function revalidateWindow(options, phase, actionState) {
    if (!global.window || typeof global.window.current !== 'function') {
      throw makeError('NOT_SUPPORTED', 'exact window revalidation is unavailable', 'capability', actionState);
    }
    canceled(options, phase, actionState);
    let current;
    try {
      current = await global.window.current(options.within);
    } catch (error) {
      throw makeError(error && error.code === 'NOT_FOUND' ? 'STALE_TARGET' : (error && error.code) || 'BACKEND_FAILED',
        'the fixed target window could not be refreshed', phase, actionState, { cause: error });
    }
    canceled(options, phase, actionState);
    if (!sameWindow(options.identity, current)) {
      throw makeError('STALE_TARGET', 'the fixed target window identity or bounds changed', phase, actionState,
        { expectedWindow: options.identity, actualWindow: current || null });
    }
    return current;
  }

  function requireAX() {
    const ax = global.Accessibility;
    if (!ax || typeof ax.getCapabilities !== 'function' || typeof ax.find !== 'function' ||
        typeof ax.read !== 'function' || typeof ax.perform !== 'function' || typeof ax.release !== 'function') {
      throw makeError('NOT_SUPPORTED', 'native Accessibility fallback is unavailable', 'capability', 'not_started');
    }
    let capabilities;
    try { capabilities = ax.getCapabilities(); }
    catch (error) { throw makeError((error && error.code) || 'BACKEND_FAILED', 'Accessibility capability check failed', 'capability', 'not_started', { cause: error }); }
    if (!capabilities || !capabilities.hostAuthorization || capabilities.hostAuthorization.enabled !== true) {
      throw makeError('CAPABILITY_DISABLED', 'native Accessibility is disabled for this execution', 'capability', 'not_started');
    }
    if (!capabilities.implementation || capabilities.implementation.available !== true) {
      throw makeError('NOT_SUPPORTED', 'native Accessibility is not implemented on this platform', 'capability', 'not_started');
    }
    if (!capabilities.permission || capabilities.permission.granted !== true) {
      throw makeError('PERMISSION_DENIED', 'native Accessibility permission is not granted', 'capability', 'not_started');
    }
    if (!capabilities.implementation.actions || capabilities.implementation.actions.invoke !== true) {
      throw makeError('ACTION_NOT_SUPPORTED', 'native Accessibility invoke is unavailable', 'capability', 'not_started');
    }
    return ax;
  }

  function validateRead(read, locator, actionState) {
    if (!read || !read.properties || typeof read.properties !== 'object') {
      throw makeError('BACKEND_FAILED', 'Accessibility.read returned no target properties', 'precondition', actionState);
    }
    const props = read.properties;
    ['role', 'name', 'identifier'].forEach(function (field) {
      if (own(locator, field) && props[field] !== locator[field]) {
        throw makeError('STALE_TARGET', 'Accessibility target no longer matches its exact locator', 'precondition', actionState);
      }
    });
    if (props.enabled !== true) {
      throw makeError(props.enabled === false ? 'ELEMENT_DISABLED' : 'STATE_UNKNOWN',
        props.enabled === false ? 'Accessibility target is disabled' : 'Accessibility target enabled state is unknown',
        'precondition', actionState);
    }
    if (!Array.isArray(props.actions) || props.actions.indexOf('invoke') < 0) {
      throw makeError('ACTION_NOT_SUPPORTED', 'Accessibility target does not support invoke', 'precondition', actionState);
    }
  }

  async function releaseRef(ax, ref, primaryError, actionState) {
    if (!ref) return;
    try {
      const released = await ax.release(ref);
      if (released !== true) throw makeError('BACKEND_FAILED', 'Accessibility ref was not released', 'cleanup', actionState);
    } catch (error) {
      const cleanup = {
        code: (error && error.code) || 'BACKEND_FAILED',
        phase: 'cleanup', actionState: actionState,
        message: String((error && error.message) || error),
      };
      if (primaryError) { primaryError.cleanupError = cleanup; return; }
      throw makeError(cleanup.code, 'Accessibility ref cleanup failed', 'cleanup', actionState, { cleanupError: cleanup });
    }
  }

  async function invokeFallback(step, options, deadline, index) {
    const ax = requireAX();
    let ref = null;
    let failure = null;
    let actionState = 'not_started';
    try {
      remaining(deadline, options, 'locate', actionState);
      await revalidateWindow(options, 'locate', actionState);
      ref = await ax.find(step.locator, {
        within: options.within,
        timeout: remaining(deadline, options, 'locate', actionState),
        maxDepth: options.maxDepth,
        maxNodes: options.maxNodes,
      });
      canceled(options, 'locate', actionState);
      if (!ref) throw makeError('TARGET_NOT_FOUND', 'the Accessibility target was not found', 'locate', actionState);
      const read = await ax.read(ref, {
        properties: ['role', 'name', 'identifier', 'enabled', 'actions'],
        timeout: remaining(deadline, options, 'precondition', actionState),
      });
      canceled(options, 'precondition', actionState);
      validateRead(read, step.locator, actionState);
      await revalidateWindow(options, 'precondition', actionState);
      if (options.refocus === 'if-needed') {
        if (!global.window || typeof global.window.activate !== 'function') {
          throw makeError('NOT_SUPPORTED', 'exact window refocus is unavailable', 'capability', actionState);
        }
        const focused = await global.window.activate(options.within, {
          timeout: Math.min(options.refocusTimeout, remaining(deadline, options, 'precondition', actionState)),
        });
        if (!sameWindow(options.identity, focused) || focused.isForeground !== true || focused.hasFocus !== true) {
          throw makeError('STALE_TARGET', 'exact refocus did not preserve the fixed active window', 'precondition', actionState);
        }
      }
      canceled(options, 'action', actionState);
      await revalidateWindow(options, 'action', actionState);
      canceled(options, 'action', actionState);
      actionState = 'unknown';
      const performed = await ax.perform(ref, { action: 'invoke' }, {
        timeout: remaining(deadline, options, 'action', actionState),
      });
      actionState = performed && performed.actionState;
      if (actionState === 'unknown') throw makeError('STATE_UNKNOWN', 'native invoke completion is unknown', 'action', actionState);
      if (actionState !== 'acknowledged' && actionState !== 'not_needed') {
        throw makeError('BACKEND_FAILED', 'native invoke returned an invalid completion state', 'action', actionState || 'unknown');
      }
      return {
        index: index,
        action: 'invoke',
        backend: performed && performed.backend ? performed.backend : 'accessibility',
        requestId: performed && performed.requestId ? performed.requestId : '',
        actionState: actionState,
        fallbackFrom: 'ocr-zero-match',
      };
    } catch (error) {
      failure = error && error.operation === 'UI.tapTexts'
        ? error
        : makeError((error && error.code) || 'BACKEND_FAILED', 'Accessibility fallback failed',
          (error && error.phase) || 'locate',
          error && error.actionState ? error.actionState : actionState,
          { cause: error });
      throw failure;
    } finally {
      await releaseRef(ax, ref, failure, actionState);
    }
  }

  async function delay(ms, signal) {
    if (ms <= 0) return;
    if (global.page && typeof global.page.waitForTimeout === 'function') {
      await global.page.waitForTimeout(ms, signal ? { signal: signal } : undefined);
      return;
    }
    await new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function structuredTapTexts(steps, rawOptions) {
    if (!originalFindTexts || !originalTapText) {
      throw makeError('NOT_SUPPORTED', 'structured UI.tapTexts requires UI.findTexts and UI.tapText', 'capability', 'not_started');
    }
    const options = snapshotOptions(rawOptions);
    const completed = [];
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      let phase = 'interval';
      const deadline = Date.now() + options.timeout;
      try {
        canceled(options, phase, 'not_started');
        if (index > 0 && options.intervalMs > 0) {
          await delay(options.intervalMs, options.signal);
          canceled(options, phase, 'not_started');
        }
        phase = 'locate';
        await revalidateWindow(options, phase, 'not_started');
        const visualOptions = compactVisual(options, remaining(deadline, options, phase, 'not_started'));
        const candidates = await originalFindTexts(step.text, visualOptions);
        canceled(options, phase, 'not_started');

        if (candidates.length === 0 && step.locator) {
          const nativeResult = await invokeFallback(step, options, deadline, index);
          completed.push(nativeResult);
          canceled(options, 'action', nativeResult.actionState);
          continue;
        }

        // Non-zero visual observations stay on the visual path. Any later OCR
        // ambiguity/provider error/zero-match is surfaced as-is; it is not
        // converted into an Accessibility retry.
        phase = 'input';
        const tapped = await originalTapText(
          step.text,
          compactVisual(options, remaining(deadline, options, phase, 'not_started')),
        );
        completed.push(tapped);
        canceled(options, phase, 'acknowledged');
      } catch (error) {
        const wrapped = error && error.operation === 'UI.tapTexts'
          ? error
          : makeError((error && error.code) || 'BACKEND_FAILED',
            String((error && error.message) || 'text activation failed'),
            phase,
            error && error.actionState ? error.actionState : 'not_started',
            { cause: error });
        wrapped.failedIndex = index;
        wrapped.failedText = step.text;
        wrapped.failedPhase = wrapped.phase || phase;
        wrapped.completed = completed.slice();
        if (error && Number.isInteger(error.candidateCount)) wrapped.candidateCount = error.candidateCount;
        if (error && Array.isArray(error.candidates)) wrapped.candidates = error.candidates;
        throw wrapped;
      }
    }
    return { ok: true, action: 'tapTexts', completed: completed };
  }

  global.UI.tapTexts = async function (texts, rawOptions) {
    const normalized = normalizeSequence(texts);
    if (!normalized.structured) {
      // Critical compatibility guarantee: legacy all-string calls execute the
      // original owner byte-for-byte and never probe Accessibility here.
      return originalTapTexts(texts, rawOptions);
    }
    return structuredTapTexts(normalized.sequence, rawOptions);
  };
})(globalThis);
