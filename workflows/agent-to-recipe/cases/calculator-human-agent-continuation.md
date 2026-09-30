---
title: "Calculator 人工关键录制 → Agent 接续黄金案例"
description: "人工只录第一段关键操作后，AI 只补阻塞事实并形成可资格验证的普通 JS Candidate。"
order: 8
---

# Calculator 人工关键录制 → Agent 接续黄金案例

这是“Human 部分真实事实 + Agent 后续补证”的正式可检查案例，不是第三套 Workflow。Human 原始录制仍属于 Human-to-Recipe；AI 后续实际动作和 observation 仍属于 Agent 来源；最终交付仍是普通 OpenDesk JavaScript。

## 0. 当前证据边界

本文定义制作接续合同、Known / Unknown / blocker、来源边界、最小补证、firstResult producer → consumer 和 Fresh Qualification 要求。

本文本身不证明：真实 Recorder 已录制、真实 Calculator UI 已补证、新 Candidate 已产生、Fresh Run 已执行或 Qualification 已 PASS。110 / 660 的数学正确性、fixture 或旧资格都不能升级这些状态。

## 1. 用户目标与人工示范

人工只通过 Calculator 按钮完成：

25 × 4 + 10 =

然后停止保存。AI 接续后必须：

1. 从 Calculator 当前显示区实际读取 firstResult；
2. 保存 firstResult；
3. 清空 Calculator UI，但任务变量继续保留 firstResult；
4. 通过按钮输入 6 × firstResult =；
5. 从当前显示区实际读取 finalResult；
6. 输出 finalResult；
7. 形成完整普通 JS Candidate；
8. 对 exact Candidate 做 Fresh Qualification。

Expected 110 和 660 只属于独立资格 Oracle，不能成为生产运行时 firstResult / finalResult 的来源。

## 2. Human 材料只读保留

Recorder 固定本次 recordingDir、raw / manifest、actions.json、当前 Candidate 和 generated script。Human 第一段按钮事件仍是 Human / Recorder 来源。

AI 不得向旧 raw/actions 补写没有发生过的 read、clear、第二段输入或 final read，也不得因为后续理解更完整而把历史 Human 事实改成 Agent 来源。

## 3. Known / Unknown / blocker

| 项目 | 状态 | 依据 |
| --- | --- | --- |
| Human 确实执行第一段按钮操作 | Known | 固定 recording/actions |
| actions 是否结构可消费 | readiness 决定 | 只代表包状态，不代表完整业务覆盖 |
| 完整目标还要求第二段计算 | Known | 用户明确要求 |
| firstResult 实际值 | Unknown | 直到读取正确 Calculator 当前显示 |
| clear 后任务变量仍保存 firstResult | Unknown | 要形成真实 runtime data flow |
| 第二段真实消费 firstResult | Unknown | 正确常量不能证明消费 |
| finalResult 实际值 | Unknown | 必须实际读取最终显示 |
| 当前 Candidate 是否完整 | blocked / Unknown | Human 只录第一段 |
| exact Candidate 是否 qualified | not-run | 尚未 Fresh Qualification |

一个 recording/actions 包可以合法、ready，同时只覆盖整个业务的一部分。不能把 actions ready 翻译成“任务已经示范完整”。

真正阻塞项是：firstResult 缺真实 producer；clear 后变量保留未证明；第二段缺真实 consumer；finalResult 缺真实 producer；应用 read / clear / button 规则仍需足够可靠；完整 Candidate 尚未冻结和独立资格。

Human 已经证明的第一段不是缺口，不为“整齐”重新执行。

## 4. 最小补证

按最小信息量推进：

已有固定材料
→ 获准只读观察
→ 获准 Agent 定向执行
→ application-engineer 补应用规则
→ 只有无法推断的关键业务片段才要求用户定向补录

