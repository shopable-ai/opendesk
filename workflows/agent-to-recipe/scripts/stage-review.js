'use strict';

// Presentation and explicit prefix selection only. No file I/O, model call,
// candidate execution, Gate decision, score generation or progress mutation.
const { own, object, requireCheck, hash } = require('./artifact-validation.js');

const INPUTS = Object.freeze({
  'trace-distill': ['dossier', 'actions', 'distilled'],
  'procedure-synthesize': ['dossier', 'actions', 'distilled', 'procedure'],
  candidate: ['dossier', 'actions', 'distilled', 'procedure', 'candidate'],
  qualification: ['dossier', 'actions', 'distilled', 'procedure', 'candidate', 'qualification'],
});
const TITLES = Object.freeze({
  bindings: '固定输入与引用',
  'trace-distill': 'S7 必要步骤提炼（trace-distill）',
  'procedure-synthesize': 'S8—S9 业务过程（procedure-synthesize）',
  candidate: 'S11 候选映射（recipe-build／code-rebuild）',
  qualification: 'S12 资格记录绑定（recipe-qualify）',
});
const CLAIMS = Object.freeze({
  bindings: ['exact-byte bindings'],
  'trace-distill': ['raw-action disposition coverage', 'runtime-value producer/consumer declarations'],
  'procedure-synthesize': ['ordered DistilledStep-to-BusinessStep mapping', 'capability discovery → method selection → canonical contract → declared validation status (not engineering readiness)'],
  candidate: ['selected API contract refs carried into Candidate source mapping', 'Procedure-to-Candidate declared source mapping; business dataflow requires independent exact-byte consumer verification'],
  qualification: ['Candidate-to-Qualification declared scope binding'],
});

function inputsFor(through) {
  requireCheck(typeof through === 'string' && own(INPUTS, through), 'UNSUPPORTED_STAGE',
    'Use --through trace-distill, procedure-synthesize, candidate or qualification.');
  return [...INPUTS[through]];
}

// Only a bounded projection is displayed. Validation still sees complete input.
function artifactViews(entries) {
  const fields = {
    contract: ['taskId', 'successCriteria'], plan: ['taskId', 'revision'],
    dossier: ['planRevision', 'runtimeValues', 'sideEffects'],
    distilled: ['planRevision', 'steps', 'actionDecisions', 'unresolved'],
    procedure: ['businessSteps', 'parameters', 'dataDependencies', 'capabilityDecisions', 'unresolved'],
    candidate: ['scriptRef', 'dependencies', 'appProfileRefs', 'sourceMapping', 'supportedScope', 'limitations'],
    qualification: ['verdict', 'qualificationScope', 'scenarios', 'failedCriteria', 'skipped', 'limits'],
  };
  return Object.entries(entries).map(([name, entry]) => {
    const rows = [];
    let omitted = 0;
    const add = (key, value) => {
      const values = Array.isArray(value) ? value : [value];
      const count = Math.min(values.length, 30);
      omitted += values.length - count;
      for (let index = 0; index < count; index += 1) {
        const raw = JSON.stringify(values[index]) ?? 'null';
        rows.push({ field: Array.isArray(value) ? key + '[' + index + ']' : key,
          value: raw.length > 1800 ? raw.slice(0, 1800) + ' …〔内容已截断；请查固定工件〕' : raw });
      }
    };
    if (name === 'actions' && Array.isArray(entry.parsed)) add('actions', entry.parsed);
    else if (object(entry.parsed)) for (const key of fields[name] || []) {
      if (own(entry.parsed, key)) add(key, entry.parsed[key]);
    }
    return { name, path: entry.filename, sha256: hash(entry.bytes), rows, omitted };
  });
}

