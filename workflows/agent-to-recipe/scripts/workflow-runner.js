'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { checkWorkflowStage } = require('./check-workflow-stage.js');
const { renderWorkflowReview, workflowPresentation } = require('./stage-review.js');
const { randomUUID } = require('node:crypto');
const { makeRoots, JSON_LIMIT } = require('./artifact-validation.js');
const { reserveCheck, saveCheck, saveEntryFailure, beginAttempt, captureOutput, retainedFile } = require('./workflow-attempts.js');

const DEFAULT_SPEC = path.resolve(__dirname, '../workflow.yaml');
const PROGRESS_FILE = 'progress.json';
const REVIEW_FILE = 'stage-review.md';

function loadWorkflowSpec(specPath = DEFAULT_SPEC) {
  const source = fs.readFileSync(specPath, 'utf8');
  const spec = JSON.parse(source);
  if (spec?.schemaVersion !== 'agent-to-recipe/workflow/v1' || spec?.id !== 'agent-to-recipe') {
    throw new Error('Unsupported Agent-to-Recipe workflow spec.');
  }
  if (!Array.isArray(spec.stages) || spec.stages.length !== 12
    || spec.stages.some((stage, index) => stage.id !== 'S' + (index + 1))) {
    throw new Error('workflow.yaml must define exactly S1-S12 in order.');
  }
  return spec;
}

function stage(spec, id) {
  return spec.stages.find(item => item.id === id) || null;
}

function nextStage(spec, id) {
  const item = stage(spec, id);
  return item?.onPass === 'complete' ? null : item?.onPass || null;
}

function nextDescriptor(spec, id, mode) {
  const item = stage(spec, id);
  if (!item) return null;
  return { stage: item.id, owner: item.owner, mode: mode || item.mode };
}

function initialProgress(taskId, spec = loadWorkflowSpec()) {
  if (!taskId || typeof taskId !== 'string') throw new Error('taskId is required.');
  return {
    schemaVersion: 'agent-to-recipe/progress/v1',
    taskId,
    workflow: spec.id,
    planRevision: null,
    status: 'ready',
    currentStage: 'S1',
    lastConfirmedStage: null,
    firstInvalidBoundary: null,
    activeAttemptId: null,
    activeWorkPackageId: null,
    reviewRef: null,
    next: nextDescriptor(spec, 'S1'),
    safety: { sideEffectState: 'known' }
  };
}

function validateProgress(progress, spec = loadWorkflowSpec()) {
  if (!progress || progress.schemaVersion !== 'agent-to-recipe/progress/v1') {
    throw new Error('Unsupported progress.json.');
  }
  if (progress.workflow !== spec.id || !stage(spec, progress.currentStage)) {
    throw new Error('progress.json does not match workflow.yaml.');
  }
  for (const key of spec.rules.progressMustNotContain || []) {
    if (Object.prototype.hasOwnProperty.call(progress, key)) {
      throw new Error('progress.json must stay compact; forbidden field: ' + key);
    }
  }
  const size = Buffer.byteLength(JSON.stringify(progress));
  if (size > spec.state.maxProgressBytes) {
    throw new Error('progress.json exceeds compact-state limit: ' + size + ' bytes.');
  }
  return progress;
}

function lastConfirmedBefore(spec, report, boundary) {
  const stop = boundary ? spec.stages.findIndex(item => item.id === boundary) : spec.stages.length;
  let last = null;
  for (let index = 0; index < stop; index += 1) {
    const id = spec.stages[index].id;
    if (report?.stages?.[id]?.verdict === 'pass') last = id;
    else break;
  }
  return last;
}

