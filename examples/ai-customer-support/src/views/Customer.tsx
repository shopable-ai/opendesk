import React, { useEffect, useState } from 'react';
import { ExternalLink, ListFilter, Sparkles, Upload } from 'lucide-react';
import { useWorkbench } from '../state';
import { isCustomerId, type CustomerId } from '../domain/catalog';
import { parseHistoryFile, profileMarkdown, type FactStatus } from '../domain/history';
import { IconButton, PanelScroll, useCopy } from '../components/Common';

type Page='detail'|'directory';
type DocMode='render'|'source';
const statuses: [FactStatus,string][]=[['confirmed','已确认信息'],['candidate','待核实线索'],['dismissed','已忽略信息']];
const named=(id:string,region:boolean,threads:{id:string;name:string}[])=>{
  const t=threads.find(t=>t.id===id);
  return (t?.name||id)+(region?' · 演示地区':'');
};
export function CustomerView(){
  const {state,dispatch}=useWorkbench(),copy=useCopy();
  const [page,setPage]=useState<Page>('detail'),[selected,setSelected]=useState<CustomerId>('t1');
  const [docMode,setDocMode]=useState<DocMode>('render'),[query,setQuery]=useState(''),[directoryQuery,setDirectoryQuery]=useState('');
  const [filter,setFilter]=useState('all'),[dirFilter,setDirFilter]=useState('all'),[dirFilterOpen,setDirFilterOpen]=useState(false);
  const [expanded,setExpanded]=useState<string[]>([]),[importOpen,setImportOpen]=useState(false),[importStatus,setImportStatus]=useState('');
  const [externalOpen,setExternalOpen]=useState(false),[externalUrl,setExternalUrl]=useState('');
  const [links,setLinks]=useState<Record<string,string>>({});
  useEffect(()=>{
    setPage('detail');setSelected(state.threadId);setDocMode('render');setExternalOpen(false);
    setExpanded([]);setDirFilterOpen(false);
  },[state.threadId]);
  const name=named(selected,state.nicknameMode==='region',state.threads);
  const allFacts=state.facts.filter(f=>f.customerId===selected);
  const history=state.history[selected]||[];
  const customerMessages=history.flatMap(session=>session.messages.filter(m=>m.role==='customer')
    .map(m=>({...m,sessionId:session.sessionId})));
  const confirmed=allFacts.filter(f=>f.status==='confirmed').length;
  const candidates=allFacts.filter(f=>f.status==='candidate').length;
  const facts=allFacts.filter(f=>(filter==='all'?f.status!=='dismissed':f.status===filter)&&
    [f.category,f.value,f.evidence,f.sessionId].join(' ').toLowerCase().includes(query.toLowerCase().trim()));
  const markdown=profileMarkdown(name,selected,state.threadId,state.history,state.facts);
  const matches=state.threads.filter(t=>{
    const fs=state.facts.filter(f=>f.customerId===t.id);
    const excerpts=state.history[t.id].flatMap(s=>s.messages.map(m=>m.text)).join(' ');
    const search=[t.name,t.id,...fs.map(f=>f.value),excerpts].join(' ').toLowerCase().includes(directoryQuery.toLowerCase().trim());
    const status=dirFilter==='all'||(dirFilter==='current'&&t.id===state.threadId)||
      (dirFilter==='confirmed'&&fs.some(f=>f.status==='confirmed'))||
      (dirFilter==='candidate'&&fs.some(f=>f.status==='candidate'));
    return search&&status;
  });
  async function importFile(file?:File){
    if(!file)return;
    try{
      if(file.size>524288||!file.name.toLowerCase().endsWith('.json'))throw Error('仅支持 512KB 以内的历史演示 JSON');
      const history=parseHistoryFile(await file.text());
      dispatch({type:'IMPORT_HISTORY',history});setImportStatus('已导入，请点击 ✦ 提取关键信息');
    }catch(e){const message=e instanceof Error?e.message:'格式错误';setImportStatus('导入失败：'+message);dispatch({type:'TOAST',message:'客户历史未导入：'+message});}
  }
  function selectCustomer(id:string){
    if(!isCustomerId(id))return;
    setSelected(id);setPage('detail');setDocMode('render');setExpanded([]);setFilter('all');setQuery('');
  }
  function handleExternal(){
    const url=links[selected];
    if(url){window.open(url,'_blank','noopener,noreferrer');return;}
    setExternalOpen(open=>!open);
  }
  function saveExternal(){
    try{
      const address=new URL(externalUrl.trim());
      if(address.protocol!=='https:'||!address.hostname||address.username||address.password||externalUrl.length>2048)throw Error('invalid');
      setLinks(old=>({...old,[selected]:address.href}));setExternalOpen(false);
      window.open(address.href,'_blank','noopener,noreferrer');
      dispatch({type:'TOAST',message:'已请求打开外部编辑页面，不传输档案数据'});
    }catch{dispatch({type:'TOAST',message:'请输入安全的 HTTPS 编辑地址'});}
  }
  function clear(){
    if(!window.confirm('确认清空 '+name+' 的演示历史和提取信息？此操作不可撤销，但不影响其他客户。'))return;
    dispatch({type:'CLEAR_PROFILE',customerId:selected});
    dispatch({type:'TOAST',message:'当前客户演示档案已清空'});
  }
  return <PanelScroll className="profile-scroll">
    {page==='directory'?<section className="profile-screen" aria-label="客户档案列表">
      <div className="profile-directory-toolbar">
        <label className="profile-directory-search"><span aria-hidden="true">⌕</span>
          <input aria-label="搜索全部客户档案" type="search" value={directoryQuery} onChange={e=>setDirectoryQuery(e.target.value)} placeholder="搜索客户或档案内容"/></label>
        <div className="profile-directory-filter-wrap">
          <button className="profile-directory-filter-button" type="button" aria-label="筛选客户" aria-expanded={dirFilterOpen} onClick={()=>setDirFilterOpen(v=>!v)}>
            <ListFilter size={16}/></button>
          {dirFilterOpen&&<div className="profile-directory-filter-popover" role="group" aria-label="客户档案筛选">
            <strong>筛选客户</strong>{([['all','全部客户'],['confirmed','有已确认信息'],['candidate','有待核实线索'],['current','仅当前会话']] as const)
              .map(([value,label])=><button type="button" key={value} className={dirFilter===value?'on':''} aria-pressed={dirFilter===value}
                onClick={()=>{setDirFilter(value);setDirFilterOpen(false);}}>{label}</button>)}</div>}
        </div>
      </div>
      <div className="profile-directory-meta"><span className="profile-directory-count">找到 {matches.length} 位 · 共 {state.threads.length} 位</span>
        <button className="profile-nav-link" onClick={()=>selectCustomer(state.threadId)}>当前会话</button></div>
      <div className="profile-directory-list">{matches.length?matches.map(t=>{
        const fs=state.facts.filter(f=>f.customerId===t.id);
        const approved=fs.filter(f=>f.status==='confirmed'),pending=fs.filter(f=>f.status==='candidate');
        const messages=state.history[t.id].flatMap(s=>s.messages).filter(m=>m.role==='customer');
        return <button className="profile-directory-row" key={t.id} onClick={()=>selectCustomer(t.id)}>
          <span className="profile-directory-avatar">{t.name.slice(0,1)}</span>
          <span className="profile-directory-main"><strong>{named(t.id,state.nicknameMode==='region',state.threads)}</strong>
            {t.id===state.threadId&&<span className="profile-directory-current">当前会话</span>}
            <span className="profile-directory-sub">{approved.length} 已确认 · {pending.length} 待确认 · {messages.length} 条历史原话</span>
            <span className="profile-directory-excerpt">{approved[0]?.value||pending[0]?.value||'暂无已整理的偏好信息'}</span></span>
          <span className="profile-directory-arrow">›</span>
        </button>;
      }):<p className="profile-empty">没有匹配的客户档案。</p>}</div>
    </section>:<section className="profile-screen" aria-label="客户档案详情">
      <div className="profile-nav"><button className="profile-nav-back" onClick={()=>setPage('directory')}>← 客户列表</button>
        <span className={'profile-current-chip'+(selected===state.threadId?'':' other')}>{selected===state.threadId?'当前会话':'浏览其他客户'}</span></div>
      <div className="profile-head"><div className="profile-avatar">{name.slice(0,1)}</div>
        <div className="profile-who"><b>{name}</b><span>#{selected} · 客户历史档案</span></div><span className="profile-demo">演示数据</span></div>
      <p className="profile-subline">{selected===state.threadId?
        '此档案已与当前模拟聊天会话匹配。历史线索须人工核实；不参与自动发送。':
        '这是其他客户的历史档案，不影响当前聊天或其推荐回复。'}</p>
      <div className="profile-doc-toolbar"><div className="profile-doc-tabs" role="tablist" aria-label="客户档案文档视图">
        {([['render','预览'],['source','Markdown']] as const).map(([value,label])=><button role="tab" type="button"
          key={value} aria-selected={docMode===value} tabIndex={docMode===value?0:-1} className={docMode===value?'on':''}
          onClick={()=>setDocMode(value)} onKeyDown={e=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
            e.preventDefault();setDocMode(value==='render'?'source':'render');
          }}>{label}</button>)}</div>
        <button type="button" className="profile-external-link" title="在外部网站编辑客户档案" aria-label="配置或打开外部编辑页面"
          aria-expanded={externalOpen} onClick={handleExternal}><ExternalLink size={16}/></button></div>
      {externalOpen&&<div className="profile-external-config">
        <label>外部编辑页面 URL（HTTPS）</label><div className="profile-external-inputrow">
        <input type="url" value={externalUrl} onChange={e=>setExternalUrl(e.target.value)}
          placeholder="https://your-editor.example/profile" aria-label="客户档案外部编辑地址"/>
        <button onClick={saveExternal}>保存并打开</button></div>
        <p>只保存于当前页面内存，不发送客户档案或附加客户参数。</p></div>}
      {docMode==='source'?<div className="profile-source-surface">
        <div className="profile-source-tools"><span>当前客户档案的 Markdown 文本</span><button onClick={()=>void copy(markdown,'Markdown')}>复制</button></div>
        <textarea readOnly spellCheck={false} value={markdown} aria-label="客户档案 Markdown 只读源码"/>
        <p>源文件预览由当前演示数据生成，尚未保存为 .md 文件。</p>
      </div>:<div className="profile-render-surface">
        <div className="profile-tools">
          <label className="profile-search"><span aria-hidden="true">⌕</span>
          <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="查找档案内容" aria-label="搜索此客户档案"/></label>
          <IconButton icon={Upload} title="导入历史会话" onClick={()=>setImportOpen(v=>!v)}/>
          <IconButton icon={Sparkles} title="根据演示规则提取关键语料" onClick={()=>dispatch({type:'EXTRACT_FACTS'})}/>
        </div>
        {importOpen&&<div className="profile-import" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void importFile(e.dataTransfer.files[0]);}}>
          <b>导入历史会话 JSON</b><p>按 customerId 归入对应客户。仅在当前演示中处理，不上传、不持久化。</p>
          <label className="profile-filelabel">选择 JSON 文件
            <input type="file" accept=".json,application/json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
          <p role="status" className="profile-import-result">{importStatus||'导入后点击 ✦ 提取可审查的关键语料。'}</p></div>}
        <article className="profile-markdown" aria-label="Markdown 风格客户档案正文">
          <h3>客户摘要</h3><p className="profile-summary">{confirmed?
            '已人工确认 '+confirmed+' 条信息；还有 '+candidates+' 条来自历史对话的线索待核实。':
            '有 '+candidates+' 条历史语料线索，尚无人工确认的偏好或服务约束。'}</p>
          <div className="profile-filterbar"><span className="profile-stats">{confirmed} 已确认 · {candidates} 待确认</span>
            <select aria-label="筛选档案确认状态" value={filter} onChange={e=>setFilter(e.target.value)}>
              {([['all','全部线索'],['confirmed','已确认'],['candidate','待确认'],['dismissed','已忽略']] as const)
                .map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div>
          <div className="profile-facts-markdown" aria-live="polite">
            {!facts.length&&<p className="profile-empty">当前条件下没有档案内容。可导入历史对话后提取。</p>}
            {statuses.map(([status,heading])=>{
              const group=facts.filter(f=>f.status===status);if(!group.length)return null;
              return <section key={status}><h3>{heading}</h3><ul className="profile-md-list">{group.map(f=>{
                const open=expanded.includes(f.id);
                return <li className="profile-md-fact" key={f.id}>
                  <div className="profile-fact-heading"><span className="profile-fact-value"><strong>{f.category}：</strong>{f.value}</span>
                    <span className={'profile-fact-status '+f.status}>{status==='confirmed'?'已确认':status==='candidate'?'待确认':'已忽略'}</span></div>
                  <button className="profile-evidence-link" aria-expanded={open} onClick={()=>setExpanded(ids=>open?ids.filter(id=>id!==f.id):[...ids,f.id])}>
                    {open?'收起来源':'查看原话与来源'}</button>
                  {open&&<div className="profile-fact-source"><blockquote>“{f.evidence}”</blockquote>
                    <small>{f.at||'日期未提供'} · {f.sessionId} / {f.messageId} · {f.method}</small>
                    <div className="profile-actions">{(status==='candidate'?
                      [['confirmed','确认信息'],['dismissed','忽略']] as const:
                      status==='dismissed'?[['candidate','恢复待确认']] as const:
                      [['candidate','撤回确认'],['dismissed','忽略']] as const).map(([next,label])=>
                      <button key={next} className={next==='confirmed'?'approve':''} onClick={()=>dispatch({type:'FACT_STATUS',id:f.id,customerId:selected,status:next})}>{label}</button>)}</div>
                  </div>}
                </li>;
              })}</ul></section>;
            })}
          </div>
          <h3>历史对话</h3><details className="profile-history"><summary>查看客户原话 <span>{customerMessages.length} 条</span></summary>
            {customerMessages.slice(-12).reverse().map(m=><div className="profile-excerpt" key={m.sessionId+'/'+m.messageId}>
              <strong>{m.at||'日期未提供'} · {m.sessionId}</strong><span>{m.text}</span></div>)}</details>
          <p className="profile-privacy-note">仅记录有原话依据的客户信息；候选线索不会自动用于发送，也不推断敏感属性。</p>
        </article>
        <button className="profile-clear" onClick={clear}>清空此客户的演示档案</button>
      </div>}
    </section>}
  </PanelScroll>;
}
