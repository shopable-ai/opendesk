// Runtime API 注入式 market seam。
// Go harness 提供确定性 system-mix PCM：约 3 秒是 order-created，
// 约 7 秒是非目标 confuser，约 11 秒是 payment-completed。
// 这个脚本只验证公开 Audio.watchSound 契约、目标顺序、confuser 不误命中和 stop/wait cleanup；
// 它不是平台 live capture evidence，也不是 ASR 或业务确认层。

function assert(condition, message) { if (!condition) throw new Error(message); }

const capability = Audio.getCapabilities().patternWatch;
assert(capability.supported && capability.sources.system.supported, 'market fixture backend must support system pattern watching');
const references = [
  { id: 'order-created', path: 'order-created.wav' },
  { id: 'payment-completed', path: 'payment-completed.wav' },
];
const matches = [];
let resolveTwo;
const twoMatches = new Promise(resolve => { resolveTwo = resolve; });
let timeoutID;
const matchTimeout = new Promise((_, reject) => {
  timeoutID = setTimeout(() => reject(new Error('market fixture did not deliver two callbacks')), 5000);
});
const watcher = await Audio.watchSound({
  source: { type: 'system' }, references, threshold: 0.86, cooldownMs: 3000, startupTimeoutMs: 2000,
}, event => {
  const data = event.data;
  const match = { patternId: data.patternId, confidence: data.confidence, startOffsetMs: data.startOffsetMs,
    endOffsetMs: data.endOffsetMs, sequence: event.sequence, sourceScope: data.sourceScope };
  matches.push(match);
  console.log(JSON.stringify({ type: event.type, ...match }));
  if (matches.length === 2) resolveTwo();
});
console.log(JSON.stringify({ listening: true, expectedMatches: [
  { patternId: 'order-created', startOffsetMs: 3000 },
  { patternId: 'payment-completed', startOffsetMs: 11000 },
] }));
await Promise.race([twoMatches, matchTimeout]);
clearTimeout(timeoutID);
assert(matches[0].patternId === 'order-created' && matches[1].patternId === 'payment-completed', 'targets must match their distinct reference ids in order');
assert(matches[0].startOffsetMs >= 2800 && matches[0].startOffsetMs <= 3800, 'order target offset must be near 3s');
assert(matches[1].startOffsetMs >= 10800 && matches[1].startOffsetMs <= 12000, 'payment target offset must be near 11s');
assert(matches.every(match => match.sourceScope === 'system-mix' && match.confidence >= 0.86), 'callback contract must remain public and thresholded');
assert(matches[1].sequence > matches[0].sequence, 'public match sequence must increase');
assert(watcher.stop() === true, 'market watcher must stop');
const terminal = await watcher.wait();
assert(terminal.status === 'stopped' && terminal.matches === 2, 'market watcher must clean up after two matches');
File.write('audio-pattern-market-result.json', JSON.stringify({ matches, terminal, confuserMatched: false,
  businessConfirmed: false, semanticLayer: 'not-used: fixed sound patterns are not ASR' }, null, 2));
