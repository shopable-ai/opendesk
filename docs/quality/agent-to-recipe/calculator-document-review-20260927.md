# Calculator 案例文档｜逐阶段独立设计复核（2026-09-28）

## 1. 本轮为什么再次修订

Calculator 主案例已经包含较完整的数据参考，但此前仍把 **S3—S6** 与 **S8—S9** 各作为一个检查块。

这种写法适合“同一个 Skill / 外部 handoff”的责任分组，却不适合回答：

> **如果 task-demonstrate 或 procedure-synthesize 出错，到底是哪个正式阶段首先出错？**

正式 [task-decomposition](../../../workflows/agent-to-recipe/design/task-decomposition.md) 已经给出正确阶段粒度：

- S3：Execute；
- S4：Observe / Verify；
- S5：Classify / Decide；
- S6：Close / Dossier；
- S8：Business Semantics；
- S9：Reusable Procedure。

本轮没有合并阶段，也没有新增 S13。修改目标是让案例和诊断视图与现有 S1—S12 设计一致。

## 2. 哪些地方应该分，哪些地方可以合并显示

| 文档/视图 | 正确粒度 | 原因 |
| --- | --- | --- |
| task-decomposition.md | **逐正式阶段** | 它定义 S1—S12 各自做什么 |
| cases/calculator.md | **逐正式阶段** | 它要帮助人工判断“哪一环先错” |
| acceptance-map.md | 外部责任边界可分组；另加**内部阶段诊断** | 外部 handoff 数量少于正式阶段数量 |
| WORKFLOW.md | 可按 Skill / route 分组，但必须说明**责任分组 ≠ 阶段合并** | 它是执行入口，不复制完整任务树 |
| chain-design.md | 可按 Producer / Consumer / Skill 分组，但必须说明阶段仍独立 | 它回答谁生产、交给谁 |
| Skill examples | 可按 Skill 连续展示多个阶段 | 同一个方法包可以承担多个正式阶段 |

所以，“同一个 Skill 承担 S3—S6”是正确设计；“S3—S6 只能一起判断正确/错误”不是正确设计。

## 3. S3—S6 的正确关系

~~~text
S3 Execute
  实际执行当前获准动作，并留下 actual action fact
  ↓
S4 Observe / Verify
  重新观察实际效果，与 Expected 比较
  ↓
S5 Classify / Decide
  分类并决定 continue / revise / recover / stop
  └─ continue → 下一 planned step，再回 S3
  ↓ task end
S6 Close
  汇总多轮 S3—S5，冻结 Dossier / Trace / Evidence
~~~

最关键的区别：

- S3 的 receipt 不能替代 S4 的业务 observation；
- S4 的 uncertain 不能被 S5 强行 continue；
- S6 不能补写 S3/S4 从未发生的事实。

## 4. S8 与 S9 的正确关系

~~~text
S7 DistilledSteps
  ↓
S8 Business Semantics
  D030 → B025
  D050 → B040
  firstResult 仍是业务上的 runtime input
  ↓
S9 Reusable Procedure
  firstResult 被正式分类为 runtime value
  固定 producer → transform → consumer
  定义参数、分支、scope、capability decision
~~~

如果 B040 已经写成 input=110，最早错误在 **S8**。

如果 B040 仍消费 firstResult，但 SemanticProcedure 才出现 firstResult.default=110，最早错误在 **S9**。

## 5. 修改前按独立阶段重评

此前把 S3—S6 和 S8—S9 当组合对象打高分，不符合“每个正式阶段独立判断”的要求。按阶段重新看修改前版本：

| 阶段 | 修改前问题 | 修改前文档设计分 |
| --- | --- | ---: |
| S1 | 参考合同充分；少完整 revision 样本 | **97** |
| S2 | AppProfile 切片充分；少多布局配对样本 | **97** |
| **S3** | 有 A001—A010，但 Execute 边界不清 | **88** |
| **S4** | receipt/observation 区别存在，但没有独立输入/输出/错误卡 | **82** |
| **S5** | continue/stop/setup/unknown 散落，最难独立归责 | **78** |
| **S6** | Dossier 概念存在，但与 S3—S5 没明确分开 | **84** |
| S7 | source refs、取舍和反例充分 | **100** |
| **S8** | Business Steps 与 S9 泛化混写 | **88** |
| **S9** | default 110 反例充分，但无法判断是否其实 S8 已错 | **86** |
| S10 | operation rule 切片充分 | **97** |
| S11 | Procedure→JS 正反实现充分 | **100** |
| S12 | Candidate/scope/evidence 边界充分 | **97** |

