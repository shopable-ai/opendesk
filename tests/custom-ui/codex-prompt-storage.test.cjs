'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const repo=path.resolve(__dirname,'../..');
const scripts=path.join(repo,'examples/custom-ui/codex-prompt-shortcuts');
const storageSource=fs.readFileSync(path.join(scripts,'storage.js'),'utf8');
const lockSource=fs.readFileSync(path.join(scripts,'lock.js'),'utf8');
const mainSource=fs.readFileSync(path.join(scripts,'main.js'),'utf8');
// Reuse the manager's actual validator without executing the manager or any UI API.
const schemaSource=mainSource.slice(mainSource.indexOf('const own='),mainSource.indexOf('function importBackup('));
const run=fs.mkdtempSync((fs.mkdirSync(path.join(repo,'.runtime/tests/codex-prompt-storage'),{recursive:true}),
  path.join(repo,'.runtime/tests/codex-prompt-storage/node-')));
let serial=0;
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const root=path.join(run,String(++serial));fs.mkdirSync(root,{recursive:true});
  const cwd=path.join(root,'repo'),scriptDir=path.join(cwd,'examples/custom-ui/codex-prompt-shortcuts');
  fs.mkdirSync(scriptDir,{recursive:true});
  const legacy=base=>path.join(base,'.runtime/examples/custom-ui/codex-prompt-shortcuts');
  const stable=path.join(root,'user/Library/Application Support/OpenDesk/codex-prompt-shortcuts');
  const leases=new Set(),writes=[],hooks={};
  const File={
    cwd:()=>cwd,join:path.join,
    exists:fs.existsSync,
    stat(target){try{const s=fs.statSync(target);return {type:s.isFile()?'file':s.isDirectory()?'directory':'other',size:s.size};}
      catch(e){if(e.code==='ENOENT')return null;throw e;}},
    realPath:fs.realpathSync,
    ensureDir:target=>fs.mkdirSync(target,{recursive:true}),
    listDir(target){const names=fs.readdirSync(target);if(hooks.listDir)hooks.listDir(target,names);return names;},
    writeNew(target,text){
      if(hooks.beforeWrite)hooks.beforeWrite(target,text);
      fs.writeFileSync(target,text,{flag:'wx'});writes.push(target);
      if(hooks.afterWrite)hooks.afterWrite(target,text);
    },
    open(target,mode){
      const fd=fs.openSync(target,mode);let closed=false,owned=false,position=0;
      const check=()=>assert.equal(closed,false,'closed handle');
      return {
        tryLock(){check();if(owned)return true;if(leases.has(target))return false;
          leases.add(target);owned=true;return true;},
        readBytes(max){check();const size=fs.fstatSync(fd).size-position;
          if(size>max)throw Object.assign(new Error('read budget'),{code:'READ_LIMIT'});
          const data=Buffer.alloc(size);fs.readSync(fd,data,0,size,position);position+=size;
          if(hooks.readBytes)return hooks.readBytes(target,data);
          return new Uint8Array(data).buffer;},
        read(max){return new TextDecoder().decode(this.readBytes(max));},
        write(value){check();fs.writeSync(fd,value);},
        truncate(size){check();fs.ftruncateSync(fd,size);},sync(){check();fs.fsyncSync(fd);},
        close(){if(closed)return;closed=true;if(owned)leases.delete(target);fs.closeSync(fd);
          if(hooks.close)hooks.close(target);}
      };
    }
  };
  function context({workdir=cwd,script=scriptDir,env={HOME:path.join(root,'user')},os='darwin'}={}){
    const ctx=vm.createContext({File:{...File,cwd:()=>workdir},path,TextEncoder,TextDecoder,
      System:{getPlatformInfo:()=>({os}),getEnv:key=>env[key]},Execution:{scriptDir:script}});
    vm.runInContext(lockSource+'\n'+storageSource+'\n'+schemaSource+
      '\nthis.schema={verified,empty};',ctx);
    return ctx;
  }
  const ctx=context();
  const validateRecovery=value=>{
    ctx.schema.verified(JSON.parse(value.baseline));
    if(value.pending!==null)ctx.schema.verified(value.pending);
    assert.equal(typeof value.dirty,'boolean');
  };
  const initialize=(options={},which=ctx)=>which.OpenDeskPromptStorage.initialize({
    verified:which.schema.verified,empty:which.schema.empty,validateRecovery,...options});
  const doc=(revision=7)=>({...clone(ctx.schema.empty()),revision,
    prompts:[{id:'prompt_123',body:'  原样\r\n正文 👩🏽‍💻 e\u0301\n',label:'原样',name:'sample',enabled:true,order:0}]});
  function put(target,text){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);return text;}
  function library(base=cwd,revision=7){const text='\uFEFF'+JSON.stringify(doc(revision),null,4)+'\r\n';
    put(path.join(legacy(base),'library.json'),text);return text;}
  return {root,cwd,scriptDir,stable,legacy,leases,writes,hooks,ctx,context,initialize,doc,put,library};
}
const code=value=>error=>error.code===value;

