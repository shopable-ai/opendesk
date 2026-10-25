# OpenDesk MCP

OpenDesk MCP 是本仓库面向 MCP Host 的本地 stdio 工具服务。它复用 OpenDesk 现有 desktop automation / vision 能力，为 Agent 提供可组合的感知、目标发现和安全动作接口。

## OpenAI Secure MCP Tunnel 与只读接入

从仓库根目录构建后，官方 Tunnel 的本地 command 使用同一个程序：

```bash
./dist/opendesk-mcp --read-only
```

完整配置、无密钥本地检查、Platform / ChatGPT 后续连接步骤见
[Secure MCP Tunnel](secure-mcp-tunnel.md)。不需要新增 HTTP Server。官方客户端本地检查与
ChatGPT 云端调用是独立验收；无密钥时后者记为 `NOT_TESTED`。

`--read-only` 同时过滤工具发现和实际调用，只开放状态、权限、窗口、显示器、窗口等待及无输出路径的截图。
截图仍会读取可能敏感的屏幕内容；连接前应关闭私人窗口。该模式拒绝 `path` 等未声明参数，以及可能产生
磁盘文件的截图返回形式。完整模式保留原有本地能力，截图可写任意指定路径，因此其元数据保守标为写操作。
工具 hints 仅描述副作用，不能代替授权。不要把完整模式直接接到远程隧道。

## 无密钥真实桌面验收

从仓库根目录，构建本轮程序后执行一行：

```bash
node tests/mcp/tools/desktop-control/main.js --allow-fixture-input
```

这是正式真机 gate：需要 macOS 桌面、系统权限、Node.js、Go 和 Xcode Command Line Tools。
它复用仓库 AppKit fixture 的固定路径和签名方式，拒绝占用其他运行中的 fixture；通过 MCP 验证
initialize / tools/list、状态、权限、真实窗口、精确聚焦、PID 定向输入和活动窗口截图；用测试应用自身
状态及独立只读 AX 观察器核对实际输入。PID 输入与 Enter 的组合必须在任何输入前被拒绝。
截图使用刚核对过的 fixture 窗口矩形 `clip`，与独立 AX bounds、显示器 scale 及 PNG 像素尺寸交叉核对，
不请求可能回退为全屏的 `target: activeWindow`。截图前后检查窗口身份和几何；矩形捕获仍不保证
采集期间不会发生遮挡或瞬间失焦，因此必须在受控桌面执行并检查实际图片。
每次使用新证据目录，输入不自动重试；默认结果写入 `.runtime/tests/mcp-desktop-control/<timestamp>/`，
包括 `summary.json`、测试窗口截图及仅保留白名单字段的协议记录。原始 stderr、错误正文和无关窗口标题不落盘，
两个 MCP 子进程关闭并解析完尾部输出后才判定结果。仅清理本次启动的 fixture 和 MCP 子进程。
这不代替用户在 ChatGPT 官方网页发起的工具调用。

失败路径回归从仓库根目录执行 `node --test tests/mcp/desktop-control-safety.test.js`；它检查隐私过滤、
截图边界和关闭时协议污染，不操作桌面，也不能代替上面的实机 gate。

## 远程写操作边界

本轮只把 `--read-only` 作为远程接入配置。macOS TCC、工具 hints、已有窗口标题 guard
均不能代替用户针对应用、窗口和动作的授权；完整本地模式尚未建立这样的远程授权策略。
远程只读仍会暴露真实窗口和像素，应限定受信任的账户、工作区与桌面会话。

当前 stdio handler 同步处理请求，没有把 MCP 取消通知接入每次桌面操作的取消令牌。
停止自己启动的服务可以阻止后续操作，不能撤销已经输入的文字，也不能保证中断正在运行的原生调用。
未来开放写工具前，需要在现有 Runtime/执行生命周期中接入明确授权、目标白名单、取消和审计；
发生输入状态未知时停止并重新观察，不能自动重放动作前缀。本轮不开放远程写入、不新增权限 UI。

## 构建

```bash
go build -o dist/opendesk-mcp ./cmd/opendesk-mcp
```

本地直接启动：

```bash
./dist/opendesk-mcp
```

它是 stdio MCP server，通常由 Hermes、Claude Desktop 或其他 Host 拉起，而不是人工在终端中交互。

## 推荐 Agent 主链路

```text
tm_inspect_desktop
-> tm_find_target
-> tm_act_on_target
```

### `tm_inspect_desktop`

用于聚合当前环境信息，例如：

- runtime status；
- permissions；
- active window；
- displays；
- optional screenshot。

### `tm_find_target`

用于聚合/标准化目标候选。

当前 strategy：

```text
ocr
detect_ui
layout
hybrid
```

结果可包含：

- `candidates[]`；
- `bestCandidate`；
- ambiguity 信息；
- freshness metadata；
- OCR / detect-ui / layout evidence。

依赖 OCR provider 的路径若缺配置，会尽量返回结构化 external blocker，而不是要求 Host 只靠错误字符串判断。

### `tm_act_on_target`

对标准化 candidate 执行：

```text
click
type
focus
```

当前安全能力包括：

- `previewOnly` / `dryRun`；
- `expectedWindowTitle`；
- `expectedTargetText`；
- stale candidate guard；
- ambiguous candidate guard；
- `allowAmbiguous` 显式放行；
- 可用上下文下的最小 revalidation。

## 常用原子工具

MCP 还提供：

```text
tm_status
tm_permissions
tm_request_permissions
tm_list_windows
tm_get_active_window
tm_focus_window
tm_wait_for_window
tm_focus_and_type
tm_list_displays
tm_screenshot
tm_ocr
tm_detect_ui
tm_wait_for_text
tm_click_text
tm_click_region
tm_analyze_layout
tm_annotate_regions
tm_click
tm_type
tm_press_key
tm_scroll
```

实际完整 tool surface 以 `pkg/mcpserver/server.go` 的当前 `tools/list` 为准。

## 文档

### Host 集成

```text
docs/integrations/mcp/hermes-integration.md
```

### 测试与交付

```text
docs/integrations/mcp/testing/delivery-checklist.md
docs/integrations/mcp/testing/test-matrix.md
docs/integrations/mcp/testing/manual-smoke-macos.md
```

### OCR Provider 恢复

```text
docs/integrations/mcp/operations/ocr-provider-recovery.md
```

### 继续开发 Prompt

Prompt 不属于 integration docs：

```text
prompts/mcp/continuation.md
```

## 当前边界

### macOS

真实截图、窗口、焦点、点击与输入受系统 TCC 和目标应用行为影响。Contract test 不能替代真机 smoke。

### OCR

`ocr` / `detect_ui` / `hybrid` 等路径依赖实际 OCR provider 可用。缺少 `PADDLE_OCR_ENDPOINT` 等必要配置时，应按 external blocker 处理。

### 跨平台字段

底层窗口对象可能携带历史/平台相关 metadata。Host 不应把 `exeName`、`exePath`、`handle`、`isPopup`、`isForeground` 等字段视为跨平台稳定契约；优先依赖稳定的 title、active window、candidate 和 guard 语义。

## 修改 MCP 时

至少检查：

```bash
go test ./pkg/mcpserver ./cmd/opendesk-mcp
```

涉及真实桌面行为时再按 manual smoke 做真机验证。

协议、工具注册、schema 与真实 runtime 不一致时，以当前代码和实际测试结果为准，并同步修正文档。
