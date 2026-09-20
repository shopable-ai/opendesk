'use strict';

// Deterministic packet consumer, NOT a model or an implementation of the Skill.
// It performs no desktop actions and never opens a fixture/expected answer.
const fs = require('node:fs');
const key = r => [r?.rootId, r?.path, r?.sha256, r?.schemaVersion, r?.kind].join('\0');
let bytes = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { bytes += chunk; if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) process.exit(2); });
process.stdin.on('end', () => {
  try {
    if (process.argv[2]) {
      try { fs.readFileSync(process.argv[2]); throw new Error('ISOLATION_FAILED'); }
      catch (error) { if (error.code !== 'ERR_ACCESS_DENIED') throw error; process.stderr.write('FILESYSTEM_DENIED\n'); }
    }
    const packet = JSON.parse(bytes);
    const get = ref => JSON.parse(packet.files.find(item => key(item.ref) === key(ref)).content);
    let output;
    if (packet.stage === 'trace-distill') {
      const dossier = get(packet.inputs.dossier), actions = get(packet.inputs.actions);
      const groups = [];
      for (const action of actions) {
        // Optional grouping comes from synchronized source annotations, never an answer.
        const previous = groups.at(-1);
        if (action.mergeWithPrevious === true && previous) previous.push(action);
        else groups.push([action]);
      }
      const steps = groups.map((group, i) => ({ stepId: 'necessary-' + i,
        purpose: group.map(a => a.purpose).join('; '), sourceActionRefs: group.map(a => a.actionId),
        inputs: [...new Set(group.flatMap(a => a.inputs))], outputs: [...new Set(group.flatMap(a => a.outputs))],
        dependencies: i ? ['necessary-' + (i - 1)] : [], preconditions: ['上游固定状态和身份仍有效'],
        expectedOutcome: '本组已声明输入／输出及观察得到保存', verification: '核对本组原始回执及观察',
        classification: group.some(a => a.kind === 'actual-read') ? 'runtime-read' : 'business-action' }));
      const stepFor = id => steps.find(s => s.sourceActionRefs.includes(id)).stepId;
      output = { schemaVersion: 'agent-to-recipe/v1', taskId: dossier.taskId, planRevision: dossier.planRevision,
        contractRef: packet.inputs.contract, workPlanRef: packet.inputs.plan, dossierRef: packet.inputs.dossier,
        appProfileRefs: packet.inputs.appProfiles, sideEffects: dossier.sideEffects, sourceActionRefs: [packet.inputs.actions],
        evidenceRefs: dossier.runtimeValues.flatMap(v => v.evidenceRefs), steps,
        actionDecisions: actions.map(a => ({ actionRef: a.actionId, decision: a.mergeWithPrevious ? 'merge' : 'retain',
          stepRef: stepFor(a.actionId), reason: '顺序切片保留实际读取／输入；不推断可省略动作' })),
        runtimeValues: dossier.runtimeValues.map(v => ({ ...v, producerStep: stepFor(v.origin.actionRef),
          consumerSteps: v.consumers.map(id => id === 'final output' ? id : stepFor(id)),
          consumerBindings: v.consumers.filter(id => id !== 'final output').map(id => {
            const a = actions.find(a => a.actionId === id), b = a.data.bindings.find(b => b.name === v.name);
            return { actionRef: id, targetId: a.data.targetId, transform: b.transform, observedInput: b.actual };
          }) })), recoveryCandidates: [], unresolved: [] };
    } else {
      const d = get(packet.inputs.distilled);
      const stepFor = id => d.steps.find(s => s.sourceActionRefs.includes(id)).stepId;
      const businessFor = id => 'business-' + d.steps.findIndex(s => s.stepId === id);
      const mapped = id => id === 'final output' ? id : businessFor(id);
      const selections = (packet.inputs.supplementRefs || []).filter(ref => ref.kind === 'evidence')
        .map(ref => ({ ref, data: get(ref) })).filter(r => r.data.recordKind === 'capability-selection');
      output = { schemaVersion: 'agent-to-recipe/v1', distilledStepsRef: packet.inputs.distilled,
        businessSteps: d.steps.map(s => ({ stepId: businessFor(s.stepId), purpose: s.purpose, sourceStepRefs: [s.stepId],
          inputs: s.inputs, outputs: s.outputs,
          inputSources: s.inputs.map(name => ({ name, kind: 'runtime-value', producer: mapped(d.runtimeValues.find(v => v.name === name).producerStep) })),
          preconditions: s.preconditions, execution: s.purpose, observation: s.outputs.length ? '保存本次实际读取值' : '保存动作回执',
          postconditions: [s.expectedOutcome], verification: s.verification,
          stopConditions: ['身份、读值、回执或副作用不确定时停止，不重放'],
          consumers: [...new Set(d.runtimeValues.filter(v => v.producerStep === s.stepId).flatMap(v => v.consumerSteps.map(mapped)))],
          sideEffects: s.inputs.length ? ['界面输入可能已发生，须确认后再继续'] : [] })),
        parameters: [], config: [], secretRefs: [], evidenceRefs: d.runtimeValues.flatMap(v => v.evidenceRefs),
        retainedReasons: d.steps.map(s => ({ stepId: businessFor(s.stepId), reason: s.purpose })), omittedReasons: [], runtimeValues: d.runtimeValues.map(v => ({ ...v,
          producerStep: mapped(v.producerStep), consumerSteps: v.consumerSteps.map(mapped) })),
        dataDependencies: d.runtimeValues.flatMap(v => v.consumerBindings.map(b => ({ producer: mapped(v.producerStep),
          value: v.name, consumer: mapped(stepFor(b.actionRef)), transform: b.transform }))),
        capabilityDecisions: selections.flatMap(({ ref, data }) => data.capabilityDecisions.map(decision => {
          const result = { ...decision, sourceRef: ref,
            businessStepRefs: [...new Set(decision.sourceActionRefs.map(id => mapped(stepFor(id))))] };
          delete result.sourceActionRefs; return result;
        })), supportedScope: '顺序读取／消费／终点读值的声明切片，不是业务资格', recoveryCandidates: [],
        unresolved: selections.length ? [] : [{ field: 'capabilityDecisions', owner: 'task-demonstrate',
          reason: '缺实际能力选型来源；不能从 API 文档或标准答案补造' }] };
    }
    process.stdout.write(JSON.stringify(output));
  } catch (error) { process.stderr.write(String(error.message)); process.exitCode = 1; }
});
