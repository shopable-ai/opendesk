// Formal live gate, from the repository root:
// node tests/custom-ui/tools/support-app/run-app-native.mjs [strict-ax|core|business] [new-evidence-directory]
// It runs an instrumented staging copy, not the public experience command.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { stageApp } from '../../../../examples/ai-customer-support/scripts/stage-app.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2] || 'strict-ax';
if (!['strict-ax', 'core', 'business'].includes(mode) || process.argv.length > 4) {
  throw Error('Usage: run-app-native.mjs [strict-ax|core|business] [new-evidence-directory]');
}
const runtime = resolve(repo, '.runtime');
const evidence = resolve(repo, process.argv[3] || `.runtime/tests/ai-customer-support/app-native-${Date.now()}`);
const rel = relative(runtime, evidence);
if (!rel || rel === '..' || rel.startsWith('..' + sep) || resolve(runtime, rel) !== evidence) {
  throw Error('Evidence must be a new directory under the repository .runtime/');
}
mkdirSync(resolve(evidence, '..'), { recursive: true });
mkdirSync(evidence); // Preserve previous attempts; never overwrite them.
const sourceRoot = resolve(repo, 'examples/ai-customer-support');
const packageRoot = stageApp({ sourceRoot, destination: join(evidence, 'package') });
const gate = resolve(repo, 'tests/custom-ui/ai-customer-support-app-native.js');
const resultFile = join(evidence, 'ui/result.json');
const literal = JSON.stringify;
const entry = join(packageRoot, 'main.js');
writeFileSync(entry, readFileSync(entry, 'utf8') + `
// Test-only suffix. App UI and business sources are unchanged.
try {
  const w = await supportApp.panel.getState();
  const target = { id:'darwin:'+w.hostPid+':native:'+w.nativeWindowId,
    pid:w.hostPid, handle:w.nativeWindowId, title:'OpenDesk · AI 客服助手（未连接）', ...w.bounds };
  await (0,eval)(File.read(${literal(gate)}))({target,evidence:${literal(join(evidence, 'ui'))},strictAX:${mode === 'strict-ax'},businessOnly:${mode === 'business'}});
} catch (error) {
  console.log('SUPPORT_APP_GATE_ERROR ' + String(error));
  // Persist before quit, which can cancel exception propagation.
  await File.writeJSON(${literal(join(evidence, 'caught-error.json'))},{error:String(error),actionState:error.actionState??null});
} finally { await automation.app.quit(); }
`);
const args = ['-app', packageRoot, '-console-mode', 'script', '-log-dir', join(evidence, 'app')];
// Portable App Mode uses the package's own workdir. Copy the prepared input
// fixture into that documented fixed directory, never inject business state.
const fileRoot = join(packageRoot, '.runtime/business-sync');
if (mode === 'business') {
  mkdirSync(fileRoot, { recursive: true });
  writeFileSync(join(fileRoot, 'multistore-v1.json'), readFileSync(join(repo, '.runtime/business-sync/multistore-v1.json')), { flag: 'wx' });
}
const beforeBackups = new Set(existsSync(fileRoot) ? readdirSync(fileRoot) : []);
const run = spawnSync(resolve(repo, 'dist/opendesk'), args, {
  cwd: repo, encoding: 'utf8', timeout: 55000, maxBuffer: 16 * 1024 * 1024,
}); // Timeout sends SIGTERM only to this runner's own child; never replay input.
writeFileSync(join(evidence, 'process.stdout.log'), run.stdout || '');
writeFileSync(join(evidence, 'process.stderr.log'), run.stderr || '');
let result;
try { result = JSON.parse(readFileSync(resultFile, 'utf8')); }
catch { result = { status: 'FAIL', error: 'No gate result; startup, single-instance activation or timeout requires inspection' }; }
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
let backupProof = null;
if (mode === 'business' && result.status === 'PASS') {
  try {
    const names = readdirSync(fileRoot).filter(name => !beforeBackups.has(name) && /^business-backup-[A-Za-z0-9_-]+\.json$/.test(name));
    if (names.length !== 1) throw Error('Expected one new native business backup');
    const file = join(fileRoot, names[0]), data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.format !== 'opendesk.ai-customer-support.business-backup' || data.cursors?.['["store-demo","crm"]'] !== 'demo-v1') throw Error('Native backup omitted UI-applied CRM checkpoint');
    backupProof = { name: names[0], sha256: sha(file), cursor: data.cursors['["store-demo","crm"]'] };
    writeFileSync(join(evidence, 'native-backup.json'), readFileSync(file));
  } catch (error) { result = { ...result, status: 'FAIL', error: String(error) }; }
}
const passed = !run.error && run.status === 0 && result.status === 'PASS';
writeFileSync(join(evidence, 'run.json'), JSON.stringify({
  status: passed ? 'PASS' : 'FAIL', mode, instrumented: true, args,
  exitCode: run.status, signal: run.signal, error: run.error?.message ?? null,
  htmlSha256: sha(join(packageRoot, 'preview/index.html')),
  publicEntrySha256: sha(join(sourceRoot, 'main.js')), instrumentedEntrySha256: sha(entry),
  gateSha256: sha(gate), backupProof, result,
}, null, 2) + '\n');
console.log(`${passed ? 'PASS' : 'FAIL'} ${mode}: ${evidence}`);
if (!passed) console.error(result.error || run.error?.message || 'Inspect run.json');
process.exitCode = passed ? 0 : 1;
