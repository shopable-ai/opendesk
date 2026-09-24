# procedure-synthesize｜正确性检查

## 关键检查

| 检查 | 正确要求 | 典型错误 |
| --- | --- | --- |
| S7 边界 | 只消费固定 DistilledSteps | 重读 Raw Trace 并自己改 actionDecisions |
| source coverage | 必要步骤有序映射、无静默丢失 | 为了业务简洁删除准备/read step |
| input source | 每个输入唯一且正确 | runtime + Expected 同时作为来源 |
| runtime role | 现场值仍是 runtime | firstResult 变 parameter/default=110 |
| producer | 来自实际 read/output | producer 指向“计算逻辑”而非 UI read |
| consumer | 完整列出实际消费业务步骤 | 只写“后续使用” |
| transform | actual 与 allowed 分开 | 因允许 identity 就覆盖本次 characters |
| terminal | final read → final output | 无后续动作就删除终点读取 |
| capability | selected/not-run/validated 区分 | 有 API 文档就写 runtime pass |
| scope | 未证明分支不扩张 | 一次成功就声明任意布局/输入支持 |

## Calculator 必过反例

- firstResult producer 必须是第一次结果的实际 read 所映射 Business Step，不是 JS 算术表达式。
- consumer 必须是第二次计算步骤。
- 本次 `110` 的 transform 是 digit/character expansion；不能把 110 写成 parameter 默认值。
- Expected 110 即使与 observedValue 相同，也不能成为第二式输入来源。
- finalResult 的 read 必须连接 final output。

## Checker 限制

现有 artifact-chain checker 可检查其声明的字段和有限顺序切片，但不能证明一般语义最优、复杂分支/循环、同一步内部时序或业务政策正确。checker PASS 不是本 Skill 方法正确性的替代。