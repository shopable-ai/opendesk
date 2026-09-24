# task-demonstrate｜输出规格

## 主产物

交付唯一 DemonstrationDossier，加固定 Raw Trace/Execution/Evidence 引用及必要可读视图。正式字段沿用共享合同，不创建第二套执行记录 schema。

## 必须可回答的问题

每个示范包必须让未参与执行的 S7 消费者回答：

1. 原计划是什么，实际执行了什么？
2. 每个 actual 对应哪个 planned step；偏离在哪里？
3. 每项 expected 是什么，真正 observation 是什么？
4. 哪些值是本次 actual read 得到的 runtime value？
5. 每个 runtime value 被哪些 actual consumer 使用，实际输入和 transform 是什么？
6. 发生了哪些副作用，哪些 confirmed/unknown/partial？
7. 每个 success criterion 的真实证据和状态是什么？

## 最小交付内容

| 内容 | 交付要求 |
| --- | --- |
| planned/actual mapping | planned ref、actual action、目标、输入、回执、偏差/恢复关联 |
| observations | 来源、应用/目标、实际原始内容、与 action 的顺序关系 |
| runtimeValues | name/type/observedValue/origin/evidence/consumers/validity/reacquireOnFreshRun |
| consumer bindings | consumer action/target、actual input、actual transform、对应值 |
| verification | criterion、expected、actual observation、evidence、状态 |
| sideEffects/unresolved | 最后可信状态、unknown/partial、停止点、下一安全动作 |
| capability facts | 实际候选/选择/契约/运行状态；not-run 不伪造 evidence |

终点读取即使没有下一个动作，也必须保留 final output。无业务输出的动作可以没有数据消费者，但若承担状态准备、安全或验证作用仍保留原事实给 S7 判断。

## 明确禁止的输出

- 用最终 JS/Procedure 生成“看起来应该发生”的 action trace。
- 把 Expected 写入 observedValue。
- 只保存最终答案而省略 firstResult 等后续实际消费值。
- 只写变量名，不记录实际 consumer 的输入与 transform。
- 把 action receipt 当成业务 observation。
- 把新补采的观察改写成旧 execution 当时的事实。

## 下游消费

正常消费者是 trace-distill。S7 可读取原事实做动作取舍，但不能要求本 Skill先做 retain/omit。procedure-synthesize 后续需要的必要事实通过 S7 投影和明确定向材料获得，不因 lineage 获得全历史读取权。

失败包也可交诊断，但必须标明不能进入正常成功路径。