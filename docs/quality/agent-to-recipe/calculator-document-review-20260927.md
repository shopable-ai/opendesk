# Calculator 案例文档｜端到端可检查基准复核（2026-09-28）

## 1. 复核对象与基线

本轮修改前 master：

~~~text
0e4d1dd8cf388405810a3f685e0bd36a30095ffd
~~~

主要复核对象：

~~~text
workflows/agent-to-recipe/cases/calculator.md
~~~

正式依据：

- workflows/agent-to-recipe/WORKFLOW.md
- workflows/agent-to-recipe/design/task-decomposition.md
- workflows/agent-to-recipe/design/chain-design.md
- workflows/agent-to-recipe/design/acceptance-map.md
- workflows/agent-to-recipe/design/validation-plan.md
- application-engineer / task-demonstrate / trace-distill / procedure-synthesize / recipe-build / recipe-qualify 的 Calculator examples
- examples/agent-to-recipe/calculator-current.js
- examples/agent-to-recipe/calculator-fresh-20260927.js

automation-plan 与 code-rebuild 当前目录没有单独 Calculator example；本轮没有把不存在的文件当证据。

## 2. 修改前真正的问题

修改前主案例已经具备不少正确数据关系，也已经把 S3/S4/S5/S6 与 S8/S9 拆开过，但仍不是一个稳定的“端到端可检查基准案例”。

主要问题：

1. 文件前部被一次 2026-09-27 运行历史、.runtime 路径、版本号和修订记录占据，新读者必须先穿过历史上下文才能看到主链。
2. S1—S12 没有统一使用同一套“收到什么 → 做什么 → 参考案例 → 正确输出 → 判断 → 错误 → 返回 → 最低继续条件”结构。
3. 部分阶段虽然已经独立出现，但信息量和诊断格式不一致，仍需要跨章节拼接。
4. 编号 A005 / D030 / B025 与英文 artifact 名在部分位置仍比业务含义更突出。
5. 历史真实运行、synthetic fixture、当前源码、Expected/Oracle 四种证据类型交织，需要更清楚地分层。
6. Delivery / Publish 边界没有成为与 S1—S12 主链同等可见的末端检查点。
7. 原质量复核记录只覆盖前一轮“拆分阶段 / 修 S7 可读性”，已经不能代表新的端到端结构。

## 3. 本轮重构后的信息架构

新的 Calculator 主案例按下面顺序组织：

~~~text
原始需求与 Expected/Runtime 分离
  ↓
证据类型边界
  ↓
S1—S12 全链路阶段地图
  ↓
黄金数据链
  ↓
S1 统一阶段参考卡
...
  ↓
S12 统一阶段参考卡
  ↓
最终 Delivery / Publish Handoff
  ↓
首错定位矩阵
  ↓
最小返工规则
  ↓
一页数据链检查表
  ↓
权威 owner / 深入材料
~~~

每个正式阶段都固定 9 个栏目：

1. 这一阶段解决什么问题
2. 这一阶段收到什么
3. 这一阶段具体做什么
4. Calculator 参考案例
5. 正确输出应该长什么样
6. 怎样判断这一阶段做对了
7. 典型错误
8. 如果这里错了，返回哪里
9. 可以进入下一阶段的最低条件

因此 S3—S6 与 S8—S9 不再可能因为“同一个 Skill 承担”而失去正式阶段级诊断。

## 4. 为什么 S1—S12 的阶段划分仍然成立

每个阶段都把一种不同性质的输入变成另一种不同性质的结果：

