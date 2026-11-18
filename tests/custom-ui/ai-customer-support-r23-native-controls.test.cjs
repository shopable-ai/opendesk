// Offline helper regression tests; these do not count as native gate evidence.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'ai-customer-support-r23-native.js'),'utf8');
const helper=source.slice(source.indexOf('  async function reactSnapshot('),source.indexOf('  const tree='))+source.slice(source.indexOf('  async function clickReact('),source.indexOf('\n  try{\n    // The foreground-only'));

function harness(options={}){
  const calls=[],windows=[],snapshots=[],ref={id:'owned-ref'};let finds=0;
  const w={pid:42,handle:80,x:10,y:10,width:380,height:620};
  const node={name:'原生窗口授权',role:'checkbox',checked:true,enabled:true,actions:['setChecked','invoke'],
    bounds:{x:30,y:900,width:100,height:30,coordinateSpace:'screen'},...options.node};
  const context=vm.createContext({
    assert:(ok,message)=>{if(!ok)throw Error(message);},idle:async()=>{},sleep:async()=>{},
    wait:async predicate=>{for(let i=0;i<2;i++)if(await predicate())return;throw Error('readback timeout');},
    panel:{getState:async()=>({visible:true})},assistantWindow:async()=>{
      const current={...w,...options.window?.(windows.length)};windows.push(current);return current;
    },
    File:{join:(...parts)=>parts.join('/'),writeJSON:async()=>{}},evidence:'/mock',log:()=>{},
    OpenDeskSupportNative:{nodes:s=>{assert.ok(s.complete&&!s.truncated,'AX snapshot incomplete');return s.nodes;}},
    mouse:{move:async()=>{calls.push({kind:'move'});},wheel:async()=>{
      calls.push({kind:'wheel'});if(options.scrollError)throw options.scrollError;
      if(!options.scrollNoChange)node.bounds={...node.bounds,y:node.bounds.y-(options.scrollStep??400)};
    },clickForPID:async(pid,x,y)=>{
      calls.push({kind:'mouse',pid,x,y});if(options.mouseError)throw options.mouseError;
      if(options.readback!==true)node.checked=false;
    }},
    Accessibility:{
      snapshot:async scope=>{
        snapshots.push(scope.within);
        const current={...node,...options.snapshot?.(snapshots.length)};
        return {complete:true,truncated:false,nodes:options.ambiguous?[current,current]:[current]};
      },
      find:async(selector,scope)=>{
        calls.push({kind:'find',selector,scope});
        const error=options.findError?.(++finds);if(error)throw error;return ref;
      },
      perform:async(actualRef,action)=>{
        calls.push({kind:'perform',ref:actualRef,action});
        if(options.error)throw options.error;
        return {actionState:options.actionState||'acknowledged'};
      },
      read:async actualRef=>{
        calls.push({kind:'read',ref:actualRef});
        return {properties:{role:node.role,name:node.name,checked:options.readback??false}};
      },
      release:async actualRef=>{calls.push({kind:'release',ref:actualRef});},
    },
  });
  vm.runInContext(helper,context);
  return {calls,windows,snapshots,ref,w,run:()=>context.clickReact(node.name,node.role,{action:'setChecked',checked:false}),
    invoke:()=>context.clickReact(node.name,node.role,{action:'invoke'})};
}

test('an offscreen control scrolls into the exact panel before one PID press',async()=>{
  const h=harness();await h.run();
  assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel','mouse']);
  const press=h.calls.at(-1);assert.equal(press.pid,42);assert.ok(press.y>10&&press.y<630);
});
test('an unobserved scroll is never followed by input or another scroll',async()=>{
  const h=harness({scrollNoChange:true});await assert.rejects(h.run,/readback timeout/);
  assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel']);
});
test('a scroll exception is not retried',async()=>{
  const h=harness({scrollError:Error('unknown scroll')});await assert.rejects(h.run,/unknown scroll/);
  assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel']);
});
test('scroll attempts are finite even when tiny observed movements never reveal the control',async()=>{
  const h=harness({scrollStep:2});await assert.rejects(h.run,/scroll budget/);
  assert.equal(h.calls.filter(c=>c.kind==='wheel').length,8);
  assert.equal(h.calls.filter(c=>c.kind==='mouse').length,0);
});
for(const options of [{ambiguous:true},{node:{enabled:false}},{node:{bounds:{x:500,y:900,width:40,height:30,coordinateSpace:'screen'}}}]){
  test('unqualified scope cannot scroll or press '+JSON.stringify(options),async()=>{
    const h=harness(options);await assert.rejects(h.run);assert.equal(h.calls.length,0);
  });
}
test('an already satisfied offscreen checkbox causes no input',async()=>{
  const h=harness({node:{checked:false}});await h.run();assert.equal(h.calls.length,0);
});

const visibleBounds={x:300,y:40,width:28,height:29,coordinateSpace:'screen'};
test('visible titlebar pause uses one PID press after two snapshots, never AX find',async()=>{
  const h=harness({node:{name:'暂停观察',role:'button',bounds:visibleBounds},findError:()=>Object.assign(Error("stale"),{code:"STALE_TARGET"})});
  await h.invoke();assert.deepEqual(h.calls,[{kind:'mouse',pid:42,x:314,y:54.5}]);
  assert.equal(h.snapshots.length,2);assert.equal(h.windows.length,7);
});
test('visible checkbox uses one PID press and independent snapshot readback',async()=>{
  const h=harness({node:{bounds:visibleBounds}});await h.run();
  assert.deepEqual(h.calls.map(c=>c.kind),['mouse']);assert.equal(h.snapshots.length,3);
});
test('checkbox newly satisfied at final snapshot is not toggled',async()=>{
  const h=harness({node:{bounds:visibleBounds},snapshot:n=>n===2?{checked:false}:{}});await h.run();
  assert.deepEqual(h.calls,[]);
});
test('changed exact control bounds stop before the PID press',async()=>{
  const h=harness({node:{bounds:visibleBounds},snapshot:n=>n===2?{bounds:{...visibleBounds,x:301}}:{}});
  await assert.rejects(h.run,/bounds changed/);assert.deepEqual(h.calls,[]);
});
test('changed final window geometry stops before the PID press',async()=>{
  const h=harness({node:{bounds:visibleBounds},window:n=>n===2?{width:381}:{}});
  await assert.rejects(h.run,/moved before PID press|identity\/geometry changed/);assert.deepEqual(h.calls,[]);
});
test('ambiguous fresh snapshot stops before the PID press',async()=>{
  const h=harness({node:{bounds:visibleBounds},snapshot:n=>n===2?{name:'other control'}:{}});
  await assert.rejects(h.run,/target changed/);assert.deepEqual(h.calls,[]);
});
test('uncertain PID press never retries or falls back to native refs',async()=>{
  const h=harness({node:{bounds:visibleBounds},mouseError:Error('unknown press outcome')});
  await assert.rejects(h.run,/unknown press outcome/);assert.deepEqual(h.calls.map(c=>c.kind),['mouse']);
});
test('PID press success alone cannot satisfy incorrect checkbox readback',async()=>{
  const h=harness({node:{bounds:visibleBounds},readback:true});
  await assert.rejects(h.run,/readback timeout/);assert.deepEqual(h.calls.map(c=>c.kind),['mouse']);
});
