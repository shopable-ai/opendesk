import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..');
async function load(file){
  const result=await build({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',
    format:'esm',target:'node22',minify:false,logLevel:'silent'});
  const js=result.outputFiles.find(f=>f.path.endsWith('.js'))?.text;
  assert.ok(js,'esbuild must return JS for '+file);
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const catalog=await load('src/domain/catalog.ts');
const knowledge=await load('src/domain/knowledge.ts');
const history=await load('src/domain/history.ts');
const state=await load('src/state.tsx');

test('same fixture provides six products, twelve images and eight orders',()=>{
  assert.equal(catalog.products.length,6);
  assert.equal(catalog.products.flatMap(p=>p.images).length,12);
  assert.equal(catalog.allOrders.length,8);
  assert.ok(catalog.products.every(p=>catalog.productArt(p).startsWith('data:image/svg+xml')));
});
test('orders remain customer-scoped even when detail key is reused',()=>{
  assert.equal(catalog.ordersForCustomer('t1',true).length,3);
  assert.equal(catalog.ordersForCustomer('t2',true).length,3);
  assert.equal(catalog.ordersForCustomer('t3',true).length,2);
  assert.deepEqual(catalog.ordersForCustomer('t1',false),[]);
  assert.deepEqual(catalog.ordersForCustomer('unknown',true),[]);
  assert.equal(catalog.orderForCustomer('t2','OD-DEMO-1001',true),null);
  assert.equal(catalog.orderForCustomer('t1','OD-DEMO-1001',false),null);
});
test('knowledge must match evidence; imported entries are never auto-eligible',()=>{
  const kb=knowledge.initialKnowledge();
  const hit=knowledge.matchKnowledge('签收后 7 天内还能申请退款吗？',kb,true);
  assert.equal(hit?.exact,true);
  assert.equal(hit?.k.id,'k1');
  assert.equal(knowledge.matchKnowledge('签收后 7 天内还能申请退款吗？',kb,false),null);
  assert.equal(knowledge.matchKnowledge('活动是否继续？',kb,true),null);
  const imported=knowledge.parseKnowledgeFile(JSON.stringify({entries:[
    {question:'示例问题',answer:'示例答案',eligible:true}
  ]}),'safe.json',kb.length,7);
  assert.equal(imported[0].eligible,false);
  assert.equal(imported[0].id,'k8');
  assert.throws(()=>knowledge.parseKnowledgeFile(JSON.stringify({entries:[{question:'',answer:'a'}]}),'bad.json',7,7));
});
test('customer history parses only demo schema, facts start unconfirmed',()=>{
  const source=history.initialHistory(),facts=history.extractFacts(source,[]);
  assert.ok(facts.length>=5);
  assert.ok(facts.every(f=>f.status==='candidate'));
  const fixture={schemaVersion:1,format:'opendesk.ai-customer-support.customer-history-demo',demo:true,
    customers:[{customerId:'t1',sessions:[{sessionId:'abc',messages:[{messageId:'msg1',role:'customer',text:'我更喜欢蓝色。'}]}]}]};
  const parsed=history.parseHistoryFile(JSON.stringify(fixture));
  assert.equal(parsed.t1[0].messages.length,1);
  assert.throws(()=>history.parseHistoryFile(JSON.stringify({...fixture,demo:false})));
  assert.throws(()=>history.parseHistoryFile(JSON.stringify({...fixture,customers:[{...fixture.customers[0],customerId:'unknown'}]})));
  const merged=history.mergeHistory(source,parsed);
  assert.equal(merged.t1.length,source.t1.length+1);
  assert.equal(source.t1.length,1);
  const markdown=history.profileMarkdown('客户','t1','t1',merged,facts);
  assert.match(markdown,/## 客户摘要/);
});
test('single reducer owner protects draft, session and deduplicated simulated send',()=>{
  let s=state.createInitialState();
  s=state.reducer(s,{type:'FILL',id:'t1',messageId:'m1',text:'回复甲',replace:false});
  assert.equal(state.currentThread(s).draft,'回复甲');
  s=state.reducer(s,{type:'FILL',id:'t1',messageId:'m1',text:'回复乙',replace:false});
  assert.equal(state.currentThread(s).draft,'回复甲');
  s=state.reducer(s,{type:'SET_THREAD',id:'t2'});
  s=state.reducer(s,{type:'FILL',id:'t1',messageId:'m1',text:'串会话',replace:true});
  assert.equal(s.threads.find(t=>t.id==='t1').draft,'回复甲');
  assert.equal(state.currentThread(s).draft,'');
  s=state.reducer(s,{type:'OPEN_ORDER',orderId:'OD-DEMO-1001'});
  assert.equal(s.orderSelected,null);
  s=state.reducer(s,{type:'RECEIVE',id:'t2',text:'物流怎么查询？'});
  const latest=state.latestCustomerMessage(state.currentThread(s));
  s=state.reducer(s,{type:'FILL',id:'t2',messageId:latest.id,text:'回复物流',replace:false});
  s=state.reducer(s,{type:'SEND',id:'t2',messageId:latest.id});
  const sent=s.threads.find(t=>t.id==='t2');
  assert.equal(sent.sent.filter(id=>id===latest.id).length,1);
  const count=sent.messages.length;
  s=state.reducer(s,{type:'SEND',id:'t2',messageId:latest.id});
  assert.equal(state.currentThread(s).messages.length,count);
  s=state.reducer(s,{type:'SETTING',key:'permission',value:false});
  assert.deepEqual(catalog.ordersForCustomer(s.threadId,s.permission),[]);
});
