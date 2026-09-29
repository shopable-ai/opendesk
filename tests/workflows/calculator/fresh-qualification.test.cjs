'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {audit} = require('./fresh-qualification.cjs');
const {fixture: stageFixture} = require('../tools/stage-review-fixture.js');
const {fixture: artifactFixture} = require('../tools/artifact-fixture.js');
const {checkArtifactChain} = require('../../../workflows/agent-to-recipe/scripts/check-artifact-chain.js');

const repo = path.resolve(__dirname, '../../..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('freeze audit binds source, contract, dependency, and predeclared scope', async t => {
  fs.mkdirSync(path.join(repo, '.runtime/tests/workflows/calculator'), {recursive: true});
  const fixture = fs.mkdtempSync(path.join(repo, '.runtime/tests/workflows/calculator/freeze-fixture-'));
  t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
  const put = (name, contents) => {
    const file = path.join(fixture, name);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    if (typeof contents !== 'string' && !contents.schemaVersion) contents.schemaVersion = 'agent-to-recipe/v1';
    fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
    return {rootId: 'task', path: name, sha256: hash(file), kind: 'evidence',
      schemaVersion: typeof contents === 'string' ? 'agent-to-recipe/v1' : contents.schemaVersion};
  };
  const source = fs.readFileSync(path.join(repo, 'examples/agent-to-recipe/calculator.js'), 'utf8');
  const chain = artifactFixture(t, data => {
    data.contract.taskId = 't';
    data.contract.successCriteria = [{criterionId: 'live-display', expected: 'actual UI value reaches later consumer'}];
    data.plan.taskId = 't';
    data.candidate.taskId = 't';
    data.candidateSource = source;
  });
  const imported = new Set();
  const importRef = ref => {
    assert.equal(ref.rootId, 'fixture');
    if (!imported.has(ref.path)) {
      const importValue = value => {
        if (Array.isArray(value)) return value.map(importValue);
        if (!value || typeof value !== 'object') return value;
        if (value.rootId === 'fixture') return importRef(value);
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, importValue(item)]));
      };
      const original = fs.readFileSync(chain.file(ref.path), 'utf8');
      put(ref.path, ref.path.endsWith('.json') ? importValue(JSON.parse(original)) : original);
      imported.add(ref.path);
    }
    return {...ref, rootId: 'task', sha256: hash(path.join(fixture, ref.path))};
  };
  const importedCandidate = importRef(chain.ref('candidate.json', 'CandidateManifest'));
  const baseCandidate = JSON.parse(fs.readFileSync(path.join(fixture, importedCandidate.path), 'utf8'));
  const contractRef = importRef(chain.ref('contract.json', 'TaskContract'));
  for (const [filename, kind] of [['dossier.json', 'Dossier'], ['actions.json', 'RawTrace'],
    ['distilled.json', 'DistilledSteps']]) importRef(chain.ref(filename, kind));
  const sourceRef = put('user-task.md', 'Actual UI value reaches later consumer.');
  const scriptRef = {...put('candidate.js', source), kind: 'CandidateSource'};
  const binaryRef = {...put('runtime.bin', 'frozen-build'), kind: 'RuntimeBinary'};
  const procedureRef = baseCandidate.procedureRef;
  const profileRef = {...put('profile.json', {schemaVersion: 'profile/v1'}),
    schemaVersion: 'profile/v1'};
  const apiRef = put('api.md', 'canonical API');
  const command = ['./' + path.relative(repo, path.join(fixture, 'runtime.bin')),
    '-script', './' + path.relative(repo, path.join(fixture, 'candidate.js'))];
  const candidateRef = {...put('candidate.json', {
    ...baseCandidate,
    contractRef, scriptRef, scriptHash: scriptRef.sha256, procedureRef,
    appProfileRefs: [profileRef], dependencies: [binaryRef], apiRefs: [...baseCandidate.apiRefs, apiRef],
    entryCommand: command, workingDirectory: '.',
    inputContract: {}, supportedScope: ['fixed-chain'],
  }), kind: 'CandidateManifest'};
  const stageData = stageFixture(t);
  const remap = value => {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== 'object') return value;
    if (value.rootId === 'run') {
      if (value.kind === 'TaskContract') return contractRef;
      return {...value, rootId: 'repo', path: path.relative(repo, path.join(stageData.dir, value.path))};
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
  };
  const stageRecord = remap(stageData.record);
  stageRecord.stages = stageRecord.stages.slice(0, 11);
  delete stageRecord.final;
  const producerReview = stageRecord.stages[10];
  producerReview.outputs = [candidateRef, scriptRef];
  producerReview.dependencies = [binaryRef];
  producerReview.inputs.push(contractRef);
  const evaluatorPath = 'tests/workflows/tools/calculator-consumer-dataflow.cjs';
  const evaluatorRef = {rootId: 'repo', path: evaluatorPath, sha256: hash(path.join(repo, evaluatorPath)),
    kind: 'ConsumerEvaluator', schemaVersion: 'text/v1'};
  const consumerOutput = path.join(fixture, 'consumer-observations');
  const makeStageReview = () => {
    const report = checkArtifactChain({through: 'candidate',
      dossier: path.join(fixture, 'dossier.json'), actions: path.join(fixture, 'actions.json'),
      distilled: path.join(fixture, 'distilled.json'), procedure: path.join(fixture, 'procedure.json'),
      candidate: path.join(fixture, 'candidate.json'), roots: [['repo', repo], ['task', fixture]]});
    const reportRef = {...put('artifact-report.json', report), kind: 'ValidationReport'};
    const descriptorRef = {...put('consumer-descriptor.json', {
      schemaVersion: 'calculator-consumer-l1/v1', harness: 'calculator-runtime-v1',
      evaluator: 'independent-freeze-test-evaluator', evaluatorSha256: evaluatorRef.sha256,
      candidateRef, scriptRef, dependencies: [binaryRef], roots: [['repo', repo], ['task', fixture]],
      script: {path: path.join(fixture, 'candidate.js'), sha256: scriptRef.sha256}, outputDir: consumerOutput,
    }), kind: 'ConsumerVerificationDescriptor'};
    producerReview.validationReports = [{tool: report.tool, boundary: 'candidate', reportRef,
      consumerVerification: {descriptorRef, evaluatorRef}}];
    return put('stage-review.json', stageRecord);
  };
  const makeRelease = () => put('freeze-release.json', {
    desktopReleased: true, noFurtherProducerDesktopActions: true,
    candidateRef, scriptRef, contractRef, dependencies: [binaryRef],
    entryCommand: command, workingDirectory: '.',
  });
  const request = {
    schemaVersion: 'fresh-calculator-s12/v1', taskRoot: path.relative(repo, fixture),
    freezeReleaseRef: makeRelease(), candidateRef, contractRef, sourceRef, binaryRef,
    productionCommand: command, workingDirectory: '.',
    requested: ['fixed-chain'], requiredCriteria: ['live-display'],
    scopeAttestation: {source: 'original-request', sourceRef,
      requested: ['fixed-chain'], rationale: 'fixed flow required'},
    scenarios: [{id: 'normal', scopeRefs: ['fixed-chain'], criterionRefs: ['live-display'],
      input: {}, oracle: {first: 'fixture-first', final: 'fixture-final'},
      observation: 'independent display snapshot',
      sideEffects: 'Calculator buttons only', stop: 'unknown input state'}],
    authorization: 'test-only fixture', environment: 'fixture', budget: {runs: 1},
    stageReviewRef: makeStageReview(),
  };
  const requestPath = path.join(fixture, 'request.json');
  fs.writeFileSync(requestPath, JSON.stringify(request));
  const authorizedAudit = () => audit(requestPath, {reviewedSourceSha256: scriptRef.sha256});
  const frozen = authorizedAudit();
  assert.equal(frozen.qualification, 'not-run');
  assert.equal(frozen.scriptHash, scriptRef.sha256);
  for (const ref of [candidateRef, scriptRef, contractRef, binaryRef, apiRef]) {
    assert.ok(frozen.checkedFiles.some(item => item.rootId === ref.rootId
      && item.path === ref.path && item.sha256 === ref.sha256));
  }
  assert.equal(frozen.controlledVerifications.length, 1);
  assert.equal(frozen.controlledVerifications[0].verdict, 'pass');
  assert.equal(frozen.controlledVerifications[0].liveQualificationGranted, false);
  const beforePath = path.join(fixture, 'freeze-check.json');
  fs.writeFileSync(beforePath, JSON.stringify(frozen));
  const postcheck = () => spawnSync(process.execPath,
    [path.join(__dirname, 'fresh-qualification.cjs'), '--postcheck', requestPath, beforePath,
      '--reviewed-source-sha256', scriptRef.sha256],
    {cwd: repo, encoding: 'utf8'});
  assert.equal(postcheck().status, 0, 'Unchanged bytes should pass postcheck');
  const checkCli = reviewedSha => spawnSync(process.execPath,
    [path.join(__dirname, 'fresh-qualification.cjs'), '--check', requestPath,
      ...(reviewedSha === undefined ? [] : ['--reviewed-source-sha256', reviewedSha])],
    {cwd: repo, encoding: 'utf8'});
  const consumerAttempts = () => fs.existsSync(consumerOutput) ? fs.readdirSync(consumerOutput).length : 0;

  await t.test('default API and CLI checks refuse consumer execution without host authorization', () => {
    const before = consumerAttempts();
    assert.throws(() => audit(requestPath), /S12 stage entry refused.*CONSUMER_AUTHORIZATION/);
    const result = checkCli();
    assert.equal(result.status, 1, result.stderr);
    assert.match(JSON.parse(result.stderr).error, /CONSUMER_AUTHORIZATION/);
    const readonlyPostcheck = spawnSync(process.execPath,
      [path.join(__dirname, 'fresh-qualification.cjs'), '--postcheck', requestPath, beforePath],
      {cwd: repo, encoding: 'utf8'});
    assert.equal(readonlyPostcheck.status, 1, readonlyPostcheck.stderr);
    assert.match(JSON.parse(readonlyPostcheck.stderr).error, /CONSUMER_AUTHORIZATION/);
    assert.equal(consumerAttempts(), before, 'Read-only checks must create no controlled observations');
  });

  await t.test('a request JSON authorization field does not authorize execution', () => {
    const before = consumerAttempts();
    request.reviewedSourceSha256 = scriptRef.sha256;
    fs.writeFileSync(requestPath, JSON.stringify(request));
    assert.throws(() => audit(requestPath), /CONSUMER_AUTHORIZATION/);
    assert.equal(consumerAttempts(), before);
    delete request.reviewedSourceSha256;
    fs.writeFileSync(requestPath, JSON.stringify(request));
  });

  await t.test('explicit exact SHA allows controlled API and CLI verification, not live qualification', () => {
    const checked = authorizedAudit();
    assert.equal(checked.reviewedSourceSha256, scriptRef.sha256);
    assert.equal(checked.controlledVerifications.length, 1);
    assert.equal(checked.controlledVerifications[0].verdict, 'pass');
    assert.equal(checked.controlledVerifications[0].desktopActions, false);
    assert.equal(checked.qualification, 'not-run');
    const result = checkCli(scriptRef.sha256);
    assert.equal(result.status, 0, result.stderr);
    const cliReport = JSON.parse(result.stdout);
    assert.equal(cliReport.reviewedSourceSha256, scriptRef.sha256);
    assert.equal(cliReport.stageGuard.consumerVerificationCalls, 1);
    assert.equal(cliReport.controlledVerifications[0].liveQualificationGranted, false);
    assert.notDeepEqual(cliReport.controlledVerifications[0].verification.evidenceRefs,
      frozen.controlledVerifications[0].verification.evidenceRefs, 'Each authorized check needs fresh observations');
    const after = postcheck();
    assert.equal(after.status, 0, after.stderr);
  });

  await t.test('wrong or malformed caller SHA is rejected without execution', () => {
    const before = consumerAttempts();
    assert.throws(() => audit(requestPath, {reviewedSourceSha256: '0'.repeat(64)}),
      /Reviewed source authorization differs from Candidate/);
    assert.throws(() => audit(requestPath, {reviewedSourceSha256: 'not-a-sha'}),
      /Reviewed source authorization must be an exact SHA256/);
    const result = checkCli('0'.repeat(64));
    assert.equal(result.status, 1, result.stderr);
    assert.match(JSON.parse(result.stderr).error, /Reviewed source authorization differs from Candidate/);
    assert.equal(consumerAttempts(), before);
  });

  await t.test('S11 cannot omit its artifact report or consumer descriptor and evaluator references', () => {
    const accepted = structuredClone(producerReview.validationReports);
    for (const missing of ['report', 'descriptorRef', 'evaluatorRef']) {
      producerReview.validationReports = structuredClone(accepted);
      if (missing === 'report') producerReview.validationReports = [];
      else delete producerReview.validationReports[0].consumerVerification[missing];
      request.stageReviewRef = put('stage-review.json', stageRecord);
      fs.writeFileSync(requestPath, JSON.stringify(request));
      assert.throws(() => authorizedAudit(), /requires the current artifact-chain report and controlled consumer verification/);
    }
    producerReview.validationReports = accepted;
    request.stageReviewRef = put('stage-review.json', stageRecord);
    fs.writeFileSync(requestPath, JSON.stringify(request));
    const restored = postcheck();
    assert.equal(restored.status, 0, restored.stderr);
  });

  const acceptedReview = request.stageReviewRef;
  delete request.stageReviewRef;
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /requires a content-bound stageReviewRef/);
  assert.equal(postcheck().status, 1, 'Normal qualification CLI must reject missing stage lineage');
  request.stageReviewRef = acceptedReview;
  stageRecord.stages[3].disposition = 'fail';
  request.stageReviewRef = makeStageReview();
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /S12 stage entry refused/);
  assert.equal(postcheck().status, 1, 'Normal qualification CLI must reject failed upstream reviews');
  stageRecord.stages[3].disposition = 'pass';
  request.stageReviewRef = makeStageReview();
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.equal(postcheck().status, 0, 'Restored exact upstream reviews permit the original freeze');

  stageRecord.taskId = 'another-task';
  request.stageReviewRef = makeStageReview();
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /another TaskContract/);
  stageRecord.taskId = 't';
  producerReview.outputs[0] = {...put('other-candidate.json',
    JSON.parse(fs.readFileSync(path.join(fixture, 'candidate.json'), 'utf8'))), kind: 'CandidateManifest'};
  request.stageReviewRef = makeStageReview();
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /S12 stage entry refused.*VALIDATOR_SUBJECT/);
  producerReview.outputs[0] = candidateRef;
  request.stageReviewRef = makeStageReview();
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.equal(postcheck().status, 0, 'The exact original Candidate binding remains valid');

  const rewriteCandidate = (entryCommand, apiRefs = [apiRef]) => {
    candidateRef.sha256 = put('candidate.json', {
      ...baseCandidate,
      contractRef, scriptRef, scriptHash: scriptRef.sha256, procedureRef,
      appProfileRefs: [profileRef], dependencies: [binaryRef], apiRefs: [...baseCandidate.apiRefs, ...apiRefs],
      entryCommand, workingDirectory: '.', inputContract: {}, supportedScope: ['fixed-chain'],
    }).sha256;
    request.productionCommand = entryCommand;
    request.freezeReleaseRef = put('freeze-release.json', {
      desktopReleased: true, noFurtherProducerDesktopActions: true,
      candidateRef, scriptRef, contractRef, dependencies: [binaryRef],
      entryCommand, workingDirectory: '.',
    });
    request.stageReviewRef = makeStageReview();
    fs.writeFileSync(requestPath, JSON.stringify(request));
  };
  await t.test('reviewed exact bad source is rejected by actual consumer observations', () => {
    const badSource = source.replace('...firstResult', "'1', '1', '0'");
    assert.notEqual(badSource, source);
    scriptRef.sha256 = put('candidate.js', badSource).sha256;
    rewriteCandidate(command);
    const structural = JSON.parse(fs.readFileSync(path.join(fixture, 'artifact-report.json'), 'utf8'));
    assert.equal(structural.verdict, 'pass');
    assert.equal(structural.businessDataflow.releaseBlocked, true);
    assert.throws(() => authorizedAudit(), /S12 stage entry refused.*CONSUMER_VERIFICATION/);
    const result = checkCli(scriptRef.sha256);
    assert.equal(result.status, 1, result.stderr);
    assert.match(JSON.parse(result.stderr).error, /CONSUMER_VERIFICATION/);
    scriptRef.sha256 = put('candidate.js', source).sha256;
    rewriteCandidate(command);
    const restored = postcheck();
    assert.equal(restored.status, 0, restored.stderr);
  });
  const otherScript = './' + path.relative(repo, path.join(fixture, 'other.js'));
  for (const [name, tail] of [
    ['duplicate script', ['-script', otherScript]],
    ['duplicate equals-form script', [`-script=${otherScript}`]],
    ['inline script source', ['-script-text', 'console.log(1)']],
    ['stdin script source', ['-script-stdin']],
    ['app entry', ['-app', otherScript]],
    ['unsupported option', ['-unknown-option']],
    ['invalid Go boolean', ['-no-ui=invalid']],
    ['missing value before replacement source', ['-log-dir', '-script', otherScript]],
    ['positional argument before flag', ['extra', '-script', otherScript]],
  ]) {
    rewriteCandidate([...command, ...tail]);
    assert.throws(() => authorizedAudit(), /Unsupported production script option or extra argument|Invalid boolean value/,
      `${name} must not pass freeze audit`);
  }
  for (const unsupportedEntry of [
    [command[0], '-script-text', 'console.log(1)'],
    [command[0], 'ai', 'schema', command[2]],
  ]) {
    rewriteCandidate(unsupportedEntry);
    assert.throws(() => authorizedAudit(), /Unsupported production script entry/);
  }
  rewriteCandidate([command[0], 'ai', 'run', command[2], '-script', otherScript]);
  assert.throws(() => authorizedAudit(), /Unsupported production script option or extra argument/);
  rewriteCandidate([...command, '-no-ui', '-log-dir', '.runtime/tests/fixture',
    '-console-mode', 'script', '-debug=1']);
  assert.equal(authorizedAudit().scriptHash, scriptRef.sha256,
    'Frozen Candidate command with supported Runtime flags remains valid');
  rewriteCandidate([command[0], 'ai', 'run', command[2], '--input', '{}']);
  assert.equal(authorizedAudit().scriptHash, scriptRef.sha256,
    'Supported ai run entry remains valid');
  rewriteCandidate([...command, '-no-ui']);
  const rangeRef = {sourceRanges: [{path: path.relative(repo, path.join(fixture, 'api.md')),
    sourceSha256: apiRef.sha256, startLine: 1, endLine: 1,
    bytes: Buffer.byteLength('canonical API')}]};
  rewriteCandidate([...command, '-no-ui'], [apiRef, rangeRef]);
  assert.throws(() => authorizedAudit(), /S12 stage entry refused.*VALIDATOR_FAILED/,
    'Entry accepts valid API ranges, but the mandatory structural checker cannot qualify range-only references');
  rewriteCandidate([...command, '-no-ui'], [{sourceRanges: []}]);
  assert.throws(() => authorizedAudit(), /sourceRanges must be nonempty/);
  for (const invalid of [
    {startLine: undefined}, {startLine: 0}, {startLine: 2},
    {startLine: 2, endLine: 1}, {endLine: 2}, {endLine: 1.5},
  ]) {
    rewriteCandidate([...command, '-no-ui'], [{sourceRanges: [{...rangeRef.sourceRanges[0],
      ...invalid}]}]);
    assert.throws(() => authorizedAudit(), /invalid line bounds/);
  }
  rewriteCandidate([...command, '-no-ui'], [{sourceRanges: [{...rangeRef.sourceRanges[0],
    bytes: 0}]}]);
  assert.throws(() => authorizedAudit(), /byte count differs/);
  rewriteCandidate([...command, '-no-ui'], [{sourceRanges: [{...rangeRef.sourceRanges[0],
    sourceSha256: '0'.repeat(64)}]}]);
  assert.throws(() => authorizedAudit(), /sourceRanges\[0\] drift/);
  rewriteCandidate(command);

  fs.appendFileSync(path.join(fixture, 'candidate.js'), '// changed after freeze\n');
  assert.throws(() => authorizedAudit(), /drift: candidate.js/);
  assert.equal(postcheck().status, 1, 'Changed production bytes must fail postcheck');
  fs.writeFileSync(path.join(fixture, 'candidate.js'), source);
  request.scenarios[0].scopeRefs = ['unrequested'];
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /Unrequested scope/);
  request.scenarios[0].scopeRefs = ['fixed-chain'];
  request.productionCommand = ['./' + path.relative(repo, path.join(fixture, 'runtime.bin')),
    '-script', './' + path.relative(repo, path.join(fixture, 'contract.json'))];
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /entry differs/);
  request.productionCommand = command;
  request.binaryRef = put('other-runtime.bin', 'another-build');
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /binary differs/);
  request.binaryRef = binaryRef;
  candidateRef.sha256 = put('candidate.json', {
    ...baseCandidate,
    contractRef, scriptRef, scriptHash: scriptRef.sha256, procedureRef,
    appProfileRefs: [{...profileRef, schemaVersion: 'profile/v2'}],
    dependencies: [binaryRef], apiRefs: [...baseCandidate.apiRefs, apiRef], entryCommand: command,
    workingDirectory: '.', inputContract: {}, supportedScope: ['fixed-chain'],
  }).sha256;
  request.freezeReleaseRef = makeRelease();
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /schemaVersion differs from content/);
  candidateRef.sha256 = put('candidate.json', {
    ...baseCandidate,
    contractRef, scriptRef, scriptHash: scriptRef.sha256, procedureRef,
    appProfileRefs: [profileRef], dependencies: [binaryRef], apiRefs: [...baseCandidate.apiRefs, apiRef],
    entryCommand: command, workingDirectory: '.', inputContract: {},
    supportedScope: ['fixed-chain'],
  }).sha256;
  request.freezeReleaseRef = makeRelease();
  request.requiredCriteria = ['fabricated-criterion'];
  fs.writeFileSync(requestPath, JSON.stringify(request));
  assert.throws(() => authorizedAudit(), /required criteria omitted or expanded/);
});
