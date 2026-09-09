// Loaded by pkg/execution/recorder_runtime_api_test.go with a private in-memory
// backend. There is no production JS event-injection surface.
'use strict';

const capabilities = Recorder.getCapabilities();
if (!capabilities.capture.hostAuthorized || !capabilities.capture.available) {
  throw new Error(`fixture capture capability is unavailable: ${JSON.stringify(capabilities.capture)}`);
}
const starting = Recorder.start({
  within: {processId: 42, title: 'Recorder Fixture'},
  evidence: 'none',
  controlKeycodes: [0x43],
});
let duplicateStart = null;
try {
  await Recorder.start({within: {processId: 42, title: 'Recorder Fixture'}, evidence: 'none'});
} catch (error) {
  duplicateStart = error;
}
if (!duplicateStart || duplicateStart.code !== 'RECORDER_CAPTURE_OCCUPIED') {
  throw new Error(`a concurrent start was not rejected as occupied: ${String(duplicateStart)}`);
}
const session = await starting;
const active = session.status();
if (active.captureState !== 'recording' || active.storageState !== 'open') {
  throw new Error(`unexpected active status: ${JSON.stringify(active)}`);
}
const paused = await session.pause();
const duplicatePause = await session.pause();
if (!paused.changed || paused.captureState !== 'paused' || duplicatePause.changed || session.status().captureState !== 'paused') {
  throw new Error(`pause was not explicit and idempotent: ${JSON.stringify({paused, duplicatePause, status: session.status()})}`);
}
const resumed = await session.resume();
const duplicateResume = await session.resume();
if (!resumed.changed || resumed.captureState !== 'recording' || duplicateResume.changed || session.status().captureState !== 'recording') {
  throw new Error(`resume was not explicit and idempotent: ${JSON.stringify({resumed, duplicateResume, status: session.status()})}`);
}
const [first, second] = await Promise.all([session.stop(), session.stop()]);
if (first.recordingId !== second.recordingId || first.captureState !== 'stopped' || first.storageState !== 'saved') {
  throw new Error(`stop was not idempotent: ${JSON.stringify({first, second})}`);
}
if (first.counts.accepted !== 5 || first.counts.persisted !== 5 || first.counts.paused !== 0 || first.counts.dropped !== 0) {
  throw new Error(`unexpected stop counts: ${JSON.stringify(first.counts)}`);
}
let terminalResume = null;
try {
  await session.resume();
} catch (error) {
  terminalResume = error;
}
if (!terminalResume || terminalResume.code !== 'RECORDER_INVALID_STATE') {
  throw new Error(`resume after stop did not fail with RECORDER_INVALID_STATE: ${String(terminalResume)}`);
}
const built = await Recorder.buildActions(first.recordingDir);
if (built.readiness !== 'ready' || built.actionCount !== 1) {
  throw new Error(`unexpected actions: ${JSON.stringify(built)}`);
}
const actions = JSON.parse(File.read(built.actionsFile));
if (actions.actions.length !== 1 || actions.actions[0].kind !== 'click') {
  throw new Error(`unexpected saved action: ${JSON.stringify(actions.actions)}`);
}
File.write('recorder-session-result.json', JSON.stringify({active, paused, duplicatePause, resumed, duplicateResume, first, second, built}, null, 2) + '\n');
