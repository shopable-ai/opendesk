// Promise polyfill
(function() {
    // 如果已经存在 Promise，就不需要 polyfill
    if (typeof Promise !== 'undefined') {
        return;
    }

    function Promise(executor) {
        if (!(this instanceof Promise)) {
            throw new TypeError('Promise must be called with new');
        }
        if (typeof executor !== 'function') {
            throw new TypeError('Promise executor must be a function');
        }

        this._state = 'pending';
        this._value = undefined;
        this._handlers = [];

        try {
            executor(this._resolve.bind(this), this._reject.bind(this));
        } catch (err) {
            this._reject(err);
        }
    }

    Promise.prototype._resolve = function(value) {
        if (this._state !== 'pending') return;
        if (value === this) {
            this._reject(new TypeError('Promise cannot resolve to itself'));
            return;
        }
        if (value && typeof value.then === 'function') {
            value.then(this._resolve.bind(this), this._reject.bind(this));
            return;
        }
        this._state = 'fulfilled';
        this._value = value;
        this._handlers.forEach(this._handle.bind(this));
        this._handlers = [];
    };

    Promise.prototype._reject = function(reason) {
        if (this._state !== 'pending') return;
        this._state = 'rejected';
        this._value = reason;
        this._handlers.forEach(this._handle.bind(this));
        this._handlers = [];
    };

    Promise.prototype._handle = function(handler) {
        if (this._state === 'pending') {
            this._handlers.push(handler);
            return;
        }

        setTimeout(() => {
            const cb = this._state === 'fulfilled' ? handler.onFulfilled : handler.onRejected;
            if (typeof cb !== 'function') {
                if (this._state === 'fulfilled') {
                    handler.resolve(this._value);
                } else {
                    handler.reject(this._value);
                }
                return;
            }
            try {
                const result = cb(this._value);
                handler.resolve(result);
            } catch (err) {
                handler.reject(err);
            }
        }, 0);
    };

    Promise.prototype.then = function(onFulfilled, onRejected) {
        return new Promise((resolve, reject) => {
            this._handle({
                onFulfilled,
                onRejected,
                resolve,
                reject
            });
        });
    };

    Promise.prototype.catch = function(onRejected) {
        return this.then(null, onRejected);
    };

    Promise.resolve = function(value) {
        return new Promise(resolve => resolve(value));
    };

    Promise.reject = function(reason) {
        return new Promise((resolve, reject) => reject(reason));
    };

    Promise.all = function(promises) {
        return new Promise((resolve, reject) => {
            if (!Array.isArray(promises)) {
                reject(new TypeError('Promise.all must be called with an array'));
                return;
            }

            const results = new Array(promises.length);
            let completed = 0;

            if (promises.length === 0) {
                resolve(results);
                return;
            }

            promises.forEach((promise, index) => {
                Promise.resolve(promise).then(
                    value => {
                        results[index] = value;
                        completed++;
                        if (completed === promises.length) {
                            resolve(results);
                        }
                    },
                    reject
                );
            });
        });
    };

    Promise.race = function(promises) {
        return new Promise((resolve, reject) => {
            if (!Array.isArray(promises)) {
                reject(new TypeError('Promise.race must be called with an array'));
                return;
            }

            promises.forEach(promise => {
                Promise.resolve(promise).then(resolve, reject);
            });
        });
    };

    // 全局注册 Promise
    globalThis.Promise = Promise;
})();