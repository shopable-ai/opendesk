'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { evaluateAdjacent } = require('./tools/adjacent-producer-eval.js');
const { hash } = require('../../workflows/agent-to-recipe/scripts/artifact-validation.js');
const REPO = path.resolve(__dirname, '../..');
const BASE = path.join(REPO, '.runtime/tests/agent-to-recipe/input-sufficiency');
const WORKER = path.join(__dirname, 'tools/input-sufficiency/probe.cjs');
const SCHEMA = 'agent-to-recipe/v1';
const SCOPE = 'sequential-dataflow-v1';
fs.mkdirSync(BASE, { recursive: true });
const clone = value => JSON.parse(JSON.stringify(value));

// Only upstream source material is prepared. No source.json, expected Procedure,
// Candidate or Qualification is read or used to construct a Producer input.
function fixture({ value = 'T-042', type = 'text', merge = false, optional = true, pending = false, profileVersion = 'agent-to-recipe/app-profile/v1.1' } = {}) {
  const root = fs.mkdtempSync(path.join(BASE, 'case-'));
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  const file = name => path.join(source, name);
  const write = (name, obj) => {
    fs.writeFileSync(file(name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) + '\n');
  };
  const ref = (name, kind = 'evidence', schemaVersion = SCHEMA) => ({ kind, rootId: 'source', path: name,
    schemaVersion, sha256: hash(fs.readFileSync(file(name))) });
  const policies = [
    { name: 'ticketCode', meaning: '本次工单的实际编号，不是默认参数', type,
      allowedTransforms: type === 'digit-string' ? ['characters', 'identity'] : ['identity'],
      validity: '仅本次执行及同一业务对象；对象变化后失效', reacquireOnFreshRun: true },
    { name: 'statusText', meaning: '本次查询结果的终点读值', type: 'text', allowedTransforms: ['identity'],
      validity: '仅本次查询结果；刷新后失效', reacquireOnFreshRun: true },
  ];
  const taskId = 'synthetic-ticket-lookup';
  write('contract.json', { schemaVersion: SCHEMA, taskId, goal: '把实际工单编号用于查询，再读取结果；不发送消息或修改订单',
    authority: { desktopActions: false, purpose: '离线合成输入评测' },
    successCriteria: ['编号来自本次实际读取', '查询实际消费编号', '保留最终状态读取'], runtimeValuePolicies: policies });
  write('plan.json', { schemaVersion: SCHEMA, taskId, revision: 'plan-r1' });
  const actions = [
    { actionId: 'read-ticket', kind: 'actual-read', purpose: '读取当前工单编号', inputs: [], outputs: ['ticketCode'],
      data: { value, applicationId: 'support', targetId: 'ticket-label' } },
    { actionId: 'lookup-ticket', kind: 'actual-input', purpose: '用本次编号查询工单', inputs: ['ticketCode'], outputs: [],
      data: { applicationId: 'lookup', targetId: 'lookup-input', bindings: [{ name: 'ticketCode',
        transform: policies[0].allowedTransforms[0], actual: type === 'digit-string' ? [...value] : value }] } },
    { actionId: 'read-status', kind: 'actual-read', purpose: '读取本次查询的终点状态', inputs: [], outputs: ['statusText'],
      mergeWithPrevious: merge, data: { value: '已受理', applicationId: 'lookup', targetId: 'status-label' } },
  ];
  write('actions.json', actions);
  for (const [name, action] of [['ticket', actions[0]], ['status', actions[2]]]) write(name + '-observation.json', {
    schemaVersion: SCHEMA, recordKind: 'observation', taskId, actionRef: action.actionId,
    name: action.outputs[0], ...action.data, sourceNote: '预先构造的合成来源；不是历史或真实桌面证据',
  });
  write('relation.json', { schemaVersion: SCHEMA, recordKind: 'application-relation', taskId,
    from: 'ticket-label', to: 'lookup-input', kind: 'same-record-key', sourceNote: '合成应用关系来源' });
  const profile = { schemaVersion: profileVersion, taskId, revision: 'profile-r1',
    applicationIdentity: { applications: ['support', 'lookup'] }, environmentScope: 'synthetic-only',
    targets: [{ id: 'ticket-label', applicationId: 'support' }, { id: 'lookup-input', applicationId: 'lookup' },
      { id: 'status-label', applicationId: 'lookup' }],
    relations: [{ id: 'same-ticket', from: 'ticket-label', to: 'lookup-input', kind: 'same-record-key', evidenceRefs: [ref('relation.json')] }] };
  write('profile.json', profile);
  if (optional) write('optional-note.txt', '非必需诊断说明，既不是运行时来源，也不是能力选择答案。');
  const dossier = { schemaVersion: SCHEMA, taskId, checkerScope: SCOPE, planRevision: 'plan-r1',
    contractRef: ref('contract.json', 'TaskContract'), workPlanRef: ref('plan.json', 'WorkPlan'),
    actionsRef: ref('actions.json', 'RawTrace'), appProfileRefs: [ref('profile.json', 'AppProfile', profileVersion)],
    sideEffects: { inputState: 'confirmed', sourceNote: '合成回执，不授权任何真实操作' },
    evidenceRefs: optional ? [ref('optional-note.txt', 'evidence', 'text/plain')] : [],
    runtimeValues: policies.map((policy, i) => ({ ...policy, observedValue: i ? '已受理' : value,
      origin: { actionRef: i ? 'read-status' : 'read-ticket', applicationId: i ? 'lookup' : 'support', targetId: i ? 'status-label' : 'ticket-label' },
      evidenceRefs: [ref((i ? 'status' : 'ticket') + '-observation.json')], consumers: i ? ['final output'] : ['lookup-ticket'] })) };
  write('dossier.json', dossier);
  write('api-read.md', '# 合成 API 契约摘录\n方法示意：读取获准目标的文字；不证明实际选型或现场通过。');
  write('api-input.md', '# 合成 API 契约摘录\n方法示意：向获准目标输入本次实际值；结果不明不得重放。');
  write('validation.txt', '合成的局部验证声明，仅供来源对应测试；不是 Runtime 已运行。');
  const selection = { schemaVersion: SCHEMA, recordKind: 'capability-selection', taskId, planRevision: 'plan-r1',
    sourceNote: '由上游合成场景直接构造；没有读取任何下游答案',
    capabilityDecisions: [['read', ['read-ticket', 'read-status']], ['input', ['lookup-ticket']]].map(([kind, refs]) => ({
      decisionId: 'selected-' + kind, sourceActionRefs: refs, capabilityNeed: kind === 'read' ? '取得当前目标文字' : '输入实际业务值',
      discoveryPath: ['docs/api/agent/README.md', '本次合成能力目录'],
      candidates: [{ method: 'synthetic.' + kind, disposition: 'selected', reason: '合成场景中明确记录的决定，不表示真实 API',
        canonicalContractRefs: [ref('api-' + kind + '.md', 'CanonicalAPIContract', 'text/markdown')] }],
      selectedMethod: 'synthetic.' + kind, sharedConstraintRefs: [],
      runtimeValidation: { status: pending ? 'not-run' : 'pass', environmentScope: 'synthetic-only',
        evidenceRefs: pending ? [] : [ref('validation.txt', 'evidence', 'text/plain')] },
      recipeConsumers: ['未来生成者按业务步骤绑定；未生成 JS'], revalidateWhen: ['应用目标、环境或契约变化'] })),
  };
  write('selection-r1.json', selection);
  const request = { dossier: file('dossier.json'), actions: file('actions.json'), roots: [['source', source]],
    sourceSet: 'development', timeoutMs: 5000, maxCalls: 4, checkerScope: SCOPE, s9InputRefs: [ref('selection-r1.json')] };
  let calls = 0;
  const adapter = { mode: 'deterministic-test-double', hostId: 'node-permission-subprocess', modelId: 'none',
    produce: (packet, { signal }) => new Promise((resolve, reject) => {
      const index = ++calls, cwd = path.join(root, 'worker-' + index); fs.mkdirSync(cwd);
      const args = ['--permission', '--allow-fs-read=' + WORKER, WORKER, file('contract.json')];
      const worker = spawn(process.execPath, args, { cwd, env: { LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = Buffer.alloc(0), stderr = '', settled = false;
      const abort = () => worker.kill('SIGKILL');
      signal.addEventListener('abort', abort, { once: true });
      const fail = error => { if (!settled) { settled = true; reject(error); } };
      worker.on('error', fail);
      worker.stdin.on('error', fail);
      worker.stdout.on('data', chunk => {
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > 4 * 1024 * 1024) { abort(); fail(new Error('worker output budget exceeded')); }
      });
      worker.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(0, 8192); });
      worker.on('close', (code, killedBy) => {
        signal.removeEventListener('abort', abort);
        fs.writeFileSync(path.join(root, 'host-call-' + index + '.json'), JSON.stringify({
          stage: packet.stage, command: [process.execPath, ...args], cwd, nodeVersion: process.version,
          workerSha256: hash(fs.readFileSync(WORKER)), packetSha256: hash(Buffer.from(JSON.stringify(packet))),
          outputSha256: hash(stdout), code, killedBy, stderr,
          isolation: 'new process; Node filesystem allowlist; no model; not a complete OS/network sandbox',
        }, null, 2));
        if (code !== 0) return fail(new Error(stderr || 'Worker failed: ' + killedBy));
        if (!settled) { settled = true; resolve(stdout.toString('utf8')); }
      });
      worker.stdin.end(JSON.stringify(packet));
    }) };
  const out = name => path.join(root, name);
  const read = (directory, relative) => JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'));
  const resume = (old, nextRefs = request.s9InputRefs) => ({ ...request, s9InputRefs: nextRefs,
    roots: [...request.roots, ['previous', old]], resumeFrom: { rootId: 'previous', path: 'evaluation.json',
      kind: 'EvaluationRecord', schemaVersion: 'agent-to-recipe-evaluation/v1', sha256: hash(fs.readFileSync(path.join(old, 'evaluation.json'))) } });
  return { root, source, request, adapter, write, ref, file, out, read, resume, selection, dossier, actions, calls: () => calls };
}
function stageError(s, out, stage) { return s.read(out, stage + '/check.json').errors[0]; }

