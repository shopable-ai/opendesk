import { identifyProjectTarget, planCodexTask, DEMO_PROMPT } from '../../examples/workflows/codex-hook-demo/project-target.mjs';

// Business-module checks on the actual OpenDesk host; no target UI access.
export function main() {
  const root = File.realPath(Execution.scriptDir + '/../..');
  let passed = 0;
  function check(name, condition) {
    if (!condition) throw new Error('CODEX_PROJECT_CHECK_FAILED: ' + name);
    passed++;
    console.log('PASS ' + name);
  }
  const local = { type: 'codex-local', path: root };
  const project = identifyProjectTarget(local, File);
  check('explicit canonical local directory', project.status === 'IDENTIFIED' && project.workspacePath === root);
  check('cwd never supplies an App or ChatGPT project ID', project.appProjectId === null && project.chatgptProjectId === null);
  check('unknown current project refuses', identifyProjectTarget({}, File).reason === 'PROJECT_UNKNOWN');
  const other = identifyProjectTarget({ type: 'codex-local', path: root + '/examples' }, File);
  check('different explicit workspace', other.status === 'IDENTIFIED' && other.workspacePath !== root);
  check('file refuses', identifyProjectTarget({ type: 'codex-local', path: root + '/AGENTS.md' }, File).reason === 'PROJECT_NOT_DIRECTORY');
  check('missing directory refuses', identifyProjectTarget({ type: 'codex-local', path: root + '/.runtime/nonexistent-codex-demo-v12' }, File).reason === 'PROJECT_UNAVAILABLE');
  check('ChatGPT project refuses', identifyProjectTarget({ type: 'chatgpt-project', projectId: 'g-p-demo' }, File).reason === 'CHATGPT_PROJECT_UNSUPPORTED');
  check('projectless preparation refuses', planCodexTask({ projectTarget: { type: 'projectless' }, prompt: DEMO_PROMPT }, File).reason === 'PROJECTLESS_ENTRY_UNVERIFIED');
  const request = { projectTarget: local, prompt: DEMO_PROMPT };
  const plan = planCodexTask(request, File);
  check('repeated plan retains NOT_STARTED', JSON.stringify(planCodexTask(request, File)) === JSON.stringify(plan) &&
    plan.status === 'NOT_STARTED' && plan.submissionAttempted === false && plan.threadId === null);
  return { passed, scope: 'T02 and T03 plan only', desktopObserved: false, submissionAttempted: false };
}
