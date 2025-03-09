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