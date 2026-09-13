'use strict';

// Real OpenDesk ESM CLI integration. Run from the repository root:
// node --test tests/javascript-modules/cli.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const binary = path.resolve(process.env.OPENDESK_TEST_BINARY || path.join(root, 'dist', 'opendesk'));
const evidenceRoot = path.join(root, '.runtime', 'tests', 'javascript-modules', `cli-${process.pid}`);
fs.mkdirSync(evidenceRoot, {recursive: true});

function runModule(name, scriptPath) {
  assert.equal(fs.existsSync(binary), true, `OpenDesk binary is missing: ${binary}`);
  const result = spawnSync(binary, [
    '-script', scriptPath,
    '-console-mode', 'script',
    '-log-dir', path.join(evidenceRoot, name),
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.ifError(result.error);
  return {result, output: `${result.stdout || ''}${result.stderr || ''}`};
}

function assertFailed(run, expected, forbidden) {
  assert.notEqual(run.result.status, 0, run.output);
  assert.match(run.output, expected);
  assert.match(run.output, /(?:module_build_failed|status=failed)/);
  if (forbidden) assert.doesNotMatch(run.output, forbidden);
}

test('direct .mjs entry bundles one relative module graph and awaits main', () => {
  const run = runModule('basic', 'tests/javascript-modules/basic/main.mjs');
  assert.equal(run.result.status, 0, run.output);
  assert.match(run.output, /ESM_IMPORT_OK 42/);
  assert.match(run.output, /status=succeeded/);
});

test('missing .mjs entry fails before execution with entry context', () => {
  const script = 'tests/javascript-modules/failures/missing-entry.mjs';
  const run = runModule('missing-entry', script);
  assert.notEqual(run.result.status, 0, run.output);
  assert.match(run.output, /module_entry_not_found/);
  assert.match(run.output, /missing-entry\.mjs/);
  assert.doesNotMatch(run.output, /status=succeeded/);
});

test('missing relative import fails the esbuild module build with dependency context', () => {
  assertFailed(
    runModule('missing-relative', 'tests/javascript-modules/failures/missing-relative.mjs'),
    /dependency-does-not-exist\.mjs/,
    /RELATIVE_DEPENDENCY_SHOULD_NOT_RUN/,
  );
});

test('missing npm package fails the esbuild module build with package context', () => {
  assertFailed(
    runModule('missing-package', 'tests/javascript-modules/failures/missing-package.mjs'),
    /@opendesk\/definitely-missing-package/,
    /MISSING_PACKAGE_SHOULD_NOT_RUN/,
  );
});

test('invalid module syntax is reported as an esbuild compile failure', () => {
  assertFailed(
    runModule('syntax-error', 'tests/javascript-modules/failures/syntax-error.mjs'),
    /syntax-error\.mjs/,
    /SYNTAX_ERROR_SHOULD_NOT_RUN/,
  );
});

test('rejected exported async main fails the OpenDesk Execution', () => {
  assertFailed(
    runModule('main-reject', 'tests/javascript-modules/failures/main-reject.mjs'),
    /ESM_MAIN_REJECT_EXPECTED/,
  );
});

test('ordinary module evaluation error fails before main', () => {
  assertFailed(
    runModule('runtime-error', 'tests/javascript-modules/failures/runtime-error.mjs'),
    /ESM_MODULE_RUNTIME_ERROR_EXPECTED/,
    /RUNTIME_ERROR_MAIN_SHOULD_NOT_RUN/,
  );
});

test('LangGraph async node rejection fails the same OpenDesk Execution', () => {
  assertFailed(
    runModule('langgraph-node-reject', 'examples/runtime/modules/langgraph/failing-node.mjs'),
    /LANGGRAPH_NODE_REJECT_EXPECTED/,
    /LANGGRAPH_NODE_REJECT_SHOULD_NOT_RUN/,
  );
});

test('SIGINT cancellation drains the module timer without late behavior', async () => {
  assert.equal(fs.existsSync(binary), true, `OpenDesk binary is missing: ${binary}`);
  const child = spawn(binary, [
    '-script', 'tests/javascript-modules/cancel/main.mjs',
    '-console-mode', 'script',
    '-timeout', '0',
    '-log-dir', path.join(evidenceRoot, 'cancel'),
  ], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  let signaled = false;
  const ready = new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`cancellation fixture did not become ready:\n${output}`)), 5000);
    const collect = chunk => {
      output += chunk.toString();
      if (!signaled && output.includes('ESM_CANCEL_READY')) {
        signaled = true;
        clearTimeout(deadline);
        child.kill('SIGINT');
        resolve();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', reject);
  });
  await ready;
  const outcome = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`canceled OpenDesk process did not exit:\n${output}`));
    }, 5000);
    child.once('close', (code, signal) => {
      clearTimeout(deadline);
      resolve({code, signal});
    });
  });
  assert.equal(outcome.signal, null, output);
  assert.notEqual(outcome.code, 0, output);
  assert.match(output, /status=canceled/);
  assert.doesNotMatch(output, /ESM_CANCEL_LATE_BEHAVIOR/);
  const events = fs.readFileSync(path.join(evidenceRoot, 'cancel', 'events.ndjson'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line));
  const cleanup = events.find(event => event.kind === 'cleanup' && event.message === 'runtime async resources drained');
  assert(cleanup && cleanup.fields, 'canceled module execution did not report resource cleanup');
  for (const [name, count] of Object.entries(cleanup.fields)) {
    assert.equal(count, 0, `canceled module left ${name}=${count}`);
  }
});
