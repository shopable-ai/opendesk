// Offline host-glue tests using the shipped modules, not native/GUI evidence.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function settle(){for(let i=0;i<100;i++)await Promise.resolve();}

function harness(options={}){
  const ctx=vm.createContext({});
  for(const name of ['business-validator.generated.js','native-adapter.js','controlled-reply.js','fixture-automation.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../../examples/ai-customer-support/desktop',name),'utf8'),ctx,{filename:name});
  }
  const target={pid:42,exePath:'/fake/OpenDeskSupportChat'};
  const win={...target,handle:80,isForeground:true};
  const native={customerId:'t1',messages:[],draft:''};
  const adapter=ctx.OpenDeskSupportNative.create(target);
  const actions=[],reads=[],published=[],logs=[],timers=new Map();
  let time=0,nextTimer=0,sequence=0,authority=true,automation;
  const clock={now:()=>time,
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{at:time+ms,fn});return id;},
    clearTimeout:id=>timers.delete(id)};
  function refresh(){
    const names={t1:'林女士',t2:'陈先生',t3:'周女士'};
    const snapshot={complete:true,truncated:false,backend:'fake-native',requestId:'read-'+reads.length,root:{children:[
      {identifier:'support.session',value:native.customerId+' · '+names[native.customerId]},
      {identifier:'support.draft.'+native.customerId,value:native.draft},
      ...native.messages.map(m=>({identifier:'support.message.'+m.id+'.'+m.who,
        value:(m.who==='agent'?'客服':'客户')+' · '+m.id+'\n'+m.text})),
    ]}};
    adapter.accept(win,snapshot);
    return {conversation:ctx.OpenDeskSupportNative.parse(snapshot),binding:clone(adapter.current.binding)};
  }
  const domain=ctx.OpenDeskSupportBusinessDomain;
  const rules=domain.initialKnowledge();
  options.knowledge?.(rules);
  const rule=rules.find(k=>k.id==='k1');
  function append(who='customer',text=rule.question){
    const message={id:native.customerId+'-m'+(++sequence),who,text};
    native.messages.push(message);return message;
  }
  function ingest(){const state=refresh();automation.ingest(state.conversation,state.binding);}
  const env={native,win,adapter,actions,reads,published,logs,append,ingest,refresh,clock};
  refresh();
  automation=ctx.OpenDeskSupportFixtureAutomation.create({target,adapter,clock,
    domain:{initialKnowledge:()=>rules,inspectKnowledge:domain.inspectKnowledge},
    authorized:()=>authority&&adapter.current.observing,
    read:async()=>{
      const state=refresh();reads.push(clone(state));
      await options.onRead?.(env,reads.length);
      return state;
    },
    action:async request=>{
      request.guard();actions.push({kind:request.kind,text:request.text,scope:clone(request.scope)});
      if(options.action)return options.action(request,env);
      if(request.kind==='draft'){
        native.draft=request.text;
        // The host's real native observation may publish during its own write.
        ingest();return {status:'draft-verified'};
      }
      const sent=append('agent',native.draft);native.draft='';ingest();
      return {status:'sent',messageId:sent.id};
    },
    publish:async message=>published.push(clone(message)),
    log:(event,payload)=>logs.push({event,payload:clone(payload)}),
  });
  async function command(action,binding=adapter.current.binding){
    await automation.handle({type:'support.automation',action,binding:clone(binding)});
  }
  async function advance(ms){
    const end=time+ms;
    for(let count=0;;count++){
      assert.ok(count<1000,'fake clock timer loop must terminate');
      const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!entry)break;
      time=entry[1].at;timers.delete(entry[0]);entry[1].fn();await settle();
    }
    time=end;await settle();
  }
  return {...env,automation,command,advance,rule,
    message:(text,who='customer')=>{const m=append(who,text);ingest();return m;},
    authorize:value=>{authority=value;}};
}

test('explicit enable baselines existing native history; only a later event sends',async()=>{
  const h=harness();h.message();await h.advance(2000);
  assert.equal(h.automation.status().mode,'disabled');assert.equal(h.reads.length,0);
  await h.command('enable');await h.advance(2000);h.ingest();await h.advance(2000);
  assert.equal(h.actions.length,0);assert.equal(h.automation.status().requests,0);
  assert.equal(h.published.at(-1).mode,'enabled');
  h.message();await h.advance(600);
  assert.deepEqual(h.actions.map(a=>a.kind),['draft','send']);
  assert.equal(h.automation.status().lastOutcome,'confirmed');
});

