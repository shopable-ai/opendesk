'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { fixture } = require('./tools/stage-review-fixture.js');
const { diagnosticFixture, cases } = require('./tools/stage-diagnostic-fixture.js');
const { checkWorkflowStage, writeWorkflowReviewBundle } = require('../../workflows/agent-to-recipe/scripts/check-workflow-stage.js');
const { renderWorkflowReview, renderWorkflowStage, renderWorkflowBundle, workflowPresentation } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const golden = path.join(__dirname, 'fixtures/stage-review-diagnostics/golden');
const stageName = stage => 'S' + stage.slice(1).padStart(2, '0');
function reviseAcceptance(f, change) {
  const file = path.join(f.dir, 'acceptance.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')); change(doc);
  const ref = f.write('acceptance.json', JSON.stringify(doc), 'Acceptance');
  f.record.acceptanceRef = ref;
  for (const review of f.record.stages) {
    review.inputs = review.inputs.map(value => value.path === 'acceptance.json' ? ref : value);
    review.audit.accessedRefs = [ref];
  }
}
for (const spec of cases) test(spec.id + ': real checker → files → human-visible golden', t => {
  const f = diagnosticFixture(t, spec.id);
  const report = f.check();
  assert.equal(report.allowed, false);
  assert.equal(report.firstInvalidBoundary, spec.expectedBoundary);
  assert.equal(report.failureDiscoveryStage, spec.stage);
  assert.equal(report.failureOwner.status === 'ESTABLISHED' ? report.failureOwner.stage : report.failureOwner.status, spec.expectedOwner);
  assert.equal(report.stages[spec.stage].score, 100); // counterexample: score does not override failure
  assert.equal(report.stages[spec.stage].gate.verdict, 'pass');
  assert.equal(report.stages[spec.stage].verdict, 'fail');
  assert.equal(report.consumerVerificationCalls, 0);
  assert.equal(report.desktopActionsAuthorized, false);
  const before = JSON.stringify(report);
  const folder = path.join(f.dir, 'report');
  writeWorkflowReviewBundle(report, folder);
  const root = fs.readFileSync(path.join(folder, 'stage-review.md'), 'utf8');
  const stage = fs.readFileSync(path.join(folder, 'stage-review', stageName(spec.stage) + '.md'), 'utf8');
  assert.equal(root, fs.readFileSync(path.join(golden, spec.id, 'stage-review.md.snap'), 'utf8'));
  assert.equal(stage, fs.readFileSync(path.join(golden, spec.id, stageName(spec.stage) + '.md.snap'), 'utf8'));
  assert.ok(root.split('\n').length <= 52);
  assert.doesNotMatch(root, /[a-f0-9]{64}|score：|schemaVersion|^## S\d/m);
  for (const title of ['1. 一句话', '2. 本阶段业务', '3. 本阶段固定', '4. 必须成立', '5. 本次 Actual',
    '6. Required', '7. 第一处', '8. 责任', '9. 机器']) assert.ok(stage.includes('## ' + title));
  assert.ok(stage.indexOf('## 7.') < stage.indexOf('## 9.'));
  assert.match(stage, /合成维护 fixture/);
  assert.doesNotMatch(stage.slice(0, stage.indexOf('## 9.')), /[a-f0-9]{64}|score：/);
  for (const link of (root + '\n' + stage).matchAll(/\]\(([^)]+)\)/g)) {
    const parent = link[1].startsWith('../') ? path.join(folder, 'stage-review') : folder;
    assert.ok(fs.existsSync(path.resolve(parent, link[1])), 'broken relative link ' + link[1]);
  }
  assert.equal(fs.readdirSync(path.join(folder, 'stage-review')).length, Number(spec.stage.slice(1)));
  assert.equal(JSON.stringify(report), before);
});

test('early case is UNKNOWN and never recommends Repair S3', t => {
  const f = diagnosticFixture(t, 'early-display-binding'); const r = f.check();
  const md = renderWorkflowBundle(r);
  assert.match(md.index, /Failure Owner: UNKNOWN/);
  assert.match(md.index, /Wrong display binding/);
  assert.match(md.stages.S03, /本次 Calculator 按钮输入数.*0/);
  assert.match(md.stages.S03, /本次 firstResult.*null/);
  assert.deepEqual(r.preservedUpstream, ['S1', 'S2']);
  assert.ok(!r.nextMinimumAction.includes('Repair S3'));
  assert.notEqual(r.failureOwner.stage, 'S3');
});

