# OpenDesk 全球竞争力与商业可行性基线（2026-09）

更新时间：2026-09-15

> 本文是 2026-09-15 的战略研究快照，用于后续产品投资、技术优先级、商业验证和竞争力复评。
> 它不是产品能力承诺，也不是永久排名。竞品状态、价格、市场数据和 OpenDesk 自身实现都可能变化，后续复评必须重新核验。

## 一、战略结论

OpenDesk 当前已经具备真实的桌面自动化与本地 Runtime 工程基础，但没有足够证据支持“当前中国 Top 10”“当前全球 Top 10”或“当前世界级产品”等结论。

当前最值得继续投入的方向不是继续扩充一个功能越来越多的通用自动化框架，而是：

> **把高频、跨应用的真实桌面工作，转化为可验证、可复用、可维修、可长期运行的自动化资产。**

当前最重要的五个技术/产品基础：

1. 统一的本地 JavaScript Runtime、Execution、HTTP、Scheduler、App Mode 执行底座。
2. 对窗口 identity、目标歧义、动作状态、资源清理等可靠性问题已有较认真处理。
3. macOS Accessibility 与 Windows UIA 均存在真实实现，不只是浏览器自动化。
4. Measurement、Evidence、RepairRequest、RepairCandidate 等已经开始把失败诊断与维修结构化。
5. Custom UI、App Mode、`.odpkg`、License/Activation 等使自动化具备进一步包装为可交付小产品的基础。

当前最危险的五个弱点：

1. 缺少可核验的长期客户、留存、付费和续费证据。
2. 缺少真实环境、长周期、跨应用的端到端业务可靠性数据。
3. Demonstration / Agent → Recipe 的完整产品闭环仍未全部成为稳定可运行能力。
4. 安装、发布、升级、版本兼容、支持等交付和信任能力弱于成熟产品。
5. 技术战线过宽，容易继续“加能力”而没有先证明一个可重复赚钱的核心场景。

## 二、本文如何理解“竞争力”

本文严格区分：

```text
Feature
→ 单个功能，例如 OCR、快捷键、Measurement 按钮

Capability
→ 可复用技术能力，例如 Locator、Recorder、Execution

Product Advantage
→ 用户完成真实任务更快、更稳、更便宜

Moat
→ 随使用规模扩大而增强、竞争者越来越难追上的优势
```

因此：

```text
功能很多 ≠ 产品领先
代码复杂 ≠ 商业竞争力强
架构合理 ≠ 已经可靠
有 Windows/macOS 代码 ≠ 两个平台已同等级成熟
有 Repair 数据结构 ≠ 已证明自动维修成功率
```

## 三、当前 Capability Map 的战略解释

### 3.1 Desktop Automation

当前仓库已经存在：

- macOS Accessibility；
- Windows UIA；
- Window / Screen / Mouse / Keyboard；
- OCR / Image / Geometry；
- `UI.tapText()` / `UI.tapTexts()` / `UI.tapTargets()`；
- `UI.within(win)` 与 lightweight Locator；
- Recorder；
- Desktop Measurement；
- DesktopVision / 模型辅助视觉路径；
- Clipboard；
- 错误分类、Evidence 与 Repair 结构。

需要特别区分的边界：

- Windows UIA 是真实实现，但当前正式能力仍有 Experimental 和坐标/取消等限制；
- 多感知能力已经存在，但还没有充分证明已经收口为统一、稳定、跨应用的 Perception Resolver；
- Measurement / Repair 已有真实代码和测试，但当前测试主要证明状态合同和资格化流程，不等于真实应用自动维修成功率；
- DesktopVision 路径可以调用模型，因此“生成后永远不依赖模型”不是当前所有 Recipe 的统一事实。

相关正式入口：

- [`docs/api/desktop-ui.md`](../../api/desktop-ui.md)
- [`docs/api/accessibility.md`](../../api/accessibility.md)
- [`docs/api/vision.md`](../../api/vision.md)
- [`docs/api/recorder-runtime.md`](../../api/recorder-runtime.md)
- `pkg/measurement/**`
- `pkg/desktopvision/**`

### 3.2 Automation Runtime

当前值得肯定的架构点是：Scheduler、HTTP、普通 CLI、受保护包等尽量复用标准 Execution，而不是为每个入口再建立一套脚本引擎。

