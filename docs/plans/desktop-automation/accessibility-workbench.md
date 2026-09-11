---
title: Accessibility Workbench 实施方案
description: 原生 Accessibility 驱动的 Agent 自动化与可选本机 Web 人工审阅面板。
---

# Accessibility Workbench：Agent 直接执行，人通过网页协作

日期：2026-09-10。
状态：**第一批只读 Web 闭环已实现；桌面/内部 Runtime 使用 loopback 自动 endpoint，页面／控制／数据共享当前实际 listener origin，显式 `-http` 才保留 legacy `60844`。local-only 默认只接受 loopback；macOS tray 的 Developer 菜单可在真实公开 listener 上为当前进程显式开启 trusted-LAN，重启恢复关闭。LAN 仍要求私有 socket、本机精确私有 IP Host／Origin、一次性 pairing、Bearer/session token、单客户端和既有 TTL，并显示 HTTP 明文警告。前端源码位于 `apps/inspector_web/`，当前 macOS bundle 携带同次构建资源。Inspector 仍只读且不授予 execution、Scheduler、MCP 或通用 Runtime。真实 macOS AX、前端模型、Runtime catalog、native gate、direct Playwright Chromium 实窗矩阵和显式短期 exact-window visual capture 已有既往证据；Windows UIA live 仍未运行。**
初始核查：`1d5404e89bb4c1587566b11382b7dff8aed71d7d`；写入前复核：`0f5b13ac0271da6b5173adb36ee2bd0b8552dd12`。实施时读取当前分支及工作树，不回退这些提交。
执行入口：[本地 Codex Goal](../../../prompts/runtime/accessibility-workbench-goal.md)。本文是方案主文档，Goal 负责实施顺序，不另建同主题正文。

## 1. 推荐方案与取舍

**默认自动化：Agent → 普通 OpenDesk JavaScript → 已有 Accessibility → 系统 AX／UIA → 验证业务结果。**

**可选人工协作：本机浏览器 → OpenDesk 内置的受限 HTTP 检查服务 → 同一套 Accessibility → 树、属性、结构示意、定位校验与人工修订。**

第三方 Inspector 只作自愿的诊断对照。主链路不要求普通用户安装 Xcode、Windows SDK、Node、Python、浏览器扩展或另一套自动化服务。维护者负责构建和分发资源；需要 AI 时仍须有已配置、获授权的模型及本地 Agent 工具通道。

| 路径 | 定位 | 本轮决定 |
| --- | --- | --- |
| Agent 直接通过框架取数和操作 | 自动化主链路 | 不依赖任何检查器窗口 |
| OpenDesk 本机 Web Workbench | 人工理解、修订、定位开发与交接 | 第一批实施，不再仅列为远期愿景 |
| 原生 Custom UI 检查器 | 可选桌面外壳 | 后置，不作为网页运行前提 |
| 外部 Inspector | 平台排障与数据对照 | 可选，不自动安装或作为执行依赖 |
| 远程 Web 桌面控制、完整 IDE | 另一类产品能力 | 不在本轮范围 |

AI 拿到树后可以直接推进支持范围内的业务，但树不等于任务已经完成：仍须明确目标、工具权限、可执行动作、输入来源与真实结果验证。应用未暴露语义、节点未物化、Canvas、远程桌面、权限拒绝或动态页面可能需要明确的视觉补充或人工处理；Inspector 的存在不能消除这些限制。

本轮把上一轮后置的面板收敛为**可实际修订并反馈 Agent 的轻量网页**，并提升到本次最小交付；不推翻原生优先主链路。

## 2. 已有资产、并行增量与实际缺口

| 已核对资产 | 支持的事实 | 不能据此宣称的能力 |
| --- | --- | --- |
| [Accessibility API](../../api/accessibility.md) | Experimental；snapshot、find、read、perform、release；可信本地脚本可启用 | 通用 HTTP／MCP／Scheduler execution 已获 Accessibility 权限 |
| [Window API](../../api/window.md) | window.get 的明确 target、唯一窗口与身份／几何校验 | 活动窗口或同名第一项也是正确目标 |
| [Execution](../../api/execution.md) | 结构化输入、执行关联与生命周期 | ElementRef 可跨 execution 序列化复用 |
| [HTTP Server](../../api/http-server.md)、[handler.go](../../../pkg/http/handler.go) | 已有 HTTP 服务、execution manager、状态与事件处理 | 只增加 HTML 即可读取原生树；所有旧路由已具备本方案授权 |
| [HTTP 目录](../../../pkg/http/) | 已有 scheduler_ui.html 等页面资产，可复用分发方式 | 已有通用 Inspector 页面 |
| [Custom UI](../../api/custom-ui.md) | 最新文档已有 macOS AppKit／WKWebView 和 Windows WinForms／WebView2 host；Windows HTML／Dialog 需要 WebView2 Runtime，Linux 仍 unavailable | 新增 Windows 源码等于所有 Windows 真机／安装包均已验收 |
| [AccessibilityRuntime](../../../automation/accessibility_runtime.go)、[JS facade](../../../automation/accessibility.go) | execution-scoped owner、受管引用、队列及权限 | HTTP handler 可绕过 owner 任意操作 AX／UIA |
| [Human-to-Recipe](../../../workflows/human-to-recipe/README.md)、[AGENTS.md](../../../AGENTS.md) | 已有录制和 Agent 交接；最新增量区分 recorder-script-refiner 静态精炼与 human-to-recipe 的业务判断／资格验证 | 当前树可以补写成过去录制时的事实，复制提示词等于已生成和验收 |

