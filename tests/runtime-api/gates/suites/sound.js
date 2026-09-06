// sound: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, BINARY, childEnv, fail, displayOutput, runCommand, noResidual } = context;

async function soundCancel() {
  const result = await runCommand('/bin/sh', [File.join(ROOT_DIR, 'tests', 'runtime-api', 'sound-cancel-smoke.sh')], {
    cwd: ROOT_DIR,
    env: {
      ...childEnv,
      OPENDESK_BINARY: BINARY,
      OPENDESK_SOUND_CANCEL_RUN_DIR: File.join(RUN_DIR, 'sound-cancel'),
    },
    timeout: 120_000,
    maxOutputBytes: 16 * 1024 * 1024,
  });
  displayOutput(result.stdout);
  displayOutput(result.stderr, true);
  if (result.exitCode !== 0) fail(`sound cancellation seam failed with status ${result.exitCode}`);
  await noResidual();
}

return Object.freeze({ soundCancel });
})
