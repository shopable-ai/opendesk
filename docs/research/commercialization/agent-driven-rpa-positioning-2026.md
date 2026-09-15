# Agent-driven RPA：首个全球竞争位置、地域边界与竞品地图

更新时间：2026-09-16  
研究基准提交：`6ed88213a4ed0310957042d09cd843fe36c10ca9`

> 文档性质：Research / 产品定位与竞争决策输入。本文不是当前产品能力承诺、全球排名证明或正式 Roadmap。
>
> 本文回答：OpenDesk 应该把什么作为品牌定位、哪些更小的竞争范围值得争 Top 3 / Top 1、这些判断对应全球还是中国市场、Cua / Peekaboo 等竞品是否已经具备 UI / Recorder，以及后续应该围绕哪些竞争对象继续验证。

## 1. 核心结论

OpenDesk 不应把“电商售后助手”作为产品总定位，也不应继续把“会让 AI 点击电脑”作为主要差异。

推荐四层结构：

```text
大赛道
Agent-driven RPA / Agent 驱动的桌面自动化

第一个全球竞争小山头
Agent → Verified Reusable Desktop RPA
让 Agent 不只完成一次桌面任务，而是把成功任务沉淀成可验证、可重复运行的自动化

第一个开发者流量入口
OpenDesk for Codex / Claude / Coding Agents
把 OpenDesk 作为 Agent 的桌面执行 + 结果验证 + 可复用 Workflow 层

第一现金流验证场景
电商、客服、内容等具体跨系统工作流实施
```

推荐品牌主张：

> **让 AI 做一次，变成可复用的桌面自动化。**

英文方向：

> **Turn one successful agent run into reliable desktop automation.**

在完整 Agent → Recipe 闭环尚未全部取得资格证据以前，对外更稳妥的当前表达为：

> **A verifiable, reusable desktop execution layer for AI agents.**

## 2. 先纠正一个上一轮的混淆：收费场景 ≠ 品牌山头

上一轮“电商异常订单查证与回复草稿”在商业候选中排名靠前，原因主要是：

```text
买方较容易定义
+ 业务结果容易验收
+ 价值容易算
+ 容易先卖有限实施服务
```

它并不是因为：

```text
市场没有竞争
或
OpenDesk 已经在这个行业全球前三
```

因此重新定义：

```text
电商异常订单
= 第一组现金流试验田候选
≠ OpenDesk 的总品牌定位
```

OpenDesk 的技术品牌应围绕 Agent Computer Use 之后的“复用、验证、维修、交付”建立；行业只是证明该底座可以创造收入的案例。

## 3. 五个最值得争的位置：地域范围先说明

### 3.1 地域口径

本文下面的五个位置，**默认全部是全球技术竞争位置**，不是“中国全国排名”。

判断依据主要来自：

- 全球开源项目；
- Codex / Claude 等全球 Coding Agent 生态；
- 全球企业 RPA / Computer Use 产品；
- 英文官方文档、GitHub、公开产品能力；
- OpenDesk 当前源码与正式文档。

因此这些分数只能理解为：

> **在全球竞争集合中，哪个有限范围最值得 OpenDesk 投入并建立公开证据。**

它们不是已经通过 Benchmark 得到的全球名次。

中国市场需要另开竞争集合，至少加入：

```text
影刀 RPA
实在智能
Quicker
按键精灵
uTools
阿里云 RPA / 原码栈
国内 ERP / 电商工作台 / 客服 SaaS
本地 AI Agent / MCP 工具
```

不能把全球开源工具排名直接变成中国排名，也不能把中国 RPA 的渠道优势直接变成全球排名。

### 3.2 五个位置

评分框架：

```text
当前真实能力        25
相对稀缺性          20
市场需求信号        20
竞争位置可证明性    15
营销表达            10
商业延展            10
                  = 100
```

这些分数是**决策优先级**，不是统计排名或成功概率。

| 顺序 | 候选小山头 | 地域 | 当前决策分 | 当前判断 |
| --- | --- | --- | ---: | --- |
| 1 | Coding Agent → Verified Reusable Desktop RPA | 全球 | **84** | 最值得投入公开 Benchmark，争全球 Top 3 |
| 2 | Agent-authored Desktop Automation Commercial Delivery Runtime | 全球；中国实施商市场也值得单独验证 | **81** | 更窄，若买方需求成立，最值得争 Top 1 |
| 3 | Human / Agent Demonstration → Maintainable Recipe | 全球 | **78** | Top 3 潜力，但 OpenDesk 自身完整链仍未全部资格化 |
| 4 | Cross-platform Low-token Desktop CLI for Coding Agents | 全球开发者 / GitHub | **72** | Cua / Peekaboo 很强；OpenDesk 应通过 UI Recorder + reusable workflow 扩大比较维度，而不是只比 CLI |
| 5 | Evidence / Measurement / Repair-driven RPA Authoring | 全球 RPA 工程能力 | **68** | 技术稀缺、营销搜索意图较弱，更适合作为护城河和 Benchmark 证明层 |

