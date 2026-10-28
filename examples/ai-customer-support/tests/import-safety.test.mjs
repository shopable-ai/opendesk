import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
async function load(file) {
  const result = await build({entryPoints:[join(root,file)],bundle:true,write:false,
    platform:'node',format:'esm',target:'node22',logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {createInitialState,reducer} = await load('src/state.tsx');
const {parseKnowledgeFile} = await load('src/domain/knowledge.ts');
const {parseHistoryFile} = await load('src/domain/history.ts');
const knowledgeFile = count => JSON.stringify({entries:Array.from({length:count},(_,i)=>
  ({question:'导入问题 '+i,answer:'导入答案 '+i}))});
const history = parseHistoryFile(JSON.stringify({schemaVersion:1,
  format:'opendesk.ai-customer-support.customer-history-demo',demo:true,
  customers:[{customerId:'t1',sessions:[{sessionId:'delayed',messages:[
    {messageId:'delayed-1',role:'customer',text:'我更喜欢黑色。'}]}]}]}));
const epoch = (state,kind) => state[kind+'ImportEpoch'] ?? 0;

test('concurrent knowledge reads receive unique IDs at commit time',()=>{
  let state=createInitialState();
  const token=epoch(state,'knowledge');
  // Both File.text() operations started from the same seven-entry render.
  const first=parseKnowledgeFile(knowledgeFile(2),'first.json',7,7);
  const second=parseKnowledgeFile(knowledgeFile(2),'second.json',7,7);
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries:first,epoch:token});
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries:second,epoch:token});
  assert.equal(state.knowledge.length,11);
  assert.equal(new Set(state.knowledge.map(k=>k.id)).size,11);
});

test('concurrent knowledge reads cannot exceed the shared 150-entry limit',()=>{
  let state=createInitialState();
  const token=epoch(state,'knowledge');
  const first=parseKnowledgeFile(knowledgeFile(100),'first.json',7,7);
  const second=parseKnowledgeFile(knowledgeFile(100),'second.json',7,7);
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries:first,epoch:token});
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries:second,epoch:token});
  assert.equal(state.knowledge.length,107,'reject the entire second file');
  assert.match(state.toast.message,/150/);
});

test('knowledge read started before reset cannot restore discarded data',()=>{
  let state=createInitialState();
  const token=epoch(state,'knowledge');
  const entries=parseKnowledgeFile(knowledgeFile(1),'delayed.json',7,7);
  state=reducer(state,{type:'RESET'});
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries,epoch:token});
  assert.equal(state.knowledge.length,7);
  assert.match(state.toast.message,/取消/);
});

test('history read started before reset cannot restore discarded data',()=>{
  let state=createInitialState();
  const token=epoch(state,'history');
  state=reducer(state,{type:'RESET'});
  state=reducer(state,{type:'IMPORT_HISTORY',history,epoch:token});
  assert.equal(state.history.t1.length,1);
  assert.equal(state.history.t1[0].sessionId,'seed-t1');
  assert.match(state.toast.message,/取消/);
});

test('history read started before profile clear cannot repopulate that profile',()=>{
  let state=createInitialState();
  const token=epoch(state,'history');
  state=reducer(state,{type:'CLEAR_PROFILE',customerId:'t1'});
  state=reducer(state,{type:'IMPORT_HISTORY',history,epoch:token});
  assert.deepEqual(state.history.t1,[]);
  assert.equal(state.history.t2.length,1,'other customer data is preserved');
});

test('new imports still work after reset and follow file customer IDs across chat switches',()=>{
  let state=reducer(createInitialState(),{type:'RESET'});
  const entries=parseKnowledgeFile(knowledgeFile(1),'new.json',7,7);
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries,epoch:epoch(state,'knowledge')});
  const token=epoch(state,'history');
  state=reducer(state,{type:'SET_THREAD',id:'t2'});
  state=reducer(state,{type:'IMPORT_HISTORY',history,epoch:token});
  assert.equal(state.knowledge.length,8);
  assert.equal(state.history.t1.length,2);
  assert.equal(state.history.t2.length,1);
  assert.equal(state.threadId,'t2');
});

test('a late file error cannot replace the result of a new import after reset',()=>{
  let state=createInitialState();
  const staleKnowledge=epoch(state,'knowledge'),staleHistory=epoch(state,'history');
  state=reducer(state,{type:'RESET'});
  state=reducer(state,{type:'RESET'});
  const entries=parseKnowledgeFile(knowledgeFile(1),'new.json',7,7);
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries,epoch:epoch(state,'knowledge')});
  state=reducer(state,{type:'IMPORT_HISTORY',history,epoch:epoch(state,'history')});
  const accepted=state;
  state=reducer(state,{type:'IMPORT_ERROR',kind:'knowledge',message:'旧读取失败',epoch:staleKnowledge});
  state=reducer(state,{type:'IMPORT_ERROR',kind:'history',message:'旧读取失败',epoch:staleHistory});
  assert.equal(state,accepted);
  state=reducer(state,{type:'IMPORT_ERROR',kind:'history',message:'新文件格式错误',epoch:epoch(state,'history')});
  assert.match(state.historyImportStatus,/新文件格式错误/);
  assert.equal(state.history.t1.length,2,'a rejected file leaves accepted data intact');
});

test('clearing a profile permits a new history import without cancelling knowledge reads',()=>{
  let state=createInitialState();
  const knowledgeToken=epoch(state,'knowledge');
  state=reducer(state,{type:'CLEAR_PROFILE',customerId:'t1'});
  state=reducer(state,{type:'IMPORT_HISTORY',history,epoch:epoch(state,'history')});
  const entries=parseKnowledgeFile(knowledgeFile(1),'new.json',7,7);
  state=reducer(state,{type:'IMPORT_KNOWLEDGE',entries,epoch:knowledgeToken});
  assert.equal(state.history.t1.length,1);
  assert.equal(state.history.t1[0].sessionId,'delayed');
  assert.equal(state.knowledge.length,8);
});
