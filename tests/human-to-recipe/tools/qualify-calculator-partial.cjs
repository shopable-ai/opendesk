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
    ...['desktop-ui','accessibility','window','file','execution','page','global-apis','environment'].map(name=>path.join(repo,'docs/api',name+'.md'))];
  const raw=path.resolve(repo,plan.source.recordingDir,plan.source.rawReference.file);dependencies.push(raw);
  dependencies.push(path.resolve(repo,plan.source.recordingDir,'manifest.json'));
  const binary=fs.realpathSync(path.join(repo,'dist/opendesk'));
  dependencies.push(binary,path.join(repo,'tests/human-to-recipe/calculator-partial-witness.js'));
  // The documented dist entrypoint loads these repository roots; live logs must confirm them.
  // Both initializer groups can change globals, including JSON and array/string prototypes.
  const initializerDirectories=['polyfills','jslibs'].map(name=>{
    const directory=path.join(repo,name),files=fs.readdirSync(directory,{withFileTypes:true})
      .filter(entry=>!entry.isDirectory()&&entry.name.endsWith('.js')).map(entry=>entry.name).sort();
    dependencies.push(...files.map(file=>path.join(directory,file)));return {name,path:directory,files};
  });
  return {plan,planFile,source,binary,initializerDirectories,
    dependencies:[...new Set(dependencies)].map(file=>({path:file,sha256:digest(file)})),
    score:{total:score.totalScore,dimensions:score.dimensions.map(d=>({id:d.id,score:d.score,minimum:d.minimumPoints,passed:d.passed}))}};
}
function recheck(frozen){
  assert.equal(fs.realpathSync(path.join(repo,'dist/opendesk')),frozen.binary,'Runtime entrypoint changed');
  for(const directory of frozen.initializerDirectories){
    const files=fs.readdirSync(directory.path,{withFileTypes:true})
      .filter(entry=>!entry.isDirectory()&&entry.name.endsWith('.js')).map(entry=>entry.name).sort();
    assert.deepEqual(files,directory.files,'Runtime initializer inventory changed: '+directory.path);
  }
  for(const dependency of frozen.dependencies)assert.equal(digest(dependency.path),dependency.sha256,'Frozen dependency changed: '+dependency.path);
}
function assessRuntimeLoads(result,frozen){
  const output=result.stdout+'\n'+result.stderr;
  for(const directory of frozen.initializerDirectories){
    const roots=[...output.matchAll(new RegExp('Using '+directory.name+' from: ([^\\r\\n]+)','g'))].map(match=>match[1].trim());
    assert.ok(roots.length>0&&roots.every(root=>root===directory.path),'Actual Runtime initializer root must match freeze: '+directory.name);
  }
}

