// Repository root: node tests/custom-ui/tools/support-app/run-workspace-files.mjs
// Runs the real JavaScript Runtime gate, then independently inspects Unix modes.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const root = join(repo, '.runtime/tests/ai-customer-support/workspace-20261030');
mkdirSync(root, { recursive: true });
const attempt = join(root, 'files-owner-' + Date.now());
mkdirSync(attempt);
const before = new Set(readdirSync(root));
const seen = new Map();
let stdout = '', stderr = '', timedOut = false;
const binary = join(repo, 'dist/opendesk');
const child = spawn(binary, ['-script', 'tests/custom-ui/ai-customer-support-workspace-files.js', '-console-mode', 'script'], {
  cwd: repo, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });
function sample() {
  for (const name of readdirSync(root).filter(name => name.startsWith('runtime-') && !before.has(name))) {
    const directory = join(root, name, 'isolated-workdir/.runtime/business-sync');
    let names;
    try { names = readdirSync(directory); } catch { continue; }
    for (const file of names.filter(name => /^(?:workspace-(?:slot-[012]\.json|pending\.json|abandoned\.json)|workspace\.lock)$/.test(name) || name.startsWith('.opendesk-new-'))) {
      const path = join(directory, file);
      try { seen.set(path, (seen.get(path) || 0) | (statSync(path).mode & 0o777)); } catch { /* It was atomically published between samples. */ }
    }
  }
}
const timer = setInterval(sample, 10);
const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 600000);
let result;
try {
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  sample();
  const match = stdout.match(/WORKSPACE_FILES_RUNTIME_OK (\{[^\n]+\})/);
  if (timedOut || outcome.code !== 0 || !match) throw Error('Runtime did not complete its file gate');
  const banner = JSON.parse(match[1]);
  const native = JSON.parse(readFileSync(join(banner.evidence, 'result.json'), 'utf8'));
  if (native.status !== 'ok') throw Error('Runtime evidence reports failure');
  const required = ['workspace-slot-0.json', 'workspace-slot-1.json', 'workspace-slot-2.json', 'workspace-pending.json', 'workspace-abandoned.json', 'workspace.lock'];
  for (const name of required) if (![...seen.keys()].some(path => path.endsWith('/' + name))) throw Error('Mode not observed: ' + name);
  if (![...seen.keys()].some(path => path.includes('/.opendesk-new-'))) throw Error('Temporary inode was not observed; privacy proof is incomplete');
  if (process.platform !== 'win32' && [...seen.values()].some(mode => (mode & 0o077) !== 0)) throw Error('A workspace inode allowed group/other access');
  result = { status: 'PASS', outcome, pid: child.pid, umask: process.umask().toString(8), native,
    binarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex'),
    directories: { businessSync: (statSync(join(native.workdir, '.runtime/business-sync')).mode & 0o777).toString(8) },
    observedModes: Object.fromEntries([...seen].map(([path, mode]) => [path, mode.toString(8)])),
    scope: 'real Runtime native File, canonical validation, actual inode modes; induced failure after publication, not power-loss or process-crash durability' };
} catch (error) {
  result = { status: 'FAIL', error: String(error), timedOut, observedModes: Object.fromEntries(seen) };
  process.exitCode = 1;
} finally {
  clearInterval(timer); clearTimeout(timeout);
  writeFileSync(join(attempt, 'stdout.log'), stdout);
  writeFileSync(join(attempt, 'stderr.log'), stderr);
  writeFileSync(join(attempt, 'result.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ status: result.status, checks: result.native?.checks.length, evidence: attempt }));