// A bounded drill-down derived from the very same input snapshots. Missing
// links remain visible; this is a declaration trace, not a live causal proof.
function valueLineage(entries, boundaries = {}) {
  const doc = name => entries[name]?.parsed || {};
  const list = value => Array.isArray(value) ? value : [];
  return list(doc('dossier').runtimeValues).slice(0, 100).map(rawValue => {
    const value = object(rawValue) ? rawValue : { name: 'invalid runtime value record' };
    const action = object(value.origin) ? value.origin.actionRef : String(value.origin || '').match(/\bA\d+\b/)?.[0];
    const actionIds = [action, ...list(value.consumers)];
    const steps = list(doc('distilled').steps).filter(step => object(step)
      && list(step.sourceActionRefs).some(id => actionIds.includes(id)));
    const business = list(doc('procedure').businessSteps).filter(step => object(step)
      && list(step.sourceStepRefs).some(id => steps.some(source => source.stepId === id)));
    const mappings = list(doc('candidate').sourceMapping).filter(mapping => object(mapping)
      && business.some(step => (own(mapping, 'businessStepRefs') ? list(mapping.businessStepRefs)
        : String(mapping.step || '').match(/\bB\d+\b/g) || []).includes(step.stepId)));
    return { value: value.name, observedClaim: value.observedValue, action: action || 'missing',
      consumers: list(value.consumers), distilled: steps.map(step => step.stepId),
      business: business.map(step => step.stepId), code: mappings.flatMap(mapping => [
        ...(typeof mapping.function === 'string' && mapping.function.trim() ? [mapping.function] : []),
        ...(Number.isSafeInteger(mapping.line) && mapping.line > 0 && typeof mapping.rule === 'string' && mapping.rule.trim()
          ? ['line ' + mapping.line + ': ' + mapping.rule] : []),
      ]),
      evidence: list(value.evidenceRefs), qualification: entries.qualification
        ? (boundaries.qualification || 'not-run') + ' (record declarations only; not live verified)' : 'not-run' };
  });
}

function provenChecks(status, ok, capabilityTrace = false) {
  // A failed prefix cannot advertise partially checked claims as accepted proof.
  return ok ? Object.keys(CLAIMS).filter(key => status[key] === 'pass').flatMap(key => CLAIMS[key])
    .filter(claim => capabilityTrace || !/capability discovery|selected API contract refs/.test(claim)) : [];
}

function cell(value) {
  // Artifact text is untrusted: disable HTML, links, table/fence escapes and
  // formatting directives. No artifact-derived text becomes a link or command.
  return String(value ?? '').replace(/[&<>"'|`\[\]()*_\\!#\r\n\x00-\x1f\x7f]/g,
    char => '&#' + char.charCodeAt(0) + ';');
}

function list(value) { return Array.isArray(value) ? value : []; }

function compact(value, limit = 1600) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return raw.length > limit ? raw.slice(0, limit) + ' …〔已截断〕' : raw;
}

function refSummary(ref) {
  if (!object(ref)) return 'invalid-ref';
  const kind = typeof ref.kind === 'string' && ref.kind ? ref.kind : 'artifact';
  const path = typeof ref.path === 'string' && ref.path ? ref.path : '?';
  const digest = typeof ref.sha256 === 'string' && ref.sha256 ? ref.sha256.slice(0, 12) : 'no-hash';
  return kind + ': ' + path + ' @' + digest;
}

function refsSummary(refs, limit = 3) {
  const values = list(refs);
  const shown = values.slice(0, limit).map(refSummary);
  if (values.length > limit) shown.push('+' + (values.length - limit) + ' more');
  return shown.length ? shown.join('; ') : '—';
}

// Human names describe the existing responsibilities; they never decide a Gate.
const STAGE_WORK = Object.freeze({
  S1: ['任务与权限', '把原始要求、成功条件、权限和停止条件固定到合同与计划。'],
  S2: ['应用能力核验', '确认当前应用身份、目标、读值方式和下一步操作的证据与限制。'],
  S3: ['实际执行动作', '保存获准动作的请求、实际回执和副作用状态。'],
  S4: ['观察实际效果', '从正确对象重新观察；保存实际读值及其原始来源。'],
  S5: ['决定怎样继续', '依据动作与观察判断继续、停止或返回修复，并保存判断依据。'],
  S6: ['示范事实收口', '把动作、观察、运行时值和未决事项交成下游可消费的事实包。'],
  S7: ['提炼必要步骤', '说明每个步骤为何保留或删除，保留完整的值生产者与消费者关系。'],
  S8: ['解释业务语义', '把必要步骤解释为业务结果、对象、条件和数据含义。'],
  S9: ['形成业务过程', '固定步骤、参数、运行时数据依赖和支持范围。'],
  S10: ['补强应用规则', '为实际过程需要的操作提供经过验证的定位、执行、验证与停止规则。'],
  S11: ['生成并冻结脚本', '由过程和应用规则生成普通 JavaScript，绑定源码、入口和依赖。'],
  S12: ['独立运行验收', '独立运行同一冻结候选，按声明范围验收结果与失败行为。'],
});
const refKey = ref => object(ref) ? [ref.rootId, ref.path, ref.sha256].join('\0') : '';
const safeSnapshot = value => typeof value === 'string' && /^files\/\d{4,}\.[A-Za-z0-9]{1,12}$/.test(value);
const EXCERPT_KINDS = new Set(['TaskContract', 'WorkPlan', 'AppProfile', 'Dossier',
  'DemonstrationDossier', 'DistilledSteps', 'BusinessSteps', 'SemanticProcedure',
  'CandidateManifest', 'QualificationRecord']);

