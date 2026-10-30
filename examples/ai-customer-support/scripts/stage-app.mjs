// From the repository root:
// node examples/ai-customer-support/scripts/stage-app.mjs [destination]
// Stages existing files only; never builds, launches, or signs the application.
import { constants, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exampleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(exampleRoot, '../..');
const runtimeRoot = join(repoRoot, '.runtime');
const files = Object.freeze([
  'opendesk.app.json',
  'main.js',
  'desktop/app-host.js',
  'desktop/business-files.js',
  'desktop/business-validator.generated.js',
  'desktop/app-integrity.json',
  'preview/index.html',
]);

function statIfExists(file) {
  try { return lstatSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Check ancestors too: an ordinary file beneath a linked directory is unsafe.
function rejectSymlinks(file) {
  const parent = dirname(file);
  if (parent !== file) rejectSymlinks(parent);
  if (statIfExists(file)?.isSymbolicLink()) {
    throw new Error(`Symlink not allowed: ${file}`);
  }
}

/** sourceRoot supports isolated fixtures; destinations always stay in this repo. */
export function stageApp({
  destination = join(runtimeRoot, 'packages/ai-customer-support'),
  sourceRoot = exampleRoot,
} = {}) {
  // npm --prefix runs this script from the example directory. CLI destinations
  // use the documented repository-root convention regardless of caller cwd.
  destination = resolve(repoRoot, destination);
  sourceRoot = resolve(sourceRoot);
  const inside = relative(runtimeRoot, destination);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error('Destination must be inside repo/.runtime');
  }
  rejectSymlinks(destination);
  if (statIfExists(destination)) throw new Error(`Destination already exists: ${destination}`);

  // Snapshot the exact bytes validated below, so later source edits cannot change
  // the preview being copied after its integrity check.
  const contents = new Map();
  for (const file of files) {
    const source = join(sourceRoot, file);
    rejectSymlinks(source);
    if (!lstatSync(source).isFile()) throw new Error(`Source must be a regular file: ${file}`);
    contents.set(file, readFileSync(source));
  }
  const manifest = JSON.parse(contents.get('opendesk.app.json').toString('utf8'));
  if (manifest.id !== 'com.opendesk.ai-customer-support' || manifest.entry !== 'main.js' ||
      manifest.window?.mainId !== 'supportReactR23') {
    throw new Error('Unexpected App manifest identity, entry, or mainId');
  }
  const integrity = JSON.parse(contents.get('desktop/app-integrity.json').toString('utf8'));
  const hash = createHash('sha256').update(contents.get('preview/index.html')).digest('hex');
  if (typeof integrity.previewSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(integrity.previewSha256) ||
      integrity.previewSha256.toLowerCase() !== hash) {
    throw new Error('Preview SHA-256 mismatch or invalid previewSha256; refresh app-integrity.json');
  }

  mkdirSync(dirname(destination), { recursive: true });
  // Exclusive directory creation rejects another stager claiming the same target.
  mkdirSync(destination);
  for (const [file, bytes] of contents) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL });
  }
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node stage-app.mjs [destination]');
    console.log(stageApp({ destination: process.argv[2] }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