已有基础包括：

```text
JavaScript Runtime
+ Execution
+ Artifact / Events / Summary
+ HTTP execution
+ Cancel
+ Scheduler
+ App Mode
+ Local Webhook
+ Custom UI / Notify
+ LLM / Agent
+ .odpkg / License / Activation
```

主要限制：

- Runtime 不是 Node.js，不承诺完整 npm、Node built-in 和 native addon 生态；
- 当前不等于成熟的分布式桌面 Worker / Orchestrator；
- Execution 隔离也不自动解决多个前台鼠标任务在同一桌面会话并行的问题；
- Enterprise sandbox、remote worker、完整治理等不应从现有 Runtime 能力直接外推。

相关入口：

- [`docs/api/runtime.md`](../../api/runtime.md)
- [`docs/api/execution.md`](../../api/execution.md)
- [`docs/api/http-server.md`](../../api/http-server.md)
- [`docs/api/scheduler.md`](../../api/scheduler.md)
- [`docs/api/webhook.md`](../../api/webhook.md)
- [`docs/api/protected-packages.md`](../../api/protected-packages.md)

### 3.3 Automation Authoring

OpenDesk 当前最值得探索的长期结构是：

```text
Human / Agent 完成真实任务一次
→ 保存真实证据
→ 去噪与提炼
→ 参数化业务输入
→ 生成普通 Recipe
→ 独立验证
→ 长期重复执行
→ 失败时补证与维修
```

但必须区分“设计基线”和“已交付能力”。当前 Agent-to-Recipe 文档本身明确记录了部分目标职责仍未成为正式 Skill / Runtime 能力，因此不能把完整 S1—S12 设计全部计入当前产品得分。

相关入口：

- [`workflows/agent-to-recipe/design/README.md`](../../../workflows/agent-to-recipe/design/README.md)
- [`workflows/human-to-recipe/`](../../../workflows/human-to-recipe/)

### 3.4 Browser / Protocol / External Integration

当前已有 HTTP、Webhook、MCP、Command 等集成基础，但不能把以下规划直接计入当前竞争优势：

- 完整 Browser Playwright 语义；
- 完整 Protocol Capture → Analysis → Parameterization → Recipe 闭环；
- 其他仓库中的手机自动化能力；
- 尚未完成真实客户验证的第三方 Connector 生态。

## 四、五个核心战略假设

### A. Desktop-first

结论：**部分成立。**

长期价值不来自“桌面一定比浏览器重要”，而来自 OpenDesk 能覆盖业务最后一段：没有合适 API、不能只靠浏览器 DOM、仍然需要真实桌面软件的任务。

正确执行优先级应该是：

```text
可靠正式 API
→ 成熟 Browser DOM 驱动
→ AX / UIA
→ OCR / Image / Geometry
→ 有预算的模型辅助 / 人工处理
```

Desktop 是重要覆盖层，不应该成为技术宗教。

### B. AI 负责理解/探索，确定性 Recipe 负责重复执行

结论：**结构性价值成立，但不是独家创新。**

它在高频、相对稳定任务中有成本、审计、延迟和可重复性价值，但 UiPath、OpenAdapt、Skyvern 等方向都在组合 AI authoring 与确定性执行。

OpenDesk 必须证明：

```text
首次交付更快
+
长期维修更少
+
跨应用更容易组合
+
单位正确业务结果成本更低
```

而不是只证明“脚本能够不调用 LLM”。

### C. Demonstration → Automation

结论：**值得成为核心产品方向，但不能承诺“做一次永久学会”。**

真正可复用资产至少需要：

```text
动作事实
+ 目标身份
+ 输入/数据来源
+ 业务后置条件
+ 适用环境
+ 失败停止条件
+ 版本
+ Repair history
```

品牌表达可以是“重复的事情，人不做第二次”，产品合同则应强调可验证、可维护和适用边界。

### D. 多感知源协同

结论：**有明显价值，但“来源更多”不等于“更可靠”。**

未来真正需要的是统一 Observation / Resolver 合同：

```text
AX / UIA
+ OCR
+ Image
+ Geometry
+ Application Profile
+ VLM fallback
→ candidate evidence
→ conflict / ambiguity handling
→ safe action
```

重点是来源职责、冲突处理、完整性和动作安全，不是把 fallback 参数全部暴露给调用者。

