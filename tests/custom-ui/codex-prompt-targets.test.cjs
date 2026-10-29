'use strict';
// In-memory dependency tests only; no desktop access or application enumeration.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,
  '../../examples/custom-ui/codex-prompt-shortcuts/targets.js'),'utf8');
function load(){
  const context=vm.createContext({});
  vm.runInContext(source,context);
  return context.OpenDeskPromptTargets;
}
const plain=value=>structuredClone(value);
const key=app=>JSON.stringify(app);
const alpha={bundleId:'test.fixture.alpha'};
const beta={path:'/fixtures/Beta.app'};
const profile=(id,app)=>({id,name:id,app,contentArea:()=>null});

const sceneWindow={id:'darwin:17:native:19',pid:17,handle:19,exePath:'/Applications/Claude.app/Contents/MacOS/Claude',
  x:100,y:100,width:1200,height:800};
const axNode=(role,name,children=[],extra={})=>({role,name,children,enabled:true,...extra});
function codeTree(){
  return {complete:true,truncated:false,root:axNode('window','Claude',[
    axNode('unknown','session title',[
      axNode('unknown','Claude Code',[],{nativeRole:'AXHeading'}),
      axNode('group','Primary pane',[
        axNode('checkbox','Terminal'),axNode('checkbox','Files'),
        axNode('textField','Prompt',[],{nativeRole:'AXTextArea',identifier:null,
          bounds:{x:420,y:800,width:700,height:55,coordinateSpace:'screen'}}),
      ],{bounds:{x:400,y:110,width:890,height:780,coordinateSpace:'screen'}}),
    ],{nativeRole:'AXWebArea'}),
  ])};
}
test('Claude scoped adapter is frozen, bounded and requires its Code scene gate',()=>{
  const api=load();
  const registry=api.createRegistry({profiles:[],scope:{pid:17,exePath:sceneWindow.exePath,profile:'claude-code'}});
  const saved=registry.matchPid(17).profile;
  assert.equal(saved.scene,'claude-code');assert.equal(Object.isFrozen(saved),true);
  assert.deepEqual(plain(saved.editorSelector),{role:'textField',name:'Prompt'});
  const custom=fixture([{...profile('custom',{path:'/Applications/Claude.app'}),layout:undefined}]);
  assert.equal(custom.registry.getProfile('custom').scene,'claude-code');
});
test('Code scene requires one complete document, native controls, unique composer and calibrated bounds',async()=>{
  const api=load();let calls=0;
  const result=await api.inspectClaudeCode({window:sceneWindow,Accessibility:{snapshot:async options=>{
    calls++;assert.deepEqual(plain(options.within),sceneWindow);assert.equal(options.maxDepth,64);
    assert.equal(options.properties.includes('value'),false);return codeTree();
  }}});
  assert.equal(calls,1);
  assert.deepEqual(plain(result.composer),{x:320,y:700,width:700,height:55,source:'accessibility',composerMeasured:true});
});
for(const change of ['heading','terminal','files','duplicate','outside-pane','other-document'])
test('Code scene rejects '+change+' instead of accepting a generic chat composer',async()=>{
  const tree=codeTree(),doc=tree.root.children[0],pane=doc.children[1];
  if(change==='heading')doc.children[0].name='Claude';
  if(change==='terminal')pane.children[0].name='Chat';
  if(change==='files')pane.children.splice(1,1);
  if(change==='duplicate')pane.children.push(structuredClone(pane.children[2]));
  if(change==='outside-pane')doc.children.push(pane.children.pop());
  if(change==='other-document')tree.root.children.push(axNode('unknown','other',[doc.children.shift()],{nativeRole:'AXWebArea'}));
  assert.equal(await load().inspectClaudeCode({window:sceneWindow,Accessibility:{snapshot:async()=>tree}}),null);
});
for(const change of ['incomplete','truncated','bounds','disabled','nativeRole'])
test('Code scene fails closed on '+change,async()=>{
  const tree=codeTree(),field=tree.root.children[0].children[1].children[2];
  if(change==='incomplete')tree.complete=false;
  if(change==='truncated')tree.truncated=true;
  if(change==='bounds')field.bounds.height=0;
  if(change==='disabled')field.enabled=false;
  if(change==='nativeRole')field.nativeRole='AXTextField';
  await assert.rejects(load().inspectClaudeCode({window:sceneWindow,Accessibility:{snapshot:async()=>tree}}),
    {code:['incomplete','truncated'].includes(change)?'SEARCH_INCOMPLETE':'COMPOSER_UNAVAILABLE'});
});
test('editor evidence is explicit, bounded and frozen with its target profile',()=>{
  const editorSelector={role:'textField',identifier:'fixture-composer'};
  const h=fixture([{...profile('alpha',alpha),editorSelector}]);
  editorSelector.identifier='changed';
  const saved=h.registry.getProfile('alpha').editorSelector;
  assert.deepEqual(plain(saved),{role:'textField',identifier:'fixture-composer'});
  assert.equal(Object.isFrozen(saved),true);
  for(const invalid of [{},{role:'button',name:'Send'},{role:'textField'},
    {role:'textField',name:' '},{role:'textField',identifier:'x',unknown:true}])
    assert.throws(()=>fixture([{...profile('alpha',alpha),editorSelector:invalid}]));
});
function group(app,pids,instances=[]){
  const kind=Object.keys(app)[0];
  return {identity:{kind,value:app[kind]},pids,instances,running:true};
}
function fixture(profiles){
  const groups=new Map(),calls=[];
  const App={get(app){calls.push(plain(app));return groups.get(key(app))||null;},
    list(){assert.fail('Global enumeration is forbidden');}};
  const helper=load();
  return {groups,calls,App,helper,registry:helper.createRegistry({App,profiles})};
}

test('two simultaneous stable app adapters follow current membership and closure',()=>{
  const h=fixture([profile('alpha',alpha),profile('beta',beta)]);
  const a=group(alpha,[11,12],[{pid:11}]),b=group(beta,[],[{pid:22}]);
  h.groups.set(key(alpha),a);h.groups.set(key(beta),b);
  const match=h.registry.matchPid(12);
  assert.equal(match.profileId,'alpha');assert.equal(match.group,a);
  assert.equal(match.identity,a.identity);
  assert.equal(match.profile,h.registry.getProfile('alpha'));
  assert.equal(h.registry.matchPid(22).profileId,'beta');
  assert.deepEqual(h.calls,[alpha,beta,alpha,beta]);
  h.groups.set(key(alpha),group(alpha,[33]));
  assert.equal(h.registry.matchPid(12),null);
  assert.equal(h.registry.matchPid(33).profileId,'alpha');
  h.groups.delete(key(alpha));
  assert.equal(h.registry.matchPid(33),null);
  assert.equal(h.registry.matchPid(22).profileId,'beta');
  h.groups.delete(key(beta));assert.equal(h.registry.matchPid(22),null);
  assert.equal(h.registry.getProfile('missing'),null);
});

