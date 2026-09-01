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

Camera、Bluetooth、USB、Serial、Printer 等外围系统能力默认不进入 Core；如确有需要，优先通过 Native Extension 实现。

## 当前优先级

按“对桌面自动化可靠性的提升”排序：

1. `TASK-001-accessibility-api.md` — P0
2. `TASK-002-global-hotkey.md` — P0
3. `TASK-003-event-watcher.md` — P0
4. `TASK-004-audio.md` — P0/P1
5. `TASK-005-rich-clipboard.md` — P1
6. `TASK-006-screen-recording.md` — P1

## 总体设计原则

- Evidence First：源码、真实运行、测试、Evidence 高于文档声明。
- Native Primitive First：先建立最小稳定原语，再提供 JS facade / MCP / HTTP 暴露。
- macOS First，但接口模型不得无意义锁死 macOS；平台差异必须显式表达 capability。
- 不复制 Peekaboo 等成熟项目已经稳定解决且没有差异化价值的高层功能；优先集成或复用。
- 不允许 silent fallback。失败必须结构化、可诊断、可测试。
- 不把 OCR 坐标点击伪装成 Accessibility。
- 新增用户 API 时同步检查 `docs/api/*.md`、`docs/api/runtime-api.ai.json`、`types/*.d.ts`、示例与测试。
- 所有副作用 API 必须有权限、目标、超时和错误边界。
- 每张任务卡独立完成、独立验证、独立提交；不要一次性实现全部任务。

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
- `Status: DONE`

执行者只允许修改自己正在执行任务卡的状态，不得提前把后续卡标记完成。
