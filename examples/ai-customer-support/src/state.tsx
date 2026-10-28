import React, { createContext, useContext, useMemo, useReducer } from 'react';
import { isCustomerId, findProduct, orderForCustomer, type CustomerId } from './domain/catalog';
import { extractFacts, initialHistory, mergeHistory, type FactStatus, type HistoryByCustomer, type ProfileFact } from './domain/history';
import { initialKnowledge, matchKnowledge, replyOptions, type Knowledge } from './domain/knowledge';

export const tabs = ['reply','knowledge','customer','products','images','orders'] as const;
export type Tab = (typeof tabs)[number];
export type Panel = Tab|'settings';
export const labels: Record<Tab,string> = {reply:'推荐回复',knowledge:'知识库',customer:'客户档案',products:'商品',images:'图片',orders:'订单'};
export interface ChatMessage { id:string; who:'customer'|'agent'; text:string; replyTo?:string }
export interface Thread { id:CustomerId; name:string; messages:ChatMessage[]; sent:string[]; draft:string }
export interface AppState {
  threadId:CustomerId; threads:Thread[];
  tab:Panel; settingsOrigin:Tab; permission:boolean; paused:boolean;
  auto:boolean; consented:boolean; consentPending:boolean; follow:boolean;
  verify:boolean; nicknameMode:'original'|'region'; takeovers:CustomerId[];
  chosen:Record<string,string>; edits:Record<string,string>; editing:string|null;
  knowledge:Knowledge[]; history:HistoryByCustomer; facts:ProfileFact[];
  knowledgeImportEpoch:number; historyImportEpoch:number;
  knowledgeImportStatus:string; historyImportStatus:string;
  productSelected:string|null; imageSelected:{productId:string;imageId:string}|null; orderSelected:string|null;
  receipt:string; counter:number; log:string[]; toast:{id:number;message:string}|null;
}
export type Action =
 | {type:'TAB';tab:Panel}
 | {type:'OPEN_PRODUCT';id:string}
 | {type:'CLOSE_PRODUCT'}
 | {type:'OPEN_IMAGE';productId:string;imageId:string}
 | {type:'CLOSE_IMAGE'}
 | {type:'OPEN_ORDER';orderId:string}
 | {type:'CLOSE_ORDER'}
 | {type:'SET_THREAD';id:CustomerId}
 | {type:'SET_DRAFT';id:CustomerId;text:string}
 | {type:'RECEIVE';id:CustomerId;text:string}
 | {type:'FILL';id:CustomerId;messageId:string;text:string;replace:boolean}
 | {type:'SEND';id:CustomerId;messageId:string}
 | {type:'REPLY_CHOICE';key:string;id:string}
 | {type:'REPLY_EDIT';key:string|null}
 | {type:'REPLY_TEXT';key:string;text:string}
 | {type:'SETTING';key:'permission'|'paused'|'follow'|'verify'|'nicknameMode';value:boolean|string}
 | {type:'AUTO_REQUEST'}
 | {type:'AUTO_CONFIRM'}
 | {type:'AUTO_CANCEL'}
 | {type:'AUTO_DISABLE'}
 | {type:'TAKEOVER'}
 | {type:'IMPORT_KNOWLEDGE';entries:Knowledge[];epoch:number}
 | {type:'IMPORT_HISTORY';history:HistoryByCustomer;epoch:number}
 | {type:'IMPORT_ERROR';kind:'knowledge'|'history';message:string;epoch:number}
 | {type:'EXTRACT_FACTS'}
 | {type:'FACT_STATUS';id:string;customerId:CustomerId;status:FactStatus}
 | {type:'CLEAR_PROFILE';customerId:CustomerId}
 | {type:'CLEAR_LOG'}
 | {type:'RECORD';message:string}
 | {type:'TOAST';message:string}
 | {type:'HIDE_TOAST';id:number}
 | {type:'RESET'};

