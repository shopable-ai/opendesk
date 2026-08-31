# Desktop Automation Plans

本目录只保存仍在推进的桌面自动化计划，不保存当前能力声明或运行报告。

## Active plan

- [`next-stage-development-plan.md`](next-stage-development-plan.md)：基于当前源码、测试与 Evidence 审计形成的正式分阶段开发计划。定义 Verified Desktop Step、HTML Benchmark、系统应用梯度、App Adapter、复杂应用与 Agent 的进入条件及 PR 拆分。

## Supporting decision input

- [`app-target-priority-matrix.md`](app-target-priority-matrix.md)：真实应用候选的条件性优先级矩阵。候选排序必须在执行时根据当前环境、Fixture、Accessibility 与风险 Evidence 重新校准。

## Boundary

```text
current source / tests / runtime evidence
→ frameworks / architecture / quality
→ active plans in this directory
→ research / history
```

计划中的 Phase 或 PR 只有在对应代码、测试和当前 Evidence 落地后，才能更新为当前能力声明。