test('duplicate entries within one group are one match; overlapping profiles are ambiguous',()=>{
  const h=fixture([profile('alpha',alpha),profile('beta',beta)]);
  h.groups.set(key(alpha),group(alpha,[7,7],[{pid:7},{pid:7}]));
  assert.equal(h.registry.matchPid(7).profileId,'alpha');
  h.groups.set(key(beta),group(beta,[],[{pid:7}]));
  assert.equal(h.registry.matchPid(7),null);
  const duplicate=fixture([profile('one',alpha),profile('two',alpha)]);
  duplicate.groups.set(key(alpha),group(alpha,[7]));
  assert.equal(duplicate.registry.matchPid(7),null);
});

test('override queries only the configured bundle and never falls back',()=>{
  const h=fixture([profile('alpha',alpha),profile('beta',beta)]);
  h.groups.set(key(alpha),group(alpha,[7]));
  h.groups.set(key(beta),group(beta,[7]));
  const match=h.registry.matchPid(7,alpha.bundleId);
  assert.equal(match.profileId,'configured');assert.equal(match.profile.id,'configured');
  assert.deepEqual(plain(match.profile.app),alpha);
  assert.deepEqual(h.calls,[alpha]);
  assert.equal(h.registry.matchPid(7,'test.fixture.missing'),null);
  assert.deepEqual(h.calls,[alpha,{bundleId:'test.fixture.missing'}]);
  assert.equal(h.registry.matchPid(7,''),null); // automatic overlap remains ambiguous
  for(const value of [null,23,' ',' /tmp/App.app','bad/id'])
    assert.equal(h.registry.matchPid(7,value),null);
  h.groups.delete(key(alpha));assert.equal(h.registry.matchPid(7,alpha.bundleId),null);
});

test('explicit known bundle preserves its application-specific content adapter',()=>{
  const area=win=>({x:120,y:50,width:win.width-160,height:win.height-250,
    source:'fixture-profile',composerMeasured:false});
  const h=fixture([{...profile('alpha',alpha),contentArea:area},profile('beta',beta)]);
  h.groups.set(key(alpha),group(alpha,[7]));
  const match=h.registry.matchPid(7,alpha.bundleId);
  assert.equal(match.profile.contentArea,area);
  assert.deepEqual(plain(match.profile.contentArea({width:900,height:700})),
    {x:120,y:50,width:740,height:450,source:'fixture-profile',composerMeasured:false});
  assert.deepEqual(h.calls,[alpha]);
  const unknown={bundleId:'test.fixture.other'};
  h.groups.set(key(unknown),group(unknown,[8]));
  const fallbackProfile=h.registry.matchPid(8,unknown.bundleId).profile;
  assert.deepEqual(plain(fallbackProfile.layout),{sidebarWidth:0,gap:16,top:16,bottom:16,right:16});
  const fallback=fallbackProfile.contentArea({width:900,height:700});
  assert.equal(fallbackProfile.contentArea({width:32,height:700}),null);
  assert.equal(fallbackProfile.contentArea({width:900,height:32}),null);
  assert.deepEqual(plain(fallback),{x:16,y:16,width:868,height:668,
    source:'window-relative-fallback',composerMeasured:false});
});

test('explicit bundle with conflicting layout profiles is rejected before querying',()=>{
  const h=fixture([profile('one',alpha),profile('two',alpha)]);
  h.groups.set(key(alpha),group(alpha,[7]));
  assert.equal(h.registry.matchPid(7,alpha.bundleId),null);
  assert.equal(h.calls.length,0);
});

test('default Codex retains its user-accepted window-relative layout',()=>{
  const h=fixture(undefined),app={bundleId:'com.openai.codex'};
  assert.deepEqual(plain(h.helper.defaultProfiles.find(p=>p.id==='codex').app),app);
  h.groups.set(key(app),group(app,[9]));
  const match=h.registry.matchPid(9),win=Object.freeze({x:400,y:300,width:900,height:600});
  const expected={x:316,y:16,width:568,height:568,
    source:'window-relative-default',composerMeasured:false};
  assert.deepEqual(plain(match.profile.contentArea(win)),expected);
  assert.deepEqual(plain(match.profile.contentArea({...win,x:-800,y:-300})),expected);
  assert.deepEqual(plain(h.registry.matchPid(9,app.bundleId).profile.contentArea(win)),expected);
  for(const value of [null,{}, {width:332,height:600},{width:900,height:32},
    {width:331,height:600},{width:900,height:31},{width:-1,height:-1},
    {width:NaN,height:600},{width:900,height:Infinity},{width:'900',height:600}])
    assert.equal(match.profile.contentArea(value),null);
});

test('invalid profiles fail closed before any query, including duplicate IDs',()=>{
  const {createRegistry}=load();let reads=0;
  const App={get(){reads++;return null;}};
  const good=profile('alpha',alpha);
  for(const profiles of [null,{},[null],[{...good,id:''}],[{...good,id:'configured'}],
    [good,good],[{...good,name:' '}],[{...good,contentArea:null}],
    ...[{}, {pid:7},{name:'Alpha'},{bundleId:''},{bundleId:' test.app'},
      {bundleId:'bad/id'},{bundleId:'a',path:'/App.app'},{path:'relative/App.app'}]
      .map(app=>[{...good,app}])])
    assert.throws(()=>createRegistry({App,profiles}),{name:'TypeError'});
  assert.throws(()=>createRegistry({App:{},profiles:[]}),{name:'TypeError'});
  assert.equal(reads,0);
});

test('profile snapshots resist caller retargeting; registry and defaults stay independent',()=>{
  const input=profile('alpha',{...alpha}),h=fixture([input]);
  input.app.bundleId='test.changed';input.id='changed';
  h.groups.set(key(alpha),group(alpha,[4]));
  assert.equal(h.registry.matchPid(4).profileId,'alpha');
  assert.equal(h.registry.getProfile('changed'),null);
  assert.equal(Object.isFrozen(h.registry.getProfile('alpha').app),true);
  assert.equal(fixture([]).registry.getProfile('codex'),null);
});

