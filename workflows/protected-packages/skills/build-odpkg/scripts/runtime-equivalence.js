// Thin Skill-owned entry for the canonical repository test.
// From the repository root:
// ./dist/opendesk -script workflows/protected-packages/skills/build-odpkg/scripts/runtime-equivalence.js -console-mode script
'use strict';

const root = Execution.workdir;
const binary = File.join(root, 'dist', 'opendesk');
const canonical = File.join(root, 'tests', 'protected-packages', 'runtime-equivalence.js');

if (!File.isFile(binary)) throw new Error('expected compiled Runtime at ./dist/opendesk');
if (!File.isFile(canonical)) throw new Error('canonical protected-package test is missing');

let child;
try {
  child = await Command.run(binary, [
    '-script', canonical,
    '-console-mode', 'script',
  ], {
    cwd: root,
    timeout: 10 * 60_000,
    maxOutputBytes: 4 * 1024 * 1024,
  });
} catch (error) {
  const safeLines = String(error && error.stdout || '')
    .split('\n')
    .filter(line => line.includes('[PROTECTED-PACKAGE-EQUIVALENCE]'))
    .map(line => line.slice(line.indexOf('[PROTECTED-PACKAGE-EQUIVALENCE]')));
  for (const line of safeLines) console.error(line);
  const code = error && error.code ? String(error.code) : 'UNKNOWN';
  const exitCode = error && Number.isInteger(error.exitCode) ? ` exit=${error.exitCode}` : '';
  throw new Error(`canonical protected-package equivalence test failed (${code}${exitCode})`);
}

const markerLines = String(child.stdout || '')
  .split('\n')
  .filter(line => line.includes('[PROTECTED-PACKAGE-EQUIVALENCE]'))
  .map(line => line.slice(line.indexOf('[PROTECTED-PACKAGE-EQUIVALENCE]')));
if (!markerLines.some(line => line.includes('[PROTECTED-PACKAGE-EQUIVALENCE] passed '))) {
  throw new Error('canonical protected-package test returned no pass marker');
}
for (const line of markerLines) console.log(line);
