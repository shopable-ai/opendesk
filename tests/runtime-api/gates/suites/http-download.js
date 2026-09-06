// http-download: formal deterministic loopback gate for the native streaming
// owner. It deliberately reuses the established fixture/session seam and
// runtime cleanup proof rather than creating another test runner.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, CONTEXT, fail, executeProcess, record, verifyZeroCleanup, noResidual } = context;

async function httpDownload() {
  const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'async-fixture-session.sh');
  for (const scope of ['http-response-types', 'http-download']) {
    const result = await executeProcess(`${scope}-fixture-session`, '/bin/sh', [seam, scope], {
      deadlineSeconds: 180,
      env: { OPENDESK_RUNTIME_API_CONTEXT_PATH: CONTEXT },
    });
    const fixturePidPath = File.join(RUN_DIR, 'processes', `${scope}-fixture.pid`);
    if (File.isFile(fixturePidPath)) await record('fixture-server', Number(File.read(fixturePidPath).trim()), `loopback-${scope}-fixture`);
    if (result.exitCode !== 0) fail(`${scope} fixture session failed with status ${result.exitCode}`);
    await verifyZeroCleanup(scope);
  }
  await noResidual();
}

return Object.freeze({ httpDownload });
})
