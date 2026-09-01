# TASK-011 — Display Control

Status: DONE
Priority: P2
Depends on: none

## Goal

在现有 `Screen.getDisplays()` / display geometry 基础上评估最小可控显示器能力，重点服务桌面自动化测试和环境准备；避免把 OpenDesk 变成显示器管理工具。

## 开始前必须审计

- 当前 display enumeration / virtual bounds / scale factor。
- 是否已有系统亮度、分辨率或显示配置 helper。
- macOS / Windows 对内置屏与外接屏可用的稳定公开 API。

## 候选能力

```js
Display.list()
Display.getPrimary()
Display.getBrightness(id)
Display.setBrightness(id, value)
Display.getMode(id)
Display.listModes(id)
Display.setMode(id, mode)
```

rotation / sleep / color profile 仅在有明确、稳定需求时进入后续阶段。

## 设计约束

- display identity 必须稳定，不仅使用数组 index。
- brightness 对不支持的外接显示器明确 Unsupported。
- resolution/mode 修改必须可恢复，测试不得把开发机留在异常状态。
- 不使用 shell command 作为无声明的 silent backend。
- 不支持的能力优先通过 capability 表达，而不是伪成功。

## 非目标

- 不做 DDC/CI 全功能显示器控制中心。
- 不做色彩校准工具。
- 不强求所有外接显示器一致支持亮度。

## 测试

至少覆盖：display enumeration identity、read-only mode、可支持设备的 brightness read/write/readback、mode change restore、unsupported device、权限/系统错误。

## Done

- 只有稳定且能真实验证的能力进入 Core。
- 不稳定或硬件特定控制转 Native Extension。
- 文档、类型、capability 与真实实现一致。

## Execution record — 2026-09-02

Decision: `EXTEND`（扩展现有 `Screen`；禁止创建重复 `Display` global）

Base HEAD: `cbfa22a5b39f39eb3add6cbb55da1c8bd3b617f2`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- `Screen.getDisplays()` / `getPrimaryDisplay()` 已完整覆盖候选 `Display.list()` / `getPrimary()`，
  因此没有新建同义 namespace。display row 新增当前 session `id` 之外的
  `hardwareId = vendor:model:serial:unit` 及公开 CoreGraphics hardware fields；文档明确 serial 可为
  `0`、index 只表示当前顺序、两种 identity 都不是跨机器 UUID。
- 在现有 `Screen` 上新增 `getDisplayCapabilities()`、`getDisplayMode(displayId)`、
  `listDisplayModes(displayId)`、`setDisplayMode(displayId, modeId)`。macOS backend 只使用公开
  CoreGraphics display-mode API，没有 shell command、第二套 display inventory 或 silent fallback。
- `setDisplayMode()` 只接受同一 display 当前 mode list 返回的 opaque id；调用同步 native setter后
  立即 readback，返回 previous/current/verified receipt。不存在 mode、backend 失败和 readback mismatch
  分别用 `NOT_FOUND`、`BACKEND_FAILED`、`READBACK_FAILED` fail closed。
- mode read/list 使用公开 API，mutation 在文档/types/capability 中保持 macOS `Experimental`；
  Windows/Linux 明确 Unsupported。brightness read/write 明确 Unsupported，并路由到硬件特定
  Native Extension；没有把 gamma、按键或 DDC/CI 冒充系统亮度。
- 已同步 JS allowlist、Runtime manifest、`runtime-api.ai.json`、types、API index/reference 和只读公开示例。

Tests:

- focused Go backend/normalization/error/readback tests：PASS，`go test ./automation -run
  'Test(NormalizeDisplayModes|ScreenSetDisplayMode|DisplayCapabilities|UnsupportedDisplayMode)' -count=1`。
- 正式 JavaScript Runtime unit gate：PASS `405/405`，运行目录
  `.runtime/tests/runtime-api/20260901T215339Z-89997/`；覆盖新方法 catalog、lower-camel result、
  identity、capability、current/list agreement 和 invalid mode structured error。
- 仓库根目录公开命令 PASS：`./opendesk -script examples/display-modes.js -console-mode script`；
  输出保存在 `.runtime/tests/platform-primitives/task-011-display-control/public-example.log`。
- real macOS setter/readback/restore smoke PASS：对当前唯一 mode 执行真实 CoreGraphics setter、readback
  与 finally-style restore verification；没有声称发生了实际 resolution transition。
- `go test ./...`：本任务相关 packages（包括 `automation`）通过；现有 `pkg/visionrun` 仍有 4 个
  与本任务无关的 runtime-input/fixture 失败：两个 real validation input 缺失、一个
  `capture_contract.json` 缺失、一个 preflight `latest.json` 缺失。
- Linux `CGO_ENABLED=0` 全 automation target compile 尝试被既有 third-party robotgo 的
  `Bitmap` / `Rect` / input symbols 缺失挡住；新 API 在非 macOS capability 中仍明确 Unsupported，
  本轮没有把该既有全包问题写成 target-runtime 验证。

Evidence:

- host：macOS `12.7.6` (`21H1320`), `x86_64`；CoreGraphics backend。
- 真实 active display：session id `1104977161`，built-in，logical/pixel `1920x1080`，60 Hz；provider
  只返回 1 个 desktop mode，因此没有安全的 alternate mode 可用于真实 transition。
- 本地 `.runtime/tests/platform-primitives/task-011-display-control/evidence.json` 保存脱敏 identity、
  bounds、mode、setter receipt、restore readback、`alternativeUsableModeCount: 0` 和
  `actualModeTransitionExercised: false`；没有把 same-mode dispatch 写成 mode change。
- Apple 文档将 [CGDirectDisplayID](https://developer.apple.com/documentation/coregraphics/cgdirectdisplayid)
  定义为 attached display 的进程间 identity（通常维持到重启），并说明
  [CGDisplaySetDisplayMode](https://developer.apple.com/documentation/coregraphics/cgdisplaysetdisplaymode%28_%3A_%3A_%3A%29)
  是同步操作、调用进程退出时恢复永久设置。

Remaining:

- 当前硬件没有 alternate desktop-usable mode，真实 resolution change → readback → restore 尚未验证；
  因此 mutation 保持 Experimental。后续在至少两个 mode 的专用 fixture 显示器上补该证据，不在用户
  日常显示器上强行制造模式。
- mirroring set 会影响多屏，调用方必须保存每屏原状态；本轮没有提供批量 transaction facade。
- brightness、rotation、sleep、color profile、DDC/CI 仍不进入 Core；有明确硬件需求时使用
  Native Extension，并让 capability 表达具体 monitor/backend 支持。
