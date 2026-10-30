import React, { useEffect, useRef, useState } from 'react';
import { useWorkbench, businessProducts, businessManagementEntities } from '../state';
import { BUSINESS_LIMITS, effectiveEntities, entityKey, exportBusinessBackup, parseBusinessSnapshot, parseBusinessBackup, type Entity, type EntityKind } from '../domain/business';
import { businessFeedback } from '../domain/business-feedback';
import { listBusinessFiles, requestBusinessFile } from '../business-files';
import { BusinessMappings } from './BusinessMappings';

const kindNames:Record<EntityKind,string>={product:'商品',customer:'客户',image:'图片',order:'订单'};
const message=businessFeedback;

// Decode only domain-validated, bounded data URLs. No remote image requests.
async function decodeImage(url:string){
  await new Promise<void>((resolve,reject)=>{
    const image=new Image(),timer=setTimeout(()=>{image.src='';reject(Error('图片解码超时'));},3000);
    const finish=(error?:Error)=>{clearTimeout(timer);image.onload=null;image.onerror=null;error?reject(error):resolve();};
    image.onload=()=>finish(image.naturalWidth>BUSINESS_LIMITS.maxImageDimension||image.naturalHeight>BUSINESS_LIMITS.maxImageDimension||image.naturalWidth*image.naturalHeight>BUSINESS_LIMITS.maxImagePixels?Error('图片最多 4096 边长、400 万像素'):undefined);
    image.onerror=()=>finish(Error('图片无法解码，请重新导出有效的 PNG / JPEG / WebP'));
    image.src=url;
  });
}
async function decodeRecords(records:Entity[]){
  const deadline=Date.now()+10000;
  for(const e of records)if(e.kind==='image'&&e.data?.dataUrl){
    if(Date.now()>deadline)throw Error('图片批量校验超时，请减少单页图片数量');
    await decodeImage(e.data.dataUrl);
  }
}

function NativeFileList({kind,onSelect}:{kind:'json'|'image';onSelect:(name:string)=>void}){
  const [files,setFiles]=useState<{name:string;kind:'json'|'image';size:number}[]>([]),[status,setStatus]=useState('尚未刷新目录'),[busy,setBusy]=useState(false);
  const alive=useRef(true);useEffect(()=>()=>{alive.current=false;},[]);
  async function refresh(){setBusy(true);try{const result=await listBusinessFiles();if(alive.current){setFiles(result.files);setStatus(result.truncated?'文件较多，仅列前100项（处理上限500）；可手填已知文件名':'目录已刷新 · '+result.files.length+' 个可用文件');}}catch{if(alive.current)setStatus('目录读取失败，请检查固定业务目录和文件权限');}finally{if(alive.current)setBusy(false);}}
  return <div className="business-directory"><button type="button" disabled={busy} onClick={()=>void refresh()}>{kind==='image'?'刷新图片清单':'刷新文件清单'}</button>
    <select aria-label={kind==='image'?'选择本机图片文件':'选择本机业务文件'} defaultValue="" onChange={e=>{if(e.target.value)onSelect(e.target.value);}}><option value="">选择目录中的文件…</option>{files.filter(f=>f.kind===kind).map(f=><option key={f.name} value={f.name}>{f.name} · {Math.ceil(f.size/1024)} KiB</option>)}</select>
    <small role="status">{status}</small></div>;
}

export function BusinessScope(){
  const {state,dispatch}=useWorkbench();
  return <div className="business-scope">
    <label>数据店铺<select aria-label="数据店铺" value={state.storeId}
      onChange={e=>dispatch({type:'BUSINESS_STORE',storeId:e.target.value})}>
      {state.business.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}
    </select></label><span>{state.native?'未绑定聊天':'虚构会话 · 按店隔离'}</span>
  </div>;
}

