// Repository root: node examples/ai-customer-support/scripts/evaluate-wallpaper.mjs
// --run calibration|holdout --output .runtime/tests/ai-customer-support/r30c/<run>
// Only the existing, explicitly bound local test service is allowed. No sends.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const base=resolve(import.meta.dirname,'..');
const adapter=runInNewContext(readFileSync(join(base,'desktop/query-api-adapter.js'),'utf8')+';OpenDeskSupportQueryAPI');
const binding={generation:1,pid:1,windowId:1,customerId:'t1',messageId:'quality-only'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const frozenCasesSha256='7b15b46b86be4ca955890171b9ad8a1ce77b19ff0240ffa70e89efa255941c6b';
export function validateFixture(bytes){
  if(sha(bytes)!==frozenCasesSha256)throw Error('Frozen fixture changed; create an explicit new evaluation version.');
  const {cases}=JSON.parse(bytes),holdout=cases.filter(c=>c.split==='holdout');
  const quotas={answerable:10,unknown:8,stale_conflict:4,project_isolation:4,injection:4};
  const calibration=cases.filter(c=>c.split==='calibration'),groups=new Set(calibration.map(c=>c.groupId));
  if(cases.length!==33||calibration.length!==3||holdout.length!==30||
    new Set(cases.map(c=>c.id)).size!==33||holdout.some(c=>groups.has(c.groupId))||
    Object.entries(quotas).some(([k,n])=>holdout.filter(c=>c.category===k).length!==n)||
    holdout.filter(c=>c.category==='answerable'&&c.isParaphrase===true).length<5)
    throw Error('Frozen split contract failed.');
  return cases;
}
export function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
}
export function classify(c,response){
  const config=adapter.config({port:18084,projectId:c.projectId,modelProvider:'auto'});
  const converted=adapter.convert(config,{requestId:c.id,binding,question:c.question||'test'},response);
  const dto=response.data?.data||{},ids=converted.evidencePack.items.map(e=>e.sourceRef);
  const validAnswer=converted.status==='ready'&&converted.candidates.length>0;
  const expected=c.expected||{};
  const one=converted.evidencePack.items.length===1?converted.evidencePack.items[0]:null;
  const sourceIntegrity=one&&typeof dto.knowledge_answer==='string'?
    (dto.matched_id===one.sourceRef&&dto.source_answer_hash===one.answerHash&&
      sha(JSON.stringify(dto.knowledge_answer))===one.answerHash?'PASS':'FAIL'):'NOT_TESTED';
  const ranked=dto.evidence?.top_candidates;
  const identityValid=response.status===200&&response.data?.code===0&&typeof response.data?.message==='string'&&
    dto&&typeof dto==='object'&&!Array.isArray(dto)&&dto.request_id===c.id&&
    ['product_slug','requested_product_slug','actual_product_slug'].every(k=>dto[k]===c.projectId);
  const usableRanks=expected.outcome==='answer'&&expected.sourceIds?.length>0&&
    identityValid&&Array.isArray(ranked)&&ranked.length>0&&
    ranked.every(e=>e&&typeof e==='object'&&typeof e.entry_id==='string'&&e.entry_id.length>0&&Number.isFinite(e.hybrid_score))&&
    new Set(ranked.map(e=>e.entry_id)).size===ranked.length;
  const rankIds=usableRanks?ranked.slice(0,3).map(e=>e.entry_id):[];
  const businessDegradation=response.status===200&&response.data?.code===0&&
    (dto.requires_human_review===true||['unknown','conflict','partial'].includes(dto.coverage?.status||dto.coverage_status))&&
    typeof (dto.review_answer||dto.answer)==='string';
  return {http:response.status===200&&response.data?.code===0?'PASS':'FAIL',
    validAnswer,sourceIntegrity,adapterStatus:converted.status,adapterReason:converted.errorCode,
    sourceSelection:expected.outcome==='answer'?(validAnswer&&expected.sourceIds?.length>0&&
      expected.sourceIds.every(id=>ids.includes(id))&&ids.every(id=>expected.sourceIds.includes(id))&&
      converted.evidencePack.items.every(e=>!expected.sourceHashes||expected.sourceHashes[e.sourceRef]===e.answerHash)?'PASS':'FAIL'):'NOT_APPLICABLE',
    adapterFailClosed:expected.outcome==='degrade'?(!validAnswer?'PASS':'FAIL'):'NOT_APPLICABLE',
    safeDegradation:expected.outcome==='degrade'?(validAnswer?'FAIL':businessDegradation?'REVIEW_REQUIRED':'NOT_TESTED'):'NOT_APPLICABLE',
    rankedRetrieval:usableRanks?{status:'OBSERVED',ids:rankIds,hitAt1:expected.sourceIds.includes(rankIds[0]),
      hitAt3:expected.sourceIds.some(id=>rankIds.includes(id)),
      recallAt3:expected.sourceIds.filter(id=>rankIds.includes(id)).length/expected.sourceIds.length}:
      {status:'NOT_TESTED',reason:'This response has no ranked candidates with golden source IDs; alias/early exits are not misses.'},
    factualReview:'NOT_TESTED',
    strategy:dto.selected_answer_strategy||null,coverage:dto.coverage?.status||dto.coverage_status||null,
    sources:converted.evidencePack.items,answer:dto.review_answer||dto.answer||null,
    modelCallCounts:dto.model_call_counts||null,
    realGeneration:validAnswer&&dto.selected_answer_strategy!=='rag_raw'&&
      dto.model_call_counts?.total_provider_requests>0&&dto.rewrite_status==='completed',
    note:'Adapter acceptance is not factual correctness; provider association and independent fact review are separate.'};
}
export function associateProvider(events,start,end,count,queries,requestId){
  if(events?.status!=='COMPLETE'||queries?.status!=='COMPLETE')return {status:'NOT_TESTED',
    reason:'Audit completeness unknown.',auditStatus:{provider:events?.status||'MISSING',query:queries?.status||'MISSING'}};
  const records=events.records.filter(e=>e.started>=start&&e.ended<=end);
  const matched=queries.records.filter(q=>q.response?.data?.request_id===requestId&&q.at>=start&&q.at<=end+0.1);
  const trace=matched.length===1?matched[0].requestTraceId:null;
  const linked=trace?records.filter(e=>e.requestTraceId===trace):[];
  if(count===0&&trace&&!records.length)return {status:'ZERO_CALL',requestTraceId:trace,records:[]};
  if(!trace||!Number.isSafeInteger(count)||count<=0||linked.length!==count||
    linked.some(e=>!e.response_id||!e.usage)||new Set(linked.map(e=>e.response_id)).size!==linked.length)
    return {status:'NOT_TESTED',reason:'Missing or duplicate per-request trace linkage; interval/count alone is insufficient.',records};
  return {status:'PASS',requestTraceId:trace,association:'Same-process passive request trace joins Query ID to provider response; not vendor attestation.',records:linked};
}
export function parseAudit(bytes){
  if(bytes===null)return {status:'MISSING',records:[],invalidLines:[]};
  const records=[],invalidLines=[];
  String(bytes).split('\n').forEach((line,i)=>{
    if(!line.trim())return;
    try{const row=JSON.parse(line);if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Audit object required');records.push(row);}
    catch{invalidLines.push(i+1);}
  });
  return {status:invalidLines.length?'INVALID':'COMPLETE',records,invalidLines};
}
function readAudit(path){
  try{return parseAudit(readFileSync(path,'utf8'));}
  catch(e){return {...parseAudit(null),reason:e.code||'READ_ERROR'};}
}
async function main(){
  const args=process.argv.slice(2),mode=args[args.indexOf('--run')+1],outArg=args[args.indexOf('--output')+1];
  if(!args.includes('--run')||!['calibration','holdout'].includes(mode)||!args.includes('--output')||!outArg)
    throw Error('Use --run calibration|holdout --output .runtime/tests/ai-customer-support/r30c/<new-run>');
  const root=resolve(base,'../..'),allowed=join(root,'.runtime/tests/ai-customer-support/r30c');
  const output=resolve(outArg);
  if(!output.startsWith(allowed+'/')||existsSync(output))throw Error('Output must be a new directory inside '+allowed);
  const fixture=join(base,'fixtures/r30c-wallpaper/cases.json'),bytes=readFileSync(fixture);
  const cases=validateFixture(bytes).filter(c=>c.split===mode);
  if(!cases.length||cases.length>40)throw Error('Invalid bounded test set');
  if(new Set(cases.map(c=>c.id)).size!==cases.length)throw Error('Duplicate request IDs');
  for(const c of cases)if(!/^[A-Za-z0-9_-]{1,40}$/.test(c.id)||!['bizhi-app','ai-membership','missing-project'].includes(c.projectId))throw Error('Invalid case identity');
  mkdirSync(output,{recursive:true});
  const save=(name,data)=>writeFileSync(join(output,name),JSON.stringify(data,null,2)+'\n');
  const snapshotRoot=join(allowed,'projects/bizhi-app');
  const snapshotFiles=['project.yaml','knowledge-base/canonical_knowledge/faq_v002.jsonl',
    'knowledge-base/boundary_unknowns/boundary_cases_v002.jsonl','knowledge-base/alias_mapping/query_aliases_v001.jsonl',
    'knowledge-base/indexes/active_entries_snapshot.jsonl'];
  const knowledgeSnapshot=Object.fromEntries(snapshotFiles.map(p=>[p,sha(readFileSync(join(snapshotRoot,p)))]));
  save('seal.json',{at:new Date().toISOString(),casesSha256:sha(bytes),knowledgeSnapshot,runnerSha256:sha(readFileSync(fileURLToPath(import.meta.url))),
    adapterSha256:sha(readFileSync(join(base,'desktop/query-api-adapter.js'))),mode,
    endpoint:'http://127.0.0.1:18084/api/query',timeoutMs:18000,retryCount:0,
    frozenCases:cases,productionBusinessApproval:false});
  const audit=join(allowed,'provider-wire-audit.jsonl'),queryAudit=join(allowed,'query-wire-audit.jsonl'),rows=[];
  for(const c of cases){
    if(c.execution==='NOT_TESTED'){
      rows.push({id:c.id,category:c.category,status:'NOT_TESTED',reason:c.reason});
      save('results.json',rows);continue;
    }
    const payload={request_id:c.id,product_slug:c.projectId,query:c.question,channel:'generic',delivery_mode:'draft',answer_strategy:'auto'};
    const start=Date.now()/1000;let response={status:0,data:null},error=null,timedOut=false;
    try{
      const r=await fetch('http://127.0.0.1:18084/api/query',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(18000)});
      response={status:r.status,data:await r.json()};
    }catch(e){error=String(e);timedOut=e.name==='TimeoutError';}
    const end=Date.now()/1000;
    // Keep raw answers local. They are never copied into a public knowledge file.
    save(c.id+'.json',{case:c,request:payload,start,end,latencyMs:(end-start)*1000,response,error,timedOut});
    const result=classify(c,response),count=result.modelCallCounts?.total_provider_requests;
    rows.push({id:c.id,groupId:c.groupId,category:c.category,projectId:c.projectId,
      status:error?'FAIL':'OBSERVED',start,end,latencyMs:Math.round((end-start)*1000),error,timedOut,...result,
      provider:associateProvider(readAudit(audit),start,end,count,readAudit(queryAudit),c.id)});
    save('results.json',rows);
    console.log(JSON.stringify({id:c.id,http:response.status,strategy:result.strategy,adapter:result.adapterStatus,
      source:result.sourceSelection,degradation:result.safeDegradation,provider:rows.at(-1).provider.status}));
  }
  const observed=rows.filter(r=>r.status!=='NOT_TESTED'),latencies=observed.map(r=>r.latencyMs);
  const summary={mode,casesSha256:sha(bytes),planned:cases.length,executed:observed.length,
    notTested:rows.filter(r=>r.status==='NOT_TESTED').map(r=>({id:r.id,reason:r.reason})),
    http200:observed.filter(r=>r.http==='PASS').length,validAnswers:observed.filter(r=>r.validAnswer).length,
    sourceSelection:{pass:observed.filter(r=>r.sourceSelection==='PASS').length,denominator:cases.filter(c=>c.expected.outcome==='answer').length},
    adapterFailClosed:{pass:observed.filter(r=>r.adapterFailClosed==='PASS').length,denominator:cases.filter(c=>c.expected.outcome==='degrade').length},
    semanticDegradation:'NOT_TESTED: per-question review required; transport failures excluded',
    genuineGeneration:observed.filter(r=>r.realGeneration&&r.provider.status==='PASS').map(r=>r.id),
    factualCorrectness:'NOT_TESTED: requires independent per-fact review of raw outputs',
    rankedRetrieval:{n:observed.filter(r=>r.rankedRetrieval.status==='OBSERVED').length,
      hitAt1:observed.filter(r=>r.rankedRetrieval.hitAt1).length,hitAt3:observed.filter(r=>r.rankedRetrieval.hitAt3).length,
      note:'Only responses containing real top_candidates; not the whole answerable or paraphrase set. Missing ranks are NOT_TESTED.'},
    latency:{n:latencies.length,p50Ms:percentile(latencies,0.5),p95Ms:percentile(latencies,0.95),
      timeouts:observed.filter(r=>r.timedOut).length,timeoutDenominator:observed.length},sendActions:0};
  save('summary.json',summary);console.log(JSON.stringify(summary));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e);process.exitCode=1;});
