import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { auditFunctional, auditVisual, readJSON } from './audit-core.mjs';

export function runAuditNegatives(index, directory) {
  const original = {candidate: readJSON(index.candidate), components: readJSON(index.components), A: readJSON(index.A), BCD: readJSON(index.BCD)};
  auditFunctional(original); auditVisual(original.BCD.visualEvidence, original.BCD, original.candidate);
  const results = [];
  const mutations = {
    'missing-case': copy => copy.A.cases.splice(0, 1),
    'duplicate-case': copy => copy.A.cases.push(structuredClone(copy.A.cases[0])),
    'old-candidate': copy => {copy.A.provenance.candidateId = 'old-resource-hash';},
    'missing-raw': copy => {copy.A.cases[0].rawEvidencePaths = [path.join(directory, 'does-not-exist.json')];},
    'broken-lineage': copy => {copy.BCD.golden[0].execution.fillSourceReadRequestId = 'broken';},
    'unexecuted-pass': copy => {Object.assign(copy.A.cases[0], {status: 'PASS', assertionsSatisfied: false, actual: null});},
    'unknown-pass': copy => {copy.A.cases[0].actual = {outcome: 'OUTCOME_UNKNOWN'};},
    'visual-marker': copy => {copy.BCD.visualEvidence = {status: 'PASS'};},
  };
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  for (const [name, mutate] of Object.entries(mutations)) {
    const copy = structuredClone(original); mutate(copy); let reason;
    assert.throws(() => {try {auditFunctional(copy); auditVisual(copy.BCD.visualEvidence, copy.BCD, copy.candidate);} catch (error) {reason = error.message; throw error;}});
    fs.writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(copy, null, 2), {mode: 0o600});
    results.push({name, rejected: true, reason});
  }
  const report = {status: 'PASS', candidateId: original.candidate.candidateId, mutationsOnlyOnIsolatedCopies: true, results};
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), {mode: 0o600}); return report;
}
