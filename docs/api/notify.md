---
title: notify() 系统通知
description: 通过操作系统通知中心发送 OpenDesk 系统通知。
order: 150
docType: reference
---

# notify()：系统通知

`notify()` 是 OpenDesk 的全局**操作系统通知** API。本页只定义 `notify()`；OpenDesk 自己绘制的瞬时反馈 `ui.toast()` 由 [Custom UI Reference](ui.md) 唯一负责，已投递通知的查询/等待/移除由 [Notifications API](notifications.md) 负责。

| 需求 | API | Canonical Reference |
| --- | --- | --- |
| 当前 execution 的几秒反馈、进度或失败提示 | `ui.toast()` | [ui.md](ui.md) |
| 提交到系统通知中心 | `notify()` | 本页 |
| 查询/等待/移除 OpenDesk 自身已投递系统通知 | `Notifications.*` | [notifications.md](notifications.md) |
| 需要用户明确确认或输入 | `Dialog.*` | [dialog.md](dialog.md) |

`ui.notify()` 只是 `ui.toast()` 的历史兼容别名；新代码和新文档统一使用 `ui.toast()`。本页不重复 Toast 参数、句柄、位置或进度契约。

## notify(messageOrOptions)

发送一条系统通知。它适合报告后台任务完成、需要稍后留意的状态；通知显示不是业务成功、状态持久化或执行证据的替代品。

**签名**

```ts
notify(message: string): void;
notify(options: OpenDeskNotifyOptions): void;
```

这是同步函数，不需要 `await`。成功时返回 `undefined`。

**字符串形式**

```js
notify('任务完成');
```

字符串会规范化为：

```js
{
  title: '任务完成',
  message: '',
  sound: true,
}
```

**对象形式**

```js
notify({
  title: 'OpenDesk',
  message: '自动化已经完成',
  sound: false,
});
```

| 字段 | 类型 | 缺省值 | 当前行为 |
| --- | --- | --- | --- |
| `title` | `string` | `OpenDesk Notification` | 通知标题；空字符串也使用缺省标题。 |
| `message` | `string` | `''` | 通知正文。 |
| `sound` | `boolean` | `false` | `true` 请求平台默认系统音效。 |
| `timeout` | `number` | 无 | 兼容旧脚本而接受；当前平台后端不支持由脚本控制展示时长，因此不产生行为。 |

**返回值与错误**

- 成功提交到平台通知后端：返回 `undefined`。
- `notify()`、`notify(null)`、数组以及其他非字符串/对象参数：同步抛出 `TypeError`。
- `title` / `message` 必须是字符串，`sound` 必须是布尔值，`timeout` 必须是有限数字。
- 标题和正文不能包含 NUL，且必须是有效 UTF-8。
- macOS App 身份/通知权限、D-Bus、Windows 通知后端或其他平台 backend 无法提交时：同步抛出 `Error`。
- 成功只表示宿主/系统通知后端接受了请求，不表示用户已经看到通知。

## 平台与权限边界

- **macOS**：使用 macOS 12 支持的原生 UserNotifications backend。`OpenDesk.app` 内的 Runtime 直接以 OpenDesk bundle 提交；plain CLI 和 Scheduler 通过同一构建产物旁的 `OpenDesk.app` 进入私有、仅通知 helper 模式，因此发送者仍是 OpenDesk，不使用 `osascript` / `com.apple.ScriptEditor2`，也不创建第二套 JavaScript executor。若 plain binary 旁缺少 `scripts/build_macos_app.sh` 生成的 `OpenDesk.app`，`notify()` 会明确抛错。backend 会等待授权结果并检查 alert 权限，再等待系统接受本次 request；拒绝、超时和提交错误都会返回给 JavaScript。`sound: true` 请求平台默认系统音效，但系统静音、Focus、共享显示和用户设置仍可抑制实际声音。
- **Linux**：依赖 `beeep` 的桌面通知后端（通常是 D-Bus，必要时使用可用的命令行后端）。源码运行会复用 `public/icons/opendesk-notification.png`；找不到图标不会阻止无自定义图标的通知提交。音效能力取决于桌面后端。
- **Windows**：依赖 `beeep` 的 Windows 系统通知后端。安装包应把通知图标放在可执行文件旁的 `resources/opendesk-notification.png`；源码运行回退到 `public/icons/opendesk-notification.png`。显示时长和声音仍由 Windows 通知设置与后端决定。

`notify()` 不需要 `page.ensurePermissions()` 的屏幕截图或辅助功能权限。但操作系统通知权限、应用通知开关、Focus/勿扰模式、屏幕共享/镜像静默策略、静音设置和桌面会话状态都可能使通知不显示或不发声。

首次由 `OpenDesk.app` 提交本地通知时，macOS 可能显示系统管理的授权提示，例如：

```text
“OpenDesk”通知
“通知”可能包括提醒、声音和图标标记。
```

这是 macOS 对通知能力的系统文案，不是脚本的 `title` 或 `message`。OpenDesk 不能通过 `notify()` 修改它，也不能绕过系统静默策略。

如果通知是工作流的一部分，应同时写入结构化日志、状态文件或其他可检查执行证据；如果需要确认用户确实看到了提示，应另做桌面截图或人工观察验证。

## 与 Notifications 的关系

`notify()` 只负责**发送**。需要观察、等待或移除 OpenDesk 自身已经投递到系统通知中心的通知时，使用 [Notifications API](notifications.md)：

```js
await Notifications.list();
const notification = await Notifications.waitFor({
  title: 'OpenDesk',
  timeout: 10000,
});
await Notifications.dismiss(notification.id);
```

`Notifications` 不是另一套发送 API，也不会把任意应用通知暴露为稳定模型。发送系统通知仍使用全局 `notify()`。

## 相关 API

- execution-owned transient feedback：[`ui.toast()`](ui.md#uitoastmessageoroptions)
- 已投递系统通知：[`Notifications.*`](notifications.md)
- 模态确认/输入：[`Dialog`](dialog.md)
