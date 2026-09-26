# 有了 Manus My Computer，为什么还需要 OpenDesk？

状态：Draft  
更新时间：2026-09-26

> 这是一篇产品定位与竞争边界文章，不是“OpenDesk 已经比 Manus 更强”的宣传稿。
>
> Manus 的产品事实以 2026-09-26 可核验的 Manus 官方资料为依据；OpenDesk 当前能力仍以源码、测试和 docs/ 正式文档为准。本文讨论的是：当 Manus 已经有 My Computer、Cloud Computer、Skills、Projects 和 Scheduled Tasks 以后，OpenDesk 还可能在哪些范围形成独立价值。

## 先说结论

如果 OpenDesk 的价值只是：

~~~text
AI 可以访问我的电脑
AI 可以打开本地文件
AI 可以调用 Terminal
AI 可以启动应用
AI 可以完成复杂任务
~~~

那么 Manus My Computer 已经对这个定位构成很直接的挑战。

Manus 官方已经明确：

- My Computer 可以让 Agent 进入用户自己的物理电脑；
- 支持使用本地文件、本地工具和本地应用；
- 其主要本机交互机制是通过 Terminal 执行 CLI；
- Manus Cloud Computer 可以在独立 Linux 云环境中长期运行；
- Projects、Project Skills 和 Skills 正在把一次成功工作沉淀成可复用资产；
- Scheduled Tasks 已经覆盖重复和定时工作。

所以 OpenDesk 不能靠“Manus 只能在云端”“Manus 没有复用”“Manus 不能长期运行”这些已经失效的说法证明自己。

真正值得回答的是：

> **通用 Agent 获得用户电脑以后，是否还需要一套专门面向真实桌面软件、可编程执行、验证、长期维护和商业交付的 Automation Runtime？**

OpenDesk 的机会只可能存在于这个问题里。

---

## Manus 已经进入 OpenDesk 的核心竞争区

Muse 更多是在 Personal Agent、长期目标和个人入口上形成压力。

Manus 则更直接地进入：

~~~text
General Agent
+
My Computer
+
Cloud Computer
+
Browser
+
CLI
+
Skills
+
Projects
+
Scheduled Tasks
+
Reusable Workflows
~~~

这意味着 Manus 不是一个可以忽略的“上层聊天 Agent”。

它已经开始覆盖从：

~~~text
理解任务
→ 调用工具
→ 使用用户电脑
→ 复用经验
→ 定时执行
~~~

的完整链路。

因此，如果 OpenDesk 以后要证明自己存在独立价值，Manus 应该进入一级 Benchmark，而不是只作为一个遥远的参考对象。

---

## Manus My Computer 到底是什么？

Manus 官方对 My Computer 的描述非常值得注意：

> 它把 Manus 从云端带到用户自己的电脑，让 Agent 可以直接与本地文件、工具和应用协作。

但它与传统 GUI 自动化框架有一个重要区别。

官方明确写道，My Computer 主要通过：

~~~text
Terminal
→ CLI instructions
→ installed tools
~~~

与用户电脑交互。

这使 Manus 很容易利用：

~~~text
Python
Node.js
Swift
Xcode
Git
Shell
各种本地 CLI
~~~

来完成复杂任务。

这种方式非常强。

对于代码、文件、数据、开发环境，以及能通过 CLI 控制的软件，它甚至可能比传统 GUI 自动化更自然。

因此 OpenDesk 不应该把“可以写程序控制电脑”当作自己的独占能力。

---

## OpenDesk 真正不同的地方，应该是 Desktop Runtime 的专业化

OpenDesk 当前更接近：

~~~text
Developer / Agent
        ↓
OpenDesk Runtime
        ↓
macOS Accessibility
Windows UI Automation
Window / Screen
OCR / Vision
Mouse / Keyboard
Clipboard / File / HTTP
        ↓
真实桌面应用
~~~

它试图把 GUI Desktop Automation 本身做成一个一等 Runtime，而不是把桌面操作主要视为 Agent 临时调用的外围能力。

这使 OpenDesk 可以研究一个比“通用 Agent”更窄的位置：

> **Specialized Local Computer Automation Runtime for AI agents and developers.**

注意，这只是产品方向。

它不意味着当前 OpenDesk 已经在真实应用覆盖率、可靠性或用户体验上领先 Manus。

---

## 为什么“本机 GUI 软件”仍然可能是一个独立问题？

企业真实工作经常发生在：