### 3.3 “Top 3 / Top 1”应怎样理解

当前没有足够证据宣传：

```text
OpenDesk 已是全球 Top 3
OpenDesk 已是中国 Top 3
OpenDesk 全球第一
```

当前可以成立的是：

```text
已经找到几个足够有限、真实有竞争意义的候选范围
→ OpenDesk 的现有资产与这些范围高度相关
→ 可以通过公开同任务对测验证是否真的进入前列
```

因此后续目标不是继续发明更窄的限定词，而是：

> **固定竞争范围，建立公开任务集，与最强直接替代方案做公平同任务对测。**

## 4. 第一小山头：Coding Agent → Verified Reusable Desktop RPA

### 4.1 定义

比较范围不是“谁能点击桌面”，而是：

```text
Coding Agent / AI Agent
→ 探索真实桌面应用并完成一次任务
→ 保存真实观察与执行证据
→ 明确成功条件
→ 形成可参数化、可审阅的 Workflow / RPA
→ 新输入下低成本复跑
→ 独立验证结果
→ 失败时提供可维修证据
```

### 4.2 为什么适合 OpenDesk

当前仓库已经存在的相关基础包括：

```text
opendesk ai
+ Codex / Claude Code / shell Agent 使用面的低 Token JSON CLI
+ Window / Screenshot / Mouse / Keyboard / Vision
+ Accessibility / UI semantic actions
+ 普通 JavaScript Workflow / Recipe
+ Execution input / output / artifacts
+ Recorder
+ Scheduler
+ Measurement / Evidence / Repair 方向
+ .odpkg / License / Activation
```

正式依据主要见：

- `docs/api/ai-cli.md`
- `docs/api/agent.md`
- `docs/api/accessibility.md`
- `docs/api/recorder-runtime.md`
- `workflows/agent-to-recipe/**`

但当前仍缺：

- 多真实应用 Agent → reusable workflow 的公开资格矩阵；
- 与 Cua / Peekaboo / ADH / OpenAdapt / Codex Computer Use 的同任务对测；
- 首次探索和固定复跑分开的时间、正确率、Token / 模型成本；
- UI 改版后的维修工时；
- Windows 与 macOS 同等级资格证据。

所以当前状态应表述为：

> **具备冲击这个有限范围全球 Top 3 的基础，尚未取得 Top 3 证明。**

## 5. 第二小山头：Agent Automation Commercial Delivery Runtime

### 5.1 定义

这个位置比“Computer Use”更小：

> **把 Agent 做出来的桌面自动化，交付成客户能安装、运行、授权、验证、升级和维修的正式自动化产品。**

问题空间包括：

```text
如何安装
如何传业务参数
如何运行与取消
如何记录执行证据
如何保护 Recipe
如何授权设备
如何升级
如何定义支持边界
失败后如何把证据交给维护者
```

### 5.2 为什么可能更容易争 Top 1

OpenDesk 已经同时建设：

```text
普通 .js Recipe
+ .odpkg
+ Publisher verification
+ License / Activation
+ device-bound authorization
+ in-memory decrypt
+ Execution / Artifacts
+ App Mode / Custom UI
```

很多 Computer Use Driver 的核心商品是“给 Agent 一台可以操作的电脑”；很多 RPA 平台又主要服务企业完整平台。

OpenDesk 有机会占据中间更小的位置：

> **为 AI 自动化开发者 / 实施者提供从 Agent 制作到客户本地交付的一体化 Runtime。**

当前未知项是买方：

```text
自动化外包开发者
AI 自动化顾问
ERP / CRM 实施商
独立软件开发者
企业内部自动化团队
```

是否愿意为“交付、授权、维护”这一层付费，仍需要真实访谈和实施订单验证。

## 6. 第三小山头：Human / Agent Demonstration → Maintainable Recipe

OpenDesk 最有传播力的长期链之一仍然是：

