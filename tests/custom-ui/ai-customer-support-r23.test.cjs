const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../examples/ai-customer-support/desktop/native-adapter.js'),'utf8'),context);
const {create,parse}=context.OpenDeskSupportNative;
const target={pid:42,exePath:'/test/support-chat'};
const win={...target,handle:80,isForeground:true};
function snapshot({id='t1',text='退款申请提交后如何查询进度？',draft='',mid='t1-m1',extra=[]}={}){
  const names={t1:'林女士',t2:'陈先生',t3:'周女士'};
  return {complete:true,truncated:false,backend:'macos-ax',requestId:'actual-request',root:{children:[
    {identifier:'support.session',value:id+' · '+names[id]},
    {identifier:'support.draft.'+id,value:draft},
    {identifier:'support.message.'+mid+'.customer',value:'客户 · '+mid+'\n'+text},...extra]}};
}
test('real node values produce attributed message events and repeated snapshots dedupe',()=>{
  const a=create(target),first=a.accept(win,snapshot()),second=a.accept(win,snapshot());
  assert.equal(first.events[0].text,'退款申请提交后如何查询进度？');
  assert.equal(first.events[0].source.requestId,'actual-request');
  assert.equal(second.changed,false);assert.equal(second.events.length,0);
  assert.equal(second.observation.binding.messageId,'t1-m1');
});
test('cross-customer nodes, incomplete/ambiguous trees, and modified existing IDs fail closed',()=>{
  assert.throws(()=>parse(snapshot({id:'t2'})),/Cross-session/);
  assert.throws(()=>parse({...snapshot(),complete:false}),/incomplete/);
  assert.throws(()=>parse(snapshot({extra:[{identifier:'support.session',value:'t1 · 林女士'}]})),/ambiguous/);
  const a=create(target);a.accept(win,snapshot());
  assert.throws(()=>a.accept(win,snapshot({text:'changed identity body'})),/changed body/);
  assert.throws(()=>a.accept({...win,pid:43},snapshot()),/Unverified/);
});
test('late draft selection and occupied draft cannot write; invalidation/revocation expire binding',()=>{
  const a=create(target),o=a.accept(win,snapshot()).observation;
  const r={type:'support.fillDraft',requestId:'one',binding:o.binding,text:'建议回复',expectedDraft:''};
  assert.equal(a.validateFill(r),'建议回复');
  a.accept(win,snapshot({draft:'人工未发送草稿'}));
  assert.throws(()=>a.validateFill(r),/Draft changed/);
  assert.throws(()=>a.validateFill({...r,expectedDraft:'人工未发送草稿'}),/preserved/);
  a.invalidate('blur');assert.equal(a.matches(r.binding),false);
  a.accept(win,snapshot());assert.equal(a.matches(r.binding),false);
  a.revoke();assert.throws(()=>a.accept(win,snapshot()),/revoked/);
});
test('same text with distinct native message IDs remains distinct; a switched session expires requests',()=>{
  const a=create(target),first=a.accept(win,snapshot()).observation;
  const next=a.accept(win,snapshot({extra:[{identifier:'support.message.t1-m2.customer',value:'客户 · t1-m2\n退款申请提交后如何查询进度？'}]}));
  assert.equal(next.events.length,1);assert.equal(next.events[0].id,'t1-m2');
  assert.equal(a.matches(first.binding),false);
  a.accept(win,snapshot({id:'t2',mid:'t2-m3',text:'物流怎么查询？'}));
  assert.equal(a.matches(next.observation.binding),false);
});
