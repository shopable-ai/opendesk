# 个人自动化与 Creator 生态竞品研究

更新时间：2026-09-03

> 文档性质：Research / 商业化与产品形态决策输入。本文补充 OpenDesk 过去商业研究中相对薄弱的“中国个人自动化、快捷动作、脚本作者、插件市场、Creator RPA”谱系。它不是 OpenDesk 当前能力声明，也不代表这些产品能力都应进入 Roadmap。

## 1. 为什么需要单独研究这一层

现有研究已经覆盖底层 Runtime / Library、传统 RPA、Computer Use、Recorder、Agent OS、Enterprise Agentic Automation 与垂直业务自动化，但中间仍有一个重要缺口：

```text
底层自动化能力
→ 普通用户 / 开发者创建一个小自动化
→ 用按钮、快捷键、面板、脚本、插件或 Recorder 触发
→ 分享、安装、打包或出售
→ 再向团队、企业和业务 Outcome 升级
```

这层不能简单归为“传统宏录制器”，因为它同时包含：

- 用户自己制作的小工具；
- 上下文动作面板与快捷入口；
- 脚本 / 插件 / Automation App 的分发；
- Creator Economy 与 Marketplace；
- 从个人工具向 RPA、企业调度、Agent Tool 演进的产品路径。

对 OpenDesk 而言，这一层尤其重要，因为 Runtime、Custom UI、Recorder、Scheduler、HTTP / MCP、脚本运行与未来 Automation Package 可以在这里组合成真正可被用户感知和付费的产品，而不只是底层 API。

## 2. 核心结论

1. **按键精灵必须纳入一级研究对象。** 它不是只有鼠标键盘回放，而是长期形成了“免费开发工具 → 脚本 → 成品打包 → 注册授权 → 作者销售”的 Creator 商业闭环；2026 年官方内容又继续强调 AI 视觉、WebUI、网络 / 系统能力和成品商业化。
2. **Quicker 是近期 Custom UI / 电商快捷工具设想最直接的产品参照之一。** 它把“场景 → 面板 → 动作 → 多种触发方式”做成了成熟产品，并把动作本体与显示位置、快捷键和触发规则分离。
3. **uTools 是另一条非常关键的产品路线。** 它从插件工具箱继续演进为“人与 AI Agent 共用的工具平台”，插件既可有 UI，也可暴露标准化 tools 给 Agent，并已经覆盖用户付费、屏幕、模拟按键、可编程浏览器、MCP 和 AI 等开发能力。
4. **影刀代表国内 Creator RPA / Automation App 的高相关商业样本。** Recorder、元素与图像资产、自动化任务、应用市场、团队 / 企业能力以及真实电商案例已经形成完整商品结构。
5. **阿里云 RPA / 原码栈代表企业级上限。** Editor + Robot + Console、低代码 + 全代码、UIA / CV、人工 / 定时 / OpenAPI / MCP 触发、授权和调度已经被包装为“生产可用的 Computer Use Agent”基础设施。
6. 因此 OpenDesk 的竞争研究不能只问“谁的 Desktop Automation Engine 更强”，还必须问：**谁把底层能力包装成了普通人可以创建、触发、分享、安装、购买和被 Agent 调用的小工具。**

## 3. 应补齐的五条产品谱系

```text
A. Macro / Script
按键精灵 / AutoHotkey / AutoIt / 自动精灵 / KeymouseGo

B. Context Action Panel / Personal Automation
Quicker / Keyboard Maestro / Hammerspoon / PhraseExpress / Espanso

C. Plugin / Launcher / Tool Marketplace
uTools / Raycast / Alfred

D. Creator RPA / Automation App
影刀 / UiBot / Power Automate Desktop / UiPath Studio

E. Enterprise RPA / Agentic Automation
阿里云 RPA / 来也 / 弘玑 / UiPath / Automation Anywhere
```

这五条谱系不是互斥分类。一个成熟产品可能横跨多个层级；这里的目的只是避免继续用“RPA / 非 RPA”二分法观察市场。

## 4. 当前优先级矩阵

