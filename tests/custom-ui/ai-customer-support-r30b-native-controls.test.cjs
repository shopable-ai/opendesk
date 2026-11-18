// Offline helper regression tests; these do not count as native gate evidence.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'ai-customer-support-r30b-native.js'),'utf8');
const helper=source.slice(source.indexOf('  async function reactSnapshot('),source.indexOf('  const tree='))+source.slice(source.indexOf('  async function pressReact('),source.indexOf('  async function editReply('));

function harness(options={}){
  const calls=[],windows=[],snapshots=[],ref={id:'owned-ref'};let finds=0;
  const w={pid:42,handle:80,x:10,y:10,width:380,height:620};
  const node={name:'原生窗口授权',role:'checkbox',checked:true,enabled:true,actions:['setChecked','invoke'],
    bounds:{x:30,y:900,width:100,height:30,coordinateSpace:'screen'},...options.node};
  const context=vm.createContext({
    assert:(ok,message)=>{if(!ok)throw Error(message);},idle:async()=>{},sleep:async()=>{},
    wait:async predicate=>{for(let i=0;i<2;i++)if(await predicate())return;throw Error('readback timeout');},
    panel:{getState:async()=>({visible:true})},assistant:async()=>{
      const current={...w,...options.window?.(windows.length)};windows.push(current);return current;
    },
    File:{join:(...parts)=>parts.join('/'),writeJSON:async()=>{}},evidence:'/mock',log:()=>{},
    OpenDeskSupportNative:{nodes:s=>{
      assert.ok(s.complete&&!s.truncated,'AX snapshot incomplete');
      const out=[];const visit=n=>{out.push(options.copyNodes?{...n}:n);for(const c of n.children||[])visit(c);};visit(s.root);return out;
    }},
    mouse:{move:async()=>{calls.push({kind:'move'});if(options.moveError)throw options.moveError;},wheel:async({deltaY})=>{
      calls.push({kind:'wheel'});if(options.scrollError)throw options.scrollError;
      if(!options.scrollNoChange)node.bounds={...node.bounds,y:node.bounds.y-Math.sign(deltaY)*(options.scrollStep??400)};
    },clickForPID:async(pid,x,y)=>{
      calls.push({kind:'mouse',pid,x,y});if(options.mouseError)throw options.mouseError;
      if(options.readback!==true)node.checked=options.desiredChecked??false;
    }},
    Accessibility:{
      snapshot:async scope=>{
        assert.ok(!scope.properties.includes('value'),'React whole snapshot must not request value');
        snapshots.push(scope.within);
        const current={...node,...options.snapshot?.(snapshots.length)};
        const children=options.ambiguous||options.ambiguousFresh&&snapshots.length===2?[current,current]:[current];
        const footer={role:'group',bounds:{x:10,y:500,width:380,height:130,coordinateSpace:'screen'},children:[
          {role:'button',name:'→ 填入聊天草稿',bounds:{x:30,y:520,width:260,height:35,coordinateSpace:'screen'}},
          ...(options.inFooter?children:[])]};
        return {complete:options.complete??true,truncated:options.truncated??false,root:{children:options.replyPanel?[
          {role:'group',name:'推荐回复',bounds:{x:10,y:100,width:380,height:530,coordinateSpace:'screen'},
            children:[...(!options.inFooter?children:[]),footer]}]:children}};
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
  return {calls,windows,snapshots,ref,w,run:()=>context.pressReact(node.name,node.role,{action:'setChecked',checked:false}),
    select:()=>context.chooseVersion(/^知识建议 · 版本 2：/),
    invoke:()=>context.pressReact(node.name,node.role,{action:'invoke'})};
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
test('a reply control hidden by the fixed footer must scroll before any press',async()=>{
  const h=harness({replyPanel:true,node:{bounds:{x:30,y:520,width:100,height:17,coordinateSpace:'screen'}},scrollStep:300});
  await h.run();assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel','mouse']);
  assert.ok(h.calls.at(-1).y>100&&h.calls.at(-1).y<500);
});
test('a reply control under the header scrolls upward before any press',async()=>{
  const h=harness({replyPanel:true,node:{bounds:{x:30,y:80,width:100,height:17,coordinateSpace:'screen'}},scrollStep:150});
  await h.run();assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel','mouse']);
  assert.ok(h.calls.at(-1).y>100&&h.calls.at(-1).y<500);
});
test('actual fixed-footer controls remain directly operable',async()=>{
  const h=harness({replyPanel:true,inFooter:true,node:{bounds:{x:300,y:520,width:28,height:29,coordinateSpace:'screen'}}});
  await h.run();assert.deepEqual(h.calls.map(c=>c.kind),['mouse']);
});
test('native node wrappers need not preserve JavaScript object identity for clipping',async()=>{
  const h=harness({replyPanel:true,copyNodes:true,node:{bounds:{x:30,y:520,width:100,height:17,coordinateSpace:'screen'}},scrollStep:300});
  await h.run();assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel','mouse']);
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
test('renamed fresh target stops before the PID press',async()=>{
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

for(const field of ['pid','handle','x','y','width','height'])for(const phase of [1,2]){
  test(`fresh window ${field} changes at phase ${phase}: no input`,async()=>{
    const base={pid:42,handle:80,x:10,y:10,width:380,height:620};
    const h=harness({node:{bounds:visibleBounds},window:n=>n===phase?{[field]:base[field]+1}:{}});
    await assert.rejects(h.run);assert.deepEqual(h.calls,[]);
  });
}
for(const options of [{complete:false},{truncated:true},{node:{bounds:null}},
  {node:{bounds:{...visibleBounds,x:NaN}}},{node:{bounds:{...visibleBounds,width:0}}},
  {node:{bounds:{...visibleBounds,coordinateSpace:'image'}}},
  {node:{actions:[]}},{node:{checked:null}}]){
  test('invalid observation refuses input '+JSON.stringify(options),async()=>{
    const h=harness(options);await assert.rejects(h.run);assert.deepEqual(h.calls,[]);
  });
}
test('window movement after pointer move prevents wheel dispatch',async()=>{
  const h=harness({window:n=>n===5?{x:11}:{}});
  await assert.rejects(h.run,/moved before wheel/);assert.deepEqual(h.calls.map(c=>c.kind),['move']);
});
test('changed PID during scroll readback prevents reacquisition or click',async()=>{
  const h=harness({window:n=>n===6?{pid:43}:{}});
  await assert.rejects(h.run,/identity changed during scroll/);
  assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel']);
});
test('version selection requests checked true, never toggles an already selected version',async()=>{
  const h=harness({node:{name:'知识建议 · 版本 2：真实答案',checked:true,bounds:visibleBounds}});
  await h.select();assert.equal(h.calls.length,0);
});
test('an offscreen unselected answer version scrolls, presses once and reads checked true',async()=>{
  const h=harness({node:{name:'知识建议 · 版本 2：真实答案',checked:false},desiredChecked:true});
  await h.select();assert.deepEqual(h.calls.map(c=>c.kind),['move','wheel','mouse']);
});

// Exercise the real helpers with the production snapshot completeness parser.
function readingHarness(options={}){
  const calls=[],treesRead=[],w={pid:42,handle:80,x:10,y:10,width:380,height:620};
  const bounds={x:30,y:200,width:300,height:100,coordinateSpace:'screen'};
  let value='实际 AI 原文',reads=0,trees=0,windows=0,sectionReads=0;
  const ctx=vm.createContext({
    assert:(ok,message)=>assert.ok(ok,message),idle:async()=>{},log:()=>{},
    assistant:async()=>({...w,...options.window?.(++windows)}),
    tree:async(within,values=false)=>{
      treesRead.push({within,values});
      if(within.id==='section'){
        assert.equal(values,true);
        const error=options.sectionError?.(++sectionReads);if(error)throw error;
        return {complete:options.complete??true,truncated:false,root:{name:within.name,children:[
          {value:within.name.startsWith('审核')?'req-1 · 版本、生效期及适用条件':'可以选的类型还挺全的'}]}};
      }
      assert.equal(values,false,'React whole tree must never request value');
      trees++;
      const editor={role:'textField',name:'编辑知识建议',focused:true,enabled:true,bounds,
        ...options.editor?.(trees)};
      return {complete:options.complete??true,truncated:false,root:{children:[editor,
        {role:'group',name:'审核元数据 req-1',children:[{value:'req-1 · 版本、生效期及适用条件'}]},
        {role:'group',name:'来源原文 doc-1 req-1',children:[{value:'可以选的类型还挺全的'}]},
        ...(options.duplicateSection?[{name:'审核元数据 req-1'}]:[])]}};
    },
    File:{join:(...parts)=>parts.join('/'),writeJSON:async(p,data)=>calls.push({kind:'evidence',data})},
    evidence:'/mock',getRender:()=>({replyText:value}),
    Accessibility:{
      find:async(selector,scope)=>{calls.push({kind:'find',selector,scope});return selector.role==='textField'?{id:'editor'}:{id:'section',name:selector.name};},
      read:async()=>{
        calls.push({kind:'read'});reads++;
        return {properties:{role:'textField',name:'编辑知识建议',focused:true,value,
          ...options.read?.(reads)}};
      },
      perform:async(ref,action)=>{
        calls.push({kind:'perform',action});
        if(options.error)throw options.error;
        value=action.value;return {actionState:options.actionState??'acknowledged'};
      },
      release:async()=>calls.push({kind:'release'}),
    },
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../../examples/ai-customer-support/desktop/native-adapter.js'),'utf8'),ctx);
  vm.runInContext(source.slice(source.indexOf('  async function control('),source.indexOf('  async function shot(')),ctx);
  // Completion is checked here as a handoff; its actual PID press is covered above.
  ctx.click=async name=>calls.push({kind:'done',name});
  return {calls,treesRead,edit:()=>ctx.editReply('实际 AI 原文','实际 AI 原文 已人工核对。'),
    section:name=>ctx.sectionText(name)};
}
test('native manual edit uses the exact window ref, readbacks, release, then completion',async()=>{
  const h=readingHarness();await h.edit();
  assert.deepEqual(h.calls.map(c=>c.kind),['find','read','read','perform','read','evidence','release','done']);
  const scope=h.calls[0].scope.within;
  assert.equal(scope.pid,42);assert.equal(scope.handle,80);assert.equal(scope.root,undefined);
  assert.equal(h.calls.find(c=>c.kind==='perform').action.value,'实际 AI 原文 已人工核对。');
  assert.equal(h.calls.at(-1).name,'完成编辑');
});
for(const options of [
  {read:()=>({focused:false})},{read:()=>({value:'他人刚编辑的内容'})},
  {editor:n=>n===2?{focused:false}:{}},{read:n=>n===2?{value:'他人刚编辑的内容'}:{}},
  {window:n=>n===3?{handle:81}:{}},{window:n=>n===5?{pid:43}:{}},
  {editor:n=>n===2?{bounds:{x:31,y:200,width:300,height:100,coordinateSpace:'screen'}}:{}},
])test('editor preflight rejects changed focus, value or scope '+JSON.stringify(options),async()=>{
  const h=readingHarness(options);await assert.rejects(h.edit);
  assert.equal(h.calls.filter(c=>c.kind==='perform'||c.kind==='done').length,0);
  assert.equal(h.calls.at(-1).kind,'release');
});
for(const options of [{actionState:'unknown'},
  {error:Object.assign(Error('unknown native edit'),{code:'TIMEOUT',actionState:'unknown'})}]){
  test('unknown native edit stops without retry, readback or completion '+JSON.stringify(options),async()=>{
    const h=readingHarness(options);await assert.rejects(h.edit);
    assert.deepEqual(h.calls.map(c=>c.kind),['find','read','read','perform','release']);
  });
}
test('mismatched independent native value readback refuses completion',async()=>{
  const h=readingHarness({read:n=>n===3?{value:'different actual value'}:{}});
  await assert.rejects(h.edit,/readback differs/);
  assert.equal(h.calls.filter(c=>c.kind==='perform').length,1);
  assert.equal(h.calls.filter(c=>c.kind==='done').length,0);
});
test('review value reads are confined to the unique source section, never the whole React tree',async()=>{
  const h=readingHarness();
  const metadata=await h.section('审核元数据 req-1'),original=await h.section('来源原文 doc-1 req-1');
  assert.equal(metadata.root.children[0].value,'req-1 · 版本、生效期及适用条件');
  assert.equal(original.root.children[0].value,'可以选的类型还挺全的');
  assert.deepEqual(h.calls.map(c=>c.kind),['find','release','find','release']);
  assert.equal(h.treesRead.filter(r=>r.values).length,2);
  assert.ok(h.treesRead.filter(r=>r.values).every(r=>r.within.id==='section'));
});
test('a stale read-only source ref is released and found once within a fresh exact window',async()=>{
  const stale=Object.assign(Error('stale calibration'),{code:'STALE_TARGET',actionState:'not_started'});
  const h=readingHarness({sectionError:n=>n===1?stale:null});
  await h.section('审核元数据 req-1');
  assert.deepEqual(h.calls.map(c=>c.kind),['find','release','find','release']);
  const finds=h.calls.filter(c=>c.kind==='find');
  assert.notEqual(finds[0].scope.within,finds[1].scope.within);
  assert.equal(finds[1].scope.within.pid,42);assert.equal(finds[1].scope.within.handle,80);
});
test('read-only stale errors without an actionState also reacquire once',async()=>{
  const h=readingHarness({sectionError:n=>n===1?Object.assign(Error('stale read'),{code:'STALE_TARGET'}):null});
  await h.section('审核元数据 req-1');
  assert.deepEqual(h.calls.map(c=>c.kind),['find','release','find','release']);
});
for(const error of [Object.assign(Error('stale'),{code:'STALE_TARGET',actionState:'unknown'}),
  Object.assign(Error('timeout'),{code:'TIMEOUT',actionState:'not_started'})]){
  test('other source read failures do not reacquire '+error.code+'/'+error.actionState,async()=>{
    const h=readingHarness({sectionError:()=>error});await assert.rejects(()=>h.section('审核元数据 req-1'));
    assert.deepEqual(h.calls.map(c=>c.kind),['find','release']);
  });
}
test('repeated stale source reads stop after two reads without any input',async()=>{
  const h=readingHarness({sectionError:()=>Object.assign(Error('stale'),{code:'STALE_TARGET',actionState:'not_started'})});
  await assert.rejects(()=>h.section('审核元数据 req-1'));
  assert.deepEqual(h.calls.map(c=>c.kind),['find','release','find','release']);
});
test('a moved window after stale source read prevents another find',async()=>{
  const h=readingHarness({sectionError:()=>Object.assign(Error('stale'),{code:'STALE_TARGET',actionState:'not_started'}),
    window:n=>n===5?{x:11}:{}});
  await assert.rejects(()=>h.section('审核元数据 req-1'));
  assert.deepEqual(h.calls.map(c=>c.kind),['find','release']);
});
for(const options of [{complete:false},{duplicateSection:true},{window:n=>n===2?{handle:81}:{}}]){
  test('review refuses incomplete, ambiguous or replaced window '+JSON.stringify(options),async()=>{
    const h=readingHarness(options);await assert.rejects(()=>h.section('审核元数据 req-1'));
    assert.deepEqual(h.calls,[]);
  });
}

for(const options of [{ambiguousFresh:true},{snapshot:n=>n===2?{enabled:false}:{}},
  {snapshot:n=>n===2?{checked:null}:{}},{snapshot:n=>n===2?{actions:[]}:{} }]){
  test('fresh control ambiguity, disabled state or unavailable action stops before press '+String(options.snapshot||'ambiguous'),async()=>{
    const h=harness({node:{bounds:visibleBounds},...options});
    await assert.rejects(h.run);assert.deepEqual(h.calls,[]);
  });
}
for(const actionState of ['unknown','not_started'])test(`fixture ${actionState} stops and releases without replay`,async()=>{
  const calls=[];
  const ctx=vm.createContext({
    assert:(ok,message)=>assert.ok(ok,message),chat:async()=>({pid:42,handle:80}),
    Accessibility:{find:async()=>({id:'fixture'}),
      perform:async()=>{calls.push('perform');return {actionState};},release:async()=>calls.push('release')},
  });
  vm.runInContext(source.slice(source.indexOf('  async function act('),source.indexOf('  const assistant=')),ctx);
  await assert.rejects(()=>ctx.act('support.add-message',{action:'invoke'}),/unknown; no retry/);
  assert.deepEqual(calls,['perform','release']);
});
