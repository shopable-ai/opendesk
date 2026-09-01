// New browser automation compatibility layers for dual-stack migration.
// This file intentionally lives under polyfills/ so it loads after legacy
// page/browser/context inject objects are registered but before user scripts.
(function(global) {
  const rawBrowser = global.browser____Inject || global.browser || null;
  const rawContext = global.context____Inject || global.context || null;
  const rawPage = global.page____Inject || global.page || null;

  function hasFunction(obj, key) {
    return !!obj && typeof obj[key] === 'function';
  }

  function getMethod(obj, ...names) {
    for (const name of names) {
      if (!!obj && typeof obj[name] === 'function') return obj[name].bind(obj);
    }
    return null;
  }

  function callMethod(obj, names, ...args) {
    const fn = getMethod(obj, ...names);
    if (!fn) return undefined;
    return fn(...args);
  }

  function invokeMethod(obj, names, ...args) {
    const fn = getMethod(obj, ...(Array.isArray(names) ? names : [names]));
    if (!fn) return { found: false, value: undefined };
    return { found: true, value: fn(...args) };
  }

  function defineFacadeMethod(target, key, factory) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = factory();
    }
  }

  function normalizeWaitForTarget(target) {
    if (target == null) return null;
    if (typeof target === 'number' || typeof target === 'function') return target;
    if (typeof target === 'string') return target;
    if (typeof target === 'object') {
      if (target.selector) return String(target.selector);
      if (target.target) return String(target.target);
    }
    return String(target);
  }

  function currentPageLike(candidate) {
    return candidate || global.page || rawPage || {};
  }

  function currentContextLike(candidate) {
    return candidate || global.context || rawContext || null;
  }

  function currentBrowserLike(candidate) {
    return candidate || global.browser || rawBrowser || null;
  }

  function inheritedMethodBase(self, fallbackBase, methodName, facadeFn) {
    if (!self || self === fallbackBase) return fallbackBase;
    const proto = Object.getPrototypeOf(self);
    if (proto && proto !== Object.prototype) return proto;
    // A caller can deliberately attach a façade method to an owner object.
    // Preserve that owner rather than silently routing through the global
    // fallback; pageBase/contextBase/browserBase handle the façade object
    // itself explicitly.
    return self;
  }

  function readClosedState(obj) {
    if (!obj) return false;
    const methodResult = invokeMethod(obj, ['isClosed', 'IsClosed']);
    if (methodResult.found) return !!methodResult.value;
    if (typeof obj.isClosed === 'boolean') return obj.isClosed;
    if (typeof obj.closed === 'boolean') return obj.closed;
    return false;
  }

  // getBrowser/getContext retain the owner's identity. Native objects already
  // expose lower-case methods; this small bridge also makes the same contract
  // available to legacy objects which only implement exported Go-style names.
  function ensureLowerCaseMethod(obj, lowerName, ...nativeNames) {
    if (!obj || typeof obj[lowerName] === 'function') return obj;
    const nativeMethod = getMethod(obj, ...nativeNames);
    if (nativeMethod) obj[lowerName] = (...args) => nativeMethod(...args);
    return obj;
  }

  function exposeBrowserOwner(browser) {
    return ensureLowerCaseMethod(browser, 'close', 'Close');
  }

  function exposeContextOwner(context) {
    return ensureLowerCaseMethod(context, 'close', 'Close');
  }

  function createLocator(selector, ownerPage) {
    function locatorPage() {
      return currentPageLike(ownerPage);
    }

    return {
      selector,
      click(options = {}) {
        const page = locatorPage();
        const clickResult = invokeMethod(page, ['click', 'Click'], selector, options);
        if (clickResult.found) return clickResult.value;
        const tapResult = invokeMethod(page, ['tap', 'Tap'], selector, options);
        if (tapResult.found) return tapResult.value;
        throw new Error('locator.click is not supported by current runtime');
      },
      type(text, options = {}) {
        const page = locatorPage();
        const typeResult = invokeMethod(page, ['type', 'Type'], selector, text, options);
        if (typeResult.found) return typeResult.value;
        throw new Error('locator.type is not supported by current runtime');
      },
      press(key, options = {}) {
        const page = locatorPage();
        const pressResult = invokeMethod(page, ['press', 'Press'], selector, key, options);
        if (pressResult.found) return pressResult.value;
        throw new Error('locator.press is not supported by current runtime');
      },
      waitFor(options = {}) {
        const page = locatorPage();
        const waitForSelectorResult = invokeMethod(page, ['waitForSelector', 'WaitForSelector'], selector, options);
        if (waitForSelectorResult.found) return waitForSelectorResult.value;
        throw new Error('locator.waitFor selector routing is not supported by current runtime');
      },
      screenshot(options = {}) {
        const page = locatorPage();
        const screenshotResult = invokeMethod(page, ['screenshot', 'Screenshot'], options);
        if (screenshotResult.found) return screenshotResult.value;
        throw new Error('locator.screenshot is not supported by current runtime');
      },
      evaluate(fn, ...args) {
        const page = locatorPage();
        const evaluateResult = invokeMethod(page, ['evaluate', 'Evaluate'], fn, selector, ...args);
        if (evaluateResult.found) return evaluateResult.value;
        throw new Error('locator.evaluate is not supported by current runtime');
      }
    };
  }

  function createUnifiedPage(pageObject) {
    const fallbackBase = pageObject || rawPage || {};
    const upgraded = Object.create(fallbackBase || {});

    function pageBase(self, methodName, facadeFn) {
      const candidate = inheritedMethodBase(self, fallbackBase, methodName, facadeFn);
      return currentPageLike(candidate === upgraded ? fallbackBase : candidate);
    }

    function pageContext(self) {
      if (self && hasFunction(self, 'getContext')) {
        const candidate = self.getContext();
        if (candidate) return candidate;
      }
      return global.contextUpgraded || currentContextLike();
    }

    function routeContextContainer(self, kind, args) {
      const ctx = pageContext(self);
      if (!ctx) {
        return kind === 'cookies' ? [] : {};
      }
      const callArgs = Array.isArray(args) ? args : [];
      if (kind === 'cookies') {
        if (callArgs.length === 0) {
          const result = callMethod(ctx, ['cookies', 'Cookies']);
          return typeof result === 'undefined' ? [] : result;
        }
        if (callArgs[0] == null) {
          const result = callMethod(ctx, ['clearCookies', 'ClearCookies']);
          return typeof result === 'undefined' ? [] : result;
        }
        const cookieList = Array.isArray(callArgs[0]) ? callArgs[0] : [callArgs[0]];
        callMethod(ctx, ['setCookies', 'SetCookies'], cookieList);
        const result = callMethod(ctx, ['cookies', 'Cookies']);
        return typeof result === 'undefined' ? cookieList : result;
      }

      const getterNames = kind === 'storage' ? ['storage', 'Storage'] : ['session', 'Session'];
      const clearNames = kind === 'storage' ? ['clearStorage', 'ClearStorage'] : ['clearSession', 'ClearSession'];
      const setNames = kind === 'storage' ? ['setStorage', 'SetStorage'] : ['setSessionValue', 'SetSessionValue'];
      const getNames = kind === 'storage' ? ['getStorage', 'GetStorage'] : ['getSessionValue', 'GetSessionValue'];

      if (callArgs.length === 0) {
        const result = callMethod(ctx, getterNames);
        return typeof result === 'undefined' ? {} : result;
      }
      if (callArgs.length === 1 && callArgs[0] == null) {
        const result = callMethod(ctx, clearNames);
        return typeof result === 'undefined' ? {} : result;
      }
      if (callArgs.length === 1 && typeof callArgs[0] === 'string') {
        const direct = callMethod(ctx, getNames, callArgs[0]);
        if (typeof direct !== 'undefined') return direct;
        const snapshot = callMethod(ctx, getterNames) || {};
        return snapshot ? snapshot[callArgs[0]] : undefined;
      }
      if (callArgs.length === 1 && typeof callArgs[0] === 'object') {
        for (const [key, value] of Object.entries(callArgs[0] || {})) {
          callMethod(ctx, setNames, key, value);
        }
        const result = callMethod(ctx, getterNames);
        return typeof result === 'undefined' ? callArgs[0] : result;
      }
      if (callArgs.length >= 2) {
        callMethod(ctx, setNames, callArgs[0], callArgs[1]);
        const direct = callMethod(ctx, getNames, callArgs[0]);
        return typeof direct === 'undefined' ? callArgs[1] : direct;
      }
      const result = callMethod(ctx, getterNames);
      return typeof result === 'undefined' ? {} : result;
    }

    defineFacadeMethod(upgraded, 'open', () => function(target, options = {}) {
      const base = pageBase(this, 'open', upgraded.open);
      if (typeof target === 'string') {
        if (options && options.appName) {
          const appResult = invokeMethod(base, ['openURLInApp', 'OpenURLInApp'], options.appName, target);
          if (appResult.found) return appResult.value;
        }
        const openResult = invokeMethod(base, ['openURL', 'OpenURL'], target);
        if (openResult.found) return openResult.value;
        const gotoResult = invokeMethod(base, ['goto', 'Goto'], target);
        if (gotoResult.found) return gotoResult.value;
      }
      if (options && typeof options.url === 'string') {
        if (options.appName) {
          const appResult = invokeMethod(base, ['openURLInApp', 'OpenURLInApp'], options.appName, options.url);
          if (appResult.found) return appResult.value;
        }
        const openResult = invokeMethod(base, ['openURL', 'OpenURL'], options.url);
        if (openResult.found) return openResult.value;
        const gotoResult = invokeMethod(base, ['goto', 'Goto'], options.url);
        if (gotoResult.found) return gotoResult.value;
      }
      throw new Error('page.open requires a URL string');
    });

    defineFacadeMethod(upgraded, 'getBrowser', () => function() {
      const base = pageBase(this, 'getBrowser', upgraded.getBrowser);
      const ownedBrowser = callMethod(base, ['browser', 'Browser']);
      if (typeof ownedBrowser !== 'undefined' && ownedBrowser !== null) {
        return exposeBrowserOwner(ownedBrowser);
      }
      return global.browserUpgraded || currentBrowserLike();
    });

    defineFacadeMethod(upgraded, 'getContext', () => function() {
      const base = pageBase(this, 'getContext', upgraded.getContext);
      const ownedContext = callMethod(base, ['context', 'Context']);
      if (typeof ownedContext !== 'undefined' && ownedContext !== null) {
        return exposeContextOwner(ownedContext);
      }
      return global.contextUpgraded || currentContextLike();
    });

    defineFacadeMethod(upgraded, 'getPage', () => function() {
      return this || upgraded;
    });

    defineFacadeMethod(upgraded, 'query', () => function(selector) {
      return createLocator(selector, this || upgraded);
    });

    defineFacadeMethod(upgraded, 'locator', () => function(selector) {
      return createLocator(selector, this || upgraded);
    });

    defineFacadeMethod(upgraded, 'waitFor', () => function(target, options = {}) {
      const base = pageBase(this, 'waitFor', upgraded.waitFor);
      const waitBase = (getMethod(base, 'waitFor', 'WaitFor', 'waitForSelector', 'WaitForSelector') || getMethod(rawPage, 'waitFor', 'WaitFor', 'waitForSelector', 'WaitForSelector')) ? base : (rawPage || base);
      const normalized = normalizeWaitForTarget(target);
      const legacyWaitFor = getMethod(waitBase, 'waitFor', 'WaitFor');
      if (typeof normalized === 'number' || typeof normalized === 'function') {
        if (!legacyWaitFor) throw new Error('page.waitFor is not available');
        return legacyWaitFor(normalized, options);
      }
      if (typeof normalized === 'string') {
        const selectorWait = getMethod(waitBase, 'waitForSelector', 'WaitForSelector');
        if (selectorWait) return selectorWait(normalized, options);
        throw new Error('page.waitFor selector routing is not supported by current runtime');
      }
      if (!legacyWaitFor) throw new Error('page.waitFor is not available');
      return legacyWaitFor(normalized, options);
    });

    defineFacadeMethod(upgraded, 'waitForSelector', () => function(selector, options = {}) {
      const base = pageBase(this, 'waitForSelector', upgraded.waitForSelector);
      const selectorWait = getMethod(base, 'waitForSelector', 'WaitForSelector');
      if (selectorWait) return selectorWait(selector, options);
      const rawSelectorWait = getMethod(rawPage, 'waitForSelector', 'WaitForSelector');
      if (rawSelectorWait) return rawSelectorWait(selector, options);
      return upgraded.waitFor.call(this, selector, options);
    });

    defineFacadeMethod(upgraded, 'click', () => function(target, options = {}) {
      const base = pageBase(this, 'click', upgraded.click);
      const clickResult = invokeMethod(base, ['click', 'Click'], target, options);
      if (clickResult.found) return clickResult.value;
      const rawClickResult = invokeMethod(rawPage, ['click', 'Click'], target, options);
      if (rawClickResult.found) return rawClickResult.value;
      if (typeof target === 'string' && hasFunction(base, 'locator')) return base.locator(target).click(options);
      throw new Error('page.click is not supported by current runtime');
    });

    defineFacadeMethod(upgraded, 'type', () => function(target, text, options = {}) {
      const base = pageBase(this, 'type', upgraded.type);
      if (typeof text === 'undefined') {
        text = target;
        target = null;
      }
      const typeResult = invokeMethod(base, ['type', 'Type'], target, text, options);
      if (typeResult.found) return typeResult.value;
      const rawTypeResult = invokeMethod(rawPage, ['type', 'Type'], target, text, options);
      if (rawTypeResult.found) return rawTypeResult.value;
      if (!target && global.keyboard && typeof global.keyboard.type === 'function') {
        return global.keyboard.type(text);
      }
      throw new Error('page.type is not supported by current runtime');
    });

    defineFacadeMethod(upgraded, 'press', () => function(target, key, options = {}) {
      const base = pageBase(this, 'press', upgraded.press);
      if (typeof key === 'undefined') {
        key = target;
        target = null;
      }
      const pressResult = invokeMethod(base, ['press', 'Press'], target, key, options);
      if (pressResult.found) return pressResult.value;
      const rawPressResult = invokeMethod(rawPage, ['press', 'Press'], target, key, options);
      if (rawPressResult.found) return rawPressResult.value;
      if (global.keyboard && typeof global.keyboard.press === 'function') {
        return global.keyboard.press(key);
      }
      throw new Error('page.press is not supported by current runtime');
    });

    defineFacadeMethod(upgraded, 'evaluate', () => function(pageFunction, ...args) {
      const base = pageBase(this, 'evaluate', upgraded.evaluate);
      const evaluateResult = invokeMethod(base, ['evaluate', 'Evaluate'], pageFunction, ...args);
      if (evaluateResult.found) return evaluateResult.value;
      const rawEvaluateResult = invokeMethod(rawPage, ['evaluate', 'Evaluate'], pageFunction, ...args);
      if (rawEvaluateResult.found) return rawEvaluateResult.value;
      if (typeof pageFunction === 'function') {
        return {
          mode: 'local-compatibility-evaluate',
          value: pageFunction(...args),
        };
      }
      throw new Error('page.evaluate is not supported by current runtime');
    });

    defineFacadeMethod(upgraded, 'cookies', () => function(...args) {
      return routeContextContainer(this, 'cookies', args);
    });

    defineFacadeMethod(upgraded, 'storage', () => function(...args) {
      return routeContextContainer(this, 'storage', args);
    });

    defineFacadeMethod(upgraded, 'session', () => function(...args) {
      return routeContextContainer(this, 'session', args);
    });

    defineFacadeMethod(upgraded, 'close', () => function() {
      const ctx = pageContext(this);
      return callMethod(ctx, ['close', 'Close']);
    });

    return upgraded;
  }

  function createUnifiedContext(contextObject) {
    const fallbackBase = contextObject || rawContext || {};
    const upgraded = Object.create(fallbackBase || {});

    function contextBase(self, methodName, facadeFn) {
      const candidate = inheritedMethodBase(self, fallbackBase, methodName, facadeFn);
      return currentContextLike(candidate === upgraded ? fallbackBase : candidate);
    }

    function contextContainer(self, kind, args) {
      const base = contextBase(self);
      const callArgs = Array.isArray(args) ? args : [];
      if (kind === 'cookies') {
        if (callArgs.length === 0) {
          const result = callMethod(base, ['cookies', 'Cookies']);
          return typeof result === 'undefined' ? [] : result;
        }
        if (callArgs[0] == null) {
          const result = callMethod(base, ['clearCookies', 'ClearCookies']);
          return typeof result === 'undefined' ? [] : result;
        }
        const cookieList = Array.isArray(callArgs[0]) ? callArgs[0] : [callArgs[0]];
        callMethod(base, ['setCookies', 'SetCookies'], cookieList);
        const result = callMethod(base, ['cookies', 'Cookies']);
        return typeof result === 'undefined' ? cookieList : result;
      }

      const getterNames = kind === 'storage' ? ['storage', 'Storage'] : ['session', 'Session'];
      const clearNames = kind === 'storage' ? ['clearStorage', 'ClearStorage'] : ['clearSession', 'ClearSession'];
      const setNames = kind === 'storage' ? ['setStorage', 'SetStorage'] : ['setSessionValue', 'SetSessionValue'];
      const getNames = kind === 'storage' ? ['getStorage', 'GetStorage'] : ['getSessionValue', 'GetSessionValue'];

      if (callArgs.length === 0) {
        const result = callMethod(base, getterNames);
        return typeof result === 'undefined' ? {} : result;
      }
      if (callArgs.length === 1 && callArgs[0] == null) {
        const result = callMethod(base, clearNames);
        return typeof result === 'undefined' ? {} : result;
      }
      if (callArgs.length === 1 && typeof callArgs[0] === 'string') {
        const direct = callMethod(base, getNames, callArgs[0]);
        if (typeof direct !== 'undefined') return direct;
        const snapshot = callMethod(base, getterNames) || {};
        return snapshot ? snapshot[callArgs[0]] : undefined;
      }
      if (callArgs.length === 1 && typeof callArgs[0] === 'object') {
        for (const [key, value] of Object.entries(callArgs[0] || {})) {
          callMethod(base, setNames, key, value);
        }
        const result = callMethod(base, getterNames);
        return typeof result === 'undefined' ? callArgs[0] : result;
      }
      if (callArgs.length >= 2) {
        callMethod(base, setNames, callArgs[0], callArgs[1]);
        const direct = callMethod(base, getNames, callArgs[0]);
        return typeof direct === 'undefined' ? callArgs[1] : direct;
      }
      const result = callMethod(base, getterNames);
      return typeof result === 'undefined' ? {} : result;
    }

    defineFacadeMethod(upgraded, 'newPage', () => function() {
      const base = contextBase(this, 'newPage', upgraded.newPage);
      const page = callMethod(base, ['newPage', 'NewPage']);
      if (typeof page === 'undefined') throw new Error('context.newPage is not supported by current runtime');
      return createUnifiedPage(page);
    });

    defineFacadeMethod(upgraded, 'isClosed', () => function() {
      const base = contextBase(this, 'isClosed', upgraded.isClosed);
      return readClosedState(base);
    });

    defineFacadeMethod(upgraded, 'getBrowser', () => function() {
      return global.browserUpgraded || currentBrowserLike();
    });

    defineFacadeMethod(upgraded, 'getPage', () => function() {
      const base = contextBase(this, 'getPage', upgraded.getPage);
      const page = callMethod(base, ['lastPage', 'LastPage']);
      if (page) {
        return createUnifiedPage(page);
      }
      return global.pageUpgraded || global.page || null;
    });

    defineFacadeMethod(upgraded, 'cookies', () => function(...args) {
      return contextContainer(this, 'cookies', args);
    });

    defineFacadeMethod(upgraded, 'storage', () => function(...args) {
      return contextContainer(this, 'storage', args);
    });

    defineFacadeMethod(upgraded, 'session', () => function(...args) {
      return contextContainer(this, 'session', args);
    });

    defineFacadeMethod(upgraded, 'close', () => function() {
      const base = contextBase(this, 'close', upgraded.close);
      return callMethod(base, ['close', 'Close']);
    });

    return upgraded;
  }

  function createUnifiedBrowser(browserObject) {
    const fallbackBase = browserObject || rawBrowser || {};
    const upgraded = Object.create(fallbackBase || {});

    function browserBase(self, methodName, facadeFn) {
      const candidate = inheritedMethodBase(self, fallbackBase, methodName, facadeFn);
      return currentBrowserLike(candidate === upgraded ? fallbackBase : candidate);
    }

    defineFacadeMethod(upgraded, 'open', () => function(options = {}) {
      const base = browserBase(this, 'open', upgraded.open);
      const context = hasFunction(base, 'defaultContext') ? base.defaultContext() : currentContextLike();
      if (options && options.url) {
        const page = global.page || rawPage;
        if (page && typeof page.open === 'function') {
          page.open(options.url, options);
        }
      }
      return context ? createUnifiedContext(context) : null;
    });

    defineFacadeMethod(upgraded, 'newContext', () => function(options = {}) {
      const base = browserBase(this, 'newContext', upgraded.newContext);
      if (readClosedState(base)) {
        throw new Error('browser is closed');
      }
      const created = callMethod(base, ['newContext', 'NewContext'], options);
      if (typeof created !== 'undefined') {
        return createUnifiedContext(created);
      }
      const existing = callMethod(base, ['defaultContext', 'DefaultContext']);
      if (typeof existing !== 'undefined' && existing !== null) {
        return createUnifiedContext(existing);
      }
      throw new Error('browser.newContext is not supported by current runtime');
    });

    defineFacadeMethod(upgraded, 'isClosed', () => function() {
      const base = browserBase(this, 'isClosed', upgraded.isClosed);
      return readClosedState(base);
    });

    defineFacadeMethod(upgraded, 'getContext', () => function() {
      const base = browserBase(this, 'getContext', upgraded.getContext);
      const ctx = callMethod(base, ['defaultContext', 'DefaultContext']);
      if (typeof ctx !== 'undefined' && ctx !== null) return createUnifiedContext(ctx);
      return currentContextLike();
    });

    defineFacadeMethod(upgraded, 'getPage', () => function() {
      const base = browserBase(this, 'getPage', upgraded.getPage);
      const page = callMethod(base, ['lastPage', 'LastPage']);
      if (page) {
        return createUnifiedPage(page);
      }
      return global.pageUpgraded || global.page || null;
    });

    defineFacadeMethod(upgraded, 'pages', () => function() {
      const base = browserBase(this, 'pages', upgraded.pages);
      const pages = callMethod(base, ['pages', 'Pages']);
      if (typeof pages !== 'undefined' && pages !== null) {
        return (pages || []).map(createUnifiedPage);
      }
      return global.pageUpgraded ? [global.pageUpgraded] : (global.page ? [global.page] : []);
    });

    defineFacadeMethod(upgraded, 'close', () => function() {
      const base = browserBase(this, 'close', upgraded.close);
      return callMethod(base, ['close', 'Close']);
    });

    return upgraded;
  }

  global.pageLegacy = global.page || rawPage || null;
  global.browserLegacy = rawBrowser || null;
  global.contextLegacy = rawContext || null;

  global.pageUpgraded = createUnifiedPage(global.pageLegacy);
  global.contextUpgraded = createUnifiedContext(global.contextLegacy);
  global.browserUpgraded = createUnifiedBrowser(global.browserLegacy);

  global.Automation = Object.assign(global.Automation || {}, {
    createLocator,
    getLegacy() {
      return {
        page: global.pageLegacy,
        browser: global.browserLegacy,
        context: global.contextLegacy,
      };
    },
    getUpgraded() {
      return {
        page: global.pageUpgraded,
        browser: global.browserUpgraded,
        context: global.contextUpgraded,
      };
    },
    getPlaywrightFacade() {
      return {
        browser: global.browserUpgraded,
        context: global.contextUpgraded,
        page: global.pageUpgraded,
      };
    }
  });

  if (!global.playwright) {
    global.playwright = {
      chromium: {
        launch(options = {}) {
          const browser = global.browserUpgraded;
          if (browser && typeof browser.open === 'function' && options && options.url) {
            browser.open({ url: options.url, appName: options.appName });
          }
          return {
            newContext(contextOptions = {}) {
              if (browser && typeof browser.newContext === 'function') {
                return browser.newContext(contextOptions);
              }
              return global.contextUpgraded;
            },
            getContext() {
              if (browser && typeof browser.getContext === 'function') {
                return browser.getContext();
              }
              return global.contextUpgraded;
            },
            getPage() {
              if (browser && typeof browser.getPage === 'function') {
                return browser.getPage();
              }
              return global.pageUpgraded;
            },
            close() {
              if (browser && typeof browser.close === 'function') {
                return browser.close();
              }
              return undefined;
            },
            isClosed() {
              if (browser && typeof browser.isClosed === 'function') {
                return browser.isClosed();
              }
              return readClosedState(browser);
            }
          };
        }
      }
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
