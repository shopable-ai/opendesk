# Clawdesk MCP macOS 独立验证与修复 GOAL

## 使用方式

将本文件作为 Recorder、Calculator 或其他 Agent 桌面自动化测试之前的独立前置任务执行。

本任务只负责回答并证明一件事：

> 当前 Clawdesk MCP 是否真的能够被 MCP Host 正确启动、完成协议握手、列出工具、调用工具，并在当前 macOS 主机上完成受控桌面观察与低风险真实动作？

如果不能，必须在本轮定位并修复 MCP 自身问题，直到达到本文件定义的 Gate；不要提前进入 Recorder 开发或复杂 Agent 场景。

---

# Clawdesk MCP：从协议、stdio、工具契约到 macOS 真机动作的独立验证与修复任务

请直接在当前本地仓库执行：

```text
https://github.com/shopable-ai/clawdesk
```

默认分支：

```text
master
```

## 一、第一步：重新建立事实基线

不要相信本提示词生成时的任何历史 SHA。

执行开始后必须先运行并记录：

```bash
pwd
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin master
git rev-parse origin/master
git log -5 --oneline
```

要求：

1. 检查本地与远端 HEAD；
2. 检查未提交、未跟踪和并行修改；
3. 阅读根目录 `AGENTS.md`；
4. 不覆盖用户或其他 Agent 的并行修改；
5. 禁止使用 `git reset --hard`、`git clean -fd`、强制覆盖或重写历史。

然后阅读当前 MCP 正式材料：

```text
docs/integrations/mcp/README.md
docs/integrations/mcp/testing/test-matrix.md
docs/integrations/mcp/testing/manual-smoke-macos.md
docs/integrations/mcp/testing/delivery-checklist.md
docs/integrations/mcp/operations/
docs/quality/mcp/
docs/quality/gates-and-evidence.md
docs/quality/failure-taxonomy.md
docs/implementation/macos/automation-config.md
```

并审计真实实现：

```text
cmd/clawdesk-mcp/
pkg/mcpserver/
pkg/container/
automation/
scripts/
tests/
```

## 二、本轮唯一 Goal

本轮必须建立一个当前、可重复、有 Evidence 的 MCP 可用性基线：

```text
build
→ stdio process launch
→ MCP initialize
→ notifications/initialized
→ ping
→ tools/list
→ tools/call
→ read-only desktop tools
→ screenshot
→ preview-only target action
→ 一个低风险真实动作
→ 结果验证
→ repeated run
```

只有这条链路通过，后续 Recorder 才允许把 MCP 当作可信 Agent 执行入口。

本轮不开发 Recorder，不测试微信，不执行消息发送、删除、支付、购买或不可逆文件操作。

## 三、验证层级

必须明确区分五层，不得用低层通过冒充高层通过。

```text
M0 Build
M1 MCP Protocol / stdio
M2 Tool Registry / Contract
M3 macOS Read-only Runtime
M4 macOS Low-risk Action
```

最终报告必须逐层给出 PASS / FAIL / BLOCKED。

## 四、M0：Build 与进程基线

### 4.1 构建

执行：

