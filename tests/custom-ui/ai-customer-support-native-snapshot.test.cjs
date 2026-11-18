// Execute each gate's real read/click helpers. Offline; no GUI/native evidence.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');

function harness(gate,options={}){
  const source=read('ai-customer-support-'+gate+'-native.js');
  const calls=[],snapshots=[],delays=[];
  const w={id:'darwin:42:native:80',pid:42,handle:80,x:10,y:10,width:380,height:620};
  let time=0,windows=0;
  const node={role:'button',name:'暂停观察',enabled:true,actions:['invoke'],
    bounds:{x:300,y:40,width:28,height:29,coordinateSpace:'screen'}};
  const current=async()=>({...w,...options.window?.(++windows,snapshots.length)});
  const ctx=vm.createContext({
    assert:(ok,message)=>assert.ok(ok,message),Date:{now:()=>time},
    idle:async()=>{},sleep:async ms=>{delays.push(ms);time+=options.sleepAdvance??ms;},
    wait:async predicate=>{assert.ok(await predicate(),'offline predicate must be ready');},
    assistant:current,assistantWindow:current,panel:{getState:async()=>({visible:true})},
    evidence:'/mock',File:{join:path.join,writeJSON:async()=>{}},log:()=>{},serial:0,
    mouse:{clickForPID:async(...args)=>{calls.push(args);if(options.inputError)throw options.inputError;}},
    Accessibility:{snapshot:async scope=>{
      snapshots.push(scope);
      assert.ok(scope.timeout>0&&scope.timeout<=1200);
      assert.equal(scope.within.id,w.id);assert.equal(scope.maxDepth,24);assert.equal(scope.maxNodes,1800);
      time+=options.snapshotCost??0;
      if(options.readError)throw options.readError;
      return {complete:true,truncated:false,root:{children:[node]},...options.state?.(snapshots.length)};
    }},
  });
  vm.runInContext(read('../../examples/ai-customer-support/desktop/native-adapter.js'),ctx);
  let helpers=source.slice(source.indexOf('  async function reactSnapshot('),source.indexOf('  const tree='));
  if(gate==='controlled'){
    helpers+=source.slice(source.indexOf('  const tree='),source.indexOf('  const nodes='));
    helpers+='\nconst nodes=snapshot=>OpenDeskSupportNative.nodes(snapshot);\n';
    helpers+=source.slice(source.indexOf('  const geometryKeys='),source.indexOf('  const fixture='));
  }else{
    const entry=gate==='r23'?'clickReact':'pressReact';
    const end=gate==='r23'?'\n  try{\n    // The foreground-only':'  async function click(';
    helpers+=source.slice(source.indexOf('  async function '+entry+'('),source.indexOf(end));
  }
  vm.runInContext(helpers,ctx);
  const run=()=>gate==='controlled'?
    ctx.perform(current,{role:node.role,name:node.name},{action:'invoke'},'test',true):
    ctx[gate==='r23'?'clickReact':'pressReact'](node.name,node.role);
  return {run,calls,snapshots,delays};
}
const lazy={complete:false,truncated:false,reason:'unmaterialized',stats:{maxDepth:2,nodes:7}};

for(const gate of ['r23','r30b','controlled']){
  for(const phase of [1,2]){
    test(gate+': transient unmaterialized at snapshot '+phase+' preserves two complete preflights and one click',async()=>{
      const h=harness(gate,{state:n=>n===phase?lazy:{}});await h.run();
      assert.equal(h.snapshots.length,3);assert.deepEqual(h.delays.filter(ms=>ms===100),[100]);
      assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],42);
    });
  }
  test(gate+': eight unmaterialized reads exhaust the attempt budget without input',async()=>{
    const h=harness(gate,{state:()=>lazy});await assert.rejects(h.run,/wait budget exhausted/);
    assert.equal(h.snapshots.length,8);assert.equal(h.delays.length,7);assert.deepEqual(h.calls,[]);
  });
  test(gate+': elapsed 1200ms refuses another snapshot without input',async()=>{
    const h=harness(gate,{state:()=>lazy,sleepAdvance:1200});await assert.rejects(h.run,/wait budget exhausted/);
    assert.equal(h.snapshots.length,1);assert.deepEqual(h.calls,[]);
  });
  test(gate+': a late complete snapshot cannot exceed the time budget',async()=>{
    const h=harness(gate,{snapshotCost:1200});await assert.rejects(h.run,/wait budget exhausted/);
    assert.equal(h.snapshots.length,1);assert.deepEqual(h.calls,[]);
  });
  for(const state of [{...lazy,truncated:true},{...lazy,reason:'maxNodes'},
    {...lazy,reason:undefined},{complete:true,truncated:true,reason:'unmaterialized'}]){
    test(gate+': other incomplete/truncated results stop immediately '+JSON.stringify(state),async()=>{
      const h=harness(gate,{state:()=>state});await assert.rejects(h.run,/snapshot incomplete/);
      assert.equal(h.snapshots.length,1);assert.deepEqual(h.delays,[]);assert.deepEqual(h.calls,[]);
    });
  }
  for(const key of ['id','pid','handle','x','y','width','height']){
    test(gate+': '+key+' changes during lazy wait: no second read or input',async()=>{
      const h=harness(gate,{state:()=>lazy,window:n=>n===4?{[key]:key==='id'?'other':999}:{}});
      await assert.rejects(h.run,/identity\/geometry changed/);
      assert.equal(h.snapshots.length,1);assert.deepEqual(h.calls,[]);
    });
  }
  test(gate+': identity change while acquiring a complete snapshot stops before input',async()=>{
    const h=harness(gate,{window:n=>n===3?{pid:43}:{}});
    await assert.rejects(h.run,/identity\/geometry changed/);assert.deepEqual(h.calls,[]);
  });
  test(gate+': native read exception is not retried',async()=>{
    const h=harness(gate,{readError:Object.assign(Error('native timeout'),{code:'TIMEOUT'})});
    await assert.rejects(h.run,/native timeout/);assert.equal(h.snapshots.length,1);assert.deepEqual(h.calls,[]);
  });
  test(gate+': unknown click is never replayed after lazy recovery',async()=>{
    const h=harness(gate,{state:n=>n===1?lazy:{},inputError:Error('unknown input')});
    await assert.rejects(h.run,/unknown input/);assert.equal(h.calls.length,1);assert.equal(h.snapshots.length,3);
  });
}
