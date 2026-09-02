---
title: Notifications API
description: 观察和移除 OpenDesk 自身已投递通知的 macOS Experimental API。
order: 44
---

# Notifications：自身通知交互

`Notifications` 是 `notify()` 的受限 inbound companion。它不创建第二套发送 API，也不把
Notification Center UI、OCR 结果或任意应用通知包装成稳定通知模型。

当前仅在 macOS 提供 **Experimental、own-app** 子集：

```js
Notifications.getCapabilities();
await Notifications.list();
await Notifications.waitFor({ title: "OpenDesk", timeout: 10000 });
await Notifications.dismiss(notification.id);
```

## 可复制示例

工作目录：仓库根目录。先用当前源码构建 macOS app/binary 配套产物：

```bash
./scripts/build_macos_app.sh
```

然后运行一条示例命令：

```bash
./dist/opendesk -script examples/notifications.js -console-mode script
```

示例先启动 bounded wait，再用现有 `notify()` 发送唯一标题，取得默认脱敏 metadata，并按 opaque
identifier 移除该条 OpenDesk 通知。提交成功、通知模型 readback 与用户看到横幅仍是不同证据。

## 能力发现

```js
const capabilities = Notifications.getCapabilities();
```

返回：

```json
{
  "schemaVersion": 1,
  "platform": "darwin",
  "backend": "macos-usernotifications",
  "scope": "own-app",
  "list": { "supported": true, "verified": false },
  "waitFor": { "supported": true, "verified": false },
  "dismiss": { "supported": true, "verified": false },
  "activate": { "supported": false, "verified": false },
  "events": { "supported": false, "verified": false }
}
```

`verified` 不会因为仓库保存过一次 smoke 就变成当前主机证明；真实运行仍要保存本次 Evidence。

## `list(options?)`

```ts
Notifications.list(options?: { includeContent?: boolean }): Promise<NotificationRecord[]>;
```

默认只返回：

```text
schemaVersion
id
appId
deliveredAt
contentRedacted: true
```

标题和正文可能包含敏感数据，因此只有显式传入 `{includeContent: true}` 才返回 `title` 和
`message`。结果只包含仍位于 Notification Center 的 OpenDesk 自身通知，按投递时间倒序排列。

## `waitFor(options?)`

```ts
Notifications.waitFor({
  id?: string,
  title?: string,
  message?: string,
  includeExisting?: boolean,
  includeContent?: boolean,
  timeout?: number,
  pollInterval?: number
}): Promise<NotificationRecord>;
```

- `id`、`title`、`message` 是精确匹配；可组合使用。
- 默认不匹配调用前已经存在的通知；`includeExisting: true` 才允许返回旧记录。
- `timeout` 默认 30000 ms，最大 600000 ms。
- `pollInterval` 默认 200 ms，范围 50–5000 ms。
- worker 属于当前 JavaScript execution；取消或 teardown 会拒绝 Promise 并完成清理。
- 多条相同标题/正文通知仍由系统生成的 opaque `id` 区分；最新投递优先。

## `dismiss(target)`

```ts
Notifications.dismiss(id: string): Promise<{id: string, dismissed: true}>;
Notifications.dismiss({id: string}): Promise<{id: string, dismissed: true}>;
```

只移除 OpenDesk 自身已投递通知，并在返回前 readback 确认该 identifier 已不存在。目标已经消失时
拒绝并给出 `NOT_FOUND`，不会把幂等 no-op 写成一次成功交互。

## 平台边界

### macOS

OpenDesk 使用 `UNUserNotificationCenter` 的 delivered-notification model。Apple 的公开 API 只允许应用
取得和移除“本应用”的通知；它不是任意应用通知监听器。plain CLI / Scheduler 与 `notify()` 一样通过
同一构建产物旁的 `OpenDesk.app` helper 使用 `com.opendesk.cli` identity。

公开 UserNotifications API没有“模拟用户点击任意通知”的方法：delegate 只能接收用户对本应用通知
执行的 action，因此本阶段不暴露 `Notifications.activate()`。

### Windows

Windows 的 `UserNotificationListener` 可在声明 User Notification capability、具备合适 app/package
identity 且用户授权后读取其他应用通知。当前 OpenDesk plain CLI/安装包没有声明并验证这套宿主条件，
因此 Windows backend 明确返回 `NOT_SUPPORTED`；不把空数组冒充成功。

### Linux

桌面环境没有一个与上述 identity、history、dismiss readback 等语义一致的稳定统一后端。现有
`notify()` 仍可经 beeep 发送，`Notifications` interaction 返回 `NOT_SUPPORTED`。

## 与 Events 和 Accessibility 的关系

- `Events` 当前不声明 `notification.changed`，`waitFor` 使用独立且有超时的 own-app polling。
- Notification Center UI 的 AX tree 是 UI 表示，不是系统通知模型；本 API 不抓取该 UI。
- 任意应用通知的 AX 自动化应等 Accessibility integration 有可运行 backend 后再单独评估，且不能
  伪装成 UserNotifications model 成功。

## 错误码

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | 选项、timeout、poll interval 或 target 不合法。 |
| `NOT_SUPPORTED` | 平台/backend 或所请求能力不可用。 |
| `NOT_FOUND` | dismiss 目标已不存在。 |
| `TIMEOUT` | wait 或 backend deadline 到期。 |
| `CANCELED` | execution teardown 或上层 context 取消。 |
| `BACKEND_FAILED` | app helper、UserNotifications 查询或 readback 失败。 |

## 相关 API

- 发送通知：[notify](notify.md)
- 外部桌面状态事件：[Events](events.md)
- Runtime lifecycle：[Runtime](runtime.md)

## 平台依据

- Apple `getDeliveredNotifications` 明确只返回本应用仍在 Notification Center 的通知：
  <https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/getdeliverednotifications(completionhandler:)>
- Apple `removeDeliveredNotifications` 只移除本应用 notification identifiers：
  <https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/removedeliverednotifications(withidentifiers:)>
- Windows Notification Listener 的 capability、用户授权与跨应用范围：
  <https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/notification-listener>
