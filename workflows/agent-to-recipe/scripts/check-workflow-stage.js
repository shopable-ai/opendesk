#!/usr/bin/env node
'use strict';

// Exit/transition check over explicit, version-bound stage reviews.
// Reviews and evidence are declarations: this tool cannot witness a desktop run,
// establish an unrecorded read did not occur, or award a business score itself.
const {
  JSON_LIMIT, FILE_LIMIT, hash, object, text, own, CheckError, requireCheck,
  makeRoots, entryFile, resolveFile, readBytes, parseJson, parseDocument,
} = require('./artifact-validation.js');
const { isDeepStrictEqual } = require('node:util');
const path = require('node:path');
const { renderWorkflowReview, renderWorkflowBundle, workflowPresentation } = require('./stage-review.js');
const fs = require('node:fs');
const retainedChecks = new WeakMap();
const CONSUMER_VERIFIER = path.resolve(__dirname, '../../../tests/workflows/tools/calculator-consumer-dataflow.cjs');

const STAGES = Object.freeze(Array.from({ length: 12 }, (_, i) => 'S' + (i + 1)));
const WEIGHTS = Object.freeze({ requirements: 25, responsibility: 20, continuation: 20,
  validation: 20, cost: 15 });
const OWNERS = Object.freeze({ S1: 'automation-plan', S2: 'application-engineer',
  S3: 'task-demonstrate', S4: 'task-demonstrate', S5: 'task-demonstrate',
  S6: 'task-demonstrate', S7: 'trace-distill', S8: 'procedure-synthesize',
  S9: 'procedure-synthesize', S10: 'application-engineer', S11: 'recipe-build',
  S12: 'recipe-qualify' });
const REF_FIELDS = ['rootId', 'path', 'sha256', 'kind', 'schemaVersion'];
const REQUIRED_DEPENDENCIES = Object.freeze({ S1: [], S2: ['S1'], S3: ['S2'],
  S4: ['S3'], S5: ['S4'], S6: ['S5'], S7: ['S6'], S8: ['S7'],
  S9: ['S8'], S10: ['S9'], S11: ['S10'], S12: ['S11'] });
const ALIGNMENT_ASPECTS = Object.freeze(['behavior', 'runtimeDataFlow', 'apiSemantics',
  'failureSafety', 'engineering', 'applicability']);
const SCORE_ITEMS = Object.freeze(Object.fromEntries(Object.entries(WEIGHTS).flatMap(([dimension, weight], index) =>
  Array.from({ length: weight / 5 }, (_, item) => [String.fromCharCode(65 + index) + (item + 1), dimension]))));
// These roles identify self-describing JSON artifacts. Opaque screenshots,
// scripts, canonical Markdown and text evidence have no JSON schema to inspect.
const JSON_ARTIFACT_KINDS = new Set(['AppProfile', 'TaskContract', 'WorkPlan',
  'Dossier', 'DemonstrationDossier', 'RawTrace', 'DistilledSteps',
  'BusinessSteps', 'SemanticProcedure', 'CandidateManifest',
  'QualificationRecord', 'QualificationRequest']);
const TEXT_ARTIFACT_KINDS = new Set(['ActualExecution', 'ActualObservation', 'FreshRun',
  'live-action-trace', 'actual-first-read', 'independent-fresh-run', 'CandidateSource',
  'ReferenceAnswer', 'Acceptance', 'StageReview', 'ValidationReport']);
const LIVE_EVIDENCE_KINDS = new Set(['ActualExecution', 'ActualObservation', 'FreshRun',
  'live-action-trace', 'actual-first-read', 'independent-fresh-run']);
const identity = ref => object(ref) ? REF_FIELDS.map(field => ref[field]).join('\0') : '';
const byteIdentity = ref => object(ref) ? ['rootId', 'path', 'sha256', 'schemaVersion']
  .map(field => ref[field]).join('\0') : '';
const readCache = new WeakMap();