test('invalid PIDs or inconsistent identity never produce a match',()=>{
  const h=fixture([profile('alpha',alpha),profile('beta',beta)]);
  for(const pid of [0,-1,1.5,NaN,Infinity,'7',null,Number.MAX_SAFE_INTEGER+1])
    assert.equal(h.registry.matchPid(pid),null);
  assert.equal(h.calls.length,0);
  h.groups.set(key(alpha),{pids:[7],identity:{kind:'name',value:'Alpha'}});
  assert.equal(h.registry.matchPid(7),null);
  h.groups.set(key(alpha),{pids:[7],identity:{kind:'bundleId',value:'test.wrong'}});
  assert.equal(h.registry.matchPid(7),null);
});

test('candidate read errors propagate unchanged without returning partial matches',()=>{
  for(const code of ['PERMISSION_DENIED','BACKEND_FAILED']){
    for(const failingApp of [alpha,beta]){
      const h=fixture([profile('alpha',alpha),profile('beta',beta)]);
      const cause=new Error('native failure');
      const error=Object.freeze(Object.assign(new Error('snapshot unavailable'),{code,cause}));
      h.groups.set(key(alpha),group(alpha,[7]));
      h.groups.set(key(beta),group(beta,[7]));
      h.App.get=function(app){
        h.calls.push(plain(app));
        if(key(app)===key(failingApp))throw error;
        return h.groups.get(key(app));
      };
      let selected=null;
      assert.throws(()=>{selected=h.registry.matchPid(7);},actual=>actual===error);
      assert.equal(selected,null);
      assert.deepEqual(h.calls,failingApp===alpha?[alpha]:[alpha,beta]);
      assert.equal(error.code,code);
      assert.equal(error.cause,cause);
    }
  }
});

test('explicit bundle read errors propagate unchanged without fallback',()=>{
  const h=fixture([profile('alpha',alpha),profile('beta',beta)]);
  const error=Object.assign(new Error('permission denied'),{code:'PERMISSION_DENIED'});
  h.App.get=function(app){h.calls.push(plain(app));throw error;};
  assert.throws(()=>h.registry.matchPid(7,alpha.bundleId),actual=>actual===error);
  assert.deepEqual(h.calls,[alpha]);
});

const layout={sidebarWidth:300,gap:16,top:16,bottom:16,right:16};
const descriptor=(id,app,overrides={})=>({id,name:id,app,layout:{...layout},...overrides});

test('default descriptor survives JSON roundtrip and exposes full resize area for centering',()=>{
  const helper=load();
  const profiles=JSON.parse(JSON.stringify(helper.defaultProfiles));
  assert.deepEqual(profiles.find(p=>p.id==='codex'),{id:'codex',name:'ChatGPT（Codex）桌面应用',
    app:{bundleId:'com.openai.codex'},layout,inputMode:'paste',
    editorDiscovery:{role:'textField',nativeRole:'AXTextArea',maxDepth:64}});
  assert.equal(Object.isFrozen(helper.defaultProfiles[0].layout),true);
  const h=fixture(profiles),app=profiles[0].app;
  h.groups.set(key(app),group(app,[51]));
  const area=h.registry.matchPid(51).profile.contentArea;
  for(const height of [33,600,900]){
    const result=area({width:900,height,x:-500,y:-200});
    assert.deepEqual(plain(result),{x:316,y:16,width:568,height:height-32,
      source:'window-relative-default',composerMeasured:false});
    assert.equal(result.y+result.height/2,height/2);
  }
  assert.deepEqual(plain(area({width:333,height:33})),{x:316,y:16,width:1,height:1,
    source:'window-relative-default',composerMeasured:false});
});

test('custom identity/layout snapshots are frozen and independent of caller mutation',()=>{
  const input=descriptor('beta',{...beta},{layout:{sidebarWidth:80,gap:12,top:20,bottom:30,right:10}});
  const h=fixture([input]),stored=h.registry.getProfile('beta');
  input.app.path='/changed.app';input.layout.sidebarWidth=800;
  input.layout.top=500;input.layout={};input.name='Changed';input.id='changed';
  assert.equal(Object.isFrozen(stored),true);
  assert.equal(Object.isFrozen(stored.app),true);
  assert.equal(Object.isFrozen(stored.layout),true);
  assert.equal(stored.name,'beta');
  assert.deepEqual(plain(stored.contentArea({width:600,height:500})),
    {x:92,y:20,width:498,height:450,source:'window-relative-default',composerMeasured:false});
  h.groups.set(key(beta),group(beta,[41]));
  assert.equal(h.registry.matchPid(41).profile,stored);
  h.groups.set(key(beta),group(beta,[],[{pid:42}]));
  assert.equal(h.registry.matchPid(41),null);
  assert.equal(h.registry.matchPid(42).profile,stored);
});

test('descriptor validation rejects malformed identity, labels and layouts before App.get',()=>{
  const {createRegistry}=load();let reads=0;
  const App={get(){reads++;assert.fail('Invalid descriptor must not query apps');}};
  const good=descriptor('fixture',{...alpha});
  const badProfiles=[null,[],{},
    ...['', ' ', 'bad\nlabel',7,null].flatMap(value=>[
      {...good,id:value},{...good,name:value}]),
    {...good,contentArea:null},{...good,contentArea:7},
    ...[undefined,null,[],{},Object.create(layout),{...layout,extra:0},
      {...layout,[Symbol('extra')]:0},
      Object.defineProperty({...layout},'gap',{value:16,enumerable:false}),
      {...layout,sidebarWidth:Number.MAX_VALUE,gap:Number.MAX_VALUE},
      {...layout,top:Number.MAX_VALUE,bottom:Number.MAX_VALUE},
      ...Object.keys(layout).flatMap(k=>[
        ...[NaN,Infinity,-Infinity,-1,'16',null,undefined].map(value=>({...layout,[k]:value})),
        Object.fromEntries(Object.entries(layout).filter(([name])=>name!==k)),
      ])].map(value=>({...good,layout:value})),
    ...[{bundleId:'bad id'},{bundleId:'bad\\id'},{bundleId:'bad\nid'},
      {path:'relative.app'},{path:'~/App.app'},{path:''},{path:7},
      {path:'/App.app',bundleId:'test.fixture'},
      Object.defineProperty({},'bundleId',{value:alpha.bundleId}),
      {bundleId:alpha.bundleId,[Symbol('alias')]:'test.other'}]
      .map(app=>({...good,app})),
  ];
  for(const profile of badProfiles)
    assert.throws(()=>createRegistry({App,profiles:[profile]}),{name:'TypeError'});
  assert.equal(reads,0);
});

