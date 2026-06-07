console.log('Polyfilling page functions, original page object exists:', !!globalThis.page____Inject);

// Create a new wrapper object to hold all methods
const pageWrapper = {};

// First copy all existing methods from the original object
for (const key in globalThis.page____Inject) {
    if (typeof globalThis.page____Inject[key] === 'function') {
        // console.log('Copying original method: page.' + key);
        pageWrapper[key] = function(...args) {
            return globalThis.page____Inject[key](...args);
        };
    } else {
        // console.log('Copying original property: page.' + key);
        pageWrapper[key] = globalThis.page____Inject[key];
    }
}

/**
 * Take a screenshot of the page
 * @param {object} options - Options for the screenshot
 * @returns {Promise<string>} - A Promise that resolves to base64 encoded image data
 */
pageWrapper.screenshot = async function(options = {}) {
  // console.log('Taking screenshot with options:', options);
  return await globalThis.page____Inject.screenshot(options);
};

/**
 * Permission facade: provide cross-platform JS API while keeping native Go APIs platform-specific.
 */
const DEFAULT_PERMISSION_CAPABILITIES = ['screenCapture', 'accessibility'];

function getOsName() {
  const os = String((globalThis.System && System.getSystemInfo && System.getSystemInfo().os) || '');
  return os;
}

function isMacOS() {
  const os = getOsName().toLowerCase();
  return os.includes('darwin') || os.includes('mac');
}

function normalizeCapabilities(raw) {
  if (Array.isArray(raw)) {
    const list = raw.map((item) => String(item || '').trim()).filter(Boolean);
    return list.length ? Array.from(new Set(list)) : [...DEFAULT_PERMISSION_CAPABILITIES];
  }
  if (typeof raw === 'string' && raw.trim()) {
    return [raw.trim()];
  }
  return [...DEFAULT_PERMISSION_CAPABILITIES];
}

function sectionToCapabilities(section) {
  const sec = String(section || '').trim();
  if (!sec || sec === 'all') return ['screenCapture', 'accessibility', 'inputMonitoring', 'automation'];
  if (sec === 'baseline' || sec === 'browserBaseline' || sec === 'browser') return ['screenCapture', 'accessibility', 'automation'];
  if (sec === 'screenCapture' || sec === 'screen') return ['screenCapture', 'accessibility'];
  if (sec === 'accessibility') return ['accessibility'];
  if (sec === 'inputMonitoring') return ['inputMonitoring'];
  if (sec === 'automation') return ['automation'];
  return [...DEFAULT_PERMISSION_CAPABILITIES];
}

function capabilitiesToMacSection(capabilities) {
  const caps = normalizeCapabilities(capabilities);
  const has = (name) => caps.includes(name);
  if (has('automation') && (has('screenCapture') || has('accessibility') || has('inputMonitoring'))) return 'all';
  if (has('automation')) return 'automation';
  if (has('inputMonitoring')) return 'inputMonitoring';
  if (has('screenCapture')) return 'screenCapture';
  if (has('accessibility')) return 'accessibility';
  return 'screenCapture';
}

function buildPermissionSnapshot(capabilities, macCheckReport, flowReport) {
  const caps = normalizeCapabilities(capabilities);
  const result = {};
  const check = macCheckReport || {};
  const flow = flowReport || {};
  const automationProbe = flow.probes && flow.probes.automationProbe ? flow.probes.automationProbe : null;

  for (const cap of caps) {
    if (cap === 'screenCapture') {
      const granted = !!check.screenCapture;
      result[cap] = { state: granted ? 'granted' : 'denied', granted };
      continue;
    }
    if (cap === 'accessibility') {
      const granted = !!check.accessibility;
      result[cap] = { state: granted ? 'granted' : 'denied', granted };
      continue;
    }
    if (cap === 'automation') {
      if (automationProbe && automationProbe.ok === true) {
        result[cap] = { state: 'granted', granted: true };
      } else if (automationProbe && automationProbe.skipped) {
        result[cap] = { state: 'unknown', granted: false, reason: automationProbe.reason || 'automation probe skipped' };
      } else if (automationProbe) {
        result[cap] = { state: 'denied', granted: false };
      } else {
        result[cap] = {
          state: 'unknown',
          granted: false,
          reason: 'automation permission can only be confirmed after AppleEvents prompt',
        };
      }
      continue;
    }
    if (cap === 'inputMonitoring') {
      result[cap] = {
        state: 'unknown',
        granted: false,
        reason: 'inputMonitoring status check is not available in current runtime',
      };
      continue;
    }
    result[cap] = { state: 'unsupported', granted: false, reason: 'unsupported capability' };
  }

  const ok = Object.values(result).every((item) => item.state === 'granted' || item.state === 'unsupported');
  return { ok, capabilities: result };
}

