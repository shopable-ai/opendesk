(() => {
  const { assert, test } = RuntimeAPITest;
  const baseContext = {
    runId: 'negative-' + Date.now(),
    startedAt: new Date().toISOString(),
    binary: { path: '/runtime/under-test', sha256: 'a'.repeat(64), buildSource: 'negative-test' },
  };
  function gate(name, extra = {}) {
    return {
      schemaVersion: '1.0.0',
      runId: baseContext.runId,
      gate: name,
      status: 'passed',
      startedAt: baseContext.startedAt,
      finishedAt: new Date().toISOString(),
      runtime: baseContext.binary,
      ...extra,
    };
  }
  function gates(extra = {}) {
    const values = Object.fromEntries(RuntimeAPIAcceptance.requiredGates.map((name) => [name, gate(name)]));
    values['failure-exit'] = gate('failure-exit', { exitStatus: 1, assertionObserved: true });
    values.live = gate('live', { liveSession: { permissions: { ok: true }, window: { isForeground: true } } });
    values['custom-ui'] = gate('custom-ui', {
      behaviorStatus: 'passed', behaviorFinishedAt: new Date().toISOString(),
      postSuite: { status: 'passed', finalized: true, noResidualProcesses: 'passed' },
      lifecycleProbes: Object.fromEntries([
        'scriptException', 'timeout', 'unresolvedPromise', 'httpCancel', 'serverShutdown', 'resourceCleanup', 'noResidualProcesses',
      ].map((name) => [name, 'passed'])),
    });
    values.cleanup = gate('cleanup', { confirmed: true });
    return { ...values, ...extra };
  }
  function evidenceFixture(name, mutate) {
    const dir = File.join(RuntimeAPITest.context.runDir, 'negative', name);
    File.ensureDir(dir);
    const statePath = File.join(dir, 'state.json');
    const eventsPath = File.join(dir, 'events.ndjson');
    const prePath = File.join(dir, 'pre.png');
    File.write(statePath, '{}');
    File.write(eventsPath, JSON.stringify({ schemaVersion: '1.0.0', runId: baseContext.runId, sequence: 1, timestamp: new Date().toISOString(), type: 'click', targetId: 'button-primary' }) + '\n');
    File.write(prePath, 'not-a-real-png');
    const manifest = {
      schemaVersion: '1.0.0',
      runId: baseContext.runId,
      statePath,
      eventArtifacts: [eventsPath, eventsPath],
      screenshots: { pre: { path: prePath }, post: { path: File.join(dir, 'missing-post.png') } },
      evidenceFiles: [],
    };
    if (mutate) mutate(manifest);
    const manifestPath = File.join(dir, 'manifest.json');
    File.write(manifestPath, JSON.stringify(manifest));
    return { manifestPath };
  }

  test({ name: 'acceptance rejects a catalog method deleted from the current Runtime catalog', tier: 'quality', covers: ['File.read'] }, async () => {
    const deleted = RuntimeAPIManifest.slice(1);
    const result = RuntimeAPICatalogValidation.validateCatalog({ catalog: deleted });
    assert(!result.ok && result.errors.some((error) => error.includes('catalog missing Runtime method')), JSON.stringify(result));
  });

  test({ name: 'acceptance rejects duplicate catalog IDs and unknown test IDs', tier: 'quality', covers: ['File.write'] }, async () => {
    const duplicate = [...RuntimeAPIManifest, { ...RuntimeAPIManifest[0] }];
    const catalog = RuntimeAPICatalogValidation.validateCatalog({ catalog: duplicate });
    const tests = RuntimeAPICatalogValidation.validateTestIds(RuntimeAPIManifest, [{ covers: ['unknown.id'] }]);
    assert(!catalog.ok && catalog.errors.some((error) => error.includes('duplicate catalog IDs')), JSON.stringify(catalog));
    assert(!tests.ok && tests.unknown.includes('unknown.id'), JSON.stringify(tests));
  });

  test({ name: 'catalog preserves SQLite handle methods without inventing SQLite globals', tier: 'quality', covers: ['SQLite.open', 'SQLiteDatabase.query'] }, async () => {
    const withoutHandleQuery = RuntimeAPIManifest.filter((entry) => entry.id !== 'SQLiteDatabase.query');
    const missingHandle = RuntimeAPICatalogValidation.validateCatalog({ catalog: withoutHandleQuery });
    assert(
      !missingHandle.ok && missingHandle.errors.some((error) => error.includes('catalog missing Runtime handle method: SQLiteDatabase.query')),
      JSON.stringify(missingHandle),
    );

    const handleQuery = RuntimeAPIManifest.find((entry) => entry.id === 'SQLiteDatabase.query');
    const inventedGlobal = {
      ...handleQuery,
      id: 'SQLite.query',
      family: 'SQLite',
      kind: undefined,
      ownerFamily: undefined,
      handleType: undefined,
    };
    const falseGlobal = RuntimeAPICatalogValidation.validateCatalog({ catalog: [...RuntimeAPIManifest, inventedGlobal] });
    assert(
      !falseGlobal.ok && falseGlobal.errors.some((error) => error.includes('catalog contains unknown ID: SQLite.query')),
      JSON.stringify(falseGlobal),
    );
  });

  test({ name: 'acceptance rejects a passed live result without a post screenshot', tier: 'quality', covers: ['page.screenshot'] }, async () => {
    const evidence = RuntimeAPIAcceptance.validateEvidence(evidenceFixture('missing-screenshot'), baseContext);
    assert(!evidence.ok && evidence.errors.some((error) => error.includes('screenshot missing')), JSON.stringify(evidence));
  });

  test({ name: 'acceptance rejects missing composition state and events artifacts', tier: 'quality', covers: ['File.exists'] }, async () => {
    const evidence = RuntimeAPIAcceptance.validateEvidence(evidenceFixture('missing-state-events', (manifest) => {
      manifest.statePath = '';
      manifest.eventArtifacts = [];
    }), baseContext);
    assert(!evidence.ok && evidence.errors.some((error) => error.includes('composition state missing')) && evidence.errors.some((error) => error.includes('events declaration missing')), JSON.stringify(evidence));
  });

  test({ name: 'acceptance rejects zero and watchdog failure_exit statuses', tier: 'quality', covers: ['System.getProcessList'] }, async () => {
    const zero = RuntimeAPIAcceptance.validateGateSet(gates({ 'failure-exit': gate('failure-exit', { exitStatus: 0, assertionObserved: true }) }), baseContext);
    const timeout = RuntimeAPIAcceptance.validateGateSet(gates({ 'failure-exit': gate('failure-exit', { exitStatus: 124, assertionObserved: true }) }), baseContext);
    assert(!zero.ok && zero.errors.some((error) => error.includes('returned zero')), JSON.stringify(zero));
    assert(!timeout.ok && timeout.errors.some((error) => error.includes('watchdog timeout')), JSON.stringify(timeout));
  });

  test({ name: 'acceptance rejects an unconfirmed cleanup result', tier: 'quality', covers: ['System.getProcessList'] }, async () => {
    const result = RuntimeAPIAcceptance.validateGateSet(gates({ cleanup: gate('cleanup', { confirmed: false }) }), baseContext);
    assert(!result.ok && result.errors.some((error) => error.includes('cleanup was not confirmed')), JSON.stringify(result));
  });

  test({ name: 'acceptance rejects a missing or failed custom-ui gate', tier: 'quality', covers: ['FloatingWindow.show'] }, async () => {
    const missing = gates();
    delete missing['custom-ui'];
    const missingResult = RuntimeAPIAcceptance.validateGateSet(missing, baseContext);
    const failedResult = RuntimeAPIAcceptance.validateGateSet(gates({ 'custom-ui': gate('custom-ui', { status: 'failed' }) }), baseContext);
    assert(!missingResult.ok && missingResult.errors.some((error) => error.includes('missing gate result: custom-ui')), JSON.stringify(missingResult));
    assert(!failedResult.ok && failedResult.errors.some((error) => error.includes('failed gate: custom-ui')), JSON.stringify(failedResult));
  });

  test({ name: 'coverage rejects passed records inside a failed custom-ui gate', tier: 'quality', covers: ['FloatingWindow.show'] }, async () => {
    const customUI = gate('custom-ui', {
      status: 'failed',
      tests: [{ name: 'misleading passed method', status: 'passed', verification: 'behavior', tier: 'custom-ui', covers: ['FloatingWindow.show'] }],
    });
    const records = RuntimeAPICoverageValidation.passedTestRecords({ 'custom-ui': customUI });
    const required = RuntimeAPICoverageValidation.failedRequiredGates(
      RuntimeAPIManifest.filter((entry) => entry.id === 'FloatingWindow.show'),
      { 'custom-ui': 'failed', contract: 'passed' },
    );
    assert(records.length === 0, 'failed custom-ui gate leaked passed test records into coverage');
    assert(required.some((item) => item.gate === 'custom-ui' && item.status === 'failed'), JSON.stringify(required));
  });

  test({ name: 'coverage and acceptance reject an unfinalized passed custom-ui gate', tier: 'quality', covers: ['FloatingWindow.show'] }, async () => {
    const unfinalized = gate('custom-ui', {
      status: 'passed', behaviorStatus: 'passed', behaviorFinishedAt: new Date().toISOString(),
      tests: [{ name: 'premature method pass', status: 'passed', verification: 'behavior', tier: 'custom-ui', covers: ['FloatingWindow.show'] }],
    });
    const records = RuntimeAPICoverageValidation.passedTestRecords({ 'custom-ui': unfinalized });
    const acceptance = RuntimeAPIAcceptance.validateGateSet(gates({ 'custom-ui': unfinalized }), baseContext);
    assert(records.length === 0, 'unfinalized custom-ui gate leaked records into coverage');
    assert(!acceptance.ok && acceptance.errors.some((error) => error.includes('custom-ui gate was not finalized')), JSON.stringify(acceptance));
  });

  test({ name: 'acceptance rejects results produced by a different binary SHA', tier: 'quality', covers: ['System.getFingerprint'] }, async () => {
    const wrong = gate('contract', { runtime: { ...baseContext.binary, sha256: 'b'.repeat(64) } });
    const result = RuntimeAPIAcceptance.validateGateSet(gates({ contract: wrong }), baseContext);
    assert(!result.ok && result.errors.some((error) => error.includes('binary SHA mismatch')), JSON.stringify(result));
  });
})();
