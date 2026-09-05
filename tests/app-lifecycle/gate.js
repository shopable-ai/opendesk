// macOS App lifecycle fixture gate loaded by scripts/test_app_lifecycle.js.
// Formal command from the repository root (explicit live opt-in):
// OPENDESK_LIVE_APP_LIFECYCLE=1 ./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script

'use strict';

const repoRoot = Execution.workdir;
const binary = Execution.env.OPENDESK_BINARY || File.join(repoRoot, 'dist', 'opendesk');
const uiHost = Execution.env.OPENDESK_UI_HOST_BINARY || File.join(repoRoot, 'dist', 'opendesk-ui-host');
const evidenceDirectory = File.join(repoRoot, '.runtime', 'tests', 'platform-primitives', 'task-007-app-lifecycle');
const bundle = File.join(evidenceDirectory, 'OpenDeskAppLifecycleFixture.app');
const executable = File.join(bundle, 'Contents', 'MacOS', 'OpenDeskAppLifecycleFixture');
const childLogDirectory = File.join(evidenceDirectory, 'runtime-log');

function fail(message) {
  throw new Error(message);
}

async function command(command, args, options = {}) {
  return Command.run(command, args, {
    cwd: options.cwd || repoRoot,
    timeout: options.timeout || 2 * 60_000,
    maxOutputBytes: options.maxOutputBytes || 16 * 1024 * 1024,
    env: options.env || {},
  });
}

async function sha256(path) {
  const result = await command('/usr/bin/shasum', ['-a', '256', path]);
  return result.stdout.trim().split(/\s+/)[0];
}

async function modifiedSeconds(path) {
  const result = await command('/usr/bin/stat', ['-f', '%m', path]);
  const value = Number(result.stdout.trim());
  if (!Number.isFinite(value)) fail(`could not read build time: ${path}`);
  return value;
}

async function verifyBuildPair() {
  if (!File.isFile(binary)) fail(`OpenDesk binary is missing: ${binary}`);
  if (!File.isFile(uiHost)) fail(`paired OpenDesk UI host is missing: ${uiHost}`);
  const [binaryMtime, uiHostMtime] = await Promise.all([
    modifiedSeconds(binary),
    modifiedSeconds(uiHost),
  ]);
  if (Math.abs(binaryMtime - uiHostMtime) > 120) {
    fail('dist/opendesk and its paired UI host were not built together; run ./scripts/build_macos_app.sh');
  }
  const productionRoots = ['automation', 'cmd', 'pkg', 'polyfills', 'jslibs']
    .map(path => File.join(repoRoot, path));
  const newer = await command('/usr/bin/find', [
    ...productionRoots,
    '-type', 'f',
    '!', '-name', '*_test.go',
    '-newer', binary,
    '-print',
  ]);
  if (newer.stdout.trim()) {
    fail(`OpenDesk binary is older than current production sources; rebuild before live acceptance: ${newer.stdout.trim().split('\n')[0]}`);
  }
  return {
    binary: { path: binary, sha256: await sha256(binary), modifiedUnixSeconds: binaryMtime },
    uiHost: { path: uiHost, sha256: await sha256(uiHost), modifiedUnixSeconds: uiHostMtime },
  };
}

async function run() {
  if (System.getPlatformInfo().os !== 'darwin') {
    await File.writeJSON(File.join(Execution.artifactDir, 'app-lifecycle-gate-summary.json'), {
      schemaVersion: 1,
      executionId: Execution.id,
      status: 'skipped',
      reason: 'unsupported-platform',
    });
    console.log('[SKIP] App lifecycle live fixture requires macOS.');
    return;
  }
  if (Execution.env.OPENDESK_LIVE_APP_LIFECYCLE !== '1') {
    await File.writeJSON(File.join(Execution.artifactDir, 'app-lifecycle-gate-summary.json'), {
      schemaVersion: 1,
      executionId: Execution.id,
      status: 'skipped',
      reason: 'live-opt-in-required',
    });
    console.log('[SKIP] Set OPENDESK_LIVE_APP_LIFECYCLE=1 to permit the real AppKit fixture lifecycle.');
    return;
  }

  const provenance = await verifyBuildPair();
  File.ensureDir(evidenceDirectory);
  if (File.exists(bundle)) File.removeDir(bundle);
  File.ensureDir(File.join(bundle, 'Contents', 'MacOS'));
  File.copy(
    File.join(repoRoot, 'tests', 'runtime-api', 'fixtures', 'app-lifecycle', 'Info.plist'),
    File.join(bundle, 'Contents', 'Info.plist'),
  );
  const compile = await command('/usr/bin/clang', [
    '-fobjc-arc',
    '-framework', 'AppKit',
    File.join(repoRoot, 'tests', 'runtime-api', 'fixtures', 'app-lifecycle', 'main.m'),
    '-o', executable,
  ]);
  File.write(File.join(evidenceDirectory, 'fixture-build.stdout.log'), compile.stdout);
  File.write(File.join(evidenceDirectory, 'fixture-build.stderr.log'), compile.stderr);

  for (const staleArtifact of ['evidence.json', 'window.png', 'gate-summary.json']) {
    const path = File.join(evidenceDirectory, staleArtifact);
    if (File.exists(path)) File.remove(path);
  }

  let child;
  try {
    child = await command(binary, [
      '-script', 'tests/runtime-api/live/app-lifecycle.test.js',
      '-console-mode', 'script',
      '-log-dir', childLogDirectory,
    ], { timeout: 2 * 60_000 });
  } catch (error) {
    File.write(File.join(evidenceDirectory, 'gate.stdout.log'), String(error.stdout || ''));
    File.write(File.join(evidenceDirectory, 'gate.stderr.log'), String(error.stderr || ''));
    throw error;
  }
  File.write(File.join(evidenceDirectory, 'gate.stdout.log'), child.stdout);
  File.write(File.join(evidenceDirectory, 'gate.stderr.log'), child.stderr);

  const evidencePath = File.join(evidenceDirectory, 'evidence.json');
  const screenshotPath = File.join(evidenceDirectory, 'window.png');
  if (!File.isFile(evidencePath) || !File.isFile(screenshotPath)) {
    fail('App lifecycle child did not produce both JSON evidence and a window screenshot');
  }
  const evidence = await File.readJSON(evidencePath);
  if (
    !evidence
    || !evidence.restart
    || evidence.restart.pidChanged !== true
    || !evidence.graceful
    || evidence.graceful.exited !== true
    || !evidence.force
    || evidence.force.exited !== true
    || !evidence.postcondition
    || evidence.postcondition.running !== false
  ) {
    fail(`App lifecycle evidence did not satisfy the functional contract: ${evidencePath}`);
  }

  const summary = {
    schemaVersion: 1,
    executionId: Execution.id,
    status: 'functional-pass-visual-review-required',
    functionalPassed: true,
    visualStatus: 'pending-review',
    provenance,
    evidence: evidencePath,
    screenshot: screenshotPath,
  };
  await File.writeJSON(File.join(evidenceDirectory, 'gate-summary.json'), summary);
  await File.writeJSON(File.join(Execution.artifactDir, 'app-lifecycle-gate-summary.json'), summary);
  console.log(`[FUNCTIONAL PASS] App lifecycle completed; visual review required: ${screenshotPath}`);
}

try {
  await run();
} catch (error) {
  await File.writeJSON(File.join(Execution.artifactDir, 'app-lifecycle-gate-summary.json'), {
    schemaVersion: 1,
    executionId: Execution.id,
    status: 'failed',
    error: String(error && error.message || error),
  });
  throw error;
}
