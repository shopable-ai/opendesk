'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { checkWorkflowStage } = require('./check-workflow-stage.js');
const { renderWorkflowReview } = require('./stage-review.js');

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
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
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
    `副作用状态: ${progress.safety?.sideEffectState || 'unknown'}`
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, roots: [] };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (flag === '--final') { options.final = true; i -= 1; continue; }
    const value = rest[i + 1];
    if (!value) throw new Error('Missing value for ' + flag);
    if (flag === '--root') options.roots.push(value);
    else options[flag.replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const spec = loadWorkflowSpec(options.spec);
  if (!['init', 'status', 'resume'].includes(options.command)) {
    throw new Error('Use init, status or resume.');
  }
  if (!options.taskRoot) throw new Error('--task-root is required.');
  const taskRoot = path.resolve(options.taskRoot);

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

  if (!options.record) throw new Error('--record is required for resume.');
  const checkerOptions = {
    record: path.resolve(options.record),
    roots: options.roots.map(value => {
      const delimiter = value.indexOf('=');
      if (delimiter < 1) throw new Error('Use --root id=/absolute/directory');
      return [value.slice(0, delimiter), value.slice(delimiter + 1)];
    }),
    from: 'S1',
    to: options.to || progress.currentStage,
    final: Boolean(options.final)
  };
  const report = checkWorkflowStage(checkerOptions);
  const reconciled = reconcileProgress(progress, report, spec);
  writeJsonAtomic(path.join(taskRoot, PROGRESS_FILE), reconciled);
  fs.writeFileSync(path.join(taskRoot, REVIEW_FILE), renderWorkflowReview(report) + '\n');
  process.stdout.write(printStatus(reconciled) + '\n');
  process.exitCode = report.allowed ? 0 : 2;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(JSON.stringify({ verdict: 'fail', code: 'USAGE', message: error.message }) + '\n');
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
