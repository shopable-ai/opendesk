function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const patternWatch = Audio.getCapabilities().patternWatch;
assert(patternWatch.supported === true, 'injected pattern watcher must be supported');
assert(patternWatch.sources.system.supported === true, 'injected system source must be supported');

const privateBackendDetail = 'private-session-wait-detail';
let settlements = 0;
let resolved = false;
let rejection = null;

try {
  await Audio.waitForSound({
    source: { type: 'system' },
    references: [{ id: 'new-order', path: 'reference.wav' }],
    threshold: 0.99,
    cooldownMs: 0,
    startupTimeoutMs: 2000,
    timeoutMs: 2000,
  });
  resolved = true;
  settlements++;
} catch (error) {
  settlements++;
  rejection = {
    code: error && error.code,
    operation: error && error.operation,
    message: String(error),
  };
}

await Promise.resolve();
await Promise.resolve();

assert(resolved === false, 'waitForSound must not resolve a match when session cleanup cannot be confirmed');
assert(settlements === 1, 'cleanup failure must settle waitForSound exactly once');
assert(rejection && rejection.code === 'BACKEND_FAILED', 'cleanup failure must expose stable BACKEND_FAILED code');
assert(rejection.operation === 'Audio.waitForSound', 'cleanup failure must retain the public operation');
assert(!rejection.message.includes(privateBackendDetail), 'cleanup failure must not expose private backend details');

File.write('audio-pattern-cleanup-failure-result.json', JSON.stringify({
  settlements,
  resolved,
  rejection,
}, null, 2));
