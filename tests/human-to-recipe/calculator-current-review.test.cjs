'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {exercise,assess,assessLive,objects,findCandidateArtifacts,handoffDeadline}=require('./tools/qualify-calculator-partial.cjs');
const repo=path.resolve(__dirname,'../..');
const source=path.join(repo,'examples/human-to-recipe/calculator-current.recipe.js');
const code=fs.readFileSync(source,'utf8');
test('ordinary result is simple while acknowledged debug receipts remain independently consumable',async()=>{
  const actual=await exercise(code,{first:'110',final:'660'});assess(actual,{first:'110',final:'660'});
  const output=objects(actual.logs.join('\n'));const result=output.findLast(item=>item.firstResult&&item.finalResult);
  assert.deepEqual(Object.keys(result).sort(),['finalResult','firstResult']);
  const candidate={stdout:JSON.stringify(result),artifactStdout:actual.logs.join('\n')};
  const witness={stdout:[{kind:'witness-complete',initialClearObserved:true,stableTerminalObserved:true,
    stableTerminalMs:4000,completion:{status:0},lastObservedValue:'660'},
    ...['0','110','0','660'].map(value=>({kind:'display-change',row:{value}}))].map(o=>JSON.stringify(o)).join('\n')};
  assert.doesNotThrow(()=>assessLive(candidate,witness));
  const traces=output.filter(item=>item.kind==='calculator-input');
  const altered=JSON.parse(JSON.stringify(output));const expressions=altered.filter(item=>item.kind==='calculator-input'&&item.completed.length>1);
  expressions[1].completed[3].target.locator.name='9';
  assert.throws(()=>assessLive({stdout:candidate.stdout,artifactStdout:altered.map(o=>JSON.stringify(o)).join('\n')},witness));
  assert.ok(traces.length>2);assert.throws(()=>assessLive({stdout:candidate.stdout,artifactStdout:candidate.stdout},witness),/input receipts/);
});
test('integer initial eligibility is distinct from the produced-result format and unsupported starts submit no reset',async()=>{
  const signed=await exercise(code,{initial:'-2',first:'0040',final:'777'});assess(signed,{first:'0040',final:'777'});
  for(const initial of ['0.5','-2.5']){
    const actual=await exercise(code,{initial});assert.equal(actual.actions.length,0);assert.match(actual.error.message,/Initial display/);
  }
});
test('a normal CLI run is correlated only to one new exact-source artifact, never historical or ambiguous matches',()=>{
  const root=path.join(repo,'.runtime/tests/human-to-recipe/artifact-discovery');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'case-')),hash=crypto.createHash('sha256').update(code).digest('hex');
  const summary={source:'file:'+path.relative(repo,source),script_hash:hash};
  const make=(name,data)=>{const target=path.join(dir,name);fs.mkdirSync(target);fs.writeFileSync(path.join(target,'summary.json'),JSON.stringify(data));};
  make('old',summary);const previous=new Set(['old']);
  make('unrelated',{source:'file:other.js',script_hash:hash});make('changed',{...summary,script_hash:'different'});
  assert.throws(()=>findCandidateArtifacts(previous,source,dir),/one fresh/);
  make('fresh',summary);assert.equal(findCandidateArtifacts(previous,source,dir),path.join(dir,'fresh'));
  make('concurrent',summary);assert.throws(()=>findCandidateArtifacts(previous,source,dir),/one fresh/);
});
test('expired or ungranted coordination is rejected before any desktop job is dispatched',()=>{
  const root=path.join(repo,'.runtime/tests/human-to-recipe/desktop-budget');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'case-')),file=path.join(dir,'handoff.json'),now=1000000;
  const record={granted:true,recordedAt:new Date(now-1000).toISOString(),maximumWindowMs:90000,
    ownNativeInputsInflight:0,ownAxObserversInflight:0};
  fs.writeFileSync(file,JSON.stringify(record));assert.equal(handoffDeadline(file,now),now+89000);
  fs.writeFileSync(file,JSON.stringify({...record,recordedAt:new Date(now-90001).toISOString()}));
  assert.throws(()=>handoffDeadline(file,now),/expired/);
  fs.writeFileSync(file,JSON.stringify({...record,granted:false}));assert.throws(()=>handoffDeadline(file,now),/granted/);
  fs.writeFileSync(file,JSON.stringify({...record,ownNativeInputsInflight:1}));assert.throws(()=>handoffDeadline(file,now));
});
test('a failed window guard identifies the changed fields while preserving the stop boundary',async()=>{
  const actual=await exercise(code,{fault:'stale'});
  assert.match(actual.error.message,/changed: hasFocus/);
  const diagnostic=objects(actual.logs.join('\n')).find(o=>o.kind==='calculator-window-guard');
  assert.deepEqual(diagnostic.changed,['hasFocus']);assert.equal(diagnostic.expected.hasFocus,true);
  assert.equal(diagnostic.actual.hasFocus,false);assert.equal(actual.actions.filter(names=>names.length>1).length,1);
});
