'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture,repo,sha,write}=require('./tools/calculator-partial-fixture.cjs');
const {freeze,recheck,controlled,exercise,assess,assessLive,assessRuntimeLoads,objects}=require('./tools/qualify-calculator-partial.cjs');
const {scoreSemanticBuildPlan}=require('../../workflows/human-to-recipe/skills/human-to-recipe/scripts/score-semantic-build-plan.js');
const base=path.join(repo,'.runtime/tests/human-to-recipe/partial-candidate-unit');fs.mkdirSync(base,{recursive:true});
function candidateFixture(){
  const f=makeFixture(fs.mkdtempSync(path.join(base,'case-')));f.plan.completion.gaps[0].status='resolved';
  assert.equal(scoreSemanticBuildPlan(f.plan,{cwd:repo}).pass,true,'The plan gate precedes generation');
  // Reuse this explicitly declared existing asset; never import its historical Qualification.
  const asset=fs.readFileSync(path.join(repo,'examples/agent-to-recipe/calculator-current.js'));
  const source=path.join(repo,f.plan.outputs.productionRecipe.path);fs.writeFileSync(source,asset,{flag:'wx'});
  f.plan.outputs.productionRecipe.sha256=sha(asset);f.plan.qualification.gate.productionSource.sha256=sha(asset);
  f.plan.verification.generated='present';const planFile=path.join(f.dir,'complete-plan.json');write(planFile,f.plan);
  return {...f,source,code:asset.toString(),planFile};
}
test('exact candidate runs against changed read values and all dependent faults stop',async()=>{
  const f=candidateFixture(),report=await controlled(freeze(f.planFile));
  assert.equal(report.verdict,'pass',JSON.stringify(report.scenarios.map(s=>({input:s.input,verdict:s.verdict,reason:s.reason}))));
  assert.equal(report.live,false);assert.equal(report.scenarios.length,8);
});
test('hardcoded/history first values and equal final answers fail observed consumer dataflow',async()=>{
  const f=candidateFixture();
  for(const replacement of ["const firstResult = '110';","const firstResult = 'history-110';"]){
    const bad=f.code.replace('const firstResult = await readCalculatorResult(win);',replacement);
    const run=await exercise(bad,{first:'0040',final:'660'});
    assert.throws(()=>assess(run,{first:'0040',final:'660'}));
  }
});
test('source, task, rules and evaluator changes invalidate the exact frozen qualification',()=>{
  const f=candidateFixture(),bound=freeze(f.planFile);fs.appendFileSync(f.source,'\n// source changed\n');assert.throws(()=>recheck(bound),/dependency changed/);
  const g=candidateFixture(),rules=freeze(g.planFile);fs.appendFileSync(g.rulesPath,'rule changed');assert.throws(()=>recheck(rules),/dependency changed/);
  assert.ok(bound.dependencies.some(d=>d.path.endsWith('qualify-calculator-partial.cjs')));
  assert.ok(bound.dependencies.some(d=>d.path.endsWith('task.json')));
});
test('live evaluator cannot stitch equal values from a witness that did not see this run clear sequence',()=>{
  const receipt=['6','×','1','1','0','='].map(name=>({actionState:'acknowledged',backend:'macos-ax',requestId:'r',target:{source:'accessibility',locator:{name}}}));
  const candidate={stdout:JSON.stringify({firstResult:'110',finalResult:'660',secondInput:{completed:receipt}})};
  const witness={stdout:[{kind:'witness-complete',initialClearObserved:true,stableTerminalObserved:true,
    stableTerminalMs:4000,completion:{status:0},lastObservedValue:'660'},...['110','660'].map(value=>({kind:'display-change',row:{value}}))].map(v=>JSON.stringify(v)).join('\n')};
  assert.throws(()=>assessLive(candidate,witness),/this run/);
});
module.exports={candidateFixture};
test('Runtime initializer bytes, inventory and actual loading roots are bound',()=>{
  const frozen=freeze(candidateFixture().planFile);
  for(const name of ['polyfills','jslibs']){
    const directory=frozen.initializerDirectories.find(item=>item.name===name);assert.ok(directory.files.length);
    for(const file of directory.files)assert.ok(frozen.dependencies.some(d=>d.path===path.join(directory.path,file)));
  }
  const stdout=frozen.initializerDirectories.map(d=>'Using '+d.name+' from: '+d.path).join('\n');
  assert.doesNotThrow(()=>assessRuntimeLoads({stdout,stderr:''},frozen));
  assert.throws(()=>assessRuntimeLoads({stdout:stdout.replace(path.join(repo,'jslibs'),'/other/jslibs'),stderr:''},frozen),/root must match/);
  assert.throws(()=>assessRuntimeLoads({stdout:'',stderr:''},frozen),/root must match/);
  frozen.initializerDirectories[0].files.push('unfrozen-new-initializer.js');
  assert.throws(()=>recheck(frozen),/inventory changed/);
});
test('Runtime log metadata does not mask readiness or replace observed result payload',()=>{
  const payload={kind:'witness-ready',completionFile:'/test/{escaped-"quote"}/candidate-complete.json'};
  for(const suffix of ['', ' {"consoleMethod":"log","location":"console.go:84"}']){
    assert.deepEqual(objects('[SCRIPT] [LOG] '+JSON.stringify(payload)+suffix),[payload]);
  }
  assert.deepEqual(objects('{"kind":"witness-ready","completionFile":"unfinished'),[]);
  assert.deepEqual(objects('{invalid} {"kind":"witness-ready"}'),[]);
});
