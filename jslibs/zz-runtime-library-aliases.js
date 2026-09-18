(function (global) {
  'use strict';
  if (!global.Papa || typeof global.Papa.parse !== 'function' || typeof global.Papa.unparse !== 'function') {
    throw new Error('Papa Parse 5.7.0 failed to initialize before CSV facade');
  }
  global.CSV = {
    parse: function (input, options) { return global.Papa.parse(input, options); },
    stringify: function (value, options) { return global.Papa.unparse(value, options); },
    unparse: function (value, options) { return global.Papa.unparse(value, options); },
    VERSION: '5.7.0'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
