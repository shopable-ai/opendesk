// live: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, fail, executeProcess, noResidual } = context;
const cleanup = (...args) => context.invoke('cleanup', ...args);

async function runLiveSeam(mode, deadlineSeconds) {
  const fileByMode = {
    live: 'live-fixture-session.sh',
    'custom-ui': 'custom-ui-session.sh',
    dialog: 'dialog-session.sh',
  };
  const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', fileByMode[mode]);
  if (!File.isFile(seam)) fail(`${mode} lifecycle seam is missing: ${seam}`);
  const result = await executeProcess(`${mode}-session-wrapper`, '/bin/bash', [seam], {
    deadlineSeconds,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  if (result.exitCode !== 0) fail(`${mode} lifecycle seam failed with status ${result.exitCode}`);
}

async function liveOnly() {
  let failure = null;
  try {
    await runLiveSeam('live', 780);
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
    await noResidual();
  } catch (error) {
    failure = error;
  }
  if (failure) throw failure;
}

async function customUI() {
  await runLiveSeam('custom-ui', 900);
}

async function dialog() {
  await runLiveSeam('dialog', 1200);
}

return Object.freeze({ runLiveSeam, liveOnly, customUI, dialog });
})
