# procedure-synthesize｜输出规格

## 主产物

输出唯一 SemanticProcedure；正式 schema 以共享合同为准。本 Skill 不创建第二套 actionDecisions 或平行业务过程格式。

## Business Step

每个 Business Step 应能独立被下游理解：

| 字段/概念 | 要求 |
| --- | --- |
| purpose | 业务目的，不是 API 名称 |
| sourceStepRefs | 指向 S7 必要步骤，覆盖可追 |
| inputs/inputSources | 每个输入只有一个正确来源 |
| execution intent | 业务操作/helper 意图，不是最终 JS |
| observation/outputs | 业务上需要读取/产出的东西 |
| verification/stopConditions | 如何确认完成或停止 |
| consumers | 输出被哪些后续步骤使用 |
| sideEffects | 业务副作用和约束 |

## 参数与运行时值

- parameters/config/secrets/invariants/runtimeValues/expected/unknown 必须分开。
- runtime value 不进入 parameter/default 常量。
- 每个 runtime value 明确 producer、consumer、transform、validity、reacquire。
- actual transform 与 allowed transforms 分开记录。
- 同一输入不能同时声明 runtime 来源和 Expected/常量来源。

## Data dependency

至少能够表达：

```text
producer Business Step
→ runtime value
→ transform
→ consumer Business Step input
```

如果一个值有多个 consumers，逐一建关系；同一步多个 consumers 可以有不同 transform。终点读取必须连接 final output。

## Capability/application handoff

只保留 S10/S11 真正需要的业务关系、target relation、selected capability、canonical/constraint refs、runtimeValidation 状态、pending engineering 和 revalidation 条件。不复制大段 API 正文，不从最终代码倒造历史选择。

## 裁剪与业务能力边界的可读投影

按[总框架的裁剪与落盘关系](../../../../../docs/frameworks/automation-problem-solving-framework.md#case-tailoring)和[正式模板](../templates/semantic-procedure.md)组织正文。这里只展开现有 scope、Business Steps、dataDependencies、capabilityDecisions 与 pending engineering，不新增 schema、评分对象或平行产物。

本次应能看见：任务需要哪些模式及来源，不需要哪些、哪些仍未知；每项选择被哪个 Business Step 消费；哪些相同操作合同可以复用，哪些只是本次业务顺序。任务不需要一种方法与需要但缺证必须分开；不能为规避失败裁掉 requested 项。

选择处置与 `runtimeValidation` 必须分别表达。`selected` 只说明选中，不能作为运行验证值。已选未测、未选但曾验证、实际失败均按固定来源如实保留；正式枚举以共享合同为准。

应用能力应有业务目的、输入/输出、前后条件、失败与副作用约束。未实现的方法名只作为工程意图交 S10/S11，不生成伪造的现成 API 引用。S8 不决定文件拆分，S9 不重做应用工程；S10 新选择影响固定 Procedure 时带来源交原责任更新。

人工分别读 `business-steps.md` 和 `procedure.md`，从本次 `stage-review.md` 进入；两者绑定各自阶段的精确主产物版本，不用 S9 最终结果覆盖 S8 checkpoint。格式存在只证明可读性，不证明真实阶段生产或业务成功。

## 下游可消费性

S10 应能据此补工程规则而不重猜业务语义；S11 应能据此把 Business Step 实现成 JS，而不是重新从 Raw Trace 还原流程。若 S11 还必须猜 producer、consumer 或 parameter 归属，则本产物不完整。