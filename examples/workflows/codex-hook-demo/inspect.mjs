import { planCodexTask, DEMO_PROMPT } from './project-target.mjs';

// A fixed repository binding, relative to this script, never the foreground
// window, recent project, chat title or calling process's working directory.
// No link is opened and no task is created by this inspection entry point.
export async function main() {
  const input = Execution.input;
  const empty = input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).length === 0;
  const request = empty ? {
    projectTarget: { type: 'codex-local', path: File.realPath(Execution.scriptDir + '/../../..') },
    prompt: DEMO_PROMPT,
  } : input;
  const result = planCodexTask(request, File);
  let permissions;
  try {
    permissions = await page.checkPermissions({ capabilities: ['accessibility', 'screenCapture'] });
  } catch (error) {
    permissions = { status: 'UNKNOWN', code: error.code || null };
  }
  const report = { marker: 'OD-CODEX-HOOK-DEMO V1.2',
    scope: 'read-only project identity and preparation plan; no desktop observation',
    result, permissions, command: Command.getCapabilities() };
  console.log(JSON.stringify(report, null, 2));
  return report;
}
