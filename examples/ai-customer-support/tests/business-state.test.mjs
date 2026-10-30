import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[new URL('../'+path,import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const app=await load('src/state.tsx'),domain=await load('src/domain/business.ts');
const action=(s,type,extra={})=>app.reducer(s,{type,storeId:s.storeId,epoch:s.businessEpoch,...extra});
const snapshot=(s)=>({schemaVersion:1,storeId:s.storeId,sourceId:'crm',previousCursor:null,cursor:'crm-1',records:[{storeId:s.storeId,sourceId:'crm',kind:'customer',id:'crm-client',version:1,updatedAt:'2026-10-30T00:00:00.000Z',deleted:false,data:{name:'仅本店客户',conversationId:null,tags:[],notes:'原话 <script> 不执行'}}]});

test('legal store IDs that overlap Object prototype names never become inherited sessions',()=>{
  let s=app.createInitialState();
  for(const storeId of ['toString','hasOwnProperty','valueOf']){
    s=app.reducer(s,{type:'BUSINESS_ADD_STORE',id:storeId,name:storeId});
    s=app.reducer(s,{type:'BUSINESS_STORE',storeId});
    assert.equal(s.storeId,storeId);assert.equal(app.currentThread(s).draft,'');
    s=app.reducer(s,{type:'SET_DRAFT',id:'t1',text:storeId+' private'});
    s=app.reducer(s,{type:'BUSINESS_STORE',storeId:'store-demo'});
    s=app.reducer(s,{type:'BUSINESS_STORE',storeId});
    assert.equal(app.currentThread(s).draft,storeId+' private');
  }
});

test('store changes isolate drafts, human edits and imported customer history, stopping simulation',()=>{
  let s=app.createInitialState();
  const original=s;
  s=app.reducer(s,{type:'SET_DRAFT',id:'t1',text:'旗舰店人工草稿'});
  s=app.reducer(s,{type:'REPLY_TEXT',key:app.activeReplyKey(s),text:'旗舰店人工版本'});
  s=app.reducer(s,{type:'AUTO_REQUEST'});s=app.reducer(s,{type:'AUTO_CONFIRM'});
  s=app.reducer(s,{type:'BUSINESS_STORE',storeId:'store-outlet'});
  assert.equal(app.currentThread(s).draft,'');assert.equal(s.auto,false);assert.equal(s.facts.length,0);
  assert.equal(app.businessProducts(s).length,1);assert.equal(app.businessOrders(s).length,1);
  assert.notEqual(app.activeReplyText(s),'旗舰店人工版本');
  const stale=app.reducer(s,{type:'FILL',storeId:'store-demo',businessRevision:s.business.revision,id:'t1',messageId:'m1',text:'迟到回复',replace:true});
  assert.equal(app.currentThread(stale).draft,'');
  s=app.reducer(s,{type:'BUSINESS_STORE',storeId:'store-demo'});
  assert.equal(app.currentThread(s).draft,'旗舰店人工草稿');assert.equal(app.activeReplyText(s),'旗舰店人工版本');
  assert.deepEqual(s.history,original.history);assert.equal(app.businessOrders(s).length,3);
});

test('file preflight never changes data; cancel, switch/reset late completion and explicit apply are scoped',()=>{
  let s=app.createInitialState();const initial=s.business;
  const text=JSON.stringify(snapshot(s));
  s=action(s,'BUSINESS_PREVIEW',{text});assert.ok(s.businessPreview,s.businessStatus);assert.equal(s.business,initial);
  s=action(s,'BUSINESS_CANCEL');assert.equal(s.businessPreview,null);assert.equal(s.business,initial);
  s=action(s,'BUSINESS_PREVIEW',{text});s=action(s,'BUSINESS_APPLY');
  assert.equal(s.business.cursors['["store-demo","crm"]'],'crm-1');
  assert.equal(domain.effectiveEntities(s.business,'store-demo','customer').filter(e=>e.id==='crm-client').length,1);
  const epoch=s.businessEpoch;s=app.reducer(s,{type:'RESET'});
  assert.equal(action(s,'BUSINESS_PREVIEW',{text,epoch}).businessPreview,null);
  const resetEpoch=s.businessEpoch;s=app.reducer(s,{type:'BUSINESS_STORE',storeId:'store-outlet'});
  assert.equal(app.reducer(s,{type:'BUSINESS_PREVIEW',text,storeId:'store-demo',epoch:resetEpoch}).businessPreview,null);
});

test('native browsing does not grant store order authority, and revoked demo authorization hides orders',()=>{
  const native=app.createInitialState(true);
  assert.deepEqual(app.businessOrders({...native,permission:true,nativeObserving:true}),[]);
  assert.equal(app.reducer(native,{type:'OPEN_ORDER',orderId:'OD-DEMO-1001'}).orderSelected,null);
  const local=app.createInitialState();assert.equal(app.businessOrders(local).length,3);
  assert.deepEqual(app.businessOrders({...local,permission:false}),[]);
});

test('local edits invalidate preflight and reject draft actions holding old business revision',()=>{
  let s=app.createInitialState();const text=JSON.stringify(snapshot(s));
  s=action(s,'BUSINESS_PREVIEW',{text});const revision=s.business.revision;
  const e=domain.effectiveEntities(s.business,s.storeId,'product')[0];
  s=action(s,'BUSINESS_SAVE',{entity:{...e,updatedAt:'2026-10-30T00:00:00.000Z',data:{...e.data,name:'人工商品名称'}}});
  assert.equal(s.businessPreview,null);assert.ok(s.business.revision>revision);
  s=app.reducer(s,{type:'FILL',storeId:s.storeId,businessRevision:revision,id:'t1',messageId:'m1',text:'旧资料',replace:false});
  assert.equal(app.currentThread(s).draft,'');
});

test('explicit backup restore preserves data/checkpoints and cannot import native grants or chat content',()=>{
  let s=app.createInitialState();s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(snapshot(s))});s=action(s,'BUSINESS_APPLY');
  const backup=domain.exportBusinessBackup(s.business),epoch=s.businessEpoch;
  assert.doesNotMatch(backup,/"permission"|"threads"|"binding"/);
  s=app.reducer(s,{type:'SETTING',key:'permission',value:false});
  s=app.reducer(s,{type:'BUSINESS_RESTORE',text:backup,epoch});
  assert.equal(s.permission,false);assert.equal(s.business.cursors['["store-demo","crm"]'],'crm-1');
  const next=app.reducer(s,{type:'BUSINESS_RESTORE',text:backup,epoch});assert.equal(next,s,'late restore does not replace new state');
});

