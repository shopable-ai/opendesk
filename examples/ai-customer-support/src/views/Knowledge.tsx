import React, { useState } from 'react';
import { ListFilter, Upload } from 'lucide-react';
import { useWorkbench } from '../state';
import { parseKnowledgeFile } from '../domain/knowledge';
import { IconButton, PanelScroll } from '../components/Common';

export function KnowledgeView(){
  const {state,dispatch}=useWorkbench();
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),
    [source,setSource]=useState('all'),[scope,setScope]=useState('all'),
    [expanded,setExpanded]=useState<string[]>([]),[filterOpen,setFilterOpen]=useState(false),
    [uploadOpen,setUploadOpen]=useState(false),[status,setStatus]=useState('');
  const sources=Array.from(new Set(state.knowledge.map(k=>k.source))).sort();
  const selectedSource=sources.includes(source)?source:'all';
  const visible=state.knowledge.filter(k=>
    [k.q,k.question,k.a,k.source,...k.aliases].join(' ').toLowerCase().includes(query.toLowerCase().trim()) &&
    (filter==='all'||(filter==='enabled')===k.enabled) &&
    (selectedSource==='all'||selectedSource===k.source) &&
    (scope==='all'||(scope==='通用'?!k.scope:!!k.scope)));
  async function importFile(file?:File){
    if(!file)return;
    try{
      if(file.size>262144)throw Error('文件超过 256KB');
      const nextId=Math.max(...state.knowledge.map(k=>Number(k.id.replace(/^k/,''))||0),0);
      const rows=parseKnowledgeFile(await file.text(),file.name,state.knowledge.length,nextId);
      dispatch({type:'IMPORT_KNOWLEDGE',entries:rows});setUploadOpen(false);setStatus('导入 '+rows.length+' 条');
    }catch(error){const msg=error instanceof Error?error.message:'文件格式错误';setStatus('导入失败');dispatch({type:'TOAST',message:'导入失败：'+msg});}
  }
  return <PanelScroll>
    <div className="searchbar">
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)} aria-label="搜索知识库问题答案同义问题和来源" placeholder="搜索问题、答案、同义问题或来源"/>
      <IconButton icon={ListFilter} title="筛选知识" onClick={()=>setFilterOpen(x=>!x)}/>
      <IconButton icon={Upload} title="导入知识" onClick={()=>setUploadOpen(x=>!x)}/>
      {filterOpen&&<div className="pop">
        <b>状态</b><div className="pills">{[['all','全部'],['enabled','已启用'],['disabled','已停用']].map(([v,l])=>
          <button key={v} className={filter===v?'on':''} onClick={()=>setFilter(v)}>{l}</button>)}</div>
        <b>来源</b><select aria-label="来源" value={selectedSource} onChange={e=>setSource(e.target.value)}>
          <option value="all">所有来源</option>{sources.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <b>适用范围</b><select aria-label="筛选适用范围" value={scope} onChange={e=>setScope(e.target.value)}>
          {['all','通用','特定场景'].map(s=><option key={s} value={s}>{s==='all'?'全部范围':s}</option>)}</select>
        <button className="tool" onClick={()=>{setFilter('all');setSource('all');setScope('all');setFilterOpen(false);}}>清除筛选</button>
      </div>}
    </div>
    {uploadOpen&&<div className="import" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void importFile(e.dataTransfer.files[0]);}}>
      拖入 JSON / Markdown 文件<div>仅页面内存，不上传</div>
      <label>选择本地文件<input aria-label="选择知识文件" type="file" accept=".json,.md,.markdown" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
    </div>}
    <div className="between tiny grey" style={{margin:'11px 0 0'}}><span>找到 {visible.length} 条 · 共 {state.knowledge.length} 条知识</span><span>{status}</span></div>
    <p className="kb-instruction">点击条目可查看完整答案、同义问题、数据来源与托管资格</p>
    <div>{visible.length===0?<p className="kb-empty">没有符合当前搜索与筛选条件的知识。</p>:visible.map(k=>{
      const open=expanded.includes(k.id);
      return <article className={'kb-rich-entry'+(k.enabled?'':' disabled')} key={k.id}>
        <button type="button" className="kb-rich-row" aria-expanded={open} onClick={()=>setExpanded(ids=>open?ids.filter(id=>id!==k.id):[...ids,k.id])}>
          <span className="kb-rich-main"><strong className="kb-rich-title">{k.q}</strong>
            <span className="kb-rich-summary">{k.a}</span><span className="kb-rich-tags">
              <span className={'kb-tag '+(k.enabled?'enabled':'disabled')}>{k.enabled?'启用':'停用'}</span>
              <span className="kb-tag muted-tag">{k.category}</span><span className="kb-tag muted-tag">{k.scope||'通用'}</span>
            </span></span><span className="kb-rich-chevron">{open?'⌄':'›'}</span></button>
        {open&&<div className="kb-rich-detail">
          {([['完整答案',k.a],['同义问题',k.aliases.join('、')||'暂无同义问题'],['数据来源',k.source],
            ['托管资格',k.eligible&&k.enabled&&!k.scope?k.eligibility:k.eligibility||'暂不参与自动托管']] as const).map(([label,value])=>
            <div className="kb-rich-field" key={label}><strong>{label}</strong><p>{value}</p></div>)}
        </div>}
      </article>;
    })}</div>
  </PanelScroll>;
}
