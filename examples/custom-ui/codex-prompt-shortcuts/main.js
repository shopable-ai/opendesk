// OpenDesk Codex Desktop Prompt Shortcuts R1.1 (copy-only safety baseline)
// From repo root: ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
'use strict';
const DIR=File.join(File.cwd(),'.runtime','examples','custom-ui','codex-prompt-shortcuts');
const FILE=File.join(DIR,'library.json'),LOCK=File.join(DIR,'library.lock');
const own=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const dup=x=>JSON.parse(JSON.stringify(x));
const failure=(code,message)=>Object.assign(new Error(message),{code});
const clean=s=>String(s||'').trim();
const html=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const label=s=>Array.from(clean(s)).filter(c=>c.trim()).slice(0,2).join('');
const empty=()=>({schemaVersion:1,revision:0,prompts:[],settings:{appBundleId:'',offsetX:0,offsetY:0}});
const uid=()=> 'ps_'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);
function verified(x){
  if(!own(x)||x.schemaVersion!==1||!Number.isSafeInteger(x.revision)||x.revision<0||
     !Array.isArray(x.prompts)||x.prompts.length>80||!own(x.settings))
    throw failure('INVALID_LIBRARY','提示词库结构无效');
  const s=x.settings,seen=new Set();
  if(typeof s.appBundleId!=='string'||s.appBundleId.length>200||
     (s.appBundleId&&!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(s.appBundleId))||
     !Number.isInteger(s.offsetX)||!Number.isInteger(s.offsetY)||
     Math.abs(s.offsetX)>10000||Math.abs(s.offsetY)>10000)
    throw failure('INVALID_SETTINGS','窗口设置无效');
  const prompts=x.prompts.map((p,i)=>{
    if(!own(p)||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(p.id)||
       seen.has(p.id)||typeof p.body!=='string'||!p.body.trim()||
       p.body.length>8192||p.body.includes('\0')||
       typeof p.name!=='string'||p.name.length>60||
       typeof p.label!=='string'||p.label.length>16||typeof p.enabled!=='boolean')
      throw failure('INVALID_ITEM','提示词第'+(i+1)+'条无效');
    seen.add(p.id);
    return {id:p.id,body:p.body,name:p.name,label:p.label,enabled:p.enabled,order:i};
  });
  return {schemaVersion:1,revision:x.revision,prompts,
    settings:{appBundleId:s.appBundleId,offsetX:s.offsetX,offsetY:s.offsetY}};
}
function importBackup(value){
  if(!own(value)||value.format!=='opendesk.prompt-shortcuts'||
     ![1,2].includes(value.version)||!Array.isArray(value.items)||
     !value.items.length||value.items.length>80)
    throw failure('INVALID_BACKUP','仅支持浏览器提示词正式 v1/v2 备份');
  const orderSet=new Set(),images=[];
  const prompts=value.items.map((p,i)=>{
    if(!own(p)||typeof p.body!=='string'||!p.body.trim()||
       p.body.length>8192||p.body.includes('\0')||
       (p.label!==undefined&&typeof p.label!=='string')||
       (p.name!==undefined&&typeof p.name!=='string')||
       (p.enabled!==undefined&&typeof p.enabled!=='boolean'))
      throw failure('INVALID_BACKUP','备份第'+(i+1)+'条无效');
    const order=p.order===undefined?i:p.order;
    if(!Number.isSafeInteger(order)||order<0||orderSet.has(order))
      throw failure('INVALID_BACKUP','备份排序无效/重复');
    orderSet.add(order);
    if(p.appearance==='image'||p.imageAssetId)images.push(i+1);
    if(p.appearance&&!['text','image'].includes(p.appearance))
      throw failure('INVALID_BACKUP','未知图片外观');
    return {id:uid(),body:p.body,label:clean(p.labelAuto===true?'':p.label).slice(0,16),
      name:clean(p.nameAuto===true?'':p.name).slice(0,60),
      enabled:p.enabled!==false,order};
  });
  return {prompts:prompts.sort((a,b)=>a.order-b.order),images};
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const barHeight=doc=>Math.min(400,36+Math.max(1,doc.prompts.filter(p=>p.enabled).length)*43+43);
function frame(win,h,offset,displays){
  const x=win.x+24+offset.offsetX;
  const y=win.y+64+(Math.max(80,win.height-216)-h)/2+offset.offsetY;
  let best=null,score=-1;
  for(const d of displays){
    const b=d.bounds||d;
    if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)continue;
    const area=Math.max(0,Math.min(win.x+win.width,b.x+b.width)-Math.max(win.x,b.x))*
      Math.max(0,Math.min(win.y+win.height,b.y+b.height)-Math.max(win.y,b.y));
    if(area>score){score=area;best=b;}
  }
  return best?{
    x:Math.round(clamp(x,best.x+8,Math.max(best.x+8,best.x+best.width-60))),
    y:Math.round(clamp(y,best.y+8,Math.max(best.y+8,best.y+best.height-h-8)))
  }:{x:Math.round(x),y:Math.round(y)};
}
const barCSS=':root{color-scheme:light dark}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}'+
  '#shell{height:100%;background:#f9fafb;border:1px solid #d7dce5;border-radius:14px;padding:5px;'+
  'display:flex;flex-direction:column;align-items:center;gap:5px}'+
  '#grip{min-height:18px;cursor:grab;color:#8993a4}#list{width:100%;overflow-y:auto;'+
  'display:flex;flex-direction:column;align-items:center;gap:5px}'+
  'button{height:38px;min-height:38px;width:38px;border-radius:10px;border:1px solid #d9e0e9;'+
  'background:#fff;color:#334155;font:600 13px -apple-system,sans-serif;cursor:pointer}'+
  'button:focus-visible{outline:2px solid #2563eb}button:hover{background:#eaf0fb}#settings{height:30px;min-height:30px}'+
  '@media(prefers-color-scheme:dark){#shell{background:#232a34;border-color:#485467}'+
  'button{background:#323d4b;color:#f1f5f9;border-color:#4c5b6d}}';
