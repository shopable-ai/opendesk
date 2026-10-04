// Normal public JS binding qualification only: no Query or Confirm submission.
// Starts from current fixture, observes old fields, confirms probe writes, then
// restores from actual reads. On unknown/failure it stops without replay.
(function () {
  function ok(response, operation) {
    if (response.error || response.outcome !== 'SUCCEEDED') throw new Error(operation+': '+JSON.stringify(response.error || response.outcome));
    return response;
  }
  var status=ok(BrowserDOM.status(),'status');
  var scope={tab:status.browserExecution.tab,frame:0};
  scope.document=ok(BrowserDOM.observe({scope:scope}),'observe').result.identity.document;
  function target(query) {return ok(BrowserDOM.locate({scope:scope,query:query}),'locate').result.target;}
  var order=target({kind:'label',value:'Order ID'}),confirmation=target({kind:'label',value:'Confirmation Amount'});
  var originalOrder=ok(BrowserDOM.read({target:order,field:'value'}),'original order');
  var originalConfirmation=ok(BrowserDOM.read({target:confirmation,field:'value'}),'original confirmation');
  var probe='API_PROBE_'+Execution.executionId;
  var writes=[];
  writes.push(ok(BrowserDOM.act({operation:'fill',target:order,value:probe}),'probe order fill'));
  ok(BrowserDOM.verify({target:order,condition:{kind:'equals',field:'value',expected:probe}}),'probe order verify');
  writes.push(ok(BrowserDOM.act({operation:'fill',target:order,value:originalOrder.result.value,sourceReadRequestId:originalOrder.requestId}),'restore order from actual read'));
  ok(BrowserDOM.verify({target:order,condition:{kind:'equals',field:'value',expected:originalOrder.result.value}}),'restored order verify');
  writes.push(ok(BrowserDOM.act({operation:'fill',target:confirmation,value:probe}),'probe confirmation fill'));
  ok(BrowserDOM.verify({target:confirmation,condition:{kind:'equals',field:'value',expected:probe}}),'probe confirmation verify');
  writes.push(ok(BrowserDOM.act({operation:'fill',target:confirmation,value:originalConfirmation.result.value,sourceReadRequestId:originalConfirmation.requestId}),'restore confirmation from actual read'));
  ok(BrowserDOM.verify({target:confirmation,condition:{kind:'equals',field:'value',expected:originalConfirmation.result.value}}),'restored confirmation verify');
  var reveal=target({kind:'role',role:'button',name:'Reveal message'}),delayed=target({kind:'testId',value:'delayed'});
  var click=ok(BrowserDOM.act({operation:'click',target:reveal}),'safe reveal click');
  var waited=ok(BrowserDOM.wait({target:delayed,condition:{kind:'nonEmpty',field:'text'}}),'wait reveal');
  var actual=ok(BrowserDOM.read({target:delayed,field:'text'}),'read reveal');
  var verified=ok(BrowserDOM.verify({target:delayed,condition:{kind:'equals',field:'text',expected:actual.result.value}}),'verify reveal actual');
  console.log(JSON.stringify({scope:scope,browserExecution:status.browserExecution,
    originalOrder:originalOrder,originalConfirmation:originalConfirmation,writes:writes,
    click:click,waited:waited,revealRead:actual,verified:verified,
    queryCalled:false,confirmCalled:false,restoredFromActualRead:true}));
  BrowserDOM.close();
})();
