# Mac96 网页 MCP 自动启动与计算器验收（2026-11-18）

本轮实测完成 ChatGPT 网页 → OpenDesk Desktop Mac96 插件 → 官方 Secure MCP Tunnel →
本机 OpenDesk MCP 的计算器流程。开始时计算器未运行；由网页模型自行启动、等待窗口、聚焦、观察并点击。
无需用户预先打开或置顶计算器。最终原生窗口截图实际显示上方 `1+2`、结果 `3`。

## 修复与来源

- 原桌面工具集合只有 40 个工具，缺少应用启动入口；`tm_focus_window` 只能聚焦已有窗口。
- 新增 `tm_open_app({appName: "计算器"})`，复用现有 `page.openApp` 启动器。
  参数不接受 Shell、命令行参数或环境变量；不隐式发送输入、不自动重试、不把启动回执当作窗口就绪证明。
- 网页插件设置执行“刷新工具”后，重新载入插件详情核对到 Write 23、Read 18，共 41 个工具，包含启动工具。
- 上次 Terminal 宿主的辅助功能权限失败，不代表整个 MCP 未连接。本轮从 Codex 启动的实际进程核对到
  accessibility、screenCapture、inputMonitoring 均为 true。任意 Terminal 重启后的 TCC 身份未在本轮证明。
- 工作区：`master`，HEAD `975f7f111c6ffe6b18002c08574b762eb1aa06c1`，存在其他任务的未提交修改。
  本轮未创建分支、提交或推送，未改共享 Native 安装或系统权限记录。

本轮代码修改为 `pkg/mcpserver/runtime.go` 的启动适配、`pkg/mcpserver/server.go` 的启动工具接线、
新增 `pkg/mcpserver/app_open_test.go`；同步 MCP README 和 Go 测试增量分类。
`server.go` 原有的截图 image content / 帧限制修改是本轮开始前已存在的工作区内容。

## 构建、加载、视觉与功能

| 层面 | 本轮证据 |
|---|---|
| 代码已修改 | 启动参数校验、一次转发、失败不重试、只读模式禁用的定向测试 |
| 构建已完成 | `go build ... ./cmd/opendesk-mcp`；darwin/amd64；二进制 SHA256 `ec66cc1974dfb41ac535f2fb572e9437fcb53c1b1136fe599abf339fd2b940e3` |
| 实际已加载 | tunnel-client PID 96094 的子进程 PID 96095，路径为本轮运行目录中的 `bin/opendesk-mcp`；网页已发现 41 个工具 |
| 视觉已确认 | 直接检查保存的 460×816 PNG，显示 `1+2` 和 `3`，按钮与显示区未裁切 |
| 功能已验证 | 网页自主启动计算器，新 PID 97887，依次实际执行 AC、1、+、2、=，每步观察截图 |

PID 是本轮观察记录，后续运行必须重新发现。

网页结果对话：<https://chatgpt.com/c/6afd40fe-d3a8-83ee-8dab-4d57d880d70c>。
网页报告实际执行五次点击；另外两次请求因前台变为 ChatGPT 而被窗口保护明确拒绝，`executed:false`，
模型重新聚焦并核对后继续，没有重放已执行的前缀。工具标题列表保留了这些额外的保护拒绝尝试，
因此不能把本轮表述为“总计只发出五个 tm_click 请求”。
网页 UI 可见记录与结果报告已保存；本轮未导出网页不可见的原始完整工具回执。

最终通过 `tm_screenshot` 获取 `target: "activeWindow"`、`returnType: "base64"` 的图像，
随后单独调用本地 OCR 读取同一保存图片。网页直接看图报告结果 `3`；OCR 也读到 `3`，置信度约 96.8%，
但把上方 `1+2` 误读为 `142`。该算式 OCR 不判通过。独立只读 AX 检查确认同一 Calculator PID 的
静态文本值为 `1+2` 和 `3`（原值带方向控制字符），并非本地算术推导。

## 验证与运行产物

运行目录：`.runtime/tests/mcp-tunnel/20261118-auto-readiness/`。

- `mcp-tests.log`：`go test ./pkg/mcpserver -count=1` 通过；定向测试亦通过。
- `build-provenance.json`：脏工作区 HEAD、相关源码与二进制哈希。
- `local-tools-list.json`、`web-refreshed-tools.txt`：本地与网页各自的工具目录证据。
- `web-final.txt`、`web-tool-titles.txt`、`web-result.png`：网页结果与可见工具调用记录。
- `calculator-result.png`：本轮最终真实计算器截图。
- `calculator-ax-initial.txt`、`calculator-ax-final.txt`：独立只读窗口/AX 观察。
- `doctor.log`、`tunnel-status.json`、`desktop/client.log`：就绪与官方隧道转发记录。
- `manual-test-prompt.txt`：供用户在已选择插件的网页聊天中直接发送的验收指令。

`git diff --check` 通过。整体 `node scripts/audit_test_architecture.js` 仍失败，涉及本轮外的多个未分类
Go 测试、分类表旧格式问题、缺失 `tests/runtime-api/single/window-app-watch.js` 和文档/manifest 差异。
本轮新测试已登记，不在未分类列表中；不宣称整个仓库审计通过。

全屏大图仍可能触发既有 MCP 2 MiB 帧限制；本轮只验证小型计算器 activeWindow，没有修改截图传输预算。
本轮也不代表发行包、稳定签名 App 或系统重启后自动启动已验收。

## 用户复测

本轮官方客户端保持运行，管理入口为 <http://127.0.0.1:3001/ui>。
原生 UI 占用锁已释放，浏览器保留本轮结果对话。无需再次运行旧 Terminal Python 进程。

任意工作目录可运行以下命令，把测试指令复制到剪贴板，再在 ChatGPT 网页选择
**OpenDesk Desktop Mac96** 插件并粘贴发送：

```sh
pbcopy < /Users/shopme/Documents/workspace/opendesk/.runtime/tests/mcp-tunnel/20261118-auto-readiness/manual-test-prompt.txt
```

该指令不含固定 PID 或坐标。用户可以先关闭计算器再发送，模型应自行发现并打开它；保留其他窗口在前台也应自行聚焦。
如果服务之后被停止或启动宿主改变，需要重新检查服务与实际权限，不能只凭本轮记录宣称仍然就绪。

## Goal 收口复核

用户设置目标后，再次只读复核官方隧道为 live/ready，客户端 PID 96094 仍运行；通过真实 MCP
重新读取 accessibility、screenCapture、inputMonitoring 均为 true。当前源码与已测试构建的四项源码哈希、
二进制哈希均一致，测试指令和网页证据仍存在。新保存的 `calculator-ax-goal-check.txt` 确认当前
PID 97887、bundle `com.apple.calculator`、窗口标题“计算器”，静态文本仍为 `1+2` 和 `3`。
收口复核未重放任何计算器按钮点击。