function deriveResume(report, spec = loadWorkflowSpec()) {
  if (!report || typeof report !== 'object') throw new Error('checker report is required.');
  let boundary = report.firstInvalidBoundary || null;
  if (!boundary) {
    const explicitFailure = spec.stages.find(item => ['fail', 'blocked'].includes(report.stages?.[item.id]?.verdict));
    boundary = explicitFailure?.id || null;
  }

  if (boundary) {
    const failed = stage(spec, boundary);
    return {
      status: 'blocked',
      currentStage: boundary,
      lastConfirmedStage: lastConfirmedBefore(spec, report, boundary),
      firstInvalidBoundary: boundary,
      next: nextDescriptor(spec, boundary, failed?.mode === 'normal' ? 'targeted-repair' : failed?.mode)
    };
  }

  // A malformed/missing record can fail globally without a business owner.
  // Keep it blocked rather than manufacturing a ready S1 or qualified S12.
  if (report.allowed !== true) {
    return { status: 'blocked', currentStage: stage(spec, report.from) ? report.from : 'S1',
      lastConfirmedStage: lastConfirmedBefore(spec, report, null), firstInvalidBoundary: null, next: null };
  }

  let last = null;
  for (const item of spec.stages) {
    if (report.stages?.[item.id]?.verdict === 'pass') last = item.id;
    else break;
  }
  if (last === 'S12' && report.allowed) {
    return { status: 'qualified', currentStage: 'S12', lastConfirmedStage: 'S12', firstInvalidBoundary: null, next: null };
  }
  const upcoming = last ? nextStage(spec, last) : 'S1';
  return {
    status: upcoming ? 'ready' : 'blocked',
    currentStage: upcoming || last || 'S1',
    lastConfirmedStage: last,
    firstInvalidBoundary: null,
    next: upcoming ? nextDescriptor(spec, upcoming) : null
  };
}

function reconcileProgress(progress, report, spec = loadWorkflowSpec()) {
  validateProgress(progress, spec);
  const derived = deriveResume(report, spec);
  return validateProgress({ ...progress, ...derived }, spec);
}

function writeJsonAtomic(file, value) {
  const temp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(temp, file);
}

function readProgress(taskRoot, spec) {
  const file = path.join(taskRoot, PROGRESS_FILE);
  return validateProgress(JSON.parse(fs.readFileSync(file, 'utf8')), spec);
}

function printStatus(progress) {
  const next = progress.next ? `${progress.next.stage} / ${progress.next.owner} / ${progress.next.mode}` : '—';
  return [
    `任务: ${progress.taskId}`,
    `状态: ${progress.status}`,
    `当前阶段: ${progress.currentStage}`,
    `最后确认正确: ${progress.lastConfirmedStage || '—'}`,
    `首个无效边界: ${progress.firstInvalidBoundary || '—'}`,
    `下一步: ${next}`,
    `副作用状态: ${progress.safety?.sideEffectState || 'unknown'}`,
    `检查文件: ${progress.reviewRef || '尚未检查'}`
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, roots: [] };
  const flags = new Set(['--task-root', '--task-id', '--spec', '--record', '--root', '--from', '--to',
    '--stage', '--attempt-id', '--request', '--output', '--error-file']);
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (flag === '--final') {
      if (options.final) throw new Error('Repeated --final.');
      options.final = true; i -= 1; continue;
    }
    if (!flags.has(flag)) throw new Error('Unknown workflow option: ' + flag);
    const value = rest[i + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
    if (flag === '--root') options.roots.push(value);
    else {
      const key = flag.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (options[key] !== undefined) throw new Error('Repeated workflow option: ' + flag);
      options[key] = value;
    }
  }
  return options;
}

