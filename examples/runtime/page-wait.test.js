'use strict';

// Run from the repository root:
// ./dist/opendesk -script examples/runtime/page-wait.test.js -console-mode script
// This public smoke reuses the exact behavior cases registered by the formal
// Page unit family; it does not use private native injection seams.
function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'values differ') + ': expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  }
}

const requirementsPath = File.join(Execution.workdir, 'tests/runtime-api/page-wait-requirements.js');
assert(File.isFile(requirementsPath), 'Page wait requirements are missing: ' + requirementsPath);
const requirements = (0, eval)(File.read(requirementsPath) + '\n//# sourceURL=' + requirementsPath);
assert(Array.isArray(requirements) && requirements.length > 0, 'Page wait requirements registered no behavior');

const sourcePath = File.join(Execution.workdir, 'tests/runtime-api/page-wait-cases.js');
assert(File.isFile(sourcePath), 'shared Page wait cases are missing: ' + sourcePath);
const createPageWaitCases = (0, eval)(File.read(sourcePath) + '\n//# sourceURL=' + sourcePath);
assert(typeof createPageWaitCases === 'function', 'shared Page wait cases must export a factory');
const discoveredCases = createPageWaitCases({ assert, equal });
assert(Array.isArray(discoveredCases) && discoveredCases.length > 0, 'shared Page wait cases registered no cases');

function signature(item) {
  return JSON.stringify([item.group, item.name, item.covers]);
}

const requirementIds = new Set();
const requirementSignatures = new Set();
for (const requirement of requirements) {
  assert(requirement && typeof requirement === 'object', 'Page wait requirement must be an object');
  assert(typeof requirement.id === 'string' && requirement.id.length > 0, 'Page wait requirement has no stable id');
  assert(typeof requirement.group === 'string' && requirement.group.length > 0, 'Page wait requirement has no group: ' + requirement.id);
  assert(typeof requirement.name === 'string' && requirement.name.length > 0, 'Page wait requirement has no name: ' + requirement.id);
  assert(Array.isArray(requirement.covers) && requirement.covers.length > 0, 'Page wait requirement has no covers: ' + requirement.id);
  assert(!requirementIds.has(requirement.id), 'duplicate Page wait requirement id: ' + requirement.id);
  requirementIds.add(requirement.id);
  const metadata = signature(requirement);
  assert(!requirementSignatures.has(metadata), 'duplicate Page wait requirement metadata: ' + metadata);
  requirementSignatures.add(metadata);
}

const discoveredSignatures = new Set();
for (const item of discoveredCases) {
  assert(item && typeof item === 'object' && typeof item.run === 'function', 'invalid shared Page wait case');
  assert(typeof item.group === 'string' && typeof item.name === 'string' && Array.isArray(item.covers), 'invalid shared Page wait case metadata');
  const metadata = signature(item);
  assert(!discoveredSignatures.has(metadata), 'duplicate shared Page wait case: ' + metadata);
  discoveredSignatures.add(metadata);
  assert(requirementSignatures.has(metadata), 'unregistered shared Page wait case: ' + metadata);
}
equal(discoveredCases.length, requirements.length, 'Page wait required/discovered behavior count differs');

const cases = requirements.map((requirement) => {
  const metadata = signature(requirement);
  const matches = discoveredCases.filter((item) => signature(item) === metadata);
  equal(matches.length, 1, 'Page wait requirement must have exactly one shared case: ' + requirement.id);
  return { id: requirement.id, group: requirement.group, name: requirement.name, covers: requirement.covers, run: matches[0].run };
});

const result = {
  runId: Execution.id,
  required: requirements.length,
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  groups: {},
  tests: [],
};

for (const requirement of requirements) {
  result.groups[requirement.group] = result.groups[requirement.group] || { required: 0, executed: 0, passed: 0, failed: 0, skipped: 0 };
  result.groups[requirement.group].required += 1;
}

for (const item of cases) {
  const started = Date.now();
  result.executed += 1;
  const group = result.groups[item.group];
  group.executed += 1;
  try {
    await item.run();
    result.passed += 1;
    group.passed += 1;
    result.tests.push({ id: item.id, name: item.name, group: item.group, covers: item.covers, status: 'passed', durationMs: Date.now() - started });
    console.log('[PAGE-WAIT-SMOKE PASS] ' + item.id + ': ' + item.name);
  } catch (error) {
    result.failed += 1;
    group.failed += 1;
    result.tests.push({
      id: item.id,
      name: item.name,
      group: item.group,
      covers: item.covers,
      status: 'failed',
      durationMs: Date.now() - started,
      error: String(error && error.stack || error),
    });
    console.error('[PAGE-WAIT-SMOKE FAIL] ' + item.id + ': ' + item.name + ': ' + String(error && error.stack || error));
  }
}

result.status = result.failed === 0 && result.skipped === 0 && result.executed === result.required ? 'passed' : 'failed';
console.log('[PAGE-WAIT-SMOKE RESULT] ' + JSON.stringify(result));
if (result.status !== 'passed') throw new Error('Page wait smoke failed: ' + result.failed + '/' + result.required);
