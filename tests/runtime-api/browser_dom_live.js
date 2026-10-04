// Read-only public BrowserDOM scenario on the host-authorized controlled fixture.
// No Query, fill or Confirm is performed. Caller must supply documented Browser flags.
(function () {
  function ok(response, name) {
    if (response.error || response.outcome !== 'SUCCEEDED') {
      throw new Error(name + ': ' + JSON.stringify(response.error || response.outcome));
    }
    return response;
  }
  var status = ok(BrowserDOM.status(), 'status');
  if (!status.result.connected) throw new Error('Actual Extension is not connected');
  var tabs = ok(BrowserDOM.tabs(), 'tabs');
  var scope = {tab: status.browserExecution.tab, frame: 0};
  var observation = ok(BrowserDOM.observe({scope: scope}), 'observe');
  scope.document = observation.result.identity.document;
  var queries = {
    order: {kind:'label', value:'Order ID'},
    query: {kind:'role', role:'button', name:'Query'},
    amount: {kind:'role', role:'status', name:'Amount'},
    confirmation: {kind:'label', value:'Confirmation Amount'},
    confirm: {kind:'role', role:'button', name:'Confirm'},
    status: {kind:'testId', value:'status'}
  };
  var targets = {};
  Object.keys(queries).forEach(function (name) {
    targets[name] = ok(BrowserDOM.locate({scope:scope, query:queries[name]}), 'locate ' + name);
  });
  var amount = ok(BrowserDOM.read({target:targets.amount.result.target, field:'text'}), 'read amount');
  var order = ok(BrowserDOM.read({target:targets.order.result.target, field:'value'}), 'read order');
  var confirmation = ok(BrowserDOM.read({target:targets.confirmation.result.target, field:'value'}), 'read confirmation');
  var finalStatus = ok(BrowserDOM.read({target:targets.status.result.target, field:'text'}), 'read status');
  console.log(JSON.stringify({scope:scope, browserExecution:status.browserExecution,
    tabs:tabs.result.tabs, observation:observation.result, targets:targets,
    reads:{amount:amount, order:order, confirmation:confirmation, status:finalStatus}, businessInputExecuted:false}));
  BrowserDOM.close();
})();
