# Codex Goal — Execute One OpenDesk Platform Primitive Task

## Mission

继续推进 `shopable-ai/opendesk` 的 desktop platform primitives，但每个 Codex 对话只执行一张任务卡，完成验证后停止，避免上下文污染、跨任务大改和重复实现。

任务目录：

`docs/plans/desktop-automation/platform-primitives/`

总计划：

`00-GOAL.md`

## 第一步：重新建立事实

每次新对话都必须：

1. 读取 `master` 最新 HEAD，不使用旧 SHA 当事实。
2. 读取 `00-GOAL.md`。
3. 按优先级找到第一张 `Status: TODO` 或 `Status: IN_PROGRESS` 的任务卡。
4. 重新搜索源码、测试、API 文档、types、polyfills、MCP、HTTP、Recorder/Scheduler/FloatingWindow、`third_party` / integrations。
5. 判断当前能力属于：
   - `IMPLEMENT`：确实缺失；
   - `EXTEND`：已有部分能力，应补齐；
   - `INTEGRATE`：已有成熟 backend，应接入；
   - `SKIP_EXISTING`：能力已经完整存在，禁止重复实现。

不得因为任务卡写着 TODO 就假设功能不存在。

## GlobalShortcut 特别约束

`GlobalShortcut` 已经存在。

禁止：

- 创建 `GlobalHotkey`；
- 创建第二套 GlobalShortcut；
- 用另一个名字重新包装同一快捷键注册系统；
- 因为任务编号缺少 `TASK-002` 而补一个快捷键任务。

可以复用其底层 event loop / callback lifecycle / teardown，但不能复制公共功能。

## 单任务执行规则

当前对话只能修改与“当前任务卡”直接相关的代码、测试、文档和必要公共基础设施。

不要同时开始下一张任务卡。

如果执行中发现：

- 需要大范围重构；
- 与其他任务强耦合；
- 已有能力与任务高度重复；
- 第三方成熟能力更适合集成；

先调整方案，优先缩小改动面，不要为了完成任务卡制造平行系统。

## 实现顺序

对当前任务执行：

1. Audit：列出现有实现、缺口、重复风险。
2. Decision：IMPLEMENT / EXTEND / INTEGRATE / SKIP_EXISTING。
3. Design：最小 API、backend、错误模型、capability、生命周期。
4. Implement：最小可验证实现。
5. Unit tests。
6. Integration / smoke test。
7. Evidence：保存真实运行证据或说明无法获得真实 evidence 的原因。
8. Documentation：同步 `docs/api`、`runtime-api.ai.json`、`.d.ts`、examples（仅在公共 API 变化时）。
9. Regression：至少运行相关测试和 `go test ./...`，不得隐瞒已有失败与新增失败的区别。
10. Update Task Card：状态、实现决策、Evidence、剩余风险。
11. Commit：提交本任务的改动，并记录最终 commit SHA。

## SKIP_EXISTING 规则

如果审计确认任务能力已经存在且达到任务目标：

- 不修改实现；
- 不创建同义 API；
- 将任务卡状态更新为 `SKIPPED_EXISTING`；
- 在任务卡中记录实际实现路径、测试/文档证据和为什么无需新增代码；
- 提交这次事实校准后停止。

## Integration-first 规则

对于 macOS Menu/MenuBar、Dock/Spaces/Desktop 等与 Peekaboo 或其他成熟 backend 高度重叠的任务：

优先顺序必须是：

`Reuse existing OpenDesk primitive → Integrate existing backend → Thin adapter → Only then consider native reimplementation`

若最终决定自研，必须在任务卡中留下证据说明为什么现有实现/集成不能满足需求。

## 完成后输出格式

当前任务结束时只输出一份紧凑报告：

```text
TASK:
DECISION: IMPLEMENT | EXTEND | INTEGRATE | SKIP_EXISTING
STATUS: DONE | BLOCKED | SKIPPED_EXISTING
BASE_HEAD:
FINAL_COMMIT:

CHANGED:
- ...

TESTS:
- command -> result

EVIDENCE:
- ...

RISKS / REMAINING:
- ...

NEXT_TASK:
- path
```

## 新对话接力

仓库文件本身不能保证 Codex 客户端自动创建一个全新的对话，因此不要把“自动新建会话”当作任务完成条件。

如果当前运行环境支持 fresh-session orchestration，可以让 orchestrator 用同一份本文件启动下一张 `TODO` 任务卡；如果不支持，则当前 Codex 必须停止，并输出下面这段可直接用于新对话的接力提示：

```text
继续执行 OpenDesk platform primitives。
读取：
docs/plans/desktop-automation/platform-primitives/CODEX-EXECUTION-GOAL.md
以及 00-GOAL.md。
重新读取 master 最新 HEAD，选择 NEXT_TASK 指向的任务卡。
只执行这一张任务，完成测试、Evidence、任务卡状态更新和 commit 后停止。
严格检查已有能力，禁止重复创建 GlobalShortcut/GlobalHotkey 或其他同义系统。
```

不要在同一长对话中连续实现多张任务卡，除非外部 orchestrator 明确为每张任务创建了独立新 context。