| 优先级 | 产品 / 谱系 | 主要代表层 | 与 OpenDesk 的关系 | 商业研究价值 | 当前判断 |
|---|---|---|---|---|---|
| P0 | 按键精灵 | Macro / Script / Creator Economy | C1 | B3 | 研究免费 Creator、脚本成品化、授权和作者销售闭环 |
| P0 | Quicker | Context Action Panel | C1 | B3 | 与 Custom UI、按钮动作、上下文切换、快捷键触发高度相邻 |
| P0 | uTools | Plugin / Tool Platform / Agent Tool | C1-C2 | B3 | 研究插件 UI、API、付费、Marketplace、MCP / Agent Tool |
| P0 | 影刀 RPA | Creator RPA / Automation App | C1 | B3 | 研究 Recorder、应用市场、第三方应用运行、企业升级和电商场景 |
| P0 | 阿里云 RPA / 原码栈 | Enterprise RPA / Computer Use Agent | C1 | B3 | 研究 Editor / Robot / Console、调度、MCP、License 和企业部署 |
| P1 | UiBot / 来也 | Creator + Enterprise RPA | C1-C2 | B3 | 国内 RPA 重要对照，后续单独核验当前产品形态 |
| P1 | 弘玑 Cyclone | Hyperautomation / Agentic Automation | C2 | B3 | 企业自动化与 Agentic Automation 跟踪对象 |
| P1 | 自动精灵 | Macro / Visual Automation | C1 | B2 | 与按键精灵相邻的个人脚本 / 自动化产品样本 |
| P1 | KeymouseGo | Open-source Macro | C1 | B1 | 研究极简录制回放工具的边界与开源分发 |
| P1 | Hamibot / Auto.js | Mobile Automation | C2 | B2 | 研究 Android 自动化、脚本分发和移动端 Creator 生态 |
| P2 | AutoIt / Hammerspoon | Scriptable Desktop Automation | C1 | B1 | 研究脚本语言 / 系统 API 路线 |
| P2 | SikuliX / 视觉自动化工具 | Vision-first GUI Automation | C1 | B1 | 研究图像驱动自动化和语义能力边界 |
| P2 | Raycast / Alfred | Launcher / Extension / Workflow | C2 | B3 | 研究命令入口、扩展生态和工作流 Packaging |
| P2 | PhraseExpress / Espanso | Text / Snippet Automation | C2 | B2 | 研究高频文本、模板和轻量客服效率场景 |

> P1 / P2 中部分对象在本文只作为候选跟踪池；具体当前功能、价格和商业事实进入正式结论前需要再次以官方材料核验。

## 5. P0 产品专项观察

### 5.1 按键精灵：从“宏”到脚本作者商业闭环

#### 已验证事实

按键精灵当前官网仍将产品定义为 AI 自动化脚本工具，覆盖 PC、Android 与 iOS 等环境，并强调不需要编程知识也可制作自动化脚本。

其官方介绍页明确强调：

- 免费、图形化的脚本开发工具；
- 脚本作者可以使用“小精灵软件注册系统”进行脚本销售；
- 官方存在围绕脚本商业化的作者体系。

“商业小精灵”官方论坛说明的典型流程为：

```text
注册商业作者
→ 使用商业版按键精灵制作脚本
→ 发布为商业小精灵
→ 购买注册码
→ 作者自行定价销售
```

2026-08 的官方移动端内容进一步把能力链描述为：基础点击 / 滑动 / 按键 → AI 视觉 / OCR / YOLO / OpenCV → HTTP / 文件 / 系统调用 → WebUI 悬浮窗 → APK 打包 / 热更新 / 激活码，从而形成个人自用、团队分发和付费变现的闭环。

#### 对 OpenDesk 的价值

按键精灵最值得借鉴的不是旧式坐标脚本，而是：

```text
免费 Creator
→ 低门槛创建
→ 脚本资产
→ 可运行成品
→ 授权控制
→ 作者自己销售
```

它证明自动化产品的商业价值可以出现在“Runtime 之上、完整企业 RPA 之下”的 Creator 层。

#### 不应直接复制的部分

