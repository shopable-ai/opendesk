import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import { classify, percentile, associateProvider, parseAudit, validateFixture } from '../scripts/evaluate-wallpaper.mjs';

const dto={request_id:'c1',product_slug:'bizhi-app',actual_product_slug:'bizhi-app',
  requested_product_slug:'bizhi-app',delivery_status:'draft_only',delivery_mode_applied:'draft',
  direct_reply_allowed:false,selected_answer_strategy:'rag_raw',
  coverage:{status:'full',locked_hits:[{knowledge_id:'faq',answer_hash:'a'.repeat(64)}]},
  model_call_counts:{total_provider_requests:0},model_provider:'none',review_answer:'测试原文'};
const c={id:'c1',projectId:'bizhi-app',expected:{outcome:'answer',sourceIds:['faq']}};
test('sealed holdout keeps category quotas, independent groups and real isolation inputs',()=>{
  const bytes=readFileSync(new URL('../fixtures/r30c-wallpaper/cases.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'7b15b46b86be4ca955890171b9ad8a1ce77b19ff0240ffa70e89efa255941c6b');
  const {cases}=JSON.parse(bytes),holdout=cases.filter(x=>x.split==='holdout');
  assert.equal(cases.length,33);assert.equal(new Set(cases.map(x=>x.id)).size,33);
  assert.deepEqual(Object.fromEntries(['answerable','unknown','stale_conflict','project_isolation','injection'].map(k=>[k,holdout.filter(x=>x.category===k).length])),
    {answerable:10,unknown:8,stale_conflict:4,project_isolation:4,injection:4});
  const calibrationGroups=new Set(cases.filter(x=>x.split==='calibration').map(x=>x.groupId));
  assert.ok(holdout.every(x=>!calibrationGroups.has(x.groupId)));
  assert.ok(holdout.filter(x=>x.category==='answerable'&&x.isParaphrase).length>=5);
  for(const x of holdout.filter(x=>x.category==='stale_conflict')){
    assert.equal(x.execution,'NOT_TESTED');assert.match(x.reason,/Owner/);
  }
  assert.deepEqual(holdout.filter(x=>x.category==='project_isolation').map(x=>x.projectId).sort(),
    ['ai-membership','ai-membership','missing-project','missing-project']);
  for(const x of cases.filter(x=>x.expected.outcome==='answer')){
    assert.ok(x.expected.facts.length>0);assert.ok(x.expected.sourceIds.length>0);
    for(const id of x.expected.sourceIds)assert.match(x.expected.sourceHashes[id],/^[a-f0-9]{64}$/);
  }
});
test('HTTP success, evidence selection and factual review remain separate claims',()=>{
  const r=classify(c,{status:200,data:{code:0,message:'ok',data:dto}});
  assert.equal(r.http,'PASS');assert.equal(r.sourceSelection,'PASS');
  assert.equal(r.factualReview,'NOT_TESTED');assert.equal(r.realGeneration,false);
});
test('wrong identities and absent evidence cannot pass a source selection',()=>{
  for(const delta of [{product_slug:'other'},{request_id:'other'},
    {coverage:{status:'full',locked_hits:[]}}, {coverage:{status:'conflict',locked_hits:[]}}]){
    assert.equal(classify(c,{status:200,data:{code:0,message:'ok',data:{...dto,...delta}}}).sourceSelection,'FAIL');
  }
});
test('contract refusal is not scored as semantic rejection quality',()=>{
  const unknown={...c,expected:{outcome:'degrade',sourceIds:[]}};
  const r=classify(unknown,{status:400,data:{code:400,message:'unknown project'}});
  assert.equal(r.http,'FAIL');assert.equal(r.adapterFailClosed,'PASS');
  assert.equal(r.safeDegradation,'NOT_TESTED');
  assert.equal(r.validAnswer,false);assert.equal(r.realGeneration,false);
});
test('provider evidence requires an unambiguous time interval and declared request count',()=>{
  const a={started:11,ended:13,response_id:'provider1',usage:{total_tokens:5},requestTraceId:'trace1'};
  const q=[{at:13.5,requestTraceId:'trace1',response:{data:{request_id:'c1'}}}];
  const complete=records=>({status:'COMPLETE',records});
  assert.equal(associateProvider(complete([a]),10,14,1).status,'NOT_TESTED');
  assert.equal(associateProvider(complete([a]),10,14,1,complete(q),'c1').status,'PASS');
  assert.equal(associateProvider(complete([a,a]),10,14,2,complete(q),'c1').status,'NOT_TESTED');
  assert.equal(associateProvider(complete([a]),10,14,0,complete(q),'c1').status,'NOT_TESTED');
  assert.equal(associateProvider(complete([]),10,14,0,complete(q),'c1').status,'ZERO_CALL');
  assert.equal(associateProvider({status:'MISSING',records:[]},10,14,0,complete(q),'c1').status,'NOT_TESTED');
  assert.equal(associateProvider(complete([]),10,14,0).status,'NOT_TESTED');
});
test('audit parsing retains invalid or missing evidence instead of turning it into no calls',()=>{
  assert.equal(parseAudit(null).status,'MISSING');
  assert.equal(parseAudit('{broken\n{"started":11}\n').status,'INVALID');
  assert.equal(parseAudit('null\n').status,'INVALID');
  assert.equal(parseAudit('{"started":11}\n').status,'COMPLETE');
});
test('live evaluation rejects a revised fixture before it can issue requests',()=>{
  const bytes=readFileSync(new URL('../fixtures/r30c-wallpaper/cases.json',import.meta.url));
  assert.equal(validateFixture(bytes).length,33);
  assert.throws(()=>validateFixture(Buffer.concat([bytes,Buffer.from(' ')])),/frozen/i);
});
test('an unsafe selectable answer fails degradation even if its source ID is valid',()=>{
  const r=classify({...c,expected:{outcome:'degrade'}},{status:200,data:{code:0,message:'ok',data:dto}});
  assert.equal(r.safeDegradation,'FAIL');assert.equal(r.adapterFailClosed,'FAIL');
});
test('only real ranked candidates support top-k and locked hits do not',()=>{
  const raw={status:200,data:{code:0,message:'ok',data:dto}};
  assert.equal(classify(c,raw).rankedRetrieval.status,'NOT_TESTED');
  const r=classify(c,{...raw,data:{...raw.data,data:{...dto,evidence:{top_candidates:[
    {entry_id:'irrelevant',hybrid_score:0.9},{entry_id:'faq',hybrid_score:0.8}]}}}});
  assert.equal(r.rankedRetrieval.hitAt1,false);assert.equal(r.rankedRetrieval.hitAt3,true);
});
test('rankings require matching transport and identities, and malformed entries do not throw',()=>{
  const data={...dto,evidence:{top_candidates:[{entry_id:'faq',hybrid_score:1}]}};
  for(const response of [
    {status:500,data:{code:0,data}},
    {status:200,data:{code:1,data}},
    {status:200,data:{code:0,data}},
    ...[{request_id:'wrong'},{actual_product_slug:'wrong'},{product_slug:'wrong'},{requested_product_slug:'wrong'}]
      .map(delta=>({status:200,data:{code:0,data:{...data,...delta}}})),
    {status:200,data:{code:0,data:{...dto,evidence:{top_candidates:[null]}}}}
  ])assert.equal(classify(c,response).rankedRetrieval.status,'NOT_TESTED');
  const retrievalOnly={...data,coverage:{status:'partial',locked_hits:[]}};
  assert.equal(classify(c,{status:200,data:{code:0,message:'ok',data:retrievalOnly}}).rankedRetrieval.status,'OBSERVED');
});
test('single-source text integrity is recomputed and a claimed hash cannot hide tampering',()=>{
  const answer='含原始换行\n与中文。',hash=createHash('sha256').update(JSON.stringify(answer)).digest('hex');
  const source={...dto,matched_id:'faq',knowledge_answer:answer,source_answer_hash:hash,
    coverage:{status:'full',locked_hits:[{knowledge_id:'faq',answer_hash:hash}]}};
  const wrapped=data=>({status:200,data:{code:0,message:'ok',data}});
  assert.equal(classify(c,wrapped(source)).sourceIntegrity,'PASS');
  assert.equal(classify(c,wrapped({...source,knowledge_answer:answer+'被改写'})).sourceIntegrity,'FAIL');
});
test('latencies use nearest rank and never invent a percentile for an empty sample',()=>{
  assert.equal(percentile([],0.95),null);
  assert.equal(percentile([1,2,3,4,5],0.95),5);
});
