# OpenDesk Agent-driven RPA 定位与领先证明计划

更新时间：2026-09-16

> 文档性质：Plan / Product Positioning。
>
> 本文把当前市场与竞品研究收口成产品定位、竞争边界和证明路线。它不是“OpenDesk 已经全球前三”的声明；所有领先结论都必须由后续公开、可复现的同任务证据支持。
>
> 研究基线：[`Agent-driven RPA：首个全球竞争位置、地域边界与竞品地图`](../../research/commercialization/agent-driven-rpa-positioning-2026.md)。

## 1. 当前产品定位决策

OpenDesk 的主赛道保持：

> **Agent-driven RPA / Agent 驱动的桌面自动化。**

第一优先的全球竞争小山头：

> **Agent → Verified Reusable Desktop RPA**
>
> 让 Agent 不只是把桌面任务完成一次，而是把一次成功沉淀成可验证、可重复运行、出现变化后能够诊断和维修的自动化资产。

推荐品牌主张：

> **让 AI 做一次，变成可复用的桌面自动化。**

英文方向：

> **Turn one successful agent run into reliable desktop automation.**

在完整 Agent → Recipe 闭环尚未取得充分资格证据以前，当前对外更稳妥的产品描述是：

> **A verifiable, reusable desktop execution layer for AI agents.**

这三层不能混淆：

```text
类别定位
Agent-driven RPA

竞争位置
Agent → Verified Reusable Desktop RPA

当前能力表达
verifiable / reusable desktop execution layer for AI agents
```

## 2. OpenDesk 不竞争什么

当前不以以下范围争“全球第一”或主要品牌心智：

- 通用 Computer Use Agent；
- 最强 macOS Agent CLI；
- 最强 Windows Desktop Driver；
- 通用企业 RPA 平台；
- Browser Agent；
- 完整客服 SaaS；
- 完整电商 SaaS；
- 通用 Agent OS；
- 单纯 MCP Desktop Server。

这些市场已有强对手，而且很多能力已经商品化。OpenDesk 的竞争重点是 Computer Use 后半段：

```text
成功一次
→ 识别必要路径
→ 参数化
→ 形成可审阅 Workflow / Recipe
→ 独立验证业务结果
→ 低成本复跑
→ 失败证据
→ Repair
→ 商业交付
```

## 3. 五个竞争位置及各自角色

下面五个位置默认按**全球技术竞争集合**理解。中国市场需要独立加入影刀、实在智能、Quicker、按键精灵、uTools、阿里云 RPA / 原码栈、国内 ERP / 客服 SaaS 等，不直接套用全球判断。

| 优先级 | 竞争位置 | 在战略中的角色 | 当前决定 |
| --- | --- | --- | --- |
| P0 | Coding Agent → Verified Reusable Desktop RPA | 主品牌山头 | 最优先建立 Top 3 证据 |
| P0 | Agent-authored Desktop Automation Commercial Delivery Runtime | 更窄、更可能形成 Top 1 的商业技术山头 | 用真实交付者 / 客户验证 |
| P0 | Human / Agent Demonstration → Maintainable Recipe | 核心 Authoring 体验 | 补齐最小闭环后公开对测 |
| P1 | Cross-platform Agent Desktop Runtime + Low-token CLI + Human-first Recorder UX | 开发者流量入口 | 不单独宣传“Low Token 第一” |
| P1 | Evidence / Measurement / Repair-driven RPA Authoring | 技术护城河 | 不作为首页第一卖点 |

这些不是五个独立产品。它们属于一条产品链：

```text
Agent-first authoring ─┐
                      ├→ semantic / executable evidence
Human-first Recorder ─┘
                         ↓
                   Workflow / Recipe
                         ↓
                      Verify
                         ↓
                    Reusable Run
                         ↓
                 Diagnose / Repair
                         ↓
                Package / Deliver
```

## 4. Cua / Peekaboo 对 OpenDesk 的真实启示

不能把 OpenDesk 的优势写成“别人没有 UI / Recorder”。

当前研究已经确认：

- Cua 有跨平台 Driver、CLI / MCP / SDK，也有 trajectory recorder；仓库中还存在 Gradio UI / demonstration 数据采集能力；
- Peekaboo 不只是 OpenClaw 的 CLI，它是 macOS CLI + menu-bar App + Agent / MCP 工具，并提供权限引导和可视反馈；
- Cua / Peekaboo 在 Agent 操作桌面、工具成熟度、后台执行或 macOS 深度等方面分别存在明显优势。

因此 OpenDesk 应证明的差异不是：

```text
我有 UI
我有 Recorder
我也能 click / type
```

而是：

> **同一套产品是否能让 Agent 探索和普通用户演示都汇合到可维护、可验证、可复用的正式自动化。**

尤其需要比较：

```text
首次完成时间
首次制作自动化的人工干预
Recorder / Agent evidence 的业务语义质量
生成资产的可读性与参数化程度
换输入后的正确复跑率
错误成功率
应用变化后的定位 / 维修时间
交付到第二台机器 / 第二个客户的工时
每个正确业务结果的全成本
```