const managerCSS=':root{color-scheme:light dark}*{box-sizing:border-box}'+
  'html,body{margin:0;background:#f8fafc;color:#1e293b;font:13px -apple-system,sans-serif}'+
  'main{padding:18px 20px;display:grid;gap:10px}header{display:flex;justify-content:space-between;align-items:center}'+
  'h1{font-size:17px;margin:0}small{color:#64748b}#listRows{display:grid;grid-template-columns:1fr 1fr;gap:6px}'+
  'label{display:block;font-weight:600;margin-bottom:4px}input,textarea{width:100%;padding:8px;border-radius:8px;'+
  'border:1px solid #cbd5e1;background:#fff;color:inherit;font:inherit}textarea{height:100px}'+
  '.actions{display:flex;gap:6px;flex-wrap:wrap}button{padding:8px;border:1px solid #cbd5e1;'+
  'border-radius:8px;background:#fff;color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.4}'+
  '#save{background:#2563eb;color:white;border-color:#2563eb}#status{min-height:25px;color:#64748b}'+
  '@media(prefers-color-scheme:dark){html,body{background:#232a34;color:#f1f5f9}'+
  'input,textarea,button{background:#323d4b;border-color:#4b5c70}small,#status{color:#b1c0d0}}';
const managerHTML='<!doctype html><html><head><meta charset="utf-8"></head><body><main>'+
  '<header><h1>Codex · 提示词快捷按钮</h1><small id="count"></small></header>'+
  '<small>按钮位于 Codex 对话左侧；点击只复制，不发送。</small>'+
  '<div id="listRows">'+Array.from({length:6},(_,i)=>'<button id="row'+i+'">—</button>').join('')+'</div>'+
  '<div class="actions"><button id="prev">上一页</button><button id="next">下一页</button>'+
  '<button id="new">＋ 新建</button><button id="up">上移</button><button id="down">下移</button></div>'+
  '<section><label for="body">提示词正文 *</label><textarea id="body"></textarea></section>'+
  '<section><label for="label">短标签（留空自动）</label><input id="label" type="text"></section>'+
  '<section><label for="name">显示名称</label><input id="name" type="text"></section>'+
  '<section><label for="enabled">启用提示词</label><input id="enabled" type="checkbox" checked></section>'+
  '<small id="preview"></small><div class="actions"><button id="save">保存</button>'+
  '<button id="delete">删除</button><button id="discard">放弃修改</button></div>'+
  '<section><label for="bundleId">Codex Bundle ID（需本机核实，可留空）</label>'+
  '<input id="bundleId" type="text" placeholder="留空使用精确应用名 Codex"></section>'+
  '<div class="actions"><button id="appSave">保存应用标识</button><button id="reset">重置位置</button></div>'+
  '<section><label for="backup">浏览器 JSON 备份文件绝对路径</label>'+
  '<input id="backup" type="text" placeholder="/Users/.../opendesk-prompt-shortcuts.json"></section>'+
  '<div class="actions"><button id="import">预览并追加导入</button><button id="export">导出 JSON</button></div>'+
  '<small id="status">准备就绪</small><div class="actions"><button id="close">关闭管理</button>'+
  '<button id="quit">退出</button></div></main></body></html>';
