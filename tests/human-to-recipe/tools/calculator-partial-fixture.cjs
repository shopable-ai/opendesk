'use strict';
// Maintained fixture producer. All recordings produced here are synthetic, never human/live evidence.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const rel=file=>path.relative(repo,file).split(path.sep).join('/');
function write(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});return rel(file);}
function makeFixture(root){
  if(!path.resolve(root).startsWith(path.join(repo,'.runtime')+path.sep))throw new Error('Fixture output must be in .runtime');
  const dir=path.join(root,'rec-fixture-partial');fs.mkdirSync(dir,{recursive:true});
  write(path.join(dir,'manifest.json'),{formatVersion:'opendesk.recorder.recording/v2',recordingId:path.basename(dir),state:'stopped',storage:{state:'saved'},fixture:true});
  const buttons=['2','5','×','4','+','1','0','='];
  const events=buttons.flatMap((name,i)=>['MOUSE_PRESSED','MOUSE_RELEASED','MOUSE_CLICKED'].map((libraryEvent,j)=>({
    formatVersion:'opendesk.recorder.raw-event/v2',eventId:'e'+String(i*3+j+1).padStart(12,'0'),sequence:String(i*3+j+1),
    libraryEvent,source:'unknown',scopeRef:'fixture:calculator',fixture:true})));
  const raw=events.map(e=>JSON.stringify(e)).join('\n')+'\n';fs.writeFileSync(path.join(dir,'events.ndjson'),raw,{flag:'wx'});
  const actions={formatVersion:'opendesk.recorder.actions/v2',recordingId:path.basename(dir),revision:1,readiness:'ready',
    raw:{file:'events.ndjson',sha256:sha(raw),bytes:Buffer.byteLength(raw)},actions:buttons.map((name,i)=>({id:'a'+String(i+1).padStart(4,'0'),
      kind:'click',source:{eventIds:events.slice(i*3,i*3+3).map(e=>e.eventId)},semantic:{status:'verified',role:'button',name}}))};
  write(path.join(dir,'actions.json'),actions);
  const task={schemaVersion:'recorder-task/v1',description:'通过 Calculator 按钮输入 25 × 4 + 10 =，实际读取 firstResult；清空界面并保留 firstResult；按按钮输入 6 × firstResult =，实际读取并输出 finalResult。',
    successConditions:'Expected 110 和 660 只作判据；证明同一 Fresh Run 中显示→firstResult→清空后保留→第二段按钮→终点读取。',
    allowedSideEffects:'仅 Calculator 窗口中的必要激活、清空、按钮输入和读取；不触碰其他应用，不上传截图。',declaredAt:'2026-09-30T00:00:00Z'};
  const taskPath=write(path.join(dir,'task.json'),task);
  const rulesPath=path.join(dir,'application-rules.txt');
  fs.writeFileSync(rulesPath,'FIXTURE / application-engineer harden input: macOS Calculator Basic 232×321.\nUnique button role/name, complete AX observation, current primary display value.\nRead actual UI text twice and compare with primary display. All-clear needs C→AC within two acknowledged inputs.\nFail on changed identity/focus/layout, ambiguity, unstable read or unknown action. No fallback or retry.\nThis fixture does not establish live application knowledge or a human executor.\n',{flag:'wx'});
  const artifact=file=>({path:rel(file),sha256:sha(fs.readFileSync(file))});
  const episode=(id,name,actionIds,sourceRefs)=>({id,name,purpose:name,actionIds,sourceRefs,
    preconditions:['Same authorized Calculator window and supported layout'],postconditions:['Actual state and runtime data available to the next step']});
  const episodes=[episode('first-expression','计算第一段',actions.actions.map(a=>a.id),['task',...actions.actions.map(a=>a.id)]),
    episode('read-first','读取本次 firstResult',[],['task','application-rules']),
    episode('clear-ui','清空界面并保留变量',[],['task','application-rules']),
    episode('second-expression','按本次 firstResult 计算第二段',[],['task','application-rules']),
    episode('read-final','读取并输出本次 finalResult',[],['task','application-rules'])];
  const output=rel(path.join(dir,'derived.recipe.js')),gate='tests/human-to-recipe/tools/qualify-calculator-partial.cjs';
  const target={id:'calculator-controls',description:'Exact Calculator Basic window; buttons and primary result display',
    locator:{status:'verified',strategies:['Fixture verifies unique current role/name and complete native snapshot; live scope is not-run'],fallbackPolicy:'none',sourceRefs:['application-rules']},
    geometry:{space:'semantic-only',projectionApi:'none',values:{},sourceRefs:['application-rules']},sourceRefs:['application-rules'],unknowns:[]};
  const plan={schemaVersion:'semantic-build-plan/v2',kind:'human-to-recipe-semantic-build-plan',
    source:{repository:'.',workdir:'.',recordingDir:rel(dir),actionsFile:rel(path.join(dir,'actions.json')),actionsRevision:1,actionsReadiness:'ready',
      actionsSha256:artifact(path.join(dir,'actions.json')).sha256,rawReference:actions.raw,actionIds:actions.actions.map(a=>a.id),
      operator:{executor:'unknown',basis:'unknown',sourceRefs:[rel(path.join(dir,'events.ndjson'))]},
      materials:[{id:'task',kind:'user-requirement',artifact:artifact(path.join(dir,'task.json')),schemaVersion:'recorder-task/v1',executor:'unknown',collector:'fixture declaration',executionId:null,unknowns:[]},
        {id:'application-rules',kind:'application-rule',artifact:artifact(rulesPath),schemaVersion:'text/plain',executor:'unknown',collector:'fixture / application-engineer',executionId:null,unknowns:[]}]},
    intent:{businessGoal:task.description,successConditions:[task.successConditions],allowedSideEffects:[task.allowedSideEffects],forbiddenObjects:['Other applications; private screens; screenshot upload'],
      resolution:Object.fromEntries(['businessGoal','successConditions','sideEffects'].map(k=>[k,{status:'confirmed',sourceRefs:['task']}]))},
    environment:{applications:['macOS Calculator com.apple.calculator'],languages:['Chinese native labels'],layoutConstraints:['Basic 232×321'],otherConstraints:['Fixture authoring; no human/live/qualification claim']},
    semanticCoverage:{verified:8,unavailable:0,notRequested:0,notApplicable:0,missing:0,unavailableWithReason:0,unavailableWithoutReason:0,issues:[]},
    actionDispositions:actions.actions.map(a=>({actionId:a.id,disposition:'business',sourceEventIds:a.source.eventIds,rationale:'Recorded first-expression input only; no recorded runtime read'})),
    businessEpisodes:episodes,
    applicationKnowledge:[{id:'fresh-runtime-value',statement:'Each full execution reads its own firstResult and retains it across UI clear; prior runs never supply input.',kind:'user-rule',sourceRefs:['task']},
      {id:'supported-controls',statement:'Native rule candidate remains limited to Calculator Basic and must be independently checked live.',kind:'candidate',sourceRefs:['application-rules']}],
    targets:[target],actionStrategies:[{id:'calculator-native-operations',targetId:target.id,method:'Exact native buttons, fresh primary display reads, bounded all-clear; no fallback',
      apiCalls:['window.get','window.current','window.activate','Accessibility.snapshot','UI.tapTargets','UI.readText'],noImplicitFallback:true,sourceRefs:['application-rules']}],
    runtimeGuards:[{id:'exact-window-guard',description:'Before each batch/read require same PID/handle/id/bounds/focus and complete unique native targets; stop on any mismatch.',actionIds:[],sourceRefs:['application-rules']}],
    recoveryRules:[{id:'bounded-all-clear',description:'Only the known Calculator clear control: acknowledged C then AC, at most two; unknown effects stop.',maxAttempts:2,actionIds:[],sourceRefs:['application-rules']}],
    qualification:{claims:[{id:'complete-fresh-dataflow',description:task.successConditions,sourceRefs:['task']}],gate:{path:gate,productionSource:{path:output,sha256:null},executionMode:'freeze-and-execute-production-source'}},
    evidence:{items:[{id:'independent-display-evidence',description:'Read each current display independently and bind exact candidate/dependencies and run identity.',sourceRefs:['task']}]},
    sourceMap:actions.actions.map(a=>({actionId:a.id,disposition:'business',episodeId:'first-expression',consumerIds:['calculator-native-operations']})),
    outputs:{productionRecipe:{path:output,sha256:null},qualificationGate:{path:gate},evidenceRoot:rel(path.join(dir,'qualification')),
      renderer:{status:'not-implemented',mode:'deterministic-agent-instructions'}},
    verification:{generated:'not-generated',staticallyReviewed:'not-run',syntheticallyVerified:'not-run',liveVerified:'not-run',qualified:'not-run'},
    completion:{requirements:episodes.map(e=>({id:'require-'+e.id,description:e.name,status:'confirmed',sourceRefs:['task'],episodeIds:[e.id]})),
      gaps:[{id:'missing-read-channel',known:'First segment contains button clicks only',missing:'Current display reads and second-segment execution facts',
        reason:'Buttons do not prove runtime data flow or full task execution',minimalEvidence:'Review the native display/clear rule; qualify the complete frozen candidate in new runs',
        owner:'Human plan / application-engineer / H7',status:'unknown',sourceRefs:['task','application-rules'],consumerIds:['read-first','second-expression','read-final']}],
      dataBindings:[{id:'firstResult',producerEpisodeId:'read-first',consumerEpisodeId:'second-expression',lifetime:'fresh-run',sourceRefs:['task']}]}};
  return {dir,plan,taskPath,actions,rulesPath};
}
module.exports={makeFixture,sha,repo,rel,write};
if(require.main===module){
  if(process.argv[2]!=='--complete-fixture')throw new Error('Usage (repository root): node tests/human-to-recipe/tools/calculator-partial-fixture.cjs --complete-fixture');
  const root=path.join(repo,'.runtime/tests/human-to-recipe/partial-authoring');fs.mkdirSync(root,{recursive:true});
  const f=makeFixture(fs.mkdtempSync(path.join(root,'sample-')));
  const {scoreSemanticBuildPlan}=require('../../../workflows/human-to-recipe/skills/human-to-recipe/scripts/score-semantic-build-plan.js');
  write(path.join(f.dir,'partial-plan.json'),f.plan);
  // The fixture supplies application rules only for controlled authoring. Live qualification remains separate.
  f.plan.completion.gaps[0].status='resolved';
  f.plan.completion.gaps[0].missing='First/final result facts will be acquired anew by the complete candidate; none are inherited from fixture/history';
  f.plan.completion.gaps[0].minimalEvidence='Supplied fixture operation rule, then separate exact-candidate controlled and live qualification';
  const asset=path.join(repo,'examples/agent-to-recipe/calculator-current.js');
  f.plan.source.materials.push({id:'reused-source',kind:'existing-asset',artifact:{path:rel(asset),sha256:sha(fs.readFileSync(asset))},
    schemaVersion:'text/javascript',executor:'unknown',collector:'declared existing source asset',executionId:null,unknowns:[]});
  const before=scoreSemanticBuildPlan(f.plan,{cwd:repo});write(path.join(f.dir,'plan-score.json'),before);
  if(!before.pass)throw new Error('Fixture plan did not meet Human generation gates');
  const code=fs.readFileSync(asset);fs.writeFileSync(path.join(repo,f.plan.outputs.productionRecipe.path),code,{flag:'wx'});
  f.plan.outputs.productionRecipe.sha256=sha(code);f.plan.qualification.gate.productionSource.sha256=sha(code);
  f.plan.verification.generated='present';f.plan.verification.staticallyReviewed='passed';
  const after=scoreSemanticBuildPlan(f.plan,{cwd:repo});write(path.join(f.dir,'candidate-score.json'),after);
  if(!after.pass)throw new Error('Generated candidate differs from the declared contract');
  const plan=write(path.join(f.dir,'complete-plan.json'),f.plan);
  console.log(JSON.stringify({fixture:true,recording:rel(f.dir),plan,candidate:f.plan.outputs.productionRecipe,score:after.totalScore,live:'not-run',qualified:'not-run'}));
}
