class URLSearchParamsPolyfill {
    constructor(init, onChange) {
        this.params = new Map();

        if (typeof init === 'string') {
            init = init.replace(/^\?/, '');
            if (init !== '') {
                const pairs = init.split('&');
                for (const pair of pairs) {
                    if (pair !== '') {
                        const separator = pair.indexOf('=');
                        const rawKey = separator < 0 ? pair : pair.slice(0, separator);
                        const rawValue = separator < 0 ? '' : pair.slice(separator + 1);
                        this.append(decodeFormComponent(rawKey), decodeFormComponent(rawValue));
                    }
                }
            }
        } else if (Array.isArray(init)) {
            init.forEach(pair => {
                if (!Array.isArray(pair) || pair.length < 2) {
                    throw new TypeError('URLSearchParams sequence members must contain two values');
                }
                this.append(pair[0], pair[1]);
            });
        } else if (init && typeof init.entries === 'function') {
            init.entries().forEach(pair => this.append(pair[0], pair[1]));
        } else if (init && typeof init === 'object') {
            Object.keys(init).forEach(key => {
                this.append(key, init[key]);
            });
        }
        this._onChange = typeof onChange === 'function' ? onChange : null;
    }

    _changed() {
        if (this._onChange) this._onChange();
    }

    append(name, value) {
        const key = String(name);
        const values = this.params.get(key) || [];
        values.push(String(value));
        this.params.set(key, values);
        this._changed();
    }

    delete(name) {
        this.params.delete(String(name));
        this._changed();
    }

    get(name) {
        const values = this.params.get(String(name));
        return values ? values[0] : null;
    }

    getAll(name) {
        return (this.params.get(String(name)) || []).slice();
    }

    has(name) {
        return this.params.has(String(name));
    }

    set(name, value) {
        this.params.set(String(name), [String(value)]);
        this._changed();
    }

    toString() {
        const pairs = [];
        this.params.forEach((values, name) => {
            values.forEach(value => {
                pairs.push(
                    encodeFormComponent(name) + '=' + encodeFormComponent(value)
                );
            });
        });
        return pairs.join('&');
    }

    entries() {
        const entries = [];
        this.params.forEach((values, name) => {
            values.forEach(value => {
                entries.push([name, value]);
            });
        });
        return entries;
    }

    keys() {
        return Array.from(this.params.keys());
    }

    values() {
        const values = [];
        this.params.forEach(paramValues => {
            values.push(...paramValues);
        });
        return values;
    }
}

function decodeFormComponent(value) {
    try {
        return decodeURIComponent(String(value).replace(/\+/g, ' '));
    } catch (_) {
        return String(value);
    }
}

function encodeFormComponent(value) {
    return encodeURIComponent(String(value))
        .replace(/%20/g, '+')
        .replace(/[!'()~]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
}

// 全局注册
globalThis.URLSearchParams = URLSearchParamsPolyfill;