for(const field of ['customer','window']){
  test('switching native '+field+' stops queued work without acting on the new scope',async()=>{
    const h=harness();await h.command('enable');h.message();
    if(field==='customer'){h.native.customerId='t2';h.native.messages=[];}
    else h.win.handle=81;
    h.ingest();await h.advance(2000);await h.automation.report();
    assert.equal(h.actions.length,0);assert.equal(h.automation.status().mode,'paused');
    assert.equal(h.automation.status().queued,0);assert.equal(h.published.at(-1).mode,'paused');
  });
}

test('same text with distinct native IDs coalesces, repeated observations never duplicate sends',async()=>{
  const h=harness();await h.command('enable');const a=h.message();
  await h.advance(300);h.ingest();const b=h.message();h.ingest();
  await h.advance(599);assert.equal(h.actions.length,0);await h.advance(1);
  const proposal=h.logs.find(e=>e.event==='controlled-proposal').payload;
  assert.deepEqual(proposal.triggers,[a.id,b.id]);
  assert.equal(proposal.sources.length,1);
  assert.equal(h.actions[0].text,'【OpenDesk 本地测试】'+h.rule.a);
  assert.deepEqual(h.actions[1].scope,{pid:42,window:'80',customer:'t1',account:'local-test-fixture:42',knowledge:'builtin-demo-v1'});
  h.ingest();await h.advance(20000);assert.equal(h.actions.length,2);
  assert.equal(h.automation.status().requests,1);
});

test('one complete eight-message native snapshot sends one bounded batch and never repeats',async()=>{
  const h=harness();await h.command('enable');
  // Match the Swift fixture's one-event burst: append all eight immutable IDs
  // before publishing a complete observation through the real native parser.
  const burst=Array.from({length:8},()=>h.append());h.ingest();
  assert.equal(h.automation.status().queued,8);assert.equal(h.actions.length,0);
  await h.advance(0);
  const proposals=h.logs.filter(e=>e.event==='controlled-proposal');
  assert.ok(proposals.length>0);
  for(const {payload} of proposals){
    assert.deepEqual(payload.triggers,burst.map(m=>m.id));assert.equal(payload.sources.length,1);
  }
  assert.deepEqual(h.actions.map(a=>a.kind),['draft','send']);
  assert.equal(h.native.messages.filter(m=>m.who==='agent').length,1);
  assert.equal(h.automation.status().lastOutcome,'confirmed');
  for(let i=0;i<5;i++){h.ingest();await h.advance(10000);}
  assert.equal(h.automation.status().requests,1);assert.equal(h.actions.length,2);
  assert.equal(h.automation.status().queued,0);
});

test('continuous native arrivals hit the two-second merge bound without duplicate submission',async()=>{
  const h=harness();await h.command('enable');const ids=[];
  for(let i=0;i<5;i++){
    ids.push(h.message().id);h.ingest();await h.advance(399);
    assert.equal(h.actions.length,0);await h.advance(1);
  }
  assert.equal(h.clock.now(),2000);
  assert.deepEqual(h.actions.map(a=>a.kind),['draft','send']);
  assert.deepEqual(h.logs.find(e=>e.event==='controlled-proposal').payload.triggers,ids);
  for(let i=0;i<4;i++){h.ingest();await h.advance(5000);}
  assert.equal(h.automation.status().requests,1);assert.equal(h.actions.length,2);
});

