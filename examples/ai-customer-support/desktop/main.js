// Run from the repository root: ./opendesk -ui -script examples/ai-customer-support/desktop/main.js -console-mode script
(0,eval)(File.read(File.join(Execution.scriptDir,'core.generated.js')));
(0,eval)(File.read(File.join(Execution.scriptDir,'adapter.js')));
const core=globalThis.OpenDeskSupportCore;
const evidence=File.join(File.cwd(),'.runtime/tests/ai-customer-support/r23-native');
File.ensureDir(evidence);
const stateFile=File.join(evidence,'saved-state.json');
const model=OpenDeskSupportAdapter.create(core,File.exists(stateFile)?await File.readJSON(stateFile):undefined);
const panel=await ui.createWindow({id:'aiCustomerSupport',title:'OpenDesk · AI 客服助手',kind:'normal',keyEvents:true,
  position:{mode:'anchor',horizontal:'right',vertical:'top',margin:32,display:'active',size:{width:380,height:820}},
  theme:'system',content:{file:'panel.html',cssFile:'panel.css',basePath:Execution.scriptDir}});
const control=id=>panel.control(id),patchCache={};let closed=false,queue=Promise.resolve(),viewToken=model.token(),bindingPending=0;
const imageList=core.products.flatMap(p=>p.images.map((image,i)=>({p,image,i})));
let knowledgeRows=[],productRows=[],orderRows=[],facts=[],pendingReadback=null;
function asset(p,image){return 'assets/'+p.id+'-'+image.id+'.png';}
function text(id,value){return update(id,{text:String(value??'')});}
function update(id,patch){const key=JSON.stringify(patch);if(patchCache[id]===key)return Promise.resolve();
  patchCache[id]=key;return control(id).update(patch).catch(e=>{delete patchCache[id];throw e;});}
