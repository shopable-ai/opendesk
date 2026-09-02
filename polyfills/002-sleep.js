// automation/polyfills/002-sleep.js

(function(global) {
    // sleep is the original Promise-based wrapper around the existing timer API.
    if (typeof global.sleep !== 'function') {
        global.sleep = function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        };
    }

    // delay is the clearer modern spelling; keep sleep for compatibility.
    if (typeof global.delay !== 'function') {
        global.delay = global.sleep;
    }

    // Convenience method for sleeping in seconds
    if (typeof global.sleepSeconds !== 'function') {
        global.sleepSeconds = function(seconds) {
            return global.sleep(seconds * 1000);
        };
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Test the sleep functionality
console.log('Sleep utility functions loaded successfully');
