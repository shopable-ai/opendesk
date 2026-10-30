import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[new URL('../src/domain/business.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const domain=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
vm.runInThisContext(fs.readFileSync(new URL('../desktop/business-files.js',import.meta.url),'utf8'));
const valid=domain.exportBusinessBackup(domain.createBusinessState());
const req=(operation,extra={})=>({type:'support.businessFile',requestId:'workspace-1',operation,...extra});
function fixture(t){
  const base=path.resolve(import.meta.dirname,'../../../.runtime/tests/ai-customer-support/workspace-20261030');fs.mkdirSync(base,{recursive:true});
  const cwd=fs.realpathSync(fs.mkdtempSync(path.join(base,'case-')));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const root=path.join(cwd,'.runtime/business-sync');
  let calls=0,reads=0,writes=0,held=false,writeOverride;
  const File={cwd:()=>cwd,join:path.join,realPath:fs.realpathSync,
    stat(file){try{const s=fs.statSync(file);return{type:s.isDirectory()?'directory':s.isFile()?'file':'other',size:s.isFile()?s.size:null,modifiedAt:s.mtime.toISOString()};}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    ensureDir:file=>fs.mkdirSync(file,{recursive:true}),listDir:fs.readdirSync,
    read:file=>{reads++;return fs.readFileSync(file,'utf8');},
    writeNew(file,text){
      if(path.basename(file)==='workspace-pending.json'){writes++;if(writeOverride)return writeOverride(file,JSON.parse(text));}
      return fs.writeFileSync(file,text,{flag:'wx',mode:0o600});
    },
    move:fs.renameSync,
    open(file,mode){assert.equal(mode,'a');fs.closeSync(fs.openSync(file,'a'));let owned=false;return{tryLock(){if(held)return false;held=true;owned=true;return true;},close(){if(owned)held=false;}};},

  };
  for(const key of Object.keys(File)){const original=File[key];File[key]=(...args)=>{calls++;return original(...args);};}
  const opts={validateBackup:domain.parseBusinessBackup};
  const bridge=OpenDeskSupportBusinessFiles.create(File,opts);
  const transport=OpenDeskSupportBusinessFiles.createTransport(File,opts);
  const put=(name,text)=>{fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name),text);};
  const save=(text=valid,expectedGeneration=0)=>bridge.handle(req('workspaceSave',{text,expectedGeneration}));
  return{cwd,root,File,opts,bridge,transport,put,save,calls:()=>calls,reads:()=>reads,writes:()=>writes,held:()=>held,setWrite:fn=>writeOverride=fn};
}
const slot=(generation,text=valid)=>JSON.stringify({schemaVersion:1,generation,text});
const index=f=>f.bridge.handle(req('workspaceList'));
function status(result,expected='ok',code){assert.equal(result.status,expected,JSON.stringify(result));if(code)assert.equal(result.code,code);return result;}
test('workspace is inert by default; explicit empty lists create no files',t=>{
  const f=fixture(t);assert.equal(f.calls(),0);assert.equal(fs.existsSync(f.root),false);
  assert.deepEqual(index(f).candidates,[]);assert.equal(index(f).generation,0);
  assert.deepEqual(f.bridge.handle(req('list')).entries,[]);assert.equal(fs.existsSync(f.root),false);
});
test('fixed slots preserve exact original and keep at most three increasing generations',async t=>{
  const f=fixture(t);let newest;
  for(let generation=1;generation<=9;generation++){
    const text=' \n'+valid+'\t';newest=status(await f.save(text,generation-1));assert.equal(newest.generation,generation);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,newest.name),'utf8')).text,text);
    const listed=status(index(f));assert.equal(listed.generation,generation);assert.ok(listed.candidates.length<=3);
    const restored=status(f.bridge.handle(req('workspaceRestore',{name:newest.name,generation})));assert.equal(restored.text,text);
  }
  assert.equal(fs.readdirSync(f.root).length,4);assert.deepEqual(index(f).candidates.map(c=>c.generation),[9,8,7]);
  assert.equal(f.held(),false);status(await f.save(valid,0),'error','WORKSPACE_CONFLICT');
});
test('domain contract rejects invalid entities, permissions, references and schemas before writes',async t=>{
  const f=fixture(t);const backup=JSON.parse(valid);
  const invalid=[{...backup,schemaVersion:2},{...backup,permission:true},{...backup,stores:[]},{...backup,records:[{...backup.records[0],data:{}}]},
    {...backup,cursors:{bad:'cursor'}},{...backup,overrides:[backup.records.find(e=>e.kind==='order')]}];
  for(const value of invalid)status(await f.save(JSON.stringify(value)),'error','INVALID_BACKUP');
  status(await f.save('x'.repeat(8*1024*1024+1)),'error','FILE_TOO_LARGE');
  assert.equal(f.writes(),0);assert.equal(fs.existsSync(f.root),false);
  f.put('invalid.json',JSON.stringify(invalid[2]));status(f.bridge.handle(req('restore',{name:'invalid.json'})),'error','INVALID_BACKUP');
  status(f.bridge.handle(req('backup',{text:JSON.stringify(invalid[2])})),'error','INVALID_BACKUP');
});
test('missing canonical validator fails closed before native writes',async t=>{
  const f=fixture(t);const bridge=OpenDeskSupportBusinessFiles.create(f.File);
  status(await bridge.handle(req('workspaceSave',{text:valid,expectedGeneration:0})),'error','VALIDATOR_UNAVAILABLE');assert.equal(f.writes(),0);
});
test('invalid business payload retains generation and never overwrites last valid candidate',async t=>{
  const f=fixture(t);f.put('workspace-slot-0.json',slot(10));f.put('workspace-slot-1.json',slot(11,'{}'));f.put('workspace-slot-2.json',slot(9));
  const before=index(f);assert.equal(before.generation,11);assert.equal(before.candidates.length,2);assert.equal(before.issues[0].code,'INVALID_BACKUP');
  const saved=status(await f.save(valid,11));assert.equal(saved.generation,12);assert.equal(saved.name,'workspace-slot-1.json');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'workspace-slot-0.json'),'utf8')).generation,10);
});
test('corrupt, old-schema and oversized envelopes permit explicit recovery but block uncertain generations',async t=>{
  for(const damaged of ['{bad',JSON.stringify({schemaVersion:2,generation:20,text:valid}),' '.repeat(6*8*1024*1024+1025)]){
    const f=fixture(t);f.put('workspace-slot-0.json',slot(5));f.put('workspace-slot-1.json',damaged);
    const listed=status(index(f));assert.equal(listed.candidates.length,1);assert.equal(listed.issues.length,1);
    status(await f.save(valid,5),'error','WORKSPACE_DAMAGED');
    assert.equal(status(f.bridge.handle(req('workspaceRestore',{name:'workspace-slot-0.json',generation:5}))).text,valid);
  }
});
test('failed atomic write and cancellation keep every old slot; uncertain commit is explicit',async t=>{
  const f=fixture(t);for(let i=0;i<3;i++)f.put(`workspace-slot-${i}.json`,slot(i+1));
  const before=fs.readdirSync(f.root).map(name=>[name,fs.readFileSync(path.join(f.root,name),'utf8')]);
  for(const error of [Error('secret native failure'),Object.assign(Error(),{code:'CANCELED',committed:false})]){
    f.setWrite(async()=>{throw error;});status(await f.save(valid,3),'error','FILE_UNAVAILABLE');assert.equal(f.held(),false);
    for(const [name,text]of before)assert.equal(fs.readFileSync(path.join(f.root,name),'utf8'),text);
  }
  f.setWrite(async()=>{throw{committed:true};});status(await f.save(valid,3),'error','COMMIT_UNKNOWN');
});
test('two host owners coordinate while awaiting atomic IO and reject delayed CAS writes',async t=>{
  const f=fixture(t);let release;f.setWrite((file,value)=>new Promise(resolve=>{release=()=>{fs.writeFileSync(file,JSON.stringify(value));resolve();};}));
  const first=f.save();assert.equal(f.held(),true);
  const second=OpenDeskSupportBusinessFiles.create(f.File,f.opts);
  status(await second.handle(req('workspaceSave',{text:valid,expectedGeneration:0})),'error','WORKSPACE_BUSY');
  release();status(await first);assert.equal(f.held(),false);
  status(await second.handle(req('workspaceSave',{text:valid,expectedGeneration:0})),'error','WORKSPACE_CONFLICT');assert.equal(f.writes(),1);
});
test('stale selected slot cannot restore replacement generation',async t=>{
  const f=fixture(t);for(let i=0;i<4;i++)status(await f.save(valid,i));
  status(f.bridge.handle(req('workspaceRestore',{name:'workspace-slot-0.json',generation:1})),'error','WORKSPACE_CONFLICT');
});
test('root, slot and stable lock symlinks including broken leaves cannot write outside',async t=>{
  for(const part of ['.runtime','business-sync','workspace-slot-0.json','workspace.lock','broken-lock']){
    const f=fixture(t),outside=path.join(f.cwd,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'target'),'PRIVATE');
    if(part==='.runtime')fs.symlinkSync(outside,path.join(f.cwd,'.runtime'));
    else if(part==='business-sync'){fs.mkdirSync(path.join(f.cwd,'.runtime'));fs.symlinkSync(outside,f.root);}
    else{fs.mkdirSync(f.root,{recursive:true});fs.symlinkSync(path.join(outside,part==='broken-lock'?'missing':'target'),path.join(f.root,part==='broken-lock'?'workspace.lock':part));}
    status(await f.save(),'error');assert.equal(fs.readFileSync(path.join(outside,'target'),'utf8'),'PRIVATE');assert.equal(fs.existsSync(path.join(outside,'missing')),false);assert.equal(f.writes(),0);
  }
});
test('basename list is bounded, refreshable and skips aliases/internal slots/oversize',t=>{
  const f=fixture(t);f.put('one.json','{}');f.put('two.png','x');f.put('unsafe..json','{}');f.put('workspace-slot-0.json',slot(1));
  f.put('large.json',Buffer.alloc(8*1024*1024+1));fs.symlinkSync(path.join(f.root,'one.json'),path.join(f.root,'alias.json'));
  let result=status(f.bridge.handle(req('list')));assert.deepEqual(result.entries.map(e=>e.name),['one.json','two.png']);assert.equal(result.truncated,false);
  f.put('three.json','{}');assert.equal(f.bridge.handle(req('list')).entries.length,3);
  for(let i=0;i<600;i++)f.put(`z${i}.txt`,'');
  result=status(f.bridge.handle(req('list')));assert.equal(result.scanned,500);assert.equal(result.truncated,true);
  for(let i=0;i<110;i++)f.put(`a${i}.json`,'{}');
  result=status(f.bridge.handle(req('list')));assert.equal(result.entries.length,100);assert.equal(result.truncated,true);assert.ok(Buffer.byteLength(JSON.stringify(result))<65536);
});
test('workspace transport uploads under 64KiB frames and 120s absolute deadline',async t=>{
  const f=fixture(t);let now=1000;const clock=Date.now;Date.now=()=>now;t.after(()=>Date.now=clock);
  const send=async(operation,extra={})=>{const request=req(operation,extra);assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(request)))<65536);return f.transport.handle(request);};
  const start=status(await send('workspaceSaveStart',{total:valid.length,expectedGeneration:0}));
  for(let offset=0;offset<valid.length;offset+=8192)status(await send('backupChunk',{transferId:start.transferId,offset,text:valid.slice(offset,offset+8192)}));
  now+=120000;status(await send('backupCommit',{transferId:start.transferId}),'error','INVALID_REQUEST');assert.equal(f.writes(),0);
  const next=status(await send('workspaceSaveStart',{total:valid.length,expectedGeneration:0}));
  for(let offset=0;offset<valid.length;offset+=8192)status(await send('backupChunk',{transferId:next.transferId,offset,text:valid.slice(offset,offset+8192)}));
  const saved=status(await send('backupCommit',{transferId:next.transferId}));assert.equal(saved.generation,1);
  let chunk=status(await send('workspaceRestore',{name:saved.name,generation:1})),text=chunk.text;
  while(text.length<chunk.total){chunk=status(await send('readChunk',{transferId:chunk.transferId,offset:text.length}));assert.equal(chunk.generation,1);assert.ok(Buffer.byteLength(JSON.stringify(chunk))<65536);text+=chunk.text;}
  assert.equal(text,valid);
});

