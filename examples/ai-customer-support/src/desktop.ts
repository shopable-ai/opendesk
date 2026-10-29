import type { CustomerId } from './domain/catalog';
import type { AiQueryRequest, AiResult, EvidenceItem, ReplyCandidate } from './domain/ai';

export interface Binding {
  generation:number; pid:number; windowId:number; customerId:CustomerId; messageId:string;
}
export interface Observation {
  type:'support.observation'; revision:number; binding:Binding;
  conversation:{name:string;messages:{id:string;who:'customer'|'agent';text:string}[];draft:string};
  observing:boolean; reason?:string;
}
export interface Receipt {
  type:'support.receipt'; requestId:string; binding:Binding; status:'verified'|'refused'|'unknown'; draft?:string; reason:string;
}
export type NativeMessage=Observation|Receipt|AiResult;
export type SettingsRequest={type:'support.settings';permission?:false;paused?:boolean;follow?:boolean};
export type FillRequest={type:'support.fillDraft';requestId:string;binding:Binding;text:string;expectedDraft:string};
export type OutgoingMessage={type:'support.ready'}|SettingsRequest|FillRequest|AiQueryRequest|{
  type:'support.rendered';revision:number;binding:Binding;tab:string;latestText:string;replyText:string;draft:string;receipt:string;
};
export interface DesktopBridge {
  postMessage:(json:string)=>void;
  onMessage:(handler:(json:unknown)=>void)=>()=>void;
}
declare global { interface Window { OpenDeskApp?:DesktopBridge } }
export function desktopBridge():DesktopBridge|undefined {
  if(typeof window==='undefined')return;
  const bridge=window.OpenDeskApp;
  return bridge&&typeof bridge.postMessage==='function'&&typeof bridge.onMessage==='function'?bridge:undefined;
}
export function postNative(bridge:DesktopBridge,message:OutgoingMessage):boolean {
  try{bridge.postMessage(JSON.stringify(message));return true;}catch{return false;}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string';
const among=(v:unknown,options:readonly string[]):v is string=>text(v)&&options.includes(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
export function isBinding(v:unknown):v is Binding {
  return record(v)&&integer(v.generation)&&integer(v.pid)&&v.pid>0&&integer(v.windowId)&&v.windowId>0&&
    text(v.customerId)&&['t1','t2','t3'].includes(v.customerId)&&text(v.messageId)&&v.messageId.length>0;
}
export function sameBinding(a:Binding|null,b:Binding):boolean {
  return !!a&&a.generation===b.generation&&a.pid===b.pid&&a.windowId===b.windowId&&
    a.customerId===b.customerId&&a.messageId===b.messageId;
}
// Only these two data envelopes enter state. Never interpret chat text as commands.
export function parseNativeMessage(input:unknown):NativeMessage|null {
  let v:unknown=input;
  try{if(text(v))v=JSON.parse(v);}catch{return null;}
  if(!record(v)||!isBinding(v.binding))return null;
  const binding:Binding={generation:v.binding.generation,pid:v.binding.pid,windowId:v.binding.windowId,
    customerId:v.binding.customerId,messageId:v.binding.messageId};
  if(v.type==='support.aiResult'){
    const statuses=['ready','blocked','error'],retrieval=['supported','partial','unverified','conflict','unavailable'];
    if(!text(v.requestId)||!v.requestId||v.requestId.length>40||
      !text(v.projectId)||v.projectId.length>64||!among(v.knowledgeBackend,['query_api','mock'])||
      !among(v.modelProvider,['http','codex_cli','none'])||!among(v.retrievalStatus,retrieval)||
      !among(v.status,statuses)||v.requiresHumanReview!==true||
      (v.errorCode!==null&&(!text(v.errorCode)||!/^[A-Z_]{2,60}$/.test(v.errorCode)))||
      !record(v.evidencePack)||v.evidencePack.projectId!==v.projectId||
      !among(v.evidencePack.coverage,['full','partial','unknown','conflict'])||
      !Array.isArray(v.evidencePack.items)||v.evidencePack.items.length>8||
      !Array.isArray(v.candidates)||v.candidates.length>3||
      (v.status==='ready'&&v.candidates.length===0)||(v.status!=='ready'&&v.candidates.length!==0))return null;
    const items:EvidenceItem[]=[];
    for(const raw of v.evidencePack.items){
      if(!record(raw)||!text(raw.id)||raw.id.length>40||raw.sourceType!=='knowledge_base'||
        !text(raw.sourceRef)||raw.sourceRef.length>160||!text(raw.answerHash)||
        !/^[a-f0-9]{32,128}$/i.test(raw.answerHash))return null;
      items.push({id:raw.id,sourceType:'knowledge_base',sourceRef:raw.sourceRef,answerHash:raw.answerHash});
    }
    if(new Set(items.map(e=>e.id)).size!==items.length)return null;
    const candidates:ReplyCandidate[]=[];
    for(const raw of v.candidates){
      if(!record(raw)||!text(raw.id)||raw.id.length>40||!text(raw.name)||raw.name.length>60||
        !text(raw.symbol)||raw.symbol.length>4||!text(raw.text)||!raw.text.trim()||
        raw.text.length>2000||!Array.isArray(raw.evidenceIds)||raw.evidenceIds.length>8||
        raw.evidenceIds.some(id=>!text(id)||!items.some(e=>e.id===id)))return null;
      candidates.push({id:raw.id,name:raw.name,symbol:raw.symbol,text:raw.text,evidenceIds:[...raw.evidenceIds]});
    }
    if(new Set(candidates.map(c=>c.id)).size!==candidates.length)return null;
    return {type:v.type,requestId:v.requestId,binding,projectId:v.projectId,
      knowledgeBackend:v.knowledgeBackend as AiResult['knowledgeBackend'],modelProvider:v.modelProvider as AiResult['modelProvider'],
      retrievalStatus:v.retrievalStatus as AiResult['retrievalStatus'],status:v.status as AiResult['status'],errorCode:v.errorCode as string|null,
      evidencePack:{projectId:v.projectId,coverage:v.evidencePack.coverage as AiResult['evidencePack']['coverage'],items},
      candidates,requiresHumanReview:true};
  }
  if(v.type==='support.receipt'){
    if(!text(v.requestId)||!v.requestId||v.requestId.length>100||(v.status!=='verified'&&v.status!=='refused'&&v.status!=='unknown')||!text(v.reason)||
      (v.draft!==undefined&&!text(v.draft)))return null;
    return {type:v.type,requestId:v.requestId,binding,status:v.status as Receipt['status'],reason:v.reason,
      ...(v.draft===undefined?{}:{draft:v.draft as string})};
  }
  if(v.type!=='support.observation'||!integer(v.revision)||typeof v.observing!=='boolean'||
    (v.reason!==undefined&&!text(v.reason))||!record(v.conversation))return null;
  const c=v.conversation;
  if(!text(c.name)||!text(c.draft)||!Array.isArray(c.messages))return null;
  const messages:Observation['conversation']['messages']=[],ids=new Set<string>();
  for(const m of c.messages){
    if(!record(m)||!text(m.id)||!m.id||ids.has(m.id)||!text(m.text)||(m.who!=='customer'&&m.who!=='agent'))return null;
    ids.add(m.id);messages.push({id:m.id,who:m.who,text:m.text});
  }
  const latest=messages.filter(m=>m.who==='customer').at(-1);
  if((latest?.id??'none')!==binding.messageId)return null;
  return {type:v.type,revision:v.revision,binding,conversation:{name:c.name,messages,draft:c.draft},
    observing:v.observing,...(v.reason===undefined?{}:{reason:v.reason as string})};
}

// The page can mount before Runtime installs its listener. Retry only the handshake.
export function connectNative(bridge:DesktopBridge,onMessage:(message:NativeMessage)=>void,onFailure:()=>void):()=>void {
  let stopped=false,seenObservation=false;
  let timer:ReturnType<typeof setInterval>|undefined;
  let unsubscribe:(()=>void)|undefined;
  const cancelTimer=()=>{if(timer!==undefined){clearInterval(timer);timer=undefined;}};
  const ready=()=>{if(!stopped&&!seenObservation&&!postNative(bridge,{type:'support.ready'}))onFailure();};
  try{
    unsubscribe=bridge.onMessage(raw=>{
      if(stopped)return;
      const message=parseNativeMessage(raw);if(!message)return;
      if(message.type==='support.observation'){seenObservation=true;cancelTimer();}
      onMessage(message);
    });
    if(!seenObservation)timer=setInterval(ready,500);
    if(!postNative(bridge,{type:'support.ready'}))onFailure();
  }catch{cancelTimer();onFailure();}
  return ()=>{stopped=true;cancelTimer();unsubscribe?.();};
}