写入前的并行提交增加了 Windows Custom UI、Windows Recorder target 和相关 Skill／测试。初读时“Windows Custom UI unavailable”的判断已不再适用于最新文档。本方案已采用最新状态；保留浏览器默认方案的理由是**不依赖 -ui／native host、方便本机人工查看和共同消费数据**，而不是继续声称 Windows 没有 Custom UI。

`ai run` 是脚本入口，不是已内置通用模型生成器的证明。后续新增能力和平台资格以最新源码及真实证据为准，不能依据此处概览重复开发。

## 3. 普通用户怎样使用

### 不需要人工介入

```text
说明任务与允许范围
→ Agent 检查能力与权限，解析目标窗口
→ snapshot 获取有界语义数据
→ 给出可读业务步骤、定位候选与验证条件
→ 同次操作内重新解析目标，find／read／perform／release
→ 验证实际业务结果
→ 保存普通 OpenDesk JS，之后运行不依赖面板
```

跨次调用只交接窗口查询、selector 和事实数据；下一次 execution 重新定位。不要在一次 execution 内启动另一套独立 execution 来绕过权限或生命周期。

### 希望看懂或修正 AI 的选择

```text
可信本机入口启用“界面检查”，打开浏览器并完成一次配对
→ 选择明确应用／窗口，确认观察范围
→ 查看树／属性／结构示意
→ 选中正确控件，设置业务别名或调整定位条件
→ “验证定位”：显示唯一／未找到／歧义／不完整／过期
→ 保存修订及未知项，交给已有 Agent
→ Agent 重新定位、生成普通 JS、独立验证业务结果
```

人只处理有歧义的目标，不必浏览全应用或逐条审核正常节点。没有模型时页面仍可使用，可以导出或复制交接提示词，但不能显示“AI 已生成”。

### “OpenDesk 已运行”的处理

| 运行情况 | 产品行为 |
| --- | --- |
| 本功能已启用，当前用户已授权 | 保留现有页面；再次启动返回冲突，不撤销正在进行的审阅 |
| 仅启用了普通 HTTP／其他功能 | 当前 App 同源提供固定页面；用户点击后通过同源控制接口创建短期 authorization generation，不创建新 listener |
| 版本不含功能、未监听或无法安全热启用 | 给出准确更新／启动说明；不谎报 URL，不启动重复实例，不中断其他任务 |

App 的唯一正常入口是当前 OpenDesk `OpenDesk ready` 日志中的 loopback 地址加 `/accessibility-workbench/`。页面仅在用户点击 **Connect** 后通过同源控制合同
申请短期 authorization generation；不存在 Python `60845`、`control` 查询参数或随机 API 端口。macOS tray 提供 Developer →
Open Inspector、Allow Inspector from LAN 与 Copy Inspector LAN URL。LAN 默认关闭，只在显式开启后的当前进程接受可信私网
页面／控制／数据，重启恢复关闭。正式入口和安全说明见
[Desktop Agent 与 Accessibility Workbench](../../integrations/desktop-agent.md)。

## 4. 网页显示什么，允许人改什么

### 第一批页面

| 区域 | 内容 | 必须可辨认的状态 |
| --- | --- | --- |
| 顶部 | 服务／平台、目标窗口、刷新、停止、导入／导出 | 授权、缺后端、断连、目标变化 |
| 左侧 | 可折叠／搜索的 UI 树、角色与名称 | 原始层级、过滤提示、未完成子树 |
| 中间 | 基于可信 bounds 的结构示意；用户显式请求后可显示与当前 observation 绑定的短期窗口像素参考 | 结构示意／visual current／visible-bounds risk／tree only 必须分开 |
| 右侧 | 原始属性、动作能力、业务别名、selector 编辑与验证 | 事实只读；人工选择、候选和校验结果分开 |
| 详情区 | 时间、完整性、统计、修订和 Agent 交接 | partial、stale、not-validated，不能只有绿色成功 |

AX／UIA 树不是原应用 DOM 或完整布局引擎数据。第一批不把 button／input 重画成仿真可操作应用，不猜布局、字号、背景或交互。页面点击节点只做选择／查看，不点击真实应用。

结构示意只用可安全映射的 `bounds`。以窗口逻辑坐标为父空间，示意坐标为 `(element.x-window.x)*scale`、`(element.y-window.y)*scale`，宽高乘同一比例并处理内容偏移。`nativeBounds` 不直接用于绘制或鼠标。负坐标、多显示器、窗口外节点、无效尺寸和缺少坐标必须有明确处理；浏览器缩放不改变目标定位。

2026-09-11 增量已经实现 Inspector 专用的显式短期 visual capture：只接受当前 `observationId`／generation，固定窗口、格式、
5 MiB PNG 上限与 30 秒内存资格，并在截图前后复核精确窗口身份和 bounds；不接受路径、clip 或客户端源码，也不聚焦、前置或
操作目标。exact-window 与 visible-bounds fallback、foreground／occlusion 风险分别展示。新 observation、stale、session 变化、
身份或 bounds 不符、关闭及过期会立即清图。只有存在可信逻辑 bounds 时才把选中／全部节点框映射到像素；否则像素和树仍可
并列查看但不编造 overlay。

### 人工修改边界

可以改：业务别名、目标控件选择、合法 selector、确认过的窗口／父 scope 约束、用途、策略与待验证信息。