export function createInitialState():AppState {
  const history=initialHistory();
  return {
    threadId:'t1',threads:[
      {id:'t1',name:'林女士',messages:[{id:'m1',who:'customer',text:'签收后 7 天内还能申请退款吗？'}],sent:[],draft:''},
      {id:'t2',name:'陈先生',messages:[{id:'m2',who:'customer',text:'物流怎么查询？'}],sent:[],draft:''},
      {id:'t3',name:'周女士',messages:[{id:'m3',who:'customer',text:'商品如何选尺码？'}],sent:[],draft:''}
    ],
    tab:'reply',settingsOrigin:'reply',permission:true,paused:false,auto:false,consented:false,
    consentPending:false,follow:true,verify:true,nicknameMode:'original',takeovers:[],
    chosen:{},edits:{},editing:null,knowledge:initialKnowledge(),history,facts:extractFacts(history,[]),
    knowledgeImportEpoch:0,historyImportEpoch:0,knowledgeImportStatus:'',historyImportStatus:'',
    productSelected:null,imageSelected:null,orderSelected:null,
    receipt:'尚未发送',counter:7,log:[],toast:null
  };
}
export const currentThread=(s:AppState)=>s.threads.find(t=>t.id===s.threadId)!;
export const latestCustomerMessage=(t:Thread)=>t.messages.filter(m=>m.who==='customer').at(-1);
export const observed=(s:AppState)=>s.permission&&!s.paused;
export const latestKey=(s:AppState)=>s.threadId+':'+(latestCustomerMessage(currentThread(s))?.id||'none');
export const activeHit=(s:AppState)=>matchKnowledge(latestCustomerMessage(currentThread(s))?.text,s.knowledge,observed(s));
export const activeOptions=(s:AppState)=>replyOptions(activeHit(s));
export const activeReply=(s:AppState)=>{
  const options=activeOptions(s),picked=s.chosen[latestKey(s)];
  return options.find(x=>x.id===picked)||options[0];
};
export const activeReplyKey=(s:AppState)=>latestKey(s)+':'+activeReply(s).id;
export const activeReplyText=(s:AppState)=>s.edits[activeReplyKey(s)]??activeReply(s).text;
const note=(s:AppState,message:string):AppState=>({...s,receipt:message,log:[message,...s.log].slice(0,40)});
const notify=(s:AppState,message:string):AppState=>({...s,toast:{id:(s.toast?.id??0)+1,message}});
const changed=(s:AppState,id:CustomerId,apply:(t:Thread)=>Thread):AppState=>
  ({...s,threads:s.threads.map(t=>t.id===id?apply(t):t)});
