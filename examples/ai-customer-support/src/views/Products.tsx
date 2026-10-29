import React, { useRef, useState } from 'react';
import { useWorkbench } from '../state';
import { demoProductLink, findProduct, products, productCopyText, visibleProducts } from '../domain/catalog';
import { Empty, PanelScroll, ProductImage, SearchField, useCopy, useFillDraft } from '../components/Common';

export function ProductsView(){
  const {state,dispatch}=useWorkbench();
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
  const scrollRef=useRef<HTMLDivElement>(null),saved=useRef(0);
  const copy=useCopy(),fill=useFillDraft(),selected=findProduct(state.productSelected||undefined);
  const visible=visibleProducts(query,category);
  const open=(id:string)=>{saved.current=scrollRef.current?.scrollTop||0;dispatch({type:'OPEN_PRODUCT',id});if(scrollRef.current)scrollRef.current.scrollTop=0;};
  const close=()=>{dispatch({type:'CLOSE_PRODUCT'});requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=saved.current;});};
  return <PanelScroll className="product-scroll" id="odiv-products-scroll" scrollRef={scrollRef}>
    {!selected?<>
      <div className="product-searchrow">
        <SearchField value={query} onChange={setQuery} placeholder="搜索商品 / SKU / 演示链接" label="搜索商品名称型号和规格"/>
        <select aria-label="筛选商品分类" value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="all">全部分类</option>{Array.from(new Set(products.map(p=>p.category))).map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="product-summary">商品列表 · {visible.length} 件演示商品</div>
      <div className="product-list">{visible.length===0?<Empty>{/^https?:\/\//i.test(query.trim())?'链接未对应演示商品；仅支持商品详情中复制的演示链接。':'没有符合当前搜索或分类的商品。'}</Empty>:visible.map(p=>
        <button type="button" className="product-row" key={p.id} onClick={()=>open(p.id)} aria-label={'查看商品：'+p.name+' · '+p.sku}>
          <ProductImage product={p} className="product-thumb"/>
          <span className="product-row-copy"><strong>{p.name}</strong><small>{p.sku} · {p.specs.slice(0,2).map(x=>x.value).join(' / ')}</small>
            <span className="product-price">{p.price} · 演示参考价</span></span><span className="product-chevron">›</span>
        </button>)}</div>
    </>:<div className="product-detail">
      <div className="product-detail-head"><button className="product-back" onClick={close}>← 返回商品</button><span className="product-detail-tag">演示商品 · {selected.sku}</span></div>
      <button type="button" className="product-hero-button" aria-label={'打开'+selected.name+'的关联图片'}
        onClick={()=>dispatch({type:'OPEN_IMAGE',productId:selected.id,imageId:selected.images[0].id})}><ProductImage product={selected} className="product-hero"/></button>
      <h3 className="product-detail-name">{selected.name}</h3>
      <span className="product-detail-sub">{selected.category} · 型号 {selected.model} · {selected.sku}</span>
      <div className="product-detail-price">{selected.price}</div>
      <span className="product-detail-sub">演示参考价 · 非实时售价 / 库存</span>
      <p className="product-detail-desc">{selected.summary}</p>
      <div className="product-specs">{selected.specs.map(spec=><div className="product-spec" key={spec.label}><span>{spec.label}</span><span>{spec.value}</span></div>)}</div>
      <span className="product-detail-sub">资料来源：{selected.source} · 更新：{selected.updated}</span>
      <div className="product-actions"><button className="primary" onClick={()=>fill('您好，关于您咨询的商品，以下为演示资料，具体请以核实后的商品详情为准：\n'+productCopyText(selected))}>填入聊天草稿</button>
        <button onClick={()=>dispatch({type:'OPEN_IMAGE',productId:selected.id,imageId:selected.images[0].id})}>查看关联图片</button>
        <button onClick={()=>void copy(productCopyText(selected),'商品资料')}>复制资料</button>
        <button onClick={()=>void copy(demoProductLink(selected),'演示链接')}>复制演示链接</button></div>
    </div>}
    <p className="product-disclaimer">价格仅为演示参考价，图片为 SVG 示意图。库存、配送与实际商品信息均需人工核实。</p>
  </PanelScroll>;
}