// The caller supplies the check's existing retained files. No latest lookup,
// file I/O, directory discovery, score or verdict is performed by this module.
function workflowPresentation(report, snapshots, readSnapshot, prefix = '') {
  requireCheck(typeof prefix === 'string' && /^(?:[A-Za-z0-9_.-]+\/)*$/.test(prefix)
    && !prefix.split('/').includes('..'), 'INVALID_VIEW_PREFIX', 'Use a safe relative snapshot prefix.');
  const sources = new Map();
  const outputs = new Set(Object.values(report.stages || {}).flatMap(stage => [...list(stage?.inputs), ...list(stage?.outputs)]).map(refKey));
  for (const entry of list(snapshots)) {
    if (!object(entry) || !object(entry.ref)) continue;
    const source = { ...entry, href: null, document: null };
    if (entry.status === 'retained' && entry.actualSha256 === entry.ref.sha256 && safeSnapshot(entry.snapshot)) {
      source.href = prefix + entry.snapshot;
      if (outputs.has(refKey(entry.ref)) && EXCERPT_KINDS.has(entry.ref.kind) && typeof readSnapshot === 'function') {
        try {
          const bytes = readSnapshot(entry.snapshot);
          requireCheck(bytes && bytes.length <= 512 * 1024 && hash(bytes) === entry.ref.sha256,
            'VIEW_HASH_MISMATCH', 'Retained artifact bytes do not match the checked reference.');
          source.document = JSON.parse(bytes.toString('utf8'));
        } catch (error) {
          source.status = 'view-unavailable';
          source.message = error.code || 'VIEW_READ_FAILED';
          source.href = null;
        }
      }
    }
    sources.set(refKey(entry.ref), source);
  }
  return { sources, snapshots, snapshotPrefix: prefix, indexHref: prefix + 'snapshot-index.md', checkerHref: prefix + 'checker-result.json' };
}

function workflowRef(ref, view) {
  const source = view?.sources?.get(refKey(ref));
  const label = cell((ref?.kind || '产物') + ' · ' + String(ref?.path || '?').split('/').pop());
  const digest = cell(String(ref?.sha256 || 'no-hash').slice(0, 12));
  if (source?.href) return '[' + label + '](' + source.href + ') @' + digest;
  return cell(refSummary(ref)) + (source && source.status !== 'retained'
    ? '〔同版文件不可用：' + cell(source.status) + '〕' : '');
}

