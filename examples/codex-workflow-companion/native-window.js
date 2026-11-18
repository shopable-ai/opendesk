// Root command: ./dist/opendesk -ui -script examples/codex-workflow-companion/native-window.js -console-mode script
const base=File.join(System.getEnv('OD_CWF_STATE_DIR') || './.runtime/tests/codex-workflow-companion','endpoint.json');
async function endpoint(){
  // The owner rotates its port and credentials on restart. Re-read before every
  // request so this window reconnects without retaining a stale bearer token.
  const value=await File.readJSON(base);
  if(value?.protocol!=='od.codex-workflow.v1'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.url))throw Error('ENDPOINT_INVALID');
  return value;
}
await endpoint();
const contentFile=File.join(Execution.scriptDir,'preview/index.html');
const hash=await Command.run('/usr/bin/shasum',['-a','256',contentFile],{timeout:3000,emitOutput:false});
const digest=hash.stdout.trim().split(/\s+/)[0];
if(!/^[a-f0-9]{64}$/.test(digest))throw Error('PREVIEW_HASH_UNAVAILABLE');
const panel=await ui.createTrustedWindow({id:'codexWorkflowCompanion',kind:'floating',title:'OpenDesk · Codex Workflow Companion',
  position:{mode:'absolute',bounds:{x:200,y:120,width:700,height:600}},
  content:{file:'preview/index.html',basePath:Execution.scriptDir,sha256:digest}});
let closed=false, disconnected=false, lastRevision=-1;
let refreshPending=false, refreshing=null;
async function present(value){
  if(closed)return false;
  try{await panel.postMessage(value);return true;}
  catch{console.log('CWF_NATIVE_BRIDGE_UNAVAILABLE');return false;}
}
function refresh(){
  if(closed)return Promise.resolve();
  refreshPending=true;
  if(!refreshing)refreshing=(async()=>{
    try{
      do{
        refreshPending=false;
        await refreshOnce();
      }while(refreshPending&&!closed);
    }finally{refreshing=null;}
  })();
  return refreshing;
}
async function refreshOnce(){
  let result;
  try{
    const owner=await endpoint();
    result=await http.get(owner.url+'/api/state?view=compact',{headers:owner.headers,timeout:2500});
    if(result.status!==200||!result.data?.state)throw Error('CORE_UNAVAILABLE');
    if(closed)return;
    // A restart may rotate credentials even if the port stays unchanged.
    const current=await endpoint();
    if(owner.url!==current.url||JSON.stringify(owner.headers)!==JSON.stringify(current.headers)){
      refreshPending=true;
      return;
    }
  }catch{
    if(!closed&&!disconnected){
      disconnected=true;
      console.log('CWF_NATIVE_OWNER_UNAVAILABLE');
      await present({type:'notice',message:'工作流服务不可用，正在等待重新连接；不要重复发送'});
    }
    return;
  }
  if(!await present({type:'state',state:result.data.state})){
    await present({type:'notice',message:'原生状态桥投递失败；服务状态尚未确认，请勿重复操作'});
    return;
  }
  if(disconnected)await present({type:'notice',message:'已重新连接工作流服务'});
  disconnected=false;
  if(lastRevision!==result.data.state.revision){
    lastRevision=result.data.state.revision;
    console.log('CWF_NATIVE_STATE '+JSON.stringify({revision:lastRevision,paused:result.data.state.paused,taskId:result.data.state.active?.taskId||null}));
  }
}
panel.on('message',async e=>{
  const data=e.value;
  let resp, postStarted=false, responseReceived=false;
  try{
  if(!data||typeof data!=='object')return;
  if(data.type==='refresh')return refresh();
  if(data.type==='open'&&typeof data.url==='string'&&/^codex:\/\/threads\/new\?prompt=/.test(data.url)){
    const command=await Command.run('/usr/bin/open',[data.url],{timeout:3000,emitOutput:false});
    await present({type:'notice',message:command.exitCode===0?'已请求 Codex 打开草稿，尚未发送':'打开 Codex 失败'});
    return;
  }
  if(data.type!=='action'||!['start','pause','resume','approve','reconcile','retry_failed','simulate'].includes(data.action))return;
    const owner=await endpoint();
    postStarted=true;
    resp=await http.post(owner.url+'/api/operator',data,{headers:owner.headers,timeout:3000});
    responseReceived=true;
    if(resp.status!==200||resp.data?.ok!==true)throw Error(resp.data?.error||'ACTION_REJECTED');
  }catch(err){
    // A timeout can hide an already applied action. Only an explicit refusal
    // confirms rejection; reconcile via GET and never replay this POST.
    if(postStarted&&(!responseReceived||resp?.data?.ok!==false)){
      console.log('CWF_NATIVE_ACTION_UNKNOWN_NO_REPLAY '+data.action);
      await present({type:'notice',message:'操作结果未知；请求可能已被服务接受，请勿重复操作，正在刷新状态'});
      await refresh();
      return;
    }
    const code=/^[A-Z_]{3,80}$/.test(err.message||'')?err.message:'ACTION_FAILED';
    console.log((responseReceived?'CWF_NATIVE_ACTION_REJECTED ':'CWF_NATIVE_ACTION_FAILED ')+code);
    await present({type:'notice',message:code});
    return;
  }
  // HTTP acceptance is final; presentation must never reject or replay it.
  console.log('CWF_NATIVE_ACTION '+JSON.stringify({action:data.action,revision:resp.data.state?.revision}));
  if(!await present({type:'notice',message:'操作已完成：'+data.action})){
    console.log('CWF_NATIVE_ACTION_ACCEPTED_NO_REPLAY '+data.action);
    await present({type:'notice',message:'操作已被服务接受；原生通知投递失败，请勿重复操作'});
  }
  await refresh();
});
await panel.show();
const windowState=await panel.getState();
console.log('CWF_NATIVE_READY '+JSON.stringify({sha256:digest,hostPid:windowState.hostPid,nativeWindowId:windowState.nativeWindowId}));
await refresh();
const timer=setInterval(()=>{if(!closed)refresh().catch(()=>{});},1000);
await panel.waitUntilClosed();closed=true;clearInterval(timer);
