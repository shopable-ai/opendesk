import React from 'react';
import { ClipboardCopy, Pencil, Check, Sparkles } from 'lucide-react';
import { businessProducts, useActiveContext, activeOptions, activeReply, activeReplyKey, activeReplyText, latestKey, useWorkbench } from '../state';
import { productFromCustomerText } from '../domain/catalog';
import { reviewClaims, type AiResult } from '../domain/ai';
import { inspectKnowledge } from '../domain/knowledge';
import { IconButton, PanelScroll, useCopy, useFillDraft } from '../components/Common';

function EvidenceReview({result,text}:{result:AiResult;text:string}){
  const items=result.evidencePack.items,claims=reviewClaims(text,items);
  return <details className="evidence-review"><summary role="button" aria-label={'审核依据 '+result.requestId}>审核依据 · {result.projectId}</summary>
    <section aria-label={'审核元数据 '+result.requestId}>
    <p>Query 项目知识 · {result.requestId}。有来源 ≠ 已核实适用；本地导入不会更新此项目。</p>
    <p>版本、生效期及适用条件：服务未提供，待核实。Hash 是内容指纹，不是生效版本。</p>
    </section>
    {items.map(item=><details key={item.id}><summary role="button" aria-label={'展开来源 '+item.sourceRef+' '+result.requestId}>{item.id} · {item.source?.title||item.sourceRef}</summary>
      <dl><dt>条目</dt><dd>{item.sourceRef}</dd><dt>文档</dt><dd>{item.source?.document||'未提供'}</dd>
      <dt>来源 Hash</dt><dd>{item.answerHash}</dd></dl>
      <p>关联状态：{item.source?'服务声明 ID / Hash 一致；原文未独立核验':'原文不可解析，待核实'}</p>
      {item.source&&<section aria-label={'来源原文 '+item.sourceRef+' '+result.requestId}><blockquote>{item.source.text}</blockquote></section>}
    </details>)}
    <b>建议中的主张与引用</b><p>服务未提供逐句引用；文本相同也须核实业务适用性。人工编辑内容重新比对。</p>
    <ul>{claims.map((claim,i)=><li key={i}>{claim.text}<small>{claim.evidenceIds.length?
      '原文文字相同：'+claim.evidenceIds.join('、')+' · 适用性待核实':'未验证对应原文 · 待逐条核实（整条建议引用 '+items.map(e=>e.id).join('、')+'）'}</small></li>)}</ul>
  </details>;
}

