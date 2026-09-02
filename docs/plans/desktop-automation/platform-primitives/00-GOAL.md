# OpenDesk Desktop Platform Primitives Completion Goal

## Goal

补齐 OpenDesk 作为桌面自动化 Runtime 最关键的系统级基础能力，同时避免把 Core 扩张成杂乱的系统工具库。

本计划以当前源码行为为事实源。任何任务开始前必须重新读取 `master` 最新 HEAD，并重新检查相关源码、测试、API 文档和已有实现；不得仅依据本计划假设能力尚未实现。

## 核心能力域

OpenDesk Core 长期收敛为以下十个能力域：

1. Input
2. Window
3. App
4. Accessibility
5. Display
6. Audio
7. Clipboard
8. System
9. File
10. Event

Camera、Bluetooth、USB、Serial、Printer、Wi-Fi/VPN 管理等外围系统能力默认不进入 Core；如确有需要，优先通过 Native Extension / integration 实现。

## Existing capability guardrail

`GlobalShortcut` 已经存在并由其他任务完成/维护。

本计划明确禁止：

- 创建第二套 `GlobalHotkey` API；
- 重命名后重新实现同一能力；
- 为 Event/Watcher、FloatingWindow 或其他模块复制一套快捷键注册器；
- 因任务卡编号缺口而补建 `TASK-002` 快捷键实现。

原重复任务卡 `TASK-002-global-hotkey.md` 已删除。后续任务可以复用 GlobalShortcut 的底层运行循环或生命周期设施，但不得复制其公共能力。

## 当前优先级

按“对桌面自动化可靠性与平台完整性的提升”排序：

1. `TASK-001-accessibility-api.md` — P0
2. `TASK-003-event-watcher.md` — P0
3. `TASK-004-audio.md` — P0/P1
4. `TASK-005-rich-clipboard.md` — P1
5. `TASK-006-screen-recording-stream.md` — P1
6. `TASK-007-app-lifecycle.md` — P1
7. `TASK-008-window-cross-platform-parity.md` — P1
8. `TASK-009-macos-menu-menubar-integration.md` — P1, prefer integrate
9. `TASK-010-macos-dock-spaces-desktop-integration.md` — P1/P2, prefer integrate
10. `TASK-011-display-control.md` — P2
11. `TASK-012-notification-interaction.md` — P2
12. `TASK-013-system-session-control.md` — P2
13. `TASK-014-native-extension-boundaries.md` — P3 architecture/defer
14. `TASK-015-sound-playback-lifecycle.md` — P1, extend existing Sound lifecycle

`CODEX-EXECUTION-GOAL.md` 是 Codex 单任务执行入口，不是功能任务卡。

## 总体设计原则

- Evidence First：源码、真实运行、测试、Evidence 高于文档声明。
- Existing Capability First：新增前先检索已有实现，发现同义能力时优先复用、补齐或停止任务。
- Native Primitive First：先建立最小稳定原语，再提供 JS facade / MCP / HTTP 暴露。
- macOS First，但接口模型不得无意义锁死 macOS；平台差异必须显式表达 capability。
- 不复制 Peekaboo 等成熟项目已经稳定解决且没有差异化价值的高层功能；优先 integration / adapter / backend delegation。
- 不允许 silent fallback。失败必须结构化、可诊断、可测试。
- 不把 OCR 坐标点击伪装成 Accessibility。
- 新增用户 API 时同步检查 `docs/api/*.md`、`docs/api/runtime-api.ai.json`、`types/*.d.ts`、示例与测试。
- 所有副作用 API 必须有权限、目标、超时和错误边界。
- 每张任务卡独立完成、独立验证、独立提交；不要一次性实现全部任务。

## 每张任务开始前的重复能力检查

执行者必须先完成以下检查，再决定 IMPLEMENT / EXTEND / INTEGRATE / SKIP：

1. 搜索 Go package、polyfills、JS globals、MCP tools、HTTP routes。
2. 搜索 `docs/api`、`runtime-api.ai.json`、`.d.ts` 与 examples。
3. 搜索 Recorder/Scheduler/FloatingWindow 等内部模块是否已有私有实现。
4. 检查 `third_party`、integration 文档和 Peekaboo 等已有后端。
5. 若已有能力覆盖 80% 以上，默认 EXTEND，而不是创建新命名空间。
6. 若能力已完整存在，标记任务 `SKIPPED_EXISTING`，记录证据后停止，不写重复实现。

## 统一完成标准

每张任务卡只有同时满足以下条件才可标记 `DONE`：

- 实现与当前架构一致，没有平行重复系统。
- 单元测试通过。
- 相关 integration / smoke 测试通过。
- `go test ./...` 不产生新增失败。
- 至少有一条真实平台 Evidence 或明确说明为什么只能做 mock/unit evidence。
- 用户 API、类型声明、机器索引与实现一致。
- 文档没有把未验证能力写成 Stable。
- 最终报告包含：修改文件、测试命令、结果、风险、未完成项、commit SHA。

## 状态约定

任务卡顶部维护：

- `Status: TODO`
- `Status: IN_PROGRESS`
- `Status: BLOCKED`
- `Status: SKIPPED_EXISTING`
- `Status: DONE`

执行者只允许修改自己正在执行任务卡的状态，不得提前把后续卡标记完成。
