// Offline WeChat layout-recognition E2E orchestrator in the OpenDesk Runtime.
// From the repository root:
// ./dist/opendesk -script tests/wechat/e2e.js -console-mode script

'use strict';

const repoRoot = Execution.workdir;
const binary = Execution.env.OPENDESK_BINARY || File.join(repoRoot, 'dist', 'opendesk');
const runDir = File.join(repoRoot, '.runtime', 'tests', 'wechat', 'runs', Execution.id);
const steps = [];
const scenarios = [];

function fail(message) {
  throw new Error(message);
}

async function runCommand(label, command, args, timeout = 10 * 60_000, allowFailure = false, env = {}) {
  const startedAt = Date.now();
  let result;
  try {
    result = await Command.run(command, args, {
      cwd: repoRoot,
      timeout,
      maxOutputBytes: 32 * 1024 * 1024,
      env,
    });
  } catch (error) {
    const key = String(steps.length + 1).padStart(2, '0');
    File.write(File.join(runDir, `${key}.stdout.log`), String(error.stdout || ''));
    File.write(File.join(runDir, `${key}.stderr.log`), String(error.stderr || ''));
    steps.push({ label, command, args, status: 'failed', exitCode: error.exitCode, durationMs: Date.now() - startedAt });
    if (!allowFailure) fail(`${label} failed: ${error.stderr || error.stdout || error.message || error}`);
    console.log(`[OBSERVED FAILURE] ${label}`);
    return error;
  }
  const key = String(steps.length + 1).padStart(2, '0');
  File.write(File.join(runDir, `${key}.stdout.log`), result.stdout);
  File.write(File.join(runDir, `${key}.stderr.log`), result.stderr);
  steps.push({ label, command, args, status: 'passed', exitCode: result.exitCode, durationMs: Date.now() - startedAt });
  console.log(`[PASS] ${label}`);
  return result;
}

async function run() {
  File.ensureDir(runDir);
  if (!File.isFile(binary)) fail(`OpenDesk binary is missing: ${binary}`);

  await runCommand('generate simple fixture', 'go', ['run', './tests/wechat/tools/generate-simple-image']);
  await runCommand('generate complex fixture', 'go', ['run', './tests/wechat/tools/generate-mock-image']);

  for (const mode of ['simple', 'complex']) {
    const configPath = File.join(repoRoot, '.runtime', 'tests', 'wechat', `viz_config_${mode}.json`);
    const reportPath = File.join(repoRoot, '.runtime', 'tests', 'wechat', `${mode}_analysis.json`);
    const outputPath = File.join(repoRoot, '.runtime', 'tests', 'wechat', `${mode}_visualization.png`);
    for (const staleArtifact of [configPath, reportPath, outputPath]) {
      if (File.exists(staleArtifact)) File.remove(staleArtifact);
    }
    const child = await runCommand(
      `analyze ${mode} fixture with OpenDesk`,
      binary,
      [
        '-script', 'tests/wechat/run_and_visualize.js',
        '-console-mode', 'script',
      ],
      10 * 60_000,
      true,
      { OPENDESK_WECHAT_MODE: mode },
    );
    if (!File.isFile(configPath) || !File.isFile(reportPath)) {
      fail(`${mode} analysis did not produce its JSON config and report`);
    }
    const report = await File.readJSON(reportPath);
    if (!report || typeof report.passed !== 'boolean' || !report.metrics) fail(`${mode} analysis report is invalid`);
    await runCommand(
      `render ${mode} visualization`,
      'go',
      ['run', './tests/wechat/tools/visualize-result', configPath],
    );
    if (!File.isFile(outputPath)) fail(`${mode} visualization is missing: ${outputPath}`);
    scenarios.push({
      mode,
      passed: report.passed === true && child.exitCode === 0,
      metrics: report.metrics,
      analysis: reportPath,
      visualization: outputPath,
    });
  }

  const summary = {
    schemaVersion: 1,
    executionId: Execution.id,
    status: scenarios.every(scenario => scenario.passed) ? 'passed' : 'failed',
    scenarios,
    steps,
    evidenceDirectory: runDir,
  };
  await File.writeJSON(File.join(runDir, 'summary.json'), summary);
  await File.writeJSON(File.join(Execution.artifactDir, 'wechat-e2e-summary.json'), summary);
  if (summary.status !== 'passed') {
    fail(`WeChat layout contract failed: ${scenarios.filter(scenario => !scenario.passed).map(scenario => scenario.mode).join(', ')}`);
  }
  console.log(`[PASS] WeChat offline layout E2E; evidence=${runDir}`);
}

try {
  await run();
} catch (error) {
  File.ensureDir(runDir);
  const failure = {
    schemaVersion: 1,
    executionId: Execution.id,
    status: 'failed',
    error: String(error && error.message || error),
    scenarios,
    steps,
    evidenceDirectory: runDir,
  };
  await File.writeJSON(File.join(runDir, 'summary.json'), failure);
  await File.writeJSON(File.join(Execution.artifactDir, 'wechat-e2e-summary.json'), failure);
  throw error;
}
