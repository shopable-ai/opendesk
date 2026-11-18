// Repository root: node examples/ai-customer-support/tests/reply-review-browser.mjs
// Ego browser + synthetic bridge only; no model, real chat or system clipboard.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const child=spawn('ego-browser',['nodejs'],{stdio:['pipe','inherit','inherit']});
child.stdin.end('const config='+JSON.stringify({repo})+';\n'+run.toString()+'\nconst outcome = await run();\n');
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});

async function run(){
  const {mkdir,writeFile}=await import('node:fs/promises');
  const {pathToFileURL}=await import('node:url');
  const {default:assert}=await import('node:assert/strict');
  const evidence=config.repo+'/.runtime/tests/ai-customer-support/research-improvements-20261106/browser';
  await mkdir(evidence,{recursive:true});
  const task=await taskSpace('OpenDesk support evidence review 20261106');
  console.log({taskSpaceId:task.spaceId});
  const page=task.page('p1');
  const binding={generation:1,pid:321,windowId:456,customerId:'t1',messageId:'review-message'};
  const observation={type:'support.observation',revision:1,binding,observing:true,
    conversation:{name:'合成审核客户',messages:[{id:binding.messageId,who:'customer',text:'请核对服务时间和售后规则'}],draft:''}};
  const supported=Array.from({length:25},(_,i)=>'第'+(i+1)+'项需要核对实际订单');
  const answer=supported.join('。')+'。保证所有商品永久免费。';
  const result={type:'support.aiResult',projectId:'synthetic-review',knowledgeBackend:'query_api',modelProvider:'none',
    retrievalStatus:'partial',status:'ready',requiresHumanReview:true,errorCode:null,
    evidencePack:{projectId:'synthetic-review',coverage:'partial',items:[
      {id:'e0',sourceType:'knowledge_base',sourceRef:'policy-first',answerHash:'a'.repeat(64),
        source:{title:'售后参考',text:supported.join('。')+'。',document:'first.md',association:'service_declared'}},
      {id:'e1',sourceType:'knowledge_base',sourceRef:'policy-second',answerHash:'b'.repeat(64),
        source:{title:'人工核对',text:'退款资格需要人工核对订单。',document:'second.md',association:'service_declared'}}]},
    candidates:[{id:'first',name:'售后建议',symbol:'✦',text:answer,evidenceIds:['e0']},
      {id:'second',name:'服务建议',symbol:'?',text:supported[0]+'。',evidenceIds:['e1']}]};
  const init=({observation,result})=>{
    const listeners=new Set();window.__reviewOut=[];window.__reviewCopies=[];
    window.__reviewDeliver=value=>listeners.forEach(handler=>handler(value));
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__reviewCopies.push(text)}});
    window.OpenDeskApp={onMessage(handler){listeners.add(handler);return()=>listeners.delete(handler);},postMessage(raw){
      const message=JSON.parse(raw);window.__reviewOut.push(message);
      if(message.type==='support.ready')queueMicrotask(()=>window.__reviewDeliver(observation));
      if(message.type==='support.aiQuery'){
        const next=JSON.parse(JSON.stringify(result));
        if(window.__reviewOut.filter(item=>item.type==='support.aiQuery').length>1){
          next.evidencePack.items.forEach(item=>{item.sourceRef+='-new';item.answerHash='c'.repeat(64);});
        }
        queueMicrotask(()=>window.__reviewDeliver({...next,requestId:message.requestId,binding:message.binding}));
      }
    }};
  };
  await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source:'('+init.toString()+')('+JSON.stringify({observation,result})+');'});
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:380,height:900,deviceScaleFactor:1,mobile:false});
  await page.goto(pathToFileURL(config.repo+'/examples/ai-customer-support/preview/index.html').href);
  console.log(await page.snapshot());
  await page.click('loc=role:button[name="获取 AI 知识建议"]');
  await page.waitForSelector('.option-wrap:nth-child(2)');
  await page.click('.option-wrap:nth-child(1) .evidence-review > summary');
  await page.click('.option-wrap:nth-child(1) .evidence-review details > summary');
  const first=await page.evaluate(()=>document.querySelector('.option-wrap:nth-child(1) .evidence-review').innerText);
  assert.match(first,/26 段 \/ 1 段待核实/);
  assert.match(first,/保证所有商品永久免费/);
  assert.match(first,/policy-first/);assert.doesNotMatch(first,/policy-second/);
  await page.screenshot({path:evidence+'/candidate-review.png'});
  await page.click('.option-wrap:nth-child(1) .evidence-review > summary');
  await page.click('loc=role:button[name="展开人工交接"]');
  const readHandoff=()=>page.evaluate(()=>document.querySelector('textarea[aria-label="人工交接摘要"]').value);
  let handoff=await readHandoff();assert.match(handoff,/合成审核客户/);assert.match(handoff,/policy-first/);
  assert.match(handoff,/保证所有商品永久免费/);assert.doesNotMatch(handoff,/policy-second/);
  await page.click('loc=role:button[name="复制交接摘要"]');
  assert.equal(await page.evaluate(()=>window.__reviewCopies.at(-1)),handoff);
  await page.screenshot({path:evidence+'/handoff-preview.png'});
  await page.click('.option-wrap:nth-child(2) > .option');
  handoff=await readHandoff();assert.match(handoff,/policy-second/);assert.doesNotMatch(handoff,/policy-first/);
  await page.click('.option-wrap:nth-child(2) .evidence-review > summary');
  assert.match(await page.evaluate(()=>document.querySelector('.option-wrap:nth-child(2) .evidence-review').innerText),/1 段 \/ 1 段待核实/);
  await page.click('loc=role:button[name="编辑选中回复"]');
  await page.fill('textarea[aria-label="编辑服务建议"]','退款资格需要人工核对订单。');
  await page.click('loc=role:button[name="完成"]');
  handoff=await readHandoff();assert.match(handoff,/退款资格需要人工核对订单/);
  assert.doesNotMatch(handoff,/保证所有商品永久免费/);
  assert.match(await page.evaluate(()=>document.querySelector('.option-wrap:nth-child(2) .evidence-review').innerText),/1 段 \/ 0 段待核实/);
  // A later query preserves this selected human version and its own evidence.
  await page.click('loc=role:button[name="获取 AI 知识建议"]');
  await page.waitForFunction(()=>document.querySelectorAll('.option-wrap').length===4);
  assert.equal(await readHandoff(),handoff);
  await page.click('.option-wrap:nth-child(4) > .option');
  handoff=await readHandoff();assert.match(handoff,/policy-second-new/);assert.match(handoff,/c{64}/);
  assert.doesNotMatch(handoff,/b{64}/);
  await page.click('loc=role:button[name="编辑选中回复"]');
  await page.fill('textarea[aria-label="编辑服务建议"]','未完成编辑时直接复制的当前稿。');
  // AX can update the native editor without dispatching an input event.
  await page.evaluate(()=>{document.querySelector('textarea[aria-label="编辑服务建议"]').value='当前编辑器的最终稿。';});
  await page.click('loc=role:button[name="复制交接摘要"]');
  const copied=await page.evaluate(()=>window.__reviewCopies.at(-1));
  assert.match(copied,/当前编辑器的最终稿/);assert.doesNotMatch(copied,/未完成编辑时直接复制/);
  assert.match(copied,/policy-second-new/);
  const next={...observation,revision:2,binding:{...binding,generation:2,customerId:'t2',messageId:'next-message'},
    conversation:{name:'另一位合成客户',messages:[{id:'next-message',who:'customer',text:'另一个当前问题'}],draft:''}};
  await page.evaluate(value=>window.__reviewDeliver(value),next);
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="人工交接摘要"]').value.includes('另一位合成客户'));
  handoff=await readHandoff();assert.match(handoff,/另一个当前问题/);assert.doesNotMatch(handoff,/policy-first|policy-second|合成审核客户/);
  await page.evaluate(value=>window.__reviewDeliver(value),{...next,revision:3,observing:false});
  await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="人工交接摘要"]'));
  const outgoing=await page.evaluate(()=>window.__reviewOut);
  assert.equal(outgoing.some(item=>item.type==='support.fillDraft'),false);
  const report={status:'PASS',checks:['candidate-scoped references','all 26 clauses visible','unsupported tail visible',
    'handoff preview and explicit copy','selected version evidence','edit re-review','requery preserves selected provenance',
    'new query version carries new evidence','copy commits unfinished editor value',
    'customer switch isolation','observation stop hides handoff','no draft action'],
    scope:'Ego browser, synthetic native bridge and clipboard writer; no real Query, model, OS clipboard or native draft',spaceId:task.spaceId};
  await writeFile(evidence+'/result.json',JSON.stringify(report,null,2)+'\n');
  console.log(report);
  await task.finish({keep:[]});
}
