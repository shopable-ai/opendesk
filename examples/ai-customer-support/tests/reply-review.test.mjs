import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({entryPoints:[new URL('../src/domain/ai.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {reviewCandidate,buildReplyHandoff}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const evidence=(id,text)=>({id,sourceType:'knowledge_base',sourceRef:`ref-${id}`,answerHash:`hash-${id}`,
 ...(text===undefined?{}:{source:{text,title:`title-${id}`,document:`doc-${id}`,association:'service_declared'}})});
const result=()=>({type:'support.aiResult',requestId:'current-request',projectId:'current-project',
 binding:{generation:1,pid:1,windowId:2,customerId:'private-binding-customer',messageId:'private-binding-message'},
 knowledgeBackend:'query_api',modelProvider:'none',retrievalStatus:'supported',status:'ready',requiresHumanReview:true,errorCode:null,
 evidencePack:{projectId:'current-project',coverage:'full',items:[evidence('own','包含静态高清壁纸。'),evidence('other','其他会话秘密。保证永久免费。')]},
 candidates:[{id:'chosen',name:'当前候选',symbol:'',text:'旧的候选稿。',evidenceIds:['own']},
 {id:'other-candidate',name:'其他会话',symbol:'',text:'其他候选秘密',evidenceIds:['other']}]});

test('candidate review isolates cited evidence and rechecks the current edited text without mutation',()=>{
 const r=result(),before=structuredClone(r);
 const review=reviewCandidate('包含静态高清壁纸。保证永久免费。',r,'chosen');
 assert.deepEqual(review.items.map(e=>e.id),['own']);
 assert.deepEqual(review.claims.map(c=>c.evidenceIds),[['own'],[]]);
 assert.equal(review.unverifiedCount,1);
 assert.deepEqual(r,before);
 assert.equal(reviewCandidate('人工新增声明。',r,'chosen').unverifiedCount,1);
 const exact=reviewCandidate('包含静态高清壁纸。',r,'chosen');
 assert.equal(exact.unverifiedCount,0);
 assert.match(exact.warnings.join('\n'),/适用范围.*版本.*待.*核实/u);
 assert.match(exact.warnings.join('\n'),/不做语义蕴含/u);
 assert.doesNotMatch(JSON.stringify(exact),/confidence|已核实/u);
});

test('missing result, candidate, citations, ID and original text all fail closed with clear warnings',()=>{
 const cases=[
  [null,'chosen',/结果.*不可用/u],
  [result(),'missing',/候选.*不存在/u],
  [result(),'',/候选.*不存在/u],
 ];
 const empty=result();empty.candidates[0].evidenceIds=[];cases.push([empty,'chosen',/未引用.*证据/u]);
 const missing=result();missing.candidates[0].evidenceIds=['missing-id'];cases.push([missing,'chosen',/引用.*缺失.*missing-id/u]);
 const noSource=result();delete noSource.evidencePack.items[0].source;cases.push([noSource,'chosen',/原文不可用/u]);
 const blankSource=result();blankSource.evidencePack.items[0].source.text='  ';cases.push([blankSource,'chosen',/原文不可用/u]);
 for(const [r,id,warning] of cases){
  const review=reviewCandidate('包含静态高清壁纸。',r,id);
  assert.equal(review.unverifiedCount,1);
  assert.deepEqual(review.claims[0].evidenceIds,[]);
  assert.match(review.warnings.join('\n'),warning);
  assert.ok(review.items.every(e=>e.id==='own'));
 }
});

test('partial, conflict, unverified and unavailable retrieval and incomplete coverage remain warnings',()=>{
 for(const [status,word] of [['partial','部分'],['conflict','冲突'],['unverified','未核实'],['unavailable','不可用']]){
  const r=result();r.retrievalStatus=status;
  assert.match(reviewCandidate('包含静态高清壁纸。',r,'chosen').warnings.join('\n'),new RegExp(word,'u'));
 }
 for(const [coverage,word] of [['partial','部分'],['conflict','冲突'],['unknown','未知']]){
  const r=result();r.evidencePack.coverage=coverage;
  assert.match(reviewCandidate('包含静态高清壁纸。',r,'chosen').warnings.join('\n'),new RegExp(word,'u'));
 }
});

test('mixed missing and duplicate references preserve only available selected evidence',()=>{
 const r=result();r.candidates[0].evidenceIds=['missing-id','own','own'];
 const review=reviewCandidate('包含静态高清壁纸。保证永久免费。',r,'chosen');
 assert.deepEqual(review.items.map(e=>e.id),['own']);
 assert.deepEqual(review.claims.map(c=>c.evidenceIds),[['own'],[]]);
 assert.match(review.warnings.join('\n'),/引用.*缺失.*missing-id/u);
 const summary=buildReplyHandoff({customerName:'客户',question:'问题',text:'当前稿。',result:r,candidateId:'chosen'});
 assert.match(summary,/missing-id/u);
 assert.doesNotMatch(summary,/ref-other|hash-other/u);
});

test('candidate review retains unknown tail claims and rejects negative substrings',()=>{
 const r=result();r.evidencePack.items[0].source.text='不支持退款。';
 const review=reviewCandidate('不支持退款。'.repeat(30)+'支持退款。',r,'chosen');
 assert.equal(review.claims.length,31);
 assert.equal(review.unverifiedCount,1);
 assert.deepEqual(review.claims.at(-1),{text:'支持退款',evidenceIds:[]});
});

test('handoff is pure current-input text with only the selected candidate references and complete warnings',()=>{
 const r=result(),before=structuredClone(r);
 const input={customerName:'当前客户',question:'当前问题是什么？',text:'包含静态高清壁纸。'.repeat(30)+'人工编辑尾部声明。',result:r,candidateId:'chosen'};
 const summary=buildReplyHandoff(input);
 for(const text of ['人工交接摘要','待人工核实，未发送','当前客户',input.question,input.text,'current-project','current-request','ref-own','hash-own','未核实主张','人工编辑尾部声明','适用范围','版本'])assert.ok(summary.includes(text),text);
 assert.doesNotMatch(summary,/其他会话|其他候选|ref-other|hash-other|旧的候选稿|private-binding|confidence|已核实/u);
 for(const warning of reviewCandidate(input.text,r,'chosen').warnings)assert.ok(summary.includes(warning));
 assert.deepEqual(r,before);
 const missing=buildReplyHandoff({...input,candidateId:'missing'});
 assert.doesNotMatch(missing,/ref-own|hash-own|ref-other|hash-other/u);
 assert.match(missing,/候选.*不存在/u);
 const noResult=buildReplyHandoff({...input,result:null});
 assert.match(noResult,/结果.*不可用/u);
 assert.ok(noResult.includes(input.text));
});
