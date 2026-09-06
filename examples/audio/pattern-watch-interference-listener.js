// Run from the repository root after generating the fixture:
// ./dist/opendesk -script examples/audio/pattern-watch-interference-listener.js -console-mode script
// Start this listener first, then in another terminal run:
// afplay .runtime/tests/platform-primitives/task-016-audio-pattern-watcher/fixture/order-interference-20s.wav

const evidenceDirectory = '.runtime/tests/platform-primitives/task-016-audio-pattern-watcher';
const evidencePath = File.join(evidenceDirectory, 'interference-live.json');
const fixtureDirectory = '.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/fixture';
const references = [{ id: 'order-created', path: File.join(fixtureDirectory, 'order-created.wav') }];
const capability = Audio.getCapabilities().patternWatch;
const expectedMatches = [
  { patternId: 'order-created', startOffsetMs: 3000 },
  { patternId: 'order-created', startOffsetMs: 12000 },
];
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
    source: 'system', expectedMatches, expectedOffsetsMs: expectedMatches.map(value => value.startOffsetMs),
    rawAudioExposed: capability.rawAudioExposed, rawAudioPersisted: capability.rawAudioPersisted,
    cleanup: 'not-started', businessConfirmed: false,
  };
  writeEvidence(evidence);
  console.log(JSON.stringify(evidence));
} else {
  if (references.some(reference => !File.exists(reference.path))) throw new Error('generated reference fixture is unavailable');
  let watcher;
  try {
    watcher = await Audio.watchSound({
      source: { type: 'system' }, references,
      threshold: 0.88, cooldownMs: 3000, startupTimeoutMs: 10000,
    }, event => {
      const data = event.data;
      const match = { patternId: data.patternId, confidence: data.confidence, startOffsetMs: data.startOffsetMs, endOffsetMs: data.endOffsetMs, sequence: event.sequence, sourceScope: data.sourceScope, coalesced: event.coalesced };
      matches.push(match);
      // This is intentionally the first callback action: public fields only.
      console.log(JSON.stringify({ type: event.type, ...match }));
    });
    console.log(JSON.stringify({ listening: true, source: 'system', expectedMatches }));
    await sleep(22000);
    const accepted = watcher.stop();
    const terminal = await watcher.wait();
    const ordered = matches.length === expectedMatches.length && matches.every((match, index) => match.patternId === expectedMatches[index].patternId && Math.abs(match.startOffsetMs - expectedMatches[index].startOffsetMs) <= 700 && match.sourceScope === 'system-mix');
    const evidence = { schemaVersion: 1, ok: terminal.status === 'stopped' && ordered, skipped: false, expectedMatches, matches, stopAccepted: accepted, terminalStatus: terminal.status, terminalMatches: terminal.matches, cleanup: terminal.status, businessConfirmed: false, semanticLayer: 'not-used: fixed sound patterns are not ASR' };
    writeEvidence(evidence);
    console.log(JSON.stringify(evidence));
  } catch (error) {
    const evidence = { schemaVersion: 1, ok: false, skipped: false, error: publicError(error), matches, cleanup: watcher ? 'unknown' : 'not-started', businessConfirmed: false };
    writeEvidence(evidence);
    console.log(JSON.stringify(evidence));
    throw error;
  }
}
