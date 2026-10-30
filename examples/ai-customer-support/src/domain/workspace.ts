import { parseBusinessBackup } from './business';

export interface WorkspaceSlot {slot:number;generation:number;text:string}
export interface WorkspaceVersion {id:number;generation:number;revision:number|null;valid:boolean}
export interface WorkspaceIndex {token:string;versions:WorkspaceVersion[]}
// An optimistic concurrency fingerprint, not a cryptographic/authentication boundary.
function fingerprint(text:string){let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16);}
export function workspaceToken(slots:WorkspaceSlot[]):string{
  return JSON.stringify([...slots].sort((a,b)=>a.slot-b.slot).map(s=>[s.slot,s.generation,typeof s.text==='string'?fingerprint(s.text):'invalid']));
}
export function inspectWorkspace(slots:WorkspaceSlot[]):WorkspaceIndex{
  return {token:workspaceToken(slots),versions:slots.map(s=>{
    let revision:number|null=null;
    try{if(!Number.isSafeInteger(s.generation)||s.generation<1)throw Error();revision=parseBusinessBackup(s.text).revision;}catch{/* Fixed UI diagnostic only. */}
    return {id:s.slot,generation:Number.isSafeInteger(s.generation)?s.generation:0,revision,valid:revision!==null};
  }).sort((a,b)=>b.generation-a.generation)};
}
export function planWorkspaceSave(slots:WorkspaceSlot[],text:string,expectedToken:string):WorkspaceSlot{
  parseBusinessBackup(text);
  if(workspaceToken(slots)!==expectedToken)throw Error('工作区版本已变化，请刷新版本后重试');
  if(slots.some(s=>!Number.isSafeInteger(s.generation)||s.generation<1))throw Error('工作区版本损坏，请从有效版本恢复并导出备份');
  const index=inspectWorkspace(slots),pinned=index.versions.find(v=>v.valid)?.id;
  const slot=[0,1,2].find(id=>!slots.some(s=>s.slot===id))??
    [...index.versions].filter(v=>v.id!==pinned).sort((a,b)=>a.generation-b.generation)[0].id;
  const generation=Math.max(0,...index.versions.map(v=>v.generation))+1;
  if(!Number.isSafeInteger(generation))throw Error('工作区版本已满，请导出业务备份');
  return {slot,generation,text};
}
