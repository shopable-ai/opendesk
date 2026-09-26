# Calculator 案例文档｜独立分项设计复核（2026-09-27）

## 1. 本轮为什么再次修改

上一轮把 Calculator 主案例拆成：

- cases/calculator.md
- cases/calculator-handoffs.md
- cases/calculator-engineering.md

虽然把历史/工程噪声从主线移开了，但用户实际阅读后指出两个问题：

1. 主案例为了简洁，把“每个阶段真正收到什么、输出什么、怎样肉眼判断错误”的参考数据压得过薄；
2. 要理解完整案例需要在多个 Calculator 专用文件之间跳转，削弱了 cases/calculator.md 作为“人工检查基准案例”的职责。

本轮据此重新收敛：

> **Calculator 主案例负责完整展示可检查的 S1—S12 参考链；深层方法、历史资格和运行证据回到已有正式 owner，不再维护两份 Calculator 专用辅助文档。**

基线是修改前的最新 master：3e190b9e8cb0a8db86db2920b0429426284a32c3。该提交已经更新 design/task-decomposition.md；本轮不覆盖或回退那次修改。

本轮不修改 S1—S12、Skill 方法、生产 JS、Runtime 或历史 Qualification，也没有执行新的 Calculator 真机任务。

## 2. 文件职责决定

| 文件 | 决定 | 理由 |
| --- | --- | --- |
| workflows/agent-to-recipe/cases/calculator.md | 保留并扩充为唯一 Calculator 主案例 | 它本来就负责让人看懂并检查工作流；关键阶段参考数据应该直接存在这里 |
| cases/calculator-handoffs.md | 删除 | 其核心内容就是 Calculator 主案例的逐阶段检查，不具有独立长期 owner 职责 |
| cases/calculator-engineering.md | 删除 | 大部分内容属于现有 docs/quality/、examples/、Workflow、Skill 或 Git 历史；主案例只保留必要边界和直接索引 |
| 本质量记录 | 保留 | 评分、变更边界、未验证项属于 docs/quality/，与案例正文职责不同 |

这次的原则不是“所有内容必须单文件”，而是：

> **为了完成 Calculator 案例本身的检查任务所必需的内容留在一个文件；已有独立 owner 的工程/历史资料用链接引用。**

## 3. 独立评分，不用总分遮盖问题

沿用 [validation-plan](../../../workflows/agent-to-recipe/design/validation-plan.md#六95-分目标的评估办法) 的五个维度：需求与语义 25、职责与独立性 20、成果与接续 20、验证与修复 20、复杂度与成本 15。

这些仍然只是**本轮同一 Agent 的文档设计静态复核**，不是盲上下文模型测试、人类试读、Skill 能力测试或真实业务资格。

| 独立对象 | 需求与语义 | 职责与独立性 | 成果与接续 | 验证与修复 | 复杂度与成本 | 分项结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 任务定义与黄金数据链 | 25 | 20 | 20 | 20 | 15 | **100** |
| S1 参考案例 | 25 | 20 | 20 | 20 | 12 | **97** |
| S2 参考案例 | 25 | 20 | 20 | 17 | 15 | **97** |
| S3—S6 事实参考案例 | 25 | 20 | 20 | 20 | 15 | **100** |
| S7 Raw Trace → DistilledSteps | 25 | 20 | 20 | 20 | 15 | **100** |
| S8—S9 DistilledSteps → Procedure | 25 | 20 | 20 | 20 | 15 | **100** |
| S10 Operation Rules 参考 | 25 | 20 | 20 | 17 | 15 | **97** |
| S11 Procedure → JS | 25 | 20 | 20 | 20 | 15 | **100** |
| S12 Candidate → Qualification | 25 | 20 | 20 | 17 | 15 | **97** |
| 错误定位方法 | 25 | 20 | 20 | 20 | 15 | **100** |
| 单文件阅读与 owner 收敛 | 25 | 20 | 20 | 17 | 15 | **97** |

### 为什么仍有 97 而不是强行 100

- S1：没有在主案例展开完整 revision / changeLog 样本。
- S2：没有在主案例展开多布局、多模式的完整成对样本。
- S10：没有展开完整定位/读取规则 JSON 或所有扰动案例，只保留足够判断 Calculator 主链的切片。
- S12：没有展开一份完整可发布 QualificationRecord，只展示决定性字段和证据关系。
- 单文件阅读：结构已经减少跳转，但“真实新读者能否在限定时间正确定位问题”仍需要独立试读才能证明。

这些缺口不能通过增加更多篇幅或声称“已经通过”来消除。

## 4. 关键静态反例检查

| 反例 | 主案例现在是否能直接定位 | 正确责任 |
| --- | --- | --- |
| Expected 110 被当作 firstResult | 是 | S1 或最早发生替换的阶段 |
| 没有 A005 actual read | 是 | S3—S6 |
| A005 存在但 S7 删除 D030 | 是 | S7 |
| A009 的 1,1,0 被去重 | 是 | S7 |
| A007/A008 因“前面清过一次”被删 | 是 | S7 |
| D030/D050 正确，但 Procedure 将 firstResult 设为 default 110 | 是 | S8—S9 |
| READ 失败 fallback 110 | 是 | S10 |
| Procedure 正确，但 JS 写死 1,1,0 | 是 | S11 |
| finalResult 直接返回 660 常量 | 是 | S11 |
| frozen Candidate 与 actual executed hash 不同 | 是 | S12 |
| requested 有 variation，但只跑 baseline 就宣称全部 PASS | 是 | S12 |
| action effect unknown 后换 backend 重放 | 是 | S3—S6 / S10，按最早证据定位 |

最重要的新增能力不是“更多错误表”，而是主案例现在能够沿着：

~~~text
Raw facts
→ DistilledSteps
→ SemanticProcedure
→ JavaScript
→ Qualification
~~~

逐层比较同一个 firstResult producer → consumer 关系。

## 5. 本轮没有证明什么

| 对象 | 本轮状态 |
| --- | --- |
| 新 Agent 只凭各 Skill 输入能否独立正确完成职责 | **not-run** |
| 当前 r009 原始执行/Qualification 包是否完整可复核 | **not-run / 本轮未取得原始包** |
| 当前 Candidate 新的 Calculator 真机运行 | **not-run** |
| 当前 Candidate 的视觉验收 | **not-run** |
| repeatability / parameterization 新资格 | **not-run** |
| 新读者的实际理解时间与错误定位成功率 | **not-run** |

因此上面的 97—100 是**各文档设计单元的静态分项评分**。不能把它们转写成 Skill 成功率或 Recipe 运行资格。

## 6. 本轮验收重点

本轮文档层应满足：

1. 只打开 cases/calculator.md 就能看见任务、黄金数据链和 S1—S12 的决定性参考数据；
2. S3—S6、S7、S8—S9、S11 不再只有抽象产物名，而有可以相互对照的具体 Calculator 数据；
3. 能通过 producer / consumer / transform 找到最早错误交接；
4. Expected、synthetic observation、current source、historical runtime evidence 明确分层；
5. 不需要跳进 Calculator 专用 handoff / engineering 文件才能理解主链；
6. 详细 Skill 方法、历史资格、源码与质量记录仍可通过正式 owner 深入核对；
7. 不新增阶段、schema、第二套评分标准或伪运行证据。

如果后续独立试读仍然出现“知道概念但看不出实际哪里错”，应优先修主案例中的对应阶段参考数据，而不是再创建新的 Calculator 辅助文档。
