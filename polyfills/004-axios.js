// Minimal AbortController/AbortSignal compatibility. The native http bridge
// observes this signal and cancels only Go request context state; Promise
// settlement remains on the runtime event-loop owner.
if (typeof globalThis.AbortController !== 'function') {
    function AbortSignal() {
        this.aborted = false;
        this.reason = undefined;
        this.onabort = null;
        this._abortListeners = [];
    }

    AbortSignal.prototype.addEventListener = function(type, listener) {
        if (type !== 'abort' || typeof listener !== 'function') return;
        if (this.aborted) {
            listener.call(this, { type: 'abort', target: this });
            return;
        }
        this._abortListeners.push(listener);
    };

    AbortSignal.prototype.removeEventListener = function(type, listener) {
        if (type !== 'abort') return;
        this._abortListeners = this._abortListeners.filter((candidate) => candidate !== listener);
    };

    function AbortController() {
        this.signal = new AbortSignal();
    }

    AbortController.prototype.abort = function(reason) {
        const signal = this.signal;
        if (signal.aborted) return;
        signal.aborted = true;
        signal.reason = reason;
        const event = { type: 'abort', target: signal };
        if (typeof signal.onabort === 'function') signal.onabort.call(signal, event);
        const listeners = signal._abortListeners.slice();
        signal._abortListeners.length = 0;
        for (const listener of listeners) listener.call(signal, event);
    };

    globalThis.AbortController = AbortController;
}

// 增强版 Axios 实现
const axios = (function() {
    // 默认配置
    const defaults = {
        headers: {
            common: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            post: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            get: {
                'Content-Type': 'application/json'
            },
            put: {
                'Content-Type': 'application/json'
            },
            delete: {
                'Content-Type': 'application/json'
            },
            patch: {
                'Content-Type': 'application/json'
            }
        },
        timeout: 30000, // 默认30秒超时
        responseType: 'json',
        validateStatus: function(status) {
            return status >= 200 && status < 300; // 默认验证状态码
        }
    };

    // 工具函数
    const utils = {
        // 深度合并对象
        deepMerge(...objects) {
            const result = {};
            objects.forEach(obj => {
                if (obj) {
                    Object.keys(obj).forEach(key => {
                        const value = obj[key];
                        if (this.isPlainObject(value)) {
                            result[key] = this.deepMerge(result[key] || {}, value);
                        } else {
                            result[key] = value;
                        }
                    });
                }
            });
            return result;
        },

        // 处理URL参数
        buildURL(url, params) {
            if (!params) return url;

            const parts = [];
            Object.keys(params).forEach(key => {
                const value = params[key];
                if (value !== null && typeof value !== 'undefined') {
                    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
                }
            });

            if (parts.length > 0) {
                const separator = url.indexOf('?') === -1 ? '?' : '&';
                return `${url}${separator}${parts.join('&')}`;
            }

            return url;
        },

        // 数据类型检测
        isFormData(val) {
            return val && val.constructor && val.constructor.name === 'FormData';
        },

        isURLSearchParams(val) {
            return val && val.constructor && val.constructor.name === 'URLSearchParams';
        },

        isObject(val) {
            return val !== null && typeof val === 'object';
        },

        isPlainObject(val) {
            if (val === null || typeof val !== 'object' || Array.isArray(val)) return false;
            const prototype = Object.getPrototypeOf(val);
            return prototype === Object.prototype || prototype === null;
        },

        isString(val) {
            return typeof val === 'string';
        }
    };

    // 请求拦截器
    const interceptors = {
        request: [],
        response: []
    };

    // 修改后的请求函数
    async function request(config) {
        // 合并默认配置
        config = utils.deepMerge(defaults, config);

        try {
            // 处理请求拦截器
            for (const interceptor of interceptors.request) {
                try {
                    config = await interceptor(config);
                } catch (err) {
                    console.error('Request interceptor error:', err);
                    throw err;
                }
            }

            // 发送请求
            let response;
            try {
                response = await http.request(config);
            } catch (err) {
                console.error('HTTP request error:', err);
                throw err;
            }

            // 处理响应拦截器
            for (const interceptor of interceptors.response) {
                try {
                    response = await interceptor(response);
                } catch (err) {
                    console.error('Response interceptor error:', err);
                    throw err;
                }
            }

            // 验证状态码
            if (!config.validateStatus(response.status)) {
                throw new Error(`Request failed with status code ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error('Request processing error:', error);
            throw error;
        }
    }

    // 创建实例
    const instance = {
        defaults,
        interceptors: {
            request: {
                use: (fulfilled) => interceptors.request.push(fulfilled)
            },
            response: {
                use: (fulfilled) => interceptors.response.push(fulfilled)
            }
        },

        request,

        get(url, config = {}) {
            return this.request({
                ...config,
                method: 'GET',
                url
            });
        },

        post(url, data, config = {}) {
            return this.request({
                ...config,
                method: 'POST',
                url,
                data
            });
        },

        put(url, data, config = {}) {
            return this.request({
                ...config,
                method: 'PUT',
                url,
                data
            });
        },

        delete(url, config = {}) {
            return this.request({
                ...config,
                method: 'DELETE',
                url
            });
        },

        patch(url, data, config = {}) {
            return this.request({
                ...config,
                method: 'PATCH',
                url,
                data
            });
        }
    };

    return instance;
})();

// 导出到全局作用域
globalThis.axios = axios;
