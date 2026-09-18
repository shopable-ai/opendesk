'use strict';
// 文档读取与局部维修策略的离线回归；不加载 OpenDesk、不操作桌面。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const reader = require('../../scripts/api-docs');
const config = require('../../scripts/api-docs-map');
const root = path.resolve(__dirname, '../..');
const entryPath = 'docs/api/agent/README.md';
const text = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const evidenceDir = path.join(root, '.runtime/tests/api-docs/discovery');

// 业务输入不包含 API 名称。selected 是维护者走查后的断言，不是 Agent 的提示。
const cases = [
  {
    id: 'A-read-desktop-value',
    task: '读取指定桌面窗口当前显示的一个业务值，不改变应用状态。',
    groups: ['targets', 'elements'],
    candidates: [['window', 'window.get'], ['desktop-ui', 'UI.readText'], ['desktop-ui', 'UI.getValue']],
    selected: [['window', 'window.get'], ['desktop-ui', 'UI.readText']],
    reason: '先识别唯一窗口，再比较可见文本与严格原生文本框 value；不为读取而激活、点击或改值。具体 selector、区域和返回值必须来自当前现场。',
  },
  {
    id: 'B-json-save-as',
    task: '读取已有 JSON 配置，校验其中字段，然后另存结果，不覆盖原文件。',
    groups: ['data'],
    candidates: [['file', 'File.readJSON'], ['file', 'File.writeJSON'], ['file', 'File.writeNew']],
    selected: [['file', 'File.readJSON'], ['file', 'File.writeNew']],
    reason: 'JSON 解析不做字段校验；调用方先验证字段并序列化结果。已有父目录内使用独占新建，不以 exists 加 write 模拟另存，不发明 overwrite:false。输入路径或其别名已存在时必须拒绝而不是覆盖。',
  },
  {
    id: 'C-repair-uncertain-input',
    task: '一个输入动作返回结果不确定后，现有代码又自动重试。只修复这一局部，不改变其他业务流程。',
    fixture: 'try { result = await UI.tapTexts(keys, options); } catch (_) { result = await UI.tapTexts(keys, options); }\nawait verifyBusiness(result);',
    groups: ['elements'],
    candidates: [['desktop-ui', 'UI.tapTexts']],
    selected: [['desktop-ui', 'UI.tapTexts'], ['runtime', '#异步完成与取消']],
    reason: '方法名从待修代码中识别，不来自任务或历史案例。保留已完成前缀和原错误；未知副作用/取消后不重放，成功路径仍做原业务验证。',
  },
];

function packet(doc, method) {
  const result = reader.readContract(root, doc, method);
  assert.ok(result.output.trimEnd().endsWith('<!-- END_API_READING_PACKET: only a packet with this marker is complete -->'));
  assert.equal(result.report.modelLoaded, false);
  assert.equal(result.report.desktopExecuted, false);
  assert.equal(result.report.tokenUsage, null);
  assert.ok(!result.report.programReads.some(r => r.path.endsWith('runtime-api.ai.json')));
  return result;
}

function walk(c) {
  assert.doesNotMatch(c.task, /\b(?:UI|File|window|Accessibility)\./);
  const entry = text(entryPath);
  const catalogs = c.groups.map(id => {
    assert.ok(entry.includes(`](${id}.md)`), `入口没有 ${id}`);
    const rel = `docs/api/agent/${id}.md`;
    return {path: rel, content: text(rel)};
  });
  for (const [doc, method] of c.candidates) {
    assert.ok(catalogs.some(catalog => catalog.content.includes(`read ${doc} ${method}`)), `目录没有候选 ${method}`);
  }
  const packets = c.selected.map(([doc, method]) => ({doc, method, ...packet(doc, method)}));
  fs.mkdirSync(evidenceDir, {recursive: true});
  const reports = packets.map((p, index) => {
    fs.writeFileSync(path.join(evidenceDir, `${c.id}-${index}.md`), p.output);
    return {doc: p.doc, method: p.method, ...p.report};
  });
  fs.writeFileSync(path.join(evidenceDir, `${c.id}.json`), JSON.stringify({
    ...c,
    validation: 'document-walk-and-policy-regression; not a hosted Agent or live Runtime session',
    catalogs: catalogs.map(({path: rel, content}) => ({path: rel, ...reader.size(content)})),
    packets: reports,
    tokenUsage: null, modelLoaded: false, desktopExecuted: false,
  }, null, 2) + '\n');
  return packets;
}