function EntityEditor({record,kind,onClose}:{record:Entity|null;kind:EntityKind;onClose:()=>void}){
  const {state,dispatch}=useWorkbench(),products=businessProducts(state);
  const editingEpoch=useRef(state.businessEpoch),imageRead=useRef(0);
  useEffect(()=>()=>{imageRead.current++;},[]);
  useEffect(()=>{imageRead.current++;setReading(false);},[state.businessEpoch]);
  const data=(record?.data||{}) as Record<string,unknown>;
  const [id,setId]=useState(record?.id||''),[name,setName]=useState(String(data.name||data.label||''));
  const [sku,setSku]=useState(String(data.sku||'')),[price,setPrice]=useState(String(data.price||'¥0'));
  const [category,setCategory]=useState(String(data.category||'自定义')),[model,setModel]=useState(String(data.model||''));
  const [summary,setSummary]=useState(String(data.summary||data.notes||''));
  const [tags,setTags]=useState(Array.isArray(data.tags)?data.tags.join('、'):'');
  const [conversationId,setConversation]=useState(String(data.conversationId||''));
  const [productId,setProductId]=useState(String(data.productId||(record?products[0]:products.find(p=>effectiveEntities(state.business,state.storeId,'product').find(e=>e.id===p.id)?.sourceId==='local'))?.id||''));
  const imageProducts=products.filter(p=>!!record||effectiveEntities(state.business,state.storeId,'product').find(e=>e.id===p.id)?.sourceId==='local');
  const p=products.find(p=>p.id===productId);
  const [imageId,setImageId]=useState(String(data.imageId||p?.images[0]?.id||'front'));
  const [dataUrl,setDataUrl]=useState(typeof data.dataUrl==='string'?data.dataUrl:null);
  const [error,setError]=useState(''),[reading,setReading]=useState(false);
  const [imageName,setImageName]=useState('support-image.png');
  const sourceId=record?.sourceId||(kind==='image'?
    effectiveEntities(state.business,state.storeId,'product').find(e=>e.id===productId)?.sourceId||'local':'local');
  function save(event:React.FormEvent){
    event.preventDefault();setError('');
    if(editingEpoch.current!==state.businessEpoch){setError('业务资料已变更，请关闭表单后重新打开再编辑');return;}
    const now=new Date().toISOString();
    let payload:unknown;
    if(kind==='product')payload={...(record?.data||{}),id,name,sku,price,category,model:model||sku,summary,
      specs:(data.specs||[]),imageType:data.imageType||'bag',color:data.color||'#5579a0',
      images:data.images||[{id:'front',label:'正面'}],source:String(data.source||'本地人工维护'),updated:now.slice(0,10)};
    else if(kind==='customer')payload={name,conversationId:conversationId||null,tags:tags.split(/[、,，]/).map(x=>x.trim()).filter(Boolean),notes:summary};
    else payload={productId,imageId,label:name,dataUrl};
    dispatch({type:'BUSINESS_SAVE',storeId:state.storeId,epoch:state.businessEpoch,
      entity:{storeId:state.storeId,sourceId,kind,id,version:record?.version||1,updatedAt:now,deleted:false,data:payload} as Entity});
  }
  async function imageFile(file?:File){
    if(!file)return;
    const request=++imageRead.current;setReading(true);setError('');
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>BUSINESS_LIMITS.maxImageBytes)throw Error('仅支持 128KB 内 PNG / JPEG / WebP 图片');
      const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});
      await decodeImage(value);
      if(request===imageRead.current)setDataUrl(value);
    }catch(error){if(request===imageRead.current)setError(message(error));}finally{if(request===imageRead.current)setReading(false);}
  }
  async function nativeImage(){
    const request=++imageRead.current;setReading(true);setError('');
    try{
      const result=await requestBusinessFile('image',{name:imageName});
      await decodeImage(result.text!);if(request===imageRead.current)setDataUrl(result.text!);
    }catch(error){if(request===imageRead.current)setError(message(error));}finally{if(request===imageRead.current)setReading(false);}
  }
  return <form className="business-editor" onSubmit={save} aria-label={'维护'+kindNames[kind]}>
    <div className="between"><strong>{record?'编辑':'新增'}{kindNames[kind]}</strong><button type="button" onClick={onClose}>关闭表单</button></div>
    <label>规范 ID<input aria-label="资料 ID" required maxLength={80} value={id} disabled={!!record} onChange={e=>setId(e.target.value)} placeholder="字母、数字、横线或下划线"/></label>
    <label>{kind==='image'?'图片名称':'名称'}<input aria-label="资料名称" required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
    {kind==='product'&&<>
      <label>SKU<input aria-label="商品 SKU" required maxLength={80} value={sku} onChange={e=>setSku(e.target.value)}/></label>
      <div className="business-form-row"><label>分类<input aria-label="商品分类" maxLength={80} value={category} onChange={e=>setCategory(e.target.value)}/></label>
        <label>型号<input aria-label="商品型号" maxLength={80} value={model} onChange={e=>setModel(e.target.value)}/></label></div>
      <label>参考价（¥，非实时）<input aria-label="价格说明" required placeholder="¥99.00" maxLength={32} value={price} onChange={e=>setPrice(e.target.value)}/></label>
    </>}
    {kind==='customer'&&<>
      <label>测试会话映射<select aria-label="测试会话映射" value={conversationId} onChange={e=>setConversation(e.target.value)}>
        <option value="">未映射</option>{state.threads.map(t=><option key={t.id} value={t.id}>{t.name} · {t.id}</option>)}</select></label>
      <small>只关联虚构会话槽，不授予真实聊天权限；一个会话仅映射一位客户。</small>
      <label>标签<input aria-label="客户标签" maxLength={500} value={tags} onChange={e=>setTags(e.target.value)} placeholder="用顿号分隔"/></label>
    </>}
    {kind!=='image'&&<label>{kind==='product'?'资料说明':'客户备注'}<textarea aria-label="资料说明" maxLength={2000} value={summary} onChange={e=>setSummary(e.target.value)}/></label>}
    {kind==='image'&&<>
      <label>关联商品<select aria-label="图片关联商品" value={productId} onChange={e=>{setProductId(e.target.value);setImageId(products.find(p=>p.id===e.target.value)?.images[0]?.id||'');}}>
        {imageProducts.filter(p=>!record||effectiveEntities(state.business,state.storeId,'product').find(e=>e.id===p.id)?.sourceId===sourceId).map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
      </select></label>
      <label>图片位置<select aria-label="图片位置" value={imageId} onChange={e=>setImageId(e.target.value)}>
        {p?.images.map(im=><option key={im.id} value={im.id}>{im.label} · {im.id}</option>)}
      </select></label>
      {state.native?<><NativeFileList kind="image" onSelect={setImageName}/><label>本机图片文件名<input aria-label="本机图片文件名" maxLength={128} value={imageName} onChange={e=>setImageName(e.target.value)}/></label>
        <small>从业务工作目录的 .runtime/business-sync/ 读取，支持 128KB 内 PNG / JPEG / WebP。</small>
        <button type="button" disabled={reading} onClick={()=>void nativeImage()}>读取本机商品图片</button></>:
        <label className="business-file">选择本地图片<input aria-label="选择本地商品图片" type="file" accept="image/png,image/jpeg,image/webp" disabled={reading} onChange={e=>void imageFile(e.target.files?.[0])}/></label>}
      {dataUrl&&<img className="business-image-preview" src={dataUrl} alt="待保存的本地商品图片"/>}
      {!imageProducts.length&&<small>请先新增本地商品；已有来源图片请在图片列表点编辑。</small>}
      <small>图片不会上传。无本地图片时显示程序示意图；来源归关联商品，替换前请核对版权和内容。</small>
    </>}
    <small>来源 {sourceId} · {record?'保存为本地覆盖，保留来源原件':'新资料需人工核实'}。订单由数据源只读导入。</small>
    {(error||/失败/.test(state.businessStatus))&&<p role="status" className="business-error">{error||state.businessStatus}</p>}
    <button className="primary" type="submit" disabled={reading||kind==='order'||kind==='image'&&(!productId||!imageId)}>{reading?'正在读取图片':'保存本地资料'}</button>
  </form>;
}