test('explicit absolute paths match exact Runtime identity and refresh restarted PIDs',()=>{
  for(const app of [{path:'/fixtures/Other.app'},{path:'C:\\Fixtures\\Other.exe'},
    {path:'\\\\server\\share\\Other.exe'}]){
    const h=fixture([descriptor('other',app)]);
    h.groups.set(key(app),group(app,[101]));
    assert.equal(h.registry.matchPid(101).profileId,'other');
    h.groups.set(key(app),group(app,[102]));
    assert.equal(h.registry.matchPid(101),null);
    assert.equal(h.registry.matchPid(102).profileId,'other');
    h.groups.set(key(app),{...group(app,[102]),identity:{kind:'path',value:app.path+'-wrong'}});
    assert.equal(h.registry.matchPid(102),null);
    h.groups.set(key(app),{...group(app,[102]),identity:{kind:'bundleId',value:app.path}});
    assert.equal(h.registry.matchPid(102),null);
  }
});

test('duplicate descriptors fail closed for identical or conflicting layouts',()=>{
  for(const secondLayout of [{...layout},{...layout,sidebarWidth:0}]){
    const h=fixture([descriptor('one',alpha),descriptor('two',alpha,{layout:secondLayout})]);
    h.groups.set(key(alpha),group(alpha,[7]));
    assert.equal(h.registry.matchPid(7),null);
    h.calls.length=0;
    assert.equal(h.registry.matchPid(7,alpha.bundleId),null);
    assert.equal(h.calls.length,0);
  }
});

test('descriptor legacy functions remain callable and invalid optional layouts are rejected',()=>{
  const area=()=>({x:1,y:2,width:3,height:4});
  const h=fixture([descriptor('alpha',alpha,{contentArea:area})]);
  assert.equal(h.registry.getProfile('alpha').contentArea,area);
  assert.throws(()=>fixture([descriptor('alpha',alpha,{contentArea:area,layout:{}})]),
    {name:'TypeError'});
  const zero=fixture([descriptor('zero',alpha,{layout:{sidebarWidth:0,gap:0,top:0,bottom:0,right:0}})]);
  assert.deepEqual(plain(zero.registry.getProfile('zero').contentArea({width:1,height:1})),
    {x:0,y:0,width:1,height:1,source:'window-relative-default',composerMeasured:false});
});

function composerFixture(){
  const win={id:'fixture:42:71',pid:42,handle:71,exePath:'/fixture/editor',
    title:'Fixture',x:100,y:200,width:900,height:600};
  const editorSelector={role:'textField',name:'Fixture editor',identifier:'fixture-composer'};
  // Calibration supplies dimensions and identity, not necessarily screen origin.
  const {x,y,...calibrationWindow}=win;
  const layout={window:calibrationWindow,editor:{x:30,y:380,width:700,height:120}};
  const field={...editorSelector,enabled:true,
    bounds:{x:130,y:580,width:700,height:120,coordinateSpace:'screen'},children:[]};
  const state={result:{complete:true,truncated:false,
    root:{role:'window',children:[{role:'group',children:[field]}]}}};
  const calls=[];
  const Accessibility={async snapshot(options){calls.push(options);return state.result;}};
  for(const method of ['find','read','perform','release','getCapabilities'])
    Object.defineProperty(Accessibility,method,{get(){assert.fail(`Forbidden ${method}`);}});
  const createComposerTracker=load().createComposerTracker;
  const options={Accessibility,editorSelector,layout};
  return {win,editorSelector,layout,field,state,calls,Accessibility,options,createComposerTracker,
    tracker:createComposerTracker(options)};
}

test('composer remeasures live growth, title, window movement and resize with one exact scoped snapshot',async()=>{
  const h=composerFixture();
  for(const key of ['value','focused','nativeBounds','ref'])
    Object.defineProperty(h.field,key,{get(){assert.fail(`Must not read ${key}`);}});
  assert.deepEqual(plain(await h.tracker.measure(h.win)),
    {x:30,y:380,width:700,height:120,source:'accessibility',composerMeasured:true});
  h.field.bounds.y=520;h.field.bounds.height=180;
  assert.deepEqual(plain(await h.tracker.measure(h.win)),
    {x:30,y:320,width:700,height:180,source:'accessibility',composerMeasured:true});
  Object.assign(h.win,{title:'Changed title',x:-800,y:-100,width:1100,height:800});
  Object.assign(h.field.bounds,{x:-760,y:400,width:950,height:200});
  assert.deepEqual(plain(await h.tracker.measure(h.win)),
    {x:40,y:500,width:950,height:200,source:'accessibility',composerMeasured:true});
  assert.equal(h.calls.length,3);
  for(const call of h.calls){
    assert.equal(call.within,h.win);
    assert.deepEqual(plain({...call,within:null}),{within:null,
      properties:['role','name','identifier','enabled','bounds'],timeout:250,maxDepth:16,maxNodes:2000});
  }
});

test('composer snapshots calibration identity and exact AND selector against caller mutations',async()=>{
  const h=composerFixture(),original={...h.win};
  Object.assign(h.editorSelector,{role:'button',name:'Changed',identifier:'changed'});
  Object.assign(h.layout.window,{id:'different',pid:9,handle:10,exePath:'/other'});
  h.options.Accessibility={snapshot(){assert.fail('Dependency replaced');}};
  h.Accessibility.snapshot=()=>assert.fail('Snapshot method replaced');
  await h.tracker.measure(original);
  for(const [key,value] of Object.entries({id:'new-window',pid:43,handle:72,exePath:'/new-process'})){
    await assert.rejects(h.tracker.measure({...original,[key]:value}),{code:'STALE_TARGET'});
  }
  assert.equal(h.calls.length,1);
  for(const key of ['role','name','identifier']){
    const originalValue=h.field[key];h.field[key]=`${originalValue}-different`;
    await assert.rejects(h.tracker.measure(original),{code:'TARGET_NOT_FOUND'});
    h.field[key]=originalValue;
  }
});

test('composer accepts name-only or identifier-only exact selectors and edge-contained bounds',async()=>{
  for(const key of ['name','identifier']){
    const h=composerFixture();
    const tracker=h.createComposerTracker({...h.options,
      editorSelector:{role:'textField',[key]:h.field[key]}});
    Object.assign(h.field.bounds,{x:h.win.x,y:h.win.y,width:h.win.width,height:h.win.height});
    assert.deepEqual(plain(await tracker.measure(h.win)),{x:0,y:0,width:900,height:600,
      source:'accessibility',composerMeasured:true});
  }
});

