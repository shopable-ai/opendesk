#!/usr/bin/env node
'use strict';

// S12 read-only freeze gate. A live attempt may start only after this gate has
// fixed the exact Candidate, dependencies, requested scope and scenarios.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {checkWorkflowStage} = require('../../../workflows/agent-to-recipe/scripts/check-workflow-stage.js');
const {verifyFrozenConsumer} = require('../tools/calculator-consumer-dataflow.cjs');

const repo = path.resolve(__dirname, '../../..');
const output = path.join(repo, '.runtime/tests/workflows/calculator/fresh');
const hex = /^[a-f0-9]{64}$/;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const digest = file => sha(fs.readFileSync(file));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function fileWithin(root, relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative && !path.isAbsolute(relative), 'Expected a relative path');
  const resolved = path.resolve(root, relative);
  assert.ok(resolved.startsWith(path.resolve(root) + path.sep), `Ref escapes root: ${relative}`);
  assert.ok(fs.statSync(resolved).isFile(), `Ref is not a file: ${relative}`);
  const actual = fs.realpathSync(resolved);
  assert.ok(actual.startsWith(fs.realpathSync(root) + path.sep), `Symlink escapes root: ${relative}`);
  return resolved;
}

function unique(values, label) {
  assert.ok(Array.isArray(values) && values.length, `${label} must be nonempty`);
  assert.equal(new Set(values).size, values.length, `${label} contains duplicates`);
  values.forEach(value => assert.ok(typeof value === 'string' && value.trim(), `${label} contains invalid item`));
}

