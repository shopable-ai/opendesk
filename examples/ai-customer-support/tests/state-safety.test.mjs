import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Bundle only into memory: these tests never regenerate the preview or open a host.
const bundle=await build({entryPoints:[new URL('../src/state.tsx',import.meta.url).pathname],
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const app=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const binding={generation:1,pid:321,windowId:456,customerId:'t1',messageId:'customer-1'};
const observation=(revision=1,b=binding,changes={})=>({type:'support.observation',revision,binding:b,
  conversation:{name:'测试客户',messages:[{id:b.messageId,who:'customer',text:'请问能开发票吗？'}],draft:'',...changes},observing:true});
const act=(s,type,extra={})=>app.reducer(s,{type,...extra});
const deliver=(s,message)=>act(s,'NATIVE_MESSAGE',{message});
const initial=()=>deliver(app.createInitialState(true),observation());
const query=s=>act(s,'NATIVE_AI_QUERY',{request:{type:'support.aiQuery',requestId:'ai-1',binding:s.binding}});
const fill=s=>act(s,'NATIVE_FILL',{request:{type:'support.fillDraft',requestId:'fill-1',binding:s.binding,
  text:'待核实回复',expectedDraft:app.currentThread(s).draft}});
const result={type:'support.aiResult',requestId:'ai-1',binding,projectId:'demo',knowledgeBackend:'query_api',
  modelProvider:'none',retrievalStatus:'unverified',status:'ready',evidencePack:{projectId:'demo',coverage:'unknown',items:[]},
  candidates:[{id:'answer',name:'待审核',symbol:'?',text:'旧 AI 建议',evidenceIds:[]}],requiresHumanReview:true,errorCode:null};
const receipt={type:'support.receipt',requestId:'fill-1',binding,status:'verified',draft:'待核实回复',reason:'readback'};

test('same-ID text changes revoke in-flight AI and fill authority without clearing the host draft',()=>{
  let s=fill(query(initial()));
  s=deliver(s,observation(2,binding,{messages:[{id:binding.messageId,who:'customer',text:'更正后的问题'}],draft:'人工草稿'}));
  assert.equal(s.ai,null);assert.equal(s.pendingFill,null);
  assert.equal(deliver(s,result),s);assert.equal(deliver(s,receipt),s);
  assert.equal(app.currentThread(s).draft,'人工草稿');
});

test('human draft changes invalidate a pending fill; late receipts cannot replace the newer snapshot',()=>{
  const pending=fill(initial());
  const edited=deliver(pending,observation(2,binding,{draft:'刚输入的人工草稿'}));
  assert.equal(edited.pendingFill,null);
  assert.equal(deliver(edited,receipt),edited);
  assert.equal(app.currentThread(edited).draft,'刚输入的人工草稿');
});

test('expected fill readback arriving as an observation still accepts the matching receipt exactly once',()=>{
  const pending=fill(initial());
  for(const draft of ['',receipt.draft]){
    const observed=deliver(pending,observation(2,binding,{draft}));
    assert.equal(observed.pendingFill,pending.pendingFill);
    const verified=deliver(observed,receipt);
    assert.equal(verified.pendingFill,null);assert.equal(app.currentThread(verified).draft,receipt.draft);
    assert.equal(deliver(verified,receipt),verified);assert.equal(fill(verified),verified);
  }
});

test('an agent response is not a new customer trigger and revokes old AI/fill work',()=>{
  let s=fill(query(initial()));
  const messages=[...app.currentThread(s).messages,{id:'own-1',who:'agent',text:'已由人工回复'}];
  s=deliver(s,observation(2,binding,{messages,draft:'下一条人工草稿'}));
  assert.equal(s.ai,null);assert.equal(s.pendingFill,null);
  assert.equal(deliver(s,result),s);assert.equal(deliver(s,receipt),s);
  assert.equal(query(s),s);assert.equal(fill(s),s);
  const fresh=deliver(s,observation(3,{...binding,messageId:'customer-2'},{messages:[...messages,
    {id:'customer-2',who:'customer',text:'请问能开发票吗？'}],draft:''}));
  assert.equal(query(fresh).ai.status,'loading','same text with a different ID is a new customer message');
});

test('session and message switches reject old results while preserving each host draft',()=>{
  for(const b of [{...binding,generation:2,customerId:'t2'}, {...binding,messageId:'customer-2'}]){
    const pending=fill(query(initial()));
    const next=deliver(pending,observation(2,b,{draft:'当前会话草稿'}));
    assert.equal(next.ai,null);assert.equal(next.pendingFill,null);
    assert.equal(deliver(next,result),next);assert.equal(deliver(next,receipt),next);
    assert.equal(app.currentThread(next).draft,'当前会话草稿');
    assert.equal(query(next).ai.status,'loading');
  }
});

test('pause, revocation, human edits and bridge failure cancel AI without destroying human text',()=>{
  for(const stop of [
    s=>act(s,'SETTING',{key:'paused',value:true}),
    s=>act(s,'SETTING',{key:'permission',value:false}),
    s=>act(s,'REPLY_EDIT',{key:app.activeReplyKey(s)}),
    s=>act(s,'REPLY_TEXT',{key:app.activeReplyKey(s),text:'等待期间的人工稿'}),
    s=>act(s,'NATIVE_FAILURE')]){
    let s=initial();s=act(s,'REPLY_TEXT',{key:app.activeReplyKey(s),text:'查询前人工稿'});
    s=stop(query(s));assert.equal(s.ai,null);assert.equal(deliver(s,result),s);
    assert.match(app.activeReplyText(s),/人工稿/);
  }
});

test('takeover and return never replay old messages, and restart restores no queued native work',()=>{
  let s=act(act(app.createInitialState(),'AUTO_REQUEST'),'AUTO_CONFIRM');
  s=act(s,'TAKEOVER');s=act(s,'RECEIVE',{id:'t1',text:'请问能开发票吗？'});
  const messages=app.currentThread(s).messages;
  s=act(s,'TAKEOVER');assert.equal(app.currentThread(s).messages,messages);
  assert.deepEqual(app.currentThread(s).sent,[]);
  s=act(s,'RECEIVE',{id:'t1',text:'请问能开发票吗？'});
  assert.equal(app.currentThread(s).sent.length,1,'only the new message can be submitted');
  const restarted=app.createInitialState(true);
  assert.equal(restarted.ai,null);assert.equal(restarted.pendingFill,null);
  assert.equal(restarted.auto,false);assert.equal(restarted.consented,false);
  assert.equal(deliver(restarted,result),restarted);assert.equal(deliver(restarted,receipt),restarted);
});
