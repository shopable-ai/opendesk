#!/usr/bin/env node
'use strict';

// Calculator business qualification, not a Runtime API conformance runner.
// Every invocation freezes its files before input and retains failures in a new run.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const vm = require('node:vm');
const REPO = path.resolve(__dirname, '../../..');
const SOURCE = 'examples/agent-to-recipe/calculator.js';
const SPEC = 'tests/workflows/calculator/spec.json';
const OUTPUT = path.join(REPO, '.runtime/tests/workflows/calculator');
const mode = process.argv[2] || '--live';
assert.ok(['--live', '--check', '--preflight'].includes(mode), 'Use --live, --check or --preflight');
const runRoot = path.join(OUTPUT, new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
fs.mkdirSync(runRoot, {recursive: true});
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => fs.writeFileSync(path.join(runRoot, file), JSON.stringify(value, null, 2) + '\n');
const spec = json(path.join(REPO, SPEC));
const authorPath = path.join(REPO, spec.candidatePath);
const roots = {
  task: path.join(REPO, '.runtime/automation-authoring/calculator-fresh-20260918'),
  source: path.join(REPO, 'examples/agent-to-recipe'), tests: __dirname,
  binary: path.join(REPO, 'dist'), polyfills: path.join(REPO, 'polyfills'),
  jslibs: path.join(REPO, 'jslibs'),
};
const commands = [];
let inputStarted = false;
let locked = false;
let witness;

function checkAuthorCandidate() {
  const manifest = json(authorPath);
  for (const key of ['scriptRef', 'contractRef', 'procedureRef', 'appProfileRefs', 'apiRefs',
    'entryCommand', 'workingDirectory', 'inputContract', 'dependencies', 'sourceMapping']) {
    assert.ok(manifest[key], 'Missing CandidateManifest field: ' + key);
  }
  assert.equal(manifest.scriptHash, spec.scriptHash);
  assert.ok(manifest.apiRefs.length && manifest.dependencies.length && manifest.sourceMapping.length);
  for (const ref of [manifest.scriptRef, manifest.contractRef, manifest.procedureRef,
    ...manifest.appProfileRefs, ...manifest.dependencies]) {
    assert.ok(roots[ref.rootId], 'Unknown dependency root');
    const file = path.resolve(roots[ref.rootId], ref.path);
    assert.ok(file.startsWith(roots[ref.rootId] + path.sep), 'Dependency escaped root');
    assert.equal(hash(file), ref.sha256, 'Frozen dependency changed: ' + ref.path);
  }
  for (const api of manifest.apiRefs) {
    for (const range of api.sourceRanges) {
      assert.equal(hash(path.join(REPO, range.path)), range.sourceSha256, 'Canonical API changed');
    }
  }
  return {path: spec.candidatePath, sha256: hash(authorPath), frozenAt: manifest.frozenAt};
}

function dependencies() {
  const files = [SOURCE, SPEC, 'dist/opendesk'];
  for (const dir of ['polyfills', 'jslibs', 'tests/workflows/calculator']) {
    files.push(...fs.readdirSync(path.join(REPO, dir)).filter(n => /\.(js|cjs)$/.test(n)).sort().map(n => dir + '/' + n));
  }
  files.push(...spec.apiDocuments);
  return Object.fromEntries([...new Set(files)].sort().map(file => [file, hash(path.join(REPO, file))]));
}

function result(name, script) {
  const dir = path.join(runRoot, name);
  const summary = json(path.join(dir, 'agent_summary.json'));
  assert.equal(summary.status, 'succeeded', name + ': Runtime did not succeed');
  assert.equal(summary.scriptHash, hash(path.join(REPO, script)), name + ': executed source changed');
  assert.equal(hash(path.join(dir, 'script_snapshot.js')), summary.scriptHash, name + ': snapshot differs');
  return {summary, value: JSON.parse(summary.scriptLogs.at(-1).message)};
}

function launch(name, script) {
  const args = ['-script', script, '-console-mode', 'script', '-log-dir', path.relative(REPO, path.join(runRoot, name)), '-timeout', '1'];
  commands.push({name, cwd: REPO, command: ['./dist/opendesk', ...args], startedAt: new Date().toISOString()});
  write('commands.json', commands);
  const child = spawn(path.join(REPO, 'dist/opendesk'), args, {cwd: REPO, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  child.stdout.on('data', data => {
    output += data;
    if (output.includes('CALCULATOR_WITNESS_READY')) readyResolve(true);
  });
  child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => child.kill('SIGINT'), 65000);
  const done = new Promise(resolve => {
    child.on('error', error => { clearTimeout(timer); resolve({error}); readyResolve(false); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(runRoot, name + '-process.log'), output);
      resolve({code, signal}); readyResolve(false);
    });
  });
  return {child, ready, done};
}

async function run(name, script) {
  const completed = await launch(name, script).done;
  assert.equal(completed.code, 0, `${name}: ${JSON.stringify(completed)}; stop and inspect evidence, do not replay`);
  return result(name, script);
}

function checkReceipt(receipt, names) {
  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, 'tapTargets');
  assert.deepEqual(receipt.completed.map(c => c.target.locator.name), names);
  for (const item of receipt.completed) {
    assert.equal(item.actionState, 'acknowledged');
    assert.equal(item.backend, 'macos-ax');
    assert.equal(item.target.source, 'accessibility');
    assert.equal(item.target.locator.role, 'button');
    assert.ok(item.requestId);
  }
}

