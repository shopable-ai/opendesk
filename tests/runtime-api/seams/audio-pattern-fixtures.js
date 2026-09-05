function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return delay(ms);
}

const patternWatch = Audio.getCapabilities().patternWatch;
assert(patternWatch.supported === true, 'fixture backend must advertise pattern watching');
assert(patternWatch.sources.system.supported === true, 'fixture backend must advertise system source');

let callbackCount = 0;
const matches = [];
let wake;
const changed = new Promise(resolve => { wake = resolve; });
const watcher = await Audio.watchSound({
  source: { type: 'system' },
  references: [{ id: 'order-reference', path: 'fixtures/order-reference.wav' }],
  threshold: 0.86,
  cooldownMs: 250,
  startupTimeoutMs: 2000,
}, event => {
  callbackCount++;
  matches.push(event);
  wake();
});

const deadline = Date.now() + 2000;
while (callbackCount < 1 && Date.now() < deadline) {
  await Promise.race([changed, sleep(10)]);
}
assert(callbackCount === 1, 'continuous watcher callback must run');
assert(matches.every(event => event.data.patternId === 'order-reference'), 'confuser must not trigger the order pattern');
assert(matches.every(event => event.backend === 'runtime-api-fixture-memory'), 'fixture backend must be identified');
assert(matches[0].coalesced >= 1, 'cooldown-separated continuous matches must report bounded coalescing');

assert(watcher.stop() === true, 'stop must accept the listening watcher');
const terminal = await watcher.wait();
assert(terminal.status === 'stopped', 'fixture watcher must stop cleanly');
assert(terminal.matches === 2, 'terminal result must count both post-cooldown matches');

const first = await Audio.waitForSound({
  source: { type: 'system' },
  references: [{ id: 'order-reference', path: 'fixtures/order-reference.wav' }],
  threshold: 0.86,
  cooldownMs: 0,
  timeoutMs: 2000,
  startupTimeoutMs: 2000,
});
assert(first.data.patternId === 'order-reference', 'waitForSound must resolve the first matching signal');
assert(first.data.startOffsetMs < 500, 'first-signal arbitration must retain the first cue');

File.write('audio-pattern-fixtures-result.json', JSON.stringify({
  callbackCount,
  callbackSequences: matches.map(event => event.sequence),
  callbackConfidences: matches.map(event => event.data.confidence),
  terminal,
  firstSignal: {
    patternId: first.data.patternId,
    startOffsetMs: first.data.startOffsetMs,
    sequence: first.sequence,
  },
  fixtures: [
    'order-reference.wav',
    'order-volume.wav',
    'order-noise.wav',
    'order-resampled.wav',
    'confuser.wav',
  ],
}, null, 2));
