---
title: Custom UI 文档已迁移
description: 旧 Custom UI API 文档入口；小写 ui 的正式 Reference 已迁移到 ui.md。
order: 900
docType: compatibility
---

# Custom UI 文档已迁移

小写 `ui`、`FloatingWindow`、`WindowHandle`、`ControlHandle` 以及 OpenDesk 自身 UI 相关能力的 canonical API Reference 位于 [ui API](ui.md)。

新代码和新文档请直接使用：

```text
docs/api/ui.md
```

瞬时 OpenDesk UI 反馈的新代码使用 `ui.toast()`；`ui.notify()` 只保留为历史兼容别名。操作系统通知使用全局 [notify()](notify.md)，不是同一个 API。

大写 `UI.*` 用于操作外部桌面应用，文档位于 [Desktop UI API](desktop-ui.md)；一次性确认/输入使用 [Dialog API](dialog.md)。

本页只保留旧链接迁移，不维护第二份 API Reference。