async function render(){
  const s=model.state,u=model.ui,t=core.currentThread(s),jobs=[];
  jobs.push(update('app',{classes:[u.theme,...(u.zoom==='200'?['zoom-200']:[])]}),
    text('status',!s.permission?'未授权':s.paused?'已暂停':'观察中 · 模拟'),update('bound-customer',{value:s.threadId}),
    text('notice',s.receipt),update('draft',{value:t.draft}),update('permission',{checked:s.permission}),update('paused',{checked:s.paused}),
    update('theme',{value:u.theme}),update('zoom',{value:u.zoom}));
  for(const tab of [...core.tabs,'settings'])jobs.push(update('view-'+tab,{visible:s.tab===tab}));
  for(const tab of core.tabs)jobs.push(update('tab-'+tab,{active:s.tab===tab}));
  if(s.tab==='reply'){
    const hit=core.activeHit(s),opts=core.activeOptions(s);
    jobs.push(text('latest-message',core.latestCustomerMessage(t)?.text||'尚无消息'),
      text('match-source',hit?(hit.exact?'演示知识精确命中':'相似候选 · 待核实')+' · '+hit.k.source+'\n'+hit.k.eligibility:'无可靠或唯一知识 · 澄清 / 人工核实'),
      update('reply-editor',{value:core.activeReplyText(s)}),text('receipt',s.receipt));
    for(let i=0;i<3;i++)jobs.push(update('choice-'+i,{visible:!!opts[i],...(opts[i]?{active:core.activeReply(s).id===opts[i].id}:{})}),
      update('reply-'+i,{visible:!!opts[i],text:opts[i]?.text||''}));
  }
  if(s.tab==='knowledge'){
    jobs.push(update('knowledge-category',{options:[{value:'all',label:'全部分类'},...Array.from(new Set(s.knowledge.map(k=>k.category))).map(value=>({value,label:value}))],value:u.knowledgeCategory}));
    const q=core.normalize(u.knowledgeQuery);
    knowledgeRows=s.knowledge.filter(k=>(u.knowledgeCategory==='all'||k.category===u.knowledgeCategory)&&
      core.normalize([k.question,k.a,...k.aliases].join(' ')).includes(q));
    jobs.push(update('knowledge-empty',{visible:true,text:knowledgeRows.length+' 条 · 导入知识仅供建议，仍需人工核实'}));
    for(let i=0;i<24;i++){const k=knowledgeRows[i];jobs.push(update('knowledge-open-'+i,{visible:!!k}));
      if(k)jobs.push(text('knowledge-title-'+i,(k.enabled?'':'[停用] ')+k.question),text('knowledge-answer-'+i,k.a));}
    const k=s.knowledge.find(k=>k.id===u.knowledgeId);
    jobs.push(text('knowledge-detail',k?[k.question,k.a,'来源：'+k.source,'分类：'+k.category,'适用范围：'+(k.scope||'通用演示'),'状态：'+k.eligibility].join('\n'):'选择条目查看全文、来源与适用范围'));
  }
  if(s.tab==='customer'){
    const id=u.profile;facts=s.facts.filter(f=>f.customerId===id);
    jobs.push(update('profile-customer',{value:id}),text('profile-binding','当前绑定：'+t.name+'（'+s.threadId+'） · 浏览档案不改变绑定'),
      text('history-text',s.history[id].map(session=>'会话 '+session.sessionId+'\n'+session.messages.map(m=>
        m.messageId+' · '+m.at+' · '+(m.role==='customer'?'客户':'客服')+'：'+m.text).join('\n')).join('\n\n')),
      update('fact-choice',{options:facts.length?facts.map(f=>({value:f.id,label:'['+f.status+'] '+f.value})):[{value:'none',label:'没有提取信息'}]}));
    const f=facts.find(f=>f.id===u.factId)||facts[0];u.factId=f?.id||null;
    if(f)jobs.push(update('fact-choice',{value:f.id}));
    jobs.push(text('fact-detail',f?[f.category+'：'+f.value,'状态：'+f.status,'历史原话：'+f.evidence,
      '来源：customer-history-demo.json / '+f.sessionId+' / '+f.messageId+' / '+f.at,'提取：'+f.method+' · 非已验证事实'].join('\n'):'没有待确认信息'));
  }
  if(s.tab==='products'){
    jobs.push(update('product-category',{options:[{value:'all',label:'全部分类'},...Array.from(new Set(core.products.map(p=>p.category))).map(value=>({value,label:value}))],value:u.productCategory}));
    productRows=core.visibleProducts(u.productQuery,u.productCategory);
    for(let i=0;i<6;i++){const p=productRows[i];jobs.push(update('product-open-'+i,{visible:!!p}));if(p)jobs.push(
      update('product-thumb-'+i,{source:asset(p,p.images[0])}),text('product-name-'+i,p.name),text('product-meta-'+i,p.sku+' · 演示参考价 '+p.price));}
    const p=core.findProduct(s.productSelected);jobs.push(update('product-detail',{visible:!!p}));
    if(p)jobs.push(update('product-hero',{source:asset(p,p.images[0])}),text('product-summary',p.name+' · '+p.model+'\n'+p.summary),
      text('product-specs',p.specs.map(x=>x.label+'：'+x.value).join('\n')+'\n演示参考价：'+p.price),text('product-source','来源：'+p.source+' · '+p.updated+' · 库存与实际价格待人工核实'));
  }
  if(s.tab==='images'){
    imageList.forEach(({p,image},i)=>jobs.push(update('image-thumb-'+i,{source:asset(p,image)}),text('image-label-'+i,p.name+' · '+image.label)));
    const p=core.findProduct(s.imageSelected?.productId),image=p?.images.find(x=>x.id===s.imageSelected?.imageId);
    jobs.push(update('image-preview',{visible:!!image}));if(image)jobs.push(update('image-large',{source:asset(p,image)}),text('image-detail',p.name+' / '+p.sku+' / '+image.label+'\n本地图像示意，非实物照片'));
  }
  if(s.tab==='orders'){
    jobs.push(update('order-status',{options:[{value:'all',label:'全部状态'},...Array.from(new Set(core.allOrders.map(o=>o.status))).map(value=>({value,label:value}))],value:u.orderStatus}));
    orderRows=core.ordersForCustomer(s.threadId,s.permission).filter(o=>core.orderMatches(o,u.orderQuery,u.orderStatus));
    jobs.push(update('order-empty',{visible:true,text:s.permission?(orderRows.length+' 笔当前客户演示订单'):'未授权 · 不读取订单'}));
    for(let i=0;i<8;i++){const o=orderRows[i];jobs.push(update('order-open-'+i,{visible:!!o}));if(o)jobs.push(text('order-label-'+i,o.orderId+' · '+o.status+' · '+core.money(o.amount)));}
    const o=core.orderForCustomer(s.threadId,s.orderSelected,s.permission);jobs.push(update('order-detail',{visible:!!o}));
    jobs.push(text('order-summary',o?core.orderSummary(o):''));
    for(let i=0;i<3;i++){const p=core.findProduct(o?.items[i]?.productId);jobs.push(update('order-product-'+i,{visible:!!p,...(p?{text:'查看商品：'+p.name}:{})}));}
  }
  await Promise.all(jobs);
  // Parent visibility and child text also change native AX peers. Read their
  // actual DOM states after the complete render, without replacing card trees.
  await Promise.all(panel.controls().filter(c=>['button','input','select'].includes(c.type)).map(c=>control(c.id).getState()));
  viewToken=model.token();
}
async function capture(reason){
  const ids=['bound-customer','status','notice'];
  if(model.state.tab==='reply')ids.push('reply-editor','draft','latest-message','match-source','receipt','reply-0','reply-1','reply-2');
  if(model.state.tab==='knowledge')ids.push('knowledge-detail','knowledge-empty');
  if(model.state.tab==='customer')ids.push('profile-customer','profile-binding','history-text','fact-detail');
  if(model.state.tab==='orders')ids.push('order-empty','order-summary');
  if(model.state.tab==='products')ids.push('product-summary','product-specs','product-source','product-hero');
  if(model.state.tab==='images')ids.push('image-large',...imageList.map((_,i)=>'image-thumb-'+i));
  const controls={};for(const id of ids)controls[id]=await control(id).getState();
  const record={reason,at:new Date().toISOString(),window:await panel.getState(),tab:model.state.tab,
    binding:model.token(),permission:model.state.permission,paused:model.state.paused,controls};
  await File.writeJSON(File.join(evidence,'native-state.json'),record);
  File.append(File.join(evidence,'events.jsonl'),JSON.stringify(record)+'\n');
  console.log('DESKTOP_NATIVE_STATE '+JSON.stringify({reason,tab:record.tab,window:record.window,binding:record.binding}));
}
async function copy(value){clipboard.copy(value);if(clipboard.paste()!==value)throw Error('系统剪贴板回读不一致');
  model.dispatch({type:'RECORD',message:'已复制 · 系统剪贴板回读一致'});}
