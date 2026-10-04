import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {ROOT,json,hash,readTrace,auditTrace,executionFromTrace,independentVerify} from './evidence.mjs';
const require=createRequire(import.meta.url);
const {checkWorkflowStage}=require('../../workflows/agent-to-recipe/scripts/check-workflow-stage.js');
const {verifyBrowserConsumer}=require('../workflows/tools/browser-consumer-dataflow.cjs');
const task=path.join(ROOT,'.runtime/automation-authoring/browser-integration-golden-demo');
const at=path.join(task,'attempts/S12-qualify-r001');
const request=json(path.join(task,'inputs/qualification-request.json'));
const manifestPath=path.join(task,request.candidateRef.path);
const manifest=json(manifestPath);
const roots=[['repo',ROOT],['task',task],['node','/Users/mac/.nvm/versions/node/v24.15.0']];
export function dependencyCheck() {
  assert.equal(hash(fs.readFileSync(manifestPath)),request.candidateRef.sha256,'MANIFEST_CHANGED');
  const sourcePath=path.join(task,manifest.scriptRef.path);
  assert.equal(hash(fs.readFileSync(sourcePath)),manifest.scriptHash,'CANDIDATE_CHANGED');
  for(const ref of manifest.dependencies){const base=roots.find(([id])=>id===ref.rootId)[1];assert.equal(hash(fs.readFileSync(path.join(base,ref.path))),ref.sha256,'DEPENDENCY_CHANGED:'+ref.path);}
  return {status:'PASS',candidateHash:manifest.scriptHash,dependencyCount:manifest.dependencies.length};
}
export function stageGuard() {
  const report=checkWorkflowStage({record:path.join(task,'stage-record.json'),roots,from:'S11',to:'S12',verifyConsumer:verifyBrowserConsumer});
  fs.mkdirSync(at,{recursive:true});fs.writeFileSync(path.join(at,'entry-stage-guard.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(report.allowed,true,'CURRENT_S11_STAGE_GUARD_FAILED');
  return report;
}
export function entryArgs(scriptPath) {
  return ['-allow-browser','-browser-core-root',ROOT,'-browser-origin','http://127.0.0.1:51722','-browser-tab','759147624','-script',path.relative(ROOT,scriptPath),'-console-mode','script'];
}
export async function runOne(scenario,scriptPath,{negative=false}={}) {
  dependencyCheck();
  const directory=path.join(at,scenario.id);fs.mkdirSync(directory,{recursive:true});
  const inputPath=path.join(ROOT,'.runtime/tests/browser-integration-golden-demo/recipe-input.json');
  fs.writeFileSync(inputPath,JSON.stringify(scenario.input)+'\n');
  const sourceHash=hash(fs.readFileSync(scriptPath)),executable=path.join(ROOT,'.runtime/tests/browser-integration-golden-demo/bin/opendesk');
  const args=entryArgs(scriptPath),startedAt=new Date().toISOString();
  const run=spawnSync(executable,args,{cwd:ROOT,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(directory,'stdout.log'),run.stdout||'');fs.writeFileSync(path.join(directory,'stderr.log'),run.stderr||'');
  const stdout=run.stdout||'';
  const id=stdout.match(/logs=\.runtime\/runs\/([^\s]+)/)?.[1];
  const tracePath=id?path.join(ROOT,'.runtime/browser-executions',id,'canonical-trace.ndjson'):null;
  const receipt={scenarioId:scenario.id,orderId:scenario.input.orderId,negativeCandidate:negative,
    actualCommand:path.relative(ROOT,executable)+' '+args.join(' '),workingDirectory:ROOT,startedAt,finishedAt:new Date().toISOString(),
    exitCode:run.status,sourcePath:scriptPath,sourceHash,candidateBaselineHash:manifest.scriptHash,
    executionId:id,tracePath,agentUsedForStepDecision:false,sourceMutation:false,outputDirectory:directory};
  fs.writeFileSync(path.join(directory,'run.json'),JSON.stringify(receipt,null,2)+'\n');
  dependencyCheck();
  if(!negative){
    assert.equal(run.status,0,'PRODUCTION_ENTRY_FAILED');assert.equal(sourceHash,manifest.scriptHash);
    const traceAudit=auditTrace(tracePath,{source:'recipe',executionId:id,origin:'http://127.0.0.1:51722',tab:759147624});
    const execution=executionFromTrace(tracePath,scenario.input.orderId);
    const verifier=await independentVerify(execution);
    assert.notEqual(execution.domReadAmount,request.agentGoldenAmount,'FRESH_AMOUNT_EQUALS_AGENT_SAMPLE');
    fs.writeFileSync(path.join(directory,'execution.json'),JSON.stringify(execution,null,2)+'\n');
    fs.writeFileSync(path.join(directory,'independent-verifier.json'),JSON.stringify(verifier,null,2)+'\n');
    fs.writeFileSync(path.join(directory,'trace-audit.json'),JSON.stringify(traceAudit,null,2)+'\n');
    return {scenarioId:scenario.id,status:'PASS',orderId:scenario.input.orderId,amountDOM:execution.domReadAmount,
      confirmationActual:execution.confirmationActual,serverRecordedAmount:verifier.serverRecordedAmount,
      submissionCount:verifier.submissionCount,finalStatus:execution.domFinalStatus,candidateHash:sourceHash,
      executionId:id,agentUsedDuringRun:false,receiptPath:path.join(directory,'run.json'),verifierPath:path.join(directory,'independent-verifier.json')};
  }
  return receipt;
}

async function main(){
  if(process.argv[2]==='--check'){stageGuard();console.log(JSON.stringify({entryStage:'PASS',...dependencyCheck()}));return;}
  if(process.argv[2]==='--positive'){
    stageGuard();dependencyCheck();
    const sourcePath=path.join(task,manifest.scriptRef.path),results=[];
    for(const scenario of request.scenarios.slice(0,3))results.push(await runOne(scenario,sourcePath));
    const report={status:'PASS',sameHashUsed:true,candidateHash:manifest.scriptHash,freshRunCount:results.length,
      agentUsedDuringFreshRun:false,results};
    fs.writeFileSync(path.join(at,'fresh-runs.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));return;
  }
  throw new Error('Use --check or --positive');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(error=>{
  fs.mkdirSync(at,{recursive:true});fs.writeFileSync(path.join(at,'entry-failure-'+Date.now()+'.json'),JSON.stringify({status:'FAIL',error:String(error),note:'No candidate edit, no action replay; inspect actual side effects before any new execution'},null,2)+'\n');console.error(String(error));process.exitCode=1;
});
