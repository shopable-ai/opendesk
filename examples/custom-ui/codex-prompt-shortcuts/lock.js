// Script-local persistence coordination; library.json remains the only data source.
// Every v1 kernel-lock writer holds the same persistent inode until data I/O ends.
(function(root){
  'use strict';
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  function create({file,lockPath,backupDir,onRecovered=()=>{}}){
    const header=JSON.stringify({protocol:'opendesk.prompt-shortcuts.flock.v1',file})+'\n';
    const headerBytes=new TextEncoder().encode(header).length;
    function read(){
      const reader=File.open(lockPath,'r');
      try{return reader.read(65536);}finally{reader.close();}
    }
    function released(tail){
      try{
        const lines=tail.split('\n');
        if(lines.length!==3||lines[2]!=='')return false;
        const a=JSON.parse(lines[0]),b=JSON.parse(lines[1]);
        return a.state==='held'&&b.state==='released'&&typeof a.token==='string'&&a.token===b.token;
      }catch(e){return false;}
    }
    return {acquire(){
      // Exclusive creation keeps legacy writeNew clients from entering. A legacy
      // nonce has no kernel-lock protocol proof and is never deleted or adopted.
      if(!File.exists(lockPath))try{File.writeNew(lockPath,header);}
      catch(e){if(!File.exists(lockPath))throw e;}
      const handle=File.open(lockPath,'a');
      let closed=false;
      try{
        if(typeof handle.tryLock!=='function')throw fail('HOST_REBUILD_REQUIRED','当前宿主缺少 FileHandle.tryLock，请使用配套构建');
        if(!handle.tryLock())throw fail('LOCKED','另一实例正在保存；未抢占锁或修改数据');
        const before=read();
        if(!before.startsWith(header))throw fail('LEGACY_LOCK','锁格式未知或属于旧实例；未修改，请先证明旧 owner 已退出再备份恢复');
        const token=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
        const tail=before.slice(header.length);
        if(tail&&!released(tail)){
          // Acquiring the kernel lock proves no active v1 protocol writer.
          // Preserve the exact incomplete receipt before replacing metadata.
          File.ensureDir(backupDir);
          const backup=File.join(backupDir,'library.lock-'+token+'.txt');
          File.writeNew(backup,before);
          onRecovered({backup,protocol:'flock.v1'});
        }
        const held=JSON.stringify({state:'held',token})+'\n';
        // Preserve the static protocol header even if a process dies here. Never
        // unlink/rename the lock inode: doing so would permit split ownership.
        handle.truncate(headerBytes);handle.write(held);handle.sync();
        const expected=header+held;
        return {close(){
          if(closed)return;closed=true;
          try{
            if(read()!==expected)throw fail('LOCK_CHANGED','锁内容发生外部变化，未覆盖，保存需核对');
            handle.write(JSON.stringify({state:'released',token})+'\n');handle.sync();
          }finally{handle.close();}
        }};
      }catch(e){
        if(!closed){closed=true;try{handle.close();}catch(closeError){throw fail('LOCK_CLEANUP',String(closeError));}}
        throw e;
      }
    }};
  }
  root.OpenDeskPromptStorageLock={create};
})(globalThis);
