'use strict';
// Versioned synthetic inputs only. No desktop, Candidate execution or model call.
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./stage-review-fixture.js');
const cases = require('../fixtures/stage-review-diagnostics/cases.json');
function diagnosticFixture(t, id) {
  const spec = cases.cases.find(item => item.id === id);
  if (!spec) throw new Error('Unknown versioned case: ' + id);
  const f = fixture(t);
  f.record.sourceNature = cases.sourceNature;
  const current = Number(spec.stage.slice(1)) - 1;
  const writeJSON = (name, document, kind) => f.write(name, JSON.stringify({
    schemaVersion: 'agent-to-recipe/v1', sourceNature: cases.sourceNature, ...document }), kind);
  const replaceOutput = (index, kind, ref) => {
    const outputs = f.reviews[index].outputs;
    const old = outputs.find(item => item.kind === kind);
    if (old) outputs.splice(outputs.indexOf(old), 1, ref); else outputs.push(ref);
    if (f.reviews[index + 1]) {
      f.reviews[index + 1].inputs = f.reviews[index + 1].inputs.filter(item => !old || item.path !== old.path);
      f.reviews[index + 1].inputs.push(ref);
    }
  };
  const input = writeJSON('business-input.json', spec.input, spec.inputKind);
  replaceOutput(current - 1, spec.inputKind, input);
  let output = { ...spec.output };
  if (spec.stage === 'S11') {
    const source = f.write('candidate.js', spec.source, 'CandidateSource');
    replaceOutput(current, 'CandidateSource', source);
    output = { ...output, scriptRef: source, scriptHash: source.sha256, dependencies: [] };
  }
  replaceOutput(current, spec.outputKind, writeJSON('business-output.json', output, spec.outputKind));
  // New synthetic acceptance is frozen before the check, not a rewrite of a
  // historical task's expected values or requested scope. Existing tests/scores
  // remain unchanged (even the intentionally misleading score of 100).
  const acceptance = JSON.parse(fs.readFileSync(path.join(f.dir, 'acceptance.json'), 'utf8'));
  acceptance.stages[spec.stage].businessAssertions = [{ ...spec.assertion, test: 'test-' + spec.stage }];
  const oldAcceptance = f.record.acceptanceRef;
  const acceptanceRef = f.write('acceptance.json', JSON.stringify(acceptance), 'Acceptance');
  f.record.acceptanceRef = acceptanceRef;
  for (const review of f.reviews) {
    review.inputs = review.inputs.map(ref => ref.path === oldAcceptance.path ? acceptanceRef : ref);
    review.audit.accessedRefs = [acceptanceRef];
  }
  f.reviews[current].humanContext = spec.context;
  // Scope contains only the stages checked. No later Candidate/Qualification
  // is even present in the active fixture record for early or middle cases.
  f.record.stages = f.reviews.slice(0, current + 1);
  delete f.record.final;
  return { ...f, spec, check: () => f.run(spec.stage, spec.to) };
}
module.exports = { diagnosticFixture, cases: cases.cases };
