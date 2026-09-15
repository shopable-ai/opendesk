# Agent-driven RPA Competitive Benchmark

更新时间：2026-09-16

> 文档性质：Quality / Benchmark Contract。
>
> 本文定义 OpenDesk 与 Agent-driven RPA / Computer Use / reusable RPA 竞品进行公开比较时必须遵守的固定输入、环境、断言、失败处理和评分规则。它不是一次已经执行完成的 Benchmark，也不包含虚构结果。

## 1. 目标

验证三个独立竞争问题：

```text
A. Agent → Verified Reusable Desktop RPA
B. Human + Agent → Same Maintainable Workflow
C. Agent-authored Automation → Client-ready Delivery Runtime
```

并把整个生命周期拆成四段：

```text
First-run
→ Author / Distill
→ Replay
→ Repair
→ Delivery
```

其中 Author / Distill 是 First-run 与 Replay 的必要桥梁，不能把“OpenDesk 已经人工写好的固定脚本”直接拿去对比“竞品第一次从零探索”。

## 2. 比较对象

P0 直接比较对象：

- OpenDesk；
- Cua；
- Agent Desktop Harness（ADH）；
- OpenAdapt Flow / Desktop；
- Codex Computer Use + Record & Replay；
- Peekaboo（macOS track）。

P1 enterprise track：

- UiPath Delegate；
- Microsoft Copilot Studio Computer Use；
- Automation Anywhere Agentic Process Automation。

无法取得合法、可重复、合理授权环境的产品标记：

```text
UNTESTED
```

不得记 0 分，不得自动判负。

## 3. 公平比较原则

### 3.1 每个产品使用其最佳公开推荐路径

例如：

- Cua 可以使用 Driver + 推荐 Agent integration；
- Peekaboo 可以使用 Agent / MCP / native action；
- ADH 可以使用 CLI/MCP exploration + Robot Framework；
- OpenAdapt 可以使用 demonstration → Flow compiler；
- Codex 可以使用 Computer Use + Record & Replay；
- UiPath Delegate 可以使用 screen recording / Routine；
- OpenDesk 可以使用 AI CLI / Recorder / JavaScript Workflow。

不得故意关闭对手正式能力制造差距。

### 3.2 First-run 与 Replay 必须分开

```text
First-run
= 第一次面对任务，从自然语言 / demonstration / exploration 到正确完成。

Replay
= 已经允许每个产品建立其最佳可复用资产后，用新输入重复完成任务。
```

不允许：

```text
OpenDesk = 固定 Recipe replay
竞品 = 每次从零 Agent planning
```

这种比较无效。

### 3.3 Human-first 与 Agent-first 分成两个 Authoring Track

Track A：Agent-first

```text
自然语言目标
→ Agent exploration
→ reusable asset
```

Track B：Human-first

```text
人工演示
→ recorder / compiler
→ reusable asset
```

如果产品没有其中一个入口，记 `NOT_SUPPORTED_IN_TRACK`，不影响它在另一个 Track 的结果。

“Human + Agent → same maintainable workflow”竞争结论只在同时支持两条入口的产品之间成立。

### 3.4 平台分轨，不把平台缺失偷换成失败

至少建立：

```text
macOS Track
Windows Track
```

Peekaboo 官方 macOS-only 时，不在 Windows 单任务里记失败；ADH Windows-only 时，不在 macOS 单任务里记失败。

只有当竞争命题本身是：

> cross-platform runtime

平台覆盖才作为正式评分维度。

## 4. 环境冻结合同

每次公开运行必须记录：

```text
benchmarkVersion
runDate
OS + build
hardware
screen count / resolution / scale
locale / input method
application name + version
account / permission state
network condition
product + version / commit
agent client + version
model + exact model ID
reasoning / budget / token limits
plugin / MCP / CLI configuration
allowed tools
workflow asset commit/hash
input dataset version
```

无法冻结的 SaaS 后端版本必须记录访问时间和产品 release channel。

## 5. 任务套件

### Tier 0｜系统基础任务

用于建立最低可重复基线，不用于宣称商业领先。

1. Calculator：多步计算并读取最终显示结果；
2. Text editor：输入、替换、保存文件；
3. File manager：创建/复制/重命名文件并由文件系统独立验证。

### Tier 1｜结构化生产工具

1. Spreadsheet：读取表格、写入指定单元格、保存，由文件内容独立验证；
2. Electron / Chromium desktop app：完成表单或设置修改，由应用状态或配置文件独立验证；
3. Office / document task：生成或修改文档，并通过导出/文件读取验证。

优先使用各平台都容易合法获取的公开应用；如果应用不同，任务语义和业务 oracle 必须等价。

