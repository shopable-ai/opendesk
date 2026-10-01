---
title: "Agent-to-Recipe｜首错定位与最小返工地图"
description: "当 S1—S12 某处出现错误时，用实际输入、Actual Output 和数据依赖快速定位 first invalid boundary、failure owner 与最小返工范围。"
order: 35
---

# Agent-to-Recipe｜首错定位与最小返工地图

本文只回答一个问题：

> **现在看到一个错误，怎样找到第一处真正错误，并只返工必要范围？**

## 30 秒使用方法

不要先问“最终结果对不对”，而是沿实际数据链问：

~~~text
上游真实输入
→ 本阶段 Actual Output
→ 下游必须信息
→ first invalid boundary
→ failure owner
→ invalidated downstream
→ preserved upstream
→ next minimum action
~~~

核心原则：

> **第一处“输入仍然正确，但输出已经第一次错误”的边界，才是本轮应该优先修的位置。**

如果证据不足以判断哪一边先错，结论应是 unresolved / need evidence，而不是凭阶段编号猜 owner。

### 人工怎样判断这张地图有没有真的定位错误

诊断应同时给出下面五项具体内容，而不只显示一个阶段名或分数：

| 内容 | 必须展示什么 |
| --- | --- |
| 业务要求 | 原本应完成什么，与哪条固定要求对应 |
| 首个实际不符 | 哪份成果的哪个字段、哪段代码或哪次实际观察开始不符；展示关键正文 |
| 来源与范围 | 哪个 task/attempt/版本支持这个结论，属于参考、历史事实、本次事实还是未验证假设 |
| 责任依据 | 为什么输入仍有效而这里第一次出错；若原因未确定，写可能责任与缺失证据 |
| 最小修复 | 修哪个责任层、保留什么、哪些下游受影响，以及修后应满足什么检查 |

发现失败的阶段、真正责任层、以及检查未发现错误的责任可能不同。例如 S3 的程序报“对象绑定错误”，只能先定位到该次程序的检查位置；需要对照输入和实际观察后，才能判断是 S2 对象依据、S3 实现假设或 Runtime 行为问题。没有该对照就不能把错误归给 Runtime，也不能因为一份静态检查通过就归给现场。

维护工作流时可以用已保存的反例和成果静态判断方法或交接缺口。若用户禁止执行，缺失的真实观察保持未验证；诊断地图不因此授予补跑脚本或桌面的权限。

## 1. 先固定你正在检查的对象

开始诊断前先固定：

- 当前 task / request；
- 相关 artifact 版本或 hash；
- 当前 observed failure；
- 已有 evidence；
- 当前 Candidate / Qualification 是否已经变化；
- 哪些副作用可能已经发生。

如果这些对象都没有固定，后面的“返回 S几”没有可靠意义。

## 2. 相邻边界只检查三件事

对于任意 A → B 的交接，只问：

1. **A 实际收到的输入是真的吗？**
2. **A 实际输出了什么，而不是计划 / Expected / 示例？**
3. **B 真正需要的信息有没有被 A 丢掉、改写或伪造？**

只有 A 的输入仍正确、A 的输出第一次错误时，A 才是 first invalid boundary。

如果 A 的输入已经错了，继续向上游找。

## 3. S1—S12 的首错地图