File.ensureDir(DIR);
let data=verified(await File.readJSON(FILE,{defaultValue:empty()}));
let baseline=JSON.stringify(data),bar=null,manager=null,originalWin=null;
let barId=0,managerId=0,expectedPosition=null,dragTimer=null,writing=false,lastProgrammaticMove=0;
let editId=null,editDirty=false,page=0,stopping=false,subscribers=[];
function logError(e){console.error('CODEX_SHORTCUT_ERROR='+JSON.stringify({
  code:e?.code||'ERROR',message:String(e?.message||e)}));}
async function toast(s,level='info'){
  try{await ui.toast({message:String(s).slice(0,900),level,timeoutMs:2600});}catch(e){logError(e);}
}
const safe=fn=>async()=>{try{await fn();}catch(e){logError(e);await toast('操作未完成：'+String(e.message||e),'error');}};
async function persist(change){
  if(writing)throw failure('BUSY','上次保存尚未完成');
  writing=true;let locked=false,committed=false;
  const nonce=Date.now().toString(36)+'-'+Math.random().toString(36);
  try{
    File.writeNew(LOCK,nonce);locked=true; // exclusive cross-instance lock
    const disk=verified(await File.readJSON(FILE,{defaultValue:empty()}));
    if(JSON.stringify(disk)!==baseline){
      data=disk;baseline=JSON.stringify(disk);
      throw failure('STALE','其他实例已修改数据，请核对新版本后再操作');
    }
    const next=dup(disk);change(next);next.revision++;
    const normalized=verified(next);
    await File.writeJSON(FILE,normalized,{maxBytes:1048576});
    committed=true;
    const checked=verified(await File.readJSON(FILE));
    if(JSON.stringify(checked)!==JSON.stringify(normalized))
      throw failure('UNCERTAIN','读回不一致');
    data=checked;baseline=JSON.stringify(checked);
  }catch(e){
    if(committed)throw failure('UNCERTAIN','可能已经写入；请先核对文件，不可重复盲试：'+String(e.message||e));
    throw e;
  }finally{
    writing=false;
    if(locked)try{if(File.read(LOCK)===nonce)File.remove(LOCK);
      else logError(failure('LOCK_CHANGED','锁所有者改变'));}catch(e){logError(e);}
  }
  await rebuild();
}
function appGroup(){return App.get(data.settings.appBundleId?
  {bundleId:data.settings.appBundleId}:{name:'Codex'});}
function isCodexPid(group,pid){return group&&Number.isInteger(pid)&&
  ((Array.isArray(group.pids)&&group.pids.includes(pid))||
    (Array.isArray(group.instances)&&group.instances.some(p=>p.pid===pid)));}