function artifactExcerpt(ref, document) {
  if (!object(document)) return [];
  const rows = [];
  const add = (label, value) => {
    if (value !== undefined && value !== null && value !== '') rows.push(label + '：' + compact(value, 420));
  };
  const summarize = (value, names) => {
    if (typeof value === 'string') return value;
    if (!object(value)) return compact(value, 420);
    return names.filter(name => value[name] !== undefined).map(name => compact(value[name], 300)).join('；')
      || compact(value, 420);
  };
  const entries = (label, values, names, limit = 5) => {
    for (const value of list(values).slice(0, limit)) add(label, summarize(value, names));
    if (list(values).length > limit) add(label + '余项', '另有 ' + (values.length - limit) + ' 项，打开同版产物查看。');
  };
  if (ref.kind === 'TaskContract') {
    add('任务目标', document.goal);
    entries('运行时数据约束', document.inputs?.runtimeDerived, ['name', 'type', 'producer', 'lifetime', 'consumer']);
    entries('成功条件', document.successCriteria, ['criterionId', 'expected'], 20);
    add('声明支持范围', document.supportedScope?.intended || document.supportedScope);
  } else if (ref.kind === 'WorkPlan') {
    add('计划版本', document.revision || document.planRevision);
    entries('任务分解', document.businessTaskTree, ['id', 'goal']);
    entries('计划动作（尚非执行事实）', document.operationPlan, ['id', 'objectAndGoal', 'plannedAction', 'check']);
  } else if (ref.kind === 'AppProfile') {
    add('应用身份', document.applicationIdentity);
    add('适用环境', document.environmentScope);
    entries('操作规则', document.operations, ['id', 'inputs', 'outputs', 'postconditions'], 3);
    entries('限制', document.limitations, ['reason', 'scope'], 3);
  } else if (['Dossier', 'DemonstrationDossier'].includes(ref.kind)) {
    entries('实际读值与消费者', document.runtimeValues, ['name', 'observedValue', 'origin', 'consumers']);
    add('副作用记录', document.sideEffects);
    entries('未决事项', document.unresolved, ['id', 'reason', 'owner']);
  } else if (ref.kind === 'CandidateManifest') {
    add('冻结源码', document.scriptRef);
    add('支持范围', document.supportedScope);
    entries('限制', document.limitations, ['reason', 'scope']);
  } else if (ref.kind === 'QualificationRecord') {
    add('资格记录声明', document.verdict);
    add('验收范围', document.qualificationScope);
    entries('独立场景', document.scenarios, ['id', 'name', 'verdict', 'executionRef']);
    entries('失败条件', document.failedCriteria, ['id', 'reason']);
  } else {
    entries('业务步骤', document.businessSteps || document.steps, ['stepId', 'goal', 'businessMeaning', 'action', 'postconditions']);
    entries('运行时数据依赖', document.dataDependencies || document.runtimeValues, ['name', 'producer', 'consumers']);
    entries('未决事项', document.unresolved, ['id', 'reason', 'owner']);
  }
  return rows;
}

const stageFile = stage => 'S' + String(Number(stage.slice(1))).padStart(2, '0');
const reviewedStages = report => Object.keys(STAGE_WORK).filter(stage => report.stages[stage]
  && report.stages[stage].verdict !== 'not-run');