test('a late discovery may invalidate S3 without proving an S3 or Runtime owner', t => {
  const f = fixture(t);
  f.reviews[10].findings = [{ blocking: true, firstInvalidBoundary: 'S3', ownerStage: 'Runtime',
    reason: 'Late audit found that the saved execution did not establish the target binding.',
    evidence: [f.reviews[2].outputs[0]], nextEvidence: 'Compare the exact saved target request and return.' }];
  const r = f.run('S11', 'S12');
  assert.equal(r.firstInvalidBoundary, 'S3'); assert.equal(r.failureDiscoveryStage, 'S11');
  assert.equal(r.diagnosisStage, 'S11'); assert.equal(r.failureOwner.status, 'UNKNOWN');
  assert.deepEqual(r.preservedUpstream, ['S1', 'S2']);
  assert.match(renderWorkflowBundle(r).index, /只需继续打开：\[S11/);
});

test('owner name plus unrelated hash cannot invalidate an earlier stage', t => {
  const f = fixture(t);
  f.reviews[6].findings = [{ blocking: true, firstInvalidBoundary: 'S2', ownerStage: 'S2',
    reason: 'Unsupported blame', evidence: [f.reviews[6].evidence[0]] }];
  const r = f.run('S7', 'S8');
  assert.equal(r.firstInvalidBoundary, 'S7'); assert.equal(r.failureOwner.status, 'UNKNOWN');
  assert.ok(r.errors.some(e => e.code === 'FINDING_BOUNDARY_EVIDENCE'));
});

test('legacy hard failure, even with a claimed owner and score 100, leaves root cause UNKNOWN', t => {
  const f = fixture(t); f.reviews[6].hardFails = ['firstResult producer → consumer lost'];
  f.record.failureOwnerStage = 'S7'; const r = f.run('S7', 'S8');
  assert.equal(r.stages.S7.score, 100); assert.equal(r.failureOwner.status, 'UNKNOWN');
  assert.match(renderWorkflowStage(r, 'S7'), /旧验收没有记录/);
});

test('missing actual output stays UNKNOWN and fail; it is never an empty successful match', t => {
  const f = diagnosticFixture(t, 'middle-lost-consumer'); f.reviews[6].outputs = [];
  const r = f.check(); assert.equal(r.allowed, false); assert.equal(r.failureOwner.status, 'UNKNOWN');
  assert.equal(r.stages.S7.businessReview.assertions[0].status, 'UNKNOWN');
  assert.match(renderWorkflowStage(r, 'S7'), /\*\*未产出。\*\*/);
});

test('a bad upstream baseline does not assign output responsibility', t => {
  const f = diagnosticFixture(t, 'middle-lost-consumer');
  reviseAcceptance(f, a => a.stages.S7.businessAssertions[0].inputBaseline = ['different required baseline']);
  const r = f.check(); assert.equal(r.failureOwner.status, 'UNKNOWN');
  assert.equal(r.stages.S7.businessReview.assertions[0].status, 'UNKNOWN');
});

test('missing display ActualExecution cannot be covered by gate or score', t => {
  const f = fixture(t); f.reviews[2].evidence = []; const r = f.run('S3','S4');
  assert.equal(r.allowed, false); assert.equal(r.firstInvalidBoundary, 'S3');
  assert.equal(r.failureOwner.status, 'UNKNOWN');
  assert.ok(r.errors.some(e => e.code === 'MISSING_ACTUAL_ACTUALEXECUTION'));
});

test('failed required test cannot be hidden by a matching Actual', t => {
  const f = diagnosticFixture(t, 'early-display-binding');
  reviseAcceptance(f, a => a.stages.S3.businessAssertions[0].expected.value = false);
  f.reviews[2].requiredTests[0].status = 'fail';
  const r = f.check(); assert.equal(r.allowed, false);
  assert.equal(r.stages.S3.businessReview.assertions[0].status, 'FAIL');
});

test('duplicate or malformed frozen assertions fail closed', t => {
  const f = diagnosticFixture(t, 'early-display-binding');
  reviseAcceptance(f, a => a.stages.S3.businessAssertions.push(a.stages.S3.businessAssertions[0]));
  const r = f.check(); assert.equal(r.allowed, false);
  assert.ok(r.errors.some(e=>e.code === 'BUSINESS_ASSERTION_CONTRACT'));
});

test('ambiguous business sources remain UNKNOWN instead of choosing one', t => {
  const f = diagnosticFixture(t, 'early-display-binding');
  f.reviews[2].outputs.push(f.write('other.json','{"displayBindingVerified":true}', 'StageOutput'));
  const r = f.check(); assert.equal(r.stages.S3.businessReview.assertions[0].status, 'UNKNOWN');
});

test('text/HTML/link payloads in data do not become commands or active links', t => {
  const f = diagnosticFixture(t, 'early-display-binding');
  reviseAcceptance(f, a => a.stages.S3.businessAssertions[0].requirement = '<script>alert(1)</script> [run](https://bad.invalid) |\n# fake');
  const r = f.check(); const all = JSON.stringify(renderWorkflowBundle(r));
  assert.doesNotMatch(all, /<script>|\[run\]\(https:\/\/bad.invalid\)/);
  assert.match(all, /&#60;script&#62;/);
});

test('malformed record cannot invent first correct stage or an owner', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.dir,'bad.json'), '{}');
  const r = checkWorkflowStage({record:path.join(f.dir,'bad.json'), roots:[['run',f.dir]],from:'S2',to:'S3'});
  assert.equal(r.allowed,false); assert.equal(r.firstInvalidBoundary,null);
  assert.equal(r.failureOwner.status,'UNKNOWN'); assert.deepEqual(r.preservedUpstream,[]);
});

