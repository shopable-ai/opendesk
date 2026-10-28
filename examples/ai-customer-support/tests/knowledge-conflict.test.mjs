import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..');
async function load(file){
  const result=await build({entryPoints:[join(root,file)],bundle:true,write:false,platform:'node',
    format:'esm',target:'node22',minify:false,logLevel:'silent'});
  const js=result.outputFiles.find(f=>f.path.endsWith('.js'))?.text ?? result.outputFiles[0]?.text;
  assert.ok(js,'esbuild must return JS for '+file);
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const knowledge=await load('src/domain/knowledge.ts');
const state=await load('src/state.tsx');
const preset=knowledge.initialKnowledge()[0];
function imported(overrides={}){
  return knowledge.parseKnowledgeFile(JSON.stringify([{
    question:preset.question,answer:'演示规则：退款期限为签收后 3 天。',...overrides
  }]),'conflict.json',7,7)[0];
}

test('different answers tied at highest confidence return null regardless of insertion order',()=>{
  const conflict=imported();
  assert.equal(preset.eligible,true);
  assert.equal(conflict.eligible,false);
  for(const kb of [[preset,conflict],[conflict,preset]]){
    assert.equal(knowledge.matchKnowledge(preset.question,kb,true),null);
  }
  assert.deepEqual(knowledge.replyOptions(knowledge.matchKnowledge(preset.question,[preset,conflict],true))
    .map(option=>option.id),['clarify','human']);
});

test('conflicting alias matches and tied keyword matches also return null',()=>{
  const alias=imported({question:'另一种退款问法',aliases:[preset.aliases[0]],keywords:['退款']});
  assert.equal(knowledge.matchKnowledge(preset.aliases[0],[preset,alias],true),null);
  const keyword=imported({question:'另一种退款问法',keywords:['退款']});
  assert.equal(knowledge.matchKnowledge('退款相关问题',[
    {...preset,keys:['退款']},keyword
  ],true),null);
});

test('duplicate identical answers retain the existing match and auto eligibility',()=>{
  const duplicate=imported({answer:preset.a});
  const hit=knowledge.matchKnowledge(preset.question,[preset,duplicate],true);
  assert.equal(hit?.k.id,preset.id);
  assert.equal(hit?.k.eligible,true);
  assert.equal(hit?.exact,true);
  assert.equal(hit?.score,100);
});

test('disabled, scoped and lower-confidence answers do not create a conflict',()=>{
  for(const excluded of [imported({enabled:false}),imported({scope:'A 方案'}),
    imported({question:'退款相关问题',keywords:['退款']})]){
    assert.equal(knowledge.matchKnowledge(preset.question,[preset,excluded],true)?.k.id,preset.id);
  }
});

function withImport(entry){
  const s=state.createInitialState();
  return state.reducer(s,{type:'IMPORT_KNOWLEDGE',entries:[entry],epoch:s.knowledgeImportEpoch});
}
function assertUnsent(s){
  assert.deepEqual(state.currentThread(s).sent,[]);
  assert.equal(state.currentThread(s).messages.filter(m=>m.who==='agent').length,0);
  assert.equal(state.currentThread(s).draft,'');
}

test('AUTO_REQUEST and AUTO_CONFIRM never send; RECEIVE with a conflict hands off to human',()=>{
  let s=withImport(imported());
  s=state.reducer(s,{type:'AUTO_REQUEST'});
  assert.equal(s.consentPending,true);
  assertUnsent(s);
  s=state.reducer(s,{type:'AUTO_CONFIRM'});
  assert.equal(s.auto,true);
  assert.equal(s.consented,true);
  assertUnsent(s);
  s=state.reducer(s,{type:'RECEIVE',id:'t1',text:preset.question});
  assertUnsent(s);
  assert.ok(s.takeovers.includes('t1'));
  assert.match(s.receipt,/转人工/);
  assert.equal(state.activeHit(s),null);
  assert.deepEqual(state.activeOptions(s).map(option=>option.id),['clarify','human']);
  // Re-enabling with existing consent must not bypass the conflict or replay a send.
  s=state.reducer(s,{type:'AUTO_DISABLE'});
  s=state.reducer(s,{type:'TAKEOVER'});
  s=state.reducer(s,{type:'AUTO_REQUEST'});
  assert.equal(s.auto,true);
  assertUnsent(s);
  s=state.reducer(s,{type:'RECEIVE',id:'t1',text:preset.question});
  assertUnsent(s);
  assert.ok(s.takeovers.includes('t1'));
});

test('identical answers and excluded conflicts preserve normal simulated auto replies',()=>{
  for(const entry of [imported({answer:preset.a}),imported({enabled:false}),imported({scope:'A 方案'})]){
    let s=withImport(entry);
    s=state.reducer(s,{type:'AUTO_REQUEST'});
    s=state.reducer(s,{type:'AUTO_CONFIRM'});
    s=state.reducer(s,{type:'RECEIVE',id:'t1',text:preset.question});
    const thread=state.currentThread(s);
    assert.equal(thread.sent.length,1);
    assert.deepEqual(thread.messages.filter(m=>m.who==='agent').map(m=>m.text),['您好，'+preset.a]);
    assert.equal(s.takeovers.includes('t1'),false);
  }
});
