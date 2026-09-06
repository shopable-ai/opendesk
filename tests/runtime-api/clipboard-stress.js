// From the repository root, with a disposable clipboard:
// OPENDESK_LIVE_CLIPBOARD_STRESS=1 ./dist/opendesk -script tests/runtime-api/clipboard-stress.js -console-mode script
// Repeatedly overwrites the system clipboard. Does not auto-paste, clear or restore prior formats. Not in the default unit/smoke catalog.
// Seeded strings + fixed Unicode/whitespace boundaries; assertions remain meaningful even when error detail logging is disabled.
'use strict';
if (Execution.env.OPENDESK_LIVE_CLIPBOARD_STRESS !== '1') throw new Error('Clipboard stress overwrites clipboard; set OPENDESK_LIVE_CLIPBOARD_STRESS=1 explicitly');
function integerEnv(name, fallback, min, max) {
  const raw = Execution.env[name];
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error('Invalid integer option: ' + name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Out of range option: ' + name);
  return value;
}
const fixed = ['', ' ', '     ', '\n\n\n', '\t\t\t', '😀🚀🌍🔥', '东京/北京/上海/香港', 'α β γ δ ε π ∞ ∑ √', '<!-- HTML comment -->', '{"key":123}', 'a'.repeat(500)];
const iterations = integerEnv('OPENDESK_CLIPBOARD_STRESS_ITERATIONS', 100, fixed.length, 1000);
const seed = integerEnv('OPENDESK_CLIPBOARD_STRESS_SEED', 20260906, 0, 4294967295);
let state = seed >>> 0;
function next() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; }
function sample(size) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = size === undefined ? 10 + next() % 991 : size;
  let text = '';
  for (let i = 0; i < length; i += 1) text += chars[next() % chars.length];
  return text;
}
const directory = File.join(Execution.artifactDir, 'clipboard-stress');
if (File.exists(directory)) throw new Error('Clipboard stress evidence already exists; start a new execution');
File.ensureDir(directory);
const reportPath = File.join(directory, 'result.json');
const report = { kind: 'live-stress', fullCatalog: false, status: 'running', seed, requested: iterations, attempted: 0, passed: 0, failed: 0, failures: [], clipboardRestored: false };
const save = () => File.write(reportPath, JSON.stringify(report, null, 2));
save();
for (let index = 0; index < iterations; index += 1) {
  const expected = index < fixed.length ? fixed[index] : sample(index === fixed.length ? 500 : undefined);
  report.attempted += 1;
  try {
    clipboard.copy(expected);
    await page.waitForTimeout(20);
    if (clipboard.paste() !== expected) throw new Error('read-back mismatch');
    report.passed += 1;
  } catch (_) {
    report.failed += 1;
    // Never retain actual clipboard text, arbitrary native error messages or a private clipboard snapshot.
    report.failures.push({ iteration: index + 1, category: 'write/read/compare-failed' });
  }
  save(); // Interrupted runs remain running, with progress; never persist a speculative success.
}
report.status = report.failed === 0 && report.attempted === iterations ? 'passed' : 'failed';
save();
console.log('[CLIPBOARD-STRESS] ' + JSON.stringify({ status: report.status, passed: report.passed, failed: report.failed, reportPath }));
if (report.status !== 'passed') throw new Error('Clipboard stress failed: ' + report.failed + '/' + report.attempted);
