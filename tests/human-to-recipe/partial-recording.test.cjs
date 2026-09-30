'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {makeFixture,repo}=require('./tools/calculator-partial-fixture.cjs');
const {inspectPartialRecording}=require('../../workflows/human-to-recipe/skills/human-to-recipe/scripts/inspect-partial-recording.js');
const {validateSemanticBuildPlan}=require('../../workflows/human-to-recipe/skills/human-to-recipe/scripts/validate-semantic-build-plan.js');
const {scoreSemanticBuildPlan}=require('../../workflows/human-to-recipe/skills/human-to-recipe/scripts/score-semantic-build-plan.js');
const base=path.join(repo,'.runtime/tests/human-to-recipe/partial-unit');fs.mkdirSync(base,{recursive:true});
const fixture=()=>makeFixture(fs.mkdtempSync(path.join(base,'case-')));
const validate=plan=>validateSemanticBuildPlan(plan,{cwd:repo,checkSource:true});
test('saved legal partial actions enter diagnosis without a candidate; missing task is recoverable',()=>{
  const f=fixture(),r=inspectPartialRecording({recordingDir:f.dir,taskFile:'task.json'});
  assert.equal(r.packageIntegrity,'verified');assert.equal(r.businessCoverage,'unknown');assert.equal(r.candidateRequired,false);
  assert.equal(r.facts.length,8);assert.ok(r.facts.every(f=>f.executor==='unknown'));assert.equal(r.productionReady,false);
  const missing=inspectPartialRecording({recordingDir:f.dir});assert.equal(missing.packageIntegrity,'verified');
  assert.match(missing.blockers[0].reason,/Missing full task/);
});
test('damaged raw, unknown version, unreadable task and incomplete click pairing cannot be normal partial inputs',()=>{
  const f=fixture();fs.appendFileSync(path.join(f.dir,'events.ndjson'),'damage');
  assert.equal(inspectPartialRecording({recordingDir:f.dir}).packageIntegrity,'failed');
  const g=fixture(),a=path.join(g.dir,'actions.json');let d=JSON.parse(fs.readFileSync(a));d.formatVersion='future/v9';fs.writeFileSync(a,JSON.stringify(d));
  assert.equal(inspectPartialRecording({recordingDir:g.dir}).packageIntegrity,'failed');
  const h=fixture();const r=inspectPartialRecording({recordingDir:h.dir,taskFile:'absent.json'});
  assert.equal(r.packageIntegrity,'verified');assert.ok(r.blockers.some(b=>/Task material/.test(b.reason)));
});
test('v2 keeps unknown completion gaps blocked before production, with a readable owner and next action',()=>{
  const f=fixture(),r=validate(f.plan);assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.productionReady,false);
  assert.ok(r.blockers.some(b=>b.code==='UNRESOLVED_COMPLETION_GAP'&&b.message.includes('Human plan')));
  const s=scoreSemanticBuildPlan(f.plan,{cwd:repo});assert.equal(s.pass,false);
});
test('a resolved fixture can consume supplemental episodes under unchanged Human scoring thresholds',()=>{
  const f=fixture();f.plan.completion.gaps[0].status='resolved';
  const r=validate(f.plan);assert.equal(r.productionReady,true,JSON.stringify(r));
  const score=scoreSemanticBuildPlan(f.plan,{cwd:repo});assert.equal(score.pass,true,JSON.stringify(score));
  assert.ok(score.totalScore>=95);assert.equal(f.plan.verification.liveVerified,'not-run');assert.equal(f.plan.verification.qualified,'not-run');
});
test('role claims, duplicate events/materials, unknown loss, unsupported version and cross-run data edges are rejected',()=>{
  const cases=[
    p=>{p.source.operator={executor:'human',basis:'record',sourceRefs:['Recorder']};},
    p=>{p.actionDispositions[1].sourceEventIds=p.actionDispositions[0].sourceEventIds;},
    p=>{p.source.materials.push({...p.source.materials[0],id:'duplicate'});},
    p=>{p.source.materials[1].unknowns=['display owner not established'];},
    p=>{p.source.materials[1].schemaVersion='unimplemented/v9';},
    p=>{p.completion.dataBindings[0].lifetime='historical-run';},
    p=>{p.schemaVersion='semantic-build-plan/v99';},
    p=>{p.schemaVersion='semantic-build-plan/v1';},
    p=>{p.completion.requirements[2].status='unknown';},
    p=>{p.source.materials[0].id=p.source.actionIds[0];},
    p=>{p.completion.requirements=[null];},
    p=>{p.completion.requirements[0].episodeIds=42;},
  ];
  for(const mutate of cases){const f=fixture();f.plan.completion.gaps[0].status='resolved';mutate(f.plan);
    const r=validate(f.plan);assert.equal(r.productionReady,false,JSON.stringify(r));}
});

test('active or unsaved recording cannot be treated as a stopped partial handoff',()=>{
  const f=fixture(),file=path.join(f.dir,'manifest.json'),manifest=JSON.parse(fs.readFileSync(file));
  manifest.state='recording';fs.writeFileSync(file,JSON.stringify(manifest));
  const report=inspectPartialRecording({recordingDir:f.dir});assert.equal(report.packageIntegrity,'failed');assert.match(report.blockers[0].reason,/not stopped/);
});
test('supplement drift invalidates consumption without altering original facts',()=>{
  const f=fixture();f.plan.completion.gaps[0].status='resolved';const before=fs.readFileSync(path.join(f.dir,'actions.json'));
  fs.appendFileSync(f.rulesPath,'changed dependency\n');const r=validate(f.plan);
  assert.ok(r.blockers.some(b=>b.code==='SUPPLEMENT_SOURCE_INVALID'));assert.deepEqual(fs.readFileSync(path.join(f.dir,'actions.json')),before);
});