### E. Local-first / Low Cloud Cost

结论：**有经济优势，但不是独占，也不是零成本。**

Local execution 可以降低云计算、模型调用和网络依赖，并改善部分隐私边界；但客户设备、前台会话、系统升级、远程维护和专用机器也属于 TCO。

## 五、技术竞争力评分基线：为什么是约 51 / 100

这里的 51 分表示：

> **截至 2026-09-15，放到全球桌面自动化市场中，已经被代码、公开合同和当前测试证据支持的“可竞争技术产品能力”约为 51/100。**

它不等于代码质量 51 分，也不等于架构设计 51 分，更不等于未来潜力 51 分。

本次技术评分采用六项、总权重 35：

| 技术维度 | 权重 | 当前分（0—10） | 加权贡献 |
| --- | ---: | ---: | ---: |
| Desktop Coverage | 8 | 6.0 | 4.8 |
| Automation Reliability | 8 | 3.0 | 2.4 |
| Perception | 5 | 5.0 | 2.5 |
| Runtime Efficiency | 5 | 8.0 | 4.0 |
| Cross-platform | 4 | 5.0 | 2.0 |
| Extensibility | 5 | 4.0 | 2.0 |
| **总计** | **35** |  | **17.7 / 35** |

归一化：

```text
17.7 / 35 × 100 ≈ 50.6
≈ 51 / 100
```

### 5.1 Desktop Coverage：6 / 10

好的地方：

- 已经不是简单坐标宏；
- macOS AX + Windows UIA 都有真实实现；
- OCR、Image、Geometry、Window、Recorder、Measurement、Locator 等覆盖较广。

主要缺口：

- 大量真实应用资格矩阵；
- Win32 / WPF / WinForms / Electron / Qt / Java / Office / IM / ERP 等覆盖证据；
- 多显示器、高 DPI、缩放、窗口漂移、远程桌面等环境矩阵；
- 明确区分“完全支持 / 部分支持 / 需要 Vision / 不支持”。

从 6 到 8 的关键不是再加 API，而是建立 Application Qualification Matrix。

### 5.2 Automation Reliability：3 / 10

这是当前最大的技术扣分项。

OpenDesk 已经有较好的可靠性设计元素：

- window identity refresh；
- `STALE_TARGET`；
- `AMBIGUOUS_TARGET`；
- `SEARCH_INCOMPLETE`；
- action state；
- Accessibility ref cleanup；
- postcondition / verification 的设计意识。

但目前严重缺少：

```text
真实应用
× 大量运行
× 长周期
× 多机器
× 不同版本
× 业务结果验证
```

世界级产品需要能够回答类似：

```text
Calculator 1000 次：业务正确多少次？
某真实 IM 发送 500 次：正确多少次？
ERP 录入 1000 次：错误、重复、漏录多少？
软件升级后 20 个 Recipe：多少无需修改、多少自动修复、多少人工维修？
```

当前 Measurement Repair 测试证明的是维修状态合同和 qualification 机制，并不能直接证明真实应用自动维修成功率。

从 3 到 7，核心工作是建立 Live Reliability Benchmark 和业务后置条件验证，而不是继续增加 Error Code。

### 5.3 Perception：5 / 10

好的地方：

```text
Accessibility / UIA
+ OCR
+ Image
+ Geometry
+ Measurement
+ DesktopVision / model-assisted vision
```

主要缺口：

- 多来源尚未完全收口为统一公共 Resolver；
- 传统 Vision API 与独立 DesktopVision 路线仍存在职责边界；
- 缺少真实 target benchmark；
- 缺少 AX-only / OCR-only / Image-only / Unified / VLM fallback 的对照成功率；
- 缺少 Application Profile / history 对定位效果提升的实测数据。

从 5 到 8 的标志应是：调用方只描述目标，Runtime 自动组合来源，并能够说明为什么选择这个候选、排除了什么候选、动作是否安全。

### 5.4 Runtime Efficiency：8 / 10

这是当前相对强的技术项。

优点：

- Runtime / Execution 边界清楚；
- Scheduler 复用标准 Execution；
- HTTP、CLI、App Mode、`.odpkg` 等没有各建一套 Runtime；
- Artifact、Event、Summary、Cancel 已形成基础执行模型；
- Local-first 的重复 Recipe 有潜在成本优势。

