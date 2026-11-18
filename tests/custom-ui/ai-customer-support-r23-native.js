// Repository root: ./examples/ai-customer-support/scripts/run-desktop.sh --verify
// All actions target this run's independent fixture or its actual React window.
// No reducer injection, simulated receipts, private DOM execution, or sends.
(async function({panel,target,evidence,adapter,observe,idle,getRender,getBound,log}){
  const results=[];let completed=false;
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const check=(id,ok,actual)=>{const r={id,status:ok?'PASS':'FAIL',actual};results.push(r);log('check',r);assert(ok,id);};
  const wait=async(fn,label,timeout=12000)=>{
    const start=Date.now();let lastError;
    while(Date.now()-start<timeout){
      try{if(await fn())return;}catch(error){
        if(!['TIMEOUT','STALE_TARGET','TARGET_NOT_FOUND'].includes(error.code))throw error;
        // Every predicate below only observes. Transient reads cannot grant authority.
        lastError=String(error);log('waiting-read',{label,code:error.code,error:lastError});
      }
      await sleep(150);
    }
    throw Error('Timed out: '+label+(lastError?' · '+lastError:''));
  };
  // Only WebKit's explicitly unmaterialized tree may be observed again.
  // This helper never submits input or changes scope/backend.
  async function reactSnapshot(w,properties){
    const start=Date.now(),keys=['id','pid','handle','x','y','width','height'];
    const verify=current=>assert(keys.every(k=>current[k]===w[k]),'React AX window identity/geometry changed');
    for(let attempt=1;attempt<=8;attempt++){
      assert(Date.now()-start<1200,'React AX snapshot wait budget exhausted');
      const current=await assistantWindow();verify(current);
      const remaining=1200-(Date.now()-start);
      assert(remaining>0,'React AX snapshot wait budget exhausted');
      const snapshot=await Accessibility.snapshot({within:current,maxDepth:24,maxNodes:1800,properties,timeout:remaining});
      verify(await assistantWindow());
      assert(Date.now()-start<1200,'React AX snapshot wait budget exhausted');
      if(snapshot.complete===true&&snapshot.truncated===false)return snapshot;
      assert(snapshot.complete===false&&snapshot.truncated===false&&snapshot.reason==='unmaterialized',
        'React AX snapshot incomplete: '+snapshot.reason);
      log('react-ax-read-wait',{attempt,reason:snapshot.reason,stats:snapshot.stats});
      if(attempt<8)await sleep(100);
    }
    throw Error('React AX snapshot wait budget exhausted');
  }
  const tree=async w=>Accessibility.snapshot({within:w,maxDepth:24,maxNodes:1800,properties:['role','name','identifier','value','actions','enabled','bounds']});
  const chat=async()=>{
    const w=await window.getAppWindow(target);
    if(!w||w.handle!==getBound()?.handle){
      const front=await window.getActiveWindow();
      log('test-focus-mismatch',{authorizedPid:target.pid,foreground:front?{pid:front.pid,exePath:front.exePath}:null});
      throw Error('Fixture identity/focus changed');
    }
    return w;
  };
  async function parsed(){return OpenDeskSupportNative.parse(await tree(await chat()));}
  async function act(identifier,action){
    const w=await chat(),ref=await Accessibility.find({identifier},{within:w,maxDepth:24,maxNodes:1800});
    assert(ref,'Missing fixture target '+identifier);
    try{log('test-action',{identifier,action,receipt:await Accessibility.perform(ref,action)});}
    catch(error){log('test-action-unknown',{identifier,error:String(error),code:error.code,actionState:error.actionState});}
    finally{await Accessibility.release(ref);}
    // Never repeat an uncertain action. Its independent postcondition decides.
  }
  async function message(text){
    const before=await parsed();
    await act('support.customer-input',{action:'setValue',value:text});
    const s=await tree(await chat());
    assert(OpenDeskSupportNative.nodes(s).find(n=>n.identifier==='support.customer-input')?.value===text,'Customer input readback mismatch');
    await act('support.add-message',{action:'invoke'});
    await wait(async()=>{const p=await parsed();return p.messages.length===before.messages.length+1&&p.messages.at(-1)?.text===text;},'new native message');
    await observe();await idle();
    await wait(()=>getRender()?.latestText===text,'React actual commit');
    return adapter.current.binding;
  }
  async function assistantWindow(){const s=await panel.getState();return window.current({id:'darwin:'+s.hostPid+':native:'+s.nativeWindowId,pid:s.hostPid,handle:s.nativeWindowId,title:s.title||'OpenDesk · AI 客服助手 R2.3',...s.bounds});}
  async function shot(name){const w=await chat(),s=await panel.getState();const x=Math.min(w.x,s.bounds.x),y=Math.min(w.y,s.bounds.y);
    await page.screenshot({clip:{x,y,width:Math.max(w.x+w.width,s.bounds.x+s.bounds.width)-x,height:Math.max(w.y+w.height,s.bounds.y+s.bounds.height)-y},path:File.join(evidence,name+'.png'),returnType:'path'});}
  async function clickReact(name,role='button',action={action:'invoke'},reacquiredScope=null){
    await idle();
    await wait(async()=>(await panel.getState()).visible,'assistant visible before human control');
    const w=await assistantWindow(),snap=await reactSnapshot(w,['role','name','identifier','actions','enabled','checked','bounds']);
    await File.writeJSON(File.join(evidence,'react-ax.json'),snap);
    const candidates=OpenDeskSupportNative.nodes(snap).filter(n=>n.role===role&&(typeof name==='string'?n.name===name:name.test(n.name||'')));
    assert(candidates.length===1,'React target missing/ambiguous: '+name);
    const node=candidates[0],b=node.bounds,now=await assistantWindow();
    assert(!reacquiredScope||(w.pid===reacquiredScope.pid&&w.handle===reacquiredScope.handle),'Assistant identity changed during reacquire');
    assert(node.enabled!==false&&b?.coordinateSpace==='screen','React control lacks calibrated screen bounds');
    assert(['pid','handle','x','y','width','height'].every(k=>w[k]===now[k]),'Assistant moved during preflight');
    if(action.action==='setChecked'){
      assert(typeof node.checked==='boolean','Checkbox state unavailable');
      if(node.checked===action.checked){
        log('human-control-already-satisfied',{name:node.name,role,checked:node.checked});return;
      }
    }
    log('human-control-preflight',{name:node.name,role,pid:now.pid,windowId:now.handle,bounds:b});
    const inside=b.width>0&&b.height>0&&b.x>now.x&&b.y>now.y&&
      b.x+b.width<now.x+now.width&&b.y+b.height<now.y+now.height;
    if(inside){
      // Titlebar AX refs have unreliable AXWindow mapping after restore.
      // Keep the proven PID-scoped press, with a fresh exact-bounds preflight.
      const fresh=await reactSnapshot(now,['role','name','enabled','checked','bounds']);
      const matches=OpenDeskSupportNative.nodes(fresh).filter(n=>n.role===role&&n.name===node.name);
      assert(matches.length===1&&matches[0].enabled!==false,'React target changed before PID press');
      const actual=matches[0],bounds=actual.bounds,final=await assistantWindow();
      assert(['pid','handle','x','y','width','height'].every(k=>w[k]===final[k]),'Assistant moved before PID press');
      assert(bounds?.coordinateSpace==='screen'&&['x','y','width','height'].every(k=>b[k]===bounds[k]),'React control bounds changed before PID press');
      if(action.action==='setChecked'){
        assert(typeof actual.checked==='boolean','Fresh checkbox state unavailable');
        if(actual.checked===action.checked)return;
      }
      await mouse.clickForPID(final.pid,bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      log('human-control-action',{name:node.name,role,backend:'mouse.clickForPID'});
      await sleep(150);await idle();
      if(action.action==='setChecked')await wait(async()=>{
        const current=await assistantWindow();
        assert(current.pid===w.pid&&current.handle===w.handle,'Assistant identity changed during readback');
        const observed=OpenDeskSupportNative.nodes(await reactSnapshot(current,['role','name','checked'])).filter(n=>n.role===role&&n.name===node.name);
        return observed.length===1&&observed[0].checked===action.checked;
      },'React checkbox independent readback: '+node.name);
      return;
    }
    // This host's WebKit refs reject AXWindow calibration after restore. Scroll
    // the exact panel, independently observe movement, then locate again.
    assert(node.actions?.includes(action.action),'React control does not advertise '+action.action);
    const scrolls=reacquiredScope?.scrolls||0;
    assert(scrolls<8,'React control scroll budget exhausted');
    assert(b.x>now.x&&b.x+b.width<now.x+now.width,'React control outside horizontal scope');
    const final=await assistantWindow();
    assert(['pid','handle','x','y','width','height'].every(k=>w[k]===final[k]),'Assistant moved before scroll');
    // The right gutter belongs to PanelScroll; the center may be a native
    // select whose wheel handler consumes scrolling at its own limit.
    await mouse.move(final.x+final.width-6,final.y+final.height/2);
    const direction=b.y<final.y?-1:1;
    await mouse.wheel({deltaY:direction*Math.min(400,Math.max(100,Math.abs(b.y-(final.y+final.height/2))))});
    log('human-control-scroll',{name:node.name,scrolls:scrolls+1,direction});
    await wait(async()=>{
      const current=await assistantWindow();
      assert(current.pid===w.pid&&current.handle===w.handle,'Assistant identity changed during scroll');
      const observed=OpenDeskSupportNative.nodes(await reactSnapshot(current,['role','name','bounds'])).filter(n=>n.role===role&&n.name===node.name);
      assert(observed.length===1,'React target changed during scroll');
      return observed[0].bounds?.coordinateSpace==='screen'&&direction*(observed[0].bounds.y-b.y)<-1;
    },'independent scroll movement: '+node.name);
    return clickReact(name,role,action,{pid:w.pid,handle:w.handle,scrolls:scrolls+1});
  }
  try{
    // The foreground-only observer cannot bind until this run's fixture is
    // active. Resolve and verify only the launcher-owned PID before activation.
    const initial=await window.get({pid:target.pid,title:'OpenDesk R2.3 Test Chat'});
    assert(initial.pid===target.pid&&initial.exePath===target.exePath,'Unexpected startup fixture identity');
    await window.activate(initial);
    await wait(()=>getRender()&&getBound(),'native React handshake');
    await window.activate(await window.current(getBound()));
    await wait(async()=>!!(await window.getAppWindow(target)),'fixture foreground after host startup');
    await observe();
    await wait(()=>adapter.current?.observing,'startup observation');
    check('trusted-react-mounted',getRender().binding.pid===target.pid,getRender());
    check('initial-native-empty',(await parsed()).messages.length===0,await parsed());
    const text='退款申请提交后如何查询进度？';
    const first=await message(text);
    check('native-message-to-react',getRender().latestText===text&&getRender().binding.messageId===first.messageId,getRender());
    await shot('01-message-react');
    const revision=adapter.current.revision;
    await observe();await observe();
    check('message-deduplicated',adapter.current.revision===revision,adapter.current);
    const second=await message(text);
    check('same-text-new-message',second.messageId!==first.messageId,adapter.current);
    // Native mode has one safe candidate. Selecting the current candidate
    // is idempotent; do not expect a second demonstration strategy.
    await clickReact(/^人工核实：/,'checkbox',{action:'setChecked',checked:true});
    const selected=getRender().replyText;
    check('human-selected-recommendation',selected==='您好，我先核对相关资料，确认后再回复您。',getRender());
    assert(selected&&selected!==text,'No generated recommendation');
    await clickReact('→ 填入聊天草稿');
    await wait(()=>/verified/.test(getRender()?.receipt||''),'native draft receipt');
    const external=await parsed();
    check('human-fill-native-readback',external.draft===selected&&getRender().draft===external.draft,{external,render:getRender()});
    await shot('02-draft-verified');
    for(const [id,bounds] of [['moved',{x:150,y:150,width:620,height:712}],['resized',{x:150,y:150,width:550,height:620}]]){
      await chat();await window.setWindowBounds('OpenDesk R2.3 Test Chat',bounds.x,bounds.y,bounds.width,bounds.height);
      await wait(async()=>{const w=await chat(),s=await panel.getState();return Math.abs(w.x-bounds.x)<2&&s.bounds.width===380&&Math.abs(s.bounds.y-w.y)<2&&Math.abs(s.bounds.x-(w.x+w.width+8))<2;},'window '+id);
      const actual=await assistantWindow();check('follow-'+id,actual.width===380,{target:await chat(),assistant:actual});
    }
    await shot('03-follow-resized');
    // Switch the actual independent app; no UI-local simulated SET_THREAD.
    const oldEditor=await Accessibility.find({identifier:'support.draft.t1'},{within:await chat()});
    assert(oldEditor,'Original customer editor missing before switch');
    const oldEditorValue=await Accessibility.read(oldEditor,{properties:['identifier','value']});
    assert(oldEditorValue.properties.identifier==='support.draft.t1'&&oldEditorValue.properties.value===selected,'Original editor identity/value not verified');
    await act('support.contact.t2',{action:'invoke'});
    await wait(async()=>(await parsed()).customerId==='t2','contact switch');
    let detachedRejected=false,detachedError;
    try{await Accessibility.perform(oldEditor,{action:'setValue',value:'MUST NOT REACH ANOTHER CUSTOMER'});}catch(error){
      detachedError={code:error.code,actionState:error.actionState,message:String(error)};
      detachedRejected=error.code==='STALE_TARGET'&&error.actionState==='not_started';
    }
    finally{await Accessibility.release(oldEditor);}
    check('detached-customer-editor-rejected',detachedRejected&&(await parsed()).draft==='',{error:detachedError,conversation:await parsed()});
    await observe();await wait(()=>getRender()?.binding.customerId==='t2','React contact');
    check('session-change-clears-old-message',getRender().latestText===''&&getRender().draft==='',getRender());
    const oldRequest={type:'support.fillDraft',requestId:'stale-check',binding:second,text:selected,expectedDraft:''};
    let refused=false;try{adapter.validateFill(oldRequest);}catch{refused=true;}
    check('stale-session-refused',refused&&!(await parsed()).draft,await parsed());
    await message('物流怎么查询？');
    const manual='人工草稿：请保留，不得覆盖';
    await act('support.draft.t2',{action:'setValue',value:manual});await observe();
    await wait(()=>getRender()?.draft===manual,'manual draft observed');
    await clickReact('→ 填入聊天草稿');
    await wait(()=>/refused/.test(getRender()?.receipt||''),'occupied draft refusal');
    check('manual-draft-preserved',(await parsed()).draft===manual,getRender());
    const sentinel=await ui.createWindow({id:'r23ScopeSentinel',title:'R23 Scope Sentinel',position:{mode:'absolute',bounds:{x:80,y:80,width:300,height:200}},content:{html:'<p>Owned focus safety test</p>'}});
    try{
      await sentinel.show();await wait(()=>adapter.current?.observing===false,'focus invalidation');
      check('foreign-focus-stops-observation',await window.getAppWindow(target)===null&&!(await panel.getState()).visible,adapter.current);
    }finally{await sentinel.close();}
    await window.activate(getBound());await observe();
    await window.minimizeByPID(target.pid);
    await wait(()=>adapter.current?.observing===false,'minimized invalidation');
    check('minimize-hides-assistant',!(await panel.getState()).visible,await panel.getState());
    const reopened=await App.launch({path:File.join(File.cwd(),'.runtime/apps/OpenDeskSupportChat.app')},{activate:true,waitUntilReady:'window'});
    assert(reopened.pids.length===1&&reopened.pids[0]===target.pid,'Reopen changed the authorized process');
    await wait(async()=>{const w=await window.getAppWindow(target);return w&&w.handle===getBound().handle&&w.isForeground;},'reopen original native window');
    await observe();
    await wait(()=>getRender()?.binding.customerId==='t2'&&adapter.current?.observing,'restored');
    check('restore-same-identity',adapter.current.binding.windowId===first.windowId,adapter.current);
    await act('support.contact.t1',{action:'invoke'});await observe();
    await wait(()=>getRender()?.binding.customerId==='t1','return original');
    check('original-customer-draft-isolated',(await parsed()).draft===selected,await parsed());
    await shot('04-isolated-return');
    await clickReact('暂停观察');await wait(()=>adapter.current?.observing===false,'human pause');
    check('pause-invalidates-write-authority',!adapter.matches(adapter.current.binding),adapter.current);
    await clickReact('恢复观察');await wait(()=>adapter.current?.observing===true,'human resume');
    await clickReact('打开设置');
    await clickReact('原生窗口授权','checkbox',{action:'setChecked',checked:false});
    await wait(()=>adapter.current?.reason==='观察授权已撤销','revoke authority');
    check('revocation-cannot-be-restored-by-observation',!adapter.current.observing,adapter.current);
    await observe();check('revocation-remains-stopped',!adapter.current.observing,adapter.current);
    await act('support.close-window',{action:'invoke'});
    await wait(async()=>adapter.current?.observing===false&&!(await panel.getState()).visible,'closed invalidation');
    check('closed-window-stops-assistant',!(await panel.getState()).visible,adapter.current);
    let stale=false;try{await window.current(getBound());}catch{stale=true;}
    check('invalid-window-rejected',stale,{original:getBound()});
    const oracle=await File.readJSON(File.join(evidence,'fixture-oracle.json'));
    check('no-send-actions',oracle.sendActions===0,{sendActions:oracle.sendActions});
    completed=true;
  }catch(error){
    results.push({id:'gate-completion',status:'FAIL',error:String(error),code:error.code,actionState:error.actionState});
    throw error;
  }finally{
    await File.writeJSON(File.join(evidence,'native-results.json'),{status:completed?'PASS':'FAIL',results});
  }
})
