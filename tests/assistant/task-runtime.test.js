import assert from 'node:assert/strict';
import test from 'node:test';

await import('../../apps/opendesk/assistant/task-contract.js');
await import('../../apps/opendesk/assistant/task-runtime.js');

const Contract = globalThis.OpenDeskAssistantTaskContract;
const TaskRuntime = globalThis.OpenDeskAssistantTaskRuntime;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function memoryFile() {
  const files = new Map();
  const dirs = new Set(['/data', '/data/assistant']);
  const redirects = new Map();
  const normalize = (...parts) => {
    const joined = parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
    return joined.startsWith('/') ? joined.replace(/\/$/, '') || '/' : '/' + joined.replace(/\/$/, '');
  };
  return {
    files,
    dirs,
    join: normalize,
    cwd: () => '/product',
    realPath(path) {
      const key = normalize(path);
      if (!files.has(key) && !dirs.has(key)) throw Object.assign(new Error('not found'), {code:'ENOENT'});
      return redirects.get(key) || key;
    },
    redirect(path, target) {
      const key = normalize(path);
      dirs.add(key);
      redirects.set(key, normalize(target));
    },
    ensureDir(path) { dirs.add(normalize(path)); },
    exists(path) { return files.has(normalize(path)) || dirs.has(normalize(path)); },
    listDir(path) {
      const root = normalize(path).replace(/\/$/, '') + '/';
      const names = new Set();
      for (const key of [...files.keys(), ...dirs]) {
        if (!key.startsWith(root)) continue;
        const rest = key.slice(root.length);
        if (rest && !rest.includes('/')) names.add(rest);
      }
      return [...names];
    },
    read(path) {
      const key = normalize(path);
      if (!files.has(key)) throw Object.assign(new Error('not found'), {code:'ENOENT'});
      return String(files.get(key));
    },
    async readJSON(path) {
      const key = normalize(path);
      if (!files.has(key)) throw Object.assign(new Error('not found'), {code:'FILE_NOT_FOUND'});
      return JSON.parse(String(files.get(key)));
    },
    writeNew(path, value) {
      const key = normalize(path);
      if (files.has(key)) throw Object.assign(new Error('file exists'), {code:'EEXIST'});
      dirs.add(key.slice(0, key.lastIndexOf('/')) || '/');
      files.set(key, String(value));
    },
  };
}

function uuids() {
  let n = 0;
  return () => '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
}

function clock() {
  let n = Date.parse('2026-09-18T00:00:00Z');
  return () => new Date(n += 1000);
}

function baseTask(overrides = {}) {
  return {
    taskId: 'task-a',
    conversationId: 'conv-a',
    sessionId: 'session-old',
    requestId: 'req-a',
    userGoal: 'do something useful',
    intent: 'explain',
    asset: {kind:'none'},
    ...overrides,
  };
}

test('path normalization preserves Windows drive roots and applies case-insensitive containment', () => {
  assert.equal(Contract.normalizePath('C:\\'), 'c:/');
  assert.equal(Contract.normalizePath('C:\\Work\\Task\\..\\script.js'), 'c:/Work/script.js');
  assert.equal(Contract.isWithin('C:\\Work', 'c:\\work\\child\\script.js'), true);
  assert.throws(() => Contract.normalizePath('C:\\..\\escape.js'), {code:'ASSET_PATH_ESCAPE'});
});

test('task store uses expected revision and persistent task identity is not owned by a session', async () => {
  const file = memoryFile();
  const store = Contract.createStore({file, rootDir:'/data/assistant', clock:clock()});
  const first = await store.save(Contract.create(baseTask()), {expectedRevision:0});
  assert.equal(first.revision, 1);

  const resumedFromNewSession = Contract.create({...first, sessionId:'session-new', status:'resumed'});
  const second = await store.save(resumedFromNewSession, {expectedRevision:1});
  assert.equal(second.sessionId, 'session-new');
  assert.equal(second.revision, 2);

  await assert.rejects(
    () => store.save(Contract.create({...first, status:'stale-write'}), {expectedRevision:1}),
    {code:'TASK_REVISION_CONFLICT'},
  );
  const loaded = await store.load(first.taskId);
  assert.equal(loaded.status, 'resumed');
  assert.equal(loaded.revision, 2);
});


