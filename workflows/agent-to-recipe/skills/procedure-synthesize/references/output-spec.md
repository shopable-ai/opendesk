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

## 下游可消费性

S10 应能据此补工程规则而不重猜业务语义；S11 应能据此把 Business Step 实现成 JS，而不是重新从 Raw Trace 还原流程。若 S11 还必须猜 producer、consumer 或 parameter 归属，则本产物不完整。