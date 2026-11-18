const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const c=vm.createContext({});vm.runInContext(fs.readFileSync('examples/ai-customer-support/desktop/native-adapter.js','utf8'),c);
const win={pid:42,exePath:'/fixture',handle:80,isForeground:true};
function snapshot(messages){return {complete:true,truncated:false,root:{children:[
 {identifier:'support.session',value:'t1 · 林女士'},{identifier:'support.draft.t1',value:''},
 ...messages.map(([id,who,text])=>({identifier:`support.message.${id}.${who}`,value:`${who==='agent'?'客服':'客户'} · ${id}\n${text}`}))]}};}
test('own reply retires old native authority even though latest customer ID is unchanged',()=>{
 const a=c.OpenDeskSupportNative.create(win),first=a.accept(win,snapshot([['t1-m1','customer','相同文字']])).observation;
 const next=a.accept(win,snapshot([['t1-m1','customer','相同文字'],['t1-m2','agent','已回复']]));
 assert.equal(a.matches(first.binding),false);assert.ok(next.observation.binding.generation>first.binding.generation);
 assert.equal(next.events[0].who,'agent');
});
test('role changes cannot reuse the same native message identity',()=>{
 const a=c.OpenDeskSupportNative.create(win);a.accept(win,snapshot([['t1-m1','customer','相同文字']]));
 assert.throws(()=>a.accept(win,snapshot([['t1-m1','agent','相同文字']])),/changed/);
});