### Tier 2｜受控业务模拟

建立一个公开、可复现的 benchmark fixture，模拟：

```text
订单查询
→ 多来源状态
→ 冲突 / stale data
→ 需要补查
→ 生成最终可验证结果
```

fixture 必须有独立 system-of-record API / data file 作为 oracle，UI 只是执行面。

它用于测：

- false success；
- safe stop；
- 多步骤 evidence；
- input parameterization；
- repair。

### Tier 3｜真实授权业务任务

只有在合法获得账号、数据和授权后执行。

例如：

- 电商异常订单查证；
- ERP / Excel 跨系统录入；
- 客服后台处理；
- 财务资料收集 / 对账。

Tier 3 不公开客户敏感数据；公开报告只能发布脱敏任务定义、聚合指标和允许的 Evidence。

## 6. First-run Benchmark

### 输入

每个产品得到语义等价的目标：

```text
Goal
Success Criteria
Allowed apps / account
明确禁止的副作用
```

不给 OpenDesk 私有 locator，也不给竞品额外隐藏提示。

### 记录

- wall-clock time；
- model / credit / token consumption（能够可靠读取时）；
- screenshot / observation count；
- action count；
- human intervention count；
- clarification count；
- unsafe proposed action count；
- final business success；
- false success；
- evidence completeness。

### 成功判定

必须由 Benchmark Oracle 独立检查。

产品自身输出：

```text
Done
Success
Completed
```

不能作为结果判定。

## 7. Author / Distill Benchmark

First-run 正确完成后，允许各产品建立最佳可复用资产。

记录：

- 从第一次成功到 reusable asset 的追加 wall time；
- human editing minutes；
- number of manual selectors / coordinates；
- 是否需要再次完整演示；
- 是否需要编写业务 assertion；
- asset size / readability；
- parameter schema 是否明确；
- secret / config 是否与流程代码分离；
- 是否能 review diff；
- 是否能 version-control。

对 Human-first Track 额外记录：

- 录制期间人工时长；
- Recorder 捕获的噪音动作；
- 最终需要删除/修正的动作比例；
- semantic target evidence coverage；
- generated workflow 可读性。

## 8. Replay Benchmark

### 数据集

每个任务至少：

```text
20 个正常输入
+ 10 个边界输入
```

正式对外 Top 3 结论建议扩大到：

```text
>= 50 held-out inputs / task family
```

### 环境变化

正常 Replay 至少随机化：

- window position；
- initial app focus；
- harmless data variation；
- timing jitter。

不要在正常 Replay 混入专门 Repair mutation。

### 指标

- correct completion rate；
- false-success rate；
- median / p95 runtime；
- human intervention；
- model calls / tokens / credits per correct run；
- action count；
- retry count；
- cost per correct result。

## 9. Repair Benchmark

每类 mutation 独立测试，不一次叠加所有变化。

### R1｜Geometry

- move window；
- resize window；
- DPI / scale change（平台允许时）。

### R2｜Semantic drift

- button label 改写；
- sibling 插入；
- element order 改变；
- identifier / accessible name 变化。

### R3｜Timing / async

- loading delay；
- delayed dialog；
- transient disabled state。

### R4｜Unexpected state

- modal popup；
- stale data；
- missing field；
- conflicting result。

### R5｜Application version

能够安全安装两个固定版本时，才作为正式 mutation；否则不虚构“版本变化”。

### 指标

- mutation detection rate；
- correct-stop rate；
- false-success rate；
- unsafe side effect count；
- median time-to-diagnose；
- median human repair minutes；
- post-repair regression success；
- asset diff size；
- whether repair is reusable across held-out inputs。

## 10. Delivery Benchmark

用于验证 Commercial Delivery Runtime 小山头。

### 环境

一台作者机器 + 一台干净目标机器。

目标机器不得预装开发仓库或作者本地依赖，除非产品正式交付模型明确要求。

### 路径

```text
package / export
→ install runtime
→ permission onboarding
→ install workflow / skill / routine
→ configure non-secret input
→ configure secret / credential
→ first successful run
→ retrieve evidence
→ update workflow
→ re-run
→ uninstall / revoke where supported
```

### 指标

- total human minutes；
- number of manual terminal commands；
- number of permission steps；
- workflow source exposure；
- device / user authorization support；
- input/config separation；
- secret handling；
- evidence export；
- upgrade time；
- rollback / revoke capability；
- second-machine first-success time；
- support incidents。

企业平台和 independent developer 产品属于不同市场。Delivery Top 1 结论必须先明确比较范围，例如：

