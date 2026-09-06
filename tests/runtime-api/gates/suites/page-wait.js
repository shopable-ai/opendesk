// Scoped Page wait contract, behavior, lifecycle, failure and cleanup evidence.
(function createSuite(context) {
'use strict';
const {
  ROOT_DIR, RUN_DIR, fail, readJSON, writeJSON, generate, recordWatchdog,
  executeProcess, executeJS, runJS, verifyZeroCleanup, noResidual,
} = context;
const cleanup = (...args) => context.invoke('cleanup', ...args);

async function pageWait() {
  const requiredStages = ['contract', 'unit', 'coverage', 'lifecycle', 'old-deadline-counterexample',
    'old-cleanup-counterexample', 'failure-exit', 'host-cancel', 'final-cleanup'];
  const result = {
    schemaVersion: 1,
    status: 'running',
    required: requiredStages.length,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    requiredStages,
    stages: [],
  };
  let failure = null;

  async function stage(name, run) {
    result.executed += 1;
    try {
      const detail = await run();
      result.passed += 1;
      result.stages.push({ name, status: 'passed', ...(detail || {}) });
    } catch (error) {
      result.failed += 1;
      result.stages.push({ name, status: 'failed', error: String(error && error.stack || error) });
      throw error;
    }
  }

  async function expectedFailure(name, sourceName, readyMarker) {
    const probe = await executeJS(name, File.join(ROOT_DIR, 'tests', 'runtime-api', sourceName), 2, 60, { display: false });
    if (probe.exitCode === 0 || probe.exitCode === 124) {
      fail(name + ' must fail without watchdog status 124; got ' + probe.exitCode);
    }
    if (!probe.stdout.includes(readyMarker)) {
      fail(name + ' did not reach its behavioral counterexample marker');
    }
    const summaryPath = File.join(RUN_DIR, 'runtime-logs', name, 'summary.json');
    const summary = await readJSON(summaryPath, name + ' summary');
    if (!summary || summary.status !== 'failed') fail(name + ' summary is not failed');
    await verifyZeroCleanup(name);
    const evidence = {
      schemaVersion: 1,
      status: 'passed',
      expectedFailure: true,
      ready: true,
      exitStatus: probe.exitCode,
      watchdogExitStatus: 124,
      runtimeStatus: summary.status,
      summary: summaryPath,
    };
    await writeJSON(File.join(RUN_DIR, 'results', name + '.json'), evidence);
    return { evidence };
  }

  try {
    await stage('contract', async () => {
      await runJS('contract', File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-contract.js'), 5, 180);
      await verifyZeroCleanup('contract');
    });
    await stage('unit', async () => {
      await runJS('unit', File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-unit.js'), 15, 240);
      await verifyZeroCleanup('unit');
    });
    await stage('coverage', async () => {
      await runJS('coverage', File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-coverage.js'), 10, 240);
      await verifyZeroCleanup('coverage');
    });
    await stage('lifecycle', async () => {
      await runJS('page-wait-lifecycle', File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-lifecycle.js'), 5, 120);
      await verifyZeroCleanup('page-wait-lifecycle');
    });
    await stage('old-deadline-counterexample', async () => expectedFailure('page-wait-old-deadline-failure',
      'page-wait-old-deadline-failure.js', 'PAGE_WAIT_OLD_DEADLINE_FAILURE_READY=1'));
    await stage('old-cleanup-counterexample', async () => expectedFailure('page-wait-old-cleanup-failure',
      'page-wait-old-cleanup-failure.js', 'PAGE_WAIT_OLD_CLEANUP_FAILURE_READY=1'));
    await stage('failure-exit', async () => {
      const probe = await executeJS(
        'page-wait-failure',
        File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-failure.js'),
        2,
        60,
        { display: false },
      );
      if (probe.exitCode === 0 || probe.exitCode === 124) {
        fail('Page wait assertion counterexample must fail without watchdog status 124; got ' + probe.exitCode);
      }
      if (!probe.stdout.includes('PAGE_WAIT_ASSERTION_FAILURE_READY=1')) {
        fail('Page wait assertion counterexample did not reach the public API assertion');
      }
      const summaryPath = File.join(RUN_DIR, 'runtime-logs', 'page-wait-failure', 'summary.json');
      const summary = await readJSON(summaryPath, 'Page wait failure summary');
      if (!summary || summary.status !== 'failed') {
        fail('Page wait assertion counterexample summary is not failed');
      }
      await verifyZeroCleanup('page-wait-failure');
      const evidence = {
        schemaVersion: 1,
        status: 'passed',
        expectedFailure: true,
        ready: true,
        exitStatus: probe.exitCode,
        watchdogExitStatus: 124,
        runtimeStatus: summary.status,
        summary: summaryPath,
      };
      await writeJSON(File.join(RUN_DIR, 'results', 'page-wait-failure.json'), evidence);
      return { evidence };
    });
    await stage('host-cancel', async () => {
      const source = File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-host-cancel.js');
      const generated = File.join(RUN_DIR, 'generated', 'page-wait-host-cancel.generated.js');
      const seam = File.join(ROOT_DIR, 'tests', 'runtime-api', 'seams', 'page-wait-host-cancel.sh');
      if (!File.isFile(seam)) fail('Page wait host cancellation seam is missing: ' + seam);
      await generate(source, generated);
      const seamResult = await executeProcess('page-wait-host-cancel-seam', '/bin/sh', [seam, generated], {
        deadlineSeconds: 60,
      });
      if (seamResult.exitCode !== 0) {
        fail('Page wait host cancellation seam failed with status ' + seamResult.exitCode);
      }
      await recordWatchdog('page-wait-host-cancel');
      await verifyZeroCleanup('page-wait-host-cancel');
      await runJS(
        'page-wait-host-cancel-validation',
        File.join(ROOT_DIR, 'tests', 'runtime-api', 'page-wait-host-cancel-validation.js'),
        5,
        120,
      );
      await verifyZeroCleanup('page-wait-host-cancel-validation');
      return {
        evidence: await readJSON(
          File.join(RUN_DIR, 'results', 'page-wait-host-cancel-validation.json'),
          'Page wait host cancellation validation',
        ),
      };
    });
  } catch (error) {
    failure = error;
  }
  try {
    await stage('final-cleanup', async () => {
      await cleanup();
      await noResidual();
    });
  } catch (error) {
    failure = failure || error;
  }

  result.skipped = Math.max(0, result.required - result.executed);
  result.status = !failure && result.failed === 0 && result.skipped === 0 ? 'passed' : 'failed';
  await writeJSON(File.join(RUN_DIR, 'results', 'page-wait.json'), result);
  console.log('[RUNTIME-API-PAGE-WAIT RESULT] ' + JSON.stringify(result));
  if (failure) throw failure;
  if (result.status !== 'passed') fail('Page wait acceptance did not execute every required stage');
}

return Object.freeze({ pageWait });
})
