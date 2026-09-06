// macOS-only, no-desktop-action preflight for the test-only exact-window
// receipt helper. It runs the helper through the same local Runtime
// Command.run path that the controlled fixture and Chess checks use.

'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(Execution.workdir);
const helper = path.resolve(root, '.runtime/tests/accessibility/tools/exact-window-capture/exact-window-capture');
const evidenceDir = path.resolve(root, '.runtime/tests/accessibility/exact-window-capture-preflight');
const evidencePath = path.resolve(evidenceDir, 'result.json');

assert(File.isFile(helper), 'exact-window-capture helper is not built');
assert(Command.getCapabilities().enabled === true, 'Command.run is disabled for this local execution');
File.ensureDir(evidenceDir);

const result = await Command.run(helper, ['--preflight'], {
  cwd: root,
  timeout: 10_000,
  maxOutputBytes: 65_536,
});
assert(result.exitCode === 0 && result.stderr === '', 'exact-window-capture preflight command failed');
const preflight = JSON.parse(result.stdout);
assert(preflight && preflight.schemaVersion === 1 && preflight.mode === 'preflight',
  'exact-window-capture preflight response schema changed');
assert(typeof preflight.screenCaptureAccess === 'boolean',
  'exact-window-capture preflight did not return screenCaptureAccess');

const evidence = {
  schemaVersion: 1,
  status: preflight.screenCaptureAccess ? 'passed' : 'blocked',
  mode: 'runtime-command-child-preflight',
  helper,
  screenCaptureAccess: preflight.screenCaptureAccess,
  desktopAction: false,
};
await File.writeJSON(evidencePath, evidence, { spaces: 2, createDirs: true });
console.log('[EXACT-WINDOW-CAPTURE-PREFLIGHT] ' + JSON.stringify(evidence));
