# OpenDesk 要争的不是“AI 会点电脑”：三个值得公开验证的 Agent-driven RPA 小山头

状态：Draft  
更新时间：2026-09-16

> 这是一篇竞争定位草稿，不是“OpenDesk 已经全球前三”的宣传稿。
>
> 文中所有 Top 3 / Top 1 都表示**准备通过公开 Benchmark 去争的有限竞争范围**。在真实同任务测试完成以前，只能称为候选位置。

## 先说结论

如果把市场定义成：

> “谁能让 AI 操作电脑？”

OpenDesk 现在并没有一个可信的“全球前三”结论。

Cua、Peekaboo、Codex、Claude、UiPath、Microsoft、Automation Anywhere 都已经能够让 Agent 观察和操作真实桌面。Cua 甚至已经有跨平台 Driver 和 trajectory recorder；Peekaboo 也已经不是单纯 CLI，而是 macOS menu-bar App + Agent + MCP；UiPath Delegate 现在同时支持自然语言、语音、屏幕录制、Computer Use 和 reusable Routines。

所以 OpenDesk 真正应该竞争的不是：

> **AI 会不会点电脑。**

而是：

> **AI 或人把桌面工作成功做过一次以后，能不能把这次成功变成可靠、可验证、可重复运行、可维修、还能交付给别人的 RPA。**

这也是为什么 OpenDesk 把自己的大赛道定义成：

> **Agent-driven RPA / Agent 驱动的桌面自动化。**

品牌主张可以进一步收成一句话：

> **让 AI 做一次，变成可复用的桌面自动化。**

英文方向：

> **Turn one successful agent run into reliable desktop automation.**

但如果要进一步回答“OpenDesk 到底准备在哪些小领域争 Top 3，甚至 Top 1”，目前最值得公开验证的是下面三个位置。

---

## 小山头一：Agent → Verified Reusable Desktop RPA

这是 OpenDesk 最值得作为**品牌主山头**的位置。

它解决的问题不是第一次 Computer Use，而是第一次成功之后怎么办。

典型链路是：

```text
自然语言目标
→ Agent 探索真实桌面
→ 完成一次任务
→ 保存关键 evidence
→ 去掉探索、错误和重复动作
→ 参数化真正变化的业务输入
→ 形成可审阅 Workflow / Recipe
→ 从干净状态 Replay
→ 独立验证业务结果
→ 失败时保留诊断证据
→ Repair
```

这件事有很真实的市场原因。

Computer Use 很适合处理第一次、陌生、需要推理的任务，但让模型每次都重新截图、理解、规划和点击，不一定是长期生产环境里最便宜、最快、最可靠的方式。

Microsoft 在 Copilot Studio Computer Use 的官方 FAQ 中甚至直接公开当前限制：web-based tasks 的成功率约 80%，desktop apps 约 35%，而且同一个任务可能因为视觉和时序变化出现不一致，还可能遇到复杂控件、loop 或 stuck state。

这不代表 OpenDesk 已经比 Microsoft 强。

它只证明了一个市场问题：

> **Computer Use 能做事，不等于已经解决 Durable Automation。**

### 这条为什么不是“市场空白”？

因为已经有很强的直接对手。

ADH 的公开产品链已经非常接近：

```text
Agent Explore
→ Author Robot Framework
→ Validate
→ Run
→ Diagnose with evidence
→ Reuse with new inputs
```

OpenAdapt 更直接：

```text
Human Demonstration
→ compile workflow
→ deterministic healthy path
→ independent system-of-record verification
→ uncertainty halt
→ governed repair
```

UiPath Delegate 又把自然语言、语音、屏幕录制、Desktop Computer Use 和 reusable Routine 放到了同一个产品里。

所以这一条不能宣传成：

> “只有 OpenDesk 在做。”

更准确的说法是：

> **这是一个正在形成、但还没有完全固化的新竞争层；OpenDesk 应该用公开数据争前三，而不是靠命名制造第一。**

### OpenDesk 为什么仍值得争？

因为 OpenDesk 已经有一些可以组合起来的真实组件：

```text
Coding Agent AI CLI
+ Human Recorder UI
+ semantic evidence
+ JavaScript Workflow
+ structured input
+ Execution artifacts
+ verification primitives
+ package / licensing
```

真正需要证明的是，这些组件能不能组成一条比“每次重新 Agent”更便宜、比“坐标宏”更可靠、比大型企业 RPA 更轻的完整链路。

当前内部机会判断：

> **Top 3 候选。不是已取得 Top 3。**

---

## 小山头二：Agent-authored Automation Commercial Delivery Runtime

