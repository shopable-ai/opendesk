# Clawdesk MCP

Clawdesk MCP 是本仓库面向 MCP Host 的本地 stdio 工具服务。它复用 Clawdesk 现有 desktop automation / vision 能力，为 Agent 提供可组合的感知、目标发现和安全动作接口。

## 构建

```bash
go build -o dist/clawdesk-mcp ./cmd/clawdesk-mcp
```

本地直接启动：

```bash
./dist/clawdesk-mcp
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
go test ./pkg/mcpserver ./cmd/clawdesk-mcp
```

涉及真实桌面行为时再按 manual smoke 做真机验证。

协议、工具注册、schema 与真实 runtime 不一致时，以当前代码和实际测试结果为准，并同步修正文档。
