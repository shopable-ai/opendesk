// Console Polyfill for Go Backend
(function(injectedConsole) {
    // Helper function to convert arguments to a consistent format
    function convertArgs(...args) {
        return args.map(arg => {
            // Handle null and undefined explicitly
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            
            return arg;
        });
    }

    // Create a console object that maps to the injected Go console methods
    const console = {
        log: (...args) => {
            const convertedArgs = convertArgs(...args);
            injectedConsole.log(...convertedArgs);
        },
        info: (...args) => {
            const convertedArgs = convertArgs(...args);
            injectedConsole.info(...convertedArgs);
        },
        warn: (...args) => {
            const convertedArgs = convertArgs(...args);
            injectedConsole.warn(...convertedArgs);
        },
        error: (...args) => {
            const convertedArgs = convertArgs(...args);
            injectedConsole.error(...convertedArgs);
        },
        debug: (...args) => {
            const convertedArgs = convertArgs(...args);
            injectedConsole.debug(...convertedArgs);
        },
        table: (data) => {
            injectedConsole.table(data);
        },
        group: (label) => {
            injectedConsole.group(label);
        },
        groupEnd: (label) => {
            injectedConsole.groupEnd(label);
        },
        time: (label) => {
            injectedConsole.time(label);
        },
        timeEnd: (label) => {
            injectedConsole.timeEnd(label);
        },
        clear: () => {
            injectedConsole.clear();
        }
    };

    // Replace the global console with our polyfill
    globalThis.console = console;
})(console);