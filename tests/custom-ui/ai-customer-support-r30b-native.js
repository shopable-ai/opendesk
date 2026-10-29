// Repository root: configured run-desktop.sh --verify-ai. Requires an isolated
// real Query API whose approved test question selects a generated answer.
// This gate operates actual controls; it never supplies AI results or receipts.
(async function({panel,target,evidence,adapter,observe,idle,getRender,getBound,log}){
  const results=[];let completed=false;
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const check=(id,ok,actual)=>{const r={id,status:ok?'PASS':'FAIL',actual};results.push(r);log('check',r);assert(ok,id);};
  const wait=async(fn,label,timeout=18000)=>{
    const start=Date.now();
    while(Date.now()-start<timeout){if(await fn())return;await sleep(150);}
    throw Error('Timed out: '+label);
  };
  const events=()=>File.read(File.join(evidence,'events.jsonl')).trim().split('\n').map(s=>JSON.parse(s));
  const requests=()=>events().filter(r=>r.type==='ai-request');
  const tree=async(w,values=false)=>Accessibility.snapshot({within:w,maxDepth:24,maxNodes:1800,
    properties:['role','name','identifier','focused','checked','enabled','actions','bounds',...(values?['value']:[])]});
  const chat=async()=>{const w=await window.getAppWindow(target);assert(w&&w.handle===getBound()?.handle,'Owned chat identity/focus changed');return w;};
  const parsed=async()=>OpenDeskSupportNative.parse(await tree(await chat(),true));
  async function act(identifier,action){
    const ref=await Accessibility.find({identifier},{within:await chat(),maxDepth:24,maxNodes:1800});
    assert(ref,'Missing fixture '+identifier);
    try{await Accessibility.perform(ref,action);}finally{await Accessibility.release(ref);}
  }
  const assistant=async()=>{const s=await panel.getState();assert(s.visible,'Assistant hidden');
    return window.current({id:'darwin:'+s.hostPid+':native:'+s.nativeWindowId,pid:s.hostPid,handle:s.nativeWindowId,title:'OpenDesk · AI 客服助手 R2.3',...s.bounds});};
  async function control(name,role='button'){
    await idle();const w=await assistant(),snap=await tree(w);
    const matches=OpenDeskSupportNative.nodes(snap).filter(n=>n.role===role&&(typeof name==='string'?n.name===name:name.test(n.name||'')));
    assert(matches.length===1&&matches[0].enabled!==false,'Missing/disabled/ambiguous control '+name);
    const b=matches[0].bounds,now=await assistant();
    assert(b?.coordinateSpace==='screen'&&['pid','handle','x','y','width','height'].every(k=>w[k]===now[k]),'Control calibration changed');
    return {w,node:matches[0],b};
  }
  async function click(name,role='button'){
    const {w,b,node}=await control(name,role);
    log('ai-human-control',{name:node.name,role,pid:w.pid,windowId:w.handle,bounds:b});
    await mouse.clickForPID(w.pid,b.x+b.width/2,b.y+b.height/2);await sleep(150);await idle();
  }
  async function shot(name){const w=await chat(),s=await panel.getState(),b=s.bounds;
    const x=Math.min(w.x,b.x),y=Math.min(w.y,b.y);
    await page.screenshot({clip:{x,y,width:Math.max(w.x+w.width,b.x+b.width)-x,height:Math.max(w.y+w.height,b.y+b.height)-y},path:File.join(evidence,name+'.png'),returnType:'path'});
  }
  async function message(text){
    const old=(await parsed()).messages.at(-1)?.id;
    await act('support.customer-input',{action:'setValue',value:text});
    await act('support.add-message',{action:'invoke'});await observe();await idle();
    await wait(()=>getRender()?.latestText===text&&getRender().binding.messageId!==old,'new native message rendered');
  }
  async function query(){
    const old=requests().length;await click('获取 AI 知识建议');
    await wait(()=>requests().length===old+1,'trusted Host HTTP dispatch');return requests().at(-1);
  }
  async function response(request){
    await wait(()=>events().some(r=>r.type==='ai-response'&&r.requestId===request.requestId),'real Query HTTP response');
    return events().find(r=>r.type==='ai-response'&&r.requestId===request.requestId);
  }
  const question=System.getEnv('OPENDESK_SUPPORT_TEST_QUESTION')||'APP里都有哪些类型的壁纸可以选？';
  // Fault runs explicitly expect rejection. They do not claim a model call or
  // substitute for the default real-generation gate below.
  const expectedError=System.getEnv('OPENDESK_SUPPORT_EXPECT_QUERY_ERROR');
  assert(!expectedError||['QUERY_UNAVAILABLE','QUERY_CONTRACT_MISMATCH','EVIDENCE_UNVERIFIED'].includes(expectedError),'Unsupported expected test error');
  const safe='您好，我先核对相关资料，确认后再回复您。';
  try{
    await wait(()=>getRender()&&getBound(),'React native handshake');
    await window.activate(await window.current(getBound()));
    await wait(async()=>!!(await window.getAppWindow(target)),'fixture foreground after host startup');
    await observe();await idle();
    await message(question);
    check('native-message-identity',getRender().binding.pid===target.pid&&getRender().binding.customerId==='t1'&&getRender().latestText===question,getRender());
    const request=await query();
    if(expectedError){
      await wait(()=>events().some(r=>r.type==='ai-result'&&r.requestId===request.requestId),'bound failure result');
      const result=events().find(r=>r.type==='ai-result'&&r.requestId===request.requestId);
      await wait(async()=>{
        const nodes=OpenDeskSupportNative.nodes(await tree(await assistant()));
        return nodes.some(n=>n.role==='button'&&n.name==='获取 AI 知识建议'&&n.enabled===true)&&
          nodes.some(n=>n.role==='checkbox'&&n.name?.startsWith('人工核实：'))&&
          !nodes.some(n=>n.role==='checkbox'&&n.name?.startsWith('知识建议：'));
      },'React returned to safe review after failure');
      check('controlled-query-failure-closed',result.code===expectedError&&result.candidates===0&&
        ['error','blocked'].includes(result.status)&&getRender().replyText===safe&&(await parsed()).draft==='',{result,render:getRender()});
      await sleep(500);
      check('controlled-failure-no-retry',requests().length===1,{requests:requests().length});
      check('controlled-failure-no-send',(await File.readJSON(File.join(evidence,'fixture-oracle.json'))).sendActions===0,{});
      await shot('01-controlled-query-failure');
      completed=true;return;
    }
    const wire=await response(request);
    await wait(()=>getRender()?.replyText!==safe,'actual AI recommendation rendered');
    const generated=getRender().replyText;
    check('real-generated-route',wire.httpStatus===200&&wire.provider==='openai-compatible'&&wire.modelCallCounts?.total_provider_requests>0&&wire.rewriteStatus==='completed',wire);
    await File.writeJSON(File.join(evidence,'ai-card-ax.json'),await tree(await assistant()));
    await shot('01-ai-recommendation');
    await click(/^知识建议：/,'checkbox');
    check('human-selected-ai',getRender().replyText===generated,getRender());
    await click('编辑选中回复');
    const editor=await control('编辑知识建议','textField');
    const ref=await Accessibility.find({name:'编辑知识建议',role:'textField'},{within:editor.w,maxDepth:24,maxNodes:1800});
    assert(ref,'Unique native reply editor unavailable');
    const intended=generated+' 已人工核对。';
    try{
      const before=await Accessibility.read(ref,{properties:['value','focused']});
      const scope=await assistant(),state=await panel.getState();
      assert(before.properties.value===generated&&before.properties.focused===true,'Native editor focus/value not verified');
      assert(scope.pid===editor.w.pid&&scope.handle===editor.w.handle&&state.hostPid===scope.pid,'Editor host/window changed');
      const action=await Accessibility.perform(ref,{action:'setValue',value:intended});
      const after=await Accessibility.read(ref,{properties:['value']});
      await File.writeJSON(File.join(evidence,'ai-editor-readback.json'),{before,action,after,render:getRender()});
      assert(after.properties.value===intended,'Native edit value readback differs');
    }finally{await Accessibility.release(ref);}
    // Invoke the completion control without a mouse-induced blur. React must
    // commit the independently read editor value even on this native AX path.
    const done=await control('完成编辑');
    const doneRef=await Accessibility.find({name:'完成编辑',role:'button'},{within:done.w,maxDepth:24,maxNodes:1800});
    assert(doneRef,'Unique completion control unavailable');
    try{await Accessibility.perform(doneRef,{action:'invoke'});}finally{await Accessibility.release(doneRef);}
    await idle();
    await wait(()=>getRender()?.replyText===intended,'React committed actual native edit');
    const edited=getRender().replyText;
    check('human-edit-react-committed',edited===intended,getRender());
    await click('→ 填入聊天草稿');
    await wait(()=>getRender()?.receipt?.includes('verified'),'native independent draft receipt');
    const readback=await parsed();
    check('ai-edited-native-draft-readback',readback.draft===edited&&getRender().draft===edited,{requestId:request.requestId,render:getRender(),readback});
    await shot('02-ai-edited-draft-verified');
    const oracle=await File.readJSON(File.join(evidence,'fixture-oracle.json'));
    check('no-send',oracle.sendActions===0,{sendActions:oracle.sendActions});
    const manual='已有人工草稿，请保留';
    await act('support.draft.t1',{action:'setValue',value:manual});await observe();await idle();
    await wait(()=>getRender()?.draft===manual,'existing human draft observed');
    await click('→ 填入聊天草稿');
    await wait(()=>getRender()?.receipt?.includes('refused'),'existing human draft refused');
    check('ai-cannot-overwrite-human-draft',(await parsed()).draft===manual,getRender());
    await act('support.clear-draft',{action:'invoke'});await observe();await idle();
    // Inflight changes happen only after actual Host dispatch, not while the
    // query is still waiting to read the native conversation.
    for(const scenario of ['new-message','customer-switch','pause']){
      const pending=await query();
      if(scenario==='new-message')await message(question);
      if(scenario==='customer-switch'){
        await act('support.contact.t2',{action:'invoke'});await observe();await idle();
        check('customer-switch-confirmed',getRender().binding.customerId==='t2'&&adapter.current.binding.customerId==='t2',getRender());
      }
      if(scenario==='pause'){
        await click('暂停观察');
        await wait(()=>adapter.current?.reason==='已暂停观察'&&!adapter.current.observing,'explicit pause');
      }
      await response(pending);await sleep(400);await idle();
      const stalePublished=events().some(r=>r.type==='ai-result'&&r.requestId===pending.requestId);
      check('inflight-'+scenario+'-drops-result',!stalePublished&&getRender().replyText===safe,{requestId:pending.requestId,render:getRender()});
      if(scenario==='customer-switch'){
        await act('support.contact.t1',{action:'invoke'});await observe();await idle();
      }
      if(scenario==='pause'){await click('恢复观察');await observe();await idle();}
    }
    const pending=await query();await click('打开设置');
    await click('原生窗口授权','checkbox');
    await wait(()=>adapter.current?.reason==='观察授权已撤销'&&!adapter.current.observing,'explicit authorization revocation');
    await observe();
    check('revocation-persists',adapter.current.reason==='观察授权已撤销'&&!adapter.current.observing,adapter.current);
    await response(pending);await sleep(300);await idle();
    check('inflight-revoke-drops-result',!events().some(r=>r.type==='ai-result'&&r.requestId===pending.requestId)&&!adapter.current.observing,{requestId:pending.requestId,render:getRender()});
    completed=true;
  }catch(error){results.push({id:'gate-completion',status:'FAIL',error:String(error),code:error.code,actionState:error.actionState});throw error;}
  finally{await File.writeJSON(File.join(evidence,'ai-native-results.json'),{status:completed?'PASS':'FAIL',results});}
})
