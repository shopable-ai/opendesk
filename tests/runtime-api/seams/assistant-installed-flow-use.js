'use strict';

const contractFile = File.join(Execution.workdir, 'apps', 'opendesk', 'assistant', 'task-contract.js');
const runtimeFile = File.join(Execution.workdir, 'apps', 'opendesk', 'assistant', 'task-runtime.js');
(0, eval)(File.read(contractFile) + '\n//# sourceURL=' + contractFile);
(0, eval)(File.read(runtimeFile) + '\n//# sourceURL=' + runtimeFile);

if (!globalThis.__opendeskFlowExecution) throw new Error('private installed Flow bridge is unavailable');

const runtime = OpenDeskAssistantTaskRuntime.create({
  file: File,
  rootDir: Execution.env.ASSISTANT_TASK_ROOT,
  defaultBusinessCwd: Execution.env.ASSISTANT_BUSINESS_CWD,
  flowBridge: globalThis.__opendeskFlowExecution,
  randomUUID: () => crypto.randomUUID(),
});

const task = await runtime.startTask({
  taskId: 'vertical-installed-flow',
  conversationId: 'vertical-conversation',
  requestId: 'vertical-request',
  userGoal: 'run the explicitly selected low-risk installed Flow',
  intent: 'use',
  asset: {kind: 'installed-flow', installId: Execution.env.ASSISTANT_FLOW_INSTALL_ID},
});

const requestedInput = {amount: 17, nested: {target: 'A'}};
const prepared = await runtime.prepareUse(task.taskId, requestedInput);
requestedInput.nested.target = 'MUTATED_AFTER_PREVIEW';

const outcome = await runtime.confirmUse(
  task.taskId,
  prepared.prepared,
  prepared.prepared.confirmationToken,
);

__opendeskInspectorResult(JSON.stringify({
  prepared: {
    taskId: prepared.task.taskId,
    revision: prepared.task.revision,
    previewInput: prepared.prepared.preview.input,
  },
  run: outcome.run,
  finalTask: {
    taskId: outcome.task.taskId,
    revision: outcome.task.revision,
    status: outcome.task.status,
    evidence: outcome.task.evidence,
  },
}));
await automation.app.quit();
