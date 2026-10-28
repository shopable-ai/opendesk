import React, { useRef, useState } from 'react';
import { useActiveContext, useWorkbench } from '../state';
import { findProduct, money, orderForCustomer, orderMatches, ordersForCustomer, orderSummary } from '../domain/catalog';
import { Empty, PanelScroll, ProductImage, SearchField, useCopy, useFillDraft } from '../components/Common';

const statuses=['all','待付款','待发货','运输中','已完成','售后中'];
function StatusBadge({status}:{status:string}){
  return <span className={'order-status'+(status==='售后中'?' alert':status==='已完成'?' neutral':'')}>{status}</span>;
}
export function OrdersView(){
  const {state,dispatch}=useWorkbench();
  const {thread,message,active}=useActiveContext();
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all');
  const saved=useRef(0),scrollRef=useRef<HTMLDivElement>(null),copy=useCopy(),fill=useFillDraft();
  const all=ordersForCustomer(state.threadId,state.permission);
  const selected=state.orderSelected?orderForCustomer(state.threadId,state.orderSelected,state.permission):null;
  const list=all.filter(o=>orderMatches(o,query,status));
  function open(id:string){if(!orderForCustomer(state.threadId,id,state.permission))return;saved.current=scrollRef.current?.scrollTop||0;dispatch({type:'OPEN_ORDER',orderId:id});if(scrollRef.current)scrollRef.current.scrollTop=0;}
  function back(){dispatch({type:'CLOSE_ORDER'});requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=saved.current;});}
  return <PanelScroll className="product-scroll" id="odiv-orders-scroll" scrollRef={scrollRef}>
    {!selected?<>
      <div className="product-searchrow">
        <SearchField value={query} onChange={setQuery} placeholder="订单号 / 商品 / SKU" label="搜索当前客户订单"/>
        <select aria-label="订单状态筛选" value={status} onChange={e=>setStatus(e.target.value)}>
          {statuses.map(x=><option key={x} value={x}>{x==='all'?'全部状态':x}</option>)}</select></div>
      <div className="product-summary" role="status">{state.permission?thread.name+' · '+list.length+' / '+all.length+' 笔演示订单':'当前身份或模拟授权不可用'}</div>
      <div className="order-list">{!state.permission?<Empty>已停止引用订单，请先确认客户身份和授权。</Empty>:
        list.length?list.map(o=><button type="button" className="order-row" key={o.orderId} onClick={()=>open(o.orderId)} aria-label={'查看订单 '+o.orderId}>
          <div className="order-line"><strong className="order-id">{o.orderId}</strong><StatusBadge status={o.status}/></div>
          <div className="order-hint">{o.items.map(i=>(findProduct(i.productId)?.name||'商品资料缺失')+' ×'+i.quantity).join('、')}</div>
          <div className="order-line"><span className="order-date">{o.updatedAt} · 演示资料</span><strong className="order-money">{money(o.amount)}</strong></div>
        </button>):<Empty>当前客户无符合条件的订单。</Empty>}</div>
    </>:<div className="product-detail">
      <div className="product-detail-head"><button className="product-back" onClick={back}>← 返回订单</button><StatusBadge status={selected.status}/></div>
      <h3 className="product-detail-name">{selected.orderId}</h3>
      <span className="product-detail-sub">{thread.name} · 演示订单 · {selected.updatedAt}</span>
      {selected.items.map((item,index)=>{
        const p=findProduct(item.productId);if(!p)return null;
        return <div className="order-item" key={p.id+'/'+index}><ProductImage product={p}/>
          <div className="order-item-info"><strong>{p.name}</strong><small>{item.sku} · {item.specification} · 数量 {item.quantity}</small>
          <button type="button" className="order-open-product" onClick={()=>dispatch({type:'OPEN_PRODUCT',id:p.id})}>查看商品 ›</button></div></div>;
      })}
      <div className="order-total"><span>演示订单金额</span><strong>{money(selected.amount)}</strong></div>
      {([['关联客户',thread.name],['付款状态',selected.paymentStatus],['发货 / 物流',selected.shippingStatus],
        ['售后状态',selected.afterSalesStatus],['资料来源',selected.source],['更新时间',selected.updatedAt]] as const)
        .map(([label,value])=><div className="order-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      <div className="product-actions"><button className="primary" disabled={!active||!message||thread.sent.includes(message.id)}
        onClick={()=>{const safe=orderForCustomer(state.threadId,selected.orderId,state.permission);
          if(!safe){dispatch({type:'TOAST',message:'客户身份或授权无法核实'});return;}
          fill('您好，以下为当前客户的演示订单资料，请以实际平台核对为准：\n'+orderSummary(safe));}}>填入聊天草稿</button>
        <button onClick={()=>{const safe=orderForCustomer(state.threadId,selected.orderId,state.permission);
          if(safe)void copy(orderSummary(safe),'当前客户订单摘要');}}>复制订单摘要</button></div>
    </div>}
    <p className="media-note">只读虚构订单。金额、付款、物流和售后均非实时结果，不执行退款、取消、发货。</p>
  </PanelScroll>;
}