| 阶段 | 核心变换 | 为什么不能与相邻阶段混为一件事 |
| --- | --- | --- |
| S1 | 原始要求 → TaskContract / WorkPlan | 用户意图和授权不能由后续应用观察代替 |
| S2 | 合同 → 最小 AppProfile / 对象认识 | 知道目标对象不等于已经执行动作 |
| S3 | planned step → actual action fact | 动作发生不等于业务效果成立 |
| S4 | action fact → actual observation / verification | observation 不等于下一步决策 |
| S5 | verified fact → continue/revise/recover/stop | 决策不能反写过去事实 |
| S6 | 多轮微循环 → 任务级 Dossier | 收口不能补造真实执行 |
| S7 | 真实记录 → 必要步骤 | 取舍不能偷做业务泛化 |
| S8 | 必要步骤 → Business Steps | 业务解释不能等同参数/复用规格 |
| S9 | Business Steps → SemanticProcedure | runtime value / scope / branch 是新的复用层责任 |
| S10 | Procedure → 可靠应用规则 | locator/read/wait 工程不能重写业务语义 |
| S11 | 规格 + 规则 → exact Candidate | 实现不能自证资格 |
| S12 | frozen Candidate → Qualification | Qualification 不能修改被测对象 |

Delivery / Publish Handoff 消费 S12 的资格结果，但不产生新的 S13。

## 5. 本轮最重要的 Calculator 诊断关系

黄金数据链：

~~~text
第一次结果显示区
  → actual firstResult
  → 保存到任务数据
  → 第二次 clear 只清 UI
  → firstResult 仍保留
  → characters
  → 第二次实际按钮输入
  → actual finalResult
  → print + return
~~~

各阶段的最关键错误分别是：

| 阶段 | 典型首错 |
| --- | --- |
| S1 | Expected 110 被写成 runtime firstResult 来源 |
| S2 | 无证据猜按钮/结果区 |
| S3 | planned read 冒充 actual read |
| S4 | receipt / Expected 冒充 observation |
| S5 | uncertain 仍 continue；第二次 clear 被当 off-task |
| S6 | 只留下 final=660，丢 firstResult 来源→消费 |
| S7 | 误删首值读取、去重 1,1,0、误删第二次 clear |
| S8 | B040 已写成 input=110 |
| S9 | firstResult.default=110 |
| S10 | read 失败 fallback=110；unknown effect 盲重放 |
| S11 | 读了 firstResult，但实际第二式仍硬编码 1,1,0 |
| S12 | 验错 Candidate / 漏 requested scenario |
| Delivery | Qualification 被当作自动发布，或交付缺 scope/limitations/dependencies |

## 6. 修改后逐阶段静态文档设计评分

评分继续使用 validation-plan 的现有五维：

~~~text
需求与语义正确性 25
职责与独立性 20
成果与接续 20
验证与修复 20
复杂度与成本 15
~~~

这些分数只评价**文档是否足以让人检查阶段设计与案例链路**，不评价 Skill 成功率，也不等于真实 Runtime Qualification。

| 对象 | 需求与语义 | 职责与独立性 | 成果与接续 | 验证与修复 | 复杂度与成本 | 静态分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 25 | 20 | 20 | 19 | 15 | **99** |
| S2 | 25 | 20 | 20 | 18 | 15 | **98** |
| S3 | 25 | 20 | 20 | 19 | 15 | **99** |
| S4 | 25 | 20 | 20 | 19 | 15 | **99** |
| S5 | 25 | 20 | 20 | 19 | 15 | **99** |
| S6 | 25 | 20 | 20 | 19 | 15 | **99** |
| S7 | 25 | 20 | 20 | 19 | 15 | **99** |
| S8 | 25 | 20 | 20 | 19 | 15 | **99** |
| S9 | 25 | 20 | 20 | 19 | 15 | **99** |
| S10 | 25 | 20 | 20 | 18 | 15 | **98** |
| S11 | 25 | 20 | 20 | 19 | 15 | **99** |
| S12 | 25 | 20 | 20 | 17 | 15 | **97** |
| Delivery / Publish Handoff | 24 | 20 | 20 | 19 | 15 | **98** |

不计算平均分；不存在用高分掩盖低分的情况。

### 保留扣分原因