这是一个更窄的范围，但它反而可能是 OpenDesk **最值得争 Top 1** 的位置。

目标用户不是 Fortune 500 的 RPA CoE，而是：

```text
独立自动化开发者
AI 自动化顾问
RPA 外包团队
ERP / 软件实施商
小型 Automation Studio
```

他们的问题通常不是：

> “我能不能把这个流程跑起来？”

而是：

> “我怎样把它交给客户，然后长期维护和收费？”

一个客户可用的自动化，至少还要回答：

```text
怎么安装？
怎么配置输入？
Secret 放哪里？
客户能不能看到源码？
怎样限制设备或授权？
怎样升级？
出错以后怎样拿 Evidence 回来？
如何判断是客户环境问题还是 Workflow 问题？
第二台机器部署要重新做多少工作？
```

OpenDesk 当前已经存在一条比较少见的组合：

```text
普通 JavaScript Workflow
→ structured Execution.input
→ local Runtime
→ execution artifacts
→ .odpkg protected package
→ publisher signature
→ License
→ device-bound offline authorization
→ in-memory decrypt
→ run
```

这条链本身不能证明产品第一。

但它说明 OpenDesk 有机会竞争一个比“通用 RPA”窄得多、又确实有商业价值的范围：

> **tools for independent automation developers delivering local Agent-authored desktop workflows to client machines**

为什么一定要把范围写这么清楚？

因为如果把范围扩大成：

> “企业 RPA 交付平台”

那 UiPath、Automation Anywhere、Microsoft 的部署、治理、权限、审计、组织管理成熟度明显远高于 OpenDesk。

OpenDesk 真正可能领先的是：

```text
更轻
+ 更像普通代码资产
+ 更适合 Coding Agent
+ 能本地运行
+ 能打包保护
+ 面向小团队/独立开发者交付
```

这里当前最大的风险不是技术，而是**需求证据还不够**。

必须找到真实自动化开发者并验证：

> 他们是否真的愿意为“更容易交付、保护、诊断和维护客户自动化”付钱？

所以当前结论是：

> **这是最值得争 Top 1 的窄山头，但必须同时通过 Delivery Benchmark 和真实付费验证。**

---

## 小山头三：Human + Agent → Same Maintainable Workflow

这是 OpenDesk 最容易通过产品 Demo 让普通人理解的一条差异。

今天大多数 Computer Use 产品天然是 Agent-first：

```text
Prompt
→ Agent 看屏幕
→ Agent 操作
```

传统 Recorder 又天然是 Human-first：

```text
人操作
→ Record
→ Replay
```

真正有意思的问题是：

> **为什么这两条路径最后不能生成同一种自动化资产？**

OpenDesk 想形成的产品链是：

```text
Codex / Claude
→ Agent exploration ─┐
                     │
                     ├→ Evidence
                     │    ↓
普通用户             │ Business Steps
→ Recorder UI ──────┘    ↓
                       Workflow / Recipe
                            ↓
                         Verify
                            ↓
                          Replay
                            ↓
                          Repair
```

这比“我们有 Recorder”更重要。

因为 Cua 也有 recording，UiPath 也有 screen recording，Codex 也有 Record & Replay，OpenAdapt 更是 demonstration-first。

真正的竞争问题不是：

> 谁能录？

而是：

> **谁能让人演示和 Agent 探索最终汇合到同一种可读、可参数化、可验证、可版本控制、可维修的 Workflow？**

如果 OpenDesk 最后变成：

```text
Recorder 生成一套坐标宏
Agent 又生成另一套脚本
两边完全无法共同维护
```

那么 Human-first + Agent-first 只是两个功能，不是竞争优势。

只有真的汇合，才有机会形成一个清晰的 Top 3 产品体验。

当前结论：

> **Top 3 候选；必须先完成 Agent/Human → Recipe → Qualification 的最小闭环。**

---

## 那 Cua 和 Peekaboo 呢？

它们依然非常重要，而且应该正面比较。

### Cua

Cua 当前最强的产品心智非常清楚：

> Give AI agents computers they can use.

它提供：

- macOS / Windows / Linux Driver；
- CLI / MCP / SDK；
- background delivery；
- cloud desktops / Fleets；
- benchmark；
- Agent trajectory recording。

因此 OpenDesk 不应该和 Cua 比：

> 谁更像一个纯 Computer Use Driver。

更应该比较：

> **第一次 Agent 完成以后，谁更容易得到长期低成本运行的业务 Workflow？**

### Peekaboo

Peekaboo 也不是“只给 OpenClaw 的 CLI”。

它现在已经是：

