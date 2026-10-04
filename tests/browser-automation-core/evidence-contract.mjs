import fs from 'node:fs';
import path from 'node:path';
import { ROOT, LIMITS } from '../../lab/browser-automation-core/config.mjs';

export function requiredCases() {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quality/browser-automation/core-demo-acceptance.json')));
  const base = spec.gates.flatMap(gate => (gate.cases || []).map(item => ({caseId: item.id, gate: gate.id, input: item.stimulus, expected: item.expect, assertions: [item.evidence]})));
  const extra = spec.supplementalAcceptance?.requiredCases || [];
  return [...base, ...extra];
}
export async function recordCase(report, gate, id, fn, persist) {
  const definition = requiredCases().find(item => item.caseId === id);
  if (!definition) throw Error(`UNREGISTERED_CASE:${id}`);
  const started = Date.now();
  const contract = {caseId: id, id, gate, level: report.level, candidateId: report.candidateId, runId: report.runId,
    preconditions: ['Authenticated pinned Demo Extension', 'Same source candidate', 'Owned fixture/tab when DOM applies'],
    input: definition.input, trigger: definition.trigger || definition.input,
    expected: definition.expected, independentAssertions: definition.assertions,
    deadlineMs: definition.deadlineMs || LIMITS.reconnectDeadlineMs, toleranceMs: LIMITS.deadlineToleranceMs,
    startedAt: new Date(started).toISOString(), status: 'NOT_RUN', actual: null, rawEvidencePaths: []};
  try { contract.actual = await fn(); contract.status = 'PASS'; contract.assertionsSatisfied = true; }
  catch (error) {
    if (report.gates && Object.hasOwn(report.gates, gate)) report.gates[gate] = 'FAIL';
    contract.status = 'FAIL'; contract.assertionsSatisfied = false; contract.actual = {errorCode: error.code || error.message,
      assertion: error.code === 'ERR_ASSERTION' ? {message: error.message, actual: error.actual, expected: error.expected} : null,
      response: error.response || null};
    throw error;
  } finally {
    contract.durationMs = Date.now() - started;
    const directory = path.join(report.directory, 'cases'); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    const file = path.join(directory, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(contract.actual, null, 2), {mode: 0o600});
    contract.rawEvidencePaths = [file]; contract.evidence = contract.actual;
    report.cases.push(contract); persist();
  }
}

export function completeCaseIndex(report, gates) {
  for (const definition of requiredCases().filter(item => gates.includes(item.gate))) {
    if (report.cases.some(item => item.caseId === definition.caseId)) continue;
    const status = report.status === 'BLOCKED' ? 'BLOCKED' : 'NOT_RUN';
    const actual = {reason: report.errorCode || 'EARLIER_CASE_FAILED', executed: false};
    const directory = path.join(report.directory, 'cases'); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    const file = path.join(directory, `${definition.caseId}.json`); fs.writeFileSync(file, JSON.stringify(actual), {mode: 0o600});
    report.cases.push({caseId: definition.caseId, id: definition.caseId, gate: definition.gate, level: report.level,
      candidateId: report.candidateId, runId: report.runId, preconditions: ['Earlier required condition unavailable'],
      input: definition.input, trigger: definition.trigger || definition.input, expected: definition.expected,
      independentAssertions: definition.assertions, deadlineMs: definition.deadlineMs || LIMITS.reconnectDeadlineMs,
      toleranceMs: LIMITS.deadlineToleranceMs, startedAt: null, durationMs: 0, status, assertionsSatisfied: false, actual, rawEvidencePaths: [file]});
  }
}
