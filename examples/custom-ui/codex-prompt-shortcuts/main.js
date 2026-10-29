// OpenDesk Codex Desktop Prompt Shortcuts. Copy is independent of target focus.
// From repo root: ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
'use strict';
const own=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const dup=x=>JSON.parse(JSON.stringify(x));
const failure=(code,message)=>Object.assign(new Error(message),{code});
const clean=s=>String(s||'').trim();
// Match the formal Browser duplicate key while preserving the stored body bytes.
const bodyKey=s=>s.normalize('NFC').replace(/\r\n?/g,'\n').trim();
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
  let positions;
  if(s.positions!==undefined){
    if(!own(s.positions)||Object.keys(s.positions).length>64)
      throw failure('INVALID_SETTINGS','应用位置设置无效');
    positions={};
    for(const [key,value] of Object.entries(s.positions)){
      let identity;try{identity=JSON.parse(key);}catch(_){throw failure('INVALID_SETTINGS','应用位置身份无效');}
      if(!Array.isArray(identity)||identity.length!==3||identity.some(v=>typeof v!=='string'||!v||v.length>4096)||
          !['path','bundleId'].includes(identity[1])||!own(value)||
          Object.keys(value).length!==2||!Number.isInteger(value.offsetX)||!Number.isInteger(value.offsetY)||
          Math.abs(value.offsetX)>10000||Math.abs(value.offsetY)>10000)
        throw failure('INVALID_SETTINGS','应用位置设置无效');
      positions[key]={offsetX:value.offsetX,offsetY:value.offsetY};
    }
  }
  return {schemaVersion:1,revision:x.revision,prompts,
    settings:{appBundleId:s.appBundleId,offsetX:s.offsetX,offsetY:s.offsetY,...(positions?{positions}:{})}};
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
function frame(win,h,offset,displays,profile=originalTarget?.profile||targets().getProfile('codex'),composer=null,clip=true){
  let relative=profile?.contentArea(win);
  if(!relative||!['x','y','width','height'].every(k=>Number.isFinite(relative[k]))||
      relative.x<0||relative.y<0||relative.width<=0||relative.height<=0||
      relative.x+relative.width>win.width||relative.y+relative.height>win.height)
    throw failure('TARGET_AREA_UNAVAILABLE','目标内容区域无法核验，已隐藏快捷栏');
  if(composer){
    if(composer.source!=='accessibility'||composer.composerMeasured!==true||
        !['x','y','width','height'].every(k=>Number.isFinite(composer[k]))||
        composer.x<0||composer.y<0||composer.width<=0||composer.height<=0||
        composer.x+composer.width>win.width||composer.y+composer.height>win.height)
      throw failure('COMPOSER_UNAVAILABLE','输入区边界无法核验，已隐藏快捷栏');
    // A measured composer may reduce the configured placement area. The
    // default sidebar and margins remain layout rules, not AX measurements.
    const bottom=relative.y+relative.height;
    relative={...relative,height:Math.min(bottom,composer.y-12)-relative.y};
  }
  const area={...relative,x:win.x+relative.x,y:win.y+relative.y};
  if(area.width<60||area.height<h)throw failure('TARGET_TOO_SMALL','窗口太小，无法安全避让输入区');
  const x=area.x+offset.offsetX;
  const y=area.y+(area.height-h)/2+offset.offsetY;
  let best=null,score=-1,hasDisplay=false;
  for(const d of displays){
    const b=d.bounds||d;
    if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)continue;
    hasDisplay=true;
    // Select from the actual usable content, not the sidebar or other parts
    // of the target window. Each candidate must hold the whole toolbar.
    const left=Math.max(area.x,b.x+8),top=Math.max(area.y,b.y+8);
    const right=Math.min(area.x+area.width,b.x+b.width-8);
    const bottom=Math.min(area.y+area.height,b.y+b.height-8);
    if(right-left<60||bottom-top<h)continue;
    const visible=(right-left)*(bottom-top);
    if(visible>score){score=visible;best={left,top,right,bottom};}
  }
  if(!hasDisplay)throw failure('DISPLAY_UNAVAILABLE','显示器边界不可用，已隐藏快捷栏');
  if(!best)throw failure('TARGET_TOO_SMALL','可见内容区域不足，已隐藏快捷栏');
  if(!clip)return {x,y}; // Offset persistence uses the same pre-clamp anchor.
  const {left,top,right,bottom}=best;
  return {x:Math.round(clamp(x,left,right-60)),y:Math.round(clamp(y,top,bottom-h))};
}
const managerCSS=':root{color-scheme:dark}*{box-sizing:border-box}'+
  'html,body{margin:0;height:100%;overflow:auto;background:#202226;color:#eceef2;font:400 13px -apple-system,sans-serif}'+
  'main{padding:14px 16px;display:grid;gap:10px}header,.footer{display:flex;justify-content:space-between;align-items:center;gap:12px}'+
  '#heading{font-size:18px;margin:0}.muted{color:#a4a8b2;font-size:12px;line-height:1.5}'+
  '.workspace{display:grid;grid-template-columns:180px minmax(0,1fr);gap:14px}'+
  '.sidebar{display:flex;flex-direction:column;padding:8px;border:1px solid #34373e;border-radius:9px;background:#25272c;min-width:0}'+
  '.card{padding:10px 0 0;border-top:1px solid #383b42;min-width:0}'+
  '#listRows{display:grid;align-content:start;gap:4px;margin-bottom:12px;flex:1}'+
  '#listRows button{min-height:30px;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-color:transparent;background:transparent}'+
  '#listRows button:hover{background:#34373e}#listRows button:disabled{display:none}'+
  '#listRows button[aria-pressed="true"]{background:#363044;border-left:3px solid #a392ff;padding-left:7px}'+
  '#listRows button:first-child:disabled{display:block;color:#a4a8b2;opacity:1;cursor:default}'+
  '.editor{display:grid;align-content:start;gap:8px;min-width:0}label{display:block;font-weight:500;margin-bottom:4px}'+
  'input,textarea{width:100%;padding:7px 9px;border-radius:6px;border:1px solid #45484f;background:#292c31;color:inherit;font:inherit}'+
  'textarea{height:132px;line-height:1.5;resize:vertical}'+
  '#metaFields,.advanced{display:grid;grid-template-columns:1fr 1fr;gap:12px}'+
  '.check{display:flex;align-items:center;gap:8px}.check label{margin:0}#enabled{width:16px;height:16px;margin:0}'+
  '.actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}button{padding:6px 9px;border:1px solid #45484f;border-radius:6px;'+
  'background:#303339;color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.35}button:hover{background:#3a3e46}'+
  'input:focus,textarea:focus,button:focus-visible{outline:2px solid #a392ff;outline-offset:1px}'+
  '#save{background:#7760d9;color:#fff;border-color:#917be8}#delete{color:#e7a0a7}.card .actions{margin-top:8px}'+
  '.advanced label{color:#b7bbc5;font-size:12px;font-weight:400}.advanced button,.footer button{font-size:12px;font-weight:400;color:#c4c8d0}.advanced button{background:#292c31}'+
  '.sidebar .actions{gap:4px}.sidebar .actions button{padding:6px 7px}.sidebar .actions+.actions{margin-top:6px}'+
  '.footer{padding-top:4px;align-items:center;flex-wrap:wrap}#status{flex:1;min-width:120px;overflow-wrap:anywhere}'+
  '#quit{background:transparent;border-color:transparent;color:#a4a8b2}'+
  '@media(max-width:680px){.workspace{grid-template-columns:160px minmax(0,1fr)}.advanced{grid-template-columns:1fr}}';
const managerHTML='<!doctype html><html><head><meta charset="utf-8"></head><body><main>'+
  '<header><strong id="heading">OpenDesk 提示词</strong><span id="count" class="muted"></span></header>'+
  '<span class="muted">提示词快捷栏 · 追加到当前目标草稿，不发送</span>'+
  '<div class="actions"><button id="calibrate">检查写入条件</button><button id="copyMode">仅复制</button>'+
  '<span id="deliveryMode" class="muted">点击检查追加条件 · 失败复制全文</span></div>'+
  '<div class="workspace"><section class="sidebar"><div id="listRows">'+
  Array.from({length:6},(_,i)=>'<button id="row'+i+'">—</button>').join('')+'</div>'+
  '<div class="actions"><button id="prev">上一页</button><button id="next">下一页</button></div>'+
  '<div class="actions"><button id="new">＋ 新建</button><button id="up">上移</button><button id="down">下移</button></div></section>'+
  '<section class="editor"><section><label for="body">提示词正文</label><textarea id="body" aria-label="提示词正文"></textarea></section>'+
  '<div id="metaFields"><section><label for="label">短标签（留空自动）</label><input id="label" aria-label="短标签" type="text"></section>'+
  '<section><label for="name">显示名称</label><input id="name" aria-label="显示名称" type="text"></section></div>'+
  '<section class="check"><input id="enabled" aria-label="启用提示词" type="checkbox" checked><label for="enabled">启用提示词</label>'+
  '<span id="preview" class="muted"></span></section>'+
  '<div class="actions"><button id="save">保存</button><button id="delete">删除</button><button id="discard">放弃修改</button>'+
  '<button id="copySelected">复制所选正文</button></div></section></div>'+
  '<div class="advanced"><section class="card"><label for="bundleId">目标应用标识（可留空）</label>'+
  '<input id="bundleId" aria-label="目标应用 Bundle ID" type="text" placeholder="由目标配置指定时无需填写">'+
  '<div class="actions"><button id="appSave">保存标识</button><button id="reset">重置位置</button><button id="follow">开启窗口跟随</button></div></section>'+
  '<section class="card"><label for="backup">浏览器 JSON 备份绝对路径</label>'+
  '<input id="backup" aria-label="浏览器 JSON 备份路径" type="text" placeholder="/Users/.../prompts.json">'+
  '<div class="actions"><button id="import">预览并追加导入</button><button id="export">导出 JSON</button></div></section></div>'+
  '<div class="footer"><span id="status" class="muted">准备就绪</span><button id="reconcile">核对磁盘版本</button>'+
  '<div class="actions"><button id="close">关闭管理</button><button id="quit">退出</button></div></div></main></body></html>';
if(!globalThis.OpenDeskPromptStorageLock)
  (0,eval)(File.read(File.join(Execution.scriptDir,'lock.js')));
if(!globalThis.OpenDeskPromptStorage)
  (0,eval)(File.read(File.join(Execution.scriptDir,'storage.js')));
// An explicit separate library never scans or migrates the user's default one.
const libraryDirectory=Execution.env?.OPENDESK_SHORTCUTS_LIBRARY_DIR;
const storage=await globalThis.OpenDeskPromptStorage.initialize({verified,empty,validateRecovery,
  ...(libraryDirectory===undefined?{}:{userDataDir:libraryDirectory,migrateLegacy:false})});
