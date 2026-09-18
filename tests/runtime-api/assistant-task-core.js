'use strict';

function check(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectCode(fn, code) {
  try {
    await fn();
  } catch (error) {
    if (error && error.code === code) return;
    throw new Error('expected ' + code + ', got ' + String(error && (error.code || error.message) || error));
  }
  throw new Error('expected failure ' + code);
}

const contractFile = File.join(Execution.workdir, 'apps', 'opendesk', 'assistant', 'task-contract.js');
const runtimeFile = File.join(Execution.workdir, 'apps', 'opendesk', 'assistant', 'task-runtime.js');
(0, eval)(File.read(contractFile) + '\n//# sourceURL=' + contractFile);
(0, eval)(File.read(runtimeFile) + '\n//# sourceURL=' + runtimeFile);

const Contract = globalThis.OpenDeskAssistantTaskContract;
const TaskRuntime = globalThis.OpenDeskAssistantTaskRuntime;
check(Contract && TaskRuntime, 'assistant task modules did not load in OpenDesk Runtime');

const root = File.join(Execution.workdir, '.runtime', 'tests', 'assistant-task-core', Execution.id);
if (File.exists(root)) File.removeDir(root);
File.ensureDir(root);

try {
  let tick = Date.parse('2026-09-18T00:00:00Z');
  const store = Contract.createStore({
    file: File,
    rootDir: root,
    clock: () => new Date(tick += 1000),
  });

  const first = await store.save(Contract.create({
    taskId: 'runtime-task',
    conversationId: 'runtime-conversation',
    sessionId: 'runtime-session-a',
    requestId: 'runtime-request',
    userGoal: 'persist without a project',
    intent: 'explain',
    asset: {kind: 'none'},
  }), {expectedRevision: 0});
  check(first.revision === 1, 'first task revision must be 1');
  check(first.projectId === '', 'projectId must remain optional');

  const resumed = await store.save(Contract.create({
    ...first,
    sessionId: 'runtime-session-b',
    status: 'resumed',
  }), {expectedRevision: 1});
  check(resumed.revision === 2, 'resumed task revision must advance');
  check(resumed.sessionId === 'runtime-session-b', 'session metadata may change without changing persistent task identity');
  await expectCode(() => store.save(Contract.create({...first, status: 'stale'}), {expectedRevision: 1}), 'TASK_REVISION_CONFLICT');

  const source = File.join(root, 'source.js');
  File.writeNew(source, 'console.log("source");\n');
  const candidateService = Contract.createCandidateService({
    file: File,
    digest: TaskRuntime.sha256,
    protectedRoots: [File.join(root, 'protected')],
  });
  const candidate = candidateService.create({
    contract: Contract.create({
      taskId: 'candidate-task',
      conversationId: 'runtime-conversation',
      requestId: 'candidate-request',
      userGoal: 'improve source',
      intent: 'improve',
      asset: {kind: 'js-file', ref: source},
      authorizations: {readSource: true, shareSourceWithModel: false},
    }),
    sourceRef: source,
    candidateId: 'candidate-one',
    content: 'console.log("candidate");\n',
  });
  check(candidate.independentlyVerified === false, 'generated candidate must start unverified');

  const destination = File.join(root, 'saved-candidate.js');
  const saved = candidateService.saveAs({candidate, destination, authorized: true});
  check(File.read(destination).includes('candidate'), 'candidate save-as did not write expected content');
  await expectCode(() => Promise.resolve(candidateService.saveAs({candidate, destination, authorized: true})), 'DESTINATION_EXISTS');

  await expectCode(() => Promise.resolve(candidateService.markVerified(saved, {
    candidateDigest: 'wrong',
    executionId: 'runtime-execution',
    criteriaId: 'runtime-criteria',
    observedAt: '2026-09-18T00:01:00Z',
    status: 'passed',
  })), 'VERIFICATION_MISMATCH');

  const verified = candidateService.markVerified(saved, {
    candidateDigest: saved.contentDigest,
    executionId: 'runtime-execution',
    criteriaId: 'runtime-criteria',
    observedAt: '2026-09-18T00:01:00Z',
    status: 'passed',
  });
  check(verified.independentlyVerified === true, 'valid verification proof was not bound to candidate');
  check(verified.verificationEvidence.executionId === 'runtime-execution', 'verification execution identity was lost');

  await expectCode(() => Promise.resolve(Contract.assertReadable(Contract.create({
    taskId: 'no-read',
    conversationId: 'runtime-conversation',
    requestId: 'no-read-request',
    userGoal: 'associate only',
    intent: 'explain',
    asset: {kind: 'js-file', ref: source},
    authorizations: {readSource: false},
  }), source)), 'SOURCE_READ_NOT_AUTHORIZED');

  console.log('ASSISTANT_TASK_CORE_OK=' + JSON.stringify({
    executionId: Execution.id,
    revision: resumed.revision,
    candidateDigest: saved.contentDigest,
    verificationExecutionId: verified.verificationEvidence.executionId,
  }));
} finally {
  if (File.exists(root)) File.removeDir(root);
}
