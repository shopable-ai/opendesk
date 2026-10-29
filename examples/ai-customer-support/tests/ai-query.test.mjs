import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..');
const query=runInNewContext(readFileSync(join(root,'desktop/query-api-adapter.js'),'utf8')+
  ';OpenDeskSupportQueryAPI',Object.create(null));
const config=query.config({port:18082,projectId:'approved-demo',modelProvider:'auto'});
const binding={generation:1,pid:321,windowId:456,customerId:'t1',messageId:'outside-1'};
const ctx={requestId:'ai-1',binding,question:'请问如何查询物流？'};
const body=(change={})=>({status:200,data:{code:0,message:'ok',data:{
  request_id:'ai-1',product_slug:'approved-demo',actual_product_slug:'approved-demo',
  requested_product_slug:'approved-demo',delivery_mode_applied:'draft',
  delivery_status:'draft_only',direct_reply_allowed:false,
  review_answer:'可以在订单详情查看物流轨迹。',selected_answer_strategy:'rag_rewrite',
  coverage_status:'full',coverage:{status:'full',locked_hits:[
    {knowledge_id:'faq-123',answer_hash:'a'.repeat(64)}]},
  model_call_counts:{total_provider_requests:1},model_provider:'openai-compatible',
  reply_segments:[{type:'text',text:'A'},{type:'text',text:'B'},{type:'image',url:'https://example.com'}],
  ...change}}});
const json=v=>JSON.parse(JSON.stringify(v));

test('only explicit numeric loopback port and trusted project mapping are accepted',()=>{
  assert.equal(config.url,'http://127.0.0.1:18082/api/query');
  for(const bad of [
    {port:0,projectId:'approved-demo',modelProvider:'auto'},
    {port:65536,projectId:'approved-demo',modelProvider:'auto'},
    {port:'18082',projectId:'approved-demo',modelProvider:'auto'},
    {port:18082,projectId:'../other',modelProvider:'auto'},
    {port:18082,projectId:'approved-demo',modelProvider:'bad'},
    {port:18082,projectId:'https://evil',modelProvider:'auto'}]){
    assert.equal(query.config(bad),null);
  }
  assert.equal(query.config({port:8080,projectId:'project-a',modelProvider:'codex_cli'}).modelProvider,'codex_cli');
});

test('outgoing query ignores untrusted project/source choices and stays draft only',()=>{
  const result=json(query.request(config,{...ctx,projectId:'other',url:'https://evil',delivery_mode:'direct_reply'}));
  assert.deepEqual(result,{request_id:'ai-1',product_slug:'approved-demo',query:ctx.question,
    channel:'generic',delivery_mode:'draft',answer_strategy:'auto'});
  assert.equal(query.request(query.config({port:18082,projectId:'approved-demo',modelProvider:'http'}),ctx).answer_strategy,'context_http');
  assert.equal(query.request(query.config({port:18082,projectId:'approved-demo',modelProvider:'codex_cli'}),ctx).answer_strategy,'context_codex_cli');
});

test('one legacy answer becomes one human-review candidate with stable source refs',()=>{
  const result=json(query.convert(config,ctx,body()));
  assert.equal(result.status,'ready');assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].text,'可以在订单详情查看物流轨迹。');
  assert.equal(result.candidates[0].evidenceIds[0],'e0');
  assert.equal(result.retrievalStatus,'supported');assert.equal(result.requiresHumanReview,true);
  assert.equal(result.modelProvider,'http');
  assert.equal(result.evidencePack.items[0].sourceRef,'faq-123');
});

test('project mismatch, delivery-mode downgrade and malformed envelopes fail closed',()=>{
  for(const payload of [
    body({product_slug:'another-project'}),body({requested_product_slug:'other'}),
    body({actual_product_slug:'other'}),body({delivery_status:'direct_reply_ready'}),
    body({delivery_mode_applied:'direct_reply'}),body({direct_reply_allowed:true}),
    body({request_id:'different'}),
    {...body(),status:503},
    {...body(),data:{code:0,data:body().data.data}},
    {...body(),data:{code:1,data:body().data.data}}
  ]){
    const result=json(query.convert(config,ctx,payload));
    assert.equal(result.status,'error');assert.equal(result.candidates.length,0);
  }
  assert.equal(query.convert(config,ctx,body({coverage_status:'conflict',coverage:{status:'conflict',locked_hits:[]}})).status,'blocked');
  assert.equal(query.convert(config,ctx,body({review_answer:''})).status,'error');
  assert.equal(query.convert(config,ctx,body({coverage_status:'unknown',coverage:null})).retrievalStatus,'unverified');
});

test('provider choice cannot silently fall back to an unapproved model route',()=>{
  const http=query.config({port:18082,projectId:'approved-demo',modelProvider:'http'});
  assert.equal(query.convert(http,ctx,body()).errorCode,'PROVIDER_MISMATCH');
  assert.equal(query.convert(http,ctx,body({selected_answer_strategy:'context_http'})).status,'ready');
});

test('context without verified locked sources and unknown coverage stay blocked',()=>{
  // The current legacy explicit-context path may report a context hash/count
  // without locked knowledge IDs. That is insufficient for this product policy.
  for(const strategy of ['context_http','context_codex_cli']){
    const c=query.config({port:18082,projectId:'approved-demo',modelProvider:strategy==='context_http'?'http':'codex_cli'});
    const r=query.convert(c,ctx,body({selected_answer_strategy:strategy,
      model_provider:strategy==='context_http'?'openai-compatible':'codex_cli',
      coverage_status:'unknown',coverage:{status:'unknown',locked_hits:[]},
      compiled_context_hash:'a'.repeat(64),context_selected_document_count:2}));
    assert.equal(r.status,'blocked');assert.equal(r.errorCode,'EVIDENCE_UNVERIFIED');
    assert.equal(r.candidates.length,0);
  }
  const unknown=query.convert(config,ctx,body({coverage_status:'unknown',
    coverage:{status:'unknown',locked_hits:[{knowledge_id:'faq-123',answer_hash:'a'.repeat(64)}]}}));
  assert.equal(unknown.status,'blocked');assert.equal(unknown.candidates.length,0);
});

