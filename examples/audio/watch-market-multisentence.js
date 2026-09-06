// 先生成 fixture，再从仓库根目录启动监听器：
// ./dist/opendesk -script examples/audio/watch-market-multisentence.js -console-mode script
// 监听器输出 listening:true 后，在另一个应用或终端播放：
// afplay .runtime/tests/platform-primitives/task-016-audio-pattern-watcher/market-multisentence/market-multisentence-20s.wav

const evidenceDirectory = '.runtime/tests/platform-primitives/task-016-audio-pattern-watcher';
const evidencePath = File.join(evidenceDirectory, 'market-multisentence-live.json');
const fixtureDirectory = File.join(evidenceDirectory, 'market-multisentence');
const expectedMatches = [
  { patternId: 'order-created', startOffsetMs: 3000 },
  { patternId: 'payment-completed', startOffsetMs: 11000 },
];
const capability = Audio.getCapabilities().patternWatch;
const references = [
  { id: 'order-created', path: File.join(fixtureDirectory, 'order-created.wav') },
  { id: 'payment-completed', path: File.join(fixtureDirectory, 'payment-completed.wav') },
];
const matches = [];

function evidence(value) {
  File.ensureDir(evidenceDirectory);
  File.write(evidencePath, JSON.stringify(value, null, 2));
}
function publicError(error) {
  return { code: String(error && error.code || 'UNKNOWN'), operation: String(error && error.operation || 'Audio.watchSound') };
}

if (!capability.supported || !capability.sources.system.supported) {
  const result = { schemaVersion: 1, ok: false, skipped: true, reason: 'system-mix pattern capture backend is unsupported on this host', platform: capability.platform, backend: capability.backend, status: capability.status, source: 'system', expectedMatches, rawAudioExposed: capability.rawAudioExposed, rawAudioPersisted: capability.rawAudioPersisted, businessConfirmed: false };
  evidence(result);
  console.log(JSON.stringify(result));
} else {
  if (references.some(reference => !File.exists(reference.path))) throw new Error('generate the market multi-sentence fixture first');
  let watcher;
  try {
    watcher = await Audio.watchSound({ source: { type: 'system' }, references, threshold: 0.88, cooldownMs: 3000, startupTimeoutMs: 10000 }, event => {
      const data = event.data;
      const match = { patternId: data.patternId, confidence: data.confidence, startOffsetMs: data.startOffsetMs, endOffsetMs: data.endOffsetMs, sequence: event.sequence, sourceScope: data.sourceScope };
      matches.push(match);
      console.log(JSON.stringify({ type: event.type, ...match }));
    });
    console.log(JSON.stringify({ listening: true, source: 'system', expectedMatches }));
    await sleep(22000);
    const stopAccepted = watcher.stop();
    const terminal = await watcher.wait();
    const ordered = matches.length === expectedMatches.length && matches.every((match, index) => match.patternId === expectedMatches[index].patternId && Math.abs(match.startOffsetMs - expectedMatches[index].startOffsetMs) <= 700 && match.sourceScope === 'system-mix');
    const result = { schemaVersion: 1, ok: terminal.status === 'stopped' && ordered, skipped: false, expectedMatches, matches, stopAccepted, terminalStatus: terminal.status, terminalMatches: terminal.matches, cleanup: terminal.status, businessConfirmed: false, semanticLayer: 'not-used: fixed sound patterns are not ASR' };
    evidence(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = { schemaVersion: 1, ok: false, skipped: false, error: publicError(error), matches, cleanup: watcher ? 'unknown' : 'not-started', businessConfirmed: false };
    evidence(result);
    console.log(JSON.stringify(result));
    throw error;
  }
}
