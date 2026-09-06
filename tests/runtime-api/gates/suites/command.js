// command: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, CONTEXT, fail, readJSON, recordWatchdog, generate, executeProcess, runJS, verifyZeroCleanup, noResidual } = context;

async function commandGate() {
  await runJS('command', File.join(ROOT_DIR, 'tests', 'runtime-api', 'command.js'), 2, 90);
  await verifyZeroCleanup('command');
  const context = await readJSON(CONTEXT);
  if (!/^(MINGW|MSYS)/.test(context.environment.os)) {
    const generated = File.join(RUN_DIR, 'generated', 'command-cancel.generated.js');
    await generate(File.join(ROOT_DIR, 'tests', 'runtime-api', 'command-cancel.js'), generated);
    const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'command-cancel.sh');
    const seamResult = await executeProcess('command-cancel-seam', '/bin/sh', [seam, generated], { deadlineSeconds: 120 });
    const observationPath = File.join(RUN_DIR, 'results', 'command-cancel-observation.json');
    if (!File.isFile(observationPath)) fail(`Command cancellation seam did not write ${observationPath}`);
    const observation = await readJSON(observationPath);
    if (!observation.ready || !observation.aliveBefore || observation.exitStatus === 0 || observation.exitStatus === 124
      || observation.childAliveAfter || observation.descendantAliveAfter) {
      fail(`Command cancellation observation failed: ${JSON.stringify(observation)}`);
    }
    if (seamResult.exitCode !== 0) fail(`Command cancellation process seam failed with status ${seamResult.exitCode}`);
    await recordWatchdog('command-cancel');
    await verifyZeroCleanup('command-cancel');
  }
  await noResidual();
}

return Object.freeze({ commandGate });
})