async function exercise(code,{first='0040',final='777',initial='987',initialClear='清除',fault=null,diagnosticFailure=false,operationRules=null}={}){
  if(operationRules){
    assert.deepEqual(operationRules.operations.map(op=>op.id),['operation.input','operation.read','operation.clear']);
    assert.ok(typeof operationRules.applicationIdentity?.title==='string'&&operationRules.applicationIdentity.title);
    assert.ok(Number.isInteger(operationRules.environmentScope?.windowWidth)&&operationRules.environmentScope.windowWidth>0);
    assert.ok(Number.isInteger(operationRules.environmentScope?.windowHeight)&&operationRules.environmentScope.windowHeight>0);
    assert.ok(typeof operationRules.environmentScope?.nativeDisplayName==='string'&&operationRules.environmentScope.nativeDisplayName);
  }
  const win={id:'synthetic-calculator',pid:1,handle:1,title:operationRules?.applicationIdentity.title||'Calculator',
    width:operationRules?.environmentScope.windowWidth||232,height:operationRules?.environmentScope.windowHeight||321,x:0,y:0,isForeground:true,hasFocus:true};
  const actions=[],reads=[],logs=[],events=[];let phase='initial',display=initial,clear=initialClear,inputCount=0,faulted=false;
  const scope=o=>assert.equal(o.within.id,win.id);
  const window={get:async q=>{assert.equal(q.app.bundleId,'com.apple.calculator');return {...win};},
    activate:async w=>{assert.equal(w.id,win.id);return {...win};},
    current:async()=>({...win,hasFocus:!(fault==='initial-stale'||(fault==='stale'&&inputCount>0)),
      x:fault==='bounds'&&inputCount>0?1:win.x})};
  const Accessibility={snapshot:async o=>{scope(o);const children=[...'0123456789','×','+','=',clear].map(name=>({role:'button',name,enabled:true,actions:['invoke'],children:[]}));
    if(fault==='ambiguous')children.push({...children[0]});
    children.push({role:'staticText',name:operationRules?.environmentScope.nativeDisplayName||'主显示器',value:fault==='mismatch'&&phase==='first'?'wrong':display,children:[]});
    return {complete:fault!=='incomplete',truncated:fault==='incomplete',root:{children}};}};
  const UI={readText:async o=>{scope(o);if((fault==='read'&&phase==='first')||(fault==='initial-read'&&phase==='initial')){faulted=true;throw new Error('CONTROLLED_READ_FAILURE');}
      reads.push({phase,value:display});events.push({kind:'read',phase,value:display});return display;},
    tapTargets:async(targets,o)=>{scope(o);assert.equal(faulted,false,'No input after uncertain side effects/read failure');
      const names=Array.from(targets,t=>{assert.equal(t.role,'button');return t.name;});actions.push(names);events.push({kind:'input',names});
      if(names.length===1&&['清除','全部清除'].includes(names[0])){
        if(fault==='clear-unknown'){faulted=true;throw Object.assign(new Error('CONTROLLED_CLEAR_UNKNOWN'),{actionState:'unknown'});}
        display=fault==='clear-nonzero'?'9':'0';clear=fault==='clear-stuck'?'清除':'全部清除';phase='clear';}
      else {inputCount++;if(fault==='unknown'&&inputCount===1){faulted=true;throw Object.assign(new Error('CONTROLLED_INPUT_UNKNOWN'),{actionState:'unknown'});}
        phase=inputCount===1?'first':'final';display=inputCount===1?first:final;clear='清除';}
      const receipt={ok:true,action:'tapTargets',completed:names.map(name=>({backend:'macos-ax',requestId:'controlled-'+actions.length,
        actionState:'acknowledged',target:{source:'accessibility',locator:{role:'button',name}}}))};
      if(names.length>1&&inputCount===1){
        if(fault==='receipt-missing')receipt.completed.pop();
        if(fault==='receipt-locator')receipt.completed[0].target.locator.name='wrong';
        if(fault==='receipt-state')receipt.completed[0].actionState='unknown';
      }
      return receipt;}};
  let error;
  try {await new vm.Script('(async()=>{\n'+code+'\n})()',{filename:'exact-frozen-candidate.js'})
    .runInNewContext({window,Accessibility,UI,console:{log:v=>logs.push(v),debug:v=>{
      if(diagnosticFailure)throw new Error('CONTROLLED_DIAGNOSTIC_FAILURE');logs.push(v);}}},{timeout:1000});}catch(e){error={message:e.message,actionState:e.actionState};}
  return {actions,reads,events,logs,error};
}
function assess(run,scenario){
  if(scenario.unsupportedInitial){assert.ok(run.error,'Unsupported initial state must stop');
    assert.equal(run.actions.length,0,'No reset/input before initial eligibility is established');return;}
  if(scenario.invalidProducedValue){
    assert.ok(run.error,'Invalid produced value must stop');
    assert.equal(run.actions.filter(names=>names.length>1).length,scenario.invalidProducedValue==='first'?1:2);
    assert.ok(!objects(run.logs.join('\n')).some(o=>o.firstResult&&o.finalResult),'No completion after format rejection');return;
  }
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
  const initialDelta=frozen.plan.applicationKnowledge.some(rule=>rule.id==='initial-integer-domain')
    ?[{first:'0040',final:'777',initial:'-2'},
      {first:'0',final:'0'},{first:'000',final:'000'},
      {first:'999999999999',final:'999999999999'},
      {first:'1000000000000',final:'777',invalidProducedValue:'first'},
      {first:'0040',final:'1000000000000',invalidProducedValue:'final'},
      ...['receipt-missing','receipt-locator','receipt-state'].map(fault=>({first:'0040',final:'777',fault})),
      ...['-2.5','0.5'].map(initial=>({first:'0040',final:'777',initial,unsupportedInitial:true}))]:[];
  for(const input of [{first:'0040',final:'777'},{first:'9900',final:'888'},{first:'7',final:'555'},
    ...['read','unknown','stale','ambiguous','mismatch','initial-read','initial-stale','incomplete','bounds',
      'clear-stuck','clear-nonzero','clear-unknown'].map(fault=>({first:'0040',final:'777',fault})),
    {first:'0040',final:'777',initial:'0',initialClear:'全部清除'},
    {first:'0040',final:'777',diagnosticFailure:true},...initialDelta]){
    const actual=await exercise(code,input);let verdict='pass',reason=null;try{assess(actual,input);}catch(e){verdict='fail';reason=e.message;}
    scenarios.push({input,verdict,reason,actual});
  }
  recheck(frozen);return {verdict:scenarios.every(s=>s.verdict==='pass')?'pass':'fail',evidenceLayer:'controlled',live:false,scenarios};
}
function run(binary,args,logFile,deadline=null){return new Promise(resolve=>{
  const child=spawn(binary,args,{cwd:repo,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
  const timer=setTimeout(()=>child.kill('SIGTERM'),deadline===null?60000:Math.max(1,Math.min(60000,deadline-Date.now())));
  child.on('error',error=>{clearTimeout(timer);resolve({status:null,error:error.message,stdout,stderr});});
  child.on('close',status=>{clearTimeout(timer);fs.writeFileSync(logFile,stdout+stderr,{flag:'wx'});resolve({status,stdout,stderr,logFile});});
});}
function objects(output){return output.split('\n').flatMap(line=>{
  const start=line.indexOf('{');if(start<0)return[];
  // Runtime log files may append a second metadata object. Parse the first complete
  // JSON value, respecting braces inside strings, rather than treating metadata as payload.
  let depth=0,inString=false,escaped=false;
  for(let index=start;index<line.length;index++){
    const char=line[index];
    if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue;}
    if(char==='"')inString=true;else if(char==='{')depth++;
    else if(char==='}'&&--depth===0){try{return [JSON.parse(line.slice(start,index+1))];}catch{return [];}}
  }
  return [];
});}
function assessLive(candidate,witness){
  const payload=candidate.artifactStdout||candidate.stdout;
  const result=objects(payload).findLast(o=>o.firstResult&&o.finalResult);
  assert.ok(result,'Candidate must emit actual reads and input receipts');
  assert.equal(result.firstResult,'110');assert.equal(result.finalResult,'660');
  const traces=objects(payload).filter(o=>o.kind==='calculator-input');
  const expressions=traces.filter(o=>o.completed?.length>1);
  if(!result.secondInput){assert.equal(expressions.length,2,'Observe exactly two expression input receipts from the actual source');
    assert.deepEqual(expressions[0].completed.map(item=>item.target.locator.name),['2','5','×','4','+','1','0','=']);}
  const secondInput=result.secondInput||expressions[1];
  assert.ok(secondInput?.completed,'Actual source must expose acknowledged inputs through its debug artifact');
  const names=secondInput.completed.map(item=>{assert.equal(item.actionState,'acknowledged');assert.equal(item.backend,'macos-ax');
    assert.ok(item.requestId);assert.equal(item.target.source,'accessibility');return item.target.locator.name;});
  assert.deepEqual(names,['6','×',...result.firstResult,'=']);
  const complete=objects(witness.stdout).findLast(o=>o.kind==='witness-complete');
  assert.ok(complete&&complete.initialClearObserved,'Independent witness must complete its full run');
  assert.ok(complete.stableTerminalObserved&&complete.stableTerminalMs>=4000
    &&complete.completion?.status===0,'Independent witness must observe a stable terminal after candidate completion');
  assert.equal(complete.lastObservedValue,result.finalResult,'Stable terminal must equal this candidate actual final read');
  const actual=objects(witness.stdout).filter(o=>o.kind==='display-change').map(o=>o.row);
  assert.ok(actual.length,'Independent execution must observe display transitions');
  // Witness values are acquired without Expected and are correlated only by this evaluator.
  const values=actual.map(o=>o.value);
  const initialZero=values.indexOf('0'),first=values.indexOf(result.firstResult,initialZero+1),
    clear=values.indexOf('0',first+1),final=values.indexOf(result.finalResult,clear+1);
  assert.ok(initialZero>=0&&first>initialZero&&clear>first&&final>clear,
    'Independent observer must see this run zero → first display → clear → final display');
  return {firstResult:result.firstResult,finalResult:result.finalResult,consumer:names,observations:actual,
    witnessExecutionId:complete.executionId,application:complete.window,
    completion:complete.completion,stableTerminalMs:complete.stableTerminalMs};
}
function findCandidateArtifacts(before,source,root=path.join(repo,'.runtime/runs')){
  const hash=digest(source),label='file:'+path.relative(repo,source),matches=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory()||before.has(entry.name))continue;
    const directory=path.join(root,entry.name),summary=path.join(directory,'summary.json');
    if(!fs.existsSync(summary))continue;
    const actual=JSON.parse(fs.readFileSync(summary,'utf8'));
    if(actual.source===label&&actual.script_hash===hash)matches.push(directory);
  }
  assert.equal(matches.length,1,'Normal command must create one fresh exact-source execution artifact');
  return matches[0];
}
function handoffDeadline(file,now=Date.now()){
  const record=JSON.parse(fs.readFileSync(file,'utf8')),start=Date.parse(record.recordedAt);
  assert.equal(record.granted,true,'Desktop handoff must be explicitly granted');
  assert.ok(Number.isFinite(start)&&start<=now,'Desktop handoff time must be valid and not future');
  assert.ok(Number.isInteger(record.maximumWindowMs)&&record.maximumWindowMs>0,'Desktop handoff budget must be explicit');
  assert.equal(record.ownNativeInputsInflight,0);assert.equal(record.ownAxObserversInflight,0);
  const deadline=start+record.maximumWindowMs;
  assert.ok(now<deadline,'Desktop handoff window expired; no witness or candidate may be started');
  return deadline;
}
function checkDesktopTime(deadline){assert.ok(Date.now()<deadline,'Desktop handoff window expired; no new desktop work may be dispatched');}
async function live(frozen,out,deadline){
  const runs=[];
  for(let index=1;index<=2;index++){
    recheck(frozen);
    if(Date.now()>=deadline){runs.push({index,verdict:'blocked',reason:'Desktop handoff expired before fresh run',candidateStarted:false});break;}
    const prefix=path.join(out,'fresh-'+index),witnessPath=prefix+'-witness.log';
    const witnessPromise=run(path.join(repo,'dist/opendesk'),['-script','tests/human-to-recipe/calculator-partial-witness.js','-console-mode','script','-log-dir',prefix+'-witness'],witnessPath,deadline);
    // Read-only witness readiness is checked from its separate Execution log, without desktop input.
    const readiness=path.join(prefix+'-witness','stdout.log');const readinessDeadline=Math.min(Date.now()+7000,deadline);
    while(Date.now()<readinessDeadline){if(fs.existsSync(readiness)&&fs.readFileSync(readiness,'utf8').includes('FRESH_WITNESS_READY'))break;
      await new Promise(resolve=>setTimeout(resolve,100));}
    if(!fs.existsSync(readiness)||!fs.readFileSync(readiness,'utf8').includes('FRESH_WITNESS_READY')){
      const witness=await witnessPromise;runs.push({index,verdict:'blocked',reason:'Independent witness did not become ready',witness});break;}
    const ready=objects(fs.readFileSync(readiness,'utf8')).find(o=>o.kind==='witness-ready');
    if(!ready||path.resolve(ready.completionFile)!==path.resolve(prefix+'-witness','candidate-complete.json')){
      const witness=await witnessPromise;
      runs.push({index,verdict:'blocked',reason:'Completion boundary must belong to this fresh witness execution',witness});break;
    }
    // Run the documented one-line production command exactly, including its normal
    // console mode. Discover this fresh execution by source/hash; do not substitute
    // a wrapper, temporary script, different binary or run-local command.
    const normalRoot=path.join(repo,'.runtime/runs');fs.mkdirSync(normalRoot,{recursive:true});
    const previous=new Set(fs.readdirSync(normalRoot));
    const command=['-script',path.relative(repo,frozen.source),'-console-mode','normal'];
    if(Date.now()>=deadline){const witness=await witnessPromise;runs.push({index,verdict:'blocked',reason:'Desktop handoff expired before candidate dispatch',witness});break;}
    const candidate=await run(path.join(repo,'dist/opendesk'),command,prefix+'-candidate.log',deadline);
    const completion={kind:'candidate-process-complete',status:candidate.status,finishedAt:Date.now()};
    const pending=ready.completionFile+'.pending';
    fs.writeFileSync(pending,JSON.stringify(completion)+'\n',{flag:'wx'});
    fs.renameSync(pending,ready.completionFile);
    const witness=await witnessPromise;recheck(frozen);
    let verdict='pass',actual,reason;
    let candidateSummary,witnessSummary,candidateArtifacts;
    try{
      candidateArtifacts=findCandidateArtifacts(previous,frozen.source,normalRoot);
      candidateSummary=JSON.parse(fs.readFileSync(path.join(candidateArtifacts,'summary.json'),'utf8'));
      witnessSummary=JSON.parse(fs.readFileSync(prefix+'-witness/summary.json','utf8'));
      assert.equal(candidate.status,0,'Candidate failed: '+(candidateSummary.error||'exit '+candidate.status));
      assert.equal(witness.status,0,'Observer failed: '+(witnessSummary.error||'exit '+witness.status));
      assert.equal(candidateSummary.script_hash,digest(frozen.source),'Actual execution must load exact candidate bytes');
      assert.equal(witnessSummary.script_hash,digest(path.join(repo,'tests/human-to-recipe/calculator-partial-witness.js')));
      assert.equal(candidateSummary.success,true);assert.equal(witnessSummary.success,true);
      assert.notEqual(candidateSummary.execution_id,witnessSummary.execution_id,'Candidate and observer executions must be independent');
      candidate.artifactStdout=fs.readFileSync(path.join(candidateArtifacts,'stdout.log'),'utf8');
      assessRuntimeLoads({stdout:candidate.artifactStdout,stderr:''},frozen);
      assessRuntimeLoads({stdout:fs.readFileSync(prefix+'-witness/stdout.log','utf8'),stderr:''},frozen);
      actual=assessLive(candidate,witness);}catch(error){verdict='fail';reason=error.message;}
    runs.push({index,verdict,reason,actual,command:'./dist/opendesk '+command.join(' '),
      candidateExecutionId:candidateSummary?.execution_id,witnessExecutionId:witnessSummary?.execution_id,
      candidateArtifacts,witnessArtifacts:prefix+'-witness',
      candidateLog:candidate.logFile,witnessLog:witness.logFile});
    if(verdict!=='pass')break; // Unknown side effects are never retried automatically.
  }
  return {verdict:runs.length===2&&runs.every(r=>r.verdict==='pass')?'pass':'fail',evidenceLayer:'live',runs,
    scope:'Fixed task; macOS Calculator Basic 232×321; two independent Candidate starts and separate read-only witness Executions; no parameter/platform/human-executor claim'};
}
async function main(args){
  const [mode,planFile,...rest]=args;assert.ok(['--check','--controlled','--live'].includes(mode)&&planFile,
    'Usage: node qualify-calculator-partial.cjs --check|--controlled|--live <plan.json> [--reviewed-source-sha256 <sha256>] [--desktop-handoff <granted-record.json>]');
  const handoff=rest.indexOf('--desktop-handoff');
  const handoffFile=mode==='--live'?(assert.ok(handoff>=0&&rest[handoff+1],'Live requires an explicit granted desktop handoff record'),path.resolve(rest[handoff+1])):null;
  const deadline=handoffFile?handoffDeadline(handoffFile):null;
  const frozen=freeze(planFile),hash=digest(frozen.source);
  if(handoffFile)frozen.dependencies.push({path:handoffFile,sha256:digest(handoffFile)});
  const review=rest.indexOf('--reviewed-source-sha256');
  if(mode!=='--check')assert.equal(review<0?null:rest[review+1],hash,'Operator review of the exact candidate bytes is required');
  const out=fs.mkdtempSync(path.join(repo,'.runtime/tests/human-to-recipe/partial-authoring/qualification-'));
  const report={formatVersion:'human-to-recipe.calculator-qualification/v1',mode,time:new Date().toISOString(),
    subject:{source:frozen.source,sha256:hash,plan:frozen.planFile},dependencies:frozen.dependencies,
    initializerDirectories:frozen.initializerDirectories,score:frozen.score,
    desktopHandoff:handoffFile?{path:handoffFile,deadline:new Date(deadline).toISOString()}:null,
    fixtureSource:frozen.plan.environment.otherConstraints.some(s=>/fixture/i.test(s)),qualificationTransferred:false};
  fs.writeFileSync(path.join(out,'freeze.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  Object.assign(report,mode==='--check'?{verdict:'pass',live:false,scope:'Freeze/structure only; no execution or business qualification'}
    :mode==='--controlled'?await controlled(frozen):await live(frozen,out,deadline));
  recheck(frozen);const output=path.join(out,'report.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({verdict:report.verdict,mode,report:output,score:report.score,live:report.evidenceLayer==='live'}));
  if(report.verdict!=='pass')process.exitCode=1;
}
module.exports={freeze,recheck,exercise,assess,controlled,assessLive,assessRuntimeLoads,objects,findCandidateArtifacts,handoffDeadline};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
