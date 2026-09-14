// High-level semantic UI.tapTargets facade.
//
// The core UI implementation in 006-ui.js owns the legacy Accessibility
// sequence contract ({ locator }, required within, full preflight). Keep that
// contract intact for compatibility. This later polyfill adds the public,
// lightweight semantic form and keeps resolver policy inside the Runtime.
(function (global) {
  'use strict';

  var UI = global.UI;
  if (!UI || typeof UI.tapTargets !== 'function') return;

  var legacyTapTargets = UI.tapTargets.bind(UI);
  var SAFE_OCR_FALLBACK_CODES = {
    TARGET_NOT_FOUND: true,
    AMBIGUOUS_TARGET: true,
    OCR_FAILED: true,
    SCREENSHOT_FAILED: true,
    TARGET_SCOPE_NOT_VISIBLE: true,
    UNSUPPORTED_MIXED_DPI_SCOPE: true,
    UNSUPPORTED_COORDINATE_MAPPING: true,
  };

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function makeError(code, message, extra) {
    var error = new Error(message);
    error.code = code || 'BACKEND_FAILED';
    error.operation = 'UI.tapTargets';
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (key) {
        error[key] = extra[key];
      });
    }
    return error;
  }

  function errorSummary(error, resolver, phase) {
    var summary = {
      resolver: resolver,
      phase: phase,
      code: error && typeof error.code === 'string' ? error.code : 'BACKEND_FAILED',
      message: error && error.message ? String(error.message) : 'target resolution failed',
    };
    if (error && Number.isInteger(error.candidateCount)) summary.candidateCount = error.candidateCount;
    if (error && Array.isArray(error.candidates)) summary.candidates = error.candidates;
    if (error && typeof error.backend === 'string') summary.backend = error.backend;
    if (error && typeof error.requestId === 'string') summary.requestId = error.requestId;
    if (error && typeof error.actionState === 'string') summary.actionState = error.actionState;
    return summary;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isLegacyStep(value) {
    return isObject(value) && own(value, 'locator') && !own(value, 'text') &&
      !own(value, 'role') && !own(value, 'name') && !own(value, 'identifier');
  }

  function cloneSemanticTarget(value, index) {
    if (!isObject(value)) {
      throw makeError('INVALID_ARGUMENT', 'targets[' + index + '] must be an object');
    }
    var allowed = { text: true, role: true, name: true, identifier: true };
    Object.keys(value).forEach(function (key) {
      if (!allowed[key]) {
        throw makeError(
          'INVALID_ARGUMENT',
          'targets[' + index + '] contains unsupported field "' + key + '"; resolver strategy is Runtime-owned',
        );
      }
    });
    if (Object.getOwnPropertySymbols(value).length) {
      throw makeError('INVALID_ARGUMENT', 'targets[' + index + '] must not contain symbol fields');
    }

    var target = {};
    ['text', 'role', 'name', 'identifier'].forEach(function (key) {
      if (!own(value, key)) return;
      if (typeof value[key] !== 'string' || value[key].length === 0) {
        throw makeError('INVALID_ARGUMENT', 'targets[' + index + '].' + key + ' must be a non-empty string');
      }
      target[key] = value[key];
    });
    if (!own(target, 'text') && !own(target, 'role') && !own(target, 'name') && !own(target, 'identifier')) {
      throw makeError(
        'INVALID_ARGUMENT',
        'targets[' + index + '] must include text, role, name, or identifier',
      );
    }
    return target;
  }

  function cloneSemanticSequence(targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
      throw makeError('INVALID_ARGUMENT', 'targets must be a non-empty array');
    }
    var sequence = Array.from(targets);
    return sequence.map(cloneSemanticTarget);
  }

  function semanticOptions(rawOptions) {
    if (rawOptions === undefined) return { timeout: 3000, signal: undefined, within: undefined };
    if (!isObject(rawOptions)) throw makeError('INVALID_ARGUMENT', 'options must be an object');
    var allowed = { within: true, timeout: true, signal: true };
    Object.keys(rawOptions).forEach(function (key) {
      if (!allowed[key]) {
        throw makeError(
          'INVALID_ARGUMENT',
          'options.' + key + ' is not part of semantic UI.tapTargets; resolver policy is Runtime-owned',
        );
      }
    });
    if (Object.getOwnPropertySymbols(rawOptions).length) {
      throw makeError('INVALID_ARGUMENT', 'options must not contain symbol fields');
    }
    var timeout = rawOptions.timeout === undefined ? 3000 : rawOptions.timeout;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) {
      throw makeError('INVALID_ARGUMENT', 'options.timeout must be an integer from 1 to 30000 milliseconds');
    }
    var signal = rawOptions.signal == null ? undefined : rawOptions.signal;
    if (signal !== undefined && (typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
      throw makeError('INVALID_ARGUMENT', 'options.signal must be an AbortSignal');
    }
    if (rawOptions.within !== undefined && !isObject(rawOptions.within)) {
      throw makeError('INVALID_ARGUMENT', 'options.within must be a resolved WindowInfo');
    }
    return { timeout: timeout, signal: signal, within: rawOptions.within };
  }

  function checkCanceled(options, phase) {
    if (options.signal && options.signal.aborted) {
      throw makeError('CANCELED', 'target sequence was canceled', { phase: phase });
    }
  }

  async function resolveWindow(options) {
    if (options.within !== undefined) return options.within;
    if (!global.window || typeof global.window.getActiveWindow !== 'function') {
      throw makeError('NOT_SUPPORTED', 'active-window resolution is unavailable', { phase: 'capability' });
    }
    checkCanceled(options, 'scope');
    var current = await global.window.getActiveWindow();
    checkCanceled(options, 'scope');
    if (!current || typeof current !== 'object') {
      throw makeError('TARGET_NOT_FOUND', 'no active window could be resolved', { phase: 'scope' });
    }
    return current;
  }

  function selectorFromTarget(target) {
    var selector = {};
    if (target.role !== undefined) selector.role = target.role;
    if (target.name !== undefined) selector.name = target.name;
    else if (target.text !== undefined) selector.name = target.text;
    if (target.identifier !== undefined) selector.identifier = target.identifier;
    return selector;
  }

  function hasNativeConstraint(target) {
    return target.role !== undefined || target.name !== undefined || target.identifier !== undefined;
  }

  function canUseAccessibility() {
    return global.Accessibility &&
      typeof global.Accessibility.find === 'function' &&
      typeof global.Accessibility.read === 'function' &&
      typeof global.Accessibility.perform === 'function' &&
      typeof global.Accessibility.release === 'function';
  }

  async function invokeAccessibility(target, within, options, attempts) {
    var selector = selectorFromTarget(target);
    if (!selector.role && !selector.name && !selector.identifier) {
      throw makeError('INVALID_ARGUMENT', 'semantic target has no native selector fields');
    }
    if (!canUseAccessibility()) {
      var unavailable = makeError('NOT_SUPPORTED', 'Accessibility resolver is unavailable', {
        resolver: 'accessibility', phase: 'resolve',
      });
      attempts.push(errorSummary(unavailable, 'accessibility', 'resolve'));
      throw unavailable;
    }

    var ref = null;
    var actionStarted = false;
    var primaryError = null;
    try {
      checkCanceled(options, 'resolve');
      try {
        ref = await global.Accessibility.find(selector, { within: within, timeout: options.timeout });
      } catch (error) {
        attempts.push(errorSummary(error, 'accessibility', 'resolve'));
        throw error;
      }
      checkCanceled(options, 'resolve');
      if (!ref) {
        var missing = makeError('TARGET_NOT_FOUND', 'Accessibility target was not found', {
          resolver: 'accessibility', phase: 'resolve', selector: selector,
        });
        attempts.push(errorSummary(missing, 'accessibility', 'resolve'));
        throw missing;
      }

      var read;
      try {
        read = await global.Accessibility.read(ref, {
          properties: ['role', 'name', 'identifier', 'enabled', 'actions'],
          timeout: options.timeout,
        });
      } catch (error) {
        attempts.push(errorSummary(error, 'accessibility', 'precondition'));
        throw error;
      }
      checkCanceled(options, 'precondition');
      var properties = read && read.properties ? read.properties : {};
      if (properties.enabled === false) {
        var disabled = makeError('ELEMENT_DISABLED', 'Accessibility target is disabled', {
          resolver: 'accessibility', phase: 'precondition', selector: selector,
        });
        attempts.push(errorSummary(disabled, 'accessibility', 'precondition'));
        throw disabled;
      }
      if (!Array.isArray(properties.actions) || properties.actions.indexOf('invoke') < 0) {
        var unsupported = makeError('ACTION_NOT_SUPPORTED', 'Accessibility target does not support invoke', {
          resolver: 'accessibility', phase: 'precondition', selector: selector,
        });
        attempts.push(errorSummary(unsupported, 'accessibility', 'precondition'));
        throw unsupported;
      }

      checkCanceled(options, 'action');
      actionStarted = true;
      var performed;
      try {
        performed = await global.Accessibility.perform(ref, { action: 'invoke' }, { timeout: options.timeout });
      } catch (error) {
        try { error.sideEffectPossible = true; } catch (_) {}
        attempts.push(errorSummary(error, 'accessibility', 'action'));
        throw error;
      }
      var state = performed && performed.actionState;
      if (state !== 'acknowledged' && state !== 'not_needed') {
        var stateError = makeError(
          state === 'unknown' ? 'STATE_UNKNOWN' : 'BACKEND_FAILED',
          state === 'unknown' ? 'Accessibility invoke completion is unknown' : 'Accessibility invoke did not complete',
          {
            resolver: 'accessibility',
            phase: 'action',
            actionState: typeof state === 'string' ? state : 'unknown',
            backend: performed && performed.backend,
            requestId: performed && performed.requestId,
            sideEffectPossible: true,
          },
        );
        attempts.push(errorSummary(stateError, 'accessibility', 'action'));
        throw stateError;
      }
      return {
        resolver: 'accessibility',
        action: 'invoke',
        backend: performed && typeof performed.backend === 'string' ? performed.backend : 'accessibility',
        requestId: performed && typeof performed.requestId === 'string' ? performed.requestId : '',
        actionState: state,
      };
    } catch (error) {
      primaryError = error;
      if (actionStarted && error && error.sideEffectPossible === undefined) {
        try { error.sideEffectPossible = true; } catch (_) {}
      }
      throw error;
    } finally {
      if (ref) {
        try {
          await global.Accessibility.release(ref);
        } catch (releaseError) {
          if (primaryError) {
            try { primaryError.cleanupError = releaseError; } catch (_) {}
          } else {
            throw makeError(
              releaseError && releaseError.code ? releaseError.code : 'BACKEND_FAILED',
              releaseError && releaseError.message ? releaseError.message : 'Accessibility target cleanup failed',
              {
                resolver: 'accessibility',
                phase: 'cleanup',
                cause: releaseError,
                sideEffectPossible: actionStarted,
              },
            );
          }
        }
      }
    }
  }

  async function tapOCR(target, within, options, attempts) {
    checkCanceled(options, 'resolve');
    try {
      var result = await UI.tapText(target.text, {
        within: within,
        timeout: options.timeout,
        match: 'exact',
      });
      checkCanceled(options, 'action');
      return {
        resolver: 'ocr',
        action: 'click',
        backend: result && result.target && result.target.provider ? result.target.provider : 'ocr',
        target: result && result.target,
        point: result && result.point,
      };
    } catch (error) {
      attempts.push(errorSummary(error, 'ocr', 'resolve'));
      throw error;
    }
  }

  function sequenceError(error, index, target, completed, attempts) {
    if (error && error.operation === 'UI.tapTargets' && Number.isInteger(error.failedIndex)) return error;
    var wrapped = makeError(
      error && error.code ? error.code : 'BACKEND_FAILED',
      error && error.message ? error.message : 'semantic target activation failed',
      {
        failedIndex: index,
        failedTarget: target,
        failedPhase: error && error.phase ? error.phase : (error && error.sideEffectPossible ? 'action' : 'resolve'),
        completed: completed.slice(),
        attempts: attempts.slice(),
        cause: error,
      },
    );
    if (error && error.cleanupError) wrapped.cleanupError = error.cleanupError;
    return wrapped;
  }

  async function activateSemanticTarget(target, within, options, attempts) {
    // Explicit role/name/identifier constraints are authoritative. Accessibility
    // is the resolver that can prove those constraints, so do not drop them by
    // silently clicking an OCR result that cannot establish role/identifier.
    if (hasNativeConstraint(target)) {
      return invokeAccessibility(target, within, options, attempts);
    }

    // Text-only targets keep the common OCR path first. Only discovery failures
    // known to occur before mouse input may continue to native semantic lookup.
    try {
      return await tapOCR(target, within, options, attempts);
    } catch (ocrError) {
      if (!ocrError || !SAFE_OCR_FALLBACK_CODES[ocrError.code]) throw ocrError;
      return invokeAccessibility(target, within, options, attempts);
    }
  }

  UI.tapTargets = async function (targets, rawOptions) {
    // Preserve the existing low-level native sequence exactly. It keeps its
    // required within, traversal controls, full preflight, ref reuse and error
    // contract. Mixing legacy locator steps with semantic steps is rejected so
    // callers never get partially different execution semantics by accident.
    if (Array.isArray(targets) && targets.length > 0 && targets.every(isLegacyStep)) {
      return legacyTapTargets(targets, rawOptions);
    }
    if (Array.isArray(targets) && targets.some(isLegacyStep)) {
      throw makeError('INVALID_ARGUMENT', 'legacy locator steps cannot be mixed with semantic tapTargets steps');
    }

    var sequence = cloneSemanticSequence(targets);
    var options = semanticOptions(rawOptions);
    checkCanceled(options, 'arguments');
    var within = await resolveWindow(options);
    var completed = [];

    for (var index = 0; index < sequence.length; index += 1) {
      var target = sequence[index];
      var attempts = [];
      try {
        checkCanceled(options, 'resolve');
        var completion = await activateSemanticTarget(target, within, options, attempts);
        completion.index = index;
        completed.push(completion);
        checkCanceled(options, 'action');
      } catch (error) {
        throw sequenceError(error, index, target, completed, attempts);
      }
    }

    return { ok: true, action: 'tapTargets', completed: completed };
  };
})(globalThis);
