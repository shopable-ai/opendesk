function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertMatch(event, patternId) {
  assert(event && typeof event === 'object', 'match must be an object');
  assert(event.schemaVersion === 1, 'match schemaVersion must be 1');
  assert(event.type === 'audio.pattern.matched', 'match type must be audio.pattern.matched');
  assert(event.backend === 'runtime-api-memory', 'match backend must identify the injected backend');
  assert(Number.isInteger(event.sequence) && event.sequence > 0, 'match sequence must be positive');
  assert(Number.isInteger(event.coalesced) && event.coalesced >= 0, 'match coalesced must be bounded');
  assert(typeof event.timestamp === 'string' && !Number.isNaN(Date.parse(event.timestamp)), 'match timestamp must be ISO-like');
  assert(event.data && typeof event.data === 'object', 'match data must be present');
  assert(event.data.patternId === patternId, 'match must identify the requested reference');
  assert(typeof event.data.watchId === 'string' && event.data.watchId.length > 0, 'match watchId must be present');
  assert(typeof event.data.confidence === 'number' && event.data.confidence >= 0.99, 'exact PCM must match confidently');
  assert(Number.isInteger(event.data.startOffsetMs) && event.data.startOffsetMs >= 0, 'match start offset must be non-negative');
  assert(Number.isInteger(event.data.endOffsetMs) && event.data.endOffsetMs > event.data.startOffsetMs, 'match end offset must follow start');
  assert(/^sha256:[0-9a-f]{64}$/.test(event.data.referenceDigest), 'reference digest must be a SHA-256 identifier');
  assert(event.data.sourceScope === 'system-mix', 'source scope must remain system-mix');
  assert(event.data.sourceVerified === true, 'injected source must remain verified');
  assert(event.data.contentIncluded === false, 'raw content must not be exposed');
}

const patternWatch = Audio.getCapabilities().patternWatch;
assert(patternWatch.supported === true, 'injected pattern watcher must be supported');
assert(patternWatch.sources.system.supported === true, 'injected system source must be supported');

const options = {
  source: { type: 'system' },
  references: [{ id: 'new-order', path: 'reference.wav' }],
  threshold: 0.99,
  cooldownMs: 0,
  startupTimeoutMs: 2000,
};

let callbackCount = 0;
let callbackMatch = null;
let notifyCallback;
const callbackSeen = new Promise(resolve => { notifyCallback = resolve; });
const watcher = await Audio.watchSound(options, event => {
  callbackCount++;
  callbackMatch = event;
  notifyCallback();
});

assert(typeof watcher.id === 'string' && watcher.id.length > 0, 'watcher id must be present');
assert(watcher.backend === 'runtime-api-memory', 'watcher backend must identify the injected backend');
assert(watcher.sourceScope === 'system-mix', 'watcher source scope must remain system-mix');
assert(watcher.sourceVerified === true, 'watcher source must remain verified');
assert(watcher.status() === 'listening', 'watcher must start in listening state');

await callbackSeen;
assert(callbackCount === 1, 'continuous watcher callback must run once');
assertMatch(callbackMatch, 'new-order');
assert(callbackMatch.data.watchId === watcher.id, 'callback watchId must match its watcher');

assert(watcher.stop() === true, 'first stop call must accept the transition');
assert(watcher.stop() === false, 'second stop call must be idempotent');
assert(watcher.status() === 'stopping', 'watcher must report stopping before wait settles');
const waitA = watcher.wait();
const waitB = watcher.wait();
assert(waitA === waitB, 'repeated wait calls must return the same Promise');
const terminal = await waitA;
assert(terminal.id === watcher.id, 'terminal result must identify its watcher');
assert(terminal.status === 'stopped', 'explicitly stopped watcher must terminate as stopped');
assert(typeof terminal.stoppedAt === 'string' && !Number.isNaN(Date.parse(terminal.stoppedAt)), 'terminal stoppedAt must be ISO-like');
assert(terminal.matches === 1, 'terminal result must report one delivered match');
assert(watcher.status() === 'stopped', 'watcher status must become stopped');
assert(await watcher.wait() === terminal, 'wait after termination must retain the terminal result');

let oneShotSettlements = 0;
const oneShot = Audio.waitForSound({ ...options, timeoutMs: 2000 }).then(event => {
  oneShotSettlements++;
  return event;
});
const oneShotMatch = await oneShot;
assertMatch(oneShotMatch, 'new-order');
assert(oneShotMatch.data.endOffsetMs < 500, 'waitForSound must retain the first producer match when a later cue also matches');
await Promise.resolve();
await Promise.resolve();
assert(oneShotSettlements === 1, 'waitForSound must settle exactly once');

File.write('audio-pattern-positive-result.json', JSON.stringify({
  callbackCount,
  continuousWatchId: watcher.id,
  continuousSequence: callbackMatch.sequence,
  oneShotSequence: oneShotMatch.sequence,
  oneShotSettlements,
  terminal,
}, null, 2));
