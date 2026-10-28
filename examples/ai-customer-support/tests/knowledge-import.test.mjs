import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root=resolve(import.meta.dirname,'..');
const bundle=await build({entryPoints:[resolve(root,'src/domain/knowledge.ts')],bundle:true,
  write:false,platform:'node',format:'esm',target:'node22',logLevel:'silent'});
const {parseKnowledgeFile,matchKnowledge}=await import('data:text/javascript;base64,'+
  Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const parse=entry=>parseKnowledgeFile(JSON.stringify([entry]),'knowledge.json',7,7);

test('malformed knowledge field types are rejected without coercing business meaning',()=>{
  const valid={question:'测试问题',answer:'测试答案'};
  for(const invalid of [null,[],true,'text',
    {...valid,question:{x:1}},{...valid,answer:['a','b']},
    {...valid,enabled:'false'},{...valid,scope:123},
    {...valid,aliases:'别名'},{...valid,aliases:['别名',1]},
    {...valid,keywords:[{}]},{...valid,category:{name:'分类'}},
    {title:123,content:'答案'},{title:'标题',reply:false}]) {
    assert.throws(()=>parse(invalid),'reject '+JSON.stringify(invalid));
  }
});

test('JSON fixture preserves status, scope, source and default human-only eligibility',async()=>{
  const raw=await readFile(resolve(root,'fixtures/knowledge-demo.json'),'utf8');
  const entries=parseKnowledgeFile(raw,'knowledge-demo.json',7,7);
  assert.equal(entries.length,8);
  assert.ok(entries.every(k=>k.source==='knowledge-demo.json'&&!k.eligible));
  assert.equal(entries.at(-1).enabled,false);
  assert.equal(entries.at(-2).scope,'A 方案');
  const [disabled]=parse({question:'停用规则',answer:'不可推荐',enabled:false});
  assert.equal(matchKnowledge('停用规则',[disabled],true),null);
  const [scoped]=parse({question:'限定规则',answer:'不可通用',scope:' 特定方案 '});
  assert.equal(scoped.scope,'特定方案');
  assert.equal(matchKnowledge('限定规则',[scoped],true),null);
  assert.equal(parse({title:'兼容标题',content:'兼容正文'})[0].a,'兼容正文');
});

test('Markdown sections import as plain data and invalid or excessive input is rejected',()=>{
  const entries=parseKnowledgeFile('# 演示知识\n\n## 洗涤建议\n请手洗。\n\n## 联系方式\n请联系人工。','demo.md',7,7);
  assert.equal(entries.length,2);
  assert.equal(entries[0].question,'洗涤建议');
  assert.equal(entries[0].a,'请手洗。');
  assert.ok(entries.every(k=>!k.eligible&&k.source==='demo.md'));
  assert.throws(()=>parseKnowledgeFile('## 缺少答案','empty.md',7,7));
  assert.throws(()=>parseKnowledgeFile('{"entries":[','bad.json',7,7));
  assert.throws(()=>parseKnowledgeFile('hello','unsupported.txt',7,7));
  assert.throws(()=>parseKnowledgeFile('x'.repeat(262145),'large.json',7,7));
  assert.throws(()=>parseKnowledgeFile(JSON.stringify(Array.from({length:101},()=>({question:'q',answer:'a'}))),'many.json',0,0));
});
