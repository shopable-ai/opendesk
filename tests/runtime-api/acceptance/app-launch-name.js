'use strict';

const calculatorBundleID = 'com.apple.calculator';
const canonicalTarget = { bundleId: calculatorBundleID };
const input = Execution.input && typeof Execution.input === 'object' && !Array.isArray(Execution.input)
  ? Execution.input
  : {};
if (Object.prototype.hasOwnProperty.call(input, 'requireColdStart') && typeof input.requireColdStart !== 'boolean') {
  throw new Error('requireColdStart must be a boolean when provided');
}
const requireColdStart = input.requireColdStart === true;
const aliases = [
  { label: 'string-zh', target: '计算器' },
  { label: 'object-zh', target: { name: '计算器' } },
  { label: 'object-en', target: { name: 'Calculator' } },
  { label: 'bundle-id', target: canonicalTarget },
];
const evidenceRoot = File.join(Execution.workdir, '.runtime', 'tests', 'runtime-api', 'app-name-launch');
const executionEvidenceRoot = File.join(Execution.artifactDir, 'app-name-launch');
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  executionId: Execution.id,
  artifactDir: Execution.artifactDir,
  target: canonicalTarget,
  requireColdStart,
  platform: null,
  backend: null,
  before: null,
  coldStart: 'Not Evaluated',
  launches: [],
  checks: {},
  screenshot: null,
  cleanup: { expectedInRuntimeEvents: ['appWorkers', 'appPending'] },
};

