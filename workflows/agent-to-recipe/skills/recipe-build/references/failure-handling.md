# recipe-build｜失败处理与返回

## 路由

| 问题 | 返回 |
| --- | --- |
| 目标/授权/success criteria 变化 | S1 |
| 历史 actual/read/consumer 事实缺失 | task-demonstrate |
| S7 necessary-path 错误 | trace-distill |
| Business Step/参数/runtime dataflow 语义错误 | procedure-synthesize |
| app identity/locator/read/wait/action rule 缺失 | application-engineer |
| JS/API usage/control flow/data binding bug | 本 Skill |
| Oracle/qualification evidence 问题 | recipe-qualify |
| 已有材料漏交 | 协调者 |

## 修复

保留旧 Candidate、旧失败和有效上游。只修 S11 bug 时做最小代码变化，生成新 script hash/new Candidate，并列受影响 criteria/dataflow/API/scope；交 S12 重验受影响范围和必要回归。

unknown side effect 先核对环境，不因为“代码已修好”自动重放业务。

若没有代码变化且原 Candidate 仍适用，可原样复用，但不因此获得新环境/新输入资格。