(async () => {
  let before;
  try {
    assert.equal(process.platform, 'darwin', 'This qualification is macOS only');
    assert.equal(hash(path.join(REPO, SOURCE)), spec.scriptHash, 'Recipe differs from reviewed revision; freeze/review a new candidate');
    const authorCandidate = checkAuthorCandidate();
    new vm.Script('(async function(){\n' + fs.readFileSync(path.join(REPO, SOURCE), 'utf8') + '\n})');
    before = dependencies();
    write('dependencies-before.json', {time: new Date().toISOString(), files: before});
    write('run-freeze.json', {frozenAt: new Date().toISOString(), authorCandidate, spec, dependencies: before});
    write('request.json', {recordedAt: new Date().toISOString(), mode, criteria: spec.criteria, retries: 0});
    if (mode === '--check') {
      write('test-result.json', {verdict: 'pass', scope: 'syntax/source/dependency inventory only', desktop: 'not-run'});
      return;
    }
    fs.writeFileSync(path.join(OUTPUT, 'desktop.lock'), JSON.stringify({pid: process.pid, runRoot}), {flag: 'wx'});
    locked = true;
    const processes = spawnSync('ps', ['-axo', 'pid=,args='], {encoding: 'utf8'}).stdout;
    write('desktop-occupancy.json', {time: new Date().toISOString(), processes: processes.split('\n').filter(l => /(?:^|\/)opendesk(?:\s|$)/.test(l))});
    assert.ok(!processes.split('\n').some(l => /(?:^|\/)opendesk\s.*(?:-script(?:\s|=)|\bai run\b)/.test(l)), 'Another script execution owns the desktop');
    await run('preflight', 'tests/workflows/calculator/preflight.js');
    if (mode === '--preflight') {
      write('test-result.json', {verdict: 'pass', scope: 'read-only current Calculator preflight', desktopInput: false});
      return;
    }
    inputStarted = true;
    await run('prepare', 'tests/workflows/calculator/prepare.js');
    const clean = await run('clean-observer', 'tests/workflows/calculator/observe.js');
    assert.deepEqual([clean.value.firstRead, clean.value.secondRead, clean.value.afterCaptureRead], ['0', '0', '0']);
    assert.deepEqual(dependencies(), before, 'Dependencies changed before candidate input');
    assert.deepEqual(checkAuthorCandidate(), authorCandidate, 'Author candidate changed before input');
    witness = launch('live-witness', 'tests/workflows/calculator/watch.js');
    assert.equal(await witness.ready, true, 'Read-only witness failed to start');
    const candidate = await run('candidate', SOURCE);
    const observation = await run('final-observer', 'tests/workflows/calculator/observe.js');
    assert.equal((await witness.done).code, 0, 'Read-only live witness failed');
    const live = result('live-witness', 'tests/workflows/calculator/watch.js');
    assert.equal(candidate.value.firstResult, '110');
    assert.equal(candidate.value.finalResult, '660');
    checkReceipt(candidate.value.firstInput, ['2', '5', '×', '4', '+', '1', '0', '=']);
    checkReceipt(candidate.value.secondInput, ['6', '×', ...candidate.value.firstResult, '=']);
    assert.deepEqual([observation.value.firstRead, observation.value.secondRead, observation.value.afterCaptureRead], ['660', '660', '660']);
    assert.equal(live.value.observations[0].value, '0');
    assert.equal(live.value.observations.at(-1).value, '660');
    assert.ok(live.value.firstCapture, 'Missing independent first-result image');
    const first = live.value.observations.findIndex(o => o.value === candidate.value.firstResult);
    assert.ok(first > 0 && live.value.observations.slice(first + 1).some(o => o.value === '0'), 'Witness missed first-result then clear boundary');
    assert.deepEqual(dependencies(), before, 'Dependency drift after execution');
    assert.deepEqual(checkAuthorCandidate(), authorCandidate, 'Author candidate changed after execution');
    write('test-result.json', {
      verdict: 'pass', scope: spec.scope, scriptHash: spec.scriptHash,
      firstResult: candidate.value.firstResult, finalResult: candidate.value.finalResult,
      secondActions: candidate.value.secondInput.completed.map(c => c.target.locator.name),
      executions: {candidate: candidate.summary.executionId, clean: clean.summary.executionId, witness: live.summary.executionId, final: observation.summary.executionId},
      visualReview: 'not-run: inspect the saved PNG bytes separately',
      independentContext: false, evidenceRoot: path.relative(REPO, runRoot),
    });
  } catch (error) {
    if (witness) { witness.child.kill('SIGINT'); await witness.done; }
    write('test-result.json', {verdict: 'fail', message: error.message, inputStarted,
      recovery: 'Stop. Observe actual Calculator before any authorized new preparation; no automatic retry.'});
    process.exitCode = 1;
  } finally {
    try { write('dependencies-after.json', {time: new Date().toISOString(), files: dependencies()}); } catch (error) { write('dependency-error.json', {message: error.message}); process.exitCode = 1; }
    if (locked) fs.unlinkSync(path.join(OUTPUT, 'desktop.lock'));
    console.log(JSON.stringify({runRoot, ...json(path.join(runRoot, 'test-result.json'))}, null, 2));
  }
})();
