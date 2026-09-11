'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const skillRoot = path.join(
  repositoryRoot, 'workflows', 'human-to-recipe', 'skills', 'human-to-recipe',
);
const goldenPlanPath = path.join(
  repositoryRoot, 'workflows', 'human-to-recipe', 'golden-samples',
  'calculator-115.semantic-build-plan.json',
);
const goldenRecipePath = path.join(
  repositoryRoot, 'workflows', 'human-to-recipe', 'golden-samples', 'calculator.js',
);
const currentRecordingPlanPath = path.join(
  repositoryRoot, '.runtime', 'recordings',
  'rec-20260909T182158.370718000Z-27868797ab72', 'generated',
  'basic.semantic-build-plan.v7.json',
);
const rubricPath = path.join(skillRoot, 'references', 'semantic-quality-rubric.json');
const {
  RUBRIC,
  extractRuntimeCalls,
  scoreSemanticBuildPlan,
  validateRubric,
} = require(path.join(skillRoot, 'scripts', 'score-semantic-build-plan.js'));

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function relative(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function bindGoldenRecipe(plan, recipePath = goldenRecipePath) {
  const digest = hash(fs.readFileSync(recipePath));
  plan.outputs.productionRecipe = {path: relative(recipePath), sha256: digest};
  plan.qualification.gate.productionSource = {path: relative(recipePath), sha256: digest};
  plan.verification.generated = 'present';
  return plan;
}

function addExplicitConfirmedIntent(plan) {
  plan.intent.resolution = {
    businessGoal: {status: 'confirmed', sourceRefs: ['intent.businessGoal']},
    successConditions: {status: 'confirmed', sourceRefs: ['intent.successConditions']},
    sideEffects: {status: 'confirmed', sourceRefs: ['intent.allowedSideEffects']},
  };
  return plan;
}

function gate(report, id) {
  return report.hardGates.find(item => item.id === id);
}

function dimension(report, id) {
  return report.dimensions.find(item => item.id === id);
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).reverse().map(key => [key, reverseObjectKeys(value[key])]),
  );
}

function withRuntimeDirectory(run) {
  const parent = path.join(repositoryRoot, '.runtime', 'tests', 'human-to-recipe');
  fs.mkdirSync(parent, {recursive: true});
  const directory = fs.mkdtempSync(path.join(parent, 'semantic-quality-'));
  try {
    return run(directory);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('rubric is deterministic, totals 100, and fixes the 95 plus dimension policy', () => {
  const contract = validateRubric(readJSON(rubricPath));
  assert.equal(contract.total, 100);
  assert.equal(RUBRIC.passThreshold, 95);
  assert.equal(RUBRIC.dimensions.length, 6);
  assert.ok(RUBRIC.dimensions.every(item => item.minimumPoints < item.maxPoints));
  assert.ok(RUBRIC.runtimeApiPolicy.authoritativeSources.length >= 1);
  assert.ok(RUBRIC.runtimeApiPolicy.authoritativeSources.every(source =>
    fs.existsSync(path.join(repositoryRoot, source))));
  assert.equal(contract.checkIds.size, 30);
});

test('Calculator plan plus frozen production golden is a 100-point positive', () => {
  const plan = addExplicitConfirmedIntent(bindGoldenRecipe(clone(readJSON(goldenPlanPath))));
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, true, JSON.stringify(report, null, 2));
  assert.equal(report.totalScore, 100);
  assert.match(report.tooling.scorer.sha256, /^[a-f0-9]{64}$/);
  assert.match(report.tooling.validator.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    report.tooling.scorer.sha256,
    hash(fs.readFileSync(path.join(skillRoot, 'scripts', 'score-semantic-build-plan.js'))),
  );
  assert.equal(
    report.tooling.validator.sha256,
    hash(fs.readFileSync(path.join(skillRoot, 'scripts', 'validate-semantic-build-plan.js'))),
  );
  const layering = dimension(report, 'oracle-gate-and-evidence-separation');
  const productionSurface = layering.checks.find(
    check => check.id === 'SQ-LAYER-04-production-api-surface',
  );
  assert.ok(productionSurface.evidence[0].observed.calls.includes('Accessibility.snapshot'));
  assert.deepEqual(productionSurface.evidence[0].observed.layerViolations, []);
  assert.equal(report.staticOnly.syntheticallyVerified, 'passed');
  assert.equal(report.staticOnly.liveVerified, 'not-run');
  assert.equal(report.staticOnly.qualified, 'not-run');
  assert.equal(report.staticOnly.visualVerified, 'not-run');
  assert.ok(report.hardGates.every(item => item.passed));
  assert.ok(report.dimensions.every(item => item.passed));
  for (const scoredDimension of report.dimensions) {
    for (const check of scoredDimension.checks) {
      assert.ok(Array.isArray(check.evidence) && check.evidence.length > 0);
      assert.ok(check.evidence.every(item => typeof item.path === 'string' && item.path.length > 0));
      assert.equal(check.earned, check.passed ? check.points : 0);
    }
  }
});

test('legacy Calculator intent remains passing but loses only explicit-resolution maintainability point', () => {
  const plan = bindGoldenRecipe(clone(readJSON(goldenPlanPath)));
  delete plan.intent.resolution;
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, true, JSON.stringify(report, null, 2));
  assert.equal(report.totalScore, 99);
  assert.equal(dimension(report, 'maintainability').score, 4);
});

