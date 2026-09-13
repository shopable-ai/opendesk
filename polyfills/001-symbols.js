(function installWellKnownSymbols() {
    'use strict';
    if (typeof Symbol !== 'function' || typeof Symbol.for !== 'function') return;

    if (!Symbol.asyncIterator) {
        Object.defineProperty(Symbol, 'asyncIterator', {
            value: Symbol.for('Symbol.asyncIterator')
        });
    }
    if (!Symbol.asyncDispose) {
        Object.defineProperty(Symbol, 'asyncDispose', {
            value: Symbol.for('Symbol.asyncDispose')
        });
    }
})();
