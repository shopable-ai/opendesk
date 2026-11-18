// T02 and the read-only part of T03 only. This module has no desktop/input API.
export const DEMO_PROMPT = 'OD-CODEX-HOOK-DEMO V1.2：只回复 OD_CODEX_DEMO_OK。不要使用工具、修改文件、运行命令、创建任务或发送消息。';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const absolute = value => typeof value === 'string' && value.startsWith('/') &&
  value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const stopped = (reason, status = 'NOT_STARTED') => ({ status, reason });

// files is the current host's realPath/stat pair. Titles, current windows,
// recent projects and an unverified App project ID cannot supply identity.
export function identifyProjectTarget(target, files) {
  if (!record(target)) return stopped('PROJECT_UNKNOWN');
  if (target.type === 'chatgpt-project') {
    return stopped('CHATGPT_PROJECT_UNSUPPORTED', 'BLOCKED');
  }
  if (target.type === 'projectless') {
    if (Object.keys(target).some(key => key !== 'type')) return stopped('PROJECT_UNKNOWN');
    return { status: 'IDENTIFIED', projectType: 'PROJECTLESS', workspacePath: null,
      appProjectId: null, chatgptProjectId: null, basis: ['explicit projectless target'] };
  }
  if (target.type !== 'codex-local' || !absolute(target.path) ||
      Object.keys(target).some(key => key !== 'type' && key !== 'path')) {
    return stopped('PROJECT_UNKNOWN');
  }
  if (!files || typeof files.realPath !== 'function' || typeof files.stat !== 'function') {
    return stopped('CAPABILITY_UNAVAILABLE', 'BLOCKED');
  }
  let failurePhase = 'CANONICAL_PATH';
  try {
    const workspacePath = files.realPath(target.path);
    if (!absolute(workspacePath)) return stopped('PROJECT_UNAVAILABLE');
    failurePhase = 'DIRECTORY_STAT';
    if (files.stat(workspacePath)?.type !== 'directory') return stopped('PROJECT_NOT_DIRECTORY');
    return { status: 'IDENTIFIED', projectType: 'CODEX_LOCAL', workspacePath,
      requestedPath: target.path, appProjectId: null, chatgptProjectId: null,
      basis: ['explicit absolute projectTarget.path', 'host canonical existing directory'] };
  } catch (error) {
    const code = error && error.code;
    return { ...stopped('PROJECT_UNAVAILABLE'), failurePhase,
      errorCode: typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null };
  }
}

export function planCodexTask(request, files) {
  const project = identifyProjectTarget(record(request) ? request.projectTarget : null, files);
  const untouched = { desktopObserved: false, inputAttempted: false,
    submissionAttempted: false, threadId: null };
  if (project.status !== 'IDENTIFIED') return { ...project, ...untouched };
  const prompt = request.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.includes('\u0000')) {
    return { ...stopped('INVALID_PROMPT'), project, ...untouched };
  }
  let encodedPrompt;
  try { encodedPrompt = encodeURIComponent(prompt); }
  catch (_) { return { ...stopped('INVALID_PROMPT'), project, ...untouched }; }
  // Omitting `path` does not prove the App will choose a projectless chat.
  if (project.projectType === 'PROJECTLESS') {
    return { ...stopped('PROJECTLESS_ENTRY_UNVERIFIED', 'BLOCKED'), project, ...untouched };
  }
  return { status: 'NOT_STARTED', phase: 'PREPARATION_PLAN_READY',
    reason: 'DESKTOP_PREPARATION_NOT_VERIFIED', project, ...untouched,
    deepLinkCandidate: 'codex://threads/new?path=' + encodeURIComponent(project.workspacePath) +
      '&prompt=' + encodedPrompt };
}
