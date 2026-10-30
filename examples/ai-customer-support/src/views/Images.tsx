import React, { useRef, useState } from 'react';
import { businessProducts, useWorkbench } from '../state';
import { findProduct, normalize } from '../domain/catalog';
import { effectiveEntities } from '../domain/business';
import { Empty, PanelScroll, ProductImage, SearchField, useCopy } from '../components/Common';

export function ImagesView(){
  const {state,dispatch}=useWorkbench();
  const products=businessProducts(state);
  const [query,setQuery]=useState(''),[productFilter,setProductFilter]=useState('all');
  const saved=useRef(0),scrollRef=useRef<HTMLDivElement>(null),copy=useCopy();
  const selection=state.imageSelected;
  const selectedProduct=selection?findProduct(selection.productId,products):null;
  const imageIndex=selectedProduct&&selection?selectedProduct.images.findIndex(i=>i.id===selection.imageId):-1;
  const image=imageIndex>=0?selectedProduct?.images[imageIndex]:undefined;
  const asset=selection?effectiveEntities(state.business,state.storeId,'image').find(e=>e.kind==='image'&&e.data?.productId===selection.productId&&e.data.imageId===selection.imageId):undefined;
  const mediaLabel=asset?.kind==='image'&&asset.data?.dataUrl?'本地图片 · 待核实':'SVG 示意图';
  const gallery=products.flatMap(p=>p.images.map((im,index)=>({p,im,index}))).filter(({p,im})=>
    (productFilter==='all'||p.id===productFilter)&&normalize(p.name+' '+p.sku+' '+p.model+' '+im.label+' '+im.id).includes(normalize(query)));
  function open(id:string,imageId:string){if(!selection)saved.current=scrollRef.current?.scrollTop||0;dispatch({type:'OPEN_IMAGE',productId:id,imageId});if(scrollRef.current)scrollRef.current.scrollTop=0;}
  function back(){dispatch({type:'CLOSE_IMAGE'});requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=saved.current;});}
  return <PanelScroll className="product-scroll" id="odiv-images-scroll" scrollRef={scrollRef}>
    {!selectedProduct||!image?<>
      <div className="product-searchrow"><SearchField value={query} onChange={setQuery} placeholder="图片 / 商品 / SKU" label="搜索商品图片"/>
        <select aria-label="筛选关联商品" value={productFilter} onChange={e=>setProductFilter(e.target.value)}>
          <option value="all">全部商品</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <button className="business-manage-link" onClick={()=>dispatch({type:'TAB',tab:'settings'})}>管理图片与商品关联</button>
      <div className="product-summary">图片图库 · {gallery.length} 张关联图片</div>
      <div className="product-gallery">{gallery.length?gallery.map(({p,im,index})=>
        <button type="button" className="product-gallery-tile" key={p.id+'/'+im.id}
          aria-label={'查看'+p.name+' '+im.label} onClick={()=>open(p.id,im.id)}>
          <ProductImage product={p} index={index}/><strong>{p.name}</strong><small>{im.label} · {p.sku}</small>
        </button>):<Empty>没有匹配的图片。</Empty>}</div>
    </>:<div className="product-detail">
      <div className="product-detail-head"><button className="product-back" onClick={back}>← 返回图库</button><span className="product-detail-tag">{mediaLabel}</span></div>
      <ProductImage product={selectedProduct} index={imageIndex} className="product-lightbox-image"/>
      <div className="image-meta"><strong>{image.label}</strong><span>{selectedProduct.name} · {selectedProduct.sku}</span>
        <small>图片 ID：{selectedProduct.id}/{image.id}</small><small>来源：{selectedProduct.source} · {selectedProduct.updated}</small></div>
      <div className="product-altimages">{selectedProduct.images.map((im,index)=><button type="button" key={im.id} aria-label={'查看'+im.label}
        aria-pressed={im.id===image.id} onClick={()=>open(selectedProduct.id,im.id)}><ProductImage product={selectedProduct} index={index}/></button>)}</div>
      <div className="product-actions"><button className="primary" onClick={()=>dispatch({type:'OPEN_PRODUCT',id:selectedProduct.id})}>查看关联商品</button>
        <button onClick={()=>void copy('图片：'+image.label+'\n商品：'+selectedProduct.name+' · '+selectedProduct.sku+
          '\n图片 ID：'+selectedProduct.id+'/'+image.id+'\n来源：'+selectedProduct.source+' · '+selectedProduct.updated+'\n'+mediaLabel,'图片信息')}>复制图片信息</button></div>
    </div>}
    <p className="media-note">仅显示所选店铺图片；本地图片或演示示意，不执行附件发送。</p>
  </PanelScroll>;
}
