'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture,repo,sha}=require('./tools/calculator-partial-fixture.cjs');
const {consumeOperationRules}=require('../../workflows/agent-to-recipe/skills/application-engineer/scripts/consume-operation-rules.js');
const {exercise,assess}=require('./tools/qualify-calculator-partial.cjs');
const base=path.join(repo,'.runtime/tests/human-to-recipe/shared-application');fs.mkdirSync(base,{recursive:true});
const ref=(id,bytes,version)=>({kind:id,rootId:'fixture',path:id+'.json',sha256:sha(bytes),schemaVersion:version});
test('same application-engineer harden reuse consumes both native sources and its rules drive the exact candidate consumer',async()=>{
  const f=makeFixture(fs.mkdtempSync(path.join(base,'inputs-')));
  const human=Buffer.from(JSON.stringify(f.plan));
  // Fixed Agent fixture. It carries its own unresolved fact, not Human actions or an Agent PASS.
  const agent=Buffer.from(JSON.stringify({schemaVersion:'agent-to-recipe/v1',taskId:'agent-fixture',
    businessSteps:[{stepId:'first-expression',purpose:'Enter the fixed first expression by buttons'},
      {stepId:'read-first',purpose:'Read current display'},{stepId:'clear-ui',purpose:'Clear UI while keeping the task value'},
      {stepId:'second-expression',purpose:'Consume this run firstResult'},{stepId:'read-final',purpose:'Read and output the actual final display'}],
    runtimeValues:[{name:'firstResult',validity:'current execution only'}],
    dataDependencies:[{producer:'read-first',value:'firstResult',consumer:'second-expression'}],unresolved:['Agent fact not observed live']}));
  const profile=Buffer.from(JSON.stringify({schemaVersion:'agent-to-recipe/app-profile/v1.1',revision:'fixture',
    applicationIdentity:{bundleId:'com.apple.calculator',title:'Calculator'},
    environmentScope:{windowWidth:232,windowHeight:321,nativeDisplayName:'主显示器'},
    operations:['input','read','clear'].map(name=>({id:'operation.'+name,target:name==='read'?'target.display':'region.keypad',
      locator:'unique current exact role/name',geometry:null,actionStrategy:name==='read'?'UI.readText':'UI.tapTargets',
      runtimeGuards:['fresh exact window','complete snapshot'],recoveryRule:'unknown → stop',qualificationClaims:['fixture only'],
      sourceRefs:[{path:'fixture-observation.json',sha256:sha('fixture')}],unknowns:['Other platforms/layouts not tested']}))}));
  const common={profileBytes:profile,profileRef:ref('AppProfile',profile,'agent-to-recipe/app-profile/v1.1'),
    operationIds:['operation.input','operation.read','operation.clear']};
  for(const [name,bytes] of [['HumanPlan',human],['SemanticProcedure',agent],['AppProfile',profile]]){
    fs.writeFileSync(path.join(f.dir,name+'.json'),bytes,{flag:'wx'});
  }
  const outputs=[consumeOperationRules({...common,sourceBytes:human,sourceRef:ref('HumanPlan',human,'semantic-build-plan/v2')}),
    consumeOperationRules({...common,sourceBytes:agent,sourceRef:ref('SemanticProcedure',agent,'agent-to-recipe/v1')})];
  assert.deepEqual(outputs.map(o=>o.lineage),['Human','Agent']);assert.ok(outputs.every(o=>o.productionUnknowns.length));
  const code=fs.readFileSync(path.join(repo,'examples/agent-to-recipe/calculator-current.js'),'utf8');
  for(const output of outputs){
    assert.deepEqual(output.operations[0].unknowns,['Other platforms/layouts not tested']);
    const run=await exercise(code,{first:'0040',final:'777',operationRules:output});assess(run,{first:'0040',final:'777'});
    const changed={...output,environmentScope:{...output.environmentScope,nativeDisplayName:'Another display'}};
    const rejected=await exercise(code,{operationRules:changed});assert.ok(rejected.error);assert.equal(rejected.actions.length,0);
    await assert.rejects(()=>exercise(code,{operationRules:{...output,environmentScope:{...output.environmentScope,windowWidth:null}}}));
  }
  fs.writeFileSync(path.join(f.dir,'shared-consumption.json'),JSON.stringify({scope:'controlled actual candidate execution only; no live or model Producer qualification',outputs},null,2)+'\n',{flag:'wx'});
  assert.throws(()=>consumeOperationRules({...common,sourceBytes:human,sourceRef:ref('HumanPlan',human,'future/v9')}),/version/);
  assert.throws(()=>consumeOperationRules({...common,sourceBytes:agent,sourceRef:ref('SemanticProcedure',agent,'agent-to-recipe/v1'),profileBytes:Buffer.from('{}')}),/hash/);
});
