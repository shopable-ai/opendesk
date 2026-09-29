# recipe-qualify｜失败处理与返回

## 不修改对象

任何 qualification 失败都先冻结原 Candidate、attempt、scenario、actual command、environment、observed result/evidence、预算和 side effects。S12 不 patch production candidate，不降低 criterion，不改 requested scope。

## 路由

| 问题 | 返回 |
| --- | --- |
| 目标/标准/授权缺失 | S1 |
| historical actual/read/consumer 事实问题 | task-demonstrate |
| necessary path/action disposition | trace-distill |
| Business Step/parameter/runtime data semantics | procedure-synthesize |
| app locator/read/wait/action rule | application-engineer |
| JS/API/control flow/data binding | recipe-build |
| Oracle/scenario/evidence/scope/verdict 本身 | 本 Skill |
| 已有材料漏交 | 协调者 |

修复后若 Candidate bytes/dependencies 变化，创建新 Candidate 后再验；旧 Qualification 只保留旧版本证据。若只是本 Skill 的 Oracle/场景配置错误且 Candidate 未变，可新 attempt 复用同一 Candidate，但保留旧失败记录。

unknown side effect 先核对环境，不盲重放以追求干净起点。

每次失败保留七项：last confirmed correct artifact、first invalid boundary、failure owner、missed-check owner、preserved upstream、invalidated downstream、next minimum action。来源不足或未解除的报告阻断不能直接归咎于 Candidate；先定位最早有证据的责任和漏检边界。新的修复保留旧失败，不更新历史版本为新 PASS。

采用任务已授权预算；缺省同类问题最多三轮定向修复，连续两轮无新证据停止该路径或换诊断。不得通过另起 attempt 重置预算、调高分数或缩小 requested scope 获得通过。