test('current 16-action recording is source-valid but blocked at 75 without invented intent', {
  skip: !fs.existsSync(currentRecordingPlanPath),
}, () => {
  const report = scoreSemanticBuildPlan(readJSON(currentRecordingPlanPath), {cwd: repositoryRoot});
  assert.equal(report.validator.valid, true, JSON.stringify(report.validator.errors));
  assert.equal(report.validator.sourceChecked, true);
  assert.equal(report.validator.productionReady, false);
  assert.equal(report.totalScore, 75);
  assert.equal(report.pass, false);
  assert.equal(gate(report, 'HG-04-resolved-intent').passed, false);
  assert.equal(gate(report, 'HG-05-authorized-side-effects').passed, false);
  assert.equal(gate(report, 'HG-06-no-production-unknowns').passed, false);
  assert.equal(report.validator.summary.unknownCount, 16);
});

test('a sourced candidate adds knowledge without lowering score or bypassing blockers', {
  skip: !fs.existsSync(currentRecordingPlanPath),
}, () => {
  const basePlan = readJSON(currentRecordingPlanPath);
  const base = scoreSemanticBuildPlan(basePlan, {cwd: repositoryRoot});
  const enrichedPlan = clone(basePlan);
  enrichedPlan.applicationKnowledge.push({
    id: 'sourced-candidate',
    statement: 'a historical sample supports a locator candidate, not a verified target',
    kind: 'candidate',
    sourceRefs: ['historical-sample:input-area'],
  });
  const enriched = scoreSemanticBuildPlan(enrichedPlan, {cwd: repositoryRoot});
  const check = dimension(
    enriched, 'semantic-fidelity-and-business-abstraction',
  ).checks.find(item => item.id === 'SQ-SEM-05-provenanced-knowledge');

  assert.equal(enriched.totalScore, base.totalScore);
  assert.equal(check.passed, true);
  assert.equal(check.evidence[0].observed.candidateCount, 1);
  assert.equal(check.evidence[0].observed.unprovenancedCount, 0);
  assert.equal(enriched.pass, false);
  assert.equal(enriched.validator.productionReady, false);
  assert.equal(gate(enriched, 'HG-06-no-production-unknowns').passed, false);
});

test('deleting frozen source structure fails schema and source gates', () => {
  const plan = addExplicitConfirmedIntent(bindGoldenRecipe(clone(readJSON(goldenPlanPath))));
  delete plan.source.rawReference;
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, false);
  assert.equal(gate(report, 'HG-01-valid-schema').passed, false);
  assert.equal(gate(report, 'HG-02-source-bytes').passed, false);
  assert.ok(report.validator.errors.some(item => item.code === 'SCHEMA_VALIDATION'));
});