const backupFor=(business,storeId)=>domain.exportBusinessBackup({...business,
  stores:business.stores.filter(e=>e.id===storeId),records:business.records.filter(e=>e.storeId===storeId),
  overrides:business.overrides.filter(e=>e.storeId===storeId),
  cursors:Object.fromEntries(Object.entries(business.cursors).filter(([key])=>JSON.parse(key)[0]===storeId))});
const customer=(s,id)=>domain.effectiveEntities(s.business,s.storeId,'customer').find(e=>e.id===id);
const saveMapping=(s,id,conversationId)=>{
  const e=customer(s,id);
  return action(s,'BUSINESS_SAVE',{entity:{...e,updatedAt:'2026-10-30T00:00:00.000Z',data:{...e.data,conversationId}}});
};
const dirtySlot=(s,id)=>{
  s=app.reducer(s,{type:'SET_THREAD',id});
  s=app.reducer(s,{type:'SET_DRAFT',id,text:'私有草稿 '+id});
  const history={t1:[],t2:[],t3:[],[id]:app.createInitialState().history[id]};
  s=app.reducer(s,{type:'IMPORT_HISTORY',epoch:s.historyImportEpoch,history});
  s=app.reducer(s,{type:'EXTRACT_FACTS'});
  s=app.reducer(s,{type:'REPLY_CHOICE',key:app.latestKey(s),id:'human'});
  s=app.reducer(s,{type:'REPLY_TEXT',key:app.activeReplyKey(s),text:'人工编辑 '+id});
  return {...s,editing:app.activeReplyKey(s),takeovers:[...s.takeovers,id],
    threads:s.threads.map(t=>t.id===id?{...t,sent:['old-message']}:t)};
};
const assertEmptySlot=(s,id)=>{
  const t=s.threads.find(t=>t.id===id);
  assert.equal(t.draft,'');assert.deepEqual(t.messages,[]);assert.deepEqual(t.sent,[]);
  assert.deepEqual(s.history[id],[]);assert.ok(!s.facts.some(f=>f.customerId===id));
  assert.ok(!s.takeovers.includes(id));
  for(const record of [s.chosen,s.edits])assert.ok(!Object.keys(record).some(k=>k.startsWith(s.storeId+':'+id+':')));
};

