// Node-only business trial. No desktop actions, credentials, or service deployment.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(join(root,p),'utf8');
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const api=runInNewContext(read('desktop/query-api-adapter.js')+';OpenDeskSupportQueryAPI');
const corpus=JSON.parse(read('fixtures/r30c-wallpaper/cases.json'));
const audit=JSON.parse(read('fixtures/r30c-wallpaper/audit.json'));
const from=id=>structuredClone(corpus.cases.find(c=>c.id===id));
const common=from('C-W-02'), unknown=from('C-W-14');
export const scenarios=[
  {...common,id:'common',category:'常见咨询',messages:[{id:'m1',who:'customer',text:common.question}]},
  {...unknown,id:'insufficient',category:'资料不足',messages:[{id:'m1',who:'customer',text:unknown.question}]},
  {...common,id:'context',category:'多条未回答消息',messages:[
    {id:'old-c',who:'customer',text:'旧问题：怎么下载壁纸？'},
    {id:'old-a',who:'agent',text:'旧答复：请查看下载页面。'},
    {id:'m1',who:'customer',text:'我想了解壁纸新内容的更新频率。'},
    {id:'m2',who:'customer',text:'一般隔多久上一次？'}]},
  {...common,id:'correction',category:'人工纠正',humanText:'人工纠正：更新以当前页面为准，不承诺每天更新。',
    messages:[{id:'m1',who:'customer',text:common.question}]}
];
export function validateCases(){
  assert.equal(audit.project.id,'bizhi-app');
  assert.equal(audit.project.review_required_before_production,true);
  assert.equal(new Set(scenarios.map(c=>c.id)).size,4);
  for(const c of scenarios){
    assert.equal(c.projectId,'bizhi-app');
    for(const id of c.expected.sourceIds){
      assert.equal(audit.sourceRecords.find(r=>r.id===id)?.answer_hash,c.expected.sourceHashes[id]);
    }
  }
  return {scope:audit.project.scope,businessApproval:false,
    note:'Reuse of source-reviewed dev material; C-W-14 is now visible trial data, not a fresh holdout.'};
}

// Execute the current production askAI function with synthetic AX snapshots.
// This proves host payload semantics, not real AX/window behavior.
export async function hostQuery(c,config,transport,requestId='trial-'+randomUUID().slice(0,16)){
  const win={pid:42,handle:80,exePath:'/synthetic/support-chat',isForeground:true};
  const snapshot={complete:true,truncated:false,backend:'synthetic',root:{children:[
    {identifier:'support.session',value:'t1 · 林女士'},
    {identifier:'support.draft.t1',value:''},
    ...c.messages.map((m,i)=>({identifier:`support.message.t1-m${i+1}.${m.who}`,
      value:`${m.who==='customer'?'客户':'客服'} · t1-m${i+1}\n${m.text}`}))]}};
  const payloads=[],results=[];
  const ctx={target:win,queryConfig:config,log(){},freshTarget:async()=>win,
    sameWindow:w=>w?.pid===42&&w?.handle===80&&w?.exePath===win.exePath,
    window:{getAppWindow:async()=>win},exactSnapshot:async()=>snapshot,
    panel:{postMessage:async r=>results.push(JSON.parse(JSON.stringify(r)))},
    http:{post:async(url,payload)=>{payloads.push(JSON.parse(JSON.stringify(payload)));return transport(url,payload);}},
    automation:{pause(){}},invalidate:async reason=>{throw Error(reason);}};
  runInNewContext(read('desktop/native-adapter.js')+';globalThis.nativeAPI=OpenDeskSupportNative',ctx);
  ctx.OpenDeskSupportQueryAPI=api;
  ctx.adapter=ctx.nativeAPI.create(win);
  const observation=ctx.adapter.accept(win,snapshot).observation;
  const host=read('native-demo.js');
  const start=host.indexOf('async function askAI('),end=host.indexOf('\nfunction scheduleObservation(',start);
  assert.ok(start>=0&&end>start,'production askAI boundary changed');
  runInNewContext(`let closed=false,revoked=false,paused=false,authorizationGeneration=0;
    let aiInflight=new Set(),aiRequestIds=new Set(),queue=Promise.resolve(),queueDepth=0,lastError='';
    const contextOf=c=>JSON.stringify(c.messages);
    const pendingTurn=c=>c.messages.at(-1)?.who==='customer';\n`+host.slice(start,end)+';globalThis.ask=askAI',ctx);
  await ctx.ask({type:'support.aiQuery',requestId,binding:observation.binding});
  return {payloads,results,observation:JSON.parse(JSON.stringify(observation))};
}