主要缺口：

- 成熟 sandbox / resource isolation；
- Remote Worker；
- 多桌面会话调度；
- 大规模并发 Worker；
- 生产级 distributed orchestration；
- 更完整的 Runtime 版本兼容策略；
- Node / Python 生态桥接仍可加强。

### 5.5 Cross-platform：5 / 10

当前应理解为：

```text
macOS：当前重点平台
Windows：存在真实实现，但尚未证明与 macOS 同等级成熟
```

主要缺口：

- 同一 Recipe 跨平台一致性；
- Locator semantic parity；
- Error contract parity；
- Window / Clipboard / Recorder / Measurement / Custom UI parity；
- 两个平台的 Live E2E qualification dashboard。

### 5.6 Extensibility：4 / 10

好的地方：

- HTTP；
- Webhook；
- MCP；
- Command；
- Native Extension；
- LLM / Agent；
- App Mode / Scheduler。

为什么仍然只有 4：

```text
“能扩展” ≠ “外部开发者已经在扩展”
```

目前主要缺：

- 稳定 Extension SDK；
- 长期 API compatibility policy；
- Node / Python client；
- 第三方 driver / adapter；
- 第三方 Recipe / Integration；
- Connector ecosystem；
- Partner ecosystem；
- Marketplace supply。

## 六、51 分真正缺的是什么

可以压缩为五项：

### 1. 真实可靠性证据

从：

```text
我们设计了可靠性机制
```

变成：

```text
我们能用真实运行数据证明它长期可靠
```

### 2. Application Compatibility Knowledge

未来值得持续积累：

```text
Application Profile
+ app version
+ OS version
+ semantic structure
+ locator evidence
+ failure history
+ repair history
```

长期看，这一层可能比单个 Runtime primitive 更具护城河价值。

### 3. 统一 Perception / Locator

从很多独立能力：

```text
AX / UIA / OCR / Image / Vision / Measurement
```

收口成一个高质量 target resolution system。

### 4. 真实 Repair 闭环

目标链路：

```text
真实执行失败
→ failure classification
→ 最小补证
→ repair candidate
→ 重跑失败步骤
→ 独立验证业务结果
→ qualification
→ explicit promotion
```

真正的竞争数据应该是：自动恢复率、人工辅助恢复率、平均维修时间、误修率和回归率。

### 5. 公开稳定的 Developer Platform

如果目标是“Desktop Automation 世界里的 Playwright”，需要的不只是 Locator API，而是：

```text
stable API
+ semantic locator
+ auto-wait / actionability
+ trace
+ debugger / inspector
+ test integration
+ CI
+ language clients
+ version compatibility
+ extension ecosystem
```

## 七、其他更成熟方案主要强在哪里

### 7.1 UiPath

UiPath 更强的核心不是单一 OCR 或 Locator，而是完整生产运行责任：

```text
Reliability
+ Orchestration
+ Governance
+ Package / Version
+ Logging
+ Queue
+ Credential
+ Deployment
+ Enterprise support
+ 长期应用兼容经验
```

OpenDesk 与 UiPath 当前最大的差距主要发生在“持续生产运行和组织交付”层，而不是“能否点击按钮”。

### 7.2 Microsoft Power Automate

强项是已有平台分发和生态组合：

```text
Windows
+ Microsoft 365
+ Azure / Entra
+ Power Platform
+ Dataverse
+ Connectors
+ 企业身份与采购渠道
```

很多任务不需要落到桌面点击，因此 OpenDesk 应优先组合成熟 API / Browser 能力，而不是用 Desktop automation 替代所有集成。

### 7.3 Playwright

Playwright 对 OpenDesk 最大的技术启发是：

> 把不稳定 UI 转化为相对稳定、可等待、可诊断、可测试的编程对象。

真正值得学习的组合：

```text
Locator
+ Auto-wait
+ Actionability
+ Retry
+ Trace
+ Screenshot / Video
+ Test runner
+ Isolation
+ Fixture
+ Debug / Inspector
+ CI ecosystem
```

OpenDesk 的 `UI.within()` / Locator 已经沿着相似工程理念前进，但距离完整 Developer Platform 仍有明显差距。

### 7.4 AI Computer Use / Agent

最强项是 Generalization：面对从未见过的软件和任务，可以直接观察、理解和尝试。

