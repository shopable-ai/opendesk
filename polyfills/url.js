// Small URL compatibility surface for the OpenDesk Runtime.
// It intentionally focuses on HTTP(S), file URLs, and relative resolution;
// this is not a browser DOM implementation.
(function(global) {
    if (typeof global.URL === 'function') return;

    function decodePart(value) {
        try {
            return decodeURIComponent(value);
        } catch (_) {
            return value;
        }
    }

    function splitReference(value) {
        let rest = value;
        let hash = '';
        let search = '';
        const hashIndex = rest.indexOf('#');
        if (hashIndex >= 0) {
            hash = rest.slice(hashIndex);
            rest = rest.slice(0, hashIndex);
        }
        const searchIndex = rest.indexOf('?');
        const hasSearch = searchIndex >= 0;
        if (hasSearch) {
            search = rest.slice(searchIndex);
            rest = rest.slice(0, searchIndex);
        }
        return { path: rest, search, hash, hasSearch };
    }

    function removeDotSegments(path) {
        const leadingSlash = path.charAt(0) === '/';
        const trailingSlash = path.length > 0 && path.charAt(path.length - 1) === '/';
        const output = [];
        path.split('/').forEach(segment => {
            if (segment === '' || segment === '.') return;
            if (segment === '..') {
                if (output.length > 0 && output[output.length - 1] !== '..') output.pop();
                else if (!leadingSlash) output.push('..');
                return;
            }
            output.push(segment);
        });
        let result = (leadingSlash ? '/' : '') + output.join('/');
        if (result === '' && leadingSlash) result = '/';
        if (trailingSlash && result !== '/' && result !== '') result += '/';
        return result;
    }

    function parseAuthority(authority) {
        let credentials = '';
        let hostPort = authority;
        const at = authority.lastIndexOf('@');
        if (at >= 0) {
            credentials = authority.slice(0, at);
            hostPort = authority.slice(at + 1);
        }

        let username = '';
        let password = '';
        if (credentials !== '') {
            const colon = credentials.indexOf(':');
            username = decodePart(colon < 0 ? credentials : credentials.slice(0, colon));
            password = colon < 0 ? '' : decodePart(credentials.slice(colon + 1));
        }

        let hostname = hostPort;
        let port = '';
        if (hostPort.charAt(0) === '[') {
            const closing = hostPort.indexOf(']');
            if (closing < 0) throw new TypeError('Invalid URL');
            hostname = hostPort.slice(1, closing);
            if (hostPort.charAt(closing + 1) === ':') port = hostPort.slice(closing + 2);
        } else {
            const colon = hostPort.lastIndexOf(':');
            if (colon >= 0 && hostPort.indexOf(':') === colon) {
                hostname = hostPort.slice(0, colon);
                port = hostPort.slice(colon + 1);
            }
        }
        if (port !== '' && !/^\d+$/.test(port)) throw new TypeError('Invalid URL');
        hostname = hostname.toLowerCase();
        return { username, password, hostname, port };
    }

    function parseAbsolute(value) {
        const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/.exec(value);
        if (!scheme) throw new TypeError('Invalid URL');
        const protocol = scheme[1].toLowerCase() + ':';
        const rest = scheme[2];
        if (rest.slice(0, 2) !== '//') {
            throw new TypeError('Only hierarchical URLs are supported');
        }

        const authorityOffset = rest.slice(2).search(/[/?#]/);
        const authorityEnd = authorityOffset < 0 ? -1 : authorityOffset + 2;
        const authority = authorityEnd < 0 ? rest.slice(2) : rest.slice(2, authorityEnd);
        const reference = splitReference(authorityEnd < 0 ? '' : rest.slice(authorityEnd));
        const parsedAuthority = parseAuthority(authority);
        let pathname = reference.path || '/';
        if (protocol === 'file:' && reference.path === '') pathname = '/';
        if (protocol === 'http:' || protocol === 'https:') pathname = removeDotSegments(pathname);
        return {
            protocol,
            username: parsedAuthority.username,
            password: parsedAuthority.password,
            hostname: parsedAuthority.hostname,
            port: parsedAuthority.port,
            pathname,
            search: reference.search,
            hash: reference.hash,
        };
    }

    function authorityFromParts(parts) {
        let credentials = '';
        if (parts.username !== '' || parts.password !== '') {
            credentials = encodeURIComponent(parts.username);
            if (parts.password !== '') credentials += ':' + encodeURIComponent(parts.password);
            credentials += '@';
        }
        let hostname = parts.hostname;
        if (hostname.indexOf(':') >= 0 && hostname.charAt(0) !== '[') hostname = '[' + hostname + ']';
        return credentials + hostname + (parts.port === '' ? '' : ':' + parts.port);
    }

    function serialize(parts) {
        return parts.protocol + '//' + authorityFromParts(parts)
            + (parts.pathname || '/') + (parts.search || '') + (parts.hash || '');
    }

    function resolve(input, base) {
        const value = String(input).trim();
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return parseAbsolute(value);
        if (base === undefined || base === null) throw new TypeError('Invalid URL');

        const baseValue = base && typeof base.href === 'string' ? base.href : String(base);
        const parent = parseAbsolute(baseValue.trim());
        if (value.slice(0, 2) === '//') return parseAbsolute(parent.protocol + value);

        const reference = splitReference(value);
        let pathname;
        let search;
        if (reference.path === '') {
            pathname = parent.pathname;
            search = reference.hasSearch ? reference.search : parent.search;
        } else {
            pathname = reference.path.charAt(0) === '/'
                ? reference.path
                : parent.pathname.slice(0, parent.pathname.lastIndexOf('/') + 1) + reference.path;
            pathname = removeDotSegments(pathname);
            search = reference.hasSearch ? reference.search : '';
        }
        return parseAbsolute(parent.protocol + '//' + authorityFromParts(parent)
            + pathname + search + reference.hash);
    }

    function URL(input, base) {
        if (!(this instanceof URL)) throw new TypeError('URL constructor must be called with new');
        this._set(resolve(input, base));
    }

    URL.prototype._bindSearchParams = function() {
        this._searchParams = new global.URLSearchParams(this._parts.search, () => {
            const query = this._searchParams.toString();
            this._parts.search = query === '' ? '' : '?' + query;
            this._href = serialize(this._parts);
        });
    };

    URL.prototype._set = function(parts) {
        this._parts = parts;
        this._bindSearchParams();
        this._href = serialize(parts);
    };

    URL.prototype.toString = function() { return this.href; };
    URL.prototype.toJSON = function() { return this.href; };

    Object.defineProperty(URL.prototype, 'href', {
        get: function() { return this._href; },
        set: function(value) { this._set(resolve(value)); },
        enumerable: true,
    });
    Object.defineProperty(URL.prototype, 'origin', {
        get: function() {
            if (this.protocol === 'file:') return 'null';
            return this.protocol + '//' + this.host;
        },
        enumerable: true,
    });
    ['protocol', 'username', 'password', 'hostname', 'port', 'pathname', 'search', 'hash'].forEach(name => {
        Object.defineProperty(URL.prototype, name, {
            get: function() { return this._parts[name]; },
            set: function(value) {
                const next = String(value);
                if (name === 'protocol') this._parts[name] = next.toLowerCase().replace(/:$/, '') + ':';
                else if (name === 'search') {
                    this._parts[name] = next === '' ? '' : (next.charAt(0) === '?' ? next : '?' + next);
                    this._bindSearchParams();
                }
                else if (name === 'hash') this._parts[name] = next === '' ? '' : (next.charAt(0) === '#' ? next : '#' + next);
                else this._parts[name] = next;
                this._href = serialize(this._parts);
            },
            enumerable: true,
        });
    });
    Object.defineProperty(URL.prototype, 'host', {
        get: function() { return authorityFromParts(this._parts).split('@').pop(); },
        set: function(value) {
            const parsed = parseAuthority(String(value));
            this._parts.hostname = parsed.hostname;
            this._parts.port = parsed.port;
            this._href = serialize(this._parts);
        },
        enumerable: true,
    });
    Object.defineProperty(URL.prototype, 'searchParams', {
        get: function() { return this._searchParams; },
        enumerable: true,
    });

    global.URL = URL;
})(typeof globalThis !== 'undefined' ? globalThis : this);