test('forged source-event mapping fails actual-byte trace even when narrative remains unchanged', () => {
  const plan = addExplicitConfirmedIntent(bindGoldenRecipe(clone(readJSON(goldenPlanPath))));
  plan.actionDispositions[0].sourceEventIds[0] = 'e999999999999';
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, false);
  assert.equal(gate(report, 'HG-02-source-bytes').passed, false);
  assert.equal(gate(report, 'HG-03-action-trace').passed, false);
  assert.ok(report.validator.blockers.some(item => item.code === 'SOURCE_EVENT_MISMATCH'));
});

test('unknown disposition cannot be offset by otherwise perfect dimensions', () => {
  const plan = addExplicitConfirmedIntent(bindGoldenRecipe(clone(readJSON(goldenPlanPath))));
  plan.actionDispositions[1].disposition = 'unknown';
  plan.sourceMap[1].disposition = 'unknown';
  plan.businessEpisodes[0].actionIds = plan.businessEpisodes[0].actionIds
    .filter(actionId => actionId !== 'a0002');
  delete plan.sourceMap[1].episodeId;
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, false);
  assert.equal(gate(report, 'HG-06-no-production-unknowns').passed, false);
  assert.equal(report.decision.totalThresholdPassed, true);
  assert.equal(report.decision.hardGatesPassed, false);
});

test('coordinate fallback and implicit action fallback lower robustness and fail schema gate', () => {
  const plan = addExplicitConfirmedIntent(bindGoldenRecipe(clone(readJSON(goldenPlanPath))));
  plan.targets[1].locator.fallbackPolicy = 'explicit-ordered';
  plan.targets[1].geometry.projectionApi = 'none';
  plan.actionStrategies[0].noImplicitFallback = false;
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, false);
  assert.equal(gate(report, 'HG-01-valid-schema').passed, false);
  assert.ok(dimension(report, 'target-guard-and-recovery-robustness').score < 19);
});

test('unregistered Runtime primitive fails the legal-primitive hard gate', () => {
  const plan = addExplicitConfirmedIntent(bindGoldenRecipe(clone(readJSON(goldenPlanPath))));
  plan.actionStrategies[0].apiCalls.push('mouse.retiredPrimitive');
  const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
  assert.equal(report.pass, false);
  assert.equal(gate(report, 'HG-08-legal-primitives').passed, false);
  assert.ok(dimension(report, 'maintainability').score < 5);
});

test('qualification-only observation mixed into production fails layer separation', () => {
  withRuntimeDirectory(directory => {
    const recipePath = path.join(directory, 'oracle-mixed.recipe.js');
    const source = fs.readFileSync(goldenRecipePath, 'utf8')
      + '\nawait page.screenshot({target: "activeWindow"});\n';
    fs.writeFileSync(recipePath, source);
    const plan = addExplicitConfirmedIntent(bindGoldenRecipe(
      clone(readJSON(goldenPlanPath)), recipePath,
    ));
    const report = scoreSemanticBuildPlan(plan, {cwd: repositoryRoot});
    assert.deepEqual(extractRuntimeCalls(source).includes('page.screenshot'), true);
    assert.equal(report.pass, false);
    assert.equal(gate(report, 'HG-07-layer-separation').passed, false);
    assert.ok(dimension(report, 'oracle-gate-and-evidence-separation').score < 14);
  });
});

test('object-key order and source whitespace are score-preserving metamorphic changes', () => {
  withRuntimeDirectory(directory => {
    const recipePath = path.join(directory, 'formatted.recipe.js');
    fs.writeFileSync(recipePath, '\n\n' + fs.readFileSync(goldenRecipePath, 'utf8') + '\n');
    const basePlan = addExplicitConfirmedIntent(bindGoldenRecipe(
      clone(readJSON(goldenPlanPath)), recipePath,
    ));
    const base = scoreSemanticBuildPlan(basePlan, {cwd: repositoryRoot});
    const transformed = scoreSemanticBuildPlan(reverseObjectKeys(basePlan), {cwd: repositoryRoot});
    assert.equal(base.pass, true, JSON.stringify(base, null, 2));
    assert.equal(transformed.pass, true, JSON.stringify(transformed, null, 2));
    assert.equal(transformed.totalScore, base.totalScore);
    assert.deepEqual(
      transformed.dimensions.map(item => [item.id, item.score]),
      base.dimensions.map(item => [item.id, item.score]),
    );
  });
});
