// Repository root: ./examples/ai-customer-support/scripts/run-desktop.sh
// This is the native adapter demo; preview/index.html is its only React UI.
(0,eval)(File.read(File.join(Execution.scriptDir,'desktop/native-adapter.js')));
(0,eval)(File.read(File.join(Execution.scriptDir,'desktop/query-api-adapter.js')));
const config=await File.readJSON(System.getEnv('OPENDESK_SUPPORT_LAUNCH'));
const evidence=config.evidence;
File.ensureDir(evidence);
const target={pid:config.pid,exePath:config.exePath};
if(!Number.isInteger(target.pid)||target.pid<=0||target.exePath!==File.join(File.cwd(),'.runtime/apps/OpenDeskSupportChat.app/Contents/MacOS/support-chat'))throw Error('Only the explicitly launched test chat is allowed');
const adapter=OpenDeskSupportNative.create(target);
const queryConfig=OpenDeskSupportQueryAPI.config(config.queryApi);
const panel=await ui.createTrustedWindow({id:'supportReactR23',kind:'floating',title:'OpenDesk · AI 客服助手 R2.3',
  position:{mode:'absolute',bounds:{x:740,y:100,width:380,height:720}},
  content:{file:'preview/index.html',basePath:Execution.scriptDir,sha256:config.previewSha256}});
