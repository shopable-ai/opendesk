import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {api,scenarios,sha,assess,hostQuery,validateCases} from './trial-business.mjs';
import {checkHumanProtection,loadState} from './trial-business-state.mjs';
const config=api.config({port:18082,projectId:'bizhi-app',modelProvider:'auto'});
// Synthetic transport only: intentionally not evidence of a model call.
const sourceText='通常每周更新，具体以当前页面展示为准。';
const sourceHash=sha(JSON.stringify(sourceText));
const fixtureCase=()=>({...structuredClone(scenarios[0]),expected:{...structuredClone(scenarios[0].expected),
  sourceIds:['synthetic-faq'],sourceHashes:{'synthetic-faq':sourceHash}}});
function response(payload,changes={}){
  return {status:200,data:{code:0,message:'synthetic-only',data:{request_id:payload.request_id,
    product_slug:payload.product_slug,delivery_mode_applied:'draft',delivery_status:'draft_only',direct_reply_allowed:false,
    selected_answer_strategy:'rag_raw',model_provider:'none',model_call_counts:{total_provider_requests:0},
    coverage_status:'full',coverage:{status:'full',locked_hits:[{knowledge_id:'synthetic-faq',answer_hash:sourceHash}]},
    matched_id:'synthetic-faq',source_answer_hash:sourceHash,knowledge_answer:sourceText,review_answer:sourceText,...changes}}};
}
const context={requestId:'offline-1',question:'更新频率？'};
const payload=api.request(config,context);
test('four trial classes retain source lineage and draft business status',()=>{
  assert.equal(validateCases().businessApproval,false);
  assert.deepEqual(scenarios.map(c=>c.id),['common','insufficient','context','correction']);
});
test('synthetic source oracle passes exact source and explicitly does not claim model verification',()=>{
  const result=assess(fixtureCase(),config,context,response(payload));
  assert.equal(result.passed,true);
  assert.equal(result.modelEvidence.independentProviderVerification,'NOT_TESTED');
  assert.equal(result.result.modelProvider,'none');
});
test('an answerable trial cannot pass merely because all suggestions were blocked',()=>{
  const report=assess(fixtureCase(),config,context,response(payload,{
    coverage_status:'unknown',coverage:{status:'unknown',locked_hits:[]}}));
  assert.equal(report.result.status,'blocked');
  assert.equal(report.passed,false);
});
test('integrity/schema failures fail; lexical and source expectations remain review aids',()=>{
  const deltas=[{knowledge_answer:'冒充的来源原文'},
    {source_answer_hash:'b'.repeat(64)}, {direct_reply_allowed:true}, {request_id:'wrong'},
    {product_slug:'another'}, {actual_product_slug:'another'}];
  for(const d of deltas)assert.equal(assess(fixtureCase(),config,context,response(payload,d)).passed,false,JSON.stringify(d));
  const unsupported=assess(fixtureCase(),config,context,response(payload,{review_answer:'保证每天更新。'}));
  assert.equal(unsupported.passed,true,'automatic pass does not imply factual pass');
  assert.equal(unsupported.observations.expectedFactCues,false);
  assert.equal(unsupported.semanticStatus,'NOT_TESTED');
});
test('unknown boundary remains reviewable; price literals are flagged for human review',()=>{
  const c=fixtureCase();c.expected.outcome='degrade';
  c.expected.facts=[{anyOf:['页面']}];c.expected.forbiddenFacts=['今天成交价18元'];
  assert.equal(assess(c,config,context,response(payload)).passed,true);
  const unsafe=assess(c,config,context,response(payload,{review_answer:sourceText+'今天成交价18元'}));
  assert.deepEqual(unsafe.observations.forbiddenLiteralSeen,['今天成交价18元']);
  assert.equal(unsafe.semanticStatus,'NOT_TESTED');
  assert.equal(assess(c,config,context,{status:503,data:null}).passed,false,'technical outage is not business handoff');
});
test('actual host merges only the unanswered turn, not full conversation or session fields',async()=>{
  const c=scenarios[2];
  const run=await hostQuery(c,config,async(url,p)=>response(p),'context-1');
  assert.equal(run.payloads[0].query,c.messages.slice(2).map(m=>m.text).join('\n'));
  assert.deepEqual(Object.keys(run.payloads[0]).sort(),['answer_strategy','channel','delivery_mode','product_slug','query','request_id']);
  assert.equal(run.results.length,1);
  const closed={...c,messages:[...c.messages,{id:'last-agent',who:'agent',text:'已经回答'}]};
  const noCall=await hostQuery(closed,config,()=>{throw Error('must not dispatch');});
  assert.equal(noCall.payloads.length,0);
  const oversized={...c,messages:Array.from({length:9},(_,i)=>({id:'m'+i,who:'customer',text:'继续咨询'}))};
  const bounded=await hostQuery(oversized,config,()=>{throw Error('must not dispatch');});
  assert.equal(bounded.payloads.length,0);assert.equal(bounded.results[0].errorCode,'CONTEXT_LIMIT');
});
test('real production reducer preserves manual correction on requery and late response (synthetic result)',async()=>{
  const run=await hostQuery(scenarios[3],config,async(url,p)=>response(p),'human-1');
  assert.equal((await checkHumanProtection(run.observation,run.results[0],scenarios[3].humanText)).status,'PASS');
});
test('new turn retires previous authority; anaphora is not magically expanded from answered history',async()=>{
  const c=scenarios[2];
  const initial=await hostQuery(c,config,async(url,p)=>response(p),'prior-turn');
  const next={...c,messages:[...c.messages,{id:'agent',who:'agent',text:sourceText},
    {id:'followup',who:'customer',text:'那它呢？'}]};
  const later=await hostQuery(next,config,async(url,p)=>response(p),'followup-turn');
  assert.equal(later.payloads[0].query,'那它呢？');
  const app=await loadState();let s=app.reducer(app.createInitialState(true),{type:'NATIVE_MESSAGE',message:initial.observation});
  s=app.reducer(s,{type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',requestId:'prior-turn',binding:initial.observation.binding}});
  s=app.reducer(s,{type:'NATIVE_MESSAGE',message:{...later.observation,revision:2,binding:{...later.observation.binding,generation:2}}});
  assert.equal(s.ai,null);
  assert.equal(app.reducer(s,{type:'NATIVE_MESSAGE',message:initial.results[0]}),s);
});
test('Node HTTP plumbing against explicitly synthetic ephemeral server; no real model',async()=>{
  const server=createServer(async(req,res)=>{
    assert.equal(req.url,'/api/query');assert.equal(req.method,'POST');
    let raw='';for await(const chunk of req)raw+=chunk;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(response(JSON.parse(raw)).data));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const c=api.config({...config,port:server.address().port});
    const run=await hostQuery(fixtureCase(),c,async(url,p)=>{
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),signal:AbortSignal.timeout(5000)});
      return {status:r.status,data:await r.json()};
    });
    assert.equal(run.results[0].status,'ready');assert.equal(run.results[0].modelProvider,'none');
  }finally{server.closeAllConnections();await new Promise((yes,no)=>server.close(e=>e?no(e):yes()));}
});

test('absent evidence blocks suggestions and the actual reducer offers human verification',async()=>{
  const c=scenarios[1];let report;
  const run=await hostQuery(c,config,async(url,p)=>{
    const r=response(p,{coverage_status:'unknown',coverage:{status:'unknown',locked_hits:[]},knowledge_answer:undefined,review_answer:''});
    report=assess(c,config,{requestId:p.request_id},r);return r;
  });
  assert.equal(report.passed,true);assert.equal(report.observations.sourceOriginal,'UNAVAILABLE');
  assert.equal(run.results[0].status,'blocked');assert.equal(run.results[0].candidates.length,0);
  const app=await loadState();let s=app.reducer(app.createInitialState(true),{type:'NATIVE_MESSAGE',message:run.observation});
  s=app.reducer(s,{type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',requestId:run.results[0].requestId,binding:run.observation.binding}});
  s=app.reducer(s,{type:'NATIVE_MESSAGE',message:run.results[0]});
  assert.deepEqual(app.activeOptions(s).map(o=>o.id),['human']);
  assert.equal(app.currentThread(s).draft,'');assert.deepEqual(app.currentThread(s).sent,[]);
});