- 游戏辅助、绕过风控或平台规则的用途不能成为 OpenDesk 商业方向；
- 坐标 / 图色驱动只能作为定位方法之一，不能倒退成 OpenDesk 的主抽象；
- OpenDesk 应继续坚持 Verification、Evidence、权限和高风险动作约束。

参考：

- https://www.anjian.com/
- https://www.anjian.com/intro
- https://bbs.anjian.com/showforum-66-1.aspx
- https://m.anjian.com/News

### 5.2 Quicker：最接近“上下文按钮 + 自定义动作”的个人自动化产品

#### 已验证事实

Quicker 官方将快捷面板作为主要动作入口之一：

- 面板可以显示可视化动作按钮；
- 上下文区域可以随当前软件加载不同动作；
- 支持鼠标、Ctrl、快捷键等多种触发方式；
- 组合动作按顺序执行多个步骤；
- 动作可以创建、编辑、移动、复制和分享。

Quicker V2 更值得关注的是其模型变化：

```text
Action 本体
≠
Action 在哪里显示
≠
Action 什么时候触发
```

官方 V2 文档把动作本体与面板位置、场景和触发入口分开管理，同一个动作可以在多个场景或触发方式中复用；动作快捷键也可以按程序、窗口标题、窗口类、浏览器和网址等场景设置规则。

#### 对 OpenDesk 的价值

近期候选的电商 Custom UI 小工具，例如：

```text
垂直多个按钮
→ 常用文本 / 数据 / 操作
→ 每个按钮执行自定义逻辑
→ 根据当前软件 / 窗口改变动作
→ 鼠标或快捷键触发
→ 可复用 / 可分享
```

在产品层面与 Quicker 高度相邻。

因此 OpenDesk 不应该把“FloatingWindow.addButton() 能画出按钮”当成差异化。更值得研究的是：

- Action 是否是一等资产；
- UI 位置是否与 Action 本体解耦；
- Trigger 是否独立；
- Context / App / Window 是否决定可见动作；
- Action 能否分享、安装、版本化和被 Agent 调用。

参考：

- https://getquicker.net/
- https://docs.getquicker.net/v2/what%27s-new/new-main-win/usage/
- https://docs.getquicker.net/v2/what%27s-new/actions/
- https://docs.getquicker.net/v2/what%27s-new/others/action-hotkeys/
- https://www.getquicker.net/KC/Help/Doc/xaction-intro

### 5.3 uTools：Plugin + Marketplace + Paid Extension + Agent Tool

#### 已验证事实

uTools 开发者文档当前覆盖：

- 插件应用开发与发布到应用市场；
- 窗口、复制、输入、系统、屏幕；
- 动态指令、模拟按键；
- 用户付费；
- 可编程浏览器；
- MCP 工具；
- AI / Function Calling。

2026-03 的官方更新日志明确把 uTools 定位升级为：

> 人与 AI Agent 共用的工具平台。

同时支持插件通过 `tools` 和 `utools.registerTool(...)` 将能力以标准化工具形式暴露给 AI Agent；还支持没有 UI、只向 Agent 提供 tools 的插件应用模式。

#### 对 OpenDesk 的价值

uTools 对 OpenDesk 最大的启示不是“做一个启动器”，而是这条商品链：

```text
系统能力 / Runtime
→ Developer API
→ Plugin / Custom UI
→ Marketplace
→ 用户付费
→ MCP / Agent Tool
```

这与 OpenDesk 的底层自动化能力、JS Runtime、Custom UI、HTTP / MCP、未来 Creator / Package 形成明显邻接。

如果未来 OpenDesk 选择做 Creator / Marketplace，uTools 应被视为 P0 产品参照，而不是普通生产力工具。

参考：

- https://www.u-tools.cn/docs/developer/docs.html
- https://www.u-tools.cn/docs/developer/information/plugin-json.html
- https://www.u-tools.cn/docs/guide/changelog.html
- https://www.u-tools.cn/plugins/topic/115/

### 5.4 影刀 RPA：Creator RPA、Automation App 与电商业务闭环

#### 已验证事实

影刀官网当前产品页覆盖：

- 网页 / 桌面等自动化；
- 流程录制；
- 元素库与图像库；
- 捕获元素；
- 应用市场；
- 自动化任务、计划、监控和调度；
- AI 能力。

