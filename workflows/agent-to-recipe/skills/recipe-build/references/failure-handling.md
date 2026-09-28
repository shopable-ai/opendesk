# recipe-build｜失败处理与返回

## 路由

| 问题 | 返回 |
| --- | --- |
| 目标/授权/success criteria 变化 | S1 |
| 历史 actual/read/consumer 事实缺失 | task-demonstrate |
| S7 necessary-path 错误 | trace-distill |
| Business Step/参数/runtime dataflow 语义错误 | procedure-synthesize |
| 业务所需 capabilityDecision / selectedMethod 尚未确定，或 SemanticProcedure 缺该选择 | procedure-synthesize / S9 |
| selectedMethod 已确定，但 AppProfile / operation rule 未落实对应 API binding、locator/read/wait/action、runtime guard 或适用范围 | application-engineer / S10 |
| 上游已有 selected canonical contract / shared constraint 的精确绑定，但本次 request 漏交正文或固定 ref | 协调者补交 |
| app identity/locator/read/wait/action rule 缺失 | application-engineer |
| JS/API usage/control flow/data binding bug | 本 Skill |
| Oracle/qualification evidence 问题 | recipe-qualify |
| 已有材料漏交 | 协调者 |

## 路由原则

selected API contract 缺失时先判断“选择没有完成”“操作规则没有落实”还是“已经存在但材料漏交”，分别返回 procedure-synthesize / S9、application-engineer / S10 或协调者。S11 不为绕过缺口自行重做无必要 Capability Discovery，也不因找到一个看起来可用的 API 就改变上游 capabilityDecision。

## 修复

保留旧 Candidate、旧失败和有效上游。只修 S11 bug 时做最小代码变化，生成新 script hash/new Candidate，并列受影响 criteria/dataflow/API/scope；交 S12 重验受影响范围和必要回归。

unknown side effect 先核对环境，不因为“代码已修好”自动重放业务。

若没有代码变化且原 Candidate 仍适用，可原样复用，但不因此获得新环境/新输入资格。