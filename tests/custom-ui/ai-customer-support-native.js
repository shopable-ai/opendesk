// Repository-root native gate:
// OPENDESK_SUPPORT_NATIVE_TEST=1 ./opendesk -ui -script examples/ai-customer-support/desktop/main.js -console-mode script
// This function is loaded only by that explicit gate, in the actual application
// Execution. It cannot dispatch reducer actions or synthesize application events.
(async function({panel,idle,capture,evidence}){
  const results=[];
  const check=(name,ok,actual)=>{results.push({name,status:ok?'PASS':'FAILED',actual});
    console.log('NATIVE_CHECK '+JSON.stringify(results[results.length-1]));if(!ok)throw Error(name);};
  const state=id=>panel.control(id).getState();
  let win;
  const scope=async()=>win=win?await window.current(win):await window.get({pid:(await panel.getState()).hostPid});
  async function snapshot(){return Accessibility.snapshot({within:await scope(),maxDepth:32,maxNodes:2000,
    properties:['role','name','identifier','enabled','actions','bounds','value','focused']});}
  async function shot(name){await panel.show();await sleep(250);const w=await panel.getState();
    await page.screenshot({clip:w.bounds,path:File.join(evidence,name+'.png'),returnType:'path'});}
  async function settle(){await sleep(80);await idle();}
  async function act(id,action){
    const s=await state(id);check('target-visible:'+id,s.visible,{id,visible:s.visible});
    const ref=await Accessibility.find({name:s.accessibilityName},{within:await scope(),maxDepth:32,maxNodes:2000});
    if(!ref)throw Error('Native AX target missing: '+id);
    try{await Accessibility.perform(ref,action);await settle();}finally{await Accessibility.release(ref);}
  }
  const click=id=>act(id,{action:'invoke'});
  const set=(id,value)=>act(id,{action:'setValue',value});
  const checked=(id,value)=>act(id,{action:'setChecked',checked:value});
  async function foreground(){await panel.show();await sleep(150);const w=await window.getActiveWindow();
    if(w.pid!==(await panel.getState()).hostPid)throw Error('目标窗口未获得前台，停止全局输入');return w;}
  async function scroll(delta){await foreground();const b=(await panel.getState()).bounds;
    await mouse.move(b.x+b.width/2,b.y+b.height/2);await mouse.wheel({deltaY:delta});await sleep(150);}
  async function pointer(id){await foreground();const c=await state(id),b=c.screenBounds,w=(await panel.getState()).bounds;
    if(!c.visible||b.y<w.y+32||b.y+b.height>w.y+w.height-25)throw Error('目标未完整显示，停止点击：'+id);
    await mouse.click(b.x+b.width/2,b.y+b.height/2);await settle();}
  try{
    await panel.show();await sleep(250);await scope();
    await shot('02-current-native');
    await File.writeJSON(File.join(evidence,'ax-current.json'),await snapshot());
    check('native-window-380',(await panel.getState()).bounds.width===380,await panel.getState());
    await click('settings');
    await checked('permission',true);await checked('paused',false);await click('settings-back');
    await click('tab-reply');await set('bound-customer','t1');
    await set('question','退款申请提交后如何查询进度？');await click('simulate');
    const replies=await Promise.all([0,1,2].map(i=>state('reply-'+i)));
    check('refund-three-strategies',replies.every(r=>r.visible&&r.text)&&new Set(replies.map(r=>r.text)).size===3,replies);
    check('refund-demo-source',(await state('match-source')).text.includes('knowledge-demo.json'),await state('match-source'));
    await shot('03-refund-three-replies');
    await click('choice-1');await set('reply-editor','演示人工编辑：请在订单售后详情查看退款状态；需人工核实，不承诺到账时间。');
    await click('copy-reply');check('clipboard-readback',clipboard.paste()===(await state('reply-editor')).value,await state('notice'));
    await set('draft','');await click('fill-reply');await click('read-draft');
    check('refund-native-draft-readback',(await state('draft')).value===(await state('reply-editor')).value,await state('draft'));
    await shot('04-refund-draft');
    await set('draft','人工草稿：不得覆盖');await click('fill-reply');
    check('draft-not-overwritten',(await state('draft')).value==='人工草稿：不得覆盖',await state('notice'));
    await scroll(900);await shot('04b-draft-protection');
    await pointer('tab-knowledge');await set('knowledge-query','退款申请提交后');await set('knowledge-category','售后');await click('knowledge-open-0');
    check('knowledge-search-detail-source',(await state('knowledge-detail')).text.includes('knowledge-demo.json')&&(await state('knowledge-detail')).text.includes('不承诺固定到账'),await state('knowledge-detail'));
    await shot('05-knowledge');await set('knowledge-query','');await set('knowledge-category','all');
    await pointer('tab-customer');
    for(const id of ['t1','t2','t3']){await set('profile-customer',id);
      check('profile-'+id+'-binding-isolated',(await state('bound-customer')).value==='t1'&&(await state('history-text')).text.includes('会话 '),await state('profile-binding'));}
    check('profile-evidence',(await state('fact-detail')).text.includes('历史原话：')&&(await state('fact-detail')).text.includes('customer-history-demo.json'),await state('fact-detail'));
    await click('fact-confirm');check('profile-confirm',(await state('fact-detail')).text.includes('confirmed'),await state('fact-detail'));
    await scroll(2000);await shot('06-customer-evidence');
    await pointer('tab-products');await set('product-query','OD-JK-101');await set('product-category','服饰');await click('product-open-0');
    check('product-sku-specs-price',(await state('product-meta-0')).text.includes('OD-JK-101')&&(await state('product-specs')).text.includes('299'),await state('product-specs'));
    await scroll(2000);await shot('07-product-detail');await click('product-copy');
    check('product-copy',clipboard.paste().includes('OD-JK-101'),clipboard.paste());
    await click('product-images');check('product-image-link',(await state('image-detail')).text.includes('OD-JK-101'),await state('image-detail'));
    await pointer('tab-images');
    const thumbs=await Promise.all(Array.from({length:12},(_,i)=>state('image-thumb-'+i)));
    check('twelve-PNG-native-decode',thumbs.every(x=>x.imageComplete&&x.imageNaturalWidth>0&&x.imageNaturalHeight>0),thumbs);
    await scroll(-5000);await shot('08-images');
    for(let i=0;i<12;i++){await click('image-open-'+i);const image=await state('image-large');
      check('large-image-'+i,image.imageComplete&&image.imageNaturalWidth>0,image);}
    await scroll(5000);await shot('08b-image-preview');await click('image-product');
    check('image-product-link',(await state('product-summary')).text.length>5,await state('product-summary'));
    await pointer('tab-orders');
    for(const id of ['t1','t2','t3']){await set('bound-customer',id);await set('order-query','');await set('order-status','all');await click('order-open-0');
      const summary=(await state('order-summary')).text;
      check('orders-'+id+'-isolated',summary.includes('OD-DEMO-'+id.slice(1)+'001'),summary);}
    await set('order-query','OD-DEMO-1001');
    check('foreign-order-query-empty',!(await state('order-open-0')).visible,await state('order-empty'));
    await set('bound-customer','t2');await set('order-status','待付款');await click('order-open-0');
    check('order-status-filter',(await state('order-summary')).text.includes('OD-DEMO-2002'),await state('order-summary'));
    await set('order-status','all');await set('order-query','OD-DEMO-2001');await click('order-open-0');await click('copy-order');
    check('order-summary-copy',clipboard.paste().includes('OD-DEMO-2001'),clipboard.paste());
    await click('fill-order');await pointer('tab-reply');
    check('order-fill-native-draft',(await state('draft')).value.includes('OD-DEMO-2001'),await state('draft'));
    await pointer('tab-orders');await shot('09-orders');await click('order-product-0');
    check('order-product-link',(await state('product-summary')).text.includes('音箱'),await state('product-summary'));
    await click('settings');await checked('permission',false);await click('settings-back');await pointer('tab-orders');
    check('revoked-orders-empty',!(await state('order-summary')).text&&(await state('order-empty')).text.includes('未授权'),await state('order-empty'));
    await pointer('tab-reply');const draftBefore=(await state('draft')).value;await click('fill-reply');
    check('revoked-fill-blocked',(await state('draft')).value===draftBefore,await state('notice'));
    await click('settings');await checked('permission',true);await checked('paused',true);await click('settings-back');
    await set('draft','');await click('fill-reply');check('paused-fill-blocked',(await state('draft')).value==='',await state('notice'));
    await click('settings');await checked('paused',false);await set('theme','dark');await set('zoom','200');
    await shot('10-settings-dark-200');await click('settings-back');await shot('10b-reply-dark-200');
    await click('settings');await set('zoom','100');await set('theme','light');await click('settings-back');
    await pointer('tab-reply');await scroll(-5000);
    for(const width of [320,360,380,400,440,520]){
      await panel.setSize(width,820);await sleep(250);const s=await panel.getState();
      check('width-'+width,s.bounds.width===width,s.bounds);await shot('width-'+width);
    }
    await panel.setSize(380,820);await sleep(250);await foreground();
    const keyFile=File.join(evidence,'key-events.jsonl'),keyStart=File.exists(keyFile)?File.read(keyFile).length:0;
    await keyboard.press('Tab');await keyboard.press('Tab');await sleep(150);await shot('11-keyboard-focus');
    const keys=File.exists(keyFile)?File.read(keyFile).slice(keyStart):'';
    check('keyboard-native-Tab-events',keys.includes('Tab')&&keys.includes('targetId'),keys);
    await capture('native-gate-complete');
    await panel.close();
  }finally{
    await File.writeJSON(File.join(evidence,'native-results.json'),{results});
  }
})
