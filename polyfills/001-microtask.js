(function installQueueMicrotask(global) {
    'use strict';
    if (typeof global.queueMicrotask === 'function') return;

    var resolved = Promise.resolve();
    Object.defineProperty(global, 'queueMicrotask', {
        configurable: true,
        writable: true,
        value: function queueMicrotask(callback) {
            if (typeof callback !== 'function') {
                throw new TypeError('queueMicrotask callback must be a function');
            }
            resolved.then(callback);
        }
    });
})(globalThis);
