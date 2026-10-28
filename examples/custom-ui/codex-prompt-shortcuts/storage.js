// One persistent library; legacy files and migration backups are never merged or removed.
(function(root){
  'use strict';
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  const budget=8388608,folder='codex-prompt-shortcuts';
  const draft=/^draft-[a-z0-9-]+\.json$/;
  const token=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  function absolute(value){
    if(typeof value!=='string'||!path.isAbsolute(value))
      throw fail('STORAGE_PATH','存储目录必须为绝对路径；未回退到工作目录');
    return path.normalize(value);
  }
  function userDirectory(){
    const os=System.getPlatformInfo().os;
    if(os==='windows')return File.join(absolute(System.getEnv('APPDATA')),'OpenDesk',folder);
    if(os==='darwin')return File.join(absolute(System.getEnv('HOME')),'Library','Application Support','OpenDesk',folder);
    if(os==='linux'){
      const xdg=System.getEnv('XDG_DATA_HOME');
      return File.join(xdg?absolute(xdg):File.join(absolute(System.getEnv('HOME')),'.local','share'),'OpenDesk',folder);
    }
    throw fail('STORAGE_PLATFORM','当前平台没有已定义的用户存储目录');
  }
  function stat(target,type){
    const info=File.stat(target);
    if(info&&info.type!==type)throw fail('STORAGE_TYPE','存储路径类型不符；原文件已保留');
    if(info&&File.realPath(target)!==target)throw fail('STORAGE_ALIAS','存储路径为别名；未修改原文件');
    return info;
  }
  function read(target){
    if(!stat(target,'file'))throw fail('STORAGE_MISSING','所需存储文件缺失；未回退到空库');
    const handle=File.open(target,'r');
    try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(handle.readBytes(budget));}
    finally{handle.close();}
  }
  function parse(text){
    try{return JSON.parse(text.replace(/^\uFEFF/,''));}
    catch(e){throw fail('STORAGE_JSON','存储 JSON 无效；原文件已保留');}
  }
  function publish(target,text){
    File.writeNew(target,text);
    if(read(target)!==text)throw fail('STORAGE_READBACK','新文件读回不一致；保留原库及迁移记录，未重试');
  }
  const significant=name=>!name.endsWith('.lock')&&!name.startsWith('lock-recovery/')&&
    !name.includes('/lock-recovery/');
  function inventory(dir){
    const files=[];
    function walk(relative,depth){
      const target=File.join(dir,relative),info=File.stat(target);
      if(!info)return;
      if(File.realPath(target)!==target)throw fail('STORAGE_ALIAS','旧存储包含路径别名；未迁移');
      if(info.type==='file'){
        if(files.length>=256)throw fail('STORAGE_BUDGET','迁移文件过多；原文件已保留');
        files.push(relative);return;
      }
      if(info.type!=='directory'||depth>4)throw fail('STORAGE_TYPE','旧存储包含不支持的文件或目录');
      for(const name of File.listDir(target).sort()){
        if(!name||path.basename(name)!==name||name==='.'||name==='..')
          throw fail('STORAGE_PATH','旧存储文件名无效');
        walk(relative+'/'+name,depth+1);
      }
    }
    for(const name of ['library.json','library.lock','draft-recovery','lock-recovery'])walk(name,0);
    return files.sort();
  }
  function legacyDirectories(){
    const scriptDir=absolute(Execution.scriptDir);
    if(path.basename(scriptDir)!==folder||path.basename(path.dirname(scriptDir))!=='custom-ui'||
        path.basename(path.dirname(path.dirname(scriptDir)))!=='examples')
      throw fail('STORAGE_SCRIPT_DIR','无法从脚本目录确认旧仓库位置；未创建空库');
    const repository=path.dirname(path.dirname(path.dirname(scriptDir)));
    return [...new Set([repository,absolute(File.cwd())].map(base=>
      File.join(base,'.runtime','examples','custom-ui',folder)))];
  }
  function present(dir){
    if(!stat(dir,'directory'))return false;
    return ['library.json','library.lock','draft-recovery'].some(name=>File.stat(File.join(dir,name))!==null);
  }
  // userDataDir is an explicit application-owned override, chiefly for isolated tests.
  // Main should omit it. verified/empty use the manager's existing schema, not a second schema.
  async function initialize({verified,empty,validateRecovery,userDataDir,migrateLegacy=true}={}){
    if(typeof verified!=='function'||typeof empty!=='function'||!root.OpenDeskPromptStorageLock)
      throw fail('STORAGE_CONTRACT','初始化需要 verified、empty 和现有 lock.js');
    if(typeof migrateLegacy!=='boolean'||(!migrateLegacy&&userDataDir===undefined))
      throw fail('STORAGE_CONTRACT','隔离存储需要显式目录');
    const candidates=migrateLegacy?legacyDirectories():[];
    const requested=absolute(userDataDir===undefined?userDirectory():userDataDir);
    File.ensureDir(requested);
    const dir=File.realPath(requested);
    const file=File.join(dir,'library.json'),lockPath=File.join(dir,'library.lock');
    const pending=File.join(dir,'migration-intent.json'),complete=File.join(dir,'migration-complete.json');
    const leases=[],lockRecovery=[];
    function lock(target,lockFile,backupDir){
      stat(lockFile,'file');
      stat(path.dirname(lockFile),'directory');
      const lease=root.OpenDeskPromptStorageLock.create({file:target,lockPath:lockFile,backupDir,
        onRecovered:receipt=>lockRecovery.push(receipt)}).acquire();
      leases.push(lease);
    }
    function lockSource(source){
      const lockedDrafts=new Set();
      lock(File.join(source,'library.json'),File.join(source,'library.lock'),File.join(source,'lock-recovery'));
      const recoveryDir=File.join(source,'draft-recovery');
      if(stat(recoveryDir,'directory'))for(const name of File.listDir(recoveryDir).sort()){
        if(draft.test(name)){
          const target=File.join(recoveryDir,name);
          lock(target,target+'.lock',File.join(recoveryDir,'lock-recovery'));
          lockedDrafts.add('draft-recovery/'+name);
        }
      }
      return lockedDrafts;
    }
    function sourceDirectories(){
      return [...new Set(candidates.filter(present).map(value=>File.realPath(value)))].filter(value=>value!==dir);
    }
    function checkedPlan(){
      if(!stat(pending,'file')||!stat(complete,'file')||read(pending)!==read(complete))
        throw fail('MIGRATION_INCOMPLETE','迁移未确认完成；原库、备份和草稿已保留，禁止自动重试');
      const plan=parse(read(complete));
      if(plan&&plan.schemaVersion===1&&plan.sourceDir===null&&plan.backupDir===null&&
          Array.isArray(plan.files)&&plan.files.length===0)return plan;
      if(!plan||plan.schemaVersion!==1||typeof plan.sourceDir!=='string'||plan.sourceDir===dir||
          !path.isAbsolute(plan.sourceDir)||path.normalize(plan.sourceDir)!==plan.sourceDir||
          path.basename(plan.sourceDir)!==folder||path.basename(path.dirname(plan.sourceDir))!=='custom-ui'||
          path.basename(path.dirname(path.dirname(plan.sourceDir)))!=='examples'||
          path.basename(path.dirname(path.dirname(path.dirname(plan.sourceDir))))!=='.runtime'||
          typeof plan.backupDir!=='string'||path.dirname(plan.backupDir)!==File.join(dir,'migration-backups')||
          !Array.isArray(plan.files)||plan.files.length>256||new Set(plan.files).size!==plan.files.length||
          plan.files.some(name=>typeof name!=='string'||path.isAbsolute(name)||
            name.split('/').some(part=>!part||part==='.'||part==='..'||part.includes('\\'))||
            !/^(library\.(json|lock)$|(?:draft-recovery|lock-recovery)\/)/.test(name)))
        throw fail('MIGRATION_RECEIPT','迁移记录无效；未选择或覆盖任何库');
      return plan;
    }
    function checkSource(plan){
      if(plan.sourceDir===null)return;
      if(!stat(plan.sourceDir,'directory'))return; // .runtime may legitimately have been cleaned.
      const current=inventory(plan.sourceDir).filter(significant),known=plan.files.filter(significant);
      // Removed originals remain in the immutable backup. New/changed originals require explicit resolution.
      for(const name of current){
        if(!known.includes(name)||read(File.join(plan.sourceDir,name))!==read(File.join(plan.backupDir,name)))
          throw fail('LEGACY_CHANGED','旧库或恢复草稿在迁移后发生变化；未合并或覆盖，请先解决冲突');
      }
    }
    let result;
    try{
      lock(file,lockPath,File.join(dir,'lock-recovery'));
      const sources=sourceDirectories(),hasIntent=File.stat(pending)!==null,hasComplete=File.stat(complete)!==null;
      if(hasIntent||hasComplete){
        const plan=checkedPlan();
        if(sources.some(value=>value!==plan.sourceDir))
          throw fail('MULTIPLE_LIBRARIES','发现未登记的旧库；未合并、覆盖或自动选择');
        if(plan.sourceDir!==null&&stat(plan.sourceDir,'directory'))lockSource(plan.sourceDir);
        checkSource(plan);
        if(!stat(file,'file'))throw fail('MIGRATION_INCOMPLETE','已迁移的库缺失；未用空库或旧库替换');
        result={status:'loaded',data:verified(parse(read(file))),migration:plan.sourceDir===null?null:plan};
      }else if(stat(file,'file')){
        if(sources.length)throw fail('MULTIPLE_LIBRARIES','持久库与旧库同时存在且无迁移凭据；未覆盖');
        result={status:'loaded',data:verified(parse(read(file))),migration:null};
      }else if(sources.length>1){
        throw fail('MULTIPLE_LIBRARIES','仓库与当前工作目录有多份旧库；未合并或自动选择');
      }else if(sources.length===1){
        if(stat(File.join(dir,'draft-recovery'),'directory'))
          throw fail('INVALID_RECOVERY','目标已有恢复目录但库缺失；未覆盖或混合草稿');
        const source=sources[0],lockedDrafts=lockSource(source);
        const names=inventory(source),snapshots=new Map();let bytes=0;
        if(names.some(name=>path.dirname(name)==='draft-recovery'&&draft.test(path.basename(name))&&!lockedDrafts.has(name)))
          throw fail('LEGACY_CHANGED','迁移期间出现未持锁的新恢复草稿；未继续迁移');
        for(const name of names){
          const text=read(File.join(source,name));bytes+=new TextEncoder().encode(text).length;
          if(bytes>33554432)throw fail('STORAGE_BUDGET','迁移超过 32 MiB；原文件已保留');
          snapshots.set(name,text);
        }
        const text=snapshots.has('library.json')?snapshots.get('library.json'):JSON.stringify(verified(empty()),null,2)+'\n';
        const data=verified(parse(text)),drafts=[];
        for(const [name,saved] of snapshots){
          if(path.dirname(name)==='draft-recovery'&&draft.test(path.basename(name))){
            const value=parse(saved);
            if(typeof validateRecovery!=='function'||!value||value.schemaVersion!==1||
                value.library!==File.join(source,'library.json'))
              throw fail('INVALID_RECOVERY','恢复草稿绑定无效或缺少 validateRecovery；原文件已保留');
            try{validateRecovery(value);}
            catch(e){throw fail('INVALID_RECOVERY','恢复草稿结构无效；原文件已保留');}
            drafts.push([name,JSON.stringify({...value,library:file},null,2)+'\n']);
          }
        }
        const backupDir=File.join(dir,'migration-backups',token());File.ensureDir(backupDir);
        for(const [name,saved] of snapshots){
          const target=File.join(backupDir,name);File.ensureDir(path.dirname(target));publish(target,saved);
        }
        const plan={schemaVersion:1,sourceDir:source,backupDir,files:names};
        const receipt=JSON.stringify(plan,null,2)+'\n';
        // Intent precedes all active data publication; completion is the final exclusive publish.
        publish(pending,receipt);
        for(const [name,saved] of drafts){
          const target=File.join(dir,name);File.ensureDir(path.dirname(target));publish(target,saved);
        }
        publish(file,text);
        if(JSON.stringify(verified(parse(read(file))))!==JSON.stringify(data))
          throw fail('STORAGE_READBACK','库结构读回不一致；未重试');
        checkSource(plan);
        publish(complete,receipt);
        result={status:'migrated',data,migration:plan};
      }else{
        // Unbound recovery files in a proposed destination must never be hidden by an empty library.
        if(stat(File.join(dir,'draft-recovery'),'directory'))
          throw fail('INVALID_RECOVERY','目标已有恢复目录但库缺失；未创建空库');
        const data=verified(empty()),text=JSON.stringify(data,null,2)+'\n';
        const receipt=JSON.stringify({schemaVersion:1,sourceDir:null,backupDir:null,files:[]},null,2)+'\n';
        publish(pending,receipt);
        publish(file,text);
        publish(complete,receipt);
        result={status:'created',data:verified(parse(read(file))),migration:null};
      }
    }finally{
      let failed=false;
      for(const lease of leases.reverse())try{lease.close();}catch(e){failed=true;}
      if(failed)throw fail('LOCK_CLEANUP','存储锁关闭未确认；请保留迁移文件并核对，未重试');
    }
    return {dir,file,lockPath,recoveryDir:File.join(dir,'draft-recovery'),lockRecovery,...result};
  }
  root.OpenDeskPromptStorage={initialize};
})(globalThis);
