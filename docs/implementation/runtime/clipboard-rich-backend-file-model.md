---
title: Rich Clipboard Darwin backend file model
description: 富剪贴板的 Go、CGO、Objective-C、fallback 与 live 测试文件为何必须分层，以及其实际 build 选择。
order: 16
---

# Rich Clipboard Darwin backend file model

`clipboard` 的公开 JavaScript 契约以 [Clipboard API](../../api/clipboard.md) 为准。这里仅说明
维护者看到的同名前缀文件：它们不是四份重复实现，而是一个跨语言 backend 的四个边界。

| 构建条件 | 实际选择的文件 | 职责 | 不负责什么 |
| --- | --- | --- | --- |
| `darwin && cgo` | `automation/clipboard_rich_backend_darwin.go` | Go `ClipboardBackend` adapter；校验 format、管理 C 内存、转换 JSON、映射稳定错误。 | 不直接调用 AppKit。 |
| `darwin && cgo` | `automation/clipboard_rich_appkit_darwin.m` | 唯一的 Objective-C/AppKit bridge；调用 `NSPasteboard` 读取、写入、清空和取得 `changeCount`。 | 不公开 Goja/JS API，也不决定 payload 限制。 |
| `darwin && !cgo` 或 `!darwin` | `automation/clipboard_rich_unsupported.go` | 统一返回带明确原因的 `NOT_SUPPORTED` backend。 | 不伪造剪贴板成功或引入 Objective-C。 |
| `darwin && cgo` 的 test build | `automation/clipboard_rich_darwin_test.go` | 只检查 NSPasteboard metadata 与 `changeCount`；必须设置 `OPENDESK_LIVE_CLIPBOARD_TEST=1`。 | 不读取正文、不写剪贴板，也不替代 JS `clipboard` contract。 |

此前的 `clipboard_rich_darwin_nocgo.go` 与 `clipboard_rich_other.go` 只有同一个 unsupported
factory 的两个小变体，现已合并到 `clipboard_rich_unsupported.go`。Desktop Events 也直接复用
`opendesk_clipboard_change_count()`，不再在 `desktop_events_backend_darwin.m` 维护第二份
`NSPasteboard.changeCount` bridge。

因此，仍看到 `darwin.go`、`darwin.m` 与 `darwin_test.go` 是正确的：它们的语言、链接边界和
副作用等级不同。若一个改动只涉及公开参数、返回值或错误，测试应写在
`tests/runtime-api/unit/clipboard.test.js`；只有 Go/CGO memory ownership、AppKit status mapping
或真实 pasteboard metadata 才属于这组 native 文件。

从仓库根目录验证选择：

```bash
# 当前 Darwin+CGO backend；默认不会触碰真实剪贴板。
go test ./automation -run '^TestDarwinRichClipboardMetadataCanBeReadWithoutContent$' -count=1

# Darwin 无 CGO fallback：核对 file selection，不宣称整个 automation package 支持无 CGO build。
GOOS=darwin CGO_ENABLED=0 go list -f '{{.GoFiles}}' ./automation

# JavaScript 公共契约。
OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

最后一条只证明 `clipboard_rich_unsupported.go` 被正确选择。当前完整 `automation` package 还依赖
Oto 与 RobotGo 的 CGO-only backend，所以 `GOOS=darwin CGO_ENABLED=0 go test -c ./automation`
不是本项目支持的 package gate；它的失败不能归因于富剪贴板 fallback，也不能被表述为该 fallback
已经通过完整交叉编译。

真实 pasteboard metadata 只在维护者明确 opt-in 时运行：

```bash
OPENDESK_LIVE_CLIPBOARD_TEST=1 \
  go test ./automation -run '^TestDarwinRichClipboardMetadataCanBeReadWithoutContent$' -count=1
```
