const first = await __opendeskRecipeExecution.run({
  scriptPath: '/recipes/first.js',
  workdir: '/app-data',
  logDir: '/logs/first',
});

const controller = new AbortController();
const canceledRun = __opendeskRecipeExecution.run({
  scriptPath: '/recipes/canceled.js',
  workdir: '/app-data',
  logDir: '/logs/canceled',
  signal: controller.signal,
});
controller.abort();

let canceled = null;
try {
  await canceledRun;
} catch (error) {
  canceled = {
    code: error.code,
    status: error.status,
    executionId: error.executionId,
    logDir: error.logDir,
  };
}

__opendeskInspectorResult(JSON.stringify({first, canceled}));
await automation.app.quit();