| 阶段 | 本阶段收到什么 | Actual Output 应该是什么 | 典型 first invalid signal | 默认 failure owner |
| --- | --- | --- | --- | --- |
| **S1** | 用户 Source、授权、限制、已有资产 | TaskContract / WorkPlan / Unknown | 用户要求被偷换、授权被扩大、Expected 被写成 runtime input | S1 |
| **S2** | S1 合同、近期计划、获准观察 | 最小 AppProfile / target-read basis / limits | 目标应用、窗口、结果区或可操作依据认错 | S2；若路线本身被事实推翻则回 S1 |
| **S3** | planned step、target basis、授权、前置 | actual action / request / target / receipt / side-effect state | 只有计划却写成已执行；动作打错对象 | S3；target basis 本身错则回 S2/S10 |
| **S4** | S3 actual action、正确对象、Expected criterion | actual observation + comparison | receipt 当业务结果；Expected 当 Actual；观察错对象 | S4；read rule 本身错则回 S2/S10 |
| **S5** | S3/S4 事实、side effect、预算 | continue / revise / recover / stop + planDelta | uncertain 却继续；unknown effect 直接重放 | S5 |
| **S6** | 多轮 S3—S5 的真实事实 | Dossier / Raw Trace / dataflow / unresolved | 只保留最终结果，丢 runtime producer / consumer 或补造历史 | S6 |
| **S7** | 固定 Dossier / Trace | DistilledSteps + action disposition + data dependency | 把必要 read 删除；机械去重；consumer lineage 断裂 | S7；事实不足回 S3—S6 |
| **S8** | DistilledSteps、TaskContract、必要应用资料 | Business Steps / source mapping | 业务步骤首次把 runtime value 写成常量或丢 consumer | S8；S7 取舍本身错则回 S7 |
| **S9** | 已确认 Business Steps、政策和范围证据 | SemanticProcedure / parameter classes / dataDependencies | S8 仍正确，但 S9 才把 runtime value 变成 default / parameter 或错误扩大 scope | S9 |
| **S10** | Procedure、已有 AppProfile、明确工程缺口 | locator / read / wait / action / verifier rules | API 文档存在被写成 Runtime pass；定位、读取、等待或 verifier 不可靠 | S10 |
| **S11** | Procedure、operation rules、正式 API contract | exact JS + CandidateManifest + sourceMapping | upstream 正确，但 JS 没消费 runtime value、虚构 API、错误失败路径 | S11 |
| **S12** | exact Candidate、requested scope、场景、环境 | QualificationRecord + actual evidence | 改 Candidate 仍沿用旧资格；requested 未跑却写 PASS；Oracle / evidence 错 | S12；真实业务缺陷按其 owner 定向返回 |

Delivery / Publish 是 S12 后的外部交付边界，不是 S13。只有交付包、版本或 scope 包装错误时留在 Delivery；Candidate 或 Qualification 本身错误仍回 S11 / S12。

## 4. preserved upstream 和 invalidated downstream 怎样判断

找到 first invalid boundary 后，不要默认清空前面全部成果。

### preserved upstream

满足以下条件的上游可以保留：

- 事实仍真实；
- 版本没有受当前修改影响；
- 当前错误没有推翻它的输入或结论；
- 没有证据显示其 Qualification / evidence 已过期。

### invalidated downstream

只有真正依赖错误输出的下游才失效。

~~~text
S7 错
→ 保留 S1—S6
→ 修 S7
→ 重新判断 S8—S12 受影响部分

S9 数据依赖错
→ 保留 S1—S8
→ 修 S9
→ 重新判断 S10—S12

S10 locator / read rule 错
→ 保留业务语义
→ 修 S10
→ 重建真正受影响 Candidate
→ 重验对应 S12

Candidate 字节变化
→ 旧 S12 不再证明新 Candidate
~~~

如果 Qualification 的 Oracle / scenario 设置错，但 Candidate 字节没变，可以只重做 S12 受影响范围。

## 5. 用 Calculator 的 firstResult 贯穿定位首错

正确数据链：

~~~text
Source 要求真实读取
→ S1 保留该约束
→ S2 找到正确 Calculator / result region
→ S3 执行真实 read
→ S4 得到 actual firstResult
→ S5 决定继续
→ S6 保留 firstResult producer 和后续 consumer
→ S7 保留必要 read step
→ S8 Business Step 仍消费 firstResult
→ S9 firstResult = runtime value
→ S10 read / clear / input rule 不允许 Expected fallback
→ S11 JS 真正把 firstResult 全部字符输入第二式
→ S12 对同一 Candidate 独立 Fresh Run
~~~

### 例 1：S4 把 Expected 110 当 Actual

- S1 要求正确；
- S2 结果区认识正确；
- S3 read 动作真实发生；
- **S4 第一次把 Expected 填成 actualObservation。**

因此 first invalid boundary = S4。不要因为最终 660 正确就把 S4 判为通过，也不需要重做 S1—S3。

### 例 2：S6 只保存 finalResult

S3/S4/S5 都真实记录了 firstResult，但 S6 Dossier 丢掉了：

~~~text
read firstResult
→ 保存到 task data
→ second input consumer
~~~

first invalid boundary = S6。S1—S5 仍可保留。

### 例 3：S7 把读取动作当“重复”删掉

事实包正确，但 DistilledSteps 没有 read producer，first invalid boundary = S7。

### 例 4：S9 才把 firstResult 写成 default 110

S8 Business Step 仍明确消费 firstResult，但 SemanticProcedure 首次改成常量，first invalid boundary = S9。

### 例 5：S11 读了变量却仍输入 110

