// Replay actual provider text through existing adapter; no service mutation or GUI.
import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const root='examples/ai-customer-support/';
const out='.runtime/tests/ai-customer-support/r30c-20261030/quality/';
const query=runInNewContext(readFileSync(root+'desktop/query-api-adapter.js','utf8')+';OpenDeskSupportQueryAPI',Object.create(null));
const config=query.config({port:18082,projectId:'synthetic-demo',modelProvider:'auto'});
const binding={generation:1,pid:321,windowId:456,customerId:'synthetic',messageId:'quality'};
const cases=JSON.parse(readFileSync(root+'fixtures/r30c-quality/cases.json'));
const records=[];
for(let n=2;n<4;n++){
 const raw=JSON.parse(readFileSync(out+`response-${n}.json`)).response;
 const xs=JSON.parse(raw.choices[0].message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));
 for(const x of xs){
  if(!cases.find(c=>c.id===x.id)?.risk)continue;
  const data={request_id:x.id,product_slug:'synthetic-demo',actual_product_slug:'synthetic-demo',requested_product_slug:'synthetic-demo',delivery_mode_applied:'draft',delivery_status:'draft_only',direct_reply_allowed:false,review_answer:x.answer,selected_answer_strategy:'rag_rewrite',coverage_status:'unknown',coverage:{status:'unknown',locked_hits:[]},model_call_counts:{total_provider_requests:1},model_provider:'openai-compatible'};
  const r=query.convert(config,{requestId:x.id,binding,question:cases.find(c=>c.id===x.id).question},{status:200,data:{code:0,message:'ok',data}});
  records.push({id:x.id,actualModelAnswer:x.answer,status:r.status,candidates:r.candidates.length,pass:r.status==='blocked'&&r.candidates.length===0});
 }
}
writeFileSync(out+'adapter-gate-replay.json',JSON.stringify({mode:'offline actual-output replay with controlled no-evidence envelope; not live Query or Mac',adapterPath:root+'desktop/query-api-adapter.js',records},null,2)+'\n');
assert.equal(records.length,16);assert.ok(records.every(x=>x.pass));
console.log('16 actual model outputs: no-evidence adapter gate blocked, zero candidates');