const statusText = status => ({ pass: '通过', fail: '失败', blocked: '受阻', 'not-run': '未检查' })[status] || status;
function ownerText(report) {
  if (!report.failureOwner) return report.allowed ? '未记录失败' : 'UNKNOWN';
  return report.failureOwner.status === 'ESTABLISHED'
    ? report.failureOwner.stage + '（仅固定输出修复责任）' : 'UNKNOWN';
}
function firstBusinessProblem(report, stage) {
  const item = report.stages[stage] || {};
  const finding = list(item.findings).find(value => value.blocking);
  const mismatch = list(item.businessReview?.assertions).find(value => value.status !== 'PASS');
  const symptom = list(item.businessReview?.context).find(value => value.role === 'symptom' && value.selection?.available);
  if (mismatch) return (symptom ? showSelection(symptom.selection) + '。' : '') + mismatch.requirement.replace(/[。；：]+$/, '') + '；Actual：' + showSelection(mismatch.actual);
  if (finding) return finding.reason;
  if (list(item.hardFails).length) return compact(item.hardFails[0], 500);
  if (list(item.blockingUnknowns).length) return compact(item.blockingUnknowns[0], 500);
  return list(report.errors).find(error => error.stage === stage
    && !['UPSTREAM_NOT_PASS', 'STAGE_NOT_PASS'].includes(error.code))?.message || '没有足够的业务正文说明；不能补造原因。';
}
function showSelection(selection) {
  if (!selection?.available) return selection?.reason || '未产出／未取得足够的同版内容。';
  if (Array.isArray(selection.value)) return selection.value.length
    ? selection.value.map(value => compact(value, 400)).join('；') : '空列表（没有条目）';
  if (selection.value === null) return 'null（未给出业务值）';
  if (selection.value === true) return '成立（true）';
  if (selection.value === false) return '不成立（false）';
  return compact(selection.value, 1200);
}
function renderWorkflowReview(report, view = {}) {
  requireCheck(object(report) && object(report.stages), 'INVALID_WORKFLOW_REVIEW',
    'Workflow review renderer requires a check-workflow-stage report.');
  const stage = report.diagnosisStage || report.firstInvalidBoundary;
  const checked = reviewedStages(report);
  const last = list(report.preservedUpstream).at(-1) || '未确认';
  const lines = ['# 自动化脚本工作流｜诊断入口', '',
    '材料性质：' + cell(report.sourceNature || '固定记录；未统一声明') + '。', '',
    '**整条业务流程：本报告不单独证明完成。** 当前机器检查：' + cell(report.allowed ? 'PASS（仅本次范围）' : 'FAIL') + '。', '',
    '**Failure Owner: ' + cell(ownerText(report)) + '**', '',
    '| 先回答的问题 | 本次结论 |', '| --- | --- |',
    '| 当前检查范围 | ' + cell(report.from + ' → ' + report.to) + '；已检查 ' + checked.length + ' 个阶段 |',
    '| 首个不能继续信任的边界 | ' + cell(report.firstInvalidBoundary || '尚未定位／没有已知阶段失败') + ' |',
    '| 失败症状发现阶段 | ' + cell(report.failureDiscoveryStage || '未确定／没有已知症状') + ' |',
    '| 最后确认通过的阶段 | ' + cell(last) + '（仅同版记录的检查通过，不保证现场根因已排除） |',
    '| 可保留上游 | ' + cell(list(report.preservedUpstream).join('、') || '无已确认项') + ' |',
    '| 失效／阻塞范围 | ' + cell(list(report.invalidatedDownstream).join('、') || '无已定位范围；未检查不等于可用') + ' |',
    '| 下一最小动作 | ' + cell(report.nextMinimumAction) + ' |', '',
    '**当前首个问题：** ' + cell(stage ? firstBusinessProblem(report, stage)
      : report.allowed ? '本次检查没有报告失败；未检查阶段不作结论。'
        : list(report.errors)[0]?.message || '检查输入不完整，不能推断业务责任。'), ''];
  if (stage && checked.includes(stage)) lines.push(view.bundle
    ? '**只需继续打开：[' + stage + ' 单阶段诊断](stage-review/' + stageFile(stage) + '.md)。**'
    : '单阶段诊断需要同次报告包；使用 checker 的 --review-dir 输出，不能以此摘要代替详情。', '');
  lines.push('## 阶段导航', '', '| 阶段 | 状态 | 单阶段入口 |', '| --- | --- | --- |');
  for (const current of Object.keys(STAGE_WORK)) {
    const item = report.stages[current] || { verdict: 'not-run' };
    const link = checked.includes(current) && view.bundle ? '[打开](stage-review/' + stageFile(current) + '.md)'
      : checked.includes(current) ? '需同次报告包' : '未生成（未检查）';
    lines.push('| ' + current + ' ' + STAGE_WORK[current][0] + ' | ' + cell(statusText(item.verdict)) + ' | ' + link + ' |');
  }
  lines.push('', '只读顺序：本页 → 一个失败阶段 → 必要时一个固定产物。不得把旧尝试的 PASS 拼接为当前运行成功。', '',
    '本工具不执行桌面或 Candidate；文件检查 PASS 不等于 Runtime 或业务 Qualification PASS。');
  if (view.bundle) lines.push('', '[同次机器结论](checker-result.json) · [同次固定文件索引](snapshot-index.json)');
  return lines.join('\n') + '\n';
}