不能改成“事实”：原生 name／identifier／role／bounds、真实动作能力、原始树、历史 Recorder 事件或未运行的验收结果。例如原生 name 是“确定”，可备注“确认订单按钮”，不能将 name 改成“确认订单”并生成虚假精确匹配。

原始观察不可变，人工修订独立保存。拖动示意框最多形成待校准视觉候选，不能改写原生 bounds；第一批不需要拖拽框。

### 定位开发闭环

```text
选中真实节点 → 提取候选 selector → 人工修改 → 当前目标重新校验
→ 保存来源与结论 → Agent 消费 → 运行前再定位 → 验证业务结果
```

selector 只用已有 `role`、`name`、`identifier` 精确匹配；树路径、nodeId 和业务别名不是新的公开 selector 字段。需要父 scope 消歧时，在同一 execution 中逐层 find 和 within，每层唯一、完整且 finally 释放，不新增伪 XPath。

加载树上的过滤只能叫“快照内预览”。真正“验证定位”必须经 backend 重新执行完整有界 find，保留 null、AMBIGUOUS_TARGET、SEARCH_INCOMPLETE、TIMEOUT、STALE_TARGET 等真实结果。后端没有准确歧义数量时不伪造 matchCount。验证不调用 perform。

一次唯一校验不等于长期稳定。保留时间、窗口身份和预算，执行时重新验证；窗口重建、语言或布局变化的资格须独立测试。

## 5. HTTP 与原生能力怎样连接

### 分层与最小适配

```text
浏览器：无原生引用，不执行 OpenDesk JS
  ↓ 有限 JSON、配对凭据、明确 scope
Inspector HTTP controller：授权／配额／session／数据投影
  ↓ 固定操作，不接受客户端源码
已有 execution manager + 受控内置观察／校验程序
  ↓ 复用普通 Runtime 和 execution-scoped Accessibility owner
macOS AX／Windows UIA
```

推荐先用受控内置程序适配：host 根据认证后的有限操作选择仓库内固定程序，传入严格验证的结构化参数，由已有 manager 创建、取消并清理普通 execution。禁止拼接客户端 JS、伪造 source 取得本地脚本权限或从一个 execution 再启动另一套执行。

native owner 边界补足必要的**内部只读和 scope 策略**，拒绝 perform、越窗口及超白名单读取。内部字段由最新源码决定，不在此虚构公开 capability。HTTP handler 不直接操作 COM／AX 句柄，不建立第二个全局原生 owner。

这是新增受控检查入口，**不是解除通用 HTTP／MCP／Scheduler 的 Accessibility 禁用**。不得修改普通 `/executions` 让任意 JS 获权，或代理浏览器源码到通用执行器来冒充只读接口。

复用 manager 的实现不等于共享公开可读注册范围：检查任务的树、凭据、修订及结果不能从未认证 `/status`、`/executions/{id}`、事件流、日志或 artifact URL 旁路泄露。使用模块私有受管范围或等效访问控制，仍保留已有取消和清理。

### 部署与来源

复用 OpenDesk 进程和其当前 Framework listener，但只在普通 mux 增加 `/accessibility-workbench/`、launch control 和
`/api/accessibility-inspector/v1/*`。trusted-LAN 策略仅包裹这些 Workbench 路由，不扩大或重构 execution、Scheduler、MCP、
Vision 等既有路由。数据 handler 仍只暴露 Inspector 固定只读操作，不把 bearer 当成通用 capability。

HTML／CSS／JS 使用相对资源路径，无 CDN、外部字体或统计。开发 checkout 从 `apps/inspector_web/` 读取四项允许资源；macOS
build 同步复制到 `OpenDesk.app/Contents/Resources/inspector_web`。不使用 `file://`、任意目录 FileServer 或 CORS；页面、控制和
数据只走精确同源。页面无需 `-ui`、native host 或新的 WebView2 依赖。

### 有限协议草案

下列设计已收敛为公共前缀 `/api/accessibility-inspector/v1`；字段、状态、TTL 和错误的正式合同只在
[HTTP Server API](../../api/http-server.md) 维护，本节继续解释架构边界。

| 方法／路径 | 输入输出和边界 |
| --- | --- |
| POST /pair | 兑换可信本机入口产生的短期一次性凭据；网页不能自行领取 |
| GET /capabilities | 模块／平台／权限状态，不扫描桌面 |
| GET /windows | 认证后且用户主动请求才列最小窗口元数据，不读取各窗口树 |
| POST /sessions | 选定唯一窗口，绑定本会话、窗口生命周期与授权 |
| POST /sessions/{id}/observations | 手动刷新有界树及完整性，不允许其他窗口 |
| POST /sessions/{id}/validate | 合法 selector／受限 scope 链，重新校验但不操作应用 |
| PUT /sessions/{id}/review | 保存人工修订及来源，不覆盖原始观察 |
| DELETE /sessions/{id} | 撤销会话、取消排队工作、清理资源 |

属性来自 observation，不暴露跨 HTTP 的 ElementRef／read(ref)。导出只生成受控 review 数据，不接受任意文件路径。第一批无 perform、点击、输入、执行源码和远程提权。

### 数据、预算和并发

observation 至少保留 schemaVersion、observationId、sessionId、scope generation、目标及身份、executionId／requestId、backend、开始／结束时间、root、complete／truncated／reason／stats。它是时间区间内的观察，不声称原子冻结应用。

