import React, { createContext, useContext, useMemo, useReducer, useEffect, useRef, useCallback } from 'react';
import { connectNative, desktopBridge, parseNativeMessage, postNative, sameBinding, type Binding, type FillRequest, type SettingsRequest } from './desktop';
import { isCustomerId, type CustomerId, type Product, type Order } from './domain/catalog';
import { extractFacts, initialHistory, mergeHistory, type FactStatus, type HistoryByCustomer, type ProfileFact } from './domain/history';
import { initialKnowledge, matchKnowledge, replyOptions, type Knowledge } from './domain/knowledge';
import type { AiQueryRequest, AiState, AiResult } from './domain/ai';
import { parseMappingPlan, runMappingPlan, type MappingPlan } from './domain/business-mapping';
import { createBusinessState, parseBusinessSnapshot, previewBusinessImport, applyBusinessImport,
  saveLocalEntity, clearLocalOverride, parseBusinessBackup, effectiveEntities, addBusinessStore,
  type BusinessState, type Entity, type ImportPreview } from './domain/business';

import {businessFeedback} from './domain/business-feedback';
import {useBusinessWorkspace,type BusinessWorkspace} from './use-business-workspace';

export const tabs = ['reply','knowledge','customer','products','images','orders'] as const;
export type Tab = (typeof tabs)[number];
export type Panel = Tab|'settings';
export const labels: Record<Tab,string> = {reply:'推荐回复',knowledge:'知识库',customer:'客户档案',products:'商品',images:'图片',orders:'订单'};
export interface ChatMessage { id:string; who:'customer'|'agent'; text:string; replyTo?:string }
export interface Thread { id:CustomerId; name:string; messages:ChatMessage[]; sent:string[]; draft:string }
type SlotMapping = Record<CustomerId,string|null>;
type StoreSession = Pick<AppState,'storeId'|'threadId'|'threads'|'history'|'facts'|'knowledge'|'chosen'|'edits'|'takeovers'> & { mapping:SlotMapping };
export interface NativeReplyVersion {
  id:string; name:string; symbol:string; text:string;
  // Keep provenance with the version, never borrow evidence from a later query.
  result:AiResult|null; candidateId:string;
}
export interface AppState {
  business:BusinessState; storeId:string; businessEpoch:number; businessPreview:ImportPreview|null; businessStatus:string;
  businessMappings:{plan:MappingPlan;enabled:boolean;version:number}[]; mappingVersion:number; mappingStatus:string;
  mappingPreview:{key:string;version:number}|null;
  storeSessions:Record<string,StoreSession>;
  native:boolean; revision:number; binding:Binding|null; nativeObserving:boolean;
  nativeReplyVersions:NativeReplyVersion[];
  pendingFill:FillRequest|null; fillAttempt:string|null; receiptSeen:string[]; ai:AiState|null;
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
 | {type:'MAPPING_SAVE';text:string;input:string;cursor:string;previousCursor:string|null;storeId:string;epoch:number}
 | {type:'MAPPING_RESTORE';text:string;storeId:string;epoch:number}
 | {type:'MAPPING_TOGGLE';key:string;version:number;storeId:string;epoch:number}
 | {type:'MAPPING_PREVIEW';key:string;version:number;input:string;cursor:string;previousCursor:string|null;storeId:string;epoch:number}
 | {type:'BUSINESS_ADD_STORE';id:string;name:string}
 | {type:'BUSINESS_STORE';storeId:string}
 | {type:'BUSINESS_PREVIEW';text:string;storeId:string;epoch:number}
 | {type:'BUSINESS_APPLY'}
 | {type:'BUSINESS_CANCEL'}
 | {type:'BUSINESS_SAVE';entity:Entity;storeId:string;epoch:number}
 | {type:'BUSINESS_REVERT';key:string;storeId:string}
 | {type:'BUSINESS_RESTORE';text:string;epoch:number}
 | {type:'BUSINESS_ERROR';message:string;storeId:string;epoch:number}
 | {type:'NATIVE_MESSAGE';message:unknown}
 | {type:'NATIVE_FILL';request:FillRequest}
 | {type:'NATIVE_AI_QUERY';request:AiQueryRequest}
 | {type:'NATIVE_FAILURE'}
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
 | {type:'FILL';id:CustomerId;messageId:string;text:string;replace:boolean;storeId?:string;businessRevision?:number}
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

export function createInitialState(native=false):AppState {
  const history=initialHistory();
  return {
    business:createBusinessState(),storeId:'store-demo',businessEpoch:0,businessPreview:null,businessStatus:'',storeSessions:{},
    businessMappings:[],mappingVersion:0,mappingStatus:'',mappingPreview:null,
    nativeReplyVersions:[],native,revision:-1,binding:null,nativeObserving:false,pendingFill:null,fillAttempt:null,receiptSeen:[],ai:null,
    threadId:'t1',threads:[
      {id:'t1',name:native?'等待原生观察':'林女士',messages:native?[]:[{id:'m1',who:'customer',text:'签收后 7 天内还能申请退款吗？'}],sent:[],draft:''},
      {id:'t2',name:native?'等待原生观察':'陈先生',messages:native?[]:[{id:'m2',who:'customer',text:'物流怎么查询？'}],sent:[],draft:''},
      {id:'t3',name:native?'等待原生观察':'周女士',messages:native?[]:[{id:'m3',who:'customer',text:'商品如何选尺码？'}],sent:[],draft:''}
    ],
    tab:'reply',settingsOrigin:'reply',permission:!native,paused:false,auto:false,consented:false,
    consentPending:false,follow:true,verify:true,nicknameMode:'original',takeovers:[],
    chosen:{},edits:{},editing:null,knowledge:initialKnowledge(),history,facts:extractFacts(history,[]),
    knowledgeImportEpoch:0,historyImportEpoch:0,knowledgeImportStatus:'',historyImportStatus:'',
    productSelected:null,imageSelected:null,orderSelected:null,
    receipt:native?'等待原生观察 · 未授权':'尚未发送',counter:7,log:[],toast:null
  };
}
export const currentThread=(s:AppState)=>s.threads.find(t=>t.id===s.threadId)!;
export const businessProducts=(s:AppState):Product[]=>effectiveEntities(s.business,s.storeId,'product').map(e=>e.data as Product);
// Local CRM links only bind the three fictitious chat slots. Native observation has no store authority.
export const businessOrders=(s:AppState):Order[]=>{
  if(!s.permission||s.native)return [];
  const linked=effectiveEntities(s.business,s.storeId,'customer').filter(e=>
    (e.data as {conversationId:string|null}).conversationId===s.threadId);
  if(linked.length!==1)return [];
  return effectiveEntities(s.business,s.storeId,'order').filter(e=>
    (e.data as Order).customerId===linked[0].id&&e.sourceId===linked[0].sourceId).map(e=>e.data as Order);
};
// Local single-operator file maintenance is independent of chat observation authority.
export const businessManagementEntities=(s:AppState):Entity[]=>effectiveEntities(s.business,s.storeId);
const slots:CustomerId[]=['t1','t2','t3'];
const slotMapping=(business:BusinessState,storeId:string):SlotMapping=>{
  const customers=effectiveEntities(business,storeId,'customer');
  return Object.fromEntries(slots.map(slot=>{
    const linked=customers.filter(e=>e.data?.conversationId===slot);
    return [slot,linked.length===1?JSON.stringify([storeId,linked[0].sourceId,linked[0].id]):null];
  })) as SlotMapping;
};
const scoped=({storeId,threadId,threads,history,facts,knowledge,chosen,edits,takeovers,business}:AppState):StoreSession=>
  ({storeId,threadId,threads,history,facts,knowledge,chosen,edits,takeovers,mapping:slotMapping(business,storeId)});
function reconcile(session:StoreSession,business:BusinessState,storeId:string):StoreSession {
  const mapping=slotMapping(business,storeId);
  const changedSlots=slots.filter(id=>session.storeId!==storeId||session.mapping[id]!==mapping[id]);
  const keepKey=(key:string)=>!changedSlots.some(id=>key.startsWith(session.storeId+':'+id+':'));
  return {...session,storeId,mapping,
    threads:session.threads.map(t=>changedSlots.includes(t.id)?{...t,name:effectiveEntities(business,storeId,'customer')
      .find(e=>e.data?.conversationId===t.id)?.data?.name??'未映射客户',messages:[],draft:'',sent:[]}:t),
    history:Object.fromEntries(slots.map(id=>[id,changedSlots.includes(id)?[]:session.history[id]])) as HistoryByCustomer,
    facts:session.facts.filter(f=>!changedSlots.includes(f.customerId)),
    chosen:Object.fromEntries(Object.entries(session.chosen).filter(([key])=>keepKey(key))),
    edits:Object.fromEntries(Object.entries(session.edits).filter(([key])=>keepKey(key))),
    takeovers:session.takeovers.filter(id=>!changedSlots.includes(id))};
}
function freshSession(business:BusinessState,storeId:string):StoreSession {
  const fresh=createInitialState();
  // Seed messages belong only to the built-in store/source/customer identities.
  // A new store has no imported customer history, even when its slot is t1.
  fresh.storeId=storeId;
  fresh.history={t1:[],t2:[],t3:[]};fresh.facts=[];
  const seed=scoped(fresh);
  seed.threads=seed.threads.map(t=>seed.mapping[t.id]?t:{...t,name:'未映射客户',messages:[]});
  return reconcile(seed,business,storeId);
}
function withBusiness(s:AppState,business:BusinessState,storeId=s.storeId):AppState {
  const storeSessions=s.native?s.storeSessions:{...s.storeSessions,[s.storeId]:scoped(s)};
  if(!s.native)for(const store of business.stores){
    const cached=Object.hasOwn(storeSessions,store.id)?storeSessions[store.id]:undefined;
    if(cached)storeSessions[store.id]=reconcile(cached,business,store.id);
  }
  const session=s.native?null:reconcile((Object.hasOwn(storeSessions,storeId)?storeSessions[storeId]:undefined)??freshSession(business,storeId),business,storeId);
  return {...s,...(session??{}),business,storeId,
    storeSessions:session?{...storeSessions,[storeId]:session}:storeSessions,
    businessEpoch:s.businessEpoch+1,businessPreview:null,mappingPreview:null,
    productSelected:null,imageSelected:null,orderSelected:null,editing:s.native?s.editing:null,
    auto:false,consented:false,consentPending:false,
    knowledgeImportEpoch:s.knowledgeImportEpoch+1,historyImportEpoch:s.historyImportEpoch+1,
    knowledgeImportStatus:'',historyImportStatus:''};
}
export const latestCustomerMessage=(t:Thread)=>t.messages.filter(m=>m.who==='customer').at(-1);
export const observed=(s:AppState)=>s.permission&&!s.paused&&(!s.native||s.nativeObserving);
// Human draft identity survives observation generations; request authority does not.
export const latestKey=(s:AppState)=>s.native?JSON.stringify(s.binding&&[
  s.binding.pid,s.binding.windowId,s.binding.customerId,s.binding.messageId
]):s.storeId+':'+s.threadId+':'+(latestCustomerMessage(currentThread(s))?.id||'none');
export const activeHit=(s:AppState)=>matchKnowledge(latestCustomerMessage(currentThread(s))?.text,s.knowledge,observed(s));
export const activeOptions=(s:AppState)=>{
  if(!s.native)return replyOptions(activeHit(s));
  if(s.nativeReplyVersions.length)return s.nativeReplyVersions;
  if(s.ai?.status==='ready'&&s.ai.result&&sameBinding(s.binding,s.ai.binding))
    return s.ai.result.candidates.map(c=>({id:c.id,name:c.name,symbol:c.symbol,text:c.text}));
  // Never present demonstration knowledge as verified native-customer facts.
  return [{id:'human',name:'人工核实',symbol:'♙',text:'您好，我先核对相关资料，确认后再回复您。'}];
};
export const activeReply=(s:AppState)=>{
  const options=activeOptions(s),picked=s.chosen[latestKey(s)];
  return options.find(x=>x.id===picked)||options[0];
};
export const nativeReplyResult=(s:AppState,id=activeReply(s).id):AiResult|null=>
  s.nativeReplyVersions.find(version=>version.id===id)?.result??null;
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
export const mappingKey=(plan:MappingPlan)=>JSON.stringify([plan.storeId,plan.sourceId]);
export function reducer(s:AppState,a:Action):AppState {
  if(s.native&&['RESET','SET_THREAD','SET_DRAFT','RECEIVE','FILL','SEND','AUTO_REQUEST','AUTO_CONFIRM','AUTO_DISABLE','AUTO_CANCEL','TAKEOVER'].includes(a.type))return s;
  switch(a.type) {
    case 'MAPPING_SAVE':
    case 'MAPPING_RESTORE':{
      if(a.storeId!==s.storeId||a.epoch!==s.businessEpoch)return s;
      try{
        const plan=parseMappingPlan(a.text),key=mappingKey(plan);
        if(plan.storeId!==s.storeId)throw Error('方案店铺不同，请先选择对应店铺');
        if(a.type==='MAPPING_SAVE'){
          const previousCursor=s.business.cursors[key]??null;
          if(a.previousCursor!==previousCursor)throw Error('已应用页标记变化，请重新试跑');
          const snapshot=runMappingPlan(plan,a.input,{storeId:s.storeId,sourceId:plan.sourceId,previousCursor,cursor:a.cursor},s.business);
          previewBusinessImport(s.business,snapshot);
        }
        if(s.businessMappings.length>=40&&!s.businessMappings.some(m=>mappingKey(m.plan)===key))throw Error('最多保存40个方案');
        const version=s.mappingVersion+1;
        return {...s,businessMappings:[...s.businessMappings.filter(m=>mappingKey(m.plan)!==key),{plan,version,enabled:false}],
          mappingVersion:version,mappingPreview:null,businessPreview:null,
          mappingStatus:a.type==='MAPPING_RESTORE'?'已恢复方案，默认停用；请试跑核对后启用':'已保存方案，默认停用；启用后可使用'};
      }catch(error){return {...s,mappingStatus:'方案保存失败：'+(error instanceof Error?error.message:'配置无效')};}
    }
    case 'MAPPING_TOGGLE':{
      if(a.storeId!==s.storeId||a.epoch!==s.businessEpoch)return s;
      const current=s.businessMappings.find(m=>mappingKey(m.plan)===a.key&&m.plan.storeId===s.storeId&&m.version===a.version);
      if(!current)return s;
      const version=s.mappingVersion+1;
      return {...s,mappingVersion:version,businessMappings:s.businessMappings.map(m=>m===current?{...m,enabled:!m.enabled,version}:m),
        businessPreview:null,mappingPreview:null,mappingStatus:current.enabled?'已停用方案；已应用资料保留':'已启用方案；仅在手动使用时运行'};
    }
    case 'MAPPING_PREVIEW':{
      if(a.storeId!==s.storeId||a.epoch!==s.businessEpoch)return s;
      try{
        const saved=s.businessMappings.find(m=>mappingKey(m.plan)===a.key&&m.plan.storeId===s.storeId&&m.version===a.version);
        if(!saved?.enabled)throw Error('方案已变更或停用，请重新选择');
        const previousCursor=s.business.cursors[a.key]??null;
        if(a.previousCursor!==previousCursor)throw Error('已应用页标记变化，请重新试跑');
        const snapshot=runMappingPlan(saved.plan,a.input,{storeId:s.storeId,sourceId:saved.plan.sourceId,previousCursor,cursor:a.cursor},s.business);
        return {...s,businessPreview:previewBusinessImport(s.business,snapshot),mappingPreview:{key:a.key,version:a.version},
          businessStatus:'方案预检通过，确认后才应用；所有资料仍需人工核实'};
      }catch(error){return {...s,businessPreview:null,mappingPreview:null,businessStatus:'方案预检失败：'+(error instanceof Error?error.message:'输入无效')};}
    }
    case 'BUSINESS_ADD_STORE':{
      try{return {...s,business:addBusinessStore(s.business,a.id,a.name),businessEpoch:s.businessEpoch+1,
        businessPreview:null,mappingPreview:null,businessStatus:'已新增店铺，请在数据店铺中选择'};}
      catch(error){return {...s,businessStatus:'新增失败：'+businessFeedback(error)};}
    }
    case 'BUSINESS_STORE':{
      if(!s.business.stores.some(store=>store.id===a.storeId)||a.storeId===s.storeId)return s;
      return {...withBusiness(s,s.business,a.storeId),businessStatus:'已切换数据店铺 · 请核对来源'};
    }
    case 'BUSINESS_PREVIEW':{
      if(a.storeId!==s.storeId||a.epoch!==s.businessEpoch)return s;
      try{
        const snapshot=parseBusinessSnapshot(a.text);
        if(snapshot.storeId!==s.storeId)throw Error('文件店铺与当前店铺不同，请先切换数据店铺');
        const businessPreview=previewBusinessImport(s.business,snapshot);
        return {...s,businessPreview,mappingPreview:null,businessStatus:'预检通过，确认后才应用；所有资料仍需人工核实'};
      }catch(error){return {...s,businessPreview:null,mappingPreview:null,businessStatus:'预检失败：'+businessFeedback(error)};}
    }
    case 'BUSINESS_APPLY':{
      if(!s.businessPreview)return s;
      try{
        if(s.mappingPreview&&!s.businessMappings.some(m=>mappingKey(m.plan)===s.mappingPreview!.key&&m.version===s.mappingPreview!.version&&m.enabled))throw Error('方案已变更或停用，请重新预检');
        return {...withBusiness(s,applyBusinessImport(s.business,s.businessPreview)),businessStatus:'已应用同步页 · 非实时承诺'};
      }catch(error){return {...s,businessPreview:null,mappingPreview:null,businessStatus:'应用失败：'+businessFeedback(error)};}
    }
    case 'BUSINESS_CANCEL':return {...s,businessPreview:null,mappingPreview:null,businessStatus:'已取消预检'};
    case 'BUSINESS_SAVE':{
      if(a.storeId!==s.storeId||a.entity.storeId!==s.storeId||a.epoch!==s.businessEpoch)return s;
      try{return {...withBusiness(s,saveLocalEntity(s.business,a.entity)),businessStatus:'已保存本地资料 · 需要人工核实'};}
      catch(error){return {...s,businessStatus:'保存失败：'+businessFeedback(error)};}
    }
    case 'BUSINESS_REVERT':{
      if(a.storeId!==s.storeId)return s;
      try{return {...withBusiness(s,clearLocalOverride(s.business,a.key)),businessStatus:'已恢复来源资料'};}
      catch(error){return {...s,businessStatus:'恢复失败：'+businessFeedback(error)};}
    }
    case 'BUSINESS_RESTORE':{
      if(a.epoch!==s.businessEpoch)return s;
      try{
        const business=parseBusinessBackup(a.text);
        return {...withBusiness(s,business,business.stores.some(x=>x.id===s.storeId)?s.storeId:business.stores[0].id),
          businessStatus:'已恢复本地数据备份 · 未恢复任何授权'};
      }catch(error){return {...s,businessStatus:'恢复失败：'+businessFeedback(error)};}
    }
    case 'BUSINESS_ERROR':return a.storeId===s.storeId&&a.epoch===s.businessEpoch?
      {...s,businessPreview:null,businessStatus:a.message}:s;
    case 'NATIVE_MESSAGE':{
      if(!s.native)return s;
      const m=parseNativeMessage(a.message);if(!m)return s;
      if(m.type==='support.aiResult'){
        if(!s.ai||s.ai.status!=='loading'||m.requestId!==s.ai.requestId||
          !sameBinding(s.binding,m.binding)||!sameBinding(s.ai.binding,m.binding)||!observed(s))return s;
        const versions=m.status==='ready'?[
          ...s.nativeReplyVersions,
          ...m.candidates.map(c=>({...c,id:s.nativeReplyVersions.length?m.requestId+':'+c.id:c.id,
            result:m,candidateId:c.id}))
        ]:s.nativeReplyVersions;
        return {...s,nativeReplyVersions:versions,ai:{...s.ai,status:m.status,result:m},editing:null};
      }
      if(m.type==='support.observation'){
        if(m.revision<=s.revision)return s;
        const b=s.binding,n=m.binding;
        // A new host/window/customer requires an explicit native generation change.
        if(b&&(n.generation<b.generation||(n.generation===b.generation&&
          (n.pid!==b.pid||n.windowId!==b.windowId||n.customerId!==b.customerId))))return s;
        const sameIdentity=sameBinding(b,n);
        const sameDraft=!!b&&b.pid===n.pid&&b.windowId===n.windowId&&
          b.customerId===n.customerId&&b.messageId===n.messageId&&
          latestCustomerMessage(currentThread(s))?.text===m.conversation.messages.filter(x=>x.who==='customer').at(-1)?.text;
        const next=changed(s,n.customerId,t=>({...t,name:m.conversation.name,
          messages:m.conversation.messages,draft:m.conversation.draft,sent:[]}));
        return {...next,threadId:n.customerId,binding:n,revision:m.revision,nativeObserving:m.observing,
          permission:m.observing,paused:m.observing?false:s.paused,
          pendingFill:m.observing&&sameIdentity?s.pendingFill:null,
          ai:m.observing&&sameIdentity?s.ai:null,
          nativeReplyVersions:sameDraft?s.nativeReplyVersions:[],
          chosen:sameDraft?s.chosen:{},edits:sameDraft?s.edits:{},
          fillAttempt:sameIdentity?s.fillAttempt:null,receiptSeen:sameIdentity?s.receiptSeen:[],
          editing:sameDraft?s.editing:null,orderSelected:b?.generation===n.generation?s.orderSelected:null,receipt:m.reason||(m.observing?'原生观察已更新':'原生观察已停止')};
      }
      if(!sameBinding(s.binding,m.binding)||!s.pendingFill||!observed(s)||m.requestId!==s.pendingFill.requestId||
        (m.status==='verified'&&m.draft!==s.pendingFill.text))return s;
      const fingerprint=JSON.stringify(m);if(s.receiptSeen.includes(fingerprint))return s;
      const next=m.draft===undefined?s:changed(s,m.binding.customerId,t=>({...t,draft:m.draft!}));
      return note({...next,pendingFill:null,receiptSeen:[...s.receiptSeen,fingerprint],
        nativeObserving:m.status==='unknown'?false:s.nativeObserving},'原生草稿 '+m.status+' · '+m.reason);
    }
    case 'NATIVE_AI_QUERY':{
      const r=a.request;
      if(!s.native||!observed(s)||!sameBinding(s.binding,r.binding)||
        !latestCustomerMessage(currentThread(s))||s.ai?.status==='loading'||
        !/^[A-Za-z0-9_-]{1,40}$/.test(r.requestId))return s;
      const key=latestKey(s),selected=activeReply(s);
      // Snapshot a human fallback only when it has actually been edited. Ready
      // versions are already retained with their own evidence and stable keys.
      const versions=s.nativeReplyVersions.length?s.nativeReplyVersions:
        s.edits[activeReplyKey(s)]!==undefined?[{...selected,result:null,candidateId:selected.id}]:[];
      return {...s,nativeReplyVersions:versions,
        chosen:versions.length?{...s.chosen,[key]:selected.id}:s.chosen,
        ai:{status:'loading',requestId:r.requestId,binding:r.binding,result:null},editing:null};
    }
    case 'NATIVE_FILL':{
      const r=a.request,attempt=JSON.stringify([r.binding,r.text,r.expectedDraft]);
      if(!s.native||!observed(s)||!latestCustomerMessage(currentThread(s))||!sameBinding(s.binding,r.binding)||s.pendingFill||s.fillAttempt===attempt||
        r.expectedDraft!==currentThread(s).draft||r.text===r.expectedDraft||!r.text.trim())return s;
      return {...s,pendingFill:r,fillAttempt:attempt,receipt:'已请求原生填入 · 等待原生回执'};
    }
    case 'NATIVE_FAILURE':return s.native?note({...s,nativeObserving:false,pendingFill:null,ai:null},'原生桥不可用 · 已停止操作'):s;
    case 'RESET': return {...createInitialState(),businessEpoch:s.businessEpoch+1,knowledgeImportEpoch:s.knowledgeImportEpoch+1,
      historyImportEpoch:s.historyImportEpoch+1};
    case 'TAB': return {...s,tab:a.tab,settingsOrigin:a.tab==='settings'?(s.tab==='settings'?s.settingsOrigin:s.tab):s.settingsOrigin,editing:null};
    case 'OPEN_PRODUCT':return effectiveEntities(s.business,s.storeId,'product').some(p=>p.id===a.id)?{...s,productSelected:a.id,tab:'products'}:s;
    case 'CLOSE_PRODUCT':return {...s,productSelected:null};
    case 'OPEN_IMAGE':return businessProducts(s).find(p=>p.id===a.productId)?.images.some(i=>i.id===a.imageId)?
      {...s,imageSelected:{productId:a.productId,imageId:a.imageId},tab:'images'}:s;
    case 'CLOSE_IMAGE':return {...s,imageSelected:null};
    case 'OPEN_ORDER':return businessOrders(s).some(o=>o.orderId===a.orderId)?
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
      if(a.storeId!==undefined&&a.storeId!==s.storeId)return s;
      if(a.businessRevision!==undefined&&a.businessRevision!==s.business.revision)return s;
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
    case 'REPLY_EDIT':return {...s,editing:a.key,
      // Opening the editor takes ownership before an AX value change or IME
      // composition necessarily reaches React's change/blur handlers.
      ai:s.native&&a.key===activeReplyKey(s)&&s.ai?.status==='loading'?null:s.ai};
    case 'REPLY_TEXT':return {...s,
      // Human input takes ownership of the current reply. A pending result
      // may still finish in the Host, but cannot replace this edit.
      ai:s.native&&s.ai?.status==='loading'&&a.key===activeReplyKey(s)?null:s.ai,
      edits:{...s.edits,[a.key]:a.text.slice(0,2000)}};
    case 'SETTING':{
      if(s.native){
        if(a.key==='permission')return a.value===false?{...s,permission:false,nativeObserving:false,pendingFill:null,ai:null}:s;
        if(a.key==='paused')return {...s,paused:a.value===true,
          nativeObserving:a.value===true?false:s.nativeObserving,pendingFill:null,ai:a.value===true?null:s.ai};
        if(a.key==='follow')return {...s,follow:a.value===true};
        if(a.key==='verify')return s;
      }
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
type WorkbenchContext={state:AppState;dispatch:React.Dispatch<Action>;fillNative:(text:string)=>void;queryNative:()=>void;workspace:BusinessWorkspace};
const Context=createContext<WorkbenchContext|null>(null);
export function WorkbenchProvider({children}:{children:React.ReactNode}) {
  const [bridge]=React.useState(desktopBridge);
  const [state,reduce]=useReducer(reducer,!!bridge,createInitialState);
  const sent=useRef(new Set<string>()),aiSent=useRef(new Set<string>()),sequence=useRef(0);
  const dispatch=useCallback<React.Dispatch<Action>>((action)=>{
    if(bridge&&action.type==='SETTING'&&['permission','paused','follow'].includes(action.key)){
      if(action.key==='permission'&&action.value!==false)return;
      const request:SettingsRequest=action.key==='permission'?{type:'support.settings',permission:false}:
        action.key==='paused'?{type:'support.settings',paused:action.value===true}:{type:'support.settings',follow:action.value===true};
      reduce(action);
      if(!postNative(bridge,request))reduce({type:'NATIVE_FAILURE'});
      return;
    }
    reduce(action);
    // Cancel synchronously with human ownership, before a late HTTP completion
    // can start native readback. Cancellation never grants observation rights.
    if(bridge&&(action.type==='REPLY_TEXT'||action.type==='REPLY_EDIT'&&action.key!==null)){
      if(!postNative(bridge,{type:'support.aiCancel'}))reduce({type:'NATIVE_FAILURE'});
    }
  },[bridge]);
  useEffect(()=>{
    if(!bridge)return;
    return connectNative(bridge,message=>reduce({type:'NATIVE_MESSAGE',message}),()=>reduce({type:'NATIVE_FAILURE'}));
  },[bridge]);
  useEffect(()=>{
    const request=state.pendingFill;
    if(!bridge||!request||sent.current.has(request.requestId))return;
    sent.current.add(request.requestId);
    if(!postNative(bridge,request))reduce({type:'NATIVE_FAILURE'});
  },[bridge,state.pendingFill]);
  useEffect(()=>{
    const ai=state.ai;
    if(!bridge||!ai||ai.status!=='loading'||aiSent.current.has(ai.requestId))return;
    aiSent.current.add(ai.requestId);
    if(!postNative(bridge,{type:'support.aiQuery',requestId:ai.requestId,binding:ai.binding}))
      reduce({type:'NATIVE_FAILURE'});
  },[bridge,state.ai]);
  // Effects run after React commits the DOM. This is render telemetry, not external readback.
  useEffect(()=>{
    if(!bridge||!state.binding)return;
    postNative(bridge,{type:'support.rendered',revision:state.revision,binding:state.binding,tab:state.tab,
      latestText:latestCustomerMessage(currentThread(state))?.text||'',replyText:activeReplyText(state),
      draft:currentThread(state).draft,receipt:state.receipt});
  },[bridge,state]);
  const fillNative=useCallback((text:string)=>{
    if(!state.binding)return;
    reduce({type:'NATIVE_FILL',request:{type:'support.fillDraft',requestId:'fill-'+Date.now()+'-'+(++sequence.current),
      binding:state.binding,text:text.trim(),expectedDraft:currentThread(state).draft}});
  },[state]);
  const queryNative=useCallback(()=>{
    if(!state.native||!state.binding||!observed(state))return;
    reduce({type:'NATIVE_AI_QUERY',request:{type:'support.aiQuery',
      requestId:'ai-'+Date.now()+'-'+(++sequence.current),binding:state.binding}});
  },[state]);
  const workspace=useBusinessWorkspace(state,dispatch);
  const context={state,dispatch,fillNative,queryNative,workspace};
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