const DIR=storage.dir,FILE=storage.file,LOCK=storage.lockPath;
for(const receipt of storage.lockRecovery)
  console.log('CODEX_SHORTCUT_LOCK_RECOVERED='+JSON.stringify(receipt));
console.log('CODEX_SHORTCUT_STORAGE='+JSON.stringify({status:storage.status,file:FILE}));
const storageLock=globalThis.OpenDeskPromptStorageLock.create({file:FILE,lockPath:LOCK,
  backupDir:File.join(DIR,'lock-recovery'),
  onRecovered:receipt=>console.log('CODEX_SHORTCUT_LOCK_RECOVERED='+JSON.stringify(receipt))});
let data=storage.data;
let baseline=JSON.stringify(data),bar=null,manager=null,originalWin=null;
let barId=0,managerId=0,expectedPosition=null,dragTimer=null,dragTarget=null,writing=false;
let targetRegistry=null,originalTarget=null,applicationSample=null,barHostIdentity=null;
let positionOwner=null,inserterBinding=null,codeScene=null;
let followEpoch=0,scopedObserved=null,sceneVerifiedAt=0;
let sceneVersion=0,sceneVerifiedVersion=-1;
let editId=null,editDirty=false,page=0,stopping=false,subscribers=[];
let barPage=0,barItems=[],barUpdating=false,barReady=false,barRefresh=Promise.resolve();
let barVersion=0,dragVersion=0;
let draft=null,resolution=null,editVersion=0;
let recovery=null,pendingWrite=null,recoveredBaseline=null,closing=false;
let openingManager=null,recoverManager=false;
// Explicit copy-only sessions never register desktop observers at startup.
const startupMode=Execution.env?.OPENDESK_CODEX_SHORTCUTS_MODE||'follow';
if(!['follow','copy'].includes(startupMode))throw failure('INVALID_MODE','模式必须为 follow 或 copy');
let following=startupMode==='follow',copying=false,copyOnly=startupMode==='copy';
// Two reusable native channels; each keeps at most one pending replacement.
const notices={feedback:{handle:null,pending:null,running:null},ad:{handle:null,pending:null,running:null}};
const noticePosition={mode:'anchor',horizontal:'right',vertical:'bottom',margin:24,display:'active'};
let demoAd=null;
let inserter=null,calibrating=false,insertionBlocked=false,calibrationVersion=0,viewVersion=0;
let preparedInsertion=null;
let composerTracker=null,composerSample=null,composerPending=null,composerTimer=null,composerVersion=0;
let composerError=null;
function logError(e){console.error('CODEX_SHORTCUT_ERROR='+JSON.stringify({
  code:e?.code||'ERROR',message:String(e?.message||e)}));}
function traceFollowing(phase,win,extra={}){
  if(Execution.env?.OPENDESK_SHORTCUTS_TRACE_FOLLOW==='1')
    console.log('PROMPT_SHORTCUT_PHASE='+JSON.stringify({phase,pid:win?.pid||null,request:syncRequest,...extra}));
}
function validateRecovery(value){
  if(typeof value.dirty!=='boolean'||typeof value.baseline!=='string'||
      !(value.editId===null||typeof value.editId==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(value.editId))||
      !(value.resolution===null||own(value.resolution)&&typeof value.resolution.kind==='string'))
    throw failure('INVALID_RECOVERY','草稿恢复记录结构无效；原文件已保留');
  verified(JSON.parse(value.baseline));
  if(value.pending!==null)verified(value.pending);
  if(value.resolution?.expected)verified(value.resolution.expected);
  if(value.draft!==null){
    const d=value.draft;
    if(!own(d)||['body','label','name','bundleId','backup'].some(k=>typeof d[k]!=='string')||
        typeof d.enabled!=='boolean')throw failure('INVALID_RECOVERY','恢复草稿结构无效');
  }else if(value.dirty)throw failure('INVALID_RECOVERY','恢复草稿缺失');
}
function checkpointRecovery(patch={}){
  if(!recovery)return Promise.resolve();
  return recovery.checkpoint({dirty:editDirty,draft,editId,baseline:recoveredBaseline??baseline,
    pending:pendingWrite,resolution,...patch});
}
async function initializeRecovery(){
  if(recovery)return;
  if(!globalThis.OpenDeskPromptRecovery)
    (0,eval)(File.read(File.join(Execution.scriptDir,'recovery.js')));
  recovery=globalThis.OpenDeskPromptRecovery.create({file:FILE,dir:File.join(DIR,'draft-recovery'),
    validate:validateRecovery,onError:logError});
  const saved=await recovery.start();
  if(saved){
    draft=saved.draft;editId=saved.editId;editDirty=saved.dirty;editVersion++;
    pendingWrite=saved.pending;recoveredBaseline=saved.baseline;
    resolution={kind:'RECOVERED',expected:saved.pending||saved.resolution?.expected||null};
    console.log('CODEX_SHORTCUT_DRAFT_RECOVERED='+recovery.location());
  }
}
function demoOptions(value){
  if(!own(value)||value.schemaVersion!==1||typeof value.enabled!=='boolean')
    throw failure('INVALID_AD_DEMO','广告演示配置无效');
  if(!value.enabled)return null;
  if(typeof value.title!=='string'||!value.title.trim()||value.title.length>96||value.title.includes('\0')||
     typeof value.text!=='string'||!value.text.trim()||value.text.length>240||value.text.includes('\0')||
     typeof value.image!=='string'||!/^assets\/[A-Za-z0-9_./-]+\.(png|jpe?g)$/i.test(value.image)||
     value.image.split('/').includes('..'))throw failure('INVALID_AD_DEMO','广告演示需要本地图片、标题与说明');
  return {message:'广告演示 · '+value.title,caption:value.text,image:{path:value.image},
    level:'info',timeoutMs:5000,timeoutProgress:true,closable:true,position:noticePosition};
}
try{demoAd=demoOptions(await File.readJSON(File.join(Execution.scriptDir,'message-demo.json')));}
catch(e){logError(e);} // Optional display configuration never disables verified copying.
async function notice(channel,options){
  if(stopping)return;
  const slot=notices[channel];slot.pending=options;
  if(slot.running)return slot.running;
  let finish;
  const running=new Promise(resolve=>{finish=resolve;});slot.running=running;
  void (async()=>{try{
    while(slot.pending&&!stopping){
      const next=slot.pending;slot.pending=null;
      try{
        if(slot.handle){
          const result=await slot.handle.update(next);
          if(result.applied)continue;
          slot.handle=null; // Only a confirmed terminal handle may be replaced.
        }
        if(stopping)break;
        const handle=await ui.toast(next);
        if(stopping)await handle.close();else slot.handle=handle;
      }catch(e){logError(e);}
    }
  }finally{
    // The empty check and release share a synchronous turn: a new request
    // cannot attach to an exhausted drain and leave its replacement stranded.
    slot.running=null;finish();
  }})();
  return running;
}
async function closeNotices(){
  for(const slot of Object.values(notices))slot.pending=null;
  await Promise.all(Object.values(notices).map(async slot=>{
    if(slot.running)await slot.running;
    if(slot.handle)try{await slot.handle.close();}catch(e){logError(e);}
    slot.handle=null;
  }));
}
async function toast(s,level='info',caption=''){
  await notice('feedback',{message:String(s).slice(0,900),caption,level,
    timeoutMs:2600,closable:true,position:noticePosition});
}
const safe=(fn,duringClose=false)=>async()=>{if(closing&&!duringClose)return;
  try{await fn();}catch(e){logError(e);await toast('操作未完成：'+String(e.message||e),'error');}};
