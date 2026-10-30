import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async file=>{const b=await build({entryPoints:[new URL('../'+file,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));};
const app=await load('src/state.tsx'),mapping=await load('src/domain/business-mapping.ts');
const scope=s=>({storeId:s.storeId,epoch:s.businessEpoch});
const plan=s=>mapping.createMappingPlan('product',s.storeId);
const input=mapping.mappingSample('product');
const act=(s,type,extra={})=>app.reducer(s,{type,...scope(s),...extra});
function save(s,p=plan(s)){
  return act(s,'MAPPING_SAVE',{text:JSON.stringify(p),input,cursor:'map-1',previousCursor:null});
}
function toggle(s){const m=s.businessMappings[0];return act(s,'MAPPING_TOGGLE',{key:app.mappingKey(m.plan),version:m.version});}
function preview(s,extra={}){const m=s.businessMappings[0];return act(s,'MAPPING_PREVIEW',{key:app.mappingKey(m.plan),version:m.version,input,cursor:'map-1',previousCursor:null,...extra});}

test('sample save, enable, preview, cancel and apply preserve draft and gate cursor changes',()=>{
  let s=app.reducer(app.createInitialState(),{type:'SET_DRAFT',id:'t1',text:'人工草稿保留'});
  const business=s.business;
  s=save(s);assert.equal(s.business,business);assert.equal(s.businessMappings[0].enabled,false);
  s=preview(s);assert.equal(s.businessPreview,null);assert.match(s.businessStatus,/停用/);
  s=toggle(s);s=preview(s);assert.ok(s.businessPreview,s.businessStatus);assert.equal(s.business,business);
  s=act(s,'BUSINESS_CANCEL');assert.equal(s.business,business);assert.equal(s.businessPreview,null);
  s=preview(s);s=act(s,'BUSINESS_APPLY');
  assert.equal(s.business.cursors[app.mappingKey(plan(s))],'map-1');assert.equal(app.currentThread(s).draft,'人工草稿保留');
  assert.equal(s.mappingPreview,null);
});

test('disable, replace or restore cancels pending output and restore never imports enable authority',()=>{
  let s=preview(toggle(save(app.createInitialState())));const business=s.business;
  s=toggle(s);assert.equal(s.businessPreview,null);assert.equal(act(s,'BUSINESS_APPLY').business,business);
  s=preview(toggle(s));assert.ok(s.businessPreview);
  s=act(s,'MAPPING_RESTORE',{text:JSON.stringify(plan(s))});
  assert.equal(s.businessPreview,null);assert.equal(s.businessMappings[0].enabled,false);assert.equal(s.business,business);
  assert.equal(s.businessMappings.length,1);
  const bad=act(s,'MAPPING_RESTORE',{text:JSON.stringify({...plan(s),enabled:true})});
  assert.equal(bad.businessMappings,s.businessMappings);assert.match(bad.mappingStatus,/失败/);
});

test('late epoch, plan version, wrong store/source and stale checkpoint cannot prepare or replace data',()=>{
  let s=toggle(save(app.createInitialState()));const m=s.businessMappings[0];
  assert.equal(preview(s,{version:m.version-1}).businessPreview,null);
  assert.equal(preview(s,{previousCursor:'old-page'}).businessPreview,null);
  const oldScope=scope(s);s=act(s,'BUSINESS_STORE',{storeId:'store-outlet'});
  assert.equal(app.reducer(s,{type:'MAPPING_PREVIEW',...oldScope,key:app.mappingKey(m.plan),version:m.version,input,cursor:'map-1',previousCursor:null}),s);
  const wrong=save(s,{...plan(s),storeId:'store-demo'});assert.match(wrong.mappingStatus,/店铺/);
  assert.equal(wrong.businessMappings,s.businessMappings);
  const wrongSource=preview(toggle(save(app.createInitialState())),{key:'["store-demo","other-source"]'});
  assert.equal(wrongSource.businessPreview,null);
});

test('version, cursor and local override conflicts reject whole mapped batch',()=>{
  let s=preview(toggle(save(app.createInitialState())));s=act(s,'BUSINESS_APPLY');const business=s.business;
  assert.equal(preview(s).businessPreview,null,'stale previous cursor');
  const rows=JSON.parse(input);const field=s.businessMappings[0].plan.fields;
  rows[0][field.name]='变更名称但未升级版本';
  s=preview(s,{input:JSON.stringify(rows),cursor:'map-2',previousCursor:'map-1'});
  assert.equal(s.businessPreview,null);assert.equal(s.business,business);
  const e=s.business.records.find(e=>e.sourceId===plan(s).sourceId);
  s=act(s,'BUSINESS_SAVE',{entity:{...e,data:{...e.data,name:'人工覆盖'},updatedAt:'2026-10-30T00:00:00.000Z'}});
  const edited=s.business;rows[0][field.version]=2;
  s=preview(s,{input:JSON.stringify(rows),cursor:'map-2',previousCursor:'map-1'});
  assert.equal(s.businessPreview,null);assert.equal(s.business,edited);
});

test('saved plans survive navigation, stay store scoped and export only configuration',()=>{
  let s=save(app.createInitialState());const p=s.businessMappings[0].plan;
  s=act(s,'TAB',{tab:'reply'});s=act(s,'BUSINESS_STORE',{storeId:'store-outlet'});
  assert.equal(s.businessMappings[0].plan,p);assert.notEqual(p.storeId,s.storeId);
  assert.doesNotMatch(JSON.stringify(p),/人工草稿|mapped-mug|enabled|cursor|records/);
});

test('mapped customer note update retains conversation, tags and the human draft',()=>{
  let s=app.reducer(app.createInitialState(),{type:'SET_DRAFT',id:'t1',text:'备注更新不清空草稿'});
  const old=s.business.records.find(e=>e.storeId===s.storeId&&e.kind==='customer'&&e.id==='t1');
  const p={...mapping.createMappingPlan('customer',s.storeId),sourceId:old.sourceId};
  const input=JSON.stringify([{id:old.id,name:old.data.name,notes:'新备注',version:old.version+1,updatedAt:'2026-10-30T00:00:00.000Z'}]);
  const page={input,cursor:'demo-v2',previousCursor:'demo-v1'};
  s=act(s,'MAPPING_SAVE',{text:JSON.stringify(p),...page});
  assert.equal(s.businessMappings.length,1,s.mappingStatus);
  s=toggle(s);
  s=act(s,'MAPPING_PREVIEW',{key:app.mappingKey(p),version:s.businessMappings[0].version,...page});
  assert.ok(s.businessPreview,s.businessStatus);s=act(s,'BUSINESS_APPLY');
  const current=s.business.records.find(e=>e.storeId===s.storeId&&e.kind==='customer'&&e.id==='t1');
  assert.equal(current.data.notes,'新备注');assert.equal(current.data.conversationId,'t1');
  assert.deepEqual(current.data.tags,old.data.tags);assert.equal(app.currentThread(s).draft,'备注更新不清空草稿');
});
