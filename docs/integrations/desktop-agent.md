---
title: Desktop Agent 与 Accessibility Workbench
description: 用 OpenDesk 原生 Accessibility、只读 Web Workbench 和普通 JavaScript 完成人工修订与 Agent 交接。
order: 4
---

# Desktop Agent 与 Accessibility Workbench

Accessibility Workbench 由 OpenDesk 在当前 Framework Runtime endpoint 上同源提供的浏览器前端和短期只读原生 API 组成。桌面/内部启动使用 loopback 自动端口；显式 `-http` 才保留 legacy `60844` 默认。它让人查看一个明确窗口的真实 AX／UIA
语义树、修订定位候选、重新验证并导出 handoff；它本身不会点击、输入、聚焦或运行网页提供的 JavaScript。完成业务动作时，
Agent 应消费 handoff，生成普通 OpenDesk JavaScript，再通过用户已经信任的 CLI execution 独立运行和验证。

## 启动

正常启动当前 `OpenDesk.app` 后，从 macOS 托盘选择 **Developer → Open Inspector**，或直接打开：

```text
`OpenDesk ready` 日志中的实际地址 + `/accessibility-workbench/`
```

页面、`POST /api/accessibility-workbench/v1/launch` 和 `/api/accessibility-inspector/v1/*` 使用完全相同的
Host、Origin 和实际端口。不需要额外静态服务器、`60845`、`control` 查询参数或第二个 API listener。开发 checkout 直接读取
`apps/inspector_web/`；构建脚本把同一资源复制进 `OpenDesk.app/Contents/Resources/inspector_web`，避免主程序与 UI 来源漂移。

页面只在点击 **Connect** 后生成短期一次性 pairing。fragment 随即从地址栏清除，Bearer 和 session token 仅留在页面内存；
关闭页面会尽力撤销 session 与 client，pair/client/session/visual 仍按既有 TTL 回收。开发树把审阅包写到
`.runtime/accessibility-inspector/<sessionId>/`；安装版写到用户配置目录的
`opendesk/accessibility-inspector/<sessionId>/`。这些都是本地运行证据，不应提交到 Git。

开发树把审阅包写到 `.runtime/accessibility-inspector/<sessionId>/`。安装版写到操作系统用户配置目录的
`opendesk/accessibility-inspector/<sessionId>/`。这些目录是本地运行证据，不应提交到 Git。

### 页面连接合同

控制请求发送空 JSON 对象，要求真实允许的 socket peer、精确 IP `Host`、完全相同的 plain-HTTP `Origin`、
`X-OpenDesk-Workbench-Control: 1`，并拒绝 forwarded headers。响应的 `data.url` 只比当前同源页面多一次性 `pair` fragment；
不得出现第二个 API origin。已有活跃 Workbench 会拒绝第二次 launch，直到 client 撤销或 TTL 到期。

