// Repository root:
// ./opendesk -ui -script tests/runtime-api/window-current-owned-macos.js -console-mode script -log-dir .runtime/tests/window-current-owned/run
// Exact handles created by this execution only; no external target discovery/input.
'use strict';
const output=Execution.env.OPENDESK_CURRENT_EVIDENCE||File.join(File.cwd(),'.runtime/tests/window-current-owned',String(Date.now()));
File.ensureDir(output);
const result={scope:'OWN_OPENDESK_WINDOWS_ONLY_NOT_CODEX',samples:[],cases:[]};
const check=(ok,message)=>{if(!ok)throw new Error(message);};
async function create(id){return ui.createWindow({id,title:'OpenDesk OWN exact refresh '+id,
  position:{mode:'absolute',bounds:{x:180,y:100,width:700,height:500}},
  content:{html:'<main>Own window.current regression; not Codex.</main>',css:'main{padding:24px}'}});}
function identity(s){return {id:'darwin:'+s.hostPid+':native:'+s.nativeWindowId,
  pid:s.hostPid,handle:s.nativeWindowId,title:'Own exact refresh',...s.bounds};}
async function refresh(w){
  const start=Date.now(),fresh=await window.current(w);
  result.samples.push({ms:Date.now()-start,id:fresh.id,foreground:fresh.isForeground,bounds:{x:fresh.x,y:fresh.y,width:fresh.width,height:fresh.height}});
  check(fresh.id===w.id&&fresh.pid===w.pid&&fresh.handle===w.handle,'EXACT_IDENTITY_CHANGED');
  check(fresh.exePath===File.join(File.cwd(),'dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host'),'EXECUTABLE_CHANGED');
  return fresh;
}
try{
  let a=await create('a');const b=await create('b');
  await a.show();const wa=identity(await a.getState());
  for(let i=0;i<12;i++)check((await refresh(wa)).isForeground===true,'A_NOT_FOREGROUND');
  await b.show();const wb=identity(await b.getState());
  check((await refresh(wb)).isForeground===true,'B_NOT_FOREGROUND');
  check((await refresh(wa)).isForeground===false,'SIBLING_FALSE_FOREGROUND');
  result.cases.push('same-process-window-focus');
  const bounds={x:220,y:140,width:760,height:540};await a.setBounds(bounds);await a.show();
  const moved=await refresh(wa);
  check(Object.keys(bounds).every(k=>Math.abs(moved[k]-bounds[k])<=1),'GEOMETRY_NOT_REFRESHED');
  result.cases.push('same-handle-move-resize');
  await a.close();a=await create('replacement');await a.show();
  const replacement=await refresh(identity(await a.getState()));
  check(replacement.id!==wa.id,'CLOSED_LIFETIME_REUSED');
  let stale=null;try{await window.current(wa);}catch(e){stale=e.code;}
  check(stale==='STALE_TARGET','OLD_HANDLE_NOT_REJECTED:'+stale);
  result.cases.push('closed-and-replaced-stale-handle');
  const times=result.samples.map(s=>s.ms).sort((a,b)=>a-b);
  result.timing={count:times.length,min:times[0],median:times[Math.floor(times.length/2)],max:times[times.length-1]};
  result.passed=true;console.log('OWN_CURRENT_PASS='+JSON.stringify({cases:result.cases,timing:result.timing,output}));
}catch(e){result.error=String(e);throw e;}
finally{await ui.closeAll();await File.writeJSON(File.join(output,'result.json'),result);}
