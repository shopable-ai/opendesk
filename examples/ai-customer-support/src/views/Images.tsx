import React, { useRef, useState } from 'react';
import { useWorkbench } from '../state';
import { findProduct, normalize, products } from '../domain/catalog';
import { Empty, PanelScroll, ProductImage, SearchField, useCopy } from '../components/Common';

export function ImagesView(){
  const {state,dispatch}=useWorkbench();
  const [query,setQuery]=useState(''),[productFilter,setProductFilter]=useState('all');
  const saved=useRef(0),scrollRef=useRef<HTMLDivElement>(null),copy=useCopy();
  const selection=state.imageSelected;
  const selectedProduct=selection?findProduct(selection.productId):null;
  const imageIndex=selectedProduct&&selection?selectedProduct.images.findIndex(i=>i.id===selection.imageId):-1;
  const image=imageIndex>=0?selectedProduct?.images[imageIndex]:undefined;
  const gallery=products.flatMap(p=>p.images.map((im,index)=>({p,im,index}))).filter(({p,im})=>
    (productFilter==='all'||p.id===productFilter)&&normalize(p.name+' '+p.sku+' '+p.model+' '+im.label+' '+im.id).includes(normalize(query)));
  function open(id:string,imageId:string){if(!selection)saved.current=scrollRef.current?.scrollTop||0;dispatch({type:'OPEN_IMAGE',productId:id,imageId});if(scrollRef.current)scrollRef.current.scrollTop=0;}
  function back(){dispatch({type:'CLOSE_IMAGE'});requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=saved.current;});}
  return <PanelScroll className="product-scroll" id="odiv-images-scroll" scrollRef={scrollRef}>
    {!selectedProduct||!image?<>
      <div className="product-searchrow"><SearchField value={query} onChange={setQuery} placeholder="图片 / 商品 / SKU" label="搜索商品图片"/>
        <select aria-label="筛选关联商品" value={productFilter} onChange={e=>setProductFilter(e.target.value)}>
          <option value="all">全部商品</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="product-summary">图片图库 · {gallery.length} 张演示图片</div>
      <div className="product-gallery">{gallery.length?gallery.map(({p,im,index})=>
        <button type="button" className="product-gallery-tile" key={p.id+'/'+im.id}
          aria-label={'查看'+p.name+' '+im.label} onClick={()=>open(p.id,im.id)}>
          <ProductImage product={p} index={index}/><strong>{p.name}</strong><small>{im.label} · {p.sku}</small>
        </button>):<Empty>没有匹配的图片。</Empty>}</div>
    </>:<div className="product-detail">
      <div className="product-detail-head"><button className="product-back" onClick={back}>← 返回图库</button><span className="product-detail-tag">SVG 示意图</span></div>
      <ProductImage product={selectedProduct} index={imageIndex} className="product-lightbox-image"/>
      <div className="image-meta"><strong>{image.label}</strong><span>{selectedProduct.name} · {selectedProduct.sku}</span>
        <small>图片 ID：{selectedProduct.id}/{image.id}</small><small>来源：{selectedProduct.source} · {selectedProduct.updated}</small></div>
      <div className="product-altimages">{selectedProduct.images.map((im,index)=><button type="button" key={im.id} aria-label={'查看'+im.label}
        aria-pressed={im.id===image.id} onClick={()=>open(selectedProduct.id,im.id)}><ProductImage product={selectedProduct} index={index}/></button>)}</div>
      <div className="product-actions"><button className="primary" onClick={()=>dispatch({type:'OPEN_PRODUCT',id:selectedProduct.id})}>查看关联商品</button>
        <button onClick={()=>void copy('图片：'+image.label+'\n商品：'+selectedProduct.name+' · '+selectedProduct.sku+
          '\n图片 ID：'+selectedProduct.id+'/'+image.id+'\n来源：'+selectedProduct.source+' · '+selectedProduct.updated+'\nSVG 示意图','图片信息')}>复制图片信息</button></div>
    </div>}
    <p className="media-note">复用商品资料，12 张 SVG 演示图；不是商品实拍或微信附件。</p>
  </PanelScroll>;
}
