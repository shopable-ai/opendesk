import React, { useEffect, useRef, useState } from 'react';
import { useWorkbench, mappingKey } from '../state';
import { createMappingPlan, mappingFields, mappingSample, runMappingPlan, type MappingKind, type MappingPlan } from '../domain/business-mapping';
import { previewBusinessImport } from '../domain/business';

const failure=(error:unknown)=>error instanceof Error?error.message:'输入无效，请核对配置';

export function BusinessMappings(){
  const {state,dispatch}=useWorkbench();
  const pending=useRef(state.mappingPreview);
  pending.current=state.mappingPreview;
  useEffect(()=>()=>{if(pending.current)dispatch({type:'BUSINESS_CANCEL'});},[dispatch]);
  const [open,setOpen]=useState(false);
  const [plan,setPlan]=useState(()=>createMappingPlan('product',state.storeId));
  const [input,setInput]=useState(()=>mappingSample('product'));
  const [cursor,setCursor]=useState('mapping-v1');
  const [trial,setTrial]=useState<{fingerprint:string;output:string;summary:string}|null>(null);
  const [error,setError]=useState(''),[transfer,setTransfer]=useState('');
  const key=mappingKey(plan),previousCursor=state.business.cursors[key]??null;
  const fingerprint=JSON.stringify([plan,input,cursor,state.businessEpoch]);
  const tested=trial?.fingerprint===fingerprint;
  const saved=state.businessMappings.find(m=>mappingKey(m.plan)===key);
  const unchanged=!!saved&&JSON.stringify(saved.plan)===JSON.stringify(plan);
  const scope={storeId:state.storeId,epoch:state.businessEpoch};
  function invalidate(){
    setTrial(null);setError('');
    if(state.mappingPreview)dispatch({type:'BUSINESS_CANCEL'});
  }
  function changePlan(next:MappingPlan){invalidate();setPlan(next);}
  function template(kind:MappingKind){
    changePlan(createMappingPlan(kind,state.storeId));setInput(mappingSample(kind));setCursor('mapping-v1');
  }
  function test(){
    invalidate();
    try{
      const snapshot=runMappingPlan(plan,input,{storeId:state.storeId,sourceId:plan.sourceId,previousCursor,cursor},state.business);
      const result=previewBusinessImport(state.business,snapshot);
      setTrial({fingerprint,output:JSON.stringify(snapshot,null,2),summary:`试跑通过：新增 ${result.added} · 更新 ${result.updated} · 不变 ${result.unchanged}。资料尚未写入。`});
    }catch(error){setError('试跑失败：'+failure(error)+'。请核对该字段；若为游标/版本或本地覆盖冲突，请核对已应用页标记、提高来源版本或先处理本地覆盖。原资料保持。');}
  }
  return <section className="business-mappings" aria-label="数据处理方案">
    <button className="business-heading" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>数据处理方案</button>
    {open&&<>
      <p>从商品清单或客户名册开始，对应字段后试跑。仅手动处理本地 JSON，不访问平台，不改变聊天授权。</p>
      <p><b>方案仅保存在本次页面内存。</b> 关闭前导出方案 JSON；业务备份不包含方案。输入数据不会写入方案备份。</p>
      <fieldset><legend>1 · 选择模板与字段</legend>
        <label>处理资料<select aria-label="处理资料模板" value={plan.kind} onChange={e=>template(e.target.value as MappingKind)}>
          <option value="product">商品清单</option><option value="customer">客户名册</option>
        </select></label>
        <label>方案名称<input aria-label="方案名称" maxLength={100} value={plan.name} onChange={e=>changePlan({...plan,name:e.target.value})}/></label>
        <label>来源标识<input aria-label="方案来源" maxLength={80} value={plan.sourceId} onChange={e=>changePlan({...plan,sourceId:e.target.value})}/></label>
        <small>店铺：{state.business.stores.find(s=>s.id===state.storeId)?.name}。每个店铺/来源保存一个方案；修改覆盖同来源方案并重新停用。</small>
        <div className="mapping-fields">{mappingFields[plan.kind].map(field=><label key={field.key}>{field.label}<input aria-label={'对应字段 '+field.key} maxLength={80} value={plan.fields[field.key]} onChange={e=>changePlan({...plan,fields:{...plan.fields,[field.key]:e.target.value}})}/></label>)}</div>
        <small>右侧填写输入中的顶层字段名，不是 JavaScript 表达式。价格为 CNY 参考价；版本须为正整数，更新时间须为 UTC。</small>
      </fieldset>
      <fieldset><legend>2 · 样例试跑</legend>
        <button type="button" onClick={()=>{invalidate();setInput(mappingSample(plan.kind));}}>填入虚构样例</button>
        <label>输入资料（JSON 数组，最多100行/64KiB）<textarea aria-label="方案输入 JSON" className="mapping-json" spellCheck={false} maxLength={65536} value={input} onChange={e=>{invalidate();setInput(e.target.value);}}/></label>
        <small>已应用页标记：{previousCursor??'尚未应用'}。来自所选店铺/来源；确认应用后才更新。</small>
        <label>下一页标记<input aria-label="方案下一页标记" maxLength={512} value={cursor} onChange={e=>{invalidate();setCursor(e.target.value);}}/></label>
        <button type="button" onClick={test}>试跑（不写入资料）</button>
        {error&&<p role="status" className="business-error">{error}</p>}
        {tested&&<><p role="status">{trial.summary}</p><label>输出同步页<textarea aria-label="方案试跑输出" className="mapping-json" readOnly value={trial.output}/></label></>}
        {!tested&&<small>修改输入、字段或店铺资料后需重新试跑；不会自动采用上一次结果。</small>}
      </fieldset>
      <fieldset><legend>3 · 保存与使用</legend>
        <button type="button" disabled={!tested} onClick={()=>dispatch({type:'MAPPING_SAVE',text:JSON.stringify(plan),input,cursor,previousCursor,...scope})}>保存处理方案</button>
        <button type="button" disabled={!tested||!unchanged||!saved?.enabled} onClick={()=>dispatch({type:'MAPPING_PREVIEW',key,version:saved!.version,input,cursor,previousCursor,...scope})}>使用方案并预检</button>
        <small>先试跑、保存并启用方案，再使用。预检在下方显示，确认后才写入；取消会保留原资料与页标记。</small>
        <div className="mapping-saved">{state.businessMappings.filter(m=>m.plan.storeId===state.storeId).map(m=><div className="business-record" key={mappingKey(m.plan)}>
          <strong>{m.plan.name} · {m.enabled?'已启用':'已停用'}</strong><small>{m.plan.sourceId} · {m.plan.kind==='product'?'商品':'客户'} · 手动触发</small>
          <div className="mapping-actions"><button type="button" aria-label={'载入方案 '+m.plan.sourceId} onClick={()=>{changePlan(m.plan);setInput(mappingSample(m.plan.kind));setCursor('mapping-v1');}}>载入</button>
            <button type="button" aria-label={(m.enabled?'停用方案 ':'启用方案 ')+m.plan.sourceId} onClick={()=>dispatch({type:'MAPPING_TOGGLE',key:mappingKey(m.plan),version:m.version,...scope})}>{m.enabled?'停用':'启用'}</button>
            <button type="button" aria-label={'导出方案 '+m.plan.sourceId} onClick={()=>setTransfer(JSON.stringify(m.plan,null,2))}>导出方案 JSON</button></div>
        </div>)}</div>
        <p role="status">{state.mappingStatus||'尚未保存方案；保存后默认停用。停用不撤销已应用资料。'}</p>
        <details><summary>方案备份与恢复</summary>
          <p>点已保存方案的「导出方案 JSON」，将下方全文复制到本机文本文件。恢复时粘贴全文；只恢复配置，默认停用。同店铺/来源的旧方案会被替换。</p>
          <label>方案 JSON<textarea aria-label="方案备份 JSON" className="mapping-json" maxLength={8192} spellCheck={false} value={transfer} onChange={e=>setTransfer(e.target.value)}/></label>
          <button type="button" disabled={!transfer.trim()} onClick={()=>{invalidate();dispatch({type:'MAPPING_RESTORE',text:transfer,...scope});}}>恢复方案（停用）</button>
        </details>
      </fieldset>
      <details><summary>需要几行自定义代码？</summary><p>使用 integrations/mapped-demo-adapter.mjs，在 pull 中改行内容，再交给现有同步命令。它与这里共用映射规则。Node 代码可访问本机文件和网络，只运行你信任的代码；Worker 提供故障隔离。界面字段不执行代码，也不保存密钥。</p></details>
    </>}
  </section>;
}