> tools for independent automation developers delivering local Agent-authored desktop workflows to client machines

不能拿这个窄范围结论写成“全球 RPA 交付第一”。

## 11. 独立 Oracle 设计

按任务优先级：

1. system-of-record API / database read；
2. filesystem / exported file parse；
3. independent accessibility / application state read；
4. screenshot / OCR only when没有更强 oracle。

执行产品自己的 observation 不应同时作为唯一 oracle。

例：Calculator 可以由独立 display read 作为业务结果；文件任务由文件系统读取；订单 fixture 由后端数据源校验。

## 12. Failure Classification

每个失败映射到现有全局 Failure Taxonomy，并额外记录 benchmark outcome：

```text
CORRECT_SUCCESS
CORRECT_STOP
INCOMPLETE
FALSE_SUCCESS
UNSAFE_SIDE_EFFECT
HARNESS_FAILURE
EXTERNAL_BLOCKER
UNTESTED
```

`CORRECT_STOP` 只能用于 fault/mutation 测试。

正常任务主动停止仍记 `INCOMPLETE`，不能用“安全”掩盖无法完成任务。

## 13. 评分

### 13.1 核心总分（100）

| 维度 | 权重 |
| --- | ---: |
| Correct business completion | 30 |
| False-success / safety | 20 |
| Replay efficiency | 15 |
| Repair / diagnose | 15 |
| Delivery friction | 10 |
| Evidence / auditability | 10 |

总分只在：

- 比较对象完成足够相同任务；
- 未测试比例不超过预设阈值；
- 环境和版本冻结；
- 原始结果可审计；

时才发布。

否则只发布逐维结果，不给总排名。

### 13.2 Authoring 子榜

单独发布：

- Agent-first authoring；
- Human-first authoring；
- Dual-authoring convergence。

避免某产品没有 Human Recorder 就被错误判定为整体差。

## 14. Top 3 / Top 1 宣传 Gate

### G0｜Candidate

允许说：

> “这是 OpenDesk 选择竞争的一个全球小山头。”

不需要 Benchmark 结果。

### G1｜Measured advantage

允许说：

> “在 X 版本、Y 任务集、Z 环境中，OpenDesk 在某指标领先。”

要求：

- >= 3 有代表性任务族；
- >= 50 held-out 正常输入 / 任务族或等价样本量；
- mutation fault set；
- 原始 summary 可复核；
- strongest substitute included。

### G2｜Top 3 in defined benchmark

允许说：

> “在 <明确 benchmark scope> 中，OpenDesk 位于前三。”

要求：

- 市场/竞争集合事先冻结；
- 至少覆盖最强直接竞品；
- 不能在看到结果后通过删竞品/删任务制造前三；
- 必须公开范围，不简写为“全球前三 RPA”。

### G3｜Top 1 in defined niche

允许说：

> “在 <明确、具有独立商业意义的 niche> benchmark 中排名第一。”

除 G2 外，还要求：

- niche 不是事后人为拼接关键词；
- 至少存在真实目标用户和替代方案；
- 至少一项付费/交付证据证明该 niche 有实际价值；
- 至少一个外部环境或独立复现。

## 15. 第一轮建议执行顺序

### Phase 1｜Reproducible public baseline

```text
Calculator
Text editor
File task
Spreadsheet
Electron app
```

优先对：

```text
OpenDesk
Cua
Peekaboo (macOS)
ADH (Windows)
OpenAdapt
Codex
```

跑 First-run + Replay。

### Phase 2｜Mutation

在公开 fixture 上跑 Repair。

### Phase 3｜Delivery

选择 OpenDesk + 2—3 个最接近的 independent-developer alternatives 做 clean-machine delivery。

### Phase 4｜Business

进入一个真实授权行业任务，验证是否和公开 benchmark 的排序一致。

## 16. 输出文件建议

后续实际运行不要把结果继续写进本文。

建议：

```text
tests/competitive-benchmark/
  manifest.json
  tasks/
  oracles/
  runners/

.runtime/competitive-benchmark/<run-id>/
  raw/
  summaries/
  evidence/

docs/quality/competitive-benchmark/<date>-report.md
```

只有稳定、值得长期保存的报告才进入 `docs/quality/`；原始大体积运行输出留在 `.runtime/` 或 CI artifact。

## 17. 研究输入

竞品能力矩阵：

[`Agent-driven RPA 全球竞品能力矩阵`](../research/commercialization/agent-driven-rpa-competitor-matrix-2026.md)

产品定位计划：

[`Agent-driven RPA 定位与领先证明计划`](../plans/commercialization/agent-driven-rpa-positioning.md)