function main(argv) {
  // Locate storage before parsing/reading other inputs. Even invalid arguments,
  // malformed progress, a missing record or failed request acquire a file entry.
  const rootIndex = argv.indexOf('--task-root');
  const taskIndex = argv.indexOf('--task-id');
  const taskId = taskIndex >= 0 ? argv[taskIndex + 1] : null;
  const rootArg = rootIndex >= 0 ? argv[rootIndex + 1] : null;
  const runtimeRoot = path.resolve(__dirname, '../../../.runtime');
  const taskRoot = rootArg && !rootArg.startsWith('--') ? path.resolve(rootArg)
    : taskId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(taskId)
      ? path.join(runtimeRoot, 'automation-authoring', taskId) : null;
  if (!taskRoot || !taskRoot.startsWith(runtimeRoot + path.sep)) {
    throw new Error('Use --task-root inside the repository .runtime/ or --task-id for its default task root.');
  }
  let current = path.parse(taskRoot).root;
  for (const part of taskRoot.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Workflow storage cannot use symlinks.');
  }
  // status is read-only; every mutating call gets independent retained files.
  const journal = argv[0] === 'status' ? null : reserveCheck(taskRoot, { command: argv[0] || null });
  let attemptRef = null;
  let captureRef = null;
  try {
    const options = parseArgs(argv);
    const spec = loadWorkflowSpec(options.spec);
    if (!['init', 'status', 'begin', 'capture', 'resume'].includes(options.command)) {
      throw new Error('Use init, status, begin, capture or resume.');
    }
    const rootEntries = options.roots.map(value => {
      const delimiter = value.indexOf('=');
      if (delimiter < 1) throw new Error('Use --root id=/absolute/directory');
      return [value.slice(0, delimiter), value.slice(delimiter + 1)];
    });

    if (options.command === 'init') {
      if (!options.taskId) throw new Error('--task-id is required for init.');
      fs.mkdirSync(taskRoot, { recursive: true });
      const file = path.join(taskRoot, PROGRESS_FILE);
      if (fs.existsSync(file)) throw new Error('progress.json already exists; use resume.');
      const progress = initialProgress(options.taskId, spec);
      writeJsonAtomic(file, progress);
      process.stdout.write(printStatus(progress) + '\n');
      return;
    }

    const progress = readProgress(taskRoot, spec);
    if (options.command === 'status') {
      process.stdout.write(printStatus(progress) + '\n');
      return;
    }

    if (options.command === 'begin') {
      if (options.stage !== progress.currentStage) throw new Error('Begin must use the current checker-confirmed responsibility; reconcile progress before selecting another stage.');
      if (progress.status === 'running') throw new Error('An attempt is already running; retain its output/interruption and obtain a checked continuation before another attempt.');
      if (typeof options.attemptId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(options.attemptId)) {
        attemptRef = 'attempts/' + options.attemptId + '/attempt.md';
      }
      const attempt = beginAttempt(taskRoot, options, progress, spec, rootEntries);
      const updated = validateProgress({ ...progress, status: 'running', activeAttemptId: options.attemptId,
        activeWorkPackageId: attempt.request.workPackageId || null,
        planRevision: attempt.request.planRevision || progress.planRevision,
        reviewRef: path.relative(taskRoot, path.join(attempt.root, 'attempt.md')).split(path.sep).join('/') }, spec);
      writeJsonAtomic(path.join(taskRoot, PROGRESS_FILE), updated);
      process.stdout.write(printStatus(updated) + '\n');
      return;
    }
    if (options.command === 'capture') {
      const outputRoot = captureOutput(taskRoot, options, rootEntries);
      captureRef = path.relative(taskRoot, path.join(outputRoot, 'capture.json')).split(path.sep).join('/');
      attemptRef = 'attempts/' + options.attemptId + '/attempt.md';
      process.stdout.write('原始输出已保存: ' + outputRoot + '\n正确性尚未验证；继续运行唯一 checker。\n');
      return;
    }

    if (!options.record) throw new Error('--record is required for resume.');
    if (options.final && (options.from && options.from !== 'S12' || options.to && options.to !== 'S12')) {
      throw new Error('--final only accepts S12 → S12.');
    }
    const checkerOptions = {
      record: path.resolve(options.record),
      roots: rootEntries,
      from: options.final ? 'S12' : options.from || progress.currentStage,
      to: options.final ? 'S12' : options.to || nextStage(spec, options.from || progress.currentStage) || 'S12',
      final: Boolean(options.final)
    };
    fs.writeFileSync(path.join(journal, 'checker-options.json'), JSON.stringify(checkerOptions, null, 2) + '\n', { flag: 'wx' });
    // Retain the record first and compare with the checker's actual read hash.
    // If acquisition fails, leave entry-error instead of fake stages.
    const recordSnapshot = retainedFile(checkerOptions.record, path.join(journal, 'record.json'), makeRoots(rootEntries), { bytes: 0 }, JSON_LIMIT);
    const report = checkWorkflowStage(checkerOptions);
    const snapshots = saveCheck(journal, report, rootEntries);
    // Presentation reads only the files already retained for this exact check.
    // It does not run an artifact or alter the checker result or progress.
    const readSnapshot = filename => fs.readFileSync(path.join(journal, filename));
    const presentation = workflowPresentation(report, snapshots, readSnapshot);
    const markdown = renderWorkflowReview(report, presentation) + '\n';
    fs.writeFileSync(path.join(journal, REVIEW_FILE), markdown, { flag: 'wx' });
    const checkRef = path.relative(taskRoot, journal).split(path.sep).join('/');
    if (report.taskId && report.taskId !== progress.taskId) {
      throw new Error('Checker record task identity differs from progress; do not consume another task result.');
    }
    const rootPresentation = { ...presentation, indexHref: checkRef + '/snapshot-index.md',
      checkerHref: checkRef + '/checker-result.json',
      sources: new Map([...presentation.sources].map(([key, source]) => [key, { ...source,
        href: source.href ? checkRef + '/' + source.href : null }])) };
    fs.writeFileSync(path.join(taskRoot, REVIEW_FILE), renderWorkflowReview(report, rootPresentation) + '\n');
    if (recordSnapshot.sha256 !== report.recordSha256 || snapshots.some(item => item.status !== 'retained')) {
      writeJsonAtomic(path.join(taskRoot, PROGRESS_FILE), validateProgress({ ...reconcileProgress(progress, report, spec),
        status: 'blocked', next: null, reviewRef: checkRef + '/checker-result.json' }, spec));
      throw new Error('Some checked files are missing or changed during retention; inspect snapshot-index.json before continuing.');
    }
    const reconciled = reconcileProgress(progress, report, spec);
    reconciled.reviewRef = checkRef + '/checker-result.json';
    reconciled.activeAttemptId = report.attemptId || progress.activeAttemptId;
    reconciled.planRevision = report.planRevision || progress.planRevision;
    reconciled.activeWorkPackageId = report.workPackageId || progress.activeWorkPackageId;
    writeJsonAtomic(path.join(taskRoot, PROGRESS_FILE), reconciled);
    process.stdout.write(printStatus(reconciled) + '\n');
    process.exitCode = report.allowed ? 0 : 2;
  } catch (error) {
    if (journal) saveEntryFailure(journal, error);
    throw error;
  } finally {
    if (journal) {
      const relative = path.relative(taskRoot, journal).split(path.sep).join('/');
      fs.writeFileSync(path.join(taskRoot, 'last-check.md'), [
        '# 最新工作流文件入口', '',
        '保存目录：' + relative, '',
        fs.existsSync(path.join(journal, 'entry-error.json')) ? `[入口/留档错误](${relative}/entry-error.md)`
          : fs.existsSync(path.join(journal, 'checker-result.json')) ? `[Checker 结论与阶段审阅](${relative}/stage-review.md)`
            : '本次只建立尝试或保存原始输出，尚无 checker 正确性结论。', '',
        ...(attemptRef && fs.existsSync(path.join(taskRoot, attemptRef)) ? [`[当前尝试：请求、预期及实际输出](${attemptRef})`, ''] : []),
        ...(captureRef ? [`[当次原始输出留档](${captureRef})`, ''] : []),
        '历史检查保留在 checks/，阶段原始输入与输出保留在 attempts/；不能以此页替代 checker。', ''
      ].join('\n'));
      process.stdout.write('本次留档: ' + journal + '\n');
    }
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(JSON.stringify({ verdict: 'fail', code: error.code || 'ENTRY_ERROR', message: error.message }) + '\n');
    process.exitCode = 2;
  }
}

module.exports = {
  loadWorkflowSpec,
  initialProgress,
  validateProgress,
  deriveResume,
  reconcileProgress,
  printStatus
};
