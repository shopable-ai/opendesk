---
title: Custom UI 文档已迁移
description: 旧 Custom UI API 文档入口；小写 ui 的正式 Reference 已迁移到 ui.md。
order: 99
---

# Custom UI 文档已迁移

小写 `ui`、`FloatingWindow`、`WindowHandle`、`ControlHandle` 以及 OpenDesk 自身 UI 相关能力的正式 API Reference 已迁移到 [ui API](ui.md)。

新代码和新文档请直接使用：

```text
docs/api/ui.md
```

大写 `UI.*` 仍用于操作外部桌面应用，文档位于 [Desktop UI API](desktop-ui.md)。系统级 `notify()` 仍位于 [notify](notify.md)，`Dialog.*` 位于 [Dialog API](dialog.md)。

本页只用于旧链接迁移，不再维护第二份 API Reference。
