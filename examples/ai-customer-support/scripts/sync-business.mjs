#!/usr/bin/env node
// Trusted local code only. A Worker bounds failures, not authority.
import { Worker } from 'node:worker_threads';
import { lstat, realpath, mkdir, open, link, unlink } from 'node:fs/promises';
import { dirname, resolve, relative, sep, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const repoRoot = await realpath(resolve(import.meta.dirname, '../../..'));
const runtimeRoot = join(repoRoot, '.runtime');
const MAX_BYTES = 1024 * 1024;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const codes = new Set(['ARGUMENTS', 'ADAPTER', 'PATH', 'EXISTS', 'TIMEOUT', 'HOOK_FAILED', 'SCHEMA', 'SIZE', 'WORKER', 'PUBLISH']);

function argumentsFor(argv) {
  const allowed = new Set(['adapter', 'store', 'source', 'cursor', 'out', 'timeout-ms']);
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!argv[i]?.startsWith('--') || !allowed.has(key) || key in options ||
        argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail('ARGUMENTS');
    options[key] = argv[i + 1];
  }
  if (!options.adapter || !options.out || !options.store || !options.source) fail('ARGUMENTS');
  for (const key of ['store', 'source']) if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(options[key])) fail('ARGUMENTS');
  if (options.cursor !== undefined && (!options.cursor || options.cursor.length > 512 || /[\x00-\x1f\x7f]/.test(options.cursor))) fail('ARGUMENTS');
  const timeout = options['timeout-ms'] ?? '10000';
  if (!/^\d+$/.test(timeout) || Number(timeout) < 100 || Number(timeout) > 60000) fail('ARGUMENTS');
  return { ...options, timeout: Number(timeout) };
}

async function outputPath(input) {
  const output = resolve(input);
  const rel = relative(runtimeRoot, output);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || resolve(runtimeRoot, rel) !== output ||
      !output.startsWith(runtimeRoot + sep) || extname(output) !== '.json' || /[\x00-\x1f\x7f]/.test(output)) fail('PATH');
  // Reject symlinks at every directory, including .runtime itself. Never follow
  // an existing output symlink (even dangling) or replace an existing file.
  let directory = repoRoot;
  for (const part of relative(repoRoot, dirname(output)).split(sep)) {
    directory = join(directory, part);
    try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') fail('PATH'); }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) fail('PATH');
  }
  try { await lstat(output); fail('EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return output;
}

async function runWorker(options, adapter) {
  const worker = new Worker(new URL('./business-hook-worker.mjs', import.meta.url), {
    workerData: { adapter, storeId: options.store, sourceId: options.source, cursor: options.cursor ?? null },
    stdout: true, stderr: true,
    resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
  });
  try {
    return await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error(), { code: 'TIMEOUT' })), options.timeout);
      const done = callback => value => { clearTimeout(timer); callback(value); };
      let outputBytes = 0;
      const discard = chunk => {
        outputBytes += chunk.length;
        if (outputBytes > 64 * 1024) {
          clearTimeout(timer);
          reject(Object.assign(new Error(), { code: 'WORKER' }));
        }
      };
      worker.stdout.on('data', discard);
      worker.stderr.on('data', discard);
      worker.once('error', done(() => reject(Object.assign(new Error(), { code: 'WORKER' }))));
      worker.once('exit', done(() => reject(Object.assign(new Error(), { code: 'WORKER' }))));
      worker.once('message', done(message => {
        if (!message || message.ok !== true) return reject(Object.assign(new Error(), { code: codes.has(message?.code) ? message.code : 'WORKER' }));
        if (Object.keys(message).sort().join() !== 'json,ok') return reject(Object.assign(new Error(), { code: 'WORKER' }));
        if (typeof message.json !== 'string' || Buffer.byteLength(message.json) > MAX_BYTES) return reject(Object.assign(new Error(), { code: 'SIZE' }));
        accept(message.json);
      }));
    });
  } finally {
    await worker.terminate();
  }
}

async function validateReturnedSnapshot(json, options) {
  // A worker message is an untrusted DTO even when adapters are trusted code.
  // Load our own validator independently; never import the adapter in the parent.
  try {
    const bundled = await build({ entryPoints: [resolve(import.meta.dirname, '../src/domain/business.ts')],
      bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
    const { parseBusinessSnapshot } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
    const snapshot = parseBusinessSnapshot(json);
    if (snapshot.storeId !== options.store || snapshot.sourceId !== options.source || snapshot.previousCursor !== (options.cursor ?? null)) fail('SCHEMA');
  } catch { fail('SCHEMA'); }
}

async function publish(output, json) {
  await outputPath(output); // Recheck after trusted hooks have completed.
  const temporary = join(dirname(output), `.business-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(json, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await outputPath(output);
    // Same-filesystem hard link is atomic and fails if ANY destination exists.
    await link(temporary, output);
  } catch (error) {
    fail(error.code === 'EEXIST' || error.code === 'EXISTS' ? 'EXISTS' : error.code === 'PATH' ? 'PATH' : 'PUBLISH');
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22) fail('ARGUMENTS');
  const options = argumentsFor(process.argv.slice(2));
  let adapter;
  try {
    adapter = await realpath(resolve(options.adapter));
    if (extname(adapter) !== '.mjs' || !(await lstat(adapter)).isFile()) fail('ADAPTER');
  } catch { fail('ADAPTER'); }
  const output = await outputPath(options.out);
  const json = await runWorker(options, adapter);
  await validateReturnedSnapshot(json, options);
  await publish(output, json);
  process.stdout.write(JSON.stringify({ ok: true, code: 'PUBLISHED', path: relative(repoRoot, output) }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: codes.has(error?.code) ? error.code : 'PUBLISH' }) + '\n');
  process.exitCode = 1;
}