test('default user directory survives cwd changes and preserves saved revision/body on restart',async()=>{
  const f=fixture(),first=await f.initialize();
  assert.equal(first.dir,f.stable);assert.equal(first.status,'created');
  const saved=f.doc(19);fs.writeFileSync(first.file,JSON.stringify(saved));
  const other=path.join(f.root,'other');fs.mkdirSync(other);
  const restarted=await f.initialize({},f.context({workdir:other}));
  assert.equal(restarted.file,first.file);assert.deepEqual(clone(restarted.data),saved);
  assert.equal(f.leases.size,0);
});

test('one repository legacy library migrates exactly with a backup; later stable edits do not reimport it',async()=>{
  const f=fixture(),original=f.library();
  const result=await f.initialize();assert.equal(result.status,'migrated');
  assert.equal(fs.readFileSync(result.file,'utf8'),original);
  assert.equal(fs.readFileSync(path.join(result.migration.backupDir,'library.json'),'utf8'),original);
  assert.equal(fs.readFileSync(path.join(f.legacy(f.cwd),'library.json'),'utf8'),original);
  fs.writeFileSync(result.file,JSON.stringify(f.doc(25)));
  const loaded=await f.initialize();assert.equal(loaded.data.revision,25);
  // Clearing disposable originals does not clear the persistent library or backup.
  fs.rmSync(f.legacy(f.cwd),{recursive:true});
  assert.equal((await f.initialize()).data.revision,25);
});

test('legacy cwd fallback is discovered without treating cwd as the new persistent root',async()=>{
  const f=fixture(),other=path.join(f.root,'old-cwd');fs.mkdirSync(other);
  f.library(other,11);
  const result=await f.initialize({},f.context({workdir:other}));
  assert.equal(result.dir,f.stable);assert.equal(result.data.revision,11);
  assert.equal((await f.initialize()).data.revision,11);
});

test('multiple legacy libraries and unregistered persistent/legacy pairs fail closed even if identical',async()=>{
  const f=fixture(),other=path.join(f.root,'other');fs.mkdirSync(other);
  f.library();f.library(other);
  await assert.rejects(f.initialize({},f.context({workdir:other})),code('MULTIPLE_LIBRARIES'));
  assert.equal(fs.existsSync(path.join(f.stable,'library.json')),false);
  f.put(path.join(f.stable,'library.json'),JSON.stringify(f.doc(90)));
  await assert.rejects(f.initialize(),code('MULTIPLE_LIBRARIES'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.stable,'library.json'),'utf8')).revision,90);
});

test('changed or newly discovered legacy data after migration cannot be silently chosen',async()=>{
  const f=fixture();f.library();const saved=await f.initialize();const stable=fs.readFileSync(saved.file,'utf8');
  f.library(f.cwd,8);
  await assert.rejects(f.initialize(),code('LEGACY_CHANGED'));
  assert.equal(fs.readFileSync(saved.file,'utf8'),stable);
  const other=path.join(f.root,'other');fs.mkdirSync(other);f.library(other);
  await assert.rejects(f.initialize({},f.context({workdir:other})),code('MULTIPLE_LIBRARIES'));
});

test('migration preserves dirty/pending recovery state and history while rebinding only the active library path',async()=>{
  const f=fixture();f.library();const source=f.legacy(f.cwd),oldFile=path.join(source,'library.json');
  const value={schemaVersion:1,library:oldFile,dirty:true,editId:'prompt_123',
    baseline:JSON.stringify(f.doc()),draft:{body:'未保存\r\n原样',label:'草稿',name:'draft',enabled:true,bundleId:'',backup:''},
    pending:f.doc(8),resolution:{kind:'WRITE_UNCERTAIN',expected:f.doc(8)}};
  const raw=JSON.stringify(value,null,3)+'\n',name='draft-recovery/draft-test-123.json';
  f.put(path.join(source,name),raw);f.put(path.join(source,'draft-recovery/history/intent-old.json'),raw);
  const result=await f.initialize();const migrated=JSON.parse(fs.readFileSync(path.join(result.dir,name),'utf8'));
  assert.deepEqual(migrated,{...value,library:result.file});
  assert.equal(fs.readFileSync(path.join(source,name),'utf8'),raw);
  assert.equal(fs.readFileSync(path.join(result.migration.backupDir,name),'utf8'),raw);
  assert.equal(fs.readFileSync(path.join(result.migration.backupDir,'draft-recovery/history/intent-old.json'),'utf8'),raw);
  // New draft locks are created by recovery.js, not copied with their obsolete file binding.
  assert.equal(fs.existsSync(path.join(result.dir,name+'.lock')),false);
  assert.ok(result.migration.files.includes(name+'.lock'));
});

