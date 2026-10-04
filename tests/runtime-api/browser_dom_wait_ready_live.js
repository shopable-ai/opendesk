// Read-only continuation on a target already independently observed ready.
// No previous probe prefix, click, Query or Confirm is replayed.
(function () {
  function ok(response) {if(response.error || response.outcome!=='SUCCEEDED')throw new Error(JSON.stringify(response.error || response.outcome));return response;}
  var status=ok(BrowserDOM.status()),scope={tab:status.browserExecution.tab,frame:0};
  scope.document=ok(BrowserDOM.observe({scope:scope})).result.identity.document;
  var target=ok(BrowserDOM.locate({scope:scope,query:{kind:'testId',value:'delayed'}})).result.target;
  var waited=ok(BrowserDOM.wait({target:target,condition:{kind:'nonEmpty',field:'text'}}));
  var actual=ok(BrowserDOM.read({target:target,field:'text'}));
  var verification=ok(BrowserDOM.verify({target:target,condition:{kind:'equals',field:'text',expected:actual.result.value}}));
  console.log(JSON.stringify({source:'read-only-after-observed-ready',browserExecution:status.browserExecution,
    waited:waited,read:actual,verification:verification,noInputReplay:true}));
  BrowserDOM.close();
})();
