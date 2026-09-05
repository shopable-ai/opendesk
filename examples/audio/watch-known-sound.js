// Run from the repository root:
// OPENDESK_AUDIO_REFERENCE=/absolute/path/to/new-order.wav ./dist/opendesk -script examples/audio/watch-known-sound.js -console-mode script

const referencePath = System.getEnv('OPENDESK_AUDIO_REFERENCE', './public/ding.mp3');
const processPIDText = System.getEnv('OPENDESK_AUDIO_PROCESS_PID');
const capability = Audio.getCapabilities().patternWatch;
const sourceType = processPIDText === undefined ? 'system' : 'process';
const sourceCapability = capability.sources[sourceType];

if (!capability.supported || !sourceCapability.supported) {
  console.log(JSON.stringify({
    ok: false,
    skipped: true,
    reason: 'known-sound watching is unsupported for the selected source on this host',
    backend: capability.backend,
    status: capability.status,
    source: sourceType,
    selfPlaybackExclusion: capability.selfPlaybackExclusion,
    rawAudioExposed: capability.rawAudioExposed,
    rawAudioPersisted: capability.rawAudioPersisted,
  }));
} else {
  const processPID = processPIDText === undefined ? undefined : Number(processPIDText);
  if (processPID !== undefined && (!Number.isInteger(processPID) || processPID <= 0)) {
    throw new Error('OPENDESK_AUDIO_PROCESS_PID must be a positive integer');
  }
  if (!File.exists(referencePath)) {
    throw new Error('reference audio is unavailable');
  }
  const source = processPID === undefined
    ? { type: 'system' }
    : { type: 'process', pid: processPID };

  console.log(JSON.stringify({
    listening: true,
    source: source.type,
    referenceId: 'known-sound',
    matcherVersion: capability.matcherVersion,
    instruction: 'Play the reference cue from the target application; this script does not play it.',
  }));

  const match = await Audio.waitForSound({
    source,
    references: [{ id: 'known-sound', path: referencePath }],
    threshold: 0.88,
    cooldownMs: 3000,
    timeoutMs: 30000,
  });

  console.log(JSON.stringify({
    ok: true,
    type: match.type,
    timestamp: match.timestamp,
    backend: match.backend,
    patternId: match.data.patternId,
    confidence: match.data.confidence,
    sourceScope: match.data.sourceScope,
    contentIncluded: match.data.contentIncluded,
    businessConfirmed: false,
    nextStep: 'Confirm the order through a business API, window state, UI, or OCR.',
  }));
}
