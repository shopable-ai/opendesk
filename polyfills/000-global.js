// Clipboard Polyfill
(function(global) {
    // Global method to copy text to clipboard
    global.copyToClipboard = function(text) {
        if (typeof text !== 'string') {
            throw new Error('copyToClipboard requires a string argument');
        }
        
        try {
            // Use the clipboard methods from the automation package
            clipboard.copy(text);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            throw error;
        }
    };

    // Global method to get clipboard contents
    global.getClipboard = function() {
        try {
            // Use the clipboard methods from the automation package
            return clipboard.paste();
        } catch (error) {
            console.error('Failed to get clipboard contents:', error);
            throw error;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis :
   typeof window !== 'undefined' ? window :
   typeof global !== 'undefined' ? global :
   this);