test('task store rejects a task directory redirected through a symlink or reparse-point alias', async () => {
  const file = memoryFile();
  const store = Contract.createStore({file, rootDir:'/data/assistant', clock:clock()});
  await store.save(Contract.create(baseTask()), {expectedRevision:0});
  file.redirect('/data/assistant/tasks/task-a', '/outside/task-a');
  await assert.rejects(() => store.load('task-a'), {code:'TASK_STORAGE_REDIRECTED'});
});

test('legacy optional project references survive revisions without expanding source authorization', async () => {
  const file = memoryFile();
  const store = Contract.createStore({file, rootDir:'/data/assistant', clock:clock()});
  const first = await store.save(Contract.create(baseTask({
    taskId:'legacy-project-task',
    projectId:'legacy-project',
    projectRecordRef:'/legacy/project-record.json',
    asset:{kind:'js-file', ref:'/work/legacy.js'},
    authorizations:{readSource:false, shareSourceWithModel:false},
  })), {expectedRevision:0});
  const second = await store.save(Contract.create({...first, sessionId:'session-new', status:'resumed'}), {expectedRevision:1});
  assert.equal(second.projectId, 'legacy-project');
  assert.equal(second.projectRecordRef, '/legacy/project-record.json');
  assert.equal(second.asset.ref, '/work/legacy.js');
  assert.throws(() => Contract.assertReadable(second, '/work/legacy.js'), {code:'SOURCE_READ_NOT_AUTHORIZED'});
});

test('all four asset entry shapes persist without projectId and unresolved directory remains a clarification state', async () => {
  const file = memoryFile();
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(),
    modelChannel:{async send(){return {text:'ok'};}, async draftCandidate(){return {text:'console.log("candidate");'};}},
  });
  const entries = [
    {kind:'none'},
    {kind:'js-file', ref:'/work/a.js'},
    {kind:'automation-directory', ref:'/work/auto', boundaryResolved:false},
    {kind:'installed-flow', installId:'local-1234567890abcdef1234567890abcdef'},
  ];
  for (let index=0; index<entries.length; index++) {
    const task = await runtime.startTask({
      taskId:'asset-' + index,
      conversationId:'conv-a',
      requestId:'req-' + index,
      userGoal:'goal-' + index,
      intent:index === 2 ? 'use' : 'explain',
      asset:entries[index],
    });
    assert.equal(task.projectId, '');
    assert.equal(task.asset.kind, entries[index].kind);
  }
  const prepared = await runtime.prepareUse('asset-2', {});
  assert.equal(prepared.kind, 'clarify');
  assert.match(prepared.message, /不会猜测入口/);
});

test('candidate make is reviewable, save-as is exclusive, and verification must bind the exact candidate digest', async () => {
  const file = memoryFile();
  let verificationMode = 'wrong';
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(),
    protectedRoots:['/data/assistant/protected'],
    modelChannel:{
      async draftCandidate(){ return {text:'console.log("candidate");'}; },
      async send(){ return {text:'unused'}; },
    },
    async verifyCandidate({candidate, criteriaId}) {
      return {
        candidateDigest: verificationMode === 'wrong' ? 'wrong' : candidate.contentDigest,
        executionId:'exec-real-1',
        criteriaId,
        observedAt:'2026-09-18T00:01:00Z',
        status:'passed',
      };
    },
  });
  const task = await runtime.startTask({
    taskId:'make-a', conversationId:'conv-a', requestId:'req-a',
    userGoal:'make a harmless script', intent:'make', asset:{kind:'none'},
  });
  const generated = await runtime.generateCandidate(task.taskId);
  assert.equal(generated.candidate.status, 'candidate-pending');
  assert.equal(generated.candidate.independentlyVerified, false);

  await assert.rejects(
    () => runtime.verifyCandidate(task.taskId, generated.candidate.candidateId, 'candidate-runtime-smoke-v1'),
    {code:'VERIFICATION_MISMATCH'},
  );

  const saved = await runtime.saveCandidateAs(task.taskId, generated.candidate.candidateId, '/exports/candidate.js');
  assert.equal(saved.candidate.status, 'saved');
  assert.equal(file.read('/exports/candidate.js'), 'console.log("candidate");');
  await assert.rejects(
    () => runtime.saveCandidateAs(task.taskId, generated.candidate.candidateId, '/exports/candidate.js'),
    {code:'DESTINATION_EXISTS'},
  );

  verificationMode = 'pass';
  const verified = await runtime.verifyCandidate(
    task.taskId,
    generated.candidate.candidateId,
    'candidate-runtime-smoke-v1',
  );
  assert.equal(verified.candidate.independentlyVerified, true);
  assert.equal(verified.candidate.verificationEvidence.executionId, 'exec-real-1');
});