async function load(file){
  const result=await build({entryPoints:[join(root,file)],bundle:true,write:false,
    platform:'node',format:'esm',target:'node22',logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const [state,bridge]=await Promise.all([load('src/state.tsx'),load('src/desktop.ts')]);
const observation=(revision=1,b=binding)=>({type:'support.observation',revision,binding:b,
  conversation:{name:'受控测试客户',messages:[{id:b.messageId,who:'customer',text:ctx.question}],draft:''},observing:true});
const deliver=(s,m)=>state.reducer(s,{type:'NATIVE_MESSAGE',message:m});
test('typed native result accepts only bounded DTO and cannot bypass human review',()=>{
  const good=json(query.convert(config,ctx,body()));
  assert.ok(bridge.parseNativeMessage(good));
  for(const changed of [
    {...good,requiresHumanReview:false},
    {...good,projectId:'wrong',evidencePack:{...good.evidencePack,projectId:'another'}},
    {...good,candidates:[{...good.candidates[0],text:'x'.repeat(2001)}]},
    {...good,candidates:[{...good.candidates[0],evidenceIds:['not-there']}]},
    {...good,errorCode:'<script>'},
    {...good,binding:{...binding,customerId:'other'}},
  ])assert.equal(bridge.parseNativeMessage(changed),null);
});

test('late, switched, revoked and duplicate AI results never replace current suggestions',()=>{
  let s=deliver(state.createInitialState(true),observation());
  s=state.reducer(s,{type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',requestId:'ai-1',binding}});
  assert.equal(s.ai.status,'loading');
  assert.equal(state.reducer(s,{type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',requestId:'ai-2',binding}}),s);
  const good=json(query.convert(config,ctx,body()));
  assert.equal(deliver(s,{...good,requestId:'other'}),s);
  const ready=deliver(s,good);
  assert.equal(state.activeOptions(ready).length,1);
  assert.equal(state.activeOptions(ready)[0].text,good.candidates[0].text);
  assert.equal(deliver(ready,good),ready);
  const switched=deliver(s,observation(2,{...binding,generation:2,customerId:'t2',messageId:'outside-2'}));
  assert.equal(switched.ai,null);assert.equal(deliver(switched,good),switched);
  const revoked=state.reducer(s,{type:'SETTING',key:'permission',value:false});
  assert.equal(revoked.ai,null);assert.equal(deliver(revoked,good),revoked);
  const paused=state.reducer(s,{type:'SETTING',key:'paused',value:true});
  assert.equal(paused.ai,null);assert.equal(deliver(paused,good),paused);
  assert.ok(state.activeOptions(s).every(x=>!x.text.includes('演示规则')));
});

test('manual editing while AI waits keeps the human reply and rejects the late result',()=>{
  let s=deliver(state.createInitialState(true),observation());
  s=state.reducer(s,{type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',requestId:'ai-1',binding}});
  const key=state.activeReplyKey(s);
  s=state.reducer(s,{type:'REPLY_EDIT',key});
  s=state.reducer(s,{type:'REPLY_TEXT',key,text:'人工编辑：请先核对订单，不承诺到账时间。'});
  const next=deliver(s,json(query.convert(config,ctx,body())));
  assert.equal(state.activeReplyText(next),'人工编辑：请先核对订单，不承诺到账时间。');
  assert.equal(next.editing,key);
});

test('conflicting coverage declarations cannot be promoted to supported evidence',()=>{
  for(const [inner,outer] of [['full','conflict'],['conflict','full'],['full','unknown']]){
    const result=query.convert(config,ctx,body({coverage_status:outer,
      coverage:{status:inner,locked_hits:[{knowledge_id:'faq-1',answer_hash:'a'.repeat(64)}]}}));
    assert.notEqual(result.status,'ready');assert.equal(result.candidates.length,0);
  }
});

test('mock, absent and inconsistent provider declarations cannot claim HTTP generation',()=>{
  for(const provider of ['mock','none','codex_cli','unrecognized']){
    const result=query.convert(config,ctx,body({model_provider:provider,selected_answer_strategy:'context_http'}));
    assert.notEqual(result.modelProvider,'http');
  }
  const raw=query.convert(config,ctx,body({selected_answer_strategy:'rag_raw',model_call_counts:{total_provider_requests:0},model_provider:'none'}));
  assert.equal(raw.modelProvider,'none');assert.equal(raw.status,'ready');
});

test('generation strategies require valid call counts and an explicit matching provider',()=>{
  for(const count of [undefined,0,-1,1.5,'1',NaN]){
    const r=query.convert(config,ctx,body({selected_answer_strategy:'context_http',model_call_counts:{total_provider_requests:count}}));
    assert.equal(r.status,'error');assert.equal(r.candidates.length,0);
  }
  for(const provider of [undefined,''])assert.equal(query.convert(config,ctx,body({model_provider:provider})).status,'error');
  assert.equal(query.convert(config,ctx,body({selected_answer_strategy:'not-a-strategy'})).status,'error');
});

test('no-source or unknown-coverage promises never become a selectable draft',()=>{
  for(const coverage of ['full','unknown']){
    const r=query.convert(config,ctx,body({coverage_status:coverage,coverage:{status:coverage,locked_hits:[]},review_answer:'保证退款到账，无须核实。'}));
    assert.equal(r.status,'blocked');assert.equal(r.candidates.length,0);
  }
});
