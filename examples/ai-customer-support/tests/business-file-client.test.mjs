import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[new URL('../src/business-files.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {requestBusinessFile,listBusinessFiles,listNativeWorkspace,saveNativeWorkspace,readNativeWorkspace}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function channel(reply){
  let listener,removed=0,sent=[];
  return {bridge:{onMessage(fn){listener=fn;return()=>removed++;},postMessage(json){assert.ok(Buffer.byteLength(JSON.stringify(json))<=65536);const request=JSON.parse(json);sent.push(request);queueMicrotask(()=>reply?.(request,input=>listener(input)));}},sent,get removed(){return removed;}};
}
const readReply=(r,text='{}',extra={})=>({type:'support.businessFileResult',requestId:r.requestId,status:'ok',name:'x.json',text,transferId:r.requestId,offset:0,total:text.length,...extra});
test('native file read accepts only matching bounded receipts and releases listener',async()=>{
  const c=channel((r,send)=>{send(readReply({...r,requestId:'other'},'wrong'));send(JSON.stringify(readReply(r)));});
  assert.deepEqual(await requestBusinessFile('snapshot',{name:'x.json'},c.bridge),{name:'x.json',text:'{}'});
  assert.equal(c.removed,1);assert.equal(c.sent[0].operation,'snapshot');assert.equal(c.sent[0].name,'x.json');assert.equal(Object.hasOwn(c.sent[0],'path'),false);
});
test('paths, aliases and malformed receipts never yield file content',async()=>{
  for(const name of ['../x.json','/x.json','x/one.json','x..json',''])await assert.rejects(requestBusinessFile('snapshot',{name},channel().bridge));
  for(const extra of [{name:'../x.json'},{text:42},{unknown:true},{status:'error',text:'secret'},{offset:1},{total:8*1024*1024},{text:'x'.repeat(8193)}]){
    const c=channel((r,send)=>send(readReply(r,'{}',extra)));
    await assert.rejects(requestBusinessFile('snapshot',{name:'x.json'},c.bridge));assert.equal(c.removed,1);
  }
});
test('native backup chunks escaped and multibyte text within both JSON wire limits',async()=>{
  const text='x'.repeat(8191)+'😀'+('\u0000你好\\"').repeat(6000),parts=[];let transferId;
  const c=channel((r,send)=>{
    let result={type:'support.businessFileResult',requestId:r.requestId,status:'ok'};
    if(r.operation==='backupStart'){transferId=r.requestId;result={...result,transferId,offset:0,total:text.length};}
    else if(r.operation==='backupChunk'){
      assert.equal(r.transferId,transferId);assert.equal(r.offset,parts.join('').length);assert.ok(r.text.length<=8192);parts.push(r.text);
      assert.equal(r.text.isWellFormed(),true);
      result={...result,transferId,offset:parts.join('').length,total:text.length};
    }else {assert.equal(r.operation,'backupCommit');assert.equal(parts.join(''),text);result.name='business-backup-123-1.json';}
    assert.ok(Buffer.byteLength(JSON.stringify(result))<=65536);send(result);
  });
  assert.deepEqual(await requestBusinessFile('backup',{text},c.bridge),{name:'business-backup-123-1.json'});
  assert.ok(c.sent.length>4);assert.equal(c.removed,c.sent.length);
});
test('large native file reads require contiguous scoped chunks and a final byte limit',async()=>{
  const text='你好'.repeat(15000);let transferId;
  const c=channel((r,send)=>{
    if(r.operation==='snapshot')transferId=r.requestId;
    else {assert.equal(r.operation,'readChunk');assert.equal(r.transferId,transferId);}
    const offset=r.offset||0;
    send(readReply(r,text.slice(offset,offset+8192),{transferId,offset,total:text.length}));
  });
  assert.equal((await requestBusinessFile('snapshot',{name:'x.json'},c.bridge)).text,text);assert.ok(c.sent.length>1);assert.equal(c.removed,c.sent.length);
});
test('a malformed upload acknowledgement never commits a partial backup',async()=>{
  const c=channel((r,send)=>send({type:'support.businessFileResult',requestId:r.requestId,status:'ok',transferId:r.requestId,offset:7,total:2}));
  await assert.rejects(requestBusinessFile('backup',{text:'{}'},c.bridge));assert.equal(c.sent.length,1);
});
test('timeout and broken transport settle once and release listener',async()=>{
  const c=channel();await assert.rejects(requestBusinessFile('snapshot',{name:'x.json'},c.bridge,5),/超时/);assert.equal(c.removed,1);
  c.bridge.postMessage=()=>{throw Error('internal secret path');};
  await assert.rejects(requestBusinessFile('snapshot',{name:'x.json'},c.bridge),/通道不可用/);assert.equal(c.removed,2);
});

test('explicit file lists and workspace wrappers require bounded well-formed receipts',async()=>{
  const respond=(request,body)=>({type:'support.businessFileResult',requestId:request.requestId,status:'ok',...body});
  const c=channel((r,send)=>{
    if(r.operation==='list')send(respond(r,{entries:[{name:'orders.json',size:2,modifiedAt:'2026-10-30T00:00:00Z'},{name:'product.png',size:9,modifiedAt:'2026-10-30T00:00:00Z'}],scanned:2,truncated:false}));
    else if(r.operation==='workspaceList')send(respond(r,{generation:8,candidates:[{name:'workspace-slot-1.json',generation:8,revision:5}],issues:[{name:'workspace-slot-0.json',code:'INVALID_WORKSPACE'}]}));
    else {assert.equal(r.operation,'workspaceRestore');assert.equal(r.name,'workspace-slot-1.json');assert.equal(r.generation,8);send(readReply(r,'{}',{name:r.name,generation:r.generation}));}
  });
  const previous=globalThis.window;globalThis.window={OpenDeskApp:c.bridge};
  try{
    assert.equal(c.sent.length,0);
    assert.deepEqual(await listBusinessFiles(),{files:[{name:'orders.json',kind:'json',size:2},{name:'product.png',kind:'image',size:9}],truncated:false});
    assert.deepEqual(await listNativeWorkspace(),{token:'8',versions:[{id:1,generation:8,revision:5,valid:true},{id:0,generation:0,revision:null,valid:false}]});
    // No preceding index/cache is required to restore the explicit identity.
    assert.deepEqual(await readNativeWorkspace(1,8),{text:'{}'});
    for(const [id,generation] of [[-1,8],[3,8],[1,0],[1,NaN]])await assert.rejects(readNativeWorkspace(id,generation));
  }finally{globalThis.window=previous;}
});
test('workspace save carries CAS token and returns an explicitly refreshed index',async()=>{
  const text='a'.repeat(8191)+'😀'+'中'.repeat(10000);let transferId,offset=0;
  const c=channel((r,send)=>{
    const response={type:'support.businessFileResult',requestId:r.requestId,status:'ok'};
    if(r.operation==='workspaceSaveStart'){assert.equal(r.expectedGeneration,7);transferId=r.requestId;send({...response,transferId,offset:0,total:text.length});}
    else if(r.operation==='backupChunk'){assert.equal(r.offset,offset);assert.equal(r.text.isWellFormed(),true);offset+=r.text.length;send({...response,transferId,offset,total:text.length});}
    else if(r.operation==='backupCommit')send({...response,name:'workspace-slot-2.json',generation:8});
    else{assert.equal(r.operation,'workspaceList');send({...response,generation:8,candidates:[{name:'workspace-slot-2.json',generation:8,revision:5}],issues:[]});}
  });
  const previous=globalThis.window;globalThis.window={OpenDeskApp:c.bridge};
  try{
    assert.deepEqual(await saveNativeWorkspace(text,'7'),{token:'8',versions:[{id:2,generation:8,revision:5,valid:true}]});
    assert.equal(offset,text.length);
    for(const token of ['', '-1', '01','1e2','9007199254740992'])await assert.rejects(saveNativeWorkspace(text,token));
  }finally{globalThis.window=previous;}
});
test('malformed list and workspace index receipts never reach UI',async()=>{
  for(const body of [
    {entries:[],scanned:501,truncated:true},{entries:[{name:'../x.json',size:2,modifiedAt:'2026-10-30'}],scanned:1,truncated:false},
    {entries:Array(101).fill({name:'x.json',size:1,modifiedAt:'2026-10-30'}),scanned:101,truncated:true},
    {entries:[],scanned:0,truncated:false,text:'secret'}
  ]){const c=channel((r,send)=>send({type:'support.businessFileResult',requestId:r.requestId,status:'ok',...body}));await assert.rejects(requestBusinessFile('list',{},c.bridge));}
  for(const body of [
    {generation:1,candidates:[{name:'workspace-slot-0.json',generation:2,revision:0}],issues:[]},
    {generation:1,candidates:[{name:'../x.json',generation:1,revision:0}],issues:[]},
    {generation:1,candidates:[],issues:[{name:'workspace-slot-0.json',code:'SECRET'}]}
  ]){const c=channel((r,send)=>send({type:'support.businessFileResult',requestId:r.requestId,status:'ok',...body}));await assert.rejects(requestBusinessFile('workspaceList',{},c.bridge));}
});
test('workspace restore binds every chunk to the selected slot and generation',async()=>{
  for(const extra of [{generation:9},{name:'workspace-slot-0.json'},{generation:undefined}]){
    const c=channel((r,send)=>send(readReply(r,'{}',{name:'workspace-slot-1.json',generation:8,...extra})));
    await assert.rejects(requestBusinessFile('workspaceRestore',{name:'workspace-slot-1.json',generation:8},c.bridge));
  }
});