test('candidate store rejects a redirected candidate directory on resume', async () => {
  const file = memoryFile();
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(),
    modelChannel:{
      async draftCandidate(){ return {text:'console.log("candidate");'}; },
      async send(){ return {text:'unused'}; },
    },
  });
  const task = await runtime.startTask({
    taskId:'redirect-candidate', conversationId:'conv-a', requestId:'req-a',
    userGoal:'make a candidate', intent:'make', asset:{kind:'none'},
  });
  const generated = await runtime.generateCandidate(task.taskId);
  const path = '/data/assistant/tasks/' + task.taskId + '/candidates/' + generated.candidate.candidateId;
  file.redirect(path, '/outside/candidate');
  await assert.rejects(() => runtime.loadCandidate(task.taskId, generated.candidate.candidateId), {code:'TASK_STORAGE_REDIRECTED'});
});


test('candidate save protection includes canonical aliases of protected roots', async () => {
  const file = memoryFile();
  file.redirect('/protected-alias', '/protected-real');
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(),
    protectedRoots:['/protected-alias'],
    modelChannel:{
      async draftCandidate(){ return {text:'console.log("candidate");'}; },
      async send(){ return {text:'unused'}; },
    },
  });
  const task = await runtime.startTask({
    taskId:'protected-candidate', conversationId:'conv-a', requestId:'req-a',
    userGoal:'make a candidate', intent:'make', asset:{kind:'none'},
  });
  const generated = await runtime.generateCandidate(task.taskId);
  await assert.rejects(
    () => runtime.saveCandidateAs(task.taskId, generated.candidate.candidateId, '/protected-real/candidate.js'),
    {code:'PROTECTED_DESTINATION'},
  );
});
test('candidate verification is unavailable without a host-owned verifier', async () => {
  const file = memoryFile();
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(),
    modelChannel:{async draftCandidate(){ return {text:'console.log("candidate");'}; }},
  });
  const task = await runtime.startTask({
    taskId:'verify-blocked', conversationId:'conv-a', requestId:'req-verify',
    userGoal:'make candidate', intent:'make', asset:{kind:'none'},
  });
  const generated = await runtime.generateCandidate(task.taskId);
  await assert.rejects(
    () => runtime.verifyCandidate(task.taskId, generated.candidate.candidateId, 'criteria'),
    {code:'VERIFICATION_OWNER_UNAVAILABLE'},
  );
});

