// Results-driven acceptance validation. It intentionally scores no source text:
// only current-run result files, evidence bytes and cleanup observations count.
globalThis.RuntimeAPIAcceptance = (() => {
  const requiredGates = ['contract', 'unit', 'coverage', 'smoke', 'failure-exit', 'live', 'composition', 'custom-ui', 'cleanup'];

  function errorList() {
    const errors = [];
    return { errors, require(condition, message) { if (!condition) errors.push(message); } };
  }

  function validateGateSet(gates, context) {
    const result = errorList();
    for (const gate of requiredGates) {
      const value = gates[gate];
      result.require(value && typeof value === 'object', 'missing gate result: ' + gate);
      if (!value) continue;
      result.require(value.runId === context.runId, 'foreign runId for ' + gate);
      result.require(value.status === 'passed', 'failed gate: ' + gate);
      result.require(value.runtime && value.runtime.path === context.binary.path, 'foreign binary path for ' + gate);
      result.require(value.runtime && value.runtime.sha256 === context.binary.sha256, 'binary SHA mismatch for ' + gate);
      result.require(typeof value.finishedAt === 'string' && Date.parse(value.finishedAt) >= Date.parse(context.startedAt), 'stale timestamp for ' + gate);
    }
    const failure = gates['failure-exit'];
    if (failure) {
      result.require(Number(failure.exitStatus) !== 0, 'failure_exit returned zero');
      result.require(Number(failure.exitStatus) !== 124, 'failure_exit hit watchdog timeout');
      result.require(failure.assertionObserved === true, 'failure_exit did not observe JS failure');
    }
    const cleanup = gates.cleanup;
    if (cleanup) result.require(cleanup.confirmed === true, 'cleanup was not confirmed');
    const customUI = gates['custom-ui'];
    if (customUI) {
      result.require(customUI.behaviorStatus === 'passed', 'custom-ui behavior result was not passed');
      result.require(customUI.postSuite && customUI.postSuite.status === 'passed', 'custom-ui post-suite was not passed');
      result.require(customUI.postSuite && customUI.postSuite.finalized === true, 'custom-ui gate was not finalized');
      result.require(customUI.postSuite && customUI.postSuite.noResidualProcesses === 'passed', 'custom-ui no-residual result was not passed');
      result.require(typeof customUI.behaviorFinishedAt === 'string'
        && Date.parse(customUI.finishedAt) >= Date.parse(customUI.behaviorFinishedAt), 'custom-ui final timestamp precedes behavior completion');
      for (const probe of ['scriptException', 'timeout', 'unresolvedPromise', 'httpCancel', 'serverShutdown', 'resourceCleanup', 'noResidualProcesses']) {
        result.require(customUI.lifecycleProbes && customUI.lifecycleProbes[probe] === 'passed', 'custom-ui lifecycle probe failed: ' + probe);
      }
    }
    const live = gates.live;
    if (live) {
      result.require(live.liveSession && live.liveSession.permissions && live.liveSession.permissions.ok === true, 'live permission result missing or not granted');
      result.require(live.liveSession && live.liveSession.window && live.liveSession.window.isForeground === true, 'live foreground window identity missing');
    }
    return { ok: result.errors.length === 0, errors: result.errors };
  }

  function validateEvidence(evidence, context) {
    const result = errorList();
    result.require(evidence && evidence.manifestPath, 'composition evidence manifest missing');
    if (!evidence || !evidence.manifestPath || !File.exists(evidence.manifestPath)) return { ok: false, errors: [...result.errors, 'evidence manifest path unreadable'] };
    const manifest = JSON.parse(File.read(evidence.manifestPath));
    result.require(manifest.schemaVersion === '1.0.0', 'evidence schema version mismatch');
    result.require(manifest.runId === context.runId, 'evidence runId mismatch');
    result.require(manifest.statePath && File.exists(manifest.statePath), 'composition state missing');
    result.require(Array.isArray(manifest.eventArtifacts) && manifest.eventArtifacts.length >= 2, 'composition events declaration missing');
    result.require(manifest.screenshots && manifest.screenshots.pre && manifest.screenshots.post, 'pre/post screenshot declarations missing');
    for (const screenshot of [manifest.screenshots && manifest.screenshots.pre, manifest.screenshots && manifest.screenshots.post]) {
      result.require(screenshot && screenshot.path && File.exists(screenshot.path), 'composition screenshot missing');
    }
    for (const file of manifest.evidenceFiles || []) {
      result.require(File.exists(file.path), 'evidence file missing: ' + file.path);
      if (File.exists(file.path)) {
        result.require(new Uint8Array(File.readBytes(file.path)).length === Number(file.sizeBytes), 'evidence file size mismatch: ' + file.path);
        result.require(RuntimeAPICrypto.hashFile(file.path) === file.sha256, 'evidence file SHA mismatch: ' + file.path);
      }
    }
    const ndjsonPath = (manifest.eventArtifacts || []).find((value) => String(value).endsWith('.ndjson'));
    result.require(ndjsonPath && File.exists(ndjsonPath), 'events.ndjson missing');
    if (ndjsonPath && File.exists(ndjsonPath)) {
      const lines = File.read(ndjsonPath).trim().split('\n').filter(Boolean);
      result.require(lines.length > 0, 'events.ndjson empty');
      let previous = 0;
      for (const line of lines) {
        const event = JSON.parse(line);
        result.require(event.runId === context.runId, 'event runId mismatch');
        result.require(Number.isInteger(event.sequence) && event.sequence === previous + 1, 'event sequence is not monotonic');
        result.require(typeof event.timestamp === 'string' && event.timestamp.length > 0, 'event timestamp missing');
        result.require(typeof event.type === 'string' && event.type.length > 0, 'event type missing');
        result.require(typeof event.targetId === 'string', 'event targetId missing');
        previous = Number(event.sequence);
      }
    }
    result.require(evidence.replay && evidence.replay.path && File.exists(evidence.replay.path), 'moved-window replay evidence missing');
    if (evidence.replay && evidence.replay.path && File.exists(evidence.replay.path)) {
      const replay = JSON.parse(File.read(evidence.replay.path));
      result.require(replay.runId === context.runId, 'replay runId mismatch');
      result.require(replay.originalWindow && replay.relocatedWindow, 'replay window state missing');
      result.require(replay.screenshots && replay.screenshots.pre && replay.screenshots.post, 'replay screenshots missing');
    }
    return { ok: result.errors.length === 0, errors: result.errors, manifest };
  }

  function validateSummary(summary) {
    const result = errorList();
    for (const key of ['schemaVersion', 'runId', 'startedAt', 'finishedAt', 'durationMs', 'git', 'environment', 'runtime', 'catalogFingerprint', 'gates', 'cleanup', 'status']) {
      result.require(summary && summary[key] !== undefined, 'summary missing ' + key);
    }
    result.require(summary && summary.schemaVersion === '1.0.0', 'summary schema version mismatch');
    result.require(summary && ['passed', 'failed'].includes(summary.status), 'summary status invalid');
    return { ok: result.errors.length === 0, errors: result.errors };
  }

  function readRunGates(context) {
    const gates = {};
    for (const name of requiredGates) {
      const path = RuntimeAPITest.resultPath(name);
      if (File.exists(path)) gates[name] = RuntimeAPITest.readJSON(path);
    }
    return gates;
  }

  function acceptance(context = RuntimeAPITest.context) {
    const gates = readRunGates(context);
    const gateCheck = validateGateSet(gates, context);
    const evidenceCheck = validateEvidence(gates.composition && gates.composition.evidence, context);
    return {
      ok: gateCheck.ok && evidenceCheck.ok,
      errors: [...gateCheck.errors, ...evidenceCheck.errors],
      gates,
      evidence: evidenceCheck,
    };
  }

  function writeSummary(assessment, context = RuntimeAPITest.context) {
    const finishedAt = new Date().toISOString();
    const started = Date.parse(context.startedAt);
    const gateCounts = Object.values(assessment.gates).reduce((accumulator, gate) => {
      if (gate.status === 'passed') accumulator.passed += 1;
      else if (gate.status === 'skipped') accumulator.skipped += 1;
      else accumulator.failed += 1;
      return accumulator;
    }, { passed: 0, failed: 0, skipped: 0 });
    const summary = {
      schemaVersion: '1.0.0',
      runId: context.runId,
      startedAt: context.startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - started),
      git: context.git,
      environment: context.environment,
      runtime: context.binary,
      catalogFingerprint: assessment.gates.coverage && assessment.gates.coverage.catalogFingerprint || '',
      gates: gateCounts,
      contractOnlyRisks: RuntimeAPIManifest.filter((entry) => entry.contractOnlyReason).map((entry) => ({ id: entry.id, reason: entry.contractOnlyReason })),
      live: assessment.gates.live && assessment.gates.live.liveSession || null,
      evidence: assessment.evidence.manifest ? {
        manifestPath: assessment.gates.composition.evidence.manifestPath,
        files: assessment.evidence.manifest.evidenceFiles,
      } : null,
      cleanup: assessment.gates.cleanup || null,
      status: assessment.ok ? 'passed' : 'failed',
      errors: assessment.errors,
    };
    const schema = validateSummary(summary);
    if (!schema.ok) {
      summary.status = 'failed';
      summary.errors = [...summary.errors, ...schema.errors];
    }
    RuntimeAPITest.writeJSON(File.join(context.runDir, 'summary.json'), summary);
    return summary;
  }

  return { requiredGates, validateGateSet, validateEvidence, validateSummary, readRunGates, acceptance, writeSummary };
})();
