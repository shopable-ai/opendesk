import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..');
async function load(file){
  const result=await build({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',
    format:'esm',target:'node22',logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const state=await load('src/state.tsx'),bridge=await load('src/desktop.ts');
const binding={generation:1,pid:321,windowId:456,customerId:'t1',messageId:'external-1'};
const observation=(revision=1,b=binding,extra={})=>({type:'support.observation',revision,binding:{...b},
  conversation:{name:'外部客户',messages:[{id:b.messageId,who:'customer',text:'签收后 7 天内还能申请退款吗？'}],draft:'人工草稿'},
  observing:true,...extra});
const deliver=(s,message)=>state.reducer(s,{type:'NATIVE_MESSAGE',message});
const initial=()=>deliver(state.createInitialState(true),observation());
const fill=(s,text='原生回复')=>state.reducer(s,{type:'NATIVE_FILL',request:{type:'support.fillDraft',
  requestId:'request-1',binding:s.binding,text,expectedDraft:state.currentThread(s).draft}});
const receipt=(b=binding,extra={})=>({type:'support.receipt',requestId:'request-1',binding:{...b},status:'verified',draft:'原生回复',reason:'native readback',...extra});

test('native starts empty and unauthorized; browser retains its offline demo',()=>{
  const native=state.createInitialState(true),browser=state.createInitialState();
  assert.equal(state.observed(native),false);assert.equal(native.binding,null);
  assert.ok(native.threads.every(t=>!t.messages.length&&!t.draft));
  assert.equal(browser.permission,true);assert.equal(state.currentThread(browser).messages[0].id,'m1');
  assert.equal(deliver(browser,observation()),browser);
});

test('only typed data envelopes pass validation; text is kept verbatim as data',()=>{
  const payload=observation();payload.conversation.messages[0].text='<script>dispatch({type:"RESET"})</script>';
  const parsed=bridge.parseNativeMessage(JSON.stringify(payload));
  assert.equal(parsed.conversation.messages[0].text,payload.conversation.messages[0].text);
  payload.binding.pid=999;assert.equal(parsed.binding.pid,321,'parsed envelope owns a fresh binding');
  for(const bad of [null,'{',[],{type:'dispatch',action:{type:'RESET'}},{type:'eval',text:'alert(1)'},
    observation(NaN),observation(-1),observation(1,{...binding,generation:1.5}),
    observation(1,{...binding,pid:0}),observation(1,{...binding,windowId:-1}),
    observation(1,{...binding,customerId:'other'}),observation(1,{...binding,messageId:'wrong'},
      {conversation:observation().conversation}),
    observation(1,binding,{observing:'true'}),observation(1,binding,{reason:1}),
    observation(1,binding,{conversation:{...observation().conversation,draft:123}}),
    observation(1,binding,{conversation:{...observation().conversation,messages:[
      {id:'external-1',who:'customer',text:'x'},{id:'external-1',who:'customer',text:'x'}]}}),
    receipt(binding,{status:'sent'}),receipt(binding,{draft:12}),receipt(binding,{reason:undefined})]){
    assert.equal(bridge.parseNativeMessage(bad),null,JSON.stringify(bad));
  }
});

test('observations retain external message IDs and reject stale revisions or unowned generations',()=>{
  const s=initial();assert.equal(state.currentThread(s).messages[0].id,'external-1');
  assert.equal(s.counter,7,'does not synthesize RECEIVE IDs');
  for(const m of [observation(),observation(0),observation(2,{...binding,generation:0}),
    observation(2,{...binding,pid:999}),observation(2,{...binding,windowId:999}),
    observation(2,{...binding,customerId:'t2'})])assert.equal(deliver(s,m),s);
  const rebound=deliver(s,observation(2,{...binding,generation:2,customerId:'t2'}));
  assert.equal(rebound.threadId,'t2');assert.equal(rebound.binding.generation,2);
});

test('native only follows host binding; simulated actions and settings cannot restore authority',()=>{
  let s=initial();
  for(const a of [{type:'SET_THREAD',id:'t2'},{type:'RESET'},{type:'RECEIVE',id:'t1',text:'x'},
    {type:'SET_DRAFT',id:'t1',text:'fake'},{type:'FILL',id:'t1',messageId:'external-1',text:'fake',replace:true},
    {type:'SEND',id:'t1',messageId:'external-1'},{type:'AUTO_REQUEST'},{type:'AUTO_CONFIRM'},{type:'TAKEOVER'}]){
    assert.equal(state.reducer(s,a),s,a.type);
  }
  s=state.reducer(s,{type:'SETTING',key:'permission',value:false});
  assert.equal(state.observed(s),false);
  assert.equal(state.reducer(s,{type:'SETTING',key:'permission',value:true}),s);
  assert.equal(state.observed(state.reducer(s,{type:'SETTING',key:'paused',value:false})),false);
  assert.equal(state.observed(deliver(s,observation(2))),true,'only host observation restores authority');
});

test('fill request does not write a draft and duplicate clicks do not queue another request',()=>{
  const s=initial(),pending=fill(s);
  assert.equal(state.currentThread(pending).draft,'人工草稿');
  assert.equal(pending.pendingFill.expectedDraft,'人工草稿');
  assert.equal(fill(pending,'another'),pending);
  const wrong=state.reducer(s,{type:'NATIVE_FILL',request:{...pending.pendingFill,expectedDraft:'stale'}});
  assert.equal(wrong,s);
  assert.equal(state.reducer(s,{type:'NATIVE_FILL',request:{...pending.pendingFill,binding:{...binding,messageId:'old'}}}),s);
});

test('only current pending receipt may update a draft, duplicate and foreign receipts are ignored',()=>{
  const s=initial();assert.equal(deliver(s,receipt()),s);
  const pending=fill(s);
  for(const extra of [{requestId:'old'},{requestId:undefined},{draft:undefined},{draft:'forged'}])assert.equal(deliver(pending,receipt(binding,extra)),pending);
  for(const b of [{...binding,customerId:'t2'},{...binding,generation:0},{...binding,pid:999},
    {...binding,windowId:999},{...binding,messageId:'old'}])assert.equal(deliver(pending,receipt(b)),pending);
  const verified=deliver(pending,receipt());
  assert.equal(state.currentThread(verified).draft,'原生回复');
  assert.match(verified.receipt,/verified/);assert.equal(verified.pendingFill,null);
  assert.equal(deliver(verified,receipt()),verified);
  assert.equal(fill(verified),verified,'same message is not blindly repeated');
  const periodic=deliver(verified,observation(2));assert.equal(fill(periodic),periodic);
});

test('periodic observation preserves pending identity until a native receipt',()=>{
  const pending=fill(initial()),next=deliver(pending,observation(2));
  assert.equal(next.pendingFill,pending.pendingFill);
  assert.equal(state.currentThread(deliver(next,receipt())).draft,'原生回复');
});

test('refused and unknown do not fake success or erase drafts without supplied readback',()=>{
  for(const status of ['refused','unknown']){
    const next=deliver(fill(initial()),receipt(binding,{status,draft:undefined,reason:'stop'}));
    assert.equal(state.currentThread(next).draft,'人工草稿');assert.match(next.receipt,new RegExp(status));
    if(status==='unknown')assert.equal(state.observed(next),false);
    assert.equal(fill(next),next);
  }
});

test('new messages and customer switches do not clear another customer draft; late receipts are rejected',()=>{
  const pending=fill(initial());
  const b2={...binding,generation:2,customerId:'t2',messageId:'external-2'};
  const switched=deliver(pending,observation(2,b2,{conversation:{name:'第二位',messages:[
    {id:'external-2',who:'customer',text:'物流怎么查询？'}],draft:'第二位人工草稿'}}));
  assert.equal(switched.threads.find(t=>t.id==='t1').draft,'人工草稿');
  assert.equal(state.currentThread(switched).draft,'第二位人工草稿');
  assert.equal(deliver(switched,receipt()),switched);
  const next=deliver(switched,observation(3,{...b2,messageId:'external-3'},{conversation:{name:'第二位',messages:[
    {id:'external-2',who:'customer',text:'物流怎么查询？'},
    {id:'external-3',who:'customer',text:'新消息'}],draft:'第二位人工草稿'}}));
  assert.equal(state.currentThread(next).draft,'第二位人工草稿');
  assert.equal(next.threads.find(t=>t.id==='t1').draft,'人工草稿');
});

test('full invalidation stops fill; unpause cannot synthesize a live observation',()=>{
  const invalid=deliver(fill(initial()),observation(2,binding,{observing:false,reason:'window lost'}));
  assert.equal(state.observed(invalid),false);assert.equal(invalid.pendingFill,null);
  assert.equal(state.currentThread(invalid).draft,'人工草稿');
  assert.equal(fill(invalid),invalid);assert.equal(deliver(invalid,receipt()),invalid);
  const unpaused=state.reducer(invalid,{type:'SETTING',key:'paused',value:false});
  assert.equal(state.observed(unpaused),false);
});

test('suggestion edits are scoped to full native identity even if message IDs are reused',()=>{
  const s=initial(),key=state.activeReplyKey(s);
  const edited=state.reducer(s,{type:'REPLY_TEXT',key,text:'private old suggestion'});
  const rebound=deliver(edited,observation(2,{...binding,generation:2}));
  assert.notEqual(state.activeReplyKey(rebound),key);
  assert.notEqual(state.activeReplyText(rebound),'private old suggestion');
});

test('bridge uses JSON envelopes and handles missing/failed transport without executing payloads',()=>{
  const posted=[],fake={postMessage:json=>posted.push(JSON.parse(json)),onMessage:()=>()=>{}};
  assert.equal(bridge.desktopBridge(),undefined);
  assert.equal(bridge.postNative(fake,{type:'support.ready'}),true);
  assert.deepEqual(posted,[{type:'support.ready'}]);
  assert.equal(bridge.postNative({...fake,postMessage:()=>{throw Error('closed');}},{type:'support.ready'}),false);
  assert.equal(state.observed(state.reducer(fill(initial()),{type:'NATIVE_FAILURE'})),false);
});

test('server rendering reuses all six business panels inside the native container and preserves browser demo',async()=>{
  // In-memory SSR only: no browser, native UI, build outputs or preview files.
  const result=await build({stdin:{contents:`
    import './src/main.tsx';
    import { renderToStaticMarkup } from 'react-dom/server';
    export const render=()=>renderToStaticMarkup(globalThis.__supportTestElement);
  `,resolveDir:root},bundle:true,write:false,platform:'node',format:'esm',target:'node22',
    banner:{js:'import { createRequire } from "node:module"; const require=createRequire('+JSON.stringify(join(root,'package.json'))+');'},
    loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'capture-root',setup(builder){
      builder.onResolve({filter:/^react-dom\/client$/},()=>({path:'capture-root',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:
        'export function createRoot(){return {render(element){globalThis.__supportTestElement=element}}}'}));
    }}]});
  const previousWindow=globalThis.window,previousDocument=globalThis.document,previousStackLimit=Error.stackTraceLimit;
  Error.stackTraceLimit=0;
  try{
    globalThis.document={getElementById:()=>({})};
    const ui=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
    globalThis.window={OpenDeskApp:{postMessage:()=>{},onMessage:()=>()=>{}}};
    const native=ui.render();
    assert.match(native,/data-native="true"/);
    assert.doesNotMatch(native,/aria-label="模拟聊天软件"|class="preview-top"|class="preview-foot"/);
    assert.equal((native.match(/class="merge-assistant"/g)||[]).length,1);
    for(const id of ['reply','knowledge','customer','products','images','orders']){
      assert.ok(native.includes('id="odiv-'+id+'"'),'existing panel '+id);
    }
    assert.match(native,/等待原生观察/);
    assert.match(native,/aria-label="原生窗口授权" disabled=""/);
    assert.match(native,/aria-label="智能托管" disabled=""/);
    globalThis.window={};
    const browser=ui.render();
    assert.doesNotMatch(browser,/data-native="true"/);
    assert.match(browser,/aria-label="模拟聊天软件"/);
    assert.match(browser,/class="preview-top"/);
    assert.match(browser,/林女士/);
  }finally{
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    delete globalThis.__supportTestElement;
    Error.stackTraceLimit=previousStackLimit;
  }
});

test('empty native conversations use the complete binding with messageId none',()=>{
  const m=observation(1,{...binding,messageId:'none'},{conversation:{name:'空会话',messages:[],draft:'原有草稿'}});
  assert.ok(bridge.parseNativeMessage(m));
  const s=deliver(state.createInitialState(true),m);
  assert.equal(s.binding.messageId,'none');assert.deepEqual(state.currentThread(s).messages,[]);
  assert.equal(state.currentThread(s).draft,'原有草稿');
  assert.equal(fill(s),s,'no customer message to fill against');
  assert.equal(bridge.parseNativeMessage({...m,binding:{...binding,messageId:'other'}}),null);
});

test('ready retries at 500ms until first valid observation, ignores malformed input and cleans up',t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const posted=[];let receive,unsubscribed=0,failures=0,delivered=[];
  const fake={postMessage:json=>posted.push(JSON.parse(json)),onMessage:handler=>{receive=handler;return ()=>{unsubscribed++;};}};
  const cleanup=bridge.connectNative(fake,m=>delivered.push(m),()=>failures++);
  assert.deepEqual(posted,[{type:'support.ready'}]);
  t.mock.timers.tick(500);assert.equal(posted.length,2);
  receive('{');receive({type:'support.observation'});receive(receipt());
  t.mock.timers.tick(500);assert.equal(posted.length,3,'receipt and malformed observation do not acknowledge ready');
  const m=observation(0,{...binding,messageId:'none'},{conversation:{name:'空会话',messages:[],draft:''}});
  receive(JSON.stringify(m));assert.equal(delivered.at(-1).type,'support.observation');
  t.mock.timers.tick(2000);assert.equal(posted.length,3,'valid empty observation cancels timer');
  cleanup();assert.equal(unsubscribed,1);
  const count=delivered.length;receive(observation());assert.equal(delivered.length,count);
  assert.equal(failures,0);
});

