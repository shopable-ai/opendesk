'use strict';

// Offline staging checks only. No application build or desktop execution.
// From the repository root:
// node --test tests/custom-ui/ai-customer-support-app-package.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const runtimeRoot = path.join(repoRoot, '.runtime');
const testRoot = path.join(runtimeRoot, 'tests/ai-customer-support-app-package');
const moduleURL = pathToFileURL(path.join(repoRoot,
  'examples/ai-customer-support/scripts/stage-app.mjs')).href;
const expectedFiles = [
  'opendesk.app.json', 'main.js', 'desktop/app-host.js', 'desktop/business-files.js',
  'desktop/app-integrity.json', 'desktop/business-validator.generated.js', 'preview/index.html',
].sort();

async function fixture(t) {
  fs.mkdirSync(testRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(testRoot, 'case-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'source');
  const destination = path.join(root, 'packages/support');
  const write = (file, data) => {
    const target = path.join(sourceRoot, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  };
  write('opendesk.app.json', JSON.stringify({
    schemaVersion: 1, id: 'com.opendesk.ai-customer-support', version: '1.0.0',
    entry: 'main.js', window: { mainId: 'supportReactR23', closeBehavior: 'quit' },
  }));
  write('main.js', "require('./desktop/app-host.js');\n");
  write('desktop/app-host.js', "// Offline host fixture; not executed.\n");
  write('desktop/business-files.js', "// Offline file bridge fixture; not executed.\n");
  write('desktop/business-validator.generated.js', "// Offline canonical validator fixture; not executed.\n");
  write('preview/index.html', '<!doctype html><title>Support</title>');
  const hash = createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, 'preview/index.html'))).digest('hex');
  write('desktop/app-integrity.json', JSON.stringify({ previewSha256: hash }));
  const { stageApp } = await import(moduleURL);
  return { root, sourceRoot, destination, write, stageApp };
}

function listFiles(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(root, file) : [file];
  }).sort();
}

test('allowlist bytes and relative structure survive moving the package without its source', async t => {
  const f = await fixture(t);
  for (const file of ['desktop/main.js', 'desktop/adapter.js', 'desktop/assets/old.png',
    'src/desktop.ts', 'scripts/run-desktop.sh', 'package.json']) f.write(file, 'old patch');
  const bytes = new Map(expectedFiles.map(file => [file, fs.readFileSync(path.join(f.sourceRoot, file))]));
  assert.equal(f.stageApp(f), f.destination);
  const moved = path.join(f.root, 'relocated');
  fs.renameSync(f.destination, moved);
  fs.rmSync(f.sourceRoot, { recursive: true });
  assert.deepEqual(listFiles(moved), expectedFiles);
  for (const [file, expected] of bytes) assert.deepEqual(fs.readFileSync(path.join(moved, file)), expected);
  const manifest = JSON.parse(fs.readFileSync(path.join(moved, 'opendesk.app.json'), 'utf8'));
  assert.ok(fs.statSync(path.join(moved, manifest.entry)).isFile());
  const integrity = JSON.parse(fs.readFileSync(path.join(moved, 'desktop/app-integrity.json'), 'utf8'));
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(moved, 'preview/index.html'))).digest('hex'), integrity.previewSha256);
});

test('repository-relative destination stays stable when invoked from another cwd', async t => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    'const {stageApp}=await import(process.argv[1]); console.log(stageApp({sourceRoot:process.argv[2],destination:process.argv[3]}));',
    moduleURL, f.sourceRoot, path.relative(repoRoot, f.destination)],
  { cwd: f.sourceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), f.destination);
  assert.deepEqual(listFiles(f.destination), expectedFiles);
});

test('existing directories, files, and empty directories are never overwritten', async t => {
  const f = await fixture(t);
  fs.mkdirSync(f.destination, { recursive: true });
  assert.throws(() => f.stageApp(f), /already exists/);
  fs.writeFileSync(path.join(f.destination, 'keep'), 'untouched');
  assert.throws(() => f.stageApp(f), /already exists/);
  assert.equal(fs.readFileSync(path.join(f.destination, 'keep'), 'utf8'), 'untouched');
  const target = path.join(f.root, 'existing-file');
  fs.writeFileSync(target, 'keep');
  assert.throws(() => f.stageApp({ ...f, destination: target }), /already exists/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
});

for (const linked of ['main.js', 'desktop', '.']) {
  test(`rejects symlink source ${linked} before creating destination`, async t => {
    const f = await fixture(t);
    const original = path.join(f.sourceRoot, linked);
    const saved = path.join(f.root, 'saved');
    const directory = fs.statSync(original).isDirectory();
    fs.renameSync(original, saved);
    fs.symlinkSync(saved, original, directory ? 'dir' : 'file');
    assert.throws(() => f.stageApp(f), /Symlink not allowed/);
    assert.equal(fs.existsSync(f.destination), false);
  });
}

test('rejects destinations outside .runtime, its root, and path-prefix siblings', async t => {
  const f = await fixture(t);
  for (const destination of [repoRoot, runtimeRoot, path.join(repoRoot, '.runtime-other/package'),
    path.join(runtimeRoot, '../escaped-package')]) {
    assert.throws(() => f.stageApp({ ...f, destination }), /must be inside repo\/\.runtime/);
  }
});

test('rejects destination symlinks, linked ancestors, and dangling links', async t => {
  const f = await fixture(t);
  const link = path.join(f.root, 'linked');
  fs.symlinkSync(f.sourceRoot, link, 'dir');
  for (const destination of [link, path.join(link, 'package')]) {
    assert.throws(() => f.stageApp({ ...f, destination }), /Symlink not allowed/);
  }
  const dangling = path.join(f.root, 'dangling');
  fs.symlinkSync(path.join(f.root, 'missing'), dangling);
  assert.throws(() => f.stageApp({ ...f, destination: dangling }), /Symlink not allowed/);
  assert.equal(fs.existsSync(path.join(f.sourceRoot, 'package')), false);
});

test('changed preview bytes and malformed or stale hashes fail before staging', async t => {
  const f = await fixture(t);
  f.write('preview/index.html', '<title>Changed after integrity generation</title>');
  assert.throws(() => f.stageApp(f), /SHA-256 mismatch/);
  assert.equal(fs.existsSync(f.destination), false);
  for (const previewSha256 of [undefined, null, 42, '0'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)]) {
    f.write('desktop/app-integrity.json', JSON.stringify({ previewSha256 }));
    assert.throws(() => f.stageApp(f), /SHA-256 mismatch/);
    assert.equal(fs.existsSync(f.destination), false);
  }
});