export function assess(c,config,ctx,response){
  const result=JSON.parse(JSON.stringify(api.convert(config,ctx,response)));
  const dto=response?.data?.data;
  const checks=[];
  const check=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});
  check('HTTP/envelope/identity/draft contract',response.status===200&&response.data?.code===0&&
    typeof response.data?.message==='string'&&dto?.request_id===ctx.requestId&&dto?.product_slug===config.projectId&&
    (dto.actual_product_slug===undefined||dto.actual_product_slug===config.projectId)&&
    (dto.requested_product_slug===undefined||dto.requested_product_slug===config.projectId)&&
    dto.delivery_mode_applied==='draft'&&dto.delivery_status==='draft_only'&&dto.direct_reply_allowed===false);
  const text=dto?.review_answer||'';
  const hits=result.evidencePack.items;
  const matched=hits.length>0&&hits.every(h=>c.expected.sourceIds.includes(h.sourceRef)&&
    c.expected.sourceHashes[h.sourceRef]===h.answerHash);
  const original=typeof dto?.knowledge_answer==='string'?dto.knowledge_answer:null;
  const source=hits.length===1&&original!==null&&dto.matched_id===hits[0].sourceRef&&
    dto.source_answer_hash===hits[0].answerHash&&sha(JSON.stringify(original))===hits[0].answerHash;
  check('human review required',result.requiresHumanReview===true);
  check('conservative draft or blocked result, not transport failure',
    result.status==='blocked'&&result.candidates.length===0||
    result.status==='ready'&&result.candidates.length===1&&result.candidates.every(candidate=>
      candidate.text.trim().length>0&&candidate.text.length<=2000&&candidate.evidenceIds.length>0));
  if(c.expected.outcome==='answer'){
    check('answerable case has a supported selectable candidate',result.status==='ready'&&
      result.retrievalStatus==='supported'&&result.candidates.length===1);
    check('answerable case source identity and hash match expected material',matched);
  }
  // Available source text must pass integrity checking. Missing original stays visible
  // as unavailable, never converted to semantic support or silently filled by fixtures.
  if(hits.length===1&&original!==null)check('single-source original hash recomputed',source);
  const observations={
    expectedLockedSources:matched?'MATCH':'NO_MATCH_OR_UNAVAILABLE',
    sourceOriginal:original===null?'UNAVAILABLE':source?'HASH_MATCH':'NOT_ASSOCIATED_OR_HASH_MISMATCH',
    expectedFactCues:typeof text==='string'&&c.expected.facts.every(f=>f.anyOf.some(s=>text.includes(s))),
    forbiddenLiteralSeen:typeof text==='string'?c.expected.forbiddenFacts.filter(s=>text.includes(s)):[],
    note:'Cue and expected-source observations are review aids only, excluded from automatic pass. No semantic entailment judgment.'};
  return {checks,result,observations,passed:checks.every(c=>c.status==='PASS'),automaticOnly:true,semanticStatus:'NOT_TESTED',
    semanticReview:'REQUIRED: compare full answer and original, including omissions/negation; cue checks are not semantic proof',
    modelEvidence:{serviceDeclaredProvider:dto?.model_provider??null,
      serviceDeclaredStrategy:dto?.selected_answer_strategy??null,
      serviceDeclaredCalls:dto?.model_call_counts??null,independentProviderVerification:'NOT_TESTED'}};
}

async function main(){
  if(process.argv[2]!=='--live')throw Error('Use --live with TRIAL_QUERY_PORT and TRIAL_QUERY_PROJECT; offline: node --test examples/ai-customer-support/tests/trial-business.test.mjs');
  const config=api.config({port:Number(process.env.TRIAL_QUERY_PORT),projectId:process.env.TRIAL_QUERY_PROJECT,
    modelProvider:process.env.TRIAL_QUERY_PROVIDER||'auto'});
  assert.ok(config,'Explicit port/project/provider required; no credentials or deployment managed here');
  assert.equal(config.projectId,'bizhi-app','These source expectations only apply to bizhi-app');
  const provenance=validateCases();
  const output=resolve('.runtime/tests/ai-customer-support/trial-business',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8));
  mkdirSync(output,{recursive:true});
  const save=(name,value)=>writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n');
  const summary={mode:'LIVE_QUERY_HTTP_WITH_SYNTHETIC_AX',provenance,config,output,
    sourceHashes:Object.fromEntries(['native-demo.js','desktop/query-api-adapter.js','src/state.tsx',
      'fixtures/r30c-wallpaper/cases.json','fixtures/r30c-wallpaper/audit.json'].map(p=>[p,sha(read(p))])),
    nativeWindow:'NOT_TESTED',realModel:'NOT_INDEPENDENTLY_VERIFIED',cases:[]};
  for(const c of scenarios){
    let record;
    try{
      const run=await hostQuery(c,config,async(url,payload)=>{
        save(c.id+'-request.json',{url,payload});
        const startedAt=new Date().toISOString();
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),signal:AbortSignal.timeout(30000),redirect:'error'});
        const raw=await res.text();
        save(c.id+'-response.json',{startedAt,endedAt:new Date().toISOString(),status:res.status,raw});
        let data;try{data=JSON.parse(raw);}catch{data=null;}
        const response={status:res.status,data};
        record=assess(c,config,{requestId:payload.request_id,question:payload.query},response);
        return response;
      });
      assert.equal(run.payloads.length,1);assert.equal(run.results.length,1);
      // Reducer checks use the real returned DTO, not synthetic model text.
      const {checkHumanProtection}=await import('./trial-business-state.mjs');
      if(c.id==='correction')record.humanProtection=await checkHumanProtection(run.observation,run.results[0],c.humanText);
      record={id:c.id,...record,payload:run.payloads[0],hostResult:run.results[0],
        manualReview:{status:'PENDING',question:run.payloads[0].query,
          rubric:c.expected,category:c.category,
          prompts:['逐句比对回答与来源，检查否定、适用范围和遗漏',
            '资料不足时有无编造价格、更新承诺；是否需继续追问或转人工',
            '跨已回答轮次的指代是否缺失上下文',
            '真实窗口检查人工稿保留：本工具仅验证 reducer']}};
    }catch(error){record={id:c.id,passed:false,error:String(error)};}
    summary.cases.push(record);save('summary.json',summary);
    console.log(JSON.stringify({id:c.id,passed:record.passed,error:record.error}));
  }
  console.log('Evidence: '+output);
  if(summary.cases.some(c=>!c.passed))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