let bound=null,closed=false,revoked=false,paused=false,follow=true,ready=false,visible=false;
let authorizationGeneration=0;
let queue=Promise.resolve(),timer=null,dirty=false,latestRender=null;
let lastError='',lastBounds='',lastPublished=0;
const requestIds=new Set();
const aiRequestIds=new Set();
const aiInflight=new Set();
const log=(type,data)=>{
  const record={at:new Date().toISOString(),type,...data};
  File.append(File.join(evidence,'events.jsonl'),JSON.stringify(record)+'\n');
  console.log('SUPPORT_R23 '+JSON.stringify(record));
};
function sameWindow(w){return !!bound&&w.pid===bound.pid&&w.handle===bound.handle&&w.exePath===bound.exePath;}
async function publish(observation){
  if(!observation||!ready||closed)return;
  await panel.postMessage(observation);lastPublished=observation.revision;
  log('observation',{observation});
}
async function invalidate(reason,hide){
  const current=adapter.current;
  if(current?.observing||current?.reason!==reason)await publish(adapter.invalidate(reason));
  if(hide&&visible){await panel.hide();visible=false;log('hidden',{reason,state:await panel.getState()});}
}
async function exactSnapshot(w){
  const snapshot=await Accessibility.snapshot({within:w,maxDepth:20,maxNodes:500,
    properties:['role','name','identifier','value','enabled','actions','bounds']});
  if(snapshot.root?.identifier!=='opendesk-support-test-chat')throw Error('Unexpected test application window root');
  return snapshot;
}
async function freshTarget(){
  const w=await window.getAppWindow(target);
  if(!w)return null;
  if(bound&&!sameWindow(w))throw Error('Original test window was replaced; explicit relaunch required');
  if(w.title!=='OpenDesk R2.3 Test Chat')throw Error('Unexpected target title');
  const readback=await window.current(w);
  if(readback.handle!==w.handle||readback.pid!==target.pid||readback.exePath!==target.exePath)throw Error('Independent window identity readback failed');
  if(!bound){bound=w;log('bound',{target,window:w,independent:readback});}
  return readback;
}
async function observe(reason){
  if(closed)return;
  if(revoked||paused){
    // Keep checking only the already-bound window's lifecycle, without reading
    // its chat tree or restoring observation/write authority after revocation.
    if(bound){
      let live=null;
      try{live=await window.current(bound);}catch(error){log('lifecycle-unavailable',{error:String(error)});}
      if(!live||!live.isForeground){
        if(visible){await panel.hide();visible=false;log('hidden',{reason:'bound-window-unavailable',state:await panel.getState()});}
      }else if(paused&&!revoked&&ready&&!visible){await panel.show();visible=true;}
    }
    return;
  }
  const w=await freshTarget();
  if(!w){await invalidate('测试聊天不在前台或已最小化',true);return;}
  if(!w.isForeground){await invalidate('测试聊天失去焦点',true);return;}
  const snapshot=await exactSnapshot(w);
  // Recheck foreground and the same window after the tree traversal.
  const after=await window.getAppWindow(target);
  if(revoked){await publish(adapter.current);return;}
  if(paused){await invalidate('已暂停观察',false);return;}
  if(!after||!sameWindow(after)){await invalidate('观察期间身份已变化',true);return;}
  const result=adapter.accept(after,snapshot);
  if(result.changed){await File.writeJSON(File.join(evidence,'ax-latest.json'),snapshot);log('extracted',{reason,events:result.events,source:snapshot.requestId});}
  if(ready&&(result.changed||lastPublished!==result.observation.revision))await publish(result.observation);
  if(!ready)return;
  if(follow){
    const anchor={x:after.x,y:after.y,width:after.width,height:after.height};
    const key=JSON.stringify(anchor);
    if(lastBounds!==key){
      await panel.setSize(380,Math.max(520,Math.min(760,after.height)));
      await panel.setRelativeTo(anchor,{preferredSides:['right','left'],align:'start',gap:8});
      if(ready&&!visible){await panel.show();visible=true;log('shown',{state:await panel.getState()});}
      const actual=await panel.getState();
      const independent=await window.current({id:'darwin:'+actual.hostPid+':native:'+actual.nativeWindowId,
        pid:actual.hostPid,handle:actual.nativeWindowId,title:'OpenDesk · AI 客服助手 R2.3',
        x:actual.bounds.x,y:actual.bounds.y,width:actual.bounds.width,height:actual.bounds.height});
      log('follow-readback',{reason,anchor,assistant:actual,independent});
      if(independent.width!==380||Math.abs(independent.x-actual.bounds.x)>1||Math.abs(independent.y-actual.bounds.y)>1)throw Error('Assistant native bounds disagree');
      lastBounds=key;
    }
  }
  if(ready&&!visible){await panel.show();visible=true;log('shown',{state:await panel.getState()});}
  lastError='';
}
async function receipt(request,status,reason,draft){
  const payload={type:'support.receipt',requestId:request.requestId,binding:request.binding,status,reason,...(draft===undefined?{}:{draft})};
  if(!closed)await panel.postMessage(payload);log('draft-receipt',{receipt:payload});
}
async function fill(request){
  let attempted=false,ref=null;
  try{
    if(closed||revoked||paused)throw Error('Observation closed, paused or revoked');
    if(requestIds.has(request.requestId))throw Error('Duplicate request; no repeated action');
    const text=adapter.validateFill(request);
    requestIds.add(request.requestId);
    if(requestIds.size>500)throw Error('Request budget exhausted; relaunch explicitly');
    const w=await freshTarget();
    if(!w||!sameWindow(w))throw Error('Test chat must remain the verified foreground window');
    const snap=await exactSnapshot(w),actual=OpenDeskSupportNative.parse(snap);
    const latest=actual.messages.filter(m=>m.who==='customer').at(-1);
    if(actual.customerId!==request.binding.customerId||latest?.id!==request.binding.messageId||actual.draft!==request.expectedDraft||!adapter.matches(request.binding))throw Error('Conversation, latest message, or draft changed before input');
    ref=await Accessibility.find({identifier:'support.draft.'+actual.customerId},{within:w,maxDepth:20,maxNodes:500});
    if(!ref)throw Error('Unique draft field unavailable');
    const before=await Accessibility.read(ref,{properties:['value','identifier']});
    const finalConversation=OpenDeskSupportNative.parse(await exactSnapshot(w));
    const front=await window.getAppWindow(target);
    if(before.properties.identifier!=='support.draft.'+request.binding.customerId||before.properties.value!==request.expectedDraft||finalConversation.customerId!==request.binding.customerId||finalConversation.messages.filter(m=>m.who==='customer').at(-1)?.id!==request.binding.messageId||finalConversation.draft!==request.expectedDraft||!front||!sameWindow(front)||!adapter.matches(request.binding)||closed||revoked||paused)throw Error('Final draft precondition changed');
    if(before.properties.value!==text){
      attempted=true;
      const action=await Accessibility.perform(ref,{action:'setValue',value:text});
      log('draft-action',{requestId:request.requestId,action});
      if(!['acknowledged','not_needed'].includes(action.actionState))throw Error('Draft action state unknown');
    }
    await Accessibility.release(ref);ref=null;
    // A new reference and a fresh complete tree are independent observations,
    // rather than the setter receipt or an echo of request.text.
    const after=await freshTarget();
    if(!after)throw Error('Target lost after draft action');
    const readbackSnapshot=await exactSnapshot(after),readback=OpenDeskSupportNative.parse(readbackSnapshot);
    if(readback.customerId!==request.binding.customerId||readback.messages.filter(m=>m.who==='customer').at(-1)?.id!==request.binding.messageId||readback.draft!==text||!adapter.matches(request.binding)||closed||paused||revoked)throw Error('Draft readback identity/value mismatch');
    await File.writeJSON(File.join(evidence,'draft-readback-'+request.requestId+'.json'),readbackSnapshot);
    const result=adapter.accept(after,readbackSnapshot);await publish(result.observation);
    await receipt(request,'verified','原生 Accessibility 新快照回读一致 · 未发送',readback.draft);
  }catch(error){
    const status=attempted?'unknown':'refused';
    if(attempted){paused=true;await invalidate('草稿动作结果未知，已停止；不自动重试',false);}
    await receipt(request,status,String(error));
  }finally{if(ref)await Accessibility.release(ref);}
}
// AI requests read the verified native conversation. HTTP waits outside the AX owner
// queue, so observation, permission revocation and manual draft controls keep working.
async function askAI(request){
  if(!request||request.type!=='support.aiQuery'||
    typeof request.requestId!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(request.requestId)||
    aiInflight.size>=3||aiRequestIds.has(request.requestId)||aiRequestIds.size>=200)return;
  aiInflight.add(request.requestId);aiRequestIds.add(request.requestId);
  const authorization=authorizationGeneration;
  let ctx=null;
  try{
    await enqueue(async()=>{
      if(closed||revoked||paused||!adapter.matches(request.binding))return;
      const w=await freshTarget();
      if(!w||!w.isForeground)return;
      const observed=OpenDeskSupportNative.parse(await exactSnapshot(w));
      const after=await window.getAppWindow(target);
      if(closed||revoked||paused||authorization!==authorizationGeneration||
        !adapter.matches(request.binding)||!after||!sameWindow(after)||!after.isForeground)return;
      const latest=observed.messages.filter(m=>m.who==='customer').at(-1);
      if(observed.customerId!==request.binding.customerId||
         latest?.id!==request.binding.messageId||!latest.text.trim()||
         latest.text!==adapter.current.conversation.messages.filter(m=>m.who==='customer').at(-1)?.text)return;
      ctx={requestId:request.requestId,binding:{...request.binding},question:latest.text};
    });
    if(!ctx)return;
    // The owner queue can yield before dispatch. Recheck live authority and
    // window identity here, with no asynchronous gap before http.post.
    const front=await window.getAppWindow(target);
    if(closed||revoked||paused||authorization!==authorizationGeneration||
      !adapter.matches(ctx.binding)||!front||!sameWindow(front)||!front.isForeground)return;
    let result;
    if(!queryConfig)result=OpenDeskSupportQueryAPI.failed(null,ctx,'NOT_CONFIGURED');
    else{
      try{
        const payload=OpenDeskSupportQueryAPI.request(queryConfig,ctx);
        const response=await http.post(queryConfig.url,payload,{timeout:12000,
          responseType:'json',headers:{'Content-Type':'application/json'}});
        result=OpenDeskSupportQueryAPI.convert(queryConfig,ctx,response);
      }catch{
        result=OpenDeskSupportQueryAPI.failed(queryConfig,ctx,'QUERY_UNAVAILABLE');
      }
    }
    // No model output is applied to the UI before an independent fresh AX read
    // confirms that the same project/session/message is still in focus.
    await enqueue(async()=>{
      if(closed||revoked||paused||authorization!==authorizationGeneration||!adapter.matches(ctx.binding))return;
      const w=await freshTarget();
      if(!w||!w.isForeground)return;
      const observed=OpenDeskSupportNative.parse(await exactSnapshot(w));
      const latest=observed.messages.filter(m=>m.who==='customer').at(-1);
      const after=await window.getAppWindow(target);
      if(closed||revoked||paused||authorization!==authorizationGeneration||
        !after||!sameWindow(after)||!after.isForeground||
        observed.customerId!==ctx.binding.customerId||latest?.id!==ctx.binding.messageId||
        latest.text!==ctx.question||!adapter.matches(ctx.binding)){
        log('ai-stale',{requestId:ctx.requestId});return;
      }
      await panel.postMessage(result);
      log('ai-result',{requestId:ctx.requestId,status:result.status,
        code:result.errorCode,projectId:result.projectId,
        retrievalStatus:result.retrievalStatus,candidates:result.candidates.length});
    });
  }finally{aiInflight.delete(request.requestId);}
}
function enqueue(work){queue=queue.then(()=>closed?undefined:work()).catch(async error=>{
  const message=String(error);
  if(lastError!==message){lastError=message;log('failure',{message});}
  await invalidate(message,true);
});return queue;}
const off=panel.on('message',event=>{
  let message=event.value;
  if(typeof message==='string'){try{message=JSON.parse(message);}catch{return;}}
  if(!message||typeof message.type!=='string')return;
  if(message.type==='support.settings'){
    // Invalidate immediately on the owner loop, including while an AX promise
    // is pending. Only resuming the same still-authorized instance is allowed.
    if(message.permission===false){authorizationGeneration++;revoked=true;adapter.revoke();}
    if(typeof message.paused==='boolean'){
      if(paused!==message.paused)authorizationGeneration++;
      paused=message.paused;
    }
    if(typeof message.follow==='boolean')follow=message.follow;
    enqueue(async()=>{if(revoked)await publish(adapter.current);else if(paused)await invalidate('已暂停观察',false);else await observe('explicit-resume');});
  }else if(message.type==='support.ready'){
    ready=true;enqueue(()=>observe('react-ready'));
  }else if(message.type==='support.rendered'){
    latestRender=message;log('react-rendered',{render:message});
    File.writeJSON(File.join(evidence,'react-rendered.json'),message);
  }else if(message.type==='support.fillDraft')enqueue(()=>fill(message));
  else if(message.type==='support.aiQuery')void askAI(message).catch(()=>log('ai-failure',{code:'AI_HOST_FAILURE'}));
  else log('rejected-message',{messageType:message.type});
});
const offClose=panel.on('close',()=>{authorizationGeneration++;closed=true;revoked=true;adapter.revoke();});
const subscription=window.watchAppWindow(target,hint=>{
  log('window-hint',{hint});dirty=true;
  if(hint.reasons.some(r=>['target-invalidated','window-destroyed','app-terminated-changed'].includes(r))){
    // The hint alone never grants a new window identity.
    return enqueue(()=>invalidate('目标窗口或进程已失效',true));
  }else return enqueue(()=>observe('hint:'+hint.reason));
});
function tick(){timer=setTimeout(async()=>{try{await enqueue(()=>observe(dirty?'hint-fallback':'1000ms-revalidation'));dirty=false;}finally{if(!closed)tick();}},1000);}
try{
  log('startup',{execution:Execution.id,config,capabilities:Accessibility.getCapabilities(),watch:subscription.capabilities});
  await enqueue(()=>observe('startup'));tick();
  if(config.verify){
    const verify=(0,eval)(File.read(File.join(File.cwd(),'tests/custom-ui/ai-customer-support-r23-native.js')));
    await verify({panel,target,evidence,adapter,observe:()=>enqueue(()=>observe('test-revalidate')),
      idle:()=>queue,getRender:()=>latestRender,getBound:()=>bound,log});
    await panel.close();
  }else await panel.waitUntilClosed();
}finally{
  closed=true;if(timer)clearTimeout(timer);subscription.unsubscribe();off();offClose();
  await queue;await panel.close();
  log('cleanup',{window:await panel.getState()});
}