~~~text
ERP 客户端
客服客户端
Office
Electron 应用
专用桌面软件
企业 VPN
本地 Excel
公司内网
证书环境
浏览器已有 Session
USB Key
~~~

其中一部分可以通过 CLI、API 或 Browser 完成。

另外一部分最终还是需要：

~~~text
观察真实窗口
识别控件
读取状态
切换应用
输入
点击
验证结果
~~~

因此问题不是：

> CLI 好，还是 GUI 好？

而是：

> **一项真实业务工作，应该优先使用最可靠、成本最低的执行面。**

理想结构应该是：

~~~text
API
优先

CLI
能直接解决时使用

Browser DOM
适合网页时使用

Desktop semantic automation
需要真实 GUI 时使用

Vision
语义接口不足时补充

Agent
未知、变化和异常时介入
~~~

OpenDesk 如果有价值，应该是把最后几层做得专业，而不是强迫所有工作走鼠标点击。

---

## Manus 已经有 Skills，所以“复用”也不是 OpenDesk 独占

这是非常重要的一点。

Manus 当前 Skills 已经支持：

- 将成功工作流打包为 Skill；
- SKILL.md + 脚本 + 参考文件 + 模板；
- 个人复用；
- 团队 Skill Library；
- Project Skills；
- GitHub / 文件形式分享；
- Project 内统一工作方式。

官方甚至直接把 Project Skills 描述成：

> 把团队专业知识变成 reusable asset。

因此 OpenDesk 不能再宣传：

> “别人每次都从零开始，只有我们会复用。”

这已经不准确。

真正值得比较的是：

> **复用的到底是什么？**

例如：

~~~text
Manus Skill
可能保存：
Instructions
Scripts
References
Templates
Agent context

OpenDesk Workflow / Recipe
希望保存：
Executable steps
Inputs
Preconditions
Postconditions
Verification
Evidence
Compatibility
Failure handling
Repair history
~~~

这里不存在天然赢家。

只有真实任务测试以后，才能判断哪一种资产在某一类任务中：

- 更容易创建；
- 更便宜地重复；
- 更少人工介入；
- 更容易诊断；
- 更容易维护。

---

## Manus 也有 Scheduled Tasks 和 Cloud Computer

所以：

> “OpenDesk 可以长期运行，而 Manus 只能完成一次任务。”

同样不能成立。

Manus Cloud Computer 是一个独立 Ubuntu Linux 云机器，可以长期运行数据库、scraper、Bot、Python 程序等。

Scheduled Tasks 也已经用于：

- 每日；
- 每周；
- 定时扫描；
- 重复报告；
- 带 Project context 的周期工作。

因此 OpenDesk 真正值得证明的不是：

> 我也有 Scheduler。

而是：

> **在用户自己的 Mac / Windows、已经安装和登录的软件环境里，长期执行一项真实业务流程时，我们能否提供更可控的运行、验证和恢复能力？**

这是更窄，但也更有意义的问题。

---

## 云端长期任务和本机长期任务不是完全相同的东西

Manus Cloud Computer 的优势很明确：

~~~text
用户电脑关机
↓
Cloud Computer 仍可以继续运行
~~~

这非常适合 Bot、Server、Scraper、数据处理，以及无需真实用户桌面的长期程序。

而另一类业务必须依赖用户机器：

~~~text
企业 VPN
本地软件
已有登录态
特定证书
内网
本地文件
USB / 硬件
特定 Windows / macOS 应用
~~~

这种任务的执行环境本身就是业务的一部分。

所以：

~~~text
Cloud Computer
≠
User-owned Computer

User-owned Computer
也不一定优于 Cloud Computer
~~~

正确的问题是：

> **哪一种环境真正拥有完成任务所需要的权限、软件和状态？**

OpenDesk 的长期方向更偏向第二种。

---

## OpenDesk 不应该成为“另一个更大的 Manus”

这是一个非常重要的战略边界。

如果 OpenDesk 去全面复制：

~~~text
General Agent
Deep Research
Website Builder
Slides
Coding
Cloud Computer
Projects
Memory
Connector ecosystem
~~~

它会进入 Manus 的主场，而且需要巨大的模型、产品和分发投入。

更合理的是：

~~~text
Manus / Codex / Claude
        ↓
Understanding / Planning / Reasoning
        ↓
OpenDesk
        ↓
Local Computer Execution
Workflow
Verification
Evidence
Scheduler
Repair
Compatibility
Delivery
~~~

