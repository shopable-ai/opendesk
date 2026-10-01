#!/usr/bin/env node
'use strict';
// Maintenance only: fixed synthetic cases -> unique checker -> actual files.
const fs=require('node:fs');
const path=require('node:path');
const {diagnosticFixture,cases}=require('./stage-diagnostic-fixture.js');
const {writeWorkflowReviewBundle}=require('../../../workflows/agent-to-recipe/scripts/check-workflow-stage.js');
const root=process.argv[2];
if(!root||fs.existsSync(root))throw new Error('Supply a NEW output directory; existing reports are never overwritten.');
fs.mkdirSync(root);
for(const spec of cases){
 let cleanup;
 try {
  const f=diagnosticFixture({after(fn){cleanup=fn;}},spec.id);
  const report=f.check();
  if(report.allowed||report.firstInvalidBoundary!==spec.expectedBoundary)throw new Error('Fixture did not fail at its intended boundary.');
  writeWorkflowReviewBundle(report,path.resolve(root,spec.id));
 } finally {if(cleanup)cleanup();}
}
console.log('Generated three maintenance-only report bundles; no Candidate, desktop or model execution.');