S1：
- 主案例展示可读合同切片，不复制完整正式 schema。

S2 / S10：
- 文档能明确如何判断正确，但没有把所有 layout / locale / 多窗口变化场景复制进案例正文；这些应留在专项应用工程与验证层。

S3—S9 / S11：
- 阶段卡已经足够独立诊断，但案例不复制全部正式 JSON / evidence bytes，以避免主案例退化成工件 dump。

S12：
- 结构上明确 Candidate identity、TaskContract、scope、scenario、environment、Oracle、execution、observation、evidence 和 verdict；
- 但 2026-09-27 原始 .runtime 证据不是版本控制资产，本轮也没有重新执行真实 Calculator，所以文档只能诚实地区分“历史运行说明”与“本轮新 Qualification”。

Delivery：
- 交付条件清楚，但本轮没有实际执行 Catalog / Publisher 注册，因此这里只能评价 handoff 设计。

## 7. 哪些结论仍然只是静态的

本轮已经能静态检查：

- 原始需求是否被 S1 正确保留；
- S1—S12 每个正式阶段的职责边界；
- 每阶段关键 Calculator 输入、输出、典型错误与返工方向；
- firstResult 的 producer → consumer 数据链；
- S3/S4/S5/S6 与 S8/S9 的首错定位；
- Candidate 代码层是否应真实消费 runtime firstResult；
- S12 和 Delivery 的证明/发布边界。

这些不是以下更高层证明：

- 原版 Skill 在独立新模型上下文中的成功率；
- 宿主是否自动加载每个 Skill；
- 未见新应用/新任务上的方法泛化；
- 当前 Calculator 真实桌面 Fresh Run；
- 当前 Candidate 在其他 locale / layout / platform 上的稳定性；
- 参数化输入复用；
- 新使用者只凭交付包运行；
- 实际 Catalog / Publisher 发布成功。

## 8. 对历史 Calculator 运行记录的处理

旧主案例顶部保存了大量 2026-09-27 运行叙事。那些记录有价值，但不应该成为理解 S1—S12 的前置条件。

新主案例只保留必要边界：

- 历史记录曾有两个独立 execution；
- 曾记录 firstResult="110"、finalResult="660" 与原生按钮回执；
- 当前仓库保留了对应实现参考；
- 原始 .runtime 证据未进入 Git；
- 本轮没有重新运行，因此不把静态文档改进写成新的 L4 Qualification。

这能同时避免两个错误：

~~~text
历史运行存在
≠
当前 fresh checkout 可以独立复核全部原始证据

文档静态评分 99
≠
Skill / Runtime / Candidate 真实成功率 99%
~~~

## 9. 本轮不需要机械修改的文件

以下文件在本轮审查后仍保持正确职责，因此不为了“看起来改得多”而修改：

- WORKFLOW.md：已经明确责任分组不等于阶段合并。
- task-decomposition.md：S1—S12 正式阶段定义已经正确，是本轮基准。
- chain-design.md：允许按 Skill / handoff 分组，并明确阶段仍独立。
- acceptance-map.md：外部边界可分组，同时已有 S3/S4/S5/S6 与 S8/S9 内部诊断。
- validation-plan.md：已有五维评分、证明层、Hard Fail 与 S12 证据强度规则。

## 10. 最终验收问题

本轮文档设计的最终标准不是“文件齐全”或“评分高”，而是：

> **一个完全没有旧聊天上下文的人，只阅读 cases/calculator.md，是否能够沿着需求 → S1 → … → S12 → Delivery，判断每一步做了什么、收到什么、产出什么、哪里可能错、错了回哪里、哪些上游不用重做？**

按当前静态结构，答案是：**可以用于这种逐阶段人工检查。**

但这个结论仅属于 L0/文档设计层。要把它升级成“Skill 方法已经独立可靠”或“当前 Candidate 已重新资格化”，仍需要对应 L2/L3/L4/L5 的独立执行证据。