test('source improve is denied by default and only the host-owned reader can supply explicitly shared source', async () => {
  const file = memoryFile();
  const sourceText = 'console.log("source");';
  file.writeNew('/work/source.js', sourceText);
  let readCalls = 0;
  let draftedInput = null;
  let currentHash = TaskRuntime.sha256(sourceText);
  const recipeBridge = {
    async read(options) {
      readCalls += 1;
      assert.equal(options.scriptPath, '/work/source.js');
      assert.equal(options.scopeRoot, '');
      return {content: sourceText, scriptHash: currentHash, ext:'.js'};
    },
    async inspect() { return {scriptHash: currentHash, ext:'.js'}; },
  };
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(), recipeBridge,
    modelChannel:{
      async draftCandidate(input) {
        draftedInput = clone(input);
        return {text:'console.log("improved");'};
      },
    },
  });

  const blocked = await runtime.startTask({
    taskId:'improve-blocked', conversationId:'conv-a', requestId:'req-blocked',
    userGoal:'improve it', intent:'improve',
    asset:{kind:'js-file',ref:'/work/source.js'},
    authorizations:{readSource:false,shareSourceWithModel:false},
  });
  await assert.rejects(() => runtime.generateCandidate(blocked.taskId), {code:'SOURCE_READ_NOT_AUTHORIZED'});
  assert.equal(readCalls, 0, 'association alone must not read source');

  const noShare = await runtime.startTask({
    taskId:'improve-no-share', conversationId:'conv-a', requestId:'req-no-share',
    userGoal:'improve it', intent:'improve',
    asset:{kind:'js-file',ref:'/work/source.js'},
    authorizations:{readSource:true,shareSourceWithModel:false},
  });
  await assert.rejects(() => runtime.generateCandidate(noShare.taskId), {code:'MODEL_SHARE_NOT_AUTHORIZED'});
  assert.equal(readCalls, 0, 'read authorization alone must not send/read source for model use');

  const allowed = await runtime.startTask({
    taskId:'improve-a', conversationId:'conv-a', requestId:'req-a',
    userGoal:'improve it', intent:'improve',
    asset:{kind:'js-file',ref:'/work/source.js'},
    authorizations:{readSource:true,shareSourceWithModel:true},
  });
  const generated = await runtime.generateCandidate(allowed.taskId);
  assert.equal(readCalls, 1);
  assert.equal(draftedInput.sourceRef, '/work/source.js');
  assert.equal(draftedInput.sourceContent, sourceText);
  assert.equal(draftedInput.sourceDigest, currentHash);
  assert.equal(generated.candidate.sourceDigest, currentHash);
  assert.equal(generated.candidate.status, 'candidate-pending');

  currentHash = TaskRuntime.sha256('console.log("changed");');
  await assert.rejects(
    () => runtime.saveCandidateAs(allowed.taskId, generated.candidate.candidateId, '/exports/improved.js'),
    {code:'SOURCE_CONFLICT'},
  );
  assert.equal(file.exists('/exports/improved.js'), false);

  currentHash = TaskRuntime.sha256(sourceText);
  const saved = await runtime.saveCandidateAs(allowed.taskId, generated.candidate.candidateId, '/exports/improved.js');
  assert.equal(saved.candidate.status, 'saved');
  assert.equal(file.read('/exports/improved.js'), 'console.log("improved");');
});

test('source explain requires separate model-share authorization and records only local source identity evidence', async () => {
  const file = memoryFile();
  const sourceText = 'export const value = 42;';
  file.writeNew('/work/explain.mjs', sourceText);
  const hash = TaskRuntime.sha256(sourceText);
  let explainedInput = null;
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', randomUUID:uuids(), clock:clock(),
    recipeBridge:{
      async read() { return {content:sourceText, scriptHash:hash, ext:'.mjs'}; },
    },
    modelChannel:{
      async explainSource(input) {
        explainedInput = clone(input);
        return {text:'This module exports value 42; runtime behavior was not executed.'};
      },
    },
  });
  const task = await runtime.startTask({
    taskId:'explain-source', conversationId:'conv-a', requestId:'req-explain',
    userGoal:'explain this file', intent:'explain',
    asset:{kind:'js-file',ref:'/work/explain.mjs'},
    authorizations:{readSource:true,shareSourceWithModel:true},
  });
  const result = await runtime.explain(task.taskId);
  assert.match(result.text, /exports value 42/);
  assert.equal(explainedInput.sourceContent, sourceText);
  assert.equal(explainedInput.sourceDigest, hash);
  assert.ok(result.task.evidence.some(item => item.type === 'source-explanation' && item.sourceDigest === hash));
  assert.equal(JSON.stringify(result.task.evidence).includes(sourceText), false, 'task evidence must not persist source content');
});