function renderWorkflowStage(report, stage, view = {}) {
  requireCheck(reviewedStages(report).includes(stage), 'UNREVIEWED_STAGE', 'Do not generate invented not-run details.');
  const item = report.stages[stage];
  const business = item.businessReview || {};
  const assertions = list(business.assertions);
  const first = assertions.find(value => value.status !== 'PASS');
  const context = list(business.context);
  const lines = ['# ' + stage + '｜' + STAGE_WORK[stage][0], '',
    '[返回总览](../stage-review.md)', '', '## 1. 一句话阶段结论', '',
    '**' + cell(statusText(item.verdict)) + '**。' + cell(item.verdict === 'pass'
      ? '同版记录的阶段检查通过；未额外证明业务执行真实性。' : firstBusinessProblem(report, stage)), '',
    '## 2. 本阶段业务问题', '', STAGE_WORK[stage][1], '',
    '## 3. 本阶段固定输入', '',
    '来源：本次检查固定工件；阶段计划版本 ' + cell(item.planRevision || report.planRevision || '未记录')
      + '，阶段 Attempt ' + cell(item.attemptId || '未记录') + '。历史示例不替代本次 Actual。', ''];
  const inputs = assertions.filter(value => value.expected?.ref).map(value => ({
    label: value.requirement, selection: value.expected }));
  inputs.push(...context.filter(value => value.selection?.ref
    && list(item.inputs).some(ref => refKey(ref) === refKey(value.selection.ref))));
  if (!inputs.length) {
    for (const ref of list(item.inputs)) {
      const rows = artifactExcerpt(ref, view.sources?.get(refKey(ref))?.document);
      for (const row of rows) lines.push(cell(row), '');
    }
    if (lines.at(-2)?.startsWith('来源：')) lines.push('本记录没有足够的业务输入摘录；不得从路径或评分推断内容正确。', '');
  }
  for (const input of inputs) lines.push('**' + cell(input.label) + '：** ' + cell(showSelection(input.selection)),
    '来源：' + cell((input.selection.ref?.kind || '固定要求') + ' · ' + (input.selection.ref?.path?.split('/').at(-1) || '验收内容')) + '。事实性质：' + cell(input.selection.nature || '未取得同版正文') + '。', '');
  lines.push('## 4. 必须成立的关键断言', '');
  for (const assertion of assertions) lines.push('**' + cell(assertion.id) + '：** ' + cell(assertion.requirement), '');
  if (!assertions.length) lines.push('UNKNOWN：旧验收没有记录可直接比较的业务断言；保留原检查结论，但不把必需测试名称或评分当成业务正文。', '');
  lines.push('## 5. 本次 Actual Output', '');
  if (!list(item.outputs).length) lines.push('**未产出。** 当前阶段没有绑定输出。', '');
  for (const assertion of assertions) lines.push('**' + cell(assertion.id) + ' Actual：** ' + cell(showSelection(assertion.actual)),
    '事实性质：' + cell(assertion.actual?.nature || '内容缺失／未取得') + '。', '');
  for (const entry of context.filter(value => !inputs.includes(value))) lines.push(
    '**' + cell(entry.label) + '：** ' + cell(showSelection(entry.selection)),
    '事实性质：' + cell(entry.selection?.nature || '内容缺失／未取得') + '。', '');
  if (!assertions.length && !context.length && list(item.outputs).length) {
    let shown = false;
    for (const ref of item.outputs) for (const row of artifactExcerpt(ref, view.sources?.get(refKey(ref))?.document)) {
      shown = true; lines.push(cell(row), '');
    }
    if (!shown) lines.push('已绑定输出，但没有可判断业务结果的同版正文。UNKNOWN；不得以“文件存在”当成正确。', '');
  }
  lines.push('## 6. Required 与 Actual 对照', '',
    '| 关键断言 | 必须成立 | 本次 Actual | 判断 | 直接依据 |', '| --- | --- | --- | --- | --- |');
  for (const assertion of assertions) lines.push('| ' + cell(assertion.id) + ' | '
    + cell(showSelection(assertion.expected)) + ' | ' + cell(showSelection(assertion.actual)) + ' | '
    + cell(assertion.status) + ' | ' + cell(assertion.reason) + ' |');
  if (!assertions.length) lines.push('| 业务内容对照 | 需要固定业务要求与本次正文 | 尚无可比较记录 | UNKNOWN | 原机器检查不补造业务判断 |');
  lines.push('', '## 7. 第一处具体不一致', '', '按本阶段固定断言顺序定位；不是对错误发生时间的推测。', '', first
    ? '**' + cell(first.id) + '：** ' + cell(first.requirement) + '\n\n要求：' + cell(showSelection(first.expected))
      + '\n\nActual：' + cell(showSelection(first.actual)) + '\n\n具体位置：' + cell(first.actual?.location || '来源未确定')
    : item.verdict === 'pass' ? '本次固定检查没有报告不一致。业务断言缺失时仍不能证明业务正确。'
      : cell(firstBusinessProblem(report, stage)), '',
    '## 8. 责任与接续', '',
    '发现阶段：' + cell(report.failureDiscoveryStage || '未确定') + '；首个无效边界：'
      + cell(report.firstInvalidBoundary || '未确定') + '。', '',
    '**Failure Owner: ' + cell(ownerText(report)) + '**', '');
  if (report.failureOwner?.status === 'ESTABLISHED') lines.push(
    cell(report.failureOwner.basis.reason), '这不是 Runtime 根因、现场真实性或完整 JavaScript 语义的证明。', '');
  else if (!report.allowed) lines.push('可能责任（尚非结论）：'
    + cell(list(report.failureOwner?.candidates).join('、') || '尚未形成有依据的候选集合') + '。', '',
    '取得区分性证据前，不能把发现阶段、无效边界或阶段 Skill 名称当成已证明根因。', '');
  lines.push('可保留上游：' + cell(list(report.preservedUpstream).join('、') || '尚未确认')
    + '；保留的是固定产物，不是宣布潜在根因已排除。', '',
    '失效／阻塞：' + cell(list(report.invalidatedDownstream).join('、') || '未定位') + '。', '',
    '**下一最小动作：** ' + cell(report.nextMinimumAction), '',
    '## 9. 机器证明附录', '',
    '阶段 score：' + cell(item.score == null ? '未评价' : item.score + ' / 100') + '；Gate：'
      + cell(item.gate?.verdict || '未记录') + '；checker：' + cell(item.verdict) + '。', '',
    '高分不能覆盖 Hard Fail、Blocking Unknown、缺 Actual、失败测试或证据不足。', '');
  for (const label of ['hardFails', 'blockingUnknowns']) lines.push(label + '：' + cell(compact(item[label] || [])), '');
  lines.push('| 必需测试 | 记录状态 |', '| --- | --- |');
  for (const entry of list(item.requiredTests)) lines.push('| ' + cell(entry.name) + ' | ' + cell(entry.status) + ' |');
  lines.push('', '本阶段 checker 问题：', '');
  for (const error of list(report.errors).filter(entry => entry.stage === stage)) lines.push(
    cell(error.code + '：' + error.message), '');
  const refs = [...list(item.inputs), ...list(item.outputs), ...list(item.evidence),
    ...assertions.flatMap(value => [value.expected?.ref, value.actual?.ref]).filter(Boolean)];
  const seen = new Set();
  for (const ref of refs) {
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    const snapshot = list(view.snapshots).find(entry => (!view.sources || view.sources.get(refKey(ref))?.href)
      && refKey(entry.ref) === refKey(ref)
      && entry.status === 'retained' && entry.actualSha256 === ref.sha256 && safeSnapshot(entry.snapshot));
    lines.push((snapshot ? '[' + cell(ref.kind + ' · ' + ref.path) + '](../' + (view.snapshotPrefix || '') + snapshot.snapshot + ')'
      : cell(ref.kind + ' · ' + ref.path + '（同版快照不可用）')) + ' — ' + cell(ref.sha256), '');
  }
  lines.push('[同次完整机器结论（含全部评分明细）](../checker-result.json)', '');
  return lines.join('\n');
}
function renderWorkflowBundle(report, view = {}) {
  const stages = {};
  for (const stage of reviewedStages(report)) stages[stageFile(stage)] = renderWorkflowStage(report, stage, view);
  return { index: renderWorkflowReview(report, { ...view, bundle: true }), stages };
}

