import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Task = { id:string;title:string;dependsOn:string[];status:string;version:number };
type Active = { taskId:string;attemptId:string;dispatch:string;progress:number;claimed:boolean;stopObserved:boolean;result:{text:string;evidence:string}|null;error:string|null;threadId:string|null };
type State = { workflowId:string;mode:string;reviewPolicy:string;revision:number;paused:boolean;tasks:Task[];active:Active|null;
  pending:{taskId:string;attemptId:string;prompt:string;deepLink:string;dispatch:string}|null;history:{at:string;type:string;taskId:string|null;message?:string}[] };
type HostMessage = {type:string;state?:State;message?:string};
declare global {interface Window { OpenDeskApp?:{postMessage:(data:unknown)=>void;onMessage:(handler:(msg:HostMessage)=>void)=>void}; __OD_CWF_TOKEN__?:string }}
const native = typeof window.OpenDeskApp?.postMessage === 'function';
const token = window.__OD_CWF_TOKEN__;
function App(){
  const [state,setState]=useState<State|null>(null);
  const [notice,setNotice]=useState(native?'已连接 OpenDesk 原生窗口':'正在连接本地工作流服务');
  const [busy,setBusy]=useState(false);
  const [review,setReview]=useState('人工检查通过：结果与任务要求一致');
  const [evidence,setEvidence]=useState('我已在官方 Codex 中确认没有提交该任务（手工核对）');
  async function refresh(){
    if(native){window.OpenDeskApp?.postMessage({type:'refresh'});return;}
    if(!token||token==='__OD_CWF_TOKEN__'){setNotice('离线源码预览：请先执行 npm run build 与 npm start，通过服务地址访问');return;}
    try {const r=await fetch('/api/state',{headers:{'x-od-cwf-ui':token}});if(!r.ok)throw Error('HTTP_'+r.status);const body=await r.json();setState(body.state);setNotice('已连接本地服务');}
    catch{setNotice('本地服务不可用；不能把预览当成真实调度');}
  }
  useEffect(()=>{
    if(native) window.OpenDeskApp?.onMessage((msg)=>{if(msg.type==='state'&&msg.state)setState(msg.state);if(msg.type==='notice')setNotice(msg.message||'操作失败');});
    void refresh();const id=setInterval(()=>void refresh(),1500);return ()=>clearInterval(id);
  },[]);
  async function action(name:string, extra:Record<string,string>={}){
    setBusy(true);
    try{
      if(native){window.OpenDeskApp?.postMessage({type:'action',action:name,...extra});return;}
      const r=await fetch('/api/operator',{method:'POST',headers:{'content-type':'application/json','x-od-cwf-ui':token||''},body:JSON.stringify({action:name,...extra})});
      const body=await r.json();if(!body.ok)throw Error(body.error||'ACTION_FAILED');setState(body.state);
    }catch(err){setNotice(String(err));}finally{setBusy(false);}
  }
  function openCodex(){
    const p=state?.pending;if(!p)return;
    if(native)window.OpenDeskApp?.postMessage({type:'open',url:p.deepLink});
    else location.href=p.deepLink; // Opens/pre-fills draft only. Never assumes send.
  }
  const a=state?.active;
  return <main>
    <header><div><span className="eyebrow">OpenDesk · 技术 Demo</span><h1>Codex Workflow Companion</h1><p>官方 Codex 的执行伴侣 · A → B → C · 不替代 Codex 客户端</p></div><span className="mode">{state?.mode||'未连接'} / {state?.paused?'暂停':'运行'}</span></header>
    <p className="notice" role="status">{notice}</p>
    <div className="toolbar"><button disabled={busy||!state||!!a} onClick={()=>action('start')}>开始工作流</button><button disabled={busy||!state} onClick={()=>action(state?.paused?'resume':'pause')}>{state?.paused?'恢复后续调度':'暂停后续调度'}</button><button disabled={!state} onClick={()=>refresh()}>刷新状态</button></div>
    <section className="card"><h2>串行任务（只显示核心信息）</h2>
      <div className="tasks">{state?.tasks.map(t=><div key={t.id} className={'task '+t.status}><b>{t.id}</b><span>{t.title}<small>依赖：{t.dependsOn.join(', ')||'无'}</small></span><strong>{t.status}</strong></div>)||'等待服务连接'}</div>
    </section>
    <section className="card"><h2>当前尝试</h2>{a&&state?.pending?<>
      <p><b>{a.taskId}</b> · {a.dispatch} · 进度 {a.progress}% · {a.claimed?'已 MCP 绑定':'待绑定'} · {a.stopObserved?'已见 Stop':'未见 Stop'}</p>
      <p className="muted">attempt: {a.attemptId} · revision {state.revision}</p>
      <pre>{state.pending.prompt}</pre>
      <div className="toolbar"><button onClick={openCodex}>在官方 Codex 中打开草稿</button>{state.mode==='simulate'&&<button disabled={busy||a.dispatch!=='prepared'} onClick={()=>action('simulate')}>模拟 Hook + MCP + Stop</button>}</div>
      <p className="hint">打开草稿 ≠ 已发送；Hook Stop ≠ 通过验收；模拟操作不代表真实 Codex 完成。</p>
      {a.result&&<p>提交结果：<b>{a.result.text}</b> · 证据：{a.result.evidence}</p>}
      {a.error&&<><p className="error">已暂停：{a.error}</p>{a.stopObserved&&<button onClick={()=>action('retry_failed',{attemptId:a.attemptId,evidence})}>审核后重试（已确认任务停止）</button>}</>}
      {a.result&&a.stopObserved&&<div className="toolbar"><input aria-label="审核依据" value={review} onChange={e=>setReview(e.target.value)}/><button disabled={busy} onClick={()=>action('approve',{attemptId:a.attemptId,evidence:review})}>人工确认并接续</button></div>}
      {['unknown','blocked'].includes(a.dispatch)&&<div className="toolbar"><input aria-label="对账证据" value={evidence} onChange={e=>setEvidence(e.target.value)}/><button disabled={busy} onClick={()=>action('reconcile',{attemptId:a.attemptId,outcome:'not_sent',evidence})}>确认未发送（需现场核验）</button></div>}
    </>:<p className="muted">{state?.tasks.every(t=>t.status==='accepted')?'A、B、C 已全部验收':'当前没有活动任务'}</p>}</section>
    <section className="card"><h2>最近事件</h2><ol className="history">{state?.history.slice(-12).reverse().map((e,i)=><li key={i}><time>{new Date(e.at).toLocaleTimeString()}</time> {e.taskId||'workflow'} · {e.type}</li>)}</ol></section>
    <footer>唯一状态 Owner：Node 工作流服务 · MCP：stdio · Hook：受限 loopback · Mac 原生发送待实机验收</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
