// Root command: ./dist/opendesk -ui -script examples/codex-workflow-companion/native-window.js -console-mode script
const base=File.join(System.getEnv('OD_CWF_STATE_DIR') || './.runtime/tests/codex-workflow-companion','endpoint.json');
const endpoint=await File.readJSON(base);
if(endpoint?.protocol!=='od.codex-workflow.v1'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint.url))throw Error('ENDPOINT_INVALID');
const contentFile=File.join(Execution.scriptDir,'preview/index.html');
const hash=await Command.run('/usr/bin/shasum',['-a','256',contentFile],{timeout:3000,emitOutput:false});
const digest=hash.stdout.trim().split(/\s+/)[0];
if(!/^[a-f0-9]{64}$/.test(digest))throw Error('PREVIEW_HASH_UNAVAILABLE');
const panel=await ui.createTrustedWindow({id:'codexWorkflowCompanion',kind:'floating',title:'OpenDesk · Codex Workflow Companion',
  position:{mode:'absolute',bounds:{x:200,y:120,width:700,height:600}},
  content:{file:'preview/index.html',basePath:Execution.scriptDir,sha256:digest}});
let closed=false;
async function refresh(){
  const result=await http.get(endpoint.url+'/api/state',{headers:endpoint.headers,timeout:2500});
  if(result.status!==200)throw Error('CORE_UNAVAILABLE');
  await panel.postMessage({type:'state',state:result.data.state});
}
panel.on('message',async e=>{
  const data=e.value;
  if(!data||typeof data!=='object')return;
  if(data.type==='refresh')return refresh();
  if(data.type==='open'&&typeof data.url==='string'&&/^codex:\/\/threads\/new\?prompt=/.test(data.url)){
    const command=await Command.run('/usr/bin/open',[data.url],{timeout:3000,emitOutput:false});
    await panel.postMessage({type:'notice',message:command.exitCode===0?'已请求 Codex 打开草稿，尚未发送':'打开 Codex 失败'});
    return;
  }
  if(data.type!=='action'||!['start','pause','resume','approve','reconcile','retry_failed','simulate'].includes(data.action))return;
  try{
    const resp=await http.post(endpoint.url+'/api/operator',data,{headers:endpoint.headers,timeout:3000});
    if(resp.status!==200||resp.data?.ok!==true)throw Error(resp.data?.error||'ACTION_REJECTED');
    await refresh();
  }catch(err){await panel.postMessage({type:'notice',message:String(err.message||'ACTION_FAILED')});}
});
await panel.show();await refresh();
const timer=setInterval(()=>{if(!closed)refresh().catch(()=>{});},1000);
await panel.waitUntilClosed();closed=true;clearInterval(timer);