影刀公开电商案例显示，其产品已经实际用于：

- 千牛批量消息 / 留言；
- 退款、换货、订单处理；
- 客服系统操作；
- 多平台与 ERP 跨系统流程；
- 数据采集与日常运营。

2026-08-24 的影刀官方价格说明给出当前公开参考：

- 社区版：免费，面向学习、个人开发及非商业使用；
- 创业版：5,988 元 / 账号 / 年，重点增加第三方开发者应用运行能力；
- 企业采购标准套餐：59,800 元 / 5 账号 / 年，包含企业级管理、计划 / 触发、机器人调度、专属应用市场等能力。

价格会变化，正式商业决策前必须再次核验官网。

#### 对 OpenDesk 的价值

影刀验证了一条比“单卖 Runtime”更清晰的产品路径：

```text
免费 Creator
→ 用户自行开发 Automation App
→ 第三方 Automation App
→ 为运行 / 分发 / 团队能力付费
→ 企业管理 / 调度 / Marketplace
→ 行业解决方案
```

对近期电商方向而言，影刀又提供了非常直接的反证：很多“千牛 / 客服 / 订单 / 售后 / 跨系统”场景已经有成熟 RPA 供给，因此 OpenDesk 必须证明自己的结构性优势，例如更低开发成本、更强 Agent authoring、更强语义恢复、更容易做小型嵌入式工具，或更适合开发者集成，而不能只证明“也能点千牛”。

参考：

- https://www.yingdao.com/product/
- https://www.yingdao.com/case/detail/ECommerce/ak/
- https://www.yingdao.com/case/detail/ECommerce/lppz/
- https://www.yingdao.com/encyclopedia/detail?uuid=987893237067911168

### 5.5 阿里云 RPA / 原码栈：企业级 Computer Use Agent 基准

#### 已验证事实

阿里云 RPA 当前官方已经直接使用“生产可用的 Computer Use Agent”定位。

其 C/S 产品结构为：

```text
Editor
→ 开发、调试、发布自动化流程

Robot
→ 执行已经发布的流程

Console / Server
→ 成员、授权、流程、机器人、调度与运行监控
```

Editor 同时支持：

- Python 全代码开发；
- 低代码可视化开发。

Robot 支持：

- 人工触发；
- 定时；
- OpenAPI；
- MCP。

官方还明确描述客户端自动化策略：客户端软件优先使用 Win32 UIA 等框架能力，其次可使用 CV；浏览器也优先使用自身结构能力，再以图像识别补充。

阿里云 RPA 支持把企业 SOP 自动化流程发布为 MCP Tool，供上层 Agent 调用。

当前公开目录价按授权区分 Robot / Editor 与高级版 / 专业版，例如：

- 高级版 Robot：5,000 元 / 年；
- 高级版 Editor：12,000 元 / 年；
- 专业版 Robot：15,000 元 / 年；
- 专业版 Editor：25,000 元 / 年。

价格会变化，正式商业决策前必须再次核验官方计费页。

#### 对 OpenDesk 的价值

阿里云 RPA 说明以下能力不是彼此独立的“功能列表”，而可以组成一个商业系统：

```text
Creator / Editor
→ Automation Source
→ Runtime / Robot
→ Manual / Schedule / API / MCP Trigger
→ Console / Governance / Monitoring
→ Enterprise License
→ Agent Tool
```

OpenDesk 不需要照抄整个企业控制面，但必须理解：一旦目标从本地 Demo 上升到无人值守和企业收费，调度、权限、版本、运行状态、Evidence、审计和分发就会成为商品的一部分。

参考：

- https://help.aliyun.com/zh/rpa/
- https://help.aliyun.com/zh/rpa/product-overview/what-is-rpa
- https://help.aliyun.com/zh/rpa/getting-started/overview
- https://help.aliyun.com/zh/rpa/user-guide/rpa-mcp-server
- https://help.aliyun.com/zh/rpa/product-overview/billing

## 6. 对 OpenDesk 产品形态的重新分层

过去只按技术能力看，容易得到：

```text
Mouse / Keyboard / Window / Screenshot
→ Recorder
→ RPA
→ Agent
```