```text
Human 做一次
或
Agent 探索做一次
→ 记录真实 Evidence
→ 去掉探索、错误、重复
→ 提取必要路径
→ 参数化
→ 形成 Recipe
→ Qualification
→ 正式重复执行
```

需要避免的口号：

```text
录一次永久学会
做一次永远不坏
任何软件都能学会
```

真正值得竞争的主张是：

> **示范或 Agent 探索之后，得到的是可验证、可维护的正式自动化资产，而不是一串不可解释的录制动作。**

当前 `Recorder` 已有人工采集、semantic evidence、`buildActions()` 与 `generateScript()` 等正式接口，但 `Agent-to-Recipe` 设计仍有部分目标职责没有成为完整稳定产品能力，所以这个位置还需要实施闭环后再做领先宣称。

## 7. 第四小山头需要修正：Cua / Peekaboo 并不是“只有程序员 CLI”

### 7.1 Cua：有 UI，也有 Recording，但 Recording 的产品目标与 OpenDesk 不完全相同

Cua 当前不能被描述为“完全没有 UI / Recorder”。本轮重新核验到：

1. Cua Driver 当前提供 trajectory recorder。
   - `start_recording` 后会记录后续 `click`、`scroll`、`type_text`、`press_key`、`hotkey`、`set_value` 等 **Agent / tool action calls**；
   - 每一步可保存 before / after 状态、截图、action 参数与 evidence；
   - 可进一步生成用于演示的视频。
2. Cua Python Computer Interface 当前仓库仍保留 Gradio UI。
   - `libs/python/computer/computer/ui/gradio/app.py`；
   - 可保存 demonstration、截图、tool calls、tags，并上传 Hugging Face dataset。
3. Cua 早期公开教程明确把该 UI 用于人工 demonstration / trajectory 数据采集和模型训练。

因此不能宣传：

> “OpenDesk 是唯一有 Recorder / UI 的 Computer Use 工具。”

更准确的差异候选是：

```text
Cua Recording
强项：Agent action trajectory、before/after state、训练数据、Benchmark、视频演示、跨平台 Driver

OpenDesk Recorder / Authoring
当前方向：普通用户可见 Recorder 工具栏、人工操作采集、semantic evidence、actions 制作、普通 JS 生成、重放、Measurement、后续 qualification / repair
```

最值得比较的问题不是“谁有录制按钮”，而是：

> **录制后是否能更低成本地产生可读、参数化、可长期运行、可维修的正式业务自动化。**

这个差异目前仍是待对测假设，不是已证明领先。

### 7.2 Peekaboo：也不是只给 OpenClaw / 程序员

Peekaboo 当前 README 明确是：

```text
macOS CLI
+ menu-bar app
+ screen capture
+ accessibility inspection
+ native UI automation
+ agent sessions
+ MCP integration
```

它的 Mac App 提供权限 onboarding、visual feedback 和 agent sessions；MCP 可以接 Codex、Claude Code、Cursor 或其他客户端，并不是只服务 OpenClaw。

本轮没有从当前 Peekaboo README / command docs 中取得以下能力的证据：

```text
全局人工鼠标键盘 Recorder
→ buildActions
→ semantic script / workflow generation
→ 人工录制后直接形成长期 RPA
```

因此当前可以把 Peekaboo 视为：

> **非常强的 macOS Agent automation / inspection / CLI + App 工具，而不是已经证明拥有与 OpenDesk Human-to-Recipe 相同链路的产品。**

但仍不能写成“Peekaboo 没有 UI”。

### 7.3 OpenDesk 真正应该拿 Recorder UI 来增加哪部分竞争力

`README.md` 当前已经有正式 OpenDesk Desktop 和原生 Recorder 工具栏；录制停止后保存结果、生成 JavaScript，并可通过工具栏重放。

这意味着第 4 个小山头不应只定义成：

> Cross-platform Low-token Desktop CLI

应改成更完整的产品比较：

> **Cross-platform Agent Desktop Runtime with both Agent-first and Human-first authoring UX**

也就是同时服务：

```text
Coding Agent
→ CLI / JSON / MCP / Workflow

普通用户 / 实施者
→ Desktop App / Recorder UI / Measurement / Replay
```

如果后续能够证明这两种入口最终汇合到同一套：

```text
Semantic Procedure
→ Recipe
→ Verification
→ Packaging
→ Repair
```

它会比“低 Token CLI”本身更有竞争价值。

### 7.4 但 UI 不是自动领先

成熟 RPA 平台长期都有 Recorder、Designer、UI Automation 和运行控制台；UiPath Delegate、Codex Record & Replay、OpenAdapt 等也在向 Demonstration → reusable automation 演化。