```text
macOS native automation
+ CLI
+ menu-bar App
+ Agent
+ MCP
+ permission onboarding
+ visual feedback
+ background native actions
```

在 macOS 原生桌面自动化深度上，它是一个很强的对手。

所以 OpenDesk 对 Peekaboo 的问题应该是：

> **跨平台 + Human Recorder + reusable workflow + commercial delivery，能否形成一个更完整但仍然轻量的产品链？**

而不是：

> “我们有 UI，它没有。”

这个说法已经不成立。

---

## 怎样证明 Top 3，而不是自封 Top 3？

OpenDesk 接下来准备采用四段式 Benchmark：

```text
First-run
→ Replay
→ Repair
→ Delivery
```

### 1. First-run

第一次给同样任务，看：

- 谁能正确完成；
- 需要多少人工介入；
- 花多少时间；
- 消耗多少 model / tokens / credits；
- 是否出现危险动作；
- 最终业务结果是否真的正确。

### 2. Replay

允许所有产品建立自己的最佳 reusable asset。

然后换输入重复运行。

不能拿 OpenDesk 固定 Recipe 去欺负一个每次重新探索的 Agent。

公平问题应该是：

> 每个产品都完成一次最佳 authoring 以后，后续运行成本和成功率分别是多少？

### 3. Repair

故意改变：

- 窗口位置；
- 文本；
- 控件顺序；
- timing；
- modal；
- stale / conflicting data。

然后测：

```text
能不能发现变化？
会不会错误成功？
能不能正确停止？
多久定位？
多久修好？
修好后能不能继续复用？
```

### 4. Delivery

把作者机器上已经做好的自动化交给第二台干净机器。

测：

```text
安装时间
权限步骤
配置步骤
Secret
Package
License
首次成功时间
Evidence 导出
升级
维修
```

如果第二个山头要争 Top 1，这一段尤其重要。

---

## 什么情况下才能真正写“Top 3”？

一个成功 Demo 不够。

内部功能表打 90 分也不够。

GitHub Star 更不够。

至少需要：

```text
固定竞争集合
+ 固定产品版本
+ 固定环境
+ 多个任务族
+ held-out inputs
+ fault / mutation set
+ 独立业务结果 oracle
+ 原始结果可审计
+ strongest substitute included
```

只有这样，才可以写：

> “在某个明确 Benchmark 范围内进入前三。”

如果以后要写 Top 1，还需要多一个条件：

> **这个窄市场必须真的有人使用和付钱，而不是为了排名临时拼出来的关键词集合。**

---

## 所以 OpenDesk 当前真正的战略不是“五个产品”

它其实是一条链：

```text
Agent-first ──────────┐
                      │
Human-first Recorder ─┤
                      ↓
                   Evidence
                      ↓
               Workflow / Recipe
                      ↓
                    Verify
                      ↓
                   Replay
                      ↓
              Diagnose / Repair
                      ↓
              Package / Deliver
```

三个竞争小山头只是这条链上的三个切面：

### 品牌主山头

> **Agent → Verified Reusable Desktop RPA**

### 最值得争 Top 1 的窄山头

> **Agent-authored Desktop Automation Commercial Delivery Runtime for independent automation developers**

### 最值得争 Top 3 的产品体验

> **Human + Agent → Same Maintainable Workflow**

这三个结论都还需要 Benchmark。

但至少现在，OpenDesk 的竞争目标已经不再是模糊的：

> “我们也能让 AI 点电脑。”

而是一个可以被测试、被反驳、也可以被真正证明的位置：

> **让一次智能桌面工作，变成以后可靠执行的自动化资产。**

---

## 参考与证据入口

本文的竞争事实与评分来自仓库内当前 Research / Quality 文档，不以本文作为 Source of Truth：

- `docs/research/commercialization/agent-driven-rpa-competitor-matrix-2026.md`
- `docs/research/commercialization/agent-driven-rpa-positioning-2026.md`
- `docs/plans/commercialization/agent-driven-rpa-positioning.md`
- `docs/quality/agent-driven-rpa-competitive-benchmark.md`

主要公开来源访问日期：2026-09-16：

- https://github.com/trycua/cua
- https://cua.ai/docs/how-to-guides/driver/record-and-render-a-trajectory
- https://github.com/openclaw/Peekaboo
- https://github.com/xuyw1997/agent-desktop-harness
- https://github.com/OpenAdaptAI/openadapt-flow
- https://help.openai.com/en/articles/11391654-chatgpt-team-release-notes
- https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
- https://docs.uipath.com/delegate/standalone/latest/release-notes/august-2026
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/faqs-computer-use
- https://www.automationanywhere.com/products/agentic-process-automation-system