for(const delivered of [false,true]){
  test('unknown '+(delivered?'delivered':'not delivered')+' stays locked despite empty draft, commands and new IDs',async()=>{
    const h=harness({action:async(request,env)=>{
      if(request.kind==='draft'){env.native.draft=request.text;env.ingest();return {status:'draft-verified'};}
      if(delivered)env.append('agent',env.native.draft);
      // Actual fixture keeps the submitted draft on either unknown receipt.
      env.ingest();return {status:'unknown',reason:'receipt-unavailable'};
    }});
    await h.command('enable');h.message();await h.advance(600);
    assert.equal(h.native.messages.filter(m=>m.who==='agent').length,delivered?1:0);
    assert.equal(h.native.draft,'【OpenDesk 本地测试】'+h.rule.a);
    const assertLocked=()=>{
      const s=h.automation.status();assert.equal(s.mode,'locked');assert.equal(s.lastOutcome,'unknown');
      assert.equal(s.busy,false);assert.equal(s.queued,0);assert.equal(s.requests,1);
      assert.deepEqual(h.actions.map(a=>a.kind),['draft','send']);
    };
    assertLocked();h.native.draft='';h.ingest();
    for(const command of ['pause','takeover','revoke','resume','enable']){
      await h.command(command);h.message();await h.advance(10000);assertLocked();
    }
    h.native.customerId='t2';h.native.messages=[];h.ingest();
    await h.command('enable');h.message();await h.advance(60000);assertLocked();
    await h.automation.report();assert.equal(h.published.at(-1).mode,'locked');
  });
}

test('an existing manual draft takes over without being overwritten',async()=>{
  const h=harness();await h.command('enable');h.message();
  h.native.draft='人工编辑中，请勿覆盖';h.ingest();await h.advance(2000);
  assert.equal(h.automation.status().reason,'takeover');assert.equal(h.actions.length,0);
  assert.equal(h.native.draft,'人工编辑中，请勿覆盖');
});

test('last native agent reply invalidates a queued customer reply',async()=>{
  const h=harness();await h.command('enable');h.message();h.message('人工已回复','agent');
  await h.advance(2000);assert.equal(h.automation.status().reason,'takeover');
  assert.equal(h.actions.length,0);assert.equal(h.automation.status().requests,0);
});

test('last agent reply during a pending fresh read invalidates the in-flight request',async()=>{
  const pending=deferred();
  const h=harness({onRead:async(_env,n)=>{if(n===2)await pending.promise;}});
  await h.command('enable');h.message();await h.advance(600);
  assert.equal(h.automation.status().busy,true);h.message('已由人工答复','agent');
  pending.resolve();await settle();
  assert.equal(h.automation.status().reason,'takeover');assert.equal(h.actions.length,0);
  assert.equal(h.automation.status().busy,false);
});

for(const [label,question] of [
  ['no source','完全不相关的问题'],['similarity only','退款流程需要多久'],
  ['ineligible exact match','商品如何选尺码？'],['disabled knowledge','活动是否继续？'],
  ['scope restricted knowledge','A 方案支持几名成员？'],
]){
  test('knowledge '+label+' cannot authorize native input',async()=>{
    const h=harness();await h.command('enable');h.message(question);await h.advance(600);
    assert.equal(h.actions.length,0);assert.equal(h.automation.status().mode,'paused');
    assert.equal(h.automation.status().lastOutcome,'failed');
  });
}

test('conflicting actual knowledge rules refuse sending',async()=>{
  const h=harness({knowledge:rules=>rules.push({...rules[0],id:'conflicting-rule',a:'不同的业务承诺'})});
  await h.command('enable');h.message();await h.advance(600);
  assert.equal(h.actions.length,0);assert.equal(h.automation.status().mode,'paused');
});

test('successful send requires an independent fresh native agent observation after the receipt',async()=>{
  const pending=deferred();
  const h=harness({onRead:async(_env,n)=>{if(n===6)await pending.promise;}});
  await h.command('enable');h.message();await h.advance(600);
  assert.deepEqual(h.actions.map(a=>a.kind),['draft','send']);
  assert.equal(h.reads.length,6);assert.equal(h.automation.status().lastOutcome,null);
  assert.equal(h.automation.status().busy,true);
  const after=h.reads.at(-1).conversation;
  assert.equal(after.draft,'');assert.equal(after.messages.at(-1).who,'agent');
  assert.equal(after.messages.at(-1).text,'【OpenDesk 本地测试】'+h.rule.a);
  pending.resolve();await settle();await h.automation.report();
  assert.equal(h.automation.status().lastOutcome,'confirmed');assert.equal(h.automation.status().mode,'enabled');
  assert.equal(h.automation.status().busy,false);assert.equal(h.published.at(-1).lastOutcome,'confirmed');
});