test('no details or future artifacts are rendered for not-run stages', t => {
  const f=fixture(t); const r=f.run('S2','S3'); const b=renderWorkflowBundle(r);
  assert.deepEqual(Object.keys(b.stages),['S01','S02']);
  assert.throws(()=>renderWorkflowStage(r,'S3'),/not-run/);
  const folder=path.join(f.dir,'report');writeWorkflowReviewBundle(r,folder);
  const index=JSON.parse(fs.readFileSync(path.join(folder,'snapshot-index.json'),'utf8'));
  assert.ok(!index.some(x=>['CandidateSource','QualificationRecord','ReferenceAnswer'].includes(x.ref.kind)));
});

test('the report bundle keeps the checked bytes, not later changed artifacts', t => {
  const f=diagnosticFixture(t,'early-display-binding');const r=f.check();
  fs.writeFileSync(path.join(f.dir,'business-output.json'),'{"displayBindingVerified":true}');
  const folder=path.join(f.dir,'report');writeWorkflowReviewBundle(r,folder);
  const index=JSON.parse(fs.readFileSync(path.join(folder,'snapshot-index.json'),'utf8'));
  const entry=index.find(x=>x.ref.path==='business-output.json');
  const bytes=fs.readFileSync(path.join(folder,entry.snapshot));
  assert.equal(JSON.parse(bytes).displayBindingVerified,false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.ref.sha256);
});

test('existing review directory is never overwritten, fabricated report cannot be published', t => {
  const f=fixture(t);const r=f.run('S2','S3');const folder=path.join(f.dir,'report');
  writeWorkflowReviewBundle(r,folder);const before=fs.readFileSync(path.join(folder,'stage-review.md'));
  assert.throws(()=>writeWorkflowReviewBundle(r,folder),/new check directory/);
  assert.deepEqual(fs.readFileSync(path.join(folder,'stage-review.md')),before);
  assert.throws(()=>writeWorkflowReviewBundle(JSON.parse(JSON.stringify(r)),path.join(f.dir,'fabricated')),/this checker invocation/);
});

test('new golden Calculator pages cannot enter a same-task Producer as a Method reference', t => {
  const f=fixture(t); const ref=f.write('workflows/agent-to-recipe/cases/calculator/stages/S11.md','Reference answer','Method');
  f.reviews[1].inputs.push(ref);const r=f.run('S2','S3');
  assert.ok(r.errors.some(e=>e.code==='FUTURE_OR_REFERENCE_INPUT'));
});

test('a pre-check artifact hash drift blocks comparison; no owner is invented', t => {
  const f=diagnosticFixture(t,'middle-lost-consumer');
  fs.writeFileSync(path.join(f.dir,'business-output.json'),'{}');const r=f.check();
  assert.equal(r.allowed,false);assert.equal(r.failureOwner.status,'UNKNOWN');
  assert.ok(r.errors.some(e=>e.code==='HASH_MISMATCH'));
});

test('CLI actually produces separate files while returning failure exit code 2', t => {
  const f=diagnosticFixture(t,'early-display-binding');f.check();
  const folder=path.join(f.dir,'cli-report');
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../../workflows/agent-to-recipe/scripts/check-workflow-stage.js'),
    '--record',path.join(f.dir,'review.json'),'--root','run='+f.dir,'--from','S3','--to','S4','--review-dir',folder],{encoding:'utf8'});
  assert.equal(result.status,2,result.stderr);assert.equal(JSON.parse(result.stdout).failureOwner.status,'UNKNOWN');
  assert.ok(fs.existsSync(path.join(folder,'stage-review','S03.md')));
});

test('full existing structural fixture remains structural PASS without asserting business qualification', t => {
  const f=fixture(t);const r=f.run('S12','S12',true);assert.equal(r.allowed,true,JSON.stringify(r.errors));
  assert.match(renderWorkflowReview(r),/本报告不单独证明完成/);
  assert.equal(r.consumerVerificationCalls,0);
});


test('an established output mismatch does not hide other unresolved blockers', t => {
  const f=diagnosticFixture(t,'middle-lost-consumer');f.reviews[6].hardFails=['Unresolved provenance failure'];
  const r=f.check();assert.equal(r.failureOwner.status,'UNKNOWN');
  assert.ok(r.stages.S7.businessReview.assertions[0].ownerProof);
  assert.ok(!r.nextMinimumAction.includes('只修正'));
});


test('mutation of the original checker result cannot be published as machine authority', t => {
  const f=diagnosticFixture(t,'early-display-binding');const r=f.check();r.allowed=true;
  assert.throws(()=>writeWorkflowReviewBundle(r,path.join(f.dir,'forged-pass')),/changed after evaluation/);
  assert.ok(!fs.existsSync(path.join(f.dir,'forged-pass')));
});
