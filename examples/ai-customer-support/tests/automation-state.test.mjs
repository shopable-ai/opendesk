import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async name=>{
  const result=await build({entryPoints:[new URL('../src/'+name,import.meta.url).pathname],bundle:true,
    write:false,platform:'node',format:'esm',logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const app=await load('state.tsx'),bridge=await load('desktop.ts');
const binding={generation:1,pid:321,windowId:456,customerId:'t1',messageId:'m1'};
const obs=(revision=1,b=binding,observing=true)=>({type:'support.observation',revision,binding:b,observing,
  conversation:{name:'本地测试',messages:[{id:b.messageId,who:'customer',text:'发票'}],draft:''}});
const status=(mode='enabled',b=binding)=>({type:'support.automationStatus',binding:b,mode,reason:'fixture',requests:2,queued:1,lastOutcome:'confirmed'});
const act=(s,type,extra={})=>app.reducer(s,{type,...extra});
const deliver=(s,message)=>act(s,'NATIVE_MESSAGE',{message});
const initial=()=>deliver(app.createInitialState(true),obs());
const consent=()=>act(act(initial(),'AUTO_REQUEST'),'AUTO_CONFIRM');

test('automation status validates every field and copies its binding',()=>{
  const input=status(),parsed=bridge.parseNativeMessage(JSON.stringify(input));
  assert.deepEqual(parsed,input);input.binding={...binding,pid:999};assert.equal(parsed.binding.pid,321);
  for(const extra of [{mode:'running'},{reason:null},{requests:-1},{requests:1.5},{requests:Infinity},
    {queued:'1'},{queued:NaN},{lastOutcome:'sent'},{lastOutcome:undefined},{binding:{...binding,pid:0}}]){
    assert.equal(bridge.parseNativeMessage({...status(),...extra}),null);
  }
  for(const mode of ['disabled','enabling','enabled','paused','revoked','locked'])
    for(const lastOutcome of [null,'confirmed','failed','unknown'])
      assert.ok(bridge.parseNativeMessage({...status(mode),lastOutcome}));
});

test('native consent is explicit and no command enables automatically or in browser demo',()=>{
  let s=initial();assert.equal(app.automationRequest(s,{type:'AUTO_REQUEST'}),null);
  assert.equal(app.automationRequest(s,{type:'AUTO_CONFIRM'}),null);
  assert.equal(deliver(s,status()),s,'unsolicited enabled cannot grant consent');
  s=act(s,'AUTO_REQUEST');assert.equal(s.consentPending,true);assert.equal(s.auto,false);
  assert.deepEqual(app.automationRequest(s,{type:'AUTO_CONFIRM'}),{type:'support.automation',action:'enable',binding});
  s=act(s,'AUTO_CONFIRM');assert.equal(s.automation.mode,'enabling');assert.equal(s.auto,false);
  s=deliver(s,status());assert.equal(s.auto,true);assert.equal(s.automation.requests,2);
  assert.equal(app.automationRequest(app.createInitialState(),{type:'AUTO_CONFIRM'}),null);
  assert.equal(app.automationRequest(app.createInitialState(true),{type:'TAKEOVER'}),null);
});

test('status requires the entire current binding; session switch clears consent and tells previous host to take over',()=>{
  const s=deliver(consent(),status());
  for(const extra of [{generation:2},{pid:999},{windowId:999},{customerId:'t2'},{messageId:'old'}])
    assert.equal(deliver(s,status('enabled',{...binding,...extra})),s);
  const action={type:'NATIVE_MESSAGE',message:obs(2,{...binding,generation:2,customerId:'t2'})};
  assert.deepEqual(app.automationRequest(s,action),{type:'support.automation',action:'takeover',binding});
  const next=app.reducer(s,action);
  assert.equal(next.auto,false);assert.equal(next.consented,false);assert.equal(next.automation,null);
  assert.equal(deliver(next,status()),next);
  assert.equal(app.automationRequest(next,{type:'AUTO_CONFIRM'}),null);
  assert.equal(app.automationRequest(s,{type:'NATIVE_MESSAGE',message:obs(0)}),null,'stale observation has no side effect');
});

test('pause, revoke, takeover and editing synchronously select the bound host command',()=>{
  const enabled=deliver(consent(),status());
  for(const [action,expected] of [
    [{type:'AUTOMATION_PAUSE'},'pause'],[{type:'SETTING',key:'paused',value:true},'pause'],
    [{type:'AUTO_DISABLE'},'revoke'],[{type:'SETTING',key:'permission',value:false},'revoke'],
    [{type:'TAKEOVER'},'takeover'],[{type:'REPLY_EDIT',key:app.activeReplyKey(enabled)},'takeover'],
    [{type:'REPLY_TEXT',key:app.activeReplyKey(enabled),text:'人工编辑'},'takeover']]){
    assert.deepEqual(app.automationRequest(enabled,action),{type:'support.automation',action:expected,binding});
    const stopped=app.reducer(enabled,action);assert.equal(stopped.auto,false);
    assert.equal(deliver(stopped,status()),stopped,'late enabled never undoes human ownership');
    assert.equal(app.currentThread(stopped).draft,'');
  }
  assert.equal(app.automationRequest(enabled,{type:'REPLY_EDIT',key:null}),null);
  assert.equal(app.automationRequest(enabled,{type:'SETTING',key:'paused',value:false}),null,'observation unpause never resumes automation');
});

test('resume is explicit, locked cannot recover, revocation requires new consent',()=>{
  let s=act(deliver(consent(),status()),'AUTOMATION_PAUSE');
  assert.equal(s.automation.mode,'paused');
  assert.deepEqual(app.automationRequest(s,{type:'AUTOMATION_RESUME'}),{type:'support.automation',action:'resume',binding});
  s=act(s,'AUTOMATION_RESUME');assert.equal(s.auto,false);
  s=deliver(s,status());assert.equal(s.auto,true);
  s=act(s,'AUTO_DISABLE');assert.equal(s.consented,false);
  assert.equal(app.automationRequest(s,{type:'AUTOMATION_RESUME'}),null);
  for(const mode of ['locked']){
    const locked=deliver(consent(),status(mode));
    for(const type of ['AUTO_REQUEST','AUTO_CONFIRM','AUTOMATION_RESUME'])assert.equal(act(locked,type),locked);
    assert.equal(deliver(locked,status()),locked);
    assert.equal(act(locked,'TAKEOVER').automation.mode,'locked');
  }
  const failed=act(consent(),'NATIVE_FAILURE');assert.equal(failed.automation.mode,'locked');
  assert.equal(failed.auto,false);assert.equal(failed.consented,false);
});

test('new messages never reuse old status and observation loss sends takeover without replay',()=>{
  const s=deliver(consent(),status());
  const next=deliver(s,obs(2,{...binding,messageId:'m2'}));
  assert.equal(deliver(next,status()),next);
  assert.equal(next.auto,true);assert.equal(next.automation.binding.messageId,'m1');
  assert.equal(deliver(next,status('enabled',next.binding)).auto,true);
  assert.deepEqual(app.currentThread(next).sent,[]);
  assert.equal(app.automationRequest(s,{type:'NATIVE_MESSAGE',message:obs(2,binding,false)}).action,'takeover');
  const lost=deliver(s,obs(2,binding,false));assert.equal(lost.auto,false);assert.equal(lost.automation.mode,'enabled');
  assert.equal(deliver(lost,status('paused')).automation.mode,'paused');
  const restarted=app.createInitialState(true);assert.equal(restarted.automation,null);assert.equal(restarted.consented,false);
});


test('native fill claims human ownership but invalid and repeated fills issue no takeover',()=>{
  const s=deliver(consent(),status());
  const action={type:'NATIVE_FILL',request:{type:'support.fillDraft',binding,requestId:'fill-auto-1',text:'人工稿',expectedDraft:''}};
  assert.deepEqual(app.automationRequest(s,action),{type:'support.automation',action:'takeover',binding});
  const pending=app.reducer(s,action);
  assert.equal(pending.auto,false);assert.equal(pending.automation.mode,'paused');
  assert.equal(app.currentThread(pending).draft,'');assert.equal(pending.pendingFill.text,'人工稿');
  assert.equal(app.automationRequest(pending,action),null);
  assert.equal(app.automationRequest(s,{...action,request:{...action.request,binding:{...binding,messageId:'old'}}}),null);
});


test('new message plus generation in the same native scope preserves consent and auto without takeover',()=>{
  let s=deliver(consent(),status());
  for(let generation=2;generation<=4;generation++){
    const binding={...s.binding,generation,messageId:'message-'+generation};
    const action={type:'NATIVE_MESSAGE',message:obs(generation,binding)};
    assert.equal(app.automationRequest(s,action),null,'customer message is not human takeover');
    const next=app.reducer(s,action);
    assert.equal(next.consented,true);assert.equal(next.auto,true);
    assert.equal(next.automation,s.automation,'wait for actual current-binding Host status');
    assert.equal(deliver(next,status('enabled',s.binding)),next,'old full-binding status rejected');
    s=deliver(next,status('enabled',binding));assert.equal(s.auto,true);
  }
  for(const action of [{type:'REPLY_EDIT',key:app.activeReplyKey(s)},
    {type:'REPLY_TEXT',key:app.activeReplyKey(s),text:'human'}]){
    assert.equal(app.automationRequest(s,action).action,'takeover');
    assert.equal(app.reducer(s,action).auto,false);
  }
});

test('PID, window and customer scope changes still take over and clear consent',()=>{
  const s=deliver(consent(),status());
  for(const scope of [{pid:999},{windowId:999},{customerId:'t2'}]){
    const action={type:'NATIVE_MESSAGE',message:obs(2,{...binding,...scope,generation:2,messageId:'new'})};
    assert.equal(app.automationRequest(s,action).action,'takeover');
    const next=app.reducer(s,action);
    assert.equal(next.consented,false);assert.equal(next.auto,false);assert.equal(next.automation,null);
  }
});

test('focus invalidation stops, recovery generation does not resume, explicit resume accepts enabled',()=>{
  const s=deliver(consent(),status());
  const invalidBinding={...binding,generation:2};
  const lost={type:'NATIVE_MESSAGE',message:obs(2,invalidBinding,false)};
  assert.equal(app.automationRequest(s,lost).action,'takeover');
  let next=app.reducer(s,lost);
  assert.equal(next.auto,false);assert.equal(next.consented,true);
  next=deliver(next,status('paused',invalidBinding));assert.equal(next.automation.mode,'paused');
  const recoveredBinding={...binding,generation:3};
  const recovery={type:'NATIVE_MESSAGE',message:obs(3,recoveredBinding)};
  assert.equal(app.automationRequest(next,recovery),null,'focus recovery is not a new takeover');
  next=app.reducer(next,recovery);
  assert.equal(next.consented,true);assert.equal(next.auto,false);
  next=deliver(next,status('paused',recoveredBinding));
  assert.equal(deliver(next,status('enabled',recoveredBinding)),next,'pause requires explicit resume');
  assert.equal(app.automationRequest(next,{type:'AUTOMATION_RESUME'}).action,'resume');
  next=act(next,'AUTOMATION_RESUME');assert.equal(next.automation.mode,'enabling');
  next=deliver(next,status('enabled',recoveredBinding));
  assert.equal(next.auto,true);assert.equal(next.automation.mode,'enabled');
});