test('exact 8MiB original survives envelope escaping beyond File.writeJSON ceiling',async t=>{
  const f=fixture(t),text=valid+' '.repeat(8*1024*1024-Buffer.byteLength(valid));
  assert.equal(Buffer.byteLength(text),8*1024*1024);
  const saved=status(await f.save(text));
  assert.ok(fs.statSync(path.join(f.root,saved.name)).size>8*1024*1024);
  assert.equal(status(f.bridge.handle(req('workspaceRestore',{name:saved.name,generation:1}))).text,text);
});
test('expiration after publishing pending file cannot commit; next attempt reuses bounded scratch names',async t=>{
  const f=fixture(t);let now=1000;const clock=Date.now;Date.now=()=>now;t.after(()=>Date.now=clock);
  f.setWrite((file,value)=>{fs.writeFileSync(file,JSON.stringify(value));now=2000;});
  status(await f.bridge.handle(req('workspaceSave',{text:valid,expectedGeneration:0,deadline:1500})),'error','TRANSFER_EXPIRED');
  assert.equal(index(f).candidates.length,0);assert.equal(fs.existsSync(path.join(f.root,'workspace-pending.json')),true);
  f.setWrite(undefined);status(await f.save());assert.equal(index(f).candidates.length,1);
  assert.equal(fs.existsSync(path.join(f.root,'workspace-pending.json')),false);
  assert.equal(fs.existsSync(path.join(f.root,'workspace-abandoned.json')),true);
  const names=f.bridge.handle(req('list')).entries.map(e=>e.name);assert.deepEqual(names,[]);
});
test('invalid restore identity rejects before any workspace IO',t=>{
  const f=fixture(t);
  for(const extra of [{name:'../a.json',generation:1},{name:'workspace-slot-0.json',generation:0},{name:'workspace-slot-0.json'}])status(f.bridge.handle(req('workspaceRestore',extra)),'error','INVALID_REQUEST');
  assert.equal(f.calls(),0);
});
