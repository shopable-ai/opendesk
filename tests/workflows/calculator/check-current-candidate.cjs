#!/usr/bin/env node
'use strict';
// S12 read-only freeze audit for the current fixed Calculator Candidate.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'../../..');
const task=path.join(repo,'.runtime/automation-authoring/calculator-fresh-20260918');
const manifestPath=path.join(task,'revisions/r009/candidate.json');
const candidate=JSON.parse(fs.readFileSync(manifestPath));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const roots={repo,task};
function verify(ref) {
  assert.ok(ref && roots[ref.rootId] && ref.path && /^[0-9a-f]{64}$/.test(ref.sha256));
  const file=path.resolve(roots[ref.rootId],ref.path);
  assert.ok(file.startsWith(roots[ref.rootId]+path.sep));
  assert.equal(sha(file),ref.sha256,'Candidate dependency drift: '+ref.path);
  return file;
}
assert.equal(candidate.revision,'r009-c002');
assert.equal(candidate.taskId,'calculator-fresh-20260918');
const script=verify(candidate.scriptRef);
assert.equal(sha(script),candidate.scriptHash);
assert.equal(sha(verify(candidate.snapshotRef)),candidate.scriptHash);
for(const ref of [candidate.contractRef,candidate.procedureRef,candidate.workPlanRef,
    candidate.applicationRuleRef,...candidate.appProfileRefs,...candidate.apiRefs,
    ...candidate.dependencies]) verify(ref);
const publicBinary=path.join(repo,'dist/opendesk');
const exactBinary=path.join(repo,candidate.entrypointLink.resolvesTo);
assert.equal(fs.realpathSync(publicBinary),exactBinary);
assert.equal(sha(publicBinary),candidate.entrypointLink.sha256);
assert.equal(candidate.dependencies.find(d=>d.kind==='binary').sha256,sha(exactBinary));
console.log(JSON.stringify({candidatePath:path.relative(repo,manifestPath),candidateSha256:sha(manifestPath),
  sourcePath:path.relative(repo,script),sourceSha256:sha(script),
  binarySha256:sha(exactBinary),entryCommand:candidate.entryCommand,
  dependencyCount:candidate.dependencies.length,apiCount:candidate.apiRefs.length,
  desktopInput:false,time:new Date().toISOString()}));
