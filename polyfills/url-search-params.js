class URLSearchParamsPolyfill {
    constructor(init) {
        this.params = new Map();
        
        if (typeof init === 'string') {
            init = init.replace(/^\?/, '');
            const pairs = init.split('&');
            for (const pair of pairs) {
                if (pair !== '') {
                    const [key, value] = pair.split('=').map(decodeURIComponent);
                    this.append(key, value);
                }
            }
        } else if (typeof init === 'object') {
            Object.keys(init).forEach(key => {
                this.append(key, init[key]);
            });
        }
    }

    append(name, value) {
        const values = this.params.get(name) || [];
        values.push(String(value));
        this.params.set(name, values);
    }

    delete(name) {
        this.params.delete(name);
    }

    get(name) {
        const values = this.params.get(name);
        return values ? values[0] : null;
    }

    getAll(name) {
        return this.params.get(name) || [];
    }

    has(name) {
        return this.params.has(name);
    }

    set(name, value) {
        this.params.set(name, [String(value)]);
    }

    toString() {
        const pairs = [];
        this.params.forEach((values, name) => {
            values.forEach(value => {
                pairs.push(
                    encodeURIComponent(name) + '=' + encodeURIComponent(value)
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

// 全局注册
URLSearchParams = URLSearchParamsPolyfill;