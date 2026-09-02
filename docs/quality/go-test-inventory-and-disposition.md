---
title: Go 测试资产盘点与处置方案
description: OpenDesk 当前 *_test.go 文件的数量口径、边界分类、逐文件审查方法和迁移处置规则。
order: 20
---

# Go 测试资产盘点与处置方案

本文回答一个容易产生误判的问题：仓库里有很多 `*_test.go`，是否都应该移动到
`tests/`，或者是否应该删除。结论是：`*_test.go` 不是一种测试类型，文件位置应由它
验证的边界决定，而不是由“看起来像测试脚本”决定。

## 迁移前 145 个文件的数量口径

盘点命令从仓库根目录执行，排除 `.git/` 和运行产物 `.runtime/`，但保留历史区
`.archive/`：

```bash
find . -path './.git' -prune -o -path './.runtime' -prune -o \
  -type f -name '*_test.go' -print | sort | wc -l
```

迁移前口径为 `145`，组成如下。这个数字由当前 142 个文件加本轮迁移的 3 个旧路径闭合；它不意味着 145 个文件
都应继续作为 Go 测试运行。

| 范围 | 文件数 | 是否属于当前产品测试 gate | 处理结论 |
| --- | ---: | --- | --- |
| 当前产品源码（迁移前口径） | 137 | 是，按 Go package 或嵌套模块分别处理 | 保留真正的 package 测试；输出型伪测试迁移为工具 |
| `.archive/batch1-sync-blockers-20260608-191116/` | 8 | 否 | 继续隔离；不恢复、不加入 gate、不直接删除 |
| 根模块 package（迁移前口径） | 133 | 是 | `go test ./...` 应作为实现回归 gate |
| `third_party/` 嵌套上游模块 | 4 | 根 gate 不自动覆盖 | 保留上游位置；单独、隔离、按平台运行 |

因此，“145 个都要移动到 `tests/`”不是正确方案。移动 package-private 测试会失去对
未导出函数、内部状态机和 fake backend 的访问，还会改变 Go package 的测试语义。

本轮已把 3 个只生成图片或可视化输出的文件迁移为独立工具。迁移后重新盘点为 `142`
个 `*_test.go`：当前产品源码测试 `134` 个（根模块 `130` 个、嵌套 third_party 模块 `4` 个）
加历史归档 `8` 个。新增工具不再计入 `*_test.go`，也不进入 `go test` 的测试集合。

## 按目录的全量处置结论

下表覆盖本次 145 个文件的目录集合；同一行中的 glob 覆盖该目录下全部对应测试文件。逐文件结论见 [Go 测试逐文件分类清单](go-test-file-classification.md)。

