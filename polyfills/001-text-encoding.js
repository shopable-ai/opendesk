(function installTextEncoding(global) {
    'use strict';

    function utf8BytesForCodePoint(codePoint) {
        if (codePoint <= 0x7f) return [codePoint];
        if (codePoint <= 0x7ff) {
            return [
                0xc0 | (codePoint >> 6),
                0x80 | (codePoint & 0x3f)
            ];
        }
        if (codePoint <= 0xffff) {
            return [
                0xe0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            ];
        }
        return [
            0xf0 | (codePoint >> 18),
            0x80 | ((codePoint >> 12) & 0x3f),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f)
        ];
    }

    function nextScalarValue(source, index) {
        var first = source.charCodeAt(index);
        if (first >= 0xd800 && first <= 0xdbff) {
            if (index + 1 < source.length) {
                var second = source.charCodeAt(index + 1);
                if (second >= 0xdc00 && second <= 0xdfff) {
                    return {
                        codePoint: 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00),
                        read: 2
                    };
                }
            }
            return { codePoint: 0xfffd, read: 1 };
        }
        if (first >= 0xdc00 && first <= 0xdfff) {
            return { codePoint: 0xfffd, read: 1 };
        }
        return { codePoint: first, read: 1 };
    }

    if (typeof global.TextEncoder !== 'function') {
        function TextEncoder() {}

        Object.defineProperty(TextEncoder.prototype, 'encoding', {
            configurable: true,
            enumerable: true,
            get: function () { return 'utf-8'; }
        });

        TextEncoder.prototype.encode = function encode(input) {
            var source = input === undefined ? '' : String(input);
            var bytes = [];
            var index = 0;
            while (index < source.length) {
                var scalar = nextScalarValue(source, index);
                var encoded = utf8BytesForCodePoint(scalar.codePoint);
                for (var byteIndex = 0; byteIndex < encoded.length; byteIndex += 1) {
                    bytes.push(encoded[byteIndex]);
                }
                index += scalar.read;
            }
            return new Uint8Array(bytes);
        };

        TextEncoder.prototype.encodeInto = function encodeInto(input, destination) {
            if (!(destination instanceof Uint8Array)) {
                throw new TypeError('TextEncoder.encodeInto destination must be a Uint8Array');
            }
            var source = String(input);
            var read = 0;
            var written = 0;
            while (read < source.length) {
                var scalar = nextScalarValue(source, read);
                var encoded = utf8BytesForCodePoint(scalar.codePoint);
                if (written + encoded.length > destination.length) break;
                for (var byteIndex = 0; byteIndex < encoded.length; byteIndex += 1) {
                    destination[written + byteIndex] = encoded[byteIndex];
                }
                read += scalar.read;
                written += encoded.length;
            }
            return { read: read, written: written };
        };

        Object.defineProperty(global, 'TextEncoder', {
            configurable: true,
            writable: true,
            value: TextEncoder
        });
    }

    function normalizeEncodingLabel(label) {
        var normalized = String(label === undefined ? 'utf-8' : label).trim().toLowerCase();
        if (normalized === 'utf-8' || normalized === 'utf8' || normalized === 'unicode-1-1-utf-8') {
            return 'utf-8';
        }
        throw new RangeError('TextDecoder only supports UTF-8');
    }

    function inputBytes(input) {
        if (input === undefined) return new Uint8Array(0);
        if (input instanceof Uint8Array) {
            return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        }
        if (typeof ArrayBuffer === 'function' && input instanceof ArrayBuffer) {
            return new Uint8Array(input);
        }
        if (typeof ArrayBuffer === 'function' && typeof ArrayBuffer.isView === 'function' && ArrayBuffer.isView(input)) {
            return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        }
        throw new TypeError('TextDecoder input must be an ArrayBuffer or ArrayBuffer view');
    }

    function appendCodePoint(parts, codePoint) {
        if (codePoint <= 0xffff) {
            parts.push(String.fromCharCode(codePoint));
            return;
        }
        var adjusted = codePoint - 0x10000;
        parts.push(String.fromCharCode(
            0xd800 + (adjusted >> 10),
            0xdc00 + (adjusted & 0x3ff)
        ));
    }

    if (typeof global.TextDecoder !== 'function') {
        function TextDecoder(label, options) {
            var settings = options === undefined ? {} : Object(options);
            this._encoding = normalizeEncodingLabel(label);
            this._fatal = Boolean(settings.fatal);
            this._ignoreBOM = Boolean(settings.ignoreBOM);
            this._pending = [];
            this._bomSeen = false;
        }

        Object.defineProperties(TextDecoder.prototype, {
            encoding: {
                configurable: true,
                enumerable: true,
                get: function () { return this._encoding; }
            },
            fatal: {
                configurable: true,
                enumerable: true,
                get: function () { return this._fatal; }
            },
            ignoreBOM: {
                configurable: true,
                enumerable: true,
                get: function () { return this._ignoreBOM; }
            }
        });

        TextDecoder.prototype.decode = function decode(input, options) {
            var settings = options === undefined ? {} : Object(options);
            var streaming = Boolean(settings.stream);
            var incoming = inputBytes(input);
            var bytes = this._pending.slice();
            for (var incomingIndex = 0; incomingIndex < incoming.length; incomingIndex += 1) {
                bytes.push(incoming[incomingIndex]);
            }
            this._pending = [];

            var parts = [];
            var index = 0;
            var invalid = function () {
                if (this._fatal) throw new TypeError('TextDecoder encountered invalid UTF-8');
                appendCodePoint(parts, 0xfffd);
            }.bind(this);

            try {
                while (index < bytes.length) {
                    var first = bytes[index];
                    if (first <= 0x7f) {
                        appendCodePoint(parts, first);
                        index += 1;
                        continue;
                    }

                    var length = 0;
                    var codePoint = 0;
                    var minimum = 0;
                    if (first >= 0xc2 && first <= 0xdf) {
                        length = 2;
                        codePoint = first & 0x1f;
                        minimum = 0x80;
                    } else if (first >= 0xe0 && first <= 0xef) {
                        length = 3;
                        codePoint = first & 0x0f;
                        minimum = 0x800;
                    } else if (first >= 0xf0 && first <= 0xf4) {
                        length = 4;
                        codePoint = first & 0x07;
                        minimum = 0x10000;
                    } else {
                        invalid();
                        index += 1;
                        continue;
                    }

                    if (index + length > bytes.length) {
                        var validPrefix = true;
                        for (var prefixIndex = index + 1; prefixIndex < bytes.length; prefixIndex += 1) {
                            if ((bytes[prefixIndex] & 0xc0) !== 0x80) {
                                validPrefix = false;
                                break;
                            }
                        }
                        if (streaming && validPrefix) {
                            this._pending = bytes.slice(index);
                            break;
                        }
                        invalid();
                        index += 1;
                        continue;
                    }

                    var valid = true;
                    for (var offset = 1; offset < length; offset += 1) {
                        var continuation = bytes[index + offset];
                        if ((continuation & 0xc0) !== 0x80) {
                            valid = false;
                            break;
                        }
                        codePoint = (codePoint << 6) | (continuation & 0x3f);
                    }
                    if (!valid || codePoint < minimum || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
                        invalid();
                        index += 1;
                        continue;
                    }

                    appendCodePoint(parts, codePoint);
                    index += length;
                }
            } catch (error) {
                if (!streaming) {
                    this._pending = [];
                    this._bomSeen = false;
                }
                throw error;
            }

            var result = parts.join('');
            if (!this._bomSeen && result.length > 0) {
                this._bomSeen = true;
                if (!this._ignoreBOM && result.charCodeAt(0) === 0xfeff) {
                    result = result.slice(1);
                }
            }
            if (!streaming) {
                if (this._pending.length > 0) {
                    if (this._fatal) {
                        this._pending = [];
                        this._bomSeen = false;
                        throw new TypeError('TextDecoder encountered invalid UTF-8');
                    }
                    result += '\ufffd';
                }
                this._pending = [];
                this._bomSeen = false;
            }
            return result;
        };

        Object.defineProperty(global, 'TextDecoder', {
            configurable: true,
            writable: true,
            value: TextDecoder
        });
    }
})(globalThis);
