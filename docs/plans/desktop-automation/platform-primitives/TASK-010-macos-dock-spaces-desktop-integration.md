# TASK-010 — macOS Dock / Spaces / Desktop Integration

Status: BLOCKED
Priority: P1/P2
Depends on: none
Mode: INTEGRATE_FIRST

## Goal

评估并补齐 Dock、Spaces/virtual desktops、desktop switching 等 macOS 桌面层能力，但将“是否应该由 OpenDesk 自研”作为本任务第一问题。与 Peekaboo 等成熟实现高度重叠时，优先 adapter/integration。

## 开始前必须审计

- OpenDesk 当前 Window/App/Accessibility 已覆盖到什么程度。
- Peekaboo 当前 Dock / Space / desktop 能力及调用接口。
- 使用公开 API、Accessibility、AppleScript/CGS/private API 的稳定性与风险。
- 是否能通过现有 Integration/Native Extension 接入而不污染 Core。

## 能力候选

```text
Dock.listItems
Dock.clickItem
Dock.isRunning
Desktop.list / Spaces.list
Desktop.current / Spaces.current
Desktop.switchTo / Spaces.switchTo
Window.moveToDesktop / moveToSpace
```

公共 API 名称必须在实现前根据现有命名体系决定，不允许先造 API 再找 backend。

## 决策原则

- Dock 基础操作若 Accessibility 足够，复用 Accessibility。
- Spaces 若需要私有/高脆弱系统 API，不默认进入 Stable Core。
- Peekaboo 已稳定覆盖时优先 integration。
- 若只能通过模拟快捷键切 Space，必须标记 backend 和限制，不得伪装成精确系统 API。

## 非目标

- 不复制完整 macOS desktop manager。
- 不做窗口管理器产品。
- 不把 undocumented/private API 强行标记 Stable。

## 测试

若实现/集成，至少覆盖：

1. Dock item 枚举与点击。
2. 当前 Space/desktop 识别。
3. 切换后验证当前 desktop。
4. 多窗口/多 Space 场景。
5. backend 不支持时明确 capability。

## Done

- 产出 Build / Extend / Integrate / Skip 结论。
- integration 优先，除非有充分证据必须自研。
- 公共 facade 与具体 macOS backend 解耦。
- 文档明确哪些能力依赖私有/不稳定机制。

## Execution record — 2026-09-02

Decision: `BLOCKED`（Dock 解除阻塞后 `INTEGRATE`；Spaces 只允许 Experimental integration，
Stable Core `DEFER`）

Base HEAD: `3da9801c959984f26a1fabd23fc96586ac762624`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- 当前 Runtime、MCP、HTTP、types、`docs/api` 和 examples 均没有 Dock/Spaces/Desktop 公共 API；
  `window.getCapabilities()` 明确说明 virtual desktops 不由 Window API 选择或管理。
- 已有 `App.launch()` / `App.isRunning()` 已覆盖普通应用启动与运行状态。未来 Dock facade 只应表达
  “通过共享 Dock UI 操作”这一特殊 affordance，不能复制 App lifecycle；Window native ID、Screen
  virtual coordinates 和 NativeExtension executable boundary 也应直接复用。
- 本地 Peekaboo source snapshot 的 Dock service 已用 Accessibility tree 实现 list/find/launch、
  right-click、hide/show，并返回 item type、running、bundle id 和 bounds；当前上游还要求 launch 和
  right-click 显式 foreground consent。该能力成熟度足以确定 thin adapter 路线。
- Peekaboo Space service 已实现 list/current/window membership/switch/move/follow，但源码直接声明并
  调用 undocumented private CGS symbols。当前上游也把它标为 best-effort，并要求 switch/follow 的
  explicit foreground consent；因此这些能力不能伪装为 Stable Core，也不能用模拟快捷键作静默替代。
- 本轮未新增公共 API 或 native driver：当前 provider 无法在本机运行，且没有真实版本兼容性和
  postcondition evidence 时暴露 facade 会违反本卡完成标准。

Tests:

- `go test ./...`：未通过；本任务相关 packages 均通过或无测试，现有 `pkg/visionrun` 仍有 4 个
  与本任务无关的 runtime-input/fixture 失败：两个 real validation input 缺失、一个
  `capture_contract.json` 缺失、一个 preflight `latest.json` 缺失。完整输出在本地
  `.runtime/tests/platform-primitives/task-010-dock-spaces/go-test-all.log`。
- 未运行 Dock/Spaces JS 或真实 macOS smoke：OpenDesk 没有对应 API，`peekaboo` 不在 `PATH`，
  provider 的平台和工具链最低要求高于本机。没有把未运行的测试写成通过。

Evidence:

- OpenDesk 审计确认没有 Dock/Spaces backend，现有 App/Window/Screen/NativeExtension 只提供可复用
  基础，不构成 Dock/Spaces 实现。
- 本机：macOS `12.7.6` (`21H1320`), `x86_64`, Swift `5.7.2`，仅 Command Line Tools；
  `peekaboo` 不在 `PATH`。Peekaboo 当前 [platform support](https://github.com/openclaw/Peekaboo/blob/main/docs/platform-support.md)
  要求 released CLI/MCP 为 macOS 15+，CLI source build 为 macOS 15+ / Swift 6.2+。
- 当前上游 [Dock contract](https://github.com/openclaw/Peekaboo/blob/main/docs/commands/dock.md) 使用 AX
  list/click 和 structured JSON/errors；[Space contract](https://github.com/openclaw/Peekaboo/blob/main/docs/commands/space.md)
  明确使用 private macOS APIs、best-effort 语义和 foreground consent。
- 本地非提交审计：`.runtime/tests/platform-primitives/task-010-dock-spaces/audit.json`，包含 capability
  分解、输入 SHA-256、private API 边界、宿主限制和未运行 live smoke 的事实。

Why this is blocked:

- 选定 provider 在当前 macOS 12 / Swift 5.7 主机不能构建或运行；Dock 所需的完整 Accessibility
  provider 也因 TASK-001 的同一环境边界不可用。
- Space private APIs 的 ABI/行为会随系统变化，必须在目标 macOS 上验证 list/current/switch/move
  postcondition；当前主机既不满足 provider 下限，也不能证明对受支持版本的行为。
- 从 AX/CGS 复制 provider 实现会违反 `INTEGRATE_FIRST`；空 facade、mock-only adapter 或快捷键
  fallback 又不能满足明确 capability、权限、foreground consent 和真实 smoke 的要求。

Remaining / unblock condition:

- 在 macOS 15+、Swift 6.2+/对应 Xcode、安装并授权 Peekaboo 的 host 上重新打开。
- Dock adapter 复用 provider JSON、版本/capability handshake、foreground consent 和 typed errors；
  `App.isRunning()` 保持运行状态事实源，不增加同义 process API。
- Spaces facade 必须标记 `Experimental`，声明 `private-cgs` backend 和已验证的 OS build；switch/follow
  要求显式 foreground authority，move 必须按 current Window native ID 重新解析，并对 confirmed、
  partial、indeterminate 和 unsupported 分别返回，不能 silent success。
- 完成 Dock enumerate/click、active Space readback、switch postcondition、多 Space window move、
  backend unavailable 和不同 OS build 的 real evidence 后，才同步 JS/types/docs/index；若 private API
  无法维持 fail-closed contract，则保留为 NativeExtension/外部 integration，不进入 Core。
