// Existing normalization adapters for native window snapshots.
function toLowerCaseProps(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(toLowerCaseProps);
    return Object.keys(obj).reduce((acc, key) => {
        const value = obj[key];
        const newKey = key === 'ID' ? 'id' : key.charAt(0).toLowerCase() + key.slice(1);
        acc[newKey] = typeof value === 'object' ? toLowerCaseProps(value) : value;
        return acc;
    }, {});
}

function normalizeWindowResult(result) {
    const normalized = toLowerCaseProps(result);
    if (normalized && normalized.pid === undefined && normalized.processID !== undefined) normalized.pid = normalized.processID;
    return normalized;
}

const originalGetActiveWindow = window.getActiveWindow;
window.getActiveWindow = async function() {
    return normalizeWindowResult(await originalGetActiveWindow.call(window));
};
const originalGetWindowByTitle = window.getWindowByTitle;
window.getWindowByTitle = async function(title) {
    return normalizeWindowResult(await originalGetWindowByTitle.call(window, title));
};
const originalGetFocusWindow = window.getFocusWindow;
window.getFocusWindow = function() {
    return normalizeWindowResult(originalGetFocusWindow.call(window));
};

// Query composition only. Native Window/App owners retain platform enumeration,
// identity interpretation and execution lifecycle. No duplicate alias registry.
(function(global) {
    'use strict';
    const facade = global.window;
    const nativeList = facade.list;
    const nativeCapabilities = facade.getCapabilities;
    const identityKeys = ['id', 'pid', 'app', 'exePath', 'exeName'];
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

    function failure(code, operation, message, cause) {
        const error = new Error(code + ': ' + message);
        error.name = 'WindowError';
        error.code = code;
        error.operation = operation;
        error.capability = cause && cause.capability ? cause.capability : 'window.list';
        error.platform = 'unknown';
        try { error.platform = nativeCapabilities.call(facade).platform; } catch (_) { /* diagnostics only */ }
        if (cause !== undefined) error.cause = cause;
        return error;
    }
    function invalid(operation, message) { throw failure('INVALID_ARGUMENT', operation, message); }
    function plain(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value) &&
            (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    }
    function text(value, operation) {
        if (typeof value !== 'string' || !value.trim()) invalid(operation, 'Target fields must be non-empty strings');
        return value; // Exact selectors are not trimmed, case-folded or translated.
    }
    function pid(value, operation) {
        if (!Number.isInteger(value) || value < 1 || value > 4294967295) invalid(operation, 'pid must be a positive uint32');
        return value;
    }
    function application(value, operation) {
        if (typeof value === 'string') return text(value, operation);
        if (typeof value === 'number') return pid(value, operation);
        if (!plain(value)) invalid(operation, 'app must be an OpenDeskAppTarget');
        const keys = Object.keys(value);
        if (keys.length !== 1 || ['pid', 'name', 'bundleId', 'path'].indexOf(keys[0]) < 0 ||
            Object.getOwnPropertySymbols(value).length) invalid(operation, 'app must contain exactly one App identity field');
        const key = keys[0];
        return { [key]: key === 'pid' ? pid(value[key], operation) : text(value[key], operation) };
    }
    function target(value, operation, optional) {
        if (value === undefined && optional) return null;
        if (!plain(value)) invalid(operation, 'Use an explicit window target object, such as {app: name} or {title: title}');
        const keys = Object.keys(value);
        if (!keys.length || Object.getOwnPropertySymbols(value).length || keys.some(key => identityKeys.indexOf(key) < 0 && key !== 'title')) {
            invalid(operation, 'Window target contains no selector or an unknown field');
        }
        if (keys.filter(key => identityKeys.indexOf(key) >= 0).length > 1) invalid(operation, 'Use one identity field, optionally combined with title');
        const copy = {};
        keys.forEach(key => {
            copy[key] = key === 'pid' ? pid(value[key], operation) :
                key === 'app' ? application(value[key], operation) : text(value[key], operation);
        });
        if (copy.id && /:unresolved$/.test(copy.id)) invalid(operation, 'An unresolved observation is not a window id selector');
        return copy;
    }
    function query(selector, operation) {
        try {
            let pids = null;
            if (selector && own(selector, 'app')) {
                const group = global.App.get(selector.app);
                if (group !== null && (!group || !Array.isArray(group.pids) || group.pids.some(value =>
                    !Number.isInteger(value) || value <= 0 || value > 4294967295))) {
                    throw failure('BACKEND_FAILED', operation, 'App returned an invalid process group');
                }
                pids = group === null ? [] : group.pids;
            }
            // Even an absent application must not hide an enumeration failure.
            const rows = nativeList.call(facade);
            if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
                throw failure('BACKEND_FAILED', operation, 'Window backend did not return a snapshot array');
            }
            if (!selector) return rows;
            return rows.filter(row => (pids === null || pids.indexOf(row.pid) >= 0) &&
                Object.keys(selector).every(key => key === 'app' || row[key] === selector[key]));
        } catch (cause) {
            throw failure(cause && typeof cause.code === 'string' ? cause.code : 'BACKEND_FAILED',
                operation, 'Window target query failed', cause);
        }
    }
    function unique(selector, operation) {
        const rows = query(selector, operation);
        if (rows.length === 0) throw failure('NOT_FOUND', operation, 'No current window matches the target');
        if (rows.length !== 1) throw failure('AMBIGUOUS_TARGET', operation, 'More than one current window matches the target');
        const row = rows[0];
        if (typeof row.id !== 'string' || !row.id || /:unresolved$/.test(row.id)) {
            throw failure('STALE_TARGET', operation, 'The matched window has no resolved native identity');
        }
        if (![row.x, row.y, row.width, row.height].every(Number.isFinite) || row.width <= 0 || row.height <= 0) {
            throw failure('VERIFICATION_FAILED', operation, 'The matched window has invalid bounds');
        }
        return row;
    }

    // Preserve the synchronous list() contract; await list() remains valid too.
    facade.list = function(value) {
        return query(target(value, 'window.list', true), 'window.list');
    };
    facade.get = async function(value) {
        return unique(target(value, 'window.get', false), 'window.get');
    };
    facade.wait = function(value, options) {
        return new Promise(function(resolve, reject) {
            const operation = 'window.wait';
            const selector = target(value, operation, false);
            if (options === undefined) options = {};
            if (!plain(options) || Object.getOwnPropertySymbols(options).length ||
                Object.keys(options).some(key => ['timeout', 'polling', 'signal'].indexOf(key) < 0)) invalid(operation, 'Unknown window.wait option');
            const timeout = options.timeout === undefined ? 10000 : options.timeout;
            const polling = options.polling === undefined ? 200 : options.polling;
            if (!Number.isInteger(timeout) || timeout < 0 || timeout > 300000) invalid(operation, 'timeout must be 0..300000 milliseconds');
            if (!Number.isInteger(polling) || polling < 1 || polling > 10000) invalid(operation, 'polling must be 1..10000 milliseconds');
            const signal = options.signal;
            if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' ||
                typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) invalid(operation, 'signal must be an AbortSignal');
            let finished = false;
            let listenerAttached = false;
            let pollingTimer = null;
            let deadlineTimer = null;
            const deadline = Date.now() + timeout;
            function finish(cause, row) {
                if (finished) return;
                finished = true;
                let cleanupFailed = false;
                let cleanupError;
                function attempt(cleanup) {
                    try { cleanup(); }
                    catch (error) {
                        if (!cleanupFailed) cleanupError = error;
                        cleanupFailed = true;
                    }
                }
                // Release each owned reference before calling a potentially
                // throwing dependency. One failure must not skip other cleanup
                // or strand the Promise after finished has become true.
                if (pollingTimer !== null) {
                    const timer = pollingTimer;
                    pollingTimer = null;
                    attempt(() => global.clearTimeout(timer));
                }
                if (deadlineTimer !== null) {
                    const timer = deadlineTimer;
                    deadlineTimer = null;
                    attempt(() => global.clearTimeout(timer));
                }
                if (listenerAttached) {
                    listenerAttached = false;
                    attempt(() => signal.removeEventListener('abort', onAbort));
                }
                if (cleanupFailed) {
                    const primary = cause;
                    cause = primary
                        ? failure(primary.code || 'BACKEND_FAILED', operation, 'Window wait failed and cleanup failed', primary)
                        : failure('BACKEND_FAILED', operation, 'Window wait cleanup failed', cleanupError);
                    cause.cleanupError = cleanupError;
                }
                if (cause) reject(cause); else resolve(row);
            }
            function onAbort() { finish(failure('CANCELED', operation, 'Window wait was canceled')); }
            function onTimeout() { finish(failure('TIMEOUT', operation, 'Window wait timed out')); }
            function observe() {
                if (finished) return;
                try {
                    if (signal && signal.aborted) { onAbort(); return; }
                    // Timers can be delivered late; do not depend on the
                    // deadline callback running before a late polling callback.
                    if (timeout > 0 && Date.now() >= deadline) { onTimeout(); return; }
                    const row = unique(selector, operation);
                    if (finished) return;
                    if (signal && signal.aborted) onAbort();
                    else if (timeout > 0 && Date.now() >= deadline) onTimeout();
                    else finish(null, row);
                } catch (cause) {
                    if (finished) return;
                    // Retry only a successful enumeration with zero matches,
                    // not a backend failure that happens to use NOT_FOUND.
                    if (!cause || cause.code !== 'NOT_FOUND' || cause.cause !== undefined) { finish(cause); return; }
                    try {
                        if (signal && signal.aborted) { onAbort(); return; }
                        if (timeout === 0 || Date.now() >= deadline) { onTimeout(); return; }
                        pollingTimer = global.setTimeout(function() {
                            pollingTimer = null;
                            observe();
                        }, Math.min(polling, Math.max(1, deadline - Date.now())));
                    } catch (timerError) { finish(failure('BACKEND_FAILED', operation, 'Could not schedule window observation', timerError)); }
                }
            }
            try {
                if (signal && signal.aborted) { onAbort(); return; }
                if (signal) {
                    // A structural signal may register and then throw or call
                    // onAbort synchronously. Both paths still own cleanup.
                    listenerAttached = true;
                    signal.addEventListener('abort', onAbort, { once: true });
                    if (finished) return;
                    if (signal.aborted) { onAbort(); return; }
                }
                if (timeout > 0) deadlineTimer = global.setTimeout(function() {
                    deadlineTimer = null;
                    onTimeout();
                }, timeout);
                if (!finished) observe();
            } catch (cause) { finish(failure('BACKEND_FAILED', operation, 'Could not start window wait', cause)); }
        });
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);