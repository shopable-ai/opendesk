// automation/polyfills/002-sleep.js

(function(global) {
    // sleep function returns a promise that resolves after the specified delay
    if (typeof sleep === 'undefined') {
        global.sleep = function(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        };
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