| 文件范围 | 数量 | 测试性质 | 处置方案 |
| --- | ---: | --- | --- |
| `automation/*_test.go` | 46 | Runtime native binding、backend、权限、生命周期、图像算法和私有 helper | 保留同包；JS 公共行为由 `tests/runtime-api/` 补充，不机械搬迁 |
| `pkg/visionrun/*_test.go` | 19 | 视觉执行 pipeline、artifact、preflight、证据和安全状态 | 保留同包；所有输出使用 `.runtime`；真实 fixture 缺失时显式 skip 或使用专用 live gate |
| `pkg/nativeextension/*_test.go` | 11 | manifest、ACL、进程、跨平台路径和安全边界 | 保留同包；保留 Darwin/Linux/Windows build tags，目标平台验证单独记录 |
| `cmd/opendesk/*_test.go` | 9 | CLI source、HTTP、配置、实例、信号和脚本生命周期 | 保留 `cmd/opendesk`，因为大量测试访问 `package main` 内部函数 |
| `pkg/customui/*_test.go`、`pkg/customui/toolbar/*_test.go` | 7 | UI host、queue、session、toolbar 状态机和并发关闭 | 保留同包；真实窗口/AX 证据另放 live 工具或专门 gate |
| `pkg/desktopvision/*_test.go` | 7 | 坐标、感知 schema、动作 gate、trace 和 replay script | 保留同包；模型/截图 provider 的真实调用单独 gate |
| `pkg/execution/*_test.go` | 7 | Goja EventLoop、execution ownership、Promise、取消和资源清理 | 保留同包；不可用 JS 直接证明的 lifecycle seam 不迁移 |
| `pkg/mcpserver/*_test.go` | 4 | MCP schema、adapter、server 和 Recorder 保护逻辑 | 保留同包；MCP wire/stdio smoke 另在 `tests/mcp/` |
| `pkg/scheduler/*_test.go` | 4 | scheduler store、恢复、inline source 和 executor | 保留同包；不改成 JS API 测试 |
| `pkg/semanticexec/*_test.go` | 3 | outcome、verifier、false-success 和 human gate | 保留同包；属于领域状态机测试 |
| `pkg/http/*_test.go` | 2 | HTTP handler、scheduler route、loopback 和 capability gate | 保留同包；HTTP 公共契约可增加独立请求 smoke，但不搬白盒测试 |
| `pkg/recorder/*_test.go` | 2 | Recorder store、privacy、schema 和 IR distill | 保留同包；MCP/真实 Agent replay 另行验收 |
| `third_party/robotgo/*_test.go` | 3 | 上游 RobotGo 平台/设备测试 | 不迁移、不混入根 gate；按上游模块和真实桌面条件 opt-in |
| `internal/*_test.go` | 1 | 内部 aicli 命令和 envelope | 保留同包；只对外部 CLI 行为增加黑盒命令测试 |
| `pkg/benchmark/*_test.go` | 1 | semantic smoke/report 质量 gate | 保留 package；性能/基准运行应单独命令化 |
| `pkg/container/*_test.go` | 1 | container ownership 和 runtime borrowing | 保留同包；属于内部资源所有权测试 |
| `pkg/operator/*_test.go` | 1 | semantic fixture audit | 保留同包；审计输出写 `.runtime` |
| `pkg/runtime/*_test.go` | 1 | execution gate 并发与关闭 | 保留同包 |
| `pkg/runtimeconfig/*_test.go` | 1 | strict config、UI discovery 和 fallback | 保留同包 |
| `cmd/opendesk-visual-runner/main_test.go` | 1 | visual runner 的模型/replay 规则 | 保留命令 package |
| `cmd/opencv-healthcheck/main_test.go` | 1 | OpenCV backend health check | 保留命令 package，保留 `opencv` build tag |
| `tests/mcp/tools/stdio-smoke/main_test.go` | 1 | 独立 MCP stdio 工具协议 drain/污染检查 | 已在正确位置，保留 |
| `third_party/kbinani-screenshot/*` | 1 | 上游截图库测试/benchmark | 不迁移；嵌套 module 单独处理 |
| `.archive/...` | 8 | 历史同步中间产物副本 | 保持归档，不当作当前测试资产 |

## 必须优先处理的误分类文件

全量盘点中，真正值得迁移的不是普通 `_test.go`，而是“没有验证断言、主要生成图片或
可视化产物”的测试工具化文件：

| 文件 | 当前问题 | 建议方案 |
| --- | --- | --- |
| `automation/image_layout_validation_test.go` | 主要生成带 ground truth 的 PNG/JSON，没有产品行为断言 | 已迁移到 `tests/automation/tools/image-layout-lab/` 的 `generate` 子命令；算法断言继续留在 `image_layout_test.go` / `image_layout_progressive_test.go` |
| `automation/image_layout_visualize_test.go` | 读取 fixture、运行分析并输出标注图，职责是可视化工具 | 已合并到 `tests/automation/tools/image-layout-lab/` 的 `visualize` 子命令，输出只写 `.runtime/tests/` |
| `automation/wechat_visualization_test.go` | 依赖预先生成的 WeChat screenshot，主要生成分析图 | 已迁移到 `tests/wechat/tools/visualize-layout/`；JS 负责捕获和公共 API 分析，Go 工具只负责离线像素标注 |
| `automation/test_output_test.go` | 没有 Test 函数，但提供 `testing.T` 输出目录 helper | 保留 `_test.go`；它是测试辅助代码，不是独立工具 |
| `automation/layout_test_helpers_test.go` | 只提供 package-private 测试 fixture/helper | 保留 `_test.go`，不能移动到普通 `tests/` 后再访问未导出实现 |

迁移生成器时必须先确认是否有现存工具、fixture 和调用方；不能只改文件名。迁移后的工具
需要：明确命令、明确工作目录、默认输出 `.runtime/`，并在本目录或相关质量文档登记。本轮
对应命令为：

```bash
# 仓库根目录：生成固定 fixture，并运行 Go 实现的离线可视化工具
go run ./tests/automation/tools/image-layout-lab all

# 仓库根目录：对已有 WeChat 截图做补充像素标注；没有截图时不运行此命令
go run ./tests/wechat/tools/visualize-layout \
  --image .runtime/tests/wechat/wechat_validation/wechat_original.png \
  --output .runtime/tests/wechat/wechat_validation
```

## 本轮已经修复的测试前置条件问题

`pkg/visionrun` 初次 package gate 暴露了 4 个测试问题，已修复并重新通过：

1. `run_real_defaults_test.go` 与 `send_mode_test.go` 写入旧的 `temp/mac`，改为和实现一致的
   `.runtime/temp/mac`。
2. `send_safety_test.go` 在调用 `RunProbePlan` 前漏掉 `RunCaptureContract`，已补齐依赖阶段。
3. `similarity_audit_test.go` 依赖当前机器的 preflight/golden screenshot；输入不存在时现在
   显式 skip，不把“没有当前实机 Evidence”误报成算法失败。

现在 `go test ./pkg/visionrun -count=1` 和完整 `go test ./... -count=1` 均通过。真实视觉、
macOS 权限、第三方设备和外部应用仍需各自的 live/opt-in gate，不能由 package green 代替。

嵌套模块的编译级检查结果也要单独记录：`third_party/kbinani-screenshot` 的
`go test -run '^$' ./...` 通过；`third_party/robotgo` 的根 package 和 examples 在当前
macOS 12 SDK 上因依赖引用未声明的 `SCScreenshotManager` 编译失败，而其 clipboard 子包
可以编译。这是上游依赖/SDK 兼容问题，不是把测试移动到主仓库可以解决的问题。可选方案是
单独升级或回退上游版本、维护一个兼容 macOS 12 的补丁，或在匹配的 macOS SDK CI 中运行；
在此之前将 RobotGo 标记为 `VENDOR_ONLY`，不要把它混入根目录成功率。

## 逐文件审查表和决策标签

逐个处理 137 个迁移前产品源码测试文件时，每个文件都记录以下字段；不允许只根据文件名
移动或删除：

| 字段 | 需要回答的问题 |
| --- | --- |
| `owner` | 它验证哪个 Go package、Runtime namespace、CLI、MCP 或外部依赖？ |
| `boundary` | 是纯函数、私有状态机、Goja bridge、JS 公共契约、真实桌面、设备还是 artifact？ |
| `privateAccess` | 是否访问未导出函数、字段、fake backend、EventLoop 或内部 channel？ |
| `externalInput` | 是否依赖真实窗口、权限、音频设备、OpenCV、模型、截图或网络？ |
| `writes` | 是否写文件、图片、进程、剪贴板、系统设置或其他副作用？路径是否在 `.runtime/`？ |
| `assertion` | 是否有稳定断言，还是仅生成日志/图片/报告？ |
| `gate` | 应由 `go test`、Runtime JS gate、live gate、工具命令还是上游模块命令运行？ |
| `disposition` | 使用以下固定标签之一：`KEEP_PACKAGE`、`SPLIT_JS_CONTRACT`、`MOVE_TOOL`、`OPT_IN_LIVE`、`VENDOR_ONLY`、`ARCHIVE_ONLY`。 |

这些字段不是只存在于方法说明中。[逐文件分类清单](go-test-file-classification.md) 已为迁移前
145 个文件逐行填写 `privateAccess`、测试边界、外部依赖、断言价值和具体处理理由；14 个
`SPLIT_JS_CONTRACT` 行还逐项列出对应的 `tests/runtime-api/unit/*.test.js`，3 个 `MOVE_TOOL`
行列出迁移目标，live/vendor/archive 行列出隔离条件。`scripts/audit_test_architecture.js` 会在
任一字段缺失、内容退化为泛化占位、JS 路径不存在或迁移/opt-in 证据不匹配时失败。

推荐处理顺序：

```text
ARCHIVE_ONLY / VENDOR_ONLY
→ 先排除当前 gate 的数量噪音
→ KEEP_PACKAGE（保留私有访问边界）
→ SPLIT_JS_CONTRACT（公共 JS 行为补到 tests/runtime-api）
→ MOVE_TOOL（生成器/可视化/回放工具迁到 tests/<domain>/tools）
→ OPT_IN_LIVE（真实桌面或设备必须有独立前置条件和 Evidence）
```

## 验收规则

- `go test ./...` 只证明根模块当前 package 测试通过，不证明嵌套 `third_party` 模块、真实
  macOS UI、权限、设备、外部模型或公开 JavaScript API 全部通过。
- Runtime 公共 API 必须以 JavaScript 测试为主：`tests/runtime-api/unit/`；Go 白盒测试只
  证明无法从 JS 观察的实现 seam。
- 真实窗口、音频、权限和外部应用测试必须有独立 live gate、目标身份、超时、cleanup 和
  Evidence；不能把 `t.Skip` 当作真实功能通过。
- 生成器和可视化程序不得伪装成普通单元测试；它们必须放在 `tests/<domain>/tools/<tool>/`
  并写明输入、输出和运行命令。
- `.archive/` 和 `.runtime/` 中的副本、日志、截图、run bundle 不计入当前源码测试数量，
  也不得未经选择批量删除或提交。

本盘点是当前工作树快照。新增或删除测试后，应重新运行数量命令，并更新本文件的分类，而
不是继续依赖旧的固定数字。