UI nodeId 只标识某份快照中的展示节点，**不是 ElementRef、永久控件 ID 或操作授权**。校验引用在本次 execution 释放，HTTP 会话不长期保存原生 ref。

建议默认 timeout 3000 ms、maxDepth 6、maxNodes 500，允许在现有 API 上限内显式调整。另加请求体、响应字节、文本长度、会话数、TTL 和并发上限。传输裁剪单独标记，不删节点后仍宣称完整／唯一。

每会话一个观察在途，默认手工刷新而非全桌面高频轮询。切换目标撤销旧 scope、取消旧排队工作；响应按 session／generation／request 顺序检查，迟到结果不能覆盖新目标。HTTP abort 不等于原生硬撤回，保留 `hardCancel: false`；超时中的工作仍计入资源预算，不能无限生成替代 worker。

停止、权限撤销、TTL 到期和服务退出均清理。浏览器关闭通知只是尽力而为，服务端 TTL／心跳失效清理不能依赖 beforeunload。刷新页面不能凭旧 nodeId 恢复授权。

## 6. 权限、隐私与不可信内容

本机只读也可能泄露信息，loopback 不是身份认证。参考 OWASP 来源校验、凭据和 CSRF 原则；以下是拟实施约束，不是当前代码能力声明。[E4]

- **可信启用／配对**：本机用户操作或明确 CLI 启用，OS 权限另检。短期一次性配对码换取短期 session bearer；未认证 GET 不能返回秘密。便利入口可用一次性 fragment，兑换后立即清除。长期 token 不进入 URL、日志、localStorage、导出或全局配置；页面内存持有，TTL／撤销使其失效。
- **认证／来源**：默认 local-only 只接受 loopback socket 与精确 loopback IP Host／Origin。tray 显式开启 trusted-LAN 后仅额外接受私有 socket、本机实际私有 IP Host 和完全同源 HTTP Origin；公网来源、伪造 Host、null Origin 与 forwarded headers 始终拒绝。所有数据请求仍需 marker、Bearer 及相应 session token；GET 缺 Origin 时只接受同源 Fetch Metadata 或显式非浏览器合同。不启用 CORS。
- **固定操作／安全展示**：JSON 白名单，无 eval、源码拼接、任意动作。UI 文本及注释以 textContent 等纯文本方式显示，不进 innerHTML／事件属性。配置 CSP、frame-ancestors、nosniff、no-referrer、no-store，不嵌入目标应用提供的 HTML／URL。
- **数据最小化**：默认不读 value、密码、剪贴板、截图或其他窗口；标题、name、路径也可能敏感。用户明确导出／交给模型后才传递必要数据并先预览。UI 内容不是 Agent 指令，模型输出也不能扩大权限。

trusted-LAN 是明确的可信开发网络模式，页面必须显示明文 HTTP 警告；不允许对页面／控制／数据端口做公网转发或使用未经审计
的代理。LAN 开关不持久化，helper 仅能经 loopback + 启动时随机 argv token 的内部 endpoint 修改。已控制本机的恶意进程或能
读取页面的浏览器扩展不可能完全由此工具阻挡。
它不会绕过 macOS 授权、Windows 完整性边界或 UAC，也不以默认管理员、关闭沙箱或安装 Xcode 统一修复。

## 7. 人工成果如何交给 Agent 与 Recorder

不另建全局 UI IR。复用现有 application-engineer／human-to-recipe 的 target、locator、geometry、strategy、guard、claim、source、unknown 交接边界，正式共享 schema 以最新文档／源码为准。

```text
.runtime/accessibility-inspector/<session>/
  observation.json   原始观察不可变，刷新形成新版本而不是覆盖事实
  review.json        人工选择、别名、候选、说明及来源
  handoff.json       目标、业务需求、验证状态、未知项及下一步
```

实际可用多观察文件与索引，限制根目录、大小及覆盖行为；安装版使用已有用户数据／artifact 根目录，不写安装目录、不要求 checkout。运行产物不提交 Git。

导出不带配对 token、原生 ref、secret 或默认敏感 value。导入验证 schema、大小、来源和 hash；其自报 `validated: true` 不能成为本机已验收事实，应按需重新校验；导入内容不执行。

诚实提供两种交接：已配置 Agent 的真实调用，或保存文件并复制本地路径提示词，不能把后者包装成前者。Agent 先给可读业务步骤与输入来源，再用现有公开 API 生成普通 JS；运行时重新定位并验证实际结果。不强制应用类、calc.tapButton、Compiler 或专用 Replay Runtime。

当前 UI 树只能记为录制后的观察，不能补成过去事件时的 AX／UIA 事实。新增 Windows Recorder 源码不自动代表真机验收。按最新 AGENTS.md 区分任务：仅行为保持的静态精炼复用 recorder-script-refiner；涉及业务意图、参数化、真实操作或 Oracle／资格验证复用 human-to-recipe。不重写 H1—H8 或另一条 Agent-first 专业正文。

## 8. 第三方工具如何配合

| 工具 | 使用时机 | 配合方式 |
| --- | --- | --- |
| macOS Accessibility Inspector | 开发者已有 Xcode，需对照系统属性 | 记录应用、系统／工具版本、时间、属性及复现步骤，不列入普通安装前提 [E1] |
| Windows Accessibility Insights | 需查看 UIA 树、属性和 patterns 或对照 native 支持 | 人工对照、附导出／截图，再由 OpenDesk 重新校验 [E2] |
| Windows Inspect.exe | 维护者已有 Windows SDK，排查旧工具差异 | 仅备用；微软标为 legacy 并推荐 Accessibility Insights [E3] |