加入个人自动化和 Creator 生态后，更合理的是：

```text
L0 OS / Automation Primitives
Mouse / Keyboard / Window / Screen / Accessibility / Vision

L1 Runtime / Driver
统一调用、权限、平台适配、稳定 contract

L2 Action / Tool
一个可复用的小动作、函数、脚本或业务操作

L3 Trigger / Context / UI
按钮、快捷键、悬浮面板、App Context、Schedule、HTTP、MCP

L4 Creator / Recorder
人工编辑、示范录制、Agent 探索、生成和调试

L5 Package / Distribution
Automation App、Plugin、Script、小工具、模板、版本和授权

L6 Marketplace / Team / Governance
分享、安装、付费、团队、权限、调度、审计

L7 Business Solution / Outcome
客服、订单、售后、报表、运营、财务等结果
```

其中 L2-L6 正是过去商业研究最容易被“底层 Runtime vs 企业 RPA”两端挤掉的中间商品层。

## 7. 近期电商 Custom UI 设想应如何定位

近期候选方向可以描述为：

```text
电商客服 / 运营的小型上下文工具箱

多个动作按钮
+ 常用内容
+ API / HTTP 查询
+ OpenDesk Desktop Automation
+ 当前窗口 / 商品 / 订单上下文
+ 快捷键
+ 可选 Agent
```

它不是新的 RPA Platform，也不应一开始实现完整流程设计器。

第一阶段更适合验证三个问题：

### 7.1 用户是否需要 Action Panel

验证：

- 高频复制 / 粘贴；
- 查询订单 / ERP 数据；
- 一键组合操作；
- 当前软件上下文动作；
- 快捷键调用。

核心参照：Quicker、PhraseExpress、uTools。

### 7.2 Action 是否能连接真实业务

验证：

```text
Button
→ JS Function / Action
→ HTTP / API / Local Data
→ Browser / Desktop Automation
→ Result
```

核心参照：uTools、影刀、按键精灵。

### 7.3 Action 能否成为可复用资产

进一步验证：

- Action ID；
- 参数 schema；
- Trigger；
- Context；
- 版本；
- 权限；
- 分享 / 安装；
- Agent Tool 暴露。

如果这一步成立，Custom UI 才可能从 Demo 进化为 Creator / Automation Package，而不是一次性的按钮页面。

## 8. OpenDesk 不应简单复制这些产品

### 不做 Quicker Clone

OpenDesk 的差异不能只是“也有动作按钮”。Quicker 已经高度成熟地解决个人 Windows 快捷动作问题。

### 不做按键精灵 Clone

OpenDesk 不应回到以坐标、宏回放和商业脚本为核心的产品定义。

### 不做 uTools Clone

OpenDesk 不需要重新做一个通用启动器 / 插件桌面；更合理的是让 OpenDesk Automation 能嵌入或被类似平台调用。

### 不做完整影刀 / UiPath Clone

企业级 RPA 的组织、控制台、流程设计器、机器人授权、实施体系成本极高。除非真实客户证明需要，否则只构建 OpenDesk 结构性优势所必需的部分。

### 不做完整 Agent OS

Model、Memory、Channel、Chat UI 等上层能力默认通过现有 Agent / MCP 生态连接。

## 9. 更值得验证的 OpenDesk 差异化

优先验证：

1. **Developer-first Automation Runtime**：比传统 RPA 更容易由代码、Codex、Agent 调用。
2. **Agent-authored Automation**：不是要求业务人员手工拖完完整流程，而是 Human Demonstration / Agent Exploration → 可读、可修改的 Automation Source。
3. **Context-aware Action**：一个 Action 能根据当前 App / Window / UI 状态获得上下文，而不仅是固定快捷键。
4. **Hybrid Execution**：API / MCP 优先，Browser 次之，Desktop 作为必须的最后一公里，而不是所有任务都靠点击。
5. **Verification / Recovery / Evidence**：执行后确认结果、失败诊断和恢复，而不是 fire-and-forget 宏回放。
6. **Embeddable Custom UI**：小型垂直工具可以直接以本地 UI 暴露动作，不强迫用户进入大型 RPA Studio。
7. **Automation as Tool**：同一 Action 可以被按钮、快捷键、Scheduler、HTTP、MCP、Agent 复用。

