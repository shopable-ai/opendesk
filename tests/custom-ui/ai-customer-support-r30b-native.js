// Repository root: configured run-desktop.sh --verify-ai. Requires an isolated
// real Query API whose approved test question selects a generated answer.
// This gate operates actual controls; it never supplies AI results or receipts.
(async function({panel,target,evidence,adapter,observe,idle,getRender,getBound,log}){
  const results=[];let completed=false;
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const check=(id,ok,actual)=>{const r={id,status:ok?'PASS':'FAIL',actual};results.push(r);log('check',r);assert(ok,id);};
  const wait=async(fn,label,timeout=35000)=>{
    const start=Date.now();
    while(Date.now()-start<timeout){if(await fn())return;await sleep(150);}
    throw Error('Timed out: '+label);
  };
  const events=()=>File.read(File.join(evidence,'events.jsonl')).trim().split('\n').map(s=>JSON.parse(s));
  const requests=()=>events().filter(r=>r.type==='ai-request');
  // Only WebKit's explicitly unmaterialized tree may be observed again.
  // This helper never submits input or changes scope/backend.
  async function reactSnapshot(w,properties){
    const start=Date.now(),keys=['id','pid','handle','x','y','width','height'];
    const verify=current=>assert(keys.every(k=>current[k]===w[k]),'React AX window identity/geometry changed');
    for(let attempt=1;attempt<=8;attempt++){
      assert(Date.now()-start<1200,'React AX snapshot wait budget exhausted');
      const current=await assistant();verify(current);
      const remaining=1200-(Date.now()-start);
      assert(remaining>0,'React AX snapshot wait budget exhausted');
      const snapshot=await Accessibility.snapshot({within:current,maxDepth:24,maxNodes:1800,properties,timeout:remaining});
      verify(await assistant());
      assert(Date.now()-start<1200,'React AX snapshot wait budget exhausted');
      if(snapshot.complete===true&&snapshot.truncated===false)return snapshot;
      assert(snapshot.complete===false&&snapshot.truncated===false&&snapshot.reason==='unmaterialized',
        'React AX snapshot incomplete: '+snapshot.reason);
      log('react-ax-read-wait',{attempt,reason:snapshot.reason,stats:snapshot.stats});
      if(attempt<8)await sleep(100);
    }
    throw Error('React AX snapshot wait budget exhausted');
  }
  const tree=async(w,values=false)=>!values?reactSnapshot(w,['role','name','identifier','focused','checked','enabled','actions','bounds']):Accessibility.snapshot({within:w,maxDepth:24,maxNodes:1800,
    properties:['role','name','identifier','focused','checked','enabled','actions','bounds',...(values?['value']:[])]});
  const chat=async()=>{const w=await window.getAppWindow(target);
    if(!w||w.handle!==getBound()?.handle){
      const front=await window.getActiveWindow();
      log('test-focus-mismatch',{authorizedPid:target.pid,foreground:front?{pid:front.pid,exePath:front.exePath}:null});
      throw Error('Owned chat identity/focus changed');
    }
    return w;};
  const parsed=async()=>OpenDeskSupportNative.parse(await tree(await chat(),true));
  async function act(identifier,action){
    const ref=await Accessibility.find({identifier},{within:await chat(),maxDepth:24,maxNodes:1800});
    assert(ref,'Missing fixture '+identifier);
    try{const result=await Accessibility.perform(ref,action);
      assert(['acknowledged','not_needed'].includes(result.actionState),'Fixture action unknown; no retry');
    }finally{await Accessibility.release(ref);}
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
  async function pressReact(name,role='button',action={action:'invoke'},reacquiredScope=null){
    // WebKit reports unclipped descendant bounds. Derive the reply viewport
    // from its actual AX container and fixed footer, never window bounds alone.
    const viewport=(snapshot,target,win)=>{
      // Runtime native node wrappers need not retain JS object identity.
      // The target's role/name was already proven unique in this fresh tree.
      const contains=(parent,child)=>(parent.role===child.role&&parent.name===child.name)||
        (parent.children||[]).some(n=>contains(n,child));
      const panels=OpenDeskSupportNative.nodes(snapshot).filter(n=>n.role==='group'&&n.name==='推荐回复'&&contains(n,target));
      if(!panels.length)return {top:win.y,bottom:win.y+win.height};
      assert(panels.length===1,'Reply viewport ambiguous');
      const p=panels[0],footers=(p.children||[]).filter(n=>(n.children||[]).some(c=>c.role==='button'&&c.name==='→ 填入聊天草稿'));
      assert(footers.length===1,'Reply fixed footer unavailable');
      const footer=footers[0];
      assert(p.bounds?.coordinateSpace==='screen'&&footer.bounds?.coordinateSpace==='screen'&&
        Number.isFinite(p.bounds.y)&&Number.isFinite(footer.bounds.y)&&footer.bounds.y>p.bounds.y,
        'Reply viewport lacks calibrated bounds');
      return contains(footer,target)?{top:win.y,bottom:win.y+win.height}:{top:p.bounds.y,bottom:footer.bounds.y};
    };
    await idle();
    await wait(async()=>(await panel.getState()).visible,'assistant visible before human control');
    const w=await assistant(),snap=await reactSnapshot(w,['role','name','identifier','actions','enabled','checked','bounds']);
    await File.writeJSON(File.join(evidence,'react-ax.json'),snap);
    const candidates=OpenDeskSupportNative.nodes(snap).filter(n=>n.role===role&&(typeof name==='string'?n.name===name:name.test(n.name||'')));
    assert(candidates.length===1,'React target missing/ambiguous: '+name);
    const node=candidates[0],b=node.bounds,now=await assistant();
    assert(!reacquiredScope||(w.pid===reacquiredScope.pid&&w.handle===reacquiredScope.handle),'Assistant identity changed during reacquire');
    assert(node.enabled!==false&&b?.coordinateSpace==='screen'&&
      ['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.width>0&&b.height>0,
      'React control lacks calibrated screen bounds');
    assert(['pid','handle','x','y','width','height'].every(k=>w[k]===now[k]),'Assistant moved during preflight');
    if(action.action==='setChecked'){
      assert(typeof node.checked==='boolean','Checkbox state unavailable');
      if(node.checked===action.checked){
        log('human-control-already-satisfied',{name:node.name,role,checked:node.checked});return;
      }
    }
    assert(node.actions?.includes(action.action),'React control does not advertise '+action.action);
    log('human-control-preflight',{name:node.name,role,pid:now.pid,windowId:now.handle,bounds:b});
    const clip=viewport(snap,node,now);
    const inside=b.width>0&&b.height>0&&b.x>now.x&&b.y>clip.top&&
      b.x+b.width<now.x+now.width&&b.y+b.height<clip.bottom;
    if(inside){
      // Titlebar AX refs have unreliable AXWindow mapping after restore.
      // Reuse r23's PID-scoped press, with a fresh exact-bounds preflight.
      const fresh=await reactSnapshot(now,['role','name','enabled','checked','actions','bounds']);
      const matches=OpenDeskSupportNative.nodes(fresh).filter(n=>n.role===role&&n.name===node.name);
      assert(matches.length===1&&matches[0].enabled!==false,'React target changed before PID press');
      const actual=matches[0],bounds=actual.bounds,final=await assistant();
      assert(['pid','handle','x','y','width','height'].every(k=>w[k]===final[k]),'Assistant moved before PID press');
      assert(bounds?.coordinateSpace==='screen'&&['x','y','width','height'].every(k=>b[k]===bounds[k]),'React control bounds changed before PID press');
      const freshClip=viewport(fresh,actual,final);
      assert(freshClip.top===clip.top&&freshClip.bottom===clip.bottom&&
        bounds.y>freshClip.top&&bounds.y+bounds.height<freshClip.bottom,'React viewport changed before PID press');
      if(action.action==='setChecked'){
        assert(typeof actual.checked==='boolean','Fresh checkbox state unavailable');
        if(actual.checked===action.checked)return;
      }
      assert(actual.actions?.includes(action.action),'Fresh control action unavailable');
      await mouse.clickForPID(final.pid,bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      log('human-control-action',{name:node.name,role,backend:'mouse.clickForPID'});
      await sleep(150);await idle();
      if(action.action==='setChecked')await wait(async()=>{
        const current=await assistant();
        assert(current.pid===w.pid&&current.handle===w.handle,'Assistant identity changed during readback');
        const observed=OpenDeskSupportNative.nodes(await reactSnapshot(current,['role','name','checked'])).filter(n=>n.role===role&&n.name===node.name);
        return observed.length===1&&observed[0].checked===action.checked;
      },'React checkbox independent readback: '+node.name);
      return;
    }
    // This host's WebKit refs reject AXWindow calibration after restore. Scroll
    // the exact panel, independently observe movement, then locate again.
    const scrolls=reacquiredScope?.scrolls||0;
    assert(scrolls<8,'React control scroll budget exhausted');
    assert(b.x>now.x&&b.x+b.width<now.x+now.width,'React control outside horizontal scope');
    const final=await assistant();
    assert(['pid','handle','x','y','width','height'].every(k=>w[k]===final[k]),'Assistant moved before scroll');
    // The right gutter belongs to PanelScroll; the center may be a native
    // select whose wheel handler consumes scrolling at its own limit.
    assert(final.width>12&&final.height>0,'Panel gutter outside window');
    await mouse.move(final.x+final.width-6,(clip.top+clip.bottom)/2);
    const atWheel=await assistant();
    assert(['pid','handle','x','y','width','height'].every(k=>final[k]===atWheel[k]),'Assistant moved before wheel');
    const direction=b.y<clip.top?-1:1;
    await mouse.wheel({deltaY:direction*Math.min(400,Math.max(100,Math.abs(b.y-(clip.top+clip.bottom)/2)))});
    log('human-control-scroll',{name:node.name,scrolls:scrolls+1,direction});
    await wait(async()=>{
      const current=await assistant();
      assert(current.pid===w.pid&&current.handle===w.handle,'Assistant identity changed during scroll');
      const observed=OpenDeskSupportNative.nodes(await reactSnapshot(current,['role','name','bounds'])).filter(n=>n.role===role&&n.name===node.name);
      assert(observed.length===1,'React target changed during scroll');
      return observed[0].bounds?.coordinateSpace==='screen'&&direction*(observed[0].bounds.y-b.y)<-1;
    },'independent scroll movement: '+node.name);
    return pressReact(name,role,action,{pid:w.pid,handle:w.handle,scrolls:scrolls+1});
  }
  async function click(name,role='button',checked=true){
    return pressReact(name,role,role==='checkbox'?{action:'setChecked',checked}:{action:'invoke'});
  }
  async function chooseVersion(name){return click(name,'checkbox',true);}
  async function sectionText(name){
    const w=await assistant(),snap=await tree(w),now=await assistant();
    assert(['pid','handle','x','y','width','height'].every(k=>w[k]===now[k]),'Source review window changed');
    const sections=OpenDeskSupportNative.nodes(snap).filter(n=>n.name===name);
    assert(sections.length===1,'Missing/ambiguous source section '+name);
    // Whole React trees must not request value: unrelated WebKit controls can
    // reject value conversion. Read only this unique source subtree instead.
    for(let attempt=1;attempt<=2;attempt++){
      const current=await assistant();
      assert(['pid','handle','x','y','width','height'].every(k=>w[k]===current[k]),'Source review window changed');
      const ref=await Accessibility.find({name},{within:current,maxDepth:24,maxNodes:1800});
      assert(ref,'Missing source section '+name);
      try{
        const fresh=await tree(await assistant());
        assert(OpenDeskSupportNative.nodes(fresh).filter(n=>n.name===name).length===1,'Source section changed');
        const before=await assistant();
        assert(['pid','handle','x','y','width','height'].every(k=>w[k]===before[k]),'Source review window changed');
        const section=await tree(ref,true),final=await assistant();
        assert(['pid','handle','x','y','width','height'].every(k=>w[k]===final[k]),'Source review window changed');
        OpenDeskSupportNative.nodes(section);return section;
      }catch(error){
        // Read-only reacquisition required by the public calibration contract.
        // No action is replayed, and replaced/moved windows still fail above.
        if(attempt!==1||error.code!=='STALE_TARGET'||
          (error.actionState!==undefined&&error.actionState!=='not_started'))throw error;
        log('source-read-reacquire',{name,attempt,code:error.code});
      }finally{await Accessibility.release(ref);}
    }
  }
  async function editReply(generated,intended){
    const editor=await control('编辑知识建议','textField');
    // Content refs use the exact window. Application-wide search also sees
    // lazy menus, so it cannot prove completeness without opening those menus.
    const ref=await Accessibility.find({name:'编辑知识建议',role:'textField'},
      {within:editor.w,maxDepth:24,maxNodes:1800});
    assert(ref,'Unique native reply editor unavailable');
    try{
      const before=await Accessibility.read(ref,{properties:['role','name','value','focused']});
      const fresh=await control('编辑知识建议','textField');
      assert(before.properties.role==='textField'&&before.properties.name==='编辑知识建议'&&
        before.properties.value===generated&&before.properties.focused===true,'Native editor focus/value not verified');
      assert(fresh.node.focused===true,'Panel editor focus not verified');
      const ready=await Accessibility.read(ref,{properties:['value','focused']});
      assert(ready.properties.focused===true&&ready.properties.value===generated,'Fresh native editor focus/value not verified');
      const scope=await assistant();
      assert(['pid','handle','x','y','width','height'].every(k=>editor.w[k]===fresh.w[k]&&editor.w[k]===scope[k])&&
        ['x','y','width','height'].every(k=>editor.b[k]===fresh.b[k]),'Editor host/window/bounds changed');
      const action=await Accessibility.perform(ref,{action:'setValue',value:intended});
      assert(['acknowledged','not_needed'].includes(action.actionState),'Editor action unknown; no retry');
      const after=await Accessibility.read(ref,{properties:['value']});
      const current=await control('编辑知识建议','textField');
      assert(current.w.pid===editor.w.pid&&current.w.handle===editor.w.handle,
        'Panel editor identity changed during readback');
      await File.writeJSON(File.join(evidence,'ai-editor-readback.json'),{before,ready,action,after,render:getRender()});
      assert(after.properties.value===intended,'Native edit value readback differs');
    }finally{await Accessibility.release(ref);}
    // PID AXPress preserves the native completion action without mouse blur.
    await click('完成编辑');await idle();
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
    await click('审核依据 '+request.requestId);
    const reviewTree=await tree(await assistant());
    await File.writeJSON(File.join(evidence,'source-review-expanded-ax.json'),reviewTree);
    await shot('01a-source-review-expanded');
    const reviewNodes=OpenDeskSupportNative.nodes(await sectionText('审核元数据 '+request.requestId));
    const contains=(nodes,text)=>nodes.some(n=>(n.name||'').includes(text)||(typeof n.value==='string'&&n.value.includes(text)));
    check('source-review-request-project',contains(reviewNodes,request.requestId)&&contains(reviewNodes,'版本、生效期及适用条件'),{requestId:request.requestId});
    const sourceControls=OpenDeskSupportNative.nodes(reviewTree).filter(n=>n.role==='button'&&n.name?.startsWith('展开来源 '));
    assert(sourceControls.length===1,'Expected one actual source control');
    await click(sourceControls[0].name);
    const originalTree=await sectionText('来源原文 '+sourceControls[0].name.split(' ')[1]+' '+request.requestId);
    await File.writeJSON(File.join(evidence,'source-review-ax.json'),originalTree);
    check('source-original-ax-readable',contains(OpenDeskSupportNative.nodes(originalTree),'可以选的类型还挺全的'),{requestId:request.requestId});
    await shot('01b-source-original-review');
    await click('审核依据 '+request.requestId);

    await click(/^知识建议：/,'checkbox');
    check('human-selected-ai',getRender().replyText===generated,getRender());
    await click('编辑选中回复');
    const intended=generated+' 已人工核对。';
    await editReply(generated,intended);
    await wait(()=>getRender()?.replyText===intended,'React committed actual native edit');
    const edited=getRender().replyText;
    check('human-edit-react-committed',edited===intended,getRender());
    const refresh=await query();
    check('requery-keeps-human-while-waiting',getRender().replyText===intended,getRender());
    await response(refresh);
    await wait(()=>events().some(r=>r.type==='ai-result'&&r.requestId===refresh.requestId),'new version delivered');
    await idle();
    check('requery-new-version-does-not-overwrite',getRender().replyText===intended,{requestId:refresh.requestId,render:getRender()});
    await File.writeJSON(File.join(evidence,'requery-versions-ax.json'),await tree(await assistant()));
    await shot('01c-human-edit-and-pending-version');
    await chooseVersion(/^知识建议 · 版本 2：/);
    check('explicit-new-version-adopted',getRender().replyText!==intended,getRender());
    await chooseVersion(/^知识建议 · 版本 1：/);
    check('explicit-old-human-version-restored',getRender().replyText===intended,getRender());

    await click('→ 填入聊天草稿');
    await wait(()=>getRender()?.receipt?.includes('verified'),'native independent draft receipt');
    const readback=await parsed();
    check('ai-edited-native-draft-readback',readback.draft===edited&&getRender().draft===edited,{requestId:request.requestId,render:getRender(),readback});
    await shot('02-ai-edited-draft-verified');
    const oracle=await File.readJSON(File.join(evidence,'fixture-oracle.json'));
    check('no-send',oracle.sendActions===0,{sendActions:oracle.sendActions});
    await click('暂停观察');
    await wait(()=>!adapter.current.observing,'human draft paused');
    check('pause-retains-human-draft',getRender().replyText===edited&&(await parsed()).draft===edited,getRender());
    await click('恢复观察');await observe();await idle();
    check('resume-retains-human-draft',getRender().replyText===edited&&adapter.current.observing&&(await parsed()).draft===edited,getRender());
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
      const beforeInvalidation=getRender().replyText;
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
      check('inflight-'+scenario+'-drops-result',!stalePublished&&(scenario==='pause'?getRender().replyText===beforeInvalidation:getRender().replyText===safe),{requestId:pending.requestId,render:getRender()});
      if(scenario==='customer-switch'){
        await act('support.contact.t1',{action:'invoke'});await observe();await idle();
      }
      if(scenario==='pause'){await click('恢复观察');await observe();await idle();}
    }
    const pending=await query();await click('打开设置');
    await click('原生窗口授权','checkbox',false);
    await wait(()=>adapter.current?.reason==='观察授权已撤销'&&!adapter.current.observing,'explicit authorization revocation');
    await observe();
    check('revocation-persists',adapter.current.reason==='观察授权已撤销'&&!adapter.current.observing,adapter.current);
    await response(pending);await sleep(300);await idle();
    check('inflight-revoke-drops-result',!events().some(r=>r.type==='ai-result'&&r.requestId===pending.requestId)&&!adapter.current.observing,{requestId:pending.requestId,render:getRender()});
    completed=true;
  }catch(error){results.push({id:'gate-completion',status:'FAIL',error:String(error),code:error.code,actionState:error.actionState});throw error;}
  finally{await File.writeJSON(File.join(evidence,'ai-native-results.json'),{status:completed?'PASS':'FAIL',results});}
})