test('ten catalogs and short entry are tracked regular repository files', () => {
  const expected = ['README', ...config.groups.map(g => g.id)].map(id => `docs/api/agent/${id}.md`).sort();
  assert.equal(config.groups.length, 10);
  const lines = cp.execFileSync('git', ['ls-files', '--stage', '--', 'docs/api/agent'], {cwd: root, encoding: 'utf8'}).trim().split('\n');
  const tracked = lines.map(line => {
    const m = /^(100644) [0-9a-f]+ 0\t(.+)$/.exec(line);
    assert.ok(m, `不是普通已跟踪文件：${line}`);
    assert.ok(fs.lstatSync(path.join(root, m[2])).isFile());
    return m[2];
  }).sort();
  assert.deepEqual(tracked, expected);
});

test('Agent-to-Recipe consumers use one short API entry with valid links', () => {
  for (const rel of [
    'workflows/agent-to-recipe/WORKFLOW.md',
    'workflows/agent-to-recipe/design/capability-discovery.md',
    'workflows/agent-to-recipe/skills/application-engineer/SKILL.md',
    'workflows/agent-to-recipe/design/code-rebuild.md',
    'docs/frameworks/README.md',
  ]) {
    const content = text(rel);
    const links = [...content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].filter(m => path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])) === entryPath);
    assert.ok(links.length, `${rel} 未直接接入短入口`);
    for (const link of links) assert.deepEqual(reader.checkLinks(root, rel, link[0]), []);
  }
  const discovery = text('workflows/agent-to-recipe/design/capability-discovery.md');
  assert.doesNotMatch(discovery, /源码核验基线为\s+[0-9a-f]{7,40}/);
  for (const rule of ['S1', 'S2', 'S7', 'S8', 'S10', 'S12', '执行时', '实际读值', '跨 Execution', 'ai schema']) assert.ok(discovery.includes(rule), rule);
  for (const rel of [
    'AGENTS.md',
    'docs/api/agent/README.md',
    'docs/api/README.md',
    'docs/api/index.md',
    'docs/api/runtime.md',
    'docs/api/.rules.md',
    'docs/implementation/runtime/runtime-api-development-workflow.md',
    'workflows/agent-to-recipe/WORKFLOW.md',
    'workflows/agent-to-recipe/design/capability-discovery.md',
  ]) {
    assert.doesNotMatch(text(rel), /runtime-api\.ai\.json|\bkeyMethods\b/, `${rel} 不应把旧机器索引暴露给普通 Agent`);
  }
});

test('current consumers and maintenance guidance do not depend on the retired API JSON', () => {
  for (const rel of [
    'README.md',
    'QUICKSTART.md',
    'docs/README.md',
    'docs/api/global-apis.md',
    'docs/architecture/runtime-capability-contract.md',
    'docs/architecture/llm-agent-api-publication.md',
    'docs/implementation/runtime/goja-binding-model.md',
    'docs/implementation/runtime/runtime-api-composition.md',
    'docs/implementation/runtime/runtime-api-development-workflow.md',
    'docs/maintenance/repo-file-lifecycle-policy.md',
    'docs/maintenance/repository-documentation-map.md',
    'docs/project/overview.md',
    'docs/project/runbook.md',
    'tests/README.md',
    'tests/runtime-api/README.md',
    '.prompt/01-path-and-source-context.md',
    'workflows/protected-packages/skills/build-odpkg/references/platform-validation.md',
    'docs/plans/desktop-automation/platform-primitives/00-GOAL.md',
    'docs/plans/desktop-automation/platform-primitives/CODEX-EXECUTION-GOAL.md',
    'docs/plans/desktop-automation/platform-primitives/PLAN-screen-capture-region-selector.md',
    'docs/plans/desktop-automation/platform-primitives/TASK-001-accessibility-api.md',
    'prompts/runtime/native-extension-canonical-install-root-and-authoring-goal.md',
    'prompts/runtime/native-extension-plugin-autodiscovery-goal.md',
    'prompts/runtime/native-process-extension-prototype-goal.md',
    'tests/app-package/app-builder-docs.test.js',
    'tests/runtime-api/unit/native-extension.test.js',
    'tests/extensions/native-plugin/tools/proof-harness/main.py',
  ]) {
    assert.doesNotMatch(text(rel), /runtime-api\.ai\.json|\bpreferredForAI\b/, `${rel} 不应继续依赖或要求维护退役 JSON`);
  }
});

