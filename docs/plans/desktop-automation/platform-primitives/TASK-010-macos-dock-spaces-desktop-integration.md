# TASK-010 — macOS Dock / Spaces / Desktop Integration

Status: TODO
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
