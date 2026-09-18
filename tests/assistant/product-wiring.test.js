import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');

test('product main loads task contract/runtime before session/controller and release payload includes both', () => {
  const main = read('apps/opendesk/main.js');
  const contractIndex = main.indexOf("['task-contract.js', 'OpenDeskAssistantTaskContract']");
  const runtimeIndex = main.indexOf("['task-runtime.js', 'OpenDeskAssistantTaskRuntime']");
  const sessionIndex = main.indexOf("['session.js', 'OpenDeskAssistantSession']");
  const controllerIndex = main.indexOf("['controller.js', 'OpenDeskAssistantController']");
  assert.ok(contractIndex >= 0 && runtimeIndex > contractIndex);
  assert.ok(sessionIndex > runtimeIndex && controllerIndex > sessionIndex);

  const policy = read('apps/opendesk/.release/app-mode-runtime-files.txt');
  assert.match(policy, /^assistant\/task-contract\.js$/m);
  assert.match(policy, /^assistant\/task-runtime\.js$/m);
  assert.match(main, /runnerAssetProvider:\s*\(\) => runner\.currentAsset\(\)/);

});

test('controller exposes no-project task intent, four asset forms, candidate save, and only private execution bridges', () => {
  const controller = read('apps/opendesk/assistant/controller.js');
  for (const id of ['taskIntent', 'assetKind', 'assetRef', 'assetEntry', 'businessCwd', 'allowSourceRead', 'allowModelShare', 'taskInput', 'candidateSavePath', 'saveCandidate']) {
    assert.match(controller, new RegExp('id="' + id + '"'));
  }
  for (const value of ['none', 'js-file', 'automation-directory', 'installed-flow']) {
    assert.match(controller, new RegExp('value="' + value + '"'));
  }
  for (const value of ['chat', 'explain', 'use', 'make', 'improve']) {
    assert.match(controller, new RegExp('value="' + value + '"'));
  }
  assert.match(controller, /TaskRuntime\.create\(/);
  assert.match(controller, /id="importRunnerAsset"/);
  assert.match(controller, /runnerAssetProvider/);
  assert.match(controller, /global\.__opendeskRecipeExecution/);
  assert.match(controller, /global\.__opendeskFlowExecution/);
  assert.match(controller, /protectedRoots:\s*\[execution\.scriptDir, file\.join\(appDataRoot, 'flows'\)\]/);
  assert.match(controller, /defaultBusinessCwd:\s*appDataRoot/);
  assert.doesNotMatch(controller, /businessCwd\s*=\s*file\.join\(ref,\s*['"]\.\.['"]\)/);
  assert.match(controller, /id="allowSourceRead"/);
  assert.match(controller, /id="allowModelShare"/);
  assert.match(controller, /readSource:\s*record\.taskDraft\.readSource === true/);
  assert.match(controller, /shareSourceWithModel:\s*record\.taskDraft\.shareSourceWithModel === true/);
  assert.match(controller, /if \(!record\.taskDraft\.readSource\) record\.taskDraft\.shareSourceWithModel = false/);
  assert.doesNotMatch(controller, /projectId\s*:\s*['"][^'"]+/);
});

test('session routes structured tasks through persisted TaskRuntime and stop is non-terminal until lifecycle settles', () => {
  const session = read('apps/opendesk/assistant/session.js');
  assert.match(session, /const taskRuntime = settings\.taskRuntime \|\| null/);
  assert.match(session, /performAssetTaskRequest/);
  assert.match(session, /taskRuntime\.startTask/);
  assert.match(session, /taskRuntime\.prepareUse/);
  assert.match(session, /taskRuntime\.confirmUse/);
  assert.match(session, /taskRuntime\.generateCandidate/);
  assert.match(session, /taskRuntime\.saveCandidateAs/);

  const stopStart = session.indexOf('async function stop()');
  const closeStart = session.indexOf('async function close()', stopStart);
  const stopBlock = session.slice(stopStart, closeStart);
  assert.match(stopBlock, /markStopping/);
  assert.doesNotMatch(stopBlock, /transitionRequest/);
  assert.match(stopBlock, /phase = 'stopping'/);
});

test('task contract consumes confirmation before asynchronous final inspection and candidate verification binds actual proof', () => {
  const contract = read('apps/opendesk/assistant/task-contract.js');
  const consume = contract.indexOf("registry.delete(String(confirmationToken))");
  const inspect = contract.indexOf("await gateway.inspect(contract.asset.installId", consume);
  assert.ok(consume >= 0 && inspect > consume);
  assert.match(contract, /candidateDigest/);
  assert.match(contract, /verification\.executionId/);
  assert.match(contract, /verification\.criteriaId/);
  assert.match(contract, /proof\.status !== 'passed'/);
  assert.match(contract, /OVERWRITE_NOT_SUPPORTED/);
  assert.match(contract, /SOURCE_READ_NOT_AUTHORIZED/);
});

test('Flow use requires signed effect/input metadata and candidate verification has a host owner', () => {
  const contract = read('apps/opendesk/assistant/task-contract.js');
  const runtime = read('apps/opendesk/assistant/task-runtime.js');
  const host = read('cmd/opendesk/app_flow_invocation.go');

  assert.match(contract, /FLOW_INVOCATION_CONTRACT_MISSING/);
  assert.match(contract, /FLOW_FIXED_INPUT_CONFLICT/);
  assert.match(contract, /FLOW_UNKNOWN_INPUT/);
  assert.match(contract, /FLOW_REQUIRED_INPUT_MISSING/);
  assert.match(contract, /FLOW_INPUT_TYPE_MISMATCH/);
  assert.match(runtime, /candidateVerifier/);
  assert.match(runtime, /VERIFICATION_OWNER_UNAVAILABLE/);
  assert.doesNotMatch(runtime, /recordCandidateVerification/);
  assert.match(host, /assistant-use\.json/);
  assert.match(host, /DisallowUnknownFields/);
});


test('Runner handoff is a one-time asset snapshot API, not a live task dependency', () => {
  const runner = read('apps/opendesk/flow-runner.js');
  assert.match(runner, /function currentAsset\(\)/);
  assert.match(runner, /kind: 'installed-flow'/);
  assert.match(runner, /kind: 'js-file'/);
  assert.match(runner, /kind: 'unsupported'/);
  assert.match(runner, /currentAsset,/);
  const controller = read('apps/opendesk/assistant/controller.js');
  assert.match(controller, /const asset = await Promise\.resolve\(runnerAssetProvider\(\)\)/);
  assert.doesNotMatch(controller, /runnerAssetProvider\(\).*performAssetTaskRequest/s);
});