function checkWorkflowStage(options = {}) {
  const errors = [];
  const stages = Object.fromEntries(STAGES.map(stage => [stage, { verdict: 'not-run', score: null, owner: OWNERS[stage] }]));
  const budget = { bytes: 0 };
  const retained = new Map();
  budget.retained = retained;
  const execution = { verifyConsumer: options.verifyConsumer, calls: 0 };
  let record, roots, acceptance, routing, recordSha256 = null;
  let requiredStages = [];
  const fail = (stage, code, message) => errors.push({ stage, code, message });
  const attempt = (stage, code, fn) => {
    try { return fn(); }
    catch (error) { fail(stage, error instanceof CheckError ? error.code : code,
      error instanceof CheckError ? error.message : 'Could not validate the required input.'); }
  };
  roots = attempt(null, 'ROOTS', () => makeRoots(options.roots));
  if (roots) record = attempt(null, 'RECORD', () => {
    const bytes = readBytes(entryFile(roots, options.record), JSON_LIMIT, budget);
    recordSha256 = hash(bytes);
    return parseDocument(bytes);
  });
  const fromIndex = STAGES.indexOf(options.from);
  const toIndex = STAGES.indexOf(options.to);
  if (fromIndex < 0 || toIndex < 0) fail(null, 'STAGE_REQUIRED', 'Specify --from and --to as S1..S12.');
  if (options.final === true && (options.from !== 'S12' || options.to !== 'S12')) {
    fail(null, 'INVALID_FINAL_TRANSITION', 'Final check only accepts --from S12 --to S12 --final.');
  }
  else if (toIndex <= fromIndex && !(options.final === true && options.from === 'S12' && options.to === 'S12')) {
    fail(options.from, 'ILLEGAL_TRANSITION', 'Normal entry must move forward; use the actual gap as the repair boundary.');
  }
  if (record) {
    if (!text(record.taskId) || !text(record.attemptId) || !text(record.planRevision)
      || !Array.isArray(record.stages) || record.stages.length > 48) {
      fail(null, 'RECORD_IDENTITY', 'A bounded record needs taskId, attemptId, planRevision and stages.');
    } else {
      const accepted = readRef(record.acceptanceRef, roots, budget, null, fail);
      if (accepted) {
        try { acceptance = parseDocument(accepted); }
        catch { fail(null, 'INVALID_ACCEPTANCE', 'S1-frozen acceptance must be a JSON document.'); }
      }
      if (Array.isArray(acceptance?.stages)) acceptance.stages = Object.fromEntries(
        acceptance.stages.filter(item => object(item) && STAGES.includes(item.stage))
          .map(item => [item.stage, item]));
      if (!acceptance || acceptance.taskId !== record.taskId || !object(acceptance.stages)
        || STAGES.some(stage => !object(acceptance.stages[stage])
          || !Array.isArray(acceptance.stages[stage].requiredTests)
          || !acceptance.stages[stage].requiredTests.length
          || !Array.isArray(acceptance.stages[stage].requiredEvidenceKinds)
          || !acceptance.stages[stage].requiredEvidenceKinds.length)) {
        fail(null, 'ACCEPTANCE_REQUIRED', 'S1 must freeze test names and evidence roles for all twelve stages.');
      }
      routing = validateRouting(acceptance?.routing, record, options, fail);
      requiredStages = routing && toIndex >= 0
        ? STAGES.filter(stage => dependencyClosure(options.to, routing.dependencies).has(stage)
          || stage === options.from || options.final === true && stage === 'S12') : [];
      const seen = new Set();
      // The record is the active selection of reviews; old attempts remain
      // historical evidence elsewhere. Checking only this prefix avoids
      // reading future Candidate/Qualification bytes during production.
      const through = options.final === true && options.from === 'S12' && options.to === 'S12'
        ? 11 : routing && options.final !== true ? toIndex - 1 : fromIndex;
      for (const review of record.stages.slice(0, through + 1)) {
        const stage = review?.stage;
        const index = STAGES.indexOf(stage);
        if (index < 0 || !object(review)) { fail(null, 'INVALID_STAGE', 'Each review must name one S1..S12 stage.'); continue; }
        if (seen.has(stage) || index !== seen.size) {
          fail(stage, 'REVIEW_ORDER', 'Active reviews must select exactly one review per stage in S1..S12 order.');
          break; // Do not inspect a future output after a malformed prefix.
        }
        seen.add(stage);
        let reviewed;
        try { reviewed = evaluateReview(review, record, acceptance, roots, budget, fail, execution); }
        catch {
          fail(stage, 'INVALID_REVIEW_STRUCTURE', 'Malformed stage review cannot pass the bounded stage check.');
          reviewed = { verdict: 'fail', score: null, outputs: [], owner: OWNERS[stage] };
        }
        stages[stage] = reviewed;
        for (const dependency of routing?.dependencies[stage] || REQUIRED_DEPENDENCIES[stage]) {
          const precursor = stages[dependency];
          if (precursor.verdict !== 'pass') {
            fail(stage, 'UPSTREAM_NOT_PASS', 'Required dependency has not independently passed: ' + dependency);
            reviewed.verdict = 'blocked';
          } else if (!Array.isArray(review.inputs)
            || !precursor.outputs.every(ref => review.inputs.some(input => identity(input) === identity(ref)))) {
            fail(stage, 'STALE_UPSTREAM', 'The stage must consume exact current dependency outputs: ' + dependency);
            reviewed.verdict = 'blocked';
          }
        }
        const member = routing?.selectedPackage?.members.find(item => item.stage === stage);
        if (member && reviewed.verdict === 'pass'
          && !validatePackageMember(member, review, record, roots, budget, fail, execution)) reviewed.verdict = 'fail';
        if (stage === 'S12' && stages.S11.verdict === 'pass') {
          if (review.reviewer === record.stages.find(item => item.stage === 'S11')?.producer) {
            fail(stage, 'QUALIFICATION_INDEPENDENCE', 'The Candidate producer cannot independently qualify that Candidate.');
            reviewed.verdict = 'fail';
          }
          for (const ref of [...(stages.S11.candidate || []), ...(stages.S11.dependencies || [])]) {
            if (!review.inputs?.some(input => identity(input) === identity(ref))) {
              fail(stage, 'STALE_CANDIDATE', 'S12 must bind the exact frozen Candidate source, manifest and dependencies.');
              reviewed.verdict = 'blocked';
            }
          }
        }
        // A downstream discovery cannot repair upstream meaning in place. It
        // invalidates the named original owner and all consumers of its output.
        for (const finding of reviewed.findings || []) if (finding?.blocking
          && STAGES.includes(finding.firstInvalidBoundary)
          && STAGES.indexOf(finding.firstInvalidBoundary) <= index) {
          stages[finding.firstInvalidBoundary].verdict = 'fail';
          for (let at = STAGES.indexOf(finding.firstInvalidBoundary) + 1; at <= index; at += 1) {
            stages[STAGES[at]].verdict = 'blocked';
          }
        }
      }
      if (record.stages.length > 12) fail(null, 'ACTIVE_REVIEW_LIMIT', 'Keep one active review per stage; archive historical attempts separately.');
    }
  }
  if (fromIndex >= 0) {
    for (const stage of new Set([...STAGES.slice(0, fromIndex + 1), ...requiredStages])) {
      if (stages[stage].verdict !== 'pass') {
        fail(stage, 'STAGE_NOT_PASS', 'Every required responsibility must independently pass before entry.');
      }
    }
  }
  let final = null;
  if (options.final === true && record && options.from === 'S12' && options.to === 'S12') {
    const beforeFinal = errors.length;
    try { final = evaluateFinal(record.final, stages, roots, budget, fail); }
    catch {
      fail('S12', 'INVALID_FINAL_STRUCTURE', 'Malformed final evaluation cannot pass.');
      final = { verdict: 'fail' };
    }
    if (errors.length > beforeFinal) {
      const findings = record.final?.findings || [];
      if (Array.isArray(findings)) for (const finding of findings) if (finding?.blocking) {
        const normalized = bindFinding(finding, 'S12', record, roots, budget,
          (code, message) => fail('S12', code, message));
        if (!normalized) continue;
        stages.S12.findings = [...(stages.S12.findings || []), normalized];
        const boundaryIndex = STAGES.indexOf(normalized.firstInvalidBoundary);
        stages[normalized.firstInvalidBoundary].verdict = 'fail';
        for (let at = boundaryIndex + 1; at <= 11; at += 1) stages[STAGES[at]].verdict = 'blocked';
      }
      if (stages.S12.verdict === 'pass') stages.S12.verdict = 'fail';
    }
    if (STAGES.some(stage => stages[stage].verdict !== 'pass')) fail(null, 'INCOMPLETE_STAGES', 'Final completion requires S1..S12 independent PASS.');
  }
  const firstError = errors.find(item => item.stage && STAGES.includes(item.stage)
    && !['UPSTREAM_NOT_PASS', 'STAGE_NOT_PASS'].includes(item.code));
  const firstInvalidBoundary = STAGES.find(stage => stages[stage].verdict === 'fail' || stages[stage].verdict === 'blocked')
    || (record && Array.isArray(record.stages) && text(record.taskId) && text(record.attemptId)
      ? errors.find(item => item.code === 'STAGE_NOT_PASS')?.stage
        || (firstError && stages[firstError.stage]?.verdict !== 'pass' ? firstError.stage : null) : null);
  const firstIndex = STAGES.indexOf(firstInvalidBoundary);
  // Attribution is not an alias for the first failed boundary. Old ownerStage
  // declarations remain hypotheses unless the SAME checker has a discriminating
  // input/output comparison. This proves repair responsibility, not a live cause.
  const selectedFinding = STAGES.flatMap(stage => (stages[stage].findings || []))
    .find(finding => finding.firstInvalidBoundary === firstInvalidBoundary);
  const failureDiscoveryStage = selectedFinding?.discoveryStage || firstError?.stage || null;
  const mismatch = stages[firstInvalidBoundary]?.businessReview?.assertions
    ?.find(item => item.status === 'FAIL' && item.ownerProof);
  const otherBlockingIssues = errors.filter(error => error.stage === firstInvalidBoundary
    && !['BUSINESS_MISMATCH', 'STAGE_NOT_PASS'].includes(error.code));
  const failureOwner = firstInvalidBoundary ? mismatch && !selectedFinding && !otherBlockingIssues.length
    ? { status: 'ESTABLISHED', stage: firstInvalidBoundary, skill: OWNERS[firstInvalidBoundary],
      basis: mismatch.ownerProof, scope: 'fixed-output repair responsibility; not a witnessed runtime root cause' }
    : { status: 'UNKNOWN', stage: null, skill: null,
      candidates: [...new Set([record?.failureOwnerStage, ...(selectedFinding?.candidateOwners || []),
        ...(stages[firstInvalidBoundary]?.businessReview?.candidateOwners || [])].filter(text))],
      reason: 'No independently discriminating input/output evidence establishes the failure owner.' }
    : errors.length ? { status: 'UNKNOWN', stage: null, skill: null, candidates: [],
      reason: 'The check itself is incomplete; no stage owner can be attributed.' } : null;
  let missedCheckOwner = null;
  if (record?.missedCheckOwner !== undefined) {
    const missed = record.missedCheckOwner;
    if (!object(missed) || !STAGES.includes(missed.stage) || !text(missed.reason)
      || !Array.isArray(missed.evidenceRefs) || !missed.evidenceRefs.length || !firstInvalidBoundary) {
      fail(null, 'MISSED_CHECK_OWNER', 'A missed-check attribution needs an actual failure, stage, reason and evidence.');
    } else if (missed.evidenceRefs.every(ref => verifyRef(ref, roots, budget, missed.stage, fail))) {
      missedCheckOwner = { ...missed, status: 'UNCONFIRMED_DECLARATION', skill: OWNERS[missed.stage] };
    }
  }
  const preservedUpstream = firstIndex < 0 ? STAGES.filter(stage => stages[stage].verdict === 'pass')
    : STAGES.slice(0, firstIndex).filter(stage => stages[stage].verdict === 'pass');
  const invalidatedDownstream = firstIndex < 0 || stages[firstInvalidBoundary]?.verdict === 'not-run'
    ? [] : STAGES.slice(firstIndex);
  const lastConfirmedCorrectArtifact = preservedUpstream.length
    ? stages[preservedUpstream[preservedUpstream.length - 1]].outputs || [] : [];
  const report = { tool: 'agent-to-recipe-workflow-stage/v1', verdict: errors.length ? 'fail' : 'pass',
    allowed: errors.length === 0, recordSha256, taskId: record?.taskId || null, attemptId: record?.attemptId || null,
    planRevision: record?.planRevision || null, workPackageId: record?.workPackageId || null,
    from: options.from, to: options.to, stages, final,
    lastConfirmedCorrectArtifact, firstInvalidBoundary, failureDiscoveryStage, failureOwner, missedCheckOwner,
    diagnosisStage: selectedFinding?.discoveryStage || firstInvalidBoundary,
    evidenceNature: 'bound records only; this check does not witness desktop execution',
    sourceNature: text(record?.sourceNature) ? record.sourceNature.slice(0, 250) : '固定记录；原始事实性质未统一声明',
    preservedUpstream, invalidatedDownstream,
    nextMinimumAction: firstInvalidBoundary && stages[firstInvalidBoundary]?.verdict === 'not-run'
      ? '补齐 ' + firstInvalidBoundary + ' 的正式输入与独立审阅；任何业务执行仍需另行授权。'
      : firstInvalidBoundary ? (failureOwner?.status === 'ESTABLISHED'
        ? stages[firstInvalidBoundary]?.businessReview?.nextRepair
          || '只修正已证明不一致的 ' + firstInvalidBoundary + ' 输出；保持固定要求，重验受影响下游。'
        : selectedFinding?.nextEvidence || stages[firstInvalidBoundary]?.businessReview?.nextEvidence
          || '先对照失败位置的固定输入、实际输出与原始回执，补充能区分责任的证据；归属前不修改上游事实，不自动重跑。')
      : errors.length ? '先修复检查输入或引用读取问题；尚不能确认任何业务阶段或修复责任。'
      : options.final ? '本次机器检查已结束；真实执行与业务 Qualification 必须依赖独立证据。'
        : '本次边界可放行至 ' + options.to + '；这不是业务执行授权或整条流程完成。',
    consumerVerificationCalls: execution.calls,
    errors, notEvaluated: ['truth of claimed historical execution or desktop observation',
      'source execution authorization beyond the trusted host callback (never derived from review fields)',
      'whether acceptance was frozen before execution without independent registration evidence',
      'unrecorded producer access to reference/future answers', 'independence of human or model scoring',
      'business correctness of content merely because it has a hash'], desktopActionsAuthorized: false };
  retainedChecks.set(report, { retained, resultHash: hash(Buffer.from(JSON.stringify(report))) });
  return report;
}

// Diagnostic extensions live in this checker, not in a second evaluator. They
// compare fixed artifact content and retain existing scoring and required tests.
function bindFinding(finding, discoveryStage, record, roots, budget, problem) {
  const boundary = finding.firstInvalidBoundary || discoveryStage;
  if (!STAGES.includes(boundary) || STAGES.indexOf(boundary) > STAGES.indexOf(discoveryStage)
    || !text(finding.reason) || !Array.isArray(finding.evidence) || !finding.evidence.length) {
    problem('FINDING_BINDING', 'A blocking finding requires a valid trust boundary, reason and fixed evidence.');
    return null;
  }
  const refs = record.stages?.find(item => item.stage === boundary)?.outputs || [];
  if (boundary !== discoveryStage && !finding.evidence.some(ref => refs.some(output => identity(ref) === identity(output)))) {
    problem('FINDING_BOUNDARY_EVIDENCE', 'Invalidating an earlier boundary must bind that exact output, not merely name an owner.');
    return null;
  }
  if (!finding.evidence.map(ref => verifyRef(ref, roots, budget, discoveryStage,
    (_stage, code, message) => problem(code, message))).every(Boolean)) return null;
  return { blocking: true, discoveryStage, firstInvalidBoundary: boundary,
    ownerStage: 'UNKNOWN', reason: finding.reason, evidence: finding.evidence,
    candidateOwners: [...new Set([finding.ownerStage, ...(Array.isArray(finding.candidateOwners)
      ? finding.candidateOwners : [])].filter(value => text(value) && value !== 'UNKNOWN'))],
    nextEvidence: text(finding.nextEvidence) ? finding.nextEvidence : null };
}