async function persist(change,guard=()=>true){
  if(writing)throw failure('BUSY','上次保存尚未完成');
  if(resolution)throw failure('RECONCILE_REQUIRED','请先点击“核对磁盘版本”，禁止重复提交');
  writing=true;let lease=null,committed=false;
  let normalized=null;
  try{
    lease=storageLock.acquire();
    const disk=verified(await File.readJSON(FILE,{defaultValue:empty()}));
    if(JSON.stringify(disk)!==baseline){
      resolution={kind:'STALE'};
      throw failure('STALE','其他实例已修改数据，请核对新版本后再操作');
    }
    const next=dup(disk);change(next);next.revision++;
    normalized=verified(next);
    // Persist intent before the business commit. A crash can only lead to
    // read-only reconciliation, never automatic replay of this mutation.
    pendingWrite=normalized;await checkpointRecovery();
    if(!guard())throw failure('CANCELED_DRAG','旧拖动已取消');
    await File.writeJSON(FILE,normalized,{maxBytes:4194304});
    committed=true;
    const checked=verified(await File.readJSON(FILE));
    if(JSON.stringify(checked)!==JSON.stringify(normalized))
      throw failure('UNCERTAIN','读回不一致');
    data=checked;baseline=JSON.stringify(checked);pendingWrite=null;
  }catch(e){
    if(committed||e.committed===true){
      resolution={kind:'UNCERTAIN',expected:normalized};
      throw failure('UNCERTAIN','可能已经写入；请点击“核对磁盘版本”，不可重复盲试');
    }
    pendingWrite=null;throw e;
  }finally{
    if(lease)try{lease.close();}catch(e){
      resolution=resolution||{kind:'LOCK_CLEANUP'};logError(e);
    }
    writing=false;
  }
  await checkpointRecovery();
  if(resolution)throw failure('LOCK_CLEANUP','数据已读回，但锁未能安全释放；保留编辑，请核对锁与磁盘');
  await rebuild();
}
async function reconcile(){
  if(writing)throw failure('BUSY','保存尚未完成');
  const version=editVersion;
  const recovering=resolution?.kind==='RECOVERED';
  if(!recovering&&!(await confirmDiscard()))return;
  if(editVersion!==version)return;
  const lease=storageLock.acquire();let disk;
  let recoveredCommit=null;
  try{
    disk=verified(await File.readJSON(FILE,{defaultValue:empty()}));
    if(editVersion!==version)throw failure('EDIT_CHANGED','核对期间编辑已变化；保留新草稿，请再次核对');
    if(resolution?.kind==='UNCERTAIN'&&JSON.stringify(disk)!==JSON.stringify(resolution.expected)&&
        JSON.stringify(disk)!==baseline)
      throw failure('UNCERTAIN','磁盘既非原版本也非待确认版本，保留草稿并人工核对');
    const expected=recovering&&(pendingWrite||resolution.expected);
    if(expected){
      const observed=JSON.stringify(disk);
      if(observed===JSON.stringify(expected))recoveredCommit='committed';
      else if(observed===recoveredBaseline)recoveredCommit='not_committed';
      else throw failure('UNCERTAIN','磁盘既非恢复基线也非待确认版本；保留草稿及提交意图，禁止重放');
      const backup=await recovery.archive();
      console.log('CODEX_SHORTCUT_INTENT_ARCHIVED='+JSON.stringify({backup,state:recoveredCommit}));
      if(editVersion!==version)throw failure('EDIT_CHANGED','备份期间编辑已变化；保留新草稿，请再次核对');
    }
  }finally{try{lease.close();}catch(e){
    resolution=resolution||{kind:'LOCK_CLEANUP'};throw failure('LOCK_CLEANUP','锁关闭未确认；保留编辑，请核对：'+String(e));
  }}
  if(recovering){
    // A different baseline must not turn a recovered A draft into an overwrite
    // of another instance's A. Keep it as a new unsaved item instead.
    const changed=JSON.stringify(disk)!==recoveredBaseline;
    const row=disk.prompts.find(p=>p.id===editId);
    const identical=row&&draft&&['body','label','name','enabled'].every(k=>row[k]===draft[k])&&
      draft.bundleId===disk.settings.appBundleId;
    if(identical)editDirty=false;
    else if(changed||!row)editId=null;
    data=disk;baseline=JSON.stringify(disk);resolution=null;pendingWrite=null;recoveredBaseline=null;
    await render(editDirty&&!!draft);await checkpointRecovery();await rebuild();
    const commitMessage=recoveredCommit==='committed'?'上次提交已从磁盘确认，未重放；':
      recoveredCommit==='not_committed'?'上次提交未写入，意图已备份，未重放；':'';
    await message(commitMessage+(editDirty?'磁盘已核对；恢复草稿仍未保存'+(editId?'':'，将另存为新条目'):
      '磁盘已核对；当前草稿与磁盘一致'));
    return;
  }
  data=disk;baseline=JSON.stringify(disk);resolution=null;pendingWrite=null;draft=null;editDirty=false;
  if(editId&&!data.prompts.some(p=>p.id===editId))editId=null;
  await rebuild();await render();await checkpointRecovery();await message('已重新读取磁盘；请核对当前内容再编辑');
}
function targets(){
  if(!targetRegistry){
    if(typeof OpenDeskPromptTargets==='undefined')
      (0,eval)(File.read(File.join(Execution.scriptDir,'targets.js')));
    const path=Execution.env?.OPENDESK_SHORTCUTS_TARGET_CONFIG;
    let profiles,scope=Execution.input?.scope,scopes=Execution.input?.scopes;
    if(path!==undefined&&path!==''){
      if(typeof path!=='string'||path.length>4096||path.includes('\0'))
        throw failure('INVALID_TARGET_CONFIG','目标配置路径无效');
      let config;
      try{
        const source=File.read(path);
        if(source.length>65536)throw new Error('配置超过 64 KiB');
        config=JSON.parse(source);
      }catch(e){throw failure('INVALID_TARGET_CONFIG','目标配置无法读取：'+String(e.message||e));}
      if(!own(config)||config.schemaVersion!==1||
          Object.keys(config).some(k=>!['schemaVersion','profiles','scope','scopes'].includes(k))||
          (config.profiles!==undefined&&(!Array.isArray(config.profiles)||config.profiles.length<1||config.profiles.length>16))||
          (config.profiles===undefined&&config.scope===undefined&&config.scopes===undefined))
        throw failure('INVALID_TARGET_CONFIG','目标配置需要 schemaVersion:1 及 1–16 个 profiles');
      // An explicit deployment config replaces defaults; it must not silently
      // observe an application the caller did not configure.
      profiles=config.profiles;
      if((scope!==undefined||scopes!==undefined)&&(config.scope!==undefined||config.scopes!==undefined))
        throw failure('INVALID_TARGET_CONFIG','范围只能来自一个输入源');
      if(config.scope!==undefined)scope=config.scope;
      if(config.scopes!==undefined)scopes=config.scopes;
    }
    const bounded=scope!==undefined||scopes!==undefined;
    try{targetRegistry=OpenDeskPromptTargets.createRegistry({
      ...(bounded?{profiles:profiles||[]}:{App,...(profiles?{profiles}:{})}),
      ...(scope===undefined?{}:{scope}),...(scopes===undefined?{}:{scopes})});}
    catch(e){throw failure('INVALID_TARGET_CONFIG',String(e.message||e));}
    if((targetRegistry.scope||targetRegistry.scopes?.length)&&typeof window.getAppWindow!=='function')
      throw failure('NOT_SUPPORTED','当前 Runtime 缺少 window.getAppWindow');
  }
  return targetRegistry;
}
function matchTarget(pid,exePath){
  const key=data.settings.appBundleId,now=Date.now();
  // App.get may enumerate processes. Reuse only a positive stable-identity
  // observation for 400ms; every window read still verifies PID/handle/exePath.
  // A new PID or lifecycle event immediately requires a fresh application read.
  if(applicationSample&&applicationSample.pid===pid&&applicationSample.exePath===exePath&&applicationSample.key===key&&
      now-applicationSample.time>=0&&now-applicationSample.time<400)return applicationSample.match;
  const match=targets().matchPid(pid,key);
  applicationSample=match&&exePath?{pid,exePath,key,match,time:Date.now()}:null;
  return match;
}
const sameApplication=(a,b)=>a&&b&&a.profileId===b.profileId&&
  a.identity.kind===b.identity.kind&&a.identity.value===b.identity.value;
const applicationPositionKey=match=>match?JSON.stringify([match.profileId,match.identity.kind,match.identity.value]):null;
const legacyPosition=match=>!match||match.identity.kind==='bundleId'&&match.identity.value==='com.openai.codex';
function targetOffset(match=originalTarget,settings=data.settings){
  if(legacyPosition(match))return settings;
  return settings.positions?.[applicationPositionKey(match)]||{offsetX:0,offsetY:0};
}
function saveOffset(settings,match,offsetX,offsetY){
  if(legacyPosition(match)){settings.offsetX=offsetX;settings.offsetY=offsetY;return;}
  const key=applicationPositionKey(match);
  settings.positions={...settings.positions,[key]:{offsetX,offsetY}};
}
function acceptTarget(win,match,scene=null){
  const binding=JSON.stringify([win.id,win.pid,win.handle,win.exePath,win.x,win.y,win.width,win.height,
    applicationPositionKey(match),scene?.signature]);
  if(inserterBinding!==binding){
    clearPreparedInsertion();
    inserter=null;invalidateComposer();calibrationVersion++;inserterBinding=binding;
  }
  codeScene=scene?{...scene,window:{...win}}:null;
  originalTarget=match;positionOwner=match;originalWin=win;return win;
}
function forgetInputTarget(){
  clearPreparedInsertion();
  codeScene=null;
  if(inserterBinding!==null){inserter=null;inserterBinding=null;invalidateComposer();calibrationVersion++;}
  return null;
}
async function qualifyTarget(win,match,current=()=>true){
  if(!current())return null;
  if(match?.profile.scene!=='claude-code')return acceptTarget(win,match);
  // Read a candidate without clearing the last confirmed scene/binding. A
  // newer hint or input can cancel this read without changing visible state.
  try{
    const scene=await OpenDeskPromptTargets.inspectClaudeCode({Accessibility,window:win});
    if(!current())return null;
    if(!scene)return forgetInputTarget();
    const fresh=await window.getAppWindow({pid:win.pid,exePath:win.exePath});
    if(!current())return null;
    if(!sameWindow(win,fresh)||fresh.exePath!==win.exePath)return forgetInputTarget();
    inserter=null; // Strict clicks still rediscover rather than reuse a ref.
    return acceptTarget(fresh,match,scene);
  }catch(e){if(current())forgetInputTarget();throw e;}
}
async function targetWindow(qualify=true){
  const epoch=followEpoch;
  const registry=targets(),scopes=registry.scopes?.length?registry.scopes:registry.scope?[registry.scope]:[];
  if(scopes.length){
    let selected=null;
    const observations=await Promise.all(scopes.map(scope=>
      window.getAppWindow({pid:scope.pid,exePath:scope.exePath})));
    for(let i=0;i<scopes.length;i++){
      const scope=scopes[i],win=observations[i];
      if(!win)continue;
      if(win.pid!==scope.pid||win.exePath!==scope.exePath||win.isForeground!==true||
          !win.id||win.id.endsWith(':unresolved')||!Number.isSafeInteger(win.handle)||win.handle<=0)
        throw failure('VERIFICATION_FAILED','范围窗口身份不匹配');
      if(selected)throw failure('TARGET_CHANGED','观察期间前台已切换，等待重新核验');
      selected=win;
    }
    if(!selected){if(qualify&&epoch===followEpoch)forgetInputTarget();return null;}
    // A switch during the bounded scan must not leave the previous target shown.
    if(scopes.length>1){
      const fresh=await window.getAppWindow({pid:selected.pid,exePath:selected.exePath});
      if(!sameWindow(selected,fresh)||selected.exePath!==fresh?.exePath){
        if(qualify&&epoch===followEpoch)forgetInputTarget();return null;
      }
      selected=fresh;
    }
    return qualify?qualifyTarget(selected,registry.matchPid(selected.pid),()=>epoch===followEpoch):selected;
  }
  const active=await window.getActiveWindow();
  if(!active?.id)return null;
  // The host PID belongs to this native toolbar lifetime. Other applications
  // need no repeated toolbar state query; toolbar focus still needs fresh state.
  const knownHost=barHostIdentity?.panel===bar&&barHostIdentity.epoch===barId?barHostIdentity.pid:0;
  let ownBar=null;
  if(bar&&(!knownHost||active.pid===knownHost)){
    ownBar=await bar.getState();
    if(ownBar.hostPid>0)barHostIdentity={panel:bar,epoch:barId,pid:ownBar.hostPid};
  }
  // A configured identity may use the same executable as our UI host. Never
  // bind its manager, notifications or unrelated windows as an external target.
  const hostPid=ownBar?.hostPid||knownHost;
  const ownHost=hostPid>0&&active.pid===hostPid;
  const match=active?.id&&!ownHost?matchTarget(active.pid,active.exePath):null;
  if(match){
    const exact=await window.current(active);
    if(exact.id!==active.id||exact.pid!==active.pid||exact.handle!==active.handle||
        !exact.exePath||exact.exePath!==active.exePath||
        !sameApplication(match,matchTarget(exact.pid,exact.exePath))||exact.isForeground!==true)return null;
    return qualify?qualifyTarget(exact,match):exact;
  }
  // Only this exact visible toolbar can temporarily own focus, never another
  // window sharing the Host PID (including the manager and transient toasts).
  for(const panel of [bar]){
    if(!panel||!active||!originalWin)continue;
    const state=ownBar||await panel.getState();
    if(state.visible&&state.onScreen&&state.hostPid&&active.pid===state.hostPid&&
        state.nativeWindowId>0&&active.handle===state.nativeWindowId){
      const exact=await window.current(originalWin);
      if(exact.id===originalWin.id&&exact.pid===originalWin.pid&&
          exact.handle===originalWin.handle&&exact.exePath&&exact.exePath===originalWin.exePath&&
          sameApplication(originalTarget,matchTarget(exact.pid,exact.exePath))){
        // Code profiles require the real foreground gate; toolbar focus is
        // never authority to reuse a remembered Code page.
        if(originalTarget?.profile.scene==='claude-code')return forgetInputTarget();
        return acceptTarget(exact,originalTarget);
      }
    }
  }
  return forgetInputTarget();
}
let syncing=false,pendingSync=false,syncRequest=0,failedPositionKey=null,lastFollowReceipt='';
let followRetryTimer=null,followRetryRemaining=0;
function cancelFollowRetry(){
  if(followRetryTimer)clearTimeout(followRetryTimer);
  followRetryTimer=null;followRetryRemaining=0;
}
function retryFollowing(){
  if(!following||stopping||followRetryTimer||followRetryRemaining<=0)return;
  followRetryRemaining--;
  followRetryTimer=setTimeout(()=>{
    followRetryTimer=null;
    if(following&&!stopping)return sync(true).catch(logError);
  },40);
}
const sameWindow=(a,b)=>a&&b&&['id','pid','handle','x','y','width','height'].every(k=>a[k]===b[k]);
const sameScopedWindow=(a,b)=>!a&&!b||sameWindow(a,b)&&a.exePath===b.exePath;
async function recheckTarget(win){
  // A settled candidate only needs its own exact PID/executable rechecked.
  // A replacement is selected and fully qualified by the next sync/guard.
  if(targets().scope||targets().scopes?.length)
    return window.getAppWindow({pid:win.pid,exePath:win.exePath});
  return targetWindow();
}
function observeScopedWindow(win){
  if(sameScopedWindow(scopedObserved,win))return false;
  scopedObserved=win?{...win}:null;followEpoch++;
  cancelDrag();forgetInputTarget();originalWin=null;originalTarget=null;
  return true;
}
function invalidateComposer(clear=false){
  composerVersion++;composerSample=null;composerPending=null;
  if(composerTimer)clearTimeout(composerTimer);composerTimer=null;
  if(clear)composerTracker=null;
}
function measureComposer(win){
  if(!composerTracker||composerPending||composerTimer)return;
  const version=composerVersion,tracker=composerTracker;
  const valid=()=>version===composerVersion&&tracker===composerTracker&&following&&!stopping;
  // Keep AX work off synchronize's critical path: loss of focus can hide the
  // toolbar while a native observation is still in flight. Late results expire.
  let task;
  task=(async()=>{
    try{
      const composer=await tracker.measure(win);
      if(!valid())return;
      const fresh=await targetWindow();
      if(!valid())return;
      composerSample=sameWindow(fresh,win)&&fresh.exePath===win.exePath?
        {window:{...win},composer,time:Date.now()}:null;
      composerError=null;
    }catch(e){
      if(!valid())return;
      composerSample=null;
      if(composerError!==e.code){composerError=e.code;logError(e);}
    }finally{
      if(composerPending===task)composerPending=null;
      if(valid()){
        composerTimer=setTimeout(()=>{composerTimer=null;void sync().catch(logError);},120);
        void sync().catch(logError);
      }
    }
  })();
  composerPending=task;
}
function placement(win,h,offset=targetOffset(),clip=true,scene=codeScene){
  let composer=null;
  if(originalTarget?.profile.scene==='claude-code'){
    if(!scene||!sameWindow(scene.window,win))
      throw failure('COMPOSER_UNAVAILABLE','Code 输入区观察已失效');
    composer=scene.composer;
  }else if(composerTracker){
    if(!composerSample||!sameWindow(composerSample.window,win)||
        composerSample.window.exePath!==win.exePath||Date.now()-composerSample.time>400)
      throw failure('COMPOSER_UNAVAILABLE','输入区测量已失效，已隐藏快捷栏');
    composer=composerSample.composer;
  }
  const profile=scene?{contentArea:()=>scene.contentArea}:
    originalTarget?.profile||targets().getProfile('codex');
  return frame(win,h,offset,Screen.getDisplays(),profile,composer,clip);
}
function cancelDrag(){
  dragVersion++;
  if(dragTimer)clearTimeout(dragTimer);
  dragTimer=null;dragTarget=null;
}
async function synchronize(observation){
  if(!bar||stopping||barUpdating)return;
  const panel=bar,epoch=barId,version=barVersion,view=viewVersion,sceneRevision=sceneVersion,startedAt=Date.now();
  let qualifiedAt=startedAt,shownAt=startedAt;
  let targetEpoch=followEpoch;
  const current=()=>bar===panel&&barId===epoch&&version===barVersion&&view===viewVersion&&
    targetEpoch===followEpoch&&sceneRevision===sceneVersion&&!copying&&
    barReady&&!barUpdating&&!stopping&&!calibrating&&!openingManager;
  if(!barReady||calibrating||openingManager){cancelDrag();invalidateComposer();await panel.hide();return;}
  const managerState=manager?await manager.getState():null;
  if(!current())return;
  if(managerState?.visible){cancelDrag();invalidateComposer();await panel.hide();return;}
  if(!current())return;
  if(!following){
    cancelDrag();
    const state=await panel.getState();
    if(!current())return;
    if(!state.visible)await panel.show();
    return;
  }
  let positionKey=null;
  let win=null,targetReadFailed=false;
  traceFollowing('sync-start',null);
  try{
    const scoped=!!(targets().scope||targets().scopes?.length);
    // Consume the guard's fresh observation once. Exact checks around native
    // presentation below still run; do not repeat the entire scopes scan here.
    const sample=observation.scopedSample;observation.scopedSample=null;
    win=scoped&&sample?.epoch===followEpoch?sample.win:await targetWindow(!scoped);
    traceFollowing('target-confirmed',win);
    if(!current())return;
    if(scoped){
      // Identity/geometry observations own the lifetime. Hide the previous
      // application before doing a slow scene read; never display its frame
      // over the newly selected target.
      if(observeScopedWindow(win)){
        targetEpoch=followEpoch;
        await panel.hide();
      }
      if(!current())return;
      if(win)win=await qualifyTarget(win,targets().matchPid(win.pid),current);
    }
    qualifiedAt=Date.now();
    traceFollowing('qualified',win);
  }catch(e){targetReadFailed=true;logError(e);}
  try{
    if(!current())return;
    if(!win){
      cancelDrag();invalidateComposer();originalWin=null;originalTarget=null;
      const state=await panel.getState();if(!current())return;
      if(state.visible)await panel.hide();failedPositionKey=null;
      if(!targetReadFailed)retryFollowing();return;
    }
    measureComposer(win);
    const state=await panel.getState(),before=state.bounds;
    let pos=placement(win,before.height);
    // A drag debounce must never suppress loss of focus, manager visibility,
    // target replacement or a new target frame. Only the unchanged target may
    // wait for the user's relative position to be saved.
    if(dragTarget){if(sameWindow(dragTarget,win))return;cancelDrag();}
    positionKey=JSON.stringify([epoch,win.id,win.pid,win.handle,win.x,win.y,win.width,win.height,pos]);
    if(positionKey===failedPositionKey)return;
    if(!current())return;
    if(Math.abs(before.x-pos.x)>1||Math.abs(before.y-pos.y)>1){
      if(dragTimer){clearTimeout(dragTimer);dragTimer=null;}
      expectedPosition=pos;
      const moving=panel.setPosition(pos.x,pos.y);
      let identityError=null;
      try{
        if(!state.visible&&!observation.hiddenMoveRefreshed){
          // Refresh application membership while the native host finishes its
          // hidden-window move/animation. Keep the 400ms cache bound and still
          // re-read the exact foreground window after the move has completed.
          applicationSample=null;
          observation.hiddenMoveRefreshed=true;
          if(!sameApplication(originalTarget,matchTarget(win.pid,win.exePath)))
            throw failure('TARGET_CHANGED','目标应用身份已变化，已隐藏快捷栏');
        }
      }catch(e){identityError=e;}
      // Never leave a native mutation running when hiding after a read error.
      try{await moving;}catch(e){if(!identityError)throw e;logError(e);}
      traceFollowing('positioned',win);
      if(identityError)throw identityError;
    }
    if(!current())return;
    const fresh=await recheckTarget(win);
    if(!current())return;
    if(!sameWindow(fresh,win)){
      cancelDrag();forgetInputTarget();followEpoch++;
      originalWin=null;originalTarget=null;await panel.hide();
      if(fresh)pendingSync=true;
      else retryFollowing();
      return;
    }
    let settledState=null,settledRequest=null;
    if(!state.visible){
      await panel.show();
      traceFollowing('shown',win);
      shownAt=Date.now();
      // Newer visibility owners already issue their own native command. An
      // expired soft check must not hide a bar they are keeping visible.
      if(!current())return;
      // WindowServer can expose an inset frame during the native show animation.
      // Require successive matching readbacks. Sample immediately, then at
      // 16ms intervals rather than
      // spending 300ms in deliberate waits even when the native frame is ready.
      // At most 39 samples; native observations add their own execution time.
      let stable=0,previous=null;
      for(let attempt=0;attempt<39&&stable<2;attempt++){
        if(attempt)await System.delay(16);
        if(!current())return;
        const shown=await panel.getState();
        if(!current())return;
        const same=previous&&['x','y','width','height'].every(k=>Math.abs(shown.bounds[k]-previous[k])<=1);
        // A hidden WindowServer animation frame can be shorter than the final
        // toolbar. Accept its final-height center only after matching native
        // frames already prove that exact position; arbitrary drift still fails.
        if(same&&shown.bounds.height!==before.height){
          const centered=placement(win,shown.bounds.height);
          if(Math.abs(shown.bounds.x-centered.x)<=1&&Math.abs(shown.bounds.y-centered.y)<=1){
            pos=centered;expectedPosition=pos;
          }
        }
        stable=shown.visible&&shown.onScreen&&same&&Math.abs(shown.bounds.x-pos.x)<=1&&
          Math.abs(shown.bounds.y-pos.y)<=1?stable+1:0;
        previous=shown.bounds;
      }
      if(stable<2)throw failure('POSITION_UNCONFIRMED','原生窗口显示位置未稳定，已隐藏');
      if(!current())return;
      // The final exact target read below validates the settled geometry too;
      // avoid another identity read immediately before the same final check.
      const sampleRequest=syncRequest,settled=await panel.getState();
      if(!current())return;
      const centered=placement(win,settled.bounds.height);
      if(Math.abs(centered.x-pos.x)>1||Math.abs(centered.y-pos.y)>1){
        pos=centered;expectedPosition=pos;
        await panel.setPosition(pos.x,pos.y);
        if(!current())return;
      }else{settledState=settled;settledRequest=sampleRequest;}
    }
    const observedRequest=settledState?settledRequest:syncRequest;
    const actual=settledState||await panel.getState();
    if(!current())return;
    if(originalTarget?.profile.scene==='claude-code'){
      const scene=await OpenDeskPromptTargets.inspectClaudeCode({Accessibility,window:win,measure:false});
      if(!current())return;
      if(!scene||scene.sceneKey!==codeScene?.sceneKey){
        forgetInputTarget();await panel.hide();pendingSync=true;return;
      }
      traceFollowing('scene-confirmed',win);
    }
    const confirmed=await recheckTarget(win);
    if(!current())return;
    if(!sameWindow(confirmed,win)){
      cancelDrag();forgetInputTarget();followEpoch++;
      originalWin=null;originalTarget=null;await panel.hide();
      if(confirmed)pendingSync=true;
      else retryFollowing();
      return;
    }
    const currentPos=placement(win,actual.bounds.height);
    if(Math.abs(currentPos.x-pos.x)>1||Math.abs(currentPos.y-pos.y)>1){pendingSync=true;return;}
    if(!actual.visible||!actual.onScreen||Math.abs(actual.bounds.x-pos.x)>1||Math.abs(actual.bounds.y-pos.y)>1)
      throw failure('POSITION_UNCONFIRMED','快捷栏实际位置未核实，已隐藏');
    const receipt=JSON.stringify({profile:originalTarget.profileId,target:{pid:win.pid,id:win.id,handle:win.handle,
      exePath:win.exePath,x:win.x,y:win.y,width:win.width,height:win.height},
      bar:{hostPid:actual.hostPid,nativeWindowId:actual.nativeWindowId,bounds:{x:actual.bounds.x,y:actual.bounds.y,width:actual.bounds.width,height:actual.bounds.height},visible:actual.visible,onScreen:actual.onScreen}});
    if(receipt!==lastFollowReceipt){
      lastFollowReceipt=receipt;console.log('PROMPT_SHORTCUT_FOLLOW='+receipt);
      console.log('PROMPT_SHORTCUT_TIMING='+JSON.stringify({profile:originalTarget.profileId,startedAt,
        qualifiedMs:qualifiedAt-startedAt,shownMs:shownAt>qualifiedAt?shownAt-startedAt:null,
        confirmedMs:Date.now()-startedAt}));
    }
    failedPositionKey=null;
    sceneVerifiedAt=Date.now();
    sceneVerifiedVersion=sceneRevision;
    traceFollowing('stable',win);
    warmInsertion(win,originalTarget?.profile);
    cancelFollowRetry();
    // Final native and target readbacks cover requests already queued before
    // this observation. A request arriving during it still gets another pass.
    if(observedRequest===syncRequest)pendingSync=false;
  }catch(e){
    if(!current())return;
    cancelDrag();
    // A fresh read can recover from a moving window or a bounded native read
    // failure. Do not permanently latch those observations as bad geometry.
    failedPositionKey=['STALE_TARGET','SEARCH_INCOMPLETE','TIMEOUT','COMPOSER_UNAVAILABLE'].includes(e.code)?
      null:positionKey;
    try{await panel.hide();}catch(hideError){logError(hideError);}
    if(e.code!=='COMPOSER_UNAVAILABLE')logError(e);
  }
}
async function sync(retry=false,scopedSample=null){
  if(!retry){cancelFollowRetry();followRetryRemaining=2;}
  syncRequest++;
  // Foreground guards keep running, but full scene/placement scans must not
  // queue behind the button's exact editor reads while a paste is in flight.
  if(copying){pendingSync=true;return;}
  if(syncing){pendingSync=true;return;}syncing=true;
  const observation={hiddenMoveRefreshed:false,scopedSample};
  try{do{pendingSync=false;await synchronize(observation);}while(pendingSync&&!stopping&&!copying);}
  finally{syncing=false;}
}
async function drag(event,epoch){
  if(!following)return; // Detached placement belongs to the native window only.
  if(epoch!==barId||!event?.bounds||!originalWin||stopping)return;
  const b=event.bounds;
  if(!Number.isFinite(b.x)||!Number.isFinite(b.y))return;
  // Ignore programmatic and stale event frames, not every user drag during a
  // blanket time window after following. Read this exact native toolbar back.
  if(expectedPosition&&Math.abs(b.x-expectedPosition.x)<2&&
      Math.abs(b.y-expectedPosition.y)<2)return;
  const panel=bar,target=originalWin,owner=originalTarget;
  if(!panel)return;
  // Reserve the version before yielding: a later move owns the readback even
  // when the older request completes first. Hold the drag through the commit,
  // while synchronize still checks foreground/manager/target before this hold.
  const version=++dragVersion;dragTarget=target;
  if(dragTimer)clearTimeout(dragTimer);dragTimer=null;
  let scheduled=false;
  try{
  const native=await panel.getState();
  if(version!==dragVersion||epoch!==barId||panel!==bar||!following||stopping||
      openingManager||calibrating||!sameWindow(originalWin,target)||!native.visible||!native.onScreen||
      Math.abs(native.bounds.x-b.x)>1||Math.abs(native.bounds.y-b.y)>1)return;
  scheduled=true;
  dragTimer=setTimeout(()=>{void safe(async()=>{
    dragTimer=null;
    const current=()=>version===dragVersion&&epoch===barId&&following&&!stopping&&
      !openingManager&&!calibrating&&sameWindow(originalWin,target)&&sameApplication(originalTarget,owner);
    try{
    if(!current())return;
    const win=await targetWindow();
    if(!current()||!win||win.handle!==target.handle||
       win.x!==target.x||win.y!==target.y||win.width!==target.width||win.height!==target.height)return;
    const state=await bar.getState();
    if(!current())return;
    if(Math.abs(state.bounds.x-b.x)>1||Math.abs(state.bounds.y-b.y)>1)return;
    const base=placement(win,state.bounds.height,{...data.settings,offsetX:0,offsetY:0},false);
    await persist(next=>{if(!current())throw failure('CANCELED_DRAG','旧拖动已取消');
      saveOffset(next.settings,owner,Math.round(b.x-base.x),Math.round(b.y-base.y));},current);
    }finally{if(version===dragVersion)dragTarget=null;await sync();}
  })();},160);
  }finally{if(!scheduled&&version===dragVersion)dragTarget=null;}
}
function copyVerified(item,reason=''){
  clipboard.copy(item.body);
  if(clipboard.paste()!==item.body)
    throw failure('CLIPBOARD_CHANGED','剪贴板复制或读回失败；未确认复制成功');
  console.log('CODEX_SHORTCUT_COPIED='+JSON.stringify({id:item.id,length:item.body.length,verified:true,reason}));
}
async function copy(id){
  const item=data.prompts.find(p=>p.id===id&&p.enabled);
  if(!item||writing||copying)return;
  copying=true;
  try{
    copyVerified(item);
  }finally{copying=false;}
  // Slow feedback never holds the clipboard lock or discards the next click.
  await toast('已复制 · '+(item.name||item.label||label(item.body)), 'success',
    '完整正文 · '+item.body.length+' 字');
  if(demoAd)await notice('ad',demoAd);
}
function insertionAPI(){
  if(!globalThis.OpenDeskPromptInsertion)
    (0,eval)(File.read(File.join(Execution.scriptDir,'insert.js')));
  return globalThis.OpenDeskPromptInsertion;
}
function insertionScope(){
  const registry=targets();
  return registry.scope||registry.scopes?.length?
    {scope:{pid:originalWin?.pid,exePath:originalWin?.exePath}}:{};
}
function editorModel(profile){
  // Codex's placeholder AX value needs its own measured text model. Never
  // route either bundle or executable-bound scopes through plain text.
  if(profile?.id==='codex'||profile?.app.bundleId==='com.openai.codex'||
      /\/ChatGPT\.app(?:\/Contents\/MacOS\/ChatGPT)?$/.test(profile?.app.path||''))return 'codex';
  return profile?.scene==='claude-code'?'claude-code':
    profile?.app.bundleId==='ai.opencode.desktop'||profile?.id==='opencode'?'opencode':'plain';
}
function insertionContext(win,profile){
  const sceneKey=codeScene?.sceneKey;
  return {getTarget:()=>targetWindow(false),
    ...(profile?.scene==='claude-code'?{verifyContext:async()=>{
      const scene=await OpenDeskPromptTargets.inspectClaudeCode({Accessibility,window:win,measure:false});
      if(!scene||scene.sceneKey!==sceneKey)throw failure('SCENE_CHANGED','Claude Code 工作区已变化');
    }}:{})};
}
function clearPreparedInsertion(){
  const previous=preparedInsertion;preparedInsertion=null;
  if(previous?.inserter.dispose)void previous.inserter.dispose().catch(logError);
}
function pasteBinding(win,profile){
  // acceptTarget invalidates the prepared ref only when a new binding passes
  // qualification. The helper also performs its own fresh scene gate.
  return JSON.stringify([win.id,win.pid,win.exePath,win.x,win.y,win.width,win.height,profile.id]);
}
function pasteInserterFor(win,profile,onPhase){
  const isClaude=profile.scene==='claude-code';
  const isCodex=editorModel(profile)==='codex';
  const selector=isClaude?codeScene?.editorSelector:profile.editorSelector;
  const discovery=profile.editorDiscovery;
  if(!selector&&!discovery)
    throw Object.assign(failure('EDITOR_EVIDENCE_REQUIRED','此应用尚未确认输入区'),{actionState:'not_started'});
  const scope={pid:win.pid,exePath:win.exePath};
  return insertionAPI().createRuntimeInserter({...insertionContext(win,profile),
    getTarget:()=>window.getAppWindow(scope),scope,expectedWindow:{...win},
    editorSelector:selector||{role:'textField'},nativeRole:isCodex?'AXTextArea':discovery?.nativeRole||(isClaude?'AXTextArea':undefined),
    searchDepth:isClaude||isCodex?64:discovery?.maxDepth||24,
    inputMode:'paste',editorModel:editorModel(profile),onPhase});
}
function warmInsertion(win,profile){
  if(copying||stopping||insertionBlocked||profile?.inputMode!=='paste')return;
  const key=pasteBinding(win,profile);
  if(preparedInsertion?.key!==key){
    clearPreparedInsertion();preparedInsertion={key,inserter:pasteInserterFor(win,profile)};
  }
  const entry=preparedInsertion;
  if(entry.inserter.prepare)void entry.inserter.prepare().catch(e=>{
    if(preparedInsertion===entry)clearPreparedInsertion();logError(e);
  });
}
async function currentInserter(onPhase){
  // The visible toolbar already has an app-qualified window/scene. Paste
  // revalidates that exact window and finds its unique live editor once. Do
  // not repeat qualification, discovery snapshots and find on every click.
  const selectedProfile=originalTarget?.profile;
  if(selectedProfile?.inputMode==='paste'&&originalWin){
    if(preparedInsertion?.key===pasteBinding(originalWin,selectedProfile)){
      preparedInsertion.inserter.setOnPhase?.(onPhase);return preparedInsertion.inserter;
    }
    return pasteInserterFor(originalWin,selectedProfile,onPhase);
  }
  const win=await targetWindow();
  if(!win)throw Object.assign(failure('NO_CURRENT_TARGET','当前前台不是已确认的目标或本实例快捷栏'),{actionState:'not_started'});
  // Observation never activates a remembered window. Each click rediscovers
  // its editor; a profile must explicitly select ordinary paste input.
  if(win.isForeground!==true)throw Object.assign(failure('NOT_FOREGROUND','目标窗口已失焦；未激活或输入'),{actionState:'not_started'});
  if(inserter&&originalTarget?.profile.scene!=='claude-code'&&originalTarget?.profile.inputMode!=='paste')return inserter;
  const profile=originalTarget?.profile,api=insertionAPI();
  if(editorModel(profile)==='codex')return api.createRuntimeInserter({
    inputMode:profile?.inputMode||'strict',editorModel:'codex'});
  const isClaude=profile?.scene==='claude-code';
  const editorSelector=isClaude?codeScene?.editorSelector:profile?.editorSelector;
  const editorDiscovery=isClaude?null:profile?.editorDiscovery;
  if(!editorSelector&&!editorDiscovery)
    throw Object.assign(failure('EDITOR_EVIDENCE_REQUIRED','此应用尚未配置经核验的输入区'),{actionState:'not_started'});
  let measured;
  try{measured=await api.discoverRuntimeEditor({getTarget:targetWindow,...insertionScope(),
    ...(isClaude?{maxDepth:64}:{}),
    ...(editorSelector?{editorSelector}:{editorDiscovery})});}
  catch(e){e.actionState=e.actionState||'not_started';throw e;}
  return api.createRuntimeInserter({...insertionContext(win,profile),...insertionScope(),...measured,
    inputMode:profile?.inputMode||'strict',editorModel:editorModel(profile)});
}
async function insertPrompt(id){
  const item=data.prompts.find(p=>p.id===id&&p.enabled);
  if(!item||writing||copying)return;
  copying=true;
  sceneVersion++; // Fence any background scene read already in flight.
  if(syncing)pendingSync=true;
  const startedAt=Date.now();
  const inputPhase=(phase,detail)=>console.log('PROMPT_SHORTCUT_INPUT_TIMING='+JSON.stringify({id,phase,...(detail?{detail}:{}),
    startedAt,at:Date.now(),elapsedMs:Date.now()-startedAt}));
  inputPhase('click');
  let result;
  try{
    // A thrown helper result has no reliable action receipt. Never retry input.
    try{result=insertionBlocked?{status:'blocked',code:'INPUT_BLOCKED',actionState:'unknown'}:
      await (await currentInserter(inputPhase)).insert(item.body);}
    catch(e){result={status:e?.actionState==='not_started'?'rejected':'blocked',
      code:e?.code||'INSERT_FAILED',actionState:e?.actionState||'unknown'};}
    // A readback never overrides an unknown or contradictory action receipt.
    // Focused web paste acknowledges observation without claiming exact text.
    const confirmed=result?.status==='inserted'&&result.verified===true&&result.actionState==='acknowledged';
    const observed=result?.status==='inserted'&&result.code==='PASTE_OBSERVED'&&
      result.verified===false&&result.actionState==='acknowledged';
    const unverified=result&&(result.verified===undefined||result.verified===false);
    const untouched=result?.status==='rejected'&&unverified&&result.actionState==='not_started';
    const uncertain=result?.status==='blocked'&&unverified&&result.actionState==='unknown';
    if(!confirmed&&!observed&&!untouched&&!uncertain)
      result={status:'blocked',code:'INVALID_RECEIPT',actionState:'unknown'};
    console.log('CODEX_SHORTCUT_INSERT='+JSON.stringify({id,status:result.status,code:result.code,verified:result.verified,actionState:result.actionState,phase:result.phase}));
    if(confirmed||observed){
      // Feedback failure cannot change the acknowledged paste fact.
    }else if(result.status!=='rejected'||result.actionState==='unknown'){
      // A dispatched paste may consume the clipboard asynchronously. Preserve
      // its exact suffix on uncertainty; copying the body here could change a
      // pending paste and discard the separator. Explicit copy stays available.
      insertionBlocked=true;
    }else{
      try{copyVerified(item,result.code||'UNVERIFIED_INPUT');}
      catch(e){throw failure(e?.code||'COPY_FAILED',(insertionBlocked?'结果未确认，先检查草稿，不自动重试；':'')+
        '全文复制未确认：'+String(e?.message||e));}
    }
  }finally{
    copying=false;
    if(pendingSync)void sync().catch(logError);
    else if(originalWin)warmInsertion(originalWin,originalTarget?.profile);
  }
  if(result.status==='inserted'&&result.verified===true){
    await toast('已写入并读回完整正文 · 尚未发送','success');inputPhase('feedback');return;
  }
  if(result.status==='inserted'&&result.code==='PASTE_OBSERVED'&&result.verified===false&&result.actionState==='acknowledged'){
    await toast('已粘贴 · 尚未发送','success');inputPhase('feedback');return;
  }
  await toast(insertionBlocked?'结果未确认，先检查草稿；保留剪贴板，不自动重试。':
    '未写入（'+result.code+'）；已复制完整正文。','warning');
  if(demoAd)await notice('ad',demoAd);
}
async function calibrateInsertion(){
  if(calibrating||insertionBlocked)throw failure('INPUT_BLOCKED','写入已停止；请检查现有草稿并使用仅复制');
  if(editorModel(originalTarget?.profile)==='codex'&&originalTarget?.profile.inputMode!=='paste')
    throw failure('CODEX_EDITOR_UNQUALIFIED','Codex 输入区尚未资格化；提示词按钮会复制完整正文');
  const version=++calibrationVersion;viewVersion++;
  calibrating=true;inserter=null;invalidateComposer(true);
  try{
    // Match the script-local helper pattern already used by Flow Runner.
    const helper=File.join(Execution.scriptDir,'insert.js');
    if(!globalThis.OpenDeskPromptInsertion)(0,eval)(File.read(helper)+'\n//# sourceURL='+helper);
    if(manager)await manager.hide();
    if(bar)await bar.hide();
    await toast(originalTarget?.profile.scene==='claude-code'?
      '请切回 Claude Code 页面。4 秒后只读检查，不会输入。':
      '请切回目标应用，将鼠标停在输入框内。4 秒后只读校准，不会输入。');
    await System.delay(4000);
    if(stopping||version!==calibrationVersion)return;
    const api=globalThis.OpenDeskPromptInsertion;
    const win=await targetWindow();
    if(!win)throw failure('NO_CURRENT_TARGET','当前前台没有已确认的目标输入区');
    if(editorModel(originalTarget?.profile)==='codex'&&originalTarget?.profile.inputMode!=='paste')
      throw failure('CODEX_EDITOR_UNQUALIFIED','目标已切换至尚未资格化的 Codex；未校准输入区');
    const isClaude=originalTarget?.profile.scene==='claude-code',isCodex=editorModel(originalTarget?.profile)==='codex';
    const measured=isClaude||isCodex?
      await api.discoverRuntimeEditor({getTarget:targetWindow,...insertionScope(),
        ...(isClaude?{editorSelector:codeScene.editorSelector,maxDepth:64}:{editorDiscovery:originalTarget.profile.editorDiscovery})}):
      await api.calibrateRuntimeEditor({getTarget:targetWindow,...insertionScope()});
    if(stopping||version!==calibrationVersion)return;
    // Code qualification measures its composer on every observation; the
    // generic shallow tracker cannot reach this application's native editor.
    targets();composerTracker=isClaude||isCodex?null:OpenDeskPromptTargets.createComposerTracker({Accessibility,...measured});
    inserter=api.createRuntimeInserter({...insertionContext(win,originalTarget?.profile),...insertionScope(),...measured,
      inputMode:originalTarget?.profile.inputMode||'strict',editorModel:editorModel(originalTarget?.profile)});copyOnly=false;
    await rebuild();
    await toast(originalTarget?.profile.inputMode==='paste'?
      '已记录输入区。点击提示词将追加并读回，不会发送。':
      '已记录输入区。严格追加能力不可用；按钮会复制全文。','warning');
  }catch(e){
    if(manager&&!stopping)await manager.show();
    throw e;
  }finally{calibrating=false;await sync();}
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
      bar=new FloatingWindow({title:'OpenDesk · 提示词快捷栏',orientation:'vertical',theme:'dark',
        alwaysOnTop:true,draggable:true,position:{mode:'absolute',x:520,y:240}});
      bar.onError(logError);
      bar.addButton('settings','OpenDesk · 管理提示词与导入',
        {path:'assets/opendesk-logo.png',renderingMode:'original'},safe(openManager));
      for(let i=0;i<3;i++)bar.addButton('p'+i,'暂无提示词',{text:'空'},safe(async()=>{
        if(epoch===barId&&!barUpdating&&barReady&&barItems[i]){
          if(copyOnly)await copy(barItems[i].id);else await insertPrompt(barItems[i].id);
        }
      }));
      bar.addButton('next','下一组',{text:'下一'},safe(async()=>{
        if(epoch!==barId||barUpdating)return;
        barPage++;await rebuild();
      }));
      bar.on('move',e=>{void drag(e,epoch).catch(logError);});
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
        label:p?Array.from(Array.from(p.name||short).slice(0,24).join('')+
          (!copyOnly?' · 追加到输入框，不发送 · ':' · 点击复制全文 · ')+p.body).slice(0,60).join(''):
          '暂无提示词，请导入浏览器 JSON',
        icon:{text:p&&Array.from(short).length<=4?short:(p?String(barPage*3+i+1):'空')},badge:null});
      if(!current())return;
    }
    await panel.updateButton('next',{disabled:pages===1,label:'下一组（'+(barPage+1)+'/'+pages+'）',
      icon:{text:pages>1?'下一':'一页'},badge:null});
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
  const version=editVersion,id=editId;
  const accepted=!editDirty || await Dialog.confirm({title:'未保存修改',
    message:'放弃本次未保存的编辑？',confirmText:'放弃',cancelText:'继续编辑',defaultAction:'cancel'});
  return accepted&&version===editVersion&&id===editId;
}
async function closeEditor(panel,quit=false){
  if(closing)return;closing=true;
  let previous=null,completed=false;
  const controls=['body','label','name','enabled','bundleId','backup','save','close','quit'];
  try{
    if(!(await confirmDiscard()))return;
    const version=editVersion,id=editId;
    await Promise.all(controls.map(key=>panel.control(key).update({disabled:true})));
    if(manager!==panel||editVersion!==version||editId!==id)return;
    // Keep the in-memory draft until the clean checkpoint is confirmed. Native
    // input already in flight still advances editVersion and cancels closing.
    await checkpointRecovery({dirty:false,draft:null});
    if(manager!==panel||editVersion!==version||editId!==id){await checkpointRecovery();return;}
    previous={draft,editDirty};editDirty=false;draft=null;
    if(quit){
      stopping=true;invalidateComposer(true);for(const s of subscribers)s.unsubscribe();subscribers=[];
      if(dragTimer)clearTimeout(dragTimer);
      await closeNotices();if(bar)await bar.close();await ui.closeAll();
    }else await panel.close();
    completed=true;
  }finally{
    try{if(!completed){
      if(previous&&draft===null){draft=previous.draft;editDirty=previous.editDirty;}
      if(manager===panel){
        await Promise.all(controls.map(key=>panel.control(key).update({disabled:false})));
        await checkpointRecovery();
      }
    }}finally{closing=false;}
  }
}
async function message(s){if(manager)await manager.control('status').update({text:String(s).slice(0,250)});}
const sameTargetIdentity=(a,b)=>a&&b&&['id','pid','handle','exePath','width','height'].every(k=>a[k]===b[k]);
async function translateFollowing(win,valid){
  // Reuse only relative layout of an already visible, recently qualified scene
  // during a pure translation. Activation, resize, missing/closed toolbar and
  // scene invalidation always take the full qualification path.
  if(syncing||copying||!bar||!barReady||barUpdating||openingManager||calibrating||composerTracker||
      !originalTarget||!sameTargetIdentity(originalWin,win)||sameWindow(originalWin,win)||
      Date.now()-sceneVerifiedAt>=1000)return false;
  const panel=bar,epoch=barId,version=barVersion,view=viewVersion,targetEpoch=followEpoch,sceneRevision=sceneVersion,match=originalTarget;
  const current=()=>valid()&&panel===bar&&epoch===barId&&version===barVersion&&view===viewVersion&&
    targetEpoch===followEpoch&&sceneRevision===sceneVersion&&!syncing&&!copying&&!stopping&&!openingManager&&!calibrating;
  const state=await panel.getState();if(!current()||!state.visible||!state.onScreen)return false;
  if(manager&&(await manager.getState()).visible)return false;
  if(!current())return false;
  const scene=codeScene?{...codeScene,window:{...win}}:null;
  const pos=placement(win,state.bounds.height,targetOffset(match),true,scene);
  cancelDrag();expectedPosition=pos;
  await panel.setPosition(pos.x,pos.y);if(!current())return false;
  const fresh=await recheckTarget(win);if(!current())return false;
  if(!sameTargetIdentity(fresh,win))return false;
  const actual=await panel.getState();if(!current())return false;
  if(!actual.visible||!actual.onScreen||Math.abs(actual.bounds.x-pos.x)>1||Math.abs(actual.bounds.y-pos.y)>1)return false;
  // Geometry may continue changing while the exact read runs. This frame was
  // never hidden/re-shown; the next merged guard consumes the newer position.
  scopedObserved={...win};acceptTarget(win,match,scene);
  return true;
}
async function setFollowing(value){
  followEpoch++;scopedObserved=null;forgetInputTarget();
  sceneVersion++;
  cancelDrag();cancelFollowRetry();invalidateComposer();applicationSample=null;
  for(const s of subscribers)s.unsubscribe();subscribers=[];
  following=false;
  if(value===true){
    // Re-enabling is the explicit exact-scope reload boundary after a target
    // restart/configuration update; never silently follow a recycled PID.
    targetRegistry=null;
    try{targets();}catch(e){if(bar)await bar.hide();throw e;}
    following=true;
  }
  if(following&&(targets().scope||targets().scopes?.length)){
    let timer=null,closed=false,reading=false,wakePending=false,motionUntil=0;
    const sceneDirty=()=>sceneVersion!==sceneVerifiedVersion;
    const poll=(delay=250)=>{
      if(closed||stopping||!following)return;
      if(reading){wakePending=true;return;}
      if(timer!==null)clearTimeout(timer);
      timer=setTimeout(async()=>{
      timer=null;
      if(closed||stopping||!following)return;
      reading=true;
      // Keep the foreground/geometry guard running while a full scene read is
      // pending. It does no tree inspection or input qualification. A changed
      // lifetime invalidates late reads before hiding, moving or saving.
      const observedEpoch=followEpoch;
      try{
        const win=await targetWindow(false);
        traceFollowing('guard-confirmed',win);
        if(closed||stopping||!following||observedEpoch!==followEpoch)return;
        if(!sceneDirty()&&await translateFollowing(win,()=>!closed&&following&&observedEpoch===followEpoch)){
          motionUntil=Date.now()+250;return;
        }
        if(closed||stopping||!following||observedEpoch!==followEpoch)return;
        const changed=observeScopedWindow(win);
        const acceptedEpoch=followEpoch;
        if(changed){
          if(bar)await bar.hide();
          if(syncing)pendingSync=true;
        }
        if(!syncing){
          const state=bar?await bar.getState():null;
          if(closed||stopping||!following||acceptedEpoch!==followEpoch)return;
          // Native identity/geometry work is independent of full scene work.
          // A steady visible toolbar must not hide/show or rescan on every poll.
          // Periodic scene review remains necessary when app notifications omit
          // an in-window Code -> Cowork transition.
          const sceneDue=win&&targets().matchPid(win.pid)?.profile.scene==='claude-code'&&Date.now()-sceneVerifiedAt>=1000;
          // A hidden bar is expected while no configured app is foreground.
          // Keep its guard alive without replenishing short recovery retries.
          if(changed||win&&(state&&!state.visible||sceneDue||sceneDirty())){
            // Only a completed current qualification acknowledges this version
            // and advances sceneVerifiedAt. Deferral/cancellation cannot do so.
            void sync(false,{win,epoch:followEpoch}).catch(logError);
          }
        }
      }catch(e){
        if(closed||stopping||!following||observedEpoch!==followEpoch)return;
        followEpoch++;scopedObserved=null;forgetInputTarget();cancelDrag();
        originalWin=null;originalTarget=null;
        if(bar)await bar.hide();logError(e);
      }
      finally{
        reading=false;
        const delay=wakePending?0:Date.now()<motionUntil?33:250;wakePending=false;
        if(!closed&&!stopping&&following)poll(delay);
      }
    },delay);};
    subscribers.push({unsubscribe(){closed=true;if(timer!==null)clearTimeout(timer);timer=null;}});
    const scopes=targets().scopes?.length?targets().scopes:[targets().scope];
    for(const scope of scopes){
      if(typeof window.watchAppWindow!=='function')break;
      try{
        const subscription=window.watchAppWindow({pid:scope.pid,exePath:scope.exePath},event=>{
          if(closed||stopping||!following)return;
          const reasons=event.reasons||[event.reason];
          traceFollowing('native-hint',{pid:scope.pid},{reasons,active:event.active,
            nativeMonotonicMs:event.monotonicMs,capabilities:event.capabilities});
          const activation=reasons.includes('app-active-changed')||reasons.includes('app-activated');
          const initial=reasons.every(r=>['subscribed','capabilities-changed'].includes(r));
          const owner=originalWin?.pid||scopedObserved?.pid;
          // A floating nonactivating bar can sit above the still-foreground
          // target. Focus/layout notifications from clicking either surface do
          // not prove loss of that target; never turn them into hide/show.
          const repeatedActivation=event.active===true&&owner===scope.pid&&
            reasons.every(r=>r==='app-active-changed'||r==='app-activated'||r==='capabilities-changed');
          const translation=reasons.every(r=>r==='window-moved');
          // Registration status and duplicate activity do not invalidate the
          // target. A fresh query already running covers them; queuing another
          // scan here would delay the scene/presentation checks behind it.
          if((initial||repeatedActivation)&&reading)return;
          if(!initial&&!repeatedActivation&&!translation){
            if(owner===scope.pid||activation&&event.active===true){
              // Preserve a coalesced loss even if the last active hint is true.
              // Fresh window identity/geometry reads handle soft focus/resize
              // changes before scene qualification. Each hint fences old reads,
              // including Code trees that finish after an in-window page change.
              const lost=event.active===false||reasons.some(r=>['app-deactivated',
                'target-invalidated','app-terminated-changed','window-destroyed'].includes(r))||
                activation&&event.active===true&&owner!==scope.pid;
              sceneVersion++;cancelDrag();
              if(lost){
                followEpoch++;
                scopedObserved=null;forgetInputTarget();
                originalWin=null;originalTarget=null;
                if(bar)void bar.hide().catch(logError);
              }
              if(syncing)pendingSync=true;
            }
          }
          poll(reasons.every(r=>r==='window-moved'||r==='window-resized')?16:0);
        });
        subscribers.push(typeof subscription==='function'?{unsubscribe:subscription}:subscription);
        console.log('PROMPT_SHORTCUT_WATCH='+JSON.stringify({pid:scope.pid,capabilities:subscription.capabilities}));
      }catch(e){
        console.log('PROMPT_SHORTCUT_WATCH='+JSON.stringify({pid:scope.pid,backend:'polling',code:e.code||'BACKEND_FAILED'}));
      }
    }
    poll();
  }else if(following)for(const type of ['window.focused','window.moved','window.resized','window.closed',
    'window.created','display.changed','app.launched','app.terminated'])
    subscribers.push(Events.on(type,()=>{
      if(type==='app.launched'||type==='app.terminated'||type==='window.closed')applicationSample=null;
      void sync().catch(logError);
    }));
  else originalWin=null;
  await sync();
  if(manager)await manager.control('follow').update({text:following?'关闭窗口跟随':'开启窗口跟随'});
  await message(following?'已开启跟随；切回配置的目标应用后显示快捷栏':'独立复制模式；拖动顶部可移动快捷栏');
}
async function render(preserveDraft=false){
  if(!manager)return;
  // Record switches invalidate any field reads already in flight. Clear dirty
  // synchronously so input arriving during native updates remains unsaved.
  if(!preserveDraft){editVersion++;editDirty=false;}
  const version=editVersion;
  const items=data.prompts;page=clamp(page,0,Math.max(0,Math.ceil(items.length/6)-1));
  const updates=[manager.control('count').update({text:items.length+'条 · '+items.filter(p=>p.enabled).length+'启用'})];
  for(let i=0;i<6;i++){
    const p=items[page*6+i];
    updates.push(manager.control('row'+i).update({
      text:p?(p.enabled?'':'○ ')+(p.name||p.label||label(p.body)).slice(0,22):'还没有提示词',
      active:!!p&&p.id===editId,disabled:!p}));
  }
  updates.push(manager.control('prev').update({disabled:page===0}));
  updates.push(manager.control('next').update({disabled:(page+1)*6>=items.length}));
  updates.push(manager.control('copySelected').update({disabled:!items.some(p=>p.id===editId&&p.enabled)}));
  updates.push(manager.control('follow').update({text:following?'关闭窗口跟随':'开启窗口跟随'}));
  updates.push(manager.control('calibrate').update({disabled:insertionBlocked}));
  updates.push(manager.control('deliveryMode').update({text:insertionBlocked?'写入已停止 · 请核对草稿':
    !copyOnly?(editorModel(originalTarget?.profile)==='codex'&&originalTarget?.profile.inputMode!=='paste'?'Codex 严格输入不可用 · 点击复制全文':
      originalTarget?.profile.inputMode==='paste'?
      '追加到目标输入框 · 不发送 · 失败复制全文':'点击检查追加条件 · 失败复制全文'):'当前：复制模式'}));
  const chosen=items.find(p=>p.id===editId);
  if(!preserveDraft||!draft)draft={body:chosen?.body||'',label:chosen?.label||'',
    name:chosen?.name||'',enabled:chosen?chosen.enabled:true,
    bundleId:data.settings.appBundleId,backup:draft?.backup||''};
  for(const [key,value] of Object.entries(draft).filter(([key])=>key!=='enabled'))
    updates.push(manager.control(key).update({value}));
  updates.push(manager.control('enabled').update({checked:draft.enabled}));
  updates.push(manager.control('preview').update({text:'按钮预览：'+(draft.label||label(draft.body))}));
  await Promise.all(updates);
  if(editVersion!==version&&editDirty)await render(true);
  await checkpointRecovery();
}
async function openManager(){
  if(stopping)return;
  cancelDrag();invalidateComposer();
  viewVersion++;
  if(openingManager)return openingManager;
  if(manager){if(bar)await bar.hide();await render(true);await manager.show();return;}
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
    title:'OpenDesk · 提示词管理',theme:'dark',keyEvents:true,
    position:{mode:'anchor',size:{width:760,height:600},horizontal:'center',vertical:'center',display:'active'},
    content:{html:managerHTML,css:managerCSS}});
  manager=panel;page=0;
  if(!editId&&!editDirty)editId=data.prompts[0]?.id||null;
  if(bar)await bar.hide();
  panel.control('copySelected').on('click',safe(async()=>{
    if(editDirty){await message('编辑尚未保存，请先保存或放弃修改后复制');return;}
    if(editId)await copy(editId);
  }));
  panel.control('calibrate').on('click',safe(calibrateInsertion));
  panel.control('copyMode').on('click',safe(async()=>{
    calibrationVersion++;inserter=null;copyOnly=true;await rebuild();await render(true);await message('已切回仅复制；不会输入或发送');
  }));
  panel.control('follow').on('click',safe(async()=>{await setFollowing(!following);}));
  panel.on('close',safe(async()=>{
    if(manager!==panel)return;manager=null;viewVersion++;
    if(editDirty&&!stopping){
      // Closing during first show must not await that same creation promise.
      if(openingManager){recoverManager=true;return;}
      await openManager();await message('原生窗口已关闭；未保存编辑已恢复，请保存或明确放弃');
    }else if(!bar&&!stopping){
      stopping=true;invalidateComposer(true);for(const s of subscribers)s.unsubscribe();subscribers=[];
      await ui.closeAll();
    }else if(!stopping)await sync();
  },true));
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
    panel.control(key).on(key==='enabled'?'change':'input',async event=>{
      if(!draft)return;
      draft[key]=key==='enabled'?event.checked===true:String(event.value||'');
      if(key!=='backup'){editDirty=true;editVersion++;}
      void message('编辑尚未保存');
      if(['body','label','name'].includes(key))void panel.control('preview').update({
        text:'按钮预览：'+(draft.label||label(draft.body))});
      try{await checkpointRecovery();}catch(e){logError(e);await message('草稿恢复记录未确认；请保留窗口并重试保存');}
    });
  }
  panel.control('discard').on('click',safe(async()=>{
    if(await confirmDiscard()){await render();await message('已放弃编辑');}
  }));
  panel.control('save').on('click',safe(async()=>{
    const version=editVersion,selectedId=editId;
    const [b,l,n,e]=await Promise.all(['body','label','name','enabled']
      .map(key=>panel.control(key).getState()));
    if(editVersion!==version||editId!==selectedId)
      throw failure('EDIT_CHANGED','读取期间记录或草稿已变化；未保存，请核对当前编辑');
    const body=String(b.value||''),shortName=clean(l.value),name=clean(n.value),enabled=e.checked===true;
    if(!body.trim()||body.length>8192||body.includes('\0')||shortName.length>16||name.length>60)
      throw failure('INPUT','正文必填，最长8192字；标签/名称长度受限');
    if(shortName)label(shortName,true);
    const id=selectedId||uid();editId=id; // keep identity stable after a failed/unknown save
    await persist(next=>{
      const row={id,body,label:shortName,name,enabled};
      const i=next.prompts.findIndex(p=>p.id===id);
      if(i>=0)next.prompts[i]=row;
      else{if(next.prompts.length>=80)throw failure('FULL','最多80条');next.prompts.push(row);}
    });
    await render(editVersion!==version);await message('已保存并从文件读回'+
      (editDirty?'；保存期间的新编辑仍未保存':''));
  }));
  panel.control('delete').on('click',safe(async()=>{
    if(!editId)return;
    const id=editId,version=editVersion;
    if(!(await Dialog.confirm({title:'确认删除',message:'删除所选提示词？',
      confirmText:'删除',cancelText:'取消',defaultAction:'cancel'})))return;
    if(editVersion!==version||editId!==id)
      throw failure('EDIT_CHANGED','确认期间记录或草稿已变化；未删除');
    await persist(next=>{next.prompts=next.prompts.filter(p=>p.id!==id);});
    const changed=editVersion!==version;
    if(!changed)editId=null;
    await render(changed);await message('已删除'+(changed?'；操作期间的新编辑仍保留':''));
  }));
  for(const [name,step] of [['up',-1],['down',1]]){
    panel.control(name).on('click',safe(async()=>{
      const id=editId,version=editVersion;
      if(!id||!(await confirmDiscard())||editVersion!==version||editId!==id)return;
      await persist(next=>{
        const i=next.prompts.findIndex(p=>p.id===id),j=i+step;
        if(i>=0&&j>=0&&j<next.prompts.length)
          [next.prompts[i],next.prompts[j]]=[next.prompts[j],next.prompts[i]];
      });
      await render(editVersion!==version);await message('排序已保存');
    }));
  }
  panel.control('appSave').on('click',safe(async()=>{
    const id=clean((await panel.control('bundleId').getState()).value);
    cancelDrag();invalidateComposer(true);
    await persist(next=>{next.settings.appBundleId=id;});
    await render(true);await message('应用标识已保存；提示词编辑仍保留');
  }));
  panel.control('reset').on('click',safe(async()=>{
    cancelDrag();
    const owner=originalTarget||positionOwner;
    await persist(next=>{saveOffset(next.settings,owner,0,0);});
    await sync();await message('已重置左侧位置');
  }));
  panel.control('import').on('click',safe(async()=>{
    const version=editVersion;
    if(!(await confirmDiscard())||editVersion!==version)return;
    const path=clean((await panel.control('backup').getState()).value);
    if(!path||!path.endsWith('.json')&& !path.endsWith('.JSON')||
      (!path.startsWith('/')&&!/^[A-Za-z]:[\\/]/.test(path)))
      throw failure('PATH','需要本机 .json 文件绝对路径');
    const parsed=importBackup(await File.readJSON(path,{maxBytes:262144}));
    if(editVersion!==version)throw failure('EDIT_CHANGED','读取期间编辑已变化；未导入，保留新草稿');
    const exists=new Set(data.prompts.map(p=>bodyKey(p.body)));
    const n=parsed.prompts.filter(p=>{const key=bodyKey(p.body);
      if(exists.has(key))return false;exists.add(key);return true;}).length;
    const msg='备份'+parsed.prompts.length+'条，预计追加'+n+'条；重复正文跳过。'+
      (parsed.images.length?'\n第'+parsed.images.join('、')+
       '条是图片按钮：只保留文字正文，不能迁移图片资源。':'')+
      '\n确认后才写入，不覆盖现有提示词。';
    if(!(await Dialog.confirm({title:'导入预览',message:msg,
      confirmText:'确认追加',cancelText:'取消',defaultAction:'cancel'})))return;
    if(editVersion!==version)throw failure('EDIT_CHANGED','确认期间编辑已变化；未导入，保留新草稿');
    await persist(next=>{
      const keys=new Set(next.prompts.map(p=>bodyKey(p.body)));
      for(const p of parsed.prompts){
        if(keys.has(bodyKey(p.body)))continue;
        if(next.prompts.length>=80)throw failure('FULL','追加超过80条，未保存');
        next.prompts.push(p);keys.add(bodyKey(p.body));
      }
    });
    const changed=editVersion!==version;
    await render(changed);await message('导入已核验并读回'+(changed?'；操作期间的新编辑仍保留':''));
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
    console.log('CODEX_SHORTCUT_EXPORT='+path);
    await message('已导出 v2 备份至库目录，路径见运行日志；Browser 库限额 8 KiB。');
  }));
  panel.control('close').on('click',safe(()=>closeEditor(panel)));
  panel.control('reconcile').on('click',safe(reconcile));
  panel.control('quit').on('click',safe(()=>closeEditor(panel,true)));
  await render(editDirty&&!!draft);await panel.show();
}
async function main(keepAlive=true){
  const caps=ui.getCapabilities();
  if(!caps.enabled||!caps.available)
    throw failure('NO_UI','请使用 -ui 启动；'+(caps.reason||'UI 不可用'));
  console.log('CODEX_SHORTCUT_DATA='+FILE);
  console.log('CODEX_SHORTCUT_MODE='+(following?'FOLLOW':'DETACHED_COPY'));
  try{await initializeRecovery();
  await setFollowing(following);
  await rebuild();
  console.log('CODEX_SHORTCUT_READY='+JSON.stringify(await bar.getState()));
  if(startupMode==='copy'||data.prompts.length===0||resolution?.kind==='RECOVERED'){
    await openManager();
    console.log('CODEX_SHORTCUT_MANAGER_READY='+JSON.stringify(await manager.getState()));
    if(resolution?.kind==='RECOVERED')await message('已恢复异常退出前的草稿或待核对提交；先点“核对磁盘版本”，不会自动保存');
  }
  // Own-window wait retains the execution without observing other applications.
  // A closed toolbar may open the manager, and saving can create a new toolbar.
  while(keepAlive&&!stopping){
    if(openingManager)await openingManager;
    const panel=manager||bar;
    if(!panel)break;
    // A toolbar has no native lifecycle handle until its first show(). Keep
    // waiting for the configured target without flashing it over another app.
    if(panel===bar&&!(await panel.getState()).nativeWindowId){
      await System.delay(250);continue;
    }
    await panel.waitUntilClosed();
  }}finally{if(keepAlive){
    for(const s of subscribers)s.unsubscribe();subscribers=[];
    cancelFollowRetry();cancelDrag();invalidateComposer(true);
    if(recovery)await recovery.close();
  }}
}
await main();