test('A-only restore saves B under its own identity and loads A without leaking B drafts',()=>{
  let s=dirtySlot(app.createInitialState(),'t1');
  const a=s,text=backupFor(s.business,'store-demo');
  s=action(s,'BUSINESS_STORE',{storeId:'store-outlet'});s=dirtySlot(s,'t1');
  s={...s,auto:true,consented:true,consentPending:true};
  const b=s,epochs=[s.businessEpoch,s.historyImportEpoch,s.knowledgeImportEpoch];
  s=action(s,'BUSINESS_RESTORE',{text});
  assert.equal(s.storeId,'store-demo');assert.deepEqual(s.threads,a.threads);
  assert.deepEqual(s.history,a.history);assert.deepEqual(s.edits,a.edits);
  const cached=s.storeSessions['store-outlet'];
  assert.equal(cached.storeId,'store-outlet');assert.deepEqual(cached.threads,b.threads);
  assert.equal(cached.mapping.t1,JSON.stringify(['store-outlet','demo','t1']));
  assert.equal(s.auto,false);assert.equal(s.consented,false);assert.equal(s.consentPending,false);
  assert.equal(s.permission,b.permission);
  assert.ok(s.businessEpoch>epochs[0]&&s.historyImportEpoch>epochs[1]&&s.knowledgeImportEpoch>epochs[2]);
  assert.equal(s.businessPreview,null);
  assert.deepEqual(app.reducer(s,{type:'IMPORT_HISTORY',epoch:epochs[1],history:b.history}).history,s.history);
  assert.deepEqual(app.reducer(s,{type:'IMPORT_KNOWLEDGE',epoch:epochs[2],entries:b.knowledge}).knowledge,s.knowledge);
  assert.equal(action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(snapshot(s)),epoch:epochs[0]}),s);
  s=action(s,'BUSINESS_RESTORE',{text:domain.exportBusinessBackup(b.business)});
  s=action(s,'BUSINESS_STORE',{storeId:'store-outlet'});
  assert.deepEqual(s.threads,b.threads);assert.deepEqual(s.edits,b.edits);
});

test('A-only restore without an A session seeds only built-in demo identities',()=>{
  let s=app.createInitialState();const text=backupFor(s.business,'store-demo');
  s=action(s,'BUSINESS_STORE',{storeId:'store-outlet'});s=dirtySlot(s,'t1');
  s={...s,storeSessions:{}};s=action(s,'BUSINESS_RESTORE',{text});
  assert.equal(s.storeId,'store-demo');assert.equal(app.currentThread(s).draft,'');
  assert.equal(app.currentThread(s).messages[0].id,'m1');assert.deepEqual(s.history.t1,[]);
  assert.equal(s.storeSessions['store-outlet'].threads[0].draft,'私有草稿 t1');
});

test('save and revert mapping changes clear only the affected customer slot',()=>{
  let s=dirtySlot(dirtySlot(app.createInitialState(),'t2'),'t1');
  const untouched=s.threads[1],history=s.history.t2,facts=s.facts.filter(f=>f.customerId==='t2');
  s=saveMapping(s,'t1',null);assertEmptySlot(s,'t1');assert.equal(s.editing,null);
  s=dirtySlot(s,'t1');const epoch=s.historyImportEpoch;
  s=action(s,'BUSINESS_REVERT',{key:domain.entityKey(customer(s,'t1'))});
  assertEmptySlot(s,'t1');assert.ok(s.historyImportEpoch>epoch);
  assert.deepEqual(s.threads[1],untouched);assert.deepEqual(s.history.t2,history);
  assert.deepEqual(s.facts.filter(f=>f.customerId==='t2'),facts);
  assert.ok(s.takeovers.includes('t2'));assert.ok(Object.keys(s.edits).some(k=>k.startsWith('store-demo:t2:')));
});