test('active legacy writer/draft and unknown legacy locks cannot be taken over',async()=>{
  for(const role of ['library','draft','unknown']){
    const f=fixture();f.library();const dir=f.legacy(f.cwd),file=path.join(dir,'library.json');
    let lease;
    if(role==='unknown')f.put(path.join(dir,'library.lock'),'legacy-owner-do-not-delete');
    else{
      const target=role==='library'?file:path.join(dir,'draft-recovery/draft-active.json');
      if(role==='draft')f.put(target,'{}');
      lease=f.ctx.OpenDeskPromptStorageLock.create({file:target,
        lockPath:role==='library'?path.join(dir,'library.lock'):target+'.lock',
        backupDir:path.join(dir,'lock-recovery')}).acquire();
    }
    await assert.rejects(f.initialize(),code(role==='unknown'?'LEGACY_LOCK':'LOCKED'));
    assert.equal(fs.existsSync(path.join(f.stable,'library.json')),false);
    if(lease)lease.close();
    else assert.equal(fs.readFileSync(path.join(dir,'library.lock'),'utf8'),'legacy-owner-do-not-delete');
    assert.equal(f.leases.size,0);
  }
});

test('backup failure, exclusive publish conflict, and readback uncertainty preserve originals without automatic retries',async()=>{
  for(const failure of ['backup','publish','readback']){
    const f=fixture(),original=f.library();const target=path.join(f.stable,'library.json');
    f.hooks.beforeWrite=(name)=>{
      if(failure==='backup'&&name.includes('migration-backups')&&name.endsWith('library.json'))
        throw Object.assign(new Error('disk full'),{code:'ENOSPC'});
      if(failure==='publish'&&name===target)fs.writeFileSync(name,'external writer');
    };
    f.hooks.afterWrite=name=>{
      if(failure==='readback'&&name===target)fs.writeFileSync(name,'unconfirmed');
    };
    await assert.rejects(f.initialize());
    assert.equal(fs.readFileSync(path.join(f.legacy(f.cwd),'library.json'),'utf8'),original);
    assert.equal(f.leases.size,0);
    delete f.hooks.beforeWrite;delete f.hooks.afterWrite;
    if(failure!=='backup'){
      await assert.rejects(f.initialize(),code('MIGRATION_INCOMPLETE'));
      assert.equal(fs.existsSync(path.join(f.stable,'migration-complete.json')),false);
    }else assert.equal(fs.existsSync(target),false);
  }
});

test('first-use publish uncertainty also leaves an incomplete intent, rather than silently loading empty data',async()=>{
  const f=fixture();const file=path.join(f.stable,'library.json');
  f.hooks.afterWrite=target=>{if(target===file)fs.writeFileSync(file,'{}');};
  await assert.rejects(f.initialize(),code('STORAGE_READBACK'));
  delete f.hooks.afterWrite;
  await assert.rejects(f.initialize(),code('MIGRATION_INCOMPLETE'));
});

test('corrupt libraries, unbound recovery, and missing validators never fall back to empty',async()=>{
  const broken=fixture();broken.put(path.join(broken.legacy(broken.cwd),'library.json'),'{}');
  await assert.rejects(broken.initialize(),code('INVALID_LIBRARY'));
  assert.equal(fs.existsSync(path.join(broken.stable,'library.json')),false);
  const malformed=fixture();malformed.put(path.join(malformed.legacy(malformed.cwd),'library.json'),'private-body-must-not-be-logged');
  await assert.rejects(malformed.initialize(),error=>error.code==='STORAGE_JSON'&&!error.message.includes('private-body'));
  const orphan=fixture();orphan.put(path.join(orphan.stable,'draft-recovery/draft-orphan.json'),'{}');
  await assert.rejects(orphan.initialize(),code('INVALID_RECOVERY'));
  const unbound=fixture();unbound.library();unbound.put(path.join(unbound.legacy(unbound.cwd),'draft-recovery/draft-bad.json'),
    JSON.stringify({schemaVersion:1,library:'/wrong/library.json'}));
  await assert.rejects(unbound.initialize(),code('INVALID_RECOVERY'));
  const missing=fixture();missing.library();missing.put(path.join(missing.legacy(missing.cwd),'draft-recovery/draft-good.json'),
    JSON.stringify({schemaVersion:1,library:path.join(missing.legacy(missing.cwd),'library.json')}));
  await assert.rejects(missing.initialize({validateRecovery:undefined}),code('INVALID_RECOVERY'));
});

