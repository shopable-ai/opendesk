// Browser Bridge stub only: never real Query API, model or native draft evidence.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const evidence=resolve(process.env.SUPPORT_TEST_EVIDENCE||join(root,'../../.runtime/tests/ai-customer-support/r30b/ai-browser'));
await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const binding={generation:1,pid:321,windowId:456,customerId:'t1',messageId:'external-1'};
const observation=(revision=1,b=binding)=>({type:'support.observation',revision,binding:b,observing:true,
  conversation:{name:'受控测试客户',messages:[{id:b.messageId,who:'customer',text:'物流如何查询？'}],draft:''}});
const result=(request,changes={})=>({type:'support.aiResult',requestId:request.requestId,binding:request.binding,
  projectId:'approved-demo',knowledgeBackend:'query_api',modelProvider:'none',retrievalStatus:'supported',status:'ready',
  evidencePack:{projectId:'approved-demo',coverage:'full',items:[{id:'e0',sourceType:'knowledge_base',sourceRef:'synthetic-faq',answerHash:'a'.repeat(64)}]},
  candidates:[{id:'query',name:'知识建议',symbol:'✦',text:'合成协议回复：在订单详情查看物流。',evidenceIds:['e0']}],requiresHumanReview:true,errorCode:null,...changes});
let passed=0;
async function scenario(name,run){
 const page=await browser.newPage();const requests=[],errors=[];
 page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(obs=>{
  const listeners=new Set();window.__out=[];
  window.__deliver=value=>{for(const h of listeners)h(value);};
  window.OpenDeskApp={onMessage(h){listeners.add(h);return()=>listeners.delete(h);},postMessage(raw){
   const m=JSON.parse(raw);window.__out.push(m);
   if(m.type==='support.ready')queueMicrotask(()=>window.__deliver(obs));
  }};
 },observation());
 try{
  await page.goto(pathToFileURL(join(root,'preview/index.html')).href);
  await page.getByRole('button',{name:'获取 AI 知识建议',exact:true}).waitFor();
  await page.getByRole('button',{name:'获取 AI 知识建议',exact:true}).click();
  await page.waitForFunction(()=>window.__out.some(x=>x.type==='support.aiQuery'));
  const request=await page.evaluate(()=>window.__out.find(x=>x.type==='support.aiQuery'));
  await run(page,request);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'React never calls the old Query API directly');
  await page.screenshot({path:join(evidence,name+'.png')});passed++;console.log('PASS browser stub: '+name);
 }finally{await page.close();}
}
try{
 await scenario('display-one-source-and-human-edit',async(p,r)=>{
  await p.evaluate(m=>window.__deliver(m),result(r));
  await p.getByText('合成协议回复：在订单详情查看物流。',{exact:true}).waitFor();
  assert.equal(await p.locator('.option-wrap').count(),1);
  await p.getByText(/证据编号：synthetic-faq/).waitFor();
  await p.getByRole('button',{name:'编辑选中回复',exact:true}).click();
  assert.equal(await p.getByRole('textbox',{name:'编辑知识建议',exact:true})
    .evaluate(el=>document.activeElement===el),true,'Opening edit focuses the actual reply editor');
  await p.getByRole('textbox',{name:'编辑知识建议',exact:true}).fill('人工编辑：请核对订单后回复。');
  await p.getByRole('button',{name:'完成',exact:true}).click();
  await p.getByRole('button',{name:'→ 填入聊天草稿',exact:true}).click();
  await p.waitForFunction(()=>window.__out.some(x=>x.type==='support.fillDraft'));
  const fill=await p.evaluate(()=>window.__out.find(x=>x.type==='support.fillDraft'));
  assert.equal(fill.text,'人工编辑：请核对订单后回复。');assert.deepEqual(fill.binding,binding);
  assert.equal(fill.expectedDraft,''); // Intent only; no fabricated native receipt.
 });
 await scenario('late-result-keeps-human-edit',async(p,r)=>{
  await p.getByRole('button',{name:'编辑选中回复',exact:true}).click();
  await p.getByRole('textbox',{name:'编辑人工核实',exact:true}).fill('人工保留：请先核对。');
  await p.evaluate(m=>window.__deliver(m),result(r));
  assert.equal(await p.getByRole('textbox',{name:'编辑人工核实',exact:true}).inputValue(),'人工保留：请先核对。');
  assert.equal(await p.getByText('合成协议回复：在订单详情查看物流。',{exact:true}).count(),0);
 });
 for(const action of ['完成','完成编辑','→ 填入聊天草稿'])await scenario('accessibility-value-commits-'+action,async(p,r)=>{
  await p.evaluate(m=>window.__deliver(m),result(r));
  await p.getByRole('button',{name:'编辑选中回复',exact:true}).click();
  // Simulate a native accessibility value change without fabricating an input
  // event. The separate Mac gate performs the real scoped AX setter/readback.
  await p.getByRole('textbox',{name:'编辑知识建议',exact:true}).evaluate(el=>{
    el.value='人工核对后的可访问性编辑';
  });
  // HTMLElement.click models invoke without mouse focus transfer: no blur.
  await p.getByRole('button',{name:action,exact:true}).evaluate(el=>el.click());
  if(action!=='→ 填入聊天草稿')await p.getByRole('button',{name:'→ 填入聊天草稿',exact:true}).evaluate(el=>el.click());
  await p.waitForFunction(()=>window.__out.some(x=>x.type==='support.fillDraft'));
  const fill=await p.evaluate(()=>window.__out.find(x=>x.type==='support.fillDraft'));
  assert.equal(fill.text,'人工核对后的可访问性编辑');
 });
 await scenario('switched-customer-rejects-late-result',async(p,r)=>{
  await p.evaluate(m=>window.__deliver(m),observation(2,{...binding,generation:2,customerId:'t2',messageId:'external-2'}));
  await p.evaluate(m=>window.__deliver(m),result(r));
  assert.equal(await p.getByText('合成协议回复：在订单详情查看物流。',{exact:true}).count(),0);
 });
 await scenario('service-failure-keeps-safe-review',async(p,r)=>{
  await p.evaluate(m=>window.__deliver(m),result(r,{status:'error',retrievalStatus:'unavailable',modelProvider:'none',
   evidencePack:{projectId:'approved-demo',coverage:'unknown',items:[]},candidates:[],errorCode:'QUERY_UNAVAILABLE'}));
  await p.getByText('知识服务不可用',{exact:true}).waitFor();
  assert.equal(await p.getByText('合成协议回复：在订单详情查看物流。',{exact:true}).count(),0);
 });
 console.log('AI_BROWSER_STUB_PASSED='+passed+'; realQuery=false; realModel=false; nativeDraft=false');
}finally{await browser.close();}