合理组合不应是 Recipe 与 Agent 二选一：

```text
未知任务 / 新环境
→ Agent 探索

已知、重复、高频任务
→ Recipe

Recipe 失败
→ Repair / Agent / Human
```

### 7.5 OpenAdapt 等相邻方案

这类方案值得持续跟踪，因为它们也在探索：

```text
Demonstration
→ Program
→ Model-free healthy execution
→ Verification
→ Repair when needed
```

因此“AI authoring + deterministic runtime”不能作为 OpenDesk 独占卖点，真正竞争点必须转向可靠性、维护成本、应用知识、交付体验和分发。

## 八、技术竞争力跃迁路径

### 8.1 12 个月较好状态：约 70—72

如果达到：

| 技术维度 | 当前 | 12 个月较好状态 |
| --- | ---: | ---: |
| Desktop Coverage | 6.0 | 7.5 |
| Reliability | 3.0 | 7.0 |
| Perception | 5.0 | 7.0 |
| Runtime Efficiency | 8.0 | 8.5 |
| Cross-platform | 5.0 | 7.0 |
| Extensibility | 4.0 | 6.0 |

则：

```text
(8×7.5 + 8×7 + 5×7 + 5×8.5 + 4×7 + 5×6) / (35×10)
≈ 71.9%
```

这说明未来 12 个月不需要重写所有模块。最大提升来自：

1. Reliability；
2. 统一 Locator / Perception；
3. 平台资格矩阵；
4. 真实 Repair；
5. 外部开发者可依赖的稳定接口。

### 8.2 80+ / 世界级技术候选

80 分以上不是再增加 20 个 API，而是出现：

```text
大量真实应用
+ 大量真实运行
+ 失败样本与分类
+ 自动 / 半自动 Repair
+ 稳定第三方 API
+ 第三方开发者
+ 跨平台质量体系
```

示意状态：

```text
Desktop Coverage       9.0
Reliability            9.0
Perception             8.5
Runtime Efficiency     9.0
Cross-platform         8.5
Extensibility          8.0
```

按当前模型约为 87/100。到这个阶段才有资格认真讨论“世界级 Desktop Automation Developer Platform”。

## 九、竞争力的四种排名必须分开

不要把所有排名合成一个数字。

### 技术架构排名

当前有进入新型桌面自动化框架候选池的基础，但没有证据认定当前全球 Top 10。

### 产品能力排名

仍属于产品验证期。API 数量不能替代安装、首次成功、错误恢复和长期使用体验。

### 商业综合排名

当前没有足够公开、可核验的付费客户、留存和经常性收入数据，因此不提供虚构全球名次。

### 未来潜力排名

如果聚焦“可维护、可验证的桌面工作流资产”，有进入细分类别全球 Top 10 候选的可能；Top 5 需要大量真实使用、可靠性与第三方采用；Top 3 以后主要变成 Distribution + Ecosystem + Trust 问题。

## 十、Top 10 → Top 5 → Top 3 → Top 1

### Top 10 候选

决定性条件：

- 2—3 个明确成立的高价值场景；
- 可复核长期可靠性数据；
- 可下载、可升级、可诊断的产品；
- 可核验付费和续费；
- 清晰安全、权限和支持边界；
- 第三方能独立交付。

### Top 5 候选

需要从“有特色”变成“默认候选”：

- 首次成功足够简单；
- 长期维护明显便宜；
- 第三方开始主动采用；
- 支持平台达到可信 qualification；
- 复用模板和集成形成生态供给。

### Top 3 候选

重点不再只是代码：

```text
Distribution
+ Ecosystem
+ Trust
+ Brand
+ Support
+ Partner network
+ Enterprise adoption
```

### Top 1 的可信路径

不应该是“功能最多的 RPA”。

更合理的类别目标是：

> **把电脑工作流变成可以审核、复用、测试、分发、监控和维修的业务资产。**

形成：

```text
更多真实工作流
→ 更多应用与失败知识
→ 更快交付 / 更少维修
→ 更多开发者与服务商
→ 更多付费工作流
→ 更强 Compatibility / Repair knowledge
```

当前这仍是长期类别假设，不代表已经形成护城河。

## 十一、护城河地图

