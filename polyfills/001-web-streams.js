(function installWebStreams(global) {
    'use strict';

    function handledPromise(executor) {
        var promise = new Promise(executor);
        promise.catch(function () {});
        return promise;
    }

    function ReadableStreamDefaultReader(stream) {
        if (!stream || !stream._opendeskReadableState) {
            throw new TypeError('ReadableStreamDefaultReader requires a ReadableStream');
        }
        var state = stream._opendeskReadableState;
        if (state.reader) throw new TypeError('ReadableStream is already locked');
        state.reader = this;
        this._stream = stream;
        this._closed = handledPromise(function (resolve, reject) {
            state.closedResolve = resolve;
            state.closedReject = reject;
            if (state.status === 'closed') resolve(undefined);
            if (state.status === 'errored') reject(state.error);
        });
    }

    Object.defineProperty(ReadableStreamDefaultReader.prototype, 'closed', {
        configurable: true,
        enumerable: true,
        get: function () { return this._closed; }
    });

    ReadableStreamDefaultReader.prototype.read = function read() {
        if (!this._stream) return Promise.reject(new TypeError('ReadableStream reader has no lock'));
        var stream = this._stream;
        var state = stream._opendeskReadableState;
        if (state.queue.length > 0) {
            var value = state.queue.shift();
            if (state.closeRequested && state.queue.length === 0) stream._opendeskFinishClose();
            else stream._opendeskPullIfNeeded();
            return Promise.resolve({ value: value, done: false });
        }
        if (state.status === 'closed') return Promise.resolve({ value: undefined, done: true });
        if (state.status === 'errored') return Promise.reject(state.error);
        return new Promise(function (resolve, reject) {
            state.readRequests.push({ resolve: resolve, reject: reject });
            stream._opendeskPullIfNeeded();
        });
    };

    ReadableStreamDefaultReader.prototype.cancel = function cancel(reason) {
        if (!this._stream) return Promise.reject(new TypeError('ReadableStream reader has no lock'));
        return this._stream._opendeskCancel(reason);
    };

    ReadableStreamDefaultReader.prototype.releaseLock = function releaseLock() {
        if (!this._stream) return;
        var state = this._stream._opendeskReadableState;
        if (state.readRequests.length > 0) {
            throw new TypeError('Cannot release a ReadableStream reader with pending reads');
        }
        if (state.reader === this) state.reader = null;
        this._stream = null;
    };

    if (typeof global.ReadableStream !== 'function') {
        function ReadableStream(underlyingSource, strategy) {
            var stream = this;
            var source = underlyingSource === undefined ? {} : Object(underlyingSource);
            var highWaterMark = strategy && strategy.highWaterMark !== undefined
                ? Number(strategy.highWaterMark)
                : 1;
            if (!isFinite(highWaterMark) || highWaterMark < 0) {
                throw new RangeError('ReadableStream highWaterMark must be a finite non-negative number');
            }
            var state = {
                status: 'readable',
                error: undefined,
                queue: [],
                readRequests: [],
                reader: null,
                closeRequested: false,
                pulling: false,
                pullAgain: false,
                started: false,
                highWaterMark: highWaterMark,
                pull: typeof source.pull === 'function' ? source.pull : null,
                cancel: typeof source.cancel === 'function' ? source.cancel : null,
                closedResolve: null,
                closedReject: null
            };
            Object.defineProperty(this, '_opendeskReadableState', { value: state });

            var controller = {};
            Object.defineProperties(controller, {
                desiredSize: {
                    configurable: true,
                    enumerable: true,
                    get: function () {
                        if (state.status === 'errored') return null;
                        if (state.status === 'closed') return 0;
                        return state.highWaterMark - state.queue.length;
                    }
                }
            });
            controller.enqueue = function enqueue(chunk) {
                if (state.status !== 'readable' || state.closeRequested) {
                    throw new TypeError('Cannot enqueue into a closed ReadableStream');
                }
                if (state.readRequests.length > 0) {
                    state.readRequests.shift().resolve({ value: chunk, done: false });
                } else {
                    state.queue.push(chunk);
                }
                stream._opendeskPullIfNeeded();
            };
            controller.close = function close() {
                if (state.status !== 'readable' || state.closeRequested) {
                    throw new TypeError('ReadableStream is already closed');
                }
                state.closeRequested = true;
                if (state.queue.length === 0) stream._opendeskFinishClose();
            };
            controller.error = function error(reason) {
                stream._opendeskError(reason);
            };
            state.controller = controller;

            var startResult;
            try {
                startResult = typeof source.start === 'function' ? source.start(controller) : undefined;
            } catch (error) {
                this._opendeskError(error);
                return;
            }
            Promise.resolve(startResult).then(
                function () {
                    state.started = true;
                    stream._opendeskPullIfNeeded();
                },
                function (error) { stream._opendeskError(error); }
            );
        }

        ReadableStream.prototype._opendeskShouldPull = function _opendeskShouldPull() {
            var state = this._opendeskReadableState;
            if (!state.started || state.status !== 'readable' || state.closeRequested || !state.pull) return false;
            return state.readRequests.length > 0 || state.queue.length < state.highWaterMark;
        };

        ReadableStream.prototype._opendeskPullIfNeeded = function _opendeskPullIfNeeded() {
            var stream = this;
            var state = this._opendeskReadableState;
            if (!this._opendeskShouldPull()) return;
            if (state.pulling) {
                state.pullAgain = true;
                return;
            }
            state.pulling = true;
            var result;
            try {
                result = state.pull.call(undefined, state.controller);
            } catch (error) {
                state.pulling = false;
                this._opendeskError(error);
                return;
            }
            Promise.resolve(result).then(function () {
                state.pulling = false;
                if (state.pullAgain) {
                    state.pullAgain = false;
                    stream._opendeskPullIfNeeded();
                }
            }, function (error) {
                state.pulling = false;
                stream._opendeskError(error);
            });
        };

        ReadableStream.prototype._opendeskFinishClose = function _opendeskFinishClose() {
            var state = this._opendeskReadableState;
            if (state.status !== 'readable') return;
            state.status = 'closed';
            while (state.readRequests.length > 0) {
                state.readRequests.shift().resolve({ value: undefined, done: true });
            }
            if (state.closedResolve) state.closedResolve(undefined);
        };

        ReadableStream.prototype._opendeskError = function _opendeskError(reason) {
            var state = this._opendeskReadableState;
            if (state.status !== 'readable') return;
            state.status = 'errored';
            state.error = reason;
            state.queue = [];
            while (state.readRequests.length > 0) state.readRequests.shift().reject(reason);
            if (state.closedReject) state.closedReject(reason);
        };

        ReadableStream.prototype._opendeskCancel = function _opendeskCancel(reason) {
            var state = this._opendeskReadableState;
            if (state.status === 'closed') return Promise.resolve(undefined);
            if (state.status === 'errored') return Promise.reject(state.error);
            state.queue = [];
            this._opendeskFinishClose();
            if (!state.cancel) return Promise.resolve(undefined);
            try {
                return Promise.resolve(state.cancel.call(undefined, reason));
            } catch (error) {
                return Promise.reject(error);
            }
        };

        Object.defineProperty(ReadableStream.prototype, 'locked', {
            configurable: true,
            enumerable: true,
            get: function () { return Boolean(this._opendeskReadableState.reader); }
        });

        ReadableStream.prototype.getReader = function getReader() {
            return new ReadableStreamDefaultReader(this);
        };

        ReadableStream.prototype.cancel = function cancel(reason) {
            if (this.locked) return Promise.reject(new TypeError('Cannot cancel a locked ReadableStream'));
            return this._opendeskCancel(reason);
        };

        ReadableStream.prototype.values = function values(options) {
            var reader = this.getReader();
            var preventCancel = Boolean(options && options.preventCancel);
            var iterator = {
                next: function () { return reader.read(); },
                return: function (value) {
                    var completion = preventCancel ? Promise.resolve(undefined) : reader.cancel(value);
                    return completion.then(function () {
                        reader.releaseLock();
                        return { value: value, done: true };
                    });
                }
            };
            if (typeof Symbol === 'function' && Symbol.asyncIterator) {
                iterator[Symbol.asyncIterator] = function () { return iterator; };
            }
            return iterator;
        };

        if (typeof Symbol === 'function' && Symbol.asyncIterator) {
            ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;
        }

        Object.defineProperty(global, 'ReadableStream', {
            configurable: true,
            writable: true,
            value: ReadableStream
        });
    }

    function WritableStreamDefaultWriter(stream) {
        if (!stream || !stream._opendeskWritableState) {
            throw new TypeError('WritableStreamDefaultWriter requires a WritableStream');
        }
        var state = stream._opendeskWritableState;
        if (state.writer) throw new TypeError('WritableStream is already locked');
        state.writer = this;
        this._stream = stream;
    }

    Object.defineProperties(WritableStreamDefaultWriter.prototype, {
        closed: {
            configurable: true,
            enumerable: true,
            get: function () { return this._stream ? this._stream._opendeskWritableState.closed : Promise.reject(new TypeError('WritableStream writer has no lock')); }
        },
        ready: {
            configurable: true,
            enumerable: true,
            get: function () { return this._stream ? this._stream._opendeskWritableState.chain.then(function () {}) : Promise.reject(new TypeError('WritableStream writer has no lock')); }
        },
        desiredSize: {
            configurable: true,
            enumerable: true,
            get: function () {
                if (!this._stream) return null;
                return this._stream._opendeskWritableState.status === 'writable' ? 1 : null;
            }
        }
    });

    WritableStreamDefaultWriter.prototype.write = function write(chunk) {
        if (!this._stream) return Promise.reject(new TypeError('WritableStream writer has no lock'));
        return this._stream._opendeskWrite(chunk);
    };
    WritableStreamDefaultWriter.prototype.close = function close() {
        if (!this._stream) return Promise.reject(new TypeError('WritableStream writer has no lock'));
        return this._stream._opendeskClose();
    };
    WritableStreamDefaultWriter.prototype.abort = function abort(reason) {
        if (!this._stream) return Promise.reject(new TypeError('WritableStream writer has no lock'));
        return this._stream._opendeskAbort(reason);
    };
    WritableStreamDefaultWriter.prototype.releaseLock = function releaseLock() {
        if (!this._stream) return;
        var state = this._stream._opendeskWritableState;
        if (state.writer === this) state.writer = null;
        this._stream = null;
    };

    if (typeof global.WritableStream !== 'function') {
        function WritableStream(underlyingSink) {
            var stream = this;
            var sink = underlyingSink === undefined ? {} : Object(underlyingSink);
            var state = {
                status: 'writable',
                error: undefined,
                writer: null,
                write: typeof sink.write === 'function' ? sink.write : null,
                close: typeof sink.close === 'function' ? sink.close : null,
                abort: typeof sink.abort === 'function' ? sink.abort : null,
                chain: Promise.resolve(),
                closedResolve: null,
                closedReject: null
            };
            state.closed = handledPromise(function (resolve, reject) {
                state.closedResolve = resolve;
                state.closedReject = reject;
            });
            Object.defineProperty(this, '_opendeskWritableState', { value: state });
            if (typeof sink.start === 'function') {
                try {
                    state.chain = Promise.resolve(sink.start({ error: this._opendeskError.bind(this) }));
                } catch (error) {
                    this._opendeskError(error);
                }
            }
            state.chain.catch(function (error) { stream._opendeskError(error); });
        }

        WritableStream.prototype._opendeskError = function _opendeskError(reason) {
            var state = this._opendeskWritableState;
            if (state.status === 'closed' || state.status === 'errored') return;
            state.status = 'errored';
            state.error = reason;
            state.closedReject(reason);
        };

        WritableStream.prototype._opendeskWrite = function _opendeskWrite(chunk) {
            var stream = this;
            var state = this._opendeskWritableState;
            if (state.status !== 'writable') return Promise.reject(state.error || new TypeError('WritableStream is not writable'));
            state.chain = state.chain.then(function () {
                if (state.status !== 'writable') throw state.error || new TypeError('WritableStream is not writable');
                return state.write ? state.write.call(undefined, chunk, {}) : undefined;
            }).catch(function (error) {
                stream._opendeskError(error);
                throw error;
            });
            return state.chain;
        };

        WritableStream.prototype._opendeskClose = function _opendeskClose() {
            var stream = this;
            var state = this._opendeskWritableState;
            if (state.status !== 'writable') return Promise.reject(state.error || new TypeError('WritableStream is not writable'));
            state.status = 'closing';
            state.chain = state.chain.then(function () {
                return state.close ? state.close.call(undefined) : undefined;
            }).then(function () {
                state.status = 'closed';
                state.closedResolve(undefined);
            }, function (error) {
                stream._opendeskError(error);
                throw error;
            });
            return state.chain;
        };

        WritableStream.prototype._opendeskAbort = function _opendeskAbort(reason) {
            var stream = this;
            var state = this._opendeskWritableState;
            if (state.status === 'closed') return Promise.resolve(undefined);
            if (state.status === 'errored') return Promise.reject(state.error);
            state.status = 'errored';
            state.error = reason;
            state.closedReject(reason);
            try {
                return Promise.resolve(state.abort ? state.abort.call(undefined, reason) : undefined).catch(function (error) {
                    stream._opendeskError(error);
                    throw error;
                });
            } catch (error) {
                return Promise.reject(error);
            }
        };

        Object.defineProperty(WritableStream.prototype, 'locked', {
            configurable: true,
            enumerable: true,
            get: function () { return Boolean(this._opendeskWritableState.writer); }
        });
        WritableStream.prototype.getWriter = function getWriter() {
            return new WritableStreamDefaultWriter(this);
        };
        WritableStream.prototype.abort = function abort(reason) {
            if (this.locked) return Promise.reject(new TypeError('Cannot abort a locked WritableStream'));
            return this._opendeskAbort(reason);
        };
        WritableStream.prototype.close = function close() {
            if (this.locked) return Promise.reject(new TypeError('Cannot close a locked WritableStream'));
            return this._opendeskClose();
        };

        Object.defineProperty(global, 'WritableStream', {
            configurable: true,
            writable: true,
            value: WritableStream
        });
    }

    if (typeof global.TransformStream !== 'function') {
        function TransformStream(transformer) {
            var transform = transformer === undefined ? {} : Object(transformer);
            var readableController;
            var readable = new global.ReadableStream({
                start: function (controller) { readableController = controller; }
            });
            var transformController = {
                enqueue: function (chunk) { readableController.enqueue(chunk); },
                error: function (reason) { readableController.error(reason); },
                terminate: function () { readableController.close(); }
            };
            var started;
            try {
                started = typeof transform.start === 'function' ? transform.start(transformController) : undefined;
            } catch (error) {
                readableController.error(error);
                started = Promise.reject(error);
            }
            var startPromise = Promise.resolve(started);
            startPromise.catch(function () {});
            var writable = new global.WritableStream({
                write: function (chunk) {
                    return startPromise.then(function () {
                        if (typeof transform.transform === 'function') return transform.transform(chunk, transformController);
                        transformController.enqueue(chunk);
                    });
                },
                close: function () {
                    return startPromise.then(function () {
                        return typeof transform.flush === 'function' ? transform.flush(transformController) : undefined;
                    }).then(function () { readableController.close(); });
                },
                abort: function (reason) { readableController.error(reason); }
            });
            Object.defineProperties(this, {
                readable: { enumerable: true, value: readable },
                writable: { enumerable: true, value: writable }
            });
        }

        Object.defineProperty(global, 'TransformStream', {
            configurable: true,
            writable: true,
            value: TransformStream
        });
    }
})(globalThis);
