import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..');
const result=await build({entryPoints:[join(root,'src/domain/history.ts')],bundle:true,write:false,
  platform:'node',format:'esm',target:'node22',logLevel:'silent'});
const {initialHistory,parseHistoryFile,mergeHistory,extractFacts,profileMarkdown,bundledHistoryFixture}=
  await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const message={messageId:'m1',role:'customer',text:'我更喜欢蓝色。',at:'2026-10-20'};
const session=messages=>({sessionId:'s1',messages});
const history=messages=>({t1:[session(messages)],t2:[],t3:[]});
const file=customers=>JSON.stringify({schemaVersion:1,
  format:'opendesk.ai-customer-support.customer-history-demo',demo:true,customers});
const customer=sessions=>({customerId:'t1',sessions});

for(const field of ['text','role','at']) {
  const changed={...message,[field]:{text:'我喜欢黑色。',role:'agent',at:'2026-10-21'}[field]};
  test('existing '+field+' conflict rejects the whole import without mutating either input',()=>{
    const original=history([message]), incoming=history([{...message,messageId:'new'},changed]);
    incoming.t2=[session([{...message,messageId:'other'}])];
    const before=structuredClone({original,incoming});
    assert.throws(()=>mergeHistory(original,incoming),error=>{
      assert.match(error.message,/冲突/);
      for(const id of ['t1','s1','m1']) assert.ok(error.message.includes(id));
      return true;
    });
    assert.deepEqual({original,incoming},before);
  });
  for(const layout of ['message','session','customer']) test('file '+layout+' duplicate rejects '+field+' conflict',()=>{
    const sessions=layout==='message'?[session([message,changed])]:[session([message]),session([changed])];
    const customers=layout==='customer'?[customer([sessions[0]]),customer([sessions[1]])]:[customer(sessions)];
    assert.throws(()=>parseHistoryFile(file(customers)),/冲突/);
  });
}

test('identical duplicates are idempotent within files and across imports',()=>{
  const parsed=parseHistoryFile(file([customer([session([message,message]),session([message])]),
    customer([session([message])])]));
  assert.deepEqual(parsed,history([message]));
  assert.deepEqual(mergeHistory(parsed,parsed),parsed);
  const incoming=history([{...message,messageId:'new'}]);
  const merged=mergeHistory(parsed,incoming);
  merged.t1[0].messages[1].text='changed after merge';
  assert.equal(incoming.t1[0].messages[0].text,message.text,'merged history owns its evidence');
});

for(const field of ['sessionId','messageId']) test('numeric '+field+' is rejected before regex coercion',()=>{
  const s=session([{...message}]);
  if(field==='sessionId') s.sessionId=123;
  else s.messages[0].messageId=123;
  assert.throws(()=>parseHistoryFile(file([customer([s])])),/无效/);
});

for(const text of [
  '我不喜欢蓝色。','我不是更喜欢蓝色。','我并非偏好黑色。','我没有说喜欢简洁。',
  '不要短信通知。','请别优先短信联系。','不用短信联系。','我不希望周末配送。',
  '我不是通常穿 M 码。','我不想看尺码表。','我并不是不方便接电话。',
  '撤回之前说的喜欢蓝色。','取消优先短信通知。','我更喜欢蓝色，但刚才说错了。',
  '以前喜欢蓝色，现在不喜欢了。','我喜欢蓝色？','你喜欢蓝色吗？','是否优先短信通知？',
  '可能更喜欢蓝色。','如果我喜欢蓝色呢？','假如周末配送呢？',
  '不是说我不想接电话。','我喜欢蓝色还是黑色，尚未确定。',
  '我喜欢蓝色还是黑色。','我喜欢蓝色或黑色。','撤销之前的优先短信通知。',
  '停止短信联系。','请问喜欢蓝色。','未必喜欢蓝色。',
  '如果周末配送需要加价，请安排周一。',
  '我之前喜欢蓝色，现在改成黑色了。',
  '要是周末配送需要加价，请安排周一。'
]) test('conservative rules omit negated, withdrawn or ambiguous evidence: '+text,()=>{
  assert.deepEqual(extractFacts(history([{...message,text}]),[]),[]);
});

test('positive fixture retains all expected customer-scoped candidates',()=>{
  const parsed=parseHistoryFile(JSON.stringify(bundledHistoryFixture));
  const facts=extractFacts(parsed,[]);
  const values=id=>facts.filter(f=>f.customerId===id).map(f=>f.value).sort();
  assert.deepEqual(values('t1'),['通常穿 M 码','购前希望看尺码表','偏好蓝色','不方便接电话','优先短信联系','优先短信联系'].sort());
  assert.deepEqual(values('t2'),['希望周末配送','优先短信联系','偏好黑色'].sort());
  assert.deepEqual(values('t3'),['倾向简洁款式','通常穿 L 码','购前希望看尺码表','希望周末配送'].sort());
  assert.ok(facts.every(f=>f.status==='candidate' && f.method==='演示规则匹配'));
  assert.equal(extractFacts(initialHistory(),[]).length,8);
  for(const text of ['我不方便接电话。','我不太方便接电话。','我不想接电话。'])
    assert.deepEqual(extractFacts(history([{...message,text}]),[]).map(f=>f.value),['不方便接电话']);
});

test('customer/session boundaries and previous manual decisions remain intact',()=>{
  const imported=history([message]);
  imported.t2=[session([{...message,text:'我喜欢黑色。'}])];
  imported.t1.push({sessionId:'s2',messages:[{...message,text:'我喜欢黑色。'}]});
  const merged=mergeHistory({t1:[],t2:[],t3:[]},imported);
  const facts=extractFacts(merged,[]);
  assert.equal(facts.length,3);
  const previous=facts.map((f,i)=>({...f,status:i===0?'confirmed':'dismissed'}));
  const before=structuredClone(previous);
  assert.deepEqual(extractFacts(merged,previous),before);
  assert.deepEqual(previous,before);
  const markdown=profileMarkdown('甲','t1','t1',merged,previous);
  assert.match(markdown,/已确认信息/);
  assert.ok(!markdown.includes('t2/'));
  assert.deepEqual(extractFacts(history([{...message,role:'agent'}]),[]),[]);
  assert.deepEqual(extractFacts(history([{...message,text:'验证码123，我喜欢蓝色。'}]),[]),[]);
});