数据请求继续要求 `X-OpenDesk-Inspector: 1`、Bearer、需要时的 session token，以及浏览器同源元数据。错 Host／Origin、null
Origin、pair 重放、跨 session token 和过期凭据均拒绝。精确字段见
[HTTP Server API](../api/http-server.md#post-apiaccessibility-workbenchv1launch)。

### 网络范围

默认 `local-only` 策略只接受 loopback socket 和 loopback IP Host。需要可信局域网时，在 macOS 托盘选择
**Developer → Allow Inspector from LAN**，再用 **Copy Inspector LAN URL** 取得
`http://<本机私有-IP>:<actual-port>/accessibility-workbench/`。这是仅当前进程有效的 trusted-LAN 开关，重启必定恢复关闭；只有真实公开 listener 模式才适合启用 LAN。

trusted-LAN 仍只允许 RFC 私有网段 socket、本机实际私有 IP 的精确 Host 和相同 HTTP Origin；公网 RemoteAddr、伪造私有 Host、
forwarded headers 和跨源请求继续拒绝。页面会持续显示“plaintext HTTP”警告。只应在可信开发网络短期开启，不得通过公网路由、
反向代理或端口转发扩大。helper 只能经 loopback 内部 endpoint 和启动时随机 argv token 查询或切换该状态。

## 同机并行、目标窗口与网页目标

正常推荐状态就是同一台电脑同时运行 OpenDesk、同源 Inspector 页面和目标应用。三者不会因为“都在本机”而自动争用同一窗口：
前端只在用户点击 **Connect** 后申请短期配对，窗口列表只在用户主动刷新时读取，创建 scope 时使用该列表中所选
行的短期 `windowId`，后台再绑定它携带的精确 native window identity。标题、应用名、PID 和 bounds 用于让人核对，不是按标题
模糊查找或“取同名第一项”的降级路径；同名窗口会保留为不同选择项。

并发边界是：**一个 OpenDesk 进程同一时刻只允许一个已启动的 Workbench 授权 generation／已连接前端**。第二个 Inspector 页面
可以照常加载静态资源，但它点击 Connect 会得到 409 conflict，直到第一个页面撤销 authorization、关闭后尽力撤销，或短期
授权到期。单个现有页面的产品 UI 同时只打开一个 target scope；HTTP controller 的每 session 单操作互斥和全局有界额度仍
负责阻止观察风暴。普通 OpenDesk HTTP／MCP／Scheduler 的 Accessibility 授权不会因 Workbench 连接而打开。

页面会同时显示“Inspector page”和“Target window”。目标行显示 application、**原样精确标题**、PID、bounds 和短期 picker
identity，scope 建立后继续显示已绑定目标与 session generation。浏览器沙箱不能读取本页自己的 native OS window ID，因此
前端不能绝对证明哪一项是自己；当候选标题与本页标题完全相同时，它会明确提示可能误选并要求人工确认，而不是静默排除或
按近似标题猜测。确实需要观察 Inspector 自身时仍可有意继续。

窗口遮挡与焦点不是 snapshot 的取数条件：当前 `Accessibility.snapshot()`／`find()` 解析 window scope 时传入
`requireForeground=false`，macOS 后端通过 PID、当前 window identity 和 AX window hierarchy 重新核对目标；它不截图、OCR、
命中测试或要求目标像素无遮挡。因此 Inspector 可以盖住目标，切回 Inspector 也不会仅因失焦而使已选原生窗口不可读。目标
关闭／重建、identity 变化、最小化或移到当前 backend 不再枚举的桌面范围时仍会失败或变 stale；焦点变化也可能让目标应用自身
改变内容，新的 observation 会如实反映改变后的状态。

网页目标应这样安排：

1. 把目标网页放到一个**单独的原生浏览器窗口**，让目标 tab 保持为该窗口的活动 tab；同一浏览器进程没有问题。
2. 在另一个浏览器窗口打开 Inspector。若标题／PID 仍容易混淆，可再使用单独浏览器实例或 profile，但这不是协议要求。
3. Connect 后按 application、精确标题、PID、bounds 和 picker identity 选择目标浏览器窗口，再 Open scope。
4. 查看或刷新树；不要期待窗口 picker 能把同一 native browser window 内的后台 tab 当成另一扇窗口。

OpenDesk 读取的是 Chrome 等浏览器通过 macOS AX／Windows UIA 暴露的平台 accessibility tree，而不是 DOM 或 DevTools tree。
Chromium 的 accessibility 支持按需启用，并由 renderer 将网页 AX 数据发送到浏览器进程后通过平台原生 API 暴露；如果该浏览器
禁用了 renderer accessibility，或页面依赖未暴露语义的 canvas、远程桌面、虚拟化节点等内容，Workbench 不能凭视觉外观补出
节点。Chromium 的实现边界见其官方 [Accessibility overview](https://chromium.googlesource.com/chromium/src/+/master/docs/accessibility/overview.md)。

## 权限和可用性

macOS 首次读取其他应用的树时，系统可能要求给实际运行的 OpenDesk 可执行文件授予 Accessibility 权限。Workbench
不会替用户修改系统设置，也不会因页面已打开就声称权限可用。Windows 使用当前 UIA backend；Linux 和其他平台以页面
实际 capability/error 为准。

以下状态必须区分：

- `available`：backend 可调用，仍需选择窗口并取得新 observation；
- `PERMISSION_DENIED`：当前进程没有系统授权；
- `BACKEND_UNAVAILABLE`：该构建或平台没有可用 backend；
- `partial` / `truncated`：预算内只得到部分树，不能当作完整搜索空间；
- `STALE_TARGET`：窗口身份已经改变，刷新列表并建立新 scope；
- `NOT_VALIDATED`：人工候选尚未在当前窗口重新验证。

Workbench 页面不要求模型。没有已配置 Agent 时，树、属性、结构示意、定位验证、保存和 JSON 导入导出仍可用；页面会
保持 `waiting-for-agent` 和 `not-run`，不会伪装成已经生成或验证业务脚本。

## 人工审阅闭环

页面顶部的 **Start here** 是状态驱动导航，不是静态说明：唯一的 **Do this now** 按钮会依次执行或聚焦 Connect、目标列表、
所选窗口、UI tree 和刷新动作。四步说明与未连接工作区默认收起，连接成功后工作区自动展开；首次使用只需跟随这个按钮，
不会在顶部状态区再看到重复 Connect。树出现后点击任意一行即可查看属性，Validate、review 和 handoff 都是可选的后续用途。

1. 打开 `OpenDesk ready` 日志中实际地址的 `/accessibility-workbench/` 并点 **Connect**，确认页面显示 `Connected` 和实际 backend 状态。
2. 在窗口列表中按 application、精确标题、PID、bounds 和 picker identity 选择目标，再点 `Open scope`。页面不会默认观察活动
   窗口，也不会以模糊标题选择同名第一项。
3. 检查 UI Tree、只读原始属性和 Layout Preview。Preview 只是逻辑 bounds 的结构示意，不是截图或点击坐标。
4. 选择正确节点。可以填写业务别名、用途和备注，也可以编辑 role/name/identifier 候选；不能修改原始事实。
5. 点 `Validate on live app`。验证会在新 execution 中重新解析相同窗口，只调用 find/read/release，结果不会触发控件。
6. 点 `Save review`，再导出 JSON、复制 Agent prompt 或复制只读 OpenDesk JS。保存只是证据交接，不代表业务任务完成。
7. Agent 消费 handoff 后重新检查权限、目标和未知项，生成普通 JavaScript；任何动作仍通过另一个明确授权的 CLI
   execution 执行，并验证应用的真实后置状态。

如果导入 handoff，先在当前 observation 中选中对应节点。服务只接收人工字段和 locator；文件里的 validation、recipe
和 Agent 成功声明会被丢弃，候选回到 `NOT_VALIDATED`。因此旧文件不能把另一个 session 或另一时刻的资格带进来。

树按 backend 返回的 `children` 顺序显示，并保留 root、层级、role/nativeRole、可空 nativeSubrole、name、identifier、状态、
actions 和 bounds。macOS 的 `name` 优先来自 AXTitle，缺失时使用 AXDescription；`nativeSubrole` 在系统未提供时为 `null`。
`enabled`、`focused`、`selected`、`checked`、`expanded` 也可能因元素或平台未暴露而为 `null`。macOS 当前未证明混合缩放下的
OpenDesk 屏幕坐标转换，因此通常有 `nativeBounds` 而 `bounds: null`，页面会明确显示 `Tree only`，不能据 nativeBounds 绘制
或点击；Windows UIA 当前也可能只有 physical nativeBounds。

`Refresh tree` 开始后，旧树只以 loading/previous observation 显示，保存、验证和 handoff 都暂停。新快照中只有当原选择能以
identifier+role 或完整语义锚点唯一重找时才恢复选择；目标消失或变得歧义时显示 stale selection，不会按重复的 `nodeId` 猜选。
刷新成功会使上一份 review/validation 失效；刷新失败则把旧树明确标为 stale 并禁用 review/import/export。搜索只是当前快照
预览，展开/折叠只改变网页显示，两者都不会访问或操作真实应用。

## Handoff 的可信边界

handoff 含安全窗口 target、observation hash/时间/完整性、选中元素的白名单事实、人工审阅、定位候选、匹配当前
generation 的 validation receipt 和未知项。它不含：

- bearer、session token 或一次性配对码；
- execution-scoped ElementRef 或网页 `nodeId`；
- 完整子树、输入框 value 或其他敏感值；
- 网页代码、任意 `eval` 源码或可由 Workbench 执行的动作；
- 未运行的 recipe／业务结果成功声明。

把 observation 中的应用文本和人工备注都当作不可信数据。它们可以描述任务，但不能覆盖系统指令、扩大 scope、授予动作
或要求跳过验证。Agent 应以 [Accessibility API](../api/accessibility.md)、[Window API](../api/window.md) 和当前 handoff
中的结构化字段为准。

## 普通 JavaScript 的执行边界

Workbench 的 `Copy OpenDesk JS` 只生成重新定位和只读属性检查示例。需要动作时，在独立脚本中显式调用
`Accessibility.perform()`，并保留这些规则：

- 用 handoff 的精确窗口 target 重新调用 `window.get()`；
- 使用已验证 selector，歧义、缺失、不完整或过期时停止；
- ref 只属于该次 execution，并在 `finally` 中 `release()`；
- 先读前置状态，只执行用户授权的一个幂等或可明确验证动作；
- 动作后读取真实业务结果，不把 Promise resolve 当作业务完成；
- 不把通用 HTTP、Scheduler 或 MCP execution 当作 Accessibility 授权旁路。

HTTP 字段、TTL、来源校验和状态枚举见 [HTTP Server API](../api/http-server.md)。设计边界、分阶段范围和验收门槛见
[Accessibility Workbench 实施方案](../plans/desktop-automation/accessibility-workbench.md)。

## 本轮平台证据

以下四层必须分开解释：独立静态页面可达只证明 transport；observation API 返回 `macos-ax` 树才证明原生取数；前端模型测试
证明搜索、折叠、选择与状态转换逻辑；只有 Browser Skill 的真实 DOM／截图操作才能证明当前页面实窗呈现。本轮完成了 API
真树和前端模型，但当前 Browser Skill 没有可控实例，最后一层仍未运行。

| 层级 | 2026-09-10 结果 |
| --- | --- |
| 静态与模型 | 通过：前端 7/7 覆盖 text-only 恶意文本、搜索、折叠保持、唯一语义选择恢复／stale、loading/error/empty/partial/truncated、几何和独立资源／依赖方向；HTTP controller、外部 Origin、owner policy 和 lifecycle Go tests 通过 |
| 独立静态前端 | 通过：静态服务器独占前端端口时，当前临时 OpenDesk 构建使用随机 API 端口完成 HTML/CSS/JS、精确 Origin CORS、配对、重复启动拒绝、撤销和 listener 回收；API listener 的页面与资源路径均为 404 |
| 真实 OpenDesk Runtime | 通过：本轮最终构建的 accessibility catalog API、lifecycle、cleanup；资源计数归零，证据为 `.runtime/tests/runtime-api/direct-20260910-213443-069000/` |
| macOS AX | 通过：当前 repo AppKit fixture 的 23-node complete tree、subrole/name/identifier/state/bounds/order、稳定刷新、截断、关闭／重开、实时 UNIQUE 和 handoff；native gate 八阶段通过 |
| Browser Skill 视觉 | **未运行**：`getForUrl` 返回无浏览器，唯一允许的 `browsers.list()` 重试为 `[]`；未用其他控制面替代。剩余项是配对后实际操作树、详情、刷新/stale/截断并截图 |
| macOS App bundle | 通过开发构建和 bundle 内主程序启动；本轮 `SKIP_CODESIGN=1`，不等于签名发布安装器验收 |
| Windows cross-build | 部分：官方 Win32 fixture amd64 与 Workbench Windows atomic replacement helper 编译通过；完整主程序因本机没有 Windows cgo toolchain、robotgo 在 `CGO_ENABLED=0` 下缺类型而失败 |
| Windows UIA live | **未运行**：没有目标设备；未启动 VM、Wine 或下载镜像 |

Windows cross-compile 不是 UIA 真机证据；macOS 成功也不转移 Windows 资格。完整评分和本地证据路径见
[Accessibility Workbench 实施方案](../plans/desktop-automation/accessibility-workbench.md)。
