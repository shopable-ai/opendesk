import {useCallback,useEffect,useRef,useState} from 'react';
import {exportBusinessBackup,parseBusinessBackup,type BusinessState} from './domain/business';
import type {WorkspaceIndex} from './domain/workspace';
import {listBrowserWorkspace,readBrowserWorkspace,saveBrowserWorkspace} from './browser-workspace';
import {listNativeWorkspace,readNativeWorkspace,saveNativeWorkspace} from './business-files';
import type {AppState,Action} from './state';

export function useBusinessWorkspace(state:AppState,dispatch:React.Dispatch<Action>){
  const [index,setIndex]=useState<WorkspaceIndex|null>(null),[busy,setBusy]=useState(false);
  const [auto,setAuto]=useState(false),[status,setStatus]=useState('尚未保存工作区；自动保存关闭');
  const [saved,setSaved]=useState<BusinessState|null>(null);
  const current=useRef(state),locked=useRef(false),alive=useRef(true),operation=useRef(0);
  current.current=state;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;operation.current++;};},[]);
  const dirty=saved!==state.business;
  const refresh=useCallback(async()=>{
    if(locked.current)return;locked.current=true;setBusy(true);
    try{const next=await (current.current.native?listNativeWorkspace():listBrowserWorkspace());if(alive.current){setIndex(next);setStatus(next.versions.length?'已刷新工作区版本；恢复前请核对版本并确认':'尚无工作区版本，请显式保存');}}
    catch{if(alive.current)setStatus('工作区读取失败，请检查存储权限；当前业务资料保留，可先导出备份');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  },[]);
  const save=useCallback(async()=>{
    if(locked.current)return;locked.current=true;setBusy(true);
    const captured=current.current,number=++operation.current;
    setStatus('正在保存全部店铺的业务资料…');
    try{
      const text=exportBusinessBackup(captured.business);
      // Always obtain the current index; this does not restore any data.
      const before=await (captured.native?listNativeWorkspace():listBrowserWorkspace());
      // A reset/restore/business edit while preparing a save must not publish a stale snapshot.
      if(current.current.business!==captured.business)throw Error('STALE');
      const next=await (captured.native?saveNativeWorkspace(text,before.token):saveBrowserWorkspace(text,before.token));
      if(!alive.current||number!==operation.current)return;
      setIndex(next);
      if(current.current.business===captured.business){setSaved(captured.business);setStatus('工作区已保存 · 全部店铺 · 未包含聊天或授权');}
      else setStatus('旧业务版本已保存；当前修改尚未保存，请再次保存');
    }catch(error){if(alive.current&&number===operation.current){setAuto(false);setStatus(error instanceof Error&&error.message==='STALE'?'业务资料已变化，本次保存取消；请保存当前版本':'工作区保存失败或结果未知，自动保存已关闭；请刷新版本核对后再保存，旧版本保留');}}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  },[]);
  const restore=useCallback(async(id:number,generation:number,validate:(records:ReturnType<typeof parseBusinessBackup>)=>Promise<void>)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setAuto(false);
    const captured=current.current,number=++operation.current;
    try{
      const text=captured.native?(await readNativeWorkspace(id,generation)).text:await readBrowserWorkspace(id,generation);
      const data=parseBusinessBackup(text);await validate(data);
      if(!alive.current||number!==operation.current||current.current.businessEpoch!==captured.businessEpoch)return;
      if(!window.confirm('恢复工作区将替换全部店铺业务资料与游标，当前未保存修改会丢失。聊天、授权和自动托管不会从工作区恢复。继续？')){setStatus('已取消恢复；当前业务资料保留，自动保存关闭');return;}
      dispatch({type:'BUSINESS_RESTORE',text,epoch:captured.businessEpoch});
      // Reducer owns the new object. It remains dirty until explicitly saved again.
      setSaved(null);setStatus('工作区已恢复到页面；自动保存关闭，请核对资料后保存');
    }catch{if(alive.current&&number===operation.current)setStatus('该工作区版本损坏、不兼容或无法读取；当前业务资料保留，请刷新并选择上一有效版本');}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  },[dispatch]);
  useEffect(()=>{
    if(!auto||!dirty||busy)return;
    const timer=setTimeout(()=>void save(),1000);return()=>clearTimeout(timer);
  },[auto,dirty,busy,save,state.business]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const enableAuto=(enabled:boolean)=>{
    if(enabled&&!window.confirm('启用后会把全部店铺的当前及后续业务资料保存到此设备工作区。不会保存聊天或授权。每次重新启动仍默认关闭。启用？'))return;
    setAuto(enabled);setStatus(enabled?'自动保存已启用；业务变化后保存全部店铺':'自动保存关闭；当前未保存修改请显式保存');
  };
  return {index,busy,auto,dirty,status,refresh,save,restore,enableAuto};
}
export type BusinessWorkspace=ReturnType<typeof useBusinessWorkspace>;