async function fillDraft(value,identity){
  const actual=await control('draft').getState();
  if(actual.value!==core.currentThread(model.state).draft)throw Error('Native 草稿已变化，未覆盖');
  const next=model.fill(value,identity);
  if(next.receipt==='已填入并回读模拟草稿 · 未发送')pendingReadback={identity,value:core.currentThread(next).draft};
}
async function handle(e,identity){
  const id=e.targetId,s=model.state,u=model.ui;
  if(e.type==='click'){
    if(id?.startsWith('tab-'))model.dispatch({type:'TAB',tab:id.slice(4)});
    else if(id==='settings')model.dispatch({type:'TAB',tab:'settings'});
    else if(id==='settings-back')model.dispatch({type:'TAB',tab:s.settingsOrigin});
    else if(id==='simulate'){const v=await control('question').getState();model.dispatch({type:'RECEIVE',id:s.threadId,text:v.value});}
    else if(id?.startsWith('choice-')){if(model.current(identity)){const option=core.activeOptions(s)[Number(id.slice(7))];if(option)model.dispatch({type:'REPLY_CHOICE',key:core.latestKey(s),id:option.id});}}
    else if(id==='copy-reply')await copy(core.activeReplyText(s));
    else if(id==='fill-reply')await fillDraft(core.activeReplyText(s),identity);
    else if(id==='read-draft'){const actual=await control('draft').getState();
      if(actual.value!==core.currentThread(s).draft)throw Error('Native 草稿与业务状态不一致');
      model.dispatch({type:'RECORD',message:'Native Runtime 草稿回读一致 · 未发送'});}
    else if(id?.startsWith('knowledge-open-'))u.knowledgeId=knowledgeRows[Number(id.slice(15))]?.id||null;
    else if(id==='fact-confirm'||id==='fact-ignore')model.dispatch({type:'FACT_STATUS',id:u.factId,customerId:u.profile,status:id==='fact-confirm'?'confirmed':'dismissed'});
    else if(id?.startsWith('product-open-')){const p=productRows[Number(id.slice(13))];if(p)model.dispatch({type:'OPEN_PRODUCT',id:p.id});}
    else if(id==='product-images'){const p=core.findProduct(s.productSelected);if(p)model.dispatch({type:'OPEN_IMAGE',productId:p.id,imageId:p.images[0].id});}
    else if(id==='product-copy'){const p=core.findProduct(s.productSelected);if(p)await copy(core.productCopyText(p));}
    else if(id?.startsWith('image-open-')){const item=imageList[Number(id.slice(11))];if(item)model.dispatch({type:'OPEN_IMAGE',productId:item.p.id,imageId:item.image.id});}
    else if(id==='image-product'&&s.imageSelected)model.dispatch({type:'OPEN_PRODUCT',id:s.imageSelected.productId});
    else if(id?.startsWith('order-open-')){const o=orderRows[Number(id.slice(11))];if(o)model.dispatch({type:'OPEN_ORDER',orderId:o.orderId});}
    else if(id==='copy-order'||id==='fill-order'){const o=core.orderForCustomer(s.threadId,s.orderSelected,s.permission);
      if(o&&model.current(identity)){if(id==='copy-order')await copy(core.orderSummary(o));else await fillDraft(core.orderSummary(o),identity);}}
    else if(id?.startsWith('order-product-')){const o=core.orderForCustomer(s.threadId,s.orderSelected,s.permission),p=core.findProduct(o?.items[Number(id.slice(14))]?.productId);
      if(p)model.dispatch({type:'OPEN_PRODUCT',id:p.id});}
  }else if(e.type==='input'||e.type==='change'){
    if(id==='bound-customer'){if(e.value!==s.threadId)model.dispatch({type:'SET_THREAD',id:e.value});}
    else if(id==='permission'||id==='paused')model.dispatch({type:'SETTING',key:id,value:e.checked});
    else if(id==='profile-customer'){u.profile=e.value;u.factId=null;}
    else if(id==='fact-choice')u.factId=e.value;
    else if(id==='theme'||id==='zoom')u[id]=e.value;
    else if(id==='draft'&&model.current(identity))model.dispatch({type:'SET_DRAFT',id:identity.id,text:e.value});
    else if(id==='reply-editor'&&model.current(identity))model.dispatch({type:'REPLY_TEXT',key:core.activeReplyKey(s),text:e.value});
    else {const fields={'knowledge-query':'knowledgeQuery','knowledge-category':'knowledgeCategory','product-query':'productQuery',
      'product-category':'productCategory','order-query':'orderQuery','order-status':'orderStatus'};if(fields[id])u[fields[id]]=e.value;}
  }
}
const off=panel.on('*',event=>{
  if(event.type==='close'){closed=true;return;}
  if(event.type==='key'){File.append(File.join(evidence,'key-events.jsonl'),JSON.stringify(event)+'\n');return;}
  if(!['click','change','input'].includes(event.type))return;
  const identity={...viewToken},isBinding=event.targetId==='bound-customer';
  // The native select changes before its queued render. Do not accept edits
  // against that intermediate binding, and always repair the DOM from state.
  const blockedEdit=bindingPending>0&&['draft','reply-editor'].includes(event.targetId);
  if(isBinding)bindingPending++;
  if(['input','change'].includes(event.type))delete patchCache[event.targetId];
  queue=queue.then(async()=>{if(closed)return;
    if(blockedEdit)model.dispatch({type:'RECORD',message:'客户切换中，编辑未接收；请在绑定显示稳定后重试'});
    else await handle(event,identity);
    if(isBinding||blockedEdit){delete patchCache.draft;delete patchCache['reply-editor'];}
    await render();
    if(isBinding)bindingPending--;
    if(pendingReadback){const pending=pendingReadback;pendingReadback=null;
      const actual=await control('draft').getState();
      if(!model.current(pending.identity)||actual.value!==pending.value)throw Error('Native 草稿回读失败，停止后续动作');
      model.dispatch({type:'RECORD',message:'Native Runtime 草稿回读一致 · 未发送'});await render();}
    await File.writeJSON(stateFile,model.save());await capture(event.type+':'+event.targetId);
  }).catch(async error=>{console.error('DESKTOP_EVENT_FAILED '+String(error));
    try{await text('notice','操作失败，已停止本次动作：'+String(error));}catch(_){} });
});
try{
  await render();await panel.show();await sleep(250);await capture('startup');
  // Opt-in repository gate. It drives this same WKWebView using public APIs;
  // the normal one-line launch does not load test code or enable a server.
  if(System.getEnv('OPENDESK_SUPPORT_NATIVE_TEST')==='1'){
    const exercise=(0,eval)(File.read(File.join(File.cwd(),'tests/custom-ui/ai-customer-support-native.js')));
    await exercise({panel,idle:async()=>{await queue;},capture,evidence});
  }
  await panel.waitUntilClosed();await queue;
}finally{
  closed=true;off();await ui.closeAll();
  console.log('DESKTOP_CLOSED '+JSON.stringify(await panel.getState()));
}
