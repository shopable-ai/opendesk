---
name: procedure-synthesize
description: Convert fixed DistilledSteps into an Agent-to-Recipe SemanticProcedure for S8-S9. Use for Business Steps, parameters, runtime data dependencies, reusable scope, and completion semantics. Do not silently reread Raw Trace or maintain a second action-disposition record.
---

# 业务过程提炼（procedure-synthesize｜S8—S9）

把已确认必要路径表达为业务步骤、参数和运行时数据关系。只拥有业务解释，不重新拥有原始动作取舍。

## 输入：必须拿到什么

- 固定 TaskContract／WorkPlan：目标、约束、计划和本次复用范围。
- 固定 DistilledSteps：必要步骤、源动作、输入输出、依赖、取舍及未决项。
- 解释这条路径所必需的 AppProfile 与定向补证，不默认阅读全部历史。

发现原动作 retain／merge／omit 错误，返回 `trace-distill`；不能在 Procedure 内重读 Raw Trace 并维护第二套 actionDecisions。
只读检查器可以机械核对上游引用和来源，这不等于让语义 Producer 重新判断 S7。

## 方法：生产什么判断

1. 核对输入版本、当前目标与范围；保留来源事实、解释、建议和 Unknown 的区别。
2. 将每个 DistilledStep 映射到有序 Business Step。保持准备、实际动作、读取、验证和停止条件；当前成功路径切片要求源步骤恰被映射一次，不丢失、不重排。新建或策略修订的步骤明确 `stepId / purpose / sourceStepRefs / inputs / inputSources / preconditions / execution / observation / outputs / postconditions / verification / stopConditions / consumers / sideEffects`；execution 表达业务操作或 helper 意图，具体 OpenDesk API 选择放在 capabilityDecisions。
3. 区分用户输入、Config、Secret 引用、不变量、运行时值、Expected 和未知。观察到的样例不能成为运行时值的默认参数。
4. 每个运行时值写明生产步骤、消费步骤、允许变换、有效期与重新取得规则。生产者输出与消费者输入必须相接。
5. 将已观察的能力选择归纳为最小 capabilityDecisions：业务需要、短阅读路径、候选及 selected／rejected／failed／not-run 处置、选中契约／公共约束、运行验证依据、Recipe 消费者和重验条件。不得编造过去的失败或为了记录整齐重跑候选。S2—S6／S10 依据不足就返回具体缺口，不从最终代码倒推已完成发现／选型／验证；不复制 API 正文或新增能力 Registry。
6. 写清应用操作需要、前后条件、副作用、支持范围、排除范围和未决项。当前 API 的能力发现和契约读取按既有 Markdown 入口，不能因示例就规定全局 API 优先级。
7. 发布 SemanticProcedure；应用规则缺口交 S10 补强，事实缺口返回示范，业务解释缺口留在本环节。草案或限定范围结果不得冒充正常生成可消费的完整过程。

## 输出长什么样

以下是 [Frozen Fixture](../../../../tests/workflows/fixtures/calculator-artifact-chain/source.json) 的字段节选，不是完整生产工件：

```text
D030 → B025：outputs=[firstResult]；含义是从本次 UI 读取
D050 → B040：inputs=[secondMultiplier,firstResult]
dataDependencies：producer=B025；value=firstResult；consumer=B040
允许变换：字符展开；不是重新计算，不是替换为 110
```

主输出为 SemanticProcedure，包含 Business Steps、参数分类、数据关系、操作需要、支持范围和未决项；handoff 固定其版本。
下游为 `application-engineer` 的 harden／repair，以及输入就绪后的 `recipe-build`。

## 检查与交接

从仓库根目录运行，参数替换为已存在的冻结材料：

```bash
node workflows/agent-to-recipe/scripts/check-artifact-chain.js --through procedure-synthesize --dossier <dossier.json> --actions <actions.json> --distilled <distilled-steps.json> --procedure <procedure.json> --root <id=directory>
```

无需 Candidate 或 Qualification；加 `--format markdown` 查看实际字段、来源与检查结果。正常交接需源步骤覆盖、顺序与数据关系成立，不得出现第二套原动作取舍。

检查器仍是已有成功示范支撑的 Calculator 形状切片，不是通用语义证明。当前切片要求所选方法有记录的 runtimeValidation；需要 S10 才能验证的能力应如实保留为缺口／草案，再补证重查，不能为了 PASS 伪填运行状态。
自动化检查不替代适用 Gate、证据来源审阅和 handoff 发布。模型方法、确定性检查和真实业务资格分别判断。

正反例包括：遗漏源步骤、重排步骤、真实值改为参数、错接生产者、丢失消费者、能力选择无依据；测试命令为 `node --test tests/workflows/artifact-chain.test.js`，它不调用模型 Producer。
字段唯一依据：[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)；全链解释见[交接审阅地图](../../design/acceptance-map.md)。
