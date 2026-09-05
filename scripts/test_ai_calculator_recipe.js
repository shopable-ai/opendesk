// Calculator live qualification runner.
//
// The desktop actions and their business assertions stay in JavaScript files
// executed by OpenDesk. This OpenDesk recipe starts independent child
// Executions through the local Command API, applies opt-in
// perturbations, and records a readable scenario matrix.
//
// The outer runner is an ordinary OpenDesk Runtime script. Its child `ai run`
// commands deliberately create the independent Workflow executions and artifacts
// that this qualification matrix verifies.
//
// From the repository root:
// OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script

'use strict';

const repoRoot = Execution.workdir;
const defaultBinary = File.join(repoRoot, 'dist', 'opendesk');
const workflowRelative = 'workflows/macos/calculator/calculate-and-reuse-result.js';
const workflow = File.join(repoRoot, workflowRelative);
const compatibilityRecipe = File.join(repoRoot, 'examples', 'ai-cli', 'macos-calculator-recipe.js');
const layoutPerturb = File.join(repoRoot, 'tests', 'ai-calculator', 'macos-calculator-layout-perturb.js');
const runId = Execution.id;
const runDir = File.join(repoRoot, '.runtime', 'tests', 'ai-calculator', runId);
const cases = [];
let binary = defaultBinary;