这使 OpenDesk 可以使用外部 Agent 的智能，而不是重新造一个通用 Agent。

---

## 但 OpenDesk 也可以拥有自己的 Agent UX

“不要重做 Manus”不等于 OpenDesk 只能做一个无界面的底层库。

它完全可以提供：

~~~text
OpenDesk Desktop
↓
用户用自然语言描述任务
↓
选择 Agent
Codex / Claude / future models
↓
Agent 使用 OpenDesk Runtime
↓
操作本机
↓
完成任务
~~~

区别在于：

> **Agent 是 OpenDesk 的一种使用方式，而不是 OpenDesk 唯一的资产。**

同一个 Runtime 还可以被 Developer、Scheduler、HTTP、MCP、Recorder、Workflow 调用。

这会形成三个清晰模式。

### Developer Mode

~~~text
人写 JavaScript
→ OpenDesk Runtime
→ Desktop / File / Network
~~~

### Agent Mode

~~~text
自然语言 Goal
→ Agent
→ OpenDesk
→ 动态完成复杂任务
~~~

### Automation Mode

~~~text
稳定任务
→ Workflow / Recipe
→ Scheduler / Trigger
→ 重复运行
~~~

它们应该汇合到同一个执行和 Evidence 系统。

---

## 真正值得竞争的是“长期业务执行”，不是“第一次完成”

假设老板说：

> 每天检查 ERP、客服后台和本地表格，把异常订单整理出来。

Manus 可能第一次就能很好地完成。

这非常有价值。

但如果企业准备把这个工作真正交出去，接下来才会出现另一组问题：

~~~text
连续运行 1000 次正确多少次？

ERP 变了怎么办？

登录过期怎么办？

某一步提交状态不明确怎么办？

是否会重复操作？

业务结果怎样独立验证？

错误发生后能否知道最后可信状态？

谁负责修复？

第二台机器部署需要多久？

一个月总成本是多少？
~~~

这些是 OpenDesk 应该进入的竞争维度。

但同样不能假设 Manus 做不到。

必须通过 Benchmark 测。

---

## OpenDesk 最值得建立的几个对象

如果要成为一个专业 Local Agentic Automation Runtime，长期应该把以下对象做成一等公民：

~~~text
Execution
Durable Task
Workflow / Recipe
Input / Output
Precondition
Postcondition
Verification / Oracle
Evidence
Compatibility
Failure
Repair
Schedule / Trigger
Package / Delivery
~~~

这里最值得关注的是 Durable Task。

Scheduler 解决：

> 什么时间启动任务。

但长任务还需要：

~~~text
Task
↓
Execution A
↓
等待外部条件
↓
Checkpoint
↓
第二天 Resume
↓
Execution B
↓
异常升级 Agent
↓
继续
~~~

这是从“脚本自动化”进入“数字员工”的关键一步。

---

## Manus 和 OpenDesk 更可能形成这种关系

长期更合理的结构可能是：

~~~text
                   User
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
      Manus        Claude       Codex
        \            |            /
         \           |           /
          ─────── OpenDesk ──────
                     │
           Local Computer Runtime
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
      macOS        Windows      Browser
        │            │
        └──── Existing Apps ─────┘
                     │
               Business Work
~~~

在这个结构里：

- Manus 可以是上游 Agent；
- Manus 也可以是直接竞品；
- OpenDesk 可以给其他 Agent 提供执行能力；
- 某些任务可能完全不需要 OpenDesk；
- 某些高频、本地、GUI-heavy 的任务可能更适合专门 Automation Runtime。

这比“谁替代谁”更符合真实市场。

---

## 企业真正应该怎样选择？

不要问：

> Manus 强还是 OpenDesk 强？

应该问：

> **对这一项工作，哪个方案的完整成本最低、结果最可靠？**

建议比较：

| 维度 | Manus My Computer | OpenDesk + Agent | OpenDesk Workflow |
| --- | --- | --- | --- |
| 第一次未知任务 | 实测 | 实测 | 通常需要先 authoring |
| 本地文件 / CLI | 实测 | 实测 | 可编程 |
| GUI-heavy Desktop | 实测 | 实测 | 实测 |
| 跨 App | 实测 | 实测 | 实测 |
| 第二次重复 | Skill / Project 最佳方案 | Agent 最佳方案 | Recipe |
| 100 / 1000 次重复 | 实测 | 实测 | 实测 |
| 结果独立验证 | 实测 | 实测 | 实测 |
| UI 改版后恢复 | 实测 | 实测 | 实测 |
| 长期本机运行 | 实测 | 实测 | Scheduler / Runner |
| 云端 24/7 | Manus Cloud Computer | 非当前核心 | 非当前核心 |
| 第二台机器交付 | 实测 | 实测 | Package / config |
| 完整成本 | 实测 | 实测 | 实测 |