test('composer rejects missing, ambiguous and unavailable enabled state without filtering duplicates',async()=>{
  for(const [change,code] of [
    [h=>{h.state.result.root.children=[];},'TARGET_NOT_FOUND'],
    [h=>{h.state.result.root.children.push({...h.field,enabled:false});},'AMBIGUOUS_TARGET'],
    [h=>{h.field.enabled=false;},'ELEMENT_DISABLED'],
    [h=>{delete h.field.enabled;},'STATE_UNKNOWN'],
    [h=>{h.field.enabled=null;},'STATE_UNKNOWN'],
    [h=>{h.field.enabled=1;},'STATE_UNKNOWN'],
  ]){
    const h=composerFixture();change(h);
    await assert.rejects(h.tracker.measure(h.win),{code});assert.equal(h.calls.length,1);
  }
});

test('composer requires complete untruncated well-formed bounded tree even after a match',async()=>{
  for(const change of [
    h=>{h.state.result=null;},h=>{h.state.result.complete=false;},
    h=>{delete h.state.result.complete;},h=>{h.state.result.truncated=true;},
    h=>{delete h.state.result.truncated;},h=>{h.state.result.root=null;},
    h=>{delete h.field.children;},
    h=>{h.state.result.root.children.unshift(null);},
    h=>{h.field.children.push(h.state.result.root);},
    h=>{h.field.children=Array.from({length:2000},()=>({children:[]}));},
    h=>{let node=h.field;for(let i=0;i<16;i++){
      const child={children:[]};node.children=[child];node=child;}},
  ]){
    const h=composerFixture();change(h);
    await assert.rejects(h.tracker.measure(h.win),{code:'SEARCH_INCOMPLETE'});
    assert.equal(h.calls.length,1);
  }
});

test('composer rejects missing/native/unconverted/nonpositive/outside screen bounds',async()=>{
  const h=composerFixture(),good={...h.field.bounds};
  for(const bounds of [null,undefined,{},
    {...good,coordinateSpace:'native'},{...good,coordinateSpace:'window'},
    {...good,coordinateSpace:undefined},{...good,x:NaN},{...good,y:Infinity},
    {...good,width:0},{...good,height:-1},{...good,width:'700'},
    {...good,x:99},{...good,y:199},{...good,x:301},{...good,y:681},
    {...good,x:Number.MAX_VALUE,width:Number.MAX_VALUE},
  ]){
    h.field.bounds=bounds;h.field.nativeBounds=good;
    await assert.rejects(h.tracker.measure(h.win),{code:'STATE_UNKNOWN'});
  }
});

test('composer rejects window mutation during a pending observation and never retries backend errors',async()=>{
  for(const key of ['id','pid','handle','exePath','x','y','width','height']){
    const h=composerFixture();
    const tracker=h.createComposerTracker({...h.options,Accessibility:{async snapshot(){
      h.win[key]=typeof h.win[key]==='number'?h.win[key]+1:'changed';return h.state.result;
    }}});
    await assert.rejects(tracker.measure(h.win),{code:'STALE_TARGET'});
  }
  for(const [error,code] of [[Object.assign(new Error('denied'),{code:'PERMISSION_DENIED'}),'PERMISSION_DENIED'],
    [new Error('backend detail'),'BACKEND_FAILED'],[null,'BACKEND_FAILED']]){
    const h=composerFixture();let calls=0;
    const tracker=h.createComposerTracker({...h.options,Accessibility:{snapshot(){calls++;throw error;}}});
    await assert.rejects(tracker.measure(h.win),e=>e.name==='Error'&&e.code===code);
    assert.equal(calls,1);
  }
});

test('composer validates creation arguments synchronously and live windows before observing',async()=>{
  const h=composerFixture(),create=h.createComposerTracker;
  for(const options of [undefined,null,[],{}, {...h.options,Accessibility:{}},
    ...[undefined,null,[],{}, {role:'textField'}, {role:'button',name:'Send'},
      {role:'textField',name:''},{role:'textField',identifier:7},
      {role:'textField',name:'Editor',identifier:''},
      {role:'textField',name:'Editor',value:'private'},
      Object.create({role:'textField',name:'Editor'}),
      Object.defineProperty({role:'textField',name:'Editor'},'identifier',{value:'hidden'}),
      {role:'textField',name:'Editor',[Symbol('unknown')]:'x'}]
      .map(editorSelector=>({...h.options,editorSelector})),
    ...[undefined,null,{}, {window:[]},
      ...[{id:''},{id:'fixture:unresolved'},{pid:0},{pid:1.5},{handle:0},
        {handle:'71'},{exePath:''},{exePath:null},{width:0},{height:NaN}]
        .map(change=>({window:{...h.layout.window,...change}}))]
      .map(layout=>({...h.options,layout})),
  ])assert.throws(()=>create(options),{name:'Error',code:'INVALID_ARGUMENT'});
  for(const win of [undefined,null,[],{}, {...h.win,id:'fixture:unresolved'},
    {...h.win,pid:0},{...h.win,handle:null},{...h.win,exePath:''},
    {...h.win,x:undefined},{...h.win,y:NaN},{...h.win,width:0},{...h.win,height:Infinity}])
    await assert.rejects(h.tracker.measure(win),{name:'Error',code:'INVALID_ARGUMENT'});
  assert.equal(h.calls.length,0);
});

test('explicit OpenCode scope snapshots identity without App access',()=>{
  const helper=load(),scope={pid:42,exePath:'/fixture/OpenCode',profile:'opencode'};
  const registry=helper.createRegistry({scope});scope.pid=99;
  assert.deepEqual(plain(registry.scope),{pid:42,exePath:'/fixture/OpenCode',profile:'opencode'});
  assert.equal(registry.matchPid(42).profileId,'opencode');
  assert.equal(registry.matchPid(99),null);
  for(const bad of [{pid:0},{pid:2147483648},{exePath:'relative'},{profile:'unknown'},{extra:true}])
    assert.throws(()=>helper.createRegistry({scope:{pid:42,exePath:'/fixture/OpenCode',profile:'opencode',...bad}}));
});

