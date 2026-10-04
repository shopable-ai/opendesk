import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, LIMITS } from '../../lab/browser-automation-core/config.mjs';
import { hash, sourceSnapshot } from '../../lab/browser-automation-core/candidate.mjs';
import { requiredCases } from './evidence-contract.mjs';
import { verifyRecord } from './independent-verifier.mjs';

export const readJSON = file => JSON.parse(fs.readFileSync(file));
function nonempty(file) {assert.ok(fs.statSync(file).isFile() && fs.statSync(file).size > 0, `EMPTY_EVIDENCE:${file}`);}
export function auditFunctional({candidate, components, A, BCD}) {
  assert.equal(candidate.candidateId, hash(JSON.stringify(candidate.files)), 'CANDIDATE_HASH_INVALID');
  for (const item of candidate.files) assert.equal(hash(fs.readFileSync(path.join(ROOT, item.file))), item.sha256, `SOURCE_CHANGED:${item.file}`);
  for (const report of [components, A, BCD]) { assert.equal(report.provenance.candidateId, candidate.candidateId, 'OLD_CANDIDATE'); for (const resource of report.provenance.files) assert.equal(resource.sha256, candidate.files.find(x=>x.file===resource.file)?.sha256, 'OLD_RESOURCE_HASH'); }
  assert.equal(components.results.length, 2);
  for (const item of components.results) {assert.equal(item.status, 'PASS'); assert.equal(item.exitCode, 0); nonempty(path.join(components.directory, `${item.level}.log`));}
  for (const report of [A, BCD]) {assert.equal(report.status, 'PASS'); assert.equal(report.level, 'live-browser'); assert.equal(report.candidateId, candidate.candidateId);}
  assert.deepEqual(BCD.gates, {B: 'PASS', C: 'PASS', D: 'PASS'});
  const all = [...A.cases, ...BCD.cases], ids = all.map(item => item.caseId);
  assert.equal(new Set(ids).size, ids.length, 'DUPLICATE_CASE');
  const requirements = requiredCases();
  for (const requirement of requirements) {
    const item = all.find(item => item.caseId === requirement.caseId); assert.ok(item, `MISSING_CASE:${requirement.caseId}`);
    assert.equal(item.status, 'PASS'); assert.equal(item.assertionsSatisfied, true, `ASSERTIONS_NOT_EXECUTED:${item.caseId}`);
    assert.equal(item.candidateId, candidate.candidateId); assert.ok(item.actual != null && !item.actual.errorCode, `UNKNOWN_OR_UNEXECUTED:${item.caseId}`);
    for (const key of ['level', 'preconditions', 'input', 'trigger', 'expected', 'independentAssertions', 'deadlineMs', 'durationMs', 'startedAt', 'runId']) assert.ok(item[key] != null, `CASE_CONTRACT_MISSING:${item.caseId}:${key}`);
    assert.ok(item.rawEvidencePaths.length > 0);
    for (const file of item.rawEvidencePaths) {nonempty(file); assert.deepEqual(readJSON(file), item.actual, `RAW_EVIDENCE_MISMATCH:${item.caseId}`);}
  }
  const expected = candidate.expectedLoaded;
  assert.equal(A.loadedResources.loadedResources.workerCodeSha256, expected.workerCodeSha256);
  assert.deepEqual(A.loadedResources.loadedResources.resources, expected.resources);
  assert.ok(BCD.loadedDocuments.length >= 3);
  for (const document of BCD.loadedDocuments) {
    assert.equal(document.loadedResources.contentCodeSha256, expected.contentCodeSha256);
    assert.equal(document.loadedResources.locatorCodeSha256, expected.locatorCodeSha256);
    for (const field of ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document']) assert.ok(document[field] != null);
  }
  assert.ok(BCD.golden.length >= 3); assert.equal(new Set(BCD.golden.map(x => x.execution.orderId)).size, BCD.golden.length);
  for (const item of BCD.golden) {assert.equal(item.independent.status, 'PASS'); assert.equal(item.independent.verifierRunAfterExecution, true); verifyRecord(item.independent.serverSnapshot, item.execution);}
  assert.equal(BCD.finalRedactionScan.status, 'PASS'); const redaction = readJSON(BCD.finalRedactionScan.reportPath); assert.equal(redaction.status, 'PASS'); assert.ok(redaction.inventory.length > 0);
  for (const item of redaction.inventory) {nonempty(item.file); assert.equal(hash(fs.readFileSync(item.file)), item.sha256, 'OUTPUT_CHANGED_AFTER_SCAN');}
  assert.ok(A.traceFiles.length && BCD.traceFiles.length);
  const spec = readJSON(path.join(ROOT, 'docs/quality/browser-automation/core-demo-acceptance.json'));
  const traces = [...new Set([...A.traceFiles, ...BCD.traceFiles])].flatMap(file => {nonempty(file); return fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);});
  for (const row of traces) for (const field of spec.trace.requiredFields) assert.ok(Object.hasOwn(row, field), `TRACE_FIELD_MISSING:${field}`);
  const terminal = traces.filter(row => ['SUCCESS', 'ERROR'].includes(row.status));
  // Duplicate input request IDs deliberately rejected by component tests are outside these live runs.
  const counts = new Map(); for (const row of terminal) {const key = `${row.executionId}:${row.requestId}`; counts.set(key, (counts.get(key) || 0) + 1);}
  for (const count of counts.values()) assert.equal(count, 1, 'MULTIPLE_TERMINALS');
  for (const row of traces.filter(row => row.action && ['fill', 'click'].includes(row.operation))) for (const field of ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document', 'resolvedTarget']) assert.ok(row[field] != null, `ACTION_IDENTITY_UNKNOWN:${field}`);
  assert.ok(BCD.cleanup.length && BCD.cleanup.every(item => item.status === 'PASS'));
  return {status: 'PASS', candidateId: candidate.candidateId, requiredCaseCount: requirements.length, observedCaseCount: all.length, traces: traces.length};
}
export function auditVisual(visual, BCD, candidate) {
  assert.equal(visual?.status, 'PASS'); assert.equal(visual.candidateId, candidate.candidateId); assert.equal(visual.runId, BCD.runId);
  for (const key of ['windowSize', 'whitespace', 'wrapping', 'clipping', 'inputAlignment', 'buttonAlignment', 'threeCompletedOrders']) assert.equal(visual.checks?.[key], true, `VISUAL_UNREVIEWED:${key}`);
  assert.ok(visual.screenshots?.length > 0 && visual.observationPath);
  nonempty(visual.observationPath);
  const observation = readJSON(visual.observationPath); assert.equal(observation.candidateId, candidate.candidateId); assert.equal(observation.document, BCD.initialScope.document);
  assert.ok(observation.snapshot && observation.snapshot.includes('Completed'));
  for (const image of visual.screenshots) {
    nonempty(image.file); const bytes = fs.readFileSync(image.file); assert.equal(hash(bytes), image.sha256);
    // Chrome's screenshot provider returns JPEG; both real raster formats are valid evidence.
    const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    const jpeg = bytes.subarray(0, 3).toString('hex') === 'ffd8ff' && bytes.subarray(-2).toString('hex') === 'ffd9';
    assert.ok(png || jpeg, 'VISUAL_IMAGE_FORMAT_INVALID');
  }
  const request = readJSON(path.join(BCD.directory, 'visual-request.json'));
  assert.ok(Date.parse(visual.observedAt) >= Date.parse(request.requestedAt));
  assert.ok(Date.parse(visual.reviewedAt) - Date.parse(request.requestedAt) <= LIMITS.visualDeadlineMs, 'VISUAL_REVIEW_EXPIRED');
  return {status: 'PASS', screenshots: visual.screenshots};
}
export function auditCore(index) {
  const candidate = readJSON(index.candidate), components = readJSON(index.components), A = readJSON(index.A), BCD = readJSON(index.BCD);
  const functional = auditFunctional({candidate, components, A, BCD}), visual = auditVisual(BCD.visualEvidence, BCD, candidate);
  const delivery = readJSON(index.delivery); assert.equal(delivery.status, 'PASS'); assert.equal(delivery.candidateId, candidate.candidateId);
  for (const command of ['setup', 'start', 'doctor', 'tabs', 'fixture', 'golden', 'verify-golden', 'verify', 'cleanup']) {
    const attempts = delivery.commands.filter(item => item.command === command);
    assert.ok(attempts.length > 0, `PUBLIC_COMMAND_NOT_RUN:${command}`);
    for (const item of attempts) {assert.equal(item.status, 'PASS'); assert.equal(item.cwd, ROOT); assert.equal(item.exitCode, 0); nonempty(item.outputPath); assert.ok(fs.readFileSync(path.join(ROOT, 'lab/browser-automation-core/README.md'), 'utf8').includes(item.exactCommand), `COMMAND_NOT_IN_README:${command}`);}
  }
  for (const condition of ['repeatedSetup', 'installedResources', 'cleanupOwnership', 'cleanupPreservedEvidence', 'reinstallDoctor']) assert.equal(delivery[condition]?.status, 'PASS', `DELIVERY_MISSING:${condition}`);
  const negatives = readJSON(index.auditNegatives); assert.equal(negatives.status, 'PASS'); assert.equal(negatives.candidateId, candidate.candidateId);
  for (const name of ['missing-case', 'duplicate-case', 'old-candidate', 'missing-raw', 'broken-lineage', 'unexecuted-pass', 'unknown-pass', 'visual-marker']) assert.ok(negatives.results.some(item => item.name === name && item.rejected === true));
  assert.equal(sourceSnapshot().candidateId, candidate.candidateId);
  return {name: 'Browser Automation Core Demo', status: 'PASS', candidateId: candidate.candidateId, functional, visual, delivery: index.delivery, preservedEvidence: index};
}
