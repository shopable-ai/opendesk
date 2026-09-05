// Run from the repository root after generating the fixture:
// ./dist/opendesk -script examples/audio/pattern-watch-interference-listener.js -console-mode script
// Start this listener first, then in another terminal run:
// afplay .runtime/tests/platform-primitives/task-016-audio-pattern-watcher/fixture/order-interference-20s.wav

const evidenceDirectory = '.runtime/tests/platform-primitives/task-016-audio-pattern-watcher';
const evidencePath = File.join(evidenceDirectory, 'interference-live.json');
const fixturePath = '.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/fixture/order-cue.wav';
const capability = Audio.getCapabilities().patternWatch;
const expectedOffsetsMs = [3000, 12000];
const matches = [];

function writeEvidence(value) {
  File.ensureDir(evidenceDirectory);
  File.write(evidencePath, JSON.stringify(value, null, 2));
}

function publicError(error) {
  return { code: error && error.code ? String(error.code) : 'UNKNOWN', operation: error && error.operation ? String(error.operation) : 'Audio.watchSound' };
}

if (!capability.supported || !capability.sources.system.supported) {
  const evidence = {
    schemaVersion: 1, ok: false, skipped: true,
    reason: 'system-mix pattern capture backend is unsupported on this host',
    platform: capability.platform, backend: capability.backend, status: capability.status,
    source: 'system', expectedMatches: 2, expectedOffsetsMs,
    rawAudioExposed: capability.rawAudioExposed, rawAudioPersisted: capability.rawAudioPersisted,
    cleanup: 'not-started', businessConfirmed: false,
  };
  writeEvidence(evidence);
  console.log(JSON.stringify(evidence));
} else {
  if (!File.exists(fixturePath)) throw new Error('generated reference fixture is unavailable');
  let watcher;
  try {
    watcher = await Audio.watchSound({
      source: { type: 'system' }, references: [{ id: 'order-cue', path: fixturePath }],
      threshold: 0.88, cooldownMs: 3000, startupTimeoutMs: 10000,
    }, event => {
      const data = event.data;
      const match = { patternId: data.patternId, confidence: data.confidence, startOffsetMs: data.startOffsetMs, endOffsetMs: data.endOffsetMs, sequence: event.sequence, coalesced: event.coalesced };
      matches.push(match);
      // This is intentionally the first callback action: public fields only.
      console.log(JSON.stringify({ type: event.type, ...match }));
    });
    console.log(JSON.stringify({ listening: true, source: 'system', expectedOffsetsMs }));
    await sleep(22000);
    const accepted = watcher.stop();
    const terminal = await watcher.wait();
    const evidence = { schemaVersion: 1, ok: terminal.status === 'stopped' && matches.length === 2, skipped: false, expectedMatches: 2, expectedOffsetsMs, matches, stopAccepted: accepted, terminalStatus: terminal.status, terminalMatches: terminal.matches, cleanup: terminal.status, businessConfirmed: false };
    writeEvidence(evidence);
    console.log(JSON.stringify(evidence));
  } catch (error) {
    const evidence = { schemaVersion: 1, ok: false, skipped: false, error: publicError(error), matches, cleanup: watcher ? 'unknown' : 'not-started', businessConfirmed: false };
    writeEvidence(evidence);
    console.log(JSON.stringify(evidence));
    throw error;
  }
}