```bash
go test ./pkg/mcpserver ./cmd/clawdesk-mcp
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

如果 `go test ./cmd/clawdesk-mcp` 没有测试文件，不视为错误；但 `pkg/mcpserver` 必须有实际测试结果。

同时执行受影响范围的必要测试；如果修复了 `automation/` primitive，要补跑相应 automation tests。

### 4.2 Binary 证据

记录：

```bash
ls -lh dist/clawdesk-mcp
file dist/clawdesk-mcp
shasum -a 256 dist/clawdesk-mcp
```

确认：

- binary 存在；
- 架构与当前 macOS 主机兼容；
- 能正常启动；
- 不在 stdout 输出非 MCP 协议垃圾日志。

关键原则：

> MCP stdio server 的 stdout 是协议通道。调试日志必须进入 stderr 或独立日志文件，不能污染 JSON-RPC stdout。

如果发现初始化、robotgo、container 或其他包向 stdout 打印启动日志，必须修复或隔离，否则视为 MCP transport blocker。

## 五、M1：MCP Protocol / stdio 独立测试

不要首先依赖 Codex、Hermes 或其他 Host 判断 MCP 是否正常。

先建立一个仓库内的最小 stdio protocol smoke client，优先放在：

```text
tests/mcp/tools/stdio-smoke/
```

或使用当前仓库已有等价工具。

该客户端必须真实启动：

```text
dist/clawdesk-mcp
```

通过 stdin/stdout 发送 JSON-RPC，不得直接调用 `Server.Handle()` 代替真实 stdio transport。

至少验证：

### P1 initialize

发送 `initialize`，验证：

```text
jsonrpc = 2.0
protocolVersion 有值且与 server 当前声明一致
serverInfo.name = clawdesk-mcp
capabilities.tools 存在
request id 正确回传
```

### P2 initialized notification

发送：

```text
notifications/initialized
```

确保 server 不异常退出。

### P3 ping

调用 `ping`，确保 stdio 往返正常。

### P4 tools/list

验证：

- 返回 tools 数组；
- 工具名称唯一；
- inputSchema 是合法对象；
- required 字段与实际 runtime 参数一致；
- 至少存在当前正式基础工具。

### P5 invalid protocol cases

至少测试：

```text
无效 JSON
错误 jsonrpc version
不存在 method
不存在 tool
缺少必需参数
```

必须返回结构化 JSON-RPC error，而不是 panic、hang 或 stdout 杂讯。

### P6 lifecycle

至少连续启动/退出 MCP server 3 次。

验证：

```text
3/3 正常 initialize
3/3 正常退出
无僵尸进程
无随机 hang
```

## 六、M2：Tool Registry 与 Contract

结合当前 `builtinTools()` 和 `Runtime` 接口建立实际工具清单，不要从旧文档猜。

至少验证当前存在的基础工具，例如按实际代码为准：

```text
tm_status
tm_permissions
tm_list_windows
tm_get_active_window
tm_focus_window
tm_wait_for_window
tm_inspect_desktop
tm_list_displays
tm_screenshot
tm_ocr
tm_detect_ui
tm_find_target
tm_act_on_target
tm_click
tm_type
tm_press_key
tm_scroll
```

如果当前工具名称不同，以执行时 `tools/list` 为事实源。

必须检查：

1. tools/list 与 server 可调用工具一致；
2. schema 与 runtime 参数一致；
3. 缺参数返回结构化错误；
4. `previewOnly` / `dryRun` 不得执行真实动作；
5. stale / ambiguous / expected-window guard 在应阻断时真的阻断；
6. external provider 缺失时返回 structured blocker，而不是把 provider 缺失误报成 MCP 故障。

注意区分：

```text
MCP transport 正常 + OCR provider 缺失
!= MCP 不可用
```

必须将 provider blocker 独立分类。

## 七、M3：当前 macOS 主机 Read-only Runtime Smoke

### 7.1 记录环境

所有运行证据写入：

```text
.runtime/tests/mcp/<run-id>/
```

记录：

```bash
sw_vers
uname -m
go version
locale
system_profiler SPDisplaysDataType
```

并记录：

```text
当前 HEAD
binary SHA256
MCP client / host
binary absolute path
macOS 权限主体
Screen Recording 状态
Accessibility 状态
Automation 状态（若本轮使用）
OCR provider 状态
```

### 7.2 权限

优先按照：

```text
docs/implementation/macos/automation-config.md
```

判断实际权限主体。

如果 MCP 是被本地 Codex 从 shell 启动，必须明确记录 TCC 权限可能绑定在 Codex / Terminal / shell host，而不一定是 `Clawdesk.app`。

这类结果只能声明：

```text
shell-hosted MCP development path passed
```

不能扩写为：

```text
Clawdesk.app product identity fully validated
```

### 7.3 Read-only smoke 顺序

严格按顺序调用：

```text
1. tm_status
2. tm_permissions
3. tm_list_displays
4. tm_list_windows
5. tm_get_active_window
6. tm_screenshot
7. tm_inspect_desktop
```

每一步都必须检查真实副作用和工件，不只是 tool 返回 `ok=true`。

#### tm_status

验证 runtime/container 实际工作。

#### tm_permissions

确认权限结果可解释，不 panic。

#### tm_list_displays

确认至少一个合理 display，尺寸和 scale 与系统一致。

#### tm_list_windows

确认能返回真实当前窗口，不是固定 mock。

#### tm_get_active_window

与肉眼/系统当前前台窗口交叉验证。

#### tm_screenshot

截图必须写入：

```text
.runtime/tests/mcp/<run-id>/screenshots/
```

验证：

- 文件存在；
- size > 0；
- 可以被解码；
- 宽高合理；
- 不是全黑、全透明或明显错误画面；
- 对应当前桌面/目标窗口。

#### tm_inspect_desktop

验证组合返回中的：

```text
status
permissions
activeWindow
displays
screenshot（若请求）
```

彼此没有明显矛盾。

## 八、Target / Perception 能力独立验证

只有 M3 基础 read-only 工具通过后才进入。

选择一个极低风险、目标明确的界面。优先：

```text
本地 Recorder HTML Benchmark
或 macOS Calculator
```

先测试：

```text
tm_find_target
```

分别按当前实现支持情况验证：

```text
layout
ocr
detect_ui
hybrid
```

要求记录各 strategy：

```text
是否实际可用
是否需要 external provider
candidate 数量
bestCandidate
ambiguity
freshness
耗时
失败分类
```

不要要求所有 strategy 都必须成功才能判定 MCP transport 可用。

应该得出类似矩阵：

```text
transport: PASS
window/screenshot: PASS
layout: PASS
ocr: BLOCKED(provider_missing)
detect_ui: PASS/FAIL
hybrid: BLOCKED because OCR provider missing
```

这样才能区分框架问题和外部依赖问题。

## 九、Preview-only Action Gate

真实点击之前必须先测试：

```text
tm_act_on_target previewOnly=true
```

选择 fresh candidate，并至少提供：

```text
expectedWindowTitle
expectedTargetText（适用时）
```

验收：

```text
ok=true
executed=false
previewOnly=true
```

同时人工/截图检查：

```text
target identity
candidate freshness
click point
window identity
```

必须测试一个故意错误的 expectedWindowTitle 或 stale candidate，确认 guard 真正阻断。

如果 guard 没有阻断错误目标，不得进入真实动作测试。

## 十、M4：低风险真实动作

只有 M0-M3 和 preview gate 通过后才执行。

首选 macOS Calculator。

### 10.1 启动 Calculator

允许使用：

```bash
open -a Calculator
```

启动应用。

但后续观察、focus 和真实动作必须由 MCP 工具完成。

### 10.2 第一真实动作不要直接做完整计算

先做最小动作：

```text
获取 Calculator window
→ focus window
→ fresh screenshot / target
→ preview
→ 点击一个数字按钮（例如 7）
→ 再次观察 Calculator display
→ 验证显示发生预期变化
```

必须满足：

```text
动作前状态可知
动作目标可解释
动作确实执行
动作后状态可验证
```

如果 `tm_click` 使用裸坐标，也只能作为 primitive smoke；同时记录它不证明强健 locator 已完成。

### 10.3 第二动作链

第一真实 click 通过后，再测试：

```text
clear
→ 1
→ +
→ 2
→ =
```

验证 Calculator 显示为 3。

暂时不要在 MCP 独立验证任务中测试 Recorder，也不要生成 Flow IR。

本轮目标只是证明 MCP Agent action channel 本身成立。

### 10.4 Type / key / scroll

分别找低风险目标验证：

```text
tm_press_key
```

可在 Calculator 或测试输入框验证。

`tm_type` 优先在本地 HTML Benchmark 或 TextEdit 临时空白文档验证，不输入敏感内容。

`tm_scroll` 优先在 HTML Benchmark 的固定滚动区域验证，不使用真实用户数据页面。

每个动作均要求 before / after evidence。

## 十一、Host 集成验证

在独立 stdio client 通过后，再测试真正的本地 Codex MCP Host 集成。

目标：

```text
Codex 能启动 dist/clawdesk-mcp
→ 完成 initialize
→ 发现 tools
→ 调用 tm_status
→ 调用 tm_list_windows
→ 调用 tm_screenshot
→ 执行一个 Calculator 低风险 click
```

如果 stdio client PASS 而 Codex Host FAIL，则优先定位：

```text
Host 配置
binary absolute path
environment variables
working directory
stdio buffering
startup timeout
permission subject
Host 对 protocol version / schema 的兼容性
```

不要在这种情况下错误修改 Automation Runtime 来“修复” Host 配置问题。

如果 Codex Host 当前没有自动读取仓库 MCP 配置的方式，则给出当前版本可执行的本地配置方法，并保留配置证据；不要伪造“已连接”。

## 十二、失败分类

至少按以下层次标记：

```text
MCP-PROCESS       binary 启动/退出
MCP-STDIO         stdin/stdout framing 或污染
MCP-PROTOCOL      initialize / JSON-RPC
MCP-REGISTRY      tools/list/schema
MCP-DISPATCH      tools/call 路由
MCP-RUNTIME       runtime adapter
MCP-PERMISSION    macOS TCC
MCP-OBSERVATION   window/screenshot/display
MCP-PERCEPTION    OCR/detect/layout/candidate
MCP-ACTION        click/type/key/scroll
MCP-GUARD         stale/ambiguity/window guard
MCP-HOST          Codex/Hermes host integration
MCP-PROVIDER      external OCR/vision provider
```

同时映射到项目现有 F0-F10 Failure Taxonomy。

例如：

```text
permission → F0
screenshot acquisition → F1
candidate detection → F2/F4
click runtime → F5
postcondition → F6
guard/recovery → F8/F9
stdio/process/transport → F10
```

## 十三、需要修复时的原则

发现 MCP 问题后允许直接修复，但遵守：

1. 先保存失败 Evidence；
2. 定位到最低失败层；
3. 做最小修复；
4. 补对应自动化 regression test；
5. 重新从失败层向上测试；
6. 修复 transport 时不要顺便大改 Vision；
7. 修复一个 tool 时不要无理由重构整个 MCP server；
8. 不恢复退役接口；
9. 文档必须跟当前源码事实同步。

特别检查 stdout 污染、并发、hang、panic、参数类型断言等 MCP server 常见故障。

## 十四、重复性与稳定性 Gate

基础 MCP 链路不是成功一次即可。

至少执行：

```text
stdio initialize/list/status：10 次
read-only desktop smoke：5 次
Calculator 单 click：5 次
Codex Host reconnect：3 次
```

目标：

```text
initialize/list/status = 10/10
read-only smoke = 5/5
Calculator low-risk click = 5/5
Host reconnect = 3/3
错误目标点击 = 0
协议 stdout 污染 = 0
panic = 0
无限 hang = 0
```

如果达不到，记录真实成功率和 failure，不得宣布 MCP stable。

## 十五、Evidence

原始运行产物统一写入：

```text
.runtime/tests/mcp/<run-id>/
```

建议包括：

```text
preflight.json
build.log
unit-tests.log
binary.sha256
stdio-smoke.ndjson
tools-list.json
contract-results.json
permissions.json
windows.json
displays.json
screenshots/
perception/
preview/
actions/
host-integration/
failures.ndjson
summary.json
```

长期有价值的最终质量结论才写入：

```text
docs/quality/mcp/<date>-mcp-validation.md
```

不要把 `.runtime/` 提交到 Git。

## 十六、MCP Ready Gate

只有同时满足以下条件，才能把 MCP 标记为 Recorder 的可信前置入口：

```text
M0 Build PASS
M1 stdio + protocol PASS
M2 tool registry + contract PASS
M3 macOS read-only runtime PASS
preview-only guard PASS
至少一个 Calculator MCP 真实 click + postcondition PASS
Codex Host 能真实调用 MCP tools
重复性测试达到当前门槛
错误目标点击 = 0
无 stdout 协议污染
无 panic / 无限 hang
关键失败有 Evidence
```

允许 OCR / Vision provider 为 BLOCKED，但必须满足：

```text
blocker 被准确隔离
不影响基础 MCP transport/read-only/action 结论
不把 provider blocker 伪装成 MCP PASS
```

如果 MCP Ready Gate 未通过：

```text
停止 Recorder 的 MCP Calculator 测试
继续修 MCP
```

不要用 HTTP 或直接 Go 调用绕过 MCP 后声称 Recorder 的 MCP 路径已证明。

## 十七、与 Recorder 的正式依赖关系

本任务结束后，给出明确 verdict：

```text
MCP_READY_FOR_RECORDER=true|false
```

只有 `true` 时，后续才执行：

```text
prompts/automation/agent-first-recorder-macos-mvp-goal.md
```

如果为 `false`，报告具体 blocker、失败层、修复状态和下一动作。

## 十八、提交要求

如果修改源码或稳定测试资产：

```bash
git status --short
git diff --check
go test ./pkg/mcpserver ./cmd/clawdesk-mcp
```

并执行本任务新增的 stdio smoke 和真机 smoke。

建议按小提交：

```text
1. MCP protocol/stdio regression
2. runtime adapter fixes
3. macOS smoke tooling
4. docs / evidence claim calibration
```

不得提交：

```text
.runtime/
个人路径配置
TCC 数据库
截图运行结果
密钥/token
临时 Host 配置
```

## 十九、最终报告

最终必须报告：

```text
执行前 HEAD
执行后 HEAD
本机 macOS / arch / Go
MCP binary path / SHA256
M0-M4 verdict
stdio smoke 次数和结果
initialize / tools/list / tools/call 结果
实际 tool 清单
权限结果
window/display/screenshot 结果
perception strategy 状态
preview guard 测试
Calculator 真实动作结果
Codex Host 集成结果
重复性结果
修复的代码问题
新增 regression tests
Evidence 路径
F0-F10 failure 映射
未解决 blocker
MCP_READY_FOR_RECORDER=true|false
```

最终 Claim 必须有界。

允许：

```text
Clawdesk MCP stdio/protocol passed on this macOS host.
Clawdesk MCP read-only desktop tools passed on this environment.
Clawdesk MCP low-risk Calculator action passed under current permission identity.
```

禁止在没有匹配 Evidence 时声称：

```text
MCP 所有功能完全正确
所有 macOS 应用都支持
所有 OCR/Vision provider 可用
production-ready
Recorder MCP 路径已完成
```

现在直接开始执行，不要只返回一份新计划。