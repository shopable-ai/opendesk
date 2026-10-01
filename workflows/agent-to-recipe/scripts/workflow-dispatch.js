'use strict';

// Trusted-host adapter: retain -> reserve -> bind dispatch -> execute -> capture
// -> settle. It never selects a model, scores a stage or executes artifact text.
const fs = require('node:fs');
const path = require('node:path');
const { makeRoots, resolveFile, readBytes, hash, FILE_LIMIT, parseDocument } = require('./artifact-validation.js');
const { beginAttempt, captureOutput } = require('./workflow-attempts.js');
const { loadWorkflowSpec } = require('./workflow-runner.js');
const budget = require('./workflow-budget.js');

function save(root, name, value) {
  fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
function fixedRead(ref, roots, allowance) {
  const file = resolveFile(roots, ref.rootId, ref.path);
  const bytes = readBytes(file, FILE_LIMIT, allowance);
  if (hash(bytes) !== ref.sha256) throw new Error('Dispatch input changed: ' + ref.rootId + ':' + ref.path);
  return { ref, bytes, file };
}
function localRef(taskRoot, file, kind) {
  return { rootId: 'task', path: path.relative(taskRoot, file).split(path.sep).join('/'), kind,
    schemaVersion: 'agent-to-recipe/v1', sha256: hash(fs.readFileSync(file)) };
}
function assertModelInputs({ bodyText, requestRef, requiredBodyRefs = [] }) {
  const body = JSON.parse(bodyText);
  if (!Array.isArray(body.tools) || body.tools.length || body.tool_choice !== 'none') {
    throw new Error('An isolated model invocation must have no tools.');
  }
  const content = body.input?.[0]?.content?.[0];
  if (content?.type !== 'input_text') throw new Error('Supply the fixed document packet.');
  const packet = JSON.parse(content.text);
  if (!Array.isArray(packet.documents) || packet.documents.length > 32) throw new Error('Bounded documents required.');
  const documents = packet.documents.map(document => {
    if (typeof document.text !== 'string' || hash(Buffer.from(document.text)) !== document.sha256) {
      throw new Error('Model document text/hash mismatch.');
    }
    return document;
  });
  const requestDocument = documents.find(document => document.sha256 === requestRef.sha256);
  if (!requestDocument) throw new Error('Current request body was not delivered to the model.');
  const request = JSON.parse(requestDocument.text);
  for (const ref of [...request.inputRefs, ...(request.contractRef ? [request.contractRef] : []), ...requiredBodyRefs]) {
    if (!documents.some(document => document.sha256 === ref.sha256)) {
      throw new Error('Required model input body was not delivered: ' + ref.rootId + ':' + ref.path);
    }
  }
  return { bodySha256: hash(Buffer.from(bodyText)), requestSha256: requestRef.sha256,
    documentSha256: documents.map(document => document.sha256), requiredBodyRefs };
}
function publishAttemptEntry(taskRoot, progress, request, attemptRoot) {
  const updated = { ...progress, activeAttemptId: request.attemptId, activeWorkPackageId: request.workPackageId };
  const temporary = path.join(taskRoot, 'progress.json.dispatch-tmp');
  fs.writeFileSync(temporary, JSON.stringify(updated, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temporary, path.join(taskRoot, 'progress.json'));
  const relative = path.relative(taskRoot, attemptRoot).split(path.sep).join('/');
  fs.writeFileSync(path.join(taskRoot, 'last-check.md'), [
    '# 最新工作流文件入口', '',
    '[当前实际调用：请求、输入、原始输出或错误](' + relative + '/attempt.md)', '',
    '本次派发不产生阶段 verdict；最近正式 checker 仍为：' + (progress.reviewRef || '尚未检查') + '。', '',
    '当前失效边界和历史检查不因派发变成通过。', ''
  ].join('\n'));
}

async function dispatch(options) {
  if (typeof options.execute !== 'function') throw new Error('A trusted host callback is required.');
  const roots = makeRoots(options.roots);
  const taskRoot = path.resolve(options.taskRoot);
  if (roots.get('task') !== taskRoot) throw new Error('Bind the actual task root.');
  const allowance = { bytes: 0 };
  const requestInput = fixedRead(options.requestRef, roots, allowance);
  const request = parseDocument(requestInput.bytes);
  const progress = JSON.parse(fs.readFileSync(path.join(taskRoot, 'progress.json')));
  // A supporting upstream repair may be invoked while the task remains blocked
  // at its downstream discovery boundary. This helper does not release it.
  const attempt = beginAttempt(taskRoot, { stage: options.stage, attemptId: request.attemptId,
    request: requestInput.file }, progress, loadWorkflowSpec(), options.roots);
  publishAttemptEntry(taskRoot, progress, request, attempt.root);
  const objectRefs = [...request.inputRefs, ...(request.contractRef ? [request.contractRef] : [])];
  const started = Date.now();
  let admission;
  try {
    admission = budget.reserve(options.scopeRoot, {
      scopeId: options.scopeId, attemptId: request.attemptId, owner: options.owner,
      scopeCounters: options.counters, requestRef: options.requestRef,
      objectRefs, ownerEvidenceRef: options.ownerEvidenceRef,
    });
    save(attempt.root, 'budget-admission.json', admission);
    // Recheck after the durable commit and give the host these same frozen
    // bytes. A file that changes between preparation/admission and dispatch
    // must not be silently substituted into the actual invocation.
    const retainedRequest = fixedRead(options.requestRef, roots, allowance);
    const inputs = [retainedRequest, ...objectRefs.map(ref => fixedRead(ref, roots, allowance))];
    save(attempt.root, 'dispatch.json', {
      scopeId: options.scopeId, attemptId: request.attemptId, admissionSequence: admission.sequence,
      admissionSha256: admission.sha256, requestRef: options.requestRef, objectRefs,
      dispatchedAt: new Date().toISOString(), authority: 'Caller-owned trusted host callback; no authority inferred from model output.',
    });
    const result = await options.execute({ request: parseDocument(retainedRequest.bytes), inputs, admission, attemptRoot: attempt.root });
    if (!result || typeof result.rawOutput !== 'string' && typeof result.rawError !== 'string') {
      throw new Error('Host must return actual raw output or an actual error; no output may be manufactured.');
    }
    const capture = { attemptId: request.attemptId };
    if (typeof result.rawOutput === 'string') {
      capture.output = path.join(attempt.root, 'host-output.txt');
      fs.writeFileSync(capture.output, result.rawOutput, { flag: 'wx', mode: 0o600 });
    }
    if (typeof result.rawError === 'string') {
      capture.errorFile = path.join(attempt.root, 'host-returned-error.txt');
      fs.writeFileSync(capture.errorFile, result.rawError, { flag: 'wx', mode: 0o600 });
    }
    captureOutput(taskRoot, capture, options.roots);
    const counts = Object.fromEntries(Object.keys(budget.status(options.scopeRoot).scopeCounters).map(key => [key, 0]));
    Object.assign(counts, result.actualCounters, { scopeElapsedMs: Date.now() - started });
    const outcome = result.terminal === true && result.sideEffectState === 'known'
      ? result.failed === true ? 'failed' : 'success' : 'unknown';
    const evidence = {
      scopeId: options.scopeId, attemptId: request.attemptId, owner: options.owner,
      admissionSequence: admission.sequence, outcome, scopeCounters: counts,
      observedAt: new Date().toISOString(), terminal: result.terminal === true,
      sideEffectState: result.sideEffectState || 'unknown', evidenceRefs: result.evidenceRefs || [],
    };
    save(attempt.root, 'host-terminal.json', evidence);
    const settlement = budget.settle(options.scopeRoot, {
      scopeId: options.scopeId, attemptId: request.attemptId, outcome, scopeCounters: counts,
      evidenceRef: localRef(taskRoot, path.join(attempt.root, 'host-terminal.json'), 'HostExecutionEvidence'),
    });
    save(attempt.root, 'budget-settlement.json', settlement);
    return { attemptRoot: attempt.root, admission, settlement, rawOutput: result.rawOutput ?? null, outcome };
  } catch (error) {
    const errorFile = path.join(attempt.root, 'host-error.txt');
    fs.writeFileSync(errorFile, JSON.stringify({ code: error.code || 'HOST_DISPATCH_FAILED', message: error.message,
      admissionSequence: admission?.sequence || null, inputEffects: 'Not inferred from exception; reconcile any committed reservation.' }) + '\n', { flag: 'wx', mode: 0o600 });
    captureOutput(taskRoot, { attemptId: request.attemptId, errorFile }, options.roots);
    // A committed reservation stays in flight. No automatic retry, refund or
    // made-up terminal state follows an exception in the host/capture path.
    throw error;
  }
}

module.exports = { dispatch, assertModelInputs };