function selectBusinessValue(selector, review, roots, budget, problem) {
  if (!object(selector) || !['inputs', 'outputs', 'evidence'].includes(selector.collection)
    || !text(selector.kind)) return { available: false, reason: '未定义有效的固定来源。' };
  const refs = (Array.isArray(review[selector.collection]) ? review[selector.collection] : [])
    .filter(ref => ref.kind === selector.kind && (!selector.path || ref.path === selector.path));
  if (refs.length !== 1) return { available: false,
    reason: refs.length ? '来源不唯一，不能替维护者选择。' : '未产出或没有绑定此来源。' };
  const ref = refs[0];
  const bytes = readRef(ref, roots, budget, review.stage,
    (_stage, code, message) => problem(code, message));
  if (!bytes) return { available: false, ref, reason: '固定文件缺失、版本不匹配或不可读取。' };
  try {
    if (Array.isArray(selector.lines)) {
      const [start, end] = selector.lines;
      requireCheck(selector.lines.length === 2 && Number.isInteger(start) && Number.isInteger(end)
        && start >= 1 && end >= start && end - start < 30, 'BUSINESS_SELECTOR', 'Use at most 30 explicit source lines.');
      const lines = bytes.toString('utf8').split('\n');
      requireCheck(end <= lines.length, 'BUSINESS_SELECTOR', 'Requested source line is absent.');
      return { available: true, value: lines.slice(start - 1, end).join('\n'), ref,
        location: 'lines ' + start + '–' + end, nature: '固定源码／文本摘录；未执行' };
    }
    requireCheck(typeof selector.pointer === 'string' && selector.pointer.length <= 1024
      && (selector.pointer === '' || selector.pointer.startsWith('/')), 'BUSINESS_SELECTOR', 'Use a bounded JSON pointer.');
    let value = parseJson(bytes);
    const document = value;
    for (const part of selector.pointer.split('/').slice(1)) {
      requireCheck(!/~(?:[^01]|$)/.test(part), 'BUSINESS_SELECTOR', 'Invalid JSON pointer escape.');
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      requireCheck(value !== null && typeof value === 'object' && own(value, key),
        'BUSINESS_VALUE_ABSENT', 'The named business value is absent.');
      value = value[key];
    }
    return { available: true, value, ref, location: selector.pointer || '/',
      nature: text(document?.sourceNature) ? document.sourceNature : '固定工件记录；未由本工具现场见证' };
  } catch (error) { return { available: false, ref, location: selector.pointer,
    reason: error.code === 'BUSINESS_VALUE_ABSENT' ? '本次没有记录这项业务内容。' : '不能从固定来源取得该项正文。' }; }
}

function compareBusinessAssertions(review, requirements, roots, budget, problem) {
  const definitions = requirements?.businessAssertions;
  const diagnostics = { assertions: [], context: [], candidateOwners: [], nextEvidence: null,
    nextRepair: null,
    coverage: definitions === undefined ? 'LEGACY_UNSPECIFIED' : 'EXPLICIT_FROZEN_ASSERTIONS' };
  if (definitions !== undefined) {
    if (!Array.isArray(definitions) || !definitions.length || definitions.length > 20
      || new Set(definitions.map(item => item?.id)).size !== definitions.length) {
      problem('BUSINESS_ASSERTION_CONTRACT', 'Freeze a nonempty bounded, unique business assertion set.');
      diagnostics.coverage = 'INVALID';
    } else for (const definition of definitions) {
      if (!object(definition) || !text(definition.id) || !text(definition.requirement)
        || !requirements.requiredTests.includes(definition.test)
        || !['equal', 'includes'].includes(definition.comparator)
        || !object(definition.expected) || !object(definition.actual)
        || own(definition.expected, 'value') === own(definition.expected, 'selector')
        || !object(definition.actual.selector)) {
        problem('BUSINESS_ASSERTION_CONTRACT', 'Each assertion must bind a frozen required test, requirement, expected and actual selection.');
        diagnostics.assertions.push({ id: definition?.id || '?', requirement: '冻结断言定义不完整。',
          status: 'UNKNOWN', expected: { available: false }, actual: { available: false } });
        continue;
      }
      const expected = own(definition.expected, 'value')
        ? { available: true, value: definition.expected.value, nature: 'S1 固定验收要求；不是本次运行时值' }
        : selectBusinessValue(definition.expected.selector, review, roots, budget, problem);
      const actual = selectBusinessValue(definition.actual.selector, review, roots, budget, problem);
      const baselineValid = !own(definition, 'inputBaseline')
        || expected.available && isDeepStrictEqual(expected.value, definition.inputBaseline);
      let status = 'UNKNOWN';
      if (expected.available && actual.available && baselineValid) {
        if (definition.comparator === 'equal') status = isDeepStrictEqual(expected.value, actual.value) ? 'PASS' : 'FAIL';
        else if (Array.isArray(expected.value) && Array.isArray(actual.value)) status = expected.value
          .every(value => actual.value.some(item => isDeepStrictEqual(item, value))) ? 'PASS' : 'FAIL';
      }
      const requiredTest = review.requiredTests?.find(item => item.name === definition.test);
      // An observed equality cannot override a failed/unknown frozen required test.
      if (status === 'PASS' && requiredTest?.status !== 'pass') status = requiredTest?.status === 'fail' ? 'FAIL' : 'UNKNOWN';
      const assertion = { id: definition.id, requirement: definition.requirement,
        test: definition.test, expected, actual, status, comparator: definition.comparator,
        reason: !baselineValid ? '上游输入尚不满足固定前提，不能据此判断本阶段输出的责任。'
          : status === 'FAIL' ? '本次业务内容与固定要求不一致，或对应必需测试没有通过。'
            : status === 'UNKNOWN' ? '缺少足够的同版业务内容或测试依据。' : '固定内容对照及对应必需测试均通过；不是现场真实性证明。' };
      if (status === 'FAIL' && baselineValid && definition.attribution === 'output-preservation'
        && definition.expected.selector?.collection === 'inputs'
        && definition.actual.selector?.collection === 'outputs' && own(definition, 'inputBaseline')
        && expected.available && actual.available && !isDeepStrictEqual(expected.value, actual.value)) {
        assertion.ownerProof = { kind: 'input-output-contract-contradiction', assertionId: definition.id,
          inputRef: expected.ref, inputLocation: expected.location,
          outputRef: actual.ref, outputLocation: actual.location,
          reason: '固定输入满足要求，但本阶段交出的输出没有保留该业务内容。仅确定此输出的修复责任。' };
      }
      diagnostics.assertions.push(assertion);
      if (status !== 'PASS') {
        problem(status === 'FAIL' ? 'BUSINESS_MISMATCH' : 'BUSINESS_UNKNOWN', definition.id + ': ' + definition.requirement);
        if (!diagnostics.nextEvidence && text(definition.nextEvidence)) diagnostics.nextEvidence = definition.nextEvidence;
        if (!diagnostics.nextRepair && text(definition.nextRepair)) diagnostics.nextRepair = definition.nextRepair;
        if (Array.isArray(definition.candidateOwners)) diagnostics.candidateOwners.push(...definition.candidateOwners.filter(text));
      }
    }
  }
  // Optional excerpts have no verdict or authority. They select already bound
  // sources only. Content is escaped by the renderer and is never executed.
  for (const entry of (Array.isArray(review.humanContext) ? review.humanContext : []).slice(0, 12)) {
    if (text(entry?.label)) diagnostics.context.push({ label: entry.label, role: entry.role === 'symptom' ? 'symptom' : 'context',
      selection: selectBusinessValue(entry.selector, review, roots, budget, problem) });
  }
  return diagnostics;
}