export function ReplyView(){
  const {state,dispatch,thread,message,active}=useActiveContext();
  const {queryNative}=useWorkbench();
  const ai=state.native?state.ai:null,aiResult=ai?.result;
  const assessment=inspectKnowledge(message?.text,state.knowledge,active&&!state.native),hit=assessment.hit;
  const product=active&&!state.native?productFromCustomerText(message?.text,businessProducts(state)):null;
  const options=activeOptions(state),selected=activeReply(state),txt=activeReplyText(state);
  const key=activeReplyKey(state),copy=useCopy(),fill=useFillDraft(),taken=state.takeovers.includes(state.threadId);
  const editor=React.useRef<{key:string;node:HTMLTextAreaElement}|null>(null);
  function commitEdit(){
    const current=editor.current;
    if(!active||state.editing!==key||current?.key!==key)return txt;
    const text=current.node.value.slice(0,2000);
    dispatch({type:'REPLY_TEXT',key,text});
    return text;
  }
  function finishEdit(){commitEdit();dispatch({type:'REPLY_EDIT',key:null});}
  const sent=!!message&&thread.sent.includes(message.id);
  const caption=!active?'观察已停止':state.native?'AI 草稿 · 人工审核':taken?'人工接管 · AI 继续推荐':state.auto?'自动回复 · 模拟':'本地规则推荐 · 人工发送';
  return <>
    <PanelScroll><div className="between">
      <span className={'connected'+(!active||taken?' warn':'')}>{caption}</span>
      {state.native&&<IconButton icon={Sparkles} title={ai?.status==='loading'?'正在查询':'获取 AI 知识建议'}
        disabled={!active||!message||ai?.status==='loading'} onClick={()=>{commitEdit();queryNative();}}/>}
      {(state.auto||taken)&&<button className={'takeover'+(taken?' active':'')} onClick={()=>dispatch({type:'TAKEOVER'})}>{taken?'恢复托管':'♧ 人工接管'}</button>}
    </div>
    <div className="message"><div className="between"><span>最新客户消息</span><span>{active&&message?'#'+message.id:'未读取'}</span></div>
      <p>{active?message?.text||'暂无消息':'未授权或观察已暂停'}</p></div>
    {!state.native?<button className="hit" onClick={()=>dispatch({type:'TAB',tab:'knowledge'})}>
      <span className="check">{hit?'✓':'?'}</span><span className="flex"><b>{assessment.kind==='conflict'?'知识冲突 · 待人工核实':hit?'匹配到 · '+hit.k.q:'未命中可靠知识'}</b>
      <small>{assessment.kind==='conflict'?'同等级答案有冲突，不采用任何一条':hit?(hit.exact?'精确匹配':'相似候选 · 须人工核实')+' · 查看知识':'仅提供安全澄清与人工核实'}</small></span><span>›</span></button>:
    <div className="hit" role="status"><span className="check">{ai?.status==='ready'?'✓':'?'}</span>
      <span className="flex"><b>{ai?.status==='loading'?'正在查询可信知识…':
        ai?.status==='ready'?(aiResult?.retrievalStatus==='supported'?'已返回来源证据 · 仍需人工审核':'AI 已返回 · 依据尚需核实'):
        ai?.status==='error'?'知识服务不可用':'尚未查询 AI 知识'}</b>
      <small>{aiResult?.status==='error'?'错误：'+aiResult.errorCode:
        aiResult?.status==='blocked'?'查询已阻断，请人工核实':
        aiResult?'Query API · '+aiResult.projectId+' · '+aiResult.modelProvider+' · '+aiResult.retrievalStatus:
        '点击右上角 ✦，由可信 Desktop Host 查询；不会自动发送'}</small>
      {aiResult?.evidencePack.items.length?<small>证据编号：{aiResult.evidencePack.items.slice(0,3).map(item=>item.sourceRef).join('、')} · 请人工确认版本和适用范围</small>:null}</span></div>}
    {product&&<button type="button" className="hit" aria-label={'查看关联商品：'+product.name}
      onClick={()=>dispatch({type:'OPEN_PRODUCT',id:product.id})}>
      <span className="check">◇</span><span className="flex"><b>商品线索 · {product.name}</b>
      <small>{product.sku} · 演示匹配，信息需人工核实</small></span><span>›</span></button>}
    {state.native&&options.length>1&&<div className="notice">已保留旧版本及人工编辑。新回答待选，点击对应版本后才替换当前选中回复。</div>}
    <div className="section">推荐回复 <span>{options.length} 条 · 点击明确选用</span></div>
    <div className="recommend" id="odiv-options">{options.map((option,index)=>{
      const optionKey=latestKey(state)+':'+option.id,val=state.edits[optionKey]??option.text;
      const editing=state.editing===optionKey;
      const optionLabel=option.name+(state.native&&options.length>1?' · 版本 '+(index+1):'');
      const version=state.nativeReplyVersions.find(v=>v.id===option.id);
      const source=version?.result||(state.nativeReplyVersions.length?null:aiResult);
      return <div className="option-wrap" key={option.id}>
        <button type="button" className={'option'+(selected.id===option.id?' sel':'')}
          disabled={!active} aria-pressed={selected.id===option.id}
          aria-label={optionLabel+'：'+val} title={optionLabel}
          onClick={()=>dispatch({type:'REPLY_CHOICE',key:latestKey(state),id:option.id})}>
          <span className="symbol">{option.symbol}</span><span className="option-content">
            {state.native&&options.length>1&&<span className="version-label">版本 {index+1} · {selected.id===option.id?'当前选中':'待选'}</span>}
            <span className="answer">{val}</span>
          </span><span className="tip">{optionLabel}</span>
        </button>
        {state.native&&source&&<EvidenceReview result={source} text={val}/>}
        {editing&&<div className="inline-edit"><textarea autoFocus aria-label={'编辑'+option.name} maxLength={2000}
          ref={node=>{editor.current=node?{key:optionKey,node}:null;}}
          defaultValue={val} onChange={e=>dispatch({type:'REPLY_TEXT',key:optionKey,text:e.target.value})}
          onBlur={e=>dispatch({type:'REPLY_TEXT',key:optionKey,text:e.currentTarget.value})}/>
          <div className="edit-actions"><span>编辑仅修改此条建议</span>
          <button onClick={finishEdit}>完成</button></div></div>}
      </div>;
    })}</div>
    {!state.native&&!hit&&active&&<div className="notice">尚未找到可靠业务规则；建议澄清问题或交由人工核实，不进行自动发送。</div>}
    {state.native&&aiResult?.status==='ready'&&aiResult.retrievalStatus!=='supported'&&
      <div className="notice">模型草稿不等于已核实事实；此回复须核对来源、价格、订单等动态信息后再使用。</div>}
    </PanelScroll>
    <footer className="bottom compact-actions"><div className="between"><span className="chosen-label">已选：{selected.name}</span><span className="small">{txt.length} 字</span></div>
      <div className="btn-row">
        <button className="primary" disabled={!active||sent||!txt.trim()||(state.native&&!!state.pendingFill)} onClick={()=>fill(commitEdit())}>→ 填入聊天草稿</button>
        <IconButton icon={state.editing===key?Check:Pencil} title={state.editing===key?'完成编辑':'编辑选中回复'}
          disabled={!active} onClick={()=>state.editing===key?finishEdit():dispatch({type:'REPLY_EDIT',key})}/>
        <IconButton icon={ClipboardCopy} title="复制所选回复" disabled={!active||!txt.trim()} onClick={()=>{void copy(commitEdit(),'回复');}}/>
      </div>
      <div className="receipt">操作状态 · {state.receipt}</div>
    </footer>
  </>;
}
