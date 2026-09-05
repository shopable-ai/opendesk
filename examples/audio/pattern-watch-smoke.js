// Run from the repository root:
// OPENDESK_AUDIO_REFERENCE=/absolute/path/to/new-order.wav ./dist/opendesk -script examples/audio/pattern-watch-smoke.js -console-mode script
// The script never plays the reference. Trigger the same cue from the target application.

const evidenceDirectory = '.runtime/tests/platform-primitives/task-016-audio-pattern-watcher';
const evidencePath = File.join(evidenceDirectory, 'pattern-watch-smoke.json');
const referencePath = System.getEnv('OPENDESK_AUDIO_REFERENCE', './public/ding.mp3');
const processPIDText = System.getEnv('OPENDESK_AUDIO_PROCESS_PID');
const capability = Audio.getCapabilities().patternWatch;

function writeEvidence(value) {
  File.ensureDir(evidenceDirectory);
  File.write(evidencePath, JSON.stringify(value, null, 2));
}

function publicError(error) {
  return {
    code: error && error.code ? String(error.code) : 'UNKNOWN',
    operation: error && error.operation ? String(error.operation) : 'Audio.waitForSound',
  };
}

if (processPIDText !== undefined) {
  const processPID = Number(processPIDText);
  if (!Number.isInteger(processPID) || processPID <= 0) {
    throw new Error('OPENDESK_AUDIO_PROCESS_PID must be a positive integer');
  }
}

const source = processPIDText === undefined
  ? { type: 'system' }
  : { type: 'process', pid: Number(processPIDText) };
const sourceCapability = capability.sources[source.type];

if (!capability.supported || !sourceCapability.supported) {
  const evidence = {
    schemaVersion: 1,
    ok: false,
    skipped: true,
    reason: 'selected audio pattern source is unsupported on this host',
    backend: capability.backend,
    status: capability.status,
    source: source.type,
    selfPlaybackExclusion: capability.selfPlaybackExclusion,
    rawAudioExposed: capability.rawAudioExposed,
    rawAudioPersisted: capability.rawAudioPersisted,
  };
  writeEvidence(evidence);
  console.log(JSON.stringify({ ...evidence, evidencePath }));
} else {
  if (!File.exists(referencePath)) throw new Error('reference audio is unavailable');

  let evidence;
  try {
    const match = await Audio.waitForSound({
      source,
      references: [{ id: 'known-sound', path: referencePath }],
      threshold: 0.88,
      cooldownMs: 3000,
      timeoutMs: 30000,
    });
    if (!match || match.type !== 'audio.pattern.matched'
      || !match.data || match.data.patternId !== 'known-sound'
      || match.data.contentIncluded !== false) {
      throw new Error('Audio.waitForSound returned an invalid match envelope');
    }
    evidence = {
      schemaVersion: 1,
      ok: true,
      skipped: false,
      backend: match.backend,
      sourceScope: match.data.sourceScope,
      sourceVerified: match.data.sourceVerified,
      patternId: match.data.patternId,
      confidence: match.data.confidence,
      contentIncluded: match.data.contentIncluded,
      businessConfirmed: false,
      nextStep: 'Confirm the business event through an API, window, UI, or OCR.',
    };
  } catch (error) {
    evidence = { schemaVersion: 1, ok: false, skipped: false, error: publicError(error) };
    writeEvidence(evidence);
    throw error;
  }
  writeEvidence(evidence);
  console.log(JSON.stringify({ ...evidence, evidencePath }));
}
