# TASK-012 — Notification Interaction

Status: DONE
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

## Execution record — 2026-09-02

Decision: `EXTEND`

Base HEAD: `b94735a2af95461d4b3b81f2ffafbb2d6df13713`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- 保留现有 outbound `notify()`，没有创建第二套发送 API。新增 Experimental `Notifications`
  Runtime object：`list`、`waitFor`、`dismiss`、`getCapabilities`。
- macOS backend 使用公开 `UNUserNotificationCenter` delivered-notification model，并复用现有
  `OpenDesk.app` / `com.opendesk.cli` helper identity；只允许读取和移除 OpenDesk 自身通知。
- 默认仅返回 opaque identifier、app identity、delivery timestamp，标题和正文必须显式
  `includeContent: true`；重复内容仍由不同 identifier 区分。
- `waitFor` 是 execution-owned、timeout-bounded polling worker，callback 只在 Goja EventLoop owner
  上结算，并在 execution teardown 时取消和 join。
- `dismiss` 按 identifier 移除后重新查询，只有 readback 确认不存在才返回成功；stale target 返回
  `NOT_FOUND`。
- 不暴露 `activate`：Apple 公开 API 只能把用户实际 action 回调给所属应用，不能模拟用户激活通知。
  `Events` 也不虚报 `notification.changed`。
- Windows 的跨应用 User Notification Listener 需要 manifest capability、app/package identity 和
  用户授权；当前 OpenDesk host 未具备和验证该条件。Linux 也没有等价稳定统一 model，两者 fail
  closed 为 `NOT_SUPPORTED`。

Tests:

- 聚焦 Go tests：`go test ./automation -run 'Test(Notifications|NotificationOption|DarwinNativeNotification|DecodeMacOSNotification|DarwinAppHelperInteraction)' -count=1` 通过。
- helper deadline 回归：短 deadline 保留 `context.DeadlineExceeded`，JavaScript 结构化映射为
  `TIMEOUT`，不再误报 `BACKEND_FAILED`。
- 正式 JavaScript Runtime API unit gate：411/411 通过；Evidence 位于
  `.runtime/tests/runtime-api/20260901T221838Z-24898/`。
- 文档一行命令从仓库根目录原样通过：
  `./dist/opendesk -script examples/notifications.js -console-mode script`。
- `go test ./...`：本任务相关 `automation`、`pkg/execution`、`pkg/scheduler`、`cmd/opendesk` 等通过；
  全仓仍因既有 `pkg/visionrun` 的 4 个 fixture/runtime-input 缺失失败，与本任务无关。
- `git diff --check` 通过；`runtime-api.ai.json` 可由 `python3 -m json.tool` 解析。

Evidence:

- 当前源码配套产物由 `./scripts/build_macos_app.sh` 重新生成；host 为 macOS 12.7.6
  (`21H1320`), x86_64，bundle id `com.opendesk.cli`。
- 真实 JS smoke 创建两条相同标题/正文的 OpenDesk 通知，验证 2 个不同 identifier、精确
  wait/readback、默认 content redaction、逐条 dismiss、dismiss 后 model 中不存在，以及缺失 fixture
  返回 `TIMEOUT`。
- 脱敏结构化 Evidence：
  `.runtime/tests/platform-primitives/task-012-notification-interaction/evidence.json`；没有持久化 fixture
  标题/正文或其他通知内容。
- 本卡只证明 own-app delivered-notification model。没有把系统接受、Notification Center record 或
  共享显示条件下的结果表述为用户可见横幅证明；`userVisibleBannerVerified` 明确为 false。
- 平台依据：
  [Apple getDeliveredNotifications](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/getdeliverednotifications%28completionhandler%3A%29)、
  [Apple removeDeliveredNotifications](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/removedeliverednotifications%28withidentifiers%3A%29)、
  [Windows Notification Listener](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener)。

Remaining:

- 任意应用通知读取/交互不属于当前稳定 API；macOS 没有对应公开 UserNotifications 权限。
- Windows integration 需在具备正确 package/capability/consent 的目标 host 上作为独立任务验证。
- Notification Center AX UI automation 依赖 TASK-001 的可运行 Accessibility provider；即使未来实现，
  也必须标明 UI representation，不得伪装成系统 notification model。