for (const variant of [{}, { value: 'Z-900', profileVersion: SCHEMA }, { value: '40', type: 'digit-string', optional: false }, { merge: true }, { pending: true }]) {
  test('packet-only sequential production accepts legal variation ' + JSON.stringify(variant), async () => {
    const s = fixture(variant), out = s.out('normal');
    const result = await evaluateAdjacent(s.request, out, s.adapter);
    assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
    assert.equal(s.calls(), 2); assert.equal(result.modelBehaviorVerified, false);
    const packet = s.read(out, 'procedure-synthesize/input.json');
    assert.equal(packet.inputs.distilled.sha256, result.attempts[0].outputSha256);
    assert.ok(!packet.files.some(f => ['Dossier', 'RawTrace', 'SemanticProcedure'].includes(f.ref.kind)));
    assert.ok(!packet.files.some(f => /expected|candidate|procedure\.json/.test(f.ref.path)));
    const procedure = s.read(out, 'outputs/procedure.json');
    assert.equal(procedure.runtimeValues[0].observedValue, variant.value || 'T-042');
    assert.equal(procedure.runtimeValues[1].consumerSteps[0], 'final output');
    assert.equal(procedure.runtimeValues[0].consumerBindings[0].transform, variant.type === 'digit-string' ? 'characters' : 'identity');
    for (let i = 1; i <= 2; i++) assert.match(s.read(s.root, 'host-call-' + i + '.json').stderr, /FILESYSTEM_DENIED/);
    if (variant.pending) assert.equal(s.read(out, 'procedure-synthesize/check.json').pendingEngineering.length, 2);
  });
}