| 护城河 | 当前状态 | 应怎样形成 |
| --- | --- | --- |
| 技术 | 有原语与合同基础 | Compatibility、可靠性、Trace、Repair 工具链 |
| 数据 | 有 Evidence / Profile 基础 | 经授权的失败分类、维修效果、应用版本知识 |
| 工作流 | 有设计与样例 | 真实客户长期运行的 Recipe / Procedure |
| 生态 | 早期 | 第三方开发者、服务商、模板、Adapter |
| 品牌 | 弱 | 可复现 benchmark、透明失败边界、真实案例 |
| 分发 | 尚未证明 | Agent/开发工具/服务商/垂直案例渠道 |
| 成本 | 有 Local-first 潜力 | 同时降低模型、部署、支持与维修成本 |

隐私边界：原始业务数据、截图、Secret 默认本地；共享数据飞轮必须建立在明确授权、去标识、可删除和客户数据 ownership 基础上。

## 十二、后续复评指标

技术竞争力不应靠半年后重新主观打一次分，而要逐渐由数据驱动。

至少持续记录：

### Reliability

- End-to-end business success rate；
- unsafe / duplicate action rate；
- timeout / cancel correctness；
- 7 / 30 天连续运行结果；
- 不同机器、分辨率、OS、App version 的结果。

### Perception

- target benchmark 数量；
- AX/UIA only；
- OCR only；
- Image only；
- Unified resolver；
- VLM fallback；
- ambiguity / false-positive rate。

### Repair

- failure classification accuracy；
- auto repair rate；
- assisted repair rate；
- median time-to-repair；
- repair regression rate；
- qualification → promotion 比例。

### Cross-platform

- macOS / Windows parity matrix；
- 同 Recipe / 同 semantic target 的行为一致性；
- live E2E coverage。

### Developer Platform

- 外部集成数量；
- 第三方 Recipe / Adapter 数；
- API breaking changes；
- first automation time；
- debug / trace time。

## 十三、最重要的技术决策

后续开发优先级应从：

```text
发现一个新能力
→ 加一个 API
→ 再发现一个能力
→ 再加一个 API
```

转成：

```text
真实应用
→ 真实任务
→ 大量运行
→ 统计失败
→ 分类根因
→ 修 Framework / Locator / Perception
→ Repair
→ 再运行
→ 得到可靠性数据
```

因此，本研究最重要的结论不是“OpenDesk 技术竞争力目前 51 分”，而是：

> **OpenDesk 当前最大的技术问题已经不是缺少桌面自动化原语，而是没有把已有原语转化成经过大规模真实任务证明的“可靠执行 → 验证 → 诊断 → 维修”闭环。**

## 十四、与其他战略文档的关系

- 长期平台愿景：[`opendesk-global-executable-experience-network.md`](opendesk-global-executable-experience-network.md)
- 商业系统设计：[`opendesk-business-system-design.md`](opendesk-business-system-design.md)
- 商业验证推进：[`../../plans/commercialization/business-validation-roadmap.md`](../../plans/commercialization/business-validation-roadmap.md)
- 本研究对应的 12 个月执行收口：[`../../plans/commercialization/opendesk-12-month-strategy.md`](../../plans/commercialization/opendesk-12-month-strategy.md)

## 十五、外部竞争研究的使用规则

后续维护本文时：

- 优先官方文档、官方产品页、官方价格、财报、公司公告、GitHub；
- Reddit / Hacker News / Issue 只用于用户体验和定性反证，不能代替市场统计；
- 不把 Preview / Beta 自动当成熟能力；
- 不把 GitHub stars 当商业产品排名；
- 不把某个 benchmark 当长期企业业务成功率；
- 重要收入、客户、留存和价格数据必须保存来源和核验日期；
- 搜不到的数据写“无法验证”，不补数字。

当前持续跟踪对象至少包括：

```text
Enterprise RPA:
UiPath / Microsoft Power Automate / Automation Anywhere / SS&C Blue Prism

China:
影刀 / 来也-UiBot / 艺赛旗 / 实在智能 / Quicker / 按键精灵

Developer / Personal:
Playwright / Robot Framework / AutoHotkey / Keyboard Maestro / SikuliX / Appium / pywinauto

AI Computer Use / Agent:
OpenAI Computer Use / Anthropic Computer Use / Browser Use / Cua / Simular / Skyvern / OpenAdapt
```