所以：

```text
有 UI
≠ 领先

有 Recorder
≠ 领先
```

真正应该测的是：

```text
第一次制作花多久
用户要理解多少 RPA 概念
需要多少人工修正
生成后的流程可读性
换输入复用成功率
业务错误成功率
UI 改版维修工时
每个正确结果的总成本
```

## 8. 第五小山头：Evidence / Measurement / Repair-driven RPA Authoring

这个位置技术上很有价值，但不适合单独做首页大定位。

它回答：

```text
为什么这个点击是对的？
目标现在还是同一个对象吗？
结果真的完成了吗？
失败前最后一个可信状态是什么？
软件改版后坏在哪？
维修候选怎样重新取得资格？
```

OpenDesk 的 Desktop Measurement、Accessibility、Execution artifacts、Evidence / Repair 方向可以成为：

> **第一个小山头“可验证、可复用 RPA”的证明层与护城河。**

Marketing 不应宣传“我们有 Measurement”，而应转译成：

> **自动化失败时知道为什么，而不是只知道没点到。**

## 9. 竞品地图：后续必须跟踪的对象

这里按“为什么需要比较”分类，而不是把所有项目都称为直接竞品。

### Tier 0：直接决定第一个全球山头能否成立

| 竞品 / 组合 | 主要比较面 | OpenDesk 需要证明什么 |
| --- | --- | --- |
| Cua Driver / Cua | 跨平台 Agent desktop driver、trajectory、benchmark、cloud desktops | Recorder → reusable workflow、验证与交付是否更完整；首次制作与复跑成本 |
| Peekaboo | macOS CLI / App / MCP / Agent sessions / native automation | OpenDesk 是否能在跨平台、Human Recorder、workflow reuse 上建立优势 |
| Agent Desktop Harness | Agent exploration → Robot Framework → validation → evidence → reuse | OpenDesk JavaScript / Runtime / packaging 是否更低门槛、更好交付 |
| OpenAdapt | demonstration / qualification / governed reusable automation | OpenDesk 的 authoring、qualification、维修和交付经济性 |
| OpenAI Codex Computer Use / Record & Replay | Coding Agent 原生 computer use、示范与 skill reuse | 为什么还需要 OpenDesk；OpenDesk 是否降低重复执行与跨 Agent 绑定成本 |
| Anthropic Claude Computer Use / Claude Code | Agent 原生 computer use | 与 Claude 配合而不是与 Claude 重做 Agent；Reusable RPA 增量是什么 |
| UiPath Delegate + RPA | 企业 Agentic RPA、recording、Routine、治理 | 小团队 / 开发者是否能更低部署和实施成本获得足够可靠性 |
| Power Automate / Copilot Studio Computer Use | Microsoft 生态、Windows、流程与治理 | 跨平台 / 本地交付 / Agent-neutral 是否有具体价值 |

### Tier 1：直接替代某一层能力

- Automation Anywhere / Process Reasoning Engine；
- 影刀 RPA；
- 实在智能 Agent RPA；
- UI-TARS；
- Agent-S；
- Browser Use；
- Skyvern；
- Playwright + Agent；
- n8n + Agent / MCP；
- Dify Agent / Workflow；
- Robot Framework / Robocorp 类 RPA-as-code 组合；
- pywinauto / PyAutoGUI / nut.js 等代码自动化工具。

### Tier 2：中国个人效率 / Creator / 宏替代

- Quicker；
- AutoHotkey；
- 按键精灵；
- uTools；
- Keyboard Maestro；
- Hammerspoon；
- BetterTouchTool；
- Script Kit；
- AutoIt；
- OpenRPA；
- RPA.Assistant。

这些工具不一定具有 Agent-driven RPA 的完整链路，但会直接影响：

```text
一个用户为什么不用宏 / 快捷动作就够了？
为什么需要 Agent？
为什么需要 OpenDesk 的 Recorder / Verification / Packaging？
```

### Tier 3：垂直业务替代

行业场景必须同时比较：

```text
官方 API
应用自带自动化
ERP / CRM / 客服 SaaS
脚本 + Agent
成熟 RPA
人工服务
继续手工作业
```

不能因为 OpenDesk 技术上能操作一个业务软件，就推断有商业优势。

## 10. 竞争主张边界

### 当前可以说

- OpenDesk 正在建设 Agent-driven desktop automation / RPA；
- 当前已有 Coding Agent CLI、桌面 Runtime、Recorder UI、普通 Workflow、Execution artifacts 等工程基础；
- 产品重点不是只让 Agent 点击一次，而是提高可验证复用与长期交付能力。

