import React from 'react';
import { sameBinding } from '../desktop';
import { useWorkbench } from '../state';
import { PanelScroll } from '../components/Common';
import { BusinessData } from './BusinessData';

function Setting({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <div className="setting"><div><b>{title}</b><small>{description}</small></div>{children}</div>;
}
function Toggle({label,checked,onChange,disabled=false}:{label:string;checked:boolean;onChange:(checked:boolean)=>void;disabled?:boolean}){
  return <label className="switch"><input type="checkbox" aria-label={label} disabled={disabled} checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;
}
function NativeAutomationScope(){
  const {state}=useWorkbench();
  const thread=state.threads.find(t=>t.id===state.threadId);
  return <p>本地测试账号：local-test-fixture:{state.binding?.pid??'未绑定'}<br/>
    已绑定会话：{thread?.name??'未绑定'} · {state.threadId}<br/>
    PID：{state.binding?.pid??'未绑定'} · 窗口：{state.binding?.windowId??'未绑定'}<br/>
    固定预设演示库：builtin-demo-v1<br/>
    来源：内置 demo/after-sales.json、demo/finance.json、demo/shipping.md、demo/service.json。不是店铺真实资料。</p>;
}
const automationReasons:Record<string,string>={
  baseline:'正在核对目标',paused:'已暂停',takeover:'人工接管',revoked:'已撤销授权',
  'baseline-failed':'目标核对失败','request-limit':'请求已达上限，请人工处理',
  'observation-refused':'观察发生变化，请人工核查','request-timeout':'核对超时，请人工处理',
  'request-refused':'回复核对未通过，请人工处理','send-failed':'发送失败，已暂停',
  'send-unknown':'发送结果未知，已锁定','send-unconfirmed':'未能确认发送结果，已锁定','send-timeout':'发送超时，已锁定'
};
export function NativeAutomationControls(){
  const {state,dispatch}=useWorkbench();
  if(!state.native)return null;
  const status=state.automation&&state.binding&&sameBinding(state.automation.binding,state.binding)?state.automation:null;
  const mode=status?.mode??'disabled',locked=state.automation?.mode==='locked';
  const names={disabled:'未启用',enabling:'正在核对目标',enabled:'已启用',paused:'已暂停 / 人工接管',revoked:'已撤权',locked:'已锁定 · 不可恢复'};
  return <div className="notice" aria-label="原生测试自动回复">
    <p role="status">本地测试自动回复 · {status?names[mode]:state.binding?'正在核对目标':'未启用'}<br/>
      {status?.reason?(automationReasons[status.reason]??status.reason.replace('等待 Host','正在核对目标')):
        mode==='enabled'?'已确认范围，仅处理后续消息':'需要在设置中明确同意'} ·
      请求 {status?.requests??0} · 排队 {status?.queued??0} · 最近结果 {status?.lastOutcome??'无'}</p>
    <details><summary role="button" aria-label="查看本地测试授权范围">本地 fixture · 当前会话 · 演示知识（范围）</summary>
      <NativeAutomationScope/>
      <p>仅本地测试聊天 / 当前会话 / 预设演示知识。无法支持真实微信自动发送；历史消息不补发。</p>
    </details>
    <button className="tool" aria-label="本地测试自动回复：人工接管" disabled={!state.binding||locked} onClick={()=>dispatch({type:'TAKEOVER'})}>人工接管</button>
    <button className="tool" aria-label="本地测试自动回复：暂停" disabled={locked||!['enabled','enabling'].includes(mode)} onClick={()=>dispatch({type:'AUTOMATION_PAUSE'})}>暂停自动回复</button>
    <button className="tool" aria-label="本地测试自动回复：恢复" disabled={locked||mode!=='paused'||!state.consented||!state.permission||state.paused||!state.nativeObserving}
      onClick={()=>dispatch({type:'AUTOMATION_RESUME'})}>恢复自动回复</button>
    <button className="tool" aria-label="本地测试自动回复：撤权" disabled={!state.binding} onClick={()=>dispatch({type:'AUTO_DISABLE'})}>撤销自动回复授权</button>
  </div>;
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
      <BusinessData/>
      <div className="settings-group-title">目标与授权</div>
      <Setting title="目标聊天软件" description={state.native?"由原生脚本显式绑定外部测试聊天窗口":"本轮只连接左侧的模拟窗口"}>
        <select disabled={state.native} aria-label="目标聊天软件" value="demo" onChange={()=>{}}><option value="demo">{state.native?"原生绑定窗口":"模拟聊天软件"}</option>
          <option disabled>微信 · 未接入</option><option disabled>企业微信 · 未接入</option></select>
      </Setting>
      <Setting title="当前会话" description={(state.native?'原生会话':'模拟会话')+' · #'+t.id+' · '+t.name}><span className="setting-lock" title="会话身份由宿主绑定">⌁</span></Setting>
      <Setting title={state.native?"原生窗口授权":"模拟窗口授权"} description="关闭后停止读取和填入草稿">
        <Toggle label={state.native?"原生窗口授权":"模拟窗口授权"} disabled={state.native&&!state.permission} checked={state.permission} onChange={v=>set('permission',v)}/></Setting>
      <div className="settings-group-title">自动化与跟随</div>
      <Setting title="智能托管" description={state.native?"仅启用本地测试 fixture 的预设演示知识回复":"关闭后本地规则仍推荐，由人工发送"}>
        <Toggle label={state.native?"本地测试自动回复：启用":"智能托管"} disabled={state.native&&(!state.permission||!state.nativeObserving||state.paused||state.automation?.mode==='locked')} checked={state.native?state.auto||state.automation?.mode==='enabling':state.auto} onChange={v=>dispatch({type:v?'AUTO_REQUEST':'AUTO_DISABLE'})}/></Setting>
      {state.consentPending&&<div className="consent"><b>{state.native?"确认开启本地原生测试自动回复":"确认开启模拟自动回复"}</b>
        {state.native&&<NativeAutomationScope/>}
        <p>仅本地测试聊天、当前会话、预设演示知识；仅处理后续消息，历史不补发。未知、歧义或敏感问题转人工。无法支持真实微信自动发送。</p>
        <button aria-label={state.native?"本地测试自动回复：确认启用":undefined} className="primary" onClick={()=>dispatch({type:'AUTO_CONFIRM'})}>理解并启用</button>
        <button aria-label={state.native?"本地测试自动回复：取消启用":undefined} className="tool" onClick={()=>dispatch({type:'AUTO_CANCEL'})}>取消</button></div>}
      <NativeAutomationControls/>
      <p className="setting-note">{state.auto?'仅后续精确匹配且具托管资格的演示消息自动回复，历史消息不补发。':'自动回复未启用，推荐由人工审核。'}</p>
      <Setting title="智能窗口跟随" description={state.native?"向原生容器请求窗口跟随":"移动聊天窗口时助手跟随；真实 Mac 待验收"}>
        <Toggle label="智能窗口跟随" checked={state.follow} onChange={v=>set('follow',v)}/></Setting>
      <Setting title="发送后回读验证" description="关闭后不能确认为已送达">
        <Toggle label="发送后模拟回读验证" disabled={state.native} checked={state.verify} onChange={v=>set('verify',v)}/></Setting>
      <Setting title="继续观察新消息" description="暂停不会删除已有草稿">
        <Toggle label="继续观察新消息" checked={!state.paused} onChange={v=>set('paused',!v)}/></Setting>
      {!state.native&&<Setting title="当前会话人工接管" description="仅停止该会话自动发送，推荐继续可用">
        <button className="setting-action" disabled={state.native?!state.binding||state.automation?.mode==='locked':!state.auto&&!taken} onClick={()=>dispatch({type:'TAKEOVER'})}>{taken?'恢复托管':'人工接管'}</button></Setting>}
      <div className="settings-group-title">模拟对话</div>
      <Setting title="多段客户消息" description="连续两条消息，验证最新消息处理与会话隔离">
        <button disabled={state.native} className="setting-action" onClick={()=>{
          dispatch({type:'RECEIVE',id:state.threadId,text:'我想咨询退款申请的时间。'});
          dispatch({type:'RECEIVE',id:state.threadId,text:'另外，请问电子发票如何申请？'});
        }}>模拟接收</button></Setting>
      <Setting title="昵称与演示地区" description="只使用构造的数据，不推断真实地址">
        <select aria-label="昵称显示方式" value={state.nicknameMode} onChange={e=>set('nicknameMode',e.target.value)}>
          <option value="original">仅昵称</option><option value="region">昵称 · 演示地区</option></select></Setting>
      <div className="settings-group-title">AI 与知识服务</div>
      <Setting title="知识与模型来源" description={state.native?
        '由可信 Desktop Host 固定项目与 loopback Query API；当前 React 不持有密钥，也不能切换项目':
        '网页预览保留本地演示规则，不连接真实 AI 服务'}>
        <span className="setting-lock">{state.native?(state.ai?.result?.projectId||'未查询'):'离线'}</span>
      </Setting>
      <div className="settings-group-title">隐私与维护</div>
      <div className="privacy-note"><span className="privacy-icon">◈</span>
        <span>{state.native?"当前内容来自原生 observation；填入须等待原生草稿回执；明确同意后仅可对本地测试聊天使用预设演示规则自动回复。知识和商品列表仍是本地演示资料，真实问答由可信 Host 选择明确项目并查询。":"此为离线模拟，不能读取真实聊天内容。知识文件仅保存在当前页面内存；自动回复只发生于左侧模拟聊天窗口，不调用云模型。"}</span></div>
      <Setting title="集成与扩展" description="可信本地 Node Adapter 与 hooks 准备同步页，导入预检后应用；真实平台需自行接入">
        <span className="setting-lock">快照接入</span></Setting>
      <div className="setting-actions"><button onClick={()=>dispatch({type:'CLEAR_LOG'})}>清空操作记录</button>
        <button disabled={state.native} onClick={onResetPosition}>重置跟随位置</button></div>
    </PanelScroll>
  </>;
}