test('normal CI checks repository content, with no catalog blob transit jobs', () => {
  const ci = text('.github/workflows/api-doc-contract.yml');
  assert.match(ci, /contents: read/);
  assert.doesNotMatch(ci, /contents: write/);
  assert.ok(ci.indexOf('node scripts/api-docs.js check') < ci.indexOf('node scripts/api-docs.js generate'));
  assert.equal((ci.match(/node scripts\/api-docs\.js generate/g) || []).length, 2);
  assert.doesNotMatch(ci, /\/git\/blobs/);
  for (const name of fs.readdirSync(path.join(root, '.github/workflows')).filter(n => /\.ya?ml$/.test(n))) {
    assert.doesNotMatch(text(`.github/workflows/${name}`), /prepare-agent-catalog|prepare-final-links|agent-api-catalog-review|verified-inputs\.tar\.gz|Store verified blobs/);
  }
});

test('Case A: read-only window value routes through targets and elements', () => {
  const packets = walk(cases[0]);
  assert.ok(packets[0].output.includes('window.get'));
  assert.ok(packets[1].output.includes('## UI.readText'));
  assert.ok(!packets[1].output.includes('## UI.setValue'));
  assert.ok(!packets.some(p => p.report.programReads.some(r => /docs\/api\/(file|sqlite|ui)\.md$/.test(r.path))));
});

test('Case B: validate JSON fields then save a new file without desktop context', () => {
  const packets = walk(cases[1]);
  assert.match(packets[0].output, /JSON_PARSE_FAILED/);
  assert.match(packets[0].output, /schema 验证/);
  assert.match(packets[1].output, /独占创建/);
  assert.match(packets[1].output, /父目录必须已经存在/);
  assert.match(packets[1].output, /不会截断或替换/);
  for (const p of packets) assert.ok(p.report.programReads.every(r => r.path === 'docs/api/file.md'));
  const alternative = packet('file', 'File.writeJSON');
  assert.match(alternative.output, /最后成功提交覆盖/);
  assert.match(alternative.output, /committed/);
});

test('Case C: source-selected action contract includes partial completion and cancellation', () => {
  const actualMethods = [...cases[2].fixture.matchAll(/await\s+(UI\.[A-Za-z]+)\(/g)].map(m => m[1]);
  assert.deepEqual([...new Set(actualMethods)], [cases[2].selected[0][1]]);
  const packets = walk(cases[2]);
  for (const word of ['completed', 'actionState', 'unknown']) assert.ok(packets[0].output.includes(word), word);
  assert.match(packets[1].output, /取消/);
});

// 只测待修代码的控制流，不模拟/认证原生输入、取消或业务状态。
async function beforeRepair(runAction, verifyBusiness) {
  let result;
  try { result = await runAction(); } catch (_) { result = await runAction(); }
  return verifyBusiness(result);
}
async function afterRepair(runAction, verifyBusiness) {
  const result = await runAction();
  return verifyBusiness(result);
}

test('Case C local repair: one attempt, original partial error preserved, success verification retained', async () => {
  const failure = Object.assign(new Error('fixture: uncertain input'), {actionState: 'unknown', completed: ['first'], code: 'CANCELED'});
  let calls = 0;
  await beforeRepair(async () => { if (++calls === 1) throw failure; return 'second attempt'; }, value => value);
  assert.equal(calls, 2, '反例应暴露盲重放');
  calls = 0;
  let verifications = 0;
  await assert.rejects(afterRepair(async () => { calls++; throw failure; }, () => { verifications++; }), error => error === failure);
  assert.equal(calls, 1);
  assert.equal(verifications, 0);
  assert.deepEqual(failure.completed, ['first']);
  const actual = {receipt: 'fixture-only'};
  const observed = await afterRepair(async () => { calls++; return actual; }, result => { verifications++; assert.equal(result, actual); return 'separate-business-observation'; });
  assert.equal(calls, 2);
  assert.equal(verifications, 1);
  assert.equal(observed, 'separate-business-observation');
});
