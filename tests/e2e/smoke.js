// Repository smoke orchestrator loaded by scripts/e2e_smoke.js.
// Formal command from the repository root:
// ./dist/opendesk -script scripts/e2e_smoke.js -console-mode script
//
// Real macOS application probes are deliberately separate and opt-in:
// OPENDESK_LIVE_E2E=1 ./dist/opendesk -script scripts/e2e_smoke.js -console-mode script

'use strict';

const repoRoot = Execution.workdir;
const binary = Execution.env.OPENDESK_BINARY || File.join(repoRoot, 'dist', 'opendesk');
const uiHost = Execution.env.OPENDESK_UI_HOST_BINARY || File.join(repoRoot, 'dist', 'opendesk-ui-host');
const runDir = File.join(repoRoot, '.runtime', 'tests', 'e2e', Execution.id);
const steps = [];
const failures = [];
let finalSummary = null;

function fail(message) {
  throw new Error(message);
}

function safeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function liveBinaryProvenance() {
  if (!File.isFile(uiHost)) fail(`paired OpenDesk UI host is missing: ${uiHost}`);
  const binaryStat = await Command.run('/usr/bin/stat', ['-f', '%m', binary], { cwd: repoRoot });
  const uiHostStat = await Command.run('/usr/bin/stat', ['-f', '%m', uiHost], { cwd: repoRoot });
  const binaryMtime = Number(binaryStat.stdout.trim());
  const uiHostMtime = Number(uiHostStat.stdout.trim());
  if (!Number.isFinite(binaryMtime) || !Number.isFinite(uiHostMtime)) fail('could not read OpenDesk build times');
  if (Math.abs(binaryMtime - uiHostMtime) > 120) {
    fail('dist/opendesk and its paired UI host were not built together; run ./scripts/build_macos_app.sh');
  }
  const productionRoots = ['automation', 'cmd', 'pkg', 'polyfills', 'jslibs']
    .map(path => File.join(repoRoot, path));
  const newer = await Command.run('/usr/bin/find', [
    ...productionRoots,
    '-type', 'f',
    '!', '-name', '*_test.go',
    '-newer', binary,
    '-print',
  ], { cwd: repoRoot, maxOutputBytes: 4 * 1024 * 1024 });
  if (newer.stdout.trim()) {
    fail(`OpenDesk binary is older than current production sources; rebuild before live probes: ${newer.stdout.trim().split('\n')[0]}`);
  }
  const binaryHash = await Command.run('/usr/bin/shasum', ['-a', '256', binary], { cwd: repoRoot });
  const uiHostHash = await Command.run('/usr/bin/shasum', ['-a', '256', uiHost], { cwd: repoRoot });
  return {
    binary: {
      path: binary,
      modifiedUnixSeconds: binaryMtime,
      sha256: binaryHash.stdout.trim().split(/\s+/)[0],
    },
    uiHost: {
      path: uiHost,
      modifiedUnixSeconds: uiHostMtime,
      sha256: uiHostHash.stdout.trim().split(/\s+/)[0],
    },
  };
}

async function runCommand(label, command, args, options = {}) {
  const startedAt = Date.now();
  let result;
  let error = null;
  try {
    result = await Command.run(command, args, {
      cwd: repoRoot,
      timeout: options.timeout || 20 * 60_000,
      maxOutputBytes: options.maxOutputBytes || 32 * 1024 * 1024,
      env: options.env || {},
    });
  } catch (caught) {
    error = caught;
    result = caught || {};
  }

  const key = safeLabel(label);
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  File.write(File.join(runDir, `${key}.stdout.log`), stdout);
  File.write(File.join(runDir, `${key}.stderr.log`), stderr);
  const step = {
    label,
    command,
    args,
    exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
    durationMs: Date.now() - startedAt,
    status: error ? 'failed' : 'passed',
  };
  steps.push(step);
  console.log(`[${step.status.toUpperCase()}] ${label} (${step.durationMs}ms)`);
  if (error) {
    const detail = stderr.trim() || stdout.trim() || error.message || String(error);
    failures.push({ label, detail: detail.slice(-4000) });
    if (!options.continueOnFailure) fail(`${label} failed: ${detail.slice(0, 1000)}`);
  }
  return { result, stdout, stderr, step, error };
}