test('invalid user/script paths reject without cwd fallback; platform user roots are explicit',async()=>{
  const f=fixture();
  await assert.rejects(f.initialize({},f.context({env:{}})),code('STORAGE_PATH'));
  await assert.rejects(f.initialize({},f.context({env:{HOME:'relative'}})),code('STORAGE_PATH'));
  await assert.rejects(f.initialize({},f.context({script:null})),code('STORAGE_PATH'));
  await assert.rejects(f.initialize({},f.context({script:path.join(f.root,'unproven')})),code('STORAGE_SCRIPT_DIR'));
  const linux=await f.initialize({},f.context({os:'linux',env:{XDG_DATA_HOME:path.join(f.root,'xdg')}}));
  assert.equal(linux.dir,path.join(f.root,'xdg/OpenDesk/codex-prompt-shortcuts'));
  await assert.rejects(f.initialize({},f.context({os:'windows',env:{APPDATA:'relative'}})),code('STORAGE_PATH'));
});

test('source changes during migration and lock cleanup errors cannot report success',async()=>{
  const f=fixture();f.library();
  f.hooks.afterWrite=target=>{if(target===path.join(f.stable,'library.json'))f.library(f.cwd,9);};
  await assert.rejects(f.initialize(),code('LEGACY_CHANGED'));
  assert.equal(fs.existsSync(path.join(f.stable,'migration-complete.json')),false);
  const newDraft=fixture();newDraft.library();const recovery=path.join(newDraft.legacy(newDraft.cwd),'draft-recovery');
  fs.mkdirSync(recovery);
  let injected=false;
  newDraft.hooks.listDir=target=>{
    if(target===recovery&&!injected){injected=true;newDraft.put(path.join(recovery,'draft-racing.json'),'{}');}
  };
  await assert.rejects(newDraft.initialize(),code('LEGACY_CHANGED'));
  assert.equal(fs.existsSync(path.join(newDraft.stable,'library.json')),false);
  const close=fixture();close.hooks.close=target=>{
    if(target===path.join(close.stable,'library.lock'))throw new Error('close failed');
  };
  await assert.rejects(close.initialize(),code('LOCK_CLEANUP'));
  assert.equal(close.leases.size,0);
});

test('path aliases are rejected before any legacy content is migrated',async()=>{
  const f=fixture();f.library();const source=path.join(f.legacy(f.cwd),'library.json');
  const alias=path.join(f.root,'aliased-library.json');fs.renameSync(source,alias);fs.symlinkSync(alias,source);
  await assert.rejects(f.initialize(),code('STORAGE_ALIAS'));
  assert.equal(fs.existsSync(path.join(f.stable,'library.json')),false);
  const locked=fixture();locked.library();const dir=locked.legacy(locked.cwd);
  const lockPath=path.join(dir,'library.lock'),other=path.join(locked.root,'external.lock');
  locked.put(other,JSON.stringify({protocol:'opendesk.prompt-shortcuts.flock.v1',file:path.join(dir,'library.json')})+'\n');
  const before=fs.readFileSync(other,'utf8');fs.symlinkSync(other,lockPath);
  await assert.rejects(locked.initialize(),code('STORAGE_ALIAS'));
  assert.equal(fs.readFileSync(other,'utf8'),before);
});


test('explicit isolated library never scans or migrates legacy or default user data',async()=>{
  const f=fixture();const legacy=f.library();const destination=path.join(f.root,'isolated');
  const context=f.context({script:'/not-an-example',env:{}});
  const result=await f.initialize({userDataDir:destination,migrateLegacy:false},context);
  assert.equal(result.status,'created');assert.equal(result.data.prompts.length,0);
  assert.equal(fs.readFileSync(path.join(f.legacy(f.cwd),'library.json'),'utf8'),legacy);
  assert.equal(fs.existsSync(f.stable),false);
  await assert.rejects(f.initialize({migrateLegacy:false}),code('STORAGE_CONTRACT'));
});