test('observing this exact native reply during pending confirmation keeps the next message eligible',async()=>{
  const pending=deferred();
  const h=harness({onRead:async(env,n)=>{if(n===6){env.ingest();await pending.promise;}}});
  await h.command('enable');h.message();await h.advance(600);
  assert.equal(h.automation.status().busy,true);
  assert.equal(h.automation.status().mode,'enabled','own native reply is not human takeover');
  pending.resolve();await settle();
  assert.equal(h.automation.status().lastOutcome,'confirmed');
  const first=h.native.messages[0].id,second=h.message().id;
  assert.notEqual(first,second);await h.advance(600);
  assert.equal(h.automation.status().requests,2);
  assert.deepEqual(h.actions.map(a=>a.kind),['draft','send','draft','send']);
});

test('a separate human reply during native confirmation still takes over',async()=>{
  const pending=deferred();
  const h=harness({onRead:async(env,n)=>{if(n===6){
    env.append('agent','人工追加回复');env.ingest();await pending.promise;
  }}});
  await h.command('enable');h.message();await h.advance(600);
  assert.equal(h.automation.status().mode,'paused');
  assert.equal(h.automation.status().reason,'takeover');
  pending.resolve();await settle();h.message();await h.advance(2000);
  assert.equal(h.automation.status().requests,1);
  assert.equal(h.actions.length,2);
});

for(const outcome of ['failed','unknown','throw','unconfirmed']){
  test(outcome+' native send stops and never automatically replays',async()=>{
    const h=harness({action:async(request,env)=>{
      if(request.kind==='draft'){env.native.draft=request.text;return {status:'draft-verified'};}
      env.native.draft='';
      if(outcome==='throw')throw Error('native outcome unavailable');
      if(outcome==='unconfirmed')return {status:'sent',messageId:'t1-m999'};
      return {status:outcome};
    }});
    await h.command('enable');h.message();await h.advance(600);
    assert.deepEqual(h.actions.map(a=>a.kind),['draft','send']);
    assert.equal(h.automation.status().mode,outcome==='failed'?'paused':'locked');
    assert.equal(h.automation.status().lastOutcome,outcome==='failed'?'failed':'unknown');
    h.message();await h.advance(30000);assert.equal(h.actions.length,2);
    if(outcome!=='failed'){
      await h.command('resume');await h.command('enable');h.message();await h.advance(30000);
      assert.equal(h.automation.status().mode,'locked');assert.equal(h.actions.length,2);
    }
  });
}

test('draft action exception locks before send and cannot be retried by resume',async()=>{
  const h=harness({action:async()=>{throw Error('draft write may have occurred');}});
  await h.command('enable');h.message();await h.advance(600);
  assert.deepEqual(h.actions.map(a=>a.kind),['draft']);assert.equal(h.automation.status().mode,'locked');
  await h.command('resume');h.message();await h.advance(20000);assert.equal(h.actions.length,1);
});

test('stale stop command can pause the same scope, but stale enable/resume cannot grant authority',async()=>{
  const h=harness();const stale=clone(h.adapter.current.binding);
  await h.command('enable');h.message();assert.equal(h.adapter.matches(stale),false);
  await h.command('enable',stale);assert.equal(h.automation.status().queued,1);
  await h.command('pause',stale);await h.advance(2000);
  assert.equal(h.automation.status().mode,'paused');assert.equal(h.actions.length,0);
  await h.command('resume',stale);assert.equal(h.automation.status().mode,'paused');
  await h.command('resume');await h.advance(2000);assert.equal(h.actions.length,0);
  h.message();await h.advance(600);assert.equal(h.automation.status().lastOutcome,'confirmed');
});

test('a stop command from another scope cannot pause the selected customer',async()=>{
  const h=harness();await h.command('enable');h.message();
  await h.command('pause',{...h.adapter.current.binding,customerId:'t2'});
  assert.equal(h.automation.status().mode,'enabled');await h.advance(600);
  assert.equal(h.automation.status().lastOutcome,'confirmed');
});

test('lost host authorization blocks fresh input even without another ingested observation',async()=>{
  const h=harness();await h.command('enable');h.message();h.authorize(false);await h.advance(600);
  assert.equal(h.actions.length,0);assert.equal(h.automation.status().mode,'paused');
  await h.command('resume');assert.equal(h.automation.status().mode,'paused');
});
