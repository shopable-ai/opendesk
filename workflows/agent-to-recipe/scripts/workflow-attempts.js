'use strict';

// File retention only. This module never runs a Skill, judges an artifact,
// scores a stage, grants actions or substitutes for check-workflow-stage.js.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { hash, makeRoots, resolveFile, entryFile, readBytes, FILE_LIMIT, JSON_LIMIT } = require('./artifact-validation.js');

const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value);
const escape = value => String(value ?? '未提供').replace(/[&<>"'|`\[\]()*_\\!#\r\n\x00-\x1f\x7f]/g,
  char => '&#' + char.charCodeAt(0) + ';');
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

function renderAttempt(root) {
  const started = JSON.parse(fs.readFileSync(path.join(root, 'started.json'), 'utf8'));
  let expected = '请求尚未取得或无法解析；见 preparation-error.json';
  try {
    const request = JSON.parse(fs.readFileSync(path.join(root, 'request.json'), 'utf8'));
    expected = JSON.stringify(request.requiredOutputs ?? '未交付 requiredOutputs');
  } catch { /* Missing/invalid request is retained as a failure, not repaired. */ }
  const capturesRoot = path.join(root, 'captures');
  const captures = fs.existsSync(capturesRoot) ? fs.readdirSync(capturesRoot)
    .filter(name => /^capture-[a-f0-9-]+$/.test(name)).sort() : [];
  const lines = [
    '# ' + started.stage + ' / ' + started.owner, '',
    '| 项目 | 当前证据 |', '| --- | --- |',
    '| Attempt | ' + escape(started.attemptId) + ' |',
    '| 原始请求 | ' + (fs.existsSync(path.join(root, 'request.json')) ? '[request.json](request.json)' : '未取得') + ' |',
    '| 预期交付 | ' + escape(expected) + ' |',
    '| 实际原始输出 | ' + (captures.length ? captures.length + ' 次留档；见下表' : '尚未收到，不能记 PASS') + ' |',
    '| 正确性 / 首错 | 尚无本页可独立决定的结论；以同版 checker 结果为准 |',
    '| 中断接续 | 先核对副作用；不得凭输出缺失自动重放 |', '',
    ...(fs.existsSync(path.join(root, 'input-index.json')) ? ['[输入与实际留档文件](input-index.md)', ''] : []),
    ...(fs.existsSync(path.join(root, 'preparation-error.json')) ? ['[准备失败：实际缺项](preparation-error.json)', ''] : []),
    '| 原始输出 | 实际错误 | 留档元数据 |', '| --- | --- | --- |'
  ];
  for (const name of captures.slice(-30)) {
    const prefix = 'captures/' + name + '/';
    const capture = JSON.parse(fs.readFileSync(path.join(capturesRoot, name, 'capture.json'), 'utf8'));
    lines.push('| ' + (capture.output ? '[查看原文](' + prefix + 'producer-output.txt)' : '无已收到输出')
      + ' | ' + (capture.error ? '[查看错误](' + prefix + 'producer-error.txt)' : capture.retentionError ? escape(capture.retentionError.message) : '无已收到错误')
      + ' | [capture.json](' + prefix + 'capture.json) |');
  }
  if (!captures.length) lines.push('| 未收到 | 未收到 | 未验证 |');
  if (captures.length > 30) lines.push('', '仅显示最近 30 个入口；全部原始文件保留在 captures/，没有删除或覆盖。');
  lines.push('', '本页只投影 request/started/capture 文件，不做评分或 Gate 判断；原始输出即使错误、截断或解析失败也保留。', '');
  fs.writeFileSync(path.join(root, 'attempt.md'), lines.join('\n'));
}

function snapshotsMarkdown(snapshots) {
  return [
    '# 当次固定文件', '',
    '本页只投影同版快照索引。缺失或漂移明确保留，不能补造历史文件。', '',
    '| Stage | 原始引用 / hash | 实际留档 | 状态 |', '| --- | --- | --- | --- |',
    ...snapshots.map(item => '| ' + escape(item.stage) + ' | '
      + escape(item.ref ? item.ref.rootId + ':' + item.ref.path + ' @' + item.ref.sha256 : item.code)
      + ' | ' + (item.snapshot ? '[查看文件](' + item.snapshot + ')' : '缺失：' + escape(item.message))
      + ' | ' + escape(item.status) + ' |'), ''
  ].join('\n');
}

function directory(parent, name) {
  const folder = path.join(parent, name);
  fs.mkdirSync(folder, { recursive: true });
  if (fs.lstatSync(folder).isSymbolicLink() || !fs.statSync(folder).isDirectory()) {
    throw new Error('Attempt storage must be a regular directory.');
  }
  return folder;
}

function retainedFile(source, target, roots, budget, limit = FILE_LIMIT) {
  const authorized = entryFile(roots, path.resolve(source));
  const bytes = readBytes(authorized, limit, budget);
  fs.writeFileSync(target, bytes, { flag: 'wx' });
  return { path: path.basename(target), sha256: hash(bytes), bytes: bytes.length };
}

function reserveCheck(taskRoot, invocation) {
  const parent = directory(taskRoot, 'checks');
  const root = directory(parent, 'check-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
  json(path.join(root, 'invocation.json'), { ...invocation, startedAt: new Date().toISOString(),
    role: 'Retention metadata only; checker owns machine verdict.' });
  return root;
}

function snapshotRefs(root, report, rootEntries) {
  const entries = [];
  let roots;
  try { roots = makeRoots(rootEntries); }
  catch (error) { return [{ status: 'unavailable', code: error.code || 'ROOTS', message: error.message }]; }
  const budget = { bytes: 0 };
  const seen = new Set();
  const folder = directory(root, 'files');
  for (const [stage, review] of Object.entries(report.stages || {})) {
    const refs = [...(review.inputs || []), ...(review.outputs || []), ...(review.evidence || []),
      ...(review.dependencies || []), ...(review.findings || []).flatMap(item => item.evidence || []),
      ...(review.gate?.evidence || []), ...(review.requiredTests || []).flatMap(item => item.evidence || []),
      ...(review.validationReports || []).flatMap(item => [item.reportRef,
        item.consumerVerification?.descriptorRef, item.consumerVerification?.evaluatorRef]).filter(Boolean),
      ...Object.values(review.scoreEvidence || {}).flatMap(item => [
        ...(item?.refs || []), ...(item?.items || []).flatMap(criterion => criterion.refs || [])])];
    for (const ref of refs) {
      const key = [ref?.rootId, ref?.path, ref?.sha256].join('\0');
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = { stage, ref };
      try {
        const source = resolveFile(roots, ref.rootId, ref.path);
        const bytes = readBytes(source, FILE_LIMIT, budget);
        const extension = path.extname(ref.path);
        const name = String(entries.length + 1).padStart(4, '0')
          + (/^\.[A-Za-z0-9]{1,12}$/.test(extension) ? extension : '.bin');
        fs.writeFileSync(path.join(folder, name), bytes, { flag: 'wx' });
        entry.snapshot = 'files/' + name;
        entry.actualSha256 = hash(bytes);
        entry.status = entry.actualSha256 === ref.sha256 ? 'retained' : 'hash-mismatch';
      } catch (error) {
        entry.status = 'unavailable';
        entry.code = error.code || 'READ_FAILED';
        entry.message = error.message;
      }
      entries.push(entry);
    }
  }
  return entries;
}

function saveCheck(root, report, roots) {
  json(path.join(root, 'checker-result.json'), report);
  const snapshots = snapshotRefs(root, report, roots);
  json(path.join(root, 'snapshot-index.json'), snapshots);
  fs.writeFileSync(path.join(root, 'snapshot-index.md'), snapshotsMarkdown(snapshots), { flag: 'wx' });
  return snapshots;
}

function saveEntryFailure(root, error) {
  const checkerExecuted = fs.existsSync(path.join(root, 'checker-result.json'));
  json(path.join(root, 'entry-error.json'), { code: error.code || 'ENTRY_ERROR', message: error.message,
    checkerExecuted, failureOwner: null,
    nextAction: 'Fix the named entry/input/storage gap, then run the existing checker; do not infer a business failure owner.' });
  fs.writeFileSync(path.join(root, 'entry-error.md'), [
    '# Workflow 入口失败', '',
    '| 项目 | 实际情况 |', '| --- | --- |',
    '| Checker | ' + (checkerExecuted ? '结果已留档；另有入口/留档错误，不能继续消费' : '未得到 checker 结果，不能判断业务阶段正确性') + ' |',
    '| 错误 | ' + escape(error.code || 'ENTRY_ERROR') + ': ' + escape(error.message) + ' |',
    '| Failure Owner | 未验证；禁止把入口失败冒充某个业务阶段失败 |',
    '| 下一动作 | 修复上述缺项，再运行唯一 checker |', '',
    '本文件只投影 entry-error.json；没有评分或 Gate 结论。', ''
  ].join('\n'), { flag: 'wx' });
}

function beginAttempt(taskRoot, options, progress, spec, rootEntries) {
  if (!safeId(options.attemptId)) throw new Error('--attempt-id must be a portable unique ID.');
  const stage = spec.stages.find(item => item.id === options.stage);
  if (!stage) throw new Error('--stage must name S1..S12.');
  const parent = directory(taskRoot, 'attempts');
  const root = path.join(parent, options.attemptId);
  fs.mkdirSync(root); // Existing attempt is immutable; no overwrite or replay.
  json(path.join(root, 'started.json'), { taskId: progress.taskId, attemptId: options.attemptId,
    stage: stage.id, owner: stage.owner, startedAt: new Date().toISOString(),
    checkerVerdict: 'not-run', sideEffectStateBeforeAttempt: progress.safety?.sideEffectState || 'unknown' });
  // Write the human entry before reading request/input files, so even an input
  // acquisition failure remains visible. Missing output is never called PASS.
  renderAttempt(root);
  try {
    if (!options.request) throw new Error('--request is required for begin.');
    const roots = makeRoots(rootEntries);
    const budget = { bytes: 0 };
    const ref = retainedFile(options.request, path.join(root, 'request.json'), roots, budget, JSON_LIMIT);
    const request = JSON.parse(fs.readFileSync(path.join(root, 'request.json'), 'utf8'));
    if (request.taskId !== progress.taskId || request.attemptId !== options.attemptId
      || request.skill !== stage.owner || request.schemaVersion !== 'agent-to-recipe/v1') {
      throw new Error('Request identity/schema must match the task, attempt and stage owner.');
    }
    // Reuse the current checker report projection to retain exact permitted
    // input refs. No future artifacts or directory scan is performed.
    const snapshots = snapshotRefs(root, { stages: { [stage.id]: { inputs: request.inputRefs || [] } } }, rootEntries);
    json(path.join(root, 'input-index.json'), snapshots);
    fs.writeFileSync(path.join(root, 'input-index.md'), snapshotsMarkdown(snapshots), { flag: 'wx' });
    json(path.join(root, 'request-retention.json'), ref);
    if (snapshots.some(item => item.status !== 'retained')) throw new Error('Request inputs could not all be retained at their declared hashes.');
    renderAttempt(root);
    return { root, request };
  } catch (error) {
    json(path.join(root, 'preparation-error.json'), { code: error.code || 'PREPARATION_FAILED', message: error.message,
      producerStarted: false, checkerVerdict: 'not-run', nextAction: 'Supply matching request/inputs; do not start the producer.' });
    renderAttempt(root);
    throw error;
  }
}

function captureOutput(taskRoot, options, rootEntries) {
  if (!safeId(options.attemptId)) throw new Error('--attempt-id must be a portable unique ID.');
  const attemptRoot = path.join(taskRoot, 'attempts', options.attemptId);
  if (fs.lstatSync(attemptRoot).isSymbolicLink() || !fs.statSync(path.join(attemptRoot, 'started.json')).isFile()) {
    throw new Error('Use begin before capturing output.');
  }
  const root = directory(directory(attemptRoot, 'captures'), 'capture-' + randomUUID());
  const capture = { capturedAt: new Date().toISOString(), output: null, error: null,
    checkerVerdict: 'not-run', note: 'Raw bytes only; malformed, partial or failed output is retained, never executed.' };
  try {
    if (!options.output && !options.errorFile) throw new Error('capture needs --output or --error-file.');
    const roots = makeRoots(rootEntries);
    const budget = { bytes: 0 };
    if (options.output) capture.output = retainedFile(options.output, path.join(root, 'producer-output.txt'), roots, budget);
    if (options.errorFile) capture.error = retainedFile(options.errorFile, path.join(root, 'producer-error.txt'), roots, budget);
    return root;
  } catch (error) {
    capture.retentionError = { code: error.code || 'CAPTURE_FAILED', message: error.message };
    throw error;
  } finally {
    json(path.join(root, 'capture.json'), capture);
    renderAttempt(attemptRoot);
  }
}

module.exports = { reserveCheck, saveCheck, saveEntryFailure, beginAttempt, captureOutput, retainedFile };