如果停止 Recorder 后 Calculator 仍可靠处于第一段结果现场，下一步最小动作是只读结果显示区，得到 Agent observation：Calculator 当前结果显示区 → actual read → firstResult。它不能回写成“Human 当时已经读取”。

如果新对话开始时现场已变化或无法证明连续性，旧截图、Expected 110 或数学推导都不能冒充当前 firstResult。此时只定向重建缺失 producer 所需状态，或请求用户补这一小段，不默认完整重录。

## 5. 来源账本

| 信息 | 真实来源 | 下游用途 |
| --- | --- | --- |
| 第一段按钮录制 | Human + Recorder capture | 固定 recording/actions ref |
| 完整任务要求 | 用户明确说明 | task / intent |
| firstResult actual read | Agent observation 或新 Human 定向补录 | runtime producer |
| clear / 第二段动作 | Agent action 或新 Human 定向补录 | 业务事实 |
| finalResult actual read | Agent observation | final runtime producer |
| 业务解释 | AI / reviewed interpretation | Procedure / plan |
| locator/read/wait/clear 规则 | application-engineer | AppProfile / helper |
| JavaScript 实现 | recipe-build / Human production authoring | exact Candidate |
| PASS / FAIL | 独立 Qualification | exact Candidate + scope |

不要创建 source = hybrid。同一个实际动作即使同时有 Recorder 和工具回执，也只是多份佐证，不是两次执行。

## 6. 必须证明的 runtime 数据链

Calculator 第一次结果显示区
→ actual read
→ firstResult
→ 保存任务变量
→ 清空 Calculator UI，但 firstResult 变量仍存在
→ 把 String(firstResult) 的全部字符用于第二次按钮输入
→ 6 × firstResult =
→ Calculator 最终显示区
→ actual read
→ finalResult
→ output

Fresh Run 中 firstResult 必须重新读取，不能继承 authoring run 的 110。

以下都失败：硬编码 firstResult = 110；硬编码 finalResult = 660；用 JavaScript 算术产生 firstResult；直接输入 6 × 110 而没有证明 110 来自本次第一段显示读取。数值正确不代表数据来源正确。

## 7. application engineering 边界

application-engineer 负责 Calculator window 身份、按钮 role/name、显示读取、clear 后置状态、等待、失败关闭，以及版本/语言/布局/权限支持范围。

它不能把“通过 Calculator 按钮操作”换成 JavaScript 算术，也不能把 Expected 110 / 660 放入 runtime producer。

## 8. 完整 Candidate 的业务形状

prepareCalculator
→ 按钮输入 25 × 4 + 10 =
→ firstResult = 实际读取 Calculator 当前显示
→ 保存 firstResult
→ clear Calculator UI
→ 确认任务变量 firstResult 仍存在
→ 按钮输入 ["6", "×", ...String(firstResult), "="]
→ finalResult = 实际读取 Calculator 当前显示
→ 输出 finalResult

生成 Candidate 前必须能回答 Human 和 Agent 各证明了什么、firstResult/finalResult 的 actual producer 是谁、clear 后如何保留 firstResult、第二段怎样消费本次 firstResult、需要哪些 AppProfile / helper / API，以及还有没有会改变业务结果的 blocker。

有 blocker 时输出 blocked + next minimum action，不用常量填 Unknown。

## 9. Fresh Qualification

冻结 Candidate 后，独立资格必须针对同一份 exact Candidate：

干净起点
→ 完整 Candidate 执行第一段按钮
→ 本 run 实际读取 firstResult
→ clear UI 并保留 runtime firstResult
→ 第二段真实消费本 run firstResult
→ 本 run 实际读取 finalResult
→ 独立 Oracle 比较 Expected
→ QualificationRecord

必须检查 Candidate 字节/入口/依赖、producer → consumer、当前显示读取、requested scope，以及所有 not-run / blocked。Candidate 一旦改变，旧资格失效。