test('missing actual selection fails; targeted new record reuses and rechecks S7 without rerunning it', async () => {
  const s = fixture(), first = s.out('missing-selection');
  s.request.s9InputRefs = [s.ref('api-read.md', 'CanonicalAPIContract', 'text/markdown')];
  const a = await evaluateAdjacent(s.request, first, s.adapter);
  assert.deepEqual(a.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'fail' });
  assert.equal(a.nextRequest.owner, 'coordinator'); assert.equal(a.nextRequest.sourceOwner, 'task-demonstrate');
  assert.equal(stageError(s, first, 'procedure-synthesize').code, 'CAPABILITY_SOURCE_MISSING');
  const failed = hash(fs.readFileSync(path.join(first, 'procedure-synthesize/output.raw')));
  s.write('selection-r2.json', { ...s.selection, sourceNote: '定向补交已存在的合成上游选型；不重做任何界面操作' });
  const second = s.out('after-supplement');
  const b = await evaluateAdjacent(s.resume(first, [s.ref('selection-r2.json')]), second, s.adapter);
  assert.deepEqual(b.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(b));
  assert.equal(b.reusedS7.rechecked, true); assert.equal(b.attempts.length, 1);
  assert.equal(b.attempts[0].stage, 'procedure-synthesize'); assert.equal(b.budget.usedCalls, 3); assert.equal(s.calls(), 3);
  assert.equal(b.reusedS7.outputSha256, a.reusableS7.output.sha256);
  assert.equal(hash(fs.readFileSync(path.join(first, 'procedure-synthesize/output.raw'))), failed);
  assert.ok(b.inputVersions.some(ref => ref.path === 'selection-r2.json'));
  await assert.rejects(evaluateAdjacent(s.resume(first), first, s.adapter), /exist/i);
});