async function run() {
  File.ensureDir(runDir);
  if (!File.isFile(binary)) fail(`OpenDesk binary is missing: ${binary}`);

  await runCommand('go test ./automation', 'go', ['test', './automation'], {
    timeout: 20 * 60_000,
    continueOnFailure: true,
  });
  await runCommand('go test ./...', 'go', ['test', './...'], {
    timeout: 30 * 60_000,
    continueOnFailure: true,
  });

  const runtimeSmoke = await runCommand(
    'OpenDesk child Runtime smoke',
    binary,
    [
      '-script', 'tests/e2e/runtime-smoke.js',
      '-console-mode', 'script',
      '-log-dir', File.join(runDir, 'runtime-smoke'),
    ],
    { timeout: 60_000, continueOnFailure: true },
  );
  if (!runtimeSmoke.error && (!runtimeSmoke.stdout.includes('script-smoke-start') || !runtimeSmoke.stdout.includes('script-smoke-end'))) {
    failures.push({ label: 'OpenDesk child Runtime smoke markers', detail: 'missing start or end marker' });
  }

  const platform = System.getPlatformInfo().os;
  const deprecatedLiveFlag = Execution.env.RUN_MAC_UI;
  if (deprecatedLiveFlag !== undefined) {
    console.log('[DEPRECATED] RUN_MAC_UI is retained only as an opt-in alias; use OPENDESK_LIVE_E2E=1.');
  }
  const liveEnabled = Execution.env.OPENDESK_LIVE_E2E === '1' || deprecatedLiveFlag === '1';
  const live = {
    enabled: liveEnabled,
    platform,
    status: liveEnabled ? 'pending' : 'skipped-not-opted-in',
    visualStatus: 'not-reviewed',
    observations: [],
  };

  if (liveEnabled && platform !== 'darwin') {
    live.status = 'skipped-unsupported-platform';
    console.log('[SKIP] OPENDESK_LIVE_E2E is macOS-only.');
  } else if (liveEnabled) {
    live.provenance = await liveBinaryProvenance();
    const probes = [
      ['Safari URL/input probe', 'examples/mac/safari_url_input_flow.js'],
      ['WeChat chat-list probe', 'examples/mac/wechat_probe_chatlist_scan.js'],
    ];
    for (const [label, script] of probes) {
      const observation = await runCommand(
        label,
        binary,
        ['-script', script, '-console-mode', 'script', '-timeout', '60'],
        { timeout: 2 * 60_000, continueOnFailure: true },
      );
      live.observations.push({ label, script, exitCode: observation.step.exitCode });
    }
    live.status = live.observations.every(item => item.exitCode === 0)
      ? 'observed-process-success'
      : 'observed-process-failure';
    console.log(`[OBSERVED] Live probes status=${live.status}; screenshots still require visual review.`);
  } else {
    console.log('[SKIP] Real application probes require OPENDESK_LIVE_E2E=1 and are not part of CI smoke.');
  }

  const nonUISteps = steps.filter(step => !step.label.includes('probe'));
  finalSummary = {
    schemaVersion: 1,
    executionId: Execution.id,
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? 'passed' : 'failed',
    nonUI: { passed: nonUISteps.every(step => step.status === 'passed'), steps: nonUISteps },
    live,
    failures,
    evidenceDirectory: runDir,
  };
  await File.writeJSON(File.join(runDir, 'summary.json'), finalSummary);
  await File.writeJSON(File.join(Execution.artifactDir, 'e2e-summary.json'), finalSummary);
  if (failures.length > 0) fail(`E2E smoke failed steps: ${failures.map(item => item.label).join(', ')}`);
  console.log(`[PASS] Non-UI smoke passed; live=${live.status}; evidence=${runDir}`);
}

try {
  await run();
} catch (error) {
  const summary = finalSummary || {
    schemaVersion: 1,
    executionId: Execution.id,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    steps,
    failures,
    evidenceDirectory: runDir,
  };
  summary.error = String(error && error.message || error);
  File.ensureDir(runDir);
  await File.writeJSON(File.join(runDir, 'summary.json'), summary);
  await File.writeJSON(File.join(Execution.artifactDir, 'e2e-summary.json'), summary);
  throw error;
}
