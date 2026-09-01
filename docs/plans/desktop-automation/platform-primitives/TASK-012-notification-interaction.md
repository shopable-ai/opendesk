# TASK-012 — Notification Interaction

Status: TODO
Priority: P2
Depends on: TASK-001 and/or TASK-003 recommended

## Goal

在现有 `notify()`“发送通知”能力之外，评估桌面自动化是否需要可靠地观察、等待和操作系统通知；本任务首先验证平台可行性，不默认承诺读取任意应用通知。

## 开始前必须审计

- 当前 `notify()` 的职责和实现。
- Event/Watcher 是否能表达 notification events。
- Accessibility 是否能安全访问 Notification Center UI。
- macOS/Windows 是否提供可用于第三方应用通知读取/交互的稳定公开机制。
- Peekaboo/第三方是否已有更可靠实现。

## 候选能力

在平台真实支持的前提下评估：

```js
Notifications.waitFor(options)
Notifications.list(options)
Notifications.dismiss(target)
Notifications.activate(target)
```

如果 OS 不允许稳定读取其他应用通知，则只实现明确可验证的子集，或将任务结论标记为 `BLOCKED_PLATFORM` / integration-only。

## 必须解决

- 隐私与敏感内容 redaction。
- 通知 identity、app identity、重复通知。
- notification center UI 与真实 notification model 的区别。
- timeout / stale notification。
- 交互动作的可验证 postcondition。

## 非目标

- 不使用 OCR 扫描屏幕冒充“通知 API”。
- 不依赖未声明的 private API 并标记 Stable。
- 不构建通知历史数据库。

## 测试

若平台支持，至少覆盖：自身测试通知、等待出现、读取最小 metadata、dismiss/activate、timeout、重复通知、权限/平台不支持。

## Done

- 明确回答“哪些平台、哪些通知能可靠操作”。
- 若能力不可稳定实现，保留现有 outbound `notify()`，并记录不实现 inbound interaction 的原因。
- 不产生虚假 Stable claim。
