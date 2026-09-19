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
  candidate: ['selected API contract refs carried into Candidate source mapping', 'Procedure-to-Candidate direct await/spread source pattern'],
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
    const action = String(value.origin || '').match(/\bA\d+\b/)?.[0];
    const actionIds = [action, ...list(value.consumers)];
    const steps = list(doc('distilled').steps).filter(step => object(step)
      && list(step.sourceActionRefs).some(id => actionIds.includes(id)));
    const business = list(doc('procedure').businessSteps).filter(step => object(step)
      && list(step.sourceStepRefs).some(id => steps.some(source => source.stepId === id)));
    const mappings = list(doc('candidate').sourceMapping).filter(mapping => object(mapping)
      && business.some(step => (String(mapping.step || '').match(/\bB\d+\b/g) || []).includes(step.stepId)));
    return { value: value.name, observedClaim: value.observedValue, action: action || 'missing',
      consumers: list(value.consumers), distilled: steps.map(step => step.stepId),
      business: business.map(step => step.stepId), code: mappings.map(mapping => mapping.function),
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
    '| 值／观察声明 | 实际动作来源／消费者 | S7 来源步骤 | S9 业务步骤 | 候选函数 | 证据引用 | 资格检查（非实测） |',
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

module.exports = { inputsFor, artifactViews, valueLineage, provenChecks, renderReview };