### 完成公开 Benchmark 后才可以说

- 在明确任务集上，比某些直接方案首次交付更快；
- 在固定复跑中 Token / 模型调用更少；
- 某些 UI 变化下维修时间更短；
- 在限定环境中取得 Top 3 或第一名结果。

### 当前不应该说

- 全球第一 RPA；
- 全球前三 Computer Use；
- 唯一拥有 Recorder；
- Cua / Peekaboo 只有 CLI 或只能给程序员；
- 任意软件都可以学会；
- 一次示范永久可用；
- 完全离线 / 永不出错 / 零维护。

## 11. 公开 Benchmark 的优先顺序

若目标是最快建立“有限范围 Top 3”证据，推荐先做三组：

### Benchmark A：Coding Agent Desktop Driver

```text
OpenDesk
vs Cua Driver
vs Peekaboo（macOS）
vs ADH（Windows）
```

任务：Calculator、Text Editor、文件对话框、表格录入、跨应用复制与验证。

指标：Agent round trips、输入/输出 Token、墙钟时间、正确完成、错误成功、应用兼容和失败证据。

### Benchmark B：一次成功 → 固定复跑

```text
OpenDesk Agent / Human authoring
vs Cua trajectory + caller-owned workflow
vs OpenAdapt
vs ADH
vs Codex Record & Replay（可取得时）
```

必须分开：

```text
首次探索成本
固定流程复跑成本
UI 改版维修成本
```

### Benchmark C：客户交付

用同一业务流程比较：

```text
安装到首次正确运行时间
参数化输入
客户确认 / 停止
业务结果验证
日志 / Evidence
打包 / 更新
维修所需材料
```

这是最有机会证明“Commercial Delivery Runtime”小山头的测试。

## 12. 本轮外部资料账本

访问日期：2026-09-16。

### Cua

- https://github.com/trycua/cua
  - 当前主 README 将 Cua 定位为给 AI Agent 提供电脑、跨平台 Driver、Fleets、Lume、Bench。
- https://github.com/trycua/cua/blob/main/docs/content/docs/reference/cua-driver/mcp-tools.mdx
  - 当前 Driver `start_recording` / trajectory recorder 记录 tool action invocation 的前后状态、截图与参数。
- https://cua.ai/docs/how-to-guides/driver/record-and-render-a-trajectory
  - 当前 trajectory 可以进一步渲染产品 Demo 视频。
- https://github.com/trycua/cua/blob/main/libs/python/computer/computer/ui/gradio/app.py
  - 当前仓库存在 Gradio UI，可保存 demonstration / tool calls / screenshots / tags。
- https://github.com/trycua/cua/blob/main/blog/training-computer-use-models-trajectories-1.md
  - 历史公开教程明确把该 UI 用于人工 trajectory / training data 采集。

### Peekaboo

- https://github.com/openclaw/Peekaboo
  - 当前 README：macOS CLI + menu-bar App；App 提供 permission onboarding、visual feedback、agent sessions；MCP 可连接 Codex、Claude Code、Cursor 等。
- https://github.com/openclaw/Peekaboo/blob/main/docs/automation.md
  - 当前 automation 以 observe / snapshot / semantic action / synthetic input 为主要路径。
- https://github.com/openclaw/Peekaboo/blob/main/docs/permissions.md
  - 当前 App / Bridge 与权限模型。

### OpenDesk 仓库事实

- `README.md`
  - OpenDesk Desktop、原生 Recorder 工具栏、录制后生成 JavaScript、重放。
- `docs/api/ai-cli.md`
  - Coding Agent JSON desktop tool surface 与 Workflow 运行。
- `docs/api/recorder-runtime.md`
  - 人工 input capture、semantic evidence、actions / script generation。
- `docs/api/accessibility.md`
  - macOS AX / Windows UIA 语义接口。
- `workflows/agent-to-recipe/**`
  - Agent → reusable recipe 的设计、证据与 qualification 目标边界。

## 13. 最终战略决策

如果只保留一句：

> **OpenDesk 不和别人竞争“AI 会不会操作电脑”；OpenDesk 要竞争的是“AI 操作电脑成功以后，能不能把这次成功变成可靠、可验证、可长期复用和可商业交付的 RPA”。**

产品、官网、GitHub README、Codex / Claude 集成、Demo、Benchmark 与后续 Blog 都应围绕这一主线收敛。