test('CRM unmapped -> t1 apply and t1 replacement never inherit demo/private state',()=>{
  let s=dirtySlot(app.createInitialState(),'t1');
  const business=structuredClone(s.business);
  business.records=business.records.map(e=>e.storeId===s.storeId&&e.kind==='customer'&&e.id==='t1'?
    {...e,data:{...e.data,conversationId:null}}:e);
  s=action(s,'BUSINESS_RESTORE',{text:domain.exportBusinessBackup(business)});
  s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(snapshot(s))});s=action(s,'BUSINESS_APPLY');
  s=dirtySlot(s,'t1');const untouched=s.threads[1],crm=customer(s,'crm-client');
  const page={...snapshot(s),previousCursor:'crm-1',cursor:'crm-2',records:[
    {...crm,version:2,data:{...crm.data,conversationId:'t1'}}]};
  s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(page)});assert.ok(s.businessPreview,s.businessStatus);
  s=action(s,'BUSINESS_APPLY');assertEmptySlot(s,'t1');assert.deepEqual(s.threads[1],untouched);
  s=dirtySlot(s,'t1');
  const next={...page,previousCursor:'crm-2',cursor:'crm-3',records:[
    {...page.records[0],version:3,data:{...crm.data,conversationId:null}},
    {...crm,id:'crm-replacement',data:{...crm.data,conversationId:'t1'}}]};
  s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(next)});assert.ok(s.businessPreview,s.businessStatus);
  s=action(s,'BUSINESS_APPLY');assertEmptySlot(s,'t1');assert.deepEqual(s.threads[1],untouched);
});

test('restore compares source and customer identity even when the same slot remains selected',()=>{
  const original=app.createInitialState();
  for(const replacement of ['source','customer']){
    let s=dirtySlot(original,'t1');const business=structuredClone(s.business);
    business.records=business.records.map(e=>{
      if(e.storeId!==s.storeId)return e;
      if(replacement==='source')return {...e,sourceId:'crm'};
      if(e.kind==='customer'&&e.id==='t1')return {...e,id:'new-client'};
      if(e.kind==='order'&&e.data.customerId==='t1')return {...e,data:{...e.data,customerId:'new-client'}};
      return e;
    });
    s=action(s,'BUSINESS_RESTORE',{text:domain.exportBusinessBackup(business)});assertEmptySlot(s,'t1');
    if(replacement==='customer')assert.deepEqual(s.threads[1],original.threads[1]);
  }
});

test('new external and unmapped store sessions start with blank chats and history',()=>{
  let s=app.createInitialState();
  s=action(s,'BUSINESS_ADD_STORE',{id:'external',name:'外部店铺'});
  s=action(s,'BUSINESS_STORE',{storeId:'external'});
  for(const id of ['t1','t2','t3'])assertEmptySlot(s,id);
  s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify({...snapshot(s),records:snapshot(s).records.map(e=>({...e,data:{...e.data,conversationId:'t1'}}))})});
  s=action(s,'BUSINESS_APPLY');s=action(s,'BUSINESS_STORE',{storeId:'store-demo'});
  s={...s,storeSessions:{}};s=action(s,'BUSINESS_STORE',{storeId:'external'});
  for(const id of ['t1','t2','t3'])assertEmptySlot(s,id);
});

test('cached destination sessions are reconciled against a restored mapping before switch',()=>{
  let s=action(app.createInitialState(),'BUSINESS_STORE',{storeId:'store-outlet'});
  s=dirtySlot(s,'t1');s=action(s,'BUSINESS_STORE',{storeId:'store-demo'});
  const business=structuredClone(s.business);
  business.records=business.records.map(e=>e.storeId==='store-outlet'?{...e,sourceId:'crm'}:e);
  const originalBackup=domain.exportBusinessBackup(s.business);
  s=action(s,'BUSINESS_RESTORE',{text:domain.exportBusinessBackup(business)});
  assert.equal(s.storeSessions['store-outlet'].threads[0].draft,'');
  // Visiting the store is not required to invalidate its previous mapping.
  s=action(s,'BUSINESS_RESTORE',{text:originalBackup});
  s=action(s,'BUSINESS_STORE',{storeId:'store-outlet'});assertEmptySlot(s,'t1');
});