function fail(message, detail) {
  throw new Error(`${message}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
}

function sortedPIDs(group) {
  if (!group || !Array.isArray(group.pids)) return [];
  return group.pids.map(Number).sort((left, right) => left - right);
}

function samePIDs(left, right) {
  return JSON.stringify(sortedPIDs(left)) === JSON.stringify(sortedPIDs(right));
}

function observedGroup(group) {
  return {
    identity: group && group.identity,
    name: group && group.name,
    bundleId: group && group.bundleId,
    path: group && group.path,
    pids: sortedPIDs(group),
    instances: (group && group.instances || []).map(instance => ({
      pid: Number(instance.pid), name: instance.name, bundleId: instance.bundleId, path: instance.path,
    })),
  };
}

function assertReadyGroup(label, group) {
  if (!group || group.running !== true) fail(`${label} did not return a running group`, group);
  if (!group.identity || group.identity.kind !== 'bundleId' || group.identity.value !== calculatorBundleID) {
    fail(`${label} returned a non-canonical identity`, observedGroup(group));
  }
  if (group.bundleId !== calculatorBundleID) fail(`${label} returned an unexpected observed bundle ID`, observedGroup(group));
  const pids = sortedPIDs(group);
  if (pids.length === 0 || pids.some(pid => !Number.isInteger(pid) || pid <= 0)) {
    fail(`${label} did not return observed PIDs`, observedGroup(group));
  }
  const windows = window.list().filter(item => pids.includes(Number(item && item.pid)));
  if (windows.length === 0) fail(`${label} resolved before a matching window was observable`, { pids, windows });
  return { group: observedGroup(group), windows: windows.map(item => ({
    id: item.id, pid: Number(item.pid), title: item.title, x: item.x, y: item.y, width: item.width, height: item.height,
  })) };
}

async function expectCode(label, operation, code) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  if (!caught || caught.code !== code) {
    fail(`${label} did not reject with ${code}`, { code: caught && caught.code, message: caught && caught.message });
  }
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const text = JSON.stringify(report, null, 2);
  File.ensureDir(evidenceRoot);
  File.ensureDir(executionEvidenceRoot);
  File.write(File.join(evidenceRoot, 'latest.json'), text);
  File.write(File.join(executionEvidenceRoot, 'report.json'), text);
}

async function main() {
  const capabilities = App.getCapabilities();
  report.platform = capabilities.platform;
  report.backend = capabilities.backend;
  if (capabilities.platform !== 'darwin' || capabilities.verified !== true) {
    fail('this acceptance requires the macOS native-identity App backend', capabilities);
  }

  const before = App.get(canonicalTarget);
  report.before = before ? observedGroup(before) : null;
  report.coldStart = before ? 'Not Evaluated (Calculator was already running)' : 'Evaluated';
  if (requireColdStart && before) {
    fail('COLD_START_PRECONDITION: Calculator was already running; no App.launch call was made', report.before);
  }

  for (const alias of aliases) {
    const group = await App.launch(alias.target, { waitUntilReady: 'window', timeout: 10000 });
    const ready = assertReadyGroup(alias.label, group);
    const processReady = await App.waitForLaunch(alias.target, { waitUntilReady: 'process', timeout: 10000 });
    assertReadyGroup(`${alias.label} process readiness`, processReady);
    report.launches.push({
      label: alias.label,
      input: alias.target,
      process: observedGroup(processReady),
      ...ready,
    });
  }

  const canonical = App.get(canonicalTarget);
  const canonicalReady = assertReadyGroup('canonical App.get', canonical);
  report.checks.canonical = canonicalReady;
  const firstLaunch = report.launches[0].group;
  if (!samePIDs(firstLaunch, canonical)) {
    fail('repeated alias launches changed the Calculator PID group', { firstLaunch, final: observedGroup(canonical) });
  }

  for (const alias of aliases.slice(0, 3)) {
    const group = App.get(alias.target);
    assertReadyGroup(`App.get ${alias.label}`, group);
    if (!App.isRunning(alias.target)) fail(`App.isRunning missed ${alias.label}`);
    if (!samePIDs(group, canonical)) fail(`App.get ${alias.label} disagreed with canonical identity`, { group: observedGroup(group), canonical: observedGroup(canonical) });
    const waited = await App.waitForLaunch(alias.target, { waitUntilReady: 'window', timeout: 10000 });
    assertReadyGroup(`App.waitForLaunch ${alias.label}`, waited);
    if (!samePIDs(waited, canonical)) fail(`App.waitForLaunch ${alias.label} disagreed with canonical identity`, { waited: observedGroup(waited), canonical: observedGroup(canonical) });
  }
  report.checks.aliasNameDiffersFromInput = report.launches[0].group.name !== '计算器';

  await expectCode('invalid name target', () => App.launch({ name: '' }), 'INVALID_ARGUMENT');
  await expectCode('unknown application', () => App.launch({ name: 'OpenDesk Runtime API Unknown Application 8f62dbf2' }, {
    waitUntilReady: 'process', timeout: 1000,
  }), 'LAUNCH_FAILED');
  await expectCode('missing application timeout', () => App.waitForLaunch({ bundleId: 'com.opendesk.runtime-api.definitely-missing' }, {
    waitUntilReady: 'process', timeout: 250,
  }), 'TIMEOUT');
  await expectCode('waitForExit alias recognition', () => App.waitForExit('计算器', { timeout: 250 }), 'TIMEOUT');
  report.checks.errors = {
    invalid: 'INVALID_ARGUMENT', unknown: 'LAUNCH_FAILED', timeout: 'TIMEOUT', waitForExitAlias: 'TIMEOUT',
  };

  // Use the same bundle-ID launch bridge for the final activation. This keeps
  // the visual capture in scope without relying on a separate window-control
  // backend, and must not create a second Calculator instance.
  const visualGroup = await App.launch(canonicalTarget, { waitUntilReady: 'window', timeout: 10000, activate: true });
  const visualReady = assertReadyGroup('visual evidence activation', visualGroup);
  if (!samePIDs(visualGroup, canonical)) {
    fail('visual evidence activation changed the Calculator PID group', { visualGroup: observedGroup(visualGroup), canonical: observedGroup(canonical) });
  }
  report.checks.visualActivation = { group: observedGroup(visualGroup), windows: visualReady.windows };

  // Capture the window we just matched by PID rather than whatever happens to
  // be active after asynchronous checks. `activeWindow` may legitimately fall
  // back to a full-screen capture when macOS cannot query it.
  const matchedWindow = visualReady.windows[0];
  const clip = {
    x: Number(matchedWindow && matchedWindow.x),
    y: Number(matchedWindow && matchedWindow.y),
    width: Number(matchedWindow && matchedWindow.width),
    height: Number(matchedWindow && matchedWindow.height),
  };
  if (!Number.isFinite(clip.x) || !Number.isFinite(clip.y) || clip.width <= 0 || clip.height <= 0) {
    fail('matched Calculator window has invalid screenshot bounds', { matchedWindow, clip });
  }
  const screenshotPath = File.join(executionEvidenceRoot, 'calculator-window.png');
  const screenshot = await page.screenshot({ clip, path: screenshotPath, returnType: 'object' });
  if (!File.exists(screenshotPath)) fail('window screenshot was not created', screenshot);
  if (!screenshot || Number(screenshot.width) !== clip.width || Number(screenshot.height) !== clip.height) {
    fail('window screenshot dimensions did not match the verified Calculator window', { clip, screenshot });
  }
  report.screenshot = { path: screenshotPath, window: matchedWindow, clip, result: screenshot };
  report.ok = true;
}

try {
  await main();
} catch (error) {
  report.ok = false;
  report.error = { code: error && error.code, message: String(error && (error.stack || error.message || error)) };
  throw error;
} finally {
  writeReport();
}

console.log(`APP_NAME_LAUNCH_REPORT=${File.join(executionEvidenceRoot, 'report.json')}`);
