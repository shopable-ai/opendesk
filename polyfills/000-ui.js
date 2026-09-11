// Custom UI toast facade.
//
// Native Custom UI historically exposed ui.notify(). Keep that method as a
// compatibility alias, while making ui.toast() the preferred user-facing name
// for OpenDesk-owned transient feedback. The native driver/protocol can retain
// its notification terminology; this facade only normalizes the JavaScript API.
(function (global) {
    var currentUI = global.ui;
    if (!currentUI || typeof currentUI !== 'object') {
        return;
    }

    var nativeNotify = typeof currentUI.notify === 'function'
        ? currentUI.notify.bind(currentUI)
        : null;

    function retagToastError(error) {
        if (error && typeof error === 'object' && error.operation === 'ui.notify') {
            try {
                error.operation = 'ui.toast';
            } catch (_) {
                // Keep the original structured error when the host freezes it.
            }
        }
        return error;
    }

    function addToastStateAlias(state) {
        if (state && typeof state === 'object' &&
            typeof state.toast === 'undefined' &&
            typeof state.notification !== 'undefined') {
            try {
                state.toast = state.notification;
            } catch (_) {
                // State remains usable through the legacy notification field.
            }
        }
        return state;
    }

    function normalizeUpdateResult(result) {
        if (result && typeof result === 'object' && result.state) {
            addToastStateAlias(result.state);
        }
        return result;
    }

    function wrapToastHandle(handle) {
        if (!handle || typeof handle !== 'object') {
            return handle;
        }
        return {
            id: handle.id,
            update: function (patch) {
                return Promise.resolve(handle.update(patch)).then(
                    normalizeUpdateResult,
                    function (error) { throw retagToastError(error); }
                );
            },
            close: function () {
                return Promise.resolve(handle.close()).then(
                    addToastStateAlias,
                    function (error) { throw retagToastError(error); }
                );
            },
            getState: function () {
                return Promise.resolve(handle.getState()).then(
                    addToastStateAlias,
                    function (error) { throw retagToastError(error); }
                );
            },
            waitUntilClosed: function () {
                return Promise.resolve(handle.waitUntilClosed()).then(
                    addToastStateAlias,
                    function (error) { throw retagToastError(error); }
                );
            }
        };
    }

    if (typeof currentUI.toast !== 'function' && nativeNotify) {
        currentUI.toast = function (messageOrOptions) {
            var result;
            try {
                result = nativeNotify(messageOrOptions);
            } catch (error) {
                throw retagToastError(error);
            }
            return Promise.resolve(result).then(
                wrapToastHandle,
                function (error) { throw retagToastError(error); }
            );
        };
    }

    if (typeof currentUI.getCapabilities === 'function') {
        var nativeGetCapabilities = currentUI.getCapabilities.bind(currentUI);
        currentUI.getCapabilities = function () {
            var capabilities = nativeGetCapabilities();
            if (capabilities && capabilities.window &&
                typeof capabilities.window.toast === 'undefined') {
                capabilities.window.toast = !!capabilities.window.notify;
            }
            return capabilities;
        };
    }
})(typeof globalThis !== 'undefined' ? globalThis :
   typeof window !== 'undefined' ? window :
   typeof global !== 'undefined' ? global :
   this);
