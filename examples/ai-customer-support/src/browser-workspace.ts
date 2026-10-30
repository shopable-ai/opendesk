import { inspectWorkspace, planWorkspaceSave, type WorkspaceSlot, type WorkspaceIndex } from './domain/workspace';
import { parseBusinessBackup } from './domain/business';
const database='opendesk-support-business-v1';
function open():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(Error('当前浏览器不支持本地工作区，请导出业务备份'));
    let abandoned=false;
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('versions',{keyPath:'slot'});
    request.onerror=()=>reject(Error('浏览器存储不可用，请检查隐私设置并导出备份'));
    request.onblocked=()=>{abandoned=true;reject(Error('工作区存储被其他页面占用，请关闭旧页面后重试'));};
    request.onsuccess=()=>{const db=request.result;if(abandoned){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
  });
}
async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,rows:WorkspaceSlot[])=>T):Promise<T>{
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('versions',mode),store=tx.objectStore('versions');
    let result:T,error:unknown;
    const request=store.getAll();
    request.onsuccess=()=>{try{
      const rows=request.result;
      if(!Array.isArray(rows)||rows.length>3||rows.some(s=>!s||![0,1,2].includes(s.slot)))throw Error('工作区存储损坏，请导出当前资料后检查浏览器存储');
      result=run(store,rows);
    }catch(e){error=e;tx.abort();}};
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onabort=tx.onerror=()=>{db.close();reject(error||Error('工作区保存失败：浏览器配额或权限不足，请导出备份；旧版本保留'));};
  });
}
export const listBrowserWorkspace=():Promise<WorkspaceIndex>=>transaction('readonly',(_store,rows)=>inspectWorkspace(rows));
export const readBrowserWorkspace=(id:number,generation:number):Promise<string>=>transaction('readonly',(_store,rows)=>{
  const row=rows.find(s=>s.slot===id);if(!row||row.generation!==generation)throw Error('工作区版本已变化，请刷新版本');
  parseBusinessBackup(row.text);return row.text;
});
export const saveBrowserWorkspace=(text:string,token:string):Promise<WorkspaceIndex>=>transaction('readwrite',(store,rows)=>{
  const next=planWorkspaceSave(rows,text,token);store.put(next);
  return inspectWorkspace([...rows.filter(s=>s.slot!==next.slot),next]);
});