test('unmount before observation cancels ready retries; a failed first ready can recover',t=>{
  t.mock.timers.enable({apis:['setInterval']});
  let attempts=0,failures=0,unsubscribed=0;
  const cleanup=bridge.connectNative({postMessage:()=>{if(++attempts===1)throw Error('not listening');},
    onMessage:()=>()=>{unsubscribed++;}},()=>{},()=>failures++);
  assert.equal(failures,1);t.mock.timers.tick(500);assert.equal(attempts,2);
  cleanup();t.mock.timers.tick(1000);assert.equal(attempts,2);assert.equal(unsubscribed,1);
});

test('synchronous first observation still sends mounted ready and installs no retry loop',t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const posted=[];
  const cleanup=bridge.connectNative({postMessage:json=>posted.push(JSON.parse(json)),
    onMessage:handler=>{handler(observation());return ()=>{};}},()=>{},()=>assert.fail('unexpected failure'));
  assert.deepEqual(posted,[{type:'support.ready'}]);
  t.mock.timers.tick(1000);assert.equal(posted.length,1);cleanup();
});

test('periodic same-identity observation preserves open reply editing and order detail',()=>{
  let s=initial();s=state.reducer(s,{type:'REPLY_EDIT',key:state.activeReplyKey(s)});
  s=state.reducer(s,{type:'OPEN_ORDER',orderId:'OD-DEMO-1001'});
  const next=deliver(s,observation(2));
  assert.equal(next.editing,s.editing);assert.equal(next.orderSelected,'OD-DEMO-1001');
});