test('Codex desktop scope supplements its built-in placement without input or App access',()=>{
  const scope={pid:42,exePath:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',profile:'codex'};
  for(const options of [{scope},{scopes:[scope]}]){
    const registry=load().createRegistry({App:noAppAccess(),profiles:[],...options});
    const match=registry.matchPid(42),profile=match.profile;
    assert.equal(match.profileId,'codex');
    assert.deepEqual(plain(match.identity),{kind:'path',value:scope.exePath});
    assert.deepEqual(plain(profile.app),{path:scope.exePath});
    assert.equal(profile.inputMode,'paste');
    assert.equal(profile.editorSelector,undefined);
    assert.deepEqual(plain(profile.editorDiscovery),{role:'textField',nativeRole:'AXTextArea',maxDepth:64});
    assert.equal(Object.isFrozen(profile.editorDiscovery),true);
    assert.equal(profile.scene,undefined);
    assert.equal(Object.isFrozen(profile.layout),true);
    assert.deepEqual(plain(profile.contentArea({width:1000,height:800})),
      {x:316,y:16,width:668,height:768,source:'window-relative-default',composerMeasured:false});
    assert.equal(registry.matchPid(43),null);
    assert.equal(registry.getProfile('opencode'),null);
    assert.equal(registry.getProfile('claude-code'),null);
  }
});

test('Codex desktop joins Claude Code and OpenCode scopes with independent placement and input policies',()=>{
  const scopes=[
    {pid:41,exePath:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',profile:'codex'},
    {pid:42,exePath:'/Applications/Claude.app/Contents/MacOS/Claude',profile:'claude-code'},
    {pid:43,exePath:'/Applications/OpenCode.app/Contents/MacOS/OpenCode',profile:'opencode'},
  ];
  const registry=load().createRegistry({App:noAppAccess(),profiles:[],scopes});
  for(const entry of scopes){
    const match=registry.matchPid(entry.pid);
    assert.equal(match.profileId,entry.profile);
    assert.equal(match.identity.value,entry.exePath);
    assert.equal(match.profile.layout.sidebarWidth,entry.profile==='codex'?300:0);
    assert.equal(match.profile.inputMode,'paste');
  }
  assert.equal(registry.matchPid(44),null);
});

test('Codex scope keeps explicit replacement layouts and never widens an existing executable identity',()=>{
  const scope={pid:42,exePath:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',profile:'codex'};
  const custom=descriptor('codex',{path:scope.exePath},{layout:{...layout,sidebarWidth:240}});
  const registry=load().createRegistry({App:noAppAccess(),scope,profiles:[custom]});
  assert.equal(registry.matchPid(42).profile.layout.sidebarWidth,240);
  assert.throws(()=>load().createRegistry({App:noAppAccess(),profiles:[],
    scopes:[scope,{...scope,pid:43,exePath:'/other/ChatGPT'}]}),{name:'TypeError'});
});

function noAppAccess(){
  return new Proxy({}, {get(_target,key){assert.fail(`Scoped registry read App.${String(key)}`);}});
}

test('explicit multiple scopes select only approved PIDs without any App access',()=>{
  const scopes=[{pid:11,exePath:'/fixture/OpenCode',profile:'opencode'},
    {pid:22,exePath:'/fixtures/Beta.app/Contents/MacOS/Beta',profile:'beta'}];
  const registry=load().createRegistry({App:noAppAccess(),scopes,
    profiles:[descriptor('beta',beta)]});
  assert.equal(registry.scope,null);
  assert.equal(Object.isFrozen(registry.scopes),true);
  assert.deepEqual(plain(registry.scopes),scopes);
  for(const entry of scopes){
    const match=registry.matchPid(entry.pid,'unrelated.bundle');
    assert.equal(match.profileId,entry.profile);
    assert.equal(match.profile,registry.getProfile(entry.profile));
    assert.deepEqual(plain(match.identity),{kind:'path',value:entry.exePath});
    assert.equal(Object.isFrozen(match.identity),true);
  }
  for(const pid of [0,-1,1.5,NaN,Infinity,'11',null,undefined,33,2147483648])
    assert.equal(registry.matchPid(pid,'com.openai.codex'),null);
  assert.equal(registry.getProfile('codex'),null);
  assert.equal(registry.getProfile('claude'),null);
});

test('scopes and profiles snapshot caller mutations without retargeting',()=>{
  const entry={pid:11,exePath:'/fixtures/Beta.app/Contents/MacOS/Beta',profile:'beta'};
  const scopes=[entry],input=descriptor('beta',{...beta});
  const registry=load().createRegistry({scopes,profiles:[input]});
  const first=registry.matchPid(11);
  Object.assign(entry,{pid:22,exePath:'/other',profile:'other'});
  scopes[0]={pid:33,exePath:'/third',profile:'third'};scopes.push(entry);
  input.id='other';input.app.path='/other';input.layout.gap=900;
  assert.equal(registry.matchPid(11),first);
  assert.equal(first.profileId,'beta');
  assert.equal(first.identity.value,'/fixtures/Beta.app/Contents/MacOS/Beta');
  assert.equal(first.profile.app.path,beta.path);
  assert.equal(first.profile.layout.gap,16);
  assert.equal(Object.isFrozen(registry.scopes[0]),true);
  assert.throws(()=>{registry.scopes[0].pid=22;},TypeError);
  assert.throws(()=>{first.identity.value='/other';},TypeError);
  assert.equal(registry.scopes.length,1);
  assert.equal(registry.matchPid(22),null);
  assert.equal(registry.matchPid(33),null);
});

test('legacy scope maps to a frozen singleton and unscoped registries expose an empty frozen list',()=>{
  const scope={pid:42,exePath:'/fixture/OpenCode',profile:'opencode'};
  const registry=load().createRegistry({scope,profiles:[],App:noAppAccess()});
  assert.equal(registry.scope,registry.scopes[0]);
  assert.equal(Object.isFrozen(registry.scope),true);
  assert.equal(Object.isFrozen(registry.scopes),true);
  const unscoped=fixture([]).registry;
  assert.equal(unscoped.scope,null);
  assert.deepEqual(plain(unscoped.scopes),[]);
  assert.equal(Object.isFrozen(unscoped.scopes),true);
});

test('explicit scopes restrict default Codex observation to the allowed table',()=>{
  const registry=load().createRegistry({App:noAppAccess(),
    scopes:[{pid:42,exePath:'/fixture/OpenCode',profile:'opencode'}]});
  assert.equal(registry.matchPid(42).profileId,'opencode');
  assert.equal(registry.matchPid(43,'com.openai.codex'),null);
  assert.equal(registry.matchPid(43,'com.anthropic.claude'),null);
});

test('same executable can serve distinct PIDs with shared or explicitly chosen profiles',()=>{
  const exePath='/fixture/editor';
  for(const selected of ['one','two']){
    const registry=load().createRegistry({App:noAppAccess(),
      profiles:[descriptor('one',{path:exePath}),descriptor('two',{path:exePath},
        {layout:{...layout,sidebarWidth:0}})],
      scopes:[{pid:1,exePath,profile:'one'},{pid:2,exePath,profile:selected}]});
    assert.equal(registry.matchPid(1).profileId,'one');
    assert.equal(registry.matchPid(2).profileId,selected);
    assert.equal(registry.matchPid(2).profile.layout.sidebarWidth,selected==='one'?300:0);
  }
});

test('scope validation rejects conflicts and malformed identities without querying App',()=>{
  const helper=load(),good={pid:42,exePath:'/fixture/OpenCode',profile:'opencode'};
  const create=options=>helper.createRegistry({App:noAppAccess(),profiles:[],...options});
  const invalidScopes=[null,{},[],[good,good],Array(1),
    Array.from({length:17},(_,i)=>({...good,pid:i+1})),
    ...[null,[],{},Object.create(good),
      {...good,pid:'42'},{...good,pid:NaN},{...good,pid:1.5},
      {...good,pid:2147483648},{...good,exePath:'relative'},
      {...good,exePath:'/bad\npath'},{...good,exePath:'/bad\u0000path'},
      {...good,profile:'unknown'},{...good,profile:' opencode'},
      {...good,extra:true},{...good,[Symbol('extra')]:true},
      Object.defineProperty({...good},'profile',{enumerable:false})]
      .map(entry=>[entry]),
    [good,{...good,pid:43,exePath:'/other/OpenCode'}],
  ];
  for(const scopes of invalidScopes)assert.throws(()=>create({scopes}),{name:'TypeError'});
  assert.throws(()=>create({scope:good,scopes:[good]}),{name:'TypeError'});
  for(const exePath of ['/fixtures/Beta.app-other/Contents/MacOS/Beta',
    '/fixtures/Beta.app/Contents/MacOS/', '/fixtures/Beta.app/Contents/MacOS/../Other',
    '/fixtures/Beta.app/Contents/MacOS/..','/other/Beta'])
    assert.throws(()=>create({profiles:[descriptor('beta',beta)],
      scopes:[{...good,exePath,profile:'beta'}]}),{name:'TypeError'});
});

test('scope bounds accept sixteen entries and preserve exact OpenCode or app-bundle identities',()=>{
  const helper=load(),exePath='/fixture/OpenCode';
  const scopes=Array.from({length:16},(_,i)=>({pid:i+1,exePath,profile:'opencode'}));
  const registry=helper.createRegistry({scopes,profiles:[]});
  assert.equal(registry.scopes.length,16);
  for(const entry of scopes)assert.equal(registry.matchPid(entry.pid).identity.value,exePath);
  for(const appPath of [exePath,'/Applications/OpenCode.app']){
    const actualExe=appPath.endsWith('.app')?appPath+'/Contents/MacOS/OpenCode':appPath;
    const configured=helper.createRegistry({profiles:[descriptor('opencode',{path:appPath},
      {layout:{sidebarWidth:0,gap:16,top:16,bottom:16,right:16}})],
      scopes:[{pid:2147483647,exePath:actualExe,profile:'opencode'}]});
    assert.equal(configured.matchPid(2147483647).profile.app.path,appPath);
    assert.equal(configured.matchPid(2147483647).identity.value,actualExe);
  }
  assert.deepEqual(plain(registry.getProfile('opencode').contentArea({width:900,height:600})),
    {x:16,y:16,width:868,height:568,source:'window-relative-default',composerMeasured:false});
});

test('editorDiscovery is copied and frozen without weakening named editorSelector',()=>{
  const editorDiscovery={role:'textField',nativeRole:'AXTextArea',maxDepth:24};
  const editorSelector={role:'textField',name:'Editor'};
  const input=descriptor('alpha',alpha,{editorDiscovery,editorSelector});
  const h=fixture([input]),stored=h.registry.getProfile('alpha');
  Object.assign(editorDiscovery,{role:'button',nativeRole:'AXButton',maxDepth:1});
  input.editorDiscovery=null;editorSelector.name='Changed';
  assert.deepEqual(plain(stored.editorDiscovery),
    {role:'textField',nativeRole:'AXTextArea',maxDepth:24});
  assert.equal(Object.isFrozen(stored.editorDiscovery),true);
  assert.throws(()=>{stored.editorDiscovery.maxDepth=32;},TypeError);
  assert.deepEqual(plain(stored.editorSelector),{role:'textField',name:'Editor'});
  for(const maxDepth of [1,32,33,64]){
    const accepted=fixture([descriptor('alpha',alpha,
      {editorDiscovery:{role:'textField',nativeRole:'AXTextArea',maxDepth}})]);
    assert.equal(accepted.registry.getProfile('alpha').editorDiscovery.maxDepth,maxDepth);
  }
  assert.equal(fixture([descriptor('alpha',alpha)]).registry.getProfile('alpha').editorDiscovery,undefined);
  assert.equal(h.calls.length,0);
});

test('editorDiscovery rejects malformed or extended descriptors before any App query',()=>{
  const good={role:'textField',nativeRole:'AXTextArea',maxDepth:24};
  const invalid=[null,[],{},Object.create(good),
    ...['role','nativeRole','maxDepth'].map(key=>Object.fromEntries(
      Object.entries(good).filter(([name])=>name!==key))),
    {...good,role:'button'}, {...good,name:''}, {...good,identifier:'editor'},
    {...good,extra:true}, {...good,[Symbol('extra')]:true},
    Object.defineProperty({...good},'nativeRole',{enumerable:false}),
    ...['',' ',' AXTextArea','AXTextArea\n',7,null].map(nativeRole=>({...good,nativeRole})),
    ...[0,-1,65,1.5,NaN,Infinity,'24',null,undefined].map(maxDepth=>({...good,maxDepth})),
  ];
  for(const editorDiscovery of invalid)
    assert.throws(()=>load().createRegistry({App:noAppAccess(),
      scope:{pid:42,exePath:'/fixture/Alpha',profile:'alpha'},
      profiles:[descriptor('alpha',alpha,{editorDiscovery})]}),{name:'TypeError'});
  // Discovery does not make an unnamed selector valid.
  for(const editorSelector of [{role:'textField'},
    {role:'textField',name:''},{role:'textField',nativeRole:'AXTextArea'}])
    assert.throws(()=>fixture([descriptor('alpha',alpha,
      {editorDiscovery:good,editorSelector})]),{name:'TypeError'});
});

test('built-in OpenCode carries explicit read-only discovery metadata and paste policy',()=>{
  const scope={pid:42,exePath:'/fixture/OpenCode',profile:'opencode'};
  for(const options of [{scope},{scopes:[scope]}]){
    const registry=load().createRegistry({App:noAppAccess(),profiles:[],...options});
    const profile=registry.matchPid(42).profile;
    assert.deepEqual(plain(profile.editorDiscovery),
      {role:'textField',nativeRole:'AXTextArea',maxDepth:24});
    assert.equal(Object.isFrozen(profile.editorDiscovery),true);
    assert.equal(profile.editorSelector,undefined);
    assert.equal(profile.inputMode,'paste');
    assert.equal(profile.layout.gap,16);
  }
  const explicit=load().createRegistry({profiles:[descriptor('opencode',{path:scope.exePath})],scope});
  assert.equal(explicit.getProfile('opencode').editorDiscovery,undefined);
  assert.deepEqual(plain(load().defaultProfiles[0].editorDiscovery),
    {role:'textField',nativeRole:'AXTextArea',maxDepth:64});
});

test('default profiles match three stable app identities and retain metadata through bundle overrides',()=>{
  const h=fixture(undefined);
  const expected=[
    ['codex','com.openai.codex','paste'],
    ['claude-code','com.anthropic.claudefordesktop','paste'],
    ['opencode','ai.opencode.desktop','paste'],
  ];
  assert.deepEqual(plain(h.helper.defaultProfiles.map(p=>p.id)),expected.map(([id])=>id));
  assert.equal(Object.isFrozen(h.helper.defaultProfiles),true);
  for(const [index,[id,bundleId,inputMode]] of expected.entries()){
    const app={bundleId},pid=index+1;
    h.groups.set(key(app),group(app,[pid]));
    const stored=h.registry.getProfile(id),raw=h.helper.defaultProfiles[index];
    assert.equal(Object.isFrozen(raw),true);
    assert.equal(Object.isFrozen(raw.app),true);
    assert.equal(Object.isFrozen(raw.layout),true);
    assert.equal(h.registry.matchPid(pid).profile,stored);
    assert.equal(stored.inputMode,inputMode);
    h.calls.length=0;
    const override=h.registry.matchPid(pid,bundleId).profile;
    assert.deepEqual(h.calls,[app]);
    assert.equal(override.id,'configured');
    assert.equal(override.inputMode,inputMode);
    assert.equal(override.scene,stored.scene);
    assert.equal(override.editorSelector,stored.editorSelector);
    assert.equal(override.editorDiscovery,stored.editorDiscovery);
    assert.equal(Object.isFrozen(override),true);
  }
  const claude=h.registry.getProfile('claude-code'),openCode=h.registry.getProfile('opencode');
  assert.equal(claude.scene,'claude-code');
  assert.deepEqual(plain(claude.editorSelector),{role:'textField',name:'Prompt'});
  assert.equal(Object.isFrozen(h.helper.defaultProfiles[1].editorSelector),true);
  assert.equal(Object.isFrozen(claude.editorSelector),true);
  assert.deepEqual(plain(openCode.editorDiscovery),
    {role:'textField',nativeRole:'AXTextArea',maxDepth:24});
  assert.equal(openCode.editorSelector,undefined);
  assert.equal(Object.isFrozen(h.helper.defaultProfiles[2].editorDiscovery),true);
  assert.equal(Object.isFrozen(openCode.editorDiscovery),true);
  const roundtrip=fixture(JSON.parse(JSON.stringify(h.helper.defaultProfiles)));
  for(const [id,,mode] of expected)assert.equal(roundtrip.registry.getProfile(id).inputMode,mode);
});

test('inputMode validates before App access and snapshots a frozen strict or paste policy',()=>{
  for(const inputMode of [null,'','Paste',' paste','paste ','atomic',false,0,[],{},new String('paste')])
    assert.throws(()=>load().createRegistry({App:noAppAccess(),
      scopes:[{pid:11,exePath:'/fixture/Alpha',profile:'alpha'}],
      profiles:[descriptor('alpha',alpha,{inputMode})]}),{name:'TypeError'});
  for(const inputMode of [undefined,'strict','paste']){
    const input=descriptor('alpha',alpha,{inputMode}),h=fixture([input]);
    const stored=h.registry.getProfile('alpha');
    input.inputMode=inputMode==='paste'?'strict':'paste';
    assert.equal(stored.inputMode,inputMode===undefined?'strict':inputMode);
    assert.equal(Object.isFrozen(stored),true);
    assert.throws(()=>{stored.inputMode='paste';},TypeError);
    h.groups.set(key(alpha),group(alpha,[11]));
    assert.equal(h.registry.matchPid(11,alpha.bundleId).profile.inputMode,stored.inputMode);
    const other={bundleId:'test.fixture.unknown'};
    h.groups.set(key(other),group(other,[12]));
    assert.equal(h.registry.matchPid(12,other.bundleId).profile.inputMode,'strict');
  }
});

test('scoped defaults and supplementation retain paste while explicit replacement keeps its chosen policy',()=>{
  for(const [id,exePath] of [['claude-code',sceneWindow.exePath],['opencode','/fixture/OpenCode']]){
    const scope={pid:17,exePath,profile:id};
    for(const scopeOptions of [{scope},{scopes:[scope]}]){
      for(const profileOptions of [{},{profiles:[]}]){
        const registry=load().createRegistry({App:noAppAccess(),...profileOptions,...scopeOptions});
        assert.equal(registry.matchPid(17).profile.inputMode,'paste');
        assert.equal(registry.matchPid(18),null);
      }
      for(const inputMode of [undefined,'strict','paste']){
        const registry=load().createRegistry({App:noAppAccess(),...scopeOptions,
          profiles:[descriptor(id,{path:exePath},{inputMode,...(id==='claude-code'?{scene:id}:{})})]});
        const stored=registry.matchPid(17).profile;
        assert.equal(stored.inputMode,inputMode===undefined?'strict':inputMode);
        assert.equal(stored.editorDiscovery,undefined);
        assert.equal(stored.editorSelector,undefined);
        assert.equal(registry.getProfile('codex'),null);
      }
    }
  }
  const h=fixture([descriptor('alpha',alpha,{inputMode:'paste'})]);
  for(const id of ['codex','claude-code','opencode'])assert.equal(h.registry.getProfile(id),null);
  h.registry.matchPid(11);
  assert.deepEqual(h.calls,[alpha]);
});
