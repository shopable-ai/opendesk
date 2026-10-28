import React from 'react';
import { useWorkbench } from '../state';
import { PanelScroll } from '../components/Common';

function Setting({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <div className="setting"><div><b>{title}</b><small>{description}</small></div>{children}</div>;
}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}){
  return <label className="switch"><input type="checkbox" aria-label={label} checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
export function SettingsView({onResetPosition}:{onResetPosition:()=>void}){
  const {state,dispatch}=useWorkbench();
  const t=state.threads.find(t=>t.id===state.threadId)!;
  const taken=state.takeovers.includes(state.threadId);
  const set=(key:'permission'|'paused'|'follow'|'verify'|'nicknameMode',value:boolean|string)=>
    dispatch({type:'SETTING',key,value});
  return <>
    <div className="settings-subhead"><button type="button" className="settings-back" onClick={()=>dispatch({type:'TAB',tab:state.settingsOrigin})}>← 返回</button>
      <strong>设置</strong></div>
    <PanelScroll className="full-settings">
      <div className="settings-group-title">目标与授权</div>
      <Setting title="目标聊天软件" description="本轮只连接左侧的模拟窗口">
        <select aria-label="目标聊天软件" value="demo" onChange={()=>{}}><option value="demo">模拟聊天软件</option>
          <option disabled>微信 · 未接入</option><option disabled>企业微信 · 未接入</option></select>
      </Setting>
      <Setting title="当前会话" description={'模拟会话 · #'+t.id+' · '+t.name}><span className="setting-lock" title="会话身份由宿主绑定">⌁</span></Setting>
      <Setting title="模拟窗口授权" description="关闭后停止读取和填入草稿">
        <Toggle label="模拟窗口授权" checked={state.permission} onChange={v=>set('permission',v)}/></Setting>
      <div className="settings-group-title">自动化与跟随</div>
      <Setting title="智能托管" description="关闭后 AI 仍推荐，由人工发送">
        <Toggle label="智能托管" checked={state.auto} onChange={v=>dispatch({type:v?'AUTO_REQUEST':'AUTO_DISABLE'})}/></Setting>
      {state.consentPending&&<div className="consent"><b>确认开启模拟自动回复</b>
        <p>仅对后续精确匹配且具托管资格的演示知识自动发送。未知、歧义或敏感问题转人工；不连接真实微信。</p>
        <button className="primary" onClick={()=>dispatch({type:'AUTO_CONFIRM'})}>理解并启用</button>
        <button className="tool" onClick={()=>dispatch({type:'AUTO_CANCEL'})}>取消</button></div>}
      <p className="setting-note">{state.auto?'仅后续精确匹配且具托管资格的演示消息自动回复，历史消息不补发。':'智能托管已关闭，AI 继续提供推荐答案。'}</p>
      <Setting title="智能窗口跟随" description="移动聊天窗口时助手跟随；真实 Mac 待验收">
        <Toggle label="智能窗口跟随" checked={state.follow} onChange={v=>set('follow',v)}/></Setting>
      <Setting title="发送后回读验证" description="关闭后不能确认为已送达">
        <Toggle label="发送后模拟回读验证" checked={state.verify} onChange={v=>set('verify',v)}/></Setting>
      <Setting title="继续观察新消息" description="暂停不会删除已有草稿">
        <Toggle label="继续观察新消息" checked={!state.paused} onChange={v=>set('paused',!v)}/></Setting>
      <Setting title="当前会话人工接管" description="仅停止该会话自动发送，推荐继续可用">
        <button className="setting-action" disabled={!state.auto&&!taken} onClick={()=>dispatch({type:'TAKEOVER'})}>{taken?'恢复托管':'人工接管'}</button></Setting>
      <div className="settings-group-title">模拟对话</div>
      <Setting title="多段客户消息" description="连续两条消息，验证最新消息处理与会话隔离">
        <button className="setting-action" onClick={()=>{
          dispatch({type:'RECEIVE',id:state.threadId,text:'我想咨询退款申请的时间。'});
          dispatch({type:'RECEIVE',id:state.threadId,text:'另外，请问电子发票如何申请？'});
        }}>模拟接收</button></Setting>
      <Setting title="昵称与演示地区" description="只使用构造的数据，不推断真实地址">
        <select aria-label="昵称显示方式" value={state.nicknameMode} onChange={e=>set('nicknameMode',e.target.value)}>
          <option value="original">仅昵称</option><option value="region">昵称 · 演示地区</option></select></Setting>
      <div className="settings-group-title">隐私与维护</div>
      <div className="privacy-note"><span className="privacy-icon">◈</span>
        <span>此为离线模拟，不能读取真实聊天内容。知识文件仅保存在当前页面内存；自动回复只发生于左侧模拟聊天窗口，不调用云模型。</span></div>
      <Setting title="集成与扩展" description="真实平台、商品 Provider 与图片服务后续接入">
        <span className="setting-lock">待接入</span></Setting>
      <div className="setting-actions"><button onClick={()=>dispatch({type:'CLEAR_LOG'})}>清空操作记录</button>
        <button onClick={onResetPosition}>重置跟随位置</button></div>
    </PanelScroll>
  </>;
}
