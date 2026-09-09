'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const skillRoot = path.join(
  repositoryRoot,
  'workflows', 'human-to-recipe', 'skills', 'human-to-recipe',
);
const schemaPath = path.join(skillRoot, 'references', 'semantic-build-plan.schema.json');
const goldenPath = path.join(
  repositoryRoot,
  'workflows', 'human-to-recipe', 'golden-samples', 'calculator-115.semantic-build-plan.json',
);
const {validateSemanticBuildPlan} = require(path.join(
  skillRoot,
  'scripts', 'validate-semantic-build-plan.js',
));

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codes(items) {
  return items.map(item => item.code);
}

test('SemanticBuildPlan schema is a strict machine-readable v1 contract', () => {
  const schema = readJSON(schemaPath);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes('actionDispositions'));
  assert.ok(schema.required.includes('businessEpisodes'));
  assert.ok(schema.required.includes('sourceMap'));
  assert.deepEqual(
    schema.$defs.actionDisposition.properties.disposition.enum,
    ['business', 'runtime-guard', 'qualification', 'evidence', 'excluded', 'unknown'],
  );
});

test('Calculator golden is production-ready under static validation', () => {
  const result = validateSemanticBuildPlan(readJSON(goldenPath), {cwd: repositoryRoot});
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.productionReady, true, JSON.stringify(result.blockers));
  assert.equal(result.sourceChecked, false);
  assert.deepEqual(result.summary, {
    actionCount: 12,
    businessEpisodeCount: 3,
    unknownCount: 0,
  });
  assert.ok(codes(result.warnings).includes('RENDERER_NOT_IMPLEMENTED'));
});

const calculatorActionsPath = path.join(
  repositoryRoot,
  '.runtime', 'recordings', 'rec-20260909T113509.231387000Z-e2232547fa4e', 'actions.json',
);
test('Calculator golden rechecks actual actions bytes when the local source package exists', {
  skip: !fs.existsSync(calculatorActionsPath),
}, () => {
  const result = validateSemanticBuildPlan(readJSON(goldenPath), {
    cwd: repositoryRoot,
    checkSource: true,
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.productionReady, true, JSON.stringify(result.blockers));
  assert.equal(result.sourceChecked, true);
});

test('unknown action and missing intent stop production generation', () => {
  const plan = clone(readJSON(goldenPath));
  plan.intent.businessGoal = '[请用户补充]';
  plan.actionDispositions[2].disposition = 'unknown';
  plan.sourceMap[2].disposition = 'unknown';
  plan.businessEpisodes[0].actionIds = plan.businessEpisodes[0].actionIds.filter(id => id !== 'a0003');
  delete plan.sourceMap[2].episodeId;
  const result = validateSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(result.valid, false);
  assert.equal(result.productionReady, false);
  assert.ok(codes(result.errors).includes('UNRESOLVED_INTENT'));
  assert.ok(codes(result.blockers).includes('UNKNOWN_ACTION'));
});

test('duplicate action consumption and event-style Episode names are rejected', () => {
  const plan = clone(readJSON(goldenPath));
  plan.businessEpisodes[0].name = 'click1';
  plan.businessEpisodes[1].actionIds.push('a0002');
  const result = validateSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(result.valid, false);
  assert.equal(result.productionReady, false);
  assert.ok(codes(result.errors).includes('EVENT_STYLE_EPISODE_NAME'));
  assert.ok(codes(result.errors).includes('DUPLICATE_BUSINESS_CONSUMPTION'));
});

test('source map conflicts and a Gate that freezes another source are rejected', () => {
  const plan = clone(readJSON(goldenPath));
  plan.sourceMap[1].disposition = 'evidence';
  plan.qualification.gate.productionSource.sha256 = '0'.repeat(64);
  const result = validateSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(result.valid, false);
  assert.equal(result.productionReady, false);
  assert.ok(codes(result.errors).includes('SOURCE_MAP_DISPOSITION_CONFLICT'));
  assert.ok(codes(result.errors).includes('GATE_SOURCE_MISMATCH'));
});

test('semantic unavailable remains explicit and requires a resolved locator path', () => {
  const plan = clone(readJSON(goldenPath));
  plan.semanticCoverage = {
    verified: 11,
    unavailable: 1,
    notRequested: 0,
    notApplicable: 0,
    missing: 0,
    unavailableWithReason: 1,
    unavailableWithoutReason: 0,
    issues: [{code: 'semantic-unavailable', count: 1}],
  };
  plan.targets[1].locator.status = 'unavailable';
  plan.targets[1].unknowns = ['a0002 has no authorized semantic or geometry locator conclusion'];
  const result = validateSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.productionReady, false);
  assert.ok(codes(result.blockers).includes('LOCATOR_UNAVAILABLE'));
  assert.ok(codes(result.blockers).includes('UNRESOLVED_TARGET'));
  assert.equal(plan.semanticCoverage.unavailable, 1);
});