test('Flow confirmation uses frozen canonical input, consumes before async recheck, and runs the canonical installId', async () => {
  const file = memoryFile();
  const seenRuns = [];
  let releaseInspect;
  let inspectCalls = 0;
  const inspection = {
    installId:'local-1234567890abcdef1234567890abcdef',
    flowId:'sample.flow',
    name:'Business Sample',
    version:'1.0.0',
    publisherId:'local',
    state:'ready',
    runnable:true,
    protected:false,
    archiveDigest:'archive-a',
    manifestDigest:'manifest-a',
    invocation:{
      schemaVersion:1,
      effectSummary:'Write the requested low-risk sample output.',
      parameters:{
        amount:{type:'number',required:true},
        nested:{type:'object',required:true},
        account:{type:'string'},
      },
      fixedInputs:{account:'sandbox'},
    },
  };
  const flowBridge = {
    async inspect() {
      inspectCalls += 1;
      if (inspectCalls === 2) await new Promise(resolve => { releaseInspect = resolve; });
      return clone(inspection);
    },
    async reserve(){ return 'app-flow-real-1'; },
    async run(options){ seenRuns.push(clone(options)); return {executionId:options.executionId,status:'succeeded'}; },
  };
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', defaultBusinessCwd:'/business',
    randomUUID:uuids(), clock:clock(), flowBridge,
  });
  let task = await runtime.startTask({
    taskId:'flow-a',conversationId:'conv-a',requestId:'req-a',userGoal:'run it',intent:'use',
    asset:{kind:'installed-flow',installId:inspection.installId},
  });
  const input = {amount:17,nested:{target:'A'}};
  const prepared = await runtime.prepareUse(task.taskId, input);
  assert.equal(Object.isFrozen(prepared.prepared.preview.input), true);
  input.nested.target = 'MUTATED';

  const first = runtime.confirmUse(task.taskId, prepared.prepared, prepared.prepared.confirmationToken);
  while (!releaseInspect) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(
    () => runtime.confirmUse(task.taskId, prepared.prepared, prepared.prepared.confirmationToken),
    {code:'STALE_CONFIRMATION'},
  );
  releaseInspect();
  const result = await first;
  assert.equal(result.run.executionId, 'app-flow-real-1');
  assert.equal(seenRuns.length, 1);
  assert.deepEqual(JSON.parse(seenRuns[0].inputJSON), {amount:17,nested:{target:'A'}});
  assert.equal(seenRuns[0].expectedArchiveDigest, 'archive-a');
});

test('Flow use fails closed without signed invocation metadata and rejects unknown, missing, type, and fixed-input conflicts', async () => {
  const file = memoryFile();
  const installId = 'local-abcdefabcdefabcdefabcdefabcdefab';
  let inspection = {
    installId,
    flowId:'contract.flow',
    name:'Contract Flow',
    version:'1.0.0',
    publisherId:'publisher',
    state:'ready',
    runnable:true,
    protected:false,
    archiveDigest:'archive-contract',
    manifestDigest:'manifest-contract',
  };
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', defaultBusinessCwd:'/business',
    randomUUID:uuids(), clock:clock(),
    flowBridge:{
      async inspect(){ return clone(inspection); },
      async reserve(){ return 'app-flow-contract'; },
      async run(){ throw new Error('must not run invalid input'); },
    },
  });
  const task = await runtime.startTask({
    taskId:'flow-contract',conversationId:'conv-a',requestId:'req-contract',
    userGoal:'run contract flow',intent:'use',
    asset:{kind:'installed-flow',installId},
  });
  await assert.rejects(() => runtime.prepareUse(task.taskId, {}), {code:'FLOW_INVOCATION_CONTRACT_MISSING'});

  inspection = {
    ...inspection,
    invocation:{
      schemaVersion:1,
      effectSummary:'Send the sample to the fixed sandbox account.',
      parameters:{
        amount:{type:'number',required:true},
        account:{type:'string',required:true},
      },
      fixedInputs:{account:'sandbox'},
    },
  };
  await assert.rejects(() => runtime.prepareUse(task.taskId, {extra:true}), {code:'FLOW_UNKNOWN_INPUT'});
  await assert.rejects(() => runtime.prepareUse(task.taskId, {}), {code:'FLOW_REQUIRED_INPUT_MISSING'});
  await assert.rejects(() => runtime.prepareUse(task.taskId, {amount:'17'}), {code:'FLOW_INPUT_TYPE_MISMATCH'});
  await assert.rejects(() => runtime.prepareUse(task.taskId, {amount:17,account:'production'}), {code:'FLOW_FIXED_INPUT_CONFLICT'});

  const prepared = await runtime.prepareUse(task.taskId, {amount:17});
  assert.match(prepared.preview, /已签名影响说明/);
  assert.deepEqual(prepared.prepared.preview.input, {account:'sandbox',amount:17});
});