test('native business mutations and restore preserve real conversation and binding',()=>{
  let s=app.createInitialState(true);
  const binding={generation:1,pid:321,windowId:456,customerId:'t2',messageId:'native-msg'};
  s=app.reducer(s,{type:'NATIVE_MESSAGE',message:{type:'support.observation',revision:1,binding,
    conversation:{name:'原生客户',messages:[{id:'native-msg',who:'customer',text:'真实消息'}],draft:'真实草稿'},observing:true}});
  assert.equal(s.nativeObserving,true);
  s=app.reducer(s,{type:'REPLY_TEXT',key:app.activeReplyKey(s),text:'原生人工回复'});
  const native=s,backup=backupFor(s.business,'store-demo');
  s=saveMapping(s,'t1',null);s=action(s,'BUSINESS_REVERT',{key:domain.entityKey(customer(s,'t1'))});
  s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(snapshot(s))});s=action(s,'BUSINESS_APPLY');
  s=action(s,'BUSINESS_STORE',{storeId:'store-outlet'});s=action(s,'BUSINESS_RESTORE',{text:backup});
  for(const key of ['threadId','threads','binding','history','facts','edits','chosen','permission','nativeObserving'])assert.deepEqual(s[key],native[key],key);
  assert.deepEqual(s.storeSessions,{});assert.deepEqual(app.businessOrders(s),[]);
});

test('management owns all effective selected-store records while order tab stays customer-authorized',()=>{
  const local=app.createInitialState(),all=domain.effectiveEntities(local.business,local.storeId);
  assert.ok(all.filter(e=>e.kind==='order').length>app.businessOrders(local).length);
  const revoked={...local,permission:false},native={...local,native:true,permission:true};
  const unmapped=saveMapping(local,'t1',null);
  for(const s of [revoked,native,unmapped]){
    assert.deepEqual(app.businessOrders(s),[]);
    assert.deepEqual(app.businessManagementEntities(s),domain.effectiveEntities(s.business,s.storeId));
    const id=app.businessManagementEntities(s).find(e=>e.kind==='order').id;
    assert.equal(app.reducer(s,{type:'OPEN_ORDER',orderId:id}).orderSelected,null);
  }
  const other=all.find(e=>e.kind==='order'&&e.data.customerId!=='t1');
  assert.ok(other);assert.ok(app.businessManagementEntities(local).some(e=>e.id===other.id));
  assert.ok(!app.businessOrders(local).some(e=>e.orderId===other.id));
  assert.equal(app.reducer(local,{type:'OPEN_ORDER',orderId:other.id}).orderSelected,null);
  const detached=app.businessManagementEntities(local);detached[0].id='mutated';
  assert.deepEqual(app.businessManagementEntities(local),all);
  const outlet=action(local,'BUSINESS_STORE',{storeId:'store-outlet'});
  assert.ok(app.businessManagementEntities(outlet).every(e=>e.storeId==='store-outlet'));
});

test('unchanged customer identities retain drafts, history, facts and human replies across business writes',()=>{
  let s=dirtySlot(app.createInitialState(),'t1');const original=s;
  const retained=()=>{
    for(const key of ['threads','history','facts','chosen','edits','takeovers','knowledge'])assert.deepEqual(s[key],original[key],key);
  };
  const product=domain.effectiveEntities(s.business,s.storeId,'product')[0];
  s=action(s,'BUSINESS_SAVE',{entity:{...product,data:{...product.data,name:'人工核对商品'}}});retained();
  s=action(s,'BUSINESS_REVERT',{key:domain.entityKey(product)});retained();
  s=action(s,'BUSINESS_PREVIEW',{text:JSON.stringify(snapshot(s))});
  s=action(s,'BUSINESS_APPLY');retained();
  s=action(s,'BUSINESS_RESTORE',{text:domain.exportBusinessBackup(s.business)});retained();
});