不计算综合平均。低于 95 的阶段不能被其他阶段的高分补掉。

## 6. 修改后逐阶段静态设计评分

继续沿用 [validation-plan](../../../workflows/agent-to-recipe/design/validation-plan.md#六95-分目标的评估办法) 的五维量尺。

| 阶段 | 需求与语义 25 | 职责与独立性 20 | 成果与接续 20 | 验证与修复 20 | 复杂度与成本 15 | 本轮分项 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 25 | 20 | 20 | 20 | 12 | **97** |
| S2 | 25 | 20 | 20 | 17 | 15 | **97** |
| **S3 Execute** | 25 | 20 | 20 | 17 | 15 | **97** |
| **S4 Observe / Verify** | 25 | 20 | 20 | 17 | 15 | **97** |
| **S5 Classify / Decide** | 25 | 20 | 20 | 17 | 15 | **97** |
| **S6 Close / Dossier** | 25 | 20 | 20 | 17 | 15 | **97** |
| S7 | 25 | 20 | 20 | 20 | 15 | **100** |
| **S8 Business Semantics** | 25 | 20 | 20 | 17 | 15 | **97** |
| **S9 Reusable Procedure** | 25 | 20 | 20 | 17 | 15 | **97** |
| S10 | 25 | 20 | 20 | 17 | 15 | **97** |
| S11 | 25 | 20 | 20 | 20 | 15 | **100** |
| S12 | 25 | 20 | 20 | 17 | 15 | **97** |

这些仍是**文档设计静态评分**，不是 Skill 成功率、模型可靠性或业务 Qualification。

97 的保留项主要是：

- Calculator 正文没有复制完整正式 JSON / 全字段 Dossier；
- 没有展开所有参数化、布局变化、恢复和 capability decision 组合；
- 新读者能否在限定时间内独立正确区分 S3/S4/S5/S6，仍应做独立试读；
- 文档清楚不代表宿主加载、独立上下文行为和泛化已经重新验证。

## 7. 修改后应该能直接定位的错误

| 现象 | 首先比较 | 最早责任 |
| --- | --- | --- |
| P30 计划读值，但没有真实 read action | Plan vs Raw Trace action | **S3** |
| 有 read action，但 Expected / receipt 被当 actualObservation | S3 vs S4 | **S4** |
| S4=uncertain 仍继续；第二次 clear 被当 off-task | S4 vs S5 | **S5** |
| Trace 完整，但 Dossier 只写 final=660 或漏 A005→A009 | S3—S5 vs Dossier | **S6** |
| Dossier 正确，S7 删除 A005 / 去重 1,1,0 | Dossier vs DistilledSteps | **S7** |
| DistilledSteps 正确，B040 已变成 input=110 | S7 vs Business Steps | **S8** |
| Business Steps 正确，Procedure 才出现 default=110 | S8 vs SemanticProcedure | **S9** |
| Procedure 正确，read rule fallback 到 110 | Procedure vs operation rule | **S10** |
| Procedure 正确，JS 写死 1,1,0 | Procedure vs exact JS | **S11** |
| Candidate 正确，但实际验了其他字节/漏 requested 场景 | Candidate/request vs execution | **S12** |

诊断仍采用同一个原则：

> **找第一处“输入仍然正确、输出第一次变错”的阶段边界。**

## 8. 与当前真实 Calculator 运行记录的关系

当前 Calculator 案例顶部已经记录 2026-09-27 的真实局部示范、S7→S12 绑定、两次同版 execution 及其限制，同时明确独立 S7 包 Gate FAIL、部分原件只在本地 .runtime、完整原版 Skill 泛化未验证。

本记录不重新授予或撤销这些运行结论。这里的分数只评价：

> **案例和诊断文档是否已经把每一个正式阶段写到足以单独检查的粒度。**