这里不能提前把任何一列写成赢家。

---

## 最重要的 Benchmark

如果只做一个实验，应该做：

> **Manus My Computer vs OpenDesk + Agent vs OpenDesk Recipe**

选择一个真正依赖本机软件的流程。

第一次：

~~~text
让三种方案都完成任务
~~~

然后：

~~~text
换输入运行 10 次
运行 100 次
引入一个 UI 变化
制造一次登录失效
制造一次提交状态不明确
换到第二台机器
~~~

统计：

~~~text
Verified Success Rate
False Success
Human Intervention
First-run Time
Replay Time
Model / Credit Cost
Repair Time
Deployment Time
Total Cost
~~~

最终指标：

> **Cost per Verified Business Outcome**

如果 Manus 全面更好，就直接使用 Manus。

如果 OpenDesk 在某类本地长期流程里明显更低成本、更容易维护，那么 OpenDesk 的竞争位置就有证据。

---

## 不要宣传“更强 Manus”

即使未来某些指标领先，也不建议首页写：

> Better Manus.

因为用户会自然把比较扩展到 Research、Slides、Website、Coding、Cloud Computer、Connectors、General Agent UX。

这些并不是 OpenDesk 最值得争的位置。

更合适的表达是：

> **A programmable local computer runtime for AI agents and automation.**

中文可以是：

> **让 AI 和程序在你的真实 Mac / Windows 上长期工作。**

进一步，如果 Agent-to-Recipe 证明成立：

> **复杂任务交给 Agent，稳定工作交给 Workflow。**

或者：

> **让 AI 学会工作，再让自动化长期完成它。**

这些表达都比“更强 Manus”更加稳固。

---

## 如果 Manus 越来越强，OpenDesk 会不会最终没有价值？

会存在这种可能。

如果未来 Manus 可以在：

- 本地 GUI；
- 长期任务；
- 可靠复跑；
- Verification；
- Repair；
- 企业本地执行；
- Workflow delivery；

这些维度都做到更简单、更便宜、更可靠，那么 OpenDesk 应该调整甚至停止某些方向。

这并不是失败。

产品战略真正应该坚持的是：

> **解决客户尚未被最佳替代方案解决的问题。**

而不是维护一个预先假定必须存在的产品。

目前值得验证的假设是：

> 通用 Agent 获得 Computer Use 以后，仍然会存在一层专业的 Local Automation Runtime，用于高频、GUI-heavy、需要验证和长期维护的工作。

OpenDesk 是否能够成为这一层，需要数据证明。

---

## 最后一句

Manus 证明了一件事情：

> **未来 Agent 会越来越容易获得用户电脑。**

这不是 OpenDesk 消失的理由。

它把 OpenDesk 的问题变得更严格：

> **当 Agent 已经拥有电脑以后，专业 Automation Runtime 还能额外提供什么？**

OpenDesk 当前最值得验证的答案是：

~~~text
Programmability
+
Desktop semantics
+
Deterministic execution where appropriate
+
Verification
+
Evidence
+
Long-running workflows
+
Repair / compatibility
+
Commercial delivery
~~~

一句话：

> **Manus 让 Agent 获得电脑；OpenDesk 要证明的是，获得电脑以后，怎样把电脑变成长期可靠的业务执行环境。**

---

## 事实与证据入口

本文不是 OpenDesk 当前能力事实源。

OpenDesk 当前事实与正式战略请以：

- docs/project/overview.md
- docs/api/
- docs/plans/commercialization/agent-driven-rpa-positioning.md
- docs/research/commercialization/agent-driven-rpa-competitor-matrix-2026.md
- docs/quality/agent-driven-rpa-competitive-benchmark.md

为准。

Manus 主要官方资料，访问日期 2026-09-26：

- https://help.manus.im/en/articles/14178443-what-is-the-my-computer-feature-capable-of
- https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer
- https://manus.im/blog/manus-project-skills
- https://manus.im/features/agent-skills
- https://help.manus.im/en/articles/14753565-how-to-share-and-use-skills-in-manus
- https://www.manus.im/ja/blog/manus-schedules
