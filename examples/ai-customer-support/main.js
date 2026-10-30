// Repository root: ./dist/opendesk -app examples/ai-customer-support -console-mode script -log-dir .runtime/tests/ai-customer-support/app-mode/app
// App Shell owns this execution; no keepalive or desktop permission is needed.
const start = (0, eval)(File.read(File.join(Execution.scriptDir, 'desktop/app-host.js')));
const integrity = await File.readJSON(File.join(Execution.scriptDir, 'desktop/app-integrity.json'));
// App Mode owns its workdir. In this repository use the common .runtime/;
// a relocated package keeps its data beneath its own App workdir instead.
let businessWorkdir = File.cwd();
try {
  const workspace = File.realPath(File.join(Execution.scriptDir, '../..'));
  if (File.stat(File.join(workspace, 'go.mod'))?.type === 'file' &&
      File.realPath(File.join(workspace, 'examples/ai-customer-support')) === File.realPath(Execution.scriptDir)) businessWorkdir = workspace;
} catch { /* A standalone package does not need a repository checkout. */ }
const supportApp = await start({ root: Execution.scriptDir, integrity, businessWorkdir });