function buildUnsupportedPermissionSnapshot(capabilities, reason) {
  const caps = normalizeCapabilities(capabilities);
  const result = {};
  for (const cap of caps) {
    result[cap] = { state: 'unsupported', granted: false, reason: reason || 'unsupported on current OS' };
  }
  return finalizePermissionSnapshot({ ok: true, capabilities: result });
}

function capabilityNeedsHardGrant(name) {
  return name !== 'inputMonitoring';
}

function isCapabilitySatisfied(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.state === 'granted' || entry.state === 'unsupported') return true;
  if (entry.state === 'unknown' && entry.capabilityOptional === true) return true;
  return false;
}

function finalizePermissionSnapshot(snapshot) {
  const map = snapshot && snapshot.capabilities ? snapshot.capabilities : {};
  const normalized = {};
  for (const [name, rawEntry] of Object.entries(map)) {
    const entry = rawEntry && typeof rawEntry === 'object' ? { ...rawEntry } : { state: 'denied', granted: false };
    if (entry.state === 'unknown' && !capabilityNeedsHardGrant(name)) {
      entry.capabilityOptional = true;
      entry.granted = true;
      if (!entry.reason) entry.reason = 'capability status is not introspectable in current runtime but is not required for baseline automation';
    }
    normalized[name] = entry;
  }
  const ok = Object.values(normalized).every((entry) => isCapabilitySatisfied(entry));
  return { ...(snapshot || {}), ok, capabilities: normalized };
}

/**
 * Cross-platform permission preflight.
 * @param {object} options
 * @param {string[]} options.capabilities
 * @returns {Promise<object>}
 */
pageWrapper.checkPermissions = async function(options = {}) {
  const cfg = options || {};
  const hasCapabilities = Object.prototype.hasOwnProperty.call(cfg, 'capabilities');
  const capabilities = normalizeCapabilities(hasCapabilities ? cfg.capabilities : sectionToCapabilities(cfg.section));
  const os = getOsName();
  const isMac = isMacOS();

  if (!isMac) {
    return {
      ok: true,
      os,
      skipped: true,
      capabilities,
      permissions: buildUnsupportedPermissionSnapshot(capabilities, 'permission preflight is handled by OS defaults'),
      message: 'No platform-specific permission preflight is required on current OS.',
    };
  }

  const canCheck = typeof globalThis.page____Inject.checkScreenshotPermissions === 'function';
  if (!canCheck) {
    return { ok: false, os, capabilities, reason: 'missing_check_api' };
  }

  const check = await globalThis.page____Inject.checkScreenshotPermissions();
  const permissions = finalizePermissionSnapshot(buildPermissionSnapshot(capabilities, check, null));
  return {
    ok: permissions.ok,
    os,
    capabilities,
    permissions,
    raw: check,
  };
};

/**
 * Cross-platform permission request entry.
 * @param {object} options
 * @param {string[]} options.capabilities
 * @param {boolean} options.openSettings
 * @param {boolean} options.strict
 * @returns {Promise<object>}
 */