test('prepare-only continuation prepares S9 from rechecked S7 with zero additional Producer calls', async () => {
  const s = fixture(), first = s.out('stopped'); s.request.s9InputRefs = [];
  await evaluateAdjacent(s.request, first, s.adapter);
  const second = s.out('prepared');
  const result = await evaluateAdjacent(s.resume(first, [s.ref('selection-r1.json')]), second);
  assert.equal(result.stages['trace-distill'], 'pass'); assert.equal(result.stages['procedure-synthesize'], 'not-run');
  assert.equal(result.attempts.length, 0); assert.equal(s.calls(), 2);
  assert.ok(fs.existsSync(path.join(second, 'procedure-synthesize/input.json')));
});

for (const variant of ['wrong-version', 'missing-evidence', 'unknown-effects', 'unsupported-type', 'bad-upstream-binding']) {
  test('upstream responsibility and checker coverage: ' + variant, async () => {
    const s = fixture(), out = s.out(variant);
    if (variant === 'wrong-version') { s.selection.planRevision = 'other-plan'; s.write('selection-wrong.json', s.selection); s.request.s9InputRefs = [s.ref('selection-wrong.json')]; }
    if (variant === 'missing-evidence') s.dossier.runtimeValues[0].evidenceRefs = [];
    if (variant === 'unknown-effects') s.dossier.sideEffects.inputState = 'unknown';
    if (variant === 'unsupported-type') s.dossier.runtimeValues[0].type = 'money';
    if (variant === 'bad-upstream-binding') {
      s.actions[1].data.bindings[0].actual = 'hardcoded-other-ticket'; s.write('actions.json', s.actions);
      s.dossier.actionsRef = s.ref('actions.json', 'RawTrace');
    }
    s.write('dossier.json', s.dossier);
    const unchanged = hash(fs.readFileSync(s.file('dossier.json')));
    const result = await evaluateAdjacent(s.request, out, s.adapter);
    const stage = variant === 'wrong-version' ? 'procedure-synthesize' : 'trace-distill';
    const code = { 'wrong-version': 'WRONG_VERSION', 'missing-evidence': 'RUNTIME_SOURCE',
      'unknown-effects': 'SIDE_EFFECT_UNKNOWN', 'unsupported-type': 'CHECKER_COVERAGE', 'bad-upstream-binding': 'DATA_RELATION' }[variant];
    assert.equal(result.stages[stage], 'fail', JSON.stringify(result));
    assert.equal(stageError(s, out, stage).code, code);
    assert.equal(result.nextRequest.owner, variant === 'unsupported-type' ? 'validation' : 'task-demonstrate');
    assert.equal(hash(fs.readFileSync(s.file('dossier.json'))), unchanged);
  });
}