function renderReview(report) {
  const lines = ['# 阶段工件审阅', '',
    '**检查结论：' + cell(report.verdict) + '；截止边界：' + cell(report.through) + '。**', '',
    '这是本次只读检查的派生 View，不是新的权威工件、评分或真实运行资格。',
    '工件中的观察、能力验证和资格均为被检查记录的声明；本工具不确认其历史真实性。',
    '未检查的下游保持 not-run；局部规则通过但上游失败的边界保持 blocked。', '',
    '| 边界／职责 | 本地规则结果 | 依赖检查后的结果 |', '| --- | --- | --- |'];
  for (const [name, status] of Object.entries(report.boundaries)) {
    lines.push('| ' + cell(TITLES[name] || name) + ' | ' + cell(report.localChecks[name]) + ' | ' + cell(status) + ' |');
  }
  lines.push('', '## 关键值追溯（声明，不是真实运行证明）', '',
    '最多展示 100 个值；更多值请查固定 Dossier。空白或 missing 表示没有此层映射，不能推断已完成。', '',
    '| 值／观察声明 | 实际动作来源／消费者 | S7 来源步骤 | S9 业务步骤 | 候选函数／代码区域（声明） | 证据引用 | 资格检查（非实测） |',
    '| --- | --- | --- | --- | --- | --- | --- |');
  for (const item of report.valueLineage || []) lines.push('| ' + [
    item.value + ': ' + item.observedClaim, item.action + ' → ' + item.consumers.join(', '),
    item.distilled.join(', '), item.business.join(', '), item.code.join(', '),
    JSON.stringify(item.evidence), item.qualification,
  ].map(value => cell(String(value).slice(0, 1800) + (String(value).length > 1800 ? '〔已截断〕' : ''))).join(' | ') + ' |');
  lines.push('', '## 资格声明与检查状态', '',
    '资格局部规则：' + cell(report.localChecks.qualification) + '；依赖检查后：' + cell(report.boundaries.qualification) + '。',
    '以下范围来自固定记录的声明，不代表本次运行或请求范围已获独立核验。', '',
    '| 字段 | 记录声明 |', '| --- | --- |');
  const qualification = report.artifacts.find(item => item.name === 'qualification');
  for (const row of qualification?.rows || []) {
    if (['verdict', 'qualificationScope', 'skipped', 'failedCriteria'].some(field => row.field === field || row.field.startsWith(field + '['))) {
      lines.push('| ' + cell(row.field) + ' | ' + cell(row.value) + ' |');
    }
  }
  if (!qualification) lines.push('| — | 未读取资格记录；不得推断通过。 |');
  lines.push('', '## 待 S10 补强（不阻塞已有语义判断，不代表工程通过）', '');
  for (const item of report.pendingEngineering || []) lines.push('- ' + cell(JSON.stringify(item)));
  if (!(report.pendingEngineering || []).length) lines.push('本前缀未记录此类缺口；未检查的工程能力仍不能宣称通过。');
  lines.push('', '## 固定输入与当前成果', '', '| 工件 | 实际路径 | SHA-256 |', '| --- | --- | --- |');
  for (const item of report.artifacts) lines.push('| ' + cell(item.name) + ' | ' + cell(item.path) + ' | ' + cell(item.sha256) + ' |');
  for (const item of report.artifacts) {
    if (!item.rows.length) continue;
    lines.push('', '### ' + cell(item.name) + '：来源、输入输出与记录声明', '', '| 字段 | 内容 |', '| --- | --- |');
    for (const row of item.rows) lines.push('| ' + cell(row.field) + ' | ' + cell(row.value) + ' |');
    if (item.omitted) lines.push('', '视图已截断 ' + item.omitted + ' 条；检查仍覆盖完整输入，请按上表固定版本审阅。');
  }
  lines.push('', '## 失败与返工', '', '| 责任边界 | 位置 | 原因代码 | 说明 |', '| --- | --- | --- | --- |');
  for (const error of report.errors) lines.push('| ' + [error.boundary, error.location, error.code, error.message].map(cell).join(' | ') + ' |');
  if (!report.errors.length) lines.push('| — | — | — | 本次支持范围内未发现规则违反；不代表全部 Stage Contract 或业务通过。 |');
  lines.push('', '## 已检查与尚未证明', '', '范围：' + cell(report.scope), '',
    ...report.proves.map(value => '- ' + cell(value)), '',
    ...report.notEvaluated.map(value => '- 未证明：' + cell(value)), '',
    '**本工具不授予桌面操作权限，不授予真实资格，不自动宣布阶段完成。**', '', cell(report.next), '');
  return lines.join('\n');
}

module.exports = { inputsFor, artifactViews, valueLineage, provenChecks, renderReview, renderWorkflowReview, renderWorkflowStage, renderWorkflowBundle, workflowPresentation };