pageWrapper.requestPermissions = async function(options = {}) {
  const defaults = {
    openSettings: true,
    strict: false,
    section: 'screenCapture',
  };
  const cfg = { ...defaults, ...(options || {}) };
  const hasCapabilities = Object.prototype.hasOwnProperty.call(cfg, 'capabilities');
  const capabilities = normalizeCapabilities(hasCapabilities ? cfg.capabilities : sectionToCapabilities(cfg.section));
  const os = getOsName();

  if (!isMacOS()) {
    return {
      ok: true,
      os,
      skipped: true,
      capabilities,
      permissions: buildUnsupportedPermissionSnapshot(capabilities, 'permission request is not required on current OS'),
      message: 'No platform-specific permission request is required on current OS.',
    };
  }

  const canRequest = typeof globalThis.page____Inject.requestMacPermissions === 'function';
  const canOpenSettings = typeof globalThis.page____Inject.openMacOSPrivacySettings === 'function';
  const canCheck = typeof globalThis.page____Inject.checkScreenshotPermissions === 'function';

  if (!canRequest && !canCheck) {
    if (cfg.strict) {
      throw new Error('Permission APIs not found. Please update binary.');
    }
    return { ok: false, os, capabilities, reason: 'missing_permission_api' };
  }

  const section = capabilitiesToMacSection(capabilities);
  let flow = null;
  if (canRequest) {
    flow = await globalThis.page____Inject.requestMacPermissions({
      openSettings: !!cfg.openSettings,
      section,
    });
  } else {
    if (cfg.openSettings && canOpenSettings) {
      await globalThis.page____Inject.openMacOSPrivacySettings(section);
    }
    const check = canCheck ? await globalThis.page____Inject.checkScreenshotPermissions() : null;
    flow = { ok: !!(check && check.ok), before: check, after: check, section };
  }

  const latestCheck = canCheck ? await globalThis.page____Inject.checkScreenshotPermissions() : (flow.after || flow.before || null);
  const permissions = finalizePermissionSnapshot(buildPermissionSnapshot(capabilities, latestCheck, flow));
  const finalOK = !!(flow && flow.ok) && permissions.ok;
  const result = {
    ok: finalOK,
    os,
    capabilities,
    section,
    permissions,
    flow,
    raw: latestCheck,
  };

  if (!finalOK && cfg.strict) {
    throw new Error('Permissions are not ready. Details: ' + JSON.stringify(result));
  }

  return result;
};

/**
 * Strict permission guard.
 * @param {object} options
 * @returns {Promise<object>}
 */
pageWrapper.ensurePermissions = async function(options = {}) {
  const cfg = { strict: true, ...(options || {}) };
  return await pageWrapper.requestPermissions(cfg);
};

/**
 * Backward-compatible macOS-only alias.
 * @deprecated Use ensurePermissions / requestPermissions instead.
 */
pageWrapper.ensureMacPermissions = async function(options = {}) {
  const defaults = {
    openSettingsOnFail: true,
    section: 'screenCapture',
    strict: true,
  };
  const cfg = { ...defaults, ...(options || {}) };
  const capabilities = normalizeCapabilities(
    cfg.capabilities && cfg.capabilities.length ? cfg.capabilities : sectionToCapabilities(cfg.section)
  );
  return await pageWrapper.ensurePermissions({
    capabilities,
    openSettings: !!cfg.openSettingsOnFail,
    strict: !!cfg.strict,
  });
};

/**
 * Get the title of the current page
 * @returns {string} - The title of the page
 */
pageWrapper.title = function() {
  // console.log('Getting page title');
  return globalThis.page____Inject.title();
};

/**
 * Navigate to a URL
 * @param {string} url - The URL to navigate to
 * @returns {Promise<void>}
 */
pageWrapper.goto = async function(url) {
  // console.log(`Navigating to ${url}`);
  return await globalThis.page____Inject.goto(url);
};

/**
 * Get the current URL of the page
 * @returns {string} - The current URL
 */
pageWrapper.url = function() {
  // console.log('Getting current URL');
  return globalThis.page____Inject.url();
};

