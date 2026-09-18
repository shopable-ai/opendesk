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
  'procedure-synthesize': ['ordered DistilledStep-to-BusinessStep mapping', 'capability discovery → method selection → canonical contract → recorded runtime validation linkage'],
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
    candidate: ['scriptRef', 'sourceMapping', 'supportedScope', 'limitations'],
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
  lines.push('', '## 固定输入与当前成果', '', '| 工件 | 实际路径 | SHA-256 |', '| --- | --- | --- |');
  for (const item of report.artifacts) lines.push('| ' + cell(item.name) + ' | ' + cell(item.path) + ' | ' + item.sha256 + ' |');
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

module.exports = { inputsFor, artifactViews, provenChecks, renderReview };