function commandArgv(command) {
  if (Array.isArray(command)) {
    assert.ok(command.every(arg => typeof arg === 'string' && arg.length), 'Invalid command argv');
    return command;
  }
  assert.ok(typeof command === 'string' && command.trim(), 'Missing production command');
  assert.ok(!/[\n\r;&|`$<>\\'"()]/.test(command), 'Shell evaluation/quoting in entry command is unsupported');
  return command.trim().split(/\s+/);
}

function sameFile(left, right) { return fs.realpathSync(left) === fs.realpathSync(right); }

// The legacy CLI uses Go flag.Parse: a later -script overwrites an earlier one,
// while a positional argument stops flag parsing. AI run has its own flag set.
// Accept only options understood by the selected script entry so the frozen
// argv cannot select a different source or silently ignore trailing options.
function checkScriptEntry(argv) {
  const aiRun = argv[1] === 'ai' && argv[2] === 'run';
  const scriptIndex = aiRun ? 3 : argv[1] === '-script' ? 2 : -1;
  assert.ok(scriptIndex > 0 && argv[scriptIndex], 'Unsupported production script entry');
  const valueFlags = new Set(aiRun
    ? ['--input', '--input-file', '--env-file', '--timeout']
    : ['-log-dir', '-console-mode', '-console-categories', '-color', '-env-file',
      '-config', '-timeout', '-delay', '-output-format', '-stack']);
  const boolFlags = new Set(aiRun ? ['--input-stdin'] : ['-ui', '-no-ui', '-debug']);
  // Go's flag package uses strconv.ParseBool for explicit boolean values.
  const goBool = /^(?:1|0|t|T|TRUE|true|True|f|F|FALSE|false|False)$/;
  for (let i = scriptIndex + 1; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s, 2);
    if (valueFlags.has(flag)) {
      if (inline === undefined) {
        assert.ok(argv[++i] && argv[i] !== '--', `Missing value for ${flag}`);
      }
    } else if (boolFlags.has(flag)) {
      assert.ok(inline === undefined || goBool.test(inline),
        `Invalid boolean value for ${flag}`);
    } else {
      assert.fail(`Unsupported production script option or extra argument: ${flag}`);
    }
  }
  return scriptIndex;
}

function audit(requestPath, options = {}) {
  const requestBytes = fs.readFileSync(requestPath);
  const request = JSON.parse(requestBytes);
  assert.equal(request.schemaVersion, 'fresh-calculator-s12/v1');
  assert.ok(request.taskRoot && request.freezeReleaseRef && request.candidateRef
    && request.contractRef);
  assert.ok(typeof request.taskRoot === 'string' && !path.isAbsolute(request.taskRoot));
  const taskRoot = path.resolve(repo, request.taskRoot);
  assert.ok(taskRoot.startsWith(repo + path.sep) && fs.statSync(taskRoot).isDirectory()
    && fs.realpathSync(taskRoot).startsWith(fs.realpathSync(repo) + path.sep),
  'Task root escapes repository or is absent');
  // A new task root is supplied by the frozen handoff; historical Calculator
  // task roots and example source are never selected by this tool.
  const roots = {repo, task: taskRoot};
  const checked = new Map();
  const verify = (ref, label) => {
    assert.ok(ref && roots[ref.rootId] && typeof ref.path === 'string' && hex.test(ref.sha256),
      `Invalid content-bound ${label}`);
    const file = fileWithin(roots[ref.rootId], ref.path);
    const actual = digest(file);
    assert.equal(actual, ref.sha256, `${label} drift: ${ref.path}`);
    if (path.extname(file) === '.json' && ref.schemaVersion) {
      const content = read(file);
      if (content.schemaVersion) {
        assert.equal(content.schemaVersion, ref.schemaVersion,
          `${label} schemaVersion differs from content: ${ref.path}`);
      }
    }
    checked.set(`${ref.rootId}:${ref.path}`, {rootId: ref.rootId, path: ref.path, sha256: actual});
    return file;
  };
  const candidatePath = verify(request.candidateRef, 'CandidateManifest');
  const candidate = read(candidatePath);
  const releasePath = verify(request.freezeReleaseRef, 'Producer freeze release');
  const release = read(releasePath);
  assert.equal(release.desktopReleased, true, 'Producer has not released desktop');
  if (Object.hasOwn(release, 'noFurtherProducerDesktopActions')) {
    assert.equal(release.noFurtherProducerDesktopActions, true,
      'Producer desktop exclusion has not been established');
  }
  assert.deepEqual(release.candidateRef, request.candidateRef,
    'Producer release binds another Candidate');
  const contractPath = verify(request.contractRef, 'TaskContract');
  verify(request.sourceRef, 'Original user request');
  const contract = read(contractPath);
  assert.deepEqual(release.contractRef, request.contractRef,
    'Producer release binds another TaskContract');
  assert.deepEqual(candidate.contractRef, request.contractRef, 'Candidate and S12 contract differ');
  const scriptPath = verify(candidate.scriptRef, 'Candidate script');
  assert.deepEqual(release.scriptRef, candidate.scriptRef,
    'Producer release binds another source');
  assert.equal(candidate.scriptHash, digest(scriptPath), 'Candidate scriptHash differs');
  if (candidate.snapshotRef) {
    assert.equal(digest(verify(candidate.snapshotRef, 'Candidate snapshot')),
      candidate.scriptHash, 'Candidate snapshot differs');
  }
  new vm.Script(`(async function(){\n${fs.readFileSync(scriptPath, 'utf8')}\n})`);
  assert.ok(candidate.procedureRef, 'Fresh chain requires a Procedure');
  for (const key of ['procedureRef', 'workPlanRef', 'applicationRuleRef']) {
    if (candidate[key]) verify(candidate[key], key);
  }
  for (const key of ['appProfileRefs', 'dependencies', 'apiRefs']) {
    assert.ok(Array.isArray(candidate[key]) && candidate[key].length, `Candidate ${key} missing`);
    candidate[key].forEach((ref, i) => {
      if (ref.rootId) verify(ref, `${key}[${i}]`);
      else if (key === 'apiRefs' && Array.isArray(ref.sourceRanges)) {
        assert.ok(ref.sourceRanges.length, `${key}[${i}].sourceRanges must be nonempty`);
        ref.sourceRanges.forEach((range, j) => {
          const label = `${key}[${i}].sourceRanges[${j}]`;
          assert.ok(range && typeof range.path === 'string' && range.path
            && hex.test(range.sourceSha256), `Invalid ${label}`);
          const file = fileWithin(repo, range.path);
          assert.equal(digest(file), range.sourceSha256, `${label} drift`);
          const lines = fs.readFileSync(file, 'utf8').split('\n');
          assert.ok(Number.isSafeInteger(range.startLine) && range.startLine >= 1
            && Number.isSafeInteger(range.endLine) && range.endLine >= range.startLine
            && range.endLine <= lines.length, `${label} invalid line bounds`);
          const selected = lines.slice(range.startLine - 1, range.endLine).join('\n');
          assert.ok(selected.trim(), `${label} selects no API text`);
          if (Object.hasOwn(range, 'bytes')) {
            assert.equal(range.bytes, Buffer.byteLength(selected), `${label} byte count differs`);
          }
          checked.set(`repo:${range.path}`, {rootId: 'repo', path: range.path, sha256: digest(file)});
        });
      } else assert.fail(`Unverifiable ${key}[${i}]`);
    });
  }
  assert.deepEqual(release.dependencies, candidate.dependencies,
    'Producer release binds another dependency set');
  assert.ok(candidate.entryCommand && candidate.workingDirectory, 'Candidate production entry missing');
  assert.ok(candidate.inputContract && candidate.supportedScope, 'Candidate input/scope missing');
  assert.ok(request.productionCommand && request.workingDirectory,
    'S12 exact production command/workdir missing');
  assert.deepEqual(request.productionCommand, candidate.entryCommand, 'S12 entry differs');
  assert.equal(request.workingDirectory, candidate.workingDirectory, 'S12 working directory differs');
  assert.deepEqual(release.entryCommand, candidate.entryCommand,
    'Producer release binds another command');
  assert.equal(release.workingDirectory, candidate.workingDirectory,
    'Producer release binds another working directory');
  const binary = verify(request.binaryRef, 'Production binary');
  const binaryDependencies = candidate.dependencies.filter(ref => ref.kind === 'RuntimeBinary');
  assert.equal(binaryDependencies.length, 1, 'Candidate must bind one production binary');
  const candidateBinary = verify(binaryDependencies[0], 'Candidate binary dependency');
  assert.ok(sameFile(binary, candidateBinary), 'S12 binary differs from Candidate binary dependency');
  const cwd = path.resolve(repo, request.workingDirectory);
  assert.ok(cwd === repo || cwd.startsWith(repo + path.sep), 'Working directory escapes repository');
  const argv = commandArgv(request.productionCommand);
  const entryBinary = fileWithin(cwd, argv[0]);
  assert.ok(sameFile(entryBinary, binary), 'Entry command executes another binary');
  const scriptIndex = checkScriptEntry(argv);
  const entryScript = fileWithin(cwd, argv[scriptIndex]);
  assert.ok(sameFile(entryScript, scriptPath), 'Entry command executes another script');
  if (candidate.entrypointLink) {
    const link = fileWithin(repo, candidate.entrypointLink.path || 'dist/opendesk');
    assert.equal(fs.realpathSync(link), fs.realpathSync(binary), 'Production entry resolves to another binary');
  }
  unique(request.requested, 'requested scope');
  const criteria = contract.successCriteria;
  assert.ok(Array.isArray(criteria) && criteria.length, 'TaskContract successCriteria missing');
  const ids = criteria.map(row => row.criterionId);
  unique(ids, 'TaskContract criterion IDs');
  unique(request.requiredCriteria, 'S12 required criteria');
  assert.deepEqual([...request.requiredCriteria].sort(), [...ids].sort(),
    'S12 required criteria omitted or expanded relative to TaskContract');
  assert.ok(request.scopeAttestation && request.scopeAttestation.source === 'original-request',
    'Requested scope requires independent original-request attestation');
  assert.deepEqual(request.scopeAttestation.sourceRef, request.sourceRef,
    'Requested scope attestation must bind the original request bytes');
  assert.deepEqual(request.scopeAttestation.requested, request.requested,
    'Requested scope attestation differs from S12 request');
  assert.ok(Array.isArray(request.scenarios) && request.scenarios.length, 'No predeclared scenarios');
  unique(request.scenarios.map(s => s.id), 'scenario IDs');
  for (const scenario of request.scenarios) {
    unique(scenario.scopeRefs, `${scenario.id}.scopeRefs`);
    for (const scope of scenario.scopeRefs) assert.ok(request.requested.includes(scope), `Unrequested scope: ${scope}`);
    unique(scenario.criterionRefs, `${scenario.id}.criterionRefs`);
    for (const id of scenario.criterionRefs) assert.ok(ids.includes(id), `Unknown TaskContract criterion: ${id}`);
    assert.ok(Object.hasOwn(scenario, 'input') && Object.hasOwn(scenario, 'oracle')
      && scenario.observation && scenario.sideEffects && scenario.stop,
    `${scenario.id}: missing predeclared input/oracle/observation/sideEffects/stop`);
  }
  for (const scope of request.requested) {
    assert.ok(request.scenarios.some(s => s.scopeRefs.includes(scope)), `No scenario covers ${scope}`);
  }
  for (const id of ids) {
    assert.ok(request.scenarios.some(s => s.criterionRefs.includes(id)), `No scenario covers criterion ${id}`);
  }
  assert.ok(request.authorization && request.environment && request.budget,
    'S12 authorization/environment/budget missing');
  assert.ok(request.stageReviewRef, 'S12 entry requires a content-bound stageReviewRef');
  const stageReviewPath = verify(request.stageReviewRef, 'Stage review');
  const stageRecord = read(stageReviewPath);
  assert.equal(stageRecord.taskId, contract.taskId, 'Stage review belongs to another TaskContract');
  assert.ok(typeof contract.taskId === 'string' && contract.taskId.trim(), 'TaskContract taskId missing');
  const producerReview = stageRecord.stages?.find(stage => stage.stage === 'S11');
  assert.ok(producerReview?.validationReports?.some(validation =>
    validation.tool === 'agent-to-recipe-artifact-chain/v1'
      && validation.consumerVerification?.descriptorRef && validation.consumerVerification?.evaluatorRef),
  'S12 entry requires the current artifact-chain report and controlled consumer verification');
  const controlledVerifications = [];
  let verifyConsumer;
  if (options.reviewedSourceSha256 !== undefined) {
    assert.ok(hex.test(options.reviewedSourceSha256), 'Reviewed source authorization must be an exact SHA256');
    assert.equal(options.reviewedSourceSha256, candidate.scriptHash, 'Reviewed source authorization differs from Candidate');
    verifyConsumer = descriptor => {
      assert.equal(descriptor.script.sha256, options.reviewedSourceSha256, 'Consumer execution exceeds reviewed source authorization');
      assert.equal(descriptor.script.path, scriptPath, 'Consumer execution selects another source');
      assert.equal(digest(scriptPath), options.reviewedSourceSha256, 'Reviewed source changed before execution');
      const result = verifyFrozenConsumer(descriptor);
      controlledVerifications.push(result);
      return result;
    };
  }
  const stageGuard = checkWorkflowStage({record: stageReviewPath,
    roots: Object.entries(roots), from: 'S11', to: 'S12', verifyConsumer});
  assert.equal(stageGuard.allowed, true,
    `S12 stage entry refused: ${JSON.stringify(stageGuard.errors)}`);
  assert.ok(controlledVerifications.length > 0, 'S12 entry did not execute its required controlled consumer check');
  const sameRefBytes = (left, right) => left && right
    && left.rootId === right.rootId && left.path === right.path && left.sha256 === right.sha256;
  assert.ok(producerReview.outputs.some(ref => ref.kind === 'CandidateManifest'
    && sameRefBytes(ref, request.candidateRef)), 'Stage review binds another Candidate');
  assert.ok(producerReview.outputs.some(ref => ref.kind === 'CandidateSource'
    && sameRefBytes(ref, candidate.scriptRef)), 'Stage review binds another Candidate source');
  assert.ok(producerReview.inputs.some(ref => sameRefBytes(ref, request.contractRef)),
    'S11 did not consume the current TaskContract');
  return {recordedAt: new Date().toISOString(), requestPath: path.relative(repo, requestPath),
    stageReviewRef: request.stageReviewRef, stageGuard: JSON.parse(JSON.stringify(stageGuard)),
    reviewedSourceSha256: options.reviewedSourceSha256, controlledVerifications,
    consumerEvaluatorSha256: digest(path.join(__dirname, '../tools/calculator-consumer-dataflow.cjs')),
    stageGuardImplementation: digest(path.join(repo, 'workflows/agent-to-recipe/scripts/check-workflow-stage.js')),
    requestSha256: sha(requestBytes), freezeReleaseRef: request.freezeReleaseRef,
    candidateRef: request.candidateRef,
    contractRef: request.contractRef, contractPath: path.relative(repo, contractPath),
    scriptRef: candidate.scriptRef, scriptHash: candidate.scriptHash,
    binaryRef: request.binaryRef, checkedFiles: [...checked.values()],
    productionCommand: argv, workingDirectory: request.workingDirectory,
    requested: request.requested, requiredCriteria: ids,
    scopeAttestation: request.scopeAttestation, scenarios: request.scenarios,
    environment: request.environment, authorization: request.authorization, budget: request.budget,
    desktopInput: false, qualification: 'not-run'};
}

function main() {
  const args = process.argv.slice(2);
  const [mode, file] = args;
  const positionalCount = mode === '--postcheck' ? 3 : 2;
  const beforeFile = mode === '--postcheck' ? args[2] : undefined;
  const extra = args.slice(positionalCount);
  const options = extra.length === 2 && extra[0] === '--reviewed-source-sha256'
    ? {reviewedSourceSha256: extra[1]} : {};
  if (!['--check', '--postcheck'].includes(mode) || !file
      || (mode === '--postcheck' && !beforeFile)
      || (extra.length && !options.reviewedSourceSha256)) {
    console.error('Usage: node tests/workflows/calculator/fresh-qualification.cjs --check <request.json> | --postcheck <request.json> <freeze-check.json> [--reviewed-source-sha256 <sha256>]');
    process.exitCode = 2;
    return;
  }
  const requestPath = path.resolve(repo, file);
  const runRoot = path.join(output, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  fs.mkdirSync(runRoot, {recursive: true});
  try {
    const result = audit(requestPath, options);
    if (mode === '--postcheck') {
      const before = read(path.resolve(repo, beforeFile));
      for (const key of ['requestSha256', 'freezeReleaseRef', 'candidateRef', 'contractRef', 'scriptRef',
        'stageReviewRef', 'stageGuard', 'stageGuardImplementation',
        'reviewedSourceSha256', 'consumerEvaluatorSha256',
        'scriptHash', 'binaryRef', 'checkedFiles', 'productionCommand', 'workingDirectory',
        'requested', 'requiredCriteria', 'scenarios']) {
        assert.deepEqual(result[key], before[key], `Post-run freeze drift: ${key}`);
      }
    }
    const record = {...result, phase: mode === '--check' ? 'pre-run' : 'post-run'};
    fs.writeFileSync(path.join(runRoot, mode === '--check' ? 'freeze-check.json' : 'postcheck.json'),
      JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify({runRoot: path.relative(repo, runRoot), ...record}, null, 2));
  } catch (error) {
    const failure = {verdict: 'blocked', desktopInput: false, error: error.message,
      requestPath: path.relative(repo, requestPath), recordedAt: new Date().toISOString()};
    fs.writeFileSync(path.join(runRoot, 'freeze-failure.json'), JSON.stringify(failure, null, 2) + '\n');
    console.error(JSON.stringify({runRoot: path.relative(repo, runRoot), ...failure}, null, 2));
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = {audit};
