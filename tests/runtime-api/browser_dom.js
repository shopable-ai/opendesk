// Direct public Runtime contract scenario. No browser authorization is supplied.
// Run from the repository root with the explicitly selected current executable:
// <opendesk> -script tests/runtime-api/browser_dom.js -console-mode script
(function () {
  function assert(value, message) { if (!value) throw new Error(message); }
  var methods = ['status', 'tabs', 'observe', 'locate', 'read', 'act', 'wait', 'verify', 'close'];
  methods.forEach(function (name) { assert(typeof BrowserDOM[name] === 'function', 'Missing BrowserDOM.' + name); });
  var response = BrowserDOM.status();
  assert(response.error && response.error.code === 'BROWSER_DISABLED', 'Untrusted/disabled execution must reject before starting a Client');
  assert(response.outcome === 'NOT_DISPATCHED', 'Disabled Browser capability must not dispatch');
  var action = BrowserDOM.act({operation:'click', target:{tab:1}});
  assert(action.error && action.error.code === 'BROWSER_DISABLED', 'Action must not silently enable Browser permission');
  assert(action.outcome === 'NOT_DISPATCHED', 'Disabled action must not dispatch');
  BrowserDOM.close();
  console.log('BrowserDOM disabled execution contract PASS');
})();