Human H7 的现有入口为 `tests/human-to-recipe/tools/qualify-calculator-partial.cjs`，
独立观察脚本为 `tests/human-to-recipe/calculator-partial-witness.js`。
观察器在候选执行期间持续只读观察，不以中途非零值停顿判断结束。Gate 在精确候选进程退出后，
向该观察 execution 的 artifact 目录原子交付仅包含退出状态和结束时间的边界文件；不交付结果值或 Expected。
观察器随后要求同一终值连续稳定至少 4 秒；显示不可用、身份变化或新的显示变化均失败。
Evaluator 再把独立观察的终值与候选本次实际 finalResult 比较，保留零 → firstResult → 清空 → finalResult 的原断言。
该边界文件不是桌面锁；开始前仍须确认人工停止、并行任务交接和无在途输入。
旧失败不因 Oracle 修订变成 PASS，新的 live 报告必须绑定本次 Gate、观察器和全部消费依赖。

Gate 同时冻结实际加载的 polyfills/jslibs 初始化文件与文件清单，两个 execution 使用相同
`dist/opendesk` 入口，并从各自 execution artifact 的框架日志核对实际加载目录。
`script` 控制台模式会过滤框架初始化日志，不能据其缺行推断实际加载失败；日志行尾的
结构化 metadata 也不能混入候选读值或 readiness payload。候选与 observer 的 summary
分别核对实际源码 hash、成功终态和不同 execution ID。Gate 内的 `-log-dir` 仅用于独立证据，
报告记录完整实际命令；不能把这项 Gate 验收说成未执行的公开裸命令已经通过。

从仓库根目录执行唯一完整 live 入口（仅在 Calculator 控制交接明确后）：

```sh
node tests/human-to-recipe/tools/qualify-calculator-partial.cjs --live <Human-plan.json> --reviewed-source-sha256 <exact-candidate-sha256>
```

该命令不证明真人录制链或内嵌发行加载；两者分别验收。运行报告及观察截图保存在
`.runtime/tests/human-to-recipe/partial-authoring/qualification-*/`，不提交私人材料。

## 10. 失败时的最小返工

优先报告：Human 已证明范围、Agent 已补证范围、第一个真实缺口、为什么阻塞、仍可保留的上游、失效下游、下一步最小动作、是否产生新 Candidate、Fresh Run 是否执行、Qualification verdict。

示例：首个缺口是 firstResult 没有当前 Calculator 显示的 actual observation；保留 Human 第一段录制；后续 data flow / Candidate / Qualification 无效；下一步只读当前结果区，若现场失效则只定向重建 firstResult producer，而不是完整重录。

## 11. 为什么第一版不需要 Hybrid schema

现有边界已经足够：Human recording/actions/SemanticBuildPlan 保持自己的权威来源；Agent 新事实进入 execution、Dossier、handoff；request / handoff / inputRefs / sourceRefs / source mapping 固定上游；application-engineer 产生 AppProfile / rules；CandidateManifest 冻结最终源码与依赖；QualificationRecord 绑定 exact Candidate。

SemanticBuildPlan v1 不塞 mixedSources，也不创建 source=hybrid。只有真实消费者证明现有引用无法无损表达必要信息，才做最小版本化扩展并同步 validator、consumer 和兼容测试。

## 12. 分层完成判定

| 层次 | PASS 条件 |
| --- | --- |
| 设计 | Known / Unknown / blocker / source / dataflow / qualification 合同一致 |
| 代码 | Recorder 入口和实际消费侧实现，不只是文档 |
| fixture / 静态测试 | 固定材料、来源与提示词合同自动测试实际通过 |
| 真实 Recorder | 真实录制关键片段并保存，产物可读取 |
| 真实 Calculator UI | Agent 对缺口做真实 observation/action 并留证 |
| Fresh Run | exact Candidate 从干净状态完整执行 |
| Qualification | 独立 Gate 对 exact Candidate 给出 PASS |

任何一层没有运行，就写 not-run / not-verified，不能由上一层推断。
