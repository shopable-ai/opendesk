import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useActiveContext, type Tab } from '../state';
import { type Product, productArt } from '../domain/catalog';

export function IconButton({icon:Icon,title,onClick,disabled,className='tool'}:{
  icon:LucideIcon;title:string;onClick:()=>void;disabled?:boolean;className?:string
}) {
  return <button className={className} title={title} aria-label={title} disabled={disabled} onClick={onClick} type="button"><Icon size={16} strokeWidth={1.8}/></button>;
}
export function ProductImage({product,index=0,className=''}:{product:Product;index?:number;className?:string}){
  return <img className={className} src={productArt(product,index)} alt={product.name+' · '+product.images[index]?.label+'（演示 SVG 示意）'} loading="lazy"/>;
}
export function useCopy(){
  const {dispatch}=useActiveContext();
  return async (value:string,label:string)=>{
    let copied=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(value);
        copied=true;
      }
    }catch{ /* file:// or clipboard permission denied: try an in-page copy */ }
    if(!copied){
      const field=document.createElement('textarea');
      field.value=value;
      field.readOnly=true;
      field.style.cssText='position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(field);
      field.select();
      try{ copied=document.execCommand('copy'); }catch{ copied=false; }
      field.remove();
    }
    dispatch({type:'TOAST',message:copied?label+'已复制':'复制失败：请手动选择文字'});
  };
}
export function useFillDraft(){
  const {state,dispatch,thread,message,active}=useActiveContext();
  return (value:string)=>{
    if(!active||!message||thread.sent.includes(message.id)||!value.trim()){
      dispatch({type:'RECORD',message:'未填入：身份、消息或观察状态不满足条件'});return;
    }
    const replace=Boolean(thread.draft&&thread.draft!==value);
    if(replace&&!window.confirm('当前聊天已有未发送草稿，确定替换吗？'))return;
    dispatch({type:'FILL',id:state.threadId,messageId:message.id,text:value,replace});
  };
}
export function Empty({children}:{children:React.ReactNode}){
  return <p className="product-empty">{children}</p>;
}
export function SearchField({value,onChange,placeholder,label}:{value:string;onChange:(value:string)=>void;placeholder:string;label:string}){
  return <label className="product-searchbox"><span aria-hidden="true">⌕</span>
    <input type="search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={label}/></label>;
}
export function PanelScroll({children,id,className='',scrollRef}:{children:React.ReactNode;id?:string;className?:string;scrollRef?:React.Ref<HTMLDivElement>}){
  return <div className={'scroll '+className} id={id} ref={scrollRef}>{children}</div>;
}
export function PanelView({id,active,children}:{id:Tab|'settings';active:boolean;children:React.ReactNode}){
  return <section id={'odiv-'+id} className={'view'+(active?' on':'')} role="tabpanel" aria-labelledby={id==='settings'?undefined:'odiv-tab-'+id} hidden={!active}>{children}</section>;
}
