// automation/polyfills/002-sleep.js

(function(global) {
    // delay is registered by the native Timer so it shares strict validation
    // and EventLoop ownership with System.delay.
    if (typeof delay !== 'function') {
        global.delay = function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        };
    }

    // sleep remains the backwards-compatible spelling for delay.
    if (typeof sleep === 'undefined') {
        global.sleep = global.delay;
    }

    // Convenience method for sleeping in seconds
    if (typeof sleepSeconds === 'undefined') {
        global.sleepSeconds = function(seconds) {
            return sleep(seconds * 1000);
        };
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Test the sleep functionality
console.log('Sleep utility functions loaded successfully');
