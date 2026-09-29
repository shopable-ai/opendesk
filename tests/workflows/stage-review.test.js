'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { valueLineage, renderReview } = require('../../workflows/agent-to-recipe/scripts/stage-review.js');
const { checkArtifactChain } = require('../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');
const { representationFixture } = require('./tools/artifact-representation-fixture.js');

function entries(origin, mapping) {
  return {
    dossier: { parsed: { runtimeValues: [{ name: 'result', origin, consumers: ['final output'] }] } },
    distilled: { parsed: { steps: [{ stepId: 'read-step', sourceActionRefs: ['read-final'] }] } },
    procedure: { parsed: { businessSteps: [{ stepId: 'read-business', sourceStepRefs: ['read-step'] }] } },
    candidate: { parsed: { sourceMapping: [mapping] } },
  };
}

test('review projects structured origin and explicit code region without numeric IDs', () => {
  const documents = entries({ actionRef: 'read-final' }, {
    businessStepRefs: ['read-business'], line: 17, rule: 'read',
  });
  const before = JSON.stringify(documents);
  const [record] = valueLineage(documents);
  assert.equal(record.action, 'read-final');
  assert.deepEqual(record.distilled, ['read-step']);
  assert.deepEqual(record.business, ['read-business']);
  assert.deepEqual(record.code, ['line 17: read']);
  assert.equal(record.qualification, 'not-run');
  assert.equal(JSON.stringify(documents), before);
});

test('review does not invent missing origins or infer mappings from rule prose', () => {
  const [record] = valueLineage(entries({}, { line: 17, rule: 'read-business' }));
  assert.equal(record.action, 'missing');
  assert.deepEqual(record.distilled, []);
  assert.deepEqual(record.code, []);
  const [unmapped] = valueLineage(entries({ actionRef: 'read-final' }, {
    businessStepRefs: ['other-business'], line: 17, rule: 'read-business',
  }));
  assert.deepEqual(unmapped.code, []);
});

test('review retains function declarations alongside code regions', () => {
  const [record] = valueLineage(entries({ actionRef: 'read-final' }, {
    businessStepRefs: ['read-business'], function: 'readResult', line: 17, rule: 'read',
  }));
  assert.deepEqual(record.code, ['readResult', 'line 17: read']);
});

test('accepted alternate representations retain blocked business dataflow in review', t => {
  const fixture = representationFixture(t);
  const report = checkArtifactChain({ ...fixture.options, through: 'candidate' });
  assert.equal(report.verdict, 'pass', JSON.stringify(report.errors));
  assert.ok(report.valueLineage.length > 0);
  for (const record of report.valueLineage) {
    assert.notEqual(record.action, 'missing');
    assert.ok(record.code.some(location => location.startsWith('line ')));
  }
  assert.equal(report.businessDataflow.verdict, 'unknown');
  assert.equal(report.businessDataflow.releaseBlocked, true);
  assert.equal(report.liveQualificationGranted, false);
  const markdown = renderReview(report);
  assert.match(markdown, /候选函数／代码区域（声明）/);
  assert.match(markdown, /声明，不是真实运行证明/);
  assert.match(markdown, /business dataflow requires independent exact-byte consumer verification/);
  assert.doesNotMatch(markdown, /direct await\/spread source pattern/);
});