外部属性是证据，不是 OpenDesk ref；同名字段、树层级和 native role 不能直接等同于规范化字段。第一批不实现全部第三方导入器，不驱动外部 Inspector 作为取数桥梁，也不把它们打包进 OpenDesk。

外部工具能看到而 OpenDesk 看不到时，对照同目标／权限／时刻／视图，定位 backend 或映射缺口；两者都看不到时检查应用暴露、权限或视觉策略，不反复要求用户安装工具。

## 9. 实施、归属与验收

### 第一批：可运行的只读 Web 闭环

可信启用／配对 → 选窗口 → HTTP 真实读取 AX／UIA 树 → 树／属性／结构示意 → 编辑并重新校验 → 保存人工修订／交接 → 在获授权隔离任务中生成并验证普通 JS。

不能只交静态假树、JSON 上传页或另一份方案。离线导入只是辅助，不能替代 HTTP 取数。无模型环境可先交接文件，Agent 实际生成和回放须标未运行。

### 第二批：按需增强

实屏高亮、点拾取、局部刷新／差异、单独授权的动作测试、原生外壳。动作测试需另行设计一次性授权、执行互斥、actionState 与失败停止，不悄悄加入只读版本。视觉补充须有明示原因、授权与对象验证，不吞掉错误后静默点击。

### 文件归属

