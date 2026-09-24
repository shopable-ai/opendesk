# task-demonstrate｜输入规格

## 必需输入

实际读取固定 request、TaskContract、生效 WorkPlan、当前步骤所需 AppProfile/规则、获准业务输入、环境/构建/入口、权限和共享预算。核对 task/source identity、plan revision、实际字节/hash、schema、支持范围及现场适用性。

示范不要求已有 DistilledSteps、SemanticProcedure、Candidate 或 Qualification。只有最终 JS、历史截图、结果摘要、聊天中的“跑过了”或 Expected，均不能满足“本次真实示范”的事实输入。

定向补采另需：原失败或缺口、旧 Dossier/Evidence 固定版本、需要补哪一项事实以及新观察能证明的时间范围。历史无法恢复的事实不能通过今天重跑补写成过去事实。

## 六类角色进入检查

| 角色 | 必须来自 | 进入时要求 |
| --- | --- | --- |
| planned | WorkPlan/planDelta | 当前生效版本可读；未执行不写 actual |
| actual | 实际动作/调用/输入/回执 | 尚未执行时为空；不得从代码反推 |
| expected | TaskContract/预定 criterion/有来源计划 | 与 observation 分离 |
| observation | 实际 UI/业务/输出读取 | 必须有来源、对象和顺序/时间 |
| runtime value | observation 中实际读得且被保存的值 | 值、类型、origin、evidence 可追 |
| consumer | 实际后续动作 | 保存实际输入和 transform，不写理论消费者 |

## 权限与安全

区分只读资料、现场观察、导航/输入/清空、图像上传、外部提交等授权。动作、时间、重试/恢复、模型调用/费用、图像范围使用本次共享预算；缺授权只允许不依赖该权限的工作。

unknown/partial 的既有副作用会阻塞依赖动作：先观察真实状态。不能因缺回执推定未执行，也不能换后端后重复提交。

## 输入充分性判定

- **ready**：当前 planned step 所需事实、应用规则、权限和预算齐全。
- **limited**：可完成只读观察或局部补采，但不能安全执行原动作；明确限制。
- **blocked/not-run**：关键身份、规则、权限、预算或真实输入不足。
- **fail**：当前证据已证明计划前提或规则不成立。

已有材料只是漏交时先由协调者补交；原事实真的缺失才返回其责任方。