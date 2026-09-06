// Post-signal validation for seams/page-wait-host-cancel.sh. The shell owns
// only process orchestration; Runtime evidence is interpreted here in JS.

'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredEnvironment(name) {
  const value = Execution.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return String(value);
}

const runDir = requiredEnvironment('OPENDESK_RUNTIME_API_RUN_DIR');
const observationPath = File.join(runDir, 'results', 'page-wait-host-cancel-observation.json');
const stdoutPath = File.join(runDir, 'results', 'page-wait-host-cancel.stdout.log');
const runtimeLogDir = File.join(runDir, 'runtime-logs', 'page-wait-host-cancel');
const summaryPath = File.join(runtimeLogDir, 'summary.json');
const eventsPath = File.join(runtimeLogDir, 'events.ndjson');
const resultPath = File.join(runDir, 'results', 'page-wait-host-cancel-validation.json');

const observation = await File.readJSON(observationPath);
assert(observation && observation.ready === true, 'host cancellation probe never reached READY');
assert(observation.signalSent === true, 'host cancellation seam did not send SIGINT');
assert(observation.signalCount === 1, `host cancellation seam sent ${observation.signalCount} signals`);
assert(Number.isInteger(observation.exitStatus), 'host cancellation exit status is missing');
assert(observation.exitStatus !== 0, `host cancellation must exit non-zero, got ${observation.exitStatus}`);
assert(observation.exitStatus !== 124, 'host cancellation was terminated by the watchdog');

const stdout = File.read(stdoutPath);
assert(stdout.includes('PAGE_WAIT_HOST_CANCEL_READY='), 'host cancellation READY marker is missing');
assert(stdout.includes('"forgottenWaitStarted":true'), 'unawaited wait was not started before host cancellation');
assert(stdout.includes('"forgottenSettled":false'), 'unawaited wait settled before execution teardown');
assert(!stdout.includes('PAGE_WAIT_HOST_CANCEL_UNEXPECTED_RETURN='), 'pending wait returned before host cancellation');

const summary = await File.readJSON(summaryPath);
assert(summary && summary.status === 'canceled', `Runtime summary is not canceled: ${JSON.stringify(summary)}`);

let cleanup = null;
for (const line of File.read(eventsPath).split(/\r?\n/)) {
  if (!line.trim()) continue;
  const event = JSON.parse(line);
  if (event.kind === 'cleanup') cleanup = event.fields || {};
}
assert(cleanup && typeof cleanup === 'object', 'Runtime cleanup event is missing');

const cleanupFields = Object.keys(cleanup);
assert(cleanupFields.length > 0, 'Runtime cleanup event has no resource fields');
const expectedCleanupFields = [
  'workers', 'promiseCallbacks', 'timers',
  'httpWorkers', 'httpCallbacks',
  'soundWorkers', 'soundPending', 'soundPlaybacks',
  'notificationWorkers', 'notificationPending',
  'uiWorkers', 'uiPending', 'uiQueued', 'uiWindows', 'uiListeners', 'uiDriverSinks', 'uiHostProcesses',
  'shortcutBindings', 'shortcutPending',
  'eventSubscriptions', 'eventPending',
  'captureWorkers', 'capturePending', 'captureSessions',
  'appWorkers', 'appPending',
  'commandWorkers', 'commandCallbacks', 'commandProcesses',
  'audioPatternWorkers', 'audioPatternPending', 'audioPatternWatches', 'audioPatternSessions',
  'fileJSONWorkers', 'fileJSONCallbacks', 'fileJSONTemps', 'fileHandles',
  'sqliteWorkers', 'sqliteCallbacks', 'sqliteHandles',
];
const missingCleanupFields = expectedCleanupFields.filter(
  (key) => !Object.prototype.hasOwnProperty.call(cleanup, key),
);
assert(missingCleanupFields.length === 0, `Runtime cleanup fields are missing: ${JSON.stringify(missingCleanupFields)}`);
const invalidCleanup = {};
for (const key of cleanupFields) {
  if (cleanup[key] !== 0) invalidCleanup[key] = cleanup[key];
}
assert(Object.keys(invalidCleanup).length === 0, `Runtime cleanup is not zero: ${JSON.stringify(invalidCleanup)}`);

const result = {
  schemaVersion: 1,
  status: 'passed',
  runtimeStatus: summary.status,
  exitStatus: observation.exitStatus,
  signalCount: observation.signalCount,
  cleanupFieldCount: cleanupFields.length,
  cleanup,
  events: eventsPath,
  summary: summaryPath,
  observation: observationPath,
};
await File.writeJSON(resultPath, result, { spaces: 2, createDirs: true });
console.log(`[RUNTIME-API-PAGE-WAIT-HOST-CANCEL] ${JSON.stringify(result)}`);
