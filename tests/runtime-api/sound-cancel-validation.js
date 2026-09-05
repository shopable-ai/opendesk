// Post-signal validation for sound-cancel-smoke.sh. The shell wrapper owns
// process readiness and SIGINT; all Runtime-observable artifact assertions are
// kept in JavaScript.

'use strict';

function requiredEnvironment(name) {
  const value = Execution.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

const runDir = requiredEnvironment('OPENDESK_SOUND_CANCEL_RUN_DIR');
const runtimeLog = requiredEnvironment('OPENDESK_SOUND_CANCEL_RUNTIME_LOG');
const stdoutLog = requiredEnvironment('OPENDESK_SOUND_CANCEL_STDOUT_LOG');
const observedExitMs = Number(requiredEnvironment('OPENDESK_SOUND_CANCEL_OBSERVED_EXIT_MS'));
const exitStatus = Number(requiredEnvironment('OPENDESK_SOUND_CANCEL_EXIT_STATUS'));
const eventsPath = File.join(runtimeLog, 'events.ndjson');
const summaryPath = File.join(runtimeLog, 'summary.json');
const resultPath = File.join(runDir, 'result.json');

if (!Number.isInteger(observedExitMs) || observedExitMs < 0 || observedExitMs > 3000) {
  throw new Error(`invalid or excessive signal-to-exit bound: ${observedExitMs}`);
}
if (!Number.isInteger(exitStatus) || exitStatus === 0) {
  throw new Error(`sound cancellation probe must exit non-zero, got ${exitStatus}`);
}
const stdout = File.read(stdoutLog);
if (stdout.includes('SOUND_SYNC_CANCEL_UNEXPECTED_RETURN')) {
  throw new Error('Sound.play returned normally after the cancellation marker');
}
if (!stdout.includes('status=canceled')) {
  throw new Error('sound cancellation probe did not report canceled status');
}

const summary = await File.readJSON(summaryPath);
if (!summary || summary.status !== 'canceled') {
  throw new Error('Runtime summary status is not canceled');
}
let cleanup = null;
for (const line of File.read(eventsPath).split('\n')) {
  if (!line.trim()) continue;
  const event = JSON.parse(line);
  if (event.kind === 'cleanup') cleanup = event.fields || {};
}
if (!cleanup) throw new Error('Runtime cleanup event is missing');
const soundResources = {};
for (const key of ['soundWorkers', 'soundPending', 'soundPlaybacks']) {
  soundResources[key] = cleanup[key];
  if (cleanup[key] !== 0) {
    throw new Error(`sound resources were not drained: ${JSON.stringify(soundResources)}`);
  }
}

const result = {
  schemaVersion: 1,
  status: 'passed',
  runtimeStatus: summary.status,
  exitStatus,
  observedSignalToExitMsUpperBound: observedExitMs,
  maximumAllowedMs: 3000,
  soundResources,
  events: eventsPath,
  summary: summaryPath,
};
await File.writeJSON(resultPath, result);
console.log(`[RUNTIME-API-SOUND-CANCEL] ${JSON.stringify(result)}`);
