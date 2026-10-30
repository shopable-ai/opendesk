import { desktopBridge, type DesktopBridge } from './desktop';
import { BUSINESS_LIMITS } from './domain/business';

export type BusinessFileOperation='snapshot'|'restore'|'image'|'backup'|'list'|'workspaceList'|'workspaceSave'|'workspaceRestore';
export interface WorkspaceCandidate {name:string;generation:number;revision:number}
export interface WorkspaceListing {generation:number;candidates:WorkspaceCandidate[];issues:{name:string;code:string}[]}
export interface BusinessFileListing {entries:{name:string;size:number;modifiedAt:string}[];scanned:number;truncated:boolean}
export interface WorkspaceFileResult {name:string;generation:number;text?:string}
export interface BusinessFileValues {name?:string;text?:string;expectedGeneration?:number;generation?:number}
export interface BusinessFileResult {name:string;text?:string}
const basename=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v)&&!v.includes('..');
const token=(v:unknown):v is string=>typeof v==='string'&&/^[\x21-\x7e]{1,40}$/.test(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const chunkSize=8192;
let sequence=0;

// Both directions of OpenDeskApp are capped at 64 KiB JSON. Even a chunk
// consisting entirely of escaped control characters fits after double JSON
// encoding. Only basenames reach the Host, never paths or script contents.
export function requestBusinessFile(operation:'list',values?:BusinessFileValues,bridge?:DesktopBridge,timeout?:number):Promise<BusinessFileListing>;
export function requestBusinessFile(operation:'workspaceList',values?:BusinessFileValues,bridge?:DesktopBridge,timeout?:number):Promise<WorkspaceListing>;
export function requestBusinessFile(operation:'workspaceSave'|'workspaceRestore',values:BusinessFileValues,bridge?:DesktopBridge,timeout?:number):Promise<WorkspaceFileResult>;
export function requestBusinessFile(operation:'snapshot'|'restore'|'image'|'backup',values?:BusinessFileValues,bridge?:DesktopBridge,timeout?:number):Promise<BusinessFileResult>;
export async function requestBusinessFile(operation:BusinessFileOperation,values:BusinessFileValues={},bridge:DesktopBridge|undefined=desktopBridge(),timeout=15000):Promise<BusinessFileResult|BusinessFileListing|WorkspaceListing|WorkspaceFileResult>{
  if(!bridge)throw Error('当前没有本机文件通道');
  if(['snapshot','restore','image','workspaceRestore'].includes(operation)&&!basename(values.name))throw Error('请输入文件名：仅字母、数字、点、横线或下划线，不含路径或连续点');
  if(operation==='workspaceSave'&&!integer(values.expectedGeneration))throw Error('工作区版本无效，请刷新候选');
  if(operation==='workspaceRestore'&&(!integer(values.generation)||values.generation!<1))throw Error('工作区版本无效，请刷新候选');
  const deadline=Date.now()+120000;
  async function exchange(fields:Record<string,unknown>):Promise<Record<string,unknown>>{
    if(Date.now()>=deadline)throw Error('本机文件操作超时，请核对目录和文件后重试');
    const requestId='bf-'+Date.now().toString(36)+'-'+(++sequence).toString(36);
    return new Promise((resolve,reject)=>{
      let unsubscribe=()=>{},done=false;
      const timer=setTimeout(()=>finish(Error('本机文件操作超时，请核对目录和文件后重试')),Math.min(timeout,deadline-Date.now()));
      function finish(error?:Error,result?:Record<string,unknown>){
        if(done)return;done=true;clearTimeout(timer);unsubscribe();error?reject(error):resolve(result!);
      }
      try{
        unsubscribe=bridge!.onMessage(input=>{
          let value:unknown=input;
          try{if(typeof value==='string')value=JSON.parse(value);}catch{return;}
          if(!value||typeof value!=='object'||Array.isArray(value))return;
          const v=value as Record<string,unknown>;
          if(v.type!=='support.businessFileResult'||v.requestId!==requestId)return;
          if(Object.keys(v).some(k=>!['type','requestId','status','text','name','code','transferId','offset','total','entries','scanned','truncated','generation','candidates','issues'].includes(k)))return finish(Error('本机文件回执无效'));
          if(v.status!=='ok')return finish(Error(v.status==='canceled'?'已取消文件操作':'本机文件操作失败，请核对文件名、格式及大小限制'));
          if(v.code!==undefined)return finish(Error('本机文件回执无效'));
          finish(undefined,v);
        });
        bridge!.postMessage(JSON.stringify({type:'support.businessFile',requestId,...fields}));
      }catch{finish(Error('本机文件通道不可用'));}
    });
  }
  const invalid=()=>Error('本机文件分块回执无效');
  if(operation==='list'||operation==='workspaceList'){
    const result=await exchange({operation});
    const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
    const base=['type','requestId','status'];
    if(operation==='list'){
      if(!exact(result,[...base,'entries','scanned','truncated'])||!Array.isArray(result.entries)||result.entries.length>100||!integer(result.scanned)||result.scanned>500||typeof result.truncated!=='boolean')throw invalid();
      const seen=new Set();
      for(const entry of result.entries){
        if(!entry||typeof entry!=='object'||Array.isArray(entry))throw invalid();
        const e=entry as Record<string,unknown>;
        if(!exact(e,['name','size','modifiedAt'])||!basename(e.name)||!integer(e.size)||e.size>BUSINESS_LIMITS.maxBackupBytes||typeof e.modifiedAt!=='string'||!Number.isFinite(Date.parse(e.modifiedAt))||seen.has(e.name))throw invalid();
        seen.add(e.name);
      }
      return {entries:result.entries as BusinessFileListing['entries'],scanned:result.scanned,truncated:result.truncated};
    }
    if(!exact(result,[...base,'generation','candidates','issues'])||!integer(result.generation)||!Array.isArray(result.candidates)||result.candidates.length>3||!Array.isArray(result.issues)||result.issues.length>3)throw invalid();
    const seen=new Set();
    for(const candidate of result.candidates){
      if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw invalid();
      const c=candidate as Record<string,unknown>;
      if(!exact(c,['name','generation','revision'])||typeof c.name!=='string'||!/^workspace-slot-[012]\.json$/.test(c.name)||!integer(c.generation)||c.generation<1||c.generation>result.generation||!integer(c.revision)||seen.has(c.name))throw invalid();
      seen.add(c.name);
    }
    for(const issue of result.issues){
      if(!issue||typeof issue!=='object'||Array.isArray(issue))throw invalid();
      const i=issue as Record<string,unknown>;
      if(!exact(i,['name','code'])||typeof i.name!=='string'||!/^workspace-slot-[012]\.json$/.test(i.name)||!['UNSAFE_PATH','FILE_TOO_LARGE','INVALID_WORKSPACE','INVALID_BACKUP'].includes(String(i.code)))throw invalid();
    }
    return {generation:result.generation,candidates:result.candidates as WorkspaceCandidate[],issues:result.issues as WorkspaceListing['issues']};
  }
  if(operation==='backup'||operation==='workspaceSave'){
    if(typeof values.text!=='string'||!values.text.length||new TextEncoder().encode(values.text).length>BUSINESS_LIMITS.maxBackupBytes)throw Error('业务备份超过 8MB 或内容为空');
    let ack=await exchange({operation:operation==='workspaceSave'?'workspaceSaveStart':'backupStart',total:values.text.length,...(operation==='workspaceSave'?{expectedGeneration:values.expectedGeneration}:{})});
    const transferId=ack.transferId,total=values.text.length;
    function checkAck(v:Record<string,unknown>,offset:number){
      if(v.transferId!==transferId||v.offset!==offset||v.total!==total||v.name!==undefined||v.text!==undefined)throw invalid();
    }
    if(!token(transferId))throw invalid();checkAck(ack,0);
    for(let offset=0;offset<total;){
      let end=Math.min(offset+chunkSize,total);
      if(end<total&&/[\uD800-\uDBFF]/.test(values.text[end-1])&&/[\uDC00-\uDFFF]/.test(values.text[end]))end--;
      const text=values.text.slice(offset,end);
      ack=await exchange({operation:'backupChunk',transferId,offset,text});offset+=text.length;checkAck(ack,offset);
    }
    const result=await exchange({operation:'backupCommit',transferId});
    if(!basename(result.name)||result.text!==undefined||result.transferId!==undefined||result.offset!==undefined||result.total!==undefined)throw invalid();
    if(operation==='workspaceSave'){
      if(!integer(result.generation)||result.generation!==values.expectedGeneration!+1||!/^workspace-slot-[012]\.json$/.test(result.name))throw invalid();
      return {name:result.name,generation:result.generation};
    }
    if(result.generation!==undefined)throw invalid();
    return {name:result.name};
  }
  let result=await exchange({operation,name:values.name,...(operation==='workspaceRestore'?{generation:values.generation}:{})});
  const transferId=result.transferId,total=result.total,name=result.name;
  const max=operation==='snapshot'?BUSINESS_LIMITS.maxSnapshotBytes:operation==='image'?Math.ceil(BUSINESS_LIMITS.maxImageBytes*4/3)+64:BUSINESS_LIMITS.maxBackupBytes;
  if(!token(transferId)||!integer(total)||total>max||!basename(name)||name!==values.name)throw invalid();
  const parts:string[]=[];let offset=0;
  for(;;){
    if((operation==='workspaceRestore'?result.generation!==values.generation:result.generation!==undefined)||result.transferId!==transferId||result.total!==total||result.name!==name||result.offset!==offset||typeof result.text!=='string'||result.text.length>chunkSize||offset+result.text.length>total||(offset<total&&!result.text.length))throw invalid();
    parts.push(result.text);offset+=result.text.length;
    if(offset===total)break;
    result=await exchange({operation:'readChunk',transferId,offset});
  }
  const text=parts.join('');
  if(new TextEncoder().encode(text).length>max)throw invalid();
  return operation==='workspaceRestore'?{name,text,generation:values.generation!}:{name,text};
}

// Explicit UI actions only; importing this module performs no filesystem access.
import type { WorkspaceIndex } from './domain/workspace';
export interface ListedBusinessFile {name:string;kind:'json'|'image';size:number}
function nativeIndex(listing:WorkspaceListing):WorkspaceIndex{
  return {token:String(listing.generation),versions:[
    ...listing.candidates.map(c=>({id:Number(c.name[15]),generation:c.generation,revision:c.revision,valid:true})),
    ...listing.issues.map(i=>({id:Number(i.name[15]),generation:0,revision:null,valid:false}))
  ]};
}
export async function listBusinessFiles():Promise<{files:ListedBusinessFile[];truncated:boolean}>{
  const result=await requestBusinessFile('list');
  return {files:result.entries.map(e=>({name:e.name,kind:/\.json$/i.test(e.name)?'json':'image',size:e.size})),truncated:result.truncated};
}
export async function listNativeWorkspace():Promise<WorkspaceIndex>{
  return nativeIndex(await requestBusinessFile('workspaceList'));
}
export async function saveNativeWorkspace(text:string,token:string):Promise<WorkspaceIndex>{
  if(!/^(0|[1-9]\d*)$/.test(token)||!integer(Number(token)))throw Error('工作区版本无效，请刷新版本后重试');
  await requestBusinessFile('workspaceSave',{text,expectedGeneration:Number(token)});
  return listNativeWorkspace();
}
export async function readNativeWorkspace(id:number,generation:number):Promise<{text:string}>{
  if(!Number.isSafeInteger(id)||id<0||id>2||!integer(generation)||generation<1)throw Error('工作区版本无效，请刷新候选');
  const result=await requestBusinessFile('workspaceRestore',{name:`workspace-slot-${id}.json`,generation});
  if(typeof result.text!=='string')throw Error('本机工作区回执无效');
  return {text:result.text};
}
