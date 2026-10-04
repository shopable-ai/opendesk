import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,json,readTrace,hash,executionFromTrace,independentVerify} from './evidence.mjs';
import {runOne,dependencyCheck} from './qualification.mjs';
const task=path.join(ROOT,'.runtime/automation-authoring/browser-integration-golden-demo');
const at=path.join(task,'attempts/S12-qualify-r001');
const request=json(path.join(task,'inputs/qualification-request.json'));
async function serverSnapshot(orderId){
  const f=json(path.join(ROOT,'.runtime/browser-core/fixture-public.json'));
  const v=json(path.join(ROOT,'.runtime/browser-core/fixture-verifier.json'));
  const response=await fetch(f.origin+'/verifier?orderId='+encodeURIComponent(orderId),{headers:{Authorization:'Bearer '+v.credential}});
  assert.equal(response.status,200);return await response.json();
}
export async function assess(receipt,fid){
  const rows=readTrace(receipt.tracePath),server=await serverSnapshot(receipt.orderId),directory=receipt.outputDirectory;
  let rejected=false,reason;
  try{await independentVerify(executionFromTrace(receipt.tracePath,receipt.orderId));}catch(error){rejected=true;reason=String(error);}
  assert.equal(rejected,true,'BAD_CANDIDATE_QUALIFIED:'+fid);
  if(fid==='F1'){
    const read=rows.find(r=>r.operation==='read'&&r.afterObservation?.testId==='amount');
    const fill=rows.find(r=>r.operation==='fill'&&r.afterObservation?.testId==='confirmation');
    assert.ok(read&&fill);assert.notEqual(read.runtimeOutput,'596.96');assert.equal(fill.runtimeInput,'596.96');assert.notEqual(fill.runtimeInput,read.runtimeOutput);
  }
  if(fid==='F2'){assert.ok(rows.some(r=>r.errorClass==='PERMISSION_DENIED'&&r.outcome==='NOT_DISPATCHED'));assert.equal(rows.filter(r=>r.actualActionResult).length,0);assert.equal(server.submissionCount,0);}
  if(fid==='F3'){assert.ok(rows.some(r=>r.errorClass==='STALE_TARGET'&&r.outcome==='NOT_DISPATCHED'));assert.equal(rows.filter(r=>r.actualActionResult).length,0);assert.equal(server.submissionCount,0);}
  if(fid==='F4'){assert.equal(rows.filter(r=>r.operation==='click'&&r.beforeObservation?.testId==='confirm').length,2);assert.notEqual(server.submissionCount,1);}
  if(fid==='F5'){assert.equal(server.submissionCount,1);assert.equal(rows.filter(r=>r.operation==='verify'&&r.afterObservation?.testId==='status').length,0);assert.ok(reason.includes('MISSING_CANDIDATE_FINAL_VERIFICATION'));}
  const report={testVerdict:'PASS',incorrectCandidateVerdict:'FAIL',case:fid,sourceHash:receipt.sourceHash,sourcePath:receipt.sourcePath,
    positiveCandidateHashUnchanged:dependencyCheck().candidateHash,orderId:receipt.orderId,qualificationRejected:true,reason,
    actualServerSnapshot:server,tracePath:receipt.tracePath,executionId:receipt.executionId,noAgentRepair:true};
  fs.writeFileSync(path.join(directory,'negative-qualification.json'),JSON.stringify(report,null,2)+'\n');return report;
}
async function main(){
  const results=[];
  for(const fid of ['F1','F2','F4','F5']){
    const scenario=request.scenarios.find(s=>s.id==='reject-'+fid);
    const receipt=await runOne(scenario,path.join(at,'negative-candidates',fid+'.recipe.js'),{negative:true});
    results.push(await assess(receipt,fid));
  }
  fs.writeFileSync(path.join(at,'negative-batch.json'),JSON.stringify({status:'PASS',results},null,2)+'\n');
  console.log(JSON.stringify(results.map(r=>({case:r.case,test:r.testVerdict,candidate:r.incorrectCandidateVerdict,submissions:r.actualServerSnapshot.submissionCount,reason:r.reason}))));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(error=>{fs.writeFileSync(path.join(at,'negative-entry-failure-'+Date.now()+'.json'),JSON.stringify({status:'FAIL',error:String(error),noReplay:true},null,2)+'\n');console.error(String(error));process.exitCode=1;});
