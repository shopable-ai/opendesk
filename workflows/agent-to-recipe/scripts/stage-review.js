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
  const outputs = new Set(Object.values(report.stages || {}).flatMap(stage => list(stage?.outputs)).map(refKey));
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
  return { sources, indexHref: prefix + 'snapshot-index.md', checkerHref: prefix + 'checker-result.json' };
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

function renderWorkflowReview(report, view = {}) {
  requireCheck(object(report) && object(report.stages), 'INVALID_WORKFLOW_REVIEW',
    'Workflow review renderer requires a check-workflow-stage report.');
  const stages = Object.keys(STAGE_WORK);
  const passed = stages.filter(stage => report.stages[stage]?.verdict === 'pass');
  const pending = stages.filter(stage => report.stages[stage]?.verdict !== 'pass');
  const finalPassed = report.allowed === true && report.from === 'S12' && report.to === 'S12'
    && report.final?.verdict === 'pass' && passed.length === 12;
  const invalid = report.firstInvalidBoundary || '—';
  const owner = report.failureOwner ? report.failureOwner.stage + ' / ' + report.failureOwner.skill
    : report.firstInvalidBoundary || !report.allowed ? '尚未确定责任' : '本次检查未记录失败责任';
  const lastConfirmed = list(report.preservedUpstream).at(-1) || '—';
  const lines = ['# 自动化脚本工作流｜阶段审阅', '',
    '**' + (finalPassed ? '最终阶段门禁：通过。支持范围与真实运行证据见 S12。'
      : '整条流程验收：尚未完成。') + '**', '',
    '本次检查 ' + cell((report.from || '—') + ' → ' + (report.to || '—')) + '：**'
      + cell(report.allowed ? 'PASS' : 'FAIL') + '**。'
      + (report.allowed && !finalPassed ? '该 PASS 只放行本次阶段边界。' : ''), '',
    '已通过阶段：' + cell(passed.join('、') || '无') + '。'
      + (pending.length ? '尚未通过阶段：' + cell(pending.join('、')) + '。' : ''), '',
    '本页由 check-workflow-stage.js 的固定结果生成；正文摘录仅使用同版产物。'
      + '未纳入本次检查的执行或修复历史须从案例入口另行审阅。', '',
    '阅读顺序：先看阶段的业务问题、输入来源和实际成果正文，再核对独立判断、'
      + '错误与评分。文件存在或高分都不能替代业务证据。', '',
    '维护工作流本身不授予生产、Runtime 或桌面执行权限；原始用户指令、工作包授权'
      + '和当前暂停要求须分别核对。已获准但已停止的后续验证保持未运行，'
      + '静态源码修改保持未执行验证。', '',
    '## 现在该从哪里检查', '',
    '| 问题 | 本次记录 |', '| --- | --- |',
    '| 首个无效边界 | **' + cell(invalid) + '** |',
    '| Failure Owner（修复责任） | ' + cell(owner) + ' |',
    '| 最后确认正确阶段 | ' + cell(lastConfirmed) + ' |',
    '| 可保留上游 | ' + cell(list(report.preservedUpstream).join('、') || '—') + ' |',
    '| 失效／阻塞下游 | ' + cell(list(report.invalidatedDownstream).join('、') || '—') + ' |',
    '| 下一最小动作 | ' + cell(report.nextMinimumAction || '未记录；需补充接续依据。') + ' |'];
  if (report.missedCheckOwner) lines.push('| Missed-check Owner | '
    + cell(report.missedCheckOwner.stage + ' / ' + report.missedCheckOwner.skill + ': '
      + (report.missedCheckOwner.reason || '')) + ' |');
  if (view.indexHref && view.checkerHref) lines.push('',
    '[本次固定文件与完整引用](' + view.indexHref + ') · [机器原始结论](' + view.checkerHref + ')');
  const unavailable = [...(view.sources?.values() || [])].filter(source => source.status !== 'retained');
  if (unavailable.length) lines.push('', '**本视图有 ' + unavailable.length
    + ' 项同版文件或正文不可用。** 查看固定索引；机器历史 PASS 不能替代当前可访问的证据。');
  lines.push('', 'Node 维护工具只检查文件、版本与阶段交接；OpenDesk Runtime 的真实动作、'
    + '读值及独立验收须分别有对应 Execution 证据。');
  lines.push('', '## S1—S12 总览', '',
    '| 阶段与工作 | 当前验收 | 实际交付 |', '| --- | --- | --- |');
  for (const stage of stages) {
    const item = report.stages[stage] || {};
    const verdict = item.verdict || 'not-run';
    const state = { pass: '通过', fail: '失败', blocked: '受阻', 'not-run': '尚未纳入本次验收' }[verdict] || verdict;
    lines.push('| ' + cell(stage + ' ' + STAGE_WORK[stage][0]) + ' | ' + cell(state + '（' + verdict + '）')
      + ' | ' + (list(item.outputs).slice(0, 2).map(ref => workflowRef(ref, view)).join('；') || '尚无本次验收产物') + ' |');
  }
  for (const stage of stages) {
    const item = report.stages[stage] || {};
    const stageErrors = list(report.errors).filter(error => error?.stage === stage);
    lines.push('', '## ' + stage + '｜' + STAGE_WORK[stage][0], '', STAGE_WORK[stage][1], '');
    if ((item.verdict || 'not-run') === 'not-run') {
      lines.push('本次记录为 **not-run**，尚未纳入阶段验收；不能据此否认其他保留的真实执行，也不能写成 PASS。');
      continue;
    }
    lines.push('**责任：** ' + cell(item.owner || '未记录') + '。', '',
      '### 开始前有什么、应交出什么', '');
    const businessInputs = list(item.inputs).filter(ref => ref?.kind !== 'Method');
    for (const ref of businessInputs.slice(0, 5)) lines.push('- 输入：' + workflowRef(ref, view));
    if (!businessInputs.length) lines.push('- 未记录业务输入引用；完整输入见固定索引。');
    if (businessInputs.length > 5) lines.push('- 另有 ' + (businessInputs.length - 5) + ' 项输入，见固定索引。');
    lines.push('- 正式必需成果／证据：' + cell(list(item.expected?.requiredEvidenceKinds).join('、')
      || '本报告未记录；需回到该阶段正式约束核对。'), '', '### 实际成果与业务内容', '');
    for (const ref of list(item.outputs).slice(0, 12)) {
      lines.push('- ' + workflowRef(ref, view));
      const source = view?.sources?.get(refKey(ref));
      const rows = source?.document ? artifactExcerpt(ref, source.document) : [];
      for (const row of rows) lines.push('  - ' + cell(row));
      if (!rows.length) lines.push('  - 本视图未取得可摘录的同版正文；需打开固定产物核对内容。');
    }
    if (!list(item.outputs).length) lines.push('没有本次产物引用；需按下列问题定位缺口。');
    lines.push('', '### 为什么得到这个判断', '',
      '**阶段判断：** ' + cell(item.verdict) + '；Gate=' + cell(item.gate?.verdict || '未记录')
      + '；独立评分=' + cell(item.score == null ? '未评价' : item.score + ' / 100') + '。', '');
    for (const [dimension, detail] of Object.entries(item.scoreEvidence || {})) {
      const reasons = [...new Set(list(detail?.items).map(entry => entry?.reason).filter(Boolean))];
      const dimensionName = { requirements: '需求覆盖', responsibility: '职责与产出',
        continuation: '下游接续', validation: '验证依据', cost: '成本与预算' }[dimension] || dimension;
      lines.push('- ' + cell(dimensionName) + '：' + cell(compact(reasons.join('；') || detail?.reason || '无说明', 900)));
    }
    if (!object(item.scoreEvidence) || !Object.keys(item.scoreEvidence).length) lines.push('未记录独立判断正文；分数不能代替依据。');
    const exceptionalItems = Object.values(item.scoreEvidence || {}).flatMap(detail => list(detail?.items))
      .filter(entry => entry?.score !== 5);
    if (exceptionalItems.length) {
      lines.push('', '未满分或尚未评价的检查项：', '');
      for (const entry of exceptionalItems.slice(0, 20)) lines.push('- ' + cell((entry.id || '?') + ' = '
        + (entry.score == null ? '未评价' : entry.score) + '：' + compact(entry.reason || '无说明')));
    }
    lines.push('', '**生产者：** ' + cell(item.producer || '未记录'), '',
      '**独立审阅者：** ' + cell(item.reviewer || '未记录'), '',
      '**输入充分／产出正确：** ' + cell(item.inputsSufficient ?? '未记录') + ' / '
      + cell(item.actualOutputCorrect ?? '未记录') + '。', '',
      '### 错误、证据缺口与接续', '');
    const hardFails = list(item.hardFails), unknowns = list(item.blockingUnknowns);
    lines.push('**Hard Fail：** ' + (hardFails.length ? '' : '本阶段无记录。'));
    for (const value of hardFails.slice(0, 20)) lines.push('- ' + cell(compact(value)));
    lines.push('', '**Blocking Unknown：** ' + (unknowns.length ? '' : '本阶段无记录。'));
    for (const value of unknowns.slice(0, 20)) lines.push('- ' + cell(compact(value)));
    for (const finding of list(item.findings).slice(0, 20)) {
      lines.push('', '- ' + cell((finding.blocking ? '[blocking] ' : '') + compact(finding.reason || finding)),
        '  - 责任：' + cell(finding.ownerStage || '未确定'),
        '  - 依据：' + (list(finding.evidence).map(ref => workflowRef(ref, view)).join('；') || '未记录'));
    }
    for (const error of stageErrors.slice(0, 40)) lines.push('- **' + cell(error.code || '—') + '**：' + cell(compact(error.message || '')));
    const next = stage === report.firstInvalidBoundary ? report.nextMinimumAction
      : item.verdict === 'pass' ? '保留本阶段固定成果；上游版本改变时重验受影响下游。'
        : item.verdict === 'blocked' ? '等待真正 failure owner 修复；不要在本阶段自行补写上游事实。'
          : '按上述证据修复对应责任，再重验受影响部分。';
    lines.push('', '**怎样继续：** ' + cell(next || '未记录下一动作。'), '',
      '### 必需测试与固定证据', '', '| 必需测试 | 状态 |', '| --- | --- |');
    for (const test of list(item.requiredTests).slice(0, 40)) lines.push('| ' + cell(test.name || '—') + ' | ' + cell(test.status || '—') + ' |');
    if (!list(item.requiredTests).length) lines.push('| 未记录 | 未验证 |');
    lines.push('');
    const evidence = list(item.evidence);
    for (const ref of evidence.slice(0, 8)) lines.push('- ' + workflowRef(ref, view));
    if (evidence.length > 8) lines.push('- 另有 ' + (evidence.length - 8) + ' 条，见本次固定文件索引。');
    lines.push('', '评分明细：' + cell(Object.entries(item.scoreDimensions || {})
      .map(([key, value]) => key + '=' + (value == null ? '未评价' : value)).join('；') || '未记录') + '。');
  }
  const unscoped = list(report.errors).filter(error => !error?.stage);
  if (unscoped.length) {
    lines.push('', '## 全局检查错误', '');
    for (const error of unscoped.slice(0, 40)) lines.push('- **' + cell(error.code || '—') + '**：' + cell(compact(error.message || '')));
  }
  lines.push('', '## 检查身份与证明边界', '',
    '任务：' + cell(report.taskId || '—') + '；计划：' + cell(report.planRevision || '—')
      + '；Attempt：' + cell(report.attemptId || '—') + '。', '',
    '原始检查记录 hash：' + cell(report.recordSha256 || '未记录') + '。', '',
    '以下事项没有被本报告单独证明：', '');
  for (const value of list(report.notEvaluated)) lines.push('- ' + cell(value));
  if (!list(report.notEvaluated).length) lines.push('- 未额外声明。');
  lines.push('', '**高分不能覆盖 Hard Fail、Blocking Unknown、缺 Actual evidence、失败 Gate 或未通过的 required test。**',
    '', '本页不授予桌面动作权限。原始引用、全部评分条目和证据保存在机器记录与固定文件索引中。', '');
  return lines.join('\n');
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

module.exports = { inputsFor, artifactViews, valueLineage, provenChecks, renderReview, renderWorkflowReview, workflowPresentation };
