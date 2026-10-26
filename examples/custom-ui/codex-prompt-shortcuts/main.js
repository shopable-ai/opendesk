// OpenDesk Codex Desktop Prompt Shortcuts R1.2 (copy-only until live AX qualification)
// From repo root: ./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
'use strict';
const DIR=File.join(File.cwd(),'.runtime','examples','custom-ui','codex-prompt-shortcuts');
const FILE=File.join(DIR,'library.json'),LOCK=File.join(DIR,'library.lock');
const own=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const dup=x=>JSON.parse(JSON.stringify(x));
const failure=(code,message)=>Object.assign(new Error(message),{code});
const clean=s=>String(s||'').trim();
const html=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function label(s,strict=false){
  const text=strict===true?String(s):clean(s);
  let parts,visible;
  if(typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'){
    parts=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),p=>p.segment);
    visible=p=>/[\p{L}\p{N}\p{M}\p{P}\p{S}]/u.test(p);
  }else{
    // Bundled Lodash is NOT a full UAX #29 segmenter (and native astral regexes
    // can lose emoji). Only use its verified BMP base + combining-mark subset.
    const base='[!-~\\u00c0-\\u024f\\u3041-\\u3096\\u30a1-\\u30fa\\u3400-\\u9fff]';
    const supported=new RegExp('^(?:'+base+'[\\u0300-\\u036f]*|\\s)*$');
    visible=p=>new RegExp('^'+base+'[\\u0300-\\u036f]*$').test(p);
    if(typeof _!=='undefined'&&typeof _.toArray==='function'&&supported.test(text)){
      parts=_.toArray(text);
      if(parts.join('')!==text||parts.some(p=>!visible(p)&&!/^\s+$/.test(p)))parts=null;
    }
    if(!parts){
      if(strict===true||(strict==='body'&&!new RegExp(base).test(text)))
        throw failure('UNSUPPORTED_GRAPHEME','当前 Runtime 无法可靠核验此 Unicode 字素');
      return '提示';
    }
  }
  if(strict===true){
    if(parts.length<1||parts.length>2||!parts.every(visible))
      throw failure('INVALID_LABEL','短标签必须为 1–2 个可见字素');
    return text;
  }
  const result=parts.filter(visible).slice(0,2).join('');
  if(!result&&strict)throw failure('INVALID_BACKUP','提示词正文无可见字符');
  return result||'提示';
}
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
  if(new TextEncoder().encode(JSON.stringify(value)).length>262144)
    throw failure('INVALID_BACKUP','备份超过 256 KiB');
  if((value.version===1&&Object.prototype.hasOwnProperty.call(value,'imageSize'))||
     (value.version===2&&value.imageSize!==undefined&&
      !['compact','standard','large'].includes(value.imageSize)))
    throw failure('INVALID_BACKUP','备份图片尺寸无效');
  const fields=['id','body','label','name','labelAuto','nameAuto','shape','enabled','order'];
  if(value.version===2)fields.push('appearance','imageUrl');
  const orderSet=new Set(),images=[];
  const prompts=value.items.map((p,i)=>{
    if(!own(p)||Object.keys(p).some(key=>!fields.includes(key))||
       typeof p.body!=='string'||!p.body.trim()||p.body.length>8192||p.body.includes('\0')||
       (p.label!==undefined&&typeof p.label!=='string')||
       (p.name!==undefined&&(typeof p.name!=='string'||p.name.length>60))||
       ['enabled','labelAuto','nameAuto'].some(key=>p[key]!==undefined&&typeof p[key]!=='boolean')||
       (p.shape!==undefined&&!['square','round'].includes(p.shape))||
       (p.appearance!==undefined&&!['text','image'].includes(p.appearance))||
       (p.imageUrl!==undefined&&typeof p.imageUrl!=='string'))
      throw failure('INVALID_BACKUP','备份第'+(i+1)+'条无效');
    if(clean(p.label))label(clean(p.label),true); // Validate even an ignored auto value.
    label(p.body,'body');
    const order=p.order===undefined?i:p.order;
    if(!Number.isSafeInteger(order)||order<0||orderSet.has(order))
      throw failure('INVALID_BACKUP','备份排序无效/重复');
    orderSet.add(order);
    if(p.imageUrl!==undefined&&p.imageUrl!==''){
      if(p.imageUrl.length>512||/[\u0000-\u001f\u007f]/.test(p.imageUrl))
        throw failure('INVALID_BACKUP','图片 URL 无效');
      let url;try{url=new URL(p.imageUrl.trim());}catch(e){
        throw failure('INVALID_BACKUP','图片 URL 无效');
      }
      if(url.protocol!=='https:'||!url.hostname||url.origin==='null'||
         url.username||url.password||/\.svg$/i.test(url.pathname))
        throw failure('INVALID_BACKUP','图片仅支持无账号密码的 HTTPS 非 SVG URL');
    }
    if(p.appearance==='image'){
      if(!clean(p.imageUrl))throw failure('INVALID_BACKUP','图片按钮缺少 HTTPS 图片 URL');
      images.push(i+1); // Caller must disclose every image-to-text downgrade.
    }
    const short=p.labelAuto===true?'':clean(p.label);
    if(short.length>16)throw failure('INVALID_BACKUP','标签超过本地存储上限，未裁切');
    return {id:uid(),body:p.body,label:short,
      name:p.nameAuto===true?'':clean(p.name),enabled:p.enabled!==false,order};
  });
  return {prompts:prompts.sort((a,b)=>a.order-b.order),images};
}
function exportBackup(doc){
  const saved=verified(doc);
  if(!saved.prompts.length)throw failure('INVALID_BACKUP','空备份不能用于浏览器导入');
  const items=saved.prompts.map((p,order)=>{
    const fallback=label(p.body,'body');
    const short=p.label?label(p.label,true):fallback;
    if(p.name&&!p.name.trim())throw failure('INVALID_BACKUP','显示名称不能仅含空白');
    return {id:p.id,body:p.body,label:short,name:p.name||fallback,
      labelAuto:!p.label,nameAuto:!p.name,shape:'square',enabled:p.enabled,order,
      appearance:'text',imageUrl:''};
  });
  const json=JSON.stringify({format:'opendesk.prompt-shortcuts',version:2,
    imageSize:'large',items},null,2)+'\n';
  if(new TextEncoder().encode(json).length>262144)
    throw failure('INVALID_BACKUP','导出超过 256 KiB，未生成不完整备份');
  return json;
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
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
const managerCSS=':root{color-scheme:light dark}*{box-sizing:border-box}'+
  'html,body{margin:0;height:100%;overflow-y:auto;background:#f8fafc;color:#1e293b;font:13px -apple-system,sans-serif}'+
  'main{padding:12px 20px;display:grid;gap:6px}header{display:flex;justify-content:space-between;align-items:center}'+
  '#heading{font-size:17px;margin:0}.muted{color:#64748b}#listRows{display:grid;grid-template-columns:1fr 1fr;gap:6px}'+
  'label{display:block;font-weight:600;margin-bottom:2px}input,textarea{width:100%;padding:6px;border-radius:8px;'+
  'border:1px solid #cbd5e1;background:#fff;color:inherit;font:inherit}textarea{height:70px}'+
  '#metaFields{display:grid;grid-template-columns:1fr 1fr;gap:10px}#enabled{width:18px;height:18px}'+
  '.actions{display:flex;gap:6px;flex-wrap:wrap}button{padding:5px;border:1px solid #cbd5e1;'+
  'border-radius:8px;background:#fff;color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.4}'+
  '#save{background:#2563eb;color:white;border-color:#2563eb}#status{min-height:25px;color:#64748b}'+
  '@media(prefers-color-scheme:dark){html,body{background:#232a34;color:#f1f5f9}'+
  'input,textarea,button{background:#323d4b;border-color:#4b5c70}.muted,#status{color:#b1c0d0}}';
const managerHTML='<!doctype html><html><head><meta charset="utf-8"></head><body><main>'+
  '<header><strong id="heading">Codex · 提示词快捷按钮</strong><span id="count" class="muted"></span></header>'+
  '<span class="muted">建议在浏览器版编辑后导出 JSON，在下方导入；快捷栏点击只复制。</span>'+
  '<div id="listRows">'+Array.from({length:6},(_,i)=>'<button id="row'+i+'">—</button>').join('')+'</div>'+
  '<div class="actions"><button id="prev">上一页</button><button id="next">下一页</button>'+
  '<button id="new">＋ 新建</button><button id="up">上移</button><button id="down">下移</button></div>'+
  '<section><label for="body">提示词正文 *</label><textarea id="body" aria-label="提示词正文"></textarea></section>'+
  '<section id="metaFields"><section><label for="label">短标签（留空自动）</label><input id="label" aria-label="短标签" type="text"></section>'+
  '<section><label for="name">显示名称</label><input id="name" aria-label="显示名称" type="text"></section></section>'+
  '<section><label for="enabled">启用提示词</label><input id="enabled" aria-label="启用提示词" type="checkbox" checked></section>'+
  '<span id="preview" class="muted"></span><div class="actions"><button id="save">保存</button>'+
  '<button id="delete">删除</button><button id="discard">放弃修改</button></div>'+
  '<section><label for="bundleId">Codex Bundle ID（需本机核实，可留空）</label>'+
  '<input id="bundleId" aria-label="Codex Bundle ID" type="text" placeholder="留空使用本机已观察的 Codex 标识"></section>'+
  '<div class="actions"><button id="appSave">保存应用标识</button><button id="reset">重置位置</button></div>'+
  '<section><label for="backup">浏览器 JSON 备份文件绝对路径</label>'+
  '<input id="backup" aria-label="浏览器 JSON 备份路径" type="text" placeholder="/Users/.../opendesk-prompt-shortcuts.json"></section>'+
  '<div class="actions"><button id="import">预览并追加导入</button><button id="export">导出 JSON</button></div>'+
  '<span id="status" class="muted">准备就绪</span><div class="actions"><button id="reconcile">核对磁盘版本</button><button id="close">关闭管理</button>'+
  '<button id="quit">退出</button></div></main></body></html>';
File.ensureDir(DIR);
let data=verified(await File.readJSON(FILE,{defaultValue:empty()}));
let baseline=JSON.stringify(data),bar=null,manager=null,originalWin=null;
let barId=0,managerId=0,expectedPosition=null,dragTimer=null,writing=false,lastProgrammaticMove=0;
let editId=null,editDirty=false,page=0,stopping=false,subscribers=[];
let barPage=0,barItems=[],barUpdating=false,barReady=false,barRefresh=Promise.resolve();
let barVersion=0,dragVersion=0;
let draft=null,resolution=null,editVersion=0;
let openingManager=null,recoverManager=false;
function logError(e){console.error('CODEX_SHORTCUT_ERROR='+JSON.stringify({
  code:e?.code||'ERROR',message:String(e?.message||e)}));}
async function toast(s,level='info'){
  try{await ui.toast({message:String(s).slice(0,900),level,timeoutMs:2600});}catch(e){logError(e);}
}
const safe=fn=>async()=>{try{await fn();}catch(e){logError(e);await toast('操作未完成：'+String(e.message||e),'error');}};
async function persist(change){
  if(writing)throw failure('BUSY','上次保存尚未完成');
  if(resolution)throw failure('RECONCILE_REQUIRED','请先点击“核对磁盘版本”，禁止重复提交');
  writing=true;let locked=false,committed=false;
  let normalized=null;
  const nonce=Date.now().toString(36)+'-'+Math.random().toString(36);
  try{
    File.writeNew(LOCK,nonce);locked=true; // exclusive cross-instance lock
    const disk=verified(await File.readJSON(FILE,{defaultValue:empty()}));
    if(JSON.stringify(disk)!==baseline){
      resolution={kind:'STALE'};
      throw failure('STALE','其他实例已修改数据，请核对新版本后再操作');
    }
    const next=dup(disk);change(next);next.revision++;
    normalized=verified(next);
    await File.writeJSON(FILE,normalized,{maxBytes:4194304});
    committed=true;
    const checked=verified(await File.readJSON(FILE));
    if(JSON.stringify(checked)!==JSON.stringify(normalized))
      throw failure('UNCERTAIN','读回不一致');
    data=checked;baseline=JSON.stringify(checked);
  }catch(e){
    if(committed||e.committed===true){
      resolution={kind:'UNCERTAIN',expected:normalized};
      throw failure('UNCERTAIN','可能已经写入；请点击“核对磁盘版本”，不可重复盲试');
    }
    throw e;
  }finally{
    if(locked)try{if(File.read(LOCK)===nonce)File.remove(LOCK);
      else throw failure('LOCK_CHANGED','锁所有者改变，保留锁');}catch(e){
      resolution=resolution||{kind:'LOCK_CLEANUP'};logError(e);
    }
    writing=false;
  }
  if(resolution)throw failure('LOCK_CLEANUP','数据已读回，但锁未能安全释放；保留编辑，请核对锁与磁盘');
  await rebuild();
}
async function reconcile(){
  if(writing)throw failure('BUSY','保存尚未完成');
  if(!(await confirmDiscard()))return;
  // An existing lock can belong to a live writer. Age alone never grants ownership.
  if(File.exists(LOCK))throw failure('LOCKED','锁仍存在；核对实例退出后按 README 恢复，不能按年龄删除');
  const disk=verified(await File.readJSON(FILE,{defaultValue:empty()}));
  if(resolution?.kind==='UNCERTAIN'&&JSON.stringify(disk)!==JSON.stringify(resolution.expected)&&
      JSON.stringify(disk)!==baseline)
    throw failure('UNCERTAIN','磁盘既非原版本也非待确认版本，保留草稿并人工核对');
  data=disk;baseline=JSON.stringify(disk);resolution=null;draft=null;editDirty=false;
  if(editId&&!data.prompts.some(p=>p.id===editId))editId=null;
  await rebuild();await render();await message('已重新读取磁盘；请核对当前内容再编辑');
}
function appGroup(){
  if(data.settings.appBundleId)return App.get({bundleId:data.settings.appBundleId});
  // Observed on this Mac: /Applications/ChatGPT.app, com.openai.codex.
  // Revalidate against the Runtime snapshot; do not guess from a window title/name.
  const observed=App.list().filter(app=>app.bundleId==='com.openai.codex');
  return observed.length?App.get({bundleId:'com.openai.codex'}):null;
}
function isCodexPid(group,pid){return group&&Number.isInteger(pid)&&
  ((Array.isArray(group.pids)&&group.pids.includes(pid))||
    (Array.isArray(group.instances)&&group.instances.some(p=>p.pid===pid)));}
async function codexWindow(){
  const group=appGroup();if(!group)return null;
  const active=await window.getActiveWindow();
  if(active&&active.id&&isCodexPid(group,active.pid)){
    const exact=await window.current(active);
    if(exact.id!==active.id||exact.pid!==active.pid||exact.handle!==active.handle||
        !isCodexPid(appGroup(),exact.pid)||exact.isForeground!==true)return null;
    originalWin=exact;return exact;
  }
  // Only this exact visible toolbar can temporarily own focus, never another
  // window sharing the Host PID (including the manager and transient toasts).
  for(const panel of [bar]){
    if(!panel||!active||!originalWin)continue;
    const state=await panel.getState();
    if(state.visible&&state.onScreen&&state.hostPid&&active.pid===state.hostPid&&
        state.nativeWindowId>0&&active.handle===state.nativeWindowId){
      const exact=await window.current(originalWin);
      if(exact.id===originalWin.id&&exact.pid===originalWin.pid&&
          exact.handle===originalWin.handle&&isCodexPid(appGroup(),exact.pid)){
        originalWin=exact;return exact;
      }
    }
  }
  return null;
}
let syncing=false,pendingSync=false,failedPositionKey=null;
async function synchronize(){
  if(!bar||stopping||dragTimer||barUpdating)return;
  if(!barReady){await bar.hide();return;}
  const panel=bar,epoch=barId,version=barVersion;
  const current=()=>bar===panel&&barId===epoch&&version===barVersion&&
    barReady&&!barUpdating&&!stopping;
  let positionKey=null;
  let win=null;try{win=await codexWindow();}catch(e){logError(e);}
  try{
    if(!current())return;
    if(!win){
      const state=await panel.getState();if(!current())return;
      if(state.visible)await panel.hide();failedPositionKey=null;return;
    }
    const state=await panel.getState(),before=state.bounds;
    let pos=frame(win,before.height,data.settings,Screen.getDisplays());
    positionKey=JSON.stringify([epoch,win.id,win.pid,win.handle,win.x,win.y,win.width,win.height,pos]);
    if(positionKey===failedPositionKey)return;
    if(!current())return;
    if(Math.abs(before.x-pos.x)>1||Math.abs(before.y-pos.y)>1){
      if(dragTimer){clearTimeout(dragTimer);dragTimer=null;}
      expectedPosition=pos;lastProgrammaticMove=Date.now();
      await panel.setPosition(pos.x,pos.y);
    }
    if(!current())return;
    const fresh=await codexWindow();
    if(!current())return;
    if(!fresh||['id','pid','handle','x','y','width','height'].some(k=>fresh[k]!==win[k])){
      await panel.hide();return;
    }
    if(!state.visible){
      await panel.show();
      if(!current()){
        if(bar===panel&&!barReady)await panel.hide();
        return;
      }
      // WindowServer can expose an inset frame during the native show animation.
      // Require two matching readbacks, bounded to 600ms, before trusting it.
      let stable=0,previous=null;
      for(let attempt=0;attempt<6&&stable<2;attempt++){
        await System.delay(100);
        if(!current())return;
        const shown=await panel.getState();
        const same=previous&&['x','y','width','height'].every(k=>Math.abs(shown.bounds[k]-previous[k])<=1);
        stable=shown.visible&&shown.onScreen&&same&&Math.abs(shown.bounds.x-pos.x)<=1&&
          Math.abs(shown.bounds.y-pos.y)<=1?stable+1:0;
        previous=shown.bounds;
      }
      if(stable<2)throw failure('POSITION_UNCONFIRMED','原生窗口显示位置未稳定，已隐藏');
      if(!current())return;
      const shownTarget=await codexWindow();
      if(!current())return;
      if(!shownTarget||['id','pid','handle','x','y','width','height'].some(k=>shownTarget[k]!==win[k])){
        await panel.hide();return;
      }
      const settled=await panel.getState();
      if(!current())return;
      const centered=frame(win,settled.bounds.height,data.settings,Screen.getDisplays());
      if(Math.abs(centered.x-pos.x)>1||Math.abs(centered.y-pos.y)>1){
        pos=centered;expectedPosition=pos;lastProgrammaticMove=Date.now();
        await panel.setPosition(pos.x,pos.y);
        if(!current())return;
      }
    }
    const actual=await panel.getState();
    if(!current())return;
    const confirmed=await codexWindow();
    if(!current())return;
    if(!confirmed||['id','pid','handle','x','y','width','height'].some(k=>confirmed[k]!==win[k])){
      await panel.hide();return;
    }
    if(!actual.visible||!actual.onScreen||Math.abs(actual.bounds.x-pos.x)>1||Math.abs(actual.bounds.y-pos.y)>1)
      throw failure('POSITION_UNCONFIRMED','快捷栏实际位置未核实，已隐藏');
    failedPositionKey=null;
  }catch(e){
    if(!current())return;
    failedPositionKey=positionKey;
    try{await panel.hide();}catch(hideError){logError(hideError);}
    logError(e);
  }
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
  const target=originalWin,version=++dragVersion;
  dragTimer=setTimeout(()=>{void safe(async()=>{
    dragTimer=null;
    const current=()=>version===dragVersion&&epoch===barId&&!stopping&&
      originalWin?.id===target.id&&originalWin?.pid===target.pid;
    if(!current())return;
    const win=await window.current(target);
    if(!current()||!isCodexPid(appGroup(),win.pid)||win.handle!==target.handle||
       win.x!==target.x||win.y!==target.y||win.width!==target.width||win.height!==target.height)return;
    const state=await bar.getState();
    if(!current())return;
    const base=frame(win,state.bounds.height,{...data.settings,offsetX:0,offsetY:0},Screen.getDisplays());
    await persist(next=>{if(!current())throw failure('CANCELED_DRAG','旧拖动已取消');
      next.settings.offsetX=Math.round(b.x-base.x);
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
async function refreshBar(){
  if(stopping)return;
  barUpdating=true;barReady=false;barVersion++;
  let panel=null,epoch=0;
  const current=()=>!stopping&&bar===panel&&barId===epoch;
  try{
    if(!bar){
      const epoch=++barId;
      // Same native toolbar as examples/custom-ui/quick-replies; its host owns
      // geometry, drag handling and button rendering. Vertical capacity is five.
      bar=new FloatingWindow({title:'Codex 提示词',orientation:'vertical',theme:'dark',
        alwaysOnTop:true,draggable:true,position:{mode:'absolute',x:24,y:110}});
      bar.onError(logError);
      for(let i=0;i<3;i++)bar.addButton('p'+i,'暂无提示词',{text:'空'},safe(async()=>{
        if(epoch===barId&&!barUpdating&&barReady&&barItems[i])await copy(barItems[i].id);
      }));
      bar.addButton('next','下一组',{text:'下一'},safe(async()=>{
        if(epoch!==barId||barUpdating)return;
        barPage++;await rebuild();
      }));
      bar.addButton('settings','管理提示词与导入',{text:'管理'},safe(openManager));
      bar.on('move',e=>{void drag(e,epoch);});
      bar.on('close',safe(async()=>{
        if(stopping||epoch!==barId)return;
        bar=null;barId++;barReady=false;barItems=[];
        // A native close must not leave Events trying to reuse a terminal handle.
        // Keep the existing manager as the recovery/explicit-exit entry.
        await openManager();await message('快捷栏已关闭；保存可恢复，或点击退出');
      }));
    }
    panel=bar;epoch=barId;
    const items=data.prompts.filter(p=>p.enabled),pages=Math.max(1,Math.ceil(items.length/3));
    barPage=barPage%pages;
    const shown=items.slice(barPage*3,barPage*3+3);
    for(let i=0;i<3;i++){
      const p=shown[i],short=p?label(p.label||p.body):null;
      await panel.updateButton('p'+i,{disabled:!p,active:false,error:null,
        label:p?Array.from(Array.from(p.name||short).slice(0,24).join('')+'（仅复制） · '+p.body).slice(0,60).join(''):
          '暂无提示词，请导入浏览器 JSON',
        icon:{text:p&&Array.from(short).length<=4?short:(p?String(barPage*3+i+1):'空')},badge:null});
      if(!current())return;
    }
    await panel.updateButton('next',{disabled:pages===1,label:'下一组（'+(barPage+1)+'/'+pages+'）',
      icon:{text:'下一'},badge:null});
    if(!current())return;
    barItems=shown;barReady=true;failedPositionKey=null;
  }catch(e){
    if(panel&&!current())return; // Native close invalidates an in-flight refresh.
    if(panel){
      try{await panel.hide();}catch(hideError){
        if(!current())return;
        logError(hideError); // Keep the original update error as the failure.
      }
      if(!current())return;
    }
    throw e;
  }finally{barUpdating=false;}
  await sync();
}
function rebuild(){
  const next=barRefresh.then(refreshBar);
  barRefresh=next.catch(()=>{});
  return next;
}
async function confirmDiscard(){
  if(writing)throw failure('BUSY','保存尚未完成，请稍候');
  return !editDirty || Dialog.confirm({title:'未保存修改',
    message:'放弃本次未保存的编辑？',confirmText:'放弃',cancelText:'继续编辑',defaultAction:'cancel'});
}
async function message(s){if(manager)await manager.control('status').update({text:String(s).slice(0,250)});}
async function render(preserveDraft=false){
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
  if(!preserveDraft||!draft)draft={body:chosen?.body||'',label:chosen?.label||'',
    name:chosen?.name||'',enabled:chosen?chosen.enabled:true,
    bundleId:data.settings.appBundleId,backup:draft?.backup||''};
  for(const [key,value] of Object.entries(draft).filter(([key])=>key!=='enabled'))
    updates.push(manager.control(key).update({value}));
  updates.push(manager.control('enabled').update({checked:draft.enabled}));
  updates.push(manager.control('preview').update({text:'按钮预览：'+(draft.label||label(draft.body))}));
  await Promise.all(updates);if(!preserveDraft)editDirty=false;
}
async function openManager(){
  if(stopping)return;
  if(openingManager)return openingManager;
  if(manager){await manager.show();return;}
  const pending=createManager();openingManager=pending;
  try{await pending;}finally{
    openingManager=null;
    if(recoverManager){
      recoverManager=false;
      if(!manager&&editDirty&&!stopping){
        await openManager();await message('原生窗口已关闭；未保存编辑已恢复，请保存或明确放弃');
      }
    }
  }
}
async function createManager(){
  const panel=await ui.createWindow({id:'codexManager'+(++managerId),kind:'normal',
    title:'Codex 提示词快捷按钮',theme:'system',keyEvents:true,
    position:{mode:'anchor',size:{width:560,height:740},horizontal:'center',vertical:'center',display:'active'},
    content:{html:managerHTML,css:managerCSS}});
  manager=panel;page=0;
  panel.on('close',safe(async()=>{
    if(manager!==panel)return;manager=null;
    if(editDirty&&!stopping){
      // Closing during first show must not await that same creation promise.
      if(openingManager){recoverManager=true;return;}
      await openManager();await message('原生窗口已关闭；未保存编辑已恢复，请保存或明确放弃');
    }else if(!bar&&!stopping){
      stopping=true;for(const s of subscribers)s.unsubscribe();subscribers=[];
      await ui.closeAll();
    }
  }));
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
  for(const key of ['body','label','name','enabled','bundleId','backup']){
    panel.control(key).on(key==='enabled'?'change':'input',event=>{
      if(!draft)return;
      draft[key]=key==='enabled'?event.checked===true:String(event.value||'');
      if(key!=='backup'){editDirty=true;editVersion++;}
      void message('编辑尚未保存');
      if(['body','label','name'].includes(key))void panel.control('preview').update({
        text:'按钮预览：'+(draft.label||label(draft.body))});
    });
  }
  panel.control('discard').on('click',safe(async()=>{
    if(await confirmDiscard()){await render();await message('已放弃编辑');}
  }));
  panel.control('save').on('click',safe(async()=>{
    const version=editVersion;
    const [b,l,n,e]=await Promise.all(['body','label','name','enabled']
      .map(key=>panel.control(key).getState()));
    const body=String(b.value||''),shortName=clean(l.value),name=clean(n.value),enabled=e.checked===true;
    if(!body.trim()||body.length>8192||body.includes('\0')||shortName.length>16||name.length>60)
      throw failure('INPUT','正文必填，最长8192字；标签/名称长度受限');
    const id=editId||uid();editId=id; // keep identity stable after a failed/unknown save
    await persist(next=>{
      const row={id,body,label:shortName,name,enabled};
      const i=next.prompts.findIndex(p=>p.id===id);
      if(i>=0)next.prompts[i]=row;
      else{if(next.prompts.length>=80)throw failure('FULL','最多80条');next.prompts.push(row);}
    });
    await render(editVersion!==version);await message('已保存并从文件读回'+
      (editVersion!==version?'；保存期间的新编辑仍未保存':''));
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
    await render(true);await message('应用标识已保存；提示词编辑仍保留');
  }));
  panel.control('reset').on('click',safe(async()=>{
    dragVersion++;if(dragTimer){clearTimeout(dragTimer);dragTimer=null;}
    await persist(next=>{next.settings.offsetX=0;next.settings.offsetY=0;});
    await sync();await message('已重置左侧位置');
  }));
  panel.control('import').on('click',safe(async()=>{
    if(!(await confirmDiscard()))return;
    const path=clean((await panel.control('backup').getState()).value);
    if(!path||!path.endsWith('.json')&& !path.endsWith('.JSON')||
      (!path.startsWith('/')&&!/^[A-Za-z]:[\\/]/.test(path)))
      throw failure('PATH','需要本机 .json 文件绝对路径');
    const parsed=importBackup(await File.readJSON(path,{maxBytes:262144}));
    const exists=new Set(data.prompts.map(p=>p.body.trim()));
    const n=parsed.prompts.filter(p=>{const key=p.body.trim();
      if(exists.has(key))return false;exists.add(key);return true;}).length;
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
    if(writing||resolution)throw failure('RECONCILE_REQUIRED','保存或核对尚未完成，不能导出旧快照');
    const disk=verified(await File.readJSON(FILE,{defaultValue:empty()}));
    if(writing||resolution)throw failure('RECONCILE_REQUIRED','保存或核对尚未完成，不能导出旧快照');
    if(JSON.stringify(disk)!==baseline){
      resolution={kind:'STALE'};
      throw failure('STALE','其他实例已修改数据，请先核对磁盘版本再导出');
    }
    const result=exportBackup(disk);
    const path=File.join(DIR,'opendesk-prompt-shortcuts-'+Date.now()+'.json');
    File.writeNew(path,result); // never overwrite backups
    console.log('CODEX_SHORTCUT_EXPORT='+path);await message('已导出：'+path);
  }));
  panel.control('close').on('click',safe(async()=>{
    if(await confirmDiscard()){editDirty=false;draft=null;await panel.close();}
  }));
  panel.control('reconcile').on('click',safe(reconcile));
  panel.control('quit').on('click',safe(async()=>{
    if(!(await confirmDiscard()))return;
    stopping=true;for(const s of subscribers)s.unsubscribe();
    subscribers=[];if(dragTimer)clearTimeout(dragTimer);
    if(bar)await bar.close();await ui.closeAll();
  }));
  await render(editDirty&&!!draft);await panel.show();
}
async function main(){
  const caps=ui.getCapabilities();
  if(!caps.enabled||!caps.available)
    throw failure('NO_UI','请使用 -ui 启动；'+(caps.reason||'UI 不可用'));
  console.log('CODEX_SHORTCUT_DATA='+FILE);
  console.log('CODEX_SHORTCUT_MODE=COPY_ONLY_PENDING_AX_VALIDATION');
  console.log('CODEX_SHORTCUT_TARGET='+JSON.stringify(data.settings.appBundleId?
    {bundleId:data.settings.appBundleId}:{bundleId:'com.openai.codex',requiresAppSnapshot:true}));
  await rebuild();
  for(const type of ['window.focused','window.moved','window.resized','window.closed',
    'window.created','display.changed','app.launched','app.terminated'])
    subscribers.push(Events.on(type,()=>{void sync();}));
  // A background/missing Codex must not leave the user with no visible entry.
  if(data.prompts.length===0||!originalWin)await openManager();
  // Events.on retains the execution, including before the lazy native toolbar's
  // first show. waitUntilClosed() is invalid until that first show has occurred.
}
await main();