const safeToFill=(s:AppState,id:CustomerId,messageId:string):boolean=>{
  if (!observed(s) || id!==s.threadId || !isCustomerId(id)) return false;
  const t=currentThread(s),latest=latestCustomerMessage(t);
  return !!latest && latest.id===messageId && !t.sent.includes(messageId);
};
const risky=/赔偿|承诺|密码|身份证/;
export function reducer(s:AppState,a:Action):AppState {
  switch(a.type) {
    case 'RESET': return {...createInitialState(),knowledgeImportEpoch:s.knowledgeImportEpoch+1,
      historyImportEpoch:s.historyImportEpoch+1};
    case 'TAB': return {...s,tab:a.tab,settingsOrigin:a.tab==='settings'?(s.tab==='settings'?s.settingsOrigin:s.tab):s.settingsOrigin,editing:null};
    case 'OPEN_PRODUCT':return findProduct(a.id)?{...s,productSelected:a.id,tab:'products'}:s;
    case 'CLOSE_PRODUCT':return {...s,productSelected:null};
    case 'OPEN_IMAGE':return findProduct(a.productId)?.images.some(i=>i.id===a.imageId)?
      {...s,imageSelected:{productId:a.productId,imageId:a.imageId},tab:'images'}:s;
    case 'CLOSE_IMAGE':return {...s,imageSelected:null};
    case 'OPEN_ORDER':return orderForCustomer(s.threadId,a.orderId,s.permission)?
      {...s,orderSelected:a.orderId}:s;
    case 'CLOSE_ORDER':return {...s,orderSelected:null};
    case 'SET_THREAD':
      if (!isCustomerId(a.id)||a.id===s.threadId) return s;
      return {...s,threadId:a.id,editing:null,orderSelected:null};
    case 'SET_DRAFT': return changed(s,a.id,t=>({...t,draft:a.text.slice(0,4000)}));
    case 'RECEIVE':{
      if(a.id!==s.threadId||!a.text.trim())return s;
      const text=a.text.trim().slice(0,400),id='m'+(s.counter+1),current=currentThread(s);
      let next=changed(s,a.id,t=>({...t,messages:[...t.messages,{id,who:'customer',text}]}));
      next={...next,counter:s.counter+1,editing:null};
      if(!observed(next))return note(next,'收到模拟消息，观察已停止');
      if(next.auto&&next.consented&&!next.takeovers.includes(a.id)){
        const hit=matchKnowledge(text,next.knowledge,true);
        if(hit?.exact&&hit.k.eligible&&hit.k.enabled&&!hit.k.scope&&!risky.test(text)&&!current.draft.trim()){
          const answer='您好，'+hit.k.a,rid='r'+(next.counter+1);
          next=changed(next,a.id,t=>({...t,messages:[...t.messages,{id:rid,who:'agent',text:answer,replyTo:id}],sent:[...t.sent,id],draft:''}));
          const receipt=next.verify?'智能托管模拟发送 '+rid+' · 回读一致':'模拟已提交，但未启用回读，状态未确认 · 当前会话转人工';
          return notify(note({...next,counter:next.counter+1,
            takeovers:next.verify?next.takeovers:[...next.takeovers,a.id]},receipt),
            next.verify?'模拟自动回复已确认 · 非真实平台':'模拟已提交，回读未确认 · 已转人工');
        }
        return notify(note({...next,takeovers:[...next.takeovers,a.id]},'未精确命中、草稿被占用或有风险，当前会话转人工'),'已转人工 · 没有自动发送');
      }
      return notify(note(next,'客户新消息 '+id+' · 等待人工处理'),'已收到模拟消息');
    }
    case 'FILL':{
      if(!safeToFill(s,a.id,a.messageId)||!a.text.trim()) return note(s,'未填入：会话、授权或消息身份不匹配');
      const t=currentThread(s),draft=a.text.trim().slice(0,4000);
      if(t.draft&&t.draft!==draft&&!a.replace)return note(s,'已有未发送草稿，未覆盖');
      const next=changed(s,a.id,t=>({...t,draft}));
      if(currentThread(next).draft!==draft)return note(s,'草稿回读不一致，保持原草稿');
      return notify(note(next,'已填入并回读模拟草稿 · 未发送'),'已填入聊天草稿 · 未发送');
    }
    case 'SEND':{
      if(!safeToFill(s,a.id,a.messageId))return note(s,'未发送：会话变化、观察停止或已回复');
      const t=currentThread(s),message=t.draft.trim();if(!message)return note(s,'未发送：草稿为空');
      const rid='r'+(s.counter+1);
      const next=changed(s,a.id,t=>({...t,messages:[...t.messages,{id:rid,who:'agent',text:message,replyTo:a.messageId}],sent:[...t.sent,a.messageId],draft:''}));
      const receipt=s.verify?'人工模拟发送 '+rid+' · 回读一致':'模拟已提交，但未启用回读，状态未确认';
      return notify(note({...next,counter:s.counter+1},receipt),s.verify?'模拟发送已确认 · 非真实平台':'模拟已提交，回读未确认');
    }
    case 'REPLY_CHOICE':return {...s,chosen:{...s.chosen,[a.key]:a.id},editing:null};
    case 'REPLY_EDIT':return {...s,editing:a.key};
    case 'REPLY_TEXT':return {...s,edits:{...s.edits,[a.key]:a.text.slice(0,2000)}};
    case 'SETTING':{
      if(a.key==='permission'){
        const on=a.value===true;
        return note({...s,permission:on,auto:on?s.auto:false,consentPending:false,orderSelected:on?s.orderSelected:null},on?'模拟授权已恢复':'模拟授权已撤销 · 停止观察');
      }
      if(a.key==='paused')return note({...s,paused:a.value===true},a.value===true?'已暂停观察':'已恢复观察');
      if(a.key==='follow')return note({...s,follow:a.value===true},a.value?'已启用模拟跟随':'已关闭模拟跟随');
      if(a.key==='verify')return note({...s,verify:a.value===true},a.value?'已开启回读验证':'已关闭回读验证');
      if(a.key==='nicknameMode')return {...s,nicknameMode:a.value==='region'?'region':'original'};
      return s;
    }
    case 'AUTO_REQUEST':return !s.permission?s: s.consented?{...s,auto:true}:{...s,consentPending:true};
    case 'AUTO_CONFIRM':return !s.permission||!s.consentPending?s:notify({...s,consented:true,auto:true,consentPending:false},'模拟自动回复已启用');
    case 'AUTO_CANCEL':return {...s,consentPending:false};
    case 'AUTO_DISABLE':return {...s,auto:false,consentPending:false};
    case 'TAKEOVER':{
      const taken=s.takeovers.includes(s.threadId);
      if(!s.auto&&!taken)return s;
      return note({...s,takeovers:taken?s.takeovers.filter(id=>id!==s.threadId):[...s.takeovers,s.threadId]},
        taken?'已恢复当前会话托管，历史消息不会补发':'已接管当前会话：暂停自动发送');
    }
    case 'IMPORT_KNOWLEDGE':{
      if(a.epoch!==s.knowledgeImportEpoch)return notify(s,'知识导入已取消：数据已重置');
      if(!a.entries.length||a.entries.length>100||s.knowledge.length+a.entries.length>150){
        const message='导入失败：单文件限 1–100 条，知识总数不能超过 150 条';
        return notify({...s,knowledgeImportStatus:message},message);
      }
      // Commit against current state: concurrent File.text() completions share no IDs or stale quota.
      const nextId=Math.max(...s.knowledge.map(k=>Number(k.id.replace(/^k/,''))||0),0);
      const entries=a.entries.map((k,i)=>({...k,id:'k'+(nextId+i+1)}));
      return notify({...s,knowledge:[...s.knowledge,...entries],knowledgeImportStatus:'导入 '+entries.length+' 条'},
        '知识已导入 '+entries.length+' 条 · 仅页面内存');
    }
    case 'IMPORT_HISTORY':{
      if(a.epoch!==s.historyImportEpoch)return notify(s,'客户历史导入已取消：档案已清空或重置');
      try{
        return notify({...s,history:mergeHistory(s.history,a.history),historyImportStatus:'已导入，请点击 ✦ 提取关键信息'},
          '客户历史已导入 · 未上传');
      }catch(error){
        const message='导入失败：'+(error instanceof Error?error.message:'历史数据冲突');
        return notify({...s,historyImportStatus:message},message);
      }
    }
    case 'IMPORT_ERROR':{
      const current=a.kind==='knowledge'?s.knowledgeImportEpoch:s.historyImportEpoch;
      if(a.epoch!==current)return s;
      const message='导入失败：'+a.message;
      return notify({...s,...(a.kind==='knowledge'?{knowledgeImportStatus:message}:{historyImportStatus:message})},message);
    }
    case 'EXTRACT_FACTS':return notify({...s,facts:extractFacts(s.history,s.facts)},'本地规则提取完成 · 待人工确认');
    case 'FACT_STATUS':return {...s,facts:s.facts.map(f=>f.id===a.id&&f.customerId===a.customerId?{...f,status:a.status}:f)};
    case 'CLEAR_PROFILE':return {...s,history:{...s.history,[a.customerId]:[]},facts:s.facts.filter(f=>f.customerId!==a.customerId),
      historyImportEpoch:s.historyImportEpoch+1,historyImportStatus:''};
    case 'CLEAR_LOG':return {...s,log:[],receipt:'操作记录已清空'};
    case 'RECORD':return note(s,a.message);
    case 'TOAST':return notify(s,a.message);
    case 'HIDE_TOAST':return s.toast?.id===a.id?{...s,toast:null}:s;
    default:return s;
  }
}
type WorkbenchContext={state:AppState;dispatch:React.Dispatch<Action>};
const Context=createContext<WorkbenchContext|null>(null);
export function WorkbenchProvider({children}:{children:React.ReactNode}) {
  const [state,dispatch]=useReducer(reducer,undefined,createInitialState);
  const context=useMemo(()=>({state,dispatch}),[state,dispatch]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
export function useWorkbench():WorkbenchContext{
  const context=useContext(Context);
  if(!context)throw Error('WorkbenchProvider is missing');
  return context;
}
export function useActiveContext(){
  const {state,dispatch}=useWorkbench(),thread=currentThread(state),message=latestCustomerMessage(thread);
  return {state,dispatch,thread,message,active:observed(state),id:state.threadId};
}