| 位置 | 职责 |
| --- | --- |
| 本文 | 唯一方案、取舍、范围与验收，实施后更新状态 |
| prompts/runtime/accessibility-workbench-goal.md | 本地执行目标，不复制全部方案 |
| apps/inspector_web/ | 纯 HTML/CSS/JavaScript 源码入口；无 backend、授权或原生取数逻辑，由当前 checkout 或 bundle 资源提供 |
| pkg/http/ 下同主题 handler／controller | 当前 Framework listener 上的页面允许清单、同源控制／数据、local-only／trusted-LAN 策略、配对与生命周期 |
| cmd/opendesk/ | 普通服务组合根；解析源码或 bundle 前端资源，生成仅传 helper argv 的内部控制 token |
| cmd/opendesk-status/ | macOS Developer 菜单、打开本机入口、进程内 LAN 开关与 LAN URL 复制 |
| automation/ 与现有 execution 集成 | 最小内部只读／scope 策略和 owner 适配，非第二套后端 |
| docs/api/http-server.md | 实现后的正式 HTTP 合同及必要类型／索引 |
| docs/integrations/desktop-agent.md | 实施时补集中式用户指南，区分安装版与开发命令 |
| tests/ 对应领域 | 前端／HTTP／集成测试；Runtime 公共行为仍用 tests/runtime-api/*.js |
| .runtime/ | 观察、修订、日志、截图、候选、交接与运行证据 |

本次网页会话只落库方案、Goal 和导航，不上传上一轮 ZIP、替身结果或运行产物，不把旧资格转给新 Web 功能。方案与 Goal 自包含，本地 Codex 不需要再下载旧附件。

### 95 分门槛

| 维度 | 分值 | 证据 |
| --- | ---: | --- |
| 安装与日常使用 | 15 | 发布产物＋浏览器，无 Xcode／SDK／前端服务前置 |
| 原生数据与目标正确性 | 20 | 真树、归属、partial／stale、预算及坐标 |
| 人工修订与定位闭环 | 20 | 修改、重新验证、保存／导入和下游消费 |
| 安全与权限 | 25 | 配对、来源、凭据、只读、跨会话、XSS、越 scope 及旁路泄露测试 |
| 生命周期与跨平台 | 10 | 超时、取消、关闭、迟到响应；平台分别报告 |
| 文档、代码与验证交付 | 10 | 精确用户命令、源码来源、索引及可重复验证 |

目标 **95/100 及以上**，必须由实施证据支撑。未授权采集、执行浏览器源码、XSS、跨 execution 复用 ref、篡改事实、假树冒充实测、重复不确定动作、未测平台宣称通过，任一项均硬性不通过，不能靠其他分值抵消。

### 2026-09-10 第一批验收结果

当前构建基于 `8e9ff9e486398734008cfba74e07e4ef7277c054` 和本页所述未提交工作树；维护者构建时同步刷新
`dist/opendesk`、App bundle 主程序及 `opendesk-ui-host`。运行证据都在 `.runtime/`，不属于版本控制资产。

| 维度 | 得分 | 已通过证据 | 未运行／限制 |
| --- | ---: | --- | --- |
| 安装与日常使用 | 14/15 | 独立静态目录和当前 OpenDesk 普通服务的按需控制闭环通过；旧专用 CLI／内嵌页面证据已撤销，不再作为现行入口 | 本地 App 为 `SKIP_CODESIGN=1` 开发包；未验证 PATH 安装器 |
| 原生数据与目标正确性 | 20/20 | 公开只读示例从仓库根目录返回 `macos-ax`、23 nodes、complete=true；真实专用 HTTP 链对精确 repo fixture 返回同一 backend/节点数，包含 execution/request/source hash；前端 geometry 测试覆盖负坐标、窗口外、无 bounds 与多显示器原点 | Windows UIA live 未运行，不借用 macOS 资格 |
| 人工修订与定位闭环 | 18/20 | 真实 HTTP 流完成观察、选 `fixture.invoke`、UNIQUE/`performedAction=false`、恶意文本保存、导出、伪造导入降为 NOT_VALIDATED、恢复本机 receipt；当前 Agent 消费 handoff 后用普通 CLI JS 只执行一次 fixture invoke，独立状态由 0→1 且 `invoke-button` | Browser Skill 没有发现可控浏览器实例，因此没有可审阅的当前页面截图，也没有自动点击 UI 控件的实窗记录 |
| 安全与权限 | 25/25 | owner 强制 read-only/value-denied/exact-window；专用 API listener 不含页面、静态资源或通用 execution/scheduler/vision；Go/HTTP/JS 测试覆盖 loopback、独立前端精确 Origin/CORS、Host、null/preflight/forwarded、配对重放、TTL、撤销、跨 session、XSS、敏感导出、导入资格和普通 HTTP 旁路 | 无 |
| 生命周期与跨平台 | 8/10 | session/global concurrency、取消、关闭、迟到提交、TTL、8 MiB 响应和 64 KiB 请求均有测试；正式 Runtime accessibility mode 的 API/menu/lifecycle/cleanup 全通过且五项 Accessibility resource 为零；Windows fixture amd64 cross-build 和 Windows atomic replacement helper 编译通过 | 完整 Windows 主程序在本机 `CGO_ENABLED=0` 因 robotgo 必需类型缺失而 cross-build 失败；本机无 MinGW/Windows cgo toolchain；未运行 Windows UIA，未启 VM/Wine |
| 文档、代码与验证交付 | 10/10 | 正式 HTTP Reference、集中用户指南、方案状态、文档索引、Go test 分类和可重复 JS live controller 已同步；命令、artifact 根、API 前缀与源码一致 | 无 |
| **合计** | **95/100** | 安全与事实硬门槛全部通过；macOS 上不是假树或 mock 闭环 | 视觉截图与 Windows 资格继续单列，不解释为通过 |

关键证据：

- `.runtime/tests/accessibility-workbench/http-live-closure.json`：真实 HTTP→internal execution→macOS AX→review/handoff；
- `.runtime/accessibility-inspector/session-cKsipserBEWnsrGd/handoff.json`：无凭据/ref/value 的实际交接实例；
- `.runtime/tests/accessibility-workbench/agent-generated-run-final/`：Agent 普通 JS 一次动作与后置验证；
- `.runtime/tests/runtime-api/direct-20260910-190408-570000/`：正式 Accessibility Runtime catalog 和资源清理；
- `.runtime/tests/accessibility-workbench/build/`、`.runtime/tests/accessibility-workbench/windows/`：构建 provenance、失败边界和 cross-build 产物。

最小矩阵：无 Inspector／无模型可看树；缺权限／后端／未启用；同名窗口／控件；空／partial／超大文本；平移／关闭重建／切换迟到响应；缺 bounds／负坐标／多显示器；校验无点击；错／过期／跨 session 凭据；恶意 Origin／Host／null Origin／预检／正常缺 Origin 的 GET；文本 XSS／提示注入；修订重新校验；导出不带凭据／ref；导入不伪造资格；断连／TTL／关闭清理；仅安装版真实命令；一个隔离业务任务的 JS 生成及后置验证。

静态、mock、HTTP 集成、浏览器、Runtime、macOS AX、Windows UIA、安装包和业务闭环分别报告。无设备标未运行，交叉编译不是实机，不为评分安装 VM／Wine／镜像。可以先交可完成部分，但不能删掉安全门槛或平台资格缺口。

### 已撤销的 LAN／内嵌实验

2026-09-10 曾验证专用 CLI、内嵌页面和 LAN 原生 listener；当前简化方案已删除这些产品入口及相关代码，历史证据不构成现行
命令或能力。现行设计只有独立静态页面与按需 loopback API；静态服务器默认绑定 `0.0.0.0` 只让页面文件在可信局域网可达，
不恢复 LAN 原生 listener 或远程 Workbench 能力。

### 2026-09-10 UI／Accessibility 树正确性增量

本增量基于 HEAD `b69e396ce0b571f489e446d116ade314a40d161a` 和当时未提交工作树验证真实 HTTP controller，取得 `macos-ax` 的
23-node complete 树：root 为 `AXWindow/AXStandardWindow`，22 个直接 children 顺序与 fixture
一致；连续快照 23 个显示 node ID 和语义行稳定。fixture 的 invoke/disabled/checkbox/radio/secure-field 状态逐项匹配，23 个节点
都有 `focused` 与 macOS `nativeBounds`；因混合缩放坐标未证明，23 个逻辑 `bounds` 全为 `null`，没有伪造坐标。

| 验证层 | 本轮结果 | 证据边界 |
| --- | --- | --- |
| 独立静态页面与 API transport | 当前外部 loopback 跨进程测试通过 | 只证明传输和协议，不证明实窗树渲染 |
| API 返回真实树 | **通过**：窗口发现、23-node AX 树、字段语义、顺序、稳定刷新、maxNodes 截断、关闭／重开、旧 ID、stale、review 失效和 handoff 均通过 | 非浏览器 controller 仍不能证明 DOM 视觉 |
| 网页模型与安全呈现 | **自动化通过**：7/7 覆盖搜索、折叠状态、唯一语义恢复、stale、loading/error/empty/partial/truncated、几何、text-only 恶意文本和 `apps` → `pkg/http` 的单向装配边界 | 模型／静态源码不是实窗点击证据 |
| Browser Skill 实窗 | **未运行**：`getForUrl` 返回 `No browser is available`，唯一允许的 `browsers.list()` 重试返回 `[]` | 没有用其他浏览器控制工具替代；这是唯一剩余的 Workbench 资格 |

新增关键证据：

- `.runtime/tests/accessibility-workbench-ui-tree/README.md`：分层结果、当前构建 provenance 与唯一剩余项；
- `.runtime/tests/accessibility-workbench-ui-tree/http-live.log`：字段可用性、语义状态、稳定刷新、截断、handoff 和关闭／重开摘要；
- `.runtime/tests/accessibility-workbench-ui-tree/browser-skill.txt`：Browser Skill 无实例的原始资格结论；
- `.runtime/tests/runtime-api/direct-20260910-213443-069000/`：本轮最终构建的正式 Accessibility Runtime catalog 和 cleanup；
- `.runtime/tests/accessibility/accessibility-native-macos-20260910-213443/`：本轮最终构建的真实 AppKit native gate 八阶段与五项资源归零。

剩余的单个人机验收动作是：在 Browser Skill 出现可控实例后打开独立静态页面，完成配对并保存树展开／折叠、搜索、节点详情、
刷新选择恢复、目标关闭后的 stale、截断提示和 handoff 状态截图。单纯 HTTP 可达性不能替代树正确性或视觉验收。

### 2026-09-11 最终浏览器／AX 闭环与并行增量复核

本节是当前结论，保留上方 2026-09-10 记录作为历史基线。验证对象包含当时 HEAD 和未提交的受保护并行修改；为避免写入
顶层 `dist/` 或影响安装版 App，最终 macOS App/main/UI-host 配对由正式构建脚本输出到
`.runtime/tests/accessibility-workbench-ui-tree-browser/final-build/dist/`。可漂移的 HEAD、dirty 状态、精确哈希、mtime、Go build
metadata 和“源码不晚于构建物”检查只记录在同目录 `provenance.txt`，本文不硬编码临时提交号。

| 验证层 | 当前结果 | 证据与边界 |
| --- | --- | --- |
| 静态前端与模型 | **通过：18/18** | 覆盖 hostile text-only、折叠／全树搜索、唯一语义恢复、loading/error/empty/partial/truncated、目标身份、几何、visual session/generation/bounds/expiry 信任绑定、Selected/All 映射，以及刷新成功文案、有效 layout 隐藏空态和原图按比例适配 |
| HTTP／Inspector 内部层 | **通过** | `go test ./pkg/http ./pkg/inspector` 通过；认证、错 session、stale observation/generation、额外 path/clip、5 MiB PNG、8 MiB response、内存不落盘、身份/bounds 变化均有测试 |
| 真实 HTTP→macOS AX | **通过** | `.runtime/tests/accessibility-workbench-ui-tree-browser/51-http-live-final-bundle.log` 保留旧 bundle 的 Complete、maxNodes Truncated、materialized→real Partial(unmaterialized)→recover、target-close stale、旧 window ID 拒绝和 reopen；最终隔离 bundle 又由真实浏览器完成配对、精确 PID 窗口绑定、23-node AX、刷新和 review 主线 |
| 真实 Chromium UI | **通过（direct Playwright）** | 40–49 保存四步引导、真实树／详情、恢复、truncated/partial/stale/error/empty/loading；71/72/74 使用最终隔离 bundle 复核 exact-window visual、刷新清图＋唯一选择恢复、恶意文本纯文本与 UNIQUE review。均经目视，无异常拉宽、裁切覆盖、错位、隐藏空态重叠或大面积无意义留白 |
| 短期 visual capture | **macOS exact-window 通过** | 71 显示 `macos-coregraphics-window-id` exact-window 像素，720×388 整窗按比例显示、红框与选中 Invoke Once 对齐、其他窗口排除、`occlusionRisk=false`、foreground 未验证如实呈现；同号响应审计确认 `capturedAt` 到 `expiresAt` 恰为 30000 ms，72 证明新 observation 立即清图且 Logical Layout 仍有效。没有兼容 bounds 的节点不会伪造 overlay |
| review／validation／handoff | **通过** | 73 的最终导出为 `opendesk.inspector.handoff/v1`、UNIQUE、`performedAction=false`、`waiting-for-agent`／`not-run`；74 证明恶意 alias/note/usage 只作文本，fixture 动作计数保持零。42 保留此前完整 handoff，Agent 最终消费仍是 exactly-once verified；两份 handoff 与最终日志的凭据审计均为零 |
| Runtime／native cleanup | **通过** | `.runtime/tests/runtime-api/direct-20260911-015048-639000/` 为 3/3＋3/3＋3/3；`.runtime/tests/accessibility/accessibility-native-macos-20260911-015324/` 八阶段通过，末尾 `accessibilityNativeResources/Pending/Queued/Refs/Workers` 五项均为 0。前两次瞬态失败仍保留，不伪装成不存在 |
| Browser Skill | **未通过／未用于资格** | 上一轮 `getForUrl` 返回 no browser；本次入口增量又按 Skill 要求尝试并得到 `browsers.list() = []`，见下节。既有实窗资格来自更早的 direct Playwright MCP，不能把两者或不同源码版本混写 |
| Windows UIA live | **未运行** | 没有 Windows 设备，不把 cross-build、macOS 或 Chromium 结果转移为 Windows 真机资格 |

当前量表为 **97/100**：安装与日常使用 14/15、原生数据与目标正确性 20/20、人工修订与定位闭环 20/20、安全与权限
25/25、生命周期与跨平台 8/10、文档／代码／验证交付 10/10。缺分仍来自本地 `SKIP_CODESIGN=1` 开发包／未验证 PATH
安装器和 Windows UIA live；这些限制不削弱已取得的 macOS 原生闭环，也不能被表述为已通过。

### 2026-09-11 LAN 入口与 Origin 说明增量

本节记录固定 60844 同源方案之前的独立静态服务器中间态，只用于解释迁移原因，不是当前操作说明。该中间态暴露了
`/accessibility-workbench` 路径不一致和非同源页面到点击后才报告 Origin 错误的问题；后文“固定 60844 同源与 trusted-LAN
收敛”已删除独立静态服务器、preview-only 首屏和第二个 listener。

自动化验证为前端模型／静态边界 **19/19**、`go test -count=1 ./pkg/http ./pkg/inspector` 通过，以及当前源码隔离构建在独立端口
完成 external frontend、控制预检、配对、资源、旧静态入口、API route isolation、重复启动拒绝、撤销和 listener 回收。现场
`127.0.0.1:60844/status` 虽为 200，但控制端点为 404，说明该运行进程不能作为当前 Workbench 控制入口的验证对象。

Browser Skill 按当前 LAN URL 尝试后没有发现可控浏览器实例，故本次首屏改动**没有当前实窗截图或点击资格**；上节 direct
Playwright 视觉证据早于本次入口改动，不能转移为本次视觉通过。HTTP 200、meta redirect、DOM 源码和模型测试都不替代这项
待补验收。

### 2026-09-11 单 App 日常使用闭环

用户现场进一步确认 `/Applications/OpenDesk.app` 已启动却仍无法 Connect。进程与接口核对显示：占用默认 `60844` 的安装版
二进制构建于 2026-09-07，`/status` 返回 200，但 Workbench control preflight 返回 404；本轮从当前工作树重新生成并临时签名的
`dist/OpenDesk.app` 在隔离端口返回 204，并通过控制预检、external frontend URL、一次性配对、API 不托管页面、重复连接拒绝、
撤销及 listener 关闭全链。隔离端口只是验证当前 bundle 且不打断用户已运行旧 App 的手段，**不是**要求用户同时运行第二个
`./dist/opendesk` 进程。

该轮曾以独立静态服务器作为过渡方案；这一操作口径现已退役，不得继续启动 Python 静态服务或使用第二个端口。仍然有效的
结论只有：发现 `/status` 正常而 Inspector control 为 404 时，应退出旧 App、替换为当前 bundle 后再启动，不能用第二进程掩盖
版本不一致。当前入口和安全边界只以后文“当前 Runtime origin 同源与 trusted-LAN 收敛”为准。

当前 bundle 的正式构建、临时签名、主程序／UI host 配对和 App 图标 bundle 合同均通过；目标相关的
`TestResolveAccessibilityWorkbenchArtifactRoot` 也通过。扩大到整个 `go test ./cmd/opendesk` 时，现有并行 App Mode 改动中的
`TestValidateAppModeHelperConflictRunsBeforePrivateHelperDispatch` 仍失败；它验证私有 notification helper 与 `-app` 的冲突顺序，
不经过 Inspector control／Origin／listener 路径，本轮没有越界改写该并行功能，也不把扩大测试报告成全绿。

本次又按 Browser Skill 尝试当前 loopback 页面，但 `browsers.list()` 仍为 `[]`，因此没有为这次单 App 文案与首屏变化补出新的
实页点击或截图资格；此缺口继续单独保留，未用 curl、HTTP 合同测试或旧视觉证据冒充。

### 2026-09-11 同源与 trusted-LAN 收敛

本节取代上面的 2026-09-11 独立静态服务器／随机 listener 操作口径；旧段落仅保留为变更历史，不能作为当前命令或资格。
当前页面使用当前 Framework listener 的实际 loopback origin，launch 和 Inspector data 同源。macOS tray 增加 Developer
子菜单；LAN 开关只存在于主进程内存，status helper 通过 loopback-only internal endpoint 与启动时随机 argv token 控制。

验收必须分别报告：local-only 默认拒绝 LAN；显式启用后私网同源页面与认证 API 可用；关闭和新进程恢复默认；错误 Origin、
错误／非本机 Host、forwarded header 与公网 RemoteAddr 拒绝；pair 重放、Bearer/session、单客户端、TTL、只读路由隔离不退化；
bundle 含当前前端资源且 main、UI host、status helper 来源一致；Browser Skill 对本机和 LAN 真实页面分别给出视觉结论。HTTP 200、
curl、源码检查和旧截图都不能替代最后一项。

## 外部参考

核对日期：2026-09-10。资料用于工具定位和安全原则，不证明 OpenDesk 本功能已经实现。

- [E1 Apple Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector)：查询／测试无障碍信息及 Xcode 入口。
- [E2 Accessibility Insights Inspect](https://accessibilityinsights.io/docs/windows/getstarted/inspect/)：UIA 属性、控制模式和树检查。
- [E3 Microsoft Inspect](https://learn.microsoft.com/en-us/windows/win32/winauto/inspect-objects)：legacy 定位及替代推荐。
- [E4 OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)：来源、凭据、自定义请求头和纵深防御。
- [E5 Apple AXUIElementCreateApplication](https://developer.apple.com/documentation/applicationservices/1459374-axuielementcreateapplication)：按 PID 获取应用顶层 accessibility 对象。