其中第 7 点是本轮从 Quicker、uTools、阿里云 RPA 交叉对比后最值得强化的产品原则：

```text
Action / Automation 本体
≠ UI
≠ Trigger
≠ Agent

同一个 Automation
可以由不同入口调用。
```

## 10. 商业模式重新观察

新增这一层之后，OpenDesk 商业研究应至少同时跟踪：

| 商业模式 | 典型对象 | OpenDesk 可借鉴点 |
|---|---|---|
| Free Runtime / Free Creator | AutoHotkey、按键精灵部分模式 | 扩大开发者与脚本供给 |
| Pro Creator | 专业编辑、调试、AI、Recorder | 为生产效率收费 |
| Paid Runtime / Runner | 第三方 App 运行、机器人授权 | 为稳定运行和使用权收费 |
| Script / App / Plugin Sales | 按键精灵、uTools、Marketplace 类产品 | Creator Economy |
| Marketplace | uTools、影刀、RPA 平台 | 分发、发现、交易与审核 |
| Team / Enterprise | 影刀、阿里云 RPA | 权限、调度、治理、支持 |
| Vertical Package | 电商客服 / 订单 / 售后 | 直接卖业务解决方案 |
| Outcome | 业务 Agent | 按结果、用量或价值收费 |

OpenDesk 暂不应提前选择唯一收费方式。更合理的顺序是先验证：

```text
Action 是否有真实使用价值
→ 是否有人愿意安装别人创建的 Automation
→ 是否有人愿意为第三方 Automation / Runner 付费
→ 是否需要 Team / Governance
→ 是否能进一步按业务 Outcome 收费
```

## 11. 商业研究的五层问题

后续商业化 Research 建议统一用下面五层，而不是只看“底层自动化”和“业务 Agent”两端：

```text
第一层：Automation Runtime / Driver 怎么赚钱？

第二层：普通用户如何创建自己的小自动化？
Macro / Action / Button / Workflow / Plugin / Recorder

第三层：这些自动化如何分发和交易？
Script / App / Plugin / Template / Marketplace / Creator Economy

第四层：什么真实业务问题值得收费？
电商 / 客服 / 财务 / 运营 / IT / HR ...

第五层：AI 如何把多个工具组合成 Business Outcome？
Agent / Planner / Runtime / Verification / Evidence
```

这五层之间是递进关系，不意味着 OpenDesk 必须自己实现每一层。

## 12. 下一步研究清单

P0 后续需要继续补证据，而不是立即开发：

1. **Quicker 深挖**：Action schema、Context model、触发器、分享 / 安装、专业版收费、动作库治理。
2. **uTools 深挖**：Plugin Packaging、Marketplace、付费分成、Agent Tool permission、安全与审核。
3. **按键精灵深挖**：Creator / 小精灵的授权、分发、作者经济和历史演进，不研究违规游戏辅助市场。
4. **影刀深挖**：第三方应用市场、创业版 Runner 商业逻辑、电商应用供给、企业升级路径。
5. **阿里云 RPA 深挖**：MCP Tool、Robot 调度、服务型机器人、授权与企业部署边界。
6. **国内 RPA 补齐**：UiBot / 来也、弘玑等当前产品线和 Agentic Automation 重新核验。
7. **海外 Personal Automation 补齐**：Keyboard Maestro、Raycast、Alfred、PhraseExpress、Espanso 等与 OpenDesk Action / Custom UI 的关系。

## 13. 当前决策

本轮只更新 Research，不自动进入正式 Roadmap。

当前可进入后续产品验证的问题只有：

> OpenDesk 是否能以底层 Runtime 为基础，形成一种比大型 RPA 更轻、比普通快捷工具更可编程、比传统宏更可靠、又天然可被 Agent 调用的 **Action / Automation Package**？

近期电商 Custom UI Demo 可以作为这一问题的低成本验证器，但它首先应该证明真实用户价值和 Action 模型，而不是先扩建完整 Creator、Marketplace 或 Enterprise Console。
