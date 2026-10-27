// From repository root: ./dist/opendesk -script tests/runtime-api/file-lock.js -console-mode script
// Only isolated files below .runtime/tests/runtime-api/file-lock are used.
'use strict';
const root=File.join(File.cwd(),'.runtime','tests','runtime-api','file-lock');
File.ensureDir(root);
const role=Execution.env.OPENDESK_FILE_LOCK_ROLE||'single';
const run=Execution.env.OPENDESK_FILE_LOCK_RUN||String(Date.now());
if(!/^[A-Za-z0-9_-]{1,80}$/.test(run))throw new Error('Invalid isolated run id');
const path=File.join(root,run+'.lock');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const first=File.open(path,'a');
try{
  assert(typeof first.tryLock==='function','Matching Runtime with FileHandle.tryLock required');
  if(role==='single'){
    assert(first.tryLock(),'first handle must acquire');
    assert(first.tryLock(),'same-handle acquisition must be idempotent');
    let preserved=false;try{File.writeNew(path,'must not replace a live locked inode');}catch(e){preserved=true;}
    assert(preserved,'exclusive publication must preserve an existing locked path');
    const published=File.join(root,run+'.published');
    const body='完整发布\n中文 👩🏽‍💻 e\u0301';
    File.writeNew(published,body);
    assert(File.read(published)===body,'newly published UTF-8 file must be complete');
    const second=File.open(path,'a');
    try{
      assert(second.tryLock()===false,'another open handle must be excluded');
      first.close();
      assert(second.tryLock(),'explicit close must release the kernel lock');
    }finally{second.close();}
    let closed=false;try{first.tryLock();}catch(e){closed=/closed/.test(String(e));}
    assert(closed,'closed handle must reject');
  }else if(role==='hold'){
    assert(first.tryLock(),'holder must acquire');
    File.writeNew(File.join(root,run+'.ready.json'),JSON.stringify({executionId:Execution.id}));
    // Controller terminates this known test process to prove OS crash release.
    await System.delay(30000);
    throw new Error('Crash-release controller did not terminate holder');
  }else if(role==='contended'){
    assert(first.tryLock()===false,'live process must not be displaced');
  }else if(role==='after-crash'){
    assert(first.tryLock(),'kernel must release the terminated process lock');
  }else throw new Error('Unknown test role');
  console.log('FILE_LOCK_PASS='+JSON.stringify({role,run,path}));
}finally{first.close();}