async function codexWindow(){
  const group=appGroup();if(!group)return null;
  const active=await window.getActiveWindow();
  if(active&&active.id&&isCodexPid(group,active.pid)){
    const exact=await window.get({id:active.id});
    originalWin=await window.current(exact);return originalWin;
  }
  // A toolbar click can shift focus to OpenDesk; trust only our own host PID.
  for(const panel of [bar,manager]){
    if(!panel||!active||!originalWin)continue;
    const state=await panel.getState();
    if(state.hostPid&&active.pid===state.hostPid){
      const exact=await window.current(originalWin);
      if(isCodexPid(group,exact.pid)){originalWin=exact;return exact;}
    }
  }
  return null;
}
function barHTML(items){
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<section id="shell"><div id="grip" data-opendesk-drag title="拖动位置">⠿</div>'+
    '<section id="list">'+items.map((p,i)=>
      '<button id="p'+i+'" title="'+html((p.name||label(p.body))+' · '+p.body.slice(0,80))+
      '" aria-label="'+html(p.name||'提示词')+'">'+html(p.label||label(p.body))+'</button>').join('')+
    '</section><button id="settings" title="管理提示词">⚙</button></section></body></html>';
}
let syncing=false,pendingSync=false;
async function synchronize(){
  if(!bar||stopping)return;
  let win=null;try{win=await codexWindow();}catch(e){logError(e);}
  try{
    if(!win){if((await bar.getState()).visible)await bar.hide();return;}
    const pos=frame(win,barHeight(data),data.settings,Screen.getDisplays());
    const before=(await bar.getState()).bounds;
    if(Math.abs(before.x-pos.x)>1||Math.abs(before.y-pos.y)>1){
      if(dragTimer){clearTimeout(dragTimer);dragTimer=null;}
      expectedPosition=pos;lastProgrammaticMove=Date.now();
      await bar.setPosition(pos.x,pos.y);
    }
    if(!(await bar.getState()).visible)await bar.show();
  }catch(e){logError(e);}
}
async function sync(){
  if(syncing){pendingSync=true;return;}syncing=true;
  try{do{pendingSync=false;await synchronize();}while(pendingSync&&!stopping);}
  finally{syncing=false;}
}
async function drag(event,epoch){
  if(epoch!==barId||!event?.bounds||!originalWin||stopping)return;
  const b=event.bounds;
  if(!Number.isFinite(b.x)||!Number.isFinite(b.y))return;
  // Polling can deliver an older programmatic move after a newer target position.
  // Such events must never overwrite the user's saved relative offset.
  if(Date.now()-lastProgrammaticMove<750)return;
  if(expectedPosition&&Math.abs(b.x-expectedPosition.x)<2&&
      Math.abs(b.y-expectedPosition.y)<2){expectedPosition=null;return;}
  if(dragTimer)clearTimeout(dragTimer);
  dragTimer=setTimeout(()=>{void safe(async()=>{
    const win=await window.current(originalWin);
    const base=frame(win,barHeight(data),{...data.settings,offsetX:0,offsetY:0},Screen.getDisplays());
    await persist(next=>{next.settings.offsetX=Math.round(b.x-base.x);
      next.settings.offsetY=Math.round(b.y-base.y);});
    await toast('位置已保存','success');
  })();},420);
}
async function copy(id){
  const item=data.prompts.find(p=>p.id===id&&p.enabled);
  if(!item||writing)return;
  if(!(await codexWindow())){await toast('Codex 不再处于目标窗口，已取消','warning');return;}
  clipboard.copy(item.body); // verified OS clipboard, NEVER paste or press Enter
  console.log('CODEX_SHORTCUT_COPIED='+JSON.stringify({id:item.id,length:item.body.length}));
  await toast('已复制：'+(item.name||item.label||label(item.body)),'success');
}
async function rebuild(){
  if(stopping)return;
  const old=bar;bar=null;barId++;if(old)await old.close();
  const items=data.prompts.filter(p=>p.enabled),epoch=barId;
  bar=await ui.createWindow({id:'codexBar'+epoch,kind:'floating',title:'',
    alwaysOnTop:true,draggable:true,theme:'system',
    position:{mode:'absolute',bounds:{x:24,y:110,width:52,height:barHeight(data)}},
    content:{html:barHTML(items),css:barCSS}});
  items.forEach((p,i)=>bar.control('p'+i).on('click',safe(()=>copy(p.id))));
  bar.control('settings').on('click',safe(openManager));
  bar.on('move',e=>{void drag(e,epoch);});
  await sync();
}
async function confirmDiscard(){
  return !editDirty || Dialog.confirm({title:'未保存修改',
    message:'放弃本次未保存的编辑？',confirmText:'放弃',cancelText:'继续编辑',defaultAction:'cancel'});
}
async function message(s){if(manager)await manager.control('status').update({text:String(s).slice(0,250)});}
async function render(){
  if(!manager)return;
  const items=data.prompts;page=clamp(page,0,Math.max(0,Math.ceil(items.length/6)-1));
  const updates=[manager.control('count').update({text:items.length+'条 · '+items.filter(p=>p.enabled).length+'启用'})];
  for(let i=0;i<6;i++){
    const p=items[page*6+i];
    updates.push(manager.control('row'+i).update({
      text:p?(p.id===editId?'● ':'')+(p.enabled?'':'○ ')+
        (p.name||p.label||label(p.body)).slice(0,22):'—',disabled:!p}));
  }
  updates.push(manager.control('prev').update({disabled:page===0}));
  updates.push(manager.control('next').update({disabled:(page+1)*6>=items.length}));
  const chosen=items.find(p=>p.id===editId);
  for(const [key,value] of [['body',chosen?.body||''],['label',chosen?.label||''],
    ['name',chosen?.name||''],['bundleId',data.settings.appBundleId]])
    updates.push(manager.control(key).update({value}));
  updates.push(manager.control('enabled').update({checked:chosen?chosen.enabled:true}));
  updates.push(manager.control('preview').update({text:chosen?
    '按钮预览：'+(chosen.label||label(chosen.body)):'新建提示词'}));
  await Promise.all(updates);editDirty=false;
}
async function openManager(){
  if(manager){await manager.show();return;}
  const panel=await ui.createWindow({id:'codexManager'+(++managerId),kind:'normal',
    title:'Codex 提示词快捷按钮',theme:'system',keyEvents:true,
    position:{mode:'anchor',size:{width:560,height:700},horizontal:'center',vertical:'center',display:'active'},
    content:{html:managerHTML,css:managerCSS}});
  manager=panel;page=0;
  panel.on('close',()=>{if(manager===panel)manager=null;});
  for(let i=0;i<6;i++){
    const index=i;
    panel.control('row'+i).on('click',safe(async()=>{
      if(!(await confirmDiscard()))return;
      editId=data.prompts[page*6+index]?.id||null;await render();
    }));
  }
  panel.control('new').on('click',safe(async()=>{
    if(await confirmDiscard()){editId=null;await render();}
  }));
  for(const [name,step] of [['prev',-1],['next',1]]){
    panel.control(name).on('click',safe(async()=>{
      if(!(await confirmDiscard()))return;
      page+=step;editId=null;await render();
    }));
  }
  for(const key of ['body','label','name','enabled']){
    panel.control(key).on(key==='enabled'?'change':'input',()=>{
      editDirty=true;void message('编辑尚未保存');
    });
  }
  panel.control('discard').on('click',safe(async()=>{
    if(await confirmDiscard()){await render();await message('已放弃编辑');}
  }));
  panel.control('save').on('click',safe(async()=>{
    const [b,l,n,e]=await Promise.all(['body','label','name','enabled']
      .map(key=>panel.control(key).getState()));
    const body=String(b.value||''),shortName=clean(l.value),name=clean(n.value),enabled=e.checked===true;
    if(!body.trim()||body.length>8192||body.includes('\0')||shortName.length>16||name.length>60)
      throw failure('INPUT','正文必填，最长8192字；标签/名称长度受限');
    const id=editId||uid();
    await persist(next=>{
      const row={id,body,label:shortName,name,enabled};
      const i=next.prompts.findIndex(p=>p.id===id);
      if(i>=0)next.prompts[i]=row;
      else{if(next.prompts.length>=80)throw failure('FULL','最多80条');next.prompts.push(row);}
    });
    editId=id;await render();await message('已保存并从文件读回');
  }));
  panel.control('delete').on('click',safe(async()=>{
    if(!editId)return;
    if(!(await Dialog.confirm({title:'确认删除',message:'删除所选提示词？',
      confirmText:'删除',cancelText:'取消',defaultAction:'cancel'})))return;
    const id=editId;
    await persist(next=>{next.prompts=next.prompts.filter(p=>p.id!==id);});
    editId=null;await render();await message('已删除');
  }));
  for(const [name,step] of [['up',-1],['down',1]]){
    panel.control(name).on('click',safe(async()=>{
      if(!editId||!(await confirmDiscard()))return;
      const id=editId;
      await persist(next=>{
        const i=next.prompts.findIndex(p=>p.id===id),j=i+step;
        if(i>=0&&j>=0&&j<next.prompts.length)
          [next.prompts[i],next.prompts[j]]=[next.prompts[j],next.prompts[i]];
      });
      await render();await message('排序已保存');
    }));
  }
  panel.control('appSave').on('click',safe(async()=>{
    const id=clean((await panel.control('bundleId').getState()).value);
    await persist(next=>{next.settings.appBundleId=id;});
    await render();await message('应用标识已保存；必须在真实 Mac 核实');
  }));
  panel.control('reset').on('click',safe(async()=>{
    await persist(next=>{next.settings.offsetX=0;next.settings.offsetY=0;});
    await sync();await message('已重置左侧位置');
  }));
  panel.control('import').on('click',safe(async()=>{
    const path=clean((await panel.control('backup').getState()).value);
    if(!path||!path.endsWith('.json')&& !path.endsWith('.JSON')||
      (!path.startsWith('/')&&!/^[A-Za-z]:[\\/]/.test(path)))
      throw failure('PATH','需要本机 .json 文件绝对路径');
    const parsed=importBackup(await File.readJSON(path,{maxBytes:262144}));
    const exists=new Set(data.prompts.map(p=>p.body.trim()));
    const n=parsed.prompts.filter(p=>!exists.has(p.body.trim())).length;
    const msg='备份'+parsed.prompts.length+'条，预计追加'+n+'条；重复正文跳过。'+
      (parsed.images.length?'\n第'+parsed.images.join('、')+
       '条是图片按钮：只保留文字正文，不能迁移图片资源。':'')+
      '\n确认后才写入，不覆盖现有提示词。';
    if(!(await Dialog.confirm({title:'导入预览',message:msg,
      confirmText:'确认追加',cancelText:'取消',defaultAction:'cancel'})))return;
    await persist(next=>{
      const keys=new Set(next.prompts.map(p=>p.body.trim()));
      for(const p of parsed.prompts){
        if(keys.has(p.body.trim()))continue;
        if(next.prompts.length>=80)throw failure('FULL','追加超过80条，未保存');
        next.prompts.push(p);keys.add(p.body.trim());
      }
    });
    await render();await message('导入已核验并读回');
  }));
  panel.control('export').on('click',safe(async()=>{
    const items=data.prompts.map(p=>({id:p.id,body:p.body,label:p.label||label(p.body),
      name:p.name||label(p.body),labelAuto:!p.label,nameAuto:!p.name,shape:'square',
      enabled:p.enabled,order:p.order,appearance:'text',imageUrl:''}));
    const result=JSON.stringify({format:'opendesk.prompt-shortcuts',version:2,
      exportedAt:new Date().toISOString(),imageSize:'large',items},null,2)+'\n';
    const path=File.join(DIR,'opendesk-prompt-shortcuts-'+Date.now()+'.json');
    File.writeNew(path,result); // never overwrite backups
    console.log('CODEX_SHORTCUT_EXPORT='+path);await message('已导出：'+path);
  }));
  panel.control('close').on('click',safe(async()=>{
    if(await confirmDiscard())await panel.close();
  }));
  panel.control('quit').on('click',safe(async()=>{
    if(!(await confirmDiscard()))return;
    stopping=true;for(const s of subscribers)s.unsubscribe();
    subscribers=[];if(dragTimer)clearTimeout(dragTimer);await ui.closeAll();
  }));
  await render();await panel.show();
}
async function main(){
  const caps=ui.getCapabilities();
  if(!caps.enabled||!caps.available)
    throw failure('NO_UI','请使用 -ui 启动；'+(caps.reason||'UI 不可用'));
  console.log('CODEX_SHORTCUT_DATA='+FILE);
  console.log('CODEX_SHORTCUT_MODE=COPY_ONLY_PENDING_AX_VALIDATION');
  console.log('CODEX_SHORTCUT_TARGET='+JSON.stringify(data.settings.appBundleId?
    {bundleId:data.settings.appBundleId}:{name:'Codex'}));
  await rebuild();
  for(const type of ['window.focused','window.moved','window.resized','window.closed',
    'window.created','display.changed','app.launched','app.terminated'])
    subscribers.push(Events.on(type,()=>{void sync();}));
  if(data.prompts.length===0)await openManager();
  if(bar)await bar.waitUntilClosed();
}
await main();
