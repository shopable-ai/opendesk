import type { CustomerId } from './domain/catalog';

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
export type NativeMessage=Observation|Receipt;
export type SettingsRequest={type:'support.settings';permission?:false;paused?:boolean;follow?:boolean};
export type FillRequest={type:'support.fillDraft';requestId:string;binding:Binding;text:string;expectedDraft:string};
export type OutgoingMessage={type:'support.ready'}|SettingsRequest|FillRequest|{
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
