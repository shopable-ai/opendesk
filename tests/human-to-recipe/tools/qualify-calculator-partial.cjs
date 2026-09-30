#!/usr/bin/env node
'use strict';
// Human H7 gate. Executes the frozen candidate bytes, never a second business implementation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {spawn,spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../..');
const skill=path.join(repo,'workflows/human-to-recipe/skills/human-to-recipe');
const {validateSemanticBuildPlan}=require(path.join(skill,'scripts/validate-semantic-build-plan.js'));
const {scoreSemanticBuildPlan}=require(path.join(skill,'scripts/score-semantic-build-plan.js'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const digest=file=>sha(fs.readFileSync(file));
function freeze(planFile){
  planFile=path.resolve(planFile);assert.ok(planFile.startsWith(repo+path.sep));
  const plan=JSON.parse(fs.readFileSync(planFile));
  const validity=validateSemanticBuildPlan(plan,{cwd:repo,checkSource:true});
  assert.ok(validity.valid&&validity.productionReady,JSON.stringify(validity));
  const score=scoreSemanticBuildPlan(plan,{cwd:repo});assert.equal(score.pass,true,'Human hard gates and all critical minima must pass');
  assert.equal(plan.verification.generated,'present');
  const source=path.resolve(repo,plan.outputs.productionRecipe.path);
  assert.ok(source.startsWith(repo+path.sep));assert.equal(digest(source),plan.outputs.productionRecipe.sha256);
  const dependencies=[planFile,source,__filename,path.join(skill,'scripts/validate-semantic-build-plan.js'),
    path.join(skill,'scripts/inspect-partial-recording.js'),path.join(skill,'scripts/score-semantic-build-plan.js'),
    path.join(skill,'references/semantic-build-plan.schema.json'),path.join(skill,'references/semantic-build-plan-v2.schema.json'),
    path.join(skill,'references/semantic-quality-rubric.json'),path.resolve(repo,plan.source.actionsFile),
    ...plan.source.materials.map(m=>path.resolve(repo,m.artifact.path)),
    ...['desktop-ui','accessibility','window'].map(name=>path.join(repo,'docs/api',name+'.md'))];
  const raw=path.resolve(repo,plan.source.recordingDir,plan.source.rawReference.file);dependencies.push(raw);
  dependencies.push(path.resolve(repo,plan.source.recordingDir,'manifest.json'));
  const binary=fs.realpathSync(path.join(repo,'dist/opendesk'));
  dependencies.push(binary,path.join(repo,'tests/workflows/calculator/fresh-witness.js'));
  // This Runtime loads the repository polyfills (also visible in its stack provenance).
  // Freeze every loaded JS initializer, since any one can change the globals consumed by the candidate.
  const polyfills=path.join(repo,'polyfills');
  dependencies.push(...fs.readdirSync(polyfills).filter(name=>name.endsWith('.js')).map(name=>path.join(polyfills,name)));
  return {plan,planFile,source,binary,dependencies:[...new Set(dependencies)].map(file=>({path:file,sha256:digest(file)})),
    score:{total:score.totalScore,dimensions:score.dimensions.map(d=>({id:d.id,score:d.score,minimum:d.minimumPoints,passed:d.passed}))}};
}
function recheck(frozen){for(const dependency of frozen.dependencies)assert.equal(digest(dependency.path),dependency.sha256,'Frozen dependency changed: '+dependency.path);}

async function exercise(code,{first='0040',final='777',fault=null,operationRules=null}={}){
  if(operationRules){
    assert.deepEqual(operationRules.operations.map(op=>op.id),['operation.input','operation.read','operation.clear']);
    assert.ok(typeof operationRules.applicationIdentity?.title==='string'&&operationRules.applicationIdentity.title);
    assert.ok(Number.isInteger(operationRules.environmentScope?.windowWidth)&&operationRules.environmentScope.windowWidth>0);
    assert.ok(Number.isInteger(operationRules.environmentScope?.windowHeight)&&operationRules.environmentScope.windowHeight>0);
    assert.ok(typeof operationRules.environmentScope?.nativeDisplayName==='string'&&operationRules.environmentScope.nativeDisplayName);
  }
  const win={id:'synthetic-calculator',pid:1,handle:1,title:operationRules?.applicationIdentity.title||'Calculator',
    width:operationRules?.environmentScope.windowWidth||232,height:operationRules?.environmentScope.windowHeight||321,x:0,y:0,isForeground:true,hasFocus:true};
  const actions=[],reads=[],logs=[],events=[];let phase='initial',display='987',clear='清除',inputCount=0,faulted=false;
  const scope=o=>assert.equal(o.within.id,win.id);
  const window={get:async q=>{assert.equal(q.app.bundleId,'com.apple.calculator');return {...win};},
    activate:async w=>{assert.equal(w.id,win.id);return {...win};},
    current:async()=>({...win,hasFocus:!(fault==='stale'&&inputCount>0)})};
  const Accessibility={snapshot:async o=>{scope(o);const children=[...'0123456789','×','+','=',clear].map(name=>({role:'button',name,enabled:true,actions:['invoke'],children:[]}));
    if(fault==='ambiguous')children.push({...children[0]});
    children.push({role:'staticText',name:operationRules?.environmentScope.nativeDisplayName||'主显示器',value:fault==='mismatch'&&phase==='first'?'wrong':display,children:[]});
    return {complete:true,truncated:false,root:{children}};}};
  const UI={readText:async o=>{scope(o);if(fault==='read'&&phase==='first'){faulted=true;throw new Error('CONTROLLED_READ_FAILURE');}
      reads.push({phase,value:display});events.push({kind:'read',phase,value:display});return display;},
    tapTargets:async(targets,o)=>{scope(o);assert.equal(faulted,false,'No input after uncertain side effects/read failure');
      const names=Array.from(targets,t=>{assert.equal(t.role,'button');return t.name;});actions.push(names);events.push({kind:'input',names});
      if(names.length===1&&['清除','全部清除'].includes(names[0])){display='0';clear='全部清除';phase='clear';}
      else {inputCount++;if(fault==='unknown'&&inputCount===1){faulted=true;throw Object.assign(new Error('CONTROLLED_INPUT_UNKNOWN'),{actionState:'unknown'});}
        phase=inputCount===1?'first':'final';display=inputCount===1?first:final;clear='清除';}
      return {ok:true,action:'tapTargets',completed:names.map(name=>({backend:'macos-ax',requestId:'controlled-'+actions.length,
        actionState:'acknowledged',target:{source:'accessibility',locator:{role:'button',name}}}))};}};
  let error;
  try {await new vm.Script('(async()=>{\n'+code+'\n})()',{filename:'exact-frozen-candidate.js'})
    .runInNewContext({window,Accessibility,UI,console:{log:v=>logs.push(v)}},{timeout:1000});}catch(e){error={message:e.message,actionState:e.actionState};}
  return {actions,reads,events,logs,error};
}
function assess(run,scenario){
  if(scenario.fault){assert.ok(run.error,'Fault must stop the candidate');assert.ok(run.actions.length<7,'Candidate continued after fault');
    assert.ok(!run.reads.some(r=>r.phase==='final'),'No terminal read after failure');return;}
  assert.equal(run.error,undefined,run.error?.message);
  const expressions=run.actions.filter(names=>names.length>1);
  assert.deepEqual(expressions[0],['2','5','×','4','+','1','0','=']);
  assert.deepEqual(expressions[1],['6','×',...scenario.first,'='],'Consumer must use every actual producer character');
  assert.equal(expressions.length,2);
  const firstRead=run.events.findIndex(e=>e.kind==='read'&&e.phase==='first');
  const lastInput=run.events.findLastIndex(e=>e.kind==='input');
  assert.ok(firstRead>=0&&run.events.slice(firstRead+1,lastInput).some(e=>e.kind==='input'&&e.names.length===1));
  assert.ok(run.reads.some(r=>r.phase==='final'&&r.value===scenario.final));
  assert.ok(run.logs.some(log=>String(log).includes(scenario.final)),'Output must contain the actual terminal read');
}
async function controlled(frozen){
  const code=fs.readFileSync(frozen.source,'utf8'),scenarios=[];
  for(const input of [{first:'0040',final:'777'},{first:'9900',final:'888'},{first:'7',final:'555'},
    ...['read','unknown','stale','ambiguous','mismatch'].map(fault=>({first:'0040',final:'777',fault}))]){
    const actual=await exercise(code,input);let verdict='pass',reason=null;try{assess(actual,input);}catch(e){verdict='fail';reason=e.message;}
    scenarios.push({input,verdict,reason,actual});
  }
  recheck(frozen);return {verdict:scenarios.every(s=>s.verdict==='pass')?'pass':'fail',evidenceLayer:'controlled',live:false,scenarios};
}
function run(binary,args,logFile){return new Promise(resolve=>{
  const child=spawn(binary,args,{cwd:repo,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
  const timer=setTimeout(()=>child.kill('SIGTERM'),60000);
  child.on('error',error=>{clearTimeout(timer);resolve({status:null,error:error.message,stdout,stderr});});
  child.on('close',status=>{clearTimeout(timer);fs.writeFileSync(logFile,stdout+stderr,{flag:'wx'});resolve({status,stdout,stderr,logFile});});
});}
function objects(output){return output.split('\n').flatMap(line=>{const i=line.indexOf('{');if(i<0)return[];try{return[JSON.parse(line.slice(i))];}catch(_){return[];}});}
function assessLive(candidate,witness){
  const result=objects(candidate.stdout).findLast(o=>o.firstResult&&o.finalResult&&o.secondInput);
  assert.ok(result,'Candidate must emit actual reads and input receipts');
  assert.equal(result.firstResult,'110');assert.equal(result.finalResult,'660');
  const names=result.secondInput.completed.map(item=>{assert.equal(item.actionState,'acknowledged');assert.equal(item.backend,'macos-ax');
    assert.ok(item.requestId);assert.equal(item.target.source,'accessibility');return item.target.locator.name;});
  assert.deepEqual(names,['6','×',...result.firstResult,'=']);
  const complete=objects(witness.stdout).findLast(o=>o.kind==='witness-complete');
  assert.ok(complete&&complete.initialClearObserved,'Independent witness must complete its full run');
  const actual=objects(witness.stdout).filter(o=>o.kind==='display-change').map(o=>o.row);
  assert.ok(actual.length,'Independent execution must observe display transitions');
  // Witness values are acquired without Expected and are correlated only by this evaluator.
  const values=actual.map(o=>o.value);
  const first=values.indexOf(result.firstResult),clear=values.indexOf('0',first+1),final=values.indexOf(result.finalResult,clear+1);
  assert.ok(values.indexOf('0')>=0&&first>values.indexOf('0')&&clear>first&&final>clear,
    'Independent observer must see this run zero → first display → clear → final display');
  return {firstResult:result.firstResult,finalResult:result.finalResult,consumer:names,observations:actual};
}
async function live(frozen,out){
  const runs=[];
  for(let index=1;index<=2;index++){
    recheck(frozen);
    const prefix=path.join(out,'fresh-'+index),witnessPath=prefix+'-witness.log';
    const witnessPromise=run(frozen.binary,['-script','tests/workflows/calculator/fresh-witness.js','-console-mode','script','-log-dir',prefix+'-witness'],witnessPath);
    // Read-only witness readiness is checked from its separate Execution log, without desktop input.
    const readiness=path.join(prefix+'-witness','stdout.log');const deadline=Date.now()+7000;
    while(Date.now()<deadline){if(fs.existsSync(readiness)&&fs.readFileSync(readiness,'utf8').includes('FRESH_WITNESS_READY'))break;
      await new Promise(resolve=>setTimeout(resolve,100));}
    if(!fs.existsSync(readiness)||!fs.readFileSync(readiness,'utf8').includes('FRESH_WITNESS_READY')){
      const witness=await witnessPromise;runs.push({index,verdict:'blocked',reason:'Independent witness did not become ready',witness});break;}
    const command=['-script',path.relative(repo,frozen.source),'-console-mode','script'];
    const candidate=await run(path.join(repo,'dist/opendesk'),command,prefix+'-candidate.log');
    const witness=await witnessPromise;recheck(frozen);
    let verdict='pass',actual,reason;
    try{assert.equal(candidate.status,0);assert.equal(witness.status,0);actual=assessLive(candidate,witness);}catch(error){verdict='fail';reason=error.message;}
    runs.push({index,verdict,reason,actual,command:'./dist/opendesk '+command.join(' '),candidateLog:candidate.logFile,witnessLog:witness.logFile});
    if(verdict!=='pass')break; // Unknown side effects are never retried automatically.
  }
  return {verdict:runs.length===2&&runs.every(r=>r.verdict==='pass')?'pass':'fail',evidenceLayer:'live',runs,
    scope:'Fixed task; macOS Calculator Basic 232×321; two independent Candidate starts and separate read-only witness Executions; no parameter/platform/human-executor claim'};
}
async function main(args){
  const [mode,planFile,...rest]=args;assert.ok(['--check','--controlled','--live'].includes(mode)&&planFile,
    'Usage: node qualify-calculator-partial.cjs --check|--controlled|--live <plan.json> [--reviewed-source-sha256 <sha256>]');
  const frozen=freeze(planFile),hash=digest(frozen.source);
  const review=rest.indexOf('--reviewed-source-sha256');
  if(mode!=='--check')assert.equal(review<0?null:rest[review+1],hash,'Operator review of the exact candidate bytes is required');
  const out=fs.mkdtempSync(path.join(repo,'.runtime/tests/human-to-recipe/partial-authoring/qualification-'));
  const report={formatVersion:'human-to-recipe.calculator-qualification/v1',mode,time:new Date().toISOString(),
    subject:{source:frozen.source,sha256:hash,plan:frozen.planFile},dependencies:frozen.dependencies,score:frozen.score,
    fixtureSource:frozen.plan.environment.otherConstraints.some(s=>/fixture/i.test(s)),qualificationTransferred:false};
  fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  Object.assign(report,mode==='--check'?{verdict:'pass',live:false,scope:'Freeze/structure only; no execution or business qualification'}
    :mode==='--controlled'?await controlled(frozen):await live(frozen,out));
  recheck(frozen);const output=path.join(out,'report.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({verdict:report.verdict,mode,report:output,score:report.score,live:report.evidenceLayer==='live'}));
  if(report.verdict!=='pass')process.exitCode=1;
}
module.exports={freeze,recheck,exercise,assess,controlled,assessLive};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