Procedure 和 operation rules 都正确，只有 JS consumer 硬编码，first invalid boundary = S11。

### 例 6：Candidate 已修改，却沿用旧 PASS

实现已经是新 Candidate，而 QualificationRecord 仍绑定旧 hash，first invalid boundary = S12。

## 6. Expected、Actual 与最终答案的诊断规则

以下三种推理一律拒绝：

~~~text
Expected = 110
所以 S4 一定读到了 110

finalResult = 660
所以前面的 firstResult 数据链一定正确

checker PASS
所以业务 Qualification 一定通过
~~~

正确顺序只能是：

~~~text
实际执行
→ 实际 observation
→ 当前层 verdict
→ 下游消费
~~~

最终结果只证明最终结果本身，不能倒证缺失的历史事实。

## 7. API 文档、Runtime 成功与 Qualification 也要分层

常见错误边界：

| 看到的事实 | 只能证明 | 不能证明 |
| --- | --- | --- |
| API 文档中存在方法 | 可以作为候选 | 当前 Runtime 已可用 |
| selectedMethod 已记录 | 当前准备采用它 | 当前应用已经成功 |
| Runtime 局部调用成功 | 当前范围内该方法可用 | 整个 Candidate 合格 |
| checker PASS | 对应结构 / 引用规则通过 | 业务事实和真实运行正确 |
| Fresh Run 成功一次 | 本次范围成功一次 | 所有参数、环境、重复运行都成立 |

| 常见人工误读 | 应怎样表述 |
| --- | --- |
| `S2 → S3` 检查 PASS 被当作整链成功 | 显示本次检查范围、仍未完成阶段和整体结论 |
| 评分 100，但仍存在缺失证据 | 同时显示分数和未放行原因，不用分数覆盖 verdict |
| Node 维护检查被当作 OpenDesk 业务成功 | 分开维护工具检查、实际 Runtime execution 和独立业务验收 |
| 同名 JS 被当作最终 Recipe | 标明是参考、示范工具、未冻结提案还是本次冻结候选，并绑定来源 |
| 生成代码之后发生失败，却仍展示此前就绪结论 | 保留原检查范围，显式指出更新的失败事实及尚待重核的判断；禁止回填 PASS |

因此 capability-discovery、application-operations、S11 和 S12 的失败不能靠同一个“API 存在”结论混过去。

## 8. 证据不足时怎样做

如果你只能看到：

- 文件存在；
- 阶段名；
- 一个 PASS 文本；
- 最终数字；
- 不完整日志；

但无法确认 Actual Output，就不要猜 first invalid boundary。

记录：

~~~text
last confirmed correct artifact
current unknown boundary
missing evidence
possible owners
next minimum evidence action
~~~

只有拿到足够证据后，再把 possible owner 收敛成真实 failure owner。

## 9. 辅助 checker 的正确位置

仓库中的 handoff / artifact / stage checker 可以降低人工查引用和版本的成本，但它们只拥有自己实际检查到的确定性规则。

详细命令和实现规则留在对应脚本、共享合同与 validation-plan。

这里仅保留一条诊断原则：

> **checker PASS 只能缩小“结构性错误”的可能范围，不能把业务 Actual、Runtime 成功或 S12 Qualification 自动写成通过。**

## 10. 快速人工清单

看到一个错误时，依次问：

1. 当前失败对象和版本是否固定？
2. 最后一个有真实证据的正确产物是什么？
3. 下一个 Producer 实际收到的输入是否仍正确？
4. 它的 Actual Output 在哪里？
5. 下游真正依赖的信息是否从这里第一次丢失或变错？
6. 哪些上游仍然可以保留？
7. 哪些下游真的依赖这个错误，需要重新验证？
8. 下一步最小动作是补 evidence、修当前 owner，还是重验下游？

如果这 8 个问题能回答，acceptance-map 就完成了它的职责；不需要再复制完整 WORKFLOW 或 Skill 方法正文。

---

## 附录｜文档边界与相关入口

本文不是第二份 WORKFLOW、task-decomposition、评分体系、Skill 方法正文或 checker 手册。

- 完整 S1—S12 做什么：见 [task-decomposition](task-decomposition.md)。
- 谁生产什么、交给谁：见 [chain-design](chain-design.md)。
- 怎样评分、Gate、Hard Fail 和证据强度：见 [validation-plan](validation-plan.md)。
- Calculator 完整参考结果：见 [calculator.md](../cases/calculator.md)。