for (const defect of ['lost-meaning', 'wrong-consumer', 'lost-terminal', 'forged-selection', 'missing-business-source', 'runtime-default']) {
  test('output semantic rejection retains raw failed output: ' + defect, async () => {
    const s = fixture(), out = s.out(defect), original = s.adapter.produce;
    s.adapter.produce = async (packet, options) => {
      const output = JSON.parse(await original(packet, options));
      if (defect === 'lost-meaning' && packet.stage === 'trace-distill') delete output.runtimeValues[0].meaning;
      if (packet.stage === 'procedure-synthesize') {
        if (defect === 'wrong-consumer') output.runtimeValues[0].consumerSteps = ['final output'];
        if (defect === 'lost-terminal') output.runtimeValues.pop();
        if (defect === 'forged-selection') output.capabilityDecisions[0].selectedMethod = 'invented.method';
        if (defect === 'missing-business-source') output.businessSteps[1].inputSources = [];
        if (defect === 'runtime-default') output.parameters = [{ name: 'ticketCode', default: 'T-042' }];
      }
      return output;
    };
    const result = await evaluateAdjacent(s.request, out, s.adapter);
    const stage = defect === 'lost-meaning' ? 'trace-distill' : 'procedure-synthesize';
    assert.equal(result.stages[stage], 'fail', JSON.stringify(result));
    assert.ok(fs.statSync(path.join(out, stage + '/output.raw')).size > 0);
    if (stage === 'procedure-synthesize') {
      s.adapter.produce = original;
      const restartRequest = s.read(out, 'resume-request.json');
      restartRequest.repairReason = '按失败检查修复 S9 的 ' + defect + '；保留同版 S7 和原始来源。';
      // A new session can continue after the original task workspace disappears.
      if (defect === 'wrong-consumer') fs.renameSync(s.source, s.source + '-retired');
      const repaired = await evaluateAdjacent(restartRequest, s.out('repaired'), s.adapter);
      assert.deepEqual(repaired.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' });
      assert.equal(repaired.attempts.length, 1); assert.equal(repaired.reusedS7.rechecked, true);
    }
  });
}

for (const failure of ['prior-output-changed', 's7-input-changed', 'budget-exhausted', 'supplement-wrong-hash', 'raw-supplement']) {
  test('resume refuses unsafe or stale reuse: ' + failure, async () => {
    const s = fixture(), first = s.out('failed'); s.request.s9InputRefs = [];
    if (failure === 'budget-exhausted') s.request.maxCalls = 2;
    await evaluateAdjacent(s.request, first, s.adapter);
    const request = s.resume(first, [s.ref('selection-r1.json')]);
    if (failure === 'prior-output-changed') fs.appendFileSync(path.join(first, 'outputs/distilled.json'), ' ');
    if (failure === 's7-input-changed') { s.dossier.runtimeValues[0].meaning = 'changed'; s.write('dossier.json', s.dossier); }
    if (failure === 'supplement-wrong-hash') request.s9InputRefs[0].sha256 = '0'.repeat(64);
    if (failure === 'raw-supplement') request.s9InputRefs = [s.ref('actions.json', 'RawTrace')];
    const result = await evaluateAdjacent(request, s.out('refused'), s.adapter);
    assert.equal(s.calls(), 2, JSON.stringify(result));
    assert.ok(result.setupFailure || result.reuseFailure, JSON.stringify(result));
    assert.notEqual(result.stages['procedure-synthesize'], 'pass');
  });
}

test('scoped selection cannot replace a canonical contract with evidence', async () => {
  const s = fixture();
  s.selection.capabilityDecisions[0].candidates[0].canonicalContractRefs = [s.ref('validation.txt', 'evidence', 'text/plain')];
  s.write('bad-contract-role.json', s.selection); s.request.s9InputRefs = [s.ref('bad-contract-role.json')];
  const out = s.out('bad-contract-role');
  const result = await evaluateAdjacent(s.request, out, s.adapter);
  assert.equal(result.stages['procedure-synthesize'], 'fail');
  assert.equal(stageError(s, out, 'procedure-synthesize').code, 'CAPABILITY_SOURCE');
});


// 2026-09-21 continuation audit: exercise source identity, complete consumers,
// legal many-action merges and immutable failure history through the real runner.
function saveSourceChanges(s) {
  s.write('actions.json', s.actions);
  s.dossier.actionsRef = s.ref('actions.json', 'RawTrace');
  s.write('dossier.json', s.dossier);
  s.write('selection-r1.json', s.selection);
  s.request.s9InputRefs = [s.ref('selection-r1.json')];
}
function addConsumer(s, { recorded = true, merge = false, transform = 'identity' } = {}) {
  const second = clone(s.actions[1]);
  second.actionId = 'lookup-again'; second.purpose = '在同一授权查询目标再次消费当前编号';
  second.mergeWithPrevious = merge;
  second.data.bindings[0] = { name: 'ticketCode', transform,
    actual: transform === 'characters' ? [...s.dossier.runtimeValues[0].observedValue] : s.dossier.runtimeValues[0].observedValue };
  s.actions.splice(2, 0, second);
  if (recorded) s.dossier.runtimeValues[0].consumers.push(second.actionId);
  s.selection.capabilityDecisions[1].sourceActionRefs.push(second.actionId);
  saveSourceChanges(s);
}

for (const defect of ['read-target', 'read-application', 'consumer-application', 'omitted-consumer', 'undeclared-input']) {
  test('source identity and all actual consumers are checked before S9: ' + defect, async () => {
    const s = fixture(), out = s.out('source-' + defect);
    if (defect === 'read-target') s.actions[0].data.targetId = 'unrelated-target';
    if (defect === 'read-application') s.actions[0].data.applicationId = 'unrelated-app';
    if (defect === 'consumer-application') s.actions[1].data.applicationId = 'unrelated-app';
    if (defect === 'omitted-consumer') addConsumer(s, { recorded: false });
    if (defect === 'undeclared-input') s.actions[1].inputs.push('unobserved-runtime-value');
    saveSourceChanges(s);
    const result = await evaluateAdjacent(s.request, out, s.adapter);
    assert.equal(result.stages['trace-distill'], 'fail', JSON.stringify(result));
    assert.equal(result.stages['procedure-synthesize'], 'not-run');
    assert.equal(s.calls(), 1);
    assert.equal(result.nextRequest.owner, 'task-demonstrate');
    assert.equal(stageError(s, out, 'trace-distill').code,
      defect.startsWith('read-') ? 'OBSERVATION_MISMATCH' : defect === 'consumer-application' ? 'APPLICATION_SOURCE' : 'DATA_RELATION');
  });
}

test('legal merge retains two actual consumption transforms in the same business step', async () => {
  const s = fixture({ value: '0040', type: 'digit-string', optional: false });
  addConsumer(s, { merge: true, transform: 'identity' });
  const out = s.out('merged-consumers');
  const result = await evaluateAdjacent(s.request, out, s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
  const procedure = s.read(out, 'outputs/procedure.json');
  assert.equal(procedure.businessSteps.length, 3);
  assert.deepEqual(procedure.dataDependencies.map(edge => edge.transform), ['characters', 'identity']);
  assert.deepEqual(procedure.runtimeValues[0].consumerBindings.map(b => b.observedInput), [['0', '0', '4', '0'], '0040']);
  assert.ok(procedure.dataDependencies.every(edge => edge.consumer === 'business-1'));
  assert.equal(procedure.runtimeValues[1].consumerSteps[0], 'final output');
});

for (const defect of ['conflicting-input-source', 'lost-business-consumer']) {
  test('S9 rejects contradictory business declarations and repairs only S9: ' + defect, async () => {
    const s = fixture(), original = s.adapter.produce, first = s.out(defect);
    s.adapter.produce = async (packet, options) => {
      const output = JSON.parse(await original(packet, options));
      if (packet.stage === 'procedure-synthesize') {
        if (defect === 'conflicting-input-source') output.businessSteps[1].inputSources.push({ name: 'ticketCode', kind: 'expected', value: 'T-042' });
        else output.businessSteps[0].consumers = [];
      }
      return output;
    };
    const failed = await evaluateAdjacent(s.request, first, s.adapter);
    assert.deepEqual(failed.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'fail' });
    assert.equal(failed.nextRequest.owner, 'procedure-synthesize');
    assert.equal(stageError(s, first, 'procedure-synthesize').code, 'DATA_RELATION');
    const rawHash = hash(fs.readFileSync(path.join(first, 'procedure-synthesize/output.raw')));
    s.adapter.produce = original;
    const second = s.out('repaired-' + defect);
    const repaired = await evaluateAdjacent({ ...s.read(first, 'resume-request.json'),
      repairReason: '修正 S9 的 ' + defect + '，不改变原事实、方法或 S7。' }, second, s.adapter);
    assert.deepEqual(repaired.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' });
    assert.equal(repaired.reusedS7.rechecked, true);
    assert.equal(repaired.budget.usedCalls, 3); assert.equal(repaired.attempts.length, 1);
    assert.equal(hash(fs.readFileSync(path.join(first, 'procedure-synthesize/output.raw'))), rawHash);
  });
}

for (const item of ['procedure-synthesize/output.raw', 'procedure-synthesize/input.json', 'procedure-synthesize/check.json']) {
  test('resume rejects changed S9 failure evidence before any new invocation: ' + item, async () => {
    const s = fixture(), first = s.out('failed-history'); s.request.s9InputRefs = [];
    const failed = await evaluateAdjacent(s.request, first, s.adapter);
    assert.equal(failed.stages['procedure-synthesize'], 'fail');
    fs.appendFileSync(path.join(first, item), ' ');
    const resumed = await evaluateAdjacent(s.resume(first, [s.ref('selection-r1.json')]), s.out('refuse-history'), s.adapter);
    assert.equal(s.calls(), 2, JSON.stringify(resumed));
    assert.equal(resumed.setupFailure?.code, 'EVAL_RESUME_CHANGED', JSON.stringify(resumed));
    assert.equal(resumed.budget.usedCalls, 2, 'Refused reuse must still account for the pinned prior calls.');
    assert.notEqual(resumed.stages['procedure-synthesize'], 'pass');
  });
}


// 2026-09-22: real evaluator replicas keep method mutation tests out of the
// shared repository. The worker still derives its outputs from the packet only.
function evaluatorReplica(s) {
  const repo = path.join(s.root, 'evaluator-source');
  const paths = [
    'tests/workflows/tools/adjacent-producer-eval.js',
    'tests/workflows/tools/input-sufficiency/check.js',
    'workflows/agent-to-recipe/scripts/artifact-validation.js',
    'workflows/agent-to-recipe/scripts/check-artifact-chain.js',
    'workflows/agent-to-recipe/scripts/stage-review.js',
    'docs/frameworks/agent-to-recipe-skill-contract.md',
    ...['trace-distill', 'procedure-synthesize'].flatMap(stage =>
      ['SKILL.md', 'references/io-spec.md'].map(file => 'workflows/agent-to-recipe/skills/' + stage + '/' + file)),
  ];
  for (const relative of paths) {
    const target = path.join(repo, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO, relative), target);
  }
  return { run: require(path.join(repo, paths[0])).evaluateAdjacent,
    out: name => path.join(repo, '.runtime', name), file: relative => path.join(repo, relative) };
}
const methodPath = stage => 'workflows/agent-to-recipe/skills/' + stage + '/SKILL.md';
const specPath = stage => 'workflows/agent-to-recipe/skills/' + stage + '/references/io-spec.md';

test('both actual Producer packets receive and bind their required io-spec bytes', async () => {
  const s = fixture(), out = s.out('spec-packets'), original = s.adapter.produce;
  s.adapter.produce = async (packet, options) => {
    assert.equal(packet.ioSpec.path, specPath(packet.stage));
    assert.equal(packet.ioSpec.content, fs.readFileSync(path.join(REPO, packet.ioSpec.path), 'utf8'));
    assert.equal(packet.ioSpec.sha256, hash(Buffer.from(packet.ioSpec.content)));
    return original(packet, options);
  };
  const result = await evaluateAdjacent(s.request, out, s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
  for (const attempt of result.attempts) {
    const packet = s.read(out, attempt.stage + '/input.json');
    assert.equal(attempt.ioSpecSha256, packet.ioSpec.sha256);
    assert.equal(result.ioSpecVersions[attempt.stage], packet.ioSpec.sha256);
    assert.equal(hash(fs.readFileSync(path.join(out, 'methods', packet.ioSpec.path))), packet.ioSpec.sha256);
  }
  assert.deepEqual(s.read(out, 'outputs/procedure.json').businessSteps[1].consumers, [],
    'A step with no business output may have an empty consumer set.');
});

for (const stage of ['trace-distill', 'procedure-synthesize']) {
  test('missing required io-spec rejects before any Producer: ' + stage, async () => {
    const s = fixture(), e = evaluatorReplica(s);
    fs.unlinkSync(e.file(specPath(stage)));
    const result = await e.run(s.request, e.out('missing-spec'), s.adapter);
    assert.equal(result.setupFailure?.code, 'EVAL_SPEC_MISSING', JSON.stringify(result));
    assert.equal(result.nextRequest.owner, 'coordinator');
    assert.equal(s.calls(), 0); assert.equal(result.budget.usedCalls, 0);
  });
}

for (const dependency of [methodPath('trace-distill'), specPath('trace-distill'), 'docs/frameworks/agent-to-recipe-skill-contract.md']) {
  test('resume invalidates S7 when its consumed dependency changes: ' + dependency, async () => {
    const s = fixture(), e = evaluatorReplica(s), first = e.out('failed'); s.request.s9InputRefs = [];
    await e.run(s.request, first, s.adapter);
    fs.appendFileSync(e.file(dependency), '\nS7 dependency revision for this isolated test.\n');
    const result = await e.run(s.resume(first, [s.ref('selection-r1.json')]), e.out('stale'), s.adapter);
    assert.equal(result.reuseFailure?.code, 'EVAL_REUSE_MISMATCH', JSON.stringify(result));
    assert.equal(result.nextRequest.owner, 'trace-distill'); assert.equal(s.calls(), 2);
    assert.equal(result.budget.usedCalls, 2);
  });
}

for (const dependency of [methodPath('procedure-synthesize'), specPath('procedure-synthesize')]) {
  test('S9-only method revision rechecks and retains S7, then consumes new bytes: ' + dependency, async () => {
    const s = fixture(), e = evaluatorReplica(s), first = e.out('failed'), original = s.adapter.produce;
    s.adapter.produce = async (packet, options) => {
      const output = JSON.parse(await original(packet, options));
      if (packet.stage === 'procedure-synthesize') output.businessSteps[1].inputSources = [];
      return output;
    };
    const before = await e.run(s.request, first, s.adapter);
    s.adapter.produce = original;
    fs.appendFileSync(e.file(dependency), '\nS9-only review clarification for this isolated test.\n');
    const second = e.out('repaired');
    const result = await e.run(s.resume(first), second, s.adapter);
    assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
    assert.equal(result.reusedS7.outputSha256, before.reusableS7.output.sha256);
    assert.equal(result.reusedS7.rechecked, true); assert.equal(result.attempts.length, 1);
    assert.equal(s.calls(), 3); assert.equal(result.budget.usedCalls, 3);
    const packet = s.read(second, 'procedure-synthesize/input.json');
    const delivered = dependency.endsWith('SKILL.md') ? packet.method : packet.ioSpec;
    assert.equal(delivered.sha256, hash(fs.readFileSync(e.file(dependency))));
    assert.match(delivered.content, /S9-only review clarification/);
    assert.deepEqual(result.resumeDecision.s9ChangedDependencies, [dependency.endsWith('SKILL.md') ? 'method' : 'ioSpec']);
  });
}

for (const dependency of [methodPath('trace-distill'), specPath('trace-distill')]) {
  test('mutating frozen method/spec during a Producer call is rejected: ' + dependency, async () => {
    const s = fixture(), e = evaluatorReplica(s), out = e.out('tampered'), original = s.adapter.produce;
    s.adapter.produce = async (packet, options) => {
      const result = await original(packet, options);
      fs.appendFileSync(path.join(out, 'methods', dependency), 'tampered');
      return result;
    };
    const result = await e.run(s.request, out, s.adapter);
    assert.equal(result.attempts[0].error?.code, 'EVAL_INPUT_CHANGED', JSON.stringify(result));
    assert.equal(s.calls(), 1); assert.equal(result.stages['procedure-synthesize'], 'not-run');
  });
}

test('unchanged failed S9 cannot consume another call without a repair disposition', async () => {
  const s = fixture(), first = s.out('no-selection'); s.request.s9InputRefs = [];
  await evaluateAdjacent(s.request, first, s.adapter);
  const result = await evaluateAdjacent(s.resume(first), s.out('no-repair'), s.adapter);
  assert.equal(result.setupFailure?.code, 'EVAL_NO_REPAIR', JSON.stringify(result));
  assert.equal(s.calls(), 2); assert.equal(result.budget.usedCalls, 2);
  assert.equal(result.reusedS7.rechecked, true);
});

test('explicit S9 repair receives the pinned failed output/check without hidden history', async () => {
  const s = fixture(), first = s.out('wrong-role'), original = s.adapter.produce;
  s.adapter.produce = async (packet, options) => {
    const output = JSON.parse(await original(packet, options));
    if (packet.stage === 'procedure-synthesize') output.businessSteps[1].inputSources.push({ name: 'ticketCode', kind: 'expected', value: 'T-042' });
    return output;
  };
  await evaluateAdjacent(s.request, first, s.adapter);
  const request = s.resume(first); request.repairReason = '删除错误 Expected 声明，按同版 S7 的实际来源恢复运行时绑定。';
  s.adapter.produce = async (packet, options) => {
    assert.equal(packet.repair.reason, request.repairReason);
    assert.equal(hash(Buffer.from(packet.repair.previousOutput.content)), packet.repair.previousOutput.sha256);
    assert.equal(packet.repair.previousCheck.verdict, 'fail');
    assert.ok(!packet.files.some(item => ['Dossier', 'RawTrace'].includes(item.ref.kind)));
    return original(packet, options);
  };
  const result = await evaluateAdjacent(request, s.out('fixed-role'), s.adapter);
  assert.deepEqual(result.stages, { 'trace-distill': 'pass', 'procedure-synthesize': 'pass' }, JSON.stringify(result));
  assert.equal(result.budget.usedCalls, 3); assert.equal(result.attempts.length, 1);
});

test('resume verifies predecessor frozen spec files as well as packets and outputs', async () => {
  const s = fixture(), first = s.out('failed-spec-history'); s.request.s9InputRefs = [];
  await evaluateAdjacent(s.request, first, s.adapter);
  fs.appendFileSync(path.join(first, 'methods', specPath('procedure-synthesize')), 'tampered');
  const result = await evaluateAdjacent(s.resume(first, [s.ref('selection-r1.json')]), s.out('refuse-spec-history'), s.adapter);
  assert.equal(result.setupFailure?.code, 'EVAL_RESUME_CHANGED', JSON.stringify(result));
  assert.equal(s.calls(), 2); assert.equal(result.budget.usedCalls, 2);
});


test('a refused continuation cannot launder an outstanding failure into an unchanged retry', async () => {
  const s = fixture(), first = s.out('unrepaired-origin'); s.request.s9InputRefs = [];
  await evaluateAdjacent(s.request, first, s.adapter);
  const second = s.out('first-refusal');
  const a = await evaluateAdjacent(s.resume(first), second, s.adapter);
  const b = await evaluateAdjacent(s.read(second, 'resume-request.json'), s.out('second-refusal'), s.adapter);
  assert.equal(a.setupFailure.code, 'EVAL_NO_REPAIR');
  assert.equal(b.setupFailure.code, 'EVAL_NO_REPAIR');
  assert.equal(s.calls(), 2); assert.equal(b.budget.usedCalls, 2);
  assert.equal(a.resumeEvidence.failure.origin.evaluationSha256, b.resumeEvidence.failure.origin.evaluationSha256);
  assert.equal(a.resumeEvidence.failure.raw.sha256, b.resumeEvidence.failure.raw.sha256);
});
