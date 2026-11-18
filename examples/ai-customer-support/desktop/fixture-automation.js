// Native fixture integration only. It cannot bind to WeChat or another account.
(function(root){
  'use strict';
  function create({target,adapter,read,action,publish,domain,clock,authorized,log}){
    const rules=domain.initialKnowledge();
    let selected=null,lastStatus='',takingAction=false,ownReply=null;
    const scopeFor=b=>({pid:target.pid,window:String(b.windowId),customer:b.customerId,
      account:'local-test-fixture:'+target.pid,knowledge:'builtin-demo-v1'});
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const scopeMatches=(b,s)=>!!b&&equal(scopeFor(b),s);
    const assertScope=s=>{
      if(!authorized()||!scopeMatches(adapter.current?.binding,s))throw Error('Fixture scope no longer authorized');
    };
    function observation(conversation,binding){
      const messages=conversation.messages.map(m=>{
        const match=/^(t[123])-m([1-9]\d*)$/.exec(m.id);
        if(!match||match[1]!==binding.customerId)throw Error('Native fixture identity required');
        return {id:m.id,sequence:Number(match[2]),role:m.who,text:m.text};
      });
      return {scope:scopeFor(binding),complete:true,
        contextId:[binding.customerId,messages[0]?.id||'empty',messages.at(-1)?.id||'empty',messages.length].join(':'),
        draft:conversation.draft,watermark:messages.at(-1)?.sequence||0,messages};
    }
    async function fresh(scope){
      assertScope(scope);
      const {conversation,binding}=await read();
      assertScope(scope);
      if(!scopeMatches(binding,scope))throw Error('Fresh fixture session changed');
      return observation(conversation,binding);
    }
    function proposal(request){
      const sources=[];
      for(const message of request.triggers){
        const a=domain.inspectKnowledge(message.text,rules,true);
        if(a.kind!=='exact'||!a.hit?.k.eligible||a.hit.k.scope||!a.hit.k.enabled)throw Error('Human knowledge review required');
        if(!sources.some(k=>k.id===a.hit.k.id))sources.push(a.hit.k);
      }
      if(!sources.length)throw Error('No eligible fixture knowledge');
      const text='【OpenDesk 本地测试】'+sources.map(k=>k.a).join('\n');
      const result={text,approved:true,coverage:'full',knowledgeScope:request.scope.knowledge,
        approvalId:'fixture-policy-v1:'+request.id,expiresAt:clock.now()+5000};
      log('controlled-proposal',{requestId:request.id,scope:request.scope,triggers:request.triggers.map(m=>m.id),
        sources:sources.map(k=>({id:k.id,source:k.source,text:k.a})),answerVersion:result.approvalId,text});
      return result;
    }
    const controller=root.OpenDeskSupportControlledReply.create({clock,observe:({scope})=>fresh(scope),
      propose:proposal,
      validateFresh:async({request,evidence,observation:before})=>{
        const now=await fresh(request.scope);
        return {trigger:request.triggers.every(m=>now.messages.some(n=>equal(m,n))),
          context:equal(now,before),emptyDraft:now.draft==='',authorized:authorized()&&equal(selected,request.scope),
          knowledgeApproved:equal(proposal(request).text,evidence.text)};
      },
      send:async({request,evidence,observation:before,isCurrent})=>{
        const guard=()=>{assertScope(request.scope);if(!isCurrent()||!equal(selected,request.scope))throw Error('Controlled authority changed');};
        let attempted=false;
        try{
          takingAction=true;ownReply=null;guard();
          const current=await fresh(request.scope);guard();
          if(!equal(current,before)||current.draft!=='')return {status:'failed'};
          // action() performs another complete tree/foreground/value check,
          // immediately before each directed native action. No retries.
          attempted=true;
          await action({kind:'draft',text:evidence.text,scope:request.scope,before,guard});
          guard();
          const filled=await fresh(request.scope);guard();
          if(!equal({...filled,draft:''},before)||filled.draft!==evidence.text)throw Error('Draft changed before send');
          const receipt=await action({kind:'send',text:evidence.text,scope:request.scope,before:filled,guard});
          log('controlled-send-receipt',{requestId:request.id,receipt});
          if(receipt?.status==='sent'&&typeof receipt.messageId==='string'){
            // Observations can run after action() returns but before the
            // controller's independent confirmation settles. Only this exact
            // receipt plus unchanged full history is our own pending reply.
            ownReply={scope:request.scope,messages:[
              ...before.messages.map(m=>({id:m.id,who:m.role,text:m.text})),
              {id:receipt.messageId,who:'agent',text:evidence.text}
            ]};
          }
          return receipt;
        }catch(error){log('controlled-send-stopped',{requestId:request.id,error:String(error),attempted});return {status:attempted?'unknown':'failed'};}
        finally{takingAction=false;}
      }});
    async function report(){
      const b=adapter.current?.binding;if(!b)return;
      const status=controller.status();
      const payload={type:'support.automationStatus',binding:b,mode:status.mode,reason:status.reason,
        requests:status.requests,queued:status.queued,lastOutcome:status.lastOutcome};
      const key=JSON.stringify(payload);if(key===lastStatus)return;lastStatus=key;
      await publish(payload);log('controlled-status',payload);
    }
    function ingest(conversation,binding){
      if(selected&&!scopeMatches(binding,selected))controller.pause();
      else if(controller.status().mode==='enabled'){
        if(takingAction)return;
        const own=ownReply&&scopeMatches(binding,ownReply.scope)&&conversation.draft===''&&
          equal(conversation.messages,ownReply.messages);
        if(conversation.draft!==''||(conversation.messages.at(-1)?.who==='agent'&&
          (controller.status().busy||controller.status().queued)&&!own))controller.takeover();
        else controller.ingest(observation(conversation,binding));
      }
    }
    async function handle(message){
      if(!message||message.type!=='support.automation')return;
      if(!['enable','pause','resume','revoke','takeover'].includes(message.action))return;
      const b=adapter.current?.binding;
      if(!b||!message.binding||!['pid','windowId','customerId'].every(k=>b[k]===message.binding[k]))return;
      if(['enable','resume'].includes(message.action)&&!adapter.matches(message.binding))return;
      if(message.action==='enable'){
        if(controller.status().mode==='locked'||!authorized())return;
        selected=scopeFor(message.binding);await controller.enable(selected);
      }else if(message.action==='resume'){
        if(!authorized()||!equal(selected,scopeFor(message.binding)))return;
        await controller.resume();
      }else controller[message.action]();
      await report();
    }
    return {handle,ingest,report,pause:()=>controller.pause(),revoke:()=>controller.revoke(),takeover:()=>controller.takeover(),status:()=>controller.status()};
  }
  root.OpenDeskSupportFixtureAutomation={create};
})(globalThis);
