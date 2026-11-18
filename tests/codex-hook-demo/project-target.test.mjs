import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { identifyProjectTarget, planCodexTask, DEMO_PROMPT } from '../../examples/workflows/codex-hook-demo/project-target.mjs';

// Use the real repository and real filesystem, without starting Codex or touching UI.
const root = fs.realpathSync(new URL('../../', import.meta.url));
const files = {
  realPath: p => fs.realpathSync(p),
  stat: p => ({ type: fs.statSync(p).isDirectory() ? 'directory' : 'file' }),
};
const local = { type: 'codex-local', path: root };

test('explicit existing local directory identifies the workspace, not an App project ID', () => {
  const result = identifyProjectTarget(local, files);
  assert.equal(result.status, 'IDENTIFIED');
  assert.equal(result.projectType, 'CODEX_LOCAL');
  assert.equal(result.workspacePath, root);
  assert.equal(result.appProjectId, null);
  assert.equal(result.chatgptProjectId, null);
});

test('current chat and multiple available workspaces cannot select an implicit target', () => {
  for (const target of [undefined, null, {}, { title: 'opendesk' },
    { cwd: root }, { currentProject: root },
    { type: 'codex-local', paths: [root, '/another'] },
    { type: 'codex-local', path: root, projectId: 'guessed-id' },
    { type: 'codex-local', path: root, currentProject: '/another' }]) {
    assert.equal(identifyProjectTarget(target, files).reason, 'PROJECT_UNKNOWN');
  }
});

test('relative, nonexistent, file and inaccessible targets stop without guessing', () => {
  for (const p of ['.', 'examples', '', ' /tmp', '/tmp\u0000', '/tmp\n']) {
    assert.equal(identifyProjectTarget({ type: 'codex-local', path: p }, files).reason, 'PROJECT_UNKNOWN');
  }
  assert.equal(identifyProjectTarget({ type: 'codex-local', path: path.join(root, '.runtime/does-not-exist-od-codex-demo') }, files).reason, 'PROJECT_UNAVAILABLE');
  assert.equal(identifyProjectTarget({ type: 'codex-local', path: path.join(root, 'AGENTS.md') }, files).reason, 'PROJECT_NOT_DIRECTORY');
  const denied = { ...files, realPath() { throw Object.assign(new Error('denied'), { code: 'EACCES' }); } };
  const failure = identifyProjectTarget(local, denied);
  assert.equal(failure.reason, 'PROJECT_UNAVAILABLE');
  assert.equal(failure.failurePhase, 'CANONICAL_PATH');
  assert.equal(failure.errorCode, 'EACCES');
  const statFailure = identifyProjectTarget(local, { ...files, stat() { throw Object.assign(new Error('not readable'), { code: 'EPERM' }); } });
  assert.equal(statFailure.failurePhase, 'DIRECTORY_STAT');
  assert.equal(statFailure.errorCode, 'EPERM');
});

test('a canonical path from the host is required, and is used instead of a textual alias', () => {
  const aliasFiles = { realPath: () => root, stat: files.stat };
  assert.equal(identifyProjectTarget({ type: 'codex-local', path: '/explicit-alias' }, aliasFiles).workspacePath, root);
  assert.equal(identifyProjectTarget(local, { ...files, realPath: () => 'relative' }).reason, 'PROJECT_UNAVAILABLE');
  assert.equal(identifyProjectTarget(local, {}).reason, 'CAPABILITY_UNAVAILABLE');
});

test('projectless is explicit and cannot carry local or cloud project identity', () => {
  assert.equal(identifyProjectTarget({ type: 'projectless' }, files).projectType, 'PROJECTLESS');
  for (const target of [{ type: 'projectless', path: root }, { type: 'projectless', projectId: 'x' }]) {
    assert.equal(identifyProjectTarget(target, files).reason, 'PROJECT_UNKNOWN');
  }
  const result = planCodexTask({ projectTarget: { type: 'projectless' }, prompt: DEMO_PROMPT }, files);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'PROJECTLESS_ENTRY_UNVERIFIED');
  assert.equal(result.deepLinkCandidate, undefined);
});

test('ChatGPT Project is never represented by cwd, even with the same label', () => {
  const result = identifyProjectTarget({ type: 'chatgpt-project', projectId: 'g-p-example', path: root }, files);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'CHATGPT_PROJECT_UNSUPPORTED');
  assert.equal(result.workspacePath, undefined);
});

test('different explicitly selected directories retain distinct identity', () => {
  const first = identifyProjectTarget(local, files);
  const second = identifyProjectTarget({ type: 'codex-local', path: path.join(root, 'examples') }, files);
  assert.notEqual(first.workspacePath, second.workspacePath);
});

test('the candidate URL round-trips Unicode, newlines, percent and query delimiters exactly', () => {
  const prompt = '固定演示\n&path=/wrong #中文 % + ?';
  const result = planCodexTask({ projectTarget: local, prompt }, files);
  const url = new URL(result.deepLinkCandidate);
  assert.equal(url.protocol, 'codex:');
  assert.equal(url.host, 'threads');
  assert.equal(url.pathname, '/new');
  assert.equal(url.searchParams.get('path'), root);
  assert.equal(url.searchParams.get('prompt'), prompt);
  assert.equal(url.searchParams.size, 2);
  assert.equal(result.status, 'NOT_STARTED');
  assert.equal(result.phase, 'PREPARATION_PLAN_READY');
  assert.equal(result.desktopObserved, false);
  assert.equal(result.inputAttempted, false);
  assert.equal(result.submissionAttempted, false);
  assert.equal(result.threadId, null);
});

test('empty or invalid prompt cannot produce a launch candidate', () => {
  for (const prompt of [undefined, null, 12, '', '  ', '\u0000', '\ud800']) {
    const result = planCodexTask({ projectTarget: local, prompt }, files);
    assert.equal(result.status, 'NOT_STARTED');
    assert.equal(result.reason, 'INVALID_PROMPT');
    assert.equal(result.deepLinkCandidate, undefined);
  }
});

test('repeated planning returns the same plan and retains NOT_STARTED', () => {
  const request = { projectTarget: local, prompt: DEMO_PROMPT };
  const first = planCodexTask(request, files);
  assert.deepEqual(planCodexTask(request, files), first);
  assert.equal(first.status, 'NOT_STARTED');
  assert.equal(first.submissionAttempted, false);
  assert.equal(first.reason, 'DESKTOP_PREPARATION_NOT_VERIFIED');
});
