// Fast, UI-independent entry for the canonical protected-package basic lane.
// Run from the repository root:
// ./dist/opendesk -script "$PWD/tests/protected-packages/basic-runtime-smoke.js" -console-mode script
'use strict';

const root = Execution.workdir;
const binary = File.join(root, 'dist', 'opendesk');
const canonicalTest = File.join(root, 'tests', 'protected-packages', 'runtime-equivalence.js');

if (!File.isFile(binary)) throw new Error(`compiled Runtime is missing: ${binary}`);
if (!File.isFile(canonicalTest)) throw new Error(`canonical protected-package test is missing: ${canonicalTest}`);

let child;
try {
  child = await Command.run(binary, [
    '-script', canonicalTest,
    '-console-mode', 'script',
  ], {
    cwd: root,
    timeout: 180_000,
    maxOutputBytes: 4 * 1024 * 1024,
    env: {
      OPENDESK_PROTECTED_PACKAGE_TEST_MODE: 'basic',
    },
  });
} catch (error) {
  const stdout = String(error && error.stdout || '').trim();
  const stderr = String(error && error.stderr || '').trim();
  if (stdout) console.log(stdout);
  if (stderr) console.log(stderr);
  const code = error && error.code ? String(error.code) : 'UNKNOWN';
  const exitCode = Number.isInteger(error && error.exitCode) ? ` exit=${error.exitCode}` : '';
  throw new Error(`[PROTECTED-PACKAGE-BASIC] canonical basic lane failed (${code}${exitCode})`);
}

const output = String(child.stdout || '').trim();
const markers = output.match(/\[PROTECTED-PACKAGE-EQUIVALENCE\] passed[^\r\n]*/g) || [];
if (markers.length === 0) {
  throw new Error('[PROTECTED-PACKAGE-BASIC] canonical basic lane did not report success');
}
console.log(markers[markers.length - 1]);
console.log('[PROTECTED-PACKAGE-BASIC] passed (canonical basic lane)');