## 5. 产品主张必须由四类证明支撑

### 5.1 First-run Benchmark

回答：第一次面对陌生任务时，OpenDesk 是否能高效让 Agent / 人完成任务？

对比对象按任务选择：Codex / Claude Computer Use、Cua、Peekaboo、ADH、OpenAdapt、成熟 RPA 或人工。

### 5.2 Replay Benchmark

回答：第一次成功以后，是否真的不必每次从零探索？

要求各方都使用自己已经调好的最佳可复用资产，不能拿 OpenDesk 固定 Recipe 对比对方每次重新规划。

### 5.3 Repair Benchmark

回答：软件界面、窗口位置、字段或版本变化后，谁能更快发现变化、停止错误动作并恢复可用？

必须统计：

- false success；
- unsafe / duplicate action；
- time-to-diagnose；
- time-to-repair；
- repair 后回归成功率。

### 5.4 Delivery Benchmark

回答：一个自动化从作者电脑到第二台机器 / 第二个客户，需要多少安装、权限、参数化、授权、支持和维修成本？

这是 Commercial Delivery Runtime 山头的核心证明。

## 6. Agent-first + Human-first 是一个产品，不是两个产品

OpenDesk 应明确建设双入口：

```text
Codex / Claude / Coding Agent
→ Desktop CLI / tools
→ 真实任务探索

普通用户 / 业务专家
→ Recorder UI
→ 人工演示
```

两条入口最终必须尽量汇合到同一种资产：

```text
Evidence
→ Distilled Business Steps
→ Parameterized Workflow / Recipe
→ Verification
→ Qualification
→ Reusable Execution
```

只有当这个汇合真实成立时，“有 Recorder UI”才从功能变成竞争优势。

如果 Recorder 只能生成坐标宏，而 Agent 生成另一套无法共同维护的脚本，两套入口并不会形成领先。

## 7. 开发者流量、产品主张和现金流必须共用同一主线

### 流量入口

```text
Codex / Claude / MCP / GitHub
Cua / Peekaboo / OpenAdapt / ADH comparison
Recorder / Verification / RPA-as-code content
```

### 产品主张

```text
Agent / Human 做一次
→ Verified Reusable RPA
```

### 第一现金流

```text
具体行业 Workflow qualification
→ 固定范围实施
→ Maintenance
→ 同类客户复用
```

电商、客服、内容等行业用于验证收入，不取代总定位。

Plugin / Skill / CLI 可以是获客和集成入口，但不应该为了流量重新造一个与主产品无关的工具。

## 8. 全球与中国采用两套竞争账本

### 全球

目标：争技术类别与开发者心智。

重点竞争集合：

- Codex / Claude Computer Use；
- Cua；
- Peekaboo；
- OpenAdapt；
- Agent Desktop Harness；
- UiPath / Microsoft / Automation Anywhere 等 Agentic RPA；
- Browser / workflow / API 组合方案。

主要证据：公开 Benchmark、GitHub、英文技术内容、真实 Workflow 交付。

### 中国

目标：争使用场景、实施效率与付费客户。

重点竞争集合：

- 影刀；
- 实在智能；
- Quicker；
- 按键精灵；
- uTools；
- 阿里云 RPA / 原码栈；
- 行业 ERP / 客服 / 电商工作台原生能力。

主要证据：真实客户任务、实施费、支持工时、复用率和续费。

同一个“全球 Top 3”结论不得未经重新比较直接用于“中国前三”，反之亦然。

## 9. 进入 Top 3 / Top 1 宣传前的门槛

### 可以宣传“有机会冲击 Top 3”

需要：

- 竞争集合和任务范围明确；
- OpenDesk 当前相关能力已真实运行；
- 至少有一套公开公平 Benchmark 设计；
- 明确最强竞争者在哪里更强。

### 可以宣传“在有限测试中领先”

需要：

- 固定版本、环境、输入、模型、预算；
- 多任务 / 多输入；
- 失败样本公开；
- 业务后置条件独立验证；
- 全成本和维修时间计入。

### 可以宣传“Top 3 / Top 1”

需要独立定义市场范围和足够覆盖的竞争集合，并取得可复核证据。单个成功 Demo、内部评分、功能数量、Star 数、关键词限定都不够。

## 10. 当前最高优先级产品动作

未来产品投入应优先支持下面的证明链，而不是继续扩大功能面：

1. 完成最小 Agent / Human → Recipe → Qualification 闭环；
2. 建立 First-run / Replay / Repair 公平 Benchmark；
3. 用至少一个 macOS 和一个 Windows 真实应用族验证同任务复用；
4. 把 Recorder 生成资产与 Agent authoring 资产尽量统一到同一种 Workflow contract；
5. 选择一个真实行业任务取得第一批付费、维护和跨客户复用数据。

后续内容增长计划见 [`Agent-driven RPA 内容策略`](agent-driven-rpa-content-strategy.md)。
