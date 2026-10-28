import React from 'react';
import { ClipboardCopy, Pencil, Check } from 'lucide-react';
import { useActiveContext, activeHit, activeOptions, activeReply, activeReplyKey, activeReplyText, latestKey } from '../state';
import { IconButton, PanelScroll, useCopy, useFillDraft } from '../components/Common';
export function ReplyView(){
  const {state,dispatch,thread,message,active}=useActiveContext();
  const hit=activeHit(state),options=activeOptions(state),selected=activeReply(state),txt=activeReplyText(state);
  const key=activeReplyKey(state),copy=useCopy(),fill=useFillDraft(),taken=state.takeovers.includes(state.threadId);
  const sent=!!message&&thread.sent.includes(message.id);
  const caption=!active?'观察已停止':taken?'人工接管 · AI 继续推荐':state.auto?'自动回复 · 模拟':'AI 推荐 · 人工发送';
  return <>
    <PanelScroll><div className="between">
      <span className={'connected'+(!active||taken?' warn':'')}>{caption}</span>
      {(state.auto||taken)&&<button className={'takeover'+(taken?' active':'')} onClick={()=>dispatch({type:'TAKEOVER'})}>{taken?'恢复托管':'♧ 人工接管'}</button>}
    </div>
    <div className="message"><div className="between"><span>最新客户消息</span><span>{active&&message?'#'+message.id:'未读取'}</span></div>
      <p>{active?message?.text||'暂无消息':'未授权或观察已暂停'}</p></div>
    <button className="hit" onClick={()=>dispatch({type:'TAB',tab:'knowledge'})}>
      <span className="check">{hit?'✓':'?'}</span><span className="flex"><b>{hit?'匹配到 · '+hit.k.q:'暂无可靠知识匹配'}</b>
      <small>{hit?(hit.exact?'精确匹配':'关键词匹配')+' · 点此查看知识':'仅提供安全澄清与人工核实'}</small></span><span>›</span></button>
    <div className="section">推荐回复 <span>{options.length} 条 · 点击选用</span></div>
    <div className="recommend" id="odiv-options">{options.map(option=>{
      const optionKey=latestKey(state)+':'+option.id,val=state.edits[optionKey]??option.text;
      const editing=state.editing===optionKey;
      return <div className="option-wrap" key={option.id}>
        <button type="button" className={'option'+(selected.id===option.id?' sel':'')}
          disabled={!active} aria-pressed={selected.id===option.id}
          aria-label={option.name+'：'+val} title={option.name}
          onClick={()=>dispatch({type:'REPLY_CHOICE',key:latestKey(state),id:option.id})}>
          <span className="symbol">{option.symbol}</span><span className="answer">{val}</span><span className="tip">{option.name}</span>
        </button>
        {editing&&<div className="inline-edit"><textarea aria-label={'编辑'+option.name} maxLength={2000}
          value={val} onChange={e=>dispatch({type:'REPLY_TEXT',key:optionKey,text:e.target.value})}/>
          <div className="edit-actions"><span>编辑仅修改此条建议</span>
          <button onClick={()=>dispatch({type:'REPLY_EDIT',key:null})}>完成</button></div></div>}
      </div>;
    })}</div>
    {!hit&&active&&<div className="notice">尚未找到可靠业务规则；建议澄清问题或交由人工核实，不进行自动发送。</div>}
    </PanelScroll>
    <footer className="bottom compact-actions"><div className="between"><span className="chosen-label">已选：{selected.name}</span><span className="small">{txt.length} 字</span></div>
      <div className="btn-row">
        <button className="primary" disabled={!active||sent||!txt.trim()} onClick={()=>fill(txt)}>→ 填入聊天草稿</button>
        <IconButton icon={state.editing===key?Check:Pencil} title={state.editing===key?'完成编辑':'编辑选中回复'}
          disabled={!active} onClick={()=>dispatch({type:'REPLY_EDIT',key:state.editing===key?null:key})}/>
        <IconButton icon={ClipboardCopy} title="复制所选回复" disabled={!active||!txt.trim()} onClick={()=>{void copy(txt,'回复');}}/>
      </div>
      <div className="receipt">操作状态 · {state.receipt}</div>
    </footer>
  </>;
}
