import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, RotateCcw, Send, Settings, Pause, Play, Sun } from 'lucide-react';
import { IconButton, PanelView } from './components/Common';
import { WorkbenchProvider, currentThread, latestCustomerMessage, labels, tabs, useWorkbench } from './state';
import { ReplyView } from './views/Reply';
import { KnowledgeView } from './views/Knowledge';
import { CustomerView } from './views/Customer';
import { ProductsView } from './views/Products';
import { ImagesView } from './views/Images';
import { OrdersView } from './views/Orders';
import { SettingsView } from './views/Settings';
import './styles.css';

const questions:Record<string,string>={
  refund:'签收后 7 天内还能申请退款吗？',invoice:'请问能开发票吗？',
  shipping:'物流怎么查询？',product:'商品如何选尺码？',unknown:'可以立即给我赔偿承诺吗？'
};
function ChatWindow({onMinimize}:{onMinimize:()=>void}){
  const {state,dispatch}=useWorkbench();
  const [contactQuery,setContactQuery]=useState(''),[custom,setCustom]=useState('');
  const thread=currentThread(state),message=latestCustomerMessage(thread);
  const sent=message&&thread.sent.includes(message.id);
  const [offset,setOffset]=useState({x:0,y:0}),origin=useRef<{startX:number;startY:number;x:number;y:number}|null>(null);
  const headerDown=(e:React.PointerEvent<HTMLElement>)=>{
    if((e.target as HTMLElement).closest('button'))return;
    origin.current={startX:e.clientX,startY:e.clientY,x:offset.x,y:offset.y};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const headerMove=(e:React.PointerEvent<HTMLElement>)=>{
    if(!origin.current)return;
    const {startX,startY,x,y}=origin.current;
    setOffset({x:Math.max(-180,Math.min(180,x+e.clientX-startX)),y:Math.max(-130,Math.min(130,y+e.clientY-startY))});
  };
  const sendCustomer=(text:string)=>{
    if(!text.trim())return;
    dispatch({type:'RECEIVE',id:state.threadId,text});
  };
  return <section className="window chat" aria-label="模拟聊天软件"
    style={{'--demo-shift-x':offset.x+'px','--demo-shift-y':offset.y+'px'} as React.CSSProperties}>
    <header className="window-header" onPointerDown={headerDown} onPointerMove={headerMove}
      onPointerUp={()=>{origin.current=null;}} onPointerCancel={()=>{origin.current=null;}}>
      <div className="macdots"><i/><i/><i/></div><span className="windowname">客户沟通台</span>
      <div className="push"/><span className="muted" style={{fontSize:10}}>仅演示</span>
      <button type="button" className="window-mini" aria-label="最小化模拟聊天窗口" onClick={onMinimize}>−</button>
    </header>
    <div className="chat-body">
      <nav className="contactlist" aria-label="聊天会话"><strong>会话列表</strong>
        <label className="contact-search"><span aria-hidden="true">⌕</span>
          <input type="search" value={contactQuery} onChange={e=>setContactQuery(e.target.value)} placeholder="搜索联系人" aria-label="搜索模拟聊天联系人"/></label>
        <div id="od-contacts">{state.threads.filter(t=>t.name.includes(contactQuery.trim())||t.id.includes(contactQuery.trim())).map(t=>
          <button type="button" key={t.id} className={'contactbtn'+(t.id===state.threadId?' on active':'')}
            onClick={()=>dispatch({type:'SET_THREAD',id:t.id})}
            aria-current={t.id===state.threadId?'true':undefined}>
            <span className={'avatar'+(t.id==='t2'?' b':t.id==='t3'?' c':'')}>{t.name[0]}</span>
            <span className="contact-meta"><b>{t.name}</b>
              <small>{t.id==='t1'?'售后咨询':t.id==='t2'?'物流咨询':'商品咨询'}</small>
              <span className="contact-preview">{t.messages.at(-1)?.text.slice(0,26)}</span>
            </span>
          </button>)}</div>
      </nav>
      <section className="conversation"><header className="conversation-head"><strong>{thread.name}</strong><small>#{thread.id} · 模拟</small></header>
        <div className="messages" id="od-messages" role="log" aria-label="模拟聊天记录">
          {thread.messages.map(m=><div className={'bubble'+(m.who==='agent'?' outgoing':'')} key={m.id}>
            <div className="bubble-text">{m.text}</div>
            <small>{(m.who==='agent'?'客服 · ':'客户 · ')+m.id+(m.replyTo?' · 回执关联 '+m.replyTo:'')}</small>
          </div>)}</div>
        <div className="chat-send"><textarea aria-label="模拟聊天草稿" placeholder="客服输入草稿…" value={thread.draft}
          onChange={e=>dispatch({type:'SET_DRAFT',id:thread.id,text:e.target.value})}/>
          <button className="primary" type="button" disabled={!state.permission||state.paused||!thread.draft.trim()||!message||!!sent}
            onClick={()=>{if(message)dispatch({type:'SEND',id:thread.id,messageId:message.id});}}><Send size={14}/>发送</button></div>
      </section>
    </div>
    <section className="demo-tray"><span>模拟客户发送消息</span>
      <div className="demo-chips">{([['refund','退款'],['invoice','发票 · 精确'],['shipping','物流'],['product','商品'],['unknown','未知问题']] as const)
        .map(([id,name])=><button key={id} onClick={()=>sendCustomer(questions[id])}>{name}</button>)}</div>
      <div className="demo-input"><input type="text" aria-label="自定义客户提问" placeholder="输入任意测试问题…" value={custom}
        onChange={e=>setCustom(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){sendCustomer(custom);setCustom('');}}}/>
        <button className="smallbtn" onClick={()=>{sendCustomer(custom);setCustom('');}}>发送问题</button></div>
    </section>
  </section>;
}
function BusinessTabs(){
  const {state,dispatch}=useWorkbench();
  return <nav id="odiv-tabs" className="tabs" role="tablist" aria-label="AI 客服功能"
    hidden={state.tab==='settings'} onKeyDown={e=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
      const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]'));
      const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(at<0)return;e.preventDefault();
      const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[index].focus();buttons[index].scrollIntoView({block:'nearest',inline:'nearest'});
      dispatch({type:'TAB',tab:tabs[index]});
    }}>
    {tabs.map(tab=><button key={tab} type="button" id={'odiv-tab-'+tab} role="tab" aria-controls={'odiv-'+tab}
      aria-selected={state.tab===tab} tabIndex={state.tab===tab?0:-1} data-tab={tab}
      className={state.tab===tab?'on':''} onClick={e=>{
        dispatch({type:'TAB',tab});e.currentTarget.scrollIntoView({block:'nearest',inline:'nearest'});
      }}>{labels[tab]}</button>)}
  </nav>;
}
function Copilot({dark,onToggleTheme,onResetPosition}:{dark:boolean;onToggleTheme:()=>void;onResetPosition:()=>void}){
  const {state,dispatch}=useWorkbench();
  const t=currentThread(state),taken=state.takeovers.includes(state.threadId);
  const subtitle=t.name+' · '+(!state.permission||state.paused?'观察已停止':taken?'人工接管中':state.auto?'模拟自动回复中':'辅助回复中');
  return <section aria-label="Compact Copilot · 380 像素右侧助手" className="merge-assistant">
    <div id="od-compact-inline" className={dark?'dark':''}><div className="wrap">
      <div className="preview-control"><div className="od-mark">OD</div><div className="preview-title">AI 客服 · Compact Copilot <span className="tiny grey">· 380px</span></div>
        <div className="flex"/><IconButton icon={dark?Sun:Moon} title="深浅色切换" onClick={onToggleTheme}/>
        <IconButton icon={RotateCcw} title="重置模拟数据" onClick={()=>dispatch({type:'RESET'})}/></div>
      <div className="window">
        <header className="windowhead"><div className="spark">✦</div><div className="identity flex">
          <b>AI 客服</b><small>{subtitle}</small></div>
          <IconButton className="icon" icon={state.paused?Play:Pause} title={state.paused?'恢复观察':'暂停观察'}
            onClick={()=>dispatch({type:'SETTING',key:'paused',value:!state.paused})}/>
          <button type="button" className="icon settings-gear" title="设置" aria-label={state.tab==='settings'?'返回业务页面':'打开设置'}
            aria-expanded={state.tab==='settings'} onClick={()=>dispatch({type:'TAB',tab:state.tab==='settings'?state.settingsOrigin:'settings'})}>
            <Settings size={17} strokeWidth={1.8}/></button>
        </header>
        <BusinessTabs/>
        <PanelView id="reply" active={state.tab==='reply'}><ReplyView/></PanelView>
        <PanelView id="knowledge" active={state.tab==='knowledge'}><KnowledgeView/></PanelView>
        <PanelView id="customer" active={state.tab==='customer'}><CustomerView/></PanelView>
        <PanelView id="products" active={state.tab==='products'}><ProductsView/></PanelView>
        <PanelView id="images" active={state.tab==='images'}><ImagesView/></PanelView>
        <PanelView id="orders" active={state.tab==='orders'}><OrdersView/></PanelView>
        <PanelView id="settings" active={state.tab==='settings'}><SettingsView onResetPosition={onResetPosition}/></PanelView>
      </div>
      {state.toast&&<div className="toast" role="status" aria-live="polite">{state.toast.message}</div>}
    </div></div>
  </section>;
}
function Workbench(){
  const {state,dispatch}=useWorkbench();
  const [dark,setDark]=useState(false),[minimized,setMinimized]=useState(false),[show,setShow]=useState<'chat'|'assistant'>('assistant');
  const [positionReset,setPositionReset]=useState(0);
  useEffect(()=>{
    if(!state.toast)return;
    const id=state.toast.id;
    const timeout=setTimeout(()=>dispatch({type:'HIDE_TOAST',id}),2300);
    return ()=>clearTimeout(timeout);
  },[state.toast,dispatch]);
  const reset=()=>{dispatch({type:'RESET'});setPositionReset(n=>n+1);setMinimized(false);};
  if(state.native)return <div id="od-r12" data-native="true" data-theme={dark?'dark':'light'}>
    <Copilot dark={dark} onToggleTheme={()=>setDark(x=>!x)} onResetPosition={()=>{}}/>
  </div>;
  return <div id="od-r12" data-theme={dark?'dark':'light'} data-follow={state.follow?'true':'false'}>
    <header className="preview-top"><div className="brand">OD</div><div><div className="ptitle">OpenDesk Desktop · AI 客服助手</div>
      <div className="pmeta">双窗口工作台 · 右侧 Compact Copilot 380px</div></div><div className="push"/>
      <div className="preview-tools"><div className="seg" role="group" aria-label="预览视图">
        <button className={show==='chat'?'on':''} onClick={()=>setShow('chat')}>聊天</button>
        <button className={show==='assistant'?'on':''} onClick={()=>setShow('assistant')}>助手</button></div>
        <IconButton className="iconbtn" icon={dark?Sun:Moon} title="切换明暗主题" onClick={()=>setDark(x=>!x)}/>
        <IconButton className="iconbtn" icon={RotateCcw} title="重置模拟数据" onClick={reset}/></div>
    </header>
    <main className="stage">
      {minimized?<div className="minimized-bar"><span>聊天模拟窗口已最小化 · AI 助手暂时隐藏</span>
        <button type="button" onClick={()=>setMinimized(false)}>恢复工作台</button></div>:
      <div className="stage-inner" data-show={show}>
        <React.Fragment key={positionReset}><ChatWindow onMinimize={()=>setMinimized(true)}/></React.Fragment>
        <Copilot dark={dark} onToggleTheme={()=>setDark(x=>!x)} onResetPosition={()=>setPositionReset(n=>n+1)}/>
      </div>}
      <div className="preview-foot">左侧：模拟聊天软件 · 右侧：380px AI 客服 · 单一会话状态 · 不连接真实平台</div>
    </main>
  </div>;
}
const root=document.getElementById('app');
if(!root)throw Error('Missing #app React root');
createRoot(root).render(<WorkbenchProvider><Workbench/></WorkbenchProvider>);
