---
title: notify
description: OpenDesk JavaScript Runtime 的系统通知契约、平台边界与验证方式。
order: 5
---

# notify：系统通知

`notify()` 是 OpenDesk 提供的全局系统通知函数，适合报告脚本阶段完成、需要人工留意的提示。它是 **Secondary** 能力：通知显示不是业务成功、状态持久化或执行证据的替代品。

## notify：快速用法

```js
notify('任务完成');

notify({
  title: 'OpenDesk',
  message: '自动化已经完成',
  sound: false,
});
```

这是同步函数，不需要 `await`。成功时返回 `undefined`。

## notify：调用契约

### notify(message)：字符串形式

```js
notify(message: string): void;
```

字符串会转换为以下通知请求：

```js
{
  title: message,
  message: '',
  sound: true,
}
```

因此字符串形式会请求平台默认系统音效。

### notify(options)：对象形式

```js
notify(options: OpenDeskNotifyOptions): void;
```

字段如下：

| 字段 | 类型 | 缺省值 | 当前行为 |
| --- | --- | --- | --- |
| `title` | `string` | `OpenDesk Notification` | 通知标题；空字符串也使用缺省标题 |
| `message` | `string` | `''` | 通知正文 |
| `sound` | `boolean` | `false` | `true` 请求平台默认系统音效，`false` 使用静默通知路径 |
| `timeout` | `number` | 无 | 为兼容旧脚本而接受；当前平台后端不支持由脚本控制展示时长，因此不会产生行为 |

`notify()`、`notify(null)`、数组以及其他非字符串/对象参数会同步抛出
`TypeError`。对象字段也按上表严格校验：`title` / `message` 必须是字符串，`sound`
必须是布尔值，`timeout` 必须是有限数字。标题和正文不能包含 NUL，且必须是有效
UTF-8。通知后端无法提交时会抛出包含 `notification failed` 的 `Error`。

### notify：结果与错误

- 成功提交到平台通知后端：返回 `undefined`。
- 参数类型不正确：同步抛出 `TypeError`。
- macOS App 身份/通知权限、D-Bus、Windows toast 或其他平台通知后端不可用：同步抛出 `Error`。
- 返回成功只代表宿主已接受该请求，不代表用户已经看到通知。

## notify：平台与权限边界

- **macOS**：使用 macOS 12 支持的原生 UserNotifications backend。`OpenDesk.app` 内的 Runtime 直接以 OpenDesk bundle 提交；plain CLI 和 Scheduler 通过同一构建产物旁的 `OpenDesk.app` 进入私有、仅通知 helper 模式，因此发送者仍是 OpenDesk，不使用 `osascript` / `com.apple.ScriptEditor2`，也不创建第二套 JavaScript executor。若 plain binary 旁缺少 `scripts/build_macos_app.sh` 生成的 `OpenDesk.app`，`notify()` 会明确抛错。backend 会等待授权结果并检查 alert 权限，再等待系统接受本次 request；拒绝、超时和提交错误都会返回给 JavaScript。`sound: true` 会为 request 设置平台默认系统音效，但系统静音、Focus、共享显示和用户的声音设置仍可抑制实际声音。没有可由脚本指定的显示时长。
- **Linux**：依赖 `beeep` 的桌面通知后端（通常是 D-Bus，必要时使用可用的命令行后端）。从源码目录运行时会复用 `public/icons/opendesk-notification.png`；找不到图标不会阻止通知提交。音效能力取决于后端；不是所有桌面环境都支持一致的声音行为。
- **Windows**：依赖 `beeep` 的 Windows toast/系统后端。安装包应把通知图标放在可执行文件旁的 `resources/opendesk-notification.png`；源码运行会回退到 `public/icons/opendesk-notification.png`。找不到图标时仍提交无自定义图片的通知；显示时长和声音由 Windows 通知设置与后端决定。

通知不需要 `page.ensurePermissions()` 的屏幕截图或辅助功能权限。但操作系统的通知权限、应用通知开关、Focus/勿扰模式、屏幕共享/镜像的静默策略、静音设置以及桌面会话状态都可能使通知不显示或不发声。backend 的成功返回只证明宿主已把请求交给 OS；它不能作肉眼可见性证明，也不会绕过系统策略。

首次由 `OpenDesk.app` 提交本地通知时，macOS 可能先显示系统管理的授权提示，例如：

```text
“OpenDesk”通知
“通知”可能包括提醒、声音和图标标记。
```

这不是脚本传入的 `title` 或 `message`，而是 macOS 对通知能力的说明；其含义是该应用的通知可能包含提醒、声音和图标标记，文案由系统本地化控制。用户需要按系统提示允许通知，OpenDesk 不能通过 `notify()` 修改这段文字或绕过系统的静默策略。

如果通知是工作流的一部分，请同时写入结构化日志、状态文件或其他可检查的执行证据；如果需要确认用户确实看到了提示，应另行做桌面截图或人工观察验证。

## notify：实现来源

用户调用链是：

```text
notify() polyfill -> notify____Inject -> automation.Notify -> macOS UserNotifications via OpenDesk.app (or beeep on other platforms)
```

CLI、HTTP 执行以及其他复用 JavaScript Execution 的入口都经过同一 Runtime 初始化链。`notify____Inject` 是宿主内部 bridge，不是用户脚本的稳定接口。

需要观察、等待或移除 OpenDesk 自身已投递通知时，使用受限的 macOS Experimental
[Notifications API](notifications.md)。它不会读取任意应用通知，也不提供程序化 activate。
