// Independent read-only DOM observation after the business executor exits.
// Use the host-authorized current fixture tab and the documented Browser flags.
(function () {
  function ok(response) {
    if (response.error || response.outcome !== 'SUCCEEDED') throw new Error(JSON.stringify(response.error || response.outcome));
    return response;
  }
  var status = ok(BrowserDOM.status());
  var scope = {tab:status.browserExecution.tab, frame:0};
  var observed = ok(BrowserDOM.observe({scope:scope}));
  scope.document = observed.result.identity.document;
  function read(query, field) {
    var found = ok(BrowserDOM.locate({scope:scope,query:query}));
    return ok(BrowserDOM.read({target:found.result.target,field:field}));
  }
  console.log(JSON.stringify({source:'post-executor-independent-dom-observation',scope:scope,
    order:read({kind:'label',value:'Order ID'},'value'),
    confirmation:read({kind:'label',value:'Confirmation Amount'},'value'),
    status:read({kind:'testId',value:'status'},'text')}));
  BrowserDOM.close();
})();