// A bundle is a new immutable check directory. Fail if it already exists; do
// not delete stale history, overwrite a user's root report, or re-read latest
// artifacts after checking them. The caller may publish a navigation pointer.
function writeWorkflowReviewBundle(report, directory) {
  requireCheck(retainedChecks.has(report), 'UNBOUND_REVIEW', 'Render a result produced by this checker invocation.');
  const fixed = retainedChecks.get(report);
  requireCheck(fixed.resultHash === hash(Buffer.from(JSON.stringify(report))), 'RESULT_CHANGED',
    'The checker result changed after evaluation; do not publish a rewritten verdict.');
  const destination = path.resolve(directory);
  requireCheck(!fs.existsSync(destination), 'REVIEW_EXISTS', 'Use a new check directory; existing reports are not overwritten.');
  const parent = fs.realpathSync(path.dirname(destination));
  requireCheck(parent === path.dirname(destination), 'REVIEW_SYMLINK', 'Use a real, existing parent directory.');
  const temporary = fs.mkdtempSync(path.join(parent, '.stage-review-'));
  try {
    fs.mkdirSync(path.join(temporary, 'files'));
    const snapshots = [];
    const snapshotBytes = new Map();
    for (const entry of fixed.retained.values()) {
      const ext = path.extname(entry.ref.path).slice(1);
      const safeExt = /^[a-zA-Z0-9]{1,12}$/.test(ext) ? ext : 'txt';
      const name = 'files/' + String(snapshots.length + 1).padStart(4, '0') + '.' + safeExt;
      fs.writeFileSync(path.join(temporary, name), entry.bytes, { flag: 'wx' });
      snapshotBytes.set(name, entry.bytes);
      snapshots.push({ ref: entry.ref, snapshot: name, status: 'retained', actualSha256: hash(entry.bytes) });
    }
    const view = workflowPresentation(report, snapshots, name => snapshotBytes.get(name));
    const bundle = renderWorkflowBundle(report, view);
    fs.mkdirSync(path.join(temporary, 'stage-review'));
    fs.writeFileSync(path.join(temporary, 'stage-review.md'), bundle.index, { flag: 'wx' });
    for (const [name, markdown] of Object.entries(bundle.stages)) fs.writeFileSync(path.join(temporary,
      'stage-review', name + '.md'), markdown, { flag: 'wx' });
    fs.writeFileSync(path.join(temporary, 'checker-result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(temporary, 'snapshot-index.json'), JSON.stringify(snapshots, null, 2) + '\n', { flag: 'wx' });
    // mkdir with no recursive flag provides an exclusive final-name reservation.
    // No other report is removed if another publisher wins that name.
    fs.mkdirSync(destination);
    for (const name of fs.readdirSync(temporary).sort((a, b) => (a === 'stage-review.md') - (b === 'stage-review.md'))) fs.renameSync(path.join(temporary, name), path.join(destination, name));
    fs.rmdirSync(temporary);
    return { directory: destination, stages: Object.keys(bundle.stages) };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function dependencyClosure(stage, dependencies, found = new Set()) {
  for (const upstream of dependencies[stage] || []) if (!found.has(upstream)) {
    found.add(upstream);
    dependencyClosure(upstream, dependencies, found);
  }
  return found;
}

function validateRouting(routing, record, options, fail) {
  const reject = message => { fail(options.from, 'ROUTING_REQUIRED', message); return null; };
  if (!object(routing) || routing.planRevision !== record.planRevision
    || !object(routing.dependencies) || Object.keys(routing.dependencies).length !== STAGES.length
    || STAGES.some(stage => !Array.isArray(routing.dependencies[stage])
      || new Set(routing.dependencies[stage]).size !== routing.dependencies[stage].length
      || routing.dependencies[stage].some(upstream => !STAGES.includes(upstream)
        || STAGES.indexOf(upstream) >= STAGES.indexOf(stage))))
    return reject('Freeze an acyclic, complete dependency map at the current plan revision in acceptance.routing.');
  if (STAGES.some(stage => REQUIRED_DEPENDENCIES[stage].some(upstream =>
    !dependencyClosure(stage, routing.dependencies).has(upstream))))
    return reject('The dependency closure cannot omit a formal prerequisite responsibility.');
  if (!Array.isArray(routing.workPackages) || routing.workPackages.length > 48
    || new Set(routing.workPackages.map(item => item?.id)).size !== routing.workPackages.length
    || routing.workPackages.some(item => !object(item) || !text(item.id)
      || !STAGES.includes(item.from) || !STAGES.includes(item.to)
      || STAGES.indexOf(item.from) >= STAGES.indexOf(item.to)
      || !Array.isArray(item.members) || !item.members.length
      || new Set(item.members.map(member => member?.stage)).size !== item.members.length
      || item.members.some(member => !object(member) || !STAGES.includes(member.stage)
        || STAGES.indexOf(member.stage) < STAGES.indexOf(item.from)
        || STAGES.indexOf(member.stage) >= STAGES.indexOf(item.to)
        || !text(member.attemptId) || !text(member.planRevision) || !text(member.producerVersion))))
    return reject('Freeze unique work packages and per-responsibility attempt, plan and method versions.');
  const selectedPackage = routing.workPackages.find(item => item.id === record.workPackageId);
  if (record.workPackageId !== undefined && (!selectedPackage
    || selectedPackage.from !== options.from || selectedPackage.to !== options.to))
    return reject('The selected work package must match the frozen transition.');
  if (STAGES.indexOf(options.to) > STAGES.indexOf(options.from) + 1) {
    const required = dependencyClosure(options.to, routing.dependencies);
    required.add(options.from);
    if (!selectedPackage || [...required].some(stage => STAGES.indexOf(stage) >= STAGES.indexOf(options.from)
      && !selectedPackage.members.some(member => member.stage === stage)))
      return reject('Non-adjacent entry needs a frozen package covering every intervening responsibility.');
  }
  return { ...routing, selectedPackage };
}

function validatePackageMember(member, review, record, roots, budget, fail, execution) {
  const reject = message => { fail(review.stage, 'WORK_PACKAGE_BINDING', message); return false; };
  if (['attemptId', 'planRevision', 'producerVersion'].some(field => member[field] !== review[field]))
    return reject('The active review differs from the frozen work package version.');
  if (member.reuseReviewRef === undefined) return true;
  if (member.reuseReviewRef?.kind !== 'StageReview') return reject('Reuse must reference a StageReview.');
  const bytes = readRef(member.reuseReviewRef, roots, budget, review.stage, fail);
  if (!bytes) return false;
  let source;
  try { source = parseDocument(bytes); } catch { return reject('A reused review must be a bound JSON document.'); }
  if (!text(member.reuseReason) || !Array.isArray(member.applicabilityEvidence)
    || !member.applicabilityEvidence.length) return reject('Reuse needs a reason and current applicability evidence.');
  let valid = true;
  for (const ref of member.applicabilityEvidence) if (!verifyRef(ref, roots, budget, review.stage, fail)) valid = false;
  const nonAcceptance = inputs => Array.isArray(inputs)
    ? inputs.filter(ref => ref?.kind !== record.acceptanceRef.kind) : inputs;
  if (source.disposition !== 'pass' || source.gate?.verdict !== 'pass'
    || ['taskId', 'stage', 'attemptId', 'planRevision', 'producerVersion', 'outputs', 'evidence', 'dependencies']
      .some(field => !isDeepStrictEqual(source[field], review[field]))
    || !isDeepStrictEqual(nonAcceptance(source.inputs), nonAcceptance(review.inputs)))
    return reject('Reuse must retain the source identity, method, actual evidence, outputs and dependency versions.');
  const originalAcceptance = source.inputs.find(ref => ref.kind === record.acceptanceRef.kind);
  const originalBytes = readRef(originalAcceptance, roots, budget, review.stage, fail);
  if (!originalBytes) return false;
  try {
    const original = parseDocument(originalBytes);
    if (original.taskId !== record.taskId || evaluateReview(source,
      { ...record, acceptanceRef: originalAcceptance }, original, roots, budget, fail, execution).verdict !== 'pass')
      return reject('The source review must still pass its own frozen acceptance.');
  } catch { return reject('The source review and original acceptance must remain independently checkable.'); }
  return valid;
}

function evaluateScoring(review, acceptance, roots, budget, fail) {
  let valid = true;
  const reject = message => { fail(review.stage, 'SCORING_CRITERIA', message); valid = false; };
  const frozen = acceptance?.stages?.[review.stage]?.scoring;
  if (!object(frozen) || frozen.denominator !== 100 || frozen.granularity !== 5
    || !Array.isArray(frozen.items) || frozen.items.length !== 20
    || new Set(frozen.items.map(item => item?.id)).size !== 20
    || frozen.items.some(item => !object(item) || !own(SCORE_ITEMS, item.id)
      || SCORE_ITEMS[item.id] !== item.dimension || item.maxPoints !== 5 || !text(item.criterion)
      || !Array.isArray(item.requiredEvidenceKinds) || !item.requiredEvidenceKinds.length
      || item.requiredEvidenceKinds.some(kind => !text(kind)))) {
    reject('Acceptance must freeze all A1–A5/B1–B4/C1–C4/D1–D4/E1–E3 criteria, evidence roles and the 100-point denominator.');
    return { valid, score: null };
  }
  if (!object(review.score) || Object.keys(review.score).length !== Object.keys(WEIGHTS).length)
    reject('Keep exactly the five existing dimension scores.');
  const totals = [];
  for (const dimension of Object.keys(WEIGHTS)) {
    const items = review.scoreEvidence?.[dimension]?.items;
    const expected = frozen.items.filter(item => item.dimension === dimension);
    if (!Array.isArray(items) || items.length !== expected.length
      || new Set(items.map(item => item?.id)).size !== expected.length
      || items.some(item => !object(item) || !expected.some(criterion => criterion.id === item.id))) {
      reject('Each dimension must assess its exact frozen item set once.');
      totals.push(null);
      continue;
    }
    for (const item of items) {
      if (![0, 5, null].includes(item.score) || !text(item.reason) || !Array.isArray(item.refs)) {
        reject('Each item needs a 0/5/null score, reason and evidence array.');
        continue;
      }
      const criterion = expected.find(entry => entry.id === item.id);
      if (item.score !== null && (!item.refs.length || criterion.requiredEvidenceKinds.some(kind =>
        !item.refs.some(ref => ref?.kind === kind))))
        reject('An evaluated item must supply every frozen required evidence role.');
      for (const ref of item.refs) if (!verifyRef(ref, roots, budget, review.stage, fail)) valid = false;
    }
    const subtotal = items.some(item => ![0, 5].includes(item.score)) ? null
      : items.reduce((sum, item) => sum + item.score, 0);
    if (review.score?.[dimension] !== subtotal) reject('Dimension score must equal its item sum, or null when unevaluated.');
    totals.push(subtotal);
  }
  return { valid, score: valid && totals.every(value => value !== null)
    ? totals.reduce((sum, value) => sum + value, 0) : null };
}

function expectedReportSubjects(review, record) {
  const candidate = review.stage === 'S12' ? record.stages.find(item => item.stage === 'S11') : review;
  return ['S11', 'S12'].includes(review.stage)
    ? [...(candidate?.outputs || []).filter(ref => ['CandidateManifest', 'CandidateSource'].includes(ref.kind)),
      ...(candidate?.dependencies || [])] : review.outputs || [];
}

function validateReportSubjects(report, review, record, roots, budget, fail) {
  const expected = expectedReportSubjects(review, record);
  const refs = report.subjectRefs;
  if (!Array.isArray(refs) || !expected.length || refs.length !== expected.length
    || new Set(refs.map(byteIdentity)).size !== refs.length
    || !expected.every(ref => refs.some(actual => byteIdentity(actual) === byteIdentity(ref)))) {
    fail(review.stage, 'VALIDATOR_SUBJECT', 'Validator must bind the exact current output or Candidate manifest/source/dependency set.');
    return false;
  }
  let valid = true;
  for (const ref of refs) if (!verifyRef(ref, roots, budget, review.stage, fail)) valid = false;
  return valid;
}

function verifyCurrentConsumer(verification, review, record, roots, budget, fail, execution) {
  const reject = message => { fail(review.stage, 'CONSUMER_VERIFICATION', message); return false; };
  if (!object(verification)) return reject('A bound descriptor and fixed evaluator version are required.');
  if (typeof execution?.verifyConsumer !== 'function') {
    fail(review.stage, 'CONSUMER_AUTHORIZATION', 'Only a trusted host callback may authorize controlled execution of reviewed exact bytes; record fields grant no execution authority.');
    return false;
  }
  const evaluatorBytes = readRef(verification.evaluatorRef, roots, budget, review.stage, fail);
  const descriptorBytes = readRef(verification.descriptorRef, roots, budget, review.stage, fail);
  if (!evaluatorBytes || !descriptorBytes) return false;
  try {
    const evaluatorPath = resolveFile(roots, verification.evaluatorRef.rootId, verification.evaluatorRef.path);
    if (evaluatorPath !== CONSUMER_VERIFIER) return reject('Only the fixed maintained verifier may execute this check.');
    const descriptor = parseDocument(descriptorBytes);
    const expected = expectedReportSubjects(review, record);
    const candidateRef = expected.find(ref => ref.kind === 'CandidateManifest');
    const scriptRef = expected.find(ref => ref.kind === 'CandidateSource');
    const dependencies = expected.filter(ref => ref !== candidateRef && ref !== scriptRef);
    if (descriptor.schemaVersion !== 'calculator-consumer-l1/v1'
      || descriptor.harness !== 'calculator-runtime-v1' || !text(descriptor.evaluator)
      || descriptor.evaluator === review.producer
      || descriptor.evaluator === record.stages.find(item => item.stage === 'S11')?.producer
      || descriptor.evaluatorSha256 !== hash(evaluatorBytes)
      || byteIdentity(descriptor.candidateRef) !== byteIdentity(candidateRef)
      || byteIdentity(descriptor.scriptRef) !== byteIdentity(scriptRef)
      || descriptor.script?.path !== resolveFile(roots, scriptRef.rootId, scriptRef.path)
      || descriptor.script?.sha256 !== scriptRef.sha256
      || !Array.isArray(descriptor.dependencies) || descriptor.dependencies.length !== dependencies.length
      || new Set(descriptor.dependencies.map(byteIdentity)).size !== descriptor.dependencies.length
      || !dependencies.every(ref => descriptor.dependencies.some(item => byteIdentity(item) === byteIdentity(ref))))
      return reject('Consumer descriptor must bind the current Candidate, source, dependencies, evaluator and production harness.');
    const declaredRoots = makeRoots(descriptor.roots);
    if (declaredRoots.size !== roots.size || [...roots].some(([id, directory]) => declaredRoots.get(id) !== directory))
      return reject('Consumer roots must exactly match the caller-authorized roots.');
    const freshBudget = { bytes: budget.bytes };
    for (const ref of [...expected, verification.evaluatorRef, verification.descriptorRef])
      if (!verifyRef(ref, roots, freshBudget, review.stage, fail)) return false;
    budget.bytes = freshBudget.bytes;
    execution.calls += 1;
    const result = execution.verifyConsumer(descriptor);
    if (result.verdict !== 'pass' || result.businessDataflow?.verdict !== 'pass'
      || result.businessDataflow?.releaseBlocked !== false || result.evidenceLayer !== 'L1-controlled-substitutes'
      || result.desktopActions !== false || result.liveQualificationGranted !== false
      || result.generalJavaScriptProof !== false || result.verification?.mode !== 'controlled-exact-byte'
      || result.verification?.evaluator?.path !== CONSUMER_VERIFIER
      || result.verification?.evaluator?.sha256 !== descriptor.evaluatorSha256
      || !Array.isArray(result.verification?.evidenceRefs) || !result.verification.evidenceRefs.length)
      return reject('The current maintained verifier did not independently pass exact-byte controlled observations.');
    if (!validateReportSubjects(result, review, record, roots, budget, fail)) return false;
    const postBudget = { bytes: budget.bytes };
    let valid = true;
    for (const ref of [...expected, verification.evaluatorRef, verification.descriptorRef,
      ...result.verification.evidenceRefs]) if (!verifyRef(ref, roots, postBudget, review.stage, fail)) valid = false;
    budget.bytes = postBudget.bytes;
    return valid;
  } catch { return reject('The exact-byte verifier or descriptor could not be independently checked.'); }
}

function evaluateReview(review, record, acceptance, roots, budget, fail, execution) {
  const stage = review.stage;
  const boundFindings = [];
  let ok = true;
  const problem = (code, message) => { fail(stage, code, message); ok = false; };
  if (review.taskId !== record.taskId || !text(review.attemptId)
    || !text(review.planRevision) || !text(review.producerVersion)) {
    problem('IDENTITY_MISMATCH', 'Stage task identity and its own attempt, plan revision and producer version must be explicit.');
  }
  if (stage !== 'S12') {
    const member = acceptance?.routing?.workPackages?.find(item => item.id === record.workPackageId)
      ?.members?.find(item => item.stage === stage);
    const everyRef = [...(review.inputs || []), ...(review.outputs || []), ...(review.evidence || []),
      ...(review.dependencies || []), ...(review.gate?.evidence || []),
      ...(review.requiredTests || []).flatMap(item => item.evidence || []),
      ...Object.values(review.scoreEvidence || {}).flatMap(item => item?.refs || []),
      ...Object.values(review.scoreEvidence || {}).flatMap(detail =>
        (detail?.items || []).flatMap(item => item?.refs || [])),
      ...(review.audit?.accessedRefs || []),
      ...(review.validationReports || []).map(item => item.reportRef),
      ...(review.validationReports || []).flatMap(item => [item.consumerVerification?.descriptorRef,
        item.consumerVerification?.evaluatorRef]),
      ...(review.repair?.basisRefs || []), review.repair?.previousReviewRef,
      member?.reuseReviewRef, ...(member?.applicabilityEvidence || [])].filter(Boolean);
    if (everyRef.some(ref => /(?:^|\/)tests\/workflows\/fixtures\/stage-review-diagnostics\//.test(ref?.path || '')
      || /(?:^|\/)workflows\/agent-to-recipe\/cases\/calculator(?:\/|[.-])/.test(ref?.path || '')
      || /(^|\/)examples\/agent-to-recipe\/calculator\.js$/.test(ref?.path || '')
      || ['ReferenceAnswer', 'QualificationRecord'].includes(ref?.kind)
      || ['CandidateSource', 'CandidateManifest'].includes(ref?.kind) && stage !== 'S11'
      || ref?.kind === 'SemanticProcedure' && STAGES.indexOf(stage) < 8
      || ref?.kind === 'BusinessSteps' && STAGES.indexOf(stage) < 7
      || ref?.kind === 'DistilledSteps' && STAGES.indexOf(stage) < 6)) {
      problem('FUTURE_OR_REFERENCE_INPUT', 'Producer may not receive a reference answer or future stage artifact.');
      return { verdict: 'fail', score: null, outputs: review.outputs || [] };
    }
  }
  const scoring = evaluateScoring(review, acceptance, roots, budget, fail);
  const score = scoring.score;
  if (!scoring.valid) ok = false;
  if (score === null) problem('INVALID_SCORE', 'All twenty frozen 0/5 criteria must be evaluated before PASS.');
  else if (score < 95) problem('LOW_SCORE', 'Stage score below 95.');
  for (const dimension of Object.keys(WEIGHTS)) {
    const detail = review.scoreEvidence?.[dimension];
    if (!text(detail?.reason) || !Array.isArray(detail?.refs) || !detail.refs.length) {
      problem('SCORE_EVIDENCE', 'Each scoring dimension needs a specific reason and bound evidence.');
    } else for (const ref of detail.refs) if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
  }
  if (review.disposition !== 'pass' || review.inputsSufficient !== true || review.actualOutputCorrect !== true)
    problem('REVIEW_FAIL', 'Explicit independent input/output review must pass.');
  if (!object(review.gate) || review.gate.verdict !== 'pass') problem('GATE_FAIL', 'Applicable stage Gate must pass.');
  for (const [field, mandatory] of [['inputs', stage !== 'S1'], ['outputs', true], ['evidence', true]]) {
    if (!Array.isArray(review[field]) || (mandatory && review[field].length === 0)) {
      problem('MISSING_' + field.toUpperCase(), 'A required bound ' + field + ' set is absent.'); continue;
    }
    for (const ref of review[field]) if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
  }
  if (!review.inputs?.some(ref => identity(ref) === identity(record.acceptanceRef)))
    problem('ACCEPTANCE_BINDING', 'Each stage must consume the exact S1-frozen acceptance version.');
  if (review.dependencies !== undefined && !Array.isArray(review.dependencies))
    problem('DEPENDENCY_BINDING', 'Dependencies must be an explicit reference array.');
  else for (const ref of review.dependencies || []) if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
  const stageRequirements = acceptance?.stages?.[stage];
  if (!stageRequirements || !stageRequirements.requiredTests.every(name => review.requiredTests?.some(test => test.name === name))
    || review.requiredTests?.some(test => !stageRequirements.requiredTests.includes(test.name)))
    problem('TEST_SCOPE', 'Required tests must match the S1-frozen stage acceptance list.');
  for (const kind of stageRequirements?.requiredEvidenceKinds || []) if (!review.evidence?.some(ref => ref.kind === kind))
    problem('EVIDENCE_SCOPE', 'A frozen required evidence role is absent: ' + kind);
  const validators = review.validationReports || [];
  if (!Array.isArray(validators) || stageRequirements?.requiredValidators?.some(name =>
    !validators.some(item => item.tool === name))) {
    problem('VALIDATOR_SCOPE', 'Frozen required validators must provide their bound reports.');
  } else for (const validation of validators) {
    const reportBytes = readRef(validation.reportRef, roots, budget, stage, fail);
    if (!reportBytes) { ok = false; continue; }
    try {
      const report = parseDocument(reportBytes);
      if (validation.tool !== report.tool || report.verdict !== 'pass'
        || (validation.boundary && report.boundaries?.[validation.boundary] !== 'pass')) {
        problem('VALIDATOR_FAILED', 'A bound validator report failed; a review cannot override its result.');
      }
      const subjectsValid = validateReportSubjects(report, review, record, roots, budget, fail);
      if (!subjectsValid) ok = false;
      const explicitlyBlocked = report.releaseBlocked !== undefined && report.releaseBlocked !== false
        || report.blocked !== undefined && report.blocked !== false
        || (Array.isArray(report.errors) && report.errors.length)
        || (Array.isArray(report.blockingUnknowns) && report.blockingUnknowns.length);
      if (explicitlyBlocked) {
        problem('VALIDATOR_BLOCKED', 'Explicit validator blocks or errors cannot be overridden by a top-level PASS.');
      }
      if (['S11', 'S12'].includes(stage) && (report.businessDataflow !== undefined
        || report.tool === 'agent-to-recipe-artifact-chain/v1')) {
        const flow = report.businessDataflow;
        if (!object(flow) || flow.verdict === 'fail'
          || report.tool !== 'agent-to-recipe-artifact-chain/v1' &&
            (flow.verdict !== 'pass' || flow.releaseBlocked !== false)) {
          problem('VALIDATOR_BLOCKED', 'Failed or unknown applicable business dataflow cannot pass.');
        } else if (!subjectsValid || explicitlyBlocked || report.verdict !== 'pass'
          || !verifyCurrentConsumer(validation.consumerVerification, review, record, roots, budget, fail, execution)) {
          problem('VALIDATOR_BLOCKED', 'Structural PASS cannot clear business-dataflow release blocking without current exact-byte verification.');
        }
      }
    } catch { problem('VALIDATOR_INVALID', 'Bound validator result must be JSON.'); }
  }
  if (Array.isArray(review.gate?.evidence) && review.gate.evidence.length) {
    for (const ref of review.gate.evidence) if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
  } else problem('GATE_EVIDENCE', 'Gate evidence is required.');
  if (!Array.isArray(review.hardFails) || review.hardFails.length) problem('HARD_FAIL', 'Hard Fail list must exist and be empty.');
  if (!Array.isArray(review.blockingUnknowns) || review.blockingUnknowns.length) problem('BLOCKING_UNKNOWN', 'Blocking Unknown list must exist and be empty.');
  if (!Array.isArray(review.requiredTests) || review.requiredTests.length === 0
    || review.requiredTests.some(item => !text(item?.name) || item.status !== 'pass'
      || !Array.isArray(item.evidence) || item.evidence.length === 0)) {
    problem('REQUIRED_TEST', 'All applicable required tests need PASS and bound evidence.');
  } else for (const item of review.requiredTests) for (const ref of item.evidence) {
    if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
  }
  if (['S3', 'S4', 'S12'].includes(stage)) {
    const kind = stage === 'S3' ? 'ActualExecution' : stage === 'S4' ? 'ActualObservation' : 'FreshRun';
    const equivalents = stage === 'S3' ? ['ActualExecution', 'live-action-trace']
      : stage === 'S4' ? ['ActualObservation', 'actual-first-read'] : ['FreshRun', 'independent-fresh-run'];
    if (!review.evidence?.some(ref => equivalents.includes(ref.kind))) problem('MISSING_ACTUAL_' + kind.toUpperCase(),
      'Stage requires its own actual execution/observation evidence; an Expected value cannot replace it.');
  }
  if (stage === 'S11') {
    if (!review.outputs?.some(ref => ref.kind === 'CandidateSource')
      || !review.outputs?.some(ref => ref.kind === 'CandidateManifest')
      || !Array.isArray(review.dependencies)) problem('CANDIDATE_FREEZE',
      'S11 must freeze Candidate source, manifest and an explicit dependency set.');
    for (const ref of review.dependencies || []) if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
    const manifestRef = review.outputs?.find(ref => ref.kind === 'CandidateManifest');
    const sourceRef = review.outputs?.find(ref => ref.kind === 'CandidateSource');
    const manifestBytes = manifestRef && readRef(manifestRef, roots, budget, stage, fail);
    if (manifestBytes) {
      try {
        const manifest = parseDocument(manifestBytes);
        if (byteIdentity(manifest.scriptRef) !== byteIdentity(sourceRef)
          || manifest.scriptHash !== sourceRef?.sha256
          || !Array.isArray(manifest.dependencies)
          || new Set(manifest.dependencies.map(identity)).size !== manifest.dependencies.length
          || new Set((review.dependencies || []).map(identity)).size !== review.dependencies?.length
          || manifest.dependencies.length !== review.dependencies?.length
          || !review.dependencies.every(ref => manifest.dependencies.some(item => byteIdentity(item) === byteIdentity(ref)))
          || !manifest.dependencies.every(ref => review.dependencies.some(item => byteIdentity(item) === byteIdentity(ref)))) {
          problem('MANIFEST_BINDING', 'CandidateManifest content must bind this source hash and exact dependency set.');
        }
        for (const dependency of manifest.dependencies || []) {
          if (!verifyRef(dependency, roots, budget, stage, fail)) ok = false;
        }
      } catch { problem('MANIFEST_INVALID', 'CandidateManifest must contain parseable JSON.'); }
    }
  }
  if (stage === 'S12') {
    if (!object(review.qualificationRequestRef)
      || !review.inputs?.some(ref => identity(ref) === identity(review.qualificationRequestRef))) {
      problem('QUALIFICATION_REQUEST_BINDING', 'S12 must consume the exact predeclared Qualification request.');
    } else {
      const bytes = readRef(review.qualificationRequestRef, roots, budget, stage, fail);
      if (!bytes) ok = false;
      else try {
        const request = parseDocument(bytes);
        if (review.qualificationRequestRef.kind !== 'QualificationRequest'
          || review.qualificationRequestRef.schemaVersion !== request.schemaVersion
          || !['fresh-calculator-s12/v1', 'agent-to-recipe/v1'].includes(request.schemaVersion)
          || !Array.isArray(request.requested || request.qualificationScope?.requested)
          || !Array.isArray(request.scenarios)) {
          problem('QUALIFICATION_REQUEST_INVALID', 'S12 request role, schema and predeclared scope/scenarios must be valid.');
        }
      } catch { problem('QUALIFICATION_REQUEST_INVALID', 'S12 request is not parseable JSON.'); }
    }
    if (review.reviewer === review.producer || !text(review.reviewer) || !text(review.producer))
      problem('QUALIFICATION_INDEPENDENCE', 'S12 reviewer must be identified separately from Candidate producer.');
    if (!review.outputs?.some(ref => ref.kind === 'QualificationRecord'))
      problem('QUALIFICATION_RECORD', 'S12 must output a bound QualificationRecord.');
  }
  if (stage !== 'S12') {
    const declared = [...(review.inputs || []), ...(review.outputs || []), ...(review.evidence || [])];
    if (!object(review.audit) || review.audit.referenceRead !== false
      || review.audit.futureOutputsRead !== false || !Array.isArray(review.audit.accessedRefs)
      || !review.audit.accessedRefs.length || review.audit.accessedRefs.some(ref =>
        !declared.some(item => identity(item) === identity(ref))
        || /(^|\/)examples\/agent-to-recipe\/calculator\.js$/.test(ref.path)
        || ['DistilledSteps', 'BusinessSteps', 'SemanticProcedure', 'CandidateSource', 'CandidateManifest', 'QualificationRecord']
          .includes(ref.kind) && STAGES.indexOf(stage) < { DistilledSteps: 6, BusinessSteps: 7, SemanticProcedure: 8,
            CandidateSource: 10, CandidateManifest: 10, QualificationRecord: 11 }[ref.kind])) {
      problem('PRODUCER_ISOLATION', 'Producer access log must be bound to declared inputs and exclude the reference and future outputs.');
    }
  }
  if (!text(review.reviewer) || !text(review.producer))
    problem('REVIEW_IDENTITY', 'The reviewer and producer must be identified.');
  if (review.repair !== undefined) {
    const repair = review.repair;
    const frozenBudget = stageRequirements?.repairBudget;
    const maximum = frozenBudget?.maxAttempts ?? 3;
    const requestedMaximum = repair?.maxAttempts ?? 3;
    if (frozenBudget !== undefined && (!object(frozenBudget) || !Number.isInteger(maximum)
      || maximum < 2 || maximum > 48 || !frozenBudget.authorizationRef)) {
      problem('REPAIR_BUDGET', 'A non-default budget needs frozen authorization and a bounded maximum.');
    } else if (frozenBudget && !verifyRef(frozenBudget.authorizationRef, roots, budget, stage, fail)) ok = false;
    if (!object(repair) || repair.ownerStage !== stage || !Number.isInteger(repair.attempt)
      || !Number.isInteger(requestedMaximum) || repair.attempt < 2 || requestedMaximum < 2
      || requestedMaximum > maximum || repair.attempt > requestedMaximum
      || !Array.isArray(repair.basisRefs) || !repair.basisRefs.length) {
      problem('REPAIR_BUDGET', 'Repairs default to at most three attempts; a larger budget requires frozen authorization.');
    } else {
      const oldBytes = readRef(repair.previousReviewRef, roots, budget, stage, fail);
      let oldReview;
      try { if (oldBytes) oldReview = parseDocument(oldBytes); }
      catch { problem('REPAIR_PREVIOUS', 'Previous review must be a bound JSON review.'); }
      if (!oldReview || oldReview.stage !== stage || oldReview.taskId !== record.taskId
        || oldReview.attemptId === review.attemptId) {
        problem('REPAIR_PREVIOUS', 'Repair must bind a distinct historical attempt for the same task and owner.');
      }
      if (oldReview && (repair.attempt !== (oldReview.repair?.attempt || 1) + 1
        || (oldReview.repair && requestedMaximum !== (oldReview.repair.maxAttempts ?? 3)))) {
        problem('REPAIR_BUDGET', 'The attempt number must advance from the bound previous review without resetting its budget.');
      }
      const oldRefs = new Set([...(oldReview?.evidence || []), ...(oldReview?.outputs || [])].map(identity));
      if (!repair.basisRefs.some(ref => !oldRefs.has(identity(ref)))) {
        problem('REPAIR_WITHOUT_NEW_BASIS', 'Repeating the same failure without new evidence or correction basis must stop.');
      }
      for (const ref of repair.basisRefs) if (!verifyRef(ref, roots, budget, stage, fail)) ok = false;
    }
  }
  if (Array.isArray(review.findings)) for (const finding of review.findings) {
    if (finding?.blocking) {
      const normalized = bindFinding(finding, stage, record, roots, budget, problem);
      if (normalized) boundFindings.push(normalized);
      problem('BLOCKING_FINDING', 'A blocking finding cannot be hidden by a high score.');
    }
  }
  const businessReview = compareBusinessAssertions(review, stageRequirements, roots, budget, problem);
  const boundedScoreEvidence = object(review.scoreEvidence) ? Object.fromEntries(
    Object.entries(review.scoreEvidence).slice(0, 5).map(([dimension, detail]) => [dimension, {
      reason: text(detail?.reason) ? detail.reason : null,
      refs: Array.isArray(detail?.refs) ? detail.refs.slice(0, 30) : [],
      items: Array.isArray(detail?.items) ? detail.items.slice(0, 20).map(item => ({
        id: item?.id, score: item?.score ?? null, reason: text(item?.reason) ? item.reason : null,
        refs: Array.isArray(item?.refs) ? item.refs.slice(0, 30) : [],
      })) : [],
    }])) : {};
  return { verdict: ok ? 'pass' : 'fail', score, owner: OWNERS[stage],
    businessReview, attemptId: review.attemptId, planRevision: review.planRevision,
    expected: { requiredTests: stageRequirements?.requiredTests || [],
      requiredEvidenceKinds: stageRequirements?.requiredEvidenceKinds || [],
      requiredValidators: stageRequirements?.requiredValidators || [] },
    scoreDimensions: object(review.score) ? { ...review.score } : null,
    scoreEvidence: boundedScoreEvidence,
    inputs: Array.isArray(review.inputs) ? review.inputs.slice(0, 60) : [],
    outputs: Array.isArray(review.outputs) ? review.outputs.slice(0, 60) : [],
    evidence: Array.isArray(review.evidence) ? review.evidence.slice(0, 60) : [],
    hardFails: Array.isArray(review.hardFails) ? review.hardFails.slice(0, 20) : [],
    blockingUnknowns: Array.isArray(review.blockingUnknowns) ? review.blockingUnknowns.slice(0, 20) : [],
    requiredTests: Array.isArray(review.requiredTests) ? review.requiredTests.slice(0, 40).map(item => ({
      name: item?.name, status: item?.status,
      evidence: Array.isArray(item?.evidence) ? item.evidence.slice(0, 60) : [],
    })) : [],
    validationReports: Array.isArray(review.validationReports) ? review.validationReports.slice(0, 40).map(item => ({
      tool: item?.tool, reportRef: item?.reportRef, consumerVerification: item?.consumerVerification,
    })) : [],
    findings: boundFindings.slice(0, 20),
    gate: object(review.gate) ? { verdict: review.gate.verdict,
      evidence: Array.isArray(review.gate.evidence) ? review.gate.evidence.slice(0, 60) : [] } : null,
    disposition: review.disposition,
    inputsSufficient: review.inputsSufficient,
    actualOutputCorrect: review.actualOutputCorrect,
    producer: review.producer, reviewer: review.reviewer,
    qualificationRequestRef: stage === 'S12' ? review.qualificationRequestRef : undefined,
    candidate: stage === 'S11' ? review.outputs?.filter(ref => ['CandidateSource', 'CandidateManifest'].includes(ref.kind)) : undefined,
    dependencies: stage === 'S11' ? review.dependencies : undefined };
}

function readRef(ref, roots, budget, stage, fail) {
  try {
    requireCheck(object(ref) && REF_FIELDS.every(field => text(ref[field]))
      && /^[a-f0-9]{64}$/.test(ref.sha256), 'INVALID_REF', 'Expected complete kind/version/hash-bound reference.');
    let cached = readCache.get(budget);
    if (!cached) { cached = new Map(); readCache.set(budget, cached); }
    const filename = resolveFile(roots, ref.rootId, ref.path);
    const key = filename + '\0' + ref.sha256;
    let bytes = cached.get(key);
    if (!bytes) {
      bytes = readBytes(filename, FILE_LIMIT, budget);
      requireCheck(bytes.length > 0, 'EMPTY_ARTIFACT', 'A required artifact or evidence file cannot be empty.');
      requireCheck(hash(bytes) === ref.sha256, 'HASH_MISMATCH', 'Referenced file bytes changed.');
      cached.set(key, bytes);
    }
    if (JSON_ARTIFACT_KINDS.has(ref.kind)
      || !/\.(?:png|jpe?g|gif|webp|bmp|ico|pdf|zip|gz|mp[34]|wav)$/i.test(ref.path)
        && (TEXT_ARTIFACT_KINDS.has(ref.kind)
          || /\.(?:json|jsonl|txt|log|md|markdown|js|cjs|mjs|ts|csv|tsv|yaml|yml|xml|html|css)$/i.test(ref.path))) {
      requireCheck(bytes.toString('utf8').trim().length > 0, 'EMPTY_ARTIFACT', 'Required text cannot contain only whitespace.');
    }
    if (JSON_ARTIFACT_KINDS.has(ref.kind)) {
      requireCheck(bytes.length <= JSON_LIMIT, 'SIZE_LIMIT', 'Structured JSON artifact exceeds bounded JSON read size.');
      const parsed = parseDocument(bytes);
      requireCheck(text(parsed.schemaVersion) && parsed.schemaVersion === ref.schemaVersion,
        'SCHEMA_VERSION_MISMATCH', 'Structured artifact reference version differs from the JSON document version.');
    }
    if (LIVE_EVIDENCE_KINDS.has(ref.kind) && /\.json$/i.test(ref.path)) {
      requireCheck(bytes.length <= JSON_LIMIT, 'SIZE_LIMIT', 'Structured live evidence exceeds bounded JSON read size.');
      const parsedEvidence = parseJson(bytes);
      const entries = Array.isArray(parsedEvidence) ? parsedEvidence : [parsedEvidence];
      requireCheck(entries.length > 0, 'EMPTY_ARTIFACT', 'Required live evidence cannot be an empty array.');
      requireCheck(entries.every(object), 'INVALID_DOCUMENT', 'Live evidence must be an object or a nonempty array of objects.');
      const minimumLayer = ['FreshRun', 'independent-fresh-run'].includes(ref.kind) ? 4 : 3;
      for (const evidence of entries) {
        const declaredLayer = typeof evidence.evidenceLayer === 'string' ? evidence.evidenceLayer.trim() : '';
        const numberedLayer = /^L([0-5])(?:$|[\s/_-])/i.exec(declaredLayer);
        const lowerLayer = numberedLayer !== null && Number(numberedLayer[1]) < minimumLayer
          || /^(?:host-only|mock|synthetic|controlled-substitutes)(?:$|[\s/_-])/i.test(declaredLayer);
        requireCheck(!lowerLayer && evidence.synthetic !== true && evidence.mock !== true && evidence.hostOnly !== true,
          'LIVE_EVIDENCE_CONTRADICTION', 'Required live evidence explicitly declares a lower-layer, host-only or synthetic substitute.');
      }
    }
    if (budget.retained) budget.retained.set(identity(ref), { ref: { ...ref }, bytes: Buffer.from(bytes) });
    return bytes;
  } catch (error) {
    fail(stage, error instanceof CheckError ? error.code : 'FILE_UNREADABLE',
      error instanceof CheckError ? error.message : 'Required bound file cannot be read.');
    return null;
  }
}
function verifyRef(ref, roots, budget, stage, fail) {
  return Boolean(readRef(ref, roots, budget, stage, fail));
}

function validateScenarioDefinitions(planned, actual, requestRef, candidateRef, roots, budget, fail) {
  let valid = true;
  const reject = (code, message) => { fail('S12', code, message); valid = false; };
  const fields = ['input', 'oracle'].filter(field => own(planned, field));
  if (!fields.length) return true;
  const verified = new Set();
  const compare = definition => {
    for (const field of fields) if (own(definition, field)) {
      if (!isDeepStrictEqual(planned[field], definition[field]))
        reject('SCENARIO_DEFINITION', 'Declared scenario ' + field + ' differs from the frozen request.');
      else verified.add(field);
    }
  };
  compare(actual);
  for (const ref of Array.isArray(actual.evidenceRefs) ? actual.evidenceRefs : []) {
    if (ref?.kind !== 'Observation' || ref.schemaVersion !== 'agent-to-recipe/v1'
      || !/\.json$/i.test(ref.path || '')) continue;
    const bytes = readRef(ref, roots, budget, 'S12', fail);
    if (!bytes) { valid = false; continue; }
    let observation;
    try { observation = parseDocument(bytes); }
    catch {
      reject('SCENARIO_EVIDENCE_INVALID', 'Declared Observation JSON must be a readable object.');
      continue;
    }
    if (observation.scenarioId !== planned.id
      || own(observation, 'schemaVersion') && observation.schemaVersion !== ref.schemaVersion
      || own(observation, 'requestRef') && byteIdentity(observation.requestRef) !== byteIdentity(requestRef)
      || own(observation, 'candidateRef') && byteIdentity(observation.candidateRef) !== byteIdentity(candidateRef)) {
      reject('SCENARIO_EVIDENCE_BINDING', 'Declared Observation must identify this scenario and retain any declared request/Candidate version binding.');
      continue;
    }
    compare(observation);
  }
  for (const field of fields) if (!verified.has(field))
    reject('SCENARIO_VERIFICATION_REQUIRED', 'Frozen ' + field + ' needs matching inline or declared Observation verification; raw evidence hashes and PASS are insufficient.');
  return valid;
}

function evaluateFinal(final, stages, roots, budget, fail) {
  let ok = true;
  const reject = (code, message) => { fail('S12', code, message); ok = false; };
  if (!object(final) || !object(final.referenceAlignment)) {
    reject('FINAL_MISSING', 'Final independent Qualification, Fresh Run, coverage and reference alignment are required.');
    return { verdict: 'fail' };
  }
  const alignment = final.referenceAlignment;
  if (alignment.basis !== 'requirements' || alignment.verdict !== 'compliant'
    || !object(alignment.aspects) || Object.keys(alignment.aspects).length !== ALIGNMENT_ASPECTS.length
    || ['dimensions', 'score', 'threshold', 'similarity'].some(field => own(alignment, field)))
    reject('REFERENCE_ALIGNMENT', 'Use six requirement-based compliance assessments, not a numeric or similarity threshold.');
  const reference = readRef(alignment.referenceRef, roots, budget, 'S12', fail);
  if (!reference || alignment.referenceRef.kind !== 'ReferenceAnswer') {
    reject('REFERENCE_SOURCE', 'Alignment requires the actual frozen reference; missing reference blocks comparison.');
  }
  for (const aspect of ALIGNMENT_ASPECTS) {
    const detail = alignment.aspects?.[aspect];
    if (detail?.verdict !== 'compliant' || !text(detail?.reason) || !text(detail?.differences)
      || !Array.isArray(detail?.requirementRefs) || !detail.requirementRefs.length
      || !Array.isArray(detail?.refs) || !detail.refs.length) {
      reject('REFERENCE_EVIDENCE', 'Each aspect needs a compliance conclusion, differences, requirement refs and actual evidence.');
    } else {
      for (const ref of detail.requirementRefs) {
        if (!stages.S1.outputs?.some(output => output.kind === 'TaskContract' && identity(output) === identity(ref)))
          reject('REFERENCE_REQUIREMENTS', 'Comparison must bind the current authoritative TaskContract.');
        if (!verifyRef(ref, roots, budget, 'S12', fail)) ok = false;
      }
      for (const ref of detail.refs) if (!verifyRef(ref, roots, budget, 'S12', fail)) ok = false;
    }
  }
  if (final.referenceAlignment.hardFails?.length || !Array.isArray(final.referenceAlignment.hardFails))
    reject('REFERENCE_HARD_FAIL', 'Reference Alignment must have zero Hard Fails.');
  if (final.qualification !== 'pass' || final.freshRun !== 'pass' || final.requirementCoverage !== 'pass'
    || !Array.isArray(final.requestedScenarios) || !final.requestedScenarios.length
    || final.requestedScenarios.some(item => item.status !== 'pass')) {
    reject('FINAL_COVERAGE', 'Qualification, Fresh Run and every requested scenario/requirement must pass.');
  }
  if (!Array.isArray(final.evidence) || !final.evidence.length) reject('FINAL_EVIDENCE', 'Final evaluation needs bound independent evidence.');
  else for (const ref of final.evidence) if (!verifyRef(ref, roots, budget, 'S12', fail)) ok = false;
  // Requested scope/scenarios come from S12's predeclared request input,
  // not from the post-run QualificationRecord or the final summary alone.
  // Required business criteria also bind to S1's TaskContract.
  const contractRef = stages.S1.outputs?.find(ref => ref.kind === 'TaskContract');
  const qualificationRef = stages.S12.outputs?.find(ref => ref.kind === 'QualificationRecord');
  const contractBytes = contractRef && readRef(contractRef, roots, budget, 'S1', fail);
  const qualificationBytes = qualificationRef && readRef(qualificationRef, roots, budget, 'S12', fail);
  const requestBytes = stages.S12.qualificationRequestRef
    && readRef(stages.S12.qualificationRequestRef, roots, budget, 'S12', fail);
  let contract, qualification, request;
  try { if (contractBytes) contract = parseDocument(contractBytes); }
  catch { reject('CONTRACT_INVALID', 'Frozen S1 TaskContract is not readable JSON.'); }
  try { if (qualificationBytes) qualification = parseDocument(qualificationBytes); }
  catch { reject('QUALIFICATION_INVALID', 'S12 QualificationRecord is not readable JSON.'); }
  try { if (requestBytes) request = parseDocument(requestBytes); }
  catch { reject('QUALIFICATION_REQUEST_INVALID', 'Predeclared S12 request is not readable JSON.'); }
  if (!contract || !qualification || qualification.verdict !== 'pass'
    || byteIdentity(qualification.candidateRef) !== byteIdentity(stages.S11.candidate?.find(ref => ref.kind === 'CandidateManifest'))
    || byteIdentity(qualification.contractRef) !== byteIdentity(contractRef)) {
    reject('QUALIFICATION_BINDING', 'S12 must bind the frozen Candidate and S1 contract with a PASS record.');
  }
  if (!request || !['fresh-calculator-s12/v1', 'agent-to-recipe/v1'].includes(request.schemaVersion)
    || byteIdentity(request.candidateRef) !== byteIdentity(stages.S11.candidate?.find(ref => ref.kind === 'CandidateManifest'))
    || byteIdentity(request.contractRef) !== byteIdentity(contractRef)) {
    reject('QUALIFICATION_REQUEST_BINDING', 'Predeclared S12 request must bind the exact Candidate and S1 contract.');
  }
  const criteria = contract?.successCriteria;
  const covered = final.requirementCriteria;
  if (request?.requiredCriteria && (!Array.isArray(request.requiredCriteria)
    || request.requiredCriteria.length !== criteria?.length
    || criteria.some(item => !request.requiredCriteria.includes(item.criterionId)))) {
    reject('REQUEST_CRITERIA', 'Predeclared S12 request may not omit frozen TaskContract criteria.');
  }
  if (!Array.isArray(criteria) || !criteria.length || !Array.isArray(covered)
    || covered.length !== criteria.length
    || criteria.some(item => !text(item.criterionId) || !covered.some(result =>
      result.criterionId === item.criterionId && result.status === 'pass'
      && Array.isArray(result.evidence) && result.evidence.length))) {
    reject('REQUIREMENT_COVERAGE', 'Every frozen TaskContract success criterion needs distinct PASS evidence.');
  } else for (const item of covered) for (const ref of item.evidence) {
    if (!verifyRef(ref, roots, budget, 'S12', fail)) ok = false;
  }
  const scope = qualification?.qualificationScope;
  const requested = scope?.requested;
  const frozenRequested = request?.requested || request?.qualificationScope?.requested;
  const frozenScenarios = request?.scenarios;
  const exercised = scope?.exercised;
  const qualified = scope?.qualified;
  const scenarios = qualification?.scenarios;
  const finalIds = final.requestedScenarios?.map(item => item.id);
  if (Array.isArray(frozenScenarios) && Array.isArray(scenarios)) {
    const criterionIds = new Set((Array.isArray(criteria) ? criteria : []).map(item => item.criterionId));
    for (const planned of frozenScenarios) {
      if (planned.criterionRefs !== undefined && (!Array.isArray(planned.criterionRefs)
        || planned.criterionRefs.some(id => !criterionIds.has(id)))) {
        reject('SCENARIO_CRITERIA', 'Predeclared scenario criteria must refer to the frozen TaskContract.');
      }
      for (const actual of scenarios.filter(item => item.id === planned.id)) {
        if (!validateScenarioDefinitions(planned, actual, stages.S12.qualificationRequestRef,
          stages.S11.candidate?.find(ref => ref.kind === 'CandidateManifest'), roots, budget, fail)) ok = false;
        if (Array.isArray(planned.criterionRefs) && planned.criterionRefs.length
          && (!Array.isArray(actual.criterionRefs)
            || planned.criterionRefs.some(id => !actual.criterionRefs.includes(id)))
          || actual.criterionRefs !== undefined && (!Array.isArray(actual.criterionRefs)
            || actual.criterionRefs.some(id => !criterionIds.has(id)))) {
          reject('SCENARIO_CRITERIA', 'Actual scenario must cover its predeclared TaskContract criteria.');
        }
      }
    }
  }
  if (!Array.isArray(requested) || !requested.length || !Array.isArray(exercised)
    || !Array.isArray(qualified) || !Array.isArray(scenarios)
    || !Array.isArray(frozenRequested) || !frozenRequested.length
    || !Array.isArray(frozenScenarios) || !frozenScenarios.length
    || frozenRequested.length !== requested.length
    || frozenRequested.some(id => !requested.includes(id))
    || frozenScenarios.some(planned => !text(planned.id)
      || !Array.isArray(planned.scopeRefs) || !planned.scopeRefs.length
      || !scenarios.some(actual => actual.id === planned.id && actual.verdict === 'pass'
        && Array.isArray(actual.scopeRefs)
        && planned.scopeRefs.every(id => actual.scopeRefs.includes(id))
        && Array.isArray(actual.evidenceRefs) && actual.evidenceRefs.length))
    || scenarios.some(actual => actual.scopeRefs?.some(id => frozenRequested.includes(id))
      && !frozenScenarios.some(planned => planned.id === actual.id))
    || !Array.isArray(finalIds) || finalIds.length !== requested.length
    || new Set(requested).size !== requested.length || new Set(finalIds).size !== finalIds.length
    || new Set(qualified).size !== qualified.length || new Set(exercised).size !== exercised.length
    || qualified.some(id => !requested.includes(id) || !exercised.includes(id))
    || scope.excluded?.some(id => requested.includes(id))
    || requested.some(id => !text(id) || !exercised.includes(id) || !qualified.includes(id)
      || !finalIds.includes(id) || !scenarios.some(scenario => scenario.scopeRefs?.includes(id)
        && scenario.verdict === 'pass' && Array.isArray(scenario.evidenceRefs)
        && scenario.evidenceRefs.length))
    || scenarios.some(scenario => scenario.scopeRefs?.some(id => requested.includes(id))
      && scenario.verdict !== 'pass')
    || !Array.isArray(qualification?.failedCriteria || [])
    || !Array.isArray(qualification?.skipped || [])
    || (qualification?.failedCriteria || []).length || (qualification?.skipped || []).length) {
    reject('REQUESTED_SCOPE', 'Every frozen requested scenario must be exercised, qualified and evidenced.');
  } else for (const scenario of scenarios.filter(item => item.scopeRefs?.some(id => requested.includes(id)))) {
    for (const ref of scenario.evidenceRefs) if (!verifyRef(ref, roots, budget, 'S12', fail)) ok = false;
  }
  if (!text(final.evaluator) || final.evaluator === stages.S11.producer)
    reject('FINAL_INDEPENDENCE', 'Final reference evaluator must be identified and independent of Candidate production.');
  if (final.findings !== undefined && (!Array.isArray(final.findings)
    || final.findings.some(item => item.blocking)))
    reject('FINAL_FINDINGS', 'Blocking final findings must return to their first real owner for repair.');
  for (const ref of [...(stages.S11.candidate || []), ...(stages.S11.dependencies || [])]) {
    if (!final.candidateRefs?.some(bound => identity(bound) === identity(ref)))
      reject('FINAL_CANDIDATE', 'Final evaluation must bind the exact frozen source/manifest/dependencies.');
  }
  return { verdict: ok ? 'pass' : 'fail', referenceAlignment: alignment,
    qualification: final.qualification, freshRun: final.freshRun, requirementCoverage: final.requirementCoverage };
}

function parseArgs(args) {
  const options = { roots: [], format: 'json' };
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (flag === '--final') { options.final = true; i -= 1; continue; }
    if (!['--record', '--root', '--from', '--to', '--format', '--review-dir'].includes(flag) || !args[i + 1]) throw new Error('Unsupported or missing option: ' + flag);
    const value = args[i + 1];
    if (flag === '--root') {
      const delimiter = value.indexOf('=');
      if (delimiter < 1) throw new Error('Use --root id=/absolute/directory');
      options.roots.push([value.slice(0, delimiter), value.slice(delimiter + 1)]);
    } else options[flag.slice(2)] = value;
  }
  if (!['json', 'markdown'].includes(options.format)) throw new Error('Use --format json or markdown.');
  return options;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = checkWorkflowStage(options);
    if (options['review-dir']) writeWorkflowReviewBundle(report, options['review-dir']);
    process.stdout.write(options.format === 'markdown'
      ? renderWorkflowReview(report) + '\n'
      : JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.allowed ? 0 : 2;
  } catch (error) {
    process.stderr.write(JSON.stringify({ verdict: 'fail', code: 'USAGE', message: error.message }) + '\n');
    process.exitCode = 2;
  }
}

module.exports = { checkWorkflowStage, writeWorkflowReviewBundle, STAGES, WEIGHTS };