test('reserved execution with uncertain host failure persists unknown effect instead of success or stopped', async () => {
  const file = memoryFile();
  const recipeBridge = {
    async inspect(){ return {scriptHash:'hash-a',ext:'.js'}; },
    async reserve(){ return 'app-recipe-unknown-1'; },
    async run(){
      const error = new Error('connection lost after execution reservation');
      error.executionId = 'app-recipe-unknown-1';
      throw error;
    },
  };
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', defaultBusinessCwd:'/business',
    randomUUID:uuids(), clock:clock(), recipeBridge,
  });
  const task = await runtime.startTask({
    taskId:'unknown-run',conversationId:'conv-a',requestId:'req-unknown',
    userGoal:'run selected script',intent:'use',
    asset:{kind:'js-file',ref:'/work/script.js'},
  });
  const prepared = await runtime.prepareUse(task.taskId, {});
  await assert.rejects(
    () => runtime.confirmUse(task.taskId, prepared.prepared, prepared.prepared.confirmationToken),
    /connection lost/,
  );
  const stored = await runtime.loadTask(task.taskId);
  assert.equal(stored.status, 'execution-effect-unknown');
  const unknown = stored.evidence.find(item => item.type === 'execution-unknown');
  assert.equal(unknown.executionId, 'app-recipe-unknown-1');
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.businessVerified, false);
});

test('host-canceled execution persists canceled only when the host supplies a canceled terminal status', async () => {
  const file = memoryFile();
  const recipeBridge = {
    async inspect(){ return {scriptHash:'hash-a',ext:'.js'}; },
    async reserve(){ return 'app-recipe-canceled-1'; },
    async run(){
      const error = new Error('canceled');
      error.code = 'CANCELED';
      error.status = 'canceled';
      error.executionId = 'app-recipe-canceled-1';
      throw error;
    },
  };
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', defaultBusinessCwd:'/business',
    randomUUID:uuids(), clock:clock(), recipeBridge,
  });
  const task = await runtime.startTask({
    taskId:'canceled-run',conversationId:'conv-a',requestId:'req-canceled',
    userGoal:'run selected script',intent:'use',
    asset:{kind:'js-file',ref:'/work/script.js'},
  });
  const prepared = await runtime.prepareUse(task.taskId, {});
  await assert.rejects(
    () => runtime.confirmUse(task.taskId, prepared.prepared, prepared.prepared.confirmationToken),
    /canceled/,
  );
  const stored = await runtime.loadTask(task.taskId);
  assert.equal(stored.status, 'canceled');
  const terminal = stored.evidence.find(item => item.type === 'execution-terminal' && item.executionId === 'app-recipe-canceled-1');
  assert.equal(terminal.status, 'canceled');
  assert.equal(terminal.businessVerified, false);
});

test('script use binds host hash and refuses a changed entry before run', async () => {
  const file = memoryFile();
  let hash = 'hash-a';
  let runCalls = 0;
  const recipeBridge = {
    async inspect(){ return {scriptHash:hash,ext:'.js'}; },
    async reserve(){ return 'app-recipe-real-1'; },
    async run(){ runCalls += 1; return {executionId:'app-recipe-real-1',status:'succeeded'}; },
  };
  const runtime = TaskRuntime.create({
    file, rootDir:'/data/assistant', defaultBusinessCwd:'/business',
    randomUUID:uuids(), clock:clock(), recipeBridge,
  });
  const task = await runtime.startTask({
    taskId:'script-a',conversationId:'conv-a',requestId:'req-a',userGoal:'run script',intent:'use',
    asset:{kind:'js-file',ref:'/work/script.js'},
  });
  const prepared = await runtime.prepareUse(task.taskId, {key:'value'});
  hash = 'hash-b';
  await assert.rejects(
    () => runtime.confirmUse(task.taskId, prepared.prepared, prepared.prepared.confirmationToken),
    {code:'SCRIPT_CHANGED_AFTER_PREVIEW'},
  );
  assert.equal(runCalls, 0);
});
