// core: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, CONTEXT, fail, writeJSON, record, executeProcess, executeJS, runJS, verifyZeroCleanup } = context;
const prepareNativeExtension = (...args) => context.invoke('prepareNativeExtension', ...args);

async function contract() {
  await runJS('contract', File.join(ROOT_DIR, 'tests', 'runtime-api', 'contract.js'), 3, 120);
}

async function unit() {
  await prepareNativeExtension();
  await runJS('unit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'unit.js'), 5, 180);
  await verifyZeroCleanup('unit');
}

async function coverage() {
  await runJS('coverage', File.join(ROOT_DIR, 'tests', 'runtime-api', 'coverage.js'), 5, 180);
}

async function smokeCase() {
  await runJS('smoke', File.join(ROOT_DIR, 'tests', 'runtime-api', 'smoke.js'), 3, 120);
}

async function negative() {
  await runJS('negative', File.join(ROOT_DIR, 'tests', 'runtime-api', 'negative.js'), 5, 120);
}

async function failureExit() {
  const extra = File.join(RUN_DIR, 'failure-exit.json');
  const probe = await executeJS('failure-exit-probe', File.join(ROOT_DIR, 'tests', 'runtime-api', 'failure_exit.js'), 2, 15);
  await writeJSON(extra, { exitStatus: probe.exitCode });
  await runJS('failure-exit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'failure_exit_result.js'), 2, 60, { extra });
}

async function cleanup() {
  await runJS('cleanup', File.join(ROOT_DIR, 'tests', 'runtime-api', 'cleanup_validation.js'), 4, 120, { display: true });
}

async function quality() {
  await runJS('quality', File.join(ROOT_DIR, 'tests', 'runtime-api', 'quality_gate.js'), 5, 180, { display: true });
}

async function asyncStacks() {
  const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'async-fixture-session.sh');
  for (const stack of ['legacy', 'upgraded', 'playwright']) {
    const gate = `async-${stack}`;
    const result = await executeProcess(`${gate}-seam`, '/bin/sh', [seam, stack], {
      deadlineSeconds: 140,
      env: { OPENDESK_RUNTIME_API_CONTEXT_PATH: CONTEXT },
    });
    const fixturePidPath = File.join(RUN_DIR, 'processes', `${gate}-fixture.pid`);
    if (File.isFile(fixturePidPath)) await record('fixture-server', Number(File.read(fixturePidPath).trim()), `loopback-${gate}-fixture`);
    if (result.exitCode !== 0) fail(`${gate} fixture session failed with status ${result.exitCode}`);
  }
}

return Object.freeze({ contract, unit, coverage, smokeCase, negative, failureExit, cleanup, quality, asyncStacks });
})