export function BusinessData(){
  const {state,dispatch,workspace}=useWorkbench();
  const [kind,setKind]=useState<EntityKind>('product'),[query,setQuery]=useState('');
  const [editor,setEditor]=useState<{record:Entity|null;kind:EntityKind}|null>(null);
  const [busy,setBusy]=useState(false),[backupStatus,setBackupStatus]=useState('');
  const [nativeName,setNativeName]=useState('multistore-v1.json');
  const readId=useRef(0);
  const [newStoreId,setNewStoreId]=useState(''),[newStoreName,setNewStoreName]=useState('');
  const [open,setOpen]=useState(true),[sourcesOpen,setSourcesOpen]=useState(false),[storeOpen,setStoreOpen]=useState(false);
  useEffect(()=>{readId.current++;setBusy(false);},[state.businessEpoch]);
  useEffect(()=>{setEditor(null);setQuery('');setBackupStatus('');},[state.storeId]);
  const entities=businessManagementEntities(state);
  const rows=entities.filter(e=>e.kind===kind&&JSON.stringify([e.id,e.data]).toLowerCase().includes(query.trim().toLowerCase()));
  const sourceIds=Array.from(new Set([...state.business.records,...state.business.overrides].filter(e=>e.storeId===state.storeId).map(e=>e.sourceId)));
  async function readBusinessText(load:()=>Promise<string>,restore=false){
    const {storeId,businessEpoch:epoch}=state;
    const request=++readId.current;
    setBusy(true);setBackupStatus('');
    try{
      const text=await load();
      const records=restore?(()=>{const backup=parseBusinessBackup(text);return [...backup.records,...backup.overrides];})():parseBusinessSnapshot(text).records;
      await decodeRecords(records);
      if(request!==readId.current)return;
      if(restore){
        if(!window.confirm('恢复将替换业务资料及同步游标，本轮未导出的修改会丢失。聊天和授权不会从备份恢复。继续恢复？'))return;
        setEditor(null);
        dispatch({type:'BUSINESS_RESTORE',text,epoch});
      }else dispatch({type:'BUSINESS_PREVIEW',text,storeId,epoch});
    }catch(error){if(request===readId.current)dispatch({type:'BUSINESS_ERROR',storeId,epoch,message:'读取失败：'+message(error)});}finally{if(request===readId.current)setBusy(false);}
  }
  function fileRead(file:File|undefined,restore=false){
    if(!file)return;
    return readBusinessText(async()=>{
      if(!file.name.toLowerCase().endsWith('.json')||file.size>(restore?BUSINESS_LIMITS.maxBackupBytes:BUSINESS_LIMITS.maxSnapshotBytes))throw Error('请选择限制内的 JSON 文件（同步页 1MB，备份 8MB）');
      return file.text();
    },restore);
  }
  function nativeRead(restore=false){
    return readBusinessText(async()=>(await requestBusinessFile(restore?'restore':'snapshot',{name:nativeName})).text!,restore);
  }
  async function backup(){
    const request=++readId.current;
    setBackupStatus('');
    try{
      const content=exportBusinessBackup(state.business);
      if(state.native){
        setBusy(true);
        const result=await requestBusinessFile('backup',{text:content});
        if(request!==readId.current)return;
        setBackupStatus('已保存业务备份：.runtime/business-sync/'+result.name+'；未包含聊天或授权。');
        return;
      }
      const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='opendesk-business-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setBackupStatus('已请求下载业务备份，请核对下载文件；未包含聊天或授权。');
    }catch(error){if(request===readId.current)setBackupStatus('备份失败：'+message(error));}finally{if(request===readId.current)setBusy(false);}
  }
  return <section className="business-data" id="business-data"><button className="business-heading" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>业务数据与同步</button>{open&&<>
    <p>本地资料管理者视图：显示所选整店资料，备份含所有店铺。独立于聊天授权，不授予真实聊天绑定或订单操作权限。本例假定当前电脑操作者持有这些资料；多人系统须另接服务端权限。</p>
    <p>所有资料需人工核实。工作区保存仅含业务资料；聊天、授权和自动托管不保存。</p>
    <section className="business-workspace" aria-label="本地业务工作区">
      <strong>本地工作区 · {workspace.dirty?'有未保存资料':'当前资料已保存'}</strong>
      <small>{state.native?'本机文件存储 · 固定业务目录 · 最多保留3版本':'浏览器IndexedDB · 仅当前浏览器与origin · 最多保留3版本；不是JSON文件备份'}</small>
      <label><input type="checkbox" aria-label="启用自动保存" checked={workspace.auto} disabled={workspace.busy} onChange={e=>workspace.enableAuto(e.target.checked)}/>启用自动保存（本次启动）</label>
      <button type="button" disabled={workspace.busy||busy} onClick={()=>void workspace.save()}>保存工作区</button>
      <button type="button" disabled={workspace.busy||busy} onClick={()=>void workspace.refresh()}>刷新工作区版本</button>
      {workspace.index?.versions.map(v=><div className="business-version" key={v.id}><small>版本 {v.generation} · {v.valid?'业务修订 '+v.revision:'损坏或不兼容，保留其他版本'}</small>
        <button type="button" aria-label={'恢复工作区版本 '+v.generation} disabled={!v.valid||workspace.busy||busy} onClick={()=>{setEditor(null);void workspace.restore(v.id,v.generation,async data=>decodeRecords([...data.records,...data.overrides]));}}>恢复此版本</button></div>)}
      <p role="status" className="workspace-status">{workspace.status}</p>
      <small>恢复前完整校验并确认。关闭前保存或导出备份；浏览器和.runtime均可能被清理，不是长期归档。</small>
    </section>
    <div className="business-counts">{(Object.keys(kindNames) as EntityKind[]).map(k=><span key={k}>{kindNames[k]} {entities.filter(e=>e.kind===k).length}</span>)}</div>
    <BusinessMappings key={state.storeId}/>
    <div className="business-sources"><button type="button" aria-expanded={sourcesOpen} onClick={()=>setSourcesOpen(!sourcesOpen)}>来源与已应用游标</button>{sourcesOpen&&<>{sourceIds.map(source=><p key={source}><b>{source}</b><code>{state.business.cursors[JSON.stringify([state.storeId,source])]||'尚无已应用游标'}</code></p>)}
      <small>游标由确认应用更新。CLI 生成文件不表示界面已同步；从这里的游标继续拉取下一页。</small></>}</div>
    {state.native?<div className="business-native-files"><p>文件目录：业务工作目录的 <code>.runtime/business-sync/</code>。仓库示例使用仓库根，可搬移包使用 App 根。放入文件后填写文件名，不含路径。</p>
      <NativeFileList kind="json" onSelect={setNativeName}/><label>本机文件名<input aria-label="本机文件名" maxLength={128} value={nativeName} onChange={e=>setNativeName(e.target.value)}/></label>
      <button type="button" disabled={busy||workspace.busy} onClick={()=>void nativeRead()}>读取本机同步页</button>
      <button type="button" disabled={busy||workspace.busy} onClick={()=>void nativeRead(true)}>恢复本机业务备份</button></div>:
      <label className="business-file">导入同步页（先预检）<input type="file" aria-label="导入业务同步页" accept=".json,application/json" disabled={busy}
        onChange={e=>{void fileRead(e.target.files?.[0]);e.target.value='';}}/></label>}
    <div className="business-backup"><button disabled={busy} onClick={()=>void backup()}>导出业务备份</button>{!state.native&&<label className="business-file">恢复业务备份<input type="file" aria-label="恢复业务备份" accept=".json,application/json" disabled={busy}
      onChange={e=>{void fileRead(e.target.files?.[0],true);e.target.value='';}}/></label>}</div>
    {backupStatus&&<p role="status">{backupStatus}</p>}
    {state.businessPreview&&<div className="business-import-review" aria-label="业务同步预检">
      <strong>{state.businessPreview.snapshot.sourceId} · 预检通过，尚未应用</strong>
      <small>店铺：{state.businessPreview.snapshot.storeId} · 基于业务修订 {state.businessPreview.baseRevision}</small>
      <p>新增 {state.businessPreview.added} · 更新 {state.businessPreview.updated} · 删除 {state.businessPreview.deleted} · 不变 {state.businessPreview.unchanged}</p>
      <small>前置游标：{state.businessPreview.snapshot.previousCursor||'首次'} → 下一游标：{state.businessPreview.snapshot.cursor}</small>
      <button className="primary" disabled={busy} onClick={()=>dispatch({type:'BUSINESS_APPLY'})}>确认应用同步页</button>
      <button disabled={busy} onClick={()=>dispatch({type:'BUSINESS_CANCEL'})}>取消同步预检</button>
    </div>}
    <p role="status" className="business-status">{busy?'正在读取文件…':state.businessStatus||'尚未导入外部同步页'}</p>
    <div className="business-controls"><select aria-label="管理资料类型" value={kind} onChange={e=>{setKind(e.target.value as EntityKind);setEditor(null);}}>
      {(Object.keys(kindNames) as EntityKind[]).map(k=><option key={k} value={k}>{kindNames[k]}</option>)}</select>
      <button disabled={kind==='order'} onClick={()=>setEditor({record:null,kind})}>新增{kindNames[kind]}</button></div>
    <input className="business-search" type="search" aria-label="搜索管理资料" placeholder="搜索 ID / 名称 / SKU" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="business-records">{rows.length?rows.slice(0,100).map(e=>{
      const d=e.data as {name?:string;label?:string;status?:string},override=state.business.overrides.some(o=>entityKey(o)===entityKey(e));
      return <div className="business-record" key={entityKey(e)}><strong>{d.name||d.label||e.id}</strong><small>{e.id} · {e.sourceId} · v{e.version} · 待核实{override?' · 本地覆盖':''}</small><small>{e.updatedAt}</small>
        {kind!=='order'&&<button onClick={()=>setEditor({record:e,kind:e.kind})} aria-label={'编辑资料 '+e.id}>编辑</button>}
        {kind!=='order'&&<button onClick={()=>{if(window.confirm('停用此资料？有关联订单或图片时会拒绝。'))dispatch({type:'BUSINESS_SAVE',storeId:state.storeId,epoch:state.businessEpoch,entity:{...e,deleted:true,data:null,updatedAt:new Date().toISOString()} as Entity});}}>停用</button>}
        {override&&<button onClick={()=>{if(window.confirm('放弃此资料的本地覆盖并恢复来源？'))dispatch({type:'BUSINESS_REVERT',key:entityKey(e),storeId:state.storeId});}}>恢复来源</button>}
      </div>;
    }):<p>没有匹配资料。{kind==='order'?'请通过受信任接入脚本导入订单。':'可以新增本地资料。'}</p>}{rows.length>100&&<small>仅显示前 100 条，请搜索缩小范围。</small>}</div>
    {state.business.overrides.filter(e=>e.storeId===state.storeId&&e.deleted).map(e=><div className="business-record" key={entityKey(e)}><small>已本地停用 {e.id}</small><button onClick={()=>dispatch({type:'BUSINESS_REVERT',storeId:state.storeId,key:entityKey(e)})}>恢复已停用资料 {e.id}</button></div>)}
    {editor&&<EntityEditor key={state.storeId+':'+editor.kind+':'+(editor.record?.id||'new')} {...editor} onClose={()=>setEditor(null)}/>}
    <button type="button" aria-expanded={storeOpen} onClick={()=>setStoreOpen(!storeOpen)}>新增店铺</button>{storeOpen&&<form className="business-editor" onSubmit={e=>{e.preventDefault();dispatch({type:'BUSINESS_ADD_STORE',id:newStoreId,name:newStoreName});}}>
      <label>店铺 ID<input required aria-label="新增店铺 ID" maxLength={80} value={newStoreId} onChange={e=>setNewStoreId(e.target.value)}/></label>
      <label>店铺名称<input required aria-label="新增店铺名称" maxLength={160} value={newStoreName} onChange={e=>setNewStoreName(e.target.value)}/></label>
      <button type="submit">保存店铺</button></form>}
    <p className="business-help">接入开发者可用 integrations/demo-adapter.mjs 替换 pull、normalize、afterSync。脚本在可信本地 Node 中运行，界面不执行上传脚本，也不保存 API 密钥。</p>
  </>}</section>;
}
