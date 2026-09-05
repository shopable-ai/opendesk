# 个人自动化与 Creator 生态竞品研究

更新时间：2026-09-05

> 文档性质：Research / 商业化与产品形态决策输入。本文补充 OpenDesk 过去商业研究中相对薄弱的“中国个人自动化、快捷动作、脚本作者、插件市场、Creator RPA”谱系。它不是 OpenDesk 当前能力声明，也不代表这些产品能力都应进入 Roadmap。
>
> 2026-09-05 增补：将“自定义界面 + 脚本接口 + 桌面自动化小应用”的产品与开源项目纳入本专题，详见[第 14 节](#custom-ui-automation-20260905)。OpenDesk 当前支持 Windows 和 macOS，不能因某个接口或示例只支持 macOS，就把整个程序写成 Mac-only；产品支持、接口支持和实机验收须分开记录。本次未重新核验第 5 节原有价格与商业事实，其研究快照仍为 2026-09-03，不应将本文更新时间理解为全部事实均已刷新。

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
7. **自定义界面并非空白市场。** Hammerspoon、Script Kit、BetterTouchTool、Quicker、AutoHotkey 等已经覆盖不同形式的“自己的界面 → 脚本 / 动作 → 操作其他软件”；需要比较开发、可靠运行和交付成本，而不是只比较是否有按钮。证据和边界见第 14 节。
8. **跨平台研究必须包含 Windows。** Windows 侧重点比较 Quicker、AutoHotkey v2、AutoIt、按键精灵；macOS 侧比较 Hammerspoon、BetterTouchTool、Keyboard Maestro；Script Kit、uTools、Rubick 则用于比较脚本 / 插件宿主体验。这里是研究分工，不代表所有接口在各平台完全等价。

## 3. 应补齐的五条产品谱系

```text
A. Macro / Script
按键精灵 / AutoHotkey / AutoIt / 自动精灵 / KeymouseGo

B. Context Action Panel / Personal Automation
Quicker / BetterTouchTool / Keyboard Maestro / Hammerspoon / Script Kit / PhraseExpress / Espanso

C. Plugin / Launcher / Tool Marketplace
uTools / Rubick / Raycast / Alfred

D. Creator RPA / Automation App
影刀 / UiBot / Power Automate Desktop / UiPath Studio + Apps / OpenRPA / RPA.Assistant

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
| P0 | AutoHotkey v2 | Script / GUI / Executable Tool | C1 | B1 | Windows 脚本、GUI、事件与 EXE 交付基准；见第 14 节 |
| P0 | Hammerspoon | Scriptable Desktop Automation / WebView | C1 | B1 | macOS 原生系统 API、Lua 与自定义窗口桥接基准；见第 14 节 |
| P0 | Script Kit | JS/TS Script / Widget Host | C1 | B2 | 脚本生成小工具的开发体验；SDK 与宿主许可必须分开；见第 14 节 |
| P0 | BetterTouchTool | Floating Menu / Scriptable WebView | C1 | B2 | macOS 浮动面板、应用专属控制台和脚本交互；见第 14 节 |
| P0 | 影刀 RPA | Creator RPA / Automation App | C1 | B3 | 研究 Recorder、应用市场、第三方应用运行、企业升级和电商场景 |
| P0 | 阿里云 RPA / 原码栈 | Enterprise RPA / Computer Use Agent | C1 | B3 | 研究 Editor / Robot / Console、调度、MCP、License 和企业部署 |
| P1 | AutoIt / Keyboard Maestro | Script or Macro / Custom GUI | C1 | B2 | 对比 Windows 工具打包与 macOS 宏交互；见第 14 节 |
| P1 | Rubick | Open-source Plugin Host | C1-C2 | B1 | 研究插件宿主与分发，不等同于完整桌面自动化引擎 |
| P1 | OpenRPA / RPA.Assistant | RPA / Human-in-the-loop UI | C1-C2 | B2 | 研究交互表单、回调、执行反馈和开源实现边界 |
| P1 | UiBot / 来也 | Creator + Enterprise RPA | C1-C2 | B3 | 国内 RPA 重要对照，后续单独核验当前产品形态 |
| P1 | 弘玑 Cyclone | Hyperautomation / Agentic Automation | C2 | B3 | 企业自动化与 Agentic Automation 跟踪对象 |
| P1 | 自动精灵 | Macro / Visual Automation | C1 | B2 | 与按键精灵相邻的个人脚本 / 自动化产品样本 |
| P1 | KeymouseGo | Open-source Macro | C1 | B1 | 研究极简录制回放工具的边界与开源分发 |
| P1 | Hamibot / Auto.js | Mobile Automation | C2 | B2 | 研究 Android 自动化、脚本分发和移动端 Creator 生态 |
| P2 | SikuliX / 视觉自动化工具 | Vision-first GUI Automation | C1 | B1 | 研究图像驱动自动化和语义能力边界 |
| P2 | Raycast / Alfred | Launcher / Extension / Workflow | C2 | B3 | 研究命令入口、扩展生态和工作流 Packaging |
| P2 | PhraseExpress / Espanso | Text / Snippet Automation | C2 | B2 | 研究高频文本、模板和轻量客服效率场景 |

> 优先级与 C/B 等级是研究判断，不是市场份额或性能排名。2026-09-05 新增 / 调整的 Custom UI 对象以第 14 节证据为依据；其余 P1 / P2 中部分对象仍只是候选跟踪池，具体当前功能、价格和商业事实进入正式结论前需要再次以官方材料核验。

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
7. **海外 Personal Automation 深挖**：Hammerspoon、Script Kit、BetterTouchTool、AutoHotkey、AutoIt、Keyboard Maestro 的 Custom UI 初步事实已补入第 14 节；后续做同任务实测。Raycast、Alfred、PhraseExpress、Espanso 等继续作为相邻研究池。
8. **Windows / macOS 对照**：同一个业务目标分别记录平台、界面宿主、自动化接口、安装交付与实机证据；不把某一平台的截图或编译结果当作跨平台验收。

## 13. 当前决策

本轮只更新 Research，不自动进入正式 Roadmap。

当前可进入后续产品验证的问题只有：

> OpenDesk 是否能以底层 Runtime 为基础，形成一种比大型 RPA 更轻、比普通快捷工具更可编程、比传统宏更可靠、又天然可被 Agent 调用的 **Action / Automation Package**？

近期电商 Custom UI Demo 可以作为这一问题的低成本验证器，但它首先应该证明真实用户价值和 Action 模型，而不是先扩建完整 Creator、Marketplace 或 Enterprise Console。

<a id="custom-ui-automation-20260905"></a>

## 14. Custom UI 与桌面自动化小应用竞品增补（2026-09-05）

### 14.1 研究对象与 OpenDesk 平台口径

本次研究的是下面这个组合，而不是只研究宏录制器、流程编辑器或普通 GUI 框架：

```text
开发者或 Agent 编写业务脚本
→ 创建自己的按钮、表单或持续交互窗口
→ 用户操作界面
→ 调用系统 / 文件 / 网络 / 外部桌面自动化接口
→ 显示运行状态与结果
→ 复用、交付或分发这个小工具
```

**OpenDesk 当前支持 Windows 和 macOS。** 这是本轮维护者明确确认的产品事实；仓库 [Global Shortcut API](../../api/global-shortcut.md) 也明确将 macOS、Windows 标为 Stable。不能再将 OpenDesk 整体写成“只支持 macOS”，也不能仅研究 Mac 工具而忽略 Windows 同类。

需要严格区分三个层次：

| 层次 | 本轮采用的口径 | 不能由此推导的结论 |
|---|---|---|
| 产品 / Runtime | OpenDesk 支持 Windows 与 macOS | 所有模块、示例和接口在两端均完全一致 |
| 单项接口 | 按 `docs/api/` 对应契约记录平台、授权、可用性和限制 | 从一个接口的限制推导整个程序不支持该平台 |
| 验收证据 | 文档、源码、编译结果、真实目标系统运行分别记录 | 文档或交叉编译等于已经完成 Windows / macOS 实机验收 |

本轮读取的 [Custom UI API](../../api/custom-ui.md) 仍明确写明：macOS 使用 AppKit / WKWebView，Windows 与 Linux 的该模块报告 `available: false`。**这是当前所读 Custom UI 文档的接口级描述，不否定 OpenDesk 程序的 Windows 支持。** 本轮未执行目标系统测试，也不据此声称 Windows Custom UI 已完成或已实测；若实现已先于文档更新，应另以源码和对应版本的 Runtime 证据更新正式接口文档。

另需保留当前命名边界：小写 `ui` / `FloatingWindow` 创建 OpenDesk 自己的界面，大写 `UI` 操作外部可见目标；`docs/custom-ui/` 是资源与示例说明入口，正式接口契约在 `docs/api/custom-ui.md`。依据：[Custom UI 资源说明](../../custom-ui/README.md)、[Custom UI API](../../api/custom-ui.md)。

### 14.2 直接或高度相邻的小应用产品

下表中的“研究价值”是对 OpenDesk 的判断；“已确认组合”来自所列官方文档，不代表已经安装实测。跨平台产品的单项功能仍须按具体版本核验。

| 产品 | 平台 / 形态 | 已确认的相似组合 | 对 OpenDesk 的研究价值与边界 | 来源 |
|---|---|---|---|---|
| Hammerspoon | macOS，Lua 自动化宿主 | `hs.webview` 使用 WKWebView 创建窗口，可注入 JavaScript 并通过 user content controller 与宿主通信；与系统自动化扩展组合 | 优先看原生系统能力、脚本桥接、窗口事件与资源生命周期；不是 JS 主运行时 | [WebView 文档][CU-HS]、[项目][CU-HS-REPO] |
| Script Kit | 跨平台桌面脚本宿主；官网另列 Windows / Linux 版本入口 | JS/TS 脚本；`widget()` 创建 HTML 窗口，`onClick`、`onInput`、`setState` 处理交互，并可调用键鼠等脚本能力 | 优先看少量代码生成业务小工具的体验；窗口依赖宿主，不等于独立安装包；SDK 与宿主许可分开 | [官网][CU-KIT-HOME]、[API][CU-KIT-API] |
| BetterTouchTool | macOS，商业自动化宿主 | Floating Menus / Scriptable WebView 可加载 HTML、触发 BTT 功能并显示结果，联动脚本和应用专属动作 | 优先看浮动操作台、应用上下文、触发器和界面反馈；不应仅当作触控板工具 | [WebView][CU-BTT]、[JSON / AI 菜单创建][CU-BTT-AI] |
| Quicker | Windows，动作 / 面板宿主 | 自定义操作窗和 XAML/WPF 自定义窗口；按钮可触发动作或子程序，传入参数并更新窗口数据 | 优先看业务操作面板、输入输出绑定及不抢焦点模式；部分高级功能的适用版本 / 预览标识需逐项核验 | [操作窗][CU-QUICKER-PANEL]、[自定义窗口][CU-QUICKER-WINDOW] |
| AutoHotkey v2 | Windows，脚本 / GUI / 可执行工具 | `Gui()` 创建窗口和控件；与快捷键、输入、窗口自动化组合；Ahk2Exe 可将脚本转换为 EXE | 优先看“自己的界面 + 操作其他软件 + 工具交付”；新研究使用 v2，不能将 v1 示例直接当作 v2 契约 | [Gui][CU-AHK-GUI]、[项目][CU-AHK]、[Ahk2Exe][CU-AHK-EXE] |
| AutoIt | Windows，脚本 / GUI / EXE | 自定义 GUI、键鼠模拟、窗口与控件操作、COM / DLL 调用，可生成独立 EXE | Windows 业务小工具与交付基准；免费软件不等于开源运行时 | [官方介绍][CU-AUTOIT]、[许可][CU-AUTOIT-LICENSE] |
| Keyboard Maestro | macOS，宏 / 面板宿主 | Custom HTML Prompt 用 HTML/CSS/JS 自定义交互窗口，读写宏变量并触发宏；支持异步显示选项 | 看宏与表单、状态、人工确认的结合；不是与 OpenDesk 相同的通用 JS Runtime | [Custom HTML Prompt][CU-KM] |
| uTools | 跨平台插件宿主 | HTML 插件界面、`plugin.json`、Node.js preload 与系统 API；提供插件打包和市场入口 | 看小应用开发、宿主扩展、安装分发与 Agent Tool；插件包不等于独立 EXE，浏览器能力不等于全部桌面能力 | [第一个插件][CU-UTOOLS]、第 5.3 节 |
| 按键精灵 / 商业小精灵 | 本专题重点看 Windows PC 与脚本成品；移动端另列 | 脚本成品化、作者授权和商业小精灵分发，沿用第 5.1 节已有研究 | 看脚本作者如何交付和销售工具；不能把移动端 WebUI / APK 的资料直接当作 Windows 同版本能力证明 | 第 5.1 节的官方来源；本轮未刷新各端版本 / 价格 |

这里存在三种不同交付物，竞品比较必须分别记录：**宿主内脚本 / 插件、可独立启动的打包工具、企业平台中的自动化应用**。不能把“创建额外窗口”“导出插件包”“生成 EXE”“销售成品”都归为一个“支持桌面应用”的勾选项。

### 14.3 开源实现与许可边界

本表记录本轮官方仓库或包元数据可确认的许可标签，不代替针对具体版本、文件和依赖的复用审查；开源不代表可不保留许可或无条件移植。

| 项目 / 组件 | 本轮确认的许可或状态 | 最适合研究的实现 | 注意事项 / 来源 |
|---|---|---|---|
| `Hammerspoon/hammerspoon` | MIT | 系统扩展、Lua bridge、WebView 与生命周期 | [LICENSE][CU-HS-LICENSE]；macOS 技术参照，不是 Windows backend |
| `AutoHotkey/AutoHotkey` | GPL-2.0 | Windows 脚本、GUI、事件与工具交付 | [仓库及许可入口][CU-AHK]；复用解释器实现与参考 API 设计是两件事 |
| `johnlindquist/kit` SDK | MIT | JS/TS SDK、Widget 与脚本开发体验 | [SDK LICENSE][CU-KIT-LICENSE]；不能据此将整个 Script Kit 宿主归为 MIT |
| `script-kit/app` 桌面宿主 | LICENSE 明确标注专有软件；公开代码用于贡献修复 | 仅作为产品与架构研究对象 | [宿主 LICENSE][CU-KIT-APP-LICENSE]；与官网笼统的 open-source 描述存在范围差异，实际复用须以具体组件许可为准 |
| `rubickCenter/rubick` | MIT | Electron 插件宿主、UI / 系统插件、安装卸载与分发 | [仓库][CU-RUBICK]；高度相邻，但不是已经自带全部桌面识别与控制能力的 RPA 引擎 |
| `open-rpa/openrpa` | MPL-2.0 | Windows 工作流自动化、交互表单及机器人执行 | [仓库][CU-OPENRPA-REPO]；不要把 OpenRPA 的许可直接套到其他服务、插件或后端组件 |
| `robocorp/rpaframework` 的 `rpaframework-assistant` 包 | 包元数据标注 Apache-2.0 | Python / Robot Framework 的动态对话框、输入校验与按钮回调 | [包信息][CU-ASSISTANT-PACKAGE]、[迁移说明][CU-ASSISTANT-GUIDE]；研究 `RPA.Assistant`，不要无差别沿用旧 `RPA.Dialogs` 方法 |
| AutoIt | 自有 EULA，不归入上述开源实现池 | 产品、脚本 API 与 EXE 交付体验 | [EULA][CU-AUTOIT-LICENSE]明确允许商业使用和销售所创建的脚本；不等于开放运行时源码 |

BetterTouchTool、Quicker、Keyboard Maestro、uTools、按键精灵等在本专题主要作为产品研究对象，不能仅因其脚本、示例或插件代码公开，就把其整个宿主标为开源。

### 14.4 企业 RPA、人机协同和 AI 相邻对象

| 产品 / 项目 | 已确认的重叠能力 | 在本专题中的边界 | 来源 |
|---|---|---|---|
| OpenRPA | Windows、浏览器等自动化；工作流内嵌脚本；Forge Forms 交互表单；有人 / 无人值守机器人 | 适合看“界面 + RPA 执行”；不是同等轻量的 JS 小应用宿主。官网的多类应用集成不能直接解释为桌面客户端支持所有 OS | [官方产品页][CU-OPENRPA] |
| RPA.Assistant | 对话框输入、校验、按钮回调等人与自动化交互能力 | 是可集成的库，不是完整商业桌面小应用平台；系统可用性还取决于版本和依赖 | [迁移说明][CU-ASSISTANT-GUIDE]、[包信息][CU-ASSISTANT-PACKAGE] |
| UiPath Apps + Assistant / Robot | Apps 与 attended automation 可维持双向通信，通过用户交互调用关联工作流 | 企业级“业务界面 + 自动化”参照；不要等同于本地独立 EXE，部署与许可需按组件另查 | [官方通信机制][CU-UIPATH] |
| Power Automate Desktop | `Display custom form` 基于 Adaptive Cards；表单输出数据和按钮选择，后续流程据此分支 | Windows 流程中的自定义表单参照，不宜直接等同于任意持续交互窗口 | [官方表单文档][CU-PAD] |
| UI-TARS Desktop / Agent TARS | AI 驱动的计算机 / 浏览器操作与 Agent 工具组合 | 主要比较 Agent 执行，而不是把其自带的操作界面误认为给脚本作者提供 Custom UI SDK | [官方仓库][CU-TARS] |
| Peekaboo | macOS CLI / MCP、截图与原生 UI 自动化 | Desktop Driver / Agent Tool 参照，不因它有菜单栏 App 就视为同类的小应用开发平台 | [官方仓库][CU-PEEKABOO] |

AI / Driver 的完整竞争池继续由 [Computer-use 竞品重扫](../desktop-automation/2026-08-31-computer-use-agent-competitor-rescan.md) 承载；本节只说明与 Custom UI 小应用方向的交集，避免复制一套平行总表。

### 14.5 对 OpenDesk 的判断与研究顺序

**判断一：单独“能画界面”不足以差异化。** 第 14.2 节已能反证“其他产品只有脚本、没有自己的界面”。BetterTouchTool 还提供 JSON / AI 创建浮动菜单的官方说明，因此“可用 AI 生成面板”本身也不宜宣称独有能力。[来源][CU-BTT-AI]

**判断二：更值得验证的是可靠小应用的开发与交付成本。** 研究假设是：OpenDesk 能否让开发者或 Agent 以更少的胶水代码，将同一业务动作接到按钮、快捷键和外部调用入口，并能解释失败、保留结果、维护版本。这是待验证优势，不是已经证明的竞品领先结论。

| 研究视角 | 优先对象 | 本次建议关注的问题 |
|---|---|---|
| Windows 业务操作台 | Quicker、AutoHotkey v2；再看 AutoIt、按键精灵 | 外部窗口焦点、控件 / 输入、参数和结果绑定、脚本打包及用户安装 |
| macOS 原生交互 | Hammerspoon、BetterTouchTool；再看 Keyboard Maestro | 原生接口 bridge、浮动窗口、事件、权限与生命周期 |
| JS/TS 与插件开发体验 | Script Kit、uTools；开源宿主参照 Rubick | 少量代码完成界面与动作联动、状态更新、宿主边界和分发 |
| 人工参与 / 企业交付 | RPA.Assistant、OpenRPA；再看 UiPath Apps、Power Automate Desktop | 表单、审批、长任务反馈、机器人执行与组织交付成本 |

这里的 Windows / macOS 是并列研究维度，不是将 Windows 视为未来才支持的平台；也不意味着 OpenDesk 现在必须重建 Electron、全功能 GUI 设计器或企业控制台。

### 14.6 后续同任务验证：不用接口数量替代产品价值

建议以同一个低风险业务小工具做对照：选择目标应用与参数 → 点击开始 → 执行外部操作 → 展示状态 / 结果 → 异常时停止 → 调整参数后再次运行。真实业务批量提交或外部发送另设人工确认，不使用真实客户数据做无保护演示。

| 维度 | 应记录的输入与输出 | 验证问题 |
|---|---|---|
| 开发成本 | 同一需求、实现代码、配置和开发步骤 | UI / Action / 数据绑定需要多少重复代码？ |
| 执行可靠性 | 固定样本、应用版本、成功 / 失败记录 | 焦点变化、目标不存在、重复点击时行为是否明确？ |
| 生命周期 | 运行 ID、取消请求、终态、资源清理记录 | 能否区分关闭面板、停止单次任务、退出整个宿主？长任务如何取消须另做实现审计，不能靠“有停止按钮”判定 |
| 结果与恢复 | 参数、阶段输出、错误原因、结果证据 | 是否能解释失败、保留输出并安全重试？ |
| 平台与交付 | OS、构建版本、依赖、授权、安装和更新步骤 | Windows / macOS 分别支持哪些模块？交付的是脚本、插件、配套 Runtime 还是独立安装包？ |

正式比较应分开记录“共同可用能力”的任务结果与“平台能力缺口”。例如某版本没有 Windows Custom UI，应标记该模块未支持或待核验，而不是写成 OpenDesk 整体不支持 Windows。没有目标 OS 实机记录时，不得标注已通过。

本次只补 Research、研究优先级与后续验证问题，未修改 API 契约、实现代码、测试或 Roadmap，也未执行竞品实机性能测试。

### 14.7 本次来源与时效说明

以下链接为 2026-09-05 本轮核对的官方文档、官方仓库或维护者发布的包信息。功能事实、许可标签和研究判断分别记录；不以 GitHub Star、公开营销表述或本文更新时间替代可运行性与商业条款的核验。第 5 节及按键精灵的历史研究仍按各自原始日期阅读。

- Hammerspoon：[WebView][CU-HS]、[项目][CU-HS-REPO]、[许可][CU-HS-LICENSE]。
- Script Kit：[官网][CU-KIT-HOME]、[API][CU-KIT-API]、[SDK 许可][CU-KIT-LICENSE]、[宿主许可][CU-KIT-APP-LICENSE]。
- BetterTouchTool：[Scriptable WebView][CU-BTT]、[JSON / AI 创建][CU-BTT-AI]。
- Quicker：[自定义操作窗][CU-QUICKER-PANEL]、[自定义窗口][CU-QUICKER-WINDOW]。
- AutoHotkey：[v2 Gui][CU-AHK-GUI]、[仓库][CU-AHK]、[Ahk2Exe][CU-AHK-EXE]。
- AutoIt：[产品][CU-AUTOIT]、[EULA][CU-AUTOIT-LICENSE]；Keyboard Maestro：[Custom HTML Prompt][CU-KM]。
- uTools：[插件开发][CU-UTOOLS]；Rubick：[仓库][CU-RUBICK]。
- OpenRPA：[产品][CU-OPENRPA]、[仓库][CU-OPENRPA-REPO]；RPA.Assistant：[包信息][CU-ASSISTANT-PACKAGE]、[迁移说明][CU-ASSISTANT-GUIDE]。
- UiPath：[Apps 双向通信][CU-UIPATH]；Power Automate Desktop：[自定义表单][CU-PAD]。
- UI-TARS：[仓库][CU-TARS]；Peekaboo：[仓库][CU-PEEKABOO]。

[CU-HS]: https://www.hammerspoon.org/docs/hs.webview.html
[CU-HS-REPO]: https://github.com/Hammerspoon/hammerspoon
[CU-HS-LICENSE]: https://github.com/Hammerspoon/hammerspoon/blob/master/LICENSE
[CU-KIT-HOME]: https://www.scriptkit.com/
[CU-KIT-API]: https://johnlindquist.github.io/kit-docs/
[CU-KIT-LICENSE]: https://github.com/johnlindquist/kit/blob/main/LICENSE
[CU-KIT-APP-LICENSE]: https://github.com/script-kit/app/blob/main/LICENSE
[CU-BTT]: https://docs.folivora.ai/docs/webview/overview/
[CU-BTT-AI]: https://docs.folivora.ai/docs/floating-menus/json-ai-creation/
[CU-QUICKER-PANEL]: https://getquicker.net/KC/Help/Doc/custompanel
[CU-QUICKER-WINDOW]: https://getquicker.net/KC/Help/Doc/customwindow
[CU-AHK-GUI]: https://www.autohotkey.com/docs/v2/lib/Gui.htm
[CU-AHK]: https://github.com/AutoHotkey/AutoHotkey
[CU-AHK-EXE]: https://github.com/AutoHotkey/Ahk2Exe
[CU-AUTOIT]: https://www.autoitscript.com/site/autoit/
[CU-AUTOIT-LICENSE]: https://www.autoitscript.com/autoit3/docs/license.htm
[CU-KM]: https://wiki.keyboardmaestro.com/action/Custom_HTML_Prompt
[CU-UTOOLS]: https://www.u-tools.cn/docs/developer/basic/first-plugin.html
[CU-RUBICK]: https://github.com/rubickCenter/rubick
[CU-OPENRPA]: https://openiap.io/openrpa
[CU-OPENRPA-REPO]: https://github.com/open-rpa/openrpa
[CU-ASSISTANT-PACKAGE]: https://pypi.org/project/rpaframework-assistant/
[CU-ASSISTANT-GUIDE]: https://github.com/robocorp/rpaframework/blob/master/packages/assistant/docs/Migration-Guide.md
[CU-UIPATH]: https://docs.uipath.com/apps/automation-cloud/latest/user-guide/apps-and-attended-automations-bi-directional-and-instant-communication
[CU-PAD]: https://learn.microsoft.com/en-us/power-automate/desktop-flows/custom-forms
[CU-TARS]: https://github.com/bytedance/UI-TARS-desktop
[CU-PEEKABOO]: https://github.com/openclaw/Peekaboo