function fail(message) {
  throw new Error(message);
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function ensureFile(file, label) {
  if (!File.exists(file)) fail(`${label} is missing: ${file}`);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} did not return a JSON envelope: ${error.message}`);
  }
}

function readJson(file, label) {
  return parseJson(File.read(file), label);
}

async function runOpenDesk(args, label) {
  let child;
  let commandError = null;
  try {
    child = await Command.run(binary, args, {
      cwd: repoRoot,
      timeout: 5 * 60_000,
      maxOutputBytes: 16 * 1024 * 1024,
    });
  } catch (error) {
    commandError = error;
    child = error || {};
  }
  const stdout = String(child.stdout || '');
  const stderr = String(child.stderr || '');
  File.write(File.join(runDir, `${label}.stdout.json`), stdout);
  File.write(File.join(runDir, `${label}.stderr.log`), stderr);
  return {
    args,
    label,
    status: Number.isInteger(child.exitCode) ? child.exitCode : null,
    spawnError: commandError && commandError.code === 'START_FAILED'
      ? String(commandError.message || commandError)
      : null,
    stdout,
    stderr,
    envelope: stdout.trim() ? parseJson(stdout, `${label} OpenDesk command`) : null,
  };
}

function requireSuccessfulCommand(run, label) {
  if (!run || run.status !== 0 || !run.envelope || run.envelope.ok !== true) {
    const detail = run && run.envelope && run.envelope.error
      ? JSON.stringify(run.envelope.error)
      : (run && run.spawnError) || (run && run.stderr) || 'no command result';
    fail(`${label} failed: ${detail}`);
  }
  return run.envelope;
}

function validateWorkflow(label, run, expectLayoutRecovery = false) {
  const envelope = requireSuccessfulCommand(run, label);
  const result = envelope.result || {};
  const artifacts = result.artifacts || {};
  const executionId = result.executionId || '<missing>';
  const artifactDir = artifacts.runDir || '<missing>';
  console.log(`[${label}] executionId=${executionId} artifact=${artifactDir} exit=${run.status}`);

  if (!artifacts.runDir) fail(`${label} did not return Execution.artifactDir`);
  const resultPath = File.path(File.join(artifacts.runDir, 'calculator-workflow-result.json'));
  const document = readJson(resultPath, `${label} Workflow result`);
  if (
    document.passed !== true
    || !Array.isArray(document.calculations)
    || document.calculations.length !== 2
    || document.calculations.some(item => item.verified !== true)
  ) {
    fail(`${label} Calculator business verification did not pass: ${resultPath}`);
  }
  if (
    document.workflow !== 'macos/calculator/calculate-and-reuse-result'
    || !document.reuse
    || document.reuse.source !== 'Calculator Display ROI OCR'
    || document.reuse.firstResult !== '1000'
    || document.reuse.resolvedExpression !== '1000/4+37'
    || document.finalResult !== '287'
  ) {
    fail(`${label} did not prove OCR firstResult reuse: ${resultPath}`);
  }
  if (expectLayoutRecovery) {
    const layout = document.layout || {};
    const initial = layout.initialBounds || {};
    const final = layout.finalBounds || {};
    if (
      layout.recovered !== true
      || layout.verified !== true
      || !Array.isArray(layout.recoveryActions)
      || !layout.recoveryActions.includes('select-basic-with-view-menu')
      || initial.width !== 574
      || initial.height !== 321
      || final.width !== 232
      || final.height !== 321
      || initial.x !== final.x
      || initial.y !== final.y
    ) {
      fail(`${label} did not record the verified 574x321 -> 232x321 position-preserving recovery: ${resultPath}`);
    }
  }
  const summary = {
    label,
    executionId,
    artifactDir,
    resultPath,
    layout: document.layout || null,
    passed: true,
  };
  cases.push(summary);
  return summary;
}

function calculateMove(active, screen) {
  if (!active || !screen) fail('Calculator move precondition did not return active window and virtual bounds');
  const values = [active.x, active.y, active.width, active.height, screen.x, screen.y, screen.width, screen.height];
  if (values.some(value => !Number.isFinite(Number(value)))) fail('Calculator move precondition returned invalid geometry');
  const maxX = Number(screen.x) + Number(screen.width) - Number(active.width);
  const maxY = Number(screen.y) + Number(screen.height) - Number(active.height);
  const candidateX = Number(active.x) + (Number(active.x) + 160 <= maxX ? 160 : -160);
  const candidateY = Number(active.y) + (Number(active.y) + 80 <= maxY ? 80 : -80);
  return {
    title: String(active.title || ''),
    x: Math.round(Math.max(Number(screen.x), Math.min(maxX, candidateX))),
    y: Math.round(Math.max(Number(screen.y), Math.min(maxY, candidateY))),
  };
}

async function run() {
  if (System.getPlatformInfo().os !== 'darwin') {
    console.log('[SKIP] macOS Calculator live Workflow requires macOS.');
    return;
  }
  if (System.getEnv('OPENDESK_LIVE_CALCULATOR') !== '1') {
    console.log('[SKIP] Set OPENDESK_LIVE_CALCULATOR=1 to permit real Calculator UI input.');
    return;
  }
  binary = System.getEnv('OPENDESK_BINARY', defaultBinary);

  File.ensureDir(runDir);
  ensureFile(binary, 'OpenDesk binary');
  ensureFile(workflow, 'Calculator Workflow');
  ensureFile(compatibilityRecipe, 'Calculator compatibility recipe');
  ensureFile(layoutPerturb, 'Calculator layout perturbation script');

  const capabilitiesRun = await runOpenDesk(['ai', 'capabilities'], 'capabilities');
  const capabilities = requireSuccessfulCommand(capabilitiesRun, 'capabilities');
  File.write(File.join(runDir, 'capabilities.json'), `${JSON.stringify(capabilities, null, 2)}\n`);
  const permissions = capabilities.result && capabilities.result.permissions;
  if (!permissions || permissions.screenCapture !== true || permissions.accessibility !== true) {
    fail('Grant Screen Recording and Accessibility to the OpenDesk host, restart it, then retry.');
  }
  console.log(`[LIVE] runId=${runId} evidence=${runDir}`);

  validateWorkflow('baseline', await runOpenDesk(['ai', 'run', workflow], 'baseline'));
  validateWorkflow('fresh-run', await runOpenDesk(['ai', 'run', workflow], 'fresh-run'));

  // Compatibility setup only: leave an old display value behind. The public
  // Workflow below still runs without --input and must clear its own task.
  const legacySetup = await runOpenDesk(
    ['ai', 'run', compatibilityRecipe, '--input', JSON.stringify({ expression: '987', expected: '987' })],
    'old-state-setup',
  );
  const legacyEnvelope = requireSuccessfulCommand(legacySetup, 'old-state compatibility setup');
  console.log(`[old-state-setup] executionId=${legacyEnvelope.result && legacyEnvelope.result.executionId || '<missing>'} artifact=${legacyEnvelope.result && legacyEnvelope.result.artifacts && legacyEnvelope.result.artifacts.runDir || '<missing>'} exit=${legacySetup.status}`);
  validateWorkflow('old-initial-display', await runOpenDesk(['ai', 'run', workflow], 'old-initial-display'));

  const activeRun = await runOpenDesk(['ai', 'window', 'active'], 'active-window');
  const screenRun = await runOpenDesk(['ai', 'screen', 'info'], 'screen-info');
  const activeEnvelope = requireSuccessfulCommand(activeRun, 'active window');
  const screenEnvelope = requireSuccessfulCommand(screenRun, 'screen info');
  const move = calculateMove(activeEnvelope.result, screenEnvelope.result && screenEnvelope.result.virtualBounds);
  let moveRun = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const candidate = await runOpenDesk(
      ['ai', 'window', 'move', '--title', move.title, '--x', String(move.x), '--y', String(move.y)],
      `scenario-6-move-attempt-${attempt}`,
    );
    const result = candidate.envelope && candidate.envelope.result;
    if (candidate.status === 0 && candidate.envelope && candidate.envelope.ok === true && result && result.x === move.x && result.y === move.y) {
      moveRun = candidate;
      break;
    }
    if (attempt < 3) await sleep(1000);
  }
  if (!moveRun) fail(`Scenario 6 window move was not applied; see ${runDir}/scenario-6-move-attempt-*.stderr.log`);
  File.write(File.join(runDir, 'scenario-6-move.json'), `${moveRun.stdout.trim()}\n`);
  console.log(`[window-move] target=${move.title} x=${move.x} y=${move.y} attempts=${moveRun.label.split('-').pop()}`);
  validateWorkflow('moved-window', await runOpenDesk(['ai', 'run', workflow], 'moved-window'));

  const perturbRun = await runOpenDesk(['ai', 'run', layoutPerturb], 'resize-perturb');
  const perturbEnvelope = requireSuccessfulCommand(perturbRun, 'resize perturbation');
  console.log(`[resize-perturb] executionId=${perturbEnvelope.result && perturbEnvelope.result.executionId || '<missing>'} artifact=${perturbEnvelope.result && perturbEnvelope.result.artifacts && perturbEnvelope.result.artifacts.runDir || '<missing>'} exit=${perturbRun.status}`);
  const perturbArtifacts = perturbEnvelope.result && perturbEnvelope.result.artifacts;
  if (!perturbArtifacts || !perturbArtifacts.runDir) fail('resize perturbation did not return Execution.artifactDir');
  const perturbEvidencePath = File.join(repoRoot, perturbArtifacts.runDir, 'calculator-layout-perturb.json');
  const perturbEvidence = readJson(perturbEvidencePath, 'resize perturbation evidence');
  if (perturbEvidence.passed !== true || perturbEvidence.changed !== true) {
    fail(`resize perturbation did not produce a verified Calculator bounds change: ${perturbEvidencePath}`);
  }
  validateWorkflow('resized-window', await runOpenDesk(['ai', 'run', workflow], 'resized-window'), true);

  const summary = {
    runId,
    workflow: workflowRelative,
    cases,
    perturbEvidencePath,
    passed: true,
  };
  File.write(File.join(runDir, 'calculator-gate-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[PASS] Calculator Workflow baseline/Fresh Run/old display/move/resize/OCR reuse scenarios passed; evidence=${runDir}`);
}

try {
  await run();
} catch (error) {
  console.error(`[FAIL] ${error && error.stack ? error.stack : error}`);
  throw error;
}
