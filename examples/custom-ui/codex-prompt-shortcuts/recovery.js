// Crash recovery metadata, never a second prompt library or a replay queue.
// A session holds its stable kernel-lock inode for its entire editing lifetime.
(function(root){
  'use strict';
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  const copy=value=>JSON.parse(JSON.stringify(value));
  function create({file,dir,validate,onError=()=>{}}){
    let path=null,lease=null,tail=Promise.resolve(),closed=false;
    const budget=8388608;
    function lock(target){
      return root.OpenDeskPromptStorageLock.create({file:target,lockPath:target+'.lock',
        backupDir:File.join(dir,'lock-recovery')}).acquire();
    }
    function record(value){
      if(!value||value.schemaVersion!==1||value.library!==file)
        throw fail('INVALID_RECOVERY','草稿恢复记录无效；原文件已保留');
      validate(value);
      return value;
    }
    return {
      async start(){
        File.ensureDir(dir);
        // Do not infer ownership from a timestamp, PID or a released-looking receipt.
        for(const name of File.listDir(dir).sort()){
          if(!/^draft-[a-z0-9-]+\.json$/.test(name))continue;
          const candidate=File.join(dir,name);let held=null;
          try{
            held=lock(candidate);
            const saved=record(await File.readJSON(candidate,{maxBytes:budget}));
            if(saved.dirty||saved.pending||saved.resolution){
              path=candidate;lease=held;held=null;
              return copy(saved);
            }
          }catch(e){if(e.code!=='LOCKED')onError(e);}
          finally{if(held)held.close();}
        }
        return null;
      },
      checkpoint(value){
        if(closed)return Promise.reject(fail('RECOVERY_CLOSED','草稿恢复记录已关闭'));
        const snapshot=copy(record({schemaVersion:1,library:file,...value}));
        const task=tail.then(async()=>{
          if(!path){
            const token=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
            const target=File.join(dir,'draft-'+token+'.json');
            // Exclusive publish also prevents an improbable session-ID collision.
            const held=lock(target);
            try{File.writeNew(target,JSON.stringify({schemaVersion:1,library:file,
              dirty:false,draft:null,editId:null,baseline:snapshot.baseline,pending:null,resolution:null})+'\n');}
            catch(e){held.close();throw e;}
            path=target;lease=held;
          }
          await File.writeJSON(path,snapshot,{maxBytes:budget});
          const checked=record(await File.readJSON(path,{maxBytes:budget}));
          if(JSON.stringify(checked)!==JSON.stringify(snapshot))
            throw fail('RECOVERY_UNCERTAIN','草稿恢复记录读回不一致；请保留当前窗口');
        });
        tail=task.catch(()=>{});
        return task;
      },
      async close(){
        closed=true;await tail;
        if(lease){const held=lease;lease=null;held.close();}
      },
      async archive(){
        await tail;
        if(!path||!lease)throw fail('RECOVERY_CLOSED','没有持锁的恢复记录可备份');
        const reader=File.open(path,'r');let text;
        try{text=reader.read(budget);}finally{reader.close();}
        record(JSON.parse(text));
        const history=File.join(dir,'history');File.ensureDir(history);
        const backup=File.join(history,'intent-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'.json');
        File.writeNew(backup,text);
        const checked=File.open(backup,'r');
        try{if(checked.read(budget)!==text)throw fail('RECOVERY_UNCERTAIN','提交意图备份读回不一致');}
        finally{checked.close();}
        return backup;
      },
      location:()=>path
    };
  }
  root.OpenDeskPromptRecovery={create};
})(globalThis);
