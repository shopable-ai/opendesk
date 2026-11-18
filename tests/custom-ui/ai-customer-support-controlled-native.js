// From the repository root, after the leader's unified build:
// ./examples/ai-customer-support/scripts/run-desktop.sh --verify-controlled
// Repeat in a FRESH launcher run for the other irreversible unknown result:
// OPENDESK_SUPPORT_CONTROLLED_UNKNOWN_MODE=unknown-not-delivered ./examples/ai-customer-support/scripts/run-desktop.sh --verify-controlled
// Real React AX controls + launcher-owned native fixture only; no bridge injection,
// controller/reducer calls, DOM execution, network sends, or oracle writes.
// Requires a fresh fixture (t1, empty history, normal send mode) and getAutomation().
(async function({panel,target,evidence,adapter,observe,idle,getRender,getBound,getAutomation,log}){
  const results=[],deferred=[];
  let unknownMode='unknown-delivered';
  const prefix='本地测试自动回复：',question='请问能开发票吗？';
  const invoice='【OpenDesk 本地测试】演示规则：符合开票条件的订单可以申请电子发票。请提供订单号，以便核实开票信息与具体流程。';
  let completed=false,serial=0,assistantIdentity=null;
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const copy=value=>JSON.parse(JSON.stringify(value));
  // Swift's sorted-key oracle and AX objects need not have the same key order.
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const record=(id,actual)=>{const row={id,status:'PASS',actual};results.push(row);log('controlled-native-check',row);};
  const wait=async(predicate,label,timeout=15000)=>{
    const start=Date.now();
    while(Date.now()-start<timeout){
      try{if(await predicate())return;}
      catch(error){
        if(!['TIMEOUT','STALE_TARGET','TARGET_NOT_FOUND'].includes(error.code))throw error;
        log('controlled-native-read-wait',{label,code:error.code});
      }
      await sleep(100);
    }
    throw Error('Timed out: '+label);
  };
  // WebKit exposes non-scalar AXValue on some containers. React controls need
  // identity/state/bounds only; native message and draft truth still reads value.
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
  const tree=(w,values=false)=>!values?reactSnapshot(w,['role','name','identifier','actions','enabled','checked','bounds']):Accessibility.snapshot({within:w,maxDepth:24,maxNodes:1800,
    properties:['role','name','identifier','actions','enabled','checked','bounds',...(values?['value']:[])]});
  const nodes=snapshot=>OpenDeskSupportNative.nodes(snapshot);
  async function chat(){
    const w=await window.getAppWindow(target),bound=getBound();
    if(!w||!bound||w.pid!==target.pid||w.exePath!==target.exePath||w.handle!==bound.handle){
      const front=await window.getActiveWindow();
      log('controlled-native-focus-mismatch',{authorizedPid:target.pid,
        foreground:front?{pid:front.pid,exePath:front.exePath,handle:front.handle}:null});
    }
    assert(w&&bound&&w.pid===target.pid&&w.exePath===target.exePath&&w.handle===bound.handle,
      'Launcher-owned fixture identity/focus changed');
    return w;
  }
  async function assistant(){
    const s=await panel.getState();assert(s.visible,'React panel is hidden');
    if(!assistantIdentity)assistantIdentity={pid:s.hostPid,handle:s.nativeWindowId};
    assert(s.hostPid===assistantIdentity.pid&&s.nativeWindowId===assistantIdentity.handle,'React host identity changed');
    return window.current({id:'darwin:'+s.hostPid+':native:'+s.nativeWindowId,pid:s.hostPid,
      handle:s.nativeWindowId,title:s.title||'OpenDesk · AI 客服助手 R2.3',...s.bounds});
  }
  async function parsed(){return OpenDeskSupportNative.parse(await tree(await chat(),true));}
  async function oracle(){
    const o=await File.readJSON(File.join(evidence,'fixture-oracle.json'));
    assert(o.pid===target.pid&&o.windowNumber===getBound().handle&&o.fixture==='local-only-not-wechat',
      'Independent oracle owner mismatch');
    assert(Number.isSafeInteger(o.sendActions)&&Array.isArray(o.sendResults)&&o.sendResults.length===o.sendActions,
      'Incomplete independent oracle');
    return o;
  }
  // Compare independently produced disk truth with a NEW native snapshot.
  async function sample(label){
    let actual;
    await wait(async()=>{
      const snapshot=await parsed(),o=await oracle();
      if(o.session!==snapshot.customerId||o.draft!==snapshot.draft||!same(o.messages,snapshot.messages))return false;
      actual={snapshot,oracle:o,automation:copy(getAutomation()),render:copy(getRender())};return true;
    },'oracle / fresh AX agreement: '+label);
    await File.writeJSON(File.join(evidence,'controlled-'+(++serial)+'-'+label+'.json'),actual);
    return actual;
  }
  const geometryKeys=['pid','handle','x','y','width','height'];
  const sameWindow=(a,b)=>geometryKeys.every(k=>a[k]===b[k]);
  const inside=(b,w)=>b?.coordinateSpace==='screen'&&b.width>0&&b.height>0&&
    b.x>w.x&&b.y>w.y&&b.x+b.width<w.x+w.width&&b.y+b.height<w.y+w.height;
  function oneTarget(snapshot,selector,label){
    const matches=nodes(snapshot).filter(n=>Object.keys(selector).every(k=>n[k]===selector[k]));
    assert(matches.length===1,'Missing/ambiguous native target '+label);
    assert(matches[0].enabled!==false&&matches[0].bounds?.coordinateSpace==='screen','Disabled/uncalibrated target '+label);
    return matches[0];
  }
  async function revealReact(selector,action,label){
    const anchor=await assistant();
    let snapshot=await tree(anchor),node=oneTarget(snapshot,selector,label),focus=null;
    const distance=b=>Math.max(anchor.y-b.y,0)+Math.max(b.y+b.height-anchor.y-anchor.height,0);
    for(let scrolls=0;;scrolls++){
      assert(sameWindow(anchor,await assistant()),'Assistant moved while revealing '+label);
      if(action.action==='setChecked'){
        assert(typeof node.checked==='boolean','Checkbox state unavailable '+label);
        if(node.checked===action.checked)return {window:anchor,node,snapshot,focus,satisfied:true};
      }
      if(inside(node.bounds,anchor))return {window:anchor,node,snapshot,focus,satisfied:false};
      assert(scrolls<8,'React target still offscreen after eight scrolls '+label);
      const b=node.bounds,before=distance(b);
      assert(before>0&&b.x>=anchor.x&&b.x+b.width<=anchor.x+anchor.width,
        'Target is not vertically scrollable within the exact assistant '+label);
      assert(anchor.width>32&&anchor.height>64,'Assistant has no safe central scroll point');
      const currentFocus=await window.getActiveWindow();
      if(!focus){
        assert(currentFocus&&(currentFocus.pid===anchor.pid&&currentFocus.handle===anchor.handle||
          currentFocus.pid===target.pid&&currentFocus.handle===getBound()?.handle),'Foreign focus before scroll');
        focus=currentFocus;
      }
      assert(currentFocus?.pid===focus.pid&&currentFocus?.handle===focus.handle,'Focus changed before scroll '+label);
      // Canonical wheel targets the current pointer. Move only to this exact
      // assistant's scroll gutter (not a nested native select), then recheck
      // identity/geometry/focus before input.
      await mouse.move(anchor.x+anchor.width-6,anchor.y+anchor.height/2);
      const beforeWheel=await window.getActiveWindow();
      assert(sameWindow(anchor,await assistant())&&beforeWheel?.pid===focus.pid&&beforeWheel?.handle===focus.handle,
        'Assistant/focus changed before wheel '+label);
      await mouse.wheel({deltaY:(b.y<anchor.y?-1:1)*Math.min(480,Math.max(100,before+80)),steps:3,delay:20});
      await sleep(150);await idle();
      const afterWindow=await assistant(),afterFocus=await window.getActiveWindow();
      assert(sameWindow(anchor,afterWindow)&&afterFocus?.pid===focus.pid&&afterFocus?.handle===focus.handle,
        'Assistant/focus changed after wheel '+label);
      snapshot=await tree(afterWindow);node=oneTarget(snapshot,selector,label);
      await File.writeJSON(File.join(evidence,'controlled-scroll-'+(++serial)+'.json'),
        {label,scrolls:scrolls+1,window:afterWindow,before:b,after:node.bounds,snapshot});
      assert(inside(node.bounds,anchor)||distance(node.bounds)<before-0.5,
        'Scroll did not move target toward viewport; no further input '+label);
    }
  }
  async function perform(scope,selector,action,label,reactInput=false){
    if(reactInput){
      assert(['invoke','setChecked'].includes(action.action),'Unsupported React action '+label);
      const revealed=await revealReact(selector,action,label);
      if(revealed.satisfied){log('controlled-native-already-satisfied',{label,checked:revealed.node.checked});return;}
      const w=revealed.window,fresh=await scope();
      assert(sameWindow(w,fresh),'Assistant moved before final React preflight '+label);
      const snapshot=await tree(fresh),actual=oneTarget(snapshot,selector,label),b=actual.bounds;
      assert(inside(b,fresh)&&['x','y','width','height'].every(k=>b[k]===revealed.node.bounds[k]),
        'React bounds changed before PID press '+label);
      if(action.action==='setChecked'){
        assert(typeof actual.checked==='boolean','Fresh checkbox state unavailable '+label);
        if(actual.checked===action.checked){log('controlled-native-already-satisfied',{label,checked:actual.checked});return;}
      }
      const final=await scope();assert(sameWindow(w,final),'Assistant moved before PID press '+label);
      if(revealed.focus){
        const focused=await window.getActiveWindow();
        assert(focused?.pid===revealed.focus.pid&&focused?.handle===revealed.focus.handle,'Focus changed before PID press '+label);
      }
      await File.writeJSON(File.join(evidence,'controlled-react-'+(++serial)+'.json'),{label,window:final,snapshot});
      // No Accessibility.find for React, and no retry/fallback after input.
      await mouse.clickForPID(final.pid,b.x+b.width/2,b.y+b.height/2);
      log('controlled-native-action',{label,selector,action,backend:'mouse.clickForPID'});
      await idle();return; // Caller independently verifies React/Host/oracle.
    }
    const w=await scope(),snapshot=await tree(w,true),node=oneTarget(snapshot,selector,label);
    assert(node.actions?.includes(action.action),'Unsupported fixture AX action '+label);
    assert(sameWindow(w,await scope()),'Fixture moved during preflight '+label);
    await File.writeJSON(File.join(evidence,'controlled-ax-'+(++serial)+'.json'),{label,window:w,snapshot});
    const ref=await Accessibility.find(selector,{within:w,maxDepth:24,maxNodes:1800});
    assert(ref,'Fixture AX target disappeared '+label);
    try{
      assert(sameWindow(w,await scope()),'Fixture moved before action '+label);
      const receipt=await Accessibility.perform(ref,action);
      log('controlled-native-action',{label,selector,action,receipt});
      assert(['acknowledged','not_needed'].includes(receipt.actionState),'Unknown input outcome '+label);
      if(action.action==='setValue'){
        const readback=await Accessibility.read(ref,{properties:['value']});
        assert(readback.properties.value===action.value,'Native value readback mismatch '+label);
      }
    }finally{await Accessibility.release(ref);}
  }

  const fixture=(identifier,action={action:'invoke'})=>perform(chat,{identifier},action,identifier);
  const react=async(name,role='button',action={action:'invoke'})=>{
    await idle();
    await wait(async()=>{
      const candidates=nodes(await tree(await assistant())).filter(n=>n.name===name&&n.role===role);
      assert(candidates.length<=1,'Ambiguous React control '+name);
      return candidates.length===1&&candidates[0].enabled!==false;
    },'React control ready: '+name);
    return perform(assistant,{name,role},action,name,true);
  };
  const control=action=>react(prefix+action);
  async function add(text){
    const before=await parsed();
    await fixture('support.customer-input',{action:'setValue',value:text});
    await fixture('support.add-message');
    let id;
    await wait(async()=>{
      const current=await parsed(),added=current.messages.filter(m=>!before.messages.some(old=>old.id===m.id)&&m.who==='customer');
      if(added.length!==1||added[0].text!==text)return false;id=added[0].id;return true;
    },'new immutable native customer ID');
    await observe();await idle();
    await wait(()=>getRender()?.binding.messageId===id&&getRender()?.latestText===text,'React renders new native ID');
    return id;
  }
  async function quiet(label,duration=1600,locked=false){
    const before=await sample(label+'-before'),start=Date.now();
    while(Date.now()-start<duration){
      await observe();await idle();
      const o=await oracle(),s=getAutomation();
      assert(o.sendActions===before.oracle.sendActions&&s.requests===before.automation.requests&&s.queued===0&&!s.busy,
        'Unexpected automatic work during '+label);
      if(locked)assert(s.mode==='locked'&&s.lastOutcome==='unknown','Unknown lock cleared during '+label);
      await sleep(100);
    }
    const after=await sample(label+'-after');
    assert(same(after.snapshot,before.snapshot),'Native content changed during '+label);
    if(locked)assert(after.automation.mode==='locked'&&after.automation.lastOutcome==='unknown',
      'Unknown lock cleared after '+label);
    record(label,{before,after});return after;
  }
  async function enabled(){await wait(()=>getAutomation().mode==='enabled'&&!getAutomation().busy,'independent Host enabled');}
  async function enable(){
    await react('打开设置');
    await react(prefix+'启用','checkbox',{action:'setChecked',checked:true});
    assert(getAutomation().mode!=='enabled','Enable bypassed explicit consent');
    await control('确认启用');await enabled();
    await react('← 返回');await idle();
    await wait(()=>getRender()?.tab==='reply','React returns to reply panel');
  }
  async function sentSince(before,label,expected=invoice){
    await wait(async()=>{
      const o=await oracle(),s=getAutomation();
      assert(s.mode!=='locked'&&s.lastOutcome!=='unknown',
        'Controlled send stopped safely with unknown outcome; no retry: '+label);
      assert(!(s.mode==='paused'&&s.lastOutcome==='failed'),
        'Controlled send failed and paused; no retry: '+label);
      return o.sendActions>=before.oracle.sendActions+1&&!s.busy&&s.queued===0&&s.lastOutcome==='confirmed';
    },label+' independent send confirmation');
    const after=await sample(label),newResults=after.oracle.sendResults.slice(before.oracle.sendResults.length);
    assert(after.oracle.sendActions===before.oracle.sendActions+1&&newResults.length===1,'Duplicate send '+label);
    const receipt=newResults[0],added=after.snapshot.messages.filter(m=>!before.snapshot.messages.some(old=>old.id===m.id)&&m.who==='agent');
    assert(receipt.session===after.snapshot.customerId&&receipt.status==='sent'&&receipt.mode==='success'&&receipt.delivered===true,
      'Oracle does not confirm local delivery '+label);
    assert(added.length===1&&added[0].id===receipt.messageId&&added[0].text===expected&&after.snapshot.draft==='',
      'New native own message does not correlate to oracle '+label);
    assert(after.automation.requests===before.automation.requests+1,'Unexpected controller request count '+label);
    record(label,{before,after});return after;
  }
  async function cycleMode(expected){
    await fixture('support.fixture.cycle-send-mode');
    await wait(async()=>(await oracle()).sendMode===expected,'independent fixture mode: '+expected);
    record('fixture-mode-'+expected,await sample('mode-'+expected));
  }
  async function faultSince(before,label,mode,outcome,delivered){
    const expectedMode=outcome==='unknown'?'locked':'paused';
    await wait(async()=>{
      const o=await oracle(),s=getAutomation();
      return o.sendActions>=before.oracle.sendActions+1&&!s.busy&&s.mode===expectedMode&&s.lastOutcome===outcome;
    },label+' independent terminal state');
    const after=await sample(label),receipts=after.oracle.sendResults.slice(before.oracle.sendResults.length);
    assert(after.oracle.sendActions===before.oracle.sendActions+1&&after.automation.requests===before.automation.requests+1&&
      receipts.length===1&&after.automation.queued===0,'Fault caused duplicate or queued work '+label);
    const receipt=receipts[0],added=after.snapshot.messages.filter(m=>m.who==='agent'&&
      !before.snapshot.messages.some(old=>old.id===m.id));
    assert(receipt.session===after.snapshot.customerId&&receipt.mode===mode&&receipt.status===outcome&&
      receipt.delivered===delivered,'Independent fault receipt mismatch '+label);
    if(outcome==='unknown')assert(receipt.reason==='receipt-unavailable','Unknown receipt disclosed delivery truth '+label);
    assert(after.snapshot.draft===invoice,'Fault must preserve the submitted native draft '+label);
    if(delivered)assert(added.length===1&&added[0].id===receipt.messageId&&added[0].text===invoice,
      'Unknown delivered truth must match a new native own message '+label);
    else assert(added.length===0&&receipt.messageId===null,'Failed send unexpectedly delivered '+label);
    record(label,{before,after});return after;
  }
  async function shot(name){
    const w=await chat(),s=await panel.getState(),x=Math.min(w.x,s.bounds.x),y=Math.min(w.y,s.bounds.y);
    await page.screenshot({clip:{x,y,width:Math.max(w.x+w.width,s.bounds.x+s.bounds.width)-x,
      height:Math.max(w.y+w.height,s.bounds.y+s.bounds.height)-y},
      path:File.join(evidence,'controlled-'+name+'.png'),returnType:'path'});
  }
  try{
    unknownMode=System.getEnv('OPENDESK_SUPPORT_CONTROLLED_UNKNOWN_MODE','unknown-delivered');
    assert(['unknown-delivered','unknown-not-delivered'].includes(unknownMode),'Invalid controlled unknown mode');
    deferred.push(unknownMode==='unknown-delivered'?'unknown-not-delivered-locks':'unknown-delivered-locks');
    assert(typeof getAutomation==='function','Host must provide read-only getAutomation');
    const initial=await window.get({pid:target.pid,title:'OpenDesk R2.3 Test Chat'});
    assert(initial.pid===target.pid&&initial.exePath===target.exePath,'Unexpected startup fixture');
    await window.activate(initial);
    await wait(()=>getRender()&&getBound(),'native React handshake');
    await window.activate(await window.current(getBound()));await observe();await idle();
    await wait(()=>adapter.current?.observing,'native observation authority');
    const start=await sample('initial');
    assert(start.snapshot.customerId==='t1'&&start.snapshot.messages.length===0&&start.snapshot.draft===''&&
      start.oracle.sendActions===0&&start.oracle.sendMode==='success'&&start.automation.mode==='disabled'&&
      start.automation.requests===0,
      'Gate requires a fresh local fixture and disabled controller');
    await add(question);await enable();
    await quiet('enable-does-not-send-history');await shot('enabled');

    // A single fixture event publishes eight distinct IDs, independent of AX
    // speed versus the 600ms debounce. No direct controller/adapter injection.
    const firstBefore=await sample('burst-baseline');
    await fixture('support.customer-input',{action:'setValue',value:question});
    const burstAt=Date.now();await fixture('support.add-burst');
    await observe();await idle();
    const burst=await sentSince(firstBefore,'burst-eight-coalesces-once');
    const customers=burst.snapshot.messages.filter(m=>m.who==='customer'&&
      !firstBefore.snapshot.messages.some(old=>old.id===m.id));
    assert(customers.length===8&&new Set(customers.map(m=>m.id)).size===8&&customers.every(m=>m.text===question),
      'Burst must contain eight immutable same-text customer IDs');
    // Includes native AX/Host confirmation overhead; the exact 2s controller
    // scheduling bound is separately checked with the offline monotonic clock.
    const elapsed=Date.now()-burstAt;
    assert(elapsed<=15000,'Native burst did not complete within the bounded 15s gate budget');
    record('burst-bounded-completion',{ids:customers.map(m=>m.id),elapsed,budgetMs:15000});
    await quiet('own-message-and-repeat-observation-do-not-trigger');
    const secondBefore=await sample('same-text-baseline'),second=await add(question);
    assert(!customers.some(m=>m.id===second),'Same text reused native message ID');
    await sentSince(secondBefore,'same-text-new-ID-submits-once');

    const manual='人工草稿：必须保留，不允许自动覆盖';
    await fixture('support.draft.t1',{action:'setValue',value:manual});await observe();await idle();
    await wait(()=>getAutomation().mode==='paused','manual draft takes ownership');
    await add(question);
    const protectedDraft=await quiet('manual-draft-protected');
    assert(protectedDraft.snapshot.draft===manual,'Human draft was overwritten');
    await shot('manual-draft-protected');
    await fixture('support.clear-draft');await observe();await idle();
    await control('恢复');await enabled();await quiet('manual-takeover-resume-baselines-history');

    await control('暂停');await wait(()=>getAutomation().mode==='paused','explicit native pause');
    await add(question);await quiet('pause-stops-submission');
    await control('恢复');await enabled();await quiet('resume-does-not-replay-paused-history');
    const resumed=await sample('resumed-baseline');await add(question);
    await sentSince(resumed,'only-new-message-after-resume');

    await control('人工接管');await wait(()=>getAutomation().mode==='paused','explicit human takeover');
    await add(question);await quiet('human-takeover-no-send');await shot('takeover');
    await control('恢复');await enabled();await quiet('takeover-return-does-not-replay');

    await fixture('support.contact.t2');await observe();await idle();
    await wait(()=>getRender()?.binding.customerId==='t2'&&getAutomation().mode==='paused','native conversation switch pauses');
    await add(question);await quiet('other-session-does-not-inherit-consent');
    await fixture('support.contact.t1');await observe();await idle();
    await wait(()=>getRender()?.binding.customerId==='t1','return original native conversation');
    assert(getAutomation().mode!=='enabled','Returning automatically restored automation');
    await quiet('return-does-not-restore-old-automation');
    await enable();await quiet('reconfirmed-session-baselines-old-history');

    await control('撤权');await wait(()=>getAutomation().mode==='revoked','explicit automation revocation');
    await add(question);await quiet('revocation-no-send');
    const controls=nodes(await tree(await assistant()));
    const resume=controls.filter(n=>n.name===prefix+'恢复'&&n.role==='button');
    assert(resume.length===1&&resume[0].enabled===false,'Revoked controller exposed an enabled resume control');
    const final=await sample('request-budget');
    assert(final.automation.requests===3&&final.oracle.sendActions===3,
      'Core gate must use exactly three automatic requests/sends, below 6 requests/60s');
    record('core-request-budget',{requests:final.automation.requests,sendActions:final.oracle.sendActions,limitPerMinute:6});
    await shot('revoked');

    // Two fault requests follow the three successful core requests: 5 total.
    await cycleMode('failure');await enable();
    await quiet('reenable-after-revoke-baselines-history');
    const failureBefore=await sample('failure-baseline');await add(question);
    await faultSince(failureBefore,'failure-pauses-preserves-draft','failure','failed',false);
    await add(question);await quiet('failure-does-not-retry-or-send-backlog');await shot('failed');

    await fixture('support.clear-draft');await observe();await idle();
    await cycleMode('unknown-delivered');
    if(unknownMode==='unknown-not-delivered')await cycleMode('unknown-not-delivered');
    await control('恢复');await enabled();await quiet('fault-resume-does-not-replay-history');
    const unknownBefore=await sample('unknown-baseline');await add(question);
    await faultSince(unknownBefore,unknownMode+'-stays-locked',unknownMode,'unknown',unknownMode==='unknown-delivered');
    await add(question);await quiet('locked-new-message-and-observations-never-retry',1600,true);
    const lockedControls=nodes(await tree(await assistant()));
    for(const name of ['暂停','恢复','人工接管']){
      const matches=lockedControls.filter(n=>n.name===prefix+name&&n.role==='button');
      assert(matches.length===1&&matches[0].enabled===false,'Locked control must remain disabled: '+name);
    }
    await react('打开设置');
    const lockedSettings=nodes(await tree(await assistant()));
    const enableToggle=lockedSettings.filter(n=>n.name===prefix+'启用'&&n.role==='checkbox');
    assert(enableToggle.length===1&&enableToggle[0].enabled===false,'Unknown lock must prohibit re-enable');
    await react('← 返回');await wait(()=>getRender()?.tab==='reply','locked return to reply panel');
    await control('撤权');await wait(()=>getAutomation().mode==='locked','revocation cannot clear unknown lock');
    await quiet('locked-controls-do-not-retry',1600,true);
    // Empty draft and fresh observations cannot prove an unknown send safe to
    // retry, even when the independent disk oracle says it was not delivered.
    await fixture('support.clear-draft');await observe();await idle();
    await quiet('locked-empty-draft-does-not-unlock',1600,true);await shot('unknown-locked');
    const faultBudget=await sample('final-five-request-budget');
    assert(faultBudget.automation.requests===5&&faultBudget.oracle.sendActions===5,
      'Complete gate must use exactly five requests/sends, below 6 requests/60s');
    record('complete-request-budget',{requests:5,sendActions:5,limitPerMinute:6});
    const skipped={id:'extended-scenarios-deferred',status:'NOT_RUN',scenarios:deferred,
      reason:'The complementary unknown outcome requires a fresh launcher run; never unlock or replay this action.'};
    results.push(skipped);log('controlled-native-check',skipped);
    completed=true;
  }catch(error){
    results.push({id:'gate-completion',status:'FAIL',error:String(error),code:error.code??null,
      actionState:error.actionState??null,automation:typeof getAutomation==='function'?copy(getAutomation()):null});
    throw error;
  }finally{
    await File.writeJSON(File.join(evidence,'controlled-native-results.json'),{
      status:completed?'PASS':'FAIL',coverage:'success-protection-burst-failure-and-'+unknownMode,unknownMode,deferred,results});
  }
})