// Now add our enhanced methods to the wrapper
/**
 * Enhanced waitFor that mimics a subset of Puppeteer's behavior
 * Can accept:
 * - A number (milliseconds to wait)
 * - A function that returns a promise or truthy value
 */
pageWrapper.waitFor = function(timeoutOrFunction, options = {}) {
  // Default options
  const defaultOptions = {
    timeout: 30000,
    polling: 100 // Default polling interval in ms
  };
  
  // Merge options
  options = {...defaultOptions, ...options};
  
  // Case 1: If the argument is a number, it's a timeout
  if (typeof timeoutOrFunction === 'number') {
    return pageWrapper.waitForTimeout(timeoutOrFunction);
  }
  // Case 2: If the argument is a function, it's a predicate function
  else if (typeof timeoutOrFunction === 'function') {
    return pageWrapper.waitForFunction(timeoutOrFunction, options);
  }
  else {
    throw new Error('waitFor() expects a timeout or function');
  }
};

/**
 * Wait for a specific amount of time using Promise
 * @param {number} timeout - Time to wait in milliseconds
 */
pageWrapper.waitForTimeout = function(timeout) {
  // console.log(`Waiting for ${timeout} milliseconds...`);
  if (typeof timeout !== 'number') {
    throw new Error('waitForTimeout() expects a number');
  }
  
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
};

/**
 * Wait until the page navigates to a new URL
 * @param {object} options - Options for the waiting behavior
 */
pageWrapper.waitForNavigation = function(options = {}) {
  // console.log('Waiting for navigation');
  const { timeout = 30000 } = options;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const currentUrl = pageWrapper.url();
    
    function checkNavigation() {
      if (Date.now() - startTime > timeout) {
        return reject(new Error('Navigation timeout'));
      }
      
      const newUrl = pageWrapper.url();
      if (newUrl !== currentUrl) {
        return resolve();
      }
      
      setTimeout(checkNavigation, 100);
    }
    
    checkNavigation();
  });
};

/**
 * Wait for a function to return a truthy value, properly handling async functions
 * @param {Function} pageFunction - Function to evaluate (can be async)
 * @param {object} options - Options for the waiting behavior
 */
pageWrapper.waitForFunction = async function(pageFunction, options = {}, ...args) {
  // console.log('Waiting for function to evaluate to truthy');
  const { timeout = 30000, polling = 100 } = options;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    async function evaluateFunction() {
      if (Date.now() - startTime > timeout) {
        return reject(new Error('Timeout waiting for function'));
      }
      
      try {
        // 关键改动：等待函数执行结果，无论是Promise还是同步值
        const result = await Promise.resolve(pageFunction(...args));
        
        if (result) {
          return resolve(result);
        }
      } catch (error) {
        // Ignore errors in the pageFunction, just try again
        console.log('Error in function evaluation:', error.message);
      }
      
      // Use the specified polling interval
      const pollingInterval = typeof polling === 'number' ? polling : 100;
      setTimeout(evaluateFunction, pollingInterval);
    }
    
    evaluateFunction();
  });
};

/**
 * Wait for multiple promises to resolve
 * @param {Array<Promise>} promises - Array of promises to wait for
 * @param {object} options - Options for the waiting behavior
 */
pageWrapper.waitForAll = function(promises, options = {}) {
  // console.log('Waiting for all promises to resolve');
  const { timeout = 30000 } = options;
  
  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout waiting for all promises')), timeout);
  });
  
  // Race all promises against the timeout
  return Promise.race([
    Promise.all(promises),
    timeoutPromise
  ]);
};

// pageObj["mouse"] = mouseMethods
// pageObj["keyboard"] = keyboardMethods
// pageObj["touchscreen"] = touchscreenMethods
pageWrapper.mouse = globalThis.mouse;
pageWrapper.keyboard = globalThis.keyboard;
pageWrapper.touchscreen = globalThis.touchscreen;

// Expose the wrapper as the global page object
globalThis.page = pageWrapper;
// console.log('Page polyfill complete, new methods added successfully